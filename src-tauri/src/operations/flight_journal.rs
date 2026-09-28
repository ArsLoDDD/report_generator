use super::{busy, FlightJournalDraft, FlightJournalEntry};
use crate::AppState;
use rusqlite::{params, Connection};

fn valid_iso_date(value: &str) -> bool {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

fn valid_required_time(value: &str) -> bool {
    !value.is_empty() && chrono::NaiveTime::parse_from_str(value, "%H:%M").is_ok()
}

fn frozen_personnel_snapshot(
    connection: &Connection,
    flight_date: &str,
    crew_id: Option<i64>,
    sky_time: &str,
) -> (Option<i64>, String) {
    let Some(crew_id) = crew_id else {
        return (None, "[]".into());
    };
    let snapshot = connection
        .query_row(
            "SELECT id,snapshot_json FROM flight_plan_snapshots WHERE plan_date=?1 ORDER BY revision DESC,id DESC LIMIT 1",
            [flight_date],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )
        .ok();
    let Some((snapshot_id, snapshot_json)) = snapshot else {
        return (None, "[]".into());
    };
    let Some(snapshot) = serde_json::from_str::<serde_json::Value>(&snapshot_json).ok() else {
        return (Some(snapshot_id), "[]".into());
    };
    let entry = snapshot
        .get("entries")
        .and_then(|value| value.as_array())
        .and_then(|entries| {
            entries
                .iter()
                .find(|entry| {
                    entry.get("crewId").and_then(|value| value.as_i64()) == Some(crew_id)
                        && entry.get("startTime").and_then(|value| value.as_str()) == Some(sky_time)
                })
                .or_else(|| {
                    entries.iter().find(|entry| {
                        entry.get("crewId").and_then(|value| value.as_i64()) == Some(crew_id)
                    })
                })
        });
    let Some(entry) = entry else {
        return (Some(snapshot_id), "[]".into());
    };
    let commander_id = entry
        .get("actualCommanderId")
        .and_then(|value| value.as_i64());
    let mut ids = entry
        .get("actualMemberIds")
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_i64())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if let Some(commander_id) = commander_id {
        ids.retain(|id| *id != commander_id);
        ids.insert(0, commander_id);
    }
    let members = entry
        .get("memberSnapshots")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let frozen = ids
        .into_iter()
        .filter_map(|personnel_id| {
            let member = members.iter().find(|member| {
                member.get("personnelId").and_then(|value| value.as_i64())
                    == Some(personnel_id)
            })?;
            let position = connection
                .query_row(
                    "SELECT position FROM personnel WHERE id=?1",
                    [personnel_id],
                    |row| row.get::<_, String>(0),
                )
                .unwrap_or_default();
            Some(serde_json::json!({
                "personnelId": personnel_id,
                "fullName": member.get("fullName").and_then(|value| value.as_str()).unwrap_or_default(),
                "rank": member.get("rank").and_then(|value| value.as_str()).unwrap_or_default(),
                "position": position,
                "isCommander": commander_id == Some(personnel_id),
            }))
        })
        .collect::<Vec<_>>();
    (
        Some(snapshot_id),
        serde_json::to_string(&frozen).unwrap_or_else(|_| "[]".into()),
    )
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
    let (snapshot_id, personnel_snapshot_json) =
        frozen_personnel_snapshot(&db.connection, flight_date, draft.crew_id, sky_time);
    db.connection.execute(
        "INSERT INTO flight_journal_entries(flight_date,sky_time,ground_time,crew_id,position_id,uav_id,snapshot_id,crew_name_snapshot,position_name_snapshot,battle_order_snapshot,work_strip_snapshot,uav_name_snapshot,uav_type_snapshot,uav_serial_snapshot,mission,payload_source,payload_id,payload_type_snapshot,payload_serial_snapshot,notes,personnel_snapshot_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)",
        params![
            flight_date,
            sky_time,
            ground_time,
            draft.crew_id,
            draft.position_id,
            draft.uav_id,
            snapshot_id,
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
            personnel_snapshot_json,
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

    #[test]
    fn freezes_the_plan_personnel_in_flight_order() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(4,'ГРІМ')", [])
            .unwrap();
        connection.execute(
            "INSERT INTO personnel(id,surname,given_name,patronymic,rank,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(41,'ІВАНЕНКО','Іван','Іванович','солдат','оператор','1','','','','','','',''),(42,'ПЕТРЕНКО','Петро','Петрович','сержант','командир','2','','','','','','','')",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json) VALUES(1,'2026-09-12',1,?1)",
            [r#"{"entries":[{"crewId":4,"startTime":"14:45","actualMemberIds":[41,42],"actualCommanderId":42,"memberSnapshots":[{"personnelId":41,"fullName":"ІВАНЕНКО Іван Іванович","rank":"солдат"},{"personnelId":42,"fullName":"ПЕТРЕНКО Петро Петрович","rank":"сержант"}]}]}"#],
        ).unwrap();

        let (snapshot_id, personnel_json) =
            frozen_personnel_snapshot(&connection, "2026-09-12", Some(4), "14:45");
        let personnel: serde_json::Value = serde_json::from_str(&personnel_json).unwrap();

        assert_eq!(snapshot_id, Some(1));
        assert_eq!(personnel[0]["personnelId"], 42);
        assert_eq!(personnel[0]["position"], "командир");
        assert_eq!(personnel[1]["personnelId"], 41);
    }
}
