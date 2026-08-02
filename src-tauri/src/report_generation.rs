use crate::personnel::{self, Personnel};
use chrono::Local;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs::{self, File}, io::{Read, Write}, path::Path};
use zip::{read::ZipArchive, write::{SimpleFileOptions, ZipWriter}, CompressionMethod};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateReportRequest { pub template_path: String, pub personnel_ids: Vec<i64> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateValidationResult { pub is_valid: bool, pub errors: Vec<String>, pub variables: Vec<String> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedReport { pub docx_path: String, pub folder_path: String }

pub fn validate(connection: &Connection, template_path: &str, personnel_ids: &[i64]) -> TemplateValidationResult {
    let mut errors = Vec::new();
    if personnel_ids.is_empty() { errors.push("Оберіть щонайменше одного військовослужбовця.".into()); }
    let variables = match read_variables(Path::new(template_path)) { Ok(variables) => variables, Err(error) => { errors.push(error); Vec::new() } };
    let allowed_prefix = if personnel_ids.len() == 1 { "soldier." } else { "soldiers[" };
    for variable in &variables {
        if variable.starts_with("soldier.") && allowed_prefix != "soldier." { errors.push(format!("Змінна «{{{{{variable}}}}}» призначена для шаблону з однією особою.")); }
        if variable.starts_with("soldiers[") && allowed_prefix != "soldiers[" { errors.push(format!("Змінна «{{{{{variable}}}}}» потребує вибору двох або більше осіб.")); }
        if !is_supported_variable(variable) { errors.push(format!("Невідома змінна «{{{{{variable}}}}}». Перевірте довідник мови шаблонів.")); }
    }
    if errors.is_empty() {
        let available = personnel::list(connection).unwrap_or_default();
        if personnel_ids.iter().any(|id| !available.iter().any(|person| person.id == *id)) { errors.push("Один або кілька обраних військовослужбовців більше не існують. Оновіть список.".into()); }
    }
    TemplateValidationResult { is_valid: errors.is_empty(), errors, variables }
}

pub fn generate(connection: &Connection, app_data_directory: &Path, request: GenerateReportRequest) -> Result<GeneratedReport, String> {
    let validation = validate(connection, &request.template_path, &request.personnel_ids);
    if !validation.is_valid { return Err(validation.errors.join(" ")); }
    let personnel = selected_personnel(connection, &request.personnel_ids)?;
    let values = values_for(&personnel);
    let now = Local::now();
    let date_directory = now.format("%Y-%m-%d").to_string();
    let template_name = safe_name(Path::new(&request.template_path).file_stem().and_then(|name| name.to_str()).unwrap_or("Рапорт"));
    let report_name = format!("{template_name} {}", now.format("%Y-%m-%d %H-%M-%S"));
    let reports_root = app_data_directory.join("Reports").join(date_directory);
    fs::create_dir_all(&reports_root).map_err(|_| "Не вдалося створити папку для рапортів.".to_string())?;
    let final_directory = reports_root.join(&report_name);
    let temporary_directory = reports_root.join(format!(".{report_name}.tmp"));
    fs::create_dir(&temporary_directory).map_err(|_| "Не вдалося підготувати тимчасову папку для рапорту.".to_string())?;
    let result = write_docx(Path::new(&request.template_path), &temporary_directory.join(format!("{template_name}.docx")), &values);
    match result {
        Ok(()) => { fs::rename(&temporary_directory, &final_directory).map_err(|_| "Не вдалося завершити створення рапорту.".to_string())?; Ok(GeneratedReport { docx_path: final_directory.join(format!("{template_name}.docx")).to_string_lossy().to_string(), folder_path: final_directory.to_string_lossy().to_string() }) }
        Err(error) => { let _ = fs::remove_dir_all(&temporary_directory); Err(error) }
    }
}

fn selected_personnel(connection: &Connection, ids: &[i64]) -> Result<Vec<Personnel>, String> { let all = personnel::list(connection)?; ids.iter().map(|id| all.iter().find(|person| person.id == *id).cloned().ok_or_else(|| "Не знайдено обраного військовослужбовця.".to_string())).collect() }

fn values_for(personnel: &[Personnel]) -> HashMap<String, String> {
    let mut values = HashMap::new();
    if personnel.len() == 1 {
        add_person_values(&mut values, "soldier", &personnel[0]);
    } else {
        for (index, person) in personnel.iter().enumerate() {
            add_person_values(&mut values, &format!("soldiers[{index}]"), person);
        }
    }
    values.extend([
        ("mainRank".to_string(), "майор".to_string()),
        ("mainName".to_string(), "Іваненко Іван Іванович".to_string()),
        ("mainPosition".to_string(), "Заступник командира з ППП".to_string()),
        ("mainSignature".to_string(), "".to_string()),
        ("commanderName".to_string(), "Петренко Петро Петрович".to_string()),
        ("chiefName".to_string(), "Сидоренко Сергій Сергійович".to_string()),
    ]);
    values
}

fn add_person_values(values: &mut HashMap<String, String>, prefix: &str, person: &Personnel) {
    for (key, value) in [("rank", &person.rank), ("surname", &person.surname), ("givenName", &person.given_name), ("patronymic", &person.patronymic), ("fullName", &person.full_name), ("position", &person.position), ("taxId", &person.tax_id), ("birthDate", &person.birth_date), ("educationLevel", &person.education_level), ("educationDetails", &person.education_details), ("armedForcesServiceStartDate", &person.armed_forces_service_start_date), ("positionAssignedDate", &person.position_assigned_date), ("positionAssignmentOrder", &person.position_assignment_order), ("militaryId", &person.military_id), ("assignedVehicleName", &person.assigned_vehicle_name), ("assignedVehicleRegistration", &person.assigned_vehicle_registration)] { values.insert(format!("{prefix}.{key}"), value.clone()); }
}

fn read_variables(path: &Path) -> Result<Vec<String>, String> { let file = File::open(path).map_err(|_| "Не вдалося відкрити шаблон. Перевірте шлях і доступ до файлу.".to_string())?; let mut archive = ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?; let mut variables = Vec::new(); for index in 0..archive.len() { let mut entry = archive.by_index(index).map_err(|_| "Не вдалося прочитати вміст шаблону.".to_string())?; if !entry.name().ends_with(".xml") { continue; } let mut content = String::new(); let _ = entry.read_to_string(&mut content); variables.extend(extract_variables(&content)); } variables.sort(); variables.dedup(); Ok(variables) }
fn extract_variables(content: &str) -> Vec<String> { let mut values = Vec::new(); let mut remaining = content; while let Some(start) = remaining.find("{{") { let after_start = &remaining[start + 2..]; if let Some(end) = after_start.find("}}") { values.push(after_start[..end].to_string()); remaining = &after_start[end + 2..]; } else { break; } } values }
fn is_supported_variable(variable: &str) -> bool { let person_fields = ["rank", "surname", "givenName", "patronymic", "fullName", "position", "taxId", "birthDate", "educationLevel", "educationDetails", "armedForcesServiceStartDate", "positionAssignedDate", "positionAssignmentOrder", "militaryId", "assignedVehicleName", "assignedVehicleRegistration"]; person_fields.iter().any(|field| variable == &format!("soldier.{field}") || (variable.starts_with("soldiers[") && variable.ends_with(&format!("].{field}")))) || ["mainRank", "mainName", "mainPosition", "mainSignature", "commanderName", "chiefName"].contains(&variable) }
fn write_docx(input: &Path, output: &Path, values: &HashMap<String, String>) -> Result<(), String> { let file = File::open(input).map_err(|_| "Не вдалося відкрити DOCX-шаблон.".to_string())?; let mut archive = ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?; let output_file = File::create(output).map_err(|_| "Не вдалося створити DOCX-файл.".to_string())?; let mut writer = ZipWriter::new(output_file); for index in 0..archive.len() { let mut entry = archive.by_index(index).map_err(|_| "Не вдалося прочитати файл шаблону.".to_string())?; let name = entry.name().to_owned(); let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated); if entry.is_dir() { writer.add_directory(name, options).map_err(|_| "Не вдалося сформувати DOCX.".to_string())?; continue; } let mut bytes = Vec::new(); entry.read_to_end(&mut bytes).map_err(|_| "Не вдалося прочитати частину шаблону.".to_string())?; writer.start_file(name.clone(), options).map_err(|_| "Не вдалося сформувати DOCX.".to_string())?; if name.ends_with(".xml") { let content = String::from_utf8_lossy(&bytes); writer.write_all(replace_variables(&content, values).as_bytes()).map_err(|_| "Не вдалося записати DOCX.".to_string())?; } else { writer.write_all(&bytes).map_err(|_| "Не вдалося записати DOCX.".to_string())?; } } writer.finish().map_err(|_| "Не вдалося завершити DOCX.".to_string())?; Ok(()) }
fn replace_variables(content: &str, values: &HashMap<String, String>) -> String { values.iter().fold(content.to_string(), |result, (key, value)| result.replace(&format!("{{{{{key}}}}}"), &escape_xml(value))) }
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
        let result = validate(&connection, "/missing.docx", &[1]);
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|error| error.contains("Не вдалося відкрити шаблон")));
    }

    #[test]
    fn uses_indexed_values_only_for_multiple_people() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let people = selected_personnel(&connection, &[1, 2]).unwrap();
        let values = values_for(&people);
        assert!(values.contains_key("soldiers[0].fullName"));
        assert!(values.contains_key("soldiers[1].fullName"));
        assert!(!values.contains_key("soldier.fullName"));
    }

    #[test]
    fn replaces_template_tokens_and_escapes_xml() {
        let mut values = HashMap::new();
        values.insert("soldier.fullName".to_string(), "ТЕСТ & Син".to_string());
        assert_eq!(replace_variables("<w:t>{{soldier.fullName}}</w:t>", &values), "<w:t>ТЕСТ &amp; Син</w:t>");
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
        let result = validate(&connection, template_path.to_str().unwrap(), &[1, 2]);
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|error| error.contains("однією особою")));
        fs::remove_file(template_path).unwrap();
    }

    #[test]
    fn creates_docx_in_a_new_report_folder() {
        let root = temporary_path("output");
        fs::create_dir_all(&root).unwrap();
        let template_path = root.join("test-template.docx");
        write_test_template(&template_path, "<w:t>{{soldier.fullName}}</w:t>");
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let report = generate(&connection, &root, GenerateReportRequest { template_path: template_path.to_string_lossy().to_string(), personnel_ids: vec![1] }).unwrap();
        assert!(Path::new(&report.docx_path).is_file());
        let mut archive = ZipArchive::new(File::open(&report.docx_path).unwrap()).unwrap();
        let mut document = String::new();
        archive.by_name("word/document.xml").unwrap().read_to_string(&mut document).unwrap();
        assert!(document.contains("ВАСИЛЬОК Іван Аркадійович"));
        fs::remove_dir_all(root).unwrap();
    }
}
