use crate::{
    personnel::{self, Personnel},
    settings, REPORTS_DIRECTORY_NAME,
};
use chrono::{Local, NaiveDate};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{Read, Write},
    path::Path,
    sync::OnceLock,
};
use zip::{
    read::ZipArchive,
    write::{SimpleFileOptions, ZipWriter},
    CompressionMethod,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateReportRequest {
    pub template_path: String,
    pub personnel_ids: Vec<i64>,
    pub report_date: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub variables: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedReport {
    pub docx_path: String,
    pub folder_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Registry {
    person_fields: Vec<Field>,
    signer_roles: Vec<Role>,
    signer_fields: Vec<Field>,
    document_fields: Vec<Field>,
    modifiers: Vec<Modifier>,
}
#[derive(Deserialize)]
struct Field {
    id: String,
    #[serde(rename = "sourceKey")]
    source_key: Option<String>,
    kind: String,
    cases: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Role {
    id: String,
    settings_key: String,
}
#[derive(Deserialize)]
struct Modifier {
    id: String,
    group: String,
}
fn registry() -> &'static Registry {
    static VALUE: OnceLock<Registry> = OnceLock::new();
    VALUE.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../src/shared/template-language/registry.v2.json"
        ))
        .expect("valid v2 registry")
    })
}

#[derive(Clone)]
struct Value {
    text: String,
    kind: String,
    gender: Option<String>,
}
impl Value {
    fn new(text: String, kind: &str, gender: Option<&str>) -> Self {
        Self {
            text,
            kind: kind.into(),
            gender: gender.filter(|v| !v.is_empty()).map(str::to_string),
        }
    }
}

pub fn inspect(template_path: &str) -> TemplateValidationResult {
    let mut errors = Vec::new();
    let variables = match read_variables(Path::new(template_path)) {
        Ok(v) => v,
        Err(e) => {
            errors.push(e);
            Vec::new()
        }
    };
    for token in &variables {
        errors.extend(validate_token(token));
    }
    TemplateValidationResult {
        is_valid: errors.is_empty(),
        errors,
        variables,
    }
}
pub fn validate(
    connection: &Connection,
    template_path: &str,
    ids: &[i64],
    date: Option<&str>,
) -> TemplateValidationResult {
    let mut result = inspect(template_path);
    if ids.is_empty() {
        result
            .errors
            .push("Оберіть щонайменше одного військовослужбовця.".into())
    }
    for token in &result.variables {
        if let Some(n) = person_number(token) {
            if n > ids.len() {
                result.errors.push(format!("Змінна «{{{{{token}}}}}» посилається на військовослужбовця №{n}, але вибрано лише {}.",ids.len()))
            }
        }
    }
    if let Some(v) = date.filter(|v| !v.is_empty()) {
        if NaiveDate::parse_from_str(v, "%Y-%m-%d").is_err() {
            result
                .errors
                .push("Дата рапорту має формат РРРР-ММ-ДД.".into())
        }
    }
    let all = personnel::list(connection).unwrap_or_default();
    if ids.iter().any(|id| !all.iter().any(|p| p.id == *id)) {
        result
            .errors
            .push("Один або кілька обраних військовослужбовців більше не існують.".into())
    }
    result.is_valid = result.errors.is_empty();
    result
}
pub fn generate(
    connection: &Connection,
    root: &Path,
    request: GenerateReportRequest,
) -> Result<GeneratedReport, String> {
    let check = validate(
        connection,
        &request.template_path,
        &request.personnel_ids,
        request.report_date.as_deref(),
    );
    if !check.is_valid {
        return Err(check.errors.join(" "));
    }
    let people = selected_personnel(connection, &request.personnel_ids)?;
    let mut values = values_for(
        &people,
        &settings::load(root)?,
        request.report_date.as_deref(),
    )?;
    add_custom_values(connection, &people, &mut values)?;
    let now = Local::now();
    let dir = root
        .join(REPORTS_DIRECTORY_NAME)
        .join(now.format("%d.%m.%Y").to_string());
    fs::create_dir_all(&dir).map_err(|_| "Не вдалося створити папку для рапортів.".to_string())?;
    let stem = Path::new(&request.template_path)
        .file_stem()
        .and_then(|v| v.to_str())
        .unwrap_or("Рапорт");
    let surnames = people
        .iter()
        .map(|p| p.surname.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let base = safe_name(&format!("{stem} {surnames} {}", now.format("%d.%m.%Y")));
    let mut name = format!("{base}.docx");
    if dir.join(&name).exists() {
        name = format!("{base} ({}).docx", now.format("%H-%M-%S"))
    }
    let final_path = dir.join(name);
    let temp = final_path.with_extension("tmp");
    let result = write_docx(Path::new(&request.template_path), &temp, &values);
    if let Err(e) = result {
        let _ = fs::remove_file(&temp);
        return Err(e);
    }
    fs::rename(&temp, &final_path)
        .map_err(|_| "Не вдалося завершити створення рапорту.".to_string())?;
    Ok(GeneratedReport {
        docx_path: final_path.to_string_lossy().into(),
        folder_path: dir.to_string_lossy().into(),
    })
}

fn validate_token(token: &str) -> Vec<String> {
    let canonical = normalize_token(token);
    let parts = canonical.split(':').collect::<Vec<_>>();
    let base = parts[0].trim();
    let field = field_for(base);
    let is_custom = field.is_none() && custom_field_token(base);
    if field.is_none() && !is_custom {
        return vec![format!(
            "Невідома змінна «{{{{{token}}}}}». У v2 старі назви не підтримуються."
        )];
    }
    let mut errors = Vec::new();
    let mut seen = HashSet::new();
    let mut groups = HashSet::new();
    for raw in parts.iter().skip(1) {
        let id = raw.trim();
        let Some(m) = registry().modifiers.iter().find(|m| m.id == id) else {
            let hint = nearest_modifier(id);
            errors.push(match hint{Some(v)=>format!("Невідомий модифікатор «{id}» у «{{{{{token}}}}}». Можливо, ви мали на увазі «{v}»."),None=>format!("Невідомий модифікатор «{id}» у «{{{{{token}}}}}».")});
            continue;
        };
        if !seen.insert(id) {
            errors.push(format!(
                "Модифікатор «{id}» вказано двічі у «{{{{{token}}}}}»."
            ))
        }
        if m.group != "style" && !groups.insert(&m.group) {
            errors.push(format!(
                "Конфлікт модифікаторів групи «{}» у «{{{{{token}}}}}».",
                if m.group == "case" { "відмінок" } else { "регістр" }
            ))
        }
        if m.group == "case" && !field.map(|value| value.cases).unwrap_or(false) {
            errors.push(format!("Змінну «{base}» не можна відмінювати."))
        }
        if m.group == "text" && field.is_some_and(|value| value.kind == "number") {
            errors.push(format!(
                "Для числової змінної «{base}» зміна регістру недоступна."
            ))
        }
    }
    errors
}
fn custom_field_token(base: &str) -> bool {
    let Some(rest) = base.strip_prefix("військовий_") else {
        return false;
    };
    let Some((number, key)) = rest.split_once('_') else {
        return false;
    };
    number.parse::<usize>().is_ok()
        && number != "0"
        && !key.is_empty()
        && key.chars().next().is_some_and(char::is_alphabetic)
        && key.chars().all(|value| value == '_' || value.is_alphanumeric())
}
fn field_for(base: &str) -> Option<&'static Field> {
    if let Some(c) = base.strip_prefix("військовий_") {
        let (_, id) = c.split_once('_')?;
        if c.split_once('_')?.0.parse::<usize>().ok()? == 0 {
            return None;
        }
        return registry().person_fields.iter().find(|f| f.id == id);
    }
    if let Some(f) = registry().document_fields.iter().find(|f| f.id == base) {
        return Some(f);
    }
    for role in &registry().signer_roles {
        if let Some(id) = base.strip_prefix(&(role.id.clone() + "_")) {
            if let Some(f) = registry().signer_fields.iter().find(|f| f.id == id) {
                return Some(f);
            }
        }
    }
    None
}
fn person_number(token: &str) -> Option<usize> {
    token
        .split(':')
        .next()?
        .strip_prefix("військовий_")?
        .split('_')
        .next()?
        .parse()
        .ok()
}
fn nearest_modifier(value: &str) -> Option<&'static str> {
    registry()
        .modifiers
        .iter()
        .map(|m| m.id.as_str())
        .min_by_key(|candidate| edit_distance(value, candidate))
        .filter(|candidate| edit_distance(value, candidate) <= 2)
}
fn edit_distance(a: &str, b: &str) -> usize {
    let mut row = (0..=b.chars().count()).collect::<Vec<_>>();
    for (ca_i, ca) in a.chars().enumerate() {
        let mut prev = row[0];
        row[0] = ca_i + 1;
        for (cb_i, cb) in b.chars().enumerate() {
            let old = row[cb_i + 1];
            row[cb_i + 1] = (prev + usize::from(ca != cb))
                .min(row[cb_i + 1] + 1)
                .min(row[cb_i] + 1);
            prev = old
        }
    }
    *row.last().unwrap()
}

fn selected_personnel(c: &Connection, ids: &[i64]) -> Result<Vec<Personnel>, String> {
    let all = personnel::list(c)?;
    ids.iter()
        .map(|id| {
            all.iter()
                .find(|p| p.id == *id)
                .cloned()
                .ok_or_else(|| "Не знайдено обраного військовослужбовця.".into())
        })
        .collect()
}
fn values_for(
    people: &[Personnel],
    s: &settings::AppSettings,
    date: Option<&str>,
) -> Result<HashMap<String, Value>, String> {
    let mut map = HashMap::new();
    for (i, p) in people.iter().enumerate() {
        let prefix = format!("військовий_{}", i + 1);
        let gender = detect_gender(&p.gender, &p.patronymic);
        for field in &registry().person_fields {
            let text = person_value(p, field.source_key.as_deref().unwrap_or_default());
            map.insert(format!("{prefix}_{}", field.id), Value::new(text, &field.kind, gender));
        }
    }
    for role in &registry().signer_roles {
        let signer = match role.settings_key.as_str() {
            "mainSigner" => &s.main_signer,
            "commander" => &s.commander,
            "chief" => &s.chief,
            "deputyPpp" => &s.deputy_ppp,
            "deputyArmament" => &s.deputy_armament,
            "deputyRear" => &s.deputy_rear,
            _ => &s.fuel_chief,
        };
        add_signer(&mut map, &role.id, signer)
    }
    let date = match date.filter(|v| !v.is_empty()) {
        Some(v) => NaiveDate::parse_from_str(v, "%Y-%m-%d")
            .map_err(|_| "Не вдалося прочитати дату рапорту.".to_string())?,
        None => Local::now().date_naive(),
    };
    map.insert(
        "дата_рапорту".into(),
        Value::new(date.format("%d.%m.%Y року").to_string(), "date", None),
    );
    Ok(map)
}

fn person_value(person: &Personnel, source_key: &str) -> String {
    match source_key {
        "surname" => person.surname.to_uppercase(),
        "given_name" => name_case(&person.given_name),
        "patronymic" => name_case(&person.patronymic),
        "full_name" => format!("{} {} {}", person.surname.to_uppercase(), name_case(&person.given_name), name_case(&person.patronymic)).trim().to_string(),
        "rank" => sentence_case(&person.rank),
        "position" => sentence_case(&person.position),
        "tax_id" => person.tax_id.clone(),
        "birth_date" => person.birth_date.clone(),
        "education_level" => person.education_level.clone(),
        "education_details" => person.education_details.clone(),
        "armed_forces_service_start_date" => person.armed_forces_service_start_date.clone(),
        "position_assigned_date" => person.position_assigned_date.clone(),
        "position_assignment_order" => person.position_assignment_order.clone(),
        "military_id" => person.military_id.clone(),
        "assigned_vehicle_name" => person.assigned_vehicle_name.clone(),
        "assigned_vehicle_registration" => person.assigned_vehicle_registration.clone(),
        key => person.core_fields.get(key).cloned().unwrap_or_default(),
    }
}

fn add_custom_values(
    connection: &Connection,
    people: &[Personnel],
    values: &mut HashMap<String, Value>,
) -> Result<(), String> {
    for (index, person) in people.iter().enumerate() {
        let mut statement = connection.prepare("SELECT definition.field_key, definition.display_name, value.field_value FROM personnel_custom_fields value JOIN custom_field_definitions definition ON definition.field_key = value.field_key WHERE value.personnel_id = ?1").map_err(|_| "Не вдалося прочитати додаткові поля.".to_string())?;
        let fields = statement
            .query_map([person.id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
            })
            .map_err(|_| "Не вдалося прочитати додаткові поля.".to_string())?;
        for field in fields {
            let (_key, display_name, value) =
                field.map_err(|_| "Не вдалося прочитати додаткове поле.".to_string())?;
            values.insert(
                format!("військовий_{}_{}", index + 1, custom_template_id(&display_name)),
                Value::new(value, "text", None),
            );
        }
    }
    Ok(())
}
fn custom_template_id(name: &str) -> String {
    let normalized = name.to_lowercase().chars().map(|character| {
        if character.is_alphanumeric() { character } else { '_' }
    }).collect::<String>();
    normalized.trim_matches('_').split('_').filter(|part| !part.is_empty()).collect::<Vec<_>>().join("_")
}
fn add_signer(map: &mut HashMap<String, Value>, prefix: &str, s: &settings::SignerSettings) {
    let parts = s.full_name.split_whitespace().collect::<Vec<_>>();
    let surname = parts.first().copied().unwrap_or("");
    let given = parts.get(1).copied().unwrap_or("");
    let patronymic = parts.get(2..).unwrap_or_default().join(" ");
    let gender = detect_gender("", &patronymic);
    for (id, text, kind) in [
        ("прізвище", surname.to_uppercase(), "person-name"),
        ("імя", name_case(given), "person-name"),
        ("по_батькові", name_case(&patronymic), "person-name"),
        (
            "піб",
            format!(
                "{} {} {}",
                surname.to_uppercase(),
                name_case(given),
                name_case(&patronymic)
            )
            .trim()
            .into(),
            "person-name",
        ),
        ("звання", sentence_case(&s.rank), "rank"),
        ("посада", sentence_case(&s.position), "position"),
    ] {
        map.insert(format!("{prefix}_{id}"), Value::new(text, kind, gender));
    }
}
fn detect_gender<'a>(stored: &'a str, patronymic: &str) -> Option<&'a str> {
    if !stored.is_empty() {
        Some(stored)
    } else if patronymic.to_lowercase().ends_with("ич") {
        Some("чоловіча")
    } else if patronymic.to_lowercase().ends_with("на") {
        Some("жіноча")
    } else {
        None
    }
}

fn apply_modifiers(value: &Value, mods: &[&str]) -> Result<String, String> {
    let mut text = value.text.clone();
    for m in mods {
        if registry()
            .modifiers
            .iter()
            .find(|x| x.id == *m)
            .is_some_and(|x| x.group == "case")
        {
            text = decline(&text, &value.kind, m, value.gender.as_deref())?
        } else {
            text = match *m {
                "великими" => text.to_uppercase(),
                "маленькими" => text.to_lowercase(),
                "з_великої" => capitalize_first(&text),
                _ => text,
            }
        }
    }
    Ok(text)
}
fn decline(value: &str, kind: &str, case: &str, gender: Option<&str>) -> Result<String, String> {
    if case == "називний" {
        return Ok(value.into());
    }
    let gender=gender.ok_or_else(||format!("Не вдалося визначити стать для відмінювання «{value}». Вкажіть стать у картці військовослужбовця."))?;
    if kind == "rank" {
        return Ok(decline_rank(value, case, gender));
    }
    if kind == "position" {
        return Ok(value
            .split_once(',')
            .map(|(head, tail)| format!("{},{}", decline_position_head(head, case), tail))
            .unwrap_or_else(|| decline_position_head(value, case)));
    }
    Ok(value
        .split_whitespace()
        .map(|w| decline_word(w, case, gender))
        .collect::<Vec<_>>()
        .join(" "))
}
fn decline_rank(value: &str, case: &str, gender: &str) -> String {
    let key = value.to_lowercase();
    let fixed: HashMap<&str, [&str; 7]> = [
        (
            "солдат",
            [
                "солдат",
                "солдата",
                "солдату",
                "солдата",
                "солдатом",
                "солдаті",
                "солдате",
            ],
        ),
        (
            "майор",
            [
                "майор",
                "майора",
                "майору",
                "майора",
                "майором",
                "майорі",
                "майоре",
            ],
        ),
        (
            "капітан",
            [
                "капітан",
                "капітана",
                "капітану",
                "капітана",
                "капітаном",
                "капітані",
                "капітане",
            ],
        ),
        (
            "сержант",
            [
                "сержант",
                "сержанта",
                "сержанту",
                "сержанта",
                "сержантом",
                "сержанті",
                "серджанте",
            ],
        ),
        ("лейтенант", ["лейтенант", "лейтенанта", "лейтенанту", "лейтенанта", "лейтенантом", "лейтенанті", "лейтенанте"]),
        ("старший лейтенант", ["старший лейтенант", "старшого лейтенанта", "старшому лейтенанту", "старшого лейтенанта", "старшим лейтенантом", "старшому лейтенанті", "старший лейтенанте"]),
        ("молодший сержант", ["молодший сержант", "молодшого сержанта", "молодшому сержанту", "молодшого сержанта", "молодшим сержантом", "молодшому сержанті", "молодший сержанте"]),
        ("старший сержант", ["старший сержант", "старшого сержанта", "старшому сержанту", "старшого сержанта", "старшим сержантом", "старшому сержанті", "старший сержанте"]),
        ("підполковник", ["підполковник", "підполковника", "підполковнику", "підполковника", "підполковником", "підполковнику", "підполковнику"]),
        ("полковник", ["полковник", "полковника", "полковнику", "полковника", "полковником", "полковнику", "полковнику"]),
    ]
    .into_iter()
    .collect();
    let cases = [
        "називний",
        "родовий",
        "давальний",
        "знахідний",
        "орудний",
        "місцевий",
        "кличний",
    ];
    if let (Some(forms), Some(i)) = (
        fixed.get(key.as_str()),
        cases.iter().position(|x| *x == case),
    ) {
        forms[i].into()
    } else {
        decline_phrase(value, case, gender)
    }
}
fn decline_phrase(value: &str, case: &str, gender: &str) -> String {
    value
        .split_whitespace()
        .map(|w| decline_word(w, case, gender))
        .collect::<Vec<_>>()
        .join(" ")
}
fn decline_position_head(value: &str, case: &str) -> String {
    let mut parts = value.splitn(2, char::is_whitespace);
    let head = parts.next().unwrap_or_default();
    let rest = parts.next().unwrap_or_default();
    let punctuation: String = head.chars().rev().take_while(|c| !c.is_alphanumeric()).collect::<String>().chars().rev().collect();
    let lexical_head = head.strip_suffix(&punctuation).unwrap_or(head);
    let lower = lexical_head.to_lowercase();
    let changed = if let Some(forms) = position_forms(&lower) {
        let cases = ["називний", "родовий", "давальний", "знахідний", "орудний", "місцевий", "кличний"];
        forms[cases.iter().position(|item| *item == case).unwrap_or(0)].to_string()
    } else if lower.ends_with("ець") {
        format!(
            "{}{}",
            &lower[..lower.len() - 6],
            if case == "орудний" {
                "цем"
            } else {
                "ця"
            }
        )
    } else if lower.ends_with("ий") && matches!(case, "родовий" | "знахідний") {
        format!("{}ого", &lower[..lower.len() - 4])
    } else {
        let suffix = match case {
            "родовий" | "знахідний" => "а",
            "давальний" => "у",
            "орудний" => "ом",
            "місцевий" => "і",
            "кличний" => "е",
            _ => "",
        };
        format!("{lower}{suffix}")
    };
    if rest.is_empty() {
        format!("{changed}{punctuation}")
    } else {
        format!("{changed}{punctuation} {rest}")
    }
}

fn position_forms(value: &str) -> Option<[&'static str; 7]> {
    match value {
        "оператор" => Some(["оператор", "оператора", "оператору", "оператора", "оператором", "операторі", "операторе"]),
        "командир" => Some(["командир", "командира", "командиру", "командира", "командиром", "командирі", "командире"]),
        "начальник" => Some(["начальник", "начальника", "начальнику", "начальника", "начальником", "начальнику", "начальнику"]),
        "заступник" => Some(["заступник", "заступника", "заступнику", "заступника", "заступником", "заступнику", "заступнику"]),
        "стрілець" => Some(["стрілець", "стрільця", "стрільцю", "стрільця", "стрільцем", "стрільці", "стрільцю"]),
        "помічник" => Some(["помічник", "помічника", "помічнику", "помічника", "помічником", "помічнику", "помічнику"]),
        "водій" => Some(["водій", "водія", "водієві", "водія", "водієм", "водієві", "водію"]),
        "механік" => Some(["механік", "механіка", "механіку", "механіка", "механіком", "механіку", "механіку"]),
        _ => None,
    }
}
fn decline_word(word: &str, case: &str, gender: &str) -> String {
    let upper = word == word.to_uppercase();
    let lower = word.to_lowercase();
    let stem = |n: usize| {
        lower
            .chars()
            .take(lower.chars().count().saturating_sub(n))
            .collect::<String>()
    };
    let result = if gender == "жіноча" && lower.ends_with('а') {
        let s = stem(1);
        match case {
            "родовий" => s + "и",
            "давальний" | "місцевий" => s + "і",
            "знахідний" => s + "у",
            "орудний" => s + "ою",
            "кличний" => s + "о",
            _ => lower,
        }
    } else if lower.ends_with("ий") {
        let s = stem(2);
        match case {
            "родовий" => s + "ого",
            "давальний" => s + "ому",
            "знахідний" => s + "ого",
            "орудний" => s + "им",
            "місцевий" => s + "ому",
            "кличний" => s + "ий",
            _ => lower,
        }
    } else {
        match case {
            "родовий" => lower + "а",
            "давальний" => lower + "у",
            "знахідний" => lower + "а",
            "орудний" => lower + "ом",
            "місцевий" => lower + "і",
            "кличний" => lower + "е",
            _ => lower,
        }
    };
    if upper {
        result.to_uppercase()
    } else {
        name_case(&result)
    }
}

fn capitalize_first(value: &str) -> String {
    let lowered = value.to_lowercase();
    let mut chars = lowered.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
        .unwrap_or_default()
}

fn read_variables(path: &Path) -> Result<Vec<String>, String> {
    let file = File::open(path)
        .map_err(|_| "Не вдалося відкрити шаблон. Перевірте шлях і доступ.".to_string())?;
    let mut zip =
        ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?;
    let mut out = Vec::new();
    for i in 0..zip.len() {
        let mut e = zip
            .by_index(i)
            .map_err(|_| "Не вдалося прочитати DOCX.".to_string())?;
        if !e.name().ends_with(".xml") {
            continue;
        }
        let mut s = String::new();
        let _ = e.read_to_string(&mut s);
        out.extend(extract_variables(&s))
    }
    out.sort();
    out.dedup();
    Ok(out)
}
fn extract_variables(xml: &str) -> Vec<String> {
    let text = xml_visible_text(xml);
    let mut out = Vec::new();
    let mut rest = text.as_str();
    while let Some(start) = rest.find("{{") {
        let after = &rest[start + 2..];
        if let Some(end) = after.find("}}") {
            out.push(after[..end].into());
            rest = &after[end + 2..]
        } else {
            break;
        }
    }
    out
}
fn normalize_token(token: &str) -> String {
    token
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect()
}
fn xml_visible_text(xml: &str) -> String {
    let mut out = String::new();
    let mut tag = false;
    for c in xml.chars() {
        match c {
            '<' => tag = true,
            '>' => tag = false,
            _ if !tag => out.push(c),
            _ => {}
        }
    }
    out
}
fn write_docx(input: &Path, output: &Path, values: &HashMap<String, Value>) -> Result<(), String> {
    let mut zip = ZipArchive::new(
        File::open(input).map_err(|_| "Не вдалося відкрити DOCX-шаблон.".to_string())?,
    )
    .map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?;
    let mut writer = ZipWriter::new(
        File::create(output).map_err(|_| "Не вдалося створити DOCX-файл.".to_string())?,
    );
    for i in 0..zip.len() {
        let mut e = zip
            .by_index(i)
            .map_err(|_| "Не вдалося прочитати DOCX.".to_string())?;
        let name = e.name().to_owned();
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        if e.is_dir() {
            writer
                .add_directory(name, options)
                .map_err(|_| "Не вдалося сформувати DOCX.".to_string())?;
            continue;
        }
        let mut bytes = Vec::new();
        e.read_to_end(&mut bytes)
            .map_err(|_| "Не вдалося прочитати DOCX.".to_string())?;
        writer
            .start_file(&name, options)
            .map_err(|_| "Не вдалося сформувати DOCX.".to_string())?;
        if name.ends_with(".xml") {
            let content = String::from_utf8_lossy(&bytes);
            writer
                .write_all(replace_variables(&content, values)?.as_bytes())
                .map_err(|_| "Не вдалося записати DOCX.".to_string())?
        } else {
            writer
                .write_all(&bytes)
                .map_err(|_| "Не вдалося записати DOCX.".to_string())?
        }
    }
    writer
        .finish()
        .map_err(|_| "Не вдалося завершити DOCX.".to_string())?;
    Ok(())
}
fn replace_variables(xml: &str, values: &HashMap<String, Value>) -> Result<String, String> {
    let tokens = extract_variables(xml);
    let mut result = xml.to_string();
    for token in tokens {
        let canonical = normalize_token(&token);
        let parts = canonical.split(':').collect::<Vec<_>>();
        let value = values
            .get(parts[0])
            .ok_or_else(|| format!("Немає значення для «{{{{{token}}}}}»."))?;
        let replacement = escape_xml(&apply_modifiers(value, &parts[1..])?);
        result = replace_word_token(&result, &format!("{{{{{token}}}}}"), &replacement);
        result = style_replacement(&result, &replacement, &parts[1..]);
    }
    Ok(result)
}

fn style_replacement(xml: &str, replacement: &str, modifiers: &[&str]) -> String {
    let mut properties = String::new();
    if modifiers.iter().any(|item| *item == "жирним") { properties.push_str("<w:b/>"); }
    if modifiers.iter().any(|item| *item == "підкреслити") { properties.push_str("<w:u w:val=\"single\"/>"); }
    if properties.is_empty() { return xml.to_string(); }
    let Some(text_start) = xml.find(replacement) else { return xml.to_string(); };
    let run_start = xml[..text_start].rfind("<w:r>").or_else(|| xml[..text_start].rfind("<w:r "));
    let Some(run_start) = run_start else { return xml.to_string(); };
    let Some(tag_end_rel) = xml[run_start..].find('>') else { return xml.to_string(); };
    let tag_end = run_start + tag_end_rel + 1;
    if xml[run_start..tag_end].contains("<w:rPr") { return xml.to_string(); }
    format!("{}<w:rPr>{}</w:rPr>{}", &xml[..tag_end], properties, &xml[tag_end..])
}
fn replace_word_token(xml: &str, token: &str, replacement: &str) -> String {
    let mut result = xml.to_string();
    while let Some((nodes, sn, so, en, eo)) = token_location(&result, token) {
        let mut vals = nodes
            .iter()
            .map(|(s, e)| result[*s..*e].to_string())
            .collect::<Vec<_>>();
        if sn == en {
            vals[sn].replace_range(so..eo, replacement)
        } else {
            vals[sn].replace_range(so.., replacement);
            for v in &mut vals[sn + 1..en] {
                v.clear()
            }
            vals[en].replace_range(..eo, "")
        }
        let mut rebuilt = String::new();
        let mut cursor = 0;
        for ((s, e), v) in nodes.iter().zip(vals) {
            rebuilt.push_str(&result[cursor..*s]);
            rebuilt.push_str(&v);
            cursor = *e
        }
        rebuilt.push_str(&result[cursor..]);
        result = rebuilt
    }
    result
}
fn token_location(
    xml: &str,
    token: &str,
) -> Option<(Vec<(usize, usize)>, usize, usize, usize, usize)> {
    let nodes = word_text_nodes(xml);
    let text = nodes.iter().map(|(s, e)| &xml[*s..*e]).collect::<String>();
    let start = text.find(token)?;
    let end = start + token.len();
    let (mut cursor, mut sl, mut el) = (0, None, None);
    for (i, (s, e)) in nodes.iter().enumerate() {
        let len = e - s;
        if sl.is_none() && start < cursor + len {
            sl = Some((i, start - cursor))
        }
        if end > cursor && end <= cursor + len {
            el = Some((i, end - cursor));
            break;
        }
        cursor += len
    }
    let (sn, so) = sl?;
    let (en, eo) = el?;
    Some((nodes, sn, so, en, eo))
}
fn word_text_nodes(xml: &str) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(rel) = xml[from..].find("<w:t") {
        let tag = from + rel;
        let Some(gt) = xml[tag..].find('>') else {
            break;
        };
        let start = tag + gt + 1;
        let Some(rel_end) = xml[start..].find("</w:t>") else {
            break;
        };
        let end = start + rel_end;
        out.push((start, end));
        from = end + 6
    }
    out
}
fn sentence_case(v: &str) -> String {
    let mut c = v.trim().chars();
    c.next()
        .map(|f| f.to_lowercase().collect::<String>() + c.as_str())
        .unwrap_or_default()
}
fn name_case(v: &str) -> String {
    v.split_whitespace()
        .map(|w| {
            w.split('-')
                .map(|p| {
                    let mut c = p.chars();
                    c.next()
                        .map(|f| {
                            f.to_uppercase().collect::<String>()
                                + &c.flat_map(char::to_lowercase).collect::<String>()
                        })
                        .unwrap_or_default()
                })
                .collect::<Vec<_>>()
                .join("-")
        })
        .collect::<Vec<_>>()
        .join(" ")
}
fn escape_xml(v: &str) -> String {
    v.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
fn safe_name(v: &str) -> String {
    v.chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect::<String>()
        .trim()
        .into()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registry_accepts_every_v2_variable() {
        for f in &registry().person_fields {
            assert!(validate_token(&format!("військовий_12_{}", f.id)).is_empty())
        }
        for r in &registry().signer_roles {
            for f in &registry().signer_fields {
                assert!(validate_token(&format!("{}_{}", r.id, f.id)).is_empty())
            }
        }
    }
    #[test]
    fn rejects_v1_and_explains_typo() {
        assert!(!validate_token("невідома.змінна").is_empty());
        assert!(validate_token("військовий_1_піб:родовийй")[0].contains("родовий"))
    }
    #[test]
    fn validates_duplicates_conflicts_and_types() {
        assert_eq!(validate_token("військовий_1_піб:родовий:родовий").len(), 2);
        assert!(!validate_token("військовий_1_піб:великими:маленькими").is_empty());
        assert!(!validate_token("військовий_1_іпн:родовий").is_empty());
        assert!(!validate_token("військовий_1_код_нагороди:родовий").is_empty())
    }
    #[test]
    fn applies_unlimited_pipeline() {
        let v = Value::new("Іван".into(), "person-name", Some("чоловіча"));
        assert_eq!(
            apply_modifiers(&v, &["родовий", "великими"]).unwrap(),
            "ІВАНА"
        )
    }

    #[test]
    fn applies_docx_style_modifiers_without_conflict() {
        let xml = "<w:r><w:t>{{військовий_1_піб:жирним:підкреслити}}</w:t></w:r>";
        let mut m = HashMap::new();
        m.insert("військовий_1_піб".into(), Value::new("Іван".into(), "person-name", Some("чоловіча")));
        let replaced = replace_variables(xml, &m).unwrap();
        assert!(replaced.contains("<w:b/>") && replaced.contains("<w:u w:val=\"single\"/>"));
    }
    #[test]
    fn replaces_split_token() {
        let xml = "<w:t>{{військовий_</w:t><w:t>1_піб:великими}}</w:t>";
        let mut m = HashMap::new();
        m.insert(
            "військовий_1_піб".into(),
            Value::new("Іван".into(), "person-name", Some("чоловіча")),
        );
        assert_eq!(
            replace_variables(xml, &m).unwrap(),
            "<w:t>ІВАН</w:t><w:t></w:t>"
        )
    }
    #[test]
    fn resolves_signer_token_split_by_word_spacing() {
        let mut settings = settings::defaults();
        settings.main_signer = settings::SignerSettings {
            full_name: "ІВАНЕНКО Іван Іванович".into(),
            rank: "майор".into(),
            position: "командир роти".into(),
        };
        let values = values_for(&[], &settings, Some("2026-08-11")).unwrap();
        let xml = "<w:t>{{ о с н о в н и й _ п і д п и с а н т _ з в а н н я }}</w:t>";
        assert_eq!(replace_variables(xml, &values).unwrap(), "<w:t>майор</w:t>");
    }
    #[test]
    fn rank_and_female_declensions() {
        assert_eq!(decline_rank("солдат", "орудний", "чоловіча"), "солдатом");
        assert_eq!(decline_word("Олена", "родовий", "жіноча"), "Олени");
        assert_eq!(
            decline_position_head(
                "оператор безпілотних літальних апаратів 1 відділення",
                "родовий"
            ),
            "оператора безпілотних літальних апаратів 1 відділення"
        );
        assert_eq!(decline_position_head("стрілець, військова частина А0000", "родовий"), "стрільця, військова частина А0000");
        assert_eq!(
            capitalize_first("оператор безпілотних літальних апаратів"),
            "Оператор безпілотних літальних апаратів"
        );
    }

    #[test]
    fn generates_and_revalidates_a_control_docx() {
        use crate::database;
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        database::seed_test_personnel(&connection).unwrap();
        let root = std::env::temp_dir().join(format!("raportgen-v2-e2e-{}", std::process::id()));
        fs::create_dir_all(root.join("Налаштування")).unwrap();
        let template = root.join("control.docx");
        let file = File::create(&template).unwrap();
        let mut writer = ZipWriter::new(file);
        writer
            .start_file("word/document.xml", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"<w:t>{{\xd0\xb2\xd1\x96\xd0\xb9\xd1\x81\xd1\x8c\xd0\xba\xd0\xbe\xd0\xb2\xd0\xb8\xd0\xb9_1_\xd0\xbf\xd1\x96\xd0\xb1:\xd1\x80\xd0\xbe\xd0\xb4\xd0\xbe\xd0\xb2\xd0\xb8\xd0\xb9:\xd0\xb2\xd0\xb5\xd0\xbb\xd0\xb8\xd0\xba\xd0\xb8\xd0\xbc\xd0\xb8}}</w:t>").unwrap();
        writer.finish().unwrap();
        assert!(inspect(template.to_str().unwrap()).is_valid);
        let generated = generate(
            &connection,
            &root,
            GenerateReportRequest {
                template_path: template.to_string_lossy().into(),
                personnel_ids: vec![1],
                report_date: None,
            },
        )
        .unwrap();
        let output = fs::read(&generated.docx_path).unwrap();
        assert!(!output.is_empty());
        assert!(inspect(&generated.docx_path).variables.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn every_shipped_docx_uses_valid_v2_tokens() {
        let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("templates");
        for entry in fs::read_dir(directory).unwrap().flatten() {
            if entry.path().extension().and_then(|value| value.to_str()) == Some("docx") {
                let result = inspect(entry.path().to_str().unwrap());
                assert!(
                    result.is_valid,
                    "{}: {:?}",
                    entry.path().display(),
                    result.errors
                );
            }
        }
    }
}
