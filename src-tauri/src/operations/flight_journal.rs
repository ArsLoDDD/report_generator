use super::{busy, FlightJournalDraft, FlightJournalEntry};
use crate::AppState;
use rusqlite::params;

fn valid_iso_date(value: &str) -> bool {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

fn valid_required_time(value: &str) -> bool {
    !value.is_empty() && chrono::NaiveTime::parse_from_str(value, "%H:%M").is_ok()
}

#[tauri::command]
pub fn list_flight_journal_entries(
    state: tauri::State<AppState>,
) -> Result<Vec<FlightJournalEntry>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db.connection.prepare(
        "SELECT id,flight_date,sky_time,ground_time,crew_id,crew_name_snapshot,position_id,position_name_snapshot,battle_order_snapshot,work_strip_snapshot,uav_id,uav_name_snapshot,uav_type_snapshot,uav_serial_snapshot,mission,payload_source,payload_id,payload_type_snapshot,payload_serial_snapshot,notes FROM flight_journal_entries ORDER BY flight_date DESC,sky_time DESC,id DESC",
    ).map_err(|_| "Не вдалося прочитати журнал польотів.".to_string())?;
    let entries = statement
        .query_map([], |row| {
            Ok(FlightJournalEntry {
                id: row.get(0)?,
                flight_date: row.get(1)?,
                sky_time: row.get(2)?,
                ground_time: row.get(3)?,
                crew_id: row.get(4)?,
                crew_name: row.get(5)?,
                position_id: row.get(6)?,
                position_name: row.get(7)?,
                battle_order: row.get(8)?,
                work_strip: row.get(9)?,
                uav_id: row.get(10)?,
                uav_name: row.get(11)?,
                uav_type: row.get(12)?,
                uav_serial_number: row.get(13)?,
                mission: row.get(14)?,
                payload_source: row.get(15)?,
                payload_id: row.get(16)?,
                payload_type: row.get(17)?,
                payload_serial_number: row.get(18)?,
                notes: row.get(19)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати журнал польотів.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати журнал польотів.".to_string())?;
    Ok(entries)
}

#[tauri::command]
pub fn create_flight_journal_entry(
    state: tauri::State<AppState>,
    draft: FlightJournalDraft,
) -> Result<(), String> {
    let flight_date = draft.flight_date.trim();
    if !valid_iso_date(flight_date) {
        return Err("Вкажіть коректну дату польоту.".into());
    }
    let sky_time = draft.sky_time.trim();
    let ground_time = draft.ground_time.trim();
    if sky_time.is_empty() || ground_time.is_empty() {
        return Err("Вкажіть обов’язкові часи «Небо» та «Земля».".into());
    }
    if !valid_required_time(sky_time) || !valid_required_time(ground_time) {
        return Err("Вкажіть часи «Небо» та «Земля» у форматі ГГ:ХХ.".into());
    }
    if draft.crew_name.trim().is_empty() {
        return Err("Оберіть екіпаж.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection.execute(
        "INSERT INTO flight_journal_entries(flight_date,sky_time,ground_time,crew_id,position_id,uav_id,crew_name_snapshot,position_name_snapshot,battle_order_snapshot,work_strip_snapshot,uav_name_snapshot,uav_type_snapshot,uav_serial_snapshot,mission,payload_source,payload_id,payload_type_snapshot,payload_serial_snapshot,notes) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)",
        params![
            flight_date,
            sky_time,
            ground_time,
            draft.crew_id,
            draft.position_id,
            draft.uav_id,
            draft.crew_name.trim(),
            draft.position_name.trim(),
            draft.battle_order.trim(),
            draft.work_strip.trim(),
            draft.uav_name.trim(),
            draft.uav_type.trim(),
            draft.uav_serial_number.trim(),
            draft.mission.trim(),
            draft.payload_source.trim(),
            draft.payload_id,
            draft.payload_type.trim(),
            draft.payload_serial_number.trim(),
            draft.notes.trim(),
        ],
    ).map_err(|_| "Не вдалося зберегти запис журналу польотів.".to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_date_and_required_time() {
        assert!(valid_iso_date("2026-09-13"));
        assert!(!valid_iso_date("13.09.2026"));
        assert!(!valid_required_time(""));
        assert!(valid_required_time("07:05"));
        assert!(!valid_required_time("25:00"));
    }
}
