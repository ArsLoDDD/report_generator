use super::{busy, FlightJournalDraft, FlightJournalEntry};
use crate::AppState;
use chrono::NaiveTime;
use rusqlite::{params, Connection};

fn valid_iso_date(value: &str) -> bool {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

fn valid_required_time(value: &str) -> bool {
    !value.is_empty() && chrono::NaiveTime::parse_from_str(value, "%H:%M").is_ok()
}

fn is_strike_uav_type(value: &str) -> bool {
    matches!(
        value.trim().to_lowercase().as_str(),
        "літаковий ударний" | "фпв" | "бомбер" | "фпв перехоплювач" | "коптер"
    )
}

fn is_fpv_uav_type(value: &str) -> bool {
    value.trim().to_lowercase().contains("фпв")
}

fn personnel_ids_from_snapshot(value: &str) -> Vec<i64> {
    serde_json::from_str::<Vec<serde_json::Value>>(value)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|member| member.get("personnelId").and_then(|id| id.as_i64()))
        .collect()
}

fn personnel_ids_from_plan_snapshot(value: &str, crew_id: Option<i64>, sky_time: &str) -> Vec<i64> {
    let Some(crew_id) = crew_id else {
        return Vec::new();
    };
    let Some(snapshot) = serde_json::from_str::<serde_json::Value>(value).ok() else {
        return Vec::new();
    };
    let Some(entry) = snapshot
        .get("entries")
        .and_then(|entries| entries.as_array())
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
        })
    else {
        return Vec::new();
    };
    let commander_id = entry
        .get("actualCommanderId")
        .and_then(|value| value.as_i64());
    let mut ids: Vec<i64> = entry
        .get("actualMemberIds")
        .and_then(|value| value.as_array())
        .map(|values| values.iter().filter_map(|value| value.as_i64()).collect())
        .unwrap_or_default();
    if let Some(commander_id) = commander_id {
        ids.retain(|id| *id != commander_id);
        ids.insert(0, commander_id);
    }
    ids
}

fn validate_completion_detail(
    event_type: &str,
    uav_type: &str,
    completion_detail: &str,
) -> Result<(), String> {
    if event_type == "Відпрацювання" {
        if !is_strike_uav_type(uav_type) {
            return Err("«Відпрацювання» доступне лише для ударного БпЛА.".into());
        }
        if !matches!(completion_detail, "Уражено" | "Не уражено") {
            return Err("Оберіть результат відпрацювання.".into());
        }
    }
    if event_type == "Втрата" && !matches!(completion_detail, "Подавлення" | "Збиття" | "Обрив")
    {
        return Err("Оберіть причину втрати.".into());
    }
    if event_type == "Втрата" && completion_detail == "Обрив" && !is_fpv_uav_type(uav_type)
    {
        return Err("Причина «Обрив» доступна лише для ФПВ.".into());
    }
    Ok(())
}

fn personnel_ids_at_sky_time(
    connection: &Connection,
    flight_date: &str,
    crew_id: i64,
    sky_time: &str,
) -> Option<Vec<i64>> {
    let sky = NaiveTime::parse_from_str(sky_time, "%H:%M").ok()?;
    let schedules = crate::flight_plan::flight_plan_location_schedule(connection, flight_date)
        .ok()
        .flatten()?;
    let schedule = schedules
        .into_iter()
        .find(|schedule| schedule.crew_id == crew_id)?;
    let first = schedule.stages.first()?;
    let first_time = NaiveTime::parse_from_str(&first.start_time, "%H:%M").ok();
    if schedule.arrives_on_plan_date && first_time.is_some_and(|arrival| sky < arrival) {
        return Some(Vec::new());
    }
    if schedule.departs_on_plan_date {
        if let Ok(departure) = NaiveTime::parse_from_str(&schedule.departure_time, "%H:%M") {
            if sky >= departure {
                return Some(Vec::new());
            }
        }
    }

    // For a crew that was already on the position, the first stage is the
    // composition at the start of the day even though its displayed time is
    // the first planned flight. Subsequent stages are ordered point changes.
    let mut members = first.member_ids.clone();
    for stage in schedule.stages.iter().skip(1) {
        let Ok(change_time) = NaiveTime::parse_from_str(&stage.start_time, "%H:%M") else {
            continue;
        };
        if change_time <= sky {
            members = stage.member_ids.clone();
        }
    }
    Some(members)
}

fn crew_entry_at_sky_time<'a>(
    snapshot: &'a serde_json::Value,
    crew_id: i64,
    sky_time: &str,
) -> Option<&'a serde_json::Value> {
    let sky = NaiveTime::parse_from_str(sky_time, "%H:%M").ok();
    let entries = snapshot.get("entries")?.as_array()?;
    let crew_entries = entries
        .iter()
        .filter(|entry| entry.get("crewId").and_then(|value| value.as_i64()) == Some(crew_id));
    if let Some(sky) = sky {
        crew_entries
            .clone()
            .filter_map(|entry| {
                let time = entry
                    .get("startTime")
                    .and_then(|value| value.as_str())
                    .and_then(|value| NaiveTime::parse_from_str(value, "%H:%M").ok())?;
                (time <= sky).then_some((time, entry))
            })
            .max_by_key(|(time, _)| *time)
            .map(|(_, entry)| entry)
            .or_else(|| crew_entries.into_iter().next())
    } else {
        crew_entries.into_iter().next()
    }
}

fn member_snapshot(snapshot: &serde_json::Value, personnel_id: i64) -> Option<&serde_json::Value> {
    let entry_members = snapshot
        .get("entries")
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .flat_map(|entry| {
            entry
                .get("memberSnapshots")
                .and_then(|value| value.as_array())
                .into_iter()
                .flatten()
        });
    let transition_members = snapshot
        .get("personnelTransitions")
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .flat_map(|transition| {
            transition
                .get("memberSnapshots")
                .and_then(|value| value.as_array())
                .into_iter()
                .flatten()
        });
    entry_members.chain(transition_members).find(|member| {
        member.get("personnelId").and_then(|value| value.as_i64()) == Some(personnel_id)
    })
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
    let entry = crew_entry_at_sky_time(&snapshot, crew_id, sky_time);
    let Some(entry) = entry else {
        return (Some(snapshot_id), "[]".into());
    };
    let commander_id = entry
        .get("actualCommanderId")
        .and_then(|value| value.as_i64());
    let mut ids = personnel_ids_at_sky_time(connection, flight_date, crew_id, sky_time)
        .unwrap_or_else(|| {
            entry
                .get("actualMemberIds")
                .and_then(|value| value.as_array())
                .map(|values| values.iter().filter_map(|value| value.as_i64()).collect())
                .unwrap_or_default()
        });
    if let Some(commander_id) = commander_id {
        if ids.contains(&commander_id) {
            ids.retain(|id| *id != commander_id);
            ids.insert(0, commander_id);
        }
    }
    let frozen = ids
        .into_iter()
        .filter_map(|personnel_id| {
            let member = member_snapshot(&snapshot, personnel_id);
            let current = connection
                .query_row(
                    "SELECT trim(surname||' '||given_name||' '||patronymic),rank,position FROM personnel WHERE id=?1",
                    [personnel_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
                )
                .ok()?;
            Some(serde_json::json!({
                "personnelId": personnel_id,
                "fullName": member.and_then(|value| value.get("fullName")).and_then(|value| value.as_str()).unwrap_or(&current.0),
                "rank": member.and_then(|value| value.get("rank")).and_then(|value| value.as_str()).unwrap_or(&current.1),
                "position": current.2,
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
        "SELECT id,flight_date,sky_time,ground_time,completion_type,completion_time,completion_detail,crew_id,crew_name_snapshot,position_id,position_name_snapshot,battle_order_snapshot,work_strip_snapshot,uav_id,uav_name_snapshot,uav_type_snapshot,uav_serial_snapshot,mission,payload_source,payload_id,payload_type_snapshot,payload_serial_snapshot,notes,personnel_snapshot_json,COALESCE((SELECT snapshot_json FROM flight_plan_snapshots WHERE id=flight_journal_entries.snapshot_id),'') FROM flight_journal_entries ORDER BY flight_date DESC,sky_time DESC,id DESC",
    ).map_err(|_| "Не вдалося прочитати журнал польотів.".to_string())?;
    let entries = statement
        .query_map([], |row| {
            let sky_time = row.get::<_, String>(2)?;
            let crew_id = row.get::<_, Option<i64>>(7)?;
            let frozen_personnel = row.get::<_, String>(23)?;
            let mut personnel_ids = personnel_ids_from_snapshot(&frozen_personnel);
            if personnel_ids.is_empty() {
                personnel_ids = personnel_ids_from_plan_snapshot(
                    &row.get::<_, String>(24)?,
                    crew_id,
                    &sky_time,
                );
            }
            Ok(FlightJournalEntry {
                id: row.get(0)?,
                flight_date: row.get(1)?,
                sky_time,
                ground_time: row.get(3)?,
                completion_type: row.get(4)?,
                completion_time: row.get(5)?,
                completion_detail: row.get(6)?,
                crew_id,
                crew_name: row.get(8)?,
                position_id: row.get(9)?,
                position_name: row.get(10)?,
                battle_order: row.get(11)?,
                work_strip: row.get(12)?,
                uav_id: row.get(13)?,
                uav_name: row.get(14)?,
                uav_type: row.get(15)?,
                uav_serial_number: row.get(16)?,
                mission: row.get(17)?,
                payload_source: row.get(18)?,
                payload_id: row.get(19)?,
                payload_type: row.get(20)?,
                payload_serial_number: row.get(21)?,
                notes: row.get(22)?,
                personnel_ids,
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
    if !valid_iso_date(flight_date)
        || flight_date != chrono::Local::now().format("%Y-%m-%d").to_string()
    {
        return Err("Новий політ можна створити лише поточною датою.".into());
    }
    if !draft.sky_time.trim().is_empty()
        || !draft.ground_time.trim().is_empty()
        || !draft.completion_type.trim().is_empty()
        || !draft.completion_time.trim().is_empty()
    {
        return Err("Час і завершення польоту фіксуються у картці після створення запису.".into());
    }
    let Some(crew_id) = draft.crew_id else {
        return Err("Оберіть екіпаж.".into());
    };
    if !is_strike_uav_type(&draft.uav_type)
        && (!draft.payload_type.trim().is_empty() || draft.payload_id.is_some())
    {
        return Err("БК можна вказувати лише для ударного БпЛА.".into());
    }
    let sky_time = "";
    let ground_time = "";
    let db = state.0.lock().map_err(|_| busy())?;
    let crew_name = db
        .connection
        .query_row("SELECT name FROM crews WHERE id=?1", [crew_id], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|_| "Обраний екіпаж не знайдено.".to_string())?;
    let (snapshot_id, personnel_snapshot_json) =
        frozen_personnel_snapshot(&db.connection, flight_date, Some(crew_id), sky_time);
    db.connection.execute(
        "INSERT INTO flight_journal_entries(flight_date,sky_time,ground_time,completion_type,completion_time,crew_id,position_id,uav_id,snapshot_id,crew_name_snapshot,position_name_snapshot,battle_order_snapshot,work_strip_snapshot,uav_name_snapshot,uav_type_snapshot,uav_serial_snapshot,mission,payload_source,payload_id,payload_type_snapshot,payload_serial_snapshot,notes,personnel_snapshot_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)",
        params![
            flight_date,
            sky_time,
            ground_time,
            "",
            "",
            crew_id,
            draft.position_id,
            draft.uav_id,
            snapshot_id,
            crew_name,
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

#[tauri::command]
pub fn update_flight_journal_progress(
    state: tauri::State<AppState>,
    flight_id: i64,
    event_type: String,
    event_time: String,
    completion_detail: String,
) -> Result<(), String> {
    let event_type = event_type.trim();
    if !matches!(event_type, "Небо" | "Земля" | "Втрата" | "Відпрацювання")
    {
        return Err("Оберіть коректну подію польоту.".into());
    }
    let event_time = if event_time.trim().is_empty() {
        chrono::Local::now().format("%H:%M").to_string()
    } else {
        event_time.trim().to_string()
    };
    if !valid_required_time(&event_time) {
        return Err("Вкажіть час події у форматі ГГ:ХХ.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    let current = db.connection.query_row(
        "SELECT flight_date,sky_time,completion_type,crew_id,uav_type_snapshot FROM flight_journal_entries WHERE id=?1",
        [flight_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<i64>>(3)?, row.get::<_, String>(4)?)),
    ).map_err(|_| "Запис польоту не знайдено.".to_string())?;
    if event_type == "Небо" {
        if !current.1.is_empty() {
            return Err("Час «Небо» вже зафіксовано.".into());
        }
        let (snapshot_id, personnel_snapshot_json) =
            frozen_personnel_snapshot(&db.connection, &current.0, current.3, &event_time);
        db.connection.execute(
            "UPDATE flight_journal_entries SET sky_time=?1,snapshot_id=?2,personnel_snapshot_json=?3 WHERE id=?4",
            params![event_time, snapshot_id, personnel_snapshot_json, flight_id],
        ).map_err(|_| "Не вдалося зафіксувати час «Небо».".to_string())?;
        return Ok(());
    }
    if current.1.is_empty() {
        return Err("Спочатку зафіксуйте час «Небо».".into());
    }
    if !current.2.is_empty() {
        return Err("Політ уже завершено.".into());
    }
    let completion_detail = completion_detail.trim();
    validate_completion_detail(event_type, &current.4, completion_detail)?;
    let ground_time = if event_type == "Земля" {
        event_time.as_str()
    } else {
        ""
    };
    db.connection.execute(
        "UPDATE flight_journal_entries SET ground_time=?1,completion_type=?2,completion_time=?3,completion_detail=?4 WHERE id=?5",
        params![ground_time, event_type, event_time, completion_detail, flight_id],
    ).map_err(|_| "Не вдалося завершити політ.".to_string())?;
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
    fn recognises_only_agreed_strike_uav_types() {
        for value in [
            "Літаковий ударний",
            "ФПВ",
            "Бомбер",
            "ФПВ перехоплювач",
            "Коптер",
        ] {
            assert!(is_strike_uav_type(value), "{value}");
        }
        assert!(!is_strike_uav_type("Літаковий розвідувальний"));
        assert!(!is_strike_uav_type("НРК"));
    }

    #[test]
    fn reads_personnel_ids_from_a_frozen_flight_snapshot() {
        let value =
            r#"[{"personnelId":7,"fullName":"Перший"},{"personnelId":9,"fullName":"Другий"}]"#;
        assert_eq!(personnel_ids_from_snapshot(value), vec![7, 9]);
        assert!(personnel_ids_from_snapshot("invalid").is_empty());
    }

    #[test]
    fn falls_back_to_the_exact_saved_plan_snapshot_for_legacy_flights() {
        let value = r#"{"entries":[{"crewId":4,"startTime":"08:20","actualMemberIds":[7,9],"actualCommanderId":9},{"crewId":4,"startTime":"10:40","actualMemberIds":[11]}]}"#;
        assert_eq!(
            personnel_ids_from_plan_snapshot(value, Some(4), "08:20"),
            vec![9, 7]
        );
        assert_eq!(
            personnel_ids_from_plan_snapshot(value, Some(4), "10:40"),
            vec![11]
        );
    }

    #[test]
    fn validates_loss_causes_and_strike_results() {
        assert!(validate_completion_detail("Втрата", "ФПВ", "Обрив").is_ok());
        assert!(validate_completion_detail("Втрата", "Коптер", "Обрив").is_err());
        assert!(validate_completion_detail("Втрата", "Коптер", "Збиття").is_ok());
        assert!(validate_completion_detail("Відпрацювання", "ФПВ", "Уражено").is_ok());
        assert!(validate_completion_detail(
            "Відпрацювання",
            "Літаковий розвідувальний",
            "Не уражено"
        )
        .is_err());
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

    #[test]
    fn freezes_composition_at_actual_sky_time_after_a_person_left() {
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
            [r#"{
                "entries":[
                    {"crewId":4,"startTime":"08:00","actualMemberIds":[41,42],"actualCommanderId":42,"memberSnapshots":[{"personnelId":41,"fullName":"ІВАНЕНКО Іван Іванович","rank":"солдат"},{"personnelId":42,"fullName":"ПЕТРЕНКО Петро Петрович","rank":"сержант"}]},
                    {"crewId":4,"startTime":"14:45","actualMemberIds":[42],"actualCommanderId":42,"memberSnapshots":[{"personnelId":41,"fullName":"ІВАНЕНКО Іван Іванович","rank":"солдат"},{"personnelId":42,"fullName":"ПЕТРЕНКО Петро Петрович","rank":"сержант"}]}
                ],
                "personnelTransitions":[{
                    "crewId":4,"outgoingMemberIds":[41],"outgoingTime":"14:47",
                    "incomingMemberIds":[],"incomingTime":"",
                    "memberSnapshots":[{"personnelId":41,"fullName":"ІВАНЕНКО Іван Іванович","rank":"солдат"}]
                }]
            }"#],
        ).unwrap();

        let (_, before_transition) =
            frozen_personnel_snapshot(&connection, "2026-09-12", Some(4), "14:46");
        let before_transition = personnel_ids_from_snapshot(&before_transition);
        assert!(before_transition.contains(&41));
        assert!(before_transition.contains(&42));

        let (_, after_transition) =
            frozen_personnel_snapshot(&connection, "2026-09-12", Some(4), "14:50");
        assert_eq!(personnel_ids_from_snapshot(&after_transition), vec![42]);
    }
}
