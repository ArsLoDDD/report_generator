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
    unit_type: String,
    company_name: String,
    battle_order: String,
    sector: String,
    official_strength: i64,
    working_strength: i64,
    position_id: Option<i64>,
    status: String,
    uav_name: String,
    uav_type: String,
    functional_duties: String,
    current_location: String,
    notes: String,
    member_count: i64,
    members: Vec<CrewMember>,
    actual_members: Vec<CrewMember>,
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
    #[serde(default = "default_unit_type")]
    unit_type: String,
    #[serde(default)]
    company_name: String,
    #[serde(default)]
    battle_order: String,
    #[serde(default)]
    sector: String,
    #[serde(default = "default_official_strength")]
    official_strength: i64,
    #[serde(default)]
    working_strength: i64,
    #[serde(default)]
    position_id: Option<i64>,
    #[serde(default = "default_crew_status")]
    status: String,
    #[serde(default)]
    uav_name: String,
    #[serde(default)]
    uav_type: String,
    #[serde(default)]
    functional_duties: String,
    #[serde(default)]
    current_location: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    member_ids: Vec<i64>,
    #[serde(default)]
    actual_member_ids: Vec<i64>,
}
fn default_unit_type() -> String {
    "Екіпаж".into()
}
fn default_official_strength() -> i64 {
    4
}
fn default_crew_status() -> String {
    "Формується".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    id: i64,
    name: String,
    position_type: String,
    strip_name: String,
    locality: String,
    battle_order: String,
    sector: String,
    condition: String,
    condition_level: i64,
    field_type: String,
    size: String,
    mgrs: String,
    suitable_uav_text: String,
    is_active: bool,
    crew_id: Option<i64>,
    crew_name: Option<String>,
    notes: String,
    uav_ids: Vec<i64>,
    uav_names: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionDraft {
    name: String,
    position_type: String,
    strip_name: String,
    locality: String,
    battle_order: String,
    sector: String,
    condition: String,
    condition_level: i64,
    field_type: String,
    size: String,
    mgrs: String,
    suitable_uav_text: String,
    is_active: bool,
    crew_id: Option<i64>,
    notes: String,
    #[serde(default)]
    uav_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffingRecord {
    working_strength: i64,
    staff_slot_id: String,
    acting_slot_id: String,
    personnel_id: i64,
    full_name: String,
    rank: String,
    position: String,
    crew_id: Option<i64>,
    crew_name: Option<String>,
    platoon: String,
    company_name: String,
    unit_type: String,
    crew_position_name: String,
    battle_order: String,
    sector: String,
    official_strength: i64,
    actual_strength: i64,
    crew_status: String,
    uav_name: String,
    uav_type: String,
    functional_duties: String,
    current_location: String,
    bcs_status: String,
    notes: String,
    acting_position: String,
    recommendation_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffRecommendation {
    id: i64,
    personnel_id: i64,
    full_name: String,
    position_name: String,
    issued_at: String,
    notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VacancyRecommendation {
    slot_id: String,
    id: i64,
    position_name: String,
    full_name: String,
    phone: String,
    rank: String,
    birth_date: String,
    issued_at: String,
    notes: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffTransfer {
    personnel_id: i64,
    position: String,
    slot_id: String,
    expected_position: String,
    expected_occupant_ids: Vec<i64>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActingChange {
    personnel_id: i64,
    slot_id: String,
    position: String,
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
fn actual_crew_members(connection: &Connection, crew_id: i64) -> Result<Vec<CrewMember>, String> {
    let mut statement=connection.prepare("SELECT p.id,trim(p.surname||' '||p.given_name||' '||p.patronymic),p.rank,p.position FROM crew_actual_members cm JOIN personnel p ON p.id=cm.personnel_id WHERE cm.crew_id=?1 ORDER BY p.position,p.id").map_err(|_|"Не вдалося прочитати фактичний склад екіпажу.".to_string())?;
    let members = statement
        .query_map([crew_id], |row| {
            Ok(CrewMember {
                personnel_id: row.get(0)?,
                full_name: row.get(1)?,
                rank: row.get(2)?,
                position: row.get(3)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати фактичний склад екіпажу.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати фактичний склад екіпажу.".to_string())?;
    Ok(members)
}
#[tauri::command]
pub fn list_crews(state: tauri::State<AppState>) -> Result<Vec<Crew>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut s=db.connection.prepare("SELECT c.id,c.name,c.platoon,COALESCE(p.name,c.position_name),COALESCE(p.locality,c.reconnaissance_area),c.unit_type,c.company_name,COALESCE(p.battle_order,c.battle_order),c.sector,c.official_strength,(SELECT COUNT(*) FROM crew_actual_members am WHERE am.crew_id=c.id),c.status,c.uav_name,c.uav_type,c.functional_duties,c.current_location,c.notes,COUNT(cm.id),c.position_id FROM crews c LEFT JOIN crew_members cm ON cm.crew_id=c.id AND cm.left_at IS NULL LEFT JOIN positions p ON p.id=c.position_id GROUP BY c.id ORDER BY c.platoon COLLATE NOCASE,c.name COLLATE NOCASE").map_err(|_|"Не вдалося прочитати екіпажі.".to_string())?;
    let rows = s
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
                r.get::<_, String>(8)?,
                r.get::<_, i64>(9)?,
                r.get::<_, i64>(10)?,
                r.get::<_, String>(11)?,
                r.get::<_, String>(12)?,
                r.get::<_, String>(13)?,
                r.get::<_, String>(14)?,
                r.get::<_, String>(15)?,
                r.get::<_, String>(16)?,
                r.get::<_, i64>(17)?,
                r.get::<_, Option<i64>>(18)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?;
    rows.into_iter()
        .map(
            |(
                id,
                name,
                platoon,
                position_name,
                reconnaissance_area,
                unit_type,
                company_name,
                battle_order,
                sector,
                official_strength,
                working_strength,
                status,
                uav_name,
                uav_type,
                functional_duties,
                current_location,
                notes,
                member_count,
                position_id,
            )| {
                Ok(Crew {
                    id,
                    name,
                    platoon,
                    position_name,
                    reconnaissance_area,
                    unit_type,
                    company_name,
                    battle_order,
                    sector,
                    official_strength,
                    working_strength,
                    position_id,
                    status,
                    uav_name,
                    uav_type,
                    functional_duties,
                    current_location,
                    notes,
                    member_count,
                    members: crew_members(&db.connection, id)?,
                    actual_members: actual_crew_members(&db.connection, id)?,
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
    let mut actual_member_ids = draft.actual_member_ids.clone();
    for personnel_id in &draft.member_ids {
        if !actual_member_ids.contains(personnel_id) {
            actual_member_ids.push(*personnel_id);
        }
    }
    let working_strength = actual_member_ids.len() as i64;
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute(
            "INSERT INTO crews(name,platoon,position_name,reconnaissance_area,unit_type,company_name,battle_order,sector,official_strength,working_strength,status,uav_name,uav_type,functional_duties,current_location,notes,position_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
            rusqlite::params![
                draft.name.trim(),
                draft.platoon.trim(),
                draft.position_name.trim(),
                draft.reconnaissance_area.trim(), draft.unit_type.trim(), draft.company_name.trim(),
                draft.battle_order.trim(), draft.sector.trim(), draft.official_strength.max(0), working_strength,
                draft.status.trim(),
                draft.uav_name.trim(), draft.uav_type.trim(), draft.functional_duties.trim(),
                draft.current_location.trim(), draft.notes.trim(), draft.position_id
            ],
        )
        .map_err(|_| "Не вдалося створити екіпаж. Перевірте унікальність назви.".to_string())?;
    let id = db.connection.last_insert_rowid();
    for personnel_id in draft.member_ids {
        db.connection
            .execute(
                "UPDATE crew_members SET left_at=CURRENT_TIMESTAMP WHERE personnel_id=?1 AND left_at IS NULL",
                [personnel_id],
            )
            .map_err(|_| "Не вдалося перемістити учасника з попереднього екіпажу.".to_string())?;
        db.connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id) VALUES(?1,?2)",
                rusqlite::params![id, personnel_id],
            )
            .map_err(|_| "Не вдалося додати учасника екіпажу.".to_string())?;
    }
    for personnel_id in actual_member_ids {
        db.connection
            .execute(
                "INSERT OR REPLACE INTO crew_actual_members(crew_id,personnel_id) VALUES(?1,?2)",
                rusqlite::params![id, personnel_id],
            )
            .map_err(|_| "Не вдалося додати фактичного учасника екіпажу.".to_string())?;
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
    let previous_official_ids = crew_members(&db.connection, crew_id)?
        .into_iter()
        .map(|member| member.personnel_id)
        .collect::<Vec<_>>();
    let mut actual_member_ids = draft.actual_member_ids.clone();
    for personnel_id in &draft.member_ids {
        if !previous_official_ids.contains(personnel_id)
            && !actual_member_ids.contains(personnel_id)
        {
            actual_member_ids.push(*personnel_id);
        }
    }
    db.connection.execute("UPDATE crews SET name=?1,platoon=?2,position_name=?3,reconnaissance_area=?4,unit_type=?5,company_name=?6,battle_order=?7,sector=?8,official_strength=?9,working_strength=?10,status=?11,uav_name=?12,uav_type=?13,functional_duties=?14,current_location=?15,notes=?16,position_id=?17 WHERE id=?18",rusqlite::params![draft.name.trim(),draft.platoon.trim(),draft.position_name.trim(),draft.reconnaissance_area.trim(),draft.unit_type.trim(),draft.company_name.trim(),draft.battle_order.trim(),draft.sector.trim(),draft.official_strength.max(0),actual_member_ids.len() as i64,draft.status.trim(),draft.uav_name.trim(),draft.uav_type.trim(),draft.functional_duties.trim(),draft.current_location.trim(),draft.notes.trim(),draft.position_id,crew_id]).map_err(|_|"Не вдалося оновити екіпаж.".to_string())?;
    db.connection.execute("UPDATE crew_members SET left_at=CURRENT_TIMESTAMP WHERE crew_id=?1 AND left_at IS NULL",[crew_id]).map_err(|_|"Не вдалося оновити склад екіпажу.".to_string())?;
    for personnel_id in draft.member_ids {
        db.connection
            .execute(
                "UPDATE crew_members SET left_at=CURRENT_TIMESTAMP WHERE personnel_id=?1 AND crew_id<>?2 AND left_at IS NULL",
                rusqlite::params![personnel_id, crew_id],
            )
            .map_err(|_| "Не вдалося оновити попередню прив’язку учасника.".to_string())?;
        db.connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id) VALUES(?1,?2)",
                rusqlite::params![crew_id, personnel_id],
            )
            .map_err(|_| "Не вдалося оновити склад екіпажу.".to_string())?;
    }
    db.connection
        .execute(
            "DELETE FROM crew_actual_members WHERE crew_id=?1",
            [crew_id],
        )
        .map_err(|_| "Не вдалося оновити фактичний склад екіпажу.".to_string())?;
    for personnel_id in actual_member_ids {
        db.connection
            .execute(
                "INSERT OR REPLACE INTO crew_actual_members(crew_id,personnel_id) VALUES(?1,?2)",
                rusqlite::params![crew_id, personnel_id],
            )
            .map_err(|_| "Не вдалося оновити фактичний склад екіпажу.".to_string())?;
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

pub(crate) fn normalise_mgrs(value: &str) -> Result<String, String> {
    if value.trim().is_empty() {
        return Ok(String::new());
    }
    let mut parts = value
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let indexes = parts
        .iter()
        .enumerate()
        .filter_map(|(index, part)| {
            (part.len() == 5 && part.chars().all(|character| character.is_ascii_digit()))
                .then_some(index)
        })
        .collect::<Vec<_>>();
    if indexes.len() < 2 {
        return Err(
            "Координати MGRS мають містити дві п’ятизначні групи, наприклад 36U UV 12000 67000."
                .into(),
        );
    }
    for index in indexes.into_iter().rev().take(2) {
        parts[index].replace_range(2..5, "000");
    }
    Ok(parts.join(" "))
}

fn position_uavs(
    connection: &Connection,
    position_id: i64,
) -> Result<(Vec<i64>, Vec<String>), String> {
    let mut statement = connection.prepare("SELECT e.id,e.name FROM position_uavs pu JOIN equipment e ON e.id=pu.equipment_id WHERE pu.position_id=?1 ORDER BY e.name COLLATE NOCASE").map_err(|_| "Не вдалося прочитати БпЛА позиції.".to_string())?;
    let rows = statement
        .query_map([position_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|_| "Не вдалося прочитати БпЛА позиції.".to_string())?
        .collect::<Result<Vec<(i64, String)>, _>>()
        .map_err(|_| "Не вдалося прочитати БпЛА позиції.".to_string())?;
    Ok(rows.into_iter().unzip())
}

#[tauri::command]
pub fn list_positions(state: tauri::State<AppState>) -> Result<Vec<Position>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db.connection.prepare("SELECT p.id,p.name,p.position_type,p.strip_name,p.locality,p.battle_order,p.sector,p.condition,p.size,p.mgrs,p.suitable_uav_text,p.is_active,NULL,GROUP_CONCAT(c.name, ', '),p.notes,p.condition_level,p.field_type FROM positions p LEFT JOIN crews c ON c.position_id=p.id GROUP BY p.id ORDER BY p.position_type,p.name COLLATE NOCASE").map_err(|_| "Не вдалося прочитати позиції.".to_string())?;
    let rows = statement
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
                r.get::<_, String>(8)?,
                r.get::<_, String>(9)?,
                r.get::<_, String>(10)?,
                r.get::<_, bool>(11)?,
                r.get::<_, Option<i64>>(12)?,
                r.get::<_, Option<String>>(13)?,
                r.get::<_, String>(14)?,
                r.get::<_, i64>(15)?,
                r.get::<_, String>(16)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати позиції.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати позиції.".to_string())?;
    rows.into_iter()
        .map(
            |(
                id,
                name,
                position_type,
                strip_name,
                locality,
                battle_order,
                sector,
                condition,
                size,
                mgrs,
                suitable_uav_text,
                is_active,
                crew_id,
                crew_name,
                notes,
                condition_level,
                field_type,
            )| {
                let (uav_ids, uav_names) = position_uavs(&db.connection, id)?;
                Ok(Position {
                    id,
                    name,
                    position_type,
                    strip_name,
                    locality,
                    battle_order,
                    sector,
                    condition,
                    condition_level,
                    field_type,
                    size,
                    mgrs,
                    suitable_uav_text,
                    is_active,
                    crew_id,
                    crew_name,
                    notes,
                    uav_ids,
                    uav_names,
                })
            },
        )
        .collect()
}

fn save_position_uavs(
    connection: &Connection,
    position_id: i64,
    uav_ids: &[i64],
) -> Result<(), String> {
    connection
        .execute(
            "DELETE FROM position_uavs WHERE position_id=?1",
            [position_id],
        )
        .map_err(|_| "Не вдалося оновити БпЛА позиції.".to_string())?;
    for equipment_id in uav_ids {
        connection.execute("INSERT OR IGNORE INTO position_uavs(position_id,equipment_id) SELECT ?1,id FROM equipment WHERE id=?2 AND category='uav'", rusqlite::params![position_id,equipment_id]).map_err(|_| "Не вдалося закріпити БпЛА за позицією.".to_string())?;
    }
    Ok(())
}

fn sync_active_position(
    connection: &Connection,
    old: Option<(String, Option<i64>)>,
    name: &str,
    locality: &str,
    active: bool,
    crew_id: Option<i64>,
) -> Result<(), String> {
    if let Some((old_name, Some(old_crew_id))) = old {
        connection.execute("UPDATE crews SET position_name='',reconnaissance_area='' WHERE id=?1 AND position_name=?2", rusqlite::params![old_crew_id, old_name]).map_err(|_| "Не вдалося оновити позицію екіпажу.".to_string())?;
    }
    if active {
        if let Some(crew_id) = crew_id {
            connection
                .execute(
                    "UPDATE crews SET position_name=?1,reconnaissance_area=?2 WHERE id=?3",
                    rusqlite::params![name, locality, crew_id],
                )
                .map_err(|_| "Не вдалося закріпити позицію за екіпажем.".to_string())?;
        }
    }
    Ok(())
}

fn validate_position(draft: &PositionDraft) -> Result<String, String> {
    if draft.name.trim().is_empty() {
        return Err("Вкажіть назву позиції.".into());
    }
    if ![
        "Основна",
        "Запасна",
        "Облаштовується",
        "Виявлена ворогом",
        "Зайнята суміжниками",
    ]
    .contains(&draft.position_type.as_str())
    {
        return Err("Оберіть коректний тип позиції.".into());
    }
    normalise_mgrs(&draft.mgrs)
}

#[tauri::command]
pub fn create_position(state: tauri::State<AppState>, draft: PositionDraft) -> Result<(), String> {
    let mgrs = validate_position(&draft)?;
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection.execute("INSERT INTO positions(name,position_type,strip_name,locality,battle_order,sector,condition,size,mgrs,suitable_uav_text,is_active,crew_id,notes,condition_level,field_type) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",rusqlite::params![draft.name.trim(),draft.position_type,draft.strip_name.trim(),draft.locality.trim(),draft.battle_order.trim(),draft.sector.trim(),draft.condition.trim(),draft.size.trim(),mgrs,draft.suitable_uav_text.trim(),draft.is_active,draft.crew_id,draft.notes.trim(),draft.condition_level.clamp(0,100),draft.field_type.trim()]).map_err(|_|"Не вдалося створити позицію. Перевірте унікальність назви.".to_string())?;
    save_position_uavs(
        &db.connection,
        db.connection.last_insert_rowid(),
        &draft.uav_ids,
    )?;
    sync_active_position(
        &db.connection,
        None,
        draft.name.trim(),
        draft.locality.trim(),
        draft.is_active,
        draft.crew_id,
    )
}

#[tauri::command]
pub fn update_position(
    state: tauri::State<AppState>,
    position_id: i64,
    draft: PositionDraft,
) -> Result<(), String> {
    let mgrs = validate_position(&draft)?;
    let db = state.0.lock().map_err(|_| busy())?;
    let old = db
        .connection
        .query_row(
            "SELECT name,crew_id FROM positions WHERE id=?1",
            [position_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?)),
        )
        .ok();
    db.connection.execute("UPDATE positions SET name=?1,position_type=?2,strip_name=?3,locality=?4,battle_order=?5,sector=?6,condition=?7,size=?8,mgrs=?9,suitable_uav_text=?10,is_active=?11,crew_id=?12,notes=?13,condition_level=?14,field_type=?15 WHERE id=?16",rusqlite::params![draft.name.trim(),draft.position_type,draft.strip_name.trim(),draft.locality.trim(),draft.battle_order.trim(),draft.sector.trim(),draft.condition.trim(),draft.size.trim(),mgrs,draft.suitable_uav_text.trim(),draft.is_active,draft.crew_id,draft.notes.trim(),draft.condition_level.clamp(0,100),draft.field_type.trim(),position_id]).map_err(|_|"Не вдалося оновити позицію.".to_string())?;
    save_position_uavs(&db.connection, position_id, &draft.uav_ids)?;
    sync_active_position(
        &db.connection,
        old,
        draft.name.trim(),
        draft.locality.trim(),
        draft.is_active,
        draft.crew_id,
    )
}

#[tauri::command]
pub fn delete_position(state: tauri::State<AppState>, position_id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let old = db
        .connection
        .query_row(
            "SELECT name,crew_id FROM positions WHERE id=?1",
            [position_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?)),
        )
        .ok();
    db.connection
        .execute("DELETE FROM positions WHERE id=?1", [position_id])
        .map_err(|_| "Не вдалося видалити позицію.".to_string())?;
    sync_active_position(&db.connection, old, "", "", false, None)
}

#[tauri::command]
pub fn list_staffing_records(state: tauri::State<AppState>) -> Result<Vec<StaffingRecord>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    crate::database::normalize_staff_positions(&db.connection)?;
    let mut statement=db.connection.prepare("SELECT p.id,trim(p.surname||' '||p.given_name||' '||p.patronymic),p.rank,p.position,c.id,c.name,COALESCE(c.platoon,''),COALESCE(c.company_name,''),COALESCE(c.unit_type,'Екіпаж'),COALESCE(pos.name,''),COALESCE(pos.battle_order,''),COALESCE(c.sector,''),COALESCE(c.official_strength,0),COALESCE((SELECT COUNT(*) FROM crew_members x WHERE x.crew_id=c.id AND x.left_at IS NULL),0),COALESCE(c.status,''),COALESCE(c.uav_name,''),COALESCE(c.uav_type,''),COALESCE(NULLIF(p.functional_duties,''),c.functional_duties,''),COALESCE(p.current_location,''),COALESCE(p.bcs_status,''),COALESCE(NULLIF(p.bcs_notes,''),c.notes,''),COALESCE(a.acting_position,''),COALESCE((SELECT COUNT(*) FROM staff_recommendations sr WHERE sr.personnel_id=p.id),0),COALESCE(a.slot_id,''),COALESCE(a.acting_slot_id,''),COALESCE((SELECT COUNT(*) FROM crew_actual_members x WHERE x.crew_id=c.id),0) FROM personnel p LEFT JOIN crew_actual_members cam ON cam.personnel_id=p.id LEFT JOIN crews c ON c.id=cam.crew_id LEFT JOIN positions pos ON pos.id=c.position_id LEFT JOIN personnel_staff_assignments a ON a.personnel_id=p.id ORDER BY COALESCE(c.name,''),p.position,p.id").map_err(|_|"Не вдалося сформувати Штат та БЧС.".to_string())?;
    let result = statement
        .query_map([], |r| {
            Ok(StaffingRecord {
                personnel_id: r.get(0)?,
                full_name: r.get(1)?,
                rank: r.get(2)?,
                position: r.get(3)?,
                crew_id: r.get(4)?,
                crew_name: r.get(5)?,
                platoon: r.get(6)?,
                company_name: r.get(7)?,
                unit_type: r.get(8)?,
                crew_position_name: r.get(9)?,
                battle_order: r.get(10)?,
                sector: r.get(11)?,
                official_strength: r.get(12)?,
                actual_strength: r.get(13)?,
                crew_status: r.get(14)?,
                uav_name: r.get(15)?,
                uav_type: r.get(16)?,
                functional_duties: r.get(17)?,
                current_location: r.get(18)?,
                bcs_status: r.get(19)?,
                notes: r.get(20)?,
                acting_position: r.get(21)?,
                recommendation_count: r.get(22)?,
                working_strength: r.get(25)?,
                staff_slot_id: r.get(23)?,
                acting_slot_id: r.get(24)?,
            })
        })
        .map_err(|_| "Не вдалося сформувати Штат та БЧС.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося сформувати Штат та БЧС.".to_string());
    result
}

#[tauri::command]
pub fn update_staffing_personnel(
    state: tauri::State<AppState>,
    personnel_id: i64,
    position: String,
    acting_position: String,
    current_location: String,
    functional_duties: String,
    notes: String,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    if position.trim().is_empty() {
        return Err("Вкажіть посаду для переміщення.".into());
    }
    if !crate::database::is_valid_bcs_location(&current_location) {
        return Err("Оберіть значення «Де знаходиться» з довідника БЧС.".into());
    }
    db.connection.execute("UPDATE personnel SET position=?1,current_location=?2,functional_duties=?3,bcs_notes=?4,updated_at=CURRENT_TIMESTAMP WHERE id=?5", rusqlite::params![crate::database::canonical_staff_position(&position), current_location.trim(), functional_duties.trim(), notes.trim(), personnel_id]).map_err(|_| "Не вдалося оновити кадрові дані.".to_string())?;
    db.connection.execute("INSERT INTO personnel_staff_assignments(personnel_id,acting_position,updated_at) VALUES(?1,?2,CURRENT_TIMESTAMP) ON CONFLICT(personnel_id) DO UPDATE SET acting_position=excluded.acting_position,updated_at=CURRENT_TIMESTAMP", rusqlite::params![personnel_id, acting_position.trim()]).map_err(|_| "Не вдалося зберегти ТВО.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn transfer_staffing_chain(
    state: tauri::State<AppState>,
    assignments: Vec<StaffTransfer>,
    acting_changes: Vec<ActingChange>,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    apply_staff_transfers(&db.connection, &assignments, &acting_changes)
}

fn apply_staff_transfers(
    connection: &rusqlite::Connection,
    assignments: &[StaffTransfer],
    acting_changes: &[ActingChange],
) -> Result<(), String> {
    use std::collections::HashSet;
    if assignments.is_empty() && acting_changes.is_empty() {
        return Err("Не вибрано жодної зміни.".into());
    }
    let transaction = connection
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;
    let mut people = HashSet::new();
    let mut targets = HashSet::new();
    for assignment in assignments {
        if assignment.slot_id.is_empty()
            || assignment.position.trim().is_empty()
            || !people.insert(assignment.personnel_id)
            || !targets.insert(&assignment.slot_id)
        {
            return Err("Людина або штатне місце призначені двічі, або місце не вказане.".into());
        }
        let current: String = transaction
            .query_row(
                "SELECT position FROM personnel WHERE id=?1",
                [assignment.personnel_id],
                |row| row.get(0),
            )
            .map_err(|_| "Військовослужбовця не знайдено.")?;
        if current != assignment.expected_position {
            return Err("Штат змінився. Відкрийте переміщення повторно.".into());
        }
    }
    for assignment in assignments {
        let mut occupants = assignment.expected_occupant_ids.clone();
        let mut query = transaction.prepare("SELECT p.id FROM personnel p LEFT JOIN personnel_staff_assignments a ON a.personnel_id=p.id WHERE a.slot_id=?1 OR (COALESCE(a.slot_id,'')='' AND p.position=?2)").map_err(|e| e.to_string())?;
        occupants.extend(
            query
                .query_map(
                    rusqlite::params![assignment.slot_id, assignment.position],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?,
        );
        if occupants
            .iter()
            .any(|id| *id != assignment.personnel_id && !people.contains(id))
        {
            return Err("Незавершений ланцюжок: перемістіть людину, що займає цю посаду.".into());
        }
        let mut acting_query = transaction.prepare("SELECT personnel_id FROM personnel_staff_assignments WHERE acting_slot_id=?1 OR (acting_slot_id='' AND acting_position=?2)").map_err(|e| e.to_string())?;
        for id in acting_query
            .query_map(
                rusqlite::params![assignment.slot_id, assignment.position],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| e.to_string())?
        {
            let id = id.map_err(|e| e.to_string())?;
            if !acting_changes
                .iter()
                .any(|change| change.personnel_id == id && change.slot_id.is_empty())
            {
                return Err("Підтвердіть зняття ТВО перед призначенням на цю посаду.".into());
            }
        }
    }
    for assignment in assignments {
        transaction
            .execute(
                "UPDATE personnel SET position=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2",
                rusqlite::params![
                    crate::database::canonical_staff_position(&assignment.position),
                    assignment.personnel_id
                ],
            )
            .map_err(|e| e.to_string())?;
        transaction.execute("INSERT INTO personnel_staff_assignments(personnel_id,slot_id) VALUES(?1,?2) ON CONFLICT(personnel_id) DO UPDATE SET slot_id=excluded.slot_id,updated_at=CURRENT_TIMESTAMP", rusqlite::params![assignment.personnel_id, assignment.slot_id]).map_err(|e| e.to_string())?;
    }
    let mut acting_people = HashSet::new();
    let mut acting_slots = HashSet::new();
    for change in acting_changes {
        if !acting_people.insert(change.personnel_id)
            || (!change.slot_id.is_empty()
                && (!acting_slots.insert(&change.slot_id) || change.position.is_empty()))
        {
            return Err("ТВО призначено двічі.".into());
        }
        if !change.slot_id.is_empty() {
            let occupied: i64 = transaction.query_row("SELECT COUNT(*) FROM personnel p LEFT JOIN personnel_staff_assignments a ON a.personnel_id=p.id WHERE a.slot_id=?1 OR (COALESCE(a.slot_id,'')='' AND p.position=?2)", rusqlite::params![change.slot_id,change.position], |row| row.get(0)).map_err(|e| e.to_string())?;
            let other_acting: i64 = transaction.query_row("SELECT COUNT(*) FROM personnel_staff_assignments WHERE acting_slot_id=?1 AND personnel_id<>?2", rusqlite::params![change.slot_id,change.personnel_id], |row| row.get(0)).map_err(|e| e.to_string())?;
            if occupied > 0 || other_acting > 0 {
                return Err("ТВО можна призначити лише на вільне місце без іншого ТВО.".into());
            }
        }
        transaction.execute("INSERT INTO personnel_staff_assignments(personnel_id,acting_slot_id,acting_position) VALUES(?1,?2,?3) ON CONFLICT(personnel_id) DO UPDATE SET acting_slot_id=excluded.acting_slot_id,acting_position=excluded.acting_position,updated_at=CURRENT_TIMESTAMP", rusqlite::params![change.personnel_id,change.slot_id,change.position]).map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_staff_recommendation(
    state: tauri::State<AppState>,
    personnel_id: i64,
    position_name: String,
    issued_at: String,
    notes: String,
) -> Result<(), String> {
    if position_name.trim().is_empty() || issued_at.trim().is_empty() {
        return Err("Вкажіть посаду та дату рекомендаційного листа.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection.execute("INSERT INTO staff_recommendations(personnel_id,position_name,issued_at,notes) VALUES(?1,?2,?3,?4)", rusqlite::params![personnel_id, position_name.trim(), issued_at.trim(), notes.trim()]).map_err(|_| "Не вдалося зберегти рекомендаційний лист.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_staff_recommendations(
    state: tauri::State<AppState>,
) -> Result<Vec<StaffRecommendation>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db.connection.prepare("SELECT sr.id,sr.personnel_id,trim(p.surname||' '||p.given_name||' '||p.patronymic),sr.position_name,sr.issued_at,sr.notes FROM staff_recommendations sr JOIN personnel p ON p.id=sr.personnel_id ORDER BY sr.issued_at DESC,sr.id DESC").map_err(|_| "Не вдалося прочитати рекомендаційні листи.".to_string())?;
    let result = statement
        .query_map([], |row| {
            Ok(StaffRecommendation {
                id: row.get(0)?,
                personnel_id: row.get(1)?,
                full_name: row.get(2)?,
                position_name: row.get(3)?,
                issued_at: row.get(4)?,
                notes: row.get(5)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати рекомендаційні листи.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати рекомендаційні листи.".to_string());
    result
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri exposes these form fields as separate command arguments.
pub fn create_vacancy_recommendation(
    state: tauri::State<AppState>,
    slot_id: Option<String>,
    position_name: String,
    full_name: String,
    phone: String,
    rank: String,
    birth_date: String,
    issued_at: String,
    notes: String,
) -> Result<(), String> {
    if position_name.trim().is_empty() || full_name.trim().is_empty() || issued_at.trim().is_empty()
    {
        return Err("Вкажіть посаду, ПІБ кандидата та дату видачі.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute(
            "INSERT INTO staff_position_recommendations(position_name,full_name,phone,rank,birth_date,issued_at,notes,slot_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![position_name.trim(), full_name.trim(), phone.trim(), rank.trim(), birth_date.trim(), issued_at.trim(), notes.trim(), slot_id.unwrap_or_default()],
        )
        .map_err(|_| "Не вдалося зберегти рекомендаційний лист для вільної посади.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_vacancy_recommendations(
    state: tauri::State<AppState>,
) -> Result<Vec<VacancyRecommendation>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db.connection.prepare("SELECT id,position_name,full_name,phone,rank,birth_date,issued_at,notes,slot_id FROM staff_position_recommendations ORDER BY issued_at DESC,id DESC").map_err(|_| "Не вдалося прочитати рекомендації для вільних посад.".to_string())?;
    let result = statement
        .query_map([], |row| {
            Ok(VacancyRecommendation {
                slot_id: row.get(8)?,
                id: row.get(0)?,
                position_name: row.get(1)?,
                full_name: row.get(2)?,
                phone: row.get(3)?,
                rank: row.get(4)?,
                birth_date: row.get(5)?,
                issued_at: row.get(6)?,
                notes: row.get(7)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати рекомендації для вільних посад.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати рекомендації для вільних посад.".to_string());
    result
}

#[cfg(test)]
mod position_tests {
    use super::*;

    fn position(
        position_type: &str,
        is_active: bool,
        crew_id: Option<i64>,
        mgrs: &str,
    ) -> PositionDraft {
        PositionDraft {
            name: format!("{position_type} тест"),
            position_type: position_type.into(),
            strip_name: "Північ".into(),
            locality: "н.п. Тестове".into(),
            battle_order: "БР №1".into(),
            sector: "А".into(),
            condition: "Готова".into(),
            condition_level: 75,
            field_type: "Відкрите".into(),
            size: "20 × 30 м".into(),
            mgrs: mgrs.into(),
            suitable_uav_text: "Mavic".into(),
            is_active,
            crew_id,
            notes: String::new(),
            uav_ids: Vec::new(),
        }
    }

    #[test]
    fn supports_every_position_kind_and_reduces_mgrs_precision() {
        for kind in [
            "Основна",
            "Запасна",
            "Облаштовується",
            "Виявлена ворогом",
            "Зайнята суміжниками",
        ] {
            assert!(validate_position(&position(kind, false, None, "36U UV 12345 67890")).is_ok());
        }
        assert_eq!(
            normalise_mgrs("36U UV 12345 67890").unwrap(),
            "36U UV 12000 67000"
        );
        assert!(normalise_mgrs("36U UV 123 67890").is_err());
    }

    #[test]
    fn position_can_be_used_by_multiple_crews() {
        assert!(validate_position(&position("Основна", true, None, "36U UV 12000 67000")).is_ok());
    }

    #[test]
    fn active_position_updates_and_clears_the_crew_location() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(name) VALUES('Екіпаж Тест')", [])
            .unwrap();
        sync_active_position(&connection, None, "СП Тест", "н.п. Тестове", true, Some(1)).unwrap();
        let linked: (String, String) = connection
            .query_row(
                "SELECT position_name,reconnaissance_area FROM crews WHERE id=1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(linked, ("СП Тест".into(), "н.п. Тестове".into()));
        sync_active_position(
            &connection,
            Some(("СП Тест".into(), Some(1))),
            "",
            "",
            false,
            None,
        )
        .unwrap();
        let cleared: String = connection
            .query_row("SELECT position_name FROM crews WHERE id=1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(cleared.is_empty());
    }
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

#[tauri::command]
pub fn update_bcs_crew_strength(
    state: tauri::State<AppState>,
    crew_id: i64,
    value: i64,
) -> Result<(), String> {
    if value < 0 {
        return Err("Кількість не може бути від’ємною.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    if db
        .connection
        .execute(
            "UPDATE crews SET working_strength=?1 WHERE id=?2",
            rusqlite::params![value, crew_id],
        )
        .map_err(|e| e.to_string())?
        != 1
    {
        return Err("Підгрупу не знайдено.".into());
    }
    Ok(())
}

#[cfg(test)]
mod staff_transfer_tests {
    use super::*;
    fn db() -> rusqlite::Connection {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&db).unwrap();
        for id in 1..=3 {
            db.execute("INSERT INTO personnel(id,surname,given_name,patronymic,rank,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(?1,?2,'Іван','Тестович','солдат',?3,?4,'','','','','','','')",rusqlite::params![id,format!("Тест{id}"),format!("Посада {id}"),format!("ID{id}")]).unwrap();
            db.execute(
                "INSERT INTO personnel_staff_assignments(personnel_id,slot_id) VALUES(?1,?2)",
                rusqlite::params![id, format!("slot-{id}")],
            )
            .unwrap();
        }
        db
    }
    fn movement(id: i64, target: i64) -> StaffTransfer {
        StaffTransfer {
            personnel_id: id,
            position: format!("Посада {target}"),
            slot_id: format!("slot-{target}"),
            expected_position: format!("Посада {id}"),
            expected_occupant_ids: vec![target],
        }
    }
    #[test]
    fn rejects_unresolved_chain_without_partial_changes() {
        let db = db();
        assert!(apply_staff_transfers(&db, &[movement(1, 2)], &[]).is_err());
        assert_eq!(
            db.query_row("SELECT position FROM personnel WHERE id=1", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "Посада 1"
        );
    }
    #[test]
    fn swaps_specific_slots_atomically() {
        let db = db();
        apply_staff_transfers(&db, &[movement(1, 2), movement(2, 1)], &[]).unwrap();
        assert_eq!(
            db.query_row(
                "SELECT slot_id FROM personnel_staff_assignments WHERE personnel_id=1",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "slot-2"
        );
    }
    #[test]
    fn same_title_on_different_slots_is_allowed() {
        let db = db();
        let mut a = movement(1, 4);
        let mut b = movement(2, 5);
        a.expected_occupant_ids.clear();
        b.expected_occupant_ids.clear();
        a.position = "Водій-електрик".into();
        b.position = a.position.clone();
        apply_staff_transfers(&db, &[a, b], &[]).unwrap();
        assert_eq!(db.query_row("SELECT COUNT(DISTINCT slot_id) FROM personnel_staff_assignments WHERE personnel_id IN (1,2)",[],|r|r.get::<_,i64>(0)).unwrap(),2);
    }
    #[test]
    fn clears_acting_only_when_confirmed_and_rolls_back_bad_acting() {
        let db = db();
        db.execute("UPDATE personnel_staff_assignments SET acting_slot_id='slot-4',acting_position='Посада 4' WHERE personnel_id=3",[]).unwrap();
        let mut a = movement(1, 4);
        a.expected_occupant_ids.clear();
        assert!(apply_staff_transfers(&db, &[a.clone()], &[]).is_err());
        apply_staff_transfers(
            &db,
            &[a],
            &[ActingChange {
                personnel_id: 3,
                slot_id: String::new(),
                position: String::new(),
            }],
        )
        .unwrap();
        assert_eq!(
            db.query_row(
                "SELECT acting_slot_id FROM personnel_staff_assignments WHERE personnel_id=3",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            ""
        );
        assert!(apply_staff_transfers(
            &db,
            &[],
            &[ActingChange {
                personnel_id: 3,
                slot_id: "slot-4".into(),
                position: "Посада 4".into()
            }]
        )
        .is_err());
    }
    #[test]
    fn detects_stale_source_and_duplicate_targets() {
        let db = db();
        let mut a = movement(1, 4);
        a.expected_position = "Застаріла".into();
        assert!(apply_staff_transfers(&db, &[a], &[]).is_err());
        assert!(apply_staff_transfers(&db, &[movement(1, 4), movement(2, 4)], &[]).is_err());
    }
}
