use super::{busy, Equipment, EquipmentDraft};
use crate::AppState;

#[tauri::command]
pub fn list_equipment(
    state: tauri::State<AppState>,
    category: String,
) -> Result<Vec<Equipment>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut s=db.connection.prepare("SELECT e.id,e.category,e.name,e.inventory_number,e.status,e.crew_id,c.name,e.personnel_id,CASE WHEN p.id IS NULL THEN NULL ELSE trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) END,e.notes,e.total_quantity,e.day_quantity,e.night_quantity,e.uav_type,e.asset_kind,e.components_json,e.assigned_quantity FROM equipment e LEFT JOIN crews c ON c.id=e.crew_id LEFT JOIN personnel p ON p.id=e.personnel_id WHERE e.category=?1 ORDER BY e.id").map_err(|_|"Не вдалося прочитати майно.".to_string())?;
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
    db.connection.execute("INSERT INTO equipment(category,name,inventory_number,status,crew_id,personnel_id,notes,total_quantity,day_quantity,night_quantity,uav_type,asset_kind,components_json,assigned_quantity) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",rusqlite::params![draft.category,draft.name.trim(),draft.inventory_number.trim(),draft.status,draft.crew_id,draft.personnel_id,draft.notes.trim(),total,day,night,draft.uav_type.trim(),draft.asset_kind,draft.components_json,draft.assigned_quantity.max(0).min(total)]).map_err(|_|"Не вдалося додати запис майна.".to_string())?;
    let equipment_id = db.connection.last_insert_rowid();
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
    if draft.category == "weapon_ammo" && draft.personnel_id.is_none() {
        return Err("Зброю та БК потрібно закріпити за військовослужбовцем.".into());
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
    let changed=db.connection.execute("UPDATE equipment SET name=?1,inventory_number=?2,status=?3,crew_id=?4,personnel_id=?5,notes=?6,total_quantity=?7,day_quantity=?8,night_quantity=?9,uav_type=?10,asset_kind=?13,components_json=?14,assigned_quantity=?15 WHERE id=?11 AND category=?12",rusqlite::params![draft.name.trim(),draft.inventory_number.trim(),draft.status.trim(),draft.crew_id,draft.personnel_id,draft.notes.trim(),total,day,night,draft.uav_type.trim(),equipment_id,draft.category,draft.asset_kind,draft.components_json,draft.assigned_quantity.max(0).min(total)]).map_err(|_|"Не вдалося оновити запис майна.".to_string())?;
    if changed != 1 {
        return Err("Запис майна не знайдено.".into());
    }
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
            "UPDATE equipment SET crew_id=?1,assigned_quantity=CASE WHEN ?1 IS NULL THEN 0 ELSE min(total_quantity,max(1,?3)) END WHERE id=?2 AND category='uav'",
            rusqlite::params![crew_id, equipment_id, quantity.unwrap_or(i64::MAX)],
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
