use crate::{personnel::{self, Personnel}, settings, REPORTS_DIRECTORY_NAME};
use chrono::{Local, NaiveDate};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs::{self, File}, io::{Read, Write}, path::Path};
use zip::{read::ZipArchive, write::{SimpleFileOptions, ZipWriter}, CompressionMethod};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateReportRequest { pub template_path: String, pub personnel_ids: Vec<i64>, pub report_date: Option<String> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateValidationResult { pub is_valid: bool, pub errors: Vec<String>, pub variables: Vec<String> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedReport { pub docx_path: String, pub folder_path: String }

pub fn inspect(template_path: &str) -> TemplateValidationResult {
    let mut errors = Vec::new();
    let variables = match read_variables(Path::new(template_path)) { Ok(variables) => variables, Err(error) => { errors.push(error); Vec::new() } };
    for variable in &variables {
        if !is_supported_variable(variable) { errors.push(format!("Невідома змінна «{{{{{variable}}}}}». Перевірте довідник мови шаблонів.")); }
    }
    TemplateValidationResult { is_valid: errors.is_empty(), errors, variables }
}

pub fn validate(connection: &Connection, template_path: &str, personnel_ids: &[i64], report_date: Option<&str>) -> TemplateValidationResult {
    let mut inspection = inspect(template_path);
    let errors = &mut inspection.errors;
    if personnel_ids.is_empty() { errors.push("Оберіть щонайменше одного військовослужбовця.".into()); }
    let allowed_prefix = if personnel_ids.len() == 1 { "soldier." } else { "soldiers[" };
    for variable in &inspection.variables {
        if variable.starts_with("soldier.") && allowed_prefix != "soldier." { errors.push(format!("Змінна «{{{{{variable}}}}}» призначена для шаблону з однією особою.")); }
        if variable.starts_with("soldiers[") && allowed_prefix != "soldiers[" { errors.push(format!("Змінна «{{{{{variable}}}}}» потребує вибору двох або більше осіб.")); }
    }
    if let Some(date) = report_date.filter(|date| !date.is_empty()) { if NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() { errors.push("Дата рапорту має формат РРРР-ММ-ДД.".into()); } }
    if errors.is_empty() {
        let available = personnel::list(connection).unwrap_or_default();
        if personnel_ids.iter().any(|id| !available.iter().any(|person| person.id == *id)) { errors.push("Один або кілька обраних військовослужбовців більше не існують. Оновіть список.".into()); }
    }
    inspection.is_valid = errors.is_empty();
    inspection
}

pub fn generate(connection: &Connection, app_data_directory: &Path, request: GenerateReportRequest) -> Result<GeneratedReport, String> {
    let validation = validate(connection, &request.template_path, &request.personnel_ids, request.report_date.as_deref());
    if !validation.is_valid { return Err(validation.errors.join(" ")); }
    let personnel = selected_personnel(connection, &request.personnel_ids)?;
    let settings = settings::load(app_data_directory)?;
    let values = values_for(&personnel, &settings, request.report_date.as_deref())?;
    let now = Local::now();
    let date_directory = now.format("%d.%m.%Y").to_string();
    let template_name = safe_name(Path::new(&request.template_path).file_stem().and_then(|name| name.to_str()).unwrap_or("Рапорт"));
    let surnames = personnel.iter().map(|person| safe_name(&person.surname)).collect::<Vec<_>>().join(", ");
    let report_name = format!("{template_name} {surnames} {}", now.format("%d.%m.%Y"));
    let reports_root = app_data_directory.join(REPORTS_DIRECTORY_NAME).join(date_directory);
    fs::create_dir_all(&reports_root).map_err(|_| "Не вдалося створити папку для рапортів.".to_string())?;
    let file_name = available_file_name(&reports_root, &report_name, now.format("%H-%M-%S").to_string());
    let final_path = reports_root.join(&file_name);
    let temporary_path = reports_root.join(format!(".{file_name}.tmp"));
    let result = write_docx(Path::new(&request.template_path), &temporary_path, &values);
    match result {
        Ok(()) => { fs::rename(&temporary_path, &final_path).map_err(|_| "Не вдалося завершити створення рапорту.".to_string())?; Ok(GeneratedReport { docx_path: final_path.to_string_lossy().to_string(), folder_path: reports_root.to_string_lossy().to_string() }) }
        Err(error) => { let _ = fs::remove_file(&temporary_path); Err(error) }
    }
}

fn available_file_name(directory: &Path, report_name: &str, timestamp: String) -> String {
    let preferred = format!("{report_name}.docx");
    if !directory.join(&preferred).exists() { return preferred; }
    format!("{report_name} ({timestamp}).docx")
}

fn selected_personnel(connection: &Connection, ids: &[i64]) -> Result<Vec<Personnel>, String> { let all = personnel::list(connection)?; ids.iter().map(|id| all.iter().find(|person| person.id == *id).cloned().ok_or_else(|| "Не знайдено обраного військовослужбовця.".to_string())).collect() }

fn values_for(personnel: &[Personnel], settings: &settings::AppSettings, report_date: Option<&str>) -> Result<HashMap<String, String>, String> {
    let mut values = HashMap::new();
    let main_name = signer_name_parts(&settings.main_signer.full_name);
    let commander_name = signer_name_parts(&settings.commander.full_name);
    let chief_name = signer_name_parts(&settings.chief.full_name);
    if personnel.len() == 1 {
        add_person_values(&mut values, "soldier", &personnel[0]);
    } else {
        for (index, person) in personnel.iter().enumerate() {
            add_person_values(&mut values, &format!("soldiers[{index}]"), person);
        }
    }
    values.extend([
        ("main.rank".to_string(), sentence_case(&settings.main_signer.rank)),
        ("main.surname".to_string(), main_name.0.clone()),
        ("main.givenName".to_string(), main_name.1.clone()),
        ("main.patronymic".to_string(), main_name.2.clone()),
        ("main.fullName".to_string(), [main_name.0.clone(), main_name.1.clone(), main_name.2.clone()].into_iter().filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" ")),
        ("main.position".to_string(), sentence_case(&settings.main_signer.position)),
        ("mainRank".to_string(), sentence_case(&settings.main_signer.rank)),
        ("mainName".to_string(), settings.main_signer.full_name.clone()),
        ("mainPosition".to_string(), sentence_case(&settings.main_signer.position)),
        ("commanderName".to_string(), settings.commander.full_name.clone()),
        ("chiefName".to_string(), settings.chief.full_name.clone()),
        ("commander.rank".to_string(), sentence_case(&settings.commander.rank)),
        ("commander.surname".to_string(), commander_name.0.clone()),
        ("commander.givenName".to_string(), commander_name.1.clone()),
        ("commander.patronymic".to_string(), commander_name.2.clone()),
        ("commander.fullName".to_string(), [commander_name.0.clone(), commander_name.1.clone(), commander_name.2.clone()].into_iter().filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" ")),
        ("commander.position".to_string(), sentence_case(&settings.commander.position)),
        ("chief.rank".to_string(), sentence_case(&settings.chief.rank)),
        ("chief.surname".to_string(), chief_name.0.clone()),
        ("chief.givenName".to_string(), chief_name.1.clone()),
        ("chief.patronymic".to_string(), chief_name.2.clone()),
        ("chief.fullName".to_string(), [chief_name.0.clone(), chief_name.1.clone(), chief_name.2.clone()].into_iter().filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" ")),
        ("chief.position".to_string(), sentence_case(&settings.chief.position)),
    ]);
    add_signer_values(&mut values, "deputyPpp", &settings.deputy_ppp);
    add_signer_values(&mut values, "deputyArmament", &settings.deputy_armament);
    add_signer_values(&mut values, "deputyRear", &settings.deputy_rear);
    add_signer_values(&mut values, "fuelChief", &settings.fuel_chief);
    let report_date = match report_date.filter(|date| !date.is_empty()) {
        Some(value) => NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| "Не вдалося прочитати дату рапорту.".to_string())?,
        None => Local::now().date_naive(),
    };
    values.insert("document.date".to_string(), report_date.format("%d.%m.%Y року").to_string());
    // Template Language v2: public Ukrainian keys. v1 keys above are kept temporarily
    // while the generator UI is being switched to the new resolver.
    values.insert("дата_рапорту".to_string(), report_date.format("%d.%m.%Y року").to_string());
    for (index, person) in personnel.iter().enumerate() {
        let prefix = format!("військовий_{}_", index + 1);
        for (field, value) in [("прізвище", person.surname.to_uppercase()), ("імя", name_case(&person.given_name)), ("по_батькові", name_case(&person.patronymic)), ("піб", format_person_full_name(person)), ("звання", sentence_case(&person.rank)), ("посада", sentence_case(&person.position)), ("іпн", person.tax_id.clone()), ("дата_народження", person.birth_date.clone()), ("освіта", person.education_level.clone()), ("де_отримана_освіта", person.education_details.clone()), ("служба_в_зсу", person.armed_forces_service_start_date.clone()), ("дата_призначення", person.position_assigned_date.clone()), ("наказ_призначення", person.position_assignment_order.clone()), ("військовий_квиток", person.military_id.clone()), ("автомобіль", person.assigned_vehicle_name.clone()), ("номер_автомобіля", person.assigned_vehicle_registration.clone())] { values.insert(format!("{prefix}{field}"), value); }
    }
    Ok(values)
}

fn add_signer_values(values: &mut HashMap<String, String>, prefix: &str, signer: &settings::SignerSettings) {
    let name = signer_name_parts(&signer.full_name);
    values.extend([
        (format!("{prefix}.rank"), sentence_case(&signer.rank)),
        (format!("{prefix}.surname"), name.0.clone()),
        (format!("{prefix}.givenName"), name.1.clone()),
        (format!("{prefix}.patronymic"), name.2.clone()),
        (format!("{prefix}.fullName"), [name.0, name.1, name.2].into_iter().filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" ")),
        (format!("{prefix}.position"), sentence_case(&signer.position)),
    ]);
}

fn add_person_values(values: &mut HashMap<String, String>, prefix: &str, person: &Personnel) {
    let full_name = format_person_full_name(person);
    for (key, value) in [("rank", sentence_case(&person.rank)), ("surname", person.surname.to_uppercase()), ("givenName", person.given_name.clone()), ("patronymic", person.patronymic.clone()), ("fullName", full_name), ("position", sentence_case(&person.position)), ("taxId", person.tax_id.clone()), ("birthDate", person.birth_date.clone()), ("educationLevel", person.education_level.clone()), ("educationDetails", person.education_details.clone()), ("armedForcesServiceStartDate", person.armed_forces_service_start_date.clone()), ("positionAssignedDate", person.position_assigned_date.clone()), ("positionAssignmentOrder", person.position_assignment_order.clone()), ("militaryId", person.military_id.clone()), ("assignedVehicleName", person.assigned_vehicle_name.clone()), ("assignedVehicleRegistration", person.assigned_vehicle_registration.clone())] { values.insert(format!("{prefix}.{key}"), value); }
}

fn format_person_full_name(person: &Personnel) -> String {
    [person.surname.to_uppercase(), name_case(&person.given_name), name_case(&person.patronymic)].into_iter().filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" ")
}

fn signer_name_parts(full_name: &str) -> (String, String, String) {
    let parts = full_name.split_whitespace().map(name_case).collect::<Vec<_>>();
    (parts.first().map(|value| value.to_uppercase()).unwrap_or_default(), parts.get(1).cloned().unwrap_or_default(), parts.get(2..).unwrap_or_default().join(" "))
}

fn sentence_case(value: &str) -> String {
    let mut characters = value.trim().chars();
    let Some(first) = characters.next() else { return String::new(); };
    first.to_lowercase().collect::<String>() + characters.as_str()
}

fn name_case(value: &str) -> String {
    value.split_whitespace().map(|word| word.split('-').map(|part| {
        let mut characters = part.chars();
        let Some(first) = characters.next() else { return String::new(); };
        first.to_uppercase().collect::<String>() + &characters.flat_map(char::to_lowercase).collect::<String>()
    }).collect::<Vec<_>>().join("-")).collect::<Vec<_>>().join(" ")
}

fn read_variables(path: &Path) -> Result<Vec<String>, String> { let file = File::open(path).map_err(|_| "Не вдалося відкрити шаблон. Перевірте шлях і доступ до файлу.".to_string())?; let mut archive = ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?; let mut variables = Vec::new(); for index in 0..archive.len() { let mut entry = archive.by_index(index).map_err(|_| "Не вдалося прочитати вміст шаблону.".to_string())?; if !entry.name().ends_with(".xml") { continue; } let mut content = String::new(); let _ = entry.read_to_string(&mut content); variables.extend(extract_variables(&content)); } variables.sort(); variables.dedup(); Ok(variables) }

// Word may split one value such as {{main.surname}} into several w:t elements.
// Validation therefore reads visible XML text, rather than searching raw markup.
fn extract_variables(content: &str) -> Vec<String> {
    let visible_text = xml_visible_text(content);
    let mut values = Vec::new();
    let mut remaining = visible_text.as_str();
    while let Some(start) = remaining.find("{{") {
        let after_start = &remaining[start + 2..];
        if let Some(end) = after_start.find("}}") {
            values.push(after_start[..end].to_string());
            remaining = &after_start[end + 2..];
        } else {
            break;
        }
    }
    values
}

fn xml_visible_text(content: &str) -> String {
    let mut visible_text = String::new();
    let mut in_tag = false;
    for character in content.chars() {
        match character {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => visible_text.push(character),
            _ => {}
        }
    }
    visible_text
}
fn is_supported_variable(variable: &str) -> bool {
    let base = variable.split(':').next().unwrap_or("");
    let modifiers = variable.split(':').skip(1).collect::<Vec<_>>();
    let allowed_modifiers = ["називний", "родовий", "давальний", "знахідний", "орудний", "місцевий", "кличний", "великими", "маленькими", "з_великої"];
    if modifiers.iter().any(|modifier| !allowed_modifiers.contains(modifier)) { return false; }
    let person_fields = ["прізвище", "імя", "по_батькові", "піб", "звання", "посада", "іпн", "дата_народження", "освіта", "де_отримана_освіта", "служба_в_зсу", "дата_призначення", "наказ_призначення", "військовий_квиток", "автомобіль", "номер_автомобіля"];
    let signer_fields = ["прізвище", "імя", "по_батькові", "піб", "звання", "посада"];
    if base == "дата_рапорту" { return modifiers.iter().all(|modifier| ["великими", "маленькими", "з_великої"].contains(modifier)); }
    let signer_prefixes = ["основний_підписант", "командир", "начальник_штабу", "заступник_ппп", "заступник_озброєння", "заступник_тилу", "начальник_пмм"];
    signer_prefixes.iter().any(|prefix| signer_fields.iter().any(|field| base == format!("{prefix}_{field}"))) || (base.starts_with("військовий_") && person_fields.iter().any(|field| base.ends_with(&format!("_{field}"))))
}
fn write_docx(input: &Path, output: &Path, values: &HashMap<String, String>) -> Result<(), String> {
    let file = File::open(input).map_err(|_| "Не вдалося відкрити DOCX-шаблон.".to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?;
    let output_file = File::create(output).map_err(|_| "Не вдалося створити DOCX-файл.".to_string())?;
    let mut writer = ZipWriter::new(output_file);
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|_| "Не вдалося прочитати файл шаблону.".to_string())?;
        let name = entry.name().to_owned();
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        if entry.is_dir() { writer.add_directory(name, options).map_err(|_| "Не вдалося сформувати DOCX.".to_string())?; continue; }
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).map_err(|_| "Не вдалося прочитати частину шаблону.".to_string())?;
        writer.start_file(name.clone(), options).map_err(|_| "Не вдалося сформувати DOCX.".to_string())?;
        let content = String::from_utf8_lossy(&bytes);
        if name == "word/document.xml" {
            let document = replace_variables(&content, values);
            writer.write_all(document.as_bytes()).map_err(|_| "Не вдалося записати DOCX.".to_string())?;
        }
        else { writer.write_all(&bytes).map_err(|_| "Не вдалося записати DOCX.".to_string())?; }
    }
    writer.finish().map_err(|_| "Не вдалося завершити DOCX.".to_string())?;
    Ok(())
}

fn replace_variables(content: &str, values: &HashMap<String, String>) -> String {
    values.iter()
        .fold(content.to_string(), |result, (key, value)| replace_word_token(&result, &format!("{{{{{key}}}}}"), &escape_xml(value)))
}

fn replace_word_token(content: &str, token: &str, replacement: &str) -> String {
    let mut result = content.to_string();
    while let Some((nodes, start_node, start_offset, end_node, end_offset)) = token_location(&result, token) {
        let mut text_values = nodes.iter().map(|(start, end)| result[*start..*end].to_string()).collect::<Vec<_>>();
        if start_node == end_node {
            text_values[start_node].replace_range(start_offset..end_offset, replacement);
        } else {
            text_values[start_node].replace_range(start_offset.., replacement);
            for value in &mut text_values[start_node + 1..end_node] { value.clear(); }
            text_values[end_node].replace_range(..end_offset, "");
        }
        let mut rebuilt = String::new();
        let mut cursor = 0;
        for ((start, end), value) in nodes.iter().zip(text_values) {
            rebuilt.push_str(&result[cursor..*start]);
            rebuilt.push_str(&value);
            cursor = *end;
        }
        rebuilt.push_str(&result[cursor..]);
        result = rebuilt;
    }
    result
}

fn token_location(content: &str, token: &str) -> Option<(Vec<(usize, usize)>, usize, usize, usize, usize)> {
    let nodes = word_text_nodes(content);
    let text = nodes.iter().map(|(start, end)| &content[*start..*end]).collect::<String>();
    let start = text.find(token)?;
    let end = start + token.len();
    let mut cursor = 0;
    let mut start_location = None;
    let mut end_location = None;
    for (index, (node_start, node_end)) in nodes.iter().enumerate() {
        let length = node_end - node_start;
        if start_location.is_none() && start < cursor + length { start_location = Some((index, start - cursor)); }
        if end > cursor && end <= cursor + length { end_location = Some((index, end - cursor)); break; }
        cursor += length;
    }
    let (start_node, start_offset) = start_location?;
    let (end_node, end_offset) = end_location?;
    Some((nodes, start_node, start_offset, end_node, end_offset))
}

fn word_text_nodes(content: &str) -> Vec<(usize, usize)> {
    let mut nodes = Vec::new();
    let mut remaining = 0;
    while let Some(relative_start) = content[remaining..].find("<w:t") {
        let tag_start = remaining + relative_start;
        let Some(tag_end_relative) = content[tag_start..].find('>') else { break; };
        let text_start = tag_start + tag_end_relative + 1;
        let Some(text_end_relative) = content[text_start..].find("</w:t>") else { break; };
        let text_end = text_start + text_end_relative;
        nodes.push((text_start, text_end));
        remaining = text_end + "</w:t>".len();
    }
    nodes
}
fn escape_xml(value: &str) -> String { value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;") }
fn safe_name(value: &str) -> String { value.chars().map(|character| if matches!(character, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || character.is_control() { '_' } else { character }).collect::<String>().trim().to_string() }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("report-generator-{name}-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()))
    }

    fn write_test_template(path: &Path, body: &str) {
        let file = File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        writer.start_file("word/document.xml", SimpleFileOptions::default()).unwrap();
        writer.write_all(body.as_bytes()).unwrap();
        writer.finish().unwrap();
    }

    #[test]
    fn reports_missing_template_cleanly() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        database::seed_test_personnel(&connection).unwrap();
        let result = validate(&connection, "/missing.docx", &[1], None);
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|error| error.contains("Не вдалося відкрити шаблон")));
    }

    #[test]
    fn uses_indexed_values_only_for_multiple_people() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        database::seed_test_personnel(&connection).unwrap();
        let people = selected_personnel(&connection, &[1, 2]).unwrap();
        let values = values_for(&people, &settings::defaults(), None).unwrap();
        assert!(values.contains_key("soldiers[0].fullName"));
        assert!(values.contains_key("soldiers[1].fullName"));
        assert!(!values.contains_key("soldier.fullName"));
    }

    #[test]
    fn provides_main_namespace_and_formats_report_date() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        database::seed_test_personnel(&connection).unwrap();
        let people = selected_personnel(&connection, &[1]).unwrap();
        let mut app_settings = settings::defaults();
        app_settings.main_signer = settings::SignerSettings { full_name: "Іваненко Іван Іванович".into(), rank: "майор".into(), position: "Заступник командира з ППП".into() };
        app_settings.commander = settings::SignerSettings { full_name: "Петренко Петро Петрович".into(), rank: "капітан".into(), position: "Командир".into() };
        app_settings.chief = settings::SignerSettings { full_name: "Сидоренко Сергій Сергійович".into(), rank: "капітан".into(), position: "Начальник штабу".into() };
        let values = values_for(&people, &app_settings, Some("2026-08-03")).unwrap();
        assert_eq!(values.get("main.fullName").unwrap(), "ІВАНЕНКО Іван Іванович");
        assert_eq!(values.get("main.surname").unwrap(), "ІВАНЕНКО");
        assert_eq!(values.get("commander.fullName").unwrap(), "ПЕТРЕНКО Петро Петрович");
        assert_eq!(values.get("commander.position").unwrap(), "командир");
        assert_eq!(values.get("chief.givenName").unwrap(), "Сергій");
        assert_eq!(values.get("main.givenName").unwrap(), "Іван");
        assert_eq!(values.get("main.patronymic").unwrap(), "Іванович");
        assert!(values.contains_key("deputyPpp.fullName"));
        assert!(is_supported_variable("начальник_пмм_посада"));
        assert_eq!(values.get("document.date").unwrap(), "03.08.2026 року");
    }

    #[test]
    fn formats_person_full_name_with_all_caps_surname() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        database::seed_test_personnel(&connection).unwrap();
        let person = selected_personnel(&connection, &[1]).unwrap().remove(0);
        assert_eq!(format_person_full_name(&person), "ВАСИЛЬОК Іван Аркадійович");
    }

    #[test]
    fn replaces_template_tokens_and_escapes_xml() {
        let mut values = HashMap::new();
        values.insert("soldier.fullName".to_string(), "ТЕСТ & Син".to_string());
        assert_eq!(replace_variables("<w:t>{{soldier.fullName}}</w:t>", &values), "<w:t>ТЕСТ &amp; Син</w:t>");
    }

    #[test]
    fn reads_a_variable_split_by_word_text_runs() {
        let content = "<w:r><w:t>{{main.</w:t></w:r><w:r><w:t>surname}}</w:t></w:r>";
        assert_eq!(extract_variables(content), vec!["main.surname"]);
    }

    #[test]
    fn replaces_a_variable_split_by_word_text_runs() {
        let content = "<w:r><w:t>{{</w:t></w:r><w:r><w:t>main</w:t></w:r><w:r><w:t>.givenName}}</w:t></w:r>";
        assert_eq!(replace_word_token(content, "{{main.givenName}}", "Іван"), "<w:r><w:t>Іван</w:t></w:r><w:r><w:t></w:t></w:r><w:r><w:t></w:t></w:r>");
    }

    #[test]
    fn preserves_ukrainian_letters_in_report_file_names() {
        assert_eq!(safe_name("Рапорт на відпустку"), "Рапорт на відпустку");
    }

    #[test]
    fn rejects_single_person_template_for_multiple_people() {
        let template_path = temporary_path("single.docx");
        write_test_template(&template_path, "<w:t>{{soldier.fullName}}</w:t>");
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        database::seed_test_personnel(&connection).unwrap();
        let result = validate(&connection, template_path.to_str().unwrap(), &[1, 2], None);
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|error| error.contains("однією особою")));
        fs::remove_file(template_path).unwrap();
    }

    #[test]
    fn uses_todays_date_when_template_does_not_provide_one() {
        let template_path = temporary_path("date.docx");
        write_test_template(&template_path, "<w:t>{{дата_рапорту}}</w:t>");
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        database::seed_test_personnel(&connection).unwrap();
        let result = validate(&connection, template_path.to_str().unwrap(), &[1], None);
        assert!(result.is_valid);
        let people = selected_personnel(&connection, &[1]).unwrap();
        let values = values_for(&people, &settings::defaults(), None).unwrap();
        assert_eq!(values.get("document.date").unwrap(), &Local::now().format("%d.%m.%Y року").to_string());
        fs::remove_file(template_path).unwrap();
    }

    #[test]
    fn creates_docx_in_a_new_report_folder() {
        let root = temporary_path("output");
        fs::create_dir_all(&root).unwrap();
        let template_path = root.join("test-template.docx");
        write_test_template(&template_path, "<w:t>{{військовий_1_піб}}</w:t>");
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        database::seed_test_personnel(&connection).unwrap();
        let report = generate(&connection, &root, GenerateReportRequest { template_path: template_path.to_string_lossy().to_string(), personnel_ids: vec![1], report_date: None }).unwrap();
        assert!(Path::new(&report.docx_path).is_file());
        let mut archive = ZipArchive::new(File::open(&report.docx_path).unwrap()).unwrap();
        let mut document = String::new();
        archive.by_name("word/document.xml").unwrap().read_to_string(&mut document).unwrap();
        assert!(document.contains("ВАСИЛЬОК Іван Аркадійович"));
        assert!(report.docx_path.contains("Згенеровані рапорти"));
        assert!(Path::new(&report.docx_path).file_name().unwrap().to_string_lossy().contains("ВАСИЛЬОК"));
        assert!(Path::new(&report.docx_path).file_name().unwrap().to_string_lossy().contains(&Local::now().format("%d.%m.%Y").to_string()));
        assert_eq!(Path::new(&report.folder_path).file_name().unwrap(), now_date_directory_name().as_str());
        fs::remove_dir_all(root).unwrap();
    }

    fn now_date_directory_name() -> String { Local::now().format("%d.%m.%Y").to_string() }
}
