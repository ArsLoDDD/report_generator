use super::crews::actual_crew_members;
use super::{
    busy, Incident, IncidentDataDraft, IncidentDocument, IncidentDraft, IncidentHistoryEvent,
    IncidentStep,
};
use crate::AppState;
use rusqlite::{Connection, OptionalExtension, Transaction};

const INCIDENT_STATUSES: [&str; 7] = [
    "Чернетка",
    "Зареєстровано",
    "Першочергові дії",
    "Опрацьовується",
    "Очікує",
    "Завершено",
    "Скасовано",
];
const STEP_STATUSES: [&str; 5] = [
    "Не розпочато",
    "В роботі",
    "Очікує",
    "Виконано",
    "Пропущено",
];
const DOCUMENT_STATUSES: [&str; 6] = [
    "Не створено",
    "Чернетка",
    "Сформовано",
    "Погоджено",
    "Зареєстровано",
    "Повернуто на доопрацювання",
];
type HistoricalPersonnelSnapshot = (i64, String, String, String);

#[derive(Debug)]
struct PreparedIncidentDraft {
    category: String,
    incident_type: String,
    custom_type_name: String,
    occurred_at: String,
    crew_id: Option<i64>,
    vehicle_id: Option<i64>,
    vehicle_snapshot: String,
    equipment_ids: Vec<i64>,
    personnel: Vec<(Option<i64>, String, String, String)>,
    position_name: String,
    reconnaissance_area: String,
    crew_snapshot: String,
    description: String,
    immediate_actions: String,
    consequences: String,
    flight_stage: String,
    preliminary_cause: String,
    snapshot_source: String,
    reported_to: String,
    reported_at: String,
    source_flight_id: Option<i64>,
    event_data_json: String,
}

#[derive(Debug)]
struct ExistingIncidentFactualContext {
    incident_type: String,
    occurred_at: String,
    crew_id: Option<i64>,
    vehicle_id: Option<i64>,
    vehicle_snapshot: String,
    position_name: String,
    position_area: String,
    crew_snapshot: String,
    source_flight_id: Option<i64>,
    event_data: serde_json::Value,
    personnel: Vec<(Option<i64>, String, String, String)>,
}

impl ExistingIncidentFactualContext {
    fn personnel_ids(&self) -> Vec<i64> {
        self.personnel
            .iter()
            .filter_map(|(personnel_id, _, _, _)| *personnel_id)
            .collect()
    }

    fn matches_identity(&self, incident_type: &str, draft: &IncidentDraft) -> bool {
        self.incident_type == incident_type
            && self.occurred_at == draft.occurred_at.trim()
            && self.crew_id == draft.crew_id
            && self.vehicle_id == draft.vehicle_id
            && self.source_flight_id == draft.source_flight_id
            && self.personnel_ids() == draft.personnel_ids
    }
}

fn existing_incident_factual_context(
    connection: &Connection,
    incident_id: i64,
) -> Result<ExistingIncidentFactualContext, String> {
    let mut context = connection
        .query_row(
            "SELECT incident_type,occurred_at,crew_id,vehicle_id,vehicle_snapshot,position_name,reconnaissance_area,crew_snapshot,source_flight_id,event_data_json FROM incidents WHERE id=?1",
            [incident_id],
            |row| {
                Ok(ExistingIncidentFactualContext {
                    incident_type: row.get(0)?,
                    occurred_at: row.get(1)?,
                    crew_id: row.get(2)?,
                    vehicle_id: row.get(3)?,
                    vehicle_snapshot: row.get(4)?,
                    position_name: row.get(5)?,
                    position_area: row.get(6)?,
                    crew_snapshot: row.get(7)?,
                    source_flight_id: row.get(8)?,
                    event_data: serde_json::from_str::<serde_json::Value>(
                        &row.get::<_, String>(9)?,
                    )
                    .unwrap_or_else(|_| serde_json::json!({})),
                    personnel: Vec::new(),
                })
            },
        )
        .map_err(|_| "Інцидент не знайдено.".to_string())?;
    let mut statement = connection
        .prepare("SELECT personnel_id,full_name_snapshot,rank_snapshot,position_snapshot FROM incident_personnel WHERE incident_id=?1 ORDER BY selection_order,rowid")
        .map_err(|_| "Не вдалося прочитати історичний склад інциденту.".to_string())?;
    context.personnel = statement
        .query_map([incident_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|_| "Не вдалося прочитати історичний склад інциденту.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати історичний склад інциденту.".to_string())?;
    Ok(context)
}

fn ensure_forward_incident_transition(previous: &str, next: &str) -> Result<(), String> {
    if previous == next {
        return Ok(());
    }
    if matches!(previous, "Завершено" | "Скасовано") {
        return Err("Кінцевий стан інциденту не можна змінити.".into());
    }
    if next == "Скасовано" {
        return Ok(());
    }
    let previous_order = INCIDENT_STATUSES
        .iter()
        .position(|status| *status == previous)
        .ok_or_else(|| "Поточний стан інциденту невідомий.".to_string())?;
    let next_order = INCIDENT_STATUSES
        .iter()
        .position(|status| *status == next)
        .ok_or_else(|| "Новий стан інциденту невідомий.".to_string())?;
    if next_order <= previous_order {
        return Err("Стан інциденту не можна повернути назад.".into());
    }
    Ok(())
}

fn ensure_forward_step_transition(previous: &str, next: &str) -> Result<(), String> {
    if previous == next {
        return Ok(());
    }
    if matches!(previous, "Виконано" | "Пропущено") {
        return Err("Кінцевий стан кроку не можна змінити.".into());
    }
    if next == "Пропущено" {
        return Ok(());
    }
    let previous_order = STEP_STATUSES
        .iter()
        .position(|status| *status == previous)
        .ok_or_else(|| "Поточний стан кроку невідомий.".to_string())?;
    let next_order = STEP_STATUSES
        .iter()
        .position(|status| *status == next)
        .ok_or_else(|| "Новий стан кроку невідомий.".to_string())?;
    if next_order <= previous_order {
        return Err("Стан кроку не можна повернути назад.".into());
    }
    Ok(())
}

fn valid_incident_datetime(value: &str) -> bool {
    chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M").is_ok()
}

fn incident_requires_primary_person(incident_type: &str) -> bool {
    matches!(
        incident_type,
        "Поранення"
            | "Загибель"
            | "Травма"
            | "СЗЧ"
            | "Алкогольне/наркотичне сп’яніння"
            | "Самогубство"
            | "Втрата військового квитка/посвідчення УБД"
    )
}

fn incident_requires_witnesses(incident_type: &str) -> bool {
    matches!(
        incident_type,
        "Втрата БпЛА"
            | "Травма"
            | "СЗЧ"
            | "Алкогольне/наркотичне сп’яніння"
            | "Самогубство"
            | "Втрата військового квитка/посвідчення УБД"
    )
}

fn validate_incident_explanations(
    connection: &Connection,
    incident_type: &str,
    event_data: &serde_json::Value,
    subject_personnel_ids: &[i64],
    allowed_witness_ids: Option<&[i64]>,
) -> Result<(), String> {
    if !incident_requires_witnesses(incident_type) {
        return Ok(());
    }
    let explanations = event_data
        .get("explanations")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "Додайте щонайменше два пояснення свідків.".to_string())?;
    let mut witness_ids = Vec::new();
    for explanation in explanations {
        let personnel_id = explanation.get("personId").and_then(|value| value.as_i64());
        let text = explanation
            .get("text")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .trim();
        let Some(personnel_id) = personnel_id.filter(|_| !text.is_empty()) else {
            continue;
        };
        if witness_ids.contains(&personnel_id) {
            return Err("Кожен свідок може надати лише одне пояснення.".into());
        }
        if subject_personnel_ids.contains(&personnel_id) {
            return Err("Особа інциденту не може бути вказана як свідок.".into());
        }
        if allowed_witness_ids.is_some_and(|ids| !ids.contains(&personnel_id)) {
            return Err(
                "Для втрати БпЛА можна обрати лише особу зі складу на момент польоту.".into(),
            );
        }
        let exists = connection
            .query_row(
                "SELECT COUNT(*) FROM personnel WHERE id=?1",
                [personnel_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;
        if !exists && allowed_witness_ids.is_none_or(|ids| !ids.contains(&personnel_id)) {
            return Err("Обраного свідка не знайдено.".into());
        }
        witness_ids.push(personnel_id);
    }
    if witness_ids.len() < 2 {
        return Err("Додайте щонайменше два пояснення свідків.".into());
    }
    Ok(())
}

fn flight_is_within_last_day(
    flight_date: &str,
    sky_time: &str,
    now: chrono::NaiveDateTime,
) -> bool {
    let value = format!("{}T{}", flight_date.trim(), sky_time.trim());
    let Ok(occurred_at) = chrono::NaiveDateTime::parse_from_str(&value, "%Y-%m-%dT%H:%M") else {
        return false;
    };
    let age = now.signed_duration_since(occurred_at).num_seconds();
    (0..=24 * 60 * 60).contains(&age)
}

fn source_flight_personnel_snapshot(
    connection: &Connection,
    source_flight_id: Option<i64>,
) -> (String, Vec<i64>, Vec<HistoricalPersonnelSnapshot>) {
    let Some(source_flight_id) = source_flight_id else {
        return (String::new(), Vec::new(), Vec::new());
    };
    let flight = connection
        .query_row(
            "SELECT flight_date,sky_time,crew_id,personnel_snapshot_json FROM flight_journal_entries WHERE id=?1",
            [source_flight_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .ok();
    let Some((flight_date, sky_time, crew_id, frozen_json)) = flight else {
        return (String::new(), Vec::new(), Vec::new());
    };
    let frozen = serde_json::from_str::<Vec<serde_json::Value>>(&frozen_json).unwrap_or_default();
    if !frozen.is_empty() {
        let historical = frozen
            .into_iter()
            .filter_map(|member| {
                Some((
                    member.get("personnelId")?.as_i64()?,
                    member.get("fullName")?.as_str()?.to_string(),
                    member
                        .get("rank")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    member
                        .get("position")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default()
                        .to_string(),
                ))
            })
            .collect::<Vec<_>>();
        let ids = historical.iter().map(|(id, _, _, _)| *id).collect();
        let names = historical
            .iter()
            .map(|(_, name, _, _)| name.clone())
            .collect::<Vec<_>>()
            .join(", ");
        return (names, ids, historical);
    }
    let Some(crew_id) = crew_id else {
        return (String::new(), Vec::new(), Vec::new());
    };
    let snapshot_json = connection.query_row(
        "SELECT snapshot_json FROM flight_plan_snapshots WHERE plan_date=?1 ORDER BY revision DESC,id DESC LIMIT 1",
        [flight_date],
        |row| row.get::<_, String>(0),
    ).ok();
    let Some(snapshot) =
        snapshot_json.and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok())
    else {
        return (String::new(), Vec::new(), Vec::new());
    };
    let entry = snapshot
        .get("entries")
        .and_then(|value| value.as_array())
        .and_then(|entries| {
            entries
                .iter()
                .find(|entry| {
                    entry.get("crewId").and_then(|value| value.as_i64()) == Some(crew_id)
                        && entry.get("startTime").and_then(|value| value.as_str())
                            == Some(sky_time.as_str())
                })
                .or_else(|| {
                    entries.iter().find(|entry| {
                        entry.get("crewId").and_then(|value| value.as_i64()) == Some(crew_id)
                    })
                })
        });
    let Some(entry) = entry else {
        return (String::new(), Vec::new(), Vec::new());
    };
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
    if let Some(commander_id) = entry
        .get("actualCommanderId")
        .and_then(|value| value.as_i64())
    {
        ids.retain(|id| *id != commander_id);
        ids.insert(0, commander_id);
    }
    let snapshots = entry
        .get("memberSnapshots")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let historical = ids
        .iter()
        .filter_map(|id| {
            snapshots
                .iter()
                .find(|member| {
                    member.get("personnelId").and_then(|value| value.as_i64()) == Some(*id)
                })
                .and_then(|member| {
                    Some((
                        *id,
                        member.get("fullName")?.as_str()?.to_string(),
                        member
                            .get("rank")
                            .and_then(|value| value.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        connection
                            .query_row("SELECT position FROM personnel WHERE id=?1", [*id], |row| {
                                row.get::<_, String>(0)
                            })
                            .unwrap_or_default(),
                    ))
                })
        })
        .collect::<Vec<_>>();
    let names = historical
        .iter()
        .map(|(_, name, _, _)| name.clone())
        .collect::<Vec<_>>();
    (names.join(", "), ids, historical)
}

fn source_flight_position_context(
    connection: &Connection,
    snapshot_id: Option<i64>,
    crew_id: Option<i64>,
    sky_time: &str,
    flight_position_id: Option<i64>,
    flight_position_name: &str,
) -> (String, String) {
    let snapshot_entry = snapshot_id
        .and_then(|snapshot_id| {
            connection
                .query_row(
                    "SELECT snapshot_json FROM flight_plan_snapshots WHERE id=?1",
                    [snapshot_id],
                    |row| row.get::<_, String>(0),
                )
                .ok()
        })
        .and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok())
        .and_then(|snapshot| {
            snapshot
                .get("entries")
                .and_then(|value| value.as_array())
                .and_then(|entries| {
                    entries
                        .iter()
                        .find(|entry| {
                            let same_source = crew_id
                                .map(|crew_id| {
                                    entry.get("crewId").and_then(|value| value.as_i64())
                                        == Some(crew_id)
                                })
                                .or_else(|| {
                                    flight_position_id.map(|position_id| {
                                        entry.get("positionId").and_then(|value| value.as_i64())
                                            == Some(position_id)
                                    })
                                })
                                .unwrap_or(false);
                            same_source
                                && entry.get("startTime").and_then(|value| value.as_str())
                                    == Some(sky_time)
                        })
                        .or_else(|| {
                            crew_id.and_then(|crew_id| {
                                entries.iter().find(|entry| {
                                    entry.get("crewId").and_then(|value| value.as_i64())
                                        == Some(crew_id)
                                })
                            })
                        })
                        .or_else(|| {
                            flight_position_id.and_then(|position_id| {
                                entries.iter().find(|entry| {
                                    entry.get("positionId").and_then(|value| value.as_i64())
                                        == Some(position_id)
                                })
                            })
                        })
                        .cloned()
                })
        });
    let snapshot_position_id = snapshot_entry
        .as_ref()
        .and_then(|entry| entry.get("positionId"))
        .and_then(|value| value.as_i64());
    let current_position = flight_position_id
        .or(snapshot_position_id)
        .and_then(|position_id| {
            connection
                .query_row(
                    "SELECT name,locality,mgrs FROM positions WHERE id=?1",
                    [position_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    },
                )
                .ok()
        })
        .unwrap_or_default();
    let snapshot_value = |key: &str| {
        snapshot_entry
            .as_ref()
            .and_then(|entry| entry.get(key))
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .trim()
            .to_string()
    };
    let historical_name = snapshot_value("positionName");
    let historical_locality = snapshot_value("positionLocality");
    let historical_mgrs = snapshot_value("positionMgrs");
    let position_name = if !historical_name.is_empty() {
        historical_name
    } else if !flight_position_name.trim().is_empty() {
        flight_position_name.trim().to_string()
    } else {
        current_position.0
    };
    let locality = if historical_locality.is_empty() {
        current_position.1
    } else {
        historical_locality
    };
    let mgrs = if historical_mgrs.is_empty() {
        current_position.2
    } else {
        historical_mgrs
    };
    let position_area = [locality, mgrs]
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
    (position_name, position_area)
}

#[derive(Debug, Default)]
struct IncidentPlanContext {
    crew_id: Option<i64>,
    position_name: String,
    position_area: String,
}

fn incident_minute(value: &str) -> Option<u32> {
    let (hours, minutes) = value.trim().split_once(':')?;
    let hours = hours.parse::<u32>().ok()?;
    let minutes = minutes.parse::<u32>().ok()?;
    (hours < 24 && minutes < 60).then_some(hours * 60 + minutes)
}

fn plan_schedule_contains_person_at(
    schedule: &crate::flight_plan::FlightPlanLocationSchedule,
    personnel_id: i64,
    incident_time: &str,
) -> bool {
    let Some(minute) = incident_minute(incident_time) else {
        return false;
    };
    if schedule.arrives_on_plan_date {
        let Some(arrival) = schedule
            .stages
            .first()
            .and_then(|stage| incident_minute(&stage.start_time))
        else {
            return false;
        };
        if minute < arrival {
            return false;
        }
    }
    if schedule.departs_on_plan_date
        && incident_minute(&schedule.departure_time).is_some_and(|departure| minute >= departure)
    {
        return false;
    }
    let mut active = schedule.stages.first();
    for stage in schedule.stages.iter().skip(1) {
        if incident_minute(&stage.start_time).is_some_and(|start| start <= minute) {
            active = Some(stage);
        }
    }
    active.is_some_and(|stage| stage.member_ids.contains(&personnel_id))
}

fn current_crew_position_context(
    connection: &Connection,
    crew_id: i64,
) -> Result<IncidentPlanContext, String> {
    connection
        .query_row(
            "SELECT COALESCE(NULLIF(p.name,''),c.position_name),COALESCE(p.locality,''),COALESCE(p.mgrs,''),c.reconnaissance_area FROM crews c LEFT JOIN positions p ON p.id=c.position_id WHERE c.id=?1",
            [crew_id],
            |row| {
                let position_name = row.get::<_, String>(0)?;
                let locality = row.get::<_, String>(1)?;
                let mgrs = row.get::<_, String>(2)?;
                let legacy_area = row.get::<_, String>(3)?;
                let position_area = [locality, mgrs]
                    .into_iter()
                    .filter(|value| !value.trim().is_empty())
                    .collect::<Vec<_>>()
                    .join(" · ");
                Ok(IncidentPlanContext {
                    crew_id: Some(crew_id),
                    position_name,
                    position_area: if position_area.is_empty() {
                        legacy_area
                    } else {
                        position_area
                    },
                })
            },
        )
        .map_err(|_| "Екіпаж не знайдено.".to_string())
}

fn saved_plan_position_context(
    connection: &Connection,
    plan_date: &str,
    incident_time: &str,
    requested_crew_id: Option<i64>,
    personnel_id: Option<i64>,
) -> Result<(bool, Option<IncidentPlanContext>), String> {
    let snapshot_json = connection
        .query_row(
            "SELECT snapshot_json FROM flight_plan_snapshots WHERE plan_date=?1 ORDER BY revision DESC,id DESC LIMIT 1",
            [plan_date],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "Не вдалося прочитати історичний план польотів.".to_string())?;
    let Some(snapshot_json) = snapshot_json else {
        return Ok((false, None));
    };
    let snapshot = serde_json::from_str::<serde_json::Value>(&snapshot_json)
        .map_err(|_| "Збережений знімок плану польотів пошкоджено.".to_string())?;
    let schedules = crate::flight_plan::flight_plan_location_schedule(connection, plan_date)?
        .unwrap_or_default();
    let crew_id = if let Some(personnel_id) = personnel_id {
        schedules
            .iter()
            .find(|schedule| {
                plan_schedule_contains_person_at(schedule, personnel_id, incident_time)
            })
            .map(|schedule| schedule.crew_id)
    } else {
        requested_crew_id
    };
    let Some(crew_id) = crew_id else {
        return Ok((true, None));
    };

    let entries = snapshot
        .get("entries")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let crew_entries = entries
        .iter()
        .filter(|entry| entry.get("crewId").and_then(|value| value.as_i64()) == Some(crew_id))
        .collect::<Vec<_>>();
    if crew_entries.is_empty() {
        return Ok((true, None));
    }
    let minute = incident_minute(incident_time).unwrap_or_default();
    let mut active = crew_entries[0];
    for entry in crew_entries.iter().skip(1) {
        if entry
            .get("startTime")
            .and_then(|value| value.as_str())
            .and_then(incident_minute)
            .is_some_and(|start| start <= minute)
        {
            active = entry;
        }
    }
    let position_id = active.get("positionId").and_then(|value| value.as_i64());
    let current_position = position_id
        .and_then(|position_id| {
            connection
                .query_row(
                    "SELECT name,locality,mgrs FROM positions WHERE id=?1",
                    [position_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    },
                )
                .ok()
        })
        .unwrap_or_default();
    let snapshot_text = |key: &str| {
        active
            .get(key)
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .trim()
            .to_string()
    };
    let position_name = {
        let value = snapshot_text("positionName");
        if value.is_empty() {
            current_position.0
        } else {
            value
        }
    };
    let locality = {
        let value = snapshot_text("positionLocality");
        if value.is_empty() {
            current_position.1
        } else {
            value
        }
    };
    let mgrs = {
        let value = snapshot_text("positionMgrs");
        if value.is_empty() {
            current_position.2
        } else {
            value
        }
    };
    Ok((
        true,
        Some(IncidentPlanContext {
            crew_id: Some(crew_id),
            position_name,
            position_area: [locality, mgrs]
                .into_iter()
                .filter(|value| !value.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" · "),
        }),
    ))
}

fn incident_equipment(
    connection: &Connection,
    incident_id: i64,
) -> Result<(Vec<i64>, Vec<String>), String> {
    let mut statement = connection
        .prepare("SELECT e.id,e.name FROM incident_equipment ie JOIN equipment e ON e.id=ie.equipment_id WHERE ie.incident_id=?1 ORDER BY e.name COLLATE NOCASE,e.id")
        .map_err(|_| "Не вдалося прочитати майно інциденту.".to_string())?;
    let rows = statement
        .query_map([incident_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|_| "Не вдалося прочитати майно інциденту.".to_string())?
        .collect::<Result<Vec<(i64, String)>, _>>()
        .map_err(|_| "Не вдалося прочитати майно інциденту.".to_string())?;
    Ok(rows.into_iter().unzip())
}

fn incident_personnel(
    connection: &Connection,
    incident_id: i64,
) -> Result<(Vec<i64>, Vec<String>), String> {
    let mut statement = connection
        .prepare("SELECT personnel_id,full_name_snapshot FROM incident_personnel WHERE incident_id=?1 ORDER BY selection_order,rowid")
        .map_err(|_| "Не вдалося прочитати осіб інциденту.".to_string())?;
    let rows = statement
        .query_map([incident_id], |row| {
            Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| "Не вдалося прочитати осіб інциденту.".to_string())?
        .collect::<Result<Vec<(Option<i64>, String)>, _>>()
        .map_err(|_| "Не вдалося прочитати осіб інциденту.".to_string())?;
    let personnel_ids = rows.iter().filter_map(|(id, _)| *id).collect();
    let personnel_names = rows.into_iter().map(|(_, name)| name).collect();
    Ok((personnel_ids, personnel_names))
}

fn incident_steps(connection: &Connection, incident_id: i64) -> Result<Vec<IncidentStep>, String> {
    let mut statement = connection.prepare("SELECT id,step_order,title,description,is_required,status,due_at,completed_at,comment,updated_at FROM incident_steps WHERE incident_id=?1 ORDER BY step_order,id")
        .map_err(|_| "Не вдалося прочитати алгоритм інциденту.".to_string())?;
    let result = statement
        .query_map([incident_id], |row| {
            Ok(IncidentStep {
                id: row.get(0)?,
                order: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                required: row.get::<_, i64>(4)? != 0,
                status: row.get(5)?,
                due_at: row.get(6)?,
                completed_at: row.get(7)?,
                comment: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати алгоритм інциденту.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати алгоритм інциденту.".to_string());
    result
}

fn incident_documents(
    connection: &Connection,
    incident_id: i64,
) -> Result<Vec<IncidentDocument>, String> {
    let mut statement = connection.prepare("SELECT id,document_type,requirement,action_kind,status,updated_at FROM incident_documents WHERE incident_id=?1 ORDER BY id")
        .map_err(|_| "Не вдалося прочитати документи інциденту.".to_string())?;
    let result = statement
        .query_map([incident_id], |row| {
            Ok(IncidentDocument {
                id: row.get(0)?,
                document_type: row.get(1)?,
                requirement: row.get(2)?,
                action_kind: row.get(3)?,
                status: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати документи інциденту.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати документи інциденту.".to_string());
    result
}

fn incident_history(
    connection: &Connection,
    incident_id: i64,
) -> Result<Vec<IncidentHistoryEvent>, String> {
    let mut statement = connection.prepare("SELECT id,action,details,created_at FROM incident_history WHERE incident_id=?1 ORDER BY id DESC")
        .map_err(|_| "Не вдалося прочитати історію інциденту.".to_string())?;
    let result = statement
        .query_map([incident_id], |row| {
            Ok(IncidentHistoryEvent {
                id: row.get(0)?,
                action: row.get(1)?,
                details: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати історію інциденту.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати історію інциденту.".to_string());
    result
}

fn load_incidents(connection: &Connection, archived: bool) -> Result<Vec<Incident>, String> {
    let mut statement = connection.prepare("SELECT i.id,i.category,i.incident_type,i.custom_type_name,i.status,i.occurred_at,i.crew_id,c.name,i.equipment_id,e.name,i.vehicle_id,COALESCE(NULLIF(i.vehicle_snapshot,''),CASE WHEN v.id IS NULL THEN NULL ELSE trim(v.name || ' ' || v.registration_number) END,(SELECT group_concat(trim(cv.name || ' ' || cv.registration_number), ', ') FROM vehicles cv WHERE cv.crew_id=i.crew_id),''),i.position_name,i.reconnaissance_area,i.crew_snapshot,i.description,i.immediate_actions,i.consequences,i.flight_stage,i.preliminary_cause,i.snapshot_source,i.reported_to,i.reported_at,i.source_flight_id,i.event_data_json,i.archived_at,i.archive_reason FROM incidents i LEFT JOIN crews c ON c.id=i.crew_id LEFT JOIN equipment e ON e.id=i.equipment_id LEFT JOIN vehicles v ON v.id=i.vehicle_id WHERE (?1=1 AND trim(i.archived_at)<>'') OR (?1=0 AND trim(i.archived_at)='') ORDER BY i.occurred_at DESC,i.id DESC").map_err(|_|"Не вдалося прочитати інциденти.".to_string())?;
    let rows = statement
        .query_map([if archived { 1 } else { 0 }], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<i64>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<i64>>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, String>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, String>(14)?,
                row.get::<_, String>(15)?,
                row.get::<_, String>(16)?,
                row.get::<_, String>(17)?,
                row.get::<_, String>(18)?,
                row.get::<_, String>(19)?,
                row.get::<_, String>(20)?,
                row.get::<_, String>(21)?,
                row.get::<_, String>(22)?,
                row.get::<_, Option<i64>>(23)?,
                row.get::<_, String>(24)?,
                row.get::<_, String>(25)?,
                row.get::<_, String>(26)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати інциденти.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати інциденти.".to_string())?;
    rows.into_iter()
        .map(
            |(
                id,
                category,
                incident_type,
                custom_type_name,
                status,
                occurred_at,
                crew_id,
                crew_name,
                legacy_equipment_id,
                legacy_equipment_name,
                vehicle_id,
                vehicle_name,
                position_name,
                reconnaissance_area,
                crew_snapshot,
                description,
                immediate_actions,
                consequences,
                flight_stage,
                preliminary_cause,
                snapshot_source,
                reported_to,
                reported_at,
                source_flight_id,
                event_data_json,
                archived_at,
                archive_reason,
            )| {
                let (mut equipment_ids, mut equipment_names) = incident_equipment(connection, id)?;
                if equipment_ids.is_empty() {
                    if let Some(equipment_id) = legacy_equipment_id {
                        equipment_ids.push(equipment_id);
                    }
                    if let Some(equipment_name) = legacy_equipment_name.clone() {
                        equipment_names.push(equipment_name);
                    }
                }
                let (personnel_ids, personnel_names) = incident_personnel(connection, id)?;
                let event_data = serde_json::from_str(&event_data_json)
                    .unwrap_or_else(|_| serde_json::json!({}));
                Ok(Incident {
                    id,
                    category,
                    incident_type,
                    custom_type_name,
                    status,
                    occurred_at,
                    crew_id,
                    crew_name,
                    equipment_id: equipment_ids.first().copied(),
                    equipment_name: equipment_names.first().cloned(),
                    equipment_ids,
                    equipment_names,
                    personnel_ids,
                    personnel_names,
                    vehicle_id,
                    position_name,
                    reconnaissance_area,
                    crew_snapshot,
                    vehicle_name,
                    description,
                    immediate_actions,
                    consequences,
                    flight_stage,
                    preliminary_cause,
                    snapshot_source,
                    reported_to,
                    reported_at,
                    source_flight_id,
                    event_data,
                    archived_at,
                    archive_reason,
                    steps: incident_steps(connection, id)?,
                    documents: incident_documents(connection, id)?,
                    history: incident_history(connection, id)?,
                })
            },
        )
        .collect()
}

#[tauri::command]
pub fn list_incidents(state: tauri::State<AppState>) -> Result<Vec<Incident>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    initialize_all_incident_workflows(&db.connection)?;
    load_incidents(&db.connection, false)
}

#[tauri::command]
pub fn list_archived_incidents(state: tauri::State<AppState>) -> Result<Vec<Incident>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    initialize_all_incident_workflows(&db.connection)?;
    load_incidents(&db.connection, true)
}

type WorkflowStepTemplate = (i64, &'static str, &'static str, Option<i64>);
type WorkflowDocumentTemplate = (&'static str, &'static str, &'static str);

struct WorkflowTemplate {
    steps: &'static [WorkflowStepTemplate],
    documents: &'static [WorkflowDocumentTemplate],
}

const UAV_LOSS_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповідь командиру та черговому",
        "Строк: у момент 100% втрати",
        Some(0),
    ),
    (
        2,
        "Позачергове повідомлення оперативному черговому",
        "Строк: протягом години після втрати",
        Some(1),
    ),
    (
        3,
        "Позатермінове повідомлення оперативному черговому",
        "Строк: до 1 доби",
        Some(24),
    ),
    (
        4,
        "Внесення даних у підсумкове донесення / ЖБД",
        "Строк: у день втрати",
        None,
    ),
    (5, "Пояснення від екіпажу", "Строк: до 2 діб", Some(48)),
    (6, "Рапорт на втрату", "Строк: до 3 діб", Some(72)),
    (
        7,
        "Очікування інформації від групи списання щодо правок",
        "Безстроково",
        None,
    ),
    (
        8,
        "Списання борта і виключення його зі списків обліку підрозділу",
        "Безстроково",
        None,
    ),
];
const UAV_LOSS_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Позачергове повідомлення", "Так", "copy"),
    ("Позатермінове", "Так", "document"),
    ("Пояснення від усіх учасників", "Так", "document"),
    ("Рапорт на втрату", "Так", "document"),
];
const ASSET_LOSS_STEPS: &[WorkflowStepTemplate] = &[
    (1, "Доповідь командиру", "Строк: у день втрати", None),
    (
        2,
        "Позатермінове повідомлення оперативному черговому",
        "Строк: у день втрати",
        None,
    ),
    (
        3,
        "Внесення даних у підсумкове донесення / ЖБД",
        "Строк: у день втрати",
        None,
    ),
    (4, "Рапорт-доповідь на втрату", "Строк: у день втрати", None),
    (
        5,
        "Очікування інформації від групи списання щодо правок",
        "Безстроково",
        None,
    ),
    (
        6,
        "Списання майна і виключення його зі списків обліку підрозділу",
        "Безстроково",
        None,
    ),
];
const ASSET_LOSS_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Позатермінове", "Так", "document"),
    ("Пояснення від усіх учасників", "Уточнити", "document"),
    ("Рапорт на втрату", "Так", "document"),
    ("Акт списання", "Уточнити", "document"),
];
const VEHICLE_DESTROYED_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповідь командиру та черговому",
        "Строк: одразу",
        Some(0),
    ),
    (
        2,
        "Інформація щодо особового складу та медичний огляд за необхідності",
        "Строк: одразу",
        Some(0),
    ),
    (
        3,
        "Позатермінове повідомлення оперативному черговому",
        "Строк: у день втрати",
        None,
    ),
    (
        4,
        "Внесення даних у підсумкове донесення / ЖБД",
        "Строк: у день втрати",
        None,
    ),
    (5, "Рапорт-доповідь на втрату", "Строк: у день втрати", None),
    (6, "Уточнити", "", None),
    (7, "Уточнити", "", None),
];
const VEHICLE_DESTROYED_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Позатермінове", "Так", "document"),
    ("Рапорт-доповідь на втрату", "Так", "document"),
];
const VEHICLE_DAMAGED_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповідь командиру та черговому",
        "Строк: у день втрати",
        None,
    ),
    (
        2,
        "Інформація щодо особового складу та медичний огляд за необхідності",
        "Строк: одразу",
        Some(0),
    ),
    (
        3,
        "Позатермінове повідомлення оперативному черговому",
        "Строк: у день втрати",
        None,
    ),
    (
        4,
        "Внесення даних у підсумкове донесення / ЖБД",
        "Строк: у день втрати",
        None,
    ),
    (5, "Рапорт-доповідь на втрату", "Строк: у день втрати", None),
    (6, "Уточнити", "", None),
    (7, "Уточнити", "", None),
];
const VEHICLE_DAMAGED_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Позатермінове", "Так", "document"),
    ("Рапорт-доповідь на втрату", "Так", "document"),
    ("Уточнити", "", "document"),
];
const ACCIDENT_STEPS: &[WorkflowStepTemplate] = &[
    (1, "Доповідь командиру", "Строк: одразу", Some(0)),
    (
        2,
        "Інформація щодо особового складу та медичний огляд за необхідності",
        "Строк: одразу",
        Some(0),
    ),
    (3, "Рапорт-доповідь", "Строк: у день події", None),
    (
        4,
        "Очікування наказу на службове розслідування",
        "Строк: до 5 діб",
        Some(120),
    ),
    (
        5,
        "Пояснення від потерпілого та свідків за наявності",
        "Строк: з моменту наказу",
        None,
    ),
    (
        6,
        "Проведення службового розслідування",
        "Строк: до 10 діб після наказу",
        None,
    ),
    (
        7,
        "Очікування наказу з результатом",
        "Строк: до 3 діб після завершення розслідування",
        None,
    ),
];
const ACCIDENT_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Рапорт-доповідь", "Так", "document"),
    ("Наказ на службове розслідування", "Так", "document"),
    ("Пояснення", "Так", "document"),
    ("Акт службового розслідування", "Так", "document"),
    (
        "Наказ на завершення службового розслідування",
        "Так",
        "document",
    ),
];
const SHELLING_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповідь командиру та черговому за необхідності",
        "Строк: одразу",
        Some(0),
    ),
    (
        2,
        "Інформація щодо особового складу та майна",
        "Строк: одразу",
        Some(0),
    ),
    (
        3,
        "Внесення даних у підсумкове донесення / ЖБД",
        "Строк: у день події",
        None,
    ),
    (4, "Рішення з командиром", "Строк: у день події", None),
];
const SHELLING_DOCUMENTS: &[WorkflowDocumentTemplate] = &[("Позатермінове", "Ні", "document")];
const POSITION_LOSS_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповідь командиру та черговому",
        "Строк: одразу",
        Some(0),
    ),
    (
        2,
        "Інформація щодо особового складу та майна",
        "Строк: одразу",
        Some(0),
    ),
    (
        3,
        "Позатермінове повідомлення оперативному черговому",
        "Строк: у день втрати",
        None,
    ),
    (
        4,
        "Внесення даних у підсумкове донесення / ЖБД",
        "Строк: у день втрати",
        None,
    ),
    (
        5,
        "Рапорт-доповідь щодо події",
        "Строк: у день втрати",
        None,
    ),
    (
        6,
        "Рішення з командиром щодо подальших дій",
        "Строк: у день втрати",
        None,
    ),
];
const POSITION_LOSS_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Позатермінове", "Так", "document"),
    ("Рапорт-доповідь", "Уточнити", "document"),
];
const WOUND_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповідь командиру та черговому",
        "Строк: одразу",
        Some(0),
    ),
    (2, "Інформація щодо поранення", "Строк: одразу", Some(0)),
    (
        3,
        "Рішення командира щодо необхідних дій, зокрема евакуації",
        "Строк: одразу",
        Some(0),
    ),
    (
        4,
        "Постійний контакт із медичною службою",
        "Строк: одразу",
        Some(0),
    ),
    (
        5,
        "Позатермінове повідомлення оперативному черговому",
        "Строк: до 3 годин",
        Some(3),
    ),
    (
        6,
        "Внесення даних у підсумкове донесення / ЖБД",
        "Строк: у день події",
        None,
    ),
    (7, "Рапорт-доповідь", "Строк: у день події", None),
];
const WOUND_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Позатермінове", "Так", "document"),
    (
        "Форма 001 (100) і всі необхідні документи",
        "Так",
        "document",
    ),
    ("Рапорт-доповідь", "Так", "document"),
    ("Документи у разі госпіталізації", "", "document"),
];
const DEATH_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповідь командиру та черговому",
        "Строк: одразу",
        Some(0),
    ),
    (
        2,
        "Рішення командира щодо необхідних дій",
        "Строк: одразу",
        Some(0),
    ),
    (
        3,
        "Постійний контакт із медичною службою",
        "Строк: одразу",
        Some(0),
    ),
    (
        4,
        "Позатермінове повідомлення оперативному черговому",
        "Строк: до 3 годин",
        Some(3),
    ),
    (
        5,
        "Внесення даних у підсумкове донесення / ЖБД",
        "Строк: у день події",
        None,
    ),
    (6, "Рапорт-доповідь", "Строк: у день події", None),
    (
        7,
        "Очікування інформації щодо подальших дій для правильного оформлення",
        "Безстроково",
        None,
    ),
];
const DEATH_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Позатермінове", "Так", "document"),
    ("Необхідні документи", "Так", "document"),
    ("Рапорт-доповідь", "Так", "document"),
];
const INJURY_STEPS: &[WorkflowStepTemplate] = &[
    (1, "Доповідь командиру", "Строк: одразу", Some(0)),
    (
        2,
        "Інформація щодо особового складу та медичний огляд за необхідності",
        "Строк: одразу",
        Some(0),
    ),
    (3, "Рапорт-доповідь", "Строк: у день події", None),
    (
        4,
        "Очікування наказу на службове розслідування",
        "Строк: до 5 діб",
        Some(120),
    ),
    (
        5,
        "Пояснення від потерпілого та свідків за наявності",
        "Строк: з моменту наказу",
        None,
    ),
    (
        6,
        "Проведення службового розслідування",
        "Строк: до 10 діб після наказу",
        None,
    ),
    (
        7,
        "Очікування наказу з результатом",
        "Строк: до 3 діб після завершення розслідування",
        None,
    ),
];
const INJURY_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Рапорт-доповідь", "Так", "document"),
    ("Наказ на службове розслідування", "Так", "document"),
    ("Пояснення", "Так", "document"),
    ("Акт службового розслідування", "Так", "document"),
    (
        "Наказ на завершення службового розслідування",
        "Так",
        "document",
    ),
];
const ABSENCE_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповідь командиру, черговому та заступнику частини з ППП",
        "Строк: одразу",
        Some(0),
    ),
    (2, "Уточнення місця події", "Строк: одразу", Some(0)),
    (
        3,
        "Пошукові заходи та контакт із родичами",
        "Строк: до 1 години",
        Some(1),
    ),
    (
        4,
        "Рапорт-доповідь про СЗЧ та зняття з усіх видів забезпечення",
        "Строк: до 1 години",
        Some(1),
    ),
    (
        5,
        "Виключення з усіх інформаційних груп підрозділу",
        "Строк: до 1 години",
        Some(1),
    ),
    (
        6,
        "Доповідь на корпус щодо СЗЧ",
        "Строк: протягом 1 доби",
        Some(24),
    ),
    (
        7,
        "Очікування наказу на службове розслідування",
        "Строк: до 2 діб",
        Some(48),
    ),
    (
        8,
        "Пояснення, запити до необхідних структур і збір документів",
        "Після 4 діб із моменту СЗЧ",
        None,
    ),
    (
        9,
        "Проведення службового розслідування",
        "Строк: до 10 діб після наказу",
        None,
    ),
    (
        10,
        "Очікування наказу з результатом",
        "Строк: до 3 діб після завершення розслідування",
        None,
    ),
    (
        11,
        "Очікування виведення в розпорядження командира в/ч",
        "Безстроково",
        None,
    ),
];
const ABSENCE_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Рапорт-доповідь щодо СЗЧ", "Так", "document"),
    ("Доповідь на корпус", "Так", "document"),
    ("Наказ на службове розслідування", "Так", "document"),
    (
        "Збір необхідних документів, пояснень та відправка запитів",
        "Так",
        "document",
    ),
    ("Акт службового розслідування", "Так", "document"),
    (
        "Наказ на завершення службового розслідування",
        "Так",
        "document",
    ),
];
const INTOXICATION_STEPS: &[WorkflowStepTemplate] = &[
    (1, "Доповідь командиру", "", None),
    (2, "Фіксація стану сп’яніння", "", None),
    (3, "Доповідь заступнику частини з ППП", "", None),
    (4, "Супровід у відповідний пункт ВСП", "", None),
    (5, "Взяття аналізів за необхідності", "", None),
    (6, "Формування протоколу про правопорушення", "", None),
    (7, "Рапорт-доповідь", "", None),
];
const INTOXICATION_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Протокол правопорушення", "Так", "document"),
    ("Рапорт-доповідь", "Так", "document"),
    ("Результати медичного закладу", "Так", "document"),
];
const DOCUMENT_LOSS_STEPS: &[WorkflowStepTemplate] = &[
    (1, "Доповідь командиру", "Строк: у день втрати", None),
    (2, "Рапорт-доповідь на втрату", "Строк: у день втрати", None),
    (
        3,
        "Очікування наказу на службове розслідування",
        "Строк: до 5 діб",
        Some(120),
    ),
    (
        4,
        "Пояснення від потерпілого та свідка",
        "Строк: до 7 діб після наказу",
        None,
    ),
    (
        5,
        "Проведення службового розслідування",
        "Строк: до 10 діб після наказу",
        None,
    ),
    (
        6,
        "Очікування наказу з результатом",
        "Строк: до 3 діб після завершення розслідування",
        None,
    ),
    (7, "Отримання нового документа", "Безстроково", None),
];
const DOCUMENT_LOSS_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Рапорт-доповідь на втрату", "Так", "document"),
    ("Наказ на службове розслідування", "Так", "document"),
    (
        "Пояснення та копії необхідних документів за наявності",
        "Так",
        "document",
    ),
    ("Акт службового розслідування", "Так", "document"),
    (
        "Наказ на завершення службового розслідування",
        "Так",
        "document",
    ),
];
const BASE_STEPS: &[WorkflowStepTemplate] = &[
    (1, "Доповідь командиру", "Строк: одразу", Some(0)),
    (
        2,
        "Позатермінове повідомлення / рапорт-доповідь",
        "Строк: у день події",
        None,
    ),
    (3, "Очікування подальшої інформації", "Безстроково", None),
];
const BASE_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Позатермінове", "Ні", "document"),
    ("Рапорт-доповідь", "Ні", "document"),
];
const SUICIDE_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповідь командиру, черговому та заступнику частини з ППП",
        "Строк: одразу",
        Some(0),
    ),
    (
        2,
        "Рішення командира щодо необхідних дій",
        "Строк: одразу",
        Some(0),
    ),
    (
        3,
        "Постійний контакт із медичною службою",
        "Строк: одразу",
        Some(0),
    ),
    (4, "Рапорт-доповідь", "Строк: у день події", None),
    (
        5,
        "Очікування інформації щодо подальших дій для правильного оформлення",
        "Безстроково",
        None,
    ),
];
const SUICIDE_DOCUMENTS: &[WorkflowDocumentTemplate] = &[
    ("Рапорт-доповідь", "Так", "document"),
    ("Доповідь на корпус", "Уточнити", "document"),
    ("Наказ на службове розслідування", "Уточнити", "document"),
    (
        "Збір необхідних документів і пояснень свідків",
        "Так",
        "document",
    ),
    ("Акт службового розслідування", "Уточнити", "document"),
    (
        "Наказ на завершення службового розслідування",
        "Уточнити",
        "document",
    ),
];

fn workflow_template(incident_type: &str) -> WorkflowTemplate {
    match incident_type {
        "Втрата БпЛА" => WorkflowTemplate {
            steps: UAV_LOSS_STEPS,
            documents: UAV_LOSS_DOCUMENTS,
        },
        "Втрата майна" => WorkflowTemplate {
            steps: ASSET_LOSS_STEPS,
            documents: ASSET_LOSS_DOCUMENTS,
        },
        "Знищення машини" | "Знищення автомобіля" => {
            WorkflowTemplate {
                steps: VEHICLE_DESTROYED_STEPS,
                documents: VEHICLE_DESTROYED_DOCUMENTS,
            }
        }
        "Пошкодження машини" | "Пошкодження автомобіля" => {
            WorkflowTemplate {
                steps: VEHICLE_DAMAGED_STEPS,
                documents: VEHICLE_DAMAGED_DOCUMENTS,
            }
        }
        "ДТП" => WorkflowTemplate {
            steps: ACCIDENT_STEPS,
            documents: ACCIDENT_DOCUMENTS,
        },
        "Обстріл" => WorkflowTemplate {
            steps: SHELLING_STEPS,
            documents: SHELLING_DOCUMENTS,
        },
        "Знищення позиції" => WorkflowTemplate {
            steps: POSITION_LOSS_STEPS,
            documents: POSITION_LOSS_DOCUMENTS,
        },
        "Поранення" => WorkflowTemplate {
            steps: WOUND_STEPS,
            documents: WOUND_DOCUMENTS,
        },
        "Загибель" => WorkflowTemplate {
            steps: DEATH_STEPS,
            documents: DEATH_DOCUMENTS,
        },
        "Травма" => WorkflowTemplate {
            steps: INJURY_STEPS,
            documents: INJURY_DOCUMENTS,
        },
        "Самогубство" => WorkflowTemplate {
            steps: SUICIDE_STEPS,
            documents: SUICIDE_DOCUMENTS,
        },
        "СЗЧ" => WorkflowTemplate {
            steps: ABSENCE_STEPS,
            documents: ABSENCE_DOCUMENTS,
        },
        "Алкогольне/наркотичне сп’яніння" => WorkflowTemplate {
            steps: INTOXICATION_STEPS,
            documents: INTOXICATION_DOCUMENTS,
        },
        "Втрата військового квитка/посвідчення УБД" => {
            WorkflowTemplate {
                steps: DOCUMENT_LOSS_STEPS,
                documents: DOCUMENT_LOSS_DOCUMENTS,
            }
        }
        _ => WorkflowTemplate {
            steps: BASE_STEPS,
            documents: BASE_DOCUMENTS,
        },
    }
}

fn canonical_incident_type(incident_type: &str) -> (&'static str, &'static str) {
    match incident_type.trim() {
        "Поранення" => ("Поранення", "Особовий склад"),
        "Загибель" => ("Загибель", "Особовий склад"),
        "Травма" => ("Травма", "Особовий склад"),
        "СЗЧ" => ("СЗЧ", "Особовий склад"),
        "Алкогольне/наркотичне сп’яніння" | "Алкогольне / наркотичне сп’яніння" => {
            ("Алкогольне/наркотичне сп’яніння", "Особовий склад")
        }
        "Самогубство" => ("Самогубство", "Особовий склад"),
        "Втрата БпЛА" => ("Втрата БпЛА", "БпЛА"),
        "Втрата майна" => ("Втрата майна", "Майно"),
        "Втрата військового квитка/посвідчення УБД"
        | "Втрата військового квитка / посвідчення УБД" => {
            ("Втрата військового квитка/посвідчення УБД", "Майно")
        }
        "Знищення машини" | "Знищення автомобіля" => {
            ("Знищення машини", "Транспорт")
        }
        "Пошкодження машини" | "Пошкодження автомобіля" => {
            ("Пошкодження машини", "Транспорт")
        }
        "ДТП" => ("ДТП", "Транспорт"),
        "Обстріл" => ("Обстріл", "Позиція і бойова обстановка"),
        "Знищення позиції" => ("Знищення позиції", "Позиція і бойова обстановка"),
        "Інший інцидент" => ("Інший інцидент", "Інше"),
        _ => ("Інший інцидент", "Інше"),
    }
}

fn legacy_custom_type_name_from_history(
    connection: &Connection,
    incident_id: i64,
) -> Option<String> {
    let details = connection
        .query_row(
            "SELECT details FROM incident_history WHERE incident_id=?1 AND action='Уточнено тип інциденту' ORDER BY id DESC LIMIT 1",
            [incident_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()?;
    let previous = details
        .strip_prefix("Попередній тип: ")?
        .split_once(". Новий тип:")?
        .0
        .trim();
    let (canonical, _) = canonical_incident_type(previous);
    (canonical == "Інший інцидент" && previous != "Інший інцидент" && !previous.is_empty())
        .then(|| previous.to_string())
}

fn normalize_incident_types(connection: &Connection) -> Result<(), String> {
    let incidents = connection
        .prepare("SELECT id,category,incident_type,custom_type_name FROM incidents ORDER BY id")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|_| "Не вдалося перевірити типи інцидентів.".to_string())?;
    for (incident_id, category, incident_type, stored_custom_name) in incidents {
        let (canonical_type, canonical_category) = canonical_incident_type(&incident_type);
        let custom_type_name = if canonical_type == "Інший інцидент" {
            if !stored_custom_name.trim().is_empty() {
                stored_custom_name.trim().to_string()
            } else if incident_type.trim() != canonical_type {
                incident_type.trim().to_string()
            } else {
                legacy_custom_type_name_from_history(connection, incident_id).unwrap_or_default()
            }
        } else {
            String::new()
        };
        if incident_type != canonical_type {
            connection.execute(
                "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Уточнено тип інциденту',?2)",
                rusqlite::params![incident_id, format!("Попередній тип: {incident_type}. Новий тип: {canonical_type}.")],
            ).map_err(|_| "Не вдалося зберегти попередній тип інциденту в історії.".to_string())?;
        }
        if incident_type != canonical_type
            || category != canonical_category
            || stored_custom_name != custom_type_name
        {
            connection
                .execute(
                    "UPDATE incidents SET incident_type=?1,category=?2,custom_type_name=?3 WHERE id=?4",
                    rusqlite::params![canonical_type, canonical_category, custom_type_name, incident_id],
                )
                .map_err(|_| "Не вдалося оновити тип інциденту.".to_string())?;
        }
    }
    Ok(())
}

fn initialize_incident_workflow(
    connection: &Connection,
    incident_id: i64,
    incident_type: &str,
) -> Result<(), String> {
    let occurred_at = connection
        .query_row(
            "SELECT occurred_at FROM incidents WHERE id=?1",
            [incident_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "Інцидент не знайдено.".to_string())?;
    let occurred_at = chrono::NaiveDateTime::parse_from_str(&occurred_at, "%Y-%m-%dT%H:%M").ok();
    let template = workflow_template(incident_type);
    let desired_steps = template
        .steps
        .iter()
        .map(|&(order, title, description, deadline_hours)| {
            let due_at = occurred_at
                .zip(deadline_hours)
                .map(|(value, hours)| {
                    (value + chrono::Duration::hours(hours))
                        .format("%Y-%m-%dT%H:%M")
                        .to_string()
                })
                .unwrap_or_default();
            (order, title, description, due_at)
        })
        .collect::<Vec<_>>();
    let existing_steps = connection
        .prepare("SELECT step_order,title,description,due_at,status,completed_at,comment FROM incident_steps WHERE incident_id=?1 ORDER BY step_order,id")
        .and_then(|mut statement| {
            statement.query_map([incident_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })?.collect::<Result<Vec<_>, _>>()
        })
        .map_err(|_| "Не вдалося прочитати поточний алгоритм інциденту.".to_string())?;
    let steps_match = existing_steps.len() == desired_steps.len()
        && existing_steps
            .iter()
            .zip(&desired_steps)
            .all(|(current, desired)| {
                current.0 == desired.0
                    && current.1 == desired.1
                    && current.2 == desired.2
                    && current.3 == desired.3
            });
    let steps_are_pristine = existing_steps.iter().all(|step| {
        step.4 == "Не розпочато" && step.5.trim().is_empty() && step.6.trim().is_empty()
    });
    let had_steps = !existing_steps.is_empty();
    let mut workflow_replaced = false;
    if existing_steps.is_empty() || (!steps_match && steps_are_pristine) {
        connection
            .execute(
                "DELETE FROM incident_steps WHERE incident_id=?1",
                [incident_id],
            )
            .map_err(|_| "Не вдалося оновити алгоритм інциденту.".to_string())?;
        for (order, title, description, due_at) in &desired_steps {
            connection.execute(
                "INSERT INTO incident_steps(incident_id,step_order,title,description,is_required,due_at) VALUES(?1,?2,?3,?4,1,?5)",
                rusqlite::params![incident_id, order, title, description, due_at],
            ).map_err(|_| "Не вдалося створити алгоритм інциденту.".to_string())?;
        }
        workflow_replaced = had_steps && !steps_match;
    }

    let existing_documents = connection
        .prepare("SELECT document_type,requirement,action_kind,status FROM incident_documents WHERE incident_id=?1 ORDER BY id")
        .and_then(|mut statement| {
            statement.query_map([incident_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?))
            })?.collect::<Result<Vec<_>, _>>()
        })
        .map_err(|_| "Не вдалося прочитати поточний перелік документів інциденту.".to_string())?;
    let documents_match = existing_documents.len() == template.documents.len()
        && existing_documents
            .iter()
            .zip(template.documents)
            .all(|(current, desired)| {
                current.0 == desired.0 && current.1 == desired.1 && current.2 == desired.2
            });
    let documents_are_pristine = existing_documents
        .iter()
        .all(|document| document.3 == "Не створено");
    let had_documents = !existing_documents.is_empty();
    if existing_documents.is_empty() || (!documents_match && documents_are_pristine) {
        connection
            .execute(
                "DELETE FROM incident_documents WHERE incident_id=?1",
                [incident_id],
            )
            .map_err(|_| "Не вдалося оновити перелік документів інциденту.".to_string())?;
        for &(document_type, requirement, action_kind) in template.documents {
            connection.execute(
                "INSERT INTO incident_documents(incident_id,document_type,requirement,action_kind) VALUES(?1,?2,?3,?4)",
                rusqlite::params![incident_id, document_type, requirement, action_kind],
            ).map_err(|_| "Не вдалося створити перелік документів інциденту.".to_string())?;
        }
        workflow_replaced |= had_documents && !documents_match;
    } else if !documents_match {
        for &(document_type, requirement, action_kind) in template.documents {
            let updated = connection.execute(
                "UPDATE incident_documents SET requirement=?1,action_kind=?2 WHERE incident_id=?3 AND document_type=?4",
                rusqlite::params![requirement, action_kind, incident_id, document_type],
            ).map_err(|_| "Не вдалося уточнити перелік документів інциденту.".to_string())?;
            if updated == 0 {
                connection.execute(
                    "INSERT INTO incident_documents(incident_id,document_type,requirement,action_kind) VALUES(?1,?2,?3,?4)",
                    rusqlite::params![incident_id, document_type, requirement, action_kind],
                ).map_err(|_| "Не вдалося доповнити перелік документів інциденту.".to_string())?;
            }
        }
    }
    if workflow_replaced {
        connection.execute(
            "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Оновлено алгоритм і документи','Перелік синхронізовано з погодженою таблицею')",
            [incident_id],
        ).map_err(|_| "Не вдалося записати оновлення алгоритму в історію.".to_string())?;
    }
    Ok(())
}

pub(crate) fn initialize_all_incident_workflows(connection: &Connection) -> Result<(), String> {
    normalize_incident_types(connection)?;
    let incidents = connection
        .prepare("SELECT id,incident_type FROM incidents WHERE trim(archived_at)='' ORDER BY id")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|_| "Не вдалося прочитати інциденти для підготовки алгоритмів.".to_string())?;
    for (incident_id, incident_type) in incidents {
        initialize_incident_workflow(connection, incident_id, &incident_type)?;
    }
    Ok(())
}

fn validate_incident_equipment(
    connection: &Connection,
    crew_id: Option<i64>,
    personnel_ids: &[i64],
    equipment_ids: &[i64],
) -> Result<(), String> {
    if equipment_ids.is_empty() {
        return Ok(());
    }
    for equipment_id in equipment_ids {
        let owner: Option<(Option<i64>, Option<i64>)> = connection
            .query_row(
                "SELECT crew_id,personnel_id FROM equipment WHERE id=?1",
                [equipment_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        let valid = owner.is_some_and(|(asset_crew_id, asset_personnel_id)| {
            asset_crew_id.is_some() && asset_crew_id == crew_id
                || asset_personnel_id.is_some_and(|personnel_id| {
                    personnel_ids.contains(&personnel_id)
                        || crew_id.is_some_and(|crew_id| {
                            connection.query_row(
                                "SELECT COUNT(*) FROM crew_actual_members WHERE crew_id=?1 AND personnel_id=?2",
                                rusqlite::params![crew_id, personnel_id],
                                |row| row.get::<_, i64>(0),
                            ).unwrap_or(0) > 0
                        })
                })
        });
        if !valid {
            return Err("До інциденту можна додати лише майно обраного екіпажу або особи.".into());
        }
    }
    Ok(())
}

fn prepare_incident_draft(
    connection: &Connection,
    draft: &IncidentDraft,
    existing_source_flight_id: Option<i64>,
    existing_context: Option<&ExistingIncidentFactualContext>,
) -> Result<PreparedIncidentDraft, String> {
    if draft.incident_type.trim().is_empty() {
        return Err("Оберіть тип інциденту.".into());
    }
    let occurred_at = draft.occurred_at.trim();
    if !valid_incident_datetime(occurred_at) {
        return Err("Вкажіть коректні дату та час інциденту.".into());
    }
    if !draft.status.trim().is_empty() && draft.status.trim() != "Чернетка" {
        return Err("Чернетку можна зберігати лише у стані «Чернетка».".into());
    }
    if !draft.event_data.is_object() && !draft.event_data.is_null() {
        return Err("Дані події мають некоректний формат.".into());
    }
    // Kept in the wire format for compatibility with older clients. The type is
    // authoritative and determines the canonical category.
    let _submitted_category = draft.category.trim();
    // Older clients still send these display values. They remain in the wire
    // format, but server-resolved factual context always wins.
    let _submitted_position_context =
        (draft.position_name.trim(), draft.reconnaissance_area.trim());
    let raw_incident_type = draft.incident_type.trim();
    let (incident_type, canonical_category) = canonical_incident_type(raw_incident_type);
    let custom_type_name = if incident_type == "Інший інцидент" {
        let explicit_name = draft.custom_type_name.trim();
        let legacy_name = (raw_incident_type != incident_type).then_some(raw_incident_type);
        let name = if explicit_name.is_empty() {
            legacy_name.unwrap_or_default()
        } else {
            explicit_name
        };
        if name.is_empty() {
            return Err("Вкажіть власну назву іншого інциденту.".into());
        }
        name.to_string()
    } else {
        String::new()
    };
    let preserved_context =
        existing_context.filter(|context| context.matches_identity(incident_type, draft));
    let category = canonical_category.to_string();
    let mut equipment_ids = draft.equipment_ids.clone();
    if let Some(equipment_id) = draft.equipment_id {
        if !equipment_ids.contains(&equipment_id) {
            equipment_ids.push(equipment_id);
        }
    }
    let mut unique_equipment_ids = Vec::with_capacity(equipment_ids.len());
    equipment_ids.retain(|id| {
        if unique_equipment_ids.contains(id) {
            false
        } else {
            unique_equipment_ids.push(*id);
            true
        }
    });

    let mut source_crew_id = None;
    let mut source_position_name = String::new();
    let mut source_reconnaissance_area = String::new();
    let mut source_flight_event_snapshot = None;
    if incident_type == "Втрата БпЛА" {
        let source_flight_id = draft
            .source_flight_id
            .ok_or_else(|| "Для втрати БпЛА оберіть запис із журналу польотів.".to_string())?;
        let flight = connection
            .query_row(
                "SELECT flight_date,sky_time,crew_id,position_id,position_name_snapshot,snapshot_id,uav_id,payload_source,payload_id FROM flight_journal_entries WHERE id=?1",
                [source_flight_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<i64>>(2)?,
                        row.get::<_, Option<i64>>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<i64>>(5)?,
                        row.get::<_, Option<i64>>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, Option<i64>>(8)?,
                    ))
                },
            )
            .map_err(|_| "Обраний запис журналу польотів не знайдено.".to_string())?;
        if existing_source_flight_id != Some(source_flight_id)
            && !flight_is_within_last_day(&flight.0, &flight.1, chrono::Local::now().naive_local())
        {
            return Err("Для втрати БпЛА можна обрати лише політ за останні 24 години.".into());
        }
        source_crew_id = flight.2;
        (source_position_name, source_reconnaissance_area) = source_flight_position_context(
            connection, flight.5, flight.2, &flight.1, flight.3, &flight.4,
        );
        if let Some(uav_id) = flight.6 {
            if !equipment_ids.contains(&uav_id) {
                equipment_ids.push(uav_id);
            }
        }
        if flight.7 == "equipment" {
            if let Some(payload_id) = flight.8 {
                if !equipment_ids.contains(&payload_id) {
                    equipment_ids.push(payload_id);
                }
            }
        }
        source_flight_event_snapshot = connection
            .query_row(
                "SELECT crew_name_snapshot,battle_order_snapshot,work_strip_snapshot,mission,uav_name_snapshot,uav_type_snapshot,uav_serial_snapshot,payload_type_snapshot,payload_serial_snapshot,COALESCE(NULLIF(completion_time,''),ground_time) FROM flight_journal_entries WHERE id=?1",
                [source_flight_id],
                |row| {
                    let crew_name = row.get::<_, String>(0)?;
                    let completion_time = row.get::<_, String>(9)?;
                    Ok(serde_json::json!({
                        "sourceFlight": format!("Політ №{}: {} · {}–{}", source_flight_id, crew_name, flight.1, if completion_time.trim().is_empty() { "—" } else { completion_time.trim() }),
                        "battleOrder": row.get::<_, String>(1)?,
                        "workStrip": row.get::<_, String>(2)?,
                        "mission": row.get::<_, String>(3)?,
                        "uavName": row.get::<_, String>(4)?,
                        "uavType": row.get::<_, String>(5)?,
                        "uavSerialNumber": row.get::<_, String>(6)?,
                        "payloadType": row.get::<_, String>(7)?,
                        "payloadSerialNumber": row.get::<_, String>(8)?,
                    }))
                },
            )
            .ok();
    }
    let (source_crew_snapshot, source_personnel_ids, source_personnel_snapshots) =
        source_flight_personnel_snapshot(connection, draft.source_flight_id);
    let source_witness_ids = source_personnel_ids.clone();
    let mut personnel_ids = if incident_type == "Втрата БпЛА"
        || (draft.personnel_ids.is_empty() && !source_personnel_ids.is_empty())
    {
        source_personnel_ids.clone()
    } else {
        draft.personnel_ids.clone()
    };
    let mut crew_id = source_crew_id.or(draft.crew_id);

    let mut vehicle_snapshot = String::new();
    let mut vehicle_event_snapshot = None;
    if let Some(vehicle_id) = draft.vehicle_id {
        let vehicle = connection
            .query_row(
                "SELECT v.name,v.registration_number,v.status,v.crew_id,v.personnel_id,COALESCE(trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic),'') FROM vehicles v LEFT JOIN personnel p ON p.id=v.personnel_id WHERE v.id=?1",
                [vehicle_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<i64>>(3)?,
                        row.get::<_, Option<i64>>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )
            .map_err(|_| "Обраний автомобіль не знайдено.".to_string())?;
        vehicle_snapshot = format!("{} {}", vehicle.0.trim(), vehicle.1.trim())
            .trim()
            .to_string();
        vehicle_event_snapshot = Some(serde_json::json!({
            "vehicleName": vehicle.0,
            "vehicleRegistrationNumber": vehicle.1,
            "vehicleStatus": vehicle.2,
            "vehicleDriver": vehicle.5,
        }));
        if category == "Транспорт" {
            crew_id = vehicle.3;
            personnel_ids.clear();
            if let Some(personnel_id) = vehicle.4 {
                personnel_ids.push(personnel_id);
            }
        } else {
            crew_id = crew_id.or(vehicle.3);
            if personnel_ids.is_empty() {
                if let Some(personnel_id) = vehicle.4 {
                    personnel_ids.push(personnel_id);
                }
            }
        }
    } else if category == "Транспорт" {
        return Err("Для транспортного інциденту оберіть автомобіль.".into());
    }

    if let Some(context) = preserved_context {
        crew_id = context.crew_id;
        personnel_ids = context.personnel_ids();
        source_position_name = context.position_name.clone();
        source_reconnaissance_area = context.position_area.clone();
        vehicle_snapshot = context.vehicle_snapshot.clone();
        if context.vehicle_id.is_some() {
            vehicle_event_snapshot = Some(serde_json::json!({
                "vehicleName": context.event_data.get("vehicleName").cloned().unwrap_or(serde_json::Value::String(String::new())),
                "vehicleRegistrationNumber": context.event_data.get("vehicleRegistrationNumber").cloned().unwrap_or(serde_json::Value::String(String::new())),
                "vehicleStatus": context.event_data.get("vehicleStatus").cloned().unwrap_or(serde_json::Value::String(String::new())),
                "vehicleDriver": context.event_data.get("vehicleDriver").cloned().unwrap_or(serde_json::Value::String(String::new())),
            }));
        }
        if context.source_flight_id.is_some() {
            let mut snapshot = serde_json::Map::new();
            for key in [
                "sourceFlight",
                "battleOrder",
                "workStrip",
                "mission",
                "uavName",
                "uavType",
                "uavSerialNumber",
                "payloadType",
                "payloadSerialNumber",
            ] {
                snapshot.insert(
                    key.to_string(),
                    context
                        .event_data
                        .get(key)
                        .cloned()
                        .unwrap_or(serde_json::Value::String(String::new())),
                );
            }
            source_flight_event_snapshot = Some(serde_json::Value::Object(snapshot));
        }
    } else if incident_type != "Втрата БпЛА" {
        let (plan_date, incident_time) = occurred_at
            .split_once('T')
            .ok_or_else(|| "Вкажіть коректні дату та час інциденту.".to_string())?;
        let person_context_id = if incident_requires_primary_person(incident_type)
            || (incident_type == "Втрата майна" && !personnel_ids.is_empty())
        {
            personnel_ids.first().copied()
        } else {
            None
        };
        if let Some(personnel_id) = person_context_id {
            // Personnel incidents may occur away from a position. The relation is
            // stored only when the persisted plan proves that the person was at
            // that crew and position at the exact event time.
            let (_, context) = saved_plan_position_context(
                connection,
                plan_date,
                incident_time,
                None,
                Some(personnel_id),
            )?;
            crew_id = context.as_ref().and_then(|value| value.crew_id);
            source_position_name = context
                .as_ref()
                .map(|value| value.position_name.clone())
                .unwrap_or_default();
            source_reconnaissance_area =
                context.map(|value| value.position_area).unwrap_or_default();
        } else if let Some(selected_crew_id) = crew_id {
            let (_, context) = saved_plan_position_context(
                connection,
                plan_date,
                incident_time,
                Some(selected_crew_id),
                None,
            )?;
            if let Some(context) = context {
                source_position_name = context.position_name;
                source_reconnaissance_area = context.position_area;
            }
        }
    }
    let mut unique_personnel_ids = Vec::with_capacity(personnel_ids.len());
    personnel_ids.retain(|id| {
        if unique_personnel_ids.contains(id) {
            false
        } else {
            unique_personnel_ids.push(*id);
            true
        }
    });
    unique_equipment_ids.clear();
    equipment_ids.retain(|id| {
        if unique_equipment_ids.contains(id) {
            false
        } else {
            unique_equipment_ids.push(*id);
            true
        }
    });

    if incident_requires_primary_person(incident_type) && personnel_ids.len() != 1 {
        return Err("Для цього типу інциденту оберіть одного військовослужбовця.".into());
    }
    if incident_type == "Втрата майна" {
        if crew_id.is_none() && personnel_ids.is_empty() {
            return Err("Для втрати майна оберіть екіпаж або військовослужбовця.".into());
        }
        if equipment_ids.is_empty() {
            return Err("Оберіть втрачене майно.".into());
        }
    }
    if matches!(incident_type, "Обстріл" | "Знищення позиції") && crew_id.is_none()
    {
        return Err("Для цієї події оберіть екіпаж.".into());
    }

    if draft.source_flight_id.is_none() {
        validate_incident_equipment(connection, crew_id, &personnel_ids, &equipment_ids)?;
    } else {
        for equipment_id in &equipment_ids {
            connection
                .query_row(
                    "SELECT id FROM equipment WHERE id=?1",
                    [equipment_id],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|_| "Обране майно не знайдено.".to_string())?;
        }
    }

    let (position_name, reconnaissance_area, crew_snapshot) =
        if let Some(context) = preserved_context {
            (
                context.position_name.clone(),
                context.position_area.clone(),
                context.crew_snapshot.clone(),
            )
        } else if let Some(id) = crew_id {
            let current_context = current_crew_position_context(connection, id)?;
            let members = actual_crew_members(connection, id)?
                .into_iter()
                .map(|member| member.full_name)
                .collect::<Vec<_>>()
                .join(", ");
            (
                if !source_position_name.trim().is_empty() {
                    source_position_name
                } else {
                    current_context.position_name
                },
                if !source_reconnaissance_area.trim().is_empty() {
                    source_reconnaissance_area
                } else {
                    current_context.position_area
                },
                if source_crew_snapshot.is_empty() {
                    members
                } else {
                    source_crew_snapshot
                },
            )
        } else {
            (
                source_position_name,
                source_reconnaissance_area,
                source_crew_snapshot,
            )
        };

    let subject_personnel_ids = if incident_requires_primary_person(incident_type) {
        personnel_ids.clone()
    } else {
        Vec::new()
    };
    let mut personnel = preserved_context
        .map(|context| context.personnel.clone())
        .unwrap_or_else(|| Vec::with_capacity(personnel_ids.len()));
    if preserved_context.is_none() {
        for personnel_id in personnel_ids {
            let current_snapshot = connection
            .query_row(
                "SELECT trim(surname || ' ' || given_name || ' ' || patronymic),rank,position FROM personnel WHERE id=?1",
                [personnel_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .ok();
            let historical_snapshot = source_personnel_snapshots
                .iter()
                .find(|(id, _, _, _)| *id == personnel_id);
            if let Some((full_name, rank, position)) = current_snapshot {
                personnel.push((Some(personnel_id), full_name, rank, position));
            } else if let Some((_, full_name, rank, position)) = historical_snapshot {
                personnel.push((None, full_name.clone(), rank.clone(), position.clone()));
            } else {
                return Err("Обрану особу не знайдено.".to_string());
            }
        }
    }

    let mut event_data = if draft.event_data.is_null() {
        serde_json::json!({})
    } else {
        draft.event_data.clone()
    };
    if let Some(source_flight_event_snapshot) = source_flight_event_snapshot {
        let target = event_data
            .as_object_mut()
            .ok_or_else(|| "Дані події мають некоректний формат.".to_string())?;
        if let Some(fields) = source_flight_event_snapshot.as_object() {
            for (key, value) in fields {
                target.insert(key.clone(), value.clone());
            }
        }
    }
    if let Some(vehicle_event_snapshot) = vehicle_event_snapshot {
        let target = event_data
            .as_object_mut()
            .ok_or_else(|| "Дані події мають некоректний формат.".to_string())?;
        if let Some(fields) = vehicle_event_snapshot.as_object() {
            for (key, value) in fields {
                target.insert(key.clone(), value.clone());
            }
        }
    }
    validate_incident_explanations(
        connection,
        incident_type,
        &event_data,
        &subject_personnel_ids,
        (incident_type == "Втрата БпЛА").then_some(source_witness_ids.as_slice()),
    )?;
    let event_data_json = serde_json::to_string(&event_data)
        .map_err(|_| "Не вдалося підготувати дані інциденту.".to_string())?;

    Ok(PreparedIncidentDraft {
        category,
        incident_type: incident_type.to_string(),
        custom_type_name,
        occurred_at: occurred_at.to_string(),
        crew_id,
        vehicle_id: draft.vehicle_id,
        vehicle_snapshot,
        equipment_ids,
        personnel,
        position_name,
        reconnaissance_area,
        crew_snapshot,
        description: draft.description.trim().to_string(),
        immediate_actions: draft.immediate_actions.trim().to_string(),
        consequences: draft.consequences.trim().to_string(),
        flight_stage: draft.flight_stage.trim().to_string(),
        preliminary_cause: draft.preliminary_cause.trim().to_string(),
        snapshot_source: if draft.snapshot_source.trim().is_empty() {
            "current".into()
        } else {
            draft.snapshot_source.trim().to_string()
        },
        reported_to: draft.reported_to.trim().to_string(),
        reported_at: draft.reported_at.trim().to_string(),
        source_flight_id: draft.source_flight_id,
        event_data_json,
    })
}

fn replace_incident_relations(
    connection: &Connection,
    incident_id: i64,
    prepared: &PreparedIncidentDraft,
) -> Result<(), String> {
    connection
        .execute(
            "DELETE FROM incident_equipment WHERE incident_id=?1",
            [incident_id],
        )
        .map_err(|_| "Не вдалося оновити майно інциденту.".to_string())?;
    for equipment_id in &prepared.equipment_ids {
        connection
            .execute(
                "INSERT INTO incident_equipment(incident_id,equipment_id) VALUES(?1,?2)",
                rusqlite::params![incident_id, equipment_id],
            )
            .map_err(|_| "Не вдалося зберегти майно інциденту.".to_string())?;
    }
    connection
        .execute(
            "DELETE FROM incident_personnel WHERE incident_id=?1",
            [incident_id],
        )
        .map_err(|_| "Не вдалося оновити осіб інциденту.".to_string())?;
    for (selection_order, (personnel_reference, full_name, rank, position)) in
        prepared.personnel.iter().enumerate()
    {
        connection.execute(
            "INSERT OR IGNORE INTO incident_personnel(incident_id,personnel_id,full_name_snapshot,rank_snapshot,position_snapshot,selection_order) VALUES(?1,?2,?3,?4,?5,?6)",
            rusqlite::params![incident_id,personnel_reference,full_name,rank,position,selection_order as i64],
        ).map_err(|_| "Не вдалося зберегти осіб інциденту.".to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn create_incident(state: tauri::State<AppState>, draft: IncidentDraft) -> Result<(), String> {
    let mut db = state.0.lock().map_err(|_| busy())?;
    let prepared = prepare_incident_draft(&db.connection, &draft, None, None)?;
    let transaction = db
        .connection
        .transaction()
        .map_err(|_| "Не вдалося почати створення інциденту.".to_string())?;
    transaction.execute("INSERT INTO incidents(category,incident_type,custom_type_name,status,occurred_at,crew_id,equipment_id,vehicle_id,vehicle_snapshot,position_name,reconnaissance_area,crew_snapshot,description,immediate_actions,consequences,flight_stage,preliminary_cause,snapshot_source,reported_to,reported_at,source_flight_id,event_data_json) VALUES(?1,?2,?3,'Чернетка',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)",rusqlite::params![prepared.category,prepared.incident_type,prepared.custom_type_name,prepared.occurred_at,prepared.crew_id,prepared.equipment_ids.first(),prepared.vehicle_id,prepared.vehicle_snapshot,prepared.position_name,prepared.reconnaissance_area,prepared.crew_snapshot,prepared.description,prepared.immediate_actions,prepared.consequences,prepared.flight_stage,prepared.preliminary_cause,prepared.snapshot_source,prepared.reported_to,prepared.reported_at,prepared.source_flight_id,prepared.event_data_json]).map_err(|_|"Не вдалося зберегти інцидент.".to_string())?;
    let incident_id = transaction.last_insert_rowid();
    replace_incident_relations(&transaction, incident_id, &prepared)?;
    super::sync_incident_write_offs(&transaction, incident_id, &prepared.incident_type)?;
    initialize_incident_workflow(&transaction, incident_id, &prepared.incident_type)?;
    transaction.execute(
        "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Створено чернетку',?2)",
        rusqlite::params![incident_id, format!("Тип: {}", if prepared.custom_type_name.is_empty() { &prepared.incident_type } else { &prepared.custom_type_name })],
    ).map_err(|_| "Не вдалося записати історію інциденту.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити створення інциденту.".to_string())
}

fn update_incident_draft_record(
    connection: &mut Connection,
    incident_id: i64,
    draft: &IncidentDraft,
) -> Result<(), String> {
    let current = connection
        .query_row(
            "SELECT status,archived_at,source_flight_id,incident_type FROM incidents WHERE id=?1",
            [incident_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .map_err(|_| "Інцидент не знайдено.".to_string())?;
    if !current.1.trim().is_empty() {
        return Err("Архівний інцидент не можна редагувати.".into());
    }
    if current.0 != "Чернетка" {
        return Err("Повністю редагувати можна лише чернетку інциденту.".into());
    }
    let factual_context = existing_incident_factual_context(connection, incident_id)?;
    let prepared = prepare_incident_draft(connection, draft, current.2, Some(&factual_context))?;
    let transaction = connection
        .transaction()
        .map_err(|_| "Не вдалося почати оновлення чернетки.".to_string())?;
    transaction
        .execute(
            "DELETE FROM asset_write_offs WHERE incident_id=?1",
            [incident_id],
        )
        .map_err(|_| "Не вдалося очистити передчасне списання чернетки.".to_string())?;
    transaction.execute("UPDATE incidents SET category=?1,incident_type=?2,custom_type_name=?3,occurred_at=?4,crew_id=?5,equipment_id=?6,vehicle_id=?7,vehicle_snapshot=?8,position_name=?9,reconnaissance_area=?10,crew_snapshot=?11,description=?12,immediate_actions=?13,consequences=?14,flight_stage=?15,preliminary_cause=?16,snapshot_source=?17,reported_to=?18,reported_at=?19,source_flight_id=?20,event_data_json=?21 WHERE id=?22 AND status='Чернетка' AND trim(archived_at)=''",rusqlite::params![prepared.category,prepared.incident_type,prepared.custom_type_name,prepared.occurred_at,prepared.crew_id,prepared.equipment_ids.first(),prepared.vehicle_id,prepared.vehicle_snapshot,prepared.position_name,prepared.reconnaissance_area,prepared.crew_snapshot,prepared.description,prepared.immediate_actions,prepared.consequences,prepared.flight_stage,prepared.preliminary_cause,prepared.snapshot_source,prepared.reported_to,prepared.reported_at,prepared.source_flight_id,prepared.event_data_json,incident_id]).map_err(|_| "Не вдалося оновити чернетку інциденту.".to_string())?;
    replace_incident_relations(&transaction, incident_id, &prepared)?;
    super::sync_incident_write_offs(&transaction, incident_id, &prepared.incident_type)?;
    if current.3 != prepared.incident_type {
        transaction
            .execute(
                "DELETE FROM incident_steps WHERE incident_id=?1",
                [incident_id],
            )
            .map_err(|_| "Не вдалося оновити алгоритм чернетки.".to_string())?;
        transaction
            .execute(
                "DELETE FROM incident_documents WHERE incident_id=?1",
                [incident_id],
            )
            .map_err(|_| "Не вдалося оновити документи чернетки.".to_string())?;
    }
    initialize_incident_workflow(&transaction, incident_id, &prepared.incident_type)?;
    transaction.execute(
        "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Оновлено чернетку',?2)",
        rusqlite::params![incident_id, format!("Тип: {}", if prepared.custom_type_name.is_empty() { &prepared.incident_type } else { &prepared.custom_type_name })],
    ).map_err(|_| "Не вдалося записати історію чернетки.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити оновлення чернетки.".to_string())
}

#[tauri::command]
pub fn update_incident_draft(
    state: tauri::State<AppState>,
    incident_id: i64,
    draft: IncidentDraft,
) -> Result<(), String> {
    let mut db = state.0.lock().map_err(|_| busy())?;
    update_incident_draft_record(&mut db.connection, incident_id, &draft)
}

#[tauri::command]
pub fn update_incident_data(
    state: tauri::State<AppState>,
    incident_id: i64,
    draft: IncidentDataDraft,
) -> Result<(), String> {
    if !draft.event_data.is_object() && !draft.event_data.is_null() {
        return Err("Дані події мають некоректний формат.".into());
    }
    let event_data = if draft.event_data.is_null() {
        serde_json::json!({})
    } else {
        draft.event_data
    };
    let event_data_json = serde_json::to_string(&event_data)
        .map_err(|_| "Не вдалося підготувати дані події.".to_string())?;
    let mut db = state.0.lock().map_err(|_| busy())?;
    let current = db.connection.query_row(
        "SELECT status,archived_at,description,flight_stage,preliminary_cause,event_data_json FROM incidents WHERE id=?1",
        [incident_id],
        |row| Ok((row.get::<_, String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,String>(4)?,row.get::<_,String>(5)?)),
    ).map_err(|_| "Інцидент не знайдено.".to_string())?;
    if !current.1.trim().is_empty() {
        return Err("Архівний інцидент не можна редагувати.".into());
    }
    if current.0 != "Чернетка" {
        return Err("Дані події можна редагувати лише у чернетці.".into());
    }
    let previous = (current.2, current.3, current.4, current.5);
    let next = (
        draft.description.trim().to_string(),
        draft.flight_stage.trim().to_string(),
        draft.preliminary_cause.trim().to_string(),
        event_data_json,
    );
    if previous == next {
        return Ok(());
    }
    let transaction = db
        .connection
        .transaction()
        .map_err(|_| "Не вдалося почати оновлення даних події.".to_string())?;
    transaction.execute(
        "UPDATE incidents SET description=?1,flight_stage=?2,preliminary_cause=?3,event_data_json=?4 WHERE id=?5",
        rusqlite::params![next.0, next.1, next.2, next.3, incident_id],
    ).map_err(|_| "Не вдалося зберегти дані події.".to_string())?;
    transaction.execute(
        "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Доповнено дані події','Зміни збережено автоматично.')",
        [incident_id],
    ).map_err(|_| "Не вдалося записати історію інциденту.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити оновлення даних події.".to_string())
}

fn apply_registration_side_effects(
    transaction: &Transaction<'_>,
    incident_id: i64,
) -> Result<(), String> {
    let incident = transaction
        .query_row(
            "SELECT incident_type,occurred_at,source_flight_id,preliminary_cause FROM incidents WHERE id=?1",
            [incident_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .map_err(|_| "Інцидент не знайдено.".to_string())?;
    super::sync_incident_write_offs(transaction, incident_id, &incident.0)?;
    if incident.0 != "Втрата БпЛА" {
        return Ok(());
    }
    let source_flight_id = incident
        .2
        .ok_or_else(|| "Для втрати БпЛА не вказано запис журналу польотів.".to_string())?;
    let current_completion = transaction
        .query_row(
            "SELECT completion_type FROM flight_journal_entries WHERE id=?1",
            [source_flight_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "Пов’язаний запис журналу польотів не знайдено.".to_string())?;
    if current_completion.trim().is_empty() {
        let completion_time = incident
            .1
            .rsplit_once('T')
            .map(|(_, time)| time)
            .unwrap_or("");
        transaction
            .execute(
                "UPDATE flight_journal_entries SET completion_type='Втрата',completion_time=?1,completion_detail=?2,ground_time='' WHERE id=?3 AND trim(completion_type)=''",
                rusqlite::params![completion_time, incident.3, source_flight_id],
            )
            .map_err(|_| "Не вдалося позначити політ як втрачений.".to_string())?;
    } else if current_completion != "Втрата" {
        return Err("Пов’язаний політ уже має інший тип завершення.".into());
    }
    Ok(())
}

fn validate_stored_draft_for_registration(
    connection: &Connection,
    incident_id: i64,
) -> Result<(), String> {
    let (mut draft, event_data_json) = connection
        .query_row(
            "SELECT category,incident_type,custom_type_name,status,occurred_at,crew_id,equipment_id,vehicle_id,position_name,reconnaissance_area,description,immediate_actions,consequences,flight_stage,preliminary_cause,snapshot_source,reported_to,reported_at,source_flight_id,event_data_json FROM incidents WHERE id=?1",
            [incident_id],
            |row| {
                Ok((
                    IncidentDraft {
                        category: row.get(0)?,
                        incident_type: row.get(1)?,
                        custom_type_name: row.get(2)?,
                        status: row.get(3)?,
                        occurred_at: row.get(4)?,
                        crew_id: row.get(5)?,
                        equipment_id: row.get(6)?,
                        equipment_ids: Vec::new(),
                        personnel_ids: Vec::new(),
                        vehicle_id: row.get(7)?,
                        position_name: row.get(8)?,
                        reconnaissance_area: row.get(9)?,
                        description: row.get(10)?,
                        immediate_actions: row.get(11)?,
                        consequences: row.get(12)?,
                        flight_stage: row.get(13)?,
                        preliminary_cause: row.get(14)?,
                        snapshot_source: row.get(15)?,
                        reported_to: row.get(16)?,
                        reported_at: row.get(17)?,
                        source_flight_id: row.get(18)?,
                        event_data: serde_json::Value::Null,
                    },
                    row.get::<_, String>(19)?,
                ))
            },
        )
        .map_err(|_| "Інцидент не знайдено.".to_string())?;
    draft.event_data = serde_json::from_str(&event_data_json)
        .map_err(|_| "Збережені дані події мають некоректний формат.".to_string())?;
    draft.equipment_ids = incident_equipment(connection, incident_id)?.0;
    draft.personnel_ids = incident_personnel(connection, incident_id)?.0;
    let factual_context = existing_incident_factual_context(connection, incident_id)?;
    prepare_incident_draft(
        connection,
        &draft,
        draft.source_flight_id,
        Some(&factual_context),
    )?;
    Ok(())
}

fn update_incident_status_record(
    connection: &mut Connection,
    incident_id: i64,
    status: &str,
    reason: &str,
) -> Result<(), String> {
    let status = status.trim();
    if !INCIDENT_STATUSES.contains(&status) {
        return Err("Невідомий стан інциденту.".into());
    }
    if status == "Скасовано" && reason.trim().is_empty() {
        return Err("Для скасування вкажіть причину.".into());
    }
    let transaction = connection
        .transaction()
        .map_err(|_| "Не вдалося почати зміну стану інциденту.".to_string())?;
    let (previous, archived_at) = transaction
        .query_row(
            "SELECT status,archived_at FROM incidents WHERE id=?1",
            [incident_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|_| "Інцидент не знайдено.".to_string())?;
    if !archived_at.trim().is_empty() {
        return Err("Архівний інцидент не можна змінювати.".into());
    }
    ensure_forward_incident_transition(&previous, status)?;
    if previous == status {
        return Ok(());
    }
    if status == "Завершено" {
        let pending = transaction.query_row(
            "SELECT COUNT(*) FROM incident_steps WHERE incident_id=?1 AND is_required=1 AND status NOT IN ('Виконано','Пропущено')",
            [incident_id],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0);
        if pending > 0 {
            return Err(
                "Спочатку завершіть або обґрунтовано пропустіть усі обов’язкові кроки.".into(),
            );
        }
    }
    if previous == "Чернетка" && status != "Скасовано" {
        validate_stored_draft_for_registration(&transaction, incident_id)?;
        apply_registration_side_effects(&transaction, incident_id)?;
    }
    transaction
        .execute(
            "UPDATE incidents SET status=?1 WHERE id=?2 AND status=?3 AND trim(archived_at)=''",
            rusqlite::params![status, incident_id, previous],
        )
        .map_err(|_| "Не вдалося змінити стан інциденту.".to_string())?;
    let details = if reason.trim().is_empty() {
        format!("{} → {}", previous, status)
    } else {
        format!("{} → {}. Причина: {}", previous, status, reason.trim())
    };
    transaction
        .execute(
            "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Змінено стан',?2)",
            rusqlite::params![incident_id, details],
        )
        .map_err(|_| "Не вдалося записати історію інциденту.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити зміну стану інциденту.".to_string())
}

#[tauri::command]
pub fn update_incident_status(
    state: tauri::State<AppState>,
    incident_id: i64,
    status: String,
    reason: String,
) -> Result<(), String> {
    let mut db = state.0.lock().map_err(|_| busy())?;
    update_incident_status_record(&mut db.connection, incident_id, &status, &reason)
}

fn delete_incident_record(connection: &mut Connection, incident_id: i64) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|_| "Не вдалося почати видалення інциденту.".to_string())?;
    let (status, archived_at) = transaction
        .query_row(
            "SELECT status,archived_at FROM incidents WHERE id=?1",
            [incident_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|_| "Інцидент не знайдено.".to_string())?;
    if !archived_at.trim().is_empty() {
        return Err("Архівний інцидент не можна видалити.".into());
    }
    if status != "Чернетка" {
        return Err("Видалити можна лише чернетку. Інший інцидент можна архівувати.".into());
    }
    transaction
        .execute(
            "DELETE FROM asset_write_offs WHERE incident_id=?1",
            [incident_id],
        )
        .map_err(|_| "Не вдалося очистити пов’язані записи списання.".to_string())?;
    let deleted = transaction
        .execute("DELETE FROM incidents WHERE id=?1", [incident_id])
        .map_err(|_| "Не вдалося видалити чернетку інциденту.".to_string())?;
    if deleted != 1 {
        return Err("Інцидент не знайдено.".into());
    }
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити видалення інциденту.".to_string())
}

#[tauri::command]
pub fn delete_incident(state: tauri::State<AppState>, incident_id: i64) -> Result<(), String> {
    let mut db = state.0.lock().map_err(|_| busy())?;
    delete_incident_record(&mut db.connection, incident_id)
}

fn archive_incident_record(
    connection: &mut Connection,
    incident_id: i64,
    reason: &str,
) -> Result<(), String> {
    let reason = reason.trim();
    if reason.is_empty() {
        return Err("Оберіть або вкажіть причину архівації.".into());
    }
    let transaction = connection
        .transaction()
        .map_err(|_| "Не вдалося почати архівацію інциденту.".to_string())?;
    let (status, archived_at) = transaction
        .query_row(
            "SELECT status,archived_at FROM incidents WHERE id=?1",
            [incident_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|_| "Інцидент не знайдено.".to_string())?;
    if status == "Чернетка" {
        return Err("Чернетку потрібно видалити, а не архівувати.".into());
    }
    if !archived_at.trim().is_empty() {
        return Err("Інцидент уже знаходиться в архіві.".into());
    }
    let updated = transaction
        .execute(
            "UPDATE incidents SET archived_at=CURRENT_TIMESTAMP,archive_reason=?1 WHERE id=?2 AND trim(archived_at)=''",
            rusqlite::params![reason, incident_id],
        )
        .map_err(|_| "Не вдалося архівувати інцидент.".to_string())?;
    if updated != 1 {
        return Err("Не вдалося архівувати інцидент: запис уже змінено.".into());
    }
    transaction
        .execute(
            "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Архівовано',?2)",
            rusqlite::params![incident_id, format!("Причина: {reason}")],
        )
        .map_err(|_| "Не вдалося записати архівацію в історію.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити архівацію інциденту.".to_string())
}

#[tauri::command]
pub fn archive_incident(
    state: tauri::State<AppState>,
    incident_id: i64,
    reason: String,
) -> Result<(), String> {
    let mut db = state.0.lock().map_err(|_| busy())?;
    archive_incident_record(&mut db.connection, incident_id, &reason)
}

fn update_incident_step_record(
    connection: &mut Connection,
    incident_id: i64,
    step_id: i64,
    status: &str,
    comment: &str,
) -> Result<(), String> {
    let status = status.trim();
    if !STEP_STATUSES.contains(&status) {
        return Err("Невідомий стан кроку.".into());
    }
    if status == "Пропущено" && comment.trim().is_empty() {
        return Err("Для пропуску кроку вкажіть причину.".into());
    }
    let transaction = connection
        .transaction()
        .map_err(|_| "Не вдалося почати оновлення кроку.".to_string())?;
    let (title, previous_status, previous_comment, archived_at): (String, String, String, String) = transaction
        .query_row(
            "SELECT s.title,s.status,s.comment,i.archived_at FROM incident_steps s JOIN incidents i ON i.id=s.incident_id WHERE s.id=?1 AND s.incident_id=?2",
            rusqlite::params![step_id, incident_id],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?)),
        )
        .map_err(|_| "Крок інциденту не знайдено.".to_string())?;
    if !archived_at.trim().is_empty() {
        return Err("Крок архівного інциденту не можна змінювати.".into());
    }
    ensure_forward_step_transition(&previous_status, status)?;
    if previous_status == status && previous_comment == comment.trim() {
        return Ok(());
    }
    transaction.execute(
        "UPDATE incident_steps SET status=?1,comment=?2,completed_at=CASE WHEN ?1 IN ('Виконано','Пропущено') THEN COALESCE(NULLIF(completed_at,''),CURRENT_TIMESTAMP) ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?3 AND incident_id=?4 AND status=?5",
        rusqlite::params![status, comment.trim(), step_id, incident_id, previous_status],
    ).map_err(|_| "Не вдалося оновити крок інциденту.".to_string())?;
    transaction.execute(
        "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Оновлено крок',?2)",
        rusqlite::params![incident_id, format!("{}: {}{}", title, status, if comment.trim().is_empty() { String::new() } else { format!(" — {}", comment.trim()) })],
    ).map_err(|_| "Не вдалося записати історію інциденту.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити оновлення кроку.".to_string())
}

#[tauri::command]
pub fn update_incident_step(
    state: tauri::State<AppState>,
    incident_id: i64,
    step_id: i64,
    status: String,
    comment: String,
) -> Result<(), String> {
    let mut db = state.0.lock().map_err(|_| busy())?;
    update_incident_step_record(&mut db.connection, incident_id, step_id, &status, &comment)
}

#[tauri::command]
pub fn update_incident_document_status(
    state: tauri::State<AppState>,
    incident_id: i64,
    document_id: i64,
    status: String,
) -> Result<(), String> {
    if !DOCUMENT_STATUSES.contains(&status.as_str()) {
        return Err("Невідомий стан документа.".into());
    }
    let mut db = state.0.lock().map_err(|_| busy())?;
    let transaction = db
        .connection
        .transaction()
        .map_err(|_| "Не вдалося почати оновлення документа.".to_string())?;
    let (document_type, archived_at): (String, String) = transaction
        .query_row(
            "SELECT d.document_type,i.archived_at FROM incident_documents d JOIN incidents i ON i.id=d.incident_id WHERE d.id=?1 AND d.incident_id=?2",
            rusqlite::params![document_id, incident_id],
            |row| Ok((row.get(0)?,row.get(1)?)),
        )
        .map_err(|_| "Документ інциденту не знайдено.".to_string())?;
    if !archived_at.trim().is_empty() {
        return Err("Документ архівного інциденту не можна змінювати.".into());
    }
    transaction.execute(
        "UPDATE incident_documents SET status=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2 AND incident_id=?3",
        rusqlite::params![status, document_id, incident_id],
    ).map_err(|_| "Не вдалося оновити стан документа.".to_string())?;
    transaction.execute(
        "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Оновлено документ',?2)",
        rusqlite::params![incident_id, format!("{}: {}", document_type, status)],
    ).map_err(|_| "Не вдалося записати історію інциденту.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити оновлення документа.".to_string())
}

#[cfg(test)]
mod incident_tests {
    use super::*;

    fn draft(incident_type: &str) -> IncidentDraft {
        IncidentDraft {
            category: String::new(),
            incident_type: incident_type.into(),
            custom_type_name: String::new(),
            status: "Чернетка".into(),
            occurred_at: "2026-09-30T10:00".into(),
            crew_id: None,
            equipment_id: None,
            equipment_ids: Vec::new(),
            personnel_ids: Vec::new(),
            vehicle_id: None,
            position_name: String::new(),
            reconnaissance_area: String::new(),
            description: String::new(),
            immediate_actions: String::new(),
            consequences: String::new(),
            flight_stage: String::new(),
            preliminary_cause: String::new(),
            snapshot_source: String::new(),
            reported_to: String::new(),
            reported_at: String::new(),
            source_flight_id: None,
            event_data: serde_json::json!({}),
        }
    }

    #[test]
    fn requires_a_valid_incident_date_and_time() {
        assert!(valid_incident_datetime("2026-09-15T07:05"));
        assert!(!valid_incident_datetime(""));
        assert!(!valid_incident_datetime("2026-09-15"));
        assert!(!valid_incident_datetime("2026-09-15T25:00"));
        assert!(!valid_incident_datetime("15.09.2026T07:05"));
    }

    #[test]
    fn migrates_archive_and_vehicle_fields_without_archiving_old_incidents() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE incidents (
                   id INTEGER PRIMARY KEY,
                   incident_type TEXT NOT NULL,
                   occurred_at TEXT NOT NULL DEFAULT '',
                   crew_id INTEGER,
                   equipment_id INTEGER,
                   position_name TEXT NOT NULL DEFAULT '',
                   reconnaissance_area TEXT NOT NULL DEFAULT '',
                   crew_snapshot TEXT NOT NULL DEFAULT '',
                   description TEXT NOT NULL DEFAULT '',
                   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                 );
                 INSERT INTO incidents(id,incident_type,occurred_at)
                 VALUES(1,'Поранення','2026-09-30T10:00');",
            )
            .unwrap();

        crate::database::initialise(&connection).unwrap();

        let migrated = connection
            .query_row(
                "SELECT vehicle_id,vehicle_snapshot,archived_at,archive_reason FROM incidents WHERE id=1",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<i64>>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            migrated,
            (None, String::new(), String::new(), String::new())
        );
    }

    #[test]
    fn separates_active_and_archived_incidents() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute_batch(
            "INSERT INTO incidents(id,incident_type,status,occurred_at) VALUES
               (1,'Поранення','Зареєстровано','2026-09-30T10:00'),
               (2,'Травма','Зареєстровано','2026-09-30T11:00');
             UPDATE incidents SET archived_at='2026-09-30 12:00:00',archive_reason='Завершено опрацювання' WHERE id=2;",
        ).unwrap();

        let active = load_incidents(&connection, false).unwrap();
        let archived = load_incidents(&connection, true).unwrap();

        assert_eq!(
            active.iter().map(|item| item.id).collect::<Vec<_>>(),
            vec![1]
        );
        assert_eq!(
            archived.iter().map(|item| item.id).collect::<Vec<_>>(),
            vec![2]
        );
        assert_eq!(archived[0].archive_reason, "Завершено опрацювання");
    }

    #[test]
    fn deletes_only_drafts_and_cleans_legacy_write_offs() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO incidents(id,incident_type,status,occurred_at) VALUES(1,'Втрата майна','Чернетка','2026-09-30T10:00')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO asset_write_offs(id,incident_id,incident_type) VALUES(7,1,'Втрата майна')",
                [],
            )
            .unwrap();

        delete_incident_record(&mut connection, 1).unwrap();
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM incidents", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM asset_write_offs", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );

        connection
            .execute(
                "INSERT INTO incidents(id,incident_type,status,occurred_at) VALUES(2,'Поранення','Зареєстровано','2026-09-30T10:00')",
                [],
            )
            .unwrap();
        assert!(delete_incident_record(&mut connection, 2).is_err());
    }

    #[test]
    fn archives_only_non_drafts_with_a_reason_and_history() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute_batch(
                "INSERT INTO incidents(id,incident_type,status,occurred_at) VALUES
               (1,'Поранення','Чернетка','2026-09-30T10:00'),
               (2,'Поранення','Зареєстровано','2026-09-30T11:00');",
            )
            .unwrap();

        assert!(archive_incident_record(&mut connection, 1, "Помилковий запис").is_err());
        assert!(archive_incident_record(&mut connection, 2, "").is_err());
        archive_incident_record(&mut connection, 2, "Завершено опрацювання").unwrap();

        let archived = connection
            .query_row(
                "SELECT archived_at,archive_reason FROM incidents WHERE id=2",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .unwrap();
        assert!(!archived.0.is_empty());
        assert_eq!(archived.1, "Завершено опрацювання");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM incident_history WHERE incident_id=2 AND action='Архівовано'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            1
        );
    }

    #[test]
    fn incident_statuses_only_move_forward_and_registered_loss_creates_write_off() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(3,'ГРІМ')", [])
            .unwrap();
        connection.execute("INSERT INTO equipment(id,category,name,service_code,crew_id) VALUES(5,'communications','Ноутбук','ovtm',3)", []).unwrap();
        connection.execute("INSERT INTO incidents(id,incident_type,status,occurred_at,crew_id,equipment_id) VALUES(1,'Втрата майна','Чернетка','2026-09-30T10:00',3,5)", []).unwrap();
        connection
            .execute(
                "INSERT INTO incident_equipment(incident_id,equipment_id) VALUES(1,5)",
                [],
            )
            .unwrap();
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM asset_write_offs", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );

        update_incident_status_record(&mut connection, 1, "Зареєстровано", "").unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM asset_write_offs WHERE incident_id=1",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
        assert!(update_incident_status_record(&mut connection, 1, "Чернетка", "").is_err());
        assert_eq!(
            connection
                .query_row("SELECT status FROM incidents WHERE id=1", [], |row| row
                    .get::<_, String>(
                    0
                ))
                .unwrap(),
            "Зареєстровано"
        );
    }

    #[test]
    fn step_statuses_only_move_forward_and_keep_the_first_completion_time() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO incidents(id,incident_type,status,occurred_at) VALUES(1,'Поранення','Зареєстровано','2026-09-30T10:00')", []).unwrap();
        connection.execute("INSERT INTO incident_steps(id,incident_id,step_order,title,status) VALUES(1,1,1,'Крок','Очікує')", []).unwrap();
        assert!(update_incident_step_record(&mut connection, 1, 1, "В роботі", "").is_err());
        update_incident_step_record(&mut connection, 1, 1, "Виконано", "Готово").unwrap();
        let completed_at = connection
            .query_row(
                "SELECT completed_at FROM incident_steps WHERE id=1",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        update_incident_step_record(&mut connection, 1, 1, "Виконано", "Уточнено").unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT completed_at FROM incident_steps WHERE id=1",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            completed_at
        );
        assert!(update_incident_step_record(&mut connection, 1, 1, "Очікує", "").is_err());
    }

    #[test]
    fn transport_draft_uses_the_selected_vehicle_snapshot_and_relations() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO crews(id,name,position_name,reconnaissance_area) VALUES(3,'ГРІМ','ПОЗИЦІЯ-1','РАЙОН-1')", []).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,position,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(8,'солдат','ІВАНЕНКО','Іван','водій','2000-01-01','','','','','',''),(9,'солдат','СТОРОННІЙ','Степан','оператор','2000-01-01','','','','','','')", []).unwrap();
        connection.execute("INSERT INTO vehicles(id,name,registration_number,status,crew_id,personnel_id) VALUES(11,'Ford Ranger','АА 0001 АА','Справний',3,8)", []).unwrap();
        let mut value = draft("ДТП");
        value.vehicle_id = Some(11);
        value.crew_id = Some(999);
        value.personnel_ids = vec![9];
        value.position_name = "Недостовірна позиція".into();
        value.event_data = serde_json::json!({
            "vehicleName": "Підмінена назва",
            "vehicleDriver": "Підмінений водій"
        });

        let prepared = prepare_incident_draft(&connection, &value, None, None).unwrap();

        assert_eq!(prepared.vehicle_snapshot, "Ford Ranger АА 0001 АА");
        assert_eq!(prepared.crew_id, Some(3));
        assert_eq!(prepared.position_name, "ПОЗИЦІЯ-1");
        assert_eq!(prepared.reconnaissance_area, "РАЙОН-1");
        assert_eq!(prepared.personnel[0].0, Some(8));
        let event_data: serde_json::Value =
            serde_json::from_str(&prepared.event_data_json).unwrap();
        assert_eq!(event_data["vehicleName"], "Ford Ranger");
        assert_eq!(event_data["vehicleRegistrationNumber"], "АА 0001 АА");
        assert_eq!(event_data["vehicleDriver"], "ІВАНЕНКО Іван");
        assert_eq!(event_data["vehicleStatus"], "Справний");
    }

    #[test]
    fn dated_flight_plan_context_is_not_replaced_with_the_current_crew_position() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO crews(id,name,position_name,reconnaissance_area) VALUES(3,'ГРІМ','ПОТОЧНА ПОЗИЦІЯ','ПОТОЧНИЙ РАЙОН')", []).unwrap();
        connection.execute("INSERT INTO equipment(id,category,name,service_code,crew_id) VALUES(5,'communications','Ноутбук','ovtm',3)", []).unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json) VALUES('2026-09-30',1,?1)",
            [r#"{"entries":[{"crewId":3,"actualMemberIds":[],"startTime":"05:00","positionName":"ПОЗИЦІЯ НА ДАТУ ПОДІЇ","positionLocality":"РАЙОН ПОЗИЦІЇ НА ДАТУ ПОДІЇ"}]}"#],
        ).unwrap();
        let mut value = draft("Втрата майна");
        value.crew_id = Some(3);
        value.equipment_ids = vec![5];
        value.position_name = "ПІДМІНЕНА ПОЗИЦІЯ".into();
        value.reconnaissance_area = "ПІДМІНЕНИЙ РАЙОН".into();
        value.snapshot_source = "flight-plan-snapshot".into();

        let prepared = prepare_incident_draft(&connection, &value, None, None).unwrap();

        assert_eq!(prepared.position_name, "ПОЗИЦІЯ НА ДАТУ ПОДІЇ");
        assert_eq!(prepared.reconnaissance_area, "РАЙОН ПОЗИЦІЇ НА ДАТУ ПОДІЇ");
    }

    #[test]
    fn person_context_is_resolved_from_the_saved_plan_at_the_exact_event_time() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO crews(id,name,position_name,reconnaissance_area) VALUES(3,'ГРІМ','ПОТОЧНА ПОЗИЦІЯ','ПОТОЧНИЙ РАЙОН')", []).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,position,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(8,'солдат','ІВАНЕНКО','Іван','оператор','2000-01-01','','','','','','')", []).unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json) VALUES('2026-09-30',1,?1)",
            [r#"{"entries":[{"crewId":3,"actualMemberIds":[8],"startTime":"09:00","arrivesToday":true,"departsToday":true,"departureTime":"12:00","positionName":"ІСТОРИЧНА ПОЗИЦІЯ","positionLocality":"ІСТОРИЧНИЙ РАЙОН","positionMgrs":"36U AA 10000 20000"}]}"#],
        ).unwrap();
        let mut value = draft("Поранення");
        value.personnel_ids = vec![8];
        value.crew_id = Some(999);
        value.position_name = "ПІДМІНЕНА ПОЗИЦІЯ".into();
        value.reconnaissance_area = "ПІДМІНЕНИЙ РАЙОН".into();

        let on_position = prepare_incident_draft(&connection, &value, None, None).unwrap();
        assert_eq!(on_position.crew_id, Some(3));
        assert_eq!(on_position.position_name, "ІСТОРИЧНА ПОЗИЦІЯ");
        assert_eq!(
            on_position.reconnaissance_area,
            "ІСТОРИЧНИЙ РАЙОН · 36U AA 10000 20000"
        );

        value.occurred_at = "2026-09-30T08:59".into();
        let before_arrival = prepare_incident_draft(&connection, &value, None, None).unwrap();
        assert_eq!(before_arrival.crew_id, None);
        assert!(before_arrival.position_name.is_empty());
        assert!(before_arrival.reconnaissance_area.is_empty());

        value.occurred_at = "2026-09-30T12:00".into();
        let after_departure = prepare_incident_draft(&connection, &value, None, None).unwrap();
        assert_eq!(after_departure.crew_id, None);
        assert!(after_departure.position_name.is_empty());
    }

    #[test]
    fn type_specific_required_relations_are_checked_in_the_backend() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();

        assert!(prepare_incident_draft(&connection, &draft("Поранення"), None, None).is_err());
        assert!(prepare_incident_draft(&connection, &draft("Втрата майна"), None, None).is_err());
        assert!(prepare_incident_draft(&connection, &draft("Обстріл"), None, None).is_err());
        assert!(prepare_incident_draft(&connection, &draft("ДТП"), None, None).is_err());
    }

    #[test]
    fn keeps_a_custom_other_name_separate_from_the_canonical_type() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        let mut value = draft("Інший інцидент");
        value.custom_type_name = "Несправність генератора".into();

        let prepared = prepare_incident_draft(&connection, &value, None, None).unwrap();

        assert_eq!(prepared.incident_type, "Інший інцидент");
        assert_eq!(prepared.custom_type_name, "Несправність генератора");
        assert_eq!(prepared.category, "Інше");
        assert_eq!(workflow_template(&prepared.incident_type).steps, BASE_STEPS);
    }

    #[test]
    fn updates_all_draft_relations_but_locks_them_after_registration() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO crews(id,name,position_name,reconnaissance_area) VALUES(3,'ГРІМ','ПОЗИЦІЯ-1','РАЙОН-1')", []).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,position,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(8,'солдат','ІВАНЕНКО','Іван','оператор','2000-01-01','','','','','','')", []).unwrap();
        connection.execute("INSERT INTO equipment(id,category,name,service_code,crew_id) VALUES(5,'communications','Ноутбук','ovtm',3)", []).unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json) VALUES('2026-09-30',1,?1)",
            [r#"{"entries":[{"crewId":3,"actualMemberIds":[8],"startTime":"05:00","positionName":"ПОЗИЦІЯ-1","positionLocality":"РАЙОН-1"}]}"#],
        ).unwrap();
        connection.execute("INSERT INTO incidents(id,incident_type,status,occurred_at) VALUES(1,'Інший інцидент','Чернетка','2026-09-30T09:00')", []).unwrap();
        let mut value = draft("Втрата майна");
        value.crew_id = Some(3);
        value.equipment_ids = vec![5];
        value.personnel_ids = vec![8];
        value.description = "Уточнений опис".into();

        update_incident_draft_record(&mut connection, 1, &value).unwrap();

        let updated = connection.query_row(
            "SELECT incident_type,crew_id,equipment_id,position_name,reconnaissance_area,description FROM incidents WHERE id=1",
            [],
            |row| Ok((row.get::<_,String>(0)?,row.get::<_,Option<i64>>(1)?,row.get::<_,Option<i64>>(2)?,row.get::<_,String>(3)?,row.get::<_,String>(4)?,row.get::<_,String>(5)?)),
        ).unwrap();
        assert_eq!(
            updated,
            (
                "Втрата майна".into(),
                Some(3),
                Some(5),
                "ПОЗИЦІЯ-1".into(),
                "РАЙОН-1".into(),
                "Уточнений опис".into()
            )
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM incident_equipment WHERE incident_id=1",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM incident_personnel WHERE incident_id=1",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );

        connection
            .execute(
                "UPDATE flight_plan_snapshots SET snapshot_json='{\"entries\":[]}' WHERE plan_date='2026-09-30'",
                [],
            )
            .unwrap();
        value.description = "Опис без зміни фактичних зв’язків".into();
        update_incident_draft_record(&mut connection, 1, &value).unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT crew_id,position_name,reconnaissance_area FROM incidents WHERE id=1",
                    [],
                    |row| Ok((
                        row.get::<_, Option<i64>>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?
                    ))
                )
                .unwrap(),
            (Some(3), "ПОЗИЦІЯ-1".into(), "РАЙОН-1".into())
        );

        connection
            .execute("UPDATE incidents SET status='Зареєстровано' WHERE id=1", [])
            .unwrap();
        assert!(update_incident_draft_record(&mut connection, 1, &value).is_err());
    }

    #[test]
    fn archived_incidents_reject_status_and_step_changes() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO incidents(id,incident_type,status,occurred_at,archived_at,archive_reason) VALUES(1,'Поранення','Зареєстровано','2026-09-30T10:00','2026-09-30 11:00:00','Завершено опрацювання')", []).unwrap();
        connection.execute("INSERT INTO incident_steps(id,incident_id,step_order,title,status) VALUES(1,1,1,'Крок','Не розпочато')", []).unwrap();

        assert!(update_incident_status_record(&mut connection, 1, "Опрацьовується", "").is_err());
        assert!(update_incident_step_record(&mut connection, 1, 1, "В роботі", "").is_err());
        assert_eq!(
            connection
                .query_row("SELECT status FROM incidents WHERE id=1", [], |row| row
                    .get::<_, String>(
                    0
                ))
                .unwrap(),
            "Зареєстровано"
        );
        assert_eq!(
            connection
                .query_row("SELECT status FROM incident_steps WHERE id=1", [], |row| {
                    row.get::<_, String>(0)
                })
                .unwrap(),
            "Не розпочато"
        );
    }

    #[test]
    fn startup_keeps_draft_losses_in_the_write_off_register() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO equipment(id,category,name,service_code) VALUES(5,'communications','Ноутбук','ovtm')", []).unwrap();
        connection.execute("INSERT INTO incidents(id,incident_type,status,occurred_at,equipment_id) VALUES(1,'Втрата майна','Чернетка','2026-09-30T10:00',5)", []).unwrap();
        connection
            .execute(
                "INSERT INTO incident_equipment(incident_id,equipment_id) VALUES(1,5)",
                [],
            )
            .unwrap();

        crate::database::initialise(&connection).unwrap();

        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM asset_write_offs WHERE incident_id=1 AND equipment_id=5",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            1
        );
    }

    #[test]
    fn limits_uav_loss_sources_to_the_previous_twenty_four_hours() {
        let now = chrono::NaiveDate::from_ymd_opt(2026, 9, 28)
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap();
        assert!(flight_is_within_last_day("2026-09-27", "12:00", now));
        assert!(flight_is_within_last_day("2026-09-28", "11:59", now));
        assert!(!flight_is_within_last_day("2026-09-27", "11:59", now));
        assert!(!flight_is_within_last_day("2026-09-28", "12:01", now));
        assert!(!flight_is_within_last_day("невірна дата", "12:00", now));
    }

    #[test]
    fn sets_uav_loss_step_deadlines_from_the_incident_time() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO incidents(incident_type,occurred_at) VALUES('Втрата БпЛА','2026-09-28T10:15')",
                [],
            )
            .unwrap();
        let incident_id = connection.last_insert_rowid();

        initialize_incident_workflow(&connection, incident_id, "Втрата БпЛА").unwrap();

        let deadlines = connection
            .prepare("SELECT step_order,due_at FROM incident_steps WHERE incident_id=?1 AND due_at<>'' ORDER BY step_order")
            .unwrap()
            .query_map([incident_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            deadlines,
            vec![
                (1, "2026-09-28T10:15".into()),
                (2, "2026-09-28T11:15".into()),
                (3, "2026-09-29T10:15".into()),
                (5, "2026-09-30T10:15".into()),
                (6, "2026-10-01T10:15".into()),
            ]
        );
    }

    #[test]
    fn every_agreed_incident_type_has_an_initial_algorithm_and_documents() {
        for (incident_type, step_count, document_count) in [
            ("Втрата БпЛА", 8, 4),
            ("Втрата майна", 6, 4),
            ("Втрата військового квитка/посвідчення УБД", 7, 5),
            ("Знищення машини", 7, 2),
            ("Пошкодження машини", 7, 3),
            ("ДТП", 7, 5),
            ("Обстріл", 4, 1),
            ("Знищення позиції", 6, 2),
            ("Поранення", 7, 4),
            ("Загибель", 7, 3),
            ("Травма", 7, 5),
            ("СЗЧ", 11, 6),
            ("Алкогольне/наркотичне сп’яніння", 7, 3),
            ("Самогубство", 5, 6),
            ("Інший інцидент", 3, 2),
        ] {
            let template = workflow_template(incident_type);
            assert_eq!(
                template.steps.len(),
                step_count,
                "wrong step count for {incident_type}"
            );
            assert_eq!(
                template.documents.len(),
                document_count,
                "wrong document count for {incident_type}"
            );
        }
        assert_eq!(
            UAV_LOSS_DOCUMENTS[0],
            ("Позачергове повідомлення", "Так", "copy")
        );
        assert_eq!(SHELLING_DOCUMENTS[0].1, "Ні");
        assert_eq!(POSITION_LOSS_DOCUMENTS[1].1, "Уточнити");
    }

    #[test]
    fn backfills_the_initial_asset_loss_workflow_for_an_existing_incident() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE incidents (
                    id INTEGER PRIMARY KEY,
                    incident_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL DEFAULT '',
                    crew_id INTEGER,
                    equipment_id INTEGER,
                    position_name TEXT NOT NULL DEFAULT '',
                    reconnaissance_area TEXT NOT NULL DEFAULT '',
                    crew_snapshot TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                 );
                 INSERT INTO incidents(id,incident_type,occurred_at,description)
                 VALUES(11,'Втрата майна','2026-09-28T10:00','Втрачено майно');",
            )
            .unwrap();

        crate::database::initialise(&connection).unwrap();

        let first_step = connection
            .query_row(
                "SELECT title FROM incident_steps WHERE incident_id=11 ORDER BY step_order LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        let documents = connection
            .query_row(
                "SELECT COUNT(*) FROM incident_documents WHERE incident_id=11",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap();
        assert_eq!(first_step, "Доповідь командиру");
        assert_eq!(documents, 4);
    }

    #[test]
    fn normalizes_legacy_incident_types_and_keeps_the_previous_name_in_history() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE incidents (
                    id INTEGER PRIMARY KEY,
                    category TEXT NOT NULL DEFAULT 'Майно і транспорт',
                    incident_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL DEFAULT '',
                    crew_id INTEGER,
                    equipment_id INTEGER,
                    position_name TEXT NOT NULL DEFAULT '',
                    reconnaissance_area TEXT NOT NULL DEFAULT '',
                    crew_snapshot TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                 );
                 INSERT INTO incidents(id,incident_type,occurred_at) VALUES
                   (31,'Пошкодження автомобіля','2026-09-01T10:00'),
                   (32,'Несправність генератора','2026-09-02T10:00'),
                   (33,'Алкогольне / наркотичне сп’яніння','2026-09-03T10:00'),
                   (34,'Поранення','2026-09-04T10:00');",
            )
            .unwrap();

        crate::database::initialise(&connection).unwrap();

        let normalized = connection
            .prepare("SELECT id,category,incident_type,custom_type_name FROM incidents ORDER BY id")
            .unwrap()
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            normalized,
            vec![
                (
                    31,
                    "Транспорт".into(),
                    "Пошкодження машини".into(),
                    "".into()
                ),
                (
                    32,
                    "Інше".into(),
                    "Інший інцидент".into(),
                    "Несправність генератора".into()
                ),
                (
                    33,
                    "Особовий склад".into(),
                    "Алкогольне/наркотичне сп’яніння".into(),
                    "".into()
                ),
                (34, "Особовий склад".into(), "Поранення".into(), "".into()),
            ]
        );
        let history = connection
            .query_row(
                "SELECT details FROM incident_history WHERE incident_id=32 AND action='Уточнено тип інциденту'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        assert!(history.contains("Несправність генератора"));
        assert!(history.contains("Інший інцидент"));
    }

    #[test]
    fn restores_a_custom_name_from_history_after_an_older_release_already_normalized_it() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute(
            "INSERT INTO incidents(id,category,incident_type,custom_type_name,status,occurred_at) VALUES(41,'Інше','Інший інцидент','','Чернетка','2026-09-05T10:00')",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO incident_history(incident_id,action,details) VALUES(41,'Уточнено тип інциденту','Попередній тип: Несправність генератора. Новий тип: Інший інцидент.')",
            [],
        ).unwrap();

        normalize_incident_types(&connection).unwrap();

        assert_eq!(
            connection
                .query_row(
                    "SELECT custom_type_name FROM incidents WHERE id=41",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "Несправність генератора"
        );
    }

    #[test]
    fn accepts_multiple_assets_of_the_selected_crew() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(name) VALUES('ГРІМ')", [])
            .unwrap();
        let crew_id = connection.last_insert_rowid();
        for name in ["Mavic", "EcoFlow"] {
            connection
                .execute(
                    "INSERT INTO equipment(category,name,crew_id) VALUES('uav',?1,?2)",
                    rusqlite::params![name, crew_id],
                )
                .unwrap();
        }
        let equipment_ids = connection
            .prepare("SELECT id FROM equipment ORDER BY id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<i64>, _>>()
            .unwrap();
        assert!(
            validate_incident_equipment(&connection, Some(crew_id), &[], &equipment_ids).is_ok()
        );
        assert!(validate_incident_equipment(&connection, None, &[], &equipment_ids).is_err());
    }

    #[test]
    fn keeps_incident_personnel_in_their_selection_order() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE incident_personnel (
                incident_id INTEGER NOT NULL,
                personnel_id INTEGER,
                full_name_snapshot TEXT NOT NULL,
                rank_snapshot TEXT NOT NULL DEFAULT '',
                position_snapshot TEXT NOT NULL DEFAULT '',
                selection_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(incident_id,personnel_id)
             );
             INSERT INTO incident_personnel(incident_id,personnel_id,full_name_snapshot)
             VALUES(7,10,'ДРУГА Особа');
             INSERT INTO incident_personnel(incident_id,personnel_id,full_name_snapshot,selection_order)
             VALUES(7,20,'ПЕРША Особа',0);
             UPDATE incident_personnel SET selection_order=1 WHERE personnel_id=10;",
            )
            .unwrap();

        let (ids, names) = incident_personnel(&connection, 7).unwrap();

        assert_eq!(ids, vec![20, 10]);
        assert_eq!(names, vec!["ПЕРША Особа", "ДРУГА Особа"]);
    }

    #[test]
    fn migrates_existing_incident_personnel_to_an_explicit_order() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE incident_personnel (
                   incident_id INTEGER NOT NULL,
                   personnel_id INTEGER,
                   full_name_snapshot TEXT NOT NULL,
                   rank_snapshot TEXT NOT NULL DEFAULT '',
                   position_snapshot TEXT NOT NULL DEFAULT '',
                   PRIMARY KEY(incident_id,personnel_id)
                 );
                 INSERT INTO incident_personnel(incident_id,personnel_id,full_name_snapshot)
                 VALUES(3,30,'ПЕРША Особа'),(3,10,'ДРУГА Особа');",
            )
            .unwrap();

        crate::database::initialise(&connection).unwrap();
        let (ids, names) = incident_personnel(&connection, 3).unwrap();

        assert_eq!(ids, vec![30, 10]);
        assert_eq!(names, vec!["ПЕРША Особа", "ДРУГА Особа"]);
        let orders = connection
            .prepare(
                "SELECT selection_order FROM incident_personnel WHERE incident_id=3 ORDER BY selection_order",
            )
            .unwrap()
            .query_map([], |row| row.get::<_, i64>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(orders, vec![0, 1]);
    }

    #[test]
    fn reads_historical_personnel_from_the_source_flight_plan() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(4,'ГРІМ')", [])
            .unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json) VALUES(1,'2026-09-12',1,?1)",
            [r#"{"unitName":"РБАК","entries":[{"crewId":4,"startTime":"14:45","actualMemberIds":[41,42],"actualCommanderId":42,"memberSnapshots":[{"personnelId":41,"fullName":"ІВАНЕНКО Іван Іванович","rank":"солдат"},{"personnelId":42,"fullName":"ПЕТРЕНКО Петро Петрович","rank":"сержант"}]}]}"#],
        ).unwrap();
        connection.execute(
            "INSERT INTO flight_journal_entries(id,flight_date,sky_time,crew_id,snapshot_id) VALUES(77,'2026-09-12','14:45',4,1)",
            [],
        ).unwrap();

        let (snapshot, ids, historical) = source_flight_personnel_snapshot(&connection, Some(77));

        assert_eq!(ids, vec![42, 41]);
        assert_eq!(snapshot, "ПЕТРЕНКО Петро Петрович, ІВАНЕНКО Іван Іванович");
        assert_eq!(historical[0].2, "сержант");
    }

    #[test]
    fn prefers_the_frozen_flight_roster_over_a_later_plan_change() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(4,'ГРІМ')", [])
            .unwrap();
        connection.execute(
            "INSERT INTO flight_journal_entries(id,flight_date,sky_time,crew_id,personnel_snapshot_json) VALUES(77,'2026-09-12','14:45',4,?1)",
            [r#"[{"personnelId":42,"fullName":"ПЕТРЕНКО Петро Петрович","rank":"сержант","position":"командир","isCommander":true}]"#],
        ).unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json) VALUES(1,'2026-09-12',1,?1)",
            [r#"{"entries":[{"crewId":4,"startTime":"14:45","actualMemberIds":[99],"actualCommanderId":99,"memberSnapshots":[{"personnelId":99,"fullName":"НОВИЙ Склад","rank":"солдат"}]}]}"#],
        ).unwrap();

        let (snapshot, ids, historical) = source_flight_personnel_snapshot(&connection, Some(77));

        assert_eq!(ids, vec![42]);
        assert_eq!(snapshot, "ПЕТРЕНКО Петро Петрович");
        assert_eq!(historical[0].3, "командир");
    }

    #[test]
    fn uav_loss_uses_the_exact_flight_position_and_frozen_roster() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO crews(id,name,position_name,reconnaissance_area) VALUES(4,'ГРІМ','ПОТОЧНА ПОЗИЦІЯ','ПОТОЧНИЙ РАЙОН')", []).unwrap();
        connection.execute(
            "INSERT INTO positions(id,name,locality,mgrs,crew_id) VALUES(7,'ПОТОЧНА НАЗВА','Нове','38U NEW',4)",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO personnel(id,rank,surname,given_name,position,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES
               (41,'солдат','ІВАНЕНКО','Іван','оператор','2000-01-01','','','','','',''),
               (42,'сержант','ПЕТРЕНКО','Петро','командир','1999-01-01','','','','','',''),
               (99,'солдат','СТОРОННІЙ','Степан','водій','2001-01-01','','','','','','')",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO equipment(id,category,name,service_code,crew_id) VALUES(5,'uav','Vampire','sa_ppo',4)",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json) VALUES(1,'2026-09-12',1,?1)",
            [r#"{"entries":[{"crewId":4,"startTime":"14:45","positionId":7,"positionName":"ІСТОРИЧНА ПОЗИЦІЯ","positionLocality":"Старе","positionMgrs":"38U OLD","actualMemberIds":[41,42],"actualCommanderId":42,"memberSnapshots":[{"personnelId":41,"fullName":"ІВАНЕНКО Іван","rank":"солдат"},{"personnelId":42,"fullName":"ПЕТРЕНКО Петро","rank":"сержант"}]}]}"#],
        ).unwrap();
        connection.execute(
            "INSERT INTO flight_journal_entries(id,flight_date,sky_time,crew_id,crew_name_snapshot,position_id,position_name_snapshot,battle_order_snapshot,work_strip_snapshot,uav_id,uav_name_snapshot,uav_type_snapshot,uav_serial_snapshot,mission,payload_type_snapshot,payload_serial_snapshot,snapshot_id,personnel_snapshot_json) VALUES(77,'2026-09-12','14:45',4,'ГРІМ',7,'ЖУРНАЛЬНА ПОЗИЦІЯ','БРО-7','СМУГА-7',5,'Vampire','Бомбер','UAV-007','Ураження цілі','БК-7','PAYLOAD-7',1,?1)",
            [r#"[{"personnelId":42,"fullName":"ПЕТРЕНКО Петро","rank":"сержант","position":"командир","isCommander":true},{"personnelId":41,"fullName":"ІВАНЕНКО Іван","rank":"солдат","position":"оператор","isCommander":false}]"#],
        ).unwrap();
        let mut value = draft("Втрата БпЛА");
        value.source_flight_id = Some(77);
        value.personnel_ids = vec![99];
        value.event_data = serde_json::json!({
            "uavName": "Підмінений БпЛА",
            "uavSerialNumber": "Підмінений номер",
            "explanations": [
                {"personId": 41, "text": "Перше пояснення"},
                {"personId": 42, "text": "Друге пояснення"}
            ]
        });

        let prepared = prepare_incident_draft(&connection, &value, Some(77), None).unwrap();
        let personnel_ids = prepared
            .personnel
            .iter()
            .filter_map(|(personnel_id, _, _, _)| *personnel_id)
            .collect::<Vec<_>>();

        assert_eq!(prepared.position_name, "ІСТОРИЧНА ПОЗИЦІЯ");
        assert_eq!(prepared.reconnaissance_area, "Старе · 38U OLD");
        assert_eq!(personnel_ids, vec![42, 41]);
        assert!(!personnel_ids.contains(&99));
        let event_data: serde_json::Value =
            serde_json::from_str(&prepared.event_data_json).unwrap();
        assert_eq!(event_data["uavName"], "Vampire");
        assert_eq!(event_data["uavType"], "Бомбер");
        assert_eq!(event_data["uavSerialNumber"], "UAV-007");
        assert_eq!(event_data["battleOrder"], "БРО-7");
        assert_eq!(event_data["workStrip"], "СМУГА-7");
        assert_eq!(event_data["payloadSerialNumber"], "PAYLOAD-7");

        connection
            .execute("DELETE FROM crews WHERE id=4", [])
            .unwrap();
        let without_current_crew =
            prepare_incident_draft(&connection, &value, Some(77), None).unwrap();
        assert_eq!(without_current_crew.crew_id, None);
        assert_eq!(without_current_crew.position_name, "ІСТОРИЧНА ПОЗИЦІЯ");
        assert_eq!(without_current_crew.reconnaissance_area, "Старе · 38U OLD");
        assert_eq!(
            without_current_crew.crew_snapshot,
            "ПЕТРЕНКО Петро, ІВАНЕНКО Іван"
        );
    }

    #[test]
    fn first_transition_out_of_a_legacy_draft_revalidates_required_relations() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute(
            "INSERT INTO incidents(id,category,incident_type,status,occurred_at,event_data_json) VALUES(1,'Особовий склад','Поранення','Чернетка','2026-09-30T10:00','{}')",
            [],
        ).unwrap();

        let error =
            update_incident_status_record(&mut connection, 1, "Зареєстровано", "").unwrap_err();
        assert!(error.contains("оберіть одного військовослужбовця"));
        assert_eq!(
            connection
                .query_row("SELECT status FROM incidents WHERE id=1", [], |row| {
                    row.get::<_, String>(0)
                })
                .unwrap(),
            "Чернетка"
        );

        connection.execute(
            "INSERT INTO personnel(id,rank,surname,given_name,position,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(41,'солдат','ІВАНЕНКО','Іван','стрілець','2000-01-01','','','','','','')",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO incident_personnel(incident_id,personnel_id,full_name_snapshot,rank_snapshot,position_snapshot,selection_order) VALUES(1,41,'ІВАНЕНКО Іван','солдат','стрілець',0)",
            [],
        ).unwrap();

        update_incident_status_record(&mut connection, 1, "Зареєстровано", "").unwrap();
        assert_eq!(
            connection
                .query_row("SELECT status FROM incidents WHERE id=1", [], |row| {
                    row.get::<_, String>(0)
                })
                .unwrap(),
            "Зареєстровано"
        );
    }

    #[test]
    fn upgrades_an_existing_uav_loss_without_deleting_its_fact() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE incidents (
                id INTEGER PRIMARY KEY,
                incident_type TEXT NOT NULL,
                occurred_at TEXT NOT NULL DEFAULT '',
                crew_id INTEGER,
                equipment_id INTEGER,
                position_name TEXT NOT NULL DEFAULT '',
                reconnaissance_area TEXT NOT NULL DEFAULT '',
                crew_snapshot TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
             );
             INSERT INTO incidents(id,incident_type,occurred_at,position_name,description)
             VALUES(9,'Втрата БпЛА','2026-09-12T14:45','ПОЗИЦІЯ-1','Історичний опис');",
            )
            .unwrap();

        crate::database::initialise(&connection).unwrap();

        let record = connection.query_row(
            "SELECT status,occurred_at,position_name,description,event_data_json FROM incidents WHERE id=9",
            [],
            |row| Ok((row.get::<_, String>(0)?,row.get::<_, String>(1)?,row.get::<_, String>(2)?,row.get::<_, String>(3)?,row.get::<_, String>(4)?)),
        ).unwrap();
        assert_eq!(
            record,
            (
                "Чернетка".into(),
                "2026-09-12T14:45".into(),
                "ПОЗИЦІЯ-1".into(),
                "Історичний опис".into(),
                "{}".into(),
            )
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM incident_steps WHERE incident_id=9",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            8
        );
        let deadlines = connection
            .prepare("SELECT step_order,due_at FROM incident_steps WHERE incident_id=9 AND due_at<>'' ORDER BY step_order")
            .unwrap()
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            deadlines,
            vec![
                (1, "2026-09-12T14:45".into()),
                (2, "2026-09-12T15:45".into()),
                (3, "2026-09-13T14:45".into()),
                (5, "2026-09-14T14:45".into()),
                (6, "2026-09-15T14:45".into()),
            ]
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM incident_documents WHERE incident_id=9",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            4
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM incident_history WHERE incident_id=9",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
    }

    #[test]
    fn replaces_the_old_pristine_uav_workflow_with_the_agreed_table() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO incidents(id,incident_type,occurred_at) VALUES(21,'Втрата БпЛА','2026-09-28T10:15')",
                [],
            )
            .unwrap();
        for (order, title) in [
            (1, "Негайна доповідь черговому/командиру"),
            (2, "Першочергове донесення"),
            (3, "Позатермінове донесення"),
            (4, "Рапорт на втрату"),
            (5, "Передача матеріалів для списання"),
            (6, "Закриття інциденту"),
        ] {
            connection
                .execute(
                    "INSERT INTO incident_steps(incident_id,step_order,title) VALUES(21,?1,?2)",
                    rusqlite::params![order, title],
                )
                .unwrap();
        }
        for title in [
            "Першочергове донесення",
            "Позатермінове донесення",
            "Рапорт на втрату",
        ] {
            connection
                .execute(
                    "INSERT INTO incident_documents(incident_id,document_type) VALUES(21,?1)",
                    [title],
                )
                .unwrap();
        }

        initialize_all_incident_workflows(&connection).unwrap();

        let step_titles = connection
            .prepare("SELECT title FROM incident_steps WHERE incident_id=21 ORDER BY step_order")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(step_titles.len(), 8);
        assert_eq!(step_titles[0], "Доповідь командиру та черговому");
        assert_eq!(
            step_titles[7],
            "Списання борта і виключення його зі списків обліку підрозділу"
        );
        let documents = connection
            .prepare("SELECT document_type,requirement,action_kind FROM incident_documents WHERE incident_id=21 ORDER BY id")
            .unwrap()
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(documents.len(), 4);
        assert_eq!(
            documents[0],
            (
                "Позачергове повідомлення".into(),
                "Так".into(),
                "copy".into()
            )
        );
    }
}
