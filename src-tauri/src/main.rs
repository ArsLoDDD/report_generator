mod database;
mod personnel;
mod report_generation;

use rusqlite::Connection;
use serde::Serialize;
use std::{fs, io, path::PathBuf, sync::Mutex};
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

const STARTER_TEMPLATES: [(&str, &[u8]); 3] = [
    ("Рапорт на відпустку.docx", include_bytes!("../templates/Рапорт на відпустку.docx")),
    ("Рапорт на матеріальну допомогу.docx", include_bytes!("../templates/Рапорт на матеріальну допомогу.docx")),
    ("Список військовослужбовців.docx", include_bytes!("../templates/Список військовослужбовців.docx")),
];

fn templates_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|_| "Не вдалося визначити папку шаблонів.".to_string())?.join("Templates");
    fs::create_dir_all(&directory).map_err(|_| "Не вдалося створити папку шаблонів.".to_string())?;
    Ok(directory)
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
    let app_data_directory: PathBuf = app.path().app_data_dir().map_err(|_| "Не вдалося визначити папку даних програми.".to_string())?;
    fs::create_dir_all(&app_data_directory).map_err(|_| "Не вдалося створити папку даних програми.".to_string())?;
    let connection = Connection::open(app_data_directory.join("reports.db")).map_err(|_| "Не вдалося відкрити базу даних програми.".to_string())?;
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
    let app_data_directory = app.path().app_data_dir().map_err(|_| "Не вдалося визначити папку даних програми.".to_string())?;
    report_generation::generate(&connection, &app_data_directory, request)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let connection = open_database(app.handle()).map_err(io::Error::other)?;
            seed_starter_templates(app.handle()).map_err(io::Error::other)?;
            app.manage(AppState(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_personnel, create_personnel, update_personnel, list_templates, select_template_file, validate_template, generate_report])
        .run(tauri::generate_context!())
        .expect("Не вдалося запустити застосунок");
}
