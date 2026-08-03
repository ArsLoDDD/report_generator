use crate::{personnel::{self, Personnel}, settings, SIGNATURES_DIRECTORY_NAME, REPORTS_DIRECTORY_NAME};
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
    if inspection.variables.iter().any(|variable| variable == "document.date") && report_date.filter(|date| !date.is_empty()).is_none() { errors.push("Оберіть дату для змінної «{{document.date}}».".into()); }
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
    let signature_image = if validation.variables.iter().any(|variable| variable == "mainSignature" || variable == "main.signature") {
        let signature_name = settings.main_signer.signature_file_name.as_deref().unwrap_or("main.png");
        let signature_path = app_data_directory.join(SIGNATURES_DIRECTORY_NAME).join(signature_name);
        Some(fs::read(&signature_path).map_err(|_| format!("Не вдалося знайти підпис «{signature_name}» у папці «Підписи». Додайте PNG-файл або змініть його назву в налаштуваннях."))?)
    } else { None };
    let now = Local::now();
    let date_directory = now.format("%d.%m.%Y").to_string();
    let template_name = safe_name(Path::new(&request.template_path).file_stem().and_then(|name| name.to_str()).unwrap_or("Рапорт"));
    let surnames = personnel.iter().map(|person| safe_name(&person.surname)).collect::<Vec<_>>().join(", ");
    let report_name = format!("{template_name} {surnames}");
    let reports_root = app_data_directory.join(REPORTS_DIRECTORY_NAME).join(date_directory);
    fs::create_dir_all(&reports_root).map_err(|_| "Не вдалося створити папку для рапортів.".to_string())?;
    let file_name = available_file_name(&reports_root, &report_name, now.format("%H-%M-%S").to_string());
    let final_path = reports_root.join(&file_name);
    let temporary_path = reports_root.join(format!(".{file_name}.tmp"));
    let result = write_docx(Path::new(&request.template_path), &temporary_path, &values, signature_image.as_deref());
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
    if personnel.len() == 1 {
        add_person_values(&mut values, "soldier", &personnel[0]);
    } else {
        for (index, person) in personnel.iter().enumerate() {
            add_person_values(&mut values, &format!("soldiers[{index}]"), person);
        }
    }
    values.extend([
        ("main.rank".to_string(), settings.main_signer.rank.clone()),
        ("main.surname".to_string(), main_name.0.clone()),
        ("main.givenName".to_string(), main_name.1.clone()),
        ("main.patronymic".to_string(), main_name.2.clone()),
        ("main.fullName".to_string(), [main_name.0.clone(), main_name.1.clone(), main_name.2.clone()].into_iter().filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" ")),
        ("main.position".to_string(), settings.main_signer.position.clone()),
        ("main.signature".to_string(), "".to_string()),
        ("mainRank".to_string(), settings.main_signer.rank.clone()),
        ("mainName".to_string(), settings.main_signer.full_name.clone()),
        ("mainPosition".to_string(), settings.main_signer.position.clone()),
        ("mainSignature".to_string(), "".to_string()),
        ("commanderName".to_string(), settings.commander.full_name.clone()),
        ("chiefName".to_string(), settings.chief.full_name.clone()),
    ]);
    if let Some(value) = report_date.filter(|date| !date.is_empty()) {
        let date = NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| "Не вдалося прочитати дату рапорту.".to_string())?;
        values.insert("document.date".to_string(), date.format("%d.%m.%Y року").to_string());
    }
    Ok(values)
}

fn add_person_values(values: &mut HashMap<String, String>, prefix: &str, person: &Personnel) {
    let full_name = format_person_full_name(person);
    for (key, value) in [("rank", &person.rank), ("surname", &person.surname), ("givenName", &person.given_name), ("patronymic", &person.patronymic), ("fullName", &full_name), ("position", &person.position), ("taxId", &person.tax_id), ("birthDate", &person.birth_date), ("educationLevel", &person.education_level), ("educationDetails", &person.education_details), ("armedForcesServiceStartDate", &person.armed_forces_service_start_date), ("positionAssignedDate", &person.position_assigned_date), ("positionAssignmentOrder", &person.position_assignment_order), ("militaryId", &person.military_id), ("assignedVehicleName", &person.assigned_vehicle_name), ("assignedVehicleRegistration", &person.assigned_vehicle_registration)] { values.insert(format!("{prefix}.{key}"), value.clone()); }
}

fn format_person_full_name(person: &Personnel) -> String {
    [name_case(&person.surname), name_case(&person.given_name), name_case(&person.patronymic)].into_iter().filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" ")
}

fn signer_name_parts(full_name: &str) -> (String, String, String) {
    let parts = full_name.split_whitespace().map(name_case).collect::<Vec<_>>();
    (parts.first().cloned().unwrap_or_default(), parts.get(1).cloned().unwrap_or_default(), parts.get(2..).unwrap_or_default().join(" "))
}

fn name_case(value: &str) -> String {
    value.split_whitespace().map(|word| word.split('-').map(|part| {
        let mut characters = part.chars();
        let Some(first) = characters.next() else { return String::new(); };
        first.to_uppercase().collect::<String>() + &characters.flat_map(char::to_lowercase).collect::<String>()
    }).collect::<Vec<_>>().join("-")).collect::<Vec<_>>().join(" ")
}

fn read_variables(path: &Path) -> Result<Vec<String>, String> { let file = File::open(path).map_err(|_| "Не вдалося відкрити шаблон. Перевірте шлях і доступ до файлу.".to_string())?; let mut archive = ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?; let mut variables = Vec::new(); for index in 0..archive.len() { let mut entry = archive.by_index(index).map_err(|_| "Не вдалося прочитати вміст шаблону.".to_string())?; if !entry.name().ends_with(".xml") { continue; } let mut content = String::new(); let _ = entry.read_to_string(&mut content); variables.extend(extract_variables(&content)); } variables.sort(); variables.dedup(); Ok(variables) }
fn extract_variables(content: &str) -> Vec<String> { let mut values = Vec::new(); let mut remaining = content; while let Some(start) = remaining.find("{{") { let after_start = &remaining[start + 2..]; if let Some(end) = after_start.find("}}") { values.push(after_start[..end].to_string()); remaining = &after_start[end + 2..]; } else { break; } } values }
fn is_supported_variable(variable: &str) -> bool { let person_fields = ["rank", "surname", "givenName", "patronymic", "fullName", "position", "taxId", "birthDate", "educationLevel", "educationDetails", "armedForcesServiceStartDate", "positionAssignedDate", "positionAssignmentOrder", "militaryId", "assignedVehicleName", "assignedVehicleRegistration"]; person_fields.iter().any(|field| variable == &format!("soldier.{field}") || (variable.starts_with("soldiers[") && variable.ends_with(&format!("].{field}")))) || ["main.rank", "main.surname", "main.givenName", "main.patronymic", "main.fullName", "main.position", "main.signature", "document.date", "mainRank", "mainName", "mainPosition", "mainSignature", "commanderName", "chiefName"].contains(&variable) }
fn write_docx(input: &Path, output: &Path, values: &HashMap<String, String>, signature_image: Option<&[u8]>) -> Result<(), String> {
    let file = File::open(input).map_err(|_| "Не вдалося відкрити DOCX-шаблон.".to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|_| "Файл не є коректним DOCX-шаблоном.".to_string())?;
    let output_file = File::create(output).map_err(|_| "Не вдалося створити DOCX-файл.".to_string())?;
    let mut writer = ZipWriter::new(output_file);
    let mut wrote_relationships = false;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|_| "Не вдалося прочитати файл шаблону.".to_string())?;
        let name = entry.name().to_owned();
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        if entry.is_dir() { writer.add_directory(name, options).map_err(|_| "Не вдалося сформувати DOCX.".to_string())?; continue; }
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).map_err(|_| "Не вдалося прочитати частину шаблону.".to_string())?;
        writer.start_file(name.clone(), options).map_err(|_| "Не вдалося сформувати DOCX.".to_string())?;
        let content = String::from_utf8_lossy(&bytes);
        if name == "word/document.xml" { writer.write_all(replace_signature_token(&replace_variables(&content, values), signature_image.is_some()).as_bytes()).map_err(|_| "Не вдалося записати DOCX.".to_string())?; }
        else if name == "word/_rels/document.xml.rels" && signature_image.is_some() { wrote_relationships = true; writer.write_all(add_signature_relationship(&content).as_bytes()).map_err(|_| "Не вдалося записати DOCX.".to_string())?; }
        else if name == "[Content_Types].xml" && signature_image.is_some() { writer.write_all(add_png_content_type(&content).as_bytes()).map_err(|_| "Не вдалося записати DOCX.".to_string())?; }
        else { writer.write_all(&bytes).map_err(|_| "Не вдалося записати DOCX.".to_string())?; }
    }
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    if let Some(image) = signature_image {
        if !wrote_relationships { return Err("DOCX-шаблон не містить зв’язків документа для вставлення підпису.".into()); }
        writer.start_file("word/media/main-signature.png", options).map_err(|_| "Не вдалося додати підпис до DOCX.".to_string())?;
        writer.write_all(image).map_err(|_| "Не вдалося додати підпис до DOCX.".to_string())?;
    }
    writer.finish().map_err(|_| "Не вдалося завершити DOCX.".to_string())?;
    Ok(())
}

fn replace_signature_token(content: &str, has_signature: bool) -> String {
    if !has_signature { return content.to_string(); }
    let drawing = r#"<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1371600" cy="457200"/><wp:docPr id="101" name="Підпис основного підписанта"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="main-signature.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdMainSignature"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1371600" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>"#;
    content.replace("<w:t>{{mainSignature}}</w:t>", drawing).replace("<w:t>{{main.signature}}</w:t>", drawing)
}
fn add_signature_relationship(content: &str) -> String { content.replace("</Relationships>", "<Relationship Id=\"rIdMainSignature\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/main-signature.png\"/></Relationships>") }
fn add_png_content_type(content: &str) -> String { if content.contains("Extension=\"png\"") { content.to_string() } else { content.replace("</Types>", "<Default Extension=\"png\" ContentType=\"image/png\"/></Types>") } }
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
        let result = validate(&connection, "/missing.docx", &[1], None);
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|error| error.contains("Не вдалося відкрити шаблон")));
    }

    #[test]
    fn uses_indexed_values_only_for_multiple_people() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
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
        let people = selected_personnel(&connection, &[1]).unwrap();
        let values = values_for(&people, &settings::defaults(), Some("2026-08-03")).unwrap();
        assert_eq!(values.get("main.fullName").unwrap(), "Іваненко Іван Іванович");
        assert_eq!(values.get("main.surname").unwrap(), "Іваненко");
        assert_eq!(values.get("main.givenName").unwrap(), "Іван");
        assert_eq!(values.get("main.patronymic").unwrap(), "Іванович");
        assert_eq!(values.get("document.date").unwrap(), "03.08.2026 року");
    }

    #[test]
    fn formats_person_full_name_without_all_caps_surname() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let person = selected_personnel(&connection, &[1]).unwrap().remove(0);
        assert_eq!(format_person_full_name(&person), "Васильок Іван Аркадійович");
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
        let result = validate(&connection, template_path.to_str().unwrap(), &[1, 2], None);
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|error| error.contains("однією особою")));
        fs::remove_file(template_path).unwrap();
    }

    #[test]
    fn requires_a_date_when_template_uses_document_date() {
        let template_path = temporary_path("date.docx");
        write_test_template(&template_path, "<w:t>{{document.date}}</w:t>");
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let result = validate(&connection, template_path.to_str().unwrap(), &[1], None);
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|error| error.contains("Оберіть дату")));
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
        let report = generate(&connection, &root, GenerateReportRequest { template_path: template_path.to_string_lossy().to_string(), personnel_ids: vec![1], report_date: None }).unwrap();
        assert!(Path::new(&report.docx_path).is_file());
        let mut archive = ZipArchive::new(File::open(&report.docx_path).unwrap()).unwrap();
        let mut document = String::new();
        archive.by_name("word/document.xml").unwrap().read_to_string(&mut document).unwrap();
        assert!(document.contains("Васильок Іван Аркадійович"));
        assert!(report.docx_path.contains("Згенеровані рапорти"));
        assert!(Path::new(&report.docx_path).file_name().unwrap().to_string_lossy().contains("ВАСИЛЬОК"));
        assert_eq!(Path::new(&report.folder_path).file_name().unwrap(), now_date_directory_name().as_str());
        fs::remove_dir_all(root).unwrap();
    }

    fn now_date_directory_name() -> String { Local::now().format("%d.%m.%Y").to_string() }
}
