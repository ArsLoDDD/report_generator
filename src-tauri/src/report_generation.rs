use crate::{
    personnel::{self, Personnel},
    settings, REPORTS_DIRECTORY_NAME,
};
use chrono::{Local, NaiveDate};
use quick_xml::{events::Event, Reader};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        OnceLock,
    },
    time::{SystemTime, UNIX_EPOCH},
};
mod docx;
mod morphology;
mod values;

use docx::*;
pub use docx::{create_template_from_literal_replacements, read_docx_paragraphs, read_docx_text};
use morphology::*;
use values::*;

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
    /// Legacy single date field, kept only so already-created clients remain readable.
    #[serde(default)]
    pub report_date: Option<String>,
    #[serde(default)]
    pub vehicle_ids: Vec<i64>,
    #[serde(default)]
    pub crew_ids: Vec<i64>,
    #[serde(default)]
    pub position_ids: Vec<i64>,
    #[serde(default)]
    pub equipment_ids: Vec<i64>,
    #[serde(default)]
    pub parameters: HashMap<String, String>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerationManifest<'a> {
    format_version: u8,
    generated_at: String,
    app_version: &'static str,
    template: ManifestTemplate<'a>,
    selections: ManifestSelections<'a>,
    report_date: Option<&'a str>,
    parameters: &'a HashMap<String, String>,
    output: ManifestOutput,
}

#[derive(Serialize)]
struct ManifestTemplate<'a> {
    name: &'a str,
    path: &'a str,
    sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestSelections<'a> {
    personnel_ids: &'a [i64],
    vehicle_ids: &'a [i64],
    crew_ids: &'a [i64],
    position_ids: &'a [i64],
    equipment_ids: &'a [i64],
}

#[derive(Serialize)]
struct ManifestOutput {
    path: String,
    name: String,
    sha256: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocxParagraphPreview {
    pub text: String,
    pub alignment: String,
    pub left_indent: u32,
    pub first_line_indent: i32,
    pub space_before: u32,
    pub space_after: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Registry {
    person_fields: Vec<Field>,
    vehicle_fields: Vec<Field>,
    crew_fields: Vec<Field>,
    position_fields: Vec<Field>,
    equipment_fields: Vec<Field>,
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
    #[serde(rename = "inputType")]
    input_type: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Role {
    id: String,
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
            text: normalize_unit_codes(&text),
            kind: kind.into(),
            gender: gender.filter(|v| !v.is_empty()).map(str::to_string),
        }
    }
}
fn normalize_unit_codes(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut result = String::with_capacity(text.len());
    for (index, character) in chars.iter().enumerate() {
        let is_unit_letter = (*character == 'а' || *character == 'a')
            && chars
                .get(index + 1..index + 5)
                .is_some_and(|tail| tail.iter().all(|value| value.is_ascii_digit()));
        result.push(if is_unit_letter {
            if *character == 'a' {
                'A'
            } else {
                'А'
            }
        } else {
            *character
        });
    }
    result
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
#[allow(clippy::too_many_arguments)]
pub fn validate(
    connection: &Connection,
    template_path: &str,
    ids: &[i64],
    vehicle_ids: &[i64],
    crew_ids: &[i64],
    position_ids: &[i64],
    equipment_ids: &[i64],
    date: Option<&str>,
    parameters: &HashMap<String, String>,
) -> TemplateValidationResult {
    let mut result = inspect(template_path);
    let required = selection_requirements(&result.variables);
    validate_selection_count(
        &mut result.errors,
        "personnel",
        "військовослужбовців",
        ids.len(),
        *required.get("personnel").unwrap_or(&0),
    );
    validate_selection_count(
        &mut result.errors,
        "position",
        "позицій",
        position_ids.len(),
        *required.get("position").unwrap_or(&0),
    );
    validate_selection_count(
        &mut result.errors,
        "vehicle",
        "автомобілів",
        vehicle_ids.len(),
        *required.get("vehicle").unwrap_or(&0),
    );
    validate_selection_count(
        &mut result.errors,
        "crew",
        "екіпажів",
        crew_ids.len(),
        *required.get("crew").unwrap_or(&0),
    );
    for (category, label) in [
        ("generator", "генераторів"),
        ("uav", "БпЛА"),
        ("communications", "засобів зв’язку"),
        ("weapon_ammo", "зброї та БК"),
    ] {
        let selected_count = equipment_ids
            .iter()
            .filter(|id| equipment_category(connection, **id).as_deref() == Some(category))
            .count();
        validate_selection_count(
            &mut result.errors,
            category,
            label,
            selected_count,
            *required.get(category).unwrap_or(&0),
        );
    }
    if crew_ids.iter().any(|id| {
        connection
            .query_row("SELECT 1 FROM crews WHERE id=?1", [id], |_| Ok(()))
            .is_err()
    }) {
        result
            .errors
            .push("Один або кілька обраних екіпажів більше не існують.".into());
    }
    if position_ids.iter().any(|id| {
        connection
            .query_row("SELECT 1 FROM positions WHERE id=?1", [id], |_| Ok(()))
            .is_err()
    }) {
        result
            .errors
            .push("Одна або кілька обраних позицій більше не існують.".into());
    }
    if equipment_ids.iter().any(|id| {
        connection
            .query_row("SELECT 1 FROM equipment WHERE id=?1", [id], |_| Ok(()))
            .is_err()
    }) {
        result
            .errors
            .push("Один або кілька обраних записів майна більше не існують.".into());
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
    for token in &result.variables {
        let base = token.split(':').next().unwrap_or_default();
        if field_for(base).is_none() && custom_field_token(base) {
            if let Some(error) = validate_custom_field_reference(connection, base) {
                result.errors.push(error);
            }
        }
        if (document_field_for(base).is_some() || dynamic_document_parameter(base))
            && parameters
                .get(base)
                .map(String::as_str)
                .or_else(|| {
                    if base == "дата_рапорту" {
                        date
                    } else {
                        None
                    }
                })
                .is_none_or(|value| value.trim().is_empty())
        {
            result.errors.push(format!(
                "Заповніть параметр «{{{{{base}}}}}» перед генерацією."
            ));
        }
    }
    let all = personnel::list(connection).unwrap_or_default();
    if ids.iter().any(|id| !all.iter().any(|p| p.id == *id)) {
        result
            .errors
            .push("Один або кілька обраних військовослужбовців більше не існують.".into())
    }
    if vehicle_ids.iter().any(|id| {
        connection
            .query_row("SELECT 1 FROM vehicles WHERE id=?1", [id], |_| Ok(()))
            .is_err()
    }) {
        result
            .errors
            .push("Один або кілька обраних автомобілів більше не існують.".into());
    }
    result.is_valid = result.errors.is_empty();
    result
}

fn validate_selection_count(
    errors: &mut Vec<String>,
    _kind: &str,
    label: &str,
    actual: usize,
    expected: usize,
) {
    if expected > 0 && actual != expected {
        errors.push(format!(
            "Для цього шаблону потрібно обрати рівно {expected} {label}; обрано {actual}."
        ));
    } else if expected == 0 && actual > 0 {
        errors.push(format!(
            "Шаблон не використовує {label}, тому зайвий вибір відхилено."
        ));
    }
}

fn equipment_category(connection: &Connection, id: i64) -> Option<String> {
    connection
        .query_row("SELECT category FROM equipment WHERE id=?1", [id], |row| {
            row.get(0)
        })
        .ok()
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
        &request.vehicle_ids,
        &request.crew_ids,
        &request.position_ids,
        &request.equipment_ids,
        request.report_date.as_deref(),
        &request.parameters,
    );
    if !check.is_valid {
        return Err(check.errors.join(" "));
    }
    let people = selected_personnel(connection, &request.personnel_ids)?;
    let mut values = values_for(
        connection,
        &people,
        &settings::load(root)?,
        request.report_date.as_deref(),
        None,
    )?;
    add_selected_vehicles(connection, &request.vehicle_ids, &mut values)?;
    add_selected_crews(connection, &request.crew_ids, &mut values)?;
    add_selected_positions(connection, &request.position_ids, &mut values)?;
    add_selected_equipment(connection, &request.equipment_ids, &mut values)?;
    add_generation_parameters(
        &mut values,
        &request.parameters,
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
    let base = safe_report_stem(
        &format!("{stem} {surnames} {}", now.format("%d.%m.%Y")),
        140,
    );
    let temp = unique_temp_path(&dir, "report", "docx.tmp")?;
    let result = write_docx(Path::new(&request.template_path), &temp, &values);
    if let Err(e) = result {
        let _ = fs::remove_file(&temp);
        return Err(e);
    }
    if let Err(error) = verify_generated_docx(&temp).and_then(|_| sync_file(&temp)) {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    let final_path = match publish_without_overwrite(&temp, &dir, &base, "docx") {
        Ok(path) => path,
        Err(error) => {
            let _ = fs::remove_file(&temp);
            return Err(error);
        }
    };
    let _ = fs::remove_file(&temp);
    let manifest_result =
        write_generation_manifest(&dir, &final_path, stem, &request, &now.to_rfc3339());
    if let Err(error) = manifest_result {
        let _ = fs::remove_file(&final_path);
        return Err(error);
    }
    sync_directory(&dir)?;
    Ok(GeneratedReport {
        docx_path: final_path.to_string_lossy().into(),
        folder_path: dir.to_string_lossy().into(),
    })
}

fn safe_report_stem(value: &str, max_chars: usize) -> String {
    let cleaned = value
        .chars()
        .map(|character| {
            if matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) || character.is_control()
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    let mut result = cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_end_matches([' ', '.'])
        .chars()
        .take(max_chars)
        .collect::<String>()
        .trim_end_matches([' ', '.'])
        .to_string();
    if result.is_empty() {
        result = "Рапорт".into();
    }
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved
        .iter()
        .any(|name| result.eq_ignore_ascii_case(name))
    {
        result.push('_');
    }
    result
}

fn unique_temp_path(directory: &Path, label: &str, extension: &str) -> Result<PathBuf, String> {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    for _ in 0..100 {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = directory.join(format!(
            ".{label}-{}-{nonce}-{sequence}.{extension}",
            std::process::id()
        ));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => {
                drop(file);
                fs::remove_file(&path)
                    .map_err(|_| "Не вдалося підготувати тимчасовий файл рапорту.".to_string())?;
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("Не вдалося підготувати тимчасовий файл рапорту.".into()),
        }
    }
    Err("Не вдалося підібрати унікальне ім’я тимчасового файла.".into())
}

fn publish_without_overwrite(
    source: &Path,
    directory: &Path,
    base: &str,
    extension: &str,
) -> Result<PathBuf, String> {
    for index in 0..10_000_u32 {
        let suffix = if index == 0 {
            String::new()
        } else {
            format!(" ({})", index + 1)
        };
        let candidate = directory.join(format!("{base}{suffix}.{extension}"));
        match fs::hard_link(source, &candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("Не вдалося безпечно опублікувати створений рапорт.".into()),
        }
    }
    Err("У папці вже надто багато рапортів з однаковою назвою.".into())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|_| "Не вдалося прочитати файл для контрольної суми.".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "Не вдалося обчислити контрольну суму файла.".to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn write_generation_manifest(
    directory: &Path,
    output_path: &Path,
    template_name: &str,
    request: &GenerateReportRequest,
    generated_at: &str,
) -> Result<(), String> {
    let output_name = output_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("report.docx");
    let manifest = GenerationManifest {
        format_version: 1,
        generated_at: generated_at.to_string(),
        app_version: env!("CARGO_PKG_VERSION"),
        template: ManifestTemplate {
            name: template_name,
            path: &request.template_path,
            sha256: sha256_file(Path::new(&request.template_path))?,
        },
        selections: ManifestSelections {
            personnel_ids: &request.personnel_ids,
            vehicle_ids: &request.vehicle_ids,
            crew_ids: &request.crew_ids,
            position_ids: &request.position_ids,
            equipment_ids: &request.equipment_ids,
        },
        report_date: request.report_date.as_deref(),
        parameters: &request.parameters,
        output: ManifestOutput {
            path: output_path.to_string_lossy().into_owned(),
            name: output_name.to_string(),
            sha256: sha256_file(output_path)?,
        },
    };
    let bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|_| "Не вдалося сформувати паспорт створеного рапорту.".to_string())?;
    let manifest_path = directory.join(format!("{output_name}.manifest.json"));
    let temp = unique_temp_path(directory, "manifest", "json.tmp")?;
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| "Не вдалося відкрити тимчасовий паспорт рапорту.".to_string())?;
        file.write_all(&bytes)
            .map_err(|_| "Не вдалося записати паспорт рапорту.".to_string())?;
        file.write_all(b"\n")
            .map_err(|_| "Не вдалося завершити паспорт рапорту.".to_string())?;
        file.sync_all()
            .map_err(|_| "Не вдалося синхронізувати паспорт рапорту.".to_string())?;
        fs::hard_link(&temp, &manifest_path).map_err(|_| {
            "Не вдалося опублікувати паспорт рапорту без перезапису наявних даних.".to_string()
        })?;
        let _ = fs::remove_file(&temp);
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn sync_file(path: &Path) -> Result<(), String> {
    File::open(path)
        .and_then(|file| file.sync_all())
        .map_err(|_| "Не вдалося синхронізувати створений рапорт.".to_string())
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<(), String> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| "Не вдалося синхронізувати папку рапортів.".to_string())
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn validate_token(token: &str) -> Vec<String> {
    let canonical = normalize_token(token);
    let parts = canonical.split(':').collect::<Vec<_>>();
    let base = parts[0].trim();
    let field = field_for(base);
    let is_custom = field.is_none() && custom_field_token(base);
    let is_document_parameter = field.is_none() && dynamic_document_parameter(base);
    if field.is_none() && !is_custom && !is_document_parameter {
        let hint = nearest_known_variable(base)
            .map(|candidate| format!(" Можливо, ви мали на увазі «{{{{{candidate}}}}}»."))
            .unwrap_or_default();
        return vec![format!("Невідома змінна «{{{{{token}}}}}».{hint}")];
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
                if m.group == "case" {
                    "відмінок"
                } else {
                    "регістр"
                }
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
    if let Some(key) = base.strip_prefix("автомобіль_") {
        let Some((number, key)) = key.split_once('_') else {
            return false;
        };
        if number
            .parse::<usize>()
            .ok()
            .filter(|number| *number > 0)
            .is_none()
        {
            return false;
        }
        return !key.is_empty()
            && key.chars().next().is_some_and(char::is_alphabetic)
            && key
                .chars()
                .all(|value| value == '_' || value.is_alphanumeric());
    }
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
        && key
            .chars()
            .all(|value| value == '_' || value.is_alphanumeric())
}

/// A Ukrainian token entered manually in the template editor is a text parameter
/// of this document. It does not create a new database column.
fn dynamic_document_parameter(base: &str) -> bool {
    let reserved_subject = [
        "військовий_",
        "автомобіль_",
        "екіпаж_",
        "позиція_",
        "генератор_",
        "бпла_",
        "звʼязок_",
        "зброя_та_бк_",
    ]
    .iter()
    .any(|prefix| base.starts_with(prefix));
    let reserved_signer = registry()
        .signer_roles
        .iter()
        .any(|role| base.starts_with(&(role.id.clone() + "_")));
    let signer_field_suffix = registry()
        .signer_fields
        .iter()
        .any(|field| base.len() > field.id.len() + 1 && base.ends_with(&format!("_{}", field.id)));
    let reserved_document_parameter = registry()
        .document_fields
        .iter()
        .filter_map(|field| base.strip_prefix(&(field.id.clone() + "_")))
        .any(|suffix| {
            !suffix.is_empty() && suffix.chars().all(|character| character.is_ascii_digit())
        });
    let has_ukrainian_letter = base.chars().any(|character| {
        "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя"
            .contains(character.to_lowercase().next().unwrap_or_default())
    });

    !reserved_subject
        && !reserved_signer
        && !signer_field_suffix
        && !reserved_document_parameter
        && nearest_known_variable(base).is_none()
        && base.chars().next().is_some_and(char::is_alphabetic)
        && base
            .chars()
            .all(|character| character == '_' || character.is_alphanumeric())
        && has_ukrainian_letter
}

fn nearest_known_variable(value: &str) -> Option<String> {
    registry()
        .document_fields
        .iter()
        .map(|field| field.id.clone())
        .chain(registry().signer_roles.iter().flat_map(|role| {
            registry()
                .signer_fields
                .iter()
                .map(move |field| format!("{}_{}", role.id, field.id))
        }))
        .filter(|candidate| candidate != value)
        .min_by_key(|candidate| edit_distance(value, candidate))
        .filter(|candidate| edit_distance(value, candidate) == 1)
}

fn custom_field_reference(base: &str) -> Option<(&'static str, &str)> {
    if let Some(rest) = base.strip_prefix("автомобіль_") {
        let (_number, field) = rest.split_once('_')?;
        return Some(("vehicle_custom_field_definitions", field));
    }
    let rest = base.strip_prefix("військовий_")?;
    let (_number, field) = rest.split_once('_')?;
    if let Some(vehicle) = field.strip_prefix("автомобіль_") {
        let (_vehicle_number, vehicle_field) = vehicle.split_once('_')?;
        Some(("vehicle_custom_field_definitions", vehicle_field))
    } else {
        Some(("custom_field_definitions", field))
    }
}

fn validate_custom_field_reference(connection: &Connection, base: &str) -> Option<String> {
    let (table, token_field) = custom_field_reference(base)?;
    let scope = if table == "vehicle_custom_field_definitions" {
        "vehicle"
    } else {
        "personnel"
    };
    let sql = format!("SELECT field_key, display_name FROM {table}");
    let mut statement = connection.prepare(&sql).ok()?;
    let definitions = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .ok()?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    let found = token_field
        .strip_prefix("custom_")
        .is_some_and(|key| definitions.iter().any(|(field_key, _)| field_key == key))
        || definitions
            .iter()
            .any(|(_, display_name)| custom_template_id(display_name) == token_field);
    let aliases = connection
        .prepare("SELECT field_key,deleted_at FROM custom_field_template_aliases WHERE scope=?1 AND alias=?2")
        .and_then(|mut statement| {
            statement
                .query_map(rusqlite::params![scope, token_field], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
                })
                .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        })
        .unwrap_or_default();
    let active_aliases = aliases
        .iter()
        .filter(|(field_key, deleted_at)| {
            deleted_at.is_none()
                && definitions
                    .iter()
                    .any(|(defined_key, _)| defined_key == field_key)
        })
        .count();
    if !found && active_aliases > 1 {
        return Some(format!(
            "Змінна «{{{{{base}}}}}» неоднозначна: однакову попередню назву мають кілька додаткових полів. Замініть її стабільним токеном із «custom_»."
        ));
    }
    let found = found || active_aliases == 1;
    if !found && aliases.iter().any(|(_, deleted_at)| deleted_at.is_some()) {
        return Some(format!(
            "Змінна «{{{{{base}}}}}» використовує видалене додаткове поле. Відновіть поле або замініть змінну в шаблоні."
        ));
    }
    (!found).then(|| {
        format!(
            "Змінна «{{{{{base}}}}}» посилається на відсутнє додаткове поле. Оновіть шаблон або відновіть поле в налаштуваннях."
        )
    })
}
fn field_for(base: &str) -> Option<&'static Field> {
    if let Some(field) = document_field_for(base) {
        return Some(field);
    }
    if let Some(id) = base.strip_prefix("автомобіль_") {
        let id = numbered_subject_field(id)?;
        return registry().vehicle_fields.iter().find(|f| f.id == id);
    }
    if let Some(id) = base.strip_prefix("екіпаж_") {
        let id = numbered_subject_field(id)?;
        if let Some(field) = registry().crew_fields.iter().find(|field| field.id == id) {
            return Some(field);
        }
    }
    if let Some(id) = base.strip_prefix("позиція_") {
        let id = numbered_subject_field(id)?;
        return registry()
            .position_fields
            .iter()
            .find(|field| field.id == id);
    }
    for prefix in ["генератор_", "бпла_", "звʼязок_", "зброя_та_бк_"] {
        if let Some(id) = base.strip_prefix(prefix) {
            let id = numbered_subject_field(id)?;
            return registry().equipment_fields.iter().find(|f| f.id == id);
        }
    }
    if let Some(c) = base.strip_prefix("військовий_") {
        let (number, id) = c.split_once('_')?;
        if number.parse::<usize>().ok()? == 0 {
            return None;
        }
        if let Some(vehicle) = id.strip_prefix("автомобіль_") {
            let (vehicle_number, field_id) = vehicle.split_once('_')?;
            if vehicle_number.parse::<usize>().ok()? == 0 {
                return None;
            }
            return registry()
                .vehicle_fields
                .iter()
                .find(|field| field.id == field_id);
        }
        return registry().person_fields.iter().find(|f| f.id == id);
    }
    for role in &registry().signer_roles {
        if let Some(id) = base.strip_prefix(&(role.id.clone() + "_")) {
            if let Some(f) = registry().signer_fields.iter().find(|f| f.id == id) {
                return Some(f);
            }
        }
    }
    if registry()
        .signer_fields
        .iter()
        .any(|field| base.ends_with(&format!("_{}", field.id)))
    {
        return registry()
            .signer_fields
            .iter()
            .filter(|field| base.ends_with(&format!("_{}", field.id)))
            .max_by_key(|field| field.id.len());
    }
    None
}

fn numbered_subject_field(value: &str) -> Option<&str> {
    let (number, field) = value.split_once('_')?;
    number
        .parse::<usize>()
        .ok()
        .filter(|number| *number > 0)
        .map(|_| field)
}
fn selection_kind(token: &str) -> Option<&'static str> {
    let base = token.split(':').next().unwrap_or_default();
    if document_field_for(base).is_some() || dynamic_document_parameter(base) {
        None
    } else if base.starts_with("військовий_") {
        Some("personnel")
    } else if base.starts_with("автомобіль_") {
        Some("vehicle")
    } else if base.starts_with("екіпаж_") {
        Some("crew")
    } else if base.starts_with("позиція_") {
        Some("position")
    } else if ["генератор_", "бпла_", "звʼязок_", "зброя_та_бк_"]
        .iter()
        .any(|prefix| base.starts_with(prefix))
    {
        Some("equipment")
    } else {
        None
    }
}

fn selection_requirements(tokens: &[String]) -> HashMap<&'static str, usize> {
    let mut result: HashMap<&'static str, usize> = HashMap::new();
    for token in tokens {
        let base = token.split(':').next().unwrap_or_default();
        let Some(kind) = selection_kind(base) else {
            continue;
        };
        let key = equipment_subject(base).unwrap_or(kind);
        let number = selection_number(base).unwrap_or(1);
        result
            .entry(key)
            .and_modify(|current| *current = (*current).max(number))
            .or_insert(number);
    }
    result
}

fn equipment_subject(base: &str) -> Option<&'static str> {
    [
        ("генератор_", "generator"),
        ("бпла_", "uav"),
        ("звʼязок_", "communications"),
        ("зброя_та_бк_", "weapon_ammo"),
    ]
    .into_iter()
    .find_map(|(prefix, kind)| base.starts_with(prefix).then_some(kind))
}

fn selection_number(base: &str) -> Option<usize> {
    if let Some(number) = person_number(base) {
        return Some(number);
    }
    for prefix in [
        "автомобіль_",
        "екіпаж_",
        "позиція_",
        "генератор_",
        "бпла_",
        "звʼязок_",
        "зброя_та_бк_",
    ] {
        if let Some(rest) = base.strip_prefix(prefix) {
            return rest
                .split_once('_')
                .and_then(|(part, _)| part.parse::<usize>().ok())
                .filter(|number| *number > 0)
                .or(Some(1));
        }
    }
    None
}

fn document_field_for(base: &str) -> Option<&'static Field> {
    registry()
        .document_fields
        .iter()
        .find(|field| field.id == base)
        .or_else(|| {
            let (field_id, number) = base.rsplit_once('_')?;
            (number.parse::<usize>().ok()? > 0).then_some(())?;
            registry()
                .document_fields
                .iter()
                .find(|field| field.id == field_id)
        })
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

#[cfg(test)]
mod tests;
