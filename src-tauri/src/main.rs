mod database;
mod personnel;
mod report_generation;
mod settings;
mod xlsx;

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
    settings::load(&root)?;
    Ok(root)
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

#[tauri::command]
fn list_vehicles(state: tauri::State<AppState>) -> Result<Vec<Vehicle>, String> {
    let db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let mut query = db.connection.prepare("SELECT v.id,v.name,v.registration_number,v.status,v.personnel_id,CASE WHEN p.id IS NULL THEN NULL ELSE trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) END FROM vehicles v LEFT JOIN personnel p ON p.id=v.personnel_id ORDER BY v.name").map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?;
    let result = query
        .query_map([], |row| {
            Ok(Vehicle {
                id: row.get(0)?,
                name: row.get(1)?,
                registration_number: row.get(2)?,
                status: row.get(3)?,
                personnel_id: row.get(4)?,
                driver_name: row.get(5)?,
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
            "UPDATE vehicles SET personnel_id=?1 WHERE id=?2",
            rusqlite::params![personnel_id, vehicle_id],
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
            delete_vehicle
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
}
