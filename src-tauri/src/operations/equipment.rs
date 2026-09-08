use super::{busy, Equipment, EquipmentDraft};
use crate::AppState;

#[tauri::command]
pub fn list_equipment(
    state: tauri::State<AppState>,
    category: String,
) -> Result<Vec<Equipment>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut s=db.connection.prepare("SELECT e.id,e.category,e.name,e.inventory_number,e.status,e.crew_id,c.name,e.personnel_id,CASE WHEN p.id IS NULL THEN NULL ELSE trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) END,e.notes FROM equipment e LEFT JOIN crews c ON c.id=e.crew_id LEFT JOIN personnel p ON p.id=e.personnel_id WHERE e.category=?1 ORDER BY e.id").map_err(|_|"Не вдалося прочитати майно.".to_string())?;
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
