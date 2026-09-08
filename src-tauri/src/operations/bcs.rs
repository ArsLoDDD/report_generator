use super::busy;
use crate::AppState;

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
