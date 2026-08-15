//! Контракти й команди операційного обліку: автомобілі, екіпажі, майно та інциденти.
use crate::AppState;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vehicle {
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
pub struct Crew {
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
pub struct CrewMember {
    pub personnel_id: i64,
    pub full_name: String,
    rank: String,
    position: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewDraft {
    name: String,
    platoon: String,
    position_name: String,
    reconnaissance_area: String,
    #[serde(default)]
    member_ids: Vec<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Equipment {
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
pub struct EquipmentDraft {
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
pub struct Incident {
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
pub struct IncidentDraft {
    incident_type: String,
    occurred_at: String,
    crew_id: Option<i64>,
    equipment_id: Option<i64>,
    position_name: String,
    reconnaissance_area: String,
    description: String,
}

fn busy() -> String {
    "База даних тимчасово зайнята.".into()
}
#[tauri::command]
pub fn list_vehicles(state: tauri::State<AppState>) -> Result<Vec<Vehicle>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut q=db.connection.prepare("SELECT v.id,v.name,v.registration_number,v.status,v.personnel_id,CASE WHEN p.id IS NULL THEN NULL ELSE trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) END,v.crew_id,c.name FROM vehicles v LEFT JOIN personnel p ON p.id=v.personnel_id LEFT JOIN crews c ON c.id=v.crew_id ORDER BY v.name").map_err(|_|"Не вдалося прочитати автомобілі.".to_string())?;
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
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute(
            "INSERT INTO vehicles(name,registration_number,status) VALUES (?1,?2,?3)",
            rusqlite::params![name.trim(), registration_number.trim(), status],
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
    crew_id: Option<i64>,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    if let Some(id) = personnel_id {
        let position: String = db
            .connection
            .query_row("SELECT position FROM personnel WHERE id=?1", [id], |r| {
                r.get(0)
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
pub(crate) fn crew_members(
    connection: &Connection,
    crew_id: i64,
) -> Result<Vec<CrewMember>, String> {
    let mut s=connection.prepare("SELECT p.id, trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic), p.rank, p.position FROM crew_members cm JOIN personnel p ON p.id=cm.personnel_id WHERE cm.crew_id=?1 AND cm.left_at IS NULL ORDER BY cm.joined_at, p.id").map_err(|_|"Не вдалося прочитати склад екіпажу.".to_string())?;
    let result = s
        .query_map([crew_id], |r| {
            Ok(CrewMember {
                personnel_id: r.get(0)?,
                full_name: r.get(1)?,
                rank: r.get(2)?,
                position: r.get(3)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string());
    result
}
#[tauri::command]
pub fn list_crews(state: tauri::State<AppState>) -> Result<Vec<Crew>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut s=db.connection.prepare("SELECT c.id,c.name,c.platoon,c.position_name,c.reconnaissance_area,COUNT(cm.id) FROM crews c LEFT JOIN crew_members cm ON cm.crew_id=c.id AND cm.left_at IS NULL GROUP BY c.id ORDER BY c.platoon COLLATE NOCASE,c.name COLLATE NOCASE").map_err(|_|"Не вдалося прочитати екіпажі.".to_string())?;
    let rows = s
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, i64>(5)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?;
    rows.into_iter()
        .map(
            |(id, name, platoon, position_name, reconnaissance_area, member_count)| {
                Ok(Crew {
                    id,
                    name,
                    platoon,
                    position_name,
                    reconnaissance_area,
                    member_count,
                    members: crew_members(&db.connection, id)?,
                })
            },
        )
        .collect()
}
#[tauri::command]
pub fn create_crew(state: tauri::State<AppState>, draft: CrewDraft) -> Result<(), String> {
    if draft.name.trim().is_empty() {
        return Err("Вкажіть назву екіпажу.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute(
            "INSERT INTO crews(name,platoon,position_name,reconnaissance_area) VALUES(?1,?2,?3,?4)",
            rusqlite::params![
                draft.name.trim(),
                draft.platoon.trim(),
                draft.position_name.trim(),
                draft.reconnaissance_area.trim()
            ],
        )
        .map_err(|_| "Не вдалося створити екіпаж. Перевірте унікальність назви.".to_string())?;
    let id = db.connection.last_insert_rowid();
    for personnel_id in draft.member_ids {
        db.connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id) VALUES(?1,?2)",
                rusqlite::params![id, personnel_id],
            )
            .map_err(|_| "Не вдалося додати учасника екіпажу.".to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn update_crew(
    state: tauri::State<AppState>,
    crew_id: i64,
    draft: CrewDraft,
) -> Result<(), String> {
    if draft.name.trim().is_empty() {
        return Err("Вкажіть назву екіпажу.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection.execute("UPDATE crews SET name=?1,platoon=?2,position_name=?3,reconnaissance_area=?4 WHERE id=?5",rusqlite::params![draft.name.trim(),draft.platoon.trim(),draft.position_name.trim(),draft.reconnaissance_area.trim(),crew_id]).map_err(|_|"Не вдалося оновити екіпаж.".to_string())?;
    db.connection.execute("UPDATE crew_members SET left_at=CURRENT_TIMESTAMP WHERE crew_id=?1 AND left_at IS NULL",[crew_id]).map_err(|_|"Не вдалося оновити склад екіпажу.".to_string())?;
    for personnel_id in draft.member_ids {
        db.connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id) VALUES(?1,?2)",
                rusqlite::params![crew_id, personnel_id],
            )
            .map_err(|_| "Не вдалося оновити склад екіпажу.".to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub fn delete_crew(state: tauri::State<AppState>, crew_id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute("DELETE FROM crews WHERE id=?1", [crew_id])
        .map_err(|_| "Не вдалося видалити екіпаж.".to_string())?;
    Ok(())
}
#[tauri::command]
pub fn list_equipment(
    state: tauri::State<AppState>,
    category: String,
) -> Result<Vec<Equipment>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut s=db.connection.prepare("SELECT e.id,e.category,e.name,e.inventory_number,e.status,e.crew_id,c.name,e.personnel_id,CASE WHEN p.id IS NULL THEN NULL ELSE trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) END,e.notes FROM equipment e LEFT JOIN crews c ON c.id=e.crew_id LEFT JOIN personnel p ON p.id=e.personnel_id WHERE e.category=?1 ORDER BY e.name COLLATE NOCASE,e.id").map_err(|_|"Не вдалося прочитати майно.".to_string())?;
    let result = s
        .query_map([category], |r| {
            Ok(Equipment {
                id: r.get(0)?,
                category: r.get(1)?,
                name: r.get(2)?,
                inventory_number: r.get(3)?,
                status: r.get(4)?,
                crew_id: r.get(5)?,
                crew_name: r.get(6)?,
                personnel_id: r.get(7)?,
                holder_name: r.get(8)?,
                notes: r.get(9)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати майно.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати майно.".to_string());
    result
}
#[tauri::command]
pub fn create_equipment(
    state: tauri::State<AppState>,
    draft: EquipmentDraft,
) -> Result<(), String> {
    if draft.name.trim().is_empty() {
        return Err("Вкажіть назву запису.".into());
    }
    if !["generator", "uav", "communications", "weapon_ammo"].contains(&draft.category.as_str()) {
        return Err("Невідома категорія майна.".into());
    }
    if draft.category == "weapon_ammo" && draft.personnel_id.is_none() {
        return Err("Зброю та БК потрібно закріпити за військовослужбовцем.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection.execute("INSERT INTO equipment(category,name,inventory_number,status,crew_id,personnel_id,notes) VALUES(?1,?2,?3,?4,?5,?6,?7)",rusqlite::params![draft.category,draft.name.trim(),draft.inventory_number.trim(),draft.status,draft.crew_id,draft.personnel_id,draft.notes.trim()]).map_err(|_|"Не вдалося додати запис майна.".to_string())?;
    Ok(())
}
#[tauri::command]
pub fn delete_equipment(state: tauri::State<AppState>, equipment_id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute("DELETE FROM equipment WHERE id=?1", [equipment_id])
        .map_err(|_| "Не вдалося видалити запис майна.".to_string())?;
    Ok(())
}
#[tauri::command]
pub fn list_incidents(state: tauri::State<AppState>) -> Result<Vec<Incident>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut s=db.connection.prepare("SELECT i.id,i.incident_type,i.occurred_at,i.crew_id,c.name,i.equipment_id,e.name,i.position_name,i.reconnaissance_area,i.crew_snapshot,COALESCE((SELECT group_concat(v.name || ' ' || v.registration_number, ', ') FROM vehicles v WHERE v.crew_id=i.crew_id),''),i.description FROM incidents i LEFT JOIN crews c ON c.id=i.crew_id LEFT JOIN equipment e ON e.id=i.equipment_id ORDER BY i.created_at DESC,i.id DESC").map_err(|_|"Не вдалося прочитати інциденти.".to_string())?;
    let result = s
        .query_map([], |r| {
            Ok(Incident {
                id: r.get(0)?,
                incident_type: r.get(1)?,
                occurred_at: r.get(2)?,
                crew_id: r.get(3)?,
                crew_name: r.get(4)?,
                equipment_id: r.get(5)?,
                equipment_name: r.get(6)?,
                position_name: r.get(7)?,
                reconnaissance_area: r.get(8)?,
                crew_snapshot: r.get(9)?,
                vehicle_name: r.get(10)?,
                description: r.get(11)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати інциденти.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати інциденти.".to_string());
    result
}
#[tauri::command]
pub fn create_incident(state: tauri::State<AppState>, draft: IncidentDraft) -> Result<(), String> {
    if draft.incident_type.trim().is_empty() {
        return Err("Оберіть тип інциденту.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    let (position_name, reconnaissance_area, crew_snapshot) = if let Some(id) = draft.crew_id {
        let info: (String, String) = db
            .connection
            .query_row(
                "SELECT position_name, reconnaissance_area FROM crews WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| "Екіпаж не знайдено.".to_string())?;
        let members = crew_members(&db.connection, id)?
            .into_iter()
            .map(|m| m.full_name)
            .collect::<Vec<_>>()
            .join(", ");
        (
            if draft.position_name.trim().is_empty() {
                info.0
            } else {
                draft.position_name.trim().into()
            },
            if draft.reconnaissance_area.trim().is_empty() {
                info.1
            } else {
                draft.reconnaissance_area.trim().into()
            },
            members,
        )
    } else {
        (
            draft.position_name.trim().into(),
            draft.reconnaissance_area.trim().into(),
            String::new(),
        )
    };
    db.connection.execute("INSERT INTO incidents(incident_type,occurred_at,crew_id,equipment_id,position_name,reconnaissance_area,crew_snapshot,description) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",rusqlite::params![draft.incident_type.trim(),draft.occurred_at.trim(),draft.crew_id,draft.equipment_id,position_name,reconnaissance_area,crew_snapshot,draft.description.trim()]).map_err(|_|"Не вдалося зберегти інцидент.".to_string())?;
    Ok(())
}
