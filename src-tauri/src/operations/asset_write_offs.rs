use super::{busy, AssetWriteOff, AssetWriteOffHistoryEvent};
use crate::AppState;
use rusqlite::{params, Connection};

const WRITE_OFF_STATUSES: [&str; 5] = [
    "Очікує списання",
    "Документи готуються",
    "Передано на списання",
    "Списано",
    "Скасовано",
];

pub(crate) fn sync_incident_write_offs(
    connection: &Connection,
    incident_id: i64,
    incident_type: &str,
) -> Result<(), String> {
    if !matches!(incident_type, "Втрата майна" | "Втрата БпЛА") {
        return Ok(());
    }
    connection
        .execute(
            "INSERT OR IGNORE INTO asset_write_offs(
            incident_id,equipment_id,service_code,incident_type,incident_occurred_at,
            asset_name_snapshot,inventory_number_snapshot,serial_number_snapshot,
            accounting_unit_snapshot,quantity
         )
         SELECT i.id,e.id,e.service_code,i.incident_type,i.occurred_at,
                e.name,e.inventory_number,e.serial_number,e.accounting_unit,e.quantity
         FROM incidents i
         JOIN incident_equipment ie ON ie.incident_id=i.id
         JOIN equipment e ON e.id=ie.equipment_id
         WHERE i.id=?1",
            [incident_id],
        )
        .map_err(|_| "Не вдалося передати втрачене майно до списання.".to_string())?;
    connection
        .execute(
            "INSERT INTO asset_write_off_history(write_off_id,status,notes)
         SELECT w.id,w.status,'Автоматично передано з інциденту'
         FROM asset_write_offs w
         WHERE w.incident_id=?1
           AND NOT EXISTS(SELECT 1 FROM asset_write_off_history h WHERE h.write_off_id=w.id)",
            [incident_id],
        )
        .map_err(|_| "Не вдалося записати історію списання.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_asset_write_offs(state: tauri::State<AppState>) -> Result<Vec<AssetWriteOff>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db
        .connection
        .prepare(
            "SELECT id,incident_id,equipment_id,service_code,incident_type,incident_occurred_at,
                asset_name_snapshot,inventory_number_snapshot,serial_number_snapshot,
                accounting_unit_snapshot,quantity,status,notes,created_at,updated_at,completed_at
         FROM asset_write_offs
         ORDER BY CASE status
           WHEN 'Очікує списання' THEN 0
           WHEN 'Документи готуються' THEN 1
           WHEN 'Передано на списання' THEN 2
           WHEN 'Списано' THEN 3
           ELSE 4 END,
           created_at DESC,id DESC",
        )
        .map_err(|_| "Не вдалося прочитати список списання.".to_string())?;
    let result = statement
        .query_map([], |row| {
            Ok(AssetWriteOff {
                id: row.get(0)?,
                incident_id: row.get(1)?,
                equipment_id: row.get(2)?,
                service_code: row.get(3)?,
                incident_type: row.get(4)?,
                incident_occurred_at: row.get(5)?,
                asset_name: row.get(6)?,
                inventory_number: row.get(7)?,
                serial_number: row.get(8)?,
                accounting_unit: row.get(9)?,
                quantity: row.get(10)?,
                status: row.get(11)?,
                notes: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
                completed_at: row.get(15)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати список списання.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати список списання.".to_string());
    result
}

#[tauri::command]
pub fn list_asset_write_off_history(
    state: tauri::State<AppState>,
    write_off_id: i64,
) -> Result<Vec<AssetWriteOffHistoryEvent>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db
        .connection
        .prepare(
            "SELECT id,write_off_id,status,notes,created_at
         FROM asset_write_off_history WHERE write_off_id=?1 ORDER BY id DESC",
        )
        .map_err(|_| "Не вдалося прочитати історію списання.".to_string())?;
    let result = statement
        .query_map([write_off_id], |row| {
            Ok(AssetWriteOffHistoryEvent {
                id: row.get(0)?,
                write_off_id: row.get(1)?,
                status: row.get(2)?,
                notes: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати історію списання.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати історію списання.".to_string());
    result
}

#[tauri::command]
pub fn update_asset_write_off(
    state: tauri::State<AppState>,
    write_off_id: i64,
    status: String,
    notes: String,
) -> Result<(), String> {
    let status = status.trim();
    if !WRITE_OFF_STATUSES.contains(&status) {
        return Err("Оберіть коректний стан списання.".into());
    }
    let mut db = state.0.lock().map_err(|_| busy())?;
    let transaction = db
        .connection
        .transaction()
        .map_err(|_| "Не вдалося почати оновлення списання.".to_string())?;
    let current = transaction.query_row(
        "SELECT status,equipment_id,asset_name_snapshot,service_code,quantity FROM asset_write_offs WHERE id=?1",
        [write_off_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, f64>(4)?)),
    ).map_err(|_| "Запис списання не знайдено.".to_string())?;
    if current.0 == "Списано" && status != "Списано" {
        return Err("Завершене списання не можна повернути до попереднього стану.".into());
    }
    transaction.execute(
        "UPDATE asset_write_offs
         SET status=?1,notes=?2,updated_at=CURRENT_TIMESTAMP,
             completed_at=CASE WHEN ?1='Списано' THEN COALESCE(NULLIF(completed_at,''),CURRENT_TIMESTAMP) ELSE completed_at END
         WHERE id=?3",
        params![status, notes.trim(), write_off_id],
    ).map_err(|_| "Не вдалося оновити стан списання.".to_string())?;
    if status == "Списано" && current.0 != "Списано" {
        if let Some(equipment_id) = current.1 {
            transaction.execute(
                "UPDATE equipment SET status='Списаний',crew_id=NULL,personnel_id=NULL,parent_equipment_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?1",
                [equipment_id],
            ).map_err(|_| "Не вдалося оновити стан майна.".to_string())?;
            transaction
                .execute(
                    "UPDATE crews SET primary_uav_id=NULL WHERE primary_uav_id=?1",
                    [equipment_id],
                )
                .map_err(|_| "Не вдалося від’єднати списаний БпЛА від екіпажу.".to_string())?;
            transaction
                .execute(
                    "UPDATE vehicles SET status='Списаний',crew_id=NULL,personnel_id=NULL
                 WHERE id=(SELECT legacy_vehicle_id FROM equipment WHERE id=?1)",
                    [equipment_id],
                )
                .map_err(|_| "Не вдалося оновити стан списаної техніки.".to_string())?;
            transaction.execute(
                "INSERT INTO asset_history(equipment_id,asset_name,service_code,event_type,quantity_after,details)
                 VALUES(?1,?2,?3,'written_off',?4,?5)",
                params![equipment_id, current.2, current.3, current.4, format!("Списано за записом №{write_off_id}")],
            ).map_err(|_| "Не вдалося записати рух майна.".to_string())?;
        }
    }
    transaction
        .execute(
            "INSERT INTO asset_write_off_history(write_off_id,status,notes) VALUES(?1,?2,?3)",
            params![write_off_id, status, notes.trim()],
        )
        .map_err(|_| "Не вдалося записати історію списання.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося зберегти списання.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_property_loss_incidents_are_synced() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO incidents(id,incident_type,occurred_at) VALUES(1,'Втрата майна','2026-09-29T10:00'),(2,'Втрата військового квитка/посвідчення УБД','2026-09-29T11:00')", []).unwrap();
        connection.execute("INSERT INTO equipment(id,category,name,service_code) VALUES(5,'communications','Ноутбук','ovtm')", []).unwrap();
        connection
            .execute(
                "INSERT INTO incident_equipment(incident_id,equipment_id) VALUES(1,5),(2,5)",
                [],
            )
            .unwrap();

        sync_incident_write_offs(&connection, 1, "Втрата майна").unwrap();
        sync_incident_write_offs(&connection, 2, "Втрата військового квитка/посвідчення УБД")
            .unwrap();

        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM asset_write_offs", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
}
