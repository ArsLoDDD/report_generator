use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

struct AppState(Mutex<Connection>);
#[derive(Serialize)] #[serde(rename_all = "camelCase")]
struct Person { id: i64, rank: String, full_name: String, position: String, unit: String }
#[derive(Serialize)] #[serde(rename_all = "camelCase")]
struct Report { id: i64, template_id: Option<i64>, person_id: Option<i64>, title: String, status: String, created_at: String }
#[derive(Deserialize)] #[serde(rename_all = "camelCase")]
struct ReportDraft { template_id: Option<i64>, person_id: Option<i64>, title: String, status: String }

#[tauri::command]
fn list_people(state: tauri::State<AppState>) -> Result<Vec<Person>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let mut statement = db.prepare("SELECT id, rank, full_name, position, unit FROM people ORDER BY full_name").map_err(|e| e.to_string())?;
    let people = statement.query_map([], |row| Ok(Person { id: row.get(0)?, rank: row.get(1)?, full_name: row.get(2)?, position: row.get(3)?, unit: row.get(4)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(people)
}
#[tauri::command]
fn list_reports(state: tauri::State<AppState>) -> Result<Vec<Report>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let mut statement = db.prepare("SELECT id, template_id, person_id, title, status, created_at FROM reports ORDER BY id DESC").map_err(|e| e.to_string())?;
    let reports = statement.query_map([], |row| Ok(Report { id: row.get(0)?, template_id: row.get(1)?, person_id: row.get(2)?, title: row.get(3)?, status: row.get(4)?, created_at: row.get(5)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(reports)
}
#[tauri::command]
fn create_report(state: tauri::State<AppState>, draft: ReportDraft) -> Result<Report, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.execute("INSERT INTO reports (template_id, person_id, title, status) VALUES (?1, ?2, ?3, ?4)", params![draft.template_id, draft.person_id, draft.title, draft.status]).map_err(|e| e.to_string())?;
    let id = db.last_insert_rowid();
    db.query_row("SELECT id, template_id, person_id, title, status, created_at FROM reports WHERE id = ?1", [id], |row| Ok(Report { id: row.get(0)?, template_id: row.get(1)?, person_id: row.get(2)?, title: row.get(3)?, status: row.get(4)?, created_at: row.get(5)? })).map_err(|e| e.to_string())
}
fn initialise_db() -> Connection {
    let db = Connection::open("reports.db").expect("Could not open SQLite database");
    db.execute_batch("CREATE TABLE IF NOT EXISTS people (id INTEGER PRIMARY KEY, rank TEXT NOT NULL, full_name TEXT NOT NULL, position TEXT NOT NULL, unit TEXT NOT NULL); CREATE TABLE IF NOT EXISTS templates (id INTEGER PRIMARY KEY, name TEXT NOT NULL, source_path TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY, template_id INTEGER, person_id INTEGER, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(template_id) REFERENCES templates(id), FOREIGN KEY(person_id) REFERENCES people(id));").expect("Could not initialise database");
    db
}
fn main() { tauri::Builder::default().plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_fs::init()).manage(AppState(Mutex::new(initialise_db()))).invoke_handler(tauri::generate_handler![list_people, list_reports, create_report]).run(tauri::generate_context!()).expect("error while running application"); }
