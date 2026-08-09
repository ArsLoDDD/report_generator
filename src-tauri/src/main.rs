mod database;
mod personnel;
mod report_generation;
mod settings;

use chrono::{DateTime, Local};
use rusqlite::Connection;
use serde::Serialize;
use std::{
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use zip::{
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TemplatesPage {
    items: Vec<TemplateFile>,
    total_count: u64,
}

const STARTER_TEMPLATES: [(&str, &[u8]); 3] = [
    (
        "Рапорт на відпустку.docx",
        include_bytes!("../templates/Рапорт на відпустку.docx"),
    ),
    (
        "Рапорт на відпустку з датою.docx",
        include_bytes!("../templates/Рапорт на відпустку з датою.docx"),
    ),
    (
        "Рапорт на матеріальну допомогу.docx",
        include_bytes!("../templates/Рапорт на матеріальну допомогу.docx"),
    ),
];

pub const DATABASE_FILE_NAME: &str = "особовий_склад.db";
pub const LEGACY_DATABASE_DIRECTORY_NAME: &str = "База даних";
pub const TEMPLATES_DIRECTORY_NAME: &str = "Шаблони";
pub const REPORTS_DIRECTORY_NAME: &str = "Згенеровані рапорти";
pub const BACKUPS_DIRECTORY_NAME: &str = "Резервні копії";
pub const CONFIG_DIRECTORY_NAME: &str = "Налаштування";
pub const CUSTOM_VARIABLES_FILE_NAME: &str = "custom_variables.json";

#[cfg(target_os = "windows")]
fn application_root(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let executable = std::env::current_exe()
        .map_err(|_| "Не вдалося визначити розташування програми.".to_string())?;
    let directory = executable
        .parent()
        .ok_or_else(|| "Не вдалося визначити папку програми.".to_string())?
        .to_path_buf();
    fs::create_dir_all(&directory)
        .map_err(|_| "Не вдалося створити робочу папку програми.".to_string())?;
    Ok(directory)
}

#[cfg(not(target_os = "windows"))]
fn application_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "Не вдалося визначити папку даних програми.".to_string())?;
    fs::create_dir_all(&directory)
        .map_err(|_| "Не вдалося створити папку даних програми.".to_string())?;
    Ok(directory)
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
        CONFIG_DIRECTORY_NAME,
    ] {
        fs::create_dir_all(root.join(directory))
            .map_err(|_| format!("Не вдалося створити папку «{directory}»."))?;
    }
    settings::load(&root)?;
    Ok(root)
}

fn templates_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_application_structure(app)?.join(TEMPLATES_DIRECTORY_NAME))
}

fn seed_starter_templates(app: &tauri::AppHandle) -> Result<(), String> {
    let directory = templates_directory(app)?;
    for (name, content) in STARTER_TEMPLATES {
        let path = directory.join(name);
        if !path.exists() {
            fs::write(path, content)
                .map_err(|_| "Не вдалося створити стартовий DOCX-шаблон.".to_string())?;
        }
    }
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
            r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Тест повної перевірки шаблону</w:t></w:r></w:p><w:p><w:r><w:t>{{військовий_1_невідоме}}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>"#,
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
    let (database_path, database_was_missing) = prepare_database_path(&root)?;
    let database = connect_database(database_path, database_was_missing)?;
    let executable_root = executable_root()?;
    database::sync_custom_fields_file(&database.connection, &executable_root, CUSTOM_VARIABLES_FILE_NAME)?;
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
            message: "Папка не містила DOCX-файлів. Стартові шаблони відновлено автоматично."
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
fn list_custom_fields(
    _app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<database::CustomFieldDefinition>, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    let root = executable_root()?;
    if root.join(CUSTOM_VARIABLES_FILE_NAME).exists() {
        database::load_custom_fields_file(&root, CUSTOM_VARIABLES_FILE_NAME)
    } else {
        database::list_custom_fields(&database.connection)
    }
}

#[tauri::command]
fn create_custom_field(
    _app: tauri::AppHandle,
    state: tauri::State<AppState>,
    field: database::CustomFieldDefinition,
) -> Result<database::CustomFieldDefinition, String> {
    let mut database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    ensure_persistent_database(&mut database)?;
    let root = executable_root()?;
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
fn get_startup_warnings(state: tauri::State<AppState>) -> Vec<StartupWarning> {
    state.1.clone()
}

#[tauri::command]
fn get_app_settings(app: tauri::AppHandle) -> Result<settings::AppSettings, String> {
    settings::load(&ensure_application_structure(&app)?)
}

#[tauri::command]
fn update_signer_settings(
    app: tauri::AppHandle,
    role: String,
    signer: settings::SignerSettings,
) -> Result<settings::AppSettings, String> {
    settings::update_signer(&ensure_application_structure(&app)?, &role, signer)
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
) -> Result<report_generation::TemplateValidationResult, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    Ok(report_generation::validate(
        &database.connection,
        &template_path,
        &personnel_ids,
        report_date.as_deref(),
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
            seed_starter_templates(app.handle()).map_err(io::Error::other)?;
            app.manage(AppState(Mutex::new(database), warnings));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_personnel,
            create_personnel,
            update_personnel,
            delete_personnel,
            list_custom_fields,
            create_custom_field,
            get_startup_warnings,
            get_app_settings,
            update_signer_settings,
            list_templates,
            select_template_file,
            inspect_template,
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
            list_generated_reports
        ])
        .run(tauri::generate_context!())
        .expect("Не вдалося запустити застосунок");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_a_template_with_an_intentional_validation_error() {
        let directory = std::env::temp_dir().join(format!(
            "report-generator-invalid-template-{}",
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
            .any(|error| error.contains("військовий_1_невідоме")));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn migrates_the_legacy_database_into_the_application_root() {
        let root = std::env::temp_dir().join(format!(
            "report-generator-database-migration-{}",
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
            "report-generator-delayed-database-{}",
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
            "report-generator-template-path-{}",
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
}
