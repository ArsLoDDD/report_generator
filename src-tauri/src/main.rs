mod database;
mod personnel;

use rusqlite::Connection;
use std::{fs, io, path::PathBuf, sync::Mutex};
use tauri::Manager;

struct AppState(Mutex<Connection>);

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let connection = open_database(app.handle()).map_err(io::Error::other)?;
            app.manage(AppState(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_personnel, create_personnel, update_personnel])
        .run(tauri::generate_context!())
        .expect("Не вдалося запустити застосунок");
}
