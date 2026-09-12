use super::{busy, Crew, CrewDraft, CrewMember};
use crate::AppState;
use rusqlite::Connection;

pub(crate) fn crew_members(
    connection: &Connection,
    crew_id: i64,
) -> Result<Vec<CrewMember>, String> {
    let mut s=connection.prepare("SELECT p.id, trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic), p.rank, p.position, COALESCE(p.callsign,'') FROM crew_members cm JOIN personnel p ON p.id=cm.personnel_id WHERE cm.crew_id=?1 AND cm.left_at IS NULL ORDER BY cm.joined_at, p.id").map_err(|_|"Не вдалося прочитати склад екіпажу.".to_string())?;
    let result = s
        .query_map([crew_id], |r| {
            Ok(CrewMember {
                personnel_id: r.get(0)?,
                full_name: r.get(1)?,
                rank: r.get(2)?,
                position: r.get(3)?,
                callsign: r.get(4)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string());
    result
}

fn actual_crew_members(connection: &Connection, crew_id: i64) -> Result<Vec<CrewMember>, String> {
    let mut statement=connection.prepare("SELECT p.id,trim(p.surname||' '||p.given_name||' '||p.patronymic),p.rank,p.position,COALESCE(p.callsign,'') FROM crew_actual_members cm JOIN personnel p ON p.id=cm.personnel_id WHERE cm.crew_id=?1 ORDER BY p.position,p.id").map_err(|_|"Не вдалося прочитати фактичний склад екіпажу.".to_string())?;
    let members = statement
        .query_map([crew_id], |row| {
            Ok(CrewMember {
                personnel_id: row.get(0)?,
                full_name: row.get(1)?,
                rank: row.get(2)?,
                position: row.get(3)?,
                callsign: row.get(4)?,
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
    let mut s=db.connection.prepare("SELECT c.id,c.name,c.platoon,COALESCE(p.name,c.position_name),COALESCE(p.locality,c.reconnaissance_area),c.unit_type,c.company_name,COALESCE(p.battle_order,c.battle_order),c.sector,c.official_strength,(SELECT COUNT(*) FROM crew_actual_members am WHERE am.crew_id=c.id),c.status,COALESCE(primary_uav.name,c.uav_name),COALESCE(primary_uav.uav_type,c.uav_type),c.functional_duties,c.current_location,c.notes,COUNT(cm.id),c.position_id,c.primary_uav_id FROM crews c LEFT JOIN crew_members cm ON cm.crew_id=c.id AND cm.left_at IS NULL LEFT JOIN positions p ON p.id=c.position_id LEFT JOIN equipment primary_uav ON primary_uav.id=c.primary_uav_id AND primary_uav.crew_id=c.id AND primary_uav.category='uav' GROUP BY c.id ORDER BY c.platoon COLLATE NOCASE,c.name COLLATE NOCASE").map_err(|_|"Не вдалося прочитати екіпажі.".to_string())?;
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
                r.get::<_, Option<i64>>(19)?,
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
                primary_uav_id,
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
                    primary_uav_id,
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
            "INSERT INTO crews(name,platoon,position_name,reconnaissance_area,unit_type,company_name,battle_order,sector,official_strength,working_strength,status,uav_name,uav_type,functional_duties,current_location,notes,position_id,primary_uav_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
            rusqlite::params![
                draft.name.trim(),
                draft.platoon.trim(),
                draft.position_name.trim(),
                draft.reconnaissance_area.trim(), draft.unit_type.trim(), draft.company_name.trim(),
                draft.battle_order.trim(), draft.sector.trim(), draft.official_strength.max(0), working_strength,
                draft.status.trim(),
                draft.uav_name.trim(), draft.uav_type.trim(), draft.functional_duties.trim(),
                draft.current_location.trim(), draft.notes.trim(), draft.position_id, draft.primary_uav_id
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
    db.connection.execute("UPDATE vehicles SET crew_id=(SELECT crew_id FROM crew_actual_members WHERE personnel_id=vehicles.personnel_id UNION SELECT crew_id FROM crew_members WHERE personnel_id=vehicles.personnel_id AND left_at IS NULL LIMIT 1) WHERE personnel_id IS NOT NULL", []).map_err(|_|"Не вдалося синхронізувати автомобілі екіпажу.".to_string())?;
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
    if let Some(primary_uav_id) = draft.primary_uav_id {
        let valid = db
            .connection
            .query_row(
                "SELECT COUNT(*) FROM equipment WHERE id=?1 AND crew_id=?2 AND category='uav'",
                rusqlite::params![primary_uav_id, crew_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;
        if !valid {
            return Err("Основним можна обрати лише БпЛА, закріплений за цим екіпажем.".into());
        }
    }
    db.connection.execute("UPDATE crews SET name=?1,platoon=?2,position_name=?3,reconnaissance_area=?4,unit_type=?5,company_name=?6,battle_order=?7,sector=?8,official_strength=?9,working_strength=?10,status=?11,uav_name=?12,uav_type=?13,functional_duties=?14,current_location=?15,notes=?16,position_id=?17,primary_uav_id=?18 WHERE id=?19",rusqlite::params![draft.name.trim(),draft.platoon.trim(),draft.position_name.trim(),draft.reconnaissance_area.trim(),draft.unit_type.trim(),draft.company_name.trim(),draft.battle_order.trim(),draft.sector.trim(),draft.official_strength.max(0),actual_member_ids.len() as i64,draft.status.trim(),draft.uav_name.trim(),draft.uav_type.trim(),draft.functional_duties.trim(),draft.current_location.trim(),draft.notes.trim(),draft.position_id,draft.primary_uav_id,crew_id]).map_err(|_|"Не вдалося оновити екіпаж.".to_string())?;
    db.connection.execute("UPDATE crews SET uav_name=COALESCE((SELECT name FROM equipment WHERE id=primary_uav_id),''),uav_type=COALESCE((SELECT uav_type FROM equipment WHERE id=primary_uav_id),'') WHERE id=?1",[crew_id]).map_err(|_|"Не вдалося оновити основний БпЛА екіпажу.".to_string())?;
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
    db.connection.execute("UPDATE vehicles SET crew_id=(SELECT crew_id FROM crew_actual_members WHERE personnel_id=vehicles.personnel_id UNION SELECT crew_id FROM crew_members WHERE personnel_id=vehicles.personnel_id AND left_at IS NULL LIMIT 1) WHERE personnel_id IS NOT NULL", []).map_err(|_|"Не вдалося синхронізувати автомобілі екіпажу.".to_string())?;
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
