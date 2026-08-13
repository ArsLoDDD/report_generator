mod database;
mod personnel;
mod report_generation;
mod settings;
mod xlsx;

use chrono::{DateTime, Local};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use zip::{
    read::ZipArchive,
    write::{SimpleFileOptions, ZipWriter},
    CompressionMethod,
};

struct DatabaseState {
    connection: Connection,
    path: PathBuf,
    is_persistent: bool,
}

struct AppState(Mutex<DatabaseState>, Vec<StartupWarning>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupWarning {
    code: String,
    title: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TemplateFile {
    name: String,
    description: String,
    changed: String,
    status: String,
    variables: u16,
    source_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedReportFile {
    name: String,
    template: String,
    generated_at: String,
    docx_path: String,
    folder_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedReportsPage {
    items: Vec<GeneratedReportFile>,
    total_count: u64,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DataArchiveOptions {
    database: bool,
    settings: bool,
    custom_variables: bool,
    templates: bool,
    reports: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TemplatesPage {
    items: Vec<TemplateFile>,
    total_count: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Vehicle {
    id: i64,
    name: String,
    registration_number: String,
    status: String,
    personnel_id: Option<i64>,
    driver_name: Option<String>,
    crew_id: Option<i64>,
    crew_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Crew {
    id: i64,
    name: String,
    platoon: String,
    position_name: String,
    reconnaissance_area: String,
    member_count: i64,
    members: Vec<CrewMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CrewMember {
    personnel_id: i64,
    full_name: String,
    rank: String,
    position: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CrewDraft {
    name: String,
    platoon: String,
    position_name: String,
    reconnaissance_area: String,
    #[serde(default)]
    member_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Equipment {
    id: i64,
    category: String,
    name: String,
    inventory_number: String,
    status: String,
    crew_id: Option<i64>,
    crew_name: Option<String>,
    personnel_id: Option<i64>,
    holder_name: Option<String>,
    notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EquipmentDraft {
    category: String,
    name: String,
    inventory_number: String,
    status: String,
    crew_id: Option<i64>,
    personnel_id: Option<i64>,
    notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Incident {
    id: i64,
    incident_type: String,
    occurred_at: String,
    crew_id: Option<i64>,
    crew_name: Option<String>,
    equipment_id: Option<i64>,
    equipment_name: Option<String>,
    position_name: String,
    reconnaissance_area: String,
    crew_snapshot: String,
    vehicle_name: String,
    description: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IncidentDraft {
    incident_type: String,
    occurred_at: String,
    crew_id: Option<i64>,
    equipment_id: Option<i64>,
    position_name: String,
    reconnaissance_area: String,
    description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TemplateAnalysisProposal {
    value: String,
    token: String,
    label: String,
    category: String,
    occurrences: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TemplateAnalysis {
    source_name: String,
    text_preview: String,
    paragraphs: Vec<report_generation::DocxParagraphPreview>,
    proposals: Vec<TemplateAnalysisProposal>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TemplateAnalysisReplacement {
    value: String,
    token: String,
    #[serde(default)]
    replacement: Option<String>,
}

pub const DATABASE_FILE_NAME: &str = "особовий_склад.db";
pub const LEGACY_DATABASE_DIRECTORY_NAME: &str = "База даних";
pub const TEMPLATES_DIRECTORY_NAME: &str = "Шаблони";
pub const REPORTS_DIRECTORY_NAME: &str = "Згенеровані рапорти";
pub const BACKUPS_DIRECTORY_NAME: &str = "Резервні копії";
pub const CONFIG_DIRECTORY_NAME: &str = "Налаштування";
pub const CUSTOM_VARIABLES_FILE_NAME: &str = "custom_variables.json";

fn application_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let _ = app;
    #[cfg(debug_assertions)]
    {
        let project_root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or_else(|| "Не вдалося визначити кореневу папку проєкту.".to_string())?
            .to_path_buf();
        fs::create_dir_all(&project_root)
            .map_err(|_| "Не вдалося створити папку даних програми.".to_string())?;
        return Ok(project_root);
    }

    #[cfg(not(debug_assertions))]
    executable_root()
}

fn migrate_executable_database(root: &Path) -> Result<(), String> {
    let executable_root = executable_root()?;
    let destination = root.join(DATABASE_FILE_NAME);
    if destination.exists() {
        return Ok(());
    }
    let candidates = [
        executable_root.join(DATABASE_FILE_NAME),
        executable_root
            .join(LEGACY_DATABASE_DIRECTORY_NAME)
            .join(DATABASE_FILE_NAME),
    ];
    if let Some(source) = candidates.iter().find(|path| path.exists()) {
        fs::copy(source, &destination).map_err(|_| {
            "Не вдалося перенести базу даних у системну папку даних програми.".to_string()
        })?;
    }
    Ok(())
}

fn executable_root() -> Result<PathBuf, String> {
    let executable = std::env::current_exe()
        .map_err(|_| "Не вдалося визначити розташування програми.".to_string())?;
    let directory = executable
        .parent()
        .ok_or_else(|| "Не вдалося визначити папку програми.".to_string())?
        .to_path_buf();
    fs::create_dir_all(&directory)
        .map_err(|_| "Не вдалося створити папку програми.".to_string())?;
    Ok(directory)
}

fn ensure_application_structure(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = application_root(app)?;
    for directory in [
        TEMPLATES_DIRECTORY_NAME,
        REPORTS_DIRECTORY_NAME,
        BACKUPS_DIRECTORY_NAME,
    ] {
        fs::create_dir_all(root.join(directory))
            .map_err(|_| format!("Не вдалося створити папку «{directory}»."))?;
    }
    let vehicle_template = root
        .join(TEMPLATES_DIRECTORY_NAME)
        .join("Рапорт на автомобіль.docx");
    if !vehicle_template.exists() {
        create_vehicle_report_template(&vehicle_template)?;
    }
    create_operational_report_templates(&root.join(TEMPLATES_DIRECTORY_NAME))?;
    settings::load(&root)?;
    Ok(root)
}

fn create_operational_report_templates(directory: &Path) -> Result<(), String> {
    let templates = [
        ("Контрольний рапорт — екіпаж.docx", "Контрольний рапорт щодо екіпажу {{екіпаж_назва}}", "Взвод: {{екіпаж_взвод}}. Позиція: {{екіпаж_позиція}}. Район розвідки: {{екіпаж_район_розвідки}}. Склад: {{екіпаж_склад}}. Автомобілі: {{екіпаж_автомобілі}}."),
        ("Контрольний рапорт — генератор.docx", "Контрольний рапорт щодо генератора", "Генератор: {{генератор_назва}}. Інвентарний номер: {{генератор_інвентарний_номер}}. Стан: {{генератор_статус}}. Примітка: {{генератор_примітка}}."),
        ("Контрольний рапорт — БпЛА.docx", "Контрольний рапорт щодо БпЛА", "БпЛА: {{бпла_назва}}. Інвентарний номер: {{бпла_інвентарний_номер}}. Стан: {{бпла_статус}}. Примітка: {{бпла_примітка}}."),
        ("Контрольний рапорт — зв’язок.docx", "Контрольний рапорт щодо засобу зв’язку", "Засіб зв’язку: {{звʼязок_назва}}. Інвентарний номер: {{звʼязок_інвентарний_номер}}. Стан: {{звʼязок_статус}}. Примітка: {{звʼязок_примітка}}."),
        ("Контрольний рапорт — зброя та БК.docx", "Контрольний рапорт щодо зброї та БК", "Майно: {{зброя_та_бк_назва}}. Інвентарний номер: {{зброя_та_бк_інвентарний_номер}}. Стан: {{зброя_та_бк_статус}}. Примітка: {{зброя_та_бк_примітка}}."),
        ("Контрольний рапорт — військовослужбовець.docx", "Контрольний рапорт", "Доповідаю щодо {{військовий_1_звання:родовий}} {{військовий_1_піб:родовий}}. Посада: {{військовий_1_посада}}. Закріплений автомобіль: {{військовий_1_автомобіль_1_назва}} {{військовий_1_автомобіль_1_номер}}. Дата: {{дата_рапорту}}. Підписант: {{основний_підписант_посада}}, {{основний_підписант_звання}} {{основний_підписант_піб}}."),
    ];
    for (name, title, body) in templates {
        let path = directory.join(name);
        if path.exists() { continue; }
        create_simple_report_template(&path, title, body)?;
    }
    Ok(())
}

fn create_simple_report_template(path: &Path, title: &str, body: &str) -> Result<(), String> {
    let file = fs::File::create(path).map_err(|_| "Не вдалося створити контрольний шаблон.".to_string())?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let document = format!(r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{title}</w:t></w:r></w:p><w:p><w:r><w:t>{body}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>"#);
    for (name, contents) in [
        ("[Content_Types].xml", r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#),
        ("_rels/.rels", r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#),
        ("word/document.xml", document.as_str()),
    ] {
        archive.start_file(name, options).map_err(|_| "Не вдалося сформувати контрольний шаблон.".to_string())?;
        archive.write_all(contents.as_bytes()).map_err(|_| "Не вдалося записати контрольний шаблон.".to_string())?;
    }
    archive.finish().map_err(|_| "Не вдалося завершити контрольний шаблон.".to_string())?;
    Ok(())
}

fn create_vehicle_report_template(path: &Path) -> Result<(), String> {
    let file = fs::File::create(path)
        .map_err(|_| "Не вдалося створити шаблон рапорту на автомобіль.".to_string())?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, contents) in [
        (
            "[Content_Types].xml",
            r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#,
        ),
        (
            "_rels/.rels",
            r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#,
        ),
        (
            "word/document.xml",
            r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>РАПОРТ</w:t></w:r></w:p><w:p><w:r><w:t>Доповідаю про автомобіль {{автомобіль_назва}}, державний номер {{автомобіль_номер}}.</w:t></w:r></w:p><w:p><w:r><w:t>Технічний стан: {{автомобіль_статус}}.</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>"#,
        ),
    ] {
        archive
            .start_file(name, options)
            .map_err(|_| "Не вдалося сформувати шаблон автомобіля.".to_string())?;
        archive
            .write_all(contents.as_bytes())
            .map_err(|_| "Не вдалося записати шаблон автомобіля.".to_string())?;
    }
    archive
        .finish()
        .map_err(|_| "Не вдалося завершити шаблон автомобіля.".to_string())?;
    Ok(())
}

fn templates_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_application_structure(app)?.join(TEMPLATES_DIRECTORY_NAME))
}

fn template_analysis_value(
    proposals: &mut Vec<TemplateAnalysisProposal>,
    text: &str,
    value: &str,
    token: &str,
    label: &str,
    category: &str,
) {
    let value = value.trim();
    let occurrences = whole_text_match_count(text, value);
    if value.is_empty() || occurrences == 0 || proposals.iter().any(|item| item.value == value && item.token == token) {
        return;
    }
    proposals.push(TemplateAnalysisProposal {
        value: value.into(),
        token: token.into(),
        label: label.into(),
        category: category.into(),
        occurrences: occurrences as u32,
    });
}

/// Counts only complete values. It deliberately does not treat `Арсен` as a
/// match inside `Арсеній`, nor any other shorter value inside a longer word.
fn whole_text_match_count(text: &str, value: &str) -> usize {
    let value = value.trim();
    if value.is_empty() {
        return 0;
    }
    let haystack = text.to_lowercase();
    let needle = value.to_lowercase();
    let mut count = 0;
    let mut from = 0;
    while let Some(relative) = haystack[from..].find(&needle) {
        let start = from + relative;
        let end = start + needle.len();
        let left = haystack[..start].chars().next_back();
        let right = haystack[end..].chars().next();
        let starts_with_word = needle.chars().next().is_some_and(char::is_alphanumeric);
        let ends_with_word = needle.chars().next_back().is_some_and(char::is_alphanumeric);
        if (!starts_with_word || !left.is_some_and(char::is_alphanumeric))
            && (!ends_with_word || !right.is_some_and(char::is_alphanumeric))
        {
            count += 1;
        }
        from = end;
    }
    count
}

fn detected_document_proposals(proposals: &mut Vec<TemplateAnalysisProposal>, text: &str) {
    let words = text.split_whitespace().collect::<Vec<_>>();
    let mut date_index = 0;
    let mut order_index = 0;
    let mut unit_index = 0;
    let mut detected_units = Vec::new();
    for (index, raw) in words.iter().enumerate() {
        let value = raw.trim_matches(|character: char| {
            matches!(character, ',' | ';' | ':' | '.' | '(' | ')' | '«' | '»')
        });
        let digits = value
            .chars()
            .filter(|character| character.is_ascii_digit())
            .count();
        let separators = value
            .chars()
            .filter(|character| matches!(character, '.' | '/'))
            .count();
        if digits == 8 && separators == 2 {
            date_index += 1;
            let token = format!("дата_рапорту_{date_index}");
            template_analysis_value(
                proposals,
                text,
                value,
                &token,
                &format!("Дата в документі {date_index}"),
                "Параметри документа",
            );
        }
        if value.starts_with('№') && value.len() > 1 {
            order_index += 1;
            let token = format!("номер_наказу_{order_index}");
            template_analysis_value(
                proposals,
                text,
                value,
                &token,
                &format!("Номер документа {order_index}"),
                "Параметри документа",
            );
        }
        let normalized = value.trim_matches(|character: char| !character.is_alphanumeric());
        let compact_unit = if normalized.chars().count() == 5
            && matches!(normalized.chars().next(), Some('А' | 'а' | 'A' | 'a'))
            && normalized.chars().skip(1).all(|character| character.is_ascii_digit())
        {
            Some((normalized.to_string(), normalized.chars().skip(1).collect::<String>()))
        } else if matches!(normalized, "А" | "а" | "A" | "a") {
            words.get(index + 1).and_then(|next| {
                let digits = next.trim_matches(|character: char| !character.is_ascii_digit());
                (digits.len() == 4 && digits.chars().all(|character| character.is_ascii_digit()))
                    .then(|| (format!("{normalized} {digits}"), digits.to_string()))
            })
        } else {
            None
        };
        if let Some((unit, digits)) = compact_unit {
            let key = format!("А{digits}");
            if detected_units.iter().any(|existing: &String| existing == &key) {
                continue;
            }
            detected_units.push(key);
            unit_index += 1;
            let token = format!("військова_частина_{unit_index}");
            template_analysis_value(
                proposals,
                text,
                &unit,
                &token,
                &format!("Військова частина {unit_index}"),
                "Параметри документа",
            );
        }
    }
    for (marker, token, label) in [
        ("екіпаж ", "екіпаж_1", "Екіпаж у документі"),
        ("позиція ", "назва_позиції_1", "Назва позиції"),
        ("позиції ", "назва_позиції_1", "Назва позиції"),
    ] {
        if let Some(value) = document_phrase_after(text, marker) {
            template_analysis_value(proposals, text, &value, token, label, "Параметри документа");
        }
    }
    for marker in ["н.п.", "н. п.", "м.", "с.", "смт."] {
        if let Some(value) = document_settlement_after(text, marker) {
            template_analysis_value(
                proposals,
                text,
                &value,
                "населений_пункт_1",
                "Населений пункт",
                "Параметри документа",
            );
        }
    }
    detected_document_person_proposals(proposals, text);
}

fn document_settlement_after(text: &str, marker: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let start = lower.find(marker)? + marker.len();
    let words = text[start..]
        .trim_start_matches(|character: char| character.is_whitespace() || character == '.')
        .split_whitespace()
        .map(|word| word.trim_matches(|character: char| !character.is_alphabetic() && character != '-' && character != '\''))
        .take_while(|word| !matches!(word.to_lowercase().as_str(), "в" | "у" | "на" | "смузі" | "районі" | "та" | "з"))
        .take(4)
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>();
    (!words.is_empty()).then(|| words.join(" "))
}

/// Finds a name written in the report itself. This is intentionally separate
/// from the personnel database: a historical report may contain a person who
/// was renamed, removed, or has not yet been entered into the application.
fn detected_document_person_proposals(proposals: &mut Vec<TemplateAnalysisProposal>, text: &str) {
    let words = text
        .split_whitespace()
        .filter_map(|word| {
            let value = word.trim_matches(|character: char| !character.is_alphabetic() && character != '\'');
            (value.chars().count() >= 2).then(|| value.to_string())
        })
        .collect::<Vec<_>>();
    let ranks = [
        "солдат", "матрос", "сержант", "старший сержант", "головний сержант",
        "молодший лейтенант", "лейтенант", "старший лейтенант", "капітан", "майор",
        "підполковник", "полковник", "генерал",
    ];
    for (index, triple) in words.windows(3).enumerate() {
        let first = &triple[0];
        let second = &triple[1];
        let third = &triple[2];
        let first_title = first.chars().next().is_some_and(char::is_uppercase)
            && !first.chars().skip(1).any(char::is_uppercase);
        let second_title = second.chars().next().is_some_and(char::is_uppercase)
            && !second.chars().skip(1).any(char::is_uppercase);
        let third_title = third.chars().next().is_some_and(char::is_uppercase)
            && !third.chars().skip(1).any(char::is_uppercase);
        let first_upper = first.chars().any(char::is_alphabetic)
            && first.chars().filter(|character| character.is_alphabetic()).all(char::is_uppercase);
        let third_upper = third.chars().any(char::is_alphabetic)
            && third.chars().filter(|character| character.is_alphabetic()).all(char::is_uppercase);
        let before = words[index.saturating_sub(3)..index].join(" ").to_lowercase();
        let has_rank_context = ranks.iter().any(|rank| before.ends_with(rank));
        if !has_rank_context {
            continue;
        }
        let (given_name, patronymic, surname, full_name) = if first_title && second_title && third_upper {
            (first.as_str(), second.as_str(), third.as_str(), format!("{first} {second} {third}"))
        } else if first_upper && second_title && third_title {
            (second.as_str(), third.as_str(), first.as_str(), format!("{first} {second} {third}"))
        } else {
            continue;
        };
        template_analysis_value(
            proposals,
            text,
            &full_name,
            "військовий_1_піб",
            "ПІБ, знайдений у документі",
            "Військовослужбовець",
        );
        template_analysis_value(
            proposals,
            text,
            surname,
            "військовий_1_прізвище",
            "Прізвище, знайдене у документі",
            "Військовослужбовець",
        );
        template_analysis_value(
            proposals,
            text,
            given_name,
            "військовий_1_імя",
            "Ім’я, знайдене у документі",
            "Військовослужбовець",
        );
        template_analysis_value(
            proposals,
            text,
            patronymic,
            "військовий_1_по_батькові",
            "По батькові, знайдене у документі",
            "Військовослужбовець",
        );
    }
}

fn document_signature_position(text: &str, name_in_document: &str, rank: &str) -> Option<String> {
    let name_offset = text.to_lowercase().find(&name_in_document.to_lowercase())?;
    let before_name = &text[..name_offset];
    let mut lines = before_name.lines().rev().map(str::trim).filter(|line| !line.is_empty());
    let last_line = lines.next()?;
    // A DOCX signature block is often a single paragraph: "Посада звання ПІБ".
    // In that case take the text before the rank, rather than the whole paragraph.
    let position = if !rank.trim().is_empty() && last_line.eq_ignore_ascii_case(rank.trim()) {
        lines.next()?
    } else if !rank.trim().is_empty() {
        last_line
            .to_lowercase()
            .rfind(&rank.trim().to_lowercase())
            .map(|rank_offset| last_line[..rank_offset].trim())
            .unwrap_or(last_line)
    } else {
        last_line
    };
    let position = position.trim_matches(|character: char| character == ',' || character == ';');
    (position.chars().count() >= 8).then(|| position.to_string())
}

#[derive(Clone)]
struct SignerNameParts {
    surname: String,
    given_name: String,
    patronymic: Option<String>,
    full_name: String,
}

fn is_uppercase_word(value: &str) -> bool {
    value.chars().any(char::is_alphabetic)
        && value.chars().filter(|character| character.is_alphabetic()).all(char::is_uppercase)
}

fn signer_name_parts(full_name: &str) -> Option<SignerNameParts> {
    let parts = full_name.split_whitespace().map(str::to_string).collect::<Vec<_>>();
    if !(2..=3).contains(&parts.len()) {
        return None;
    }
    let surname_index = parts.iter().position(|part| is_uppercase_word(part)).unwrap_or(0);
    let (surname, given_name, patronymic) = match (parts.len(), surname_index) {
        (3, 2) => (parts[2].clone(), parts[0].clone(), Some(parts[1].clone())),
        (3, _) => (parts[0].clone(), parts[1].clone(), Some(parts[2].clone())),
        (2, 0) => (parts[0].clone(), parts[1].clone(), None),
        (2, _) => (parts[1].clone(), parts[0].clone(), None),
        _ => return None,
    };
    Some(SignerNameParts { surname, given_name, patronymic, full_name: parts.join(" ") })
}

struct SignerNameInDocument {
    full_name: String,
    surname: String,
    given_name: String,
    patronymic: Option<String>,
    has_full_name: bool,
}

fn normalized_name(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_alphabetic())
        .map(|character| match character.to_lowercase().next().unwrap_or(character) {
            // Ukrainian documents sometimes use the orthographic variants і/и
            // in a personal name. The original document spelling is retained
            // in the replacement; this normalization is only for recognition.
            'і' => 'и',
            character => character,
        })
        .collect()
}

fn name_edit_distance(left: &str, right: &str) -> usize {
    let left = left.chars().collect::<Vec<_>>();
    let right = right.chars().collect::<Vec<_>>();
    let mut row = (0..=right.len()).collect::<Vec<_>>();
    for (left_index, left_character) in left.iter().enumerate() {
        let mut next = vec![left_index + 1];
        for (right_index, right_character) in right.iter().enumerate() {
            next.push(std::cmp::min(
                std::cmp::min(next[right_index] + 1, row[right_index + 1] + 1),
                row[right_index] + usize::from(left_character != right_character),
            ));
        }
        row = next;
    }
    row[right.len()]
}

fn similar_name(left: &str, right: &str) -> bool {
    let left = normalized_name(left);
    let right = normalized_name(right);
    left == right || (left.chars().count() >= 4 && right.chars().count() >= 4 && name_edit_distance(&left, &right) <= 1)
}

fn signer_name_in_document(text: &str, name: &SignerNameParts) -> Option<SignerNameInDocument> {
    if name.patronymic.is_some() && whole_text_match_count(text, &name.full_name) > 0 {
        return Some(SignerNameInDocument {
            full_name: name.full_name.clone(),
            surname: name.surname.clone(),
            given_name: name.given_name.clone(),
            patronymic: name.patronymic.clone(),
            has_full_name: true,
        });
    }
    let words = text
        .split_whitespace()
        .map(|word| word.trim_matches(|character: char| !character.is_alphabetic() && character != '\''))
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>();
    for pair in words.windows(2) {
        if similar_name(pair[1], &name.surname) && similar_name(pair[0], &name.given_name) {
            return Some(SignerNameInDocument {
                full_name: format!("{} {}", pair[0], pair[1]),
                surname: pair[1].to_string(),
                given_name: pair[0].to_string(),
                patronymic: None,
                has_full_name: false,
            });
        }
        if similar_name(pair[0], &name.surname) && similar_name(pair[1], &name.given_name) {
            return Some(SignerNameInDocument {
                full_name: format!("{} {}", pair[0], pair[1]),
                surname: pair[0].to_string(),
                given_name: pair[1].to_string(),
                patronymic: None,
                has_full_name: false,
            });
        }
    }
    None
}

fn detected_signer_block_proposals(
    proposals: &mut Vec<TemplateAnalysisProposal>,
    text: &str,
    role: &settings::SignerRole,
) {
    let signer = &role.signer;
    let Some(name_parts) = signer_name_parts(&signer.full_name) else { return; };
    let Some(name_in_document) = signer_name_in_document(text, &name_parts) else { return; };
    let category = format!("Підписант: {}", role.name);
    if name_in_document.has_full_name {
        template_analysis_value(proposals, text, &name_in_document.full_name, &format!("{}_піб", role.id), &format!("ПІБ: {}", role.name), &category);
    }
    template_analysis_value(proposals, text, &name_in_document.surname, &format!("{}_прізвище", role.id), &format!("Прізвище: {}", role.name), &category);
    template_analysis_value(proposals, text, &name_in_document.given_name, &format!("{}_імя", role.id), &format!("Ім’я: {}", role.name), &category);
    if name_in_document.has_full_name {
        if let Some(patronymic) = &name_in_document.patronymic {
            template_analysis_value(proposals, text, patronymic, &format!("{}_по_батькові", role.id), &format!("По батькові: {}", role.name), &category);
        }
    }
    if signer.rank.chars().count() >= 4 {
        template_analysis_value(
            proposals,
            text,
            &signer.rank,
            &format!("{}_звання", role.id),
            &format!("Звання: {}", role.name),
            &category,
        );
    }
    if let Some(position) = document_signature_position(text, &name_in_document.full_name, &signer.rank) {
        template_analysis_value(
            proposals,
            text,
            &position,
            &format!("{}_посада", role.id),
            &format!("Посада у блоці підпису: {}", role.name),
            &category,
        );
    }
}

fn document_phrase_after(text: &str, marker: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let start = lower.find(marker)? + marker.len();
    let remaining = text[start..].trim_start_matches(|character: char| {
        character.is_whitespace() || character == ':'
    });
    let quoted = [("«", "»"), ("\"", "\""), ("“", "”")]
        .iter()
        .find_map(|(opening, closing)| {
            remaining.strip_prefix(opening).and_then(|after_opening| {
                after_opening
                    .find(closing)
                    .map(|end| after_opening[..end].trim().to_string())
            })
        });
    let value = quoted.unwrap_or_else(|| remaining
        .chars()
        .take_while(|character| !matches!(character, ',' | ';' | '\n' | '\r'))
        .take(90)
        .collect::<String>());
    let value = value.trim_matches(|character: char| {
        character.is_whitespace() || matches!(character, ':' | '«' | '»' | '.')
    });
    (value.chars().count() >= 2).then(|| value.to_string())
}

#[tauri::command]
fn analyse_report_for_template(
    state: tauri::State<AppState>,
    report_path: String,
) -> Result<TemplateAnalysis, String> {
    let path = PathBuf::from(&report_path);
    if !path.is_file()
        || !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("docx"))
    {
        return Err("Оберіть DOCX-файл рапорту.".into());
    }
    let text = report_generation::read_docx_text(&path)?;
    let paragraphs = report_generation::read_docx_paragraphs(&path)?;
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let mut proposals = Vec::new();
    let signer_roles = settings::load(&application_root_from_path(&path)?)?.signer_roles;
    for role in &signer_roles {
        detected_signer_block_proposals(&mut proposals, &text, role);
    }
    for person in personnel::list(&database.connection)? {
        // Do not turn a shared rank or position into a military-person token.
        // A personnel record is relevant only when its complete name appears in
        // the document. This also leaves a recognized signature block solely
        // with the appropriate signer variables.
        if whole_text_match_count(&text, &person.full_name) == 0 {
            continue;
        }
        template_analysis_value(
            &mut proposals,
            &text,
            &person.full_name,
            "військовий_1_піб",
            "ПІБ військовослужбовця",
            "Військовослужбовець",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &person.surname,
            "військовий_1_прізвище",
            "Прізвище військовослужбовця",
            "Військовослужбовець",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &person.given_name,
            "військовий_1_імя",
            "Ім’я військовослужбовця",
            "Військовослужбовець",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &person.patronymic,
            "військовий_1_по_батькові",
            "По батькові військовослужбовця",
            "Військовослужбовець",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &person.rank,
            "військовий_1_звання",
            "Звання військовослужбовця",
            "Військовослужбовець",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &person.position,
            "військовий_1_посада",
            "Посада військовослужбовця",
            "Військовослужбовець",
        );
    }
    let mut vehicle_statement = database
        .connection
        .prepare("SELECT name, registration_number, status FROM vehicles")
        .map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?;
    let vehicles = vehicle_statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?;
    for (name, registration, status) in vehicles {
        template_analysis_value(
            &mut proposals,
            &text,
            &name,
            "автомобіль_назва",
            "Назва автомобіля",
            "Автомобіль",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &registration,
            "автомобіль_номер",
            "Номер автомобіля",
            "Автомобіль",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &status,
            "автомобіль_статус",
            "Статус автомобіля",
            "Автомобіль",
        );
    }
    detected_document_proposals(&mut proposals, &text);
    proposals.sort_by(|left, right| {
        right
            .occurrences
            .cmp(&left.occurrences)
            .then(left.label.cmp(&right.label))
    });
    let source_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Рапорт.docx")
        .to_string();
    Ok(TemplateAnalysis {
        source_name,
        text_preview: text,
        paragraphs,
        proposals,
    })
}

#[tauri::command]
fn render_report_analysis_preview(
    report_path: String,
    replacements: Vec<TemplateAnalysisReplacement>,
) -> Result<Vec<u8>, String> {
    let source = PathBuf::from(report_path);
    if !source.is_file() {
        return Err("Вихідний рапорт не знайдено.".into());
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = std::env::temp_dir().join(format!(
        "shablonizator-preview-{}-{nonce}.docx",
        std::process::id()
    ));
    let replacement_values = replacements.into_iter().map(|item| {
        let replacement = item.replacement.unwrap_or_else(|| format!("{{{{{}}}}}", item.token));
        (item.value, replacement)
    }).collect::<Vec<_>>();
    report_generation::create_template_from_literal_replacements(&source, &temporary, &replacement_values)?;
    let bytes = std::fs::read(&temporary).map_err(|_| "Не вдалося підготувати перегляд документа.".to_string());
    let _ = std::fs::remove_file(temporary);
    bytes
}

fn application_root_from_path(_path: &Path) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        return Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Не вдалося визначити папку програми.".to_string());
    }
    #[cfg(not(debug_assertions))]
    {
        executable_root()
    }
}

#[tauri::command]
async fn create_template_from_report_analysis(
    app: tauri::AppHandle,
    report_path: String,
    template_name: String,
    replacements: Vec<TemplateAnalysisReplacement>,
) -> Result<String, String> {
    let source = PathBuf::from(report_path);
    if !source.is_file() {
        return Err("Вихідний рапорт не знайдено.".into());
    }
    let safe_name = template_name.trim().trim_end_matches(".docx");
    if safe_name.is_empty() || safe_name.contains(['/', '\\']) {
        return Err("Вкажіть коректну назву шаблону.".into());
    }
    let directory = templates_directory(&app)?;
    let mut destination = directory.join(format!("{safe_name}.docx"));
    let mut suffix = 2;
    while destination.exists() {
        destination = directory.join(format!("{safe_name} ({suffix}).docx"));
        suffix += 1;
    }
    let replacements = replacements
        .into_iter()
        .map(|item| {
            let replacement = item
                .replacement
                .unwrap_or_else(|| format!("{{{{{}}}}}", item.token));
            (item.value, replacement)
        })
        .collect::<Vec<_>>();
    let source_for_task = source.clone();
    let destination_for_task = destination.clone();
    tauri::async_runtime::spawn_blocking(move || {
        report_generation::create_template_from_literal_replacements(
            &source_for_task,
            &destination_for_task,
            &replacements,
        )
    })
    .await
    .map_err(|_| "Не вдалося завершити створення DOCX-шаблону.".to_string())??;
    Ok(destination.to_string_lossy().into())
}

#[tauri::command]
fn list_vehicles(state: tauri::State<AppState>) -> Result<Vec<Vehicle>, String> {
    let db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let mut query = db.connection.prepare("SELECT v.id,v.name,v.registration_number,v.status,v.personnel_id,CASE WHEN p.id IS NULL THEN NULL ELSE trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) END,v.crew_id,c.name FROM vehicles v LEFT JOIN personnel p ON p.id=v.personnel_id LEFT JOIN crews c ON c.id=v.crew_id ORDER BY v.name").map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?;
    let result = query
        .query_map([], |row| {
            Ok(Vehicle {
                id: row.get(0)?,
                name: row.get(1)?,
                registration_number: row.get(2)?,
                status: row.get(3)?,
                personnel_id: row.get(4)?,
                driver_name: row.get(5)?,
                crew_id: row.get(6)?,
                crew_name: row.get(7)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати автомобілі.".to_string());
    result
}
#[tauri::command]
fn create_vehicle(
    state: tauri::State<AppState>,
    name: String,
    registration_number: String,
    status: String,
) -> Result<(), String> {
    let db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    db.connection
        .execute(
            "INSERT INTO vehicles(name,registration_number,status) VALUES (?1,?2,?3)",
            rusqlite::params![name.trim(), registration_number.trim(), status],
        )
        .map_err(|_| "Не вдалося додати автомобіль.".to_string())?;
    let id = db.connection.last_insert_rowid();
    db.connection.execute("INSERT INTO vehicle_custom_fields(vehicle_id,field_key,field_value) SELECT ?1,field_key,initial_value FROM vehicle_custom_field_definitions", [id]).map_err(|_| "Не вдалося встановити кастомні поля автомобіля.".to_string())?;
    Ok(())
}
#[tauri::command]
fn assign_vehicle(
    state: tauri::State<AppState>,
    vehicle_id: i64,
    personnel_id: Option<i64>,
    crew_id: Option<i64>,
) -> Result<(), String> {
    let db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    if let Some(id) = personnel_id {
        let position: String = db
            .connection
            .query_row("SELECT position FROM personnel WHERE id=?1", [id], |row| {
                row.get(0)
            })
            .map_err(|_| "Водія не знайдено.".to_string())?;
        if !position.to_lowercase().contains("водій") {
            return Err("Автомобіль можна закріпити лише за водієм.".into());
        }
    }
    db.connection
        .execute(
            "UPDATE vehicles SET personnel_id=?1, crew_id=?2 WHERE id=?3",
            rusqlite::params![personnel_id, crew_id, vehicle_id],
        )
        .map_err(|_| "Не вдалося змінити закріплення автомобіля.".to_string())?;
    Ok(())
}
#[tauri::command]
fn update_vehicle_status(
    state: tauri::State<AppState>,
    vehicle_id: i64,
    status: String,
) -> Result<(), String> {
    let db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    db.connection
        .execute(
            "UPDATE vehicles SET status=?1 WHERE id=?2",
            rusqlite::params![status, vehicle_id],
        )
        .map_err(|_| "Не вдалося змінити статус автомобіля.".to_string())
        .map(|_| ())
}
#[tauri::command]
fn delete_vehicle(state: tauri::State<AppState>, vehicle_id: i64) -> Result<(), String> {
    let db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    db.connection
        .execute("DELETE FROM vehicles WHERE id=?1", [vehicle_id])
        .map_err(|_| "Не вдалося видалити автомобіль.".to_string())
        .map(|_| ())
}

fn crew_members(connection: &Connection, crew_id: i64) -> Result<Vec<CrewMember>, String> {
    let mut statement = connection.prepare("SELECT p.id, trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic), p.rank, p.position FROM crew_members cm JOIN personnel p ON p.id=cm.personnel_id WHERE cm.crew_id=?1 AND cm.left_at IS NULL ORDER BY cm.joined_at, p.id")
        .map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string())?;
    let result = statement.query_map([crew_id], |row| Ok(CrewMember { personnel_id: row.get(0)?, full_name: row.get(1)?, rank: row.get(2)?, position: row.get(3)? }))
        .map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string());
    result
}

#[tauri::command]
fn list_crews(state: tauri::State<AppState>) -> Result<Vec<Crew>, String> {
    let db = state.0.lock().map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let mut statement = db.connection.prepare("SELECT c.id,c.name,c.platoon,c.position_name,c.reconnaissance_area,COUNT(cm.id) FROM crews c LEFT JOIN crew_members cm ON cm.crew_id=c.id AND cm.left_at IS NULL GROUP BY c.id ORDER BY c.platoon COLLATE NOCASE,c.name COLLATE NOCASE")
        .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?;
    let rows = statement.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, i64>(5)?)))
        .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?
        .collect::<Result<Vec<_>, _>>().map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?;
    rows.into_iter().map(|(id,name,platoon,position_name,reconnaissance_area,member_count)| Ok(Crew { id, name, platoon, position_name, reconnaissance_area, member_count, members: crew_members(&db.connection,id)? })).collect()
}

#[tauri::command]
fn create_crew(state: tauri::State<AppState>, draft: CrewDraft) -> Result<(), String> {
    if draft.name.trim().is_empty() { return Err("Вкажіть назву екіпажу.".into()); }
    let db = state.0.lock().map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    db.connection.execute("INSERT INTO crews(name,platoon,position_name,reconnaissance_area) VALUES(?1,?2,?3,?4)", rusqlite::params![draft.name.trim(),draft.platoon.trim(),draft.position_name.trim(),draft.reconnaissance_area.trim()]).map_err(|_| "Не вдалося створити екіпаж. Перевірте унікальність назви.".to_string())?;
    let crew_id = db.connection.last_insert_rowid();
    for personnel_id in draft.member_ids { db.connection.execute("INSERT INTO crew_members(crew_id,personnel_id) VALUES(?1,?2)", rusqlite::params![crew_id,personnel_id]).map_err(|_| "Не вдалося додати учасника екіпажу.".to_string())?; }
    Ok(())
}

#[tauri::command]
fn update_crew(state: tauri::State<AppState>, crew_id: i64, draft: CrewDraft) -> Result<(), String> {
    if draft.name.trim().is_empty() { return Err("Вкажіть назву екіпажу.".into()); }
    let db = state.0.lock().map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    db.connection.execute("UPDATE crews SET name=?1,platoon=?2,position_name=?3,reconnaissance_area=?4 WHERE id=?5", rusqlite::params![draft.name.trim(),draft.platoon.trim(),draft.position_name.trim(),draft.reconnaissance_area.trim(),crew_id]).map_err(|_| "Не вдалося оновити екіпаж.".to_string())?;
    db.connection.execute("UPDATE crew_members SET left_at=CURRENT_TIMESTAMP WHERE crew_id=?1 AND left_at IS NULL", [crew_id]).map_err(|_| "Не вдалося оновити склад екіпажу.".to_string())?;
    for personnel_id in draft.member_ids { db.connection.execute("INSERT INTO crew_members(crew_id,personnel_id) VALUES(?1,?2)", rusqlite::params![crew_id,personnel_id]).map_err(|_| "Не вдалося оновити склад екіпажу.".to_string())?; }
    Ok(())
}

#[tauri::command]
fn delete_crew(state: tauri::State<AppState>, crew_id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    db.connection.execute("DELETE FROM crews WHERE id=?1", [crew_id]).map_err(|_| "Не вдалося видалити екіпаж.".to_string())?;
    Ok(())
}

#[tauri::command]
fn list_equipment(state: tauri::State<AppState>, category: String) -> Result<Vec<Equipment>, String> {
    let db = state.0.lock().map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let mut statement = db.connection.prepare("SELECT e.id,e.category,e.name,e.inventory_number,e.status,e.crew_id,c.name,e.personnel_id,CASE WHEN p.id IS NULL THEN NULL ELSE trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) END,e.notes FROM equipment e LEFT JOIN crews c ON c.id=e.crew_id LEFT JOIN personnel p ON p.id=e.personnel_id WHERE e.category=?1 ORDER BY e.name COLLATE NOCASE,e.id")
        .map_err(|_| "Не вдалося прочитати майно.".to_string())?;
    let result = statement.query_map([category], |row| Ok(Equipment { id:row.get(0)?,category:row.get(1)?,name:row.get(2)?,inventory_number:row.get(3)?,status:row.get(4)?,crew_id:row.get(5)?,crew_name:row.get(6)?,personnel_id:row.get(7)?,holder_name:row.get(8)?,notes:row.get(9)? }))
        .map_err(|_| "Не вдалося прочитати майно.".to_string())?.collect::<Result<Vec<_>,_>>().map_err(|_| "Не вдалося прочитати майно.".to_string())
        ;
    result
}

#[tauri::command]
fn create_equipment(state: tauri::State<AppState>, draft: EquipmentDraft) -> Result<(), String> {
    if draft.name.trim().is_empty() { return Err("Вкажіть назву запису.".into()); }
    if !["generator","uav","communications","weapon_ammo"].contains(&draft.category.as_str()) { return Err("Невідома категорія майна.".into()); }
    if draft.category == "weapon_ammo" && draft.personnel_id.is_none() { return Err("Зброю та БК потрібно закріпити за військовослужбовцем.".into()); }
    let db = state.0.lock().map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    db.connection.execute("INSERT INTO equipment(category,name,inventory_number,status,crew_id,personnel_id,notes) VALUES(?1,?2,?3,?4,?5,?6,?7)", rusqlite::params![draft.category,draft.name.trim(),draft.inventory_number.trim(),draft.status,draft.crew_id,draft.personnel_id,draft.notes.trim()]).map_err(|_| "Не вдалося додати запис майна.".to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_equipment(state: tauri::State<AppState>, equipment_id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    db.connection.execute("DELETE FROM equipment WHERE id=?1", [equipment_id]).map_err(|_| "Не вдалося видалити запис майна.".to_string())?;
    Ok(())
}

#[tauri::command]
fn list_incidents(state: tauri::State<AppState>) -> Result<Vec<Incident>, String> {
    let db = state.0.lock().map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let mut statement = db.connection.prepare("SELECT i.id,i.incident_type,i.occurred_at,i.crew_id,c.name,i.equipment_id,e.name,i.position_name,i.reconnaissance_area,i.crew_snapshot,COALESCE((SELECT group_concat(v.name || ' ' || v.registration_number, ', ') FROM vehicles v WHERE v.crew_id=i.crew_id),''),i.description FROM incidents i LEFT JOIN crews c ON c.id=i.crew_id LEFT JOIN equipment e ON e.id=i.equipment_id ORDER BY i.created_at DESC,i.id DESC").map_err(|_| "Не вдалося прочитати інциденти.".to_string())?;
    let result = statement.query_map([], |row| Ok(Incident { id:row.get(0)?,incident_type:row.get(1)?,occurred_at:row.get(2)?,crew_id:row.get(3)?,crew_name:row.get(4)?,equipment_id:row.get(5)?,equipment_name:row.get(6)?,position_name:row.get(7)?,reconnaissance_area:row.get(8)?,crew_snapshot:row.get(9)?,vehicle_name:row.get(10)?,description:row.get(11)? }))
        .map_err(|_| "Не вдалося прочитати інциденти.".to_string())?.collect::<Result<Vec<_>,_>>().map_err(|_| "Не вдалося прочитати інциденти.".to_string())
        ;
    result
}

#[tauri::command]
fn create_incident(state: tauri::State<AppState>, draft: IncidentDraft) -> Result<(), String> {
    if draft.incident_type.trim().is_empty() { return Err("Оберіть тип інциденту.".into()); }
    let db = state.0.lock().map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let (position_name, reconnaissance_area, crew_snapshot) = if let Some(crew_id) = draft.crew_id {
        let info: (String, String) = db.connection
            .query_row(
                "SELECT position_name, reconnaissance_area FROM crews WHERE id=?1",
                [crew_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| "Екіпаж не знайдено.".to_string())?;
        let members = crew_members(&db.connection, crew_id)?
            .into_iter()
            .map(|member| member.full_name)
            .collect::<Vec<_>>()
            .join(", ");
        (
            if draft.position_name.trim().is_empty() { info.0 } else { draft.position_name.trim().into() },
            if draft.reconnaissance_area.trim().is_empty() { info.1 } else { draft.reconnaissance_area.trim().into() },
            members,
        )
    } else {
        (draft.position_name.trim().into(), draft.reconnaissance_area.trim().into(), String::new())
    };
    db.connection.execute("INSERT INTO incidents(incident_type,occurred_at,crew_id,equipment_id,position_name,reconnaissance_area,crew_snapshot,description) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",rusqlite::params![draft.incident_type.trim(),draft.occurred_at.trim(),draft.crew_id,draft.equipment_id,position_name,reconnaissance_area,crew_snapshot,draft.description.trim()]).map_err(|_| "Не вдалося зберегти інцидент.".to_string())?;
    Ok(())
}

#[cfg(test)]
fn create_validation_example_template(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let file =
        fs::File::create(path).map_err(|_| "Не вдалося створити тестовий шаблон.".to_string())?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let entries = [
        (
            "[Content_Types].xml",
            r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#,
        ),
        (
            "_rels/.rels",
            r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#,
        ),
        (
            "word/document.xml",
            r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Тест повної перевірки шаблону</w:t></w:r></w:p><w:p><w:r><w:t>{{soldier.name}}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>"#,
        ),
    ];
    for (name, contents) in entries {
        archive
            .start_file(name, options)
            .map_err(|_| "Не вдалося сформувати тестовий шаблон.".to_string())?;
        archive
            .write_all(contents.as_bytes())
            .map_err(|_| "Не вдалося записати тестовий шаблон.".to_string())?;
    }
    archive
        .finish()
        .map_err(|_| "Не вдалося завершити створення тестового шаблону.".to_string())?;
    Ok(())
}

fn template_description(file_name: &str) -> (&'static str, u16) {
    match file_name {
        "Рапорт на відпустку.docx" => {
            ("Рапорт на надання відпустки військовослужбовцю", 7)
        }
        "Рапорт на відпустку з датою.docx" => {
            ("Рапорт на надання відпустки з вибором дати", 8)
        }
        "Рапорт на матеріальну допомогу.docx" => {
            ("Рапорт на отримання матеріальної допомоги", 8)
        }
        _ => ("Локальний DOCX-шаблон рапорту", 0),
    }
}

fn prepare_database_path(root: &Path) -> Result<(PathBuf, bool), String> {
    let database_path = root.join(DATABASE_FILE_NAME);
    let legacy_directory = root.join(LEGACY_DATABASE_DIRECTORY_NAME);
    let legacy_path = legacy_directory.join(DATABASE_FILE_NAME);
    let database_was_missing = !database_path.exists() && !legacy_path.exists();
    if !database_path.exists() && legacy_path.exists() {
        fs::rename(&legacy_path, &database_path)
            .or_else(|_| {
                fs::copy(&legacy_path, &database_path)?;
                fs::remove_file(&legacy_path)
            })
            .map_err(|_| "Не вдалося перенести базу даних у головну папку програми.".to_string())?;
        let _ = fs::remove_dir(&legacy_directory);
    }
    Ok((database_path, database_was_missing))
}

fn open_database(app: &tauri::AppHandle) -> Result<(DatabaseState, bool), String> {
    let root = ensure_application_structure(app)?;
    migrate_executable_database(&root)?;
    let (database_path, database_was_missing) = prepare_database_path(&root)?;
    let database = connect_database(database_path, database_was_missing)?;
    database::sync_custom_fields_file(&database.connection, &root, CUSTOM_VARIABLES_FILE_NAME)?;
    Ok((database, database_was_missing))
}

fn connect_database(
    database_path: PathBuf,
    database_was_missing: bool,
) -> Result<DatabaseState, String> {
    let connection = if database_was_missing {
        Connection::open_in_memory()
    } else {
        Connection::open(&database_path)
    }
    .map_err(|_| "Не вдалося відкрити базу даних програми.".to_string())?;
    database::initialise(&connection)?;
    Ok(DatabaseState {
        connection,
        path: database_path,
        is_persistent: !database_was_missing,
    })
}

fn ensure_persistent_database(database_state: &mut DatabaseState) -> Result<(), String> {
    if database_state.is_persistent {
        return Ok(());
    }
    let connection = Connection::open(&database_state.path)
        .map_err(|_| "Не вдалося створити базу даних у головній папці програми.".to_string())?;
    database::initialise(&connection)?;
    database_state.connection = connection;
    database_state.is_persistent = true;
    Ok(())
}

fn directory_contains_docx(directory: &Path) -> bool {
    fs::read_dir(directory)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .any(|entry| {
            entry
                .path()
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("docx"))
        })
}

fn startup_warnings(
    connection: &Connection,
    database_was_missing: bool,
    templates_were_missing: bool,
) -> Vec<StartupWarning> {
    let mut warnings = Vec::new();
    if database_was_missing {
        warnings.push(StartupWarning { code: "database-missing".into(), title: "База даних відсутня".into(), message: "Файл особовий_склад.db не знайдено. Його буде створено після додавання першого військовослужбовця.".into() });
    }
    if templates_were_missing {
        warnings.push(StartupWarning {
            code: "templates-missing".into(),
            title: "Шаблони були відсутні".into(),
            message: "Папка не містить DOCX-файлів. Додайте власний шаблон у папку «Шаблони»."
                .into(),
        });
    }
    let personnel_count = connection
        .query_row("SELECT COUNT(*) FROM personnel", [], |row| {
            row.get::<_, i64>(0)
        })
        .unwrap_or(0);
    if personnel_count == 0 {
        warnings.push(StartupWarning {
            code: "personnel-empty".into(),
            title: "Особовий склад порожній".into(),
            message: "Додайте хоча б одного військовослужбовця, щоб генерувати рапорти.".into(),
        });
    }
    warnings
}

#[tauri::command]
fn list_personnel(
    state: tauri::State<AppState>,
    offset: u32,
    limit: u32,
) -> Result<personnel::PersonnelPage, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    personnel::list_page(&database.connection, offset, limit)
}

#[tauri::command]
fn create_personnel(
    state: tauri::State<AppState>,
    draft: personnel::PersonnelDraft,
) -> Result<personnel::Personnel, String> {
    personnel::validate(&draft)?;
    let mut database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    ensure_persistent_database(&mut database)?;
    personnel::create(&database.connection, draft)
}

#[tauri::command]
fn update_personnel(
    state: tauri::State<AppState>,
    personnel_id: i64,
    draft: personnel::PersonnelDraft,
) -> Result<personnel::Personnel, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    personnel::update(&database.connection, personnel_id, draft)
}

#[tauri::command]
fn delete_personnel(state: tauri::State<AppState>, personnel_id: i64) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    personnel::delete(&database.connection, personnel_id)
}

#[tauri::command]
fn import_personnel_xlsx(
    state: tauri::State<AppState>,
    path: String,
    mode: String,
) -> Result<u32, String> {
    let data = xlsx::import(std::path::Path::new(&path))?;
    if !["append", "replace"].contains(&mode.as_str()) {
        return Err("Невідомий режим імпорту.".into());
    }
    if data.personnel.is_empty() && data.vehicles.is_empty() {
        if mode == "replace" {
            let mut db = state
                .0
                .lock()
                .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
            ensure_persistent_database(&mut db)?;
            db.connection
                .execute("DELETE FROM vehicles", [])
                .map_err(|_| "Не вдалося очистити автомобілі.".to_string())?;
            db.connection
                .execute("DELETE FROM personnel", [])
                .map_err(|_| "Не вдалося очистити особовий склад.".to_string())?;
        }
        return Ok(0);
    }
    let mut ids = std::collections::HashSet::new();
    if data
        .personnel
        .iter()
        .filter(|draft| !draft.tax_id.trim().is_empty())
        .any(|draft| !ids.insert(draft.tax_id.clone()))
    {
        return Err("У файлі є дублікати ІПН. Виправте їх перед імпортом.".into());
    }
    let mut vehicle_numbers = std::collections::HashSet::new();
    for vehicle in &data.vehicles {
        if vehicle.name.trim().is_empty() || vehicle.registration_number.trim().is_empty() {
            return Err(
                "На аркуші «Автомобілі» вкажіть назву та державний номер кожного автомобіля."
                    .into(),
            );
        }
        if !vehicle_numbers.insert(vehicle.registration_number.trim().to_string()) {
            return Err("На аркуші «Автомобілі» є дублікати державних номерів.".into());
        }
        if !vehicle.status.trim().is_empty()
            && !["Справний", "Потребує ремонту", "Ремонтується", "Несправний"]
                .contains(&vehicle.status.trim())
        {
            return Err("Вкажіть коректний статус автомобіля: Справний, Потребує ремонту, Ремонтується або Несправний.".into());
        }
    }
    let mut db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    ensure_persistent_database(&mut db)?;
    db.connection
        .execute_batch("BEGIN IMMEDIATE")
        .map_err(|_| "Не вдалося почати імпорт.".to_string())?;
    let result = (|| -> Result<u32, String> {
        if mode == "replace" {
            db.connection
                .execute("DELETE FROM vehicles", [])
                .map_err(|_| "Не вдалося очистити автомобілі.".to_string())?;
            db.connection
                .execute("DELETE FROM personnel", [])
                .map_err(|_| "Не вдалося очистити особовий склад.".to_string())?;
        }
        let mut count = 0;
        for draft in data.personnel {
            personnel::create_import(&db.connection, draft)?;
            count += 1;
        }
        for vehicle in data.vehicles {
            let driver_id = if vehicle.driver_tax_id.trim().is_empty() {
                None
            } else {
                let (id, position): (i64, String) = db
                    .connection
                    .query_row(
                        "SELECT id, position FROM personnel WHERE tax_id=?1",
                        [vehicle.driver_tax_id.trim()],
                        |row| Ok((row.get(0)?, row.get(1)?)),
                    )
                    .map_err(|_| {
                        format!(
                            "Для автомобіля «{}» не знайдено водія з ІПН {}.",
                            vehicle.registration_number, vehicle.driver_tax_id
                        )
                    })?;
                if !position.to_lowercase().contains("водій") {
                    return Err(format!(
                        "Військовослужбовець з ІПН {} не має посади водія.",
                        vehicle.driver_tax_id
                    ));
                }
                Some(id)
            };
            db.connection.execute("INSERT INTO vehicles(name, registration_number, status, personnel_id) VALUES(?1, ?2, ?3, ?4)", rusqlite::params![vehicle.name.trim(), vehicle.registration_number.trim(), if vehicle.status.trim().is_empty() { "Справний" } else { vehicle.status.trim() }, driver_id]).map_err(|_| format!("Не вдалося додати автомобіль з номером «{}». Перевірте, чи такого номера ще немає в базі.", vehicle.registration_number))?;
            let vehicle_id = db.connection.last_insert_rowid();
            db.connection.execute("INSERT INTO vehicle_custom_fields(vehicle_id,field_key,field_value) SELECT ?1,field_key,initial_value FROM vehicle_custom_field_definitions", [vehicle_id]).map_err(|_| "Не вдалося встановити кастомні поля автомобіля.".to_string())?;
            count += 1;
        }
        Ok(count)
    })();
    match result {
        Ok(count) => {
            db.connection
                .execute_batch("COMMIT")
                .map_err(|_| "Не вдалося завершити імпорт.".to_string())?;
            Ok(count)
        }
        Err(error) => {
            let _ = db.connection.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}

#[tauri::command]
fn export_personnel_xlsx(state: tauri::State<AppState>, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    let db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let people = personnel::list(&db.connection)?;
    let mut statement = db.connection.prepare("SELECT v.name, v.registration_number, v.status, COALESCE(p.tax_id, '') FROM vehicles v LEFT JOIN personnel p ON p.id=v.personnel_id ORDER BY v.id").map_err(|_| "Не вдалося прочитати автомобілі для експорту.".to_string())?;
    let vehicles = statement
        .query_map([], |row| {
            Ok(xlsx::VehicleRow {
                name: row.get(0)?,
                registration_number: row.get(1)?,
                status: row.get(2)?,
                driver_tax_id: row.get(3)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати автомобілі для експорту.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати автомобілі для експорту.".to_string())?;
    let personnel_custom_maps = database::list_custom_fields(&db.connection)?
        .into_iter()
        .map(|field| xlsx::CustomFieldMapRow {
            display_name: field.display_name,
            field_key: field.field_key,
            description: field.description,
            initial_value: field.initial_value,
        })
        .collect::<Vec<_>>();
    let vehicle_custom_maps = database::list_vehicle_custom_fields(&db.connection)?
        .into_iter()
        .map(|field| xlsx::CustomFieldMapRow {
            display_name: field.display_name,
            field_key: field.field_key,
            description: field.description,
            initial_value: field.initial_value,
        })
        .collect::<Vec<_>>();
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        xlsx::export(
            &path,
            &people,
            &vehicles,
            &personnel_custom_maps,
            &[],
            &vehicle_custom_maps,
            &[],
        )
    }))
    .map_err(|_| "Не вдалося сформувати Excel-файл: внутрішня помилка архіву.".to_string())??;
    Ok(())
}

#[tauri::command]
fn list_custom_fields(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<database::CustomFieldDefinition>, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    let root = application_root(&app)?;
    let mut fields = database::list_custom_fields(&database.connection)?;
    if root.join(CUSTOM_VARIABLES_FILE_NAME).exists() {
        for file_field in database::load_custom_fields_file(&root, CUSTOM_VARIABLES_FILE_NAME)? {
            if let Some(existing) = fields
                .iter_mut()
                .find(|field| field.field_key == file_field.field_key)
            {
                *existing = file_field;
            } else {
                fields.push(file_field);
            }
        }
    }
    fields.sort_by(|left, right| {
        left.display_name
            .to_lowercase()
            .cmp(&right.display_name.to_lowercase())
    });
    Ok(fields)
}

#[tauri::command]
fn list_personnel_fields(
    state: tauri::State<AppState>,
) -> Result<Vec<database::CustomFieldDefinition>, String> {
    let _database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    Ok(database::STANDARD_EXTRA_FIELDS
        .iter()
        .map(
            |(field_key, display_name)| database::CustomFieldDefinition {
                field_key: (*field_key).into(),
                display_name: (*display_name).into(),
                description: "Основне поле особового складу".into(),
                initial_value: String::new(),
                scope: "personnel".into(),
            },
        )
        .collect())
}

#[tauri::command]
fn create_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    field: database::CustomFieldDefinition,
) -> Result<database::CustomFieldDefinition, String> {
    let mut database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    ensure_persistent_database(&mut database)?;
    let root = application_root(&app)?;
    let seed_existing = if root.join(CUSTOM_VARIABLES_FILE_NAME).exists() {
        Vec::new()
    } else {
        database::list_custom_fields(&database.connection)?
    };
    let saved = database::create_custom_field(&database.connection, field)?;
    for existing in seed_existing {
        database::save_custom_field_file(&root, CUSTOM_VARIABLES_FILE_NAME, &existing)?;
    }
    database::save_custom_field_file(&root, CUSTOM_VARIABLES_FILE_NAME, &saved)?;
    Ok(saved)
}

#[tauri::command]
fn update_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    field: database::CustomFieldDefinition,
) -> Result<database::CustomFieldDefinition, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    let saved = database::update_custom_field(&database.connection, field)?;
    let root = application_root(&app)?;
    database::save_custom_field_file(&root, CUSTOM_VARIABLES_FILE_NAME, &saved)?;
    Ok(saved)
}

#[tauri::command]
fn delete_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    field_key: String,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    database::delete_custom_field(&database.connection, &field_key)?;
    let root = application_root(&app)?;
    database::remove_custom_field_file(&root, CUSTOM_VARIABLES_FILE_NAME, &field_key, "personnel")
}

#[tauri::command]
fn list_vehicle_custom_fields(
    state: tauri::State<AppState>,
) -> Result<Vec<database::CustomFieldDefinition>, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    database::list_vehicle_custom_fields(&database.connection)
}
#[tauri::command]
fn create_vehicle_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    mut field: database::CustomFieldDefinition,
) -> Result<database::CustomFieldDefinition, String> {
    let mut database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    ensure_persistent_database(&mut database)?;
    field.scope = "vehicle".into();
    let saved = database::create_vehicle_custom_field(&database.connection, field)?;
    database::save_custom_field_file(&application_root(&app)?, CUSTOM_VARIABLES_FILE_NAME, &saved)?;
    Ok(saved)
}
#[tauri::command]
fn update_vehicle_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    mut field: database::CustomFieldDefinition,
) -> Result<database::CustomFieldDefinition, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    field.scope = "vehicle".into();
    let saved = database::update_vehicle_custom_field(&database.connection, field)?;
    database::save_custom_field_file(&application_root(&app)?, CUSTOM_VARIABLES_FILE_NAME, &saved)?;
    Ok(saved)
}
#[tauri::command]
fn delete_vehicle_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    field_key: String,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    database::delete_vehicle_custom_field(&database.connection, &field_key)?;
    database::remove_custom_field_file(
        &application_root(&app)?,
        CUSTOM_VARIABLES_FILE_NAME,
        &field_key,
        "vehicle",
    )
}

#[tauri::command]
fn get_startup_warnings(state: tauri::State<AppState>) -> Vec<StartupWarning> {
    state.1.clone()
}

#[tauri::command]
fn get_app_settings(app: tauri::AppHandle) -> Result<settings::AppSettings, String> {
    settings::load(&application_root(&app)?)
}

#[tauri::command]
fn update_signer_settings(
    app: tauri::AppHandle,
    role: String,
    signer: settings::SignerSettings,
) -> Result<settings::AppSettings, String> {
    settings::update_signer(&application_root(&app)?, &role, signer)
}

#[tauri::command]
fn add_signer(
    app: tauri::AppHandle,
    name: String,
    signer: settings::SignerSettings,
) -> Result<settings::AppSettings, String> {
    settings::add_signer(&application_root(&app)?, name, signer)
}

#[tauri::command]
fn delete_signer(app: tauri::AppHandle, id: String) -> Result<settings::AppSettings, String> {
    settings::delete_signer(&application_root(&app)?, &id)
}

#[tauri::command]
fn update_visible_personnel_columns(
    app: tauri::AppHandle,
    columns: Vec<String>,
) -> Result<settings::AppSettings, String> {
    settings::update_visible_personnel_columns(&application_root(&app)?, columns)
}

#[tauri::command]
fn update_visible_vehicle_columns(
    app: tauri::AppHandle,
    columns: Vec<String>,
) -> Result<settings::AppSettings, String> {
    settings::update_visible_vehicle_columns(&application_root(&app)?, columns)
}

fn list_all_templates(app: tauri::AppHandle) -> Result<Vec<TemplateFile>, String> {
    let directory = templates_directory(&app)?;
    let mut templates = fs::read_dir(directory)
        .map_err(|_| "Не вдалося відкрити папку шаблонів.".to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|value| value.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("docx"))
        })
        .filter_map(|path| {
            let file_name = path.file_name()?.to_str()?.to_string();
            let (description, _) = template_description(&file_name);
            let source_path = path.to_string_lossy().to_string();
            let inspection = report_generation::inspect(&source_path);
            Some(TemplateFile {
                name: path.file_stem()?.to_str()?.to_string(),
                description: description.to_string(),
                changed: "Локальний файл".to_string(),
                status: if inspection.is_valid {
                    "ready".to_string()
                } else {
                    "error".to_string()
                },
                variables: inspection.variables.len() as u16,
                source_path,
            })
        })
        .collect::<Vec<_>>();
    templates.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(templates)
}

#[tauri::command]
fn list_templates(app: tauri::AppHandle, offset: u32, limit: u32) -> Result<TemplatesPage, String> {
    let templates = list_all_templates(app)?;
    let total_count = templates.len() as u64;
    let items = templates
        .into_iter()
        .skip(offset as usize)
        .take(limit.clamp(1, 100) as usize)
        .collect();
    Ok(TemplatesPage { items, total_count })
}

#[tauri::command]
fn select_template_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("Шаблони DOCX", &["docx"])
        .blocking_pick_file();
    match file {
        Some(path) => Ok(Some(
            path.into_path()
                .map_err(|_| "Не вдалося прочитати шлях до вибраного шаблону.".to_string())?
                .to_string_lossy()
                .to_string(),
        )),
        None => Ok(None),
    }
}

#[tauri::command]
fn inspect_template(
    template_path: String,
) -> Result<report_generation::TemplateValidationResult, String> {
    Ok(report_generation::inspect(&template_path))
}

#[tauri::command]
fn validate_template(
    state: tauri::State<AppState>,
    template_path: String,
    personnel_ids: Vec<i64>,
    report_date: Option<String>,
    vehicle_ids: Vec<i64>,
    crew_ids: Vec<i64>,
    equipment_ids: Vec<i64>,
    parameters: Option<std::collections::HashMap<String, String>>,
) -> Result<report_generation::TemplateValidationResult, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    Ok(report_generation::validate(
        &database.connection,
        &template_path,
        &personnel_ids,
        &vehicle_ids,
        &crew_ids,
        &equipment_ids,
        report_date.as_deref(),
        &parameters.unwrap_or_default(),
    ))
}

#[tauri::command]
fn generate_report(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    request: report_generation::GenerateReportRequest,
) -> Result<report_generation::GeneratedReport, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    let root = ensure_application_structure(&app)?;
    report_generation::generate(&database.connection, &root, request)
}

fn ensure_reports_item(app: &tauri::AppHandle, requested_path: &str) -> Result<PathBuf, String> {
    let reports_root = ensure_application_structure(app)?
        .join(REPORTS_DIRECTORY_NAME)
        .canonicalize()
        .map_err(|_| "Не вдалося відкрити папку рапортів.".to_string())?;
    let item = Path::new(requested_path)
        .canonicalize()
        .map_err(|_| "Файл або папку рапорту не знайдено.".to_string())?;
    if !item.starts_with(&reports_root) {
        return Err("Можна відкривати лише файли та папки зі структури Reports.".to_string());
    }
    Ok(item)
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(path).spawn();
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer").arg(path).spawn();
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(path).spawn();
    result.map(|_| ()).map_err(|_| {
        "Не вдалося відкрити файл або папку. Перевірте, чи є програма для DOCX-файлів.".to_string()
    })
}

fn ensure_template_path(
    templates_directory: &Path,
    requested_path: &str,
) -> Result<PathBuf, String> {
    let templates_root = templates_directory
        .canonicalize()
        .map_err(|_| "Не вдалося відкрити папку шаблонів.".to_string())?;
    let template = Path::new(requested_path)
        .canonicalize()
        .map_err(|_| "Шаблон не знайдено. Оновіть список шаблонів.".to_string())?;
    let is_docx = template
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("docx"));
    if !template.starts_with(&templates_root) || !is_docx {
        return Err("Можна відкривати лише DOCX-файли з папки «Шаблони».".to_string());
    }
    Ok(template)
}

fn ensure_template_item(app: &tauri::AppHandle, requested_path: &str) -> Result<PathBuf, String> {
    ensure_template_path(&templates_directory(app)?, requested_path)
}

#[tauri::command]
fn open_template(app: tauri::AppHandle, template_path: String) -> Result<(), String> {
    open_path(&ensure_template_item(&app, &template_path)?)
}

#[tauri::command]
fn open_templates_directory(app: tauri::AppHandle) -> Result<(), String> {
    open_path(&templates_directory(&app)?)
}

#[tauri::command]
fn delete_template(app: tauri::AppHandle, template_path: String) -> Result<(), String> {
    let template = ensure_template_item(&app, &template_path)?;
    fs::remove_file(template)
        .map_err(|_| "Не вдалося видалити шаблон. Можливо, файл відкритий у Word.".to_string())
}

#[tauri::command]
fn open_generated_report(app: tauri::AppHandle, report_path: String) -> Result<(), String> {
    open_path(&ensure_reports_item(&app, &report_path)?)
}

#[tauri::command]
fn open_generated_report_folder(app: tauri::AppHandle, folder_path: String) -> Result<(), String> {
    open_path(&ensure_reports_item(&app, &folder_path)?)
}

#[tauri::command]
fn delete_generated_reports(
    app: tauri::AppHandle,
    report_paths: Vec<String>,
) -> Result<(), String> {
    if report_paths.is_empty() {
        return Ok(());
    }
    let mut folders = Vec::new();
    for report_path in report_paths {
        let report = ensure_reports_item(&app, &report_path)?;
        if !report
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("docx"))
        {
            return Err(
                "Можна видаляти лише DOCX-рапорти з папки «Згенеровані рапорти».".to_string(),
            );
        }
        let parent = report.parent().map(Path::to_path_buf);
        fs::remove_file(&report).map_err(|_| {
            "Не вдалося видалити рапорт. Можливо, файл відкритий у Word.".to_string()
        })?;
        if let Some(folder) = parent {
            folders.push(folder);
        }
    }
    for folder in folders {
        if fs::read_dir(&folder)
            .ok()
            .is_some_and(|mut entries| entries.next().is_none())
        {
            let _ = fs::remove_dir(&folder);
        }
    }
    Ok(())
}

#[tauri::command]
fn open_application_directory(app: tauri::AppHandle) -> Result<(), String> {
    open_path(&ensure_application_structure(&app)?)
}

#[tauri::command]
fn create_database_backup(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    if !database.is_persistent {
        return Err("Неможливо створити резервну копію: файл бази даних ще не існує. Спочатку додайте військовослужбовця.".to_string());
    }
    let root = ensure_application_structure(&app)?;
    let now = Local::now();
    let directory = root
        .join(BACKUPS_DIRECTORY_NAME)
        .join(now.format("%d.%m.%Y").to_string());
    fs::create_dir_all(&directory)
        .map_err(|_| "Не вдалося створити папку резервних копій.".to_string())?;
    let backup_path = directory.join(format!("Резервна копія БД {}.zip", now.format("%H-%M-%S")));
    let database_path = root.join(DATABASE_FILE_NAME);
    let mut database = fs::File::open(&database_path)
        .map_err(|_| "Не вдалося відкрити базу даних для резервного копіювання.".to_string())?;
    let output = fs::File::create(&backup_path)
        .map_err(|_| "Не вдалося створити резервну копію бази даних.".to_string())?;
    let mut archive = ZipWriter::new(output);
    archive
        .start_file(
            "особовий_склад.db",
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|_| "Не вдалося сформувати резервну копію.".to_string())?;
    let mut bytes = Vec::new();
    database
        .read_to_end(&mut bytes)
        .map_err(|_| "Не вдалося прочитати базу даних для резервного копіювання.".to_string())?;
    archive
        .write_all(&bytes)
        .map_err(|_| "Не вдалося записати резервну копію.".to_string())?;
    archive
        .finish()
        .map_err(|_| "Не вдалося завершити резервне копіювання.".to_string())?;
    Ok(backup_path.to_string_lossy().to_string())
}

fn archive_file(
    archive: &mut ZipWriter<fs::File>,
    source: &Path,
    name: &str,
) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }
    archive
        .start_file(
            name,
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|_| "Не вдалося сформувати архів.".to_string())?;
    let mut input =
        fs::File::open(source).map_err(|_| "Не вдалося прочитати файл для архіву.".to_string())?;
    io::copy(&mut input, archive).map_err(|_| "Не вдалося записати архів.".to_string())?;
    Ok(())
}
fn archive_directory(
    archive: &mut ZipWriter<fs::File>,
    directory: &Path,
    prefix: &str,
) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory)
        .map_err(|_| "Не вдалося прочитати папку для архіву.".to_string())?
        .filter_map(Result::ok)
    {
        let path = entry.path();
        let name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
        if path.is_dir() {
            archive_directory(archive, &path, &name)?;
        } else {
            archive_file(archive, &path, &name)?;
        }
    }
    Ok(())
}
#[tauri::command]
fn export_application_data(
    app: tauri::AppHandle,
    path: String,
    options: DataArchiveOptions,
) -> Result<(), String> {
    let root = ensure_application_structure(&app)?;
    let file =
        fs::File::create(path).map_err(|_| "Не вдалося створити архів перенесення.".to_string())?;
    let mut archive = ZipWriter::new(file);
    if options.database {
        archive_file(
            &mut archive,
            &root.join(DATABASE_FILE_NAME),
            "data/особовий_склад.db",
        )?;
    }
    if options.settings {
        archive_file(&mut archive, &settings::path(&root), "data/settings.json")?;
    }
    if options.custom_variables {
        archive_file(
            &mut archive,
            &root.join(CUSTOM_VARIABLES_FILE_NAME),
            "data/custom_variables.json",
        )?;
    }
    if options.templates {
        archive_directory(
            &mut archive,
            &root.join(TEMPLATES_DIRECTORY_NAME),
            "templates",
        )?;
    }
    if options.reports {
        archive_directory(&mut archive, &root.join(REPORTS_DIRECTORY_NAME), "reports")?;
    }
    archive
        .finish()
        .map_err(|_| "Не вдалося завершити архів перенесення.".to_string())?;
    Ok(())
}
#[tauri::command]
fn import_application_data(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    path: String,
) -> Result<(), String> {
    let root = ensure_application_structure(&app)?;
    let file =
        fs::File::open(path).map_err(|_| "Не вдалося відкрити архів перенесення.".to_string())?;
    let mut archive = ZipArchive::new(file)
        .map_err(|_| "Файл не є коректним архівом перенесення.".to_string())?;
    let allowed = [
        "data/особовий_склад.db",
        "data/settings.json",
        "data/custom_variables.json",
    ];
    let mut database_bytes = None;
    for index in 0..archive.len() {
        let mut item = archive
            .by_index(index)
            .map_err(|_| "Не вдалося прочитати архів.".to_string())?;
        let name = item.name().to_string();
        if Path::new(&name).components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        }) {
            return Err("Архів містить неприпустимий шлях до файлу.".to_string());
        }
        let target = if allowed.contains(&name.as_str()) {
            Some(root.join(name.trim_start_matches("data/")))
        } else if name.starts_with("templates/") {
            Some(
                root.join(TEMPLATES_DIRECTORY_NAME)
                    .join(name.trim_start_matches("templates/")),
            )
        } else if name.starts_with("reports/") {
            Some(
                root.join(REPORTS_DIRECTORY_NAME)
                    .join(name.trim_start_matches("reports/")),
            )
        } else {
            None
        };
        let Some(target) = target else { continue };
        if item.is_dir() {
            continue;
        }
        let mut bytes = Vec::new();
        item.read_to_end(&mut bytes)
            .map_err(|_| "Не вдалося прочитати файл з архіву.".to_string())?;
        if name == "data/особовий_склад.db" {
            database_bytes = Some(bytes);
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|_| "Не вдалося відновити папку даних.".to_string())?;
            }
            fs::write(target, bytes).map_err(|_| "Не вдалося відновити файл даних.".to_string())?;
        }
    }
    if let Some(bytes) = database_bytes {
        let mut database = state
            .0
            .lock()
            .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
        let temporary = root.join("особовий_склад.import.tmp");
        fs::write(&temporary, bytes).map_err(|_| "Не вдалося відновити базу даних.".to_string())?;
        let memory = Connection::open_in_memory()
            .map_err(|_| "Не вдалося підготувати базу даних.".to_string())?;
        let old = std::mem::replace(&mut database.connection, memory);
        drop(old);
        fs::rename(&temporary, root.join(DATABASE_FILE_NAME))
            .map_err(|_| "Не вдалося замінити базу даних.".to_string())?;
        database.connection = Connection::open(root.join(DATABASE_FILE_NAME))
            .map_err(|_| "Не вдалося відкрити відновлену базу даних.".to_string())?;
        database.is_persistent = true;
    }
    Ok(())
}

#[tauri::command]
fn list_generated_reports(
    app: tauri::AppHandle,
    offset: u32,
    limit: u32,
) -> Result<GeneratedReportsPage, String> {
    let reports_directory = ensure_application_structure(&app)?.join(REPORTS_DIRECTORY_NAME);
    let template_names = list_all_templates(app)?
        .into_iter()
        .map(|template| template.name)
        .collect::<Vec<_>>();
    let mut reports = Vec::new();
    for date_entry in fs::read_dir(&reports_directory)
        .map_err(|_| "Не вдалося відкрити папку рапортів.".to_string())?
        .filter_map(Result::ok)
    {
        if !date_entry.path().is_dir() {
            continue;
        }
        for document_entry in fs::read_dir(date_entry.path())
            .map_err(|_| "Не вдалося прочитати папку згенерованих рапортів.".to_string())?
            .filter_map(Result::ok)
        {
            let docx_path = document_entry.path();
            if !docx_path.is_file()
                || !docx_path
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("docx"))
            {
                continue;
            }
            let name = docx_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Рапорт")
                .to_string();
            let template = template_names
                .iter()
                .filter(|template| name.starts_with(template.as_str()))
                .max_by_key(|template| template.len())
                .cloned()
                .unwrap_or_else(|| name.clone());
            let generated_at = fs::metadata(&docx_path)
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .map(|modified| {
                    DateTime::<Local>::from(modified)
                        .format("%d.%m.%Y %H:%M")
                        .to_string()
                })
                .unwrap_or_else(|| date_entry.file_name().to_string_lossy().to_string());
            reports.push(GeneratedReportFile {
                name,
                template,
                generated_at,
                docx_path: docx_path.to_string_lossy().to_string(),
                folder_path: date_entry.path().to_string_lossy().to_string(),
            });
        }
    }
    reports.sort_by(|left, right| right.generated_at.cmp(&left.generated_at));
    let total_count = reports.len() as u64;
    let safe_offset = offset as usize;
    let safe_limit = limit.clamp(1, 100) as usize;
    let items = reports
        .into_iter()
        .skip(safe_offset)
        .take(safe_limit)
        .collect();
    Ok(GeneratedReportsPage { items, total_count })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let root = ensure_application_structure(app.handle()).map_err(io::Error::other)?;
            let templates_were_missing =
                !directory_contains_docx(&root.join(TEMPLATES_DIRECTORY_NAME));
            let (database, database_was_missing) =
                open_database(app.handle()).map_err(io::Error::other)?;
            let warnings = startup_warnings(
                &database.connection,
                database_was_missing,
                templates_were_missing,
            );
            app.manage(AppState(Mutex::new(database), warnings));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_personnel,
            create_personnel,
            update_personnel,
            delete_personnel,
            import_personnel_xlsx,
            export_personnel_xlsx,
            list_custom_fields,
            list_personnel_fields,
            create_custom_field,
            update_custom_field,
            delete_custom_field,
            list_vehicle_custom_fields,
            create_vehicle_custom_field,
            update_vehicle_custom_field,
            delete_vehicle_custom_field,
            get_startup_warnings,
            get_app_settings,
            update_signer_settings,
            add_signer,
            delete_signer,
            update_visible_personnel_columns,
            update_visible_vehicle_columns,
            list_templates,
            select_template_file,
            inspect_template,
            analyse_report_for_template,
            render_report_analysis_preview,
            create_template_from_report_analysis,
            validate_template,
            generate_report,
            open_template,
            open_templates_directory,
            delete_template,
            open_generated_report,
            open_generated_report_folder,
            delete_generated_reports,
            open_application_directory,
            create_database_backup,
            export_application_data,
            import_application_data,
            list_generated_reports,
            list_vehicles,
            create_vehicle,
            assign_vehicle,
            update_vehicle_status,
            delete_vehicle,
            list_crews,
            create_crew,
            update_crew,
            delete_crew,
            list_equipment,
            create_equipment,
            delete_equipment,
            list_incidents,
            create_incident
        ])
        .run(tauri::generate_context!())
        .expect("Не вдалося запустити застосунок");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analysis_counts_only_whole_values() {
        assert_eq!(whole_text_match_count("Арсеній прибув. АРСЕНІЙ підтвердив.", "Арсен"), 0);
        assert_eq!(whole_text_match_count("Арсен прибув; Арсеній залишився.", "Арсен"), 1);
        assert_eq!(whole_text_match_count("АРСЕН прибув.", "Арсен"), 1);
    }

    #[test]
    fn analysis_extracts_only_the_quoted_document_phrase() {
        assert_eq!(
            document_phrase_after("Екіпаж «ПЛЮШКА» завершив бойове чергування", "екіпаж "),
            Some("ПЛЮШКА".into())
        );
        assert_eq!(
            document_phrase_after("позиція «Сокіл»; продовжити виконання", "позиція "),
            Some("Сокіл".into())
        );
    }

    #[test]
    fn analysis_finds_a_document_name_without_database_data() {
        let text = "Командир підрозділу молодший лейтенант Максим Петрович ТЕСТОВИЙ";
        let mut proposals = Vec::new();
        detected_document_proposals(&mut proposals, text);
        assert!(proposals.iter().any(|proposal| {
            proposal.value == "Максим Петрович ТЕСТОВИЙ" && proposal.token == "військовий_1_піб"
        }));
        assert!(proposals.iter().any(|proposal| {
            proposal.value == "Максим" && proposal.token == "військовий_1_імя"
        }));
        assert!(proposals.iter().any(|proposal| {
            proposal.value == "ТЕСТОВИЙ" && proposal.token == "військовий_1_прізвище"
        }));
    }

    #[test]
    fn analysis_requires_three_name_parts_and_uses_the_matching_signer_role() {
        let role = settings::SignerRole {
            id: "основний_підписант".into(),
            name: "Основний підписант".into(),
            signer: settings::SignerSettings {
                full_name: "Максим Петрович ТЕСТОВИЙ".into(),
                rank: "майор".into(),
                position: "Командир підрозділу".into(),
            },
        };
        let text = "Командир підрозділу\nмайор Максим Петрович ТЕСТОВИЙ";
        let mut proposals = Vec::new();
        detected_signer_block_proposals(&mut proposals, text, &role);
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_піб"));
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_посада" && proposal.value == "Командир підрозділу"));
        let mut short_name_proposals = Vec::new();
        detected_document_person_proposals(&mut short_name_proposals, "майор Максим ТЕСТОВИЙ");
        assert!(short_name_proposals.is_empty());
    }

    #[test]
    fn analysis_uses_a_two_part_name_only_for_an_exact_signer_match() {
        let role = settings::SignerRole {
            id: "основний_підписант".into(),
            name: "Основний підписант".into(),
            signer: settings::SignerSettings {
                full_name: "Максим ТЕСТОВИЙ".into(),
                rank: "майор".into(),
                position: "Командир підрозділу".into(),
            },
        };
        let text = "Командир підрозділу\nмайор Максим ТЕСТОВИЙ";
        let mut proposals = Vec::new();
        detected_signer_block_proposals(&mut proposals, text, &role);
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_прізвище" && proposal.value == "ТЕСТОВИЙ"));
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_імя" && proposal.value == "Максим"));
        assert!(!proposals.iter().any(|proposal| proposal.token == "основний_підписант_піб"));
        let mut generic = Vec::new();
        detected_document_person_proposals(&mut generic, text);
        assert!(generic.is_empty());
    }

    #[test]
    fn analysis_matches_a_two_part_signature_to_a_three_part_signer() {
        let role = settings::SignerRole {
            id: "основний_підписант".into(),
            name: "Основний підписант".into(),
            signer: settings::SignerSettings {
                full_name: "Максим Петрович ТЕСТОВИЙ".into(),
                rank: "майор".into(),
                position: "Командир підрозділу".into(),
            },
        };
        let text = "Командир підрозділу майор Максим ТЕСТОВИЙ";
        let mut proposals = Vec::new();
        detected_signer_block_proposals(&mut proposals, text, &role);
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_прізвище" && proposal.value == "ТЕСТОВИЙ"));
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_імя" && proposal.value == "Максим"));
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_звання" && proposal.value == "майор"));
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_посада" && proposal.value == "Командир підрозділу"));
        assert!(!proposals.iter().any(|proposal| proposal.token == "основний_підписант_піб"));
    }

    #[test]
    fn analysis_accepts_a_minor_spelling_difference_in_a_signer_name() {
        let role = settings::SignerRole {
            id: "основний_підписант".into(),
            name: "Основний підписант".into(),
            signer: settings::SignerSettings {
                full_name: "ТАКТІКУЛЬЩІК Максим Едуардович".into(),
                rank: "молодший лейтенант".into(),
                position: "Командир роти".into(),
            },
        };
        let text = "Командир роти молодший лейтенант Максім ТАКТІКУЛЬЩІК";
        let mut proposals = Vec::new();
        detected_signer_block_proposals(&mut proposals, text, &role);
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_прізвище" && proposal.value == "ТАКТІКУЛЬЩІК"));
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_імя" && proposal.value == "Максім"));
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_посада" && proposal.value == "Командир роти"));
    }

    #[test]
    fn analysis_finds_the_signer_in_the_allowed_test_report_when_available() {
        let path = Path::new("/Users/macbook/Downloads/Щодо завершення виконання завдань згідно БР№999 Екіпаж ТЕСТЮШКІ з 12.08.2026.docx");
        if !path.is_file() {
            return;
        }
        let role = settings::SignerRole {
            id: "основний_підписант".into(),
            name: "Основний підписант".into(),
            signer: settings::SignerSettings {
                full_name: "ТАКТІКУЛЬЩІК Максим Едуардович".into(),
                rank: "молодший лейтенант".into(),
                position: "Командир роти безпілотних авіаційних комплексів військової частини А2222".into(),
            },
        };
        let text = report_generation::read_docx_text(path).unwrap();
        let mut proposals = Vec::new();
        detected_signer_block_proposals(&mut proposals, &text, &role);
        // Файл є локальним ручним зразком, тому перевіряємо лише правило:
        // якщо в ньому знайдено блок підписанта, він не має стати даними військовослужбовця.
        assert!(!proposals.iter().any(|proposal| proposal.token == "військовий_1_звання"));
    }

    #[test]
    fn analysis_finds_the_military_unit_in_the_allowed_test_report_when_available() {
        let path = Path::new("/Users/macbook/Downloads/Щодо завершення виконання завдань згідно БР№999 Екіпаж ТЕСТЮШКІ з 12.08.2026.docx");
        if !path.is_file() {
            return;
        }
        let text = report_generation::read_docx_text(path).unwrap();
        let mut proposals = Vec::new();
        detected_document_proposals(&mut proposals, &text);
        assert!(proposals.iter().any(|proposal| proposal.token == "військова_частина_1" && proposal.value == "А2222"));
        assert!(proposals.iter().any(|proposal| proposal.token == "військова_частина_2" && proposal.value == "А1111"));
    }

    #[test]
    fn signature_rank_is_not_proposed_as_a_personnel_variable() {
        let role = settings::SignerRole {
            id: "основний_підписант".into(),
            name: "Основний підписант".into(),
            signer: settings::SignerSettings {
                full_name: "ТАКТІКУЛЬЩІК Максим Едуардович".into(),
                rank: "молодший лейтенант".into(),
                position: "Командир роти".into(),
            },
        };
        let text = "Командир роти молодший лейтенант Максім ТАКТІКУЛЬЩІК";
        let mut proposals = Vec::new();
        detected_signer_block_proposals(&mut proposals, text, &role);
        assert!(!proposals.iter().any(|proposal| proposal.token == "військовий_1_звання"));
        assert!(proposals.iter().any(|proposal| proposal.token == "основний_підписант_звання"));
    }

    #[test]
    fn document_proposals_do_not_create_a_personnel_rank_from_a_signature_block() {
        let mut proposals = Vec::new();
        detected_document_proposals(&mut proposals, "Командир роти молодший лейтенант Максім ТАКТІКУЛЬЩІК");
        assert!(!proposals.iter().any(|proposal| proposal.token == "військовий_1_звання"));
    }

    #[test]
    fn analysis_does_not_treat_arbitrary_title_words_as_a_name() {
        let mut proposals = Vec::new();
        detected_document_proposals(&mut proposals, "Рапорт Виконання ЗАВДАННЯ завершено");
        assert!(!proposals.iter().any(|proposal| proposal.token == "військовий_1_піб"));
    }

    #[test]
    fn analysis_finds_a_settlement_after_the_full_locality_marker() {
        let mut proposals = Vec::new();
        detected_document_proposals(&mut proposals, "в районі н.п. ПІСОСІВКА в смузі оборони");
        assert!(proposals.iter().any(|proposal| {
            proposal.value == "ПІСОСІВКА" && proposal.token == "населений_пункт_1"
        }));
    }

    #[test]
    fn analysis_finds_compact_and_spaced_military_unit_numbers_once_each() {
        let mut proposals = Vec::new();
        detected_document_proposals(&mut proposals, "військова частина А2222 та військова частина А 3333; повторно А2222");
        assert!(proposals.iter().any(|proposal| proposal.token == "військова_частина_1" && proposal.value == "А2222"));
        assert!(proposals.iter().any(|proposal| proposal.token == "військова_частина_2" && proposal.value == "А 3333"));
        assert_eq!(proposals.iter().filter(|proposal| proposal.token.starts_with("військова_частина_")).count(), 2);
    }

    #[test]
    fn creates_a_template_with_an_intentional_validation_error() {
        let directory = std::env::temp_dir().join(format!(
            "shablonizator-invalid-template-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&directory).unwrap();
        let template_path = directory.join("Тестовий шаблон з помилкою.docx");
        create_validation_example_template(&template_path).unwrap();
        let inspection = report_generation::inspect(template_path.to_str().unwrap());
        assert!(!inspection.is_valid);
        assert!(inspection
            .errors
            .iter()
            .any(|error| error.contains("soldier.name")));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn migrates_the_legacy_database_into_the_application_root() {
        let root = std::env::temp_dir().join(format!(
            "shablonizator-database-migration-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let legacy_directory = root.join(LEGACY_DATABASE_DIRECTORY_NAME);
        fs::create_dir_all(&legacy_directory).unwrap();
        fs::write(
            legacy_directory.join(DATABASE_FILE_NAME),
            b"existing database",
        )
        .unwrap();
        let (path, was_missing) = prepare_database_path(&root).unwrap();
        assert!(!was_missing);
        assert_eq!(fs::read(path).unwrap(), b"existing database");
        assert!(!legacy_directory.join(DATABASE_FILE_NAME).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reports_an_empty_personnel_database_at_startup() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let warnings = startup_warnings(&connection, true, true);
        assert!(warnings
            .iter()
            .any(|warning| warning.code == "database-missing"));
        assert!(warnings
            .iter()
            .any(|warning| warning.code == "templates-missing"));
        assert!(warnings
            .iter()
            .any(|warning| warning.code == "personnel-empty"));
    }

    #[test]
    fn missing_database_stays_in_memory_until_the_first_write() {
        let root = std::env::temp_dir().join(format!(
            "shablonizator-delayed-database-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join(DATABASE_FILE_NAME);
        let mut state = connect_database(path.clone(), true).unwrap();
        assert!(!path.exists());
        assert!(!state.is_persistent);
        ensure_persistent_database(&mut state).unwrap();
        assert!(path.exists());
        assert!(state.is_persistent);
        drop(state);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn only_docx_files_inside_the_templates_directory_can_be_opened() {
        let root = std::env::temp_dir().join(format!(
            "shablonizator-template-path-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let templates = root.join(TEMPLATES_DIRECTORY_NAME);
        fs::create_dir_all(&templates).unwrap();
        let template = templates.join("Рапорт.docx");
        let other_file = templates.join("Нотатки.txt");
        let outside_template = root.join("Інший рапорт.docx");
        fs::write(&template, b"docx").unwrap();
        fs::write(&other_file, b"text").unwrap();
        fs::write(&outside_template, b"docx").unwrap();

        assert_eq!(
            ensure_template_path(&templates, template.to_str().unwrap()).unwrap(),
            template.canonicalize().unwrap()
        );
        assert!(ensure_template_path(&templates, other_file.to_str().unwrap()).is_err());
        assert!(ensure_template_path(&templates, outside_template.to_str().unwrap()).is_err());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn creates_operational_control_templates() {
        let root = std::env::temp_dir().join(format!("shablonizator-operational-templates-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        create_operational_report_templates(&root).unwrap();
        for name in ["Контрольний рапорт — екіпаж.docx", "Контрольний рапорт — генератор.docx", "Контрольний рапорт — БпЛА.docx", "Контрольний рапорт — зв’язок.docx", "Контрольний рапорт — зброя та БК.docx"] {
            let result = report_generation::inspect(root.join(name).to_str().unwrap());
            assert!(result.is_valid, "{name}: {:?}", result.errors);
            assert!(!result.variables.is_empty());
        }
        let _ = fs::remove_dir_all(root);
    }
}
