use super::crews::actual_crew_members;
use super::{busy, Incident, IncidentDraft};
use crate::AppState;
use rusqlite::Connection;

fn incident_equipment(
    connection: &Connection,
    incident_id: i64,
) -> Result<(Vec<i64>, Vec<String>), String> {
    let mut statement = connection
        .prepare("SELECT e.id,e.name FROM incident_equipment ie JOIN equipment e ON e.id=ie.equipment_id WHERE ie.incident_id=?1 ORDER BY e.name COLLATE NOCASE,e.id")
        .map_err(|_| "Не вдалося прочитати майно інциденту.".to_string())?;
    let rows = statement
        .query_map([incident_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|_| "Не вдалося прочитати майно інциденту.".to_string())?
        .collect::<Result<Vec<(i64, String)>, _>>()
        .map_err(|_| "Не вдалося прочитати майно інциденту.".to_string())?;
    Ok(rows.into_iter().unzip())
}

fn incident_personnel(
    connection: &Connection,
    incident_id: i64,
) -> Result<(Vec<i64>, Vec<String>), String> {
    let mut statement = connection
        .prepare("SELECT personnel_id,full_name_snapshot FROM incident_personnel WHERE incident_id=?1 ORDER BY full_name_snapshot COLLATE NOCASE")
        .map_err(|_| "Не вдалося прочитати осіб інциденту.".to_string())?;
    let rows = statement
        .query_map([incident_id], |row| {
            Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| "Не вдалося прочитати осіб інциденту.".to_string())?
        .collect::<Result<Vec<(Option<i64>, String)>, _>>()
        .map_err(|_| "Не вдалося прочитати осіб інциденту.".to_string())?;
    let personnel_ids = rows.iter().filter_map(|(id, _)| *id).collect();
    let personnel_names = rows.into_iter().map(|(_, name)| name).collect();
    Ok((personnel_ids, personnel_names))
}

#[tauri::command]
pub fn list_incidents(state: tauri::State<AppState>) -> Result<Vec<Incident>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db.connection.prepare("SELECT i.id,i.category,i.incident_type,i.status,i.occurred_at,i.crew_id,c.name,i.equipment_id,e.name,i.position_name,i.reconnaissance_area,i.crew_snapshot,COALESCE((SELECT group_concat(v.name || ' ' || v.registration_number, ', ') FROM vehicles v WHERE v.crew_id=i.crew_id),''),i.description,i.immediate_actions,i.consequences,i.flight_stage,i.preliminary_cause,i.snapshot_source,i.reported_to,i.reported_at FROM incidents i LEFT JOIN crews c ON c.id=i.crew_id LEFT JOIN equipment e ON e.id=i.equipment_id ORDER BY i.id").map_err(|_|"Не вдалося прочитати інциденти.".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<i64>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, String>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, String>(14)?,
                row.get::<_, String>(15)?,
                row.get::<_, String>(16)?,
                row.get::<_, String>(17)?,
                row.get::<_, String>(18)?,
                row.get::<_, String>(19)?,
                row.get::<_, String>(20)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати інциденти.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати інциденти.".to_string())?;
    rows.into_iter()
        .map(
            |(
                id,
                category,
                incident_type,
                status,
                occurred_at,
                crew_id,
                crew_name,
                legacy_equipment_id,
                legacy_equipment_name,
                position_name,
                reconnaissance_area,
                crew_snapshot,
                vehicle_name,
                description,
                immediate_actions,
                consequences,
                flight_stage,
                preliminary_cause,
                snapshot_source,
                reported_to,
                reported_at,
            )| {
                let (mut equipment_ids, mut equipment_names) =
                    incident_equipment(&db.connection, id)?;
                if equipment_ids.is_empty() {
                    if let Some(equipment_id) = legacy_equipment_id {
                        equipment_ids.push(equipment_id);
                    }
                    if let Some(equipment_name) = legacy_equipment_name.clone() {
                        equipment_names.push(equipment_name);
                    }
                }
                let (personnel_ids, personnel_names) = incident_personnel(&db.connection, id)?;
                Ok(Incident {
                    id,
                    category,
                    incident_type,
                    status,
                    occurred_at,
                    crew_id,
                    crew_name,
                    equipment_id: equipment_ids.first().copied(),
                    equipment_name: equipment_names.first().cloned(),
                    equipment_ids,
                    equipment_names,
                    personnel_ids,
                    personnel_names,
                    position_name,
                    reconnaissance_area,
                    crew_snapshot,
                    vehicle_name,
                    description,
                    immediate_actions,
                    consequences,
                    flight_stage,
                    preliminary_cause,
                    snapshot_source,
                    reported_to,
                    reported_at,
                })
            },
        )
        .collect()
}

fn validate_incident_equipment(
    connection: &Connection,
    crew_id: Option<i64>,
    equipment_ids: &[i64],
) -> Result<(), String> {
    if equipment_ids.is_empty() {
        return Ok(());
    }
    let Some(crew_id) = crew_id else {
        return Err("Спочатку оберіть екіпаж інциденту.".into());
    };
    for equipment_id in equipment_ids {
        let belongs_to_crew = connection
            .query_row(
                "SELECT COUNT(*) FROM equipment e WHERE e.id=?1 AND (e.crew_id=?2 OR e.personnel_id IN (SELECT personnel_id FROM crew_actual_members WHERE crew_id=?2))",
                rusqlite::params![equipment_id, crew_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;
        if !belongs_to_crew {
            return Err("До інциденту можна додати лише майно обраного екіпажу.".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn create_incident(state: tauri::State<AppState>, draft: IncidentDraft) -> Result<(), String> {
    if draft.incident_type.trim().is_empty() {
        return Err("Оберіть тип інциденту.".into());
    }
    let mut equipment_ids = draft.equipment_ids.clone();
    if let Some(equipment_id) = draft.equipment_id {
        if !equipment_ids.contains(&equipment_id) {
            equipment_ids.push(equipment_id);
        }
    }
    let db = state.0.lock().map_err(|_| busy())?;
    validate_incident_equipment(&db.connection, draft.crew_id, &equipment_ids)?;
    let (position_name, reconnaissance_area, crew_snapshot) = if let Some(id) = draft.crew_id {
        let info: (String, String) = db
            .connection
            .query_row(
                "SELECT position_name,reconnaissance_area FROM crews WHERE id=?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| "Екіпаж не знайдено.".to_string())?;
        let members = actual_crew_members(&db.connection, id)?
            .into_iter()
            .map(|member| member.full_name)
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
    let category = if draft.category.trim().is_empty() {
        "Майно і транспорт"
    } else {
        draft.category.trim()
    };
    let status = if draft.status.trim().is_empty() {
        "Новий"
    } else {
        draft.status.trim()
    };
    if !["Новий", "Опрацьовується", "Закритий"].contains(&status) {
        return Err("Оберіть коректний статус інциденту.".into());
    }
    db.connection.execute("INSERT INTO incidents(category,incident_type,status,occurred_at,crew_id,equipment_id,position_name,reconnaissance_area,crew_snapshot,description,immediate_actions,consequences,flight_stage,preliminary_cause,snapshot_source,reported_to,reported_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",rusqlite::params![category,draft.incident_type.trim(),status,draft.occurred_at.trim(),draft.crew_id,equipment_ids.first(),position_name,reconnaissance_area,crew_snapshot,draft.description.trim(),draft.immediate_actions.trim(),draft.consequences.trim(),draft.flight_stage.trim(),draft.preliminary_cause.trim(),if draft.snapshot_source.trim().is_empty(){"current"}else{draft.snapshot_source.trim()},draft.reported_to.trim(),draft.reported_at.trim()]).map_err(|_|"Не вдалося зберегти інцидент.".to_string())?;
    let incident_id = db.connection.last_insert_rowid();
    for equipment_id in equipment_ids {
        db.connection
            .execute(
                "INSERT INTO incident_equipment(incident_id,equipment_id) VALUES(?1,?2)",
                rusqlite::params![incident_id, equipment_id],
            )
            .map_err(|_| "Не вдалося зберегти майно інциденту.".to_string())?;
    }
    for personnel_id in draft.personnel_ids {
        let snapshot = db.connection.query_row(
            "SELECT trim(surname || ' ' || given_name || ' ' || patronymic),rank,position FROM personnel WHERE id=?1",
            [personnel_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
        ).map_err(|_| "Обрану особу не знайдено.".to_string())?;
        db.connection.execute(
            "INSERT OR IGNORE INTO incident_personnel(incident_id,personnel_id,full_name_snapshot,rank_snapshot,position_snapshot) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![incident_id,personnel_id,snapshot.0,snapshot.1,snapshot.2],
        ).map_err(|_| "Не вдалося зберегти осіб інциденту.".to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod incident_tests {
    use super::*;

    #[test]
    fn accepts_multiple_assets_of_the_selected_crew() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(name) VALUES('ГРІМ')", [])
            .unwrap();
        let crew_id = connection.last_insert_rowid();
        for name in ["Mavic", "EcoFlow"] {
            connection
                .execute(
                    "INSERT INTO equipment(category,name,crew_id) VALUES('uav',?1,?2)",
                    rusqlite::params![name, crew_id],
                )
                .unwrap();
        }
        let equipment_ids = connection
            .prepare("SELECT id FROM equipment ORDER BY id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<i64>, _>>()
            .unwrap();
        assert!(validate_incident_equipment(&connection, Some(crew_id), &equipment_ids).is_ok());
        assert!(validate_incident_equipment(&connection, None, &equipment_ids).is_err());
    }
}
