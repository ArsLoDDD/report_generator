mod database;
mod personnel;
mod report_generation;

use rusqlite::Connection;
use serde::Serialize;
use std::{fs, io, path::{Path, PathBuf}, process::Command, sync::Mutex};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

struct AppState(Mutex<Connection>);

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

const STARTER_TEMPLATES: [(&str, &[u8]); 3] = [
    ("Рапорт на відпустку.docx", include_bytes!("../templates/Рапорт на відпустку.docx")),
    ("Рапорт на матеріальну допомогу.docx", include_bytes!("../templates/Рапорт на матеріальну допомогу.docx")),
    ("Список військовослужбовців.docx", include_bytes!("../templates/Список військовослужбовців.docx")),
];

fn application_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|_| "Не вдалося визначити папку даних програми.".to_string())?;
    fs::create_dir_all(&directory).map_err(|_| "Не вдалося створити папку даних програми.".to_string())?;
    Ok(directory)
}

fn ensure_application_structure(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let root = application_root(app)?;
    for directory in ["Database", "Templates", "Signatures", "Reports", "DB_Backups", "Config"] {
        fs::create_dir_all(root.join(directory)).map_err(|_| format!("Не вдалося створити папку «{directory}»."))?;
    }
    let settings_path = root.join("Config").join("settings.json");
    if !settings_path.exists() {
        fs::write(settings_path, r#"{
  "databasePath": "Database/personnel.db",
  "templatesPath": "Templates",
  "signaturesPath": "Signatures",
  "reportsPath": "Reports",
  "backupsPath": "DB_Backups"
}"#).map_err(|_| "Не вдалося створити файл налаштувань.".to_string())?;
    }
    Ok(root)
}

fn templates_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_application_structure(app)?.join("Templates"))
}

fn seed_starter_templates(app: &tauri::AppHandle) -> Result<(), String> {
    let directory = templates_directory(app)?;
    for (name, content) in STARTER_TEMPLATES {
        let path = directory.join(name);
        if !path.exists() {
            fs::write(path, content).map_err(|_| "Не вдалося створити стартовий DOCX-шаблон.".to_string())?;
        }
    }
    Ok(())
}

fn template_description(file_name: &str) -> (&'static str, u16) {
    match file_name {
        "Рапорт на відпустку.docx" => ("Рапорт на надання відпустки військовослужбовцю", 7),
        "Рапорт на матеріальну допомогу.docx" => ("Рапорт на отримання матеріальної допомоги", 8),
        "Список військовослужбовців.docx" => ("Приклад шаблону з кількома військовослужбовцями", 10),
        _ => ("Локальний DOCX-шаблон рапорту", 0),
    }
}

fn open_database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let root = ensure_application_structure(app)?;
    let database_path = root.join("Database").join("personnel.db");
    let legacy_database_path = root.join("reports.db");
    if !database_path.exists() && legacy_database_path.exists() {
        fs::copy(legacy_database_path, &database_path).map_err(|_| "Не вдалося перенести наявну базу даних у папку Database.".to_string())?;
    }
    let connection = Connection::open(database_path).map_err(|_| "Не вдалося відкрити базу даних програми.".to_string())?;
    database::initialise(&connection)?;
    Ok(connection)
}

#[tauri::command]
fn list_personnel(state: tauri::State<AppState>) -> Result<Vec<personnel::Personnel>, String> {
    let connection = state.0.lock().map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    personnel::list(&connection)
}

#[tauri::command]
fn create_personnel(state: tauri::State<AppState>, draft: personnel::PersonnelDraft) -> Result<personnel::Personnel, String> {
    let connection = state.0.lock().map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    personnel::create(&connection, draft)
}

#[tauri::command]
fn update_personnel(state: tauri::State<AppState>, personnel_id: i64, draft: personnel::PersonnelDraft) -> Result<personnel::Personnel, String> {
    let connection = state.0.lock().map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    personnel::update(&connection, personnel_id, draft)
}

#[tauri::command]
fn list_templates(app: tauri::AppHandle) -> Result<Vec<TemplateFile>, String> {
    let directory = templates_directory(&app)?;
    let mut templates = fs::read_dir(directory).map_err(|_| "Не вдалося відкрити папку шаблонів.".to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("docx")))
        .filter_map(|path| {
            let file_name = path.file_name()?.to_str()?.to_string();
            let (description, variables) = template_description(&file_name);
            Some(TemplateFile { name: path.file_stem()?.to_str()?.to_string(), description: description.to_string(), changed: "Локальний файл".to_string(), status: "ready".to_string(), variables, source_path: path.to_string_lossy().to_string() })
        }).collect::<Vec<_>>();
    templates.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(templates)
}

#[tauri::command]
fn select_template_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = app.dialog().file().add_filter("Шаблони DOCX", &["docx"]).blocking_pick_file();
    match file {
        Some(path) => Ok(Some(path.into_path().map_err(|_| "Не вдалося прочитати шлях до вибраного шаблону.".to_string())?.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
fn validate_template(state: tauri::State<AppState>, template_path: String, personnel_ids: Vec<i64>) -> Result<report_generation::TemplateValidationResult, String> {
    let connection = state.0.lock().map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    Ok(report_generation::validate(&connection, &template_path, &personnel_ids))
}

#[tauri::command]
fn generate_report(app: tauri::AppHandle, state: tauri::State<AppState>, request: report_generation::GenerateReportRequest) -> Result<report_generation::GeneratedReport, String> {
    let connection = state.0.lock().map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    let root = ensure_application_structure(&app)?;
    report_generation::generate(&connection, &root, request)
}

fn ensure_reports_item(app: &tauri::AppHandle, requested_path: &str) -> Result<PathBuf, String> {
    let reports_root = ensure_application_structure(app)?.join("Reports").canonicalize().map_err(|_| "Не вдалося відкрити папку рапортів.".to_string())?;
    let item = Path::new(requested_path).canonicalize().map_err(|_| "Файл або папку рапорту не знайдено.".to_string())?;
    if !item.starts_with(&reports_root) { return Err("Можна відкривати лише файли та папки зі структури Reports.".to_string()); }
    Ok(item)
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(path).spawn();
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer").arg(path).spawn();
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(path).spawn();
    result.map(|_| ()).map_err(|_| "Не вдалося відкрити файл або папку. Перевірте, чи є програма для DOCX-файлів.".to_string())
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
fn list_generated_reports(app: tauri::AppHandle) -> Result<Vec<GeneratedReportFile>, String> {
    let reports_directory = ensure_application_structure(&app)?.join("Reports");
    let mut reports = Vec::new();
    for date_entry in fs::read_dir(&reports_directory).map_err(|_| "Не вдалося відкрити папку рапортів.".to_string())?.filter_map(Result::ok) {
        if !date_entry.path().is_dir() { continue; }
        let date = date_entry.file_name().to_string_lossy().to_string();
        for report_entry in fs::read_dir(date_entry.path()).map_err(|_| "Не вдалося прочитати папку згенерованих рапортів.".to_string())?.filter_map(Result::ok) {
            let folder_path = report_entry.path();
            if !folder_path.is_dir() || folder_path.file_name().and_then(|value| value.to_str()).is_some_and(|value| value.starts_with('.')) { continue; }
            let docx_path = fs::read_dir(&folder_path).ok().and_then(|entries| entries.filter_map(Result::ok).map(|entry| entry.path()).find(|path| path.extension().and_then(|value| value.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("docx"))));
            let Some(docx_path) = docx_path else { continue; };
            let template = docx_path.file_stem().and_then(|value| value.to_str()).unwrap_or("Рапорт").to_string();
            let folder_name = folder_path.file_name().and_then(|value| value.to_str()).unwrap_or(&template);
            let generated_at = folder_name.strip_prefix(&(template.clone() + " ")).map_or(date.clone(), |time| format!("{date} {}", time.replace('-', ":")));
            reports.push(GeneratedReportFile { name: template.clone(), template, generated_at, docx_path: docx_path.to_string_lossy().to_string(), folder_path: folder_path.to_string_lossy().to_string() });
        }
    }
    reports.sort_by(|left, right| right.generated_at.cmp(&left.generated_at));
    Ok(reports)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            ensure_application_structure(app.handle()).map_err(io::Error::other)?;
            let connection = open_database(app.handle()).map_err(io::Error::other)?;
            seed_starter_templates(app.handle()).map_err(io::Error::other)?;
            app.manage(AppState(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_personnel, create_personnel, update_personnel, list_templates, select_template_file, validate_template, generate_report, open_generated_report, open_generated_report_folder, list_generated_reports])
        .run(tauri::generate_context!())
        .expect("Не вдалося запустити застосунок");
}
