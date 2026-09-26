use super::{busy, Equipment, EquipmentDraft};
use crate::AppState;

pub(crate) fn official_crew_responsible(
    connection: &rusqlite::Connection,
    crew_id: Option<i64>,
) -> Option<i64> {
    crew_id.and_then(|id| {
        connection
            .query_row(
                "SELECT cm.personnel_id
                 FROM crew_members cm
                 JOIN personnel p ON p.id=cm.personnel_id
                 WHERE cm.crew_id=?1 AND cm.left_at IS NULL
                 ORDER BY CASE WHEN lower(p.position) LIKE '%командир%' THEN 0 ELSE 1 END,
                          cm.joined_at,cm.personnel_id
                 LIMIT 1",
                [id],
                |row| row.get::<_, i64>(0),
            )
            .ok()
    })
}

pub(crate) fn sync_crew_equipment_responsibles(
    connection: &rusqlite::Connection,
    crew_id: Option<i64>,
) -> Result<(), String> {
    connection
        .execute(
            "UPDATE equipment
             SET personnel_id=(
                 SELECT cm.personnel_id
                 FROM crew_members cm
                 JOIN personnel p ON p.id=cm.personnel_id
                 WHERE cm.crew_id=equipment.crew_id AND cm.left_at IS NULL
                 ORDER BY CASE WHEN lower(p.position) LIKE '%командир%' THEN 0 ELSE 1 END,
                          cm.joined_at,cm.personnel_id
                 LIMIT 1
             )
             WHERE category<>'weapon_ammo' AND crew_id IS NOT NULL
               AND COALESCE(responsible_manual,0)=0
               AND (?1 IS NULL OR crew_id=?1)",
            [crew_id],
        )
        .map_err(|_| "Не вдалося оновити відповідальних за майно.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_equipment(
    state: tauri::State<AppState>,
    category: String,
) -> Result<Vec<Equipment>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    sync_crew_equipment_responsibles(&db.connection, None)?;
    let mut s=db.connection.prepare("SELECT e.id,e.category,e.name,e.inventory_number,e.status,e.crew_id,c.name,e.personnel_id,CASE WHEN p.id IS NULL THEN NULL ELSE trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) END,e.notes,e.total_quantity,e.day_quantity,e.night_quantity,e.uav_type,e.asset_kind,e.components_json,e.assigned_quantity,e.weapon_kind,e.measurement_unit,e.stock_quantity FROM equipment e LEFT JOIN crews c ON c.id=e.crew_id LEFT JOIN personnel p ON p.id=e.personnel_id WHERE e.category=?1 AND e.legacy_vehicle_id IS NULL ORDER BY e.id").map_err(|_|"Не вдалося прочитати майно.".to_string())?;
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
                total_quantity: r.get(10)?,
                day_quantity: r.get(11)?,
                night_quantity: r.get(12)?,
                uav_type: r.get(13)?,
                asset_kind: r.get(14)?,
                components_json: r.get(15)?,
                assigned_quantity: r.get(16)?,
                weapon_kind: r.get(17)?,
                measurement_unit: r.get(18)?,
                stock_quantity: r.get(19)?,
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
    if draft.category == "weapon_ammo"
        && draft.weapon_kind != "component"
        && draft.personnel_id.is_none()
    {
        return Err("Зброю та БК потрібно закріпити за військовослужбовцем.".into());
    }
    if draft.category == "weapon_ammo"
        && !["weapon", "ammunition", "component"].contains(&draft.weapon_kind.as_str())
    {
        return Err("Оберіть тип: Зброя, БК або Вибухові матеріали.".into());
    }
    if draft.category == "uav"
        && draft.asset_kind == "complex"
        && draft.inventory_number.trim().is_empty()
    {
        return Err("Для комплексу БпАК обов’язково вкажіть серійний номер.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    let day = draft.day_quantity.max(0);
    let night = draft.night_quantity.max(0);
    let total = draft.total_quantity.max(1);
    if draft.category == "uav" && day + night > total {
        return Err("Сума денних і нічних БпЛА не може перевищувати загальну кількість.".into());
    }
    let responsible = if draft.category == "weapon_ammo" {
        draft.personnel_id
    } else {
        official_crew_responsible(&db.connection, draft.crew_id)
    };
    let stock = if draft.category == "weapon_ammo" {
        draft.stock_quantity.max(0.0)
    } else {
        total as f64
    };
    db.connection.execute("INSERT INTO equipment(category,name,inventory_number,status,crew_id,personnel_id,notes,total_quantity,day_quantity,night_quantity,uav_type,asset_kind,components_json,assigned_quantity,weapon_kind,measurement_unit,stock_quantity) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",rusqlite::params![draft.category,draft.name.trim(),draft.inventory_number.trim(),draft.status,draft.crew_id,responsible,draft.notes.trim(),total,day,night,draft.uav_type.trim(),draft.asset_kind,draft.components_json,draft.assigned_quantity.max(0).min(total),draft.weapon_kind,draft.measurement_unit,stock]).map_err(|_|"Не вдалося додати запис майна.".to_string())?;
    let equipment_id = db.connection.last_insert_rowid();
    db.connection.execute(
        "UPDATE equipment SET service_code=CASE
           WHEN category='uav' THEN 'sa_ppo'
           WHEN category='generator' THEN 'ets'
           WHEN category='communications' THEN 'gz_kb'
           WHEN category='weapon_ammo' AND weapon_kind IN ('ammunition','component') THEN 'zu'
           ELSE 'zbbr' END,
         full_name=name,serial_number=inventory_number,
         accounting_unit=CASE WHEN measurement_unit LIKE '%.' THEN measurement_unit ELSE measurement_unit || '.' END,
         quantity=CASE WHEN category='weapon_ammo' THEN stock_quantity ELSE total_quantity END,
         updated_at=CURRENT_TIMESTAMP
         WHERE id=?1",
        [equipment_id],
    ).map_err(|_| "Не вдалося синхронізувати запис зі службами.".to_string())?;
    if draft.category == "uav"
        && draft.asset_kind != "complex"
        && draft.inventory_number.trim().is_empty()
    {
        db.connection
            .execute(
                "UPDATE equipment SET inventory_number=printf('UAV-%06d',id) WHERE id=?1",
                [equipment_id],
            )
            .map_err(|_| "Не вдалося присвоїти службовий ID БпЛА.".to_string())?;
    }
    if draft.category == "uav" {
        if let Some(crew_id) = draft.crew_id {
            db.connection
                .execute(
                    "UPDATE crews SET primary_uav_id=?1 WHERE id=?2 AND primary_uav_id IS NULL",
                    rusqlite::params![equipment_id, crew_id],
                )
                .map_err(|_| "Не вдалося призначити основний БпЛА.".to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn update_equipment(
    state: tauri::State<AppState>,
    equipment_id: i64,
    draft: EquipmentDraft,
) -> Result<(), String> {
    if draft.name.trim().is_empty() {
        return Err("Вкажіть назву запису.".into());
    }
    if draft.category == "uav" && draft.uav_type.trim().is_empty() {
        return Err("Оберіть тип БпАК.".into());
    }
    if draft.category == "weapon_ammo"
        && draft.weapon_kind != "component"
        && draft.personnel_id.is_none()
    {
        return Err("Зброю та БК потрібно закріпити за військовослужбовцем.".into());
    }
    if draft.category == "weapon_ammo"
        && !["weapon", "ammunition", "component"].contains(&draft.weapon_kind.as_str())
    {
        return Err("Оберіть тип: Зброя, БК або Вибухові матеріали.".into());
    }
    let day = draft.day_quantity.max(0);
    let night = draft.night_quantity.max(0);
    let total = draft.total_quantity.max(1);
    if draft.category == "uav" && day + night > total {
        return Err("Сума денних і нічних БпЛА не може перевищувати загальну кількість.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    let previous_primary_crew = db
        .connection
        .query_row(
            "SELECT id FROM crews WHERE primary_uav_id=?1",
            [equipment_id],
            |row| row.get::<_, i64>(0),
        )
        .ok();
    if draft.category == "uav"
        && draft.asset_kind == "complex"
        && draft.inventory_number.trim().is_empty()
    {
        return Err("Для комплексу БпАК обов’язково вкажіть серійний номер.".into());
    }
    let responsible = if draft.category == "weapon_ammo" {
        draft.personnel_id
    } else {
        official_crew_responsible(&db.connection, draft.crew_id)
    };
    let stock = if draft.category == "weapon_ammo" {
        draft.stock_quantity.max(0.0)
    } else {
        total as f64
    };
    let changed=db.connection.execute("UPDATE equipment SET name=?1,inventory_number=?2,status=?3,crew_id=?4,personnel_id=?5,notes=?6,total_quantity=?7,day_quantity=?8,night_quantity=?9,uav_type=?10,asset_kind=?13,components_json=?14,assigned_quantity=?15,weapon_kind=?16,measurement_unit=?17,stock_quantity=?18 WHERE id=?11 AND category=?12",rusqlite::params![draft.name.trim(),draft.inventory_number.trim(),draft.status.trim(),draft.crew_id,responsible,draft.notes.trim(),total,day,night,draft.uav_type.trim(),equipment_id,draft.category,draft.asset_kind,draft.components_json,draft.assigned_quantity.max(0).min(total),draft.weapon_kind,draft.measurement_unit,stock]).map_err(|_|"Не вдалося оновити запис майна.".to_string())?;
    if changed != 1 {
        return Err("Запис майна не знайдено.".into());
    }
    db.connection.execute(
        "UPDATE equipment SET
           service_code=CASE
             WHEN category='uav' THEN 'sa_ppo'
             WHEN category='generator' THEN 'ets'
             WHEN category='communications' THEN CASE WHEN trim(service_code)='' THEN 'gz_kb' ELSE service_code END
             WHEN category='weapon_ammo' AND weapon_kind IN ('ammunition','component') THEN 'zu'
             ELSE 'zbbr' END,
           full_name=CASE WHEN trim(full_name)='' THEN name ELSE full_name END,
           serial_number=inventory_number,
           accounting_unit=CASE WHEN measurement_unit LIKE '%.' THEN measurement_unit ELSE measurement_unit || '.' END,
           quantity=CASE WHEN category='weapon_ammo' THEN stock_quantity ELSE total_quantity END,
           updated_at=CURRENT_TIMESTAMP
         WHERE id=?1",
        [equipment_id],
    ).map_err(|_| "Не вдалося синхронізувати зміни зі службами.".to_string())?;
    if draft.category == "uav" {
        db.connection.execute("UPDATE crews SET primary_uav_id=NULL WHERE primary_uav_id=?1 AND (?2 IS NULL OR id<>?2)",rusqlite::params![equipment_id,draft.crew_id]).map_err(|_|"Не вдалося оновити основний БпЛА екіпажу.".to_string())?;
        if let Some(crew_id) = draft.crew_id {
            db.connection
                .execute(
                    "UPDATE crews SET primary_uav_id=?1 WHERE id=?2 AND primary_uav_id IS NULL",
                    rusqlite::params![equipment_id, crew_id],
                )
                .map_err(|_| "Не вдалося призначити основний БпЛА.".to_string())?;
        }
        if let Some(previous_crew_id) = previous_primary_crew {
            if Some(previous_crew_id) != draft.crew_id {
                db.connection.execute("UPDATE crews SET primary_uav_id=(SELECT id FROM equipment WHERE category='uav' AND crew_id=?1 ORDER BY id LIMIT 1) WHERE id=?1 AND primary_uav_id IS NULL",[previous_crew_id]).map_err(|_|"Не вдалося переобрати основний БпЛА.".to_string())?;
            }
        }
    }
    Ok(())
}
#[tauri::command]
pub fn assign_equipment(
    state: tauri::State<AppState>,
    equipment_id: i64,
    crew_id: Option<i64>,
    quantity: Option<i64>,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let previous_primary_crew = db
        .connection
        .query_row(
            "SELECT id FROM crews WHERE primary_uav_id=?1",
            [equipment_id],
            |row| row.get::<_, i64>(0),
        )
        .ok();
    if db
        .connection
        .execute(
            "UPDATE equipment SET crew_id=?1,personnel_id=?4,assigned_quantity=CASE WHEN ?1 IS NULL THEN 0 ELSE min(total_quantity,max(1,?3)) END WHERE id=?2 AND category='uav'",
            rusqlite::params![crew_id, equipment_id, quantity.unwrap_or(i64::MAX), official_crew_responsible(&db.connection, crew_id)],
        )
        .map_err(|_| "Не вдалося перепризначити БпЛА.".to_string())?
        != 1
    {
        return Err("БпЛА не знайдено.".into());
    }
    db.connection.execute("UPDATE crews SET primary_uav_id=NULL WHERE primary_uav_id=?1 AND (?2 IS NULL OR id<>?2)",rusqlite::params![equipment_id,crew_id]).map_err(|_|"Не вдалося оновити основний БпЛА екіпажу.".to_string())?;
    if let Some(crew_id) = crew_id {
        db.connection
            .execute(
                "UPDATE crews SET primary_uav_id=?1 WHERE id=?2 AND primary_uav_id IS NULL",
                rusqlite::params![equipment_id, crew_id],
            )
            .map_err(|_| "Не вдалося призначити основний БпЛА.".to_string())?;
    }
    if let Some(previous_crew_id) = previous_primary_crew {
        if Some(previous_crew_id) != crew_id {
            db.connection.execute("UPDATE crews SET primary_uav_id=(SELECT id FROM equipment WHERE category='uav' AND crew_id=?1 ORDER BY id LIMIT 1) WHERE id=?1 AND primary_uav_id IS NULL",[previous_crew_id]).map_err(|_|"Не вдалося переобрати основний БпЛА.".to_string())?;
        }
    }
    Ok(())
}
#[tauri::command]
pub fn delete_equipment(state: tauri::State<AppState>, equipment_id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let primary_crew = db
        .connection
        .query_row(
            "SELECT id FROM crews WHERE primary_uav_id=?1",
            [equipment_id],
            |row| row.get::<_, i64>(0),
        )
        .ok();
    db.connection
        .execute("DELETE FROM equipment WHERE id=?1", [equipment_id])
        .map_err(|_| "Не вдалося видалити запис майна.".to_string())?;
    if let Some(crew_id) = primary_crew {
        db.connection.execute("UPDATE crews SET primary_uav_id=(SELECT id FROM equipment WHERE category='uav' AND crew_id=?1 ORDER BY id LIMIT 1) WHERE id=?1",[crew_id]).map_err(|_|"Не вдалося переобрати основний БпЛА.".to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn actual_transfer_does_not_replace_the_official_responsible_for_crew_uavs() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        for (id, surname, position) in [
            (1, "ПЕРШИЙ", "командир екіпажу СОКІЛ"),
            (2, "ДРУГИЙ", "командир екіпажу БАРС"),
        ] {
            connection
                .execute(
                    "INSERT INTO personnel(
                    id,rank,surname,given_name,patronymic,position,tax_id,birth_date,
                    education_level,education_details,armed_forces_service_start_date,
                    position_assigned_date,position_assignment_order,military_id
                 ) VALUES(?1,'сержант',?2,'Іван','Іванович',?3,?4,'','','','','','','')",
                    rusqlite::params![id, surname, position, format!("tax-{id}")],
                )
                .unwrap();
        }
        connection
            .execute(
                "INSERT INTO crews(id,name) VALUES(1,'СОКІЛ'),(2,'БАРС')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id,joined_at)
             VALUES(1,1,'2026-09-01'),(2,2,'2026-09-01')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO crew_actual_members(crew_id,personnel_id) VALUES(2,1)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO equipment(id,category,name,crew_id,personnel_id)
             VALUES(10,'uav','SHARK СОКІЛ',1,1),(20,'uav','SHARK БАРС',2,1)",
                [],
            )
            .unwrap();

        assert_eq!(official_crew_responsible(&connection, Some(1)), Some(1));
        assert_eq!(official_crew_responsible(&connection, Some(2)), Some(2));
        sync_crew_equipment_responsibles(&connection, None).unwrap();

        let first: i64 = connection
            .query_row(
                "SELECT personnel_id FROM equipment WHERE id=10",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let second: i64 = connection
            .query_row(
                "SELECT personnel_id FROM equipment WHERE id=20",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(first, 1);
        assert_eq!(second, 2);
    }
}
