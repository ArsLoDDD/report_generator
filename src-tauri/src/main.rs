mod bcs_export;
mod database;
mod document_commands;
mod flight_plan;
mod operations;
mod personnel;
mod personnel_commands;
mod report_generation;
mod settings;
mod settings_commands;
mod staffing_exchange;
mod template_analysis;
mod temporary_personnel;
mod xlsx;
use chrono::{DateTime, Local};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
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

pub(crate) struct DatabaseState {
    connection: Connection,
    path: PathBuf,
    is_persistent: bool,
}

pub(crate) struct AppState(pub(crate) Mutex<DatabaseState>, Vec<StartupWarning>);

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TemplateAnalysisProposal {
    value: String,
    token: String,
    label: String,
    category: String,
    occurrences: u32,
    confidence: String,
    auto_select: bool,
    reason: String,
    alternatives: Vec<TemplateAnalysisAlternative>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TemplateAnalysisAlternative {
    token: String,
    label: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalysisTemplateRegistry {
    document_fields: Vec<AnalysisDocumentField>,
}

#[derive(Debug, Deserialize)]
struct AnalysisDocumentField {
    id: String,
    name: String,
}

fn analysis_document_fields() -> &'static [AnalysisDocumentField] {
    static REGISTRY: std::sync::OnceLock<AnalysisTemplateRegistry> = std::sync::OnceLock::new();
    &REGISTRY
        .get_or_init(|| {
            serde_json::from_str(include_str!(
                "../../src/shared/template-language/registry.v2.json"
            ))
            .expect("template language registry must be valid")
        })
        .document_fields
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
    #[serde(default)]
    occurrence: Option<usize>,
}

use document_commands::*;
use personnel_commands::*;
use settings_commands::*;
use template_analysis::*;

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
        Ok(project_root)
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

fn is_simple_edition(app: &tauri::AppHandle) -> bool {
    app.config()
        .product_name
        .as_deref()
        .is_some_and(|name| name.contains("проста версія"))
}

fn ensure_application_structure_for_edition(
    app: &tauri::AppHandle,
    is_simple_edition: bool,
) -> Result<PathBuf, String> {
    let root = application_root(app)?;
    let templates_directory = root.join(TEMPLATES_DIRECTORY_NAME);
    let templates_were_missing = !templates_directory.exists();
    for directory in [
        TEMPLATES_DIRECTORY_NAME,
        REPORTS_DIRECTORY_NAME,
        BACKUPS_DIRECTORY_NAME,
    ] {
        fs::create_dir_all(root.join(directory))
            .map_err(|_| format!("Не вдалося створити папку «{directory}»."))?;
    }
    if !is_simple_edition && templates_were_missing {
        create_vehicle_report_template(&templates_directory.join("Рапорт на автомобіль.docx"))?;
        create_operational_report_templates(&templates_directory)?;
    }
    settings::load(&root)?;
    Ok(root)
}

fn ensure_application_structure(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    ensure_application_structure_for_edition(app, is_simple_edition(app))
}

fn create_operational_report_templates(directory: &Path) -> Result<(), String> {
    let templates = [
        ("Контрольний рапорт — екіпаж.docx", "Контрольний рапорт щодо екіпажу {{екіпаж_1_назва}}", "Взвод: {{екіпаж_1_взвод}}. Позиція: {{екіпаж_1_позиція}}. Район розвідки: {{екіпаж_1_район_розвідки}}. Склад: {{екіпаж_1_склад}}. Автомобілі: {{екіпаж_1_автомобілі}}."),
        ("Контрольний рапорт — генератор.docx", "Контрольний рапорт щодо генератора", "Генератор: {{генератор_1_назва}}. Інвентарний номер: {{генератор_1_інвентарний_номер}}. Стан: {{генератор_1_статус}}. Примітка: {{генератор_1_примітка}}."),
        ("Контрольний рапорт — БпЛА.docx", "Контрольний рапорт щодо БпЛА", "БпЛА: {{бпла_1_назва}}. Інвентарний номер: {{бпла_1_інвентарний_номер}}. Стан: {{бпла_1_статус}}. Примітка: {{бпла_1_примітка}}."),
        ("Контрольний рапорт — зв’язок.docx", "Контрольний рапорт щодо засобу зв’язку", "Засіб зв’язку: {{звʼязок_1_назва}}. Інвентарний номер: {{звʼязок_1_інвентарний_номер}}. Стан: {{звʼязок_1_статус}}. Примітка: {{звʼязок_1_примітка}}."),
        ("Контрольний рапорт — зброя та БК.docx", "Контрольний рапорт щодо зброї та БК", "Майно: {{зброя_та_бк_1_назва}}. Інвентарний номер: {{зброя_та_бк_1_інвентарний_номер}}. Стан: {{зброя_та_бк_1_статус}}. Примітка: {{зброя_та_бк_1_примітка}}."),
        ("Контрольний рапорт — військовослужбовець.docx", "Контрольний рапорт", "Доповідаю щодо {{військовий_1_звання:родовий}} {{військовий_1_піб:родовий}}. Посада: {{військовий_1_посада}}. Закріплений автомобіль: {{військовий_1_автомобіль_1_назва}} {{військовий_1_автомобіль_1_номер}}. Дата: {{дата_рапорту}}. Підписант: {{основний_підписант_посада}}, {{основний_підписант_звання}} {{основний_підписант_піб}}."),
        ("Контрольний — позиція.docx","Контроль позиції {{позиція_1_назва}}","Тип: {{позиція_1_тип}}. Смуга: {{позиція_1_смуга}}. Район: {{позиція_1_населений_пункт}}. БРО: {{позиція_1_бро}}. Сектор: {{позиція_1_сектор}}. Стан: {{позиція_1_стан}}. Розмір: {{позиція_1_розмір}}. MGRS: {{позиція_1_mgrs}}. БпЛА: {{позиція_1_бпла}}. Екіпаж: {{позиція_1_екіпаж}}. Примітка: {{позиція_1_примітка}}."),
        ("Контрольний — передача генератора екіпажу.docx","Передача генератора","{{дата_передачі_1}} передано {{генератор_1_назва}} № {{генератор_1_інвентарний_номер}} екіпажу {{екіпаж_1_назва}} для роботи на позиції {{позиція_1_назва}}. Стан: {{генератор_1_статус}}. Прийняв: {{військовий_1_звання:давальний}} {{військовий_1_піб:давальний}}."),
        ("Контрольний — зміна екіпажу на позиції.docx","Зміна екіпажу","З позиції {{позиція_1_назва}} вивести {{екіпаж_1_назва}}, натомість призначити {{екіпаж_2_назва}} з {{дата_початку_1}}. БРО {{номер_бойового_розпорядження_1}}. Район {{позиція_1_населений_пункт}}."),
        ("Контрольний — інцидент БпЛА.docx","Рапорт про інцидент","{{дата_та_час_події_1}} на позиції {{позиція_1_назва}} екіпажем {{екіпаж_1_назва}} втрачено {{бпла_1_назва}} № {{бпла_1_інвентарний_номер}}. Обставини: {{обставини_інциденту_1}}. Вжиті заходи: {{вжиті_заходи_1}}."),
        ("Контрольний — два військовослужбовці.docx","Контроль множинного вибору","Передати від {{військовий_1_звання:родовий}} {{військовий_1_піб:родовий}} до {{військовий_2_звання:давальний}} {{військовий_2_піб:давальний}}. Посади: {{військовий_1_посада:родовий}}; {{військовий_2_посада:давальний}}."),
        ("Контрольний — модифікатори.docx","Контроль модифікаторів","{{військовий_1_піб:великими}}; {{військовий_1_піб:маленькими}}; {{військовий_1_піб:з_великої}}; {{військовий_1_звання:орудний}}; {{військовий_1_посада:родовий}}; {{основний_підписант_посада:родовий}}."),
        ("Контрольний — повний комплекс.docx","Комплексний контроль програми","{{дата_рапорту_1}} {{військовий_1_звання:родовий}} {{військовий_1_піб:родовий}} у складі {{екіпаж_1_назва}} прибув автомобілем {{автомобіль_1_назва}} {{автомобіль_1_номер}} на {{позиція_1_назва}}. Майно: {{генератор_1_назва}}, {{бпла_1_назва}}, {{звʼязок_1_назва}}, {{зброя_та_бк_1_назва}}. Завдання: {{опис_завдання_1}}. Результат: {{результат_виконання_1}}. {{основний_підписант_звання}} {{основний_підписант_піб}}."),
        ("Контрольний — БЧС екіпажу.docx","Відомість екіпажу {{екіпаж_1_назва}}","Підрозділ: {{екіпаж_1_тип_підрозділу}}. Рота: {{екіпаж_1_рота}}. Взвод: {{екіпаж_1_взвод}}. Факт/штат: {{екіпаж_1_фактична_кількість}}/{{екіпаж_1_штатна_кількість}}. Статус: {{екіпаж_1_статус}}. БпАК: {{екіпаж_1_назва_бпак}} {{екіпаж_1_тип_бпак}}. БРО: {{екіпаж_1_бро}}. Сектор: {{екіпаж_1_сектор}}. Склад: {{екіпаж_1_склад}}."),
        ("Контрольний — довільні параметри.docx","Контроль параметрів","Адресат: {{адресат_1}}. Номер: {{вихідний_номер_1}}. Період: {{дата_початку_1}} — {{дата_закінчення_1}}. Маршрут: {{маршрут_1}}. Кількість: {{кількість_1}}. Примітка: {{додаткова_інформація_1}}."),
        ("ТЕСТ 01 Військовослужбовець екіпаж і автомобіль.docx","Військовослужбовець, екіпаж і автомобіль","{{військовий_1_звання}} {{військовий_1_піб}}, {{військовий_1_посада}}. Офіційний екіпаж: {{військовий_1_екіпаж}}, позиція {{військовий_1_екіпаж_позиція}}. Фактичний екіпаж: {{військовий_1_фактичний_екіпаж}}, позиція {{військовий_1_фактичний_екіпаж_позиція}}. Автомобіль: {{військовий_1_автомобіль_1_назва}} {{військовий_1_автомобіль_1_номер}}."),
        ("ТЕСТ 02 Паспорт екіпажу та всього майна.docx","Паспорт екіпажу та закріпленого майна","Екіпаж {{екіпаж_1_назва}}, статус {{екіпаж_1_статус}}, позиція {{екіпаж_1_позиція}}, БпАК {{екіпаж_1_назва_бпак}} {{екіпаж_1_тип_бпак}}. Командир: {{екіпаж_1_командир_піб}}. Офіційний склад: {{екіпаж_1_офіційний_склад}}. Фактичний склад: {{екіпаж_1_фактичний_склад}}. Автомобілі: {{екіпаж_1_автомобілі}}. БпЛА: {{екіпаж_1_бпла}}. Генератори: {{екіпаж_1_генератори}}. Зв’язок: {{екіпаж_1_засоби_звязку}}. Зброя та БК: {{екіпаж_1_зброя_та_бк}}."),
        ("ТЕСТ 03 Автомобіль водій і екіпаж.docx","Автомобіль, водій і екіпаж","Автомобіль {{автомобіль_1_назва}}, номер {{автомобіль_1_номер}}, стан {{автомобіль_1_статус}}. Водій: {{автомобіль_1_водій_звання}} {{автомобіль_1_водій_піб}}, посада {{автомобіль_1_водій_посада}}. Екіпаж: {{автомобіль_1_екіпаж}}."),
        ("ТЕСТ 04 Майно екіпажі позиції відповідальні.docx","Майно, екіпажі, позиції та відповідальні","Генератор: {{генератор_1_назва}}, екіпаж {{генератор_1_екіпаж}}, позиція {{генератор_1_позиція}}, відповідальний {{генератор_1_відповідальний_піб}}. БпЛА: {{бпла_1_назва}}, екіпаж {{бпла_1_екіпаж}}, позиція {{бпла_1_позиція}}, відповідальний {{бпла_1_відповідальний_піб}}. Зв’язок: {{звʼязок_1_назва}}, екіпаж {{звʼязок_1_екіпаж}}, відповідальний {{звʼязок_1_відповідальний_піб}}. Зброя: {{зброя_та_бк_1_назва}}, відповідальний {{зброя_та_бк_1_відповідальний_піб}}."),
    ];
    for (name, title, body) in templates {
        let path = directory.join(name);
        if path.exists() {
            continue;
        }
        create_simple_report_template(&path, title, body)?;
    }
    Ok(())
}

fn create_simple_report_template(path: &Path, title: &str, body: &str) -> Result<(), String> {
    let file = fs::File::create(path)
        .map_err(|_| "Не вдалося створити контрольний шаблон.".to_string())?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let document = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{title}</w:t></w:r></w:p><w:p><w:r><w:t>{body}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>"#
    );
    for (name, contents) in [
        (
            "[Content_Types].xml",
            r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#,
        ),
        (
            "_rels/.rels",
            r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#,
        ),
        ("word/document.xml", document.as_str()),
    ] {
        archive
            .start_file(name, options)
            .map_err(|_| "Не вдалося сформувати контрольний шаблон.".to_string())?;
        archive
            .write_all(contents.as_bytes())
            .map_err(|_| "Не вдалося записати контрольний шаблон.".to_string())?;
    }
    archive
        .finish()
        .map_err(|_| "Не вдалося завершити контрольний шаблон.".to_string())?;
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
            r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>РАПОРТ</w:t></w:r></w:p><w:p><w:r><w:t>Доповідаю про автомобіль {{автомобіль_1_назва}}, державний номер {{автомобіль_1_номер}}.</w:t></w:r></w:p><w:p><w:r><w:t>Технічний стан: {{автомобіль_1_статус}}.</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>"#,
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

fn main() {
    let context = tauri::generate_context!();
    let simple_edition = context
        .config()
        .product_name
        .as_deref()
        .is_some_and(|name| name.contains("проста версія"));
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let root = ensure_application_structure_for_edition(
                app.handle(),
                is_simple_edition(app.handle()),
            )
            .map_err(io::Error::other)?;
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
        });

    let app = if simple_edition {
        builder.invoke_handler(tauri::generate_handler![
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
            get_startup_warnings,
            get_app_settings,
            update_signer_settings,
            add_signer,
            delete_signer,
            update_visible_personnel_columns,
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
            list_generated_reports
        ])
    } else {
        builder.invoke_handler(tauri::generate_handler![
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
            export_bcs_excel,
            flight_plan::export_flight_plan_excel,
            operations::update_bcs_crew_strength,
            temporary_personnel::list_temporary_personnel,
            temporary_personnel::save_temporary_personnel,
            temporary_personnel::delete_temporary_personnel,
            list_generated_reports,
            operations::list_vehicles,
            operations::create_vehicle,
            operations::assign_vehicle,
            operations::update_vehicle_status,
            operations::delete_vehicle,
            operations::list_crews,
            operations::create_crew,
            operations::update_crew,
            operations::delete_crew,
            operations::list_staffing_records,
            operations::sync_flight_plan_locations,
            operations::update_staffing_personnel,
            operations::transfer_staffing_chain,
            operations::create_staff_recommendation,
            operations::list_staff_recommendations,
            operations::create_vacancy_recommendation,
            operations::list_vacancy_recommendations,
            operations::list_positions,
            operations::create_position,
            operations::update_position,
            operations::delete_position,
            operations::list_equipment,
            operations::create_equipment,
            operations::update_equipment,
            operations::assign_equipment,
            operations::delete_equipment,
            operations::list_incidents,
            operations::create_incident,
            update_unit_settings
        ])
    };

    app.run(context).expect("Не вдалося запустити застосунок");
}

#[cfg(test)]
mod tests;
