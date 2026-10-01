use crate::{settings, AppState};
use chrono::{Datelike, Duration, Local, LocalResult, NaiveDate, NaiveTime, TimeZone, Utc};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::File,
    io::{Cursor, Read, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

#[allow(dead_code)]
pub const PAYMENT_STATUSES: [&str; 23] = [
    "БР",
    "РЕКО",
    "ОБЛ",
    "10",
    "ОХОР",
    "КОН",
    "ІСВ",
    "МЕД",
    "30Б",
    "30",
    "АЛКО",
    "500",
    "5 рота",
    "Вибув",
    "ППД",
    "Відп.",
    "НАВ",
    "ШП",
    "ЛІК",
    "СЗЧ",
    "ВЛК",
    "БЗВП",
    "Від-ня",
];

const MANUAL_PAYMENT_STATUSES: [&str; 5] = ["БР", "БР30", "30Б", "30", "ПУСТО"];
const DUTY_REPORT_TEMPLATE: &[u8] =
    include_bytes!("../resources/payments-duty-report-template.xlsx");
const TEN_K_REPORT_TEMPLATE: &[u8] =
    include_bytes!("../resources/payments-10k-report-template.xlsx");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentDailyStatus {
    personnel_id: i64,
    status_date: String,
    status: String,
    report_code: String,
    tone: String,
    actual_location: String,
    source_details: String,
    manual_override: Option<String>,
}

#[derive(Debug, Clone)]
struct AutoFact {
    status: &'static str,
    report_code: &'static str,
    tone: &'static str,
    actual_location: String,
    source_details: String,
    priority: u16,
}

#[derive(Debug, Clone, Default)]
struct FlightPlanCrewContext {
    crew_name: String,
    position_name: String,
}

#[derive(Debug, Clone)]
struct FlightFactDetail {
    crew_name: String,
    position_name: String,
    sky_time: String,
}

impl AutoFact {
    fn default() -> Self {
        Self {
            status: "30",
            report_code: "30",
            tone: "white",
            actual_location: "Даних немає".into(),
            source_details: "За цей день немає даних у пов’язаних розділах.".into(),
            priority: 0,
        }
    }

    fn manual(status: &str) -> Self {
        match status {
            "БР" => Self {
                status: "БР",
                report_code: "100",
                tone: "green",
                actual_location: String::new(),
                source_details: String::new(),
                priority: u16::MAX,
            },
            "БР30" => Self {
                status: "БР",
                report_code: "30",
                tone: "yellow",
                actual_location: String::new(),
                source_details: String::new(),
                priority: u16::MAX,
            },
            "30Б" => Self {
                status: "30Б",
                report_code: "30У",
                tone: "blue",
                actual_location: String::new(),
                source_details: String::new(),
                priority: u16::MAX,
            },
            "ПУСТО" => Self {
                status: "",
                report_code: "",
                tone: "empty",
                actual_location: String::new(),
                source_details: String::new(),
                priority: u16::MAX,
            },
            _ => Self {
                status: "30",
                report_code: "30",
                tone: "white",
                actual_location: String::new(),
                source_details: String::new(),
                priority: u16::MAX,
            },
        }
    }
}

#[derive(Debug, Clone)]
struct DailyReportValue {
    report_code: String,
}

#[derive(Debug, Clone)]
struct PersonMonth {
    rank: String,
    full_name: String,
    tax_id: String,
    statuses: BTreeMap<NaiveDate, DailyReportValue>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ReportLine {
    rank: String,
    full_name: String,
    tax_id: String,
    starts: Vec<NaiveDate>,
    ends: Vec<NaiveDate>,
}

fn validate_month(month: &str) -> Result<(i32, u32), String> {
    let date = NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d")
        .map_err(|_| "Місяць має бути у форматі РРРР-ММ.".to_string())?;
    Ok((date.year(), date.month()))
}

fn validate_status_date(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| "Дата статусу має бути у форматі РРРР-ММ-ДД.".to_string())
}

fn month_bounds(month: &str) -> Result<(NaiveDate, NaiveDate), String> {
    let (year, month_number) = validate_month(month)?;
    let start = NaiveDate::from_ymd_opt(year, month_number, 1)
        .ok_or_else(|| "Некоректний місяць виплат.".to_string())?;
    let next = if month_number == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month_number + 1, 1)
    }
    .ok_or_else(|| "Некоректний місяць виплат.".to_string())?;
    Ok((start, next - Duration::days(1)))
}

fn dates_between(start: NaiveDate, end: NaiveDate) -> impl Iterator<Item = NaiveDate> {
    (0..=(end - start).num_days()).map(move |offset| start + Duration::days(offset))
}

fn table_has_column(connection: &Connection, table: &str, column: &str) -> bool {
    let Ok(mut statement) = connection.prepare(&format!("PRAGMA table_info({table})")) else {
        return false;
    };
    statement
        .query_map([], |row| row.get::<_, String>(1))
        .ok()
        .is_some_and(|rows| rows.filter_map(Result::ok).any(|name| name == column))
}

fn append_fact(
    facts: &mut HashMap<(i64, NaiveDate), AutoFact>,
    personnel_id: i64,
    date: NaiveDate,
    next: AutoFact,
) {
    use std::collections::hash_map::Entry;
    match facts.entry((personnel_id, date)) {
        Entry::Vacant(entry) => {
            entry.insert(next);
        }
        Entry::Occupied(mut entry) if next.priority > entry.get().priority => {
            entry.insert(next);
        }
        Entry::Occupied(mut entry)
            if next.priority == entry.get().priority
                && next.status == entry.get().status
                && next.report_code == entry.get().report_code =>
        {
            let current = entry.get_mut();
            if !current.source_details.contains(&next.source_details) {
                current.source_details.push('\n');
                current.source_details.push_str(&next.source_details);
            }
            if !current.actual_location.contains(&next.actual_location) {
                current.actual_location.push_str("; ");
                current.actual_location.push_str(&next.actual_location);
            }
        }
        Entry::Occupied(_) => {}
    }
}

fn frozen_personnel_ids(value: &str) -> Vec<i64> {
    serde_json::from_str::<Vec<serde_json::Value>>(value)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|member| member.get("personnelId").and_then(|id| id.as_i64()))
        .collect()
}

fn text_from_json(value: &serde_json::Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn current_crew_context(connection: &Connection, crew_id: i64) -> FlightPlanCrewContext {
    connection
        .query_row(
            "SELECT c.name,COALESCE(NULLIF(p.name,''),c.position_name,'')
             FROM crews c
             LEFT JOIN positions p ON p.id=c.position_id
             WHERE c.id=?1",
            [crew_id],
            |row| {
                Ok(FlightPlanCrewContext {
                    crew_name: row.get::<_, String>(0)?,
                    position_name: row.get::<_, String>(1)?,
                })
            },
        )
        .unwrap_or_default()
}

fn plan_snapshot_for_date(connection: &Connection, date: NaiveDate) -> Option<serde_json::Value> {
    let date_text = date.format("%Y-%m-%d").to_string();
    let snapshot = connection
        .query_row(
            "SELECT snapshot_json FROM flight_plan_snapshots
             WHERE plan_date=?1 ORDER BY revision DESC,id DESC LIMIT 1",
            [&date_text],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .or_else(|| {
            connection
                .query_row(
                    "SELECT snapshot_json FROM flight_plan_snapshots
                     WHERE plan_date=?1 ORDER BY revision DESC,id DESC LIMIT 1",
                    [(date + Duration::days(1)).format("%Y-%m-%d").to_string()],
                    |row| row.get::<_, String>(0),
                )
                .ok()
        })?;
    serde_json::from_str(&snapshot).ok()
}

fn plan_crew_contexts(
    connection: &Connection,
    date: NaiveDate,
) -> HashMap<i64, FlightPlanCrewContext> {
    let mut contexts = HashMap::<i64, FlightPlanCrewContext>::new();
    if let Some(snapshot) = plan_snapshot_for_date(connection, date) {
        if let Some(entries) = snapshot.get("entries").and_then(|value| value.as_array()) {
            for entry in entries {
                let Some(crew_id) = entry.get("crewId").and_then(|value| value.as_i64()) else {
                    continue;
                };
                let next_crew_name = text_from_json(entry, "crewName");
                let next_position_name = text_from_json(entry, "positionName");
                let context = contexts.entry(crew_id).or_default();
                if context.crew_name.trim().is_empty() && !next_crew_name.is_empty() {
                    context.crew_name = next_crew_name;
                }
                if context.position_name.trim().is_empty() && !next_position_name.is_empty() {
                    context.position_name = next_position_name;
                }
            }
        }
    }
    for (crew_id, context) in &mut contexts {
        let current = current_crew_context(connection, *crew_id);
        if context.crew_name.trim().is_empty() {
            context.crew_name = current.crew_name;
        }
        if context.position_name.trim().is_empty() {
            context.position_name = current.position_name;
        }
    }
    contexts
}

fn saved_plan_snapshot_for_flight(
    connection: &Connection,
    snapshot_id: Option<i64>,
    flight_date: &str,
    crew_id: i64,
) -> Option<String> {
    let snapshot = if let Some(snapshot_id) = snapshot_id {
        connection
            .query_row(
                "SELECT snapshot_json FROM flight_plan_snapshots
                 WHERE id=?1 AND plan_date=?2",
                params![snapshot_id, flight_date],
                |row| row.get::<_, String>(0),
            )
            .ok()
    } else {
        connection
            .query_row(
                "SELECT snapshot_json FROM flight_plan_snapshots
                 WHERE plan_date=?1 ORDER BY revision DESC,id DESC LIMIT 1",
                [flight_date],
                |row| row.get::<_, String>(0),
            )
            .ok()
    }?;
    let parsed = serde_json::from_str::<serde_json::Value>(&snapshot).ok()?;
    parsed
        .get("entries")
        .and_then(|value| value.as_array())
        .is_some_and(|entries| {
            entries
                .iter()
                .any(|entry| entry.get("crewId").and_then(|value| value.as_i64()) == Some(crew_id))
        })
        .then_some(snapshot)
}

fn crew_context_from_saved_plan_for_flight(
    connection: &Connection,
    snapshot_id: Option<i64>,
    flight_date: &str,
    crew_id: i64,
) -> Option<FlightPlanCrewContext> {
    let snapshot = saved_plan_snapshot_for_flight(connection, snapshot_id, flight_date, crew_id)?;
    let parsed = serde_json::from_str::<serde_json::Value>(&snapshot).ok()?;
    let mut context = FlightPlanCrewContext::default();
    for entry in parsed.get("entries")?.as_array()? {
        if entry.get("crewId").and_then(|value| value.as_i64()) != Some(crew_id) {
            continue;
        }
        if context.crew_name.is_empty() {
            context.crew_name = text_from_json(entry, "crewName");
        }
        if context.position_name.is_empty() {
            context.position_name = text_from_json(entry, "positionName");
        }
        if !context.crew_name.is_empty() && !context.position_name.is_empty() {
            break;
        }
    }
    Some(context)
}

fn personnel_ids_from_saved_plan_at_sky_time(
    connection: &Connection,
    snapshot_id: Option<i64>,
    flight_date: &str,
    crew_id: Option<i64>,
    sky_time: &str,
) -> Option<Vec<i64>> {
    let crew_id = crew_id?;
    let snapshot = saved_plan_snapshot_for_flight(connection, snapshot_id, flight_date, crew_id)?;
    let sky = NaiveTime::parse_from_str(sky_time, "%H:%M").ok()?;
    let schedule = crate::flight_plan::flight_plan_location_schedule_from_saved_snapshot(&snapshot)
        .ok()?
        .into_iter()
        .find(|schedule| schedule.crew_id == crew_id)?;
    let Some(first) = schedule.stages.first() else {
        return Some(Vec::new());
    };
    if schedule.arrives_on_plan_date
        && NaiveTime::parse_from_str(&first.start_time, "%H:%M")
            .ok()
            .is_some_and(|arrival| sky < arrival)
    {
        return Some(Vec::new());
    }
    if schedule.departs_on_plan_date
        && NaiveTime::parse_from_str(&schedule.departure_time, "%H:%M")
            .ok()
            .is_some_and(|departure| sky >= departure)
    {
        return Some(Vec::new());
    }
    let mut personnel_ids = first.member_ids.clone();
    for stage in schedule.stages.iter().skip(1) {
        if NaiveTime::parse_from_str(&stage.start_time, "%H:%M")
            .ok()
            .is_some_and(|change_time| change_time <= sky)
        {
            personnel_ids = stage.member_ids.clone();
        }
    }
    personnel_ids.sort_unstable();
    personnel_ids.dedup();
    Some(personnel_ids)
}

fn local_flight_time_as_utc(flight_date: &str, sky_time: &str) -> Option<String> {
    let date = NaiveDate::parse_from_str(flight_date, "%Y-%m-%d").ok()?;
    let time = NaiveTime::parse_from_str(sky_time, "%H:%M").ok()?;
    let local = match Local.from_local_datetime(&date.and_time(time)) {
        LocalResult::Single(value) => value,
        // The journal does not store a UTC offset, so guessing during a DST
        // overlap or gap could grant a payment to the wrong crew composition.
        LocalResult::Ambiguous(_, _) | LocalResult::None => return None,
    };
    Some(
        local
            .with_timezone(&Utc)
            .format("%Y-%m-%d %H:%M:%S")
            .to_string(),
    )
}

fn personnel_ids_from_crew_history_at_sky_time(
    connection: &Connection,
    flight_date: &str,
    crew_id: Option<i64>,
    sky_time: &str,
) -> Vec<i64> {
    let Some(crew_id) = crew_id else {
        return Vec::new();
    };
    let Some(flight_at) = local_flight_time_as_utc(flight_date, sky_time) else {
        return Vec::new();
    };
    let Ok(mut statement) = connection.prepare(
        "SELECT DISTINCT cm.personnel_id
         FROM crew_members cm
         JOIN personnel p ON p.id=cm.personnel_id
         WHERE cm.crew_id=?1
           AND datetime(substr(cm.joined_at,1,19))<=datetime(?2)
           AND (cm.left_at IS NULL OR trim(cm.left_at)='' OR datetime(substr(cm.left_at,1,19))>datetime(?2))
         ORDER BY cm.personnel_id",
    ) else {
        return Vec::new();
    };
    let Ok(rows) = statement.query_map(params![crew_id, flight_at], |row| row.get::<_, i64>(0))
    else {
        return Vec::new();
    };
    rows.filter_map(Result::ok).collect()
}

fn named_location(crew_name: &str, position_name: &str) -> String {
    match (crew_name.trim(), position_name.trim()) {
        (crew, position) if !crew.is_empty() && !position.is_empty() => {
            format!("Позиція «{position}» · екіпаж «{crew}»")
        }
        (_, position) if !position.is_empty() => format!("Позиція «{position}»"),
        (crew, _) if !crew.is_empty() => format!("Екіпаж «{crew}»"),
        _ => "На позиції".into(),
    }
}

fn flight_detail_line(crew_name: &str, position_name: &str, sky_times: &[String]) -> String {
    let context = match (crew_name.trim(), position_name.trim()) {
        (crew, position) if !crew.is_empty() && !position.is_empty() => {
            format!("Екіпаж «{crew}», позиція «{position}»")
        }
        (_, position) if !position.is_empty() => format!("Позиція «{position}»"),
        (crew, _) if !crew.is_empty() => format!("Екіпаж «{crew}»"),
        _ => "Пов’язаний запис журналу польотів".into(),
    };
    format!("{context}: час «Небо» {}.", sky_times.join(", "))
}

fn add_disciplinary_facts(
    connection: &Connection,
    month: &str,
    start: NaiveDate,
    end: NaiveDate,
    facts: &mut HashMap<(i64, NaiveDate), AutoFact>,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(
            "SELECT ip.personnel_id,i.incident_type,i.occurred_at
             FROM incidents i
             JOIN incident_personnel ip ON ip.incident_id=i.id AND ip.selection_order=0
             WHERE substr(i.occurred_at,1,7)=?1
               AND i.incident_type IN ('СЗЧ','Алкогольне/наркотичне сп’яніння','Алкогольне / наркотичне сп’яніння')
               AND i.status<>'Скасовано'
               AND ip.personnel_id IS NOT NULL
             ORDER BY i.occurred_at,i.id",
        )
        .map_err(|_| "Не вдалося прочитати дисциплінарні інциденти для виплат.".to_string())?;
    let rows = statement
        .query_map([month], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати дисциплінарні інциденти для виплат.".to_string())?;
    for row in rows {
        let (personnel_id, incident_type, occurred_at) =
            row.map_err(|_| "Не вдалося прочитати дисциплінарний інцидент.".to_string())?;
        let is_szch = incident_type.trim() == "СЗЧ";
        for date in dates_between(start, end) {
            append_fact(
                facts,
                personnel_id,
                date,
                AutoFact {
                    status: if is_szch { "СЗЧ" } else { "АЛКО" },
                    report_code: "Д",
                    tone: "danger",
                    actual_location: "Дисциплінарний інцидент".into(),
                    source_details: format!(
                        "{} від {}. Статус застосовано до всього місяця події.",
                        incident_type,
                        occurred_at.replace('T', " ")
                    ),
                    priority: 1_000,
                },
            );
        }
    }
    Ok(())
}

fn add_flight_facts(
    connection: &Connection,
    month: &str,
    facts: &mut HashMap<(i64, NaiveDate), AutoFact>,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(
            "SELECT flight_date,sky_time,crew_id,snapshot_id,crew_name_snapshot,
                    position_name_snapshot,personnel_snapshot_json
             FROM flight_journal_entries
             WHERE substr(flight_date,1,7)=?1 AND trim(sky_time)<>''
             ORDER BY flight_date,sky_time,id",
        )
        .map_err(|_| "Не вдалося прочитати журнал польотів для виплат.".to_string())?;
    let rows = statement
        .query_map([month], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<i64>>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати журнал польотів для виплат.".to_string())?;
    let mut grouped = HashMap::<(i64, NaiveDate), Vec<FlightFactDetail>>::new();
    let mut contexts_by_date = HashMap::<NaiveDate, HashMap<i64, FlightPlanCrewContext>>::new();
    for row in rows {
        let (
            date,
            sky_time,
            crew_id,
            snapshot_id,
            mut crew_name,
            mut position_name,
            personnel_json,
        ) = row.map_err(|_| "Не вдалося прочитати запис польоту для виплат.".to_string())?;
        let Ok(date) = validate_status_date(&date) else {
            continue;
        };
        if (crew_name.trim().is_empty() || position_name.trim().is_empty()) && crew_id.is_some() {
            let context = crew_id
                .and_then(|id| {
                    crew_context_from_saved_plan_for_flight(
                        connection,
                        snapshot_id,
                        &date.format("%Y-%m-%d").to_string(),
                        id,
                    )
                })
                .or_else(|| {
                    let contexts = contexts_by_date
                        .entry(date)
                        .or_insert_with(|| plan_crew_contexts(connection, date));
                    crew_id.and_then(|id| contexts.get(&id).cloned())
                })
                .or_else(|| crew_id.map(|id| current_crew_context(connection, id)))
                .unwrap_or_default();
            if crew_name.trim().is_empty() {
                crew_name = context.crew_name;
            }
            if position_name.trim().is_empty() {
                position_name = context.position_name;
            }
        }
        let mut personnel_ids = frozen_personnel_ids(&personnel_json);
        if personnel_ids.is_empty() {
            let plan_personnel_ids = personnel_ids_from_saved_plan_at_sky_time(
                connection,
                snapshot_id,
                &date.format("%Y-%m-%d").to_string(),
                crew_id,
                &sky_time,
            );
            personnel_ids = match plan_personnel_ids {
                Some(personnel_ids) => personnel_ids,
                None => personnel_ids_from_crew_history_at_sky_time(
                    connection,
                    &date.format("%Y-%m-%d").to_string(),
                    crew_id,
                    &sky_time,
                ),
            };
        }
        personnel_ids.sort_unstable();
        personnel_ids.dedup();
        for personnel_id in personnel_ids {
            grouped
                .entry((personnel_id, date))
                .or_default()
                .push(FlightFactDetail {
                    crew_name: crew_name.trim().to_string(),
                    position_name: position_name.trim().to_string(),
                    sky_time: sky_time.trim().to_string(),
                });
        }
    }
    for ((personnel_id, date), mut flights) in grouped {
        flights.sort_by(|left, right| {
            left.sky_time
                .cmp(&right.sky_time)
                .then_with(|| left.crew_name.cmp(&right.crew_name))
                .then_with(|| left.position_name.cmp(&right.position_name))
        });
        let flight_count = flights.len();
        let mut locations = Vec::<String>::new();
        let mut by_context = BTreeMap::<(String, String), Vec<String>>::new();
        for flight in flights {
            let location = named_location(&flight.crew_name, &flight.position_name);
            if !locations.contains(&location) {
                locations.push(location);
            }
            by_context
                .entry((flight.crew_name, flight.position_name))
                .or_default()
                .push(flight.sky_time);
        }
        let detail_lines = by_context
            .into_iter()
            .map(|((crew_name, position_name), sky_times)| {
                flight_detail_line(&crew_name, &position_name, &sky_times)
            })
            .collect::<Vec<_>>();
        append_fact(
            facts,
            personnel_id,
            date,
            AutoFact {
                status: "БР",
                report_code: "100",
                tone: "green",
                actual_location: locations.join("; "),
                source_details: format!(
                    "Польотів за день: {flight_count}.\n{}",
                    detail_lines.join("\n")
                ),
                priority: 900,
            },
        );
    }
    Ok(())
}

fn add_position_presence_facts(
    connection: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    facts: &mut HashMap<(i64, NaiveDate), AutoFact>,
) -> Result<(), String> {
    for date in dates_between(start, end) {
        let date_text = date.format("%Y-%m-%d").to_string();
        if let Ok(Some(schedules)) =
            crate::flight_plan::flight_plan_location_schedule(connection, &date_text)
        {
            let mut contexts = plan_crew_contexts(connection, date);
            for schedule in schedules {
                let context = contexts
                    .remove(&schedule.crew_id)
                    .unwrap_or_else(|| current_crew_context(connection, schedule.crew_id));
                let location = named_location(&context.crew_name, &context.position_name);
                let source_details = match (
                    context.crew_name.trim(),
                    context.position_name.trim(),
                ) {
                    (crew, position) if !crew.is_empty() && !position.is_empty() => format!(
                        "Екіпаж «{crew}» перебував на позиції «{position}» за збереженим планом польотів; фактичний політ цієї особи за день не зафіксовано."
                    ),
                    (crew, _) if !crew.is_empty() => format!(
                        "Екіпаж «{crew}» перебував на позиції за збереженим планом польотів; фактичний політ цієї особи за день не зафіксовано."
                    ),
                    (_, position) if !position.is_empty() => format!(
                        "Перебування на позиції «{position}» підтверджено збереженим планом польотів; фактичний політ цієї особи за день не зафіксовано."
                    ),
                    _ => "Перебування на позиції підтверджено збереженим планом польотів; фактичний політ цієї особи за день не зафіксовано.".into(),
                };
                let members = schedule
                    .stages
                    .into_iter()
                    .flat_map(|stage| stage.member_ids)
                    .collect::<HashSet<_>>();
                for personnel_id in members {
                    append_fact(
                        facts,
                        personnel_id,
                        date,
                        AutoFact {
                            status: "БР",
                            report_code: "30",
                            tone: "yellow",
                            actual_location: location.clone(),
                            source_details: source_details.clone(),
                            priority: 600,
                        },
                    );
                }
            }
        }
    }
    Ok(())
}

fn add_position_work_facts(
    connection: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    facts: &mut HashMap<(i64, NaiveDate), AutoFact>,
) -> Result<(), String> {
    if !table_has_column(connection, "position_work_events", "members_json") {
        return Ok(());
    }
    let in_bro = if table_has_column(connection, "position_work_events", "in_bro") {
        "COALESCE(event.in_bro,0)"
    } else {
        "0"
    };
    let query = format!(
        "SELECT event.work_id,event.work_type,event.position_name,{in_bro},event.members_json,
                event.start_date,event.start_time,event.end_date,event.end_time
         FROM position_work_events event
         JOIN (
            SELECT work_id,MAX(id) AS latest_id
            FROM position_work_events
            GROUP BY work_id
         ) latest ON latest.latest_id=event.id
         WHERE date(event.start_date)<=date(?2)
           AND (trim(event.end_date)='' OR date(event.end_date)>=date(?1))
         ORDER BY event.start_date,event.start_time,event.id"
    );
    let mut statement = connection
        .prepare(&query)
        .map_err(|_| "Не вдалося прочитати роботи на позиціях для виплат.".to_string())?;
    let rows = statement
        .query_map(
            params![
                start.format("%Y-%m-%d").to_string(),
                end.format("%Y-%m-%d").to_string()
            ],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)? != 0,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                ))
            },
        )
        .map_err(|_| "Не вдалося прочитати роботи на позиціях для виплат.".to_string())?;
    for row in rows {
        let (
            _work_id,
            work_type,
            position,
            in_bro,
            members_json,
            work_start_date,
            work_start_time,
            work_end_date,
            work_end_time,
        ) = row.map_err(|_| "Не вдалося прочитати період робіт на позиції.".to_string())?;
        let Ok(members) = serde_json::from_str::<Vec<serde_json::Value>>(&members_json) else {
            continue;
        };
        for member in members {
            let Some(personnel_id) = member
                .get("personnelId")
                .or_else(|| member.get("personnel_id"))
                .and_then(|value| value.as_i64())
            else {
                continue;
            };
            let duty = member
                .get("dutyType")
                .or_else(|| member.get("duty_type"))
                .and_then(|value| value.as_str())
                .unwrap_or(work_type.trim());
            let start_date = member
                .get("startDate")
                .or_else(|| member.get("start_date"))
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(&work_start_date);
            let start_time = member
                .get("startTime")
                .or_else(|| member.get("start_time"))
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(&work_start_time);
            let end_date = member
                .get("endDate")
                .or_else(|| member.get("end_date"))
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(&work_end_date);
            let end_time = member
                .get("endTime")
                .or_else(|| member.get("end_time"))
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(&work_end_time);
            let Ok(period_start) = validate_status_date(start_date) else {
                continue;
            };
            let period_end = if end_date.trim().is_empty() {
                end
            } else if let Ok(value) = validate_status_date(end_date) {
                value
            } else {
                continue;
            };
            let effective_start = period_start.max(start);
            let effective_end = period_end.min(end);
            if effective_start > effective_end {
                continue;
            }
            let location = if position.trim().is_empty() {
                duty.trim().to_string()
            } else {
                format!("{} · позиція «{}»", duty.trim(), position.trim())
            };
            for date in dates_between(effective_start, effective_end) {
                append_fact(
                    facts,
                    personnel_id,
                    date,
                    AutoFact {
                        status: "БР",
                        report_code: if in_bro { "100" } else { "30" },
                        tone: if in_bro { "green" } else { "yellow" },
                        actual_location: location.clone(),
                        source_details: format!(
                            "{}: {} {} — {} {}. {}",
                            work_type.trim(),
                            start_date,
                            start_time,
                            if end_date.trim().is_empty() {
                                "дотепер"
                            } else {
                                end_date
                            },
                            end_time,
                            if in_bro {
                                "Входить в БРО."
                            } else {
                                "Не входить в БРО."
                            }
                        ),
                        priority: if in_bro { 800 } else { 500 },
                    },
                );
            }
        }
    }
    Ok(())
}

fn add_ksp_facts(
    connection: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    ksp_in_bro: bool,
    facts: &mut HashMap<(i64, NaiveDate), AutoFact>,
) -> Result<(), String> {
    let query_start = (start - Duration::days(1)).format("%Y-%m-%d").to_string();
    let query_end = (end + Duration::days(1)).format("%Y-%m-%d").to_string();
    let mut statement = connection
        .prepare(
            "SELECT manual_json FROM summary_report_drafts
             WHERE date(report_date)>=date(?1) AND date(report_date)<=date(?2)
             ORDER BY report_date",
        )
        .map_err(|_| "Не вдалося прочитати чергування КСП для виплат.".to_string())?;
    let rows = statement
        .query_map(params![query_start, query_end], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|_| "Не вдалося прочитати чергування КСП для виплат.".to_string())?;
    for row in rows {
        let json = row.map_err(|_| "Не вдалося прочитати чергування КСП.".to_string())?;
        let Ok(manual) = serde_json::from_str::<serde_json::Value>(&json) else {
            continue;
        };
        for (field, label) in [
            ("commandDuties", "Управління боєм на КСП"),
            ("guardDuties", "Охорона та оборона КСП"),
        ] {
            let Some(duties) = manual.get(field).and_then(|value| value.as_array()) else {
                continue;
            };
            for duty in duties {
                let Some(personnel_id) = duty.get("personnelId").and_then(|value| value.as_i64())
                else {
                    continue;
                };
                let Some(periods) = duty.get("periods").and_then(|value| value.as_array()) else {
                    continue;
                };
                for period in periods {
                    let Some(period_start) = period
                        .get("startDate")
                        .and_then(|value| value.as_str())
                        .and_then(|value| validate_status_date(value).ok())
                    else {
                        continue;
                    };
                    let Some(period_end) = period
                        .get("endDate")
                        .and_then(|value| value.as_str())
                        .and_then(|value| validate_status_date(value).ok())
                    else {
                        continue;
                    };
                    let effective_start = period_start.max(start);
                    let effective_end = period_end.min(end);
                    if effective_start > effective_end {
                        continue;
                    }
                    let start_time = period
                        .get("startTime")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default();
                    let end_time = period
                        .get("endTime")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default();
                    for date in dates_between(effective_start, effective_end) {
                        append_fact(
                            facts,
                            personnel_id,
                            date,
                            AutoFact {
                                status: "БР",
                                report_code: if ksp_in_bro { "100" } else { "30" },
                                tone: if ksp_in_bro { "green" } else { "yellow" },
                                actual_location: label.into(),
                                source_details: format!(
                                    "{}: {} {} — {} {}. {}",
                                    label,
                                    period_start,
                                    start_time,
                                    period_end,
                                    end_time,
                                    if ksp_in_bro {
                                        "КСП входить в БРО."
                                    } else {
                                        "КСП не входить в БРО."
                                    }
                                ),
                                priority: if ksp_in_bro { 780 } else { 480 },
                            },
                        );
                    }
                }
            }
        }
    }
    Ok(())
}

fn add_personnel_control_facts(
    connection: &Connection,
    start: NaiveDate,
    end: NaiveDate,
    facts: &mut HashMap<(i64, NaiveDate), AutoFact>,
) -> Result<(), String> {
    let training_in_unit = if table_has_column(
        connection,
        "personnel_control_assignments",
        "training_in_unit",
    ) {
        "COALESCE(training_in_unit,0)"
    } else {
        "0"
    };
    let query = format!(
        "SELECT personnel_id,location_type,institution,start_date,
                CASE WHEN trim(closed_on)<>'' THEN closed_on
                     WHEN trim(end_date)<>'' THEN end_date ELSE ?2 END,
                {training_in_unit}
         FROM personnel_control_assignments
         WHERE date(start_date)<=date(?2)
           AND close_reason NOT LIKE 'Скасовано запланований запис%'
           AND date(CASE WHEN trim(closed_on)<>'' THEN closed_on
                         WHEN trim(end_date)<>'' THEN end_date ELSE ?2 END)>=date(?1)
         ORDER BY start_date,id"
    );
    let mut statement = connection
        .prepare(&query)
        .map_err(|_| "Не вдалося прочитати контроль особового складу для виплат.".to_string())?;
    let rows = statement
        .query_map(
            params![
                start.format("%Y-%m-%d").to_string(),
                end.format("%Y-%m-%d").to_string()
            ],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)? != 0,
                ))
            },
        )
        .map_err(|_| "Не вдалося прочитати контроль особового складу для виплат.".to_string())?;
    for row in rows {
        let (personnel_id, location, institution, start_date, end_date, training_in_unit) =
            row.map_err(|_| "Не вдалося прочитати запис контролю особового складу.".to_string())?;
        let (Ok(period_start), Ok(period_end)) = (
            validate_status_date(&start_date),
            validate_status_date(&end_date),
        ) else {
            continue;
        };
        let effective_start = period_start.max(start);
        let effective_end = period_end.min(end);
        if effective_start > effective_end {
            continue;
        }
        let location = location.trim();
        let excluded_from_payments = location == "ВІДП" || (location == "НАВЧ" && training_in_unit);
        let blue = matches!(location, "ПТЗ Новостав" | "ЛІК" | "ВЛК")
            || (location == "НАВЧ" && !training_in_unit);
        let location_text = if institution.trim().is_empty() {
            location.to_string()
        } else {
            format!("{} · {}", location, institution.trim())
        };
        for date in dates_between(effective_start, effective_end) {
            append_fact(
                facts,
                personnel_id,
                date,
                AutoFact {
                    status: if excluded_from_payments {
                        ""
                    } else if blue {
                        "30Б"
                    } else {
                        "30"
                    },
                    report_code: if excluded_from_payments {
                        ""
                    } else if blue {
                        "30У"
                    } else {
                        "30"
                    },
                    tone: if excluded_from_payments {
                        "empty"
                    } else if blue {
                        "blue"
                    } else {
                        "white"
                    },
                    actual_location: location_text.clone(),
                    source_details: if location == "НАВЧ" {
                        format!(
                            "Навчання: {}. {}",
                            institution.trim(),
                            if training_in_unit {
                                "Навчання у військовій частині."
                            } else {
                                "Навчання поза військовою частиною."
                            }
                        )
                    } else {
                        format!("Контроль ОС: {}.", location_text)
                    },
                    // Leave and in-unit training must win over stale flight/position facts,
                    // while ALKO/SZCH still remain authoritative for the whole month.
                    priority: if excluded_from_payments {
                        950
                    } else if blue {
                        700
                    } else {
                        400
                    },
                },
            );
        }
    }
    Ok(())
}

fn manual_overrides(
    connection: &Connection,
    month: &str,
) -> Result<HashMap<(i64, NaiveDate), String>, String> {
    let mut statement = connection
        .prepare(
            "SELECT personnel_id,status_date,status FROM payment_daily_statuses
             WHERE substr(status_date,1,7)=?1 ORDER BY status_date,personnel_id",
        )
        .map_err(|_| "Не вдалося прочитати ручні уточнення виплат.".to_string())?;
    let rows = statement
        .query_map([month], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати ручні уточнення виплат.".to_string())?;
    let mut result = HashMap::new();
    for row in rows {
        let (personnel_id, date, status) =
            row.map_err(|_| "Не вдалося прочитати ручне уточнення виплати.".to_string())?;
        if MANUAL_PAYMENT_STATUSES.contains(&status.trim()) {
            if let Ok(date) = validate_status_date(&date) {
                result.insert((personnel_id, date), status);
            }
        }
    }
    Ok(result)
}

fn list_month_with_context(
    connection: &Connection,
    month: &str,
    ksp_in_bro: bool,
) -> Result<Vec<PaymentDailyStatus>, String> {
    let (start, end) = month_bounds(month)?;
    let personnel_ids = connection
        .prepare("SELECT id FROM personnel ORDER BY id")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, i64>(0))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|_| "Не вдалося прочитати особовий склад для виплат.".to_string())?;
    let mut facts = HashMap::new();
    add_personnel_control_facts(connection, start, end, &mut facts)?;
    add_position_presence_facts(connection, start, end, &mut facts)?;
    add_position_work_facts(connection, start, end, &mut facts)?;
    add_ksp_facts(connection, start, end, ksp_in_bro, &mut facts)?;
    add_flight_facts(connection, month, &mut facts)?;
    add_disciplinary_facts(connection, month, start, end, &mut facts)?;
    let overrides = manual_overrides(connection, month)?;
    let mut statuses =
        Vec::with_capacity(personnel_ids.len() * usize::try_from(end.day()).unwrap_or(31));
    for personnel_id in personnel_ids {
        for date in dates_between(start, end) {
            let fact = facts
                .get(&(personnel_id, date))
                .cloned()
                .unwrap_or_else(AutoFact::default);
            let stored_override = overrides.get(&(personnel_id, date)).cloned();
            let effective = if fact.tone == "danger" {
                fact.clone()
            } else if let Some(status) = stored_override.as_deref() {
                AutoFact::manual(status)
            } else {
                fact.clone()
            };
            let manual_override = (fact.tone != "danger").then_some(stored_override).flatten();
            statuses.push(PaymentDailyStatus {
                personnel_id,
                status_date: date.format("%Y-%m-%d").to_string(),
                status: effective.status.into(),
                report_code: effective.report_code.into(),
                tone: effective.tone.into(),
                actual_location: fact.actual_location,
                source_details: fact.source_details,
                manual_override,
            });
        }
    }
    Ok(statuses)
}

#[cfg(test)]
pub fn list_month(connection: &Connection, month: &str) -> Result<Vec<PaymentDailyStatus>, String> {
    list_month_with_context(connection, month, false)
}

pub fn save_status(
    connection: &Connection,
    personnel_id: i64,
    status_date: &str,
    status: &str,
) -> Result<(), String> {
    if personnel_id <= 0 {
        return Err("Не вказано військовослужбовця.".to_string());
    }
    validate_status_date(status_date)?;
    let status = status.trim();
    if status.is_empty() {
        connection
            .execute(
                "DELETE FROM payment_daily_statuses WHERE personnel_id=?1 AND status_date=?2",
                params![personnel_id, status_date],
            )
            .map_err(|_| "Не вдалося очистити статус виплати.".to_string())?;
        return Ok(());
    }
    if !MANUAL_PAYMENT_STATUSES.contains(&status) {
        return Err(
            "Вручну можна встановити лише «БР», «БР 30», «30Б», «30» або порожню клітинку."
                .to_string(),
        );
    }
    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM personnel WHERE id=?1)",
            [personnel_id],
            |row| row.get(0),
        )
        .map_err(|_| "Не вдалося перевірити військовослужбовця.".to_string())?;
    if !exists {
        return Err("Військовослужбовця не знайдено.".to_string());
    }
    let disciplinary: bool = connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM incidents i
                JOIN incident_personnel ip ON ip.incident_id=i.id AND ip.selection_order=0
                WHERE ip.personnel_id=?1 AND substr(i.occurred_at,1,7)=substr(?2,1,7)
                  AND i.incident_type IN ('СЗЧ','Алкогольне/наркотичне сп’яніння','Алкогольне / наркотичне сп’яніння')
                  AND i.status<>'Скасовано'
            )",
            params![personnel_id, status_date],
            |row| row.get(0),
        )
        .map_err(|_| "Не вдалося перевірити дисциплінарні інциденти.".to_string())?;
    if disciplinary {
        return Err("Дисциплінарний статус «АЛКО» або «СЗЧ» не можна замінити вручну.".into());
    }
    connection
        .execute(
            "INSERT INTO payment_daily_statuses(personnel_id,status_date,status)
             VALUES(?1,?2,?3)
             ON CONFLICT(personnel_id,status_date) DO UPDATE SET
                status=excluded.status,updated_at=CURRENT_TIMESTAMP",
            params![personnel_id, status_date, status],
        )
        .map_err(|_| "Не вдалося зберегти статус виплати.".to_string())?;
    Ok(())
}

fn load_people(
    connection: &Connection,
    month: &str,
    ksp_in_bro: bool,
) -> Result<Vec<PersonMonth>, String> {
    let calculated = list_month_with_context(connection, month, ksp_in_bro)?;
    let mut statement = connection
        .prepare(
            "SELECT p.id,p.rank,trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic),p.tax_id
             FROM personnel p ORDER BY p.id",
        )
        .map_err(|_| "Не вдалося підготувати дані рапорту.".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати дані рапорту.".to_string())?;
    let mut people: BTreeMap<i64, PersonMonth> = BTreeMap::new();
    for row in rows {
        let (id, rank, full_name, tax_id) =
            row.map_err(|_| "Не вдалося прочитати дані рапорту.".to_string())?;
        people.insert(
            id,
            PersonMonth {
                rank,
                full_name,
                tax_id,
                statuses: BTreeMap::new(),
            },
        );
    }
    for item in calculated {
        if let (Some(person), Ok(date)) = (
            people.get_mut(&item.personnel_id),
            validate_status_date(&item.status_date),
        ) {
            person.statuses.insert(
                date,
                DailyReportValue {
                    report_code: item.report_code,
                },
            );
        }
    }
    Ok(people.into_values().collect())
}

fn periods_for(person: &PersonMonth, code: &str) -> Vec<(NaiveDate, NaiveDate)> {
    let has_disciplinary = person
        .statuses
        .values()
        .any(|status| status.report_code == "Д");
    if code != "Д" && code != "500" && has_disciplinary {
        return Vec::new();
    }
    let mut dates = person
        .statuses
        .iter()
        .filter_map(|(date, status)| (status.report_code == code).then_some(*date))
        .collect::<Vec<_>>();
    dates.sort_unstable();
    let mut periods: Vec<(NaiveDate, NaiveDate)> = Vec::new();
    for date in dates {
        if let Some((_, end)) = periods.last_mut() {
            if end.succ_opt() == Some(date) {
                *end = date;
                continue;
            }
        }
        periods.push((date, date));
    }
    periods
}

fn report_lines(people: &[PersonMonth], code: &str) -> Vec<ReportLine> {
    people
        .iter()
        .filter_map(|person| {
            let periods = periods_for(person, code);
            (!periods.is_empty()).then(|| ReportLine {
                rank: person.rank.clone(),
                full_name: person.full_name.clone(),
                tax_id: person.tax_id.clone(),
                starts: periods.iter().map(|(start, _)| *start).collect(),
                ends: periods.iter().map(|(_, end)| *end).collect(),
            })
        })
        .collect()
}

fn esc(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn xml_attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let marker = format!("{name}=\"");
    let start = tag.find(&marker)? + marker.len();
    let end = start + tag[start..].find('"')?;
    Some(&tag[start..end])
}

fn replace_xml_attribute(tag: &str, name: &str, value: &str) -> String {
    let marker = format!("{name}=\"");
    if let Some(start) = tag.find(&marker) {
        let value_start = start + marker.len();
        if let Some(relative_end) = tag[value_start..].find('"') {
            let value_end = value_start + relative_end;
            return format!("{}{}{}", &tag[..value_start], value, &tag[value_end..]);
        }
    }
    let insert_at = tag.rfind('>').unwrap_or(tag.len());
    format!(
        "{} {name}=\"{value}\"{}",
        &tag[..insert_at],
        &tag[insert_at..]
    )
}

fn inline_cell(column: &str, row: usize, value: &str, style: usize) -> String {
    format!(
        "<c r=\"{column}{row}\" s=\"{style}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">{}</t></is></c>",
        esc(value)
    )
}

fn column_number(reference: &str) -> Option<u32> {
    let mut result = 0u32;
    let mut found = false;
    for byte in reference.bytes().take_while(u8::is_ascii_alphabetic) {
        found = true;
        result = result
            .checked_mul(26)?
            .checked_add(u32::from(byte.to_ascii_uppercase() - b'A' + 1))?;
    }
    found.then_some(result)
}

fn sheet_rows(sheet: &str, last_row: usize) -> Result<Vec<(usize, String)>, String> {
    let data_start = sheet
        .find("<sheetData")
        .ok_or_else(|| "У шаблоні рапорту відсутні дані аркуша.".to_string())?;
    let content_start = data_start
        + sheet[data_start..]
            .find('>')
            .ok_or_else(|| "Пошкоджено дані аркуша шаблону.".to_string())?
        + 1;
    let content_end = content_start
        + sheet[content_start..]
            .find("</sheetData>")
            .ok_or_else(|| "Пошкоджено дані аркуша шаблону.".to_string())?;
    let content = &sheet[content_start..content_end];
    let mut cursor = 0usize;
    let mut rows = Vec::new();
    while let Some(relative_start) = content[cursor..].find("<row ") {
        let start = cursor + relative_start;
        let opening_end = start
            + content[start..]
                .find('>')
                .ok_or_else(|| "Пошкоджено рядок шаблону.".to_string())?
            + 1;
        let opening = &content[start..opening_end];
        let row_number = xml_attribute(opening, "r")
            .and_then(|value| value.parse::<usize>().ok())
            .ok_or_else(|| "У шаблоні знайдено рядок без номера.".to_string())?;
        let end = if opening.ends_with("/>") {
            opening_end
        } else {
            opening_end
                + content[opening_end..]
                    .find("</row>")
                    .ok_or_else(|| "Пошкоджено рядок шаблону.".to_string())?
                + "</row>".len()
        };
        if row_number <= last_row {
            rows.push((row_number, content[start..end].to_string()));
        }
        cursor = end;
    }
    Ok(rows)
}

fn cleaned_shifted_row(row_xml: &str, new_row: usize) -> Result<String, String> {
    let opening_end = row_xml
        .find('>')
        .ok_or_else(|| "Пошкоджено рядок шаблону.".to_string())?
        + 1;
    let mut result = replace_xml_attribute(&row_xml[..opening_end], "r", &new_row.to_string());
    if result.ends_with("/>") {
        return Ok(result);
    }
    let closing_start = row_xml
        .rfind("</row>")
        .ok_or_else(|| "Пошкоджено рядок шаблону.".to_string())?;
    let body = &row_xml[opening_end..closing_start];
    let mut cursor = 0usize;
    while let Some(relative_start) = body[cursor..].find("<c ") {
        let start = cursor + relative_start;
        let opening_cell_end = start
            + body[start..]
                .find('>')
                .ok_or_else(|| "Пошкоджено клітинку шаблону.".to_string())?
            + 1;
        let opening = &body[start..opening_cell_end];
        let end = if opening.ends_with("/>") {
            opening_cell_end
        } else {
            opening_cell_end
                + body[opening_cell_end..]
                    .find("</c>")
                    .ok_or_else(|| "Пошкоджено клітинку шаблону.".to_string())?
                + "</c>".len()
        };
        if let Some(reference) = xml_attribute(opening, "r") {
            if column_number(reference).is_some_and(|column| column <= 6) {
                let column = reference
                    .chars()
                    .take_while(|value| value.is_ascii_alphabetic())
                    .collect::<String>();
                let cell =
                    replace_xml_attribute(&body[start..end], "r", &format!("{column}{new_row}"));
                result.push_str(&cell);
            }
        }
        cursor = end;
    }
    result.push_str("</row>");
    Ok(result)
}

fn replace_row_cell(row_xml: &str, reference: &str, value: &str) -> Result<String, String> {
    let mut cursor = 0usize;
    while let Some(relative_start) = row_xml[cursor..].find("<c ") {
        let start = cursor + relative_start;
        let opening_end = start
            + row_xml[start..]
                .find('>')
                .ok_or_else(|| "Пошкоджено клітинку шаблону.".to_string())?
            + 1;
        let opening = &row_xml[start..opening_end];
        let end = if opening.ends_with("/>") {
            opening_end
        } else {
            opening_end
                + row_xml[opening_end..]
                    .find("</c>")
                    .ok_or_else(|| "Пошкоджено клітинку шаблону.".to_string())?
                + "</c>".len()
        };
        if xml_attribute(opening, "r") == Some(reference) {
            let style = xml_attribute(opening, "s")
                .and_then(|style| style.parse::<usize>().ok())
                .unwrap_or_default();
            let row = reference
                .chars()
                .skip_while(|value| value.is_ascii_alphabetic())
                .collect::<String>()
                .parse::<usize>()
                .map_err(|_| "Некоректна адреса клітинки шаблону.".to_string())?;
            let column = reference
                .chars()
                .take_while(|value| value.is_ascii_alphabetic())
                .collect::<String>();
            return Ok(format!(
                "{}{}{}",
                &row_xml[..start],
                inline_cell(&column, row, value, style),
                &row_xml[end..]
            ));
        }
        cursor = end;
    }
    Err(format!("У шаблоні відсутня клітинка {reference}."))
}

fn replace_element(xml: &str, name: &str, replacement: &str) -> Result<String, String> {
    let opening = format!("<{name}");
    let closing = format!("</{name}>");
    let start = xml
        .find(&opening)
        .ok_or_else(|| format!("У шаблоні відсутній блок {name}."))?;
    let end = start
        + xml[start..]
            .find(&closing)
            .ok_or_else(|| format!("Пошкоджено блок {name} у шаблоні."))?
        + closing.len();
    Ok(format!("{}{}{}", &xml[..start], replacement, &xml[end..]))
}

fn replace_empty_element_attribute(
    xml: &str,
    element: &str,
    attribute: &str,
    value: &str,
) -> Result<String, String> {
    let marker = format!("<{element}");
    let start = xml
        .find(&marker)
        .ok_or_else(|| format!("У шаблоні відсутній блок {element}."))?;
    let end = start
        + xml[start..]
            .find("/>")
            .ok_or_else(|| format!("Пошкоджено блок {element} у шаблоні."))?
        + 2;
    let tag = replace_xml_attribute(&xml[start..end], attribute, value);
    Ok(format!("{}{}{}", &xml[..start], tag, &xml[end..]))
}

fn replace_sheet_data(sheet: &str, rows: String) -> Result<String, String> {
    replace_element(
        sheet,
        "sheetData",
        &format!("<sheetData>{rows}</sheetData>"),
    )
}

fn merge_cells(ranges: &[String]) -> String {
    format!(
        "<mergeCells count=\"{}\">{}</mergeCells>",
        ranges.len(),
        ranges
            .iter()
            .map(|range| format!("<mergeCell ref=\"{range}\"/>"))
            .collect::<String>()
    )
}

fn shifted_cell_reference(
    reference: &str,
    shift: impl Fn(usize) -> usize,
) -> Result<String, String> {
    let column = reference
        .chars()
        .take_while(|value| value.is_ascii_alphabetic())
        .collect::<String>();
    let row = reference
        .chars()
        .skip_while(|value| value.is_ascii_alphabetic())
        .collect::<String>()
        .parse::<usize>()
        .map_err(|_| "Некоректне об’єднання клітинок у шаблоні.".to_string())?;
    Ok(format!("{column}{}", shift(row)))
}

fn shifted_range(range: &str, shift: impl Copy + Fn(usize) -> usize) -> Result<String, String> {
    let (start, end) = range
        .split_once(':')
        .ok_or_else(|| "Некоректне об’єднання клітинок у шаблоні.".to_string())?;
    Ok(format!(
        "{}:{}",
        shifted_cell_reference(start, shift)?,
        shifted_cell_reference(end, shift)?
    ))
}

fn report_row(
    row: usize,
    sequence: usize,
    line: &ReportLine,
    styles: [usize; 6],
    include_periods: bool,
) -> String {
    let starts = if include_periods {
        line.starts
            .iter()
            .map(|date| date.format("%d.%m.%Y").to_string())
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        String::new()
    };
    let ends = if include_periods {
        line.ends
            .iter()
            .map(|date| date.format("%d.%m.%Y").to_string())
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        String::new()
    };
    let period_count = if include_periods {
        line.starts.len()
    } else {
        0
    };
    let height = 24usize.max(period_count * 20);
    let values = [
        sequence.to_string(),
        line.rank.clone(),
        line.full_name.clone(),
        line.tax_id.clone(),
        starts,
        ends,
    ];
    let mut result = format!("<row r=\"{row}\" ht=\"{height}\" customHeight=\"1\">");
    for (index, value) in values.iter().enumerate() {
        let column = char::from(b'A' + u8::try_from(index).unwrap_or_default()).to_string();
        result.push_str(&inline_cell(&column, row, value, styles[index]));
    }
    result.push_str("</row>");
    result
}

fn attached_row(
    row: usize,
    sequence: usize,
    rank: &str,
    full_name: &str,
    styles: [usize; 6],
) -> String {
    report_row(
        row,
        sequence,
        &ReportLine {
            rank: rank.into(),
            full_name: full_name.into(),
            tax_id: String::new(),
            starts: Vec::new(),
            ends: Vec::new(),
        },
        styles,
        false,
    )
}

fn load_attached_personnel(connection: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut statement = connection
        .prepare(
            "SELECT rank,full_name FROM temporary_personnel
             WHERE trim(category)='Прикомандировані'
             ORDER BY group_name,arrived_at,id",
        )
        .map_err(|_| "Не вдалося підготувати список прикомандированих.".to_string())?;
    let people = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| "Не вдалося прочитати список прикомандированих.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати список прикомандированих.".to_string())?;
    Ok(people)
}

fn signer_name(full_name: &str) -> String {
    let parts = full_name.split_whitespace().collect::<Vec<_>>();
    match parts.as_slice() {
        [surname, given, ..] => format!("{} {}", given, surname.to_uppercase()),
        _ => full_name.trim().to_string(),
    }
}

fn duty_sheet(
    source: &str,
    people: &[PersonMonth],
    attached: &[(String, String)],
) -> Result<String, String> {
    const MERGES: [&str; 35] = [
        "D1:F1", "A4:F4", "A5:F5", "A6:A7", "B6:B7", "C6:C7", "D6:D7", "E6:F6", "A9:F9", "A10:A11",
        "B10:B11", "C10:C11", "D10:D11", "E10:F10", "A12:F12", "A13:F13", "A16:F16", "A17:A18",
        "B17:B18", "C17:C18", "D17:D18", "E17:F17", "A19:F19", "A20:F20", "A21:F21", "A23:F23",
        "E24:F24", "A25:B25", "E30:F30", "A31:B31", "E38:F38", "A39:B39", "E45:F45", "A46:B46",
        "E52:F52",
    ];
    let lines_100 = report_lines(people, "100");
    let lines_30 = report_lines(people, "30");
    let discipline = report_lines(people, "Д");
    let extra_100 = lines_100.len().saturating_sub(1);
    let count_30 = lines_30.len();
    let count_discipline = discipline.len();
    let count_attached = attached.len();
    let shift = |row: usize| {
        row + usize::from(row >= 9) * extra_100
            + usize::from(row >= 12) * count_30
            + usize::from(row >= 15) * count_discipline
            + usize::from(row >= 19) * count_attached
    };
    let rows = sheet_rows(source, 64)?;
    let mut rendered = String::new();
    for (old_row, raw) in rows {
        if old_row == 9 {
            for (index, line) in lines_100.iter().enumerate().skip(1) {
                rendered.push_str(&report_row(
                    8 + index,
                    index + 1,
                    line,
                    [20, 21, 22, 23, 21, 21],
                    true,
                ));
            }
        }
        if old_row == 12 {
            let start = 12 + extra_100;
            for (index, line) in lines_30.iter().enumerate() {
                rendered.push_str(&report_row(
                    start + index,
                    index + 1,
                    line,
                    [20, 21, 22, 23, 21, 21],
                    true,
                ));
            }
        }
        if old_row == 15 {
            let start = 15 + extra_100 + count_30;
            for (index, line) in discipline.iter().enumerate() {
                rendered.push_str(&report_row(
                    start + index,
                    index + 1,
                    line,
                    [20, 21, 22, 23, 21, 21],
                    false,
                ));
            }
        }
        if old_row == 19 {
            let start = 19 + extra_100 + count_30 + count_discipline;
            for (index, (rank, name)) in attached.iter().enumerate() {
                rendered.push_str(&attached_row(
                    start + index,
                    index + 1,
                    rank,
                    name,
                    [20, 21, 22, 23, 21, 21],
                ));
            }
        }
        let new_row = shift(old_row);
        let mut row = cleaned_shifted_row(&raw, new_row)?;
        if old_row == 8 {
            let row_height = 24usize.max(
                lines_100
                    .first()
                    .map(|line| line.starts.len() * 20)
                    .unwrap_or_default(),
            );
            row = replace_xml_attribute(&row, "ht", &row_height.to_string());
            let values = if let Some(line) = lines_100.first() {
                let starts = line
                    .starts
                    .iter()
                    .map(|date| date.format("%d.%m.%Y").to_string())
                    .collect::<Vec<_>>()
                    .join("\n");
                let ends = line
                    .ends
                    .iter()
                    .map(|date| date.format("%d.%m.%Y").to_string())
                    .collect::<Vec<_>>()
                    .join("\n");
                [
                    "1".to_string(),
                    line.rank.clone(),
                    line.full_name.clone(),
                    line.tax_id.clone(),
                    starts,
                    ends,
                ]
            } else {
                std::array::from_fn(|_| String::new())
            };
            for (index, value) in values.iter().enumerate() {
                let column = char::from(b'A' + u8::try_from(index).unwrap_or_default());
                row = replace_row_cell(&row, &format!("{column}{new_row}"), value)?;
            }
        }
        rendered.push_str(&row);
    }
    let mut sheet = replace_sheet_data(source, rendered)?;
    let mut ranges = Vec::new();
    for range in MERGES {
        ranges.push(shifted_range(range, shift)?);
    }
    sheet = replace_element(&sheet, "mergeCells", &merge_cells(&ranges))?;
    let last_row = shift(64);
    sheet =
        replace_empty_element_attribute(&sheet, "dimension", "ref", &format!("A1:F{last_row}"))?;
    sheet = replace_element(
        &sheet,
        "rowBreaks",
        &format!(
            "<rowBreaks count=\"2\" manualBreakCount=\"2\"><brk id=\"{}\" man=\"true\" max=\"16383\" min=\"0\"/><brk id=\"{}\" man=\"true\" max=\"16383\" min=\"0\"/></rowBreaks>",
            shift(16),
            shift(24)
        ),
    )?;
    Ok(sheet)
}

fn ten_k_sheet(source: &str, people: &[PersonMonth]) -> Result<String, String> {
    const MERGES: [&str; 12] = [
        "D1:F1", "A3:F3", "A5:F5", "A7:A8", "B7:B8", "C7:C8", "D7:D8", "E7:F7", "A9:F9", "A10:F10",
        "A14:F14", "E15:F15",
    ];
    let lines_10 = report_lines(people, "30У");
    let discipline = report_lines(people, "Д");
    let count_10 = lines_10.len();
    let count_discipline = discipline.len();
    let shift = |row: usize| {
        row + usize::from(row >= 9) * count_10 + usize::from(row >= 12) * count_discipline
    };
    let rows = sheet_rows(source, 19)?;
    let mut rendered = String::new();
    for (old_row, raw) in rows {
        if old_row == 9 {
            for (index, line) in lines_10.iter().enumerate() {
                rendered.push_str(&report_row(
                    9 + index,
                    index + 1,
                    line,
                    [21, 21, 21, 22, 23, 23],
                    true,
                ));
            }
        }
        if old_row == 12 {
            let start = 12 + count_10;
            for (index, line) in discipline.iter().enumerate() {
                rendered.push_str(&report_row(
                    start + index,
                    index + 1,
                    line,
                    [21, 21, 21, 22, 23, 24],
                    false,
                ));
            }
        }
        let new_row = shift(old_row);
        let row = cleaned_shifted_row(&raw, new_row)?;
        rendered.push_str(&row);
    }
    let mut sheet = replace_sheet_data(source, rendered)?;
    let ranges = MERGES
        .into_iter()
        .map(|range| shifted_range(range, shift))
        .collect::<Result<Vec<_>, _>>()?;
    sheet = replace_element(&sheet, "mergeCells", &merge_cells(&ranges))?;
    let last_row = shift(19);
    replace_empty_element_attribute(&sheet, "dimension", "ref", &format!("A1:F{last_row}"))
}

fn ukrainian_month_title(month: &str) -> Result<String, String> {
    let (year, month_number) = validate_month(month)?;
    let month_name = [
        "Січень",
        "Лютий",
        "Березень",
        "Квітень",
        "Травень",
        "Червень",
        "Липень",
        "Серпень",
        "Вересень",
        "Жовтень",
        "Листопад",
        "Грудень",
    ]
    .get(usize::try_from(month_number - 1).unwrap_or_default())
    .ok_or_else(|| "Некоректний місяць виплат.".to_string())?;
    Ok(format!("{month_name} {year}"))
}

fn workbook_xml(source: &str, title: &str, last_row: usize) -> Result<String, String> {
    let sheet_start = source
        .find("<sheet ")
        .ok_or_else(|| "У шаблоні відсутній аркуш.".to_string())?;
    let sheet_end = sheet_start
        + source[sheet_start..]
            .find("/>")
            .ok_or_else(|| "Пошкоджено опис аркуша шаблону.".to_string())?
        + 2;
    let sheet_tag = replace_xml_attribute(&source[sheet_start..sheet_end], "name", &esc(title));
    let mut result = format!(
        "{}{}{}",
        &source[..sheet_start],
        sheet_tag,
        &source[sheet_end..]
    );
    let print_name = "name=\"_xlnm.Print_Area\"";
    let name_pos = result
        .find(print_name)
        .ok_or_else(|| "У шаблоні не визначено область друку.".to_string())?;
    let value_start = name_pos
        + result[name_pos..]
            .find('>')
            .ok_or_else(|| "Пошкоджено область друку шаблону.".to_string())?
        + 1;
    let value_end = value_start
        + result[value_start..]
            .find("</definedName>")
            .ok_or_else(|| "Пошкоджено область друку шаблону.".to_string())?;
    result.replace_range(
        value_start..value_end,
        &format!("&apos;{}&apos;!$A$1:$F${last_row}", esc(title)),
    );
    Ok(result)
}

fn write_template_workbook(
    template: &[u8],
    path: &Path,
    sheet_xml: &str,
    workbook_xml: &str,
    app_settings: &settings::AppSettings,
) -> Result<(), String> {
    let mut source = ZipArchive::new(Cursor::new(template))
        .map_err(|_| "Не вдалося відкрити вбудований шаблон рапорту.".to_string())?;
    let target = File::create(path)
        .map_err(|_| "Не вдалося створити файл рапорту. Перевірте обрану папку.".to_string())?;
    let mut writer = ZipWriter::new(target);
    for index in 0..source.len() {
        let mut entry = source
            .by_index(index)
            .map_err(|_| "Не вдалося прочитати вбудований шаблон рапорту.".to_string())?;
        let name = entry.name().to_string();
        let compression = entry.compression();
        let mut contents = Vec::new();
        entry
            .read_to_end(&mut contents)
            .map_err(|_| "Не вдалося прочитати вбудований шаблон рапорту.".to_string())?;
        writer
            .start_file(
                &name,
                SimpleFileOptions::default().compression_method(compression),
            )
            .map_err(|_| "Не вдалося створити файл рапорту.".to_string())?;
        if name == "xl/worksheets/sheet1.xml" {
            writer
                .write_all(sheet_xml.as_bytes())
                .map_err(|_| "Не вдалося записати таблицю рапорту.".to_string())?;
        } else if name == "xl/workbook.xml" {
            writer
                .write_all(workbook_xml.as_bytes())
                .map_err(|_| "Не вдалося записати опис рапорту.".to_string())?;
        } else if name == "xl/sharedStrings.xml" {
            let mut shared_strings = String::from_utf8(contents)
                .map_err(|_| "Пошкоджено текстові дані шаблону рапорту.".to_string())?;
            for (placeholder, value) in [
                (
                    "{{номер військової частини}}",
                    app_settings.unit.unit_code.trim().to_string(),
                ),
                (
                    "{{основний підписант повна посада}}",
                    app_settings.main_signer.position.trim().to_string(),
                ),
                (
                    "{{основний підписант повне звання}}",
                    app_settings.main_signer.rank.trim().to_string(),
                ),
                (
                    "{{основний підписант Імʼя ПРІЗВИЩЕ}}",
                    signer_name(&app_settings.main_signer.full_name),
                ),
            ] {
                shared_strings = shared_strings.replace(placeholder, &esc(&value));
            }
            writer
                .write_all(shared_strings.as_bytes())
                .map_err(|_| "Не вдалося записати текстові дані рапорту.".to_string())?;
        } else {
            writer
                .write_all(&contents)
                .map_err(|_| "Не вдалося скопіювати структуру шаблону рапорту.".to_string())?;
        }
    }
    writer
        .finish()
        .map_err(|_| "Не вдалося завершити формування рапорту.".to_string())?;
    Ok(())
}

pub fn export_report(
    connection: &Connection,
    month: &str,
    path: &Path,
    ksp_in_bro: bool,
    report_kind: &str,
    app_settings: &settings::AppSettings,
) -> Result<(), String> {
    let people = load_people(connection, month, ksp_in_bro)?;
    let title = ukrainian_month_title(month)?;
    match report_kind {
        "duty" => {
            let source_sheet = {
                let mut archive = ZipArchive::new(Cursor::new(DUTY_REPORT_TEMPLATE))
                    .map_err(|_| "Не вдалося відкрити шаблон рапорту на ДВ.".to_string())?;
                let mut xml = String::new();
                archive
                    .by_name("xl/worksheets/sheet1.xml")
                    .map_err(|_| "У шаблоні рапорту на ДВ відсутній аркуш.".to_string())?
                    .read_to_string(&mut xml)
                    .map_err(|_| "Не вдалося прочитати шаблон рапорту на ДВ.".to_string())?;
                xml
            };
            let attached = load_attached_personnel(connection)?;
            let sheet = duty_sheet(&source_sheet, &people, &attached)?;
            let last_row = 64
                + report_lines(&people, "100").len().saturating_sub(1)
                + report_lines(&people, "30").len()
                + report_lines(&people, "Д").len()
                + attached.len();
            let source_workbook = {
                let mut archive = ZipArchive::new(Cursor::new(DUTY_REPORT_TEMPLATE))
                    .map_err(|_| "Не вдалося відкрити шаблон рапорту на ДВ.".to_string())?;
                let mut xml = String::new();
                archive
                    .by_name("xl/workbook.xml")
                    .map_err(|_| "У шаблоні рапорту на ДВ відсутній опис.".to_string())?
                    .read_to_string(&mut xml)
                    .map_err(|_| "Не вдалося прочитати шаблон рапорту на ДВ.".to_string())?;
                xml
            };
            let workbook = workbook_xml(&source_workbook, &title, last_row)?;
            write_template_workbook(DUTY_REPORT_TEMPLATE, path, &sheet, &workbook, app_settings)
        }
        "tenK" | "ten_k" | "10k" => {
            let source_sheet = {
                let mut archive = ZipArchive::new(Cursor::new(TEN_K_REPORT_TEMPLATE))
                    .map_err(|_| "Не вдалося відкрити шаблон рапорту 10к.".to_string())?;
                let mut xml = String::new();
                archive
                    .by_name("xl/worksheets/sheet1.xml")
                    .map_err(|_| "У шаблоні рапорту 10к відсутній аркуш.".to_string())?
                    .read_to_string(&mut xml)
                    .map_err(|_| "Не вдалося прочитати шаблон рапорту 10к.".to_string())?;
                xml
            };
            let sheet = ten_k_sheet(&source_sheet, &people)?;
            let last_row =
                19 + report_lines(&people, "30У").len() + report_lines(&people, "Д").len();
            let source_workbook = {
                let mut archive = ZipArchive::new(Cursor::new(TEN_K_REPORT_TEMPLATE))
                    .map_err(|_| "Не вдалося відкрити шаблон рапорту 10к.".to_string())?;
                let mut xml = String::new();
                archive
                    .by_name("xl/workbook.xml")
                    .map_err(|_| "У шаблоні рапорту 10к відсутній опис.".to_string())?
                    .read_to_string(&mut xml)
                    .map_err(|_| "Не вдалося прочитати шаблон рапорту 10к.".to_string())?;
                xml
            };
            let workbook = workbook_xml(&source_workbook, &title, last_row)?;
            write_template_workbook(TEN_K_REPORT_TEMPLATE, path, &sheet, &workbook, app_settings)
        }
        _ => Err("Невідомий тип рапорту виплат.".to_string()),
    }
}

#[tauri::command]
pub(crate) fn list_payment_statuses(
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
    month: String,
) -> Result<Vec<PaymentDailyStatus>, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    let settings = settings::load(&crate::application_root(&app)?)?;
    list_month_with_context(&database.connection, &month, settings.unit.ksp_in_bro)
}

#[tauri::command]
pub(crate) fn save_payment_status(
    state: tauri::State<AppState>,
    personnel_id: i64,
    status_date: String,
    status: String,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    save_status(&database.connection, personnel_id, &status_date, &status)
}

#[tauri::command]
pub(crate) fn save_payment_statuses(
    state: tauri::State<AppState>,
    personnel_id: i64,
    status_dates: Vec<String>,
    status: String,
) -> Result<(), String> {
    let mut database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    save_statuses(
        &mut database.connection,
        personnel_id,
        status_dates,
        &status,
    )
}

fn save_statuses(
    connection: &mut Connection,
    personnel_id: i64,
    status_dates: Vec<String>,
    status: &str,
) -> Result<(), String> {
    if status_dates.is_empty() || status_dates.len() > 31 {
        return Err("Оберіть від одного до 31 дня в одному рядку.".to_string());
    }
    let mut unique = std::collections::BTreeSet::new();
    for date in status_dates {
        validate_status_date(&date)?;
        unique.insert(date);
    }
    let month = unique
        .iter()
        .next()
        .map(|date| &date[..7])
        .unwrap_or_default();
    if unique.iter().any(|date| &date[..7] != month) {
        return Err("Групова зміна дозволена лише в межах одного місяця.".to_string());
    }
    let transaction = connection
        .transaction()
        .map_err(|_| "Не вдалося почати групове оновлення виплат.".to_string())?;
    for date in unique {
        save_status(&transaction, personnel_id, &date, status)?;
    }
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити групове оновлення виплат.".to_string())
}

#[tauri::command]
pub(crate) fn export_payments_report(
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
    month: String,
    path: String,
    report_kind: Option<String>,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    let settings = settings::load(&crate::application_root(&app)?)?;
    export_report(
        &database.connection,
        &month,
        Path::new(&path),
        settings.unit.ksp_in_bro,
        report_kind.as_deref().unwrap_or("duty"),
        &settings,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::{fs::File, io::Read};
    use zip::ZipArchive;

    fn database() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(1,'солдат','ІВАНЕНКО','Іван','Іванович','оператор','1234567890','','','','','','','')", []).unwrap();
        connection
    }

    #[test]
    fn returns_a_complete_month_and_keeps_manual_override_separate_from_the_fact() {
        let connection = database();
        save_status(&connection, 1, "2026-10-05", "БР").unwrap();
        let month = list_month(&connection, "2026-10").unwrap();
        assert_eq!(month.len(), 31);
        let day = month
            .iter()
            .find(|item| item.status_date == "2026-10-05")
            .unwrap();
        assert_eq!(day.status, "БР");
        assert_eq!(day.report_code, "100");
        assert_eq!(day.tone, "green");
        assert_eq!(day.actual_location, "Даних немає");
        assert_eq!(day.manual_override.as_deref(), Some("БР"));
        save_status(&connection, 1, "2026-10-05", "").unwrap();
        let cleared = list_month(&connection, "2026-10").unwrap();
        let day = cleared
            .iter()
            .find(|item| item.status_date == "2026-10-05")
            .unwrap();
        assert_eq!(day.status, "30");
        assert!(day.manual_override.is_none());
        assert!(save_status(&connection, 1, "2026-10-05", "АЛКО").is_err());
    }

    #[test]
    fn saves_a_selected_day_range_in_one_transaction() {
        let mut connection = database();
        save_statuses(
            &mut connection,
            1,
            vec![
                "2026-10-01".into(),
                "2026-10-02".into(),
                "2026-10-03".into(),
            ],
            "30Б",
        )
        .unwrap();
        let saved: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM payment_daily_statuses WHERE personnel_id=1 AND status='30Б'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(saved, 3);

        assert!(save_statuses(
            &mut connection,
            1,
            vec!["2026-10-04".into(), "2026-11-01".into()],
            "БР",
        )
        .unwrap_err()
        .contains("одного місяця"));
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM payment_daily_statuses WHERE status_date IN ('2026-10-04','2026-11-01')",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
    }

    #[test]
    fn joins_adjacent_dates_and_keeps_separate_periods() {
        let person = PersonMonth {
            rank: "солдат".into(),
            full_name: "ІВАНЕНКО Іван".into(),
            tax_id: "1".into(),
            statuses: [
                ("2026-10-01", "100"),
                ("2026-10-02", "100"),
                ("2026-10-04", "100"),
            ]
            .into_iter()
            .map(|(date, report_code)| {
                (
                    validate_status_date(date).unwrap(),
                    DailyReportValue {
                        report_code: report_code.into(),
                    },
                )
            })
            .collect(),
        };
        let periods = periods_for(&person, "100");
        assert_eq!(
            periods,
            vec![
                (
                    validate_status_date("2026-10-01").unwrap(),
                    validate_status_date("2026-10-02").unwrap()
                ),
                (
                    validate_status_date("2026-10-04").unwrap(),
                    validate_status_date("2026-10-04").unwrap()
                )
            ]
        );
    }

    #[test]
    fn disciplinary_status_excludes_other_sections_but_not_500() {
        let person = PersonMonth {
            rank: "солдат".into(),
            full_name: "ІВАНЕНКО Іван".into(),
            tax_id: "1".into(),
            statuses: [
                ("2026-10-01", "100"),
                ("2026-10-02", "Д"),
                ("2026-10-03", "500"),
            ]
            .into_iter()
            .map(|(date, report_code)| {
                (
                    validate_status_date(date).unwrap(),
                    DailyReportValue {
                        report_code: report_code.into(),
                    },
                )
            })
            .collect(),
        };
        assert!(periods_for(&person, "100").is_empty());
        assert_eq!(periods_for(&person, "Д").len(), 1);
        assert_eq!(periods_for(&person, "500").len(), 1);
    }

    #[test]
    fn disciplinary_incident_fills_the_entire_event_month_and_cannot_be_overridden() {
        let connection = database();
        save_status(&connection, 1, "2026-10-01", "БР").unwrap();
        connection.execute("INSERT INTO incidents(id,incident_type,status,occurred_at,archived_at) VALUES(7,'СЗЧ','Зареєстровано','2026-10-18T09:15','2026-11-01T10:00')", []).unwrap();
        connection.execute("INSERT INTO incident_personnel(incident_id,personnel_id,full_name_snapshot,selection_order) VALUES(7,1,'ІВАНЕНКО Іван',0)", []).unwrap();

        let month = list_month(&connection, "2026-10").unwrap();
        assert_eq!(month.len(), 31);
        assert!(month.iter().all(|item| item.status == "СЗЧ"));
        assert!(month.iter().all(|item| item.report_code == "Д"));
        assert!(month.iter().all(|item| item.tone == "danger"));
        assert!(month.iter().all(|item| item.manual_override.is_none()));
        assert!(save_status(&connection, 1, "2026-10-01", "БР").is_err());
    }

    #[test]
    fn frozen_flight_personnel_receives_green_combat_status() {
        let connection = database();
        connection.execute(
            "INSERT INTO flight_journal_entries(flight_date,sky_time,crew_name_snapshot,position_name_snapshot,personnel_snapshot_json)
             VALUES('2026-10-05','09:20','БАРС','САПСАН','[{\"personnelId\":1}]')",
            [],
        ).unwrap();

        let month = list_month(&connection, "2026-10").unwrap();
        let day = month
            .iter()
            .find(|item| item.status_date == "2026-10-05")
            .unwrap();
        assert_eq!(
            (
                day.status.as_str(),
                day.report_code.as_str(),
                day.tone.as_str()
            ),
            ("БР", "100", "green")
        );
        assert!(day.source_details.contains("09:20"));
        assert!(day.source_details.contains("Польотів за день: 1"));
        assert_eq!(day.actual_location, "Позиція «САПСАН» · екіпаж «БАРС»");
    }

    #[test]
    fn legacy_flight_without_frozen_personnel_uses_the_linked_saved_plan() {
        let connection = database();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(2,'солдат','ПЕТРЕНКО','Петро','Петрович','оператор','0000000002','','','','','','','')", []).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(4,'ГРІМ')", [])
            .unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json)
             VALUES(7,'2026-10-05',1,?1)",
            [r#"{"entries":[{"crewId":4,"crewName":"ГРІМ","positionName":"ХИЖАК","startTime":"06:00","actualMemberIds":[99]},{"crewId":4,"crewName":"ГРІМ","positionName":"ХИЖАК","startTime":"09:20","actualMemberIds":[1]}]}"#],
        ).unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json)
             VALUES(8,'2026-10-05',2,?1)",
            [r#"{"entries":[{"crewId":4,"crewName":"НОВИЙ ГРІМ","positionName":"ОРІОН","startTime":"09:20","actualMemberIds":[2]}]}"#],
        ).unwrap();
        connection.execute(
            "INSERT INTO flight_journal_entries(flight_date,sky_time,crew_id,snapshot_id,crew_name_snapshot,position_name_snapshot,personnel_snapshot_json)
             VALUES('2026-10-05','09:20',4,7,'','','[]')",
            [],
        ).unwrap();

        let month = list_month(&connection, "2026-10").unwrap();
        let day = month
            .iter()
            .find(|item| item.status_date == "2026-10-05")
            .unwrap();
        assert_eq!(
            (
                day.status.as_str(),
                day.report_code.as_str(),
                day.tone.as_str()
            ),
            ("БР", "100", "green")
        );
        assert_eq!(day.actual_location, "Позиція «ХИЖАК» · екіпаж «ГРІМ»");
        assert!(day.source_details.contains("час «Небо» 09:20"));
        let current_plan_member = month
            .iter()
            .find(|item| item.personnel_id == 2 && item.status_date == "2026-10-05")
            .unwrap();
        assert_eq!(
            (
                current_plan_member.report_code.as_str(),
                current_plan_member.tone.as_str()
            ),
            ("30", "yellow")
        );
    }

    #[test]
    fn legacy_flight_without_snapshot_id_uses_same_day_plan_when_actual_launch_differs() {
        let connection = database();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(4,'ГРІМ')", [])
            .unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json)
             VALUES('2026-10-05',1,?1)",
            [r#"{"entries":[{"crewId":4,"crewName":"ГРІМ","positionName":"ХИЖАК","startTime":"06:00","actualMemberIds":[1]}]}"#],
        ).unwrap();
        connection.execute(
            "INSERT INTO flight_journal_entries(flight_date,sky_time,crew_id,crew_name_snapshot,position_name_snapshot,personnel_snapshot_json)
             VALUES('2026-10-05','09:20',4,'ГРІМ','ХИЖАК','[]')",
            [],
        ).unwrap();

        let month = list_month(&connection, "2026-10").unwrap();
        let day = month
            .iter()
            .find(|item| item.status_date == "2026-10-05")
            .unwrap();
        assert_eq!(
            (day.report_code.as_str(), day.tone.as_str()),
            ("100", "green")
        );
        assert!(day.source_details.contains("Польотів за день: 1"));
        assert!(day.source_details.contains("час «Небо» 09:20"));
    }

    #[test]
    fn legacy_flight_without_plan_uses_only_crew_members_active_at_launch_time() {
        let connection = database();
        for (id, surname) in [(2, "ПІЗНІЙ"), (3, "ВИБУВ")] {
            connection.execute(
                "INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id)
                 VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','')",
                params![id, surname, format!("000000000{id}")],
            ).unwrap();
        }
        connection
            .execute("INSERT INTO crews(id,name) VALUES(4,'ГРІМ')", [])
            .unwrap();
        let flight_at = chrono::NaiveDateTime::parse_from_str(
            &local_flight_time_as_utc("2026-10-05", "09:20").unwrap(),
            "%Y-%m-%d %H:%M:%S",
        )
        .unwrap();
        connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id,joined_at,left_at) VALUES
             (4,1,?1,NULL),
             (4,2,?2,NULL),
             (4,3,?1,?3)",
                params![
                    (flight_at - Duration::days(1))
                        .format("%Y-%m-%d %H:%M:%S")
                        .to_string(),
                    (flight_at + Duration::minutes(40))
                        .format("%Y-%m-%d %H:%M:%S")
                        .to_string(),
                    (flight_at - Duration::minutes(20))
                        .format("%Y-%m-%d %H:%M:%S")
                        .to_string(),
                ],
            )
            .unwrap();
        connection.execute(
            "INSERT INTO flight_journal_entries(flight_date,sky_time,crew_id,crew_name_snapshot,position_name_snapshot,personnel_snapshot_json)
             VALUES('2026-10-05','09:20',4,'ГРІМ','ХИЖАК','[]')",
            [],
        ).unwrap();

        let month = list_month(&connection, "2026-10").unwrap();
        let active_member = month
            .iter()
            .find(|item| item.personnel_id == 1 && item.status_date == "2026-10-05")
            .unwrap();
        assert_eq!(
            (
                active_member.report_code.as_str(),
                active_member.tone.as_str()
            ),
            ("100", "green")
        );
        assert!(active_member.source_details.contains("Польотів за день: 1"));
        for personnel_id in [2, 3] {
            let inactive_member = month
                .iter()
                .find(|item| item.personnel_id == personnel_id && item.status_date == "2026-10-05")
                .unwrap();
            assert_eq!(
                (
                    inactive_member.report_code.as_str(),
                    inactive_member.tone.as_str()
                ),
                ("30", "white")
            );
        }
    }

    #[test]
    fn authoritative_plan_boundaries_never_fall_back_to_official_crew_members() {
        let connection = database();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(4,'ГРІМ')", [])
            .unwrap();
        connection.execute(
            "INSERT INTO crew_members(crew_id,personnel_id,joined_at) VALUES(4,1,'2026-01-01 00:00:00')",
            [],
        ).unwrap();
        for (date, snapshot, sky_time) in [
            (
                "2026-10-05",
                r#"{"entries":[{"crewId":4,"crewName":"ГРІМ","positionName":"ХИЖАК","startTime":"10:00","actualMemberIds":[1],"arrivesToday":true}]}"#,
                "09:20",
            ),
            (
                "2026-10-06",
                r#"{"entries":[{"crewId":4,"crewName":"ГРІМ","positionName":"ХИЖАК","startTime":"06:00","actualMemberIds":[1],"departsToday":true,"departureTime":"09:00"}]}"#,
                "09:20",
            ),
        ] {
            connection.execute(
                "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json) VALUES(?1,1,?2)",
                params![date, snapshot],
            ).unwrap();
            connection.execute(
                "INSERT INTO flight_journal_entries(flight_date,sky_time,crew_id,crew_name_snapshot,position_name_snapshot,personnel_snapshot_json)
                 VALUES(?1,?2,4,'ГРІМ','ХИЖАК','[]')",
                params![date, sky_time],
            ).unwrap();
        }

        let month = list_month(&connection, "2026-10").unwrap();
        for date in ["2026-10-05", "2026-10-06"] {
            let day = month
                .iter()
                .find(|item| item.personnel_id == 1 && item.status_date == date)
                .unwrap();
            assert_eq!(day.report_code, "30");
            assert!(!day.source_details.contains("Польотів за день"));
        }
    }

    #[test]
    fn several_daily_flights_are_counted_and_listed_with_exact_times() {
        let connection = database();
        for (time, crew, position) in [("09:20", "ГРІМ", "ХИЖАК"), ("14:35", "ВІТЕР", "ОРІОН")]
        {
            connection.execute(
                "INSERT INTO flight_journal_entries(flight_date,sky_time,crew_name_snapshot,position_name_snapshot,personnel_snapshot_json)
                 VALUES('2026-10-05',?1,?2,?3,'[{\"personnelId\":1}]')",
                params![time, crew, position],
            ).unwrap();
        }

        let month = list_month(&connection, "2026-10").unwrap();
        let day = month
            .iter()
            .find(|item| item.status_date == "2026-10-05")
            .unwrap();
        assert_eq!(
            (day.report_code.as_str(), day.tone.as_str()),
            ("100", "green")
        );
        assert!(day.source_details.contains("Польотів за день: 2"));
        assert!(day.source_details.contains("09:20"));
        assert!(day.source_details.contains("14:35"));
        assert!(day
            .actual_location
            .contains("Позиція «ХИЖАК» · екіпаж «ГРІМ»"));
        assert!(day
            .actual_location
            .contains("Позиція «ОРІОН» · екіпаж «ВІТЕР»"));
    }

    #[test]
    fn position_presence_names_the_saved_crew_and_position() {
        let connection = database();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json)
             VALUES('2026-10-05',1,?1)",
            [r#"{"entries":[{"crewId":4,"crewName":"ГРІМ","positionName":"ХИЖАК","startTime":"09:20","actualMemberIds":[1]}]}"#],
        ).unwrap();

        let month = list_month(&connection, "2026-10").unwrap();
        let day = month
            .iter()
            .find(|item| item.status_date == "2026-10-05")
            .unwrap();
        assert_eq!(
            (day.report_code.as_str(), day.tone.as_str()),
            ("30", "yellow")
        );
        assert_eq!(day.actual_location, "Позиція «ХИЖАК» · екіпаж «ГРІМ»");
        assert!(day.source_details.contains("Екіпаж «ГРІМ»"));
        assert!(day.source_details.contains("позиції «ХИЖАК»"));
    }

    #[test]
    fn position_work_uses_the_bro_snapshot_for_green_or_yellow() {
        let connection = database();
        connection.execute(
            "INSERT INTO position_work_events(work_id,position_name,work_type,status,start_date,start_time,end_date,end_time,in_bro,members_json)
             VALUES(4,'САПСАН','Облаштування','Завершили','2026-10-03','08:00','2026-10-03','12:00',1,
                    '[{\"personnelId\":1,\"dutyType\":\"Облаштування\",\"startDate\":\"2026-10-03\",\"startTime\":\"08:00\",\"endDate\":\"2026-10-03\",\"endTime\":\"12:00\"}]')",
            [],
        ).unwrap();

        let month = list_month(&connection, "2026-10").unwrap();
        let day = month
            .iter()
            .find(|item| item.status_date == "2026-10-03")
            .unwrap();
        assert_eq!(
            (
                day.status.as_str(),
                day.report_code.as_str(),
                day.tone.as_str()
            ),
            ("БР", "100", "green")
        );
        assert_eq!(day.actual_location, "Облаштування · позиція «САПСАН»");
        assert!(day.source_details.contains("2026-10-03 08:00"));
        assert!(day.source_details.contains("Входить в БРО"));

        connection
            .execute("DELETE FROM position_work WHERE id=4", [])
            .unwrap();
        let after_work_deletion = list_month(&connection, "2026-10").unwrap();
        let day = after_work_deletion
            .iter()
            .find(|item| item.status_date == "2026-10-03")
            .unwrap();
        assert_eq!(
            (day.report_code.as_str(), day.tone.as_str()),
            ("100", "green")
        );
    }

    #[test]
    fn personnel_control_maps_training_outside_the_unit_to_blue_30u() {
        let connection = database();
        if !table_has_column(
            &connection,
            "personnel_control_assignments",
            "training_in_unit",
        ) {
            connection.execute("ALTER TABLE personnel_control_assignments ADD COLUMN training_in_unit INTEGER NOT NULL DEFAULT 0", []).unwrap();
        }
        connection.execute("INSERT INTO personnel_control_assignments(personnel_id,location_type,institution,start_date,end_date,previous_location,training_in_unit) VALUES(1,'НАВЧ','Навчальний центр','2026-10-10','2026-10-12','ОХ',0)", []).unwrap();

        let month = list_month(&connection, "2026-10").unwrap();
        for date in ["2026-10-10", "2026-10-11", "2026-10-12"] {
            let day = month.iter().find(|item| item.status_date == date).unwrap();
            assert_eq!(
                (
                    day.status.as_str(),
                    day.report_code.as_str(),
                    day.tone.as_str()
                ),
                ("30Б", "30У", "blue")
            );
        }
    }

    #[test]
    fn leave_and_training_in_the_unit_are_blank_and_override_stale_work_facts() {
        let connection = database();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(2,'солдат','ПЕТРЕНКО','Петро','Петрович','оператор','0000000002','','','','','','','')", []).unwrap();
        connection.execute("INSERT INTO personnel_control_assignments(personnel_id,location_type,institution,start_date,end_date,previous_location,training_in_unit) VALUES(1,'ВІДП','','2026-10-05','2026-10-05','ОХ',0)", []).unwrap();
        connection.execute("INSERT INTO personnel_control_assignments(personnel_id,location_type,institution,start_date,end_date,previous_location,training_in_unit) VALUES(2,'НАВЧ','У військовій частині','2026-10-06','2026-10-06','ОХ',1)", []).unwrap();
        for (personnel_id, date, time) in [(1, "2026-10-05", "09:20"), (2, "2026-10-06", "10:30")] {
            connection.execute(
                "INSERT INTO flight_journal_entries(flight_date,sky_time,crew_name_snapshot,position_name_snapshot,personnel_snapshot_json)
                 VALUES(?1,?2,'БАРС','САПСАН',?3)",
                params![date, time, format!("[{{\"personnelId\":{personnel_id}}}]")],
            ).unwrap();
        }

        let month = list_month(&connection, "2026-10").unwrap();
        for (personnel_id, date) in [(1, "2026-10-05"), (2, "2026-10-06")] {
            let day = month
                .iter()
                .find(|item| item.personnel_id == personnel_id && item.status_date == date)
                .unwrap();
            assert_eq!(
                (
                    day.status.as_str(),
                    day.report_code.as_str(),
                    day.tone.as_str()
                ),
                ("", "", "empty")
            );
        }
    }

    #[test]
    fn supports_all_manual_payment_choices_including_blank() {
        let connection = database();
        for (day, stored, effective, code, tone) in [
            ("01", "БР", "БР", "100", "green"),
            ("02", "БР30", "БР", "30", "yellow"),
            ("03", "30Б", "30Б", "30У", "blue"),
            ("04", "30", "30", "30", "white"),
            ("05", "ПУСТО", "", "", "empty"),
        ] {
            save_status(&connection, 1, &format!("2026-10-{day}"), stored).unwrap();
            let month = list_month(&connection, "2026-10").unwrap();
            let item = month
                .iter()
                .find(|item| item.status_date == format!("2026-10-{day}"))
                .unwrap();
            assert_eq!(
                (
                    item.status.as_str(),
                    item.report_code.as_str(),
                    item.tone.as_str(),
                    item.manual_override.as_deref()
                ),
                (effective, code, tone, Some(stored))
            );
        }
        assert!(save_status(&connection, 1, "2026-10-06", "100").is_err());
    }

    #[test]
    fn ksp_duties_follow_the_unit_bro_flag() {
        let connection = database();
        let manual = serde_json::json!({
            "commandDuties": [{
                "personnelId": 1,
                "periods": [{"startDate":"2026-10-02","startTime":"18:01","endDate":"2026-10-03","endTime":"06:00"}]
            }],
            "guardDuties": []
        });
        connection.execute("INSERT INTO summary_report_drafts(report_date,manual_json) VALUES('2026-10-03',?1)", [manual.to_string()]).unwrap();

        let green = list_month_with_context(&connection, "2026-10", true).unwrap();
        let day = green
            .iter()
            .find(|item| item.status_date == "2026-10-02")
            .unwrap();
        assert_eq!(
            (day.report_code.as_str(), day.tone.as_str()),
            ("100", "green")
        );
        let yellow = list_month_with_context(&connection, "2026-10", false).unwrap();
        let day = yellow
            .iter()
            .find(|item| item.status_date == "2026-10-02")
            .unwrap();
        assert_eq!(
            (day.report_code.as_str(), day.tone.as_str()),
            ("30", "yellow")
        );
    }

    fn zip_text(path: &Path, name: &str) -> String {
        let mut archive = ZipArchive::new(File::open(path).unwrap()).unwrap();
        let mut xml = String::new();
        archive
            .by_name(name)
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        xml
    }

    fn zip_bytes(path: &Path, name: &str) -> Vec<u8> {
        let mut archive = ZipArchive::new(File::open(path).unwrap()).unwrap();
        let mut bytes = Vec::new();
        archive
            .by_name(name)
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        bytes
    }

    fn template_bytes(template: &[u8], name: &str) -> Vec<u8> {
        let mut archive = ZipArchive::new(Cursor::new(template)).unwrap();
        let mut bytes = Vec::new();
        archive
            .by_name(name)
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        bytes
    }

    #[test]
    fn exports_both_reports_without_changing_template_structure() {
        let connection = database();
        save_status(&connection, 1, "2026-10-05", "БР").unwrap();
        for (id, surname, given, rank, tax_id) in [
            (2, "ПЕТРЕНКО", "Петро", "старший солдат", "0000000002"),
            (3, "СИДОРЕНКО", "Сидір", "сержант", "0000000003"),
            (4, "КОВАЛЕНКО", "Коваль", "капітан", "0000000004"),
        ] {
            connection.execute(
                "INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id)
                 VALUES(?1,?2,?3,?4,'Тестович','посада',?5,'','','','','','','')",
                params![id, rank, surname, given, tax_id],
            ).unwrap();
        }
        save_status(&connection, 2, "2026-10-06", "БР30").unwrap();
        save_status(&connection, 3, "2026-10-07", "30Б").unwrap();
        connection.execute("INSERT INTO incidents(id,incident_type,status,occurred_at) VALUES(8,'Алкогольне/наркотичне сп’яніння','Зареєстровано','2026-10-08T11:00')", []).unwrap();
        connection.execute("INSERT INTO incident_personnel(incident_id,personnel_id,full_name_snapshot,selection_order) VALUES(8,4,'КОВАЛЕНКО Коваль Тестович',0)", []).unwrap();
        connection.execute("INSERT INTO temporary_personnel(full_name,rank,arrived_at,category,group_name) VALUES('МИРОНЕНКО Мирон Тестович','солдат','2026-10-02','Прикомандировані','2 рота')", []).unwrap();

        let mut app_settings = settings::defaults();
        app_settings.unit.unit_code = "А1234".into();
        app_settings.main_signer.position = "Командир підрозділу".into();
        app_settings.main_signer.rank = "майор".into();
        app_settings.main_signer.full_name = "БОНДАРЕНКО Богдан Петрович".into();
        let duty_path =
            std::env::temp_dir().join(format!("payments-duty-{}.xlsx", std::process::id()));
        export_report(
            &connection,
            "2026-10",
            &duty_path,
            false,
            "duty",
            &app_settings,
        )
        .unwrap();
        let duty_sheet = zip_text(&duty_path, "xl/worksheets/sheet1.xml");
        let duty_workbook = zip_text(&duty_path, "xl/workbook.xml");
        let duty_strings = zip_text(&duty_path, "xl/sharedStrings.xml");
        for value in [
            "ІВАНЕНКО Іван Іванович",
            "1234567890",
            "ПЕТРЕНКО Петро Тестович",
            "КОВАЛЕНКО Коваль Тестович",
            "МИРОНЕНКО Мирон Тестович",
            "05.10.2026",
        ] {
            assert!(duty_sheet.contains(value), "missing {value}");
        }
        assert!(duty_sheet.contains("<mergeCell ref=\"A15:F15\"/>"));
        assert!(duty_sheet.contains("<rowBreaks count=\"2\" manualBreakCount=\"2\"><brk id=\"20\""));
        assert!(duty_sheet.contains("<brk id=\"29\""));
        assert!(duty_sheet.contains("<dimension ref=\"A1:F69\"/>"));
        assert!(duty_sheet.contains("<headerFooter differentFirst=\"true\""));
        assert!(!duty_sheet.contains("1048576"));
        assert!(!duty_sheet.contains("XFD"));
        assert!(duty_workbook.contains("name=\"Жовтень 2026\""));
        assert!(duty_workbook.contains("&apos;Жовтень 2026&apos;!$A$1:$F$69"));
        assert!(duty_strings.contains("А1234"));
        assert!(duty_strings.contains("Командир підрозділу"));
        assert!(duty_strings.contains("майор"));
        assert!(duty_strings.contains("Богдан БОНДАРЕНКО"));
        assert_eq!(
            zip_bytes(&duty_path, "xl/styles.xml"),
            template_bytes(DUTY_REPORT_TEMPLATE, "xl/styles.xml")
        );

        let ten_k_path =
            std::env::temp_dir().join(format!("payments-10k-{}.xlsx", std::process::id()));
        export_report(
            &connection,
            "2026-10",
            &ten_k_path,
            false,
            "tenK",
            &app_settings,
        )
        .unwrap();
        let ten_k_sheet = zip_text(&ten_k_path, "xl/worksheets/sheet1.xml");
        let ten_k_workbook = zip_text(&ten_k_path, "xl/workbook.xml");
        let ten_k_strings = zip_text(&ten_k_path, "xl/sharedStrings.xml");
        assert!(ten_k_sheet.contains("СИДОРЕНКО Сидір Тестович"));
        assert!(ten_k_sheet.contains("КОВАЛЕНКО Коваль Тестович"));
        assert!(ten_k_sheet.contains("<c r=\"F9\" s=\"23\""));
        assert!(ten_k_sheet.contains("<c r=\"F13\" s=\"24\""));
        assert!(ten_k_sheet.contains("<mergeCell ref=\"A10:F10\"/>"));
        assert!(ten_k_sheet.contains("<mergeCell ref=\"A11:F11\"/>"));
        assert!(ten_k_sheet.contains("<mergeCell ref=\"A16:F16\"/>"));
        assert!(ten_k_sheet.contains("<dimension ref=\"A1:F21\"/>"));
        assert!(ten_k_sheet.contains("<headerFooter differentFirst=\"true\""));
        assert!(!ten_k_sheet.contains("1048576"));
        assert!(!ten_k_sheet.contains("XFD"));
        assert!(ten_k_workbook.contains("name=\"Жовтень 2026\""));
        assert!(ten_k_workbook.contains("&apos;Жовтень 2026&apos;!$A$1:$F$21"));
        assert!(ten_k_strings.contains("<r><rPr><sz val=\"14\""));
        assert!(ten_k_strings.contains("<rPr><sz val=\"12\""));
        assert!(ten_k_strings.contains("А1234"));
        assert_eq!(
            zip_bytes(&ten_k_path, "xl/styles.xml"),
            template_bytes(TEN_K_REPORT_TEMPLATE, "xl/styles.xml")
        );
        let _ = std::fs::remove_file(duty_path);
        let _ = std::fs::remove_file(ten_k_path);
    }
}
