use super::crews::crew_members;
use super::{busy, Incident, IncidentDraft};
use crate::AppState;

#[tauri::command]
pub fn list_incidents(state: tauri::State<AppState>) -> Result<Vec<Incident>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut s=db.connection.prepare("SELECT i.id,i.incident_type,i.occurred_at,i.crew_id,c.name,i.equipment_id,e.name,i.position_name,i.reconnaissance_area,i.crew_snapshot,COALESCE((SELECT group_concat(v.name || ' ' || v.registration_number, ', ') FROM vehicles v WHERE v.crew_id=i.crew_id),''),i.description FROM incidents i LEFT JOIN crews c ON c.id=i.crew_id LEFT JOIN equipment e ON e.id=i.equipment_id ORDER BY i.id").map_err(|_|"Не вдалося прочитати інциденти.".to_string())?;
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
