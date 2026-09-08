use super::{busy, Position, PositionDraft};
use crate::AppState;
use rusqlite::Connection;

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
    let mut statement = db.connection.prepare("SELECT p.id,p.name,p.position_type,p.strip_name,p.locality,p.battle_order,p.sector,p.condition,p.size,p.mgrs,p.suitable_uav_text,p.is_active,NULL,GROUP_CONCAT(c.name, ', '),p.notes,p.condition_level,p.field_type FROM positions p LEFT JOIN crews c ON c.position_id=p.id GROUP BY p.id ORDER BY p.id").map_err(|_| "Не вдалося прочитати позиції.".to_string())?;
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
