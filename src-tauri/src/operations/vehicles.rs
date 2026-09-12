use super::{busy, Vehicle};
use crate::AppState;

#[tauri::command]
pub fn list_vehicles(state: tauri::State<AppState>) -> Result<Vec<Vehicle>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut q=db.connection.prepare("SELECT v.id,v.name,v.registration_number,v.status,v.personnel_id,CASE WHEN p.id IS NULL THEN NULL ELSE trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) END,v.crew_id,c.name FROM vehicles v LEFT JOIN personnel p ON p.id=v.personnel_id LEFT JOIN crews c ON c.id=v.crew_id ORDER BY v.id").map_err(|_|"Не вдалося прочитати автомобілі.".to_string())?;
    let result = q
        .query_map([], |r| {
            Ok(Vehicle {
                id: r.get(0)?,
                name: r.get(1)?,
                registration_number: r.get(2)?,
                status: r.get(3)?,
                personnel_id: r.get(4)?,
                driver_name: r.get(5)?,
                crew_id: r.get(6)?,
                crew_name: r.get(7)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати автомобілі.".to_string());
    result
}
#[tauri::command]
pub fn create_vehicle(
    state: tauri::State<AppState>,
    name: String,
    registration_number: String,
    status: String,
    personnel_id: Option<i64>,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute(
            "INSERT INTO vehicles(name,registration_number,status,personnel_id,crew_id) VALUES (?1,?2,?3,?4,(SELECT crew_id FROM crew_actual_members WHERE personnel_id=?4 UNION SELECT crew_id FROM crew_members WHERE personnel_id=?4 AND left_at IS NULL LIMIT 1))",
            rusqlite::params![name.trim(), registration_number.trim(), status, personnel_id],
        )
        .map_err(|_| "Не вдалося додати автомобіль.".to_string())?;
    let id = db.connection.last_insert_rowid();
    db.connection.execute("INSERT INTO vehicle_custom_fields(vehicle_id,field_key,field_value) SELECT ?1,field_key,initial_value FROM vehicle_custom_field_definitions",[id]).map_err(|_|"Не вдалося встановити кастомні поля автомобіля.".to_string())?;
    Ok(())
}
#[tauri::command]
pub fn assign_vehicle(
    state: tauri::State<AppState>,
    vehicle_id: i64,
    personnel_id: Option<i64>,
    _crew_id: Option<i64>,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    if let Some(id) = personnel_id {
        db.connection
            .query_row("SELECT id FROM personnel WHERE id=?1", [id], |r| {
                r.get::<_, i64>(0)
            })
            .map_err(|_| "Військовослужбовця не знайдено.".to_string())?;
    }
    let crew_id = personnel_id.and_then(|id| db.connection.query_row(
        "SELECT crew_id FROM crew_actual_members WHERE personnel_id=?1 UNION SELECT crew_id FROM crew_members WHERE personnel_id=?1 AND left_at IS NULL LIMIT 1",
        [id], |r| r.get::<_, i64>(0)).ok());
    db.connection
        .execute(
            "UPDATE vehicles SET personnel_id=?1, crew_id=?2 WHERE id=?3",
            rusqlite::params![personnel_id, crew_id, vehicle_id],
        )
        .map_err(|_| "Не вдалося змінити закріплення автомобіля.".to_string())?;
    Ok(())
}
#[tauri::command]
pub fn update_vehicle_status(
    state: tauri::State<AppState>,
    vehicle_id: i64,
    status: String,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute(
            "UPDATE vehicles SET status=?1 WHERE id=?2",
            rusqlite::params![status, vehicle_id],
        )
        .map_err(|_| "Не вдалося змінити статус автомобіля.".to_string())
        .map(|_| ())
}
#[tauri::command]
pub fn delete_vehicle(state: tauri::State<AppState>, vehicle_id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute("DELETE FROM vehicles WHERE id=?1", [vehicle_id])
        .map_err(|_| "Не вдалося видалити автомобіль.".to_string())
        .map(|_| ())
}
