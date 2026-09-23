use crate::AppState;
use chrono::{Duration, Local, Months, NaiveDate};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::File,
    io::{Cursor, Read, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

const TEMPLATE: &[u8] = include_bytes!("../resources/flight-plan-template.xlsx");
const FLIGHT_PLAN_RETENTION_MONTHS: u32 = 3;
const FLIGHT_PLAN_FUTURE_DAYS: i64 = 7;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightPlanWeather {
    temperature: String,
    wind_from: String,
    wind_to: String,
    gust_from: String,
    gust_to: String,
    cloudiness: String,
    cloud_height: String,
    precipitation: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightPlanEntry {
    crew_id: i64,
    #[serde(default)]
    actual_member_ids: Vec<i64>,
    #[serde(default)]
    actual_commander_id: Option<i64>,
    #[serde(default)]
    actual_vehicle_id: Option<i64>,
    #[serde(default)]
    without_vehicle: bool,
    weather: FlightPlanWeather,
    route_points: Vec<String>,
    altitude_from: String,
    altitude_to: String,
    area_points: Vec<String>,
    task: String,
    start_time: String,
    end_time: String,
    #[serde(default)]
    uav_selections: Vec<FlightPlanUavSelection>,
    #[serde(default)]
    payload_selection: Option<FlightPlanPayloadSelection>,
    #[serde(default)]
    rotation_id: Option<String>,
    #[serde(default)]
    crew_name: String,
    #[serde(default)]
    crew_uav_type: String,
    #[serde(default)]
    position_id: Option<i64>,
    #[serde(default)]
    position_name: String,
    #[serde(default)]
    position_mgrs: String,
    #[serde(default)]
    position_locality: String,
    #[serde(default)]
    work_strip: String,
    #[serde(default)]
    battle_order: String,
    #[serde(default)]
    uav_snapshots: Vec<FlightPlanUavSnapshot>,
    #[serde(default)]
    member_snapshots: Vec<FlightPlanMemberSnapshot>,
    #[serde(default)]
    arrives_today: bool,
    #[serde(default)]
    departs_today: bool,
    #[serde(default)]
    departure_time: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightPlanUavSnapshot {
    equipment_id: i64,
    name: String,
    serial_number: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightPlanMemberSnapshot {
    personnel_id: i64,
    full_name: String,
    rank: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightPlanUavSelection {
    equipment_id: i64,
    day_quantity: i64,
    night_quantity: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightPlanPayloadSelection {
    source_type: String,
    source_id: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightPlanRequest {
    unit_name: String,
    entries: Vec<FlightPlanEntry>,
}

#[derive(Debug, Clone)]
pub(crate) struct FlightPlanLocationStage {
    pub member_ids: Vec<i64>,
    pub start_time: String,
}

#[derive(Debug, Clone)]
pub(crate) struct FlightPlanLocationSchedule {
    pub crew_id: i64,
    pub stages: Vec<FlightPlanLocationStage>,
    pub arrives_on_plan_date: bool,
    pub departs_on_plan_date: bool,
    pub departure_time: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredLocationRequest {
    #[serde(default)]
    entries: Vec<StoredLocationEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredLocationEntry {
    crew_id: i64,
    #[serde(default)]
    actual_member_ids: Vec<i64>,
    #[serde(default)]
    start_time: String,
    #[serde(default)]
    arrives_today: bool,
    #[serde(default)]
    departs_today: bool,
    #[serde(default)]
    departure_time: String,
}

pub(crate) fn flight_plan_location_schedule(
    connection: &Connection,
    plan_date: &str,
) -> Result<Option<Vec<FlightPlanLocationSchedule>>, String> {
    let mut inferred_from_next_day = false;
    let mut snapshot = connection
        .query_row(
            "SELECT snapshot_json FROM flight_plan_snapshots
             WHERE plan_date=?1 ORDER BY revision DESC LIMIT 1",
            [plan_date],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "Не вдалося прочитати знімок плану для синхронізації БЧС.".to_string())?;
    if snapshot.is_none() {
        let next_date = parse_plan_date(plan_date)? + Duration::days(1);
        snapshot = connection
            .query_row(
                "SELECT snapshot_json FROM flight_plan_snapshots
                 WHERE plan_date=?1 ORDER BY revision DESC LIMIT 1",
                [next_date.format("%Y-%m-%d").to_string()],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|_| "Не вдалося прочитати завтрашній план для підтвердження поточного складу на позиціях.".to_string())?;
        inferred_from_next_day = snapshot.is_some();
    }
    let Some(snapshot) = snapshot else {
        return Ok(None);
    };
    let request: StoredLocationRequest = serde_json::from_str(&snapshot)
        .map_err(|_| "Збережений знімок плану польотів пошкоджено.".to_string())?;
    let mut first_crews = std::collections::HashSet::new();
    let arriving_crews = request
        .entries
        .iter()
        .filter(|entry| first_crews.insert(entry.crew_id) && entry.arrives_today)
        .map(|entry| entry.crew_id)
        .collect::<std::collections::HashSet<_>>();
    let mut schedules = Vec::<FlightPlanLocationSchedule>::new();
    for entry in request.entries {
        if inferred_from_next_day && arriving_crews.contains(&entry.crew_id) {
            continue;
        }
        if inferred_from_next_day
            && schedules
                .iter()
                .any(|schedule| schedule.crew_id == entry.crew_id)
        {
            continue;
        }
        if let Some(schedule) = schedules
            .iter_mut()
            .find(|schedule| schedule.crew_id == entry.crew_id)
        {
            schedule.stages.push(FlightPlanLocationStage {
                member_ids: entry.actual_member_ids,
                start_time: entry.start_time,
            });
            continue;
        }
        schedules.push(FlightPlanLocationSchedule {
            crew_id: entry.crew_id,
            stages: vec![FlightPlanLocationStage {
                member_ids: entry.actual_member_ids,
                start_time: if inferred_from_next_day {
                    "00:00".into()
                } else {
                    entry.start_time
                },
            }],
            arrives_on_plan_date: !inferred_from_next_day && entry.arrives_today,
            departs_on_plan_date: !inferred_from_next_day && entry.departs_today,
            departure_time: if inferred_from_next_day {
                String::new()
            } else {
                entry.departure_time
            },
        });
    }
    Ok(Some(schedules))
}

fn parse_plan_date(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| "Некоректна дата плану польотів.".to_string())
}

fn retention_start(today: NaiveDate) -> NaiveDate {
    today
        .checked_sub_months(Months::new(FLIGHT_PLAN_RETENTION_MONTHS))
        .unwrap_or(NaiveDate::MIN)
}

fn latest_plannable_date(today: NaiveDate) -> NaiveDate {
    today
        .checked_add_signed(Duration::days(FLIGHT_PLAN_FUTURE_DAYS))
        .unwrap_or(NaiveDate::MAX)
}

fn retained_snapshot_start(today: NaiveDate) -> NaiveDate {
    retention_start(today)
        .checked_sub_signed(Duration::days(1))
        .unwrap_or(NaiveDate::MIN)
}

fn validate_plan_date_for_save(plan_date: NaiveDate, today: NaiveDate) -> Result<(), String> {
    if plan_date < retention_start(today) {
        return Err(
            "Знімок плану можна змінювати лише в межах останніх 3 календарних місяців.".to_string(),
        );
    }
    if plan_date > latest_plannable_date(today) {
        return Err("План польотів можна створити максимум на 7 днів уперед.".to_string());
    }
    Ok(())
}

fn validate_plan_date_for_read(plan_date: NaiveDate, today: NaiveDate) -> Result<bool, String> {
    if plan_date < retained_snapshot_start(today) {
        // Старі звіти можуть звертатися до вже очищеного знімка. Відсутній
        // знімок для них є штатним станом, а не помилкою всього звіту.
        return Ok(false);
    }
    if plan_date > latest_plannable_date(today) {
        return Err("План польотів доступний максимум на 7 днів уперед.".to_string());
    }
    Ok(true)
}

fn purge_expired_flight_plan_snapshots(
    connection: &Connection,
    today: NaiveDate,
) -> Result<usize, String> {
    // D−1 is a hidden dependency of the oldest selectable report date, so it
    // remains readable even though users can no longer edit that plan.
    let cutoff = retained_snapshot_start(today)
        .format("%Y-%m-%d")
        .to_string();
    connection
        .execute(
            "DELETE FROM flight_plan_snapshots WHERE plan_date < ?1",
            [cutoff],
        )
        .map_err(|_| "Не вдалося очистити застарілі знімки планів польотів.".to_string())
}

fn save_flight_plan_snapshot_at(
    connection: &Connection,
    today: NaiveDate,
    plan_date: &str,
    request: &FlightPlanRequest,
) -> Result<(), String> {
    let parsed_plan_date = parse_plan_date(plan_date)?;
    validate_plan_date_for_save(parsed_plan_date, today)?;
    let snapshot_json = serde_json::to_string(request)
        .map_err(|_| "Не вдалося підготувати знімок плану польотів.".to_string())?;
    let plan_date = parsed_plan_date.format("%Y-%m-%d").to_string();
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося розпочати збереження плану польотів.".to_string())?;
    purge_expired_flight_plan_snapshots(&transaction, today)?;
    infer_previous_day_departures(&transaction, parsed_plan_date, request)?;
    let canonical_id = transaction
        .query_row(
            "SELECT id FROM flight_plan_snapshots
             WHERE plan_date=?1 ORDER BY revision DESC,id DESC LIMIT 1",
            [&plan_date],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|_| "Не вдалося перевірити попередній знімок плану польотів.".to_string())?;
    if let Some(canonical_id) = canonical_id {
        // Старі версії могли створювати кілька revision на одну дату. Зберігаємо
        // id найновішої, щоб не розірвати посилання журналу на актуальний знімок.
        transaction
            .execute(
                "DELETE FROM flight_plan_snapshots WHERE plan_date=?1 AND id<>?2",
                rusqlite::params![plan_date, canonical_id],
            )
            .map_err(|_| "Не вдалося узгодити попередні версії плану польотів.".to_string())?;
        transaction
            .execute(
                "DELETE FROM flight_plan_snapshot_entries WHERE snapshot_id=?1",
                [canonical_id],
            )
            .map_err(|_| "Не вдалося очистити застарілий склад знімка плану.".to_string())?;
        transaction
            .execute(
                "UPDATE flight_plan_snapshots
                 SET revision=1,source='saved',snapshot_json=?1,created_at=CURRENT_TIMESTAMP
                 WHERE id=?2",
                rusqlite::params![snapshot_json, canonical_id],
            )
            .map_err(|_| "Не вдалося оновити знімок плану польотів.".to_string())?;
    } else {
        transaction
            .execute(
                "INSERT INTO flight_plan_snapshots(plan_date,revision,source,snapshot_json)
             VALUES(?1,1,'saved',?2)",
                rusqlite::params![plan_date, snapshot_json],
            )
            .map_err(|_| "Не вдалося зберегти знімок плану польотів.".to_string())?;
    }
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити збереження плану польотів.".to_string())?;
    Ok(())
}

fn entry_position_key(entry: &FlightPlanEntry) -> String {
    entry
        .position_id
        .map(|id| format!("id:{id}"))
        .unwrap_or_else(|| format!("name:{}", entry.position_name.trim().to_uppercase()))
}

fn infer_previous_day_departures(
    connection: &Connection,
    plan_date: NaiveDate,
    current: &FlightPlanRequest,
) -> Result<(), String> {
    let previous_date = (plan_date - Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let Some((snapshot_id, snapshot_json)) = connection.query_row(
        "SELECT id,snapshot_json FROM flight_plan_snapshots WHERE plan_date=?1 ORDER BY revision DESC,id DESC LIMIT 1",
        [&previous_date],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
    ).optional().map_err(|_| "Не вдалося прочитати попередній план для визначення заміни екіпажів.".to_string())? else {
        return Ok(());
    };
    let mut previous: FlightPlanRequest = serde_json::from_str(&snapshot_json)
        .map_err(|_| "Попередній знімок плану польотів пошкоджено.".to_string())?;
    let current_crews = current
        .entries
        .iter()
        .map(|entry| entry.crew_id)
        .collect::<std::collections::HashSet<_>>();
    let mut changed = false;
    let previous_copy = previous.entries.clone();
    for entry in &mut previous.entries {
        if entry.rotation_id.is_some()
            || entry.departs_today
            || current_crews.contains(&entry.crew_id)
        {
            continue;
        }
        let key = entry_position_key(entry);
        let replacement_time = previous_copy
            .iter()
            .filter(|candidate| {
                candidate.crew_id != entry.crew_id
                    && current_crews.contains(&candidate.crew_id)
                    && entry_position_key(candidate) == key
            })
            .filter_map(|candidate| {
                minute_value(&candidate.start_time)
                    .map(|minute| (minute, candidate.start_time.clone()))
            })
            .min_by_key(|(minute, _)| *minute)
            .map(|(_, value)| value);
        if let Some(departure_time) = replacement_time {
            entry.departs_today = true;
            entry.departure_time = departure_time;
            changed = true;
        }
    }
    if changed {
        let updated = serde_json::to_string(&previous)
            .map_err(|_| "Не вдалося оновити попередній план заміни екіпажів.".to_string())?;
        connection
            .execute(
                "UPDATE flight_plan_snapshots SET snapshot_json=?1 WHERE id=?2",
                rusqlite::params![updated, snapshot_id],
            )
            .map_err(|_| "Не вдалося зберегти автоматично визначений виїзд екіпажу.".to_string())?;
    }
    Ok(())
}

fn minute_value(value: &str) -> Option<u32> {
    let (hour, minute) = value.trim().split_once(':')?;
    let hour = hour.parse::<u32>().ok()?;
    let minute = minute.parse::<u32>().ok()?;
    (hour < 24 && minute < 60).then_some(hour * 60 + minute)
}

fn get_flight_plan_snapshot_at(
    connection: &Connection,
    today: NaiveDate,
    plan_date: &str,
) -> Result<Option<String>, String> {
    let plan_date = parse_plan_date(plan_date)?;
    let is_retained = validate_plan_date_for_read(plan_date, today)?;
    if !is_retained {
        return Ok(None);
    }
    connection.query_row(
        "SELECT snapshot_json FROM flight_plan_snapshots WHERE plan_date=?1 ORDER BY revision DESC LIMIT 1",
        [plan_date.format("%Y-%m-%d").to_string()],
        |row| row.get(0),
    ).optional().map_err(|_| "Не вдалося прочитати знімок плану польотів.".to_string())
}

#[tauri::command]
pub fn save_flight_plan_snapshot(
    state: tauri::State<AppState>,
    plan_date: String,
    request: FlightPlanRequest,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    save_flight_plan_snapshot_at(
        &database.connection,
        Local::now().date_naive(),
        &plan_date,
        &request,
    )
}

#[tauri::command]
pub fn get_flight_plan_snapshot(
    state: tauri::State<AppState>,
    plan_date: String,
) -> Result<Option<String>, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    get_flight_plan_snapshot_at(&database.connection, Local::now().date_naive(), &plan_date)
}

#[derive(Debug, Clone)]
struct PersonLine {
    id: i64,
    full_name: String,
    rank: String,
    position: String,
    callsign: String,
}

#[derive(Debug, Clone)]
struct ExportRow {
    values: [String; 14],
    start: f64,
    end: f64,
}

fn esc(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn inline_cell(column: char, row: usize, value: &str, style: usize) -> String {
    format!(
        r#"<c r="{column}{row}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{}</t></is></c>"#,
        esc(value)
    )
}

fn number_cell(column: char, row: usize, value: f64, style: usize) -> String {
    format!(r#"<c r="{column}{row}" s="{style}" t="n"><v>{value}</v></c>"#)
}

fn short_rank(rank: &str) -> String {
    match rank.trim().to_lowercase().as_str() {
        "солдат" => "сол.".into(),
        "старший солдат" => "ст. сол.".into(),
        "молодший сержант" => "мол. серж.".into(),
        "сержант" => "серж.".into(),
        "старший сержант" => "ст. серж.".into(),
        "головний сержант" => "гол. серж.".into(),
        "штаб-сержант" => "штаб-серж.".into(),
        "майстер-сержант" => "майстер-серж.".into(),
        "старший майстер-сержант" => "ст. майстер-серж.".into(),
        "головний майстер-сержант" => "гол. майстер-серж.".into(),
        "молодший лейтенант" => "мол. лейт.".into(),
        "лейтенант" => "лейт.".into(),
        "старший лейтенант" => "ст. лейт.".into(),
        "капітан" => "кап.".into(),
        "підполковник" => "підполк.".into(),
        "полковник" => "полк.".into(),
        _ => rank.trim().to_string(),
    }
}

fn display_name(value: &str) -> String {
    let mut words = value.split_whitespace();
    let surname = words.next().unwrap_or_default().to_uppercase();
    let initials = words
        .take(2)
        .filter_map(|word| word.chars().next())
        .map(|letter| format!("{letter}."))
        .collect::<String>();
    format!("{surname} {initials}").trim().to_string()
}

fn person_text(person: &PersonLine) -> String {
    format!(
        "{} {} ({})",
        short_rank(&person.rank),
        display_name(&person.full_name),
        person.callsign.trim()
    )
    .trim()
    .to_string()
}

fn flight_plan_rank_weight(rank: &str) -> usize {
    match rank.trim().to_lowercase().as_str() {
        "генерал армії україни" => 0,
        "генерал" | "адмірал" => 1,
        "генерал-полковник" => 2,
        "генерал-лейтенант" | "віце-адмірал" => 3,
        "генерал-майор" | "контр-адмірал" => 4,
        "бригадний генерал" | "коммодор" => 5,
        "полковник" | "капітан 1 рангу" => 10,
        "підполковник" | "капітан 2 рангу" => 11,
        "майор" | "капітан 3 рангу" => 12,
        "капітан" | "капітан-лейтенант" => 13,
        "старший лейтенант" => 14,
        "лейтенант" => 15,
        "молодший лейтенант" => 16,
        "старший прапорщик" => 20,
        "прапорщик" => 21,
        "головний майстер-сержант" | "головний майстер-старшина" => {
            30
        }
        "старший майстер-сержант" | "старший майстер-старшина" => {
            31
        }
        "майстер-сержант" | "майстер-старшина" => 32,
        "штаб-сержант" | "штаб-старшина" => 33,
        "головний сержант" | "головний корабельний старшина" => {
            34
        }
        "старшина" => 35,
        "старший сержант" | "головний старшина" => 36,
        "сержант" | "старшина 1 статті" => 37,
        "молодший сержант" | "старшина 2 статті" => 38,
        "старший солдат" | "старший матрос" => 40,
        "солдат" | "матрос" => 41,
        _ => usize::MAX,
    }
}

fn sort_people_by_rank(people: &mut [PersonLine]) {
    people.sort_by(|left, right| {
        flight_plan_rank_weight(&left.rank)
            .cmp(&flight_plan_rank_weight(&right.rank))
            .then_with(|| left.full_name.cmp(&right.full_name))
            .then_with(|| left.id.cmp(&right.id))
    });
}

fn parse_time(value: &str) -> Result<f64, String> {
    let (hours, minutes) = value
        .trim()
        .split_once(':')
        .ok_or_else(|| "Час має бути у форматі ГГ:ХХ.".to_string())?;
    let hours = hours
        .parse::<u32>()
        .map_err(|_| "Некоректна година у плані польотів.".to_string())?;
    let minutes = minutes
        .parse::<u32>()
        .map_err(|_| "Некоректні хвилини у плані польотів.".to_string())?;
    if hours > 23 || minutes > 59 {
        return Err("Час у плані польотів виходить за межі доби.".into());
    }
    Ok(f64::from(hours * 60 + minutes) / 1440.0)
}

fn list_members(
    connection: &Connection,
    crew_id: i64,
    actual: bool,
) -> Result<Vec<PersonLine>, String> {
    let source = if actual {
        "crew_actual_members"
    } else {
        "crew_members"
    };
    let active = if actual {
        ""
    } else {
        " AND membership.left_at IS NULL"
    };
    let query = format!("SELECT p.id,trim(p.surname||' '||p.given_name||' '||p.patronymic),p.rank,p.position,COALESCE(p.callsign,'') FROM {source} membership JOIN personnel p ON p.id=membership.personnel_id WHERE membership.crew_id=?1{active} ORDER BY CASE WHEN lower(p.position) LIKE '%командир%' THEN 0 ELSE 1 END,p.id");
    connection
        .prepare(&query)
        .map_err(|e| e.to_string())?
        .query_map([crew_id], |row| {
            Ok(PersonLine {
                id: row.get(0)?,
                full_name: row.get(1)?,
                rank: row.get(2)?,
                position: row.get(3)?,
                callsign: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn linked_assets(
    connection: &Connection,
    crew_id: i64,
    table: &str,
) -> Result<Vec<(String, String)>, String> {
    let query = if table == "vehicles" {
        "SELECT name,registration_number FROM vehicles WHERE crew_id=?1 ORDER BY id"
    } else {
        "SELECT name,inventory_number FROM equipment WHERE crew_id=?1 AND category='uav' ORDER BY id"
    };
    connection
        .prepare(query)
        .map_err(|e| e.to_string())?
        .query_map([crew_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn clean_points(points: &[String]) -> String {
    points
        .iter()
        .map(|point| point.trim().to_uppercase())
        .filter(|point| !point.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

fn build_rows(
    connection: &Connection,
    request: &FlightPlanRequest,
) -> Result<Vec<ExportRow>, String> {
    if request.entries.is_empty() {
        return Err("Оберіть хоча б один екіпаж для плану польотів.".into());
    }
    // This is a crew-wide choice. Rotation rows are stages of the same crew,
    // so one checked stage suppresses the vehicle requirement for every row.
    let vehicleless_crews = request
        .entries
        .iter()
        .filter(|entry| entry.without_vehicle)
        .map(|entry| entry.crew_id)
        .collect::<HashSet<_>>();
    let mut rows = Vec::with_capacity(request.entries.len());
    for (index, entry) in request.entries.iter().enumerate() {
        let without_vehicle = vehicleless_crews.contains(&entry.crew_id);
        let weather = &entry.weather;
        let weather_text = format!("Згідно прогнозу UAV Forecast {} С, вітер від {} до {} м/с, пориви від {} до {} м/с. Хмарність {} % {} м. Вірогідність опадів {} %", weather.temperature.trim(), weather.wind_from.trim(), weather.wind_to.trim(), weather.gust_from.trim(), weather.gust_to.trim(), weather.cloudiness.trim(), weather.cloud_height.trim(), weather.precipitation.trim());
        let crew = connection.query_row(
            "SELECT c.name,COALESCE(primary_uav.name,c.uav_name),COALESCE(primary_uav.inventory_number,''),COALESCE(p.name,c.position_name),COALESCE(p.battle_order,c.battle_order),COALESCE(p.locality,c.reconnaissance_area) FROM crews c LEFT JOIN positions p ON p.id=c.position_id LEFT JOIN equipment primary_uav ON primary_uav.id=c.primary_uav_id AND primary_uav.crew_id=c.id WHERE c.id=?1",
            [entry.crew_id], |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,String>(4)?,row.get::<_,String>(5)?)),
        ).optional().map_err(|e| e.to_string())?.ok_or_else(|| "Один з екіпажів плану більше не існує.".to_string())?;
        let mut actual = list_members(connection, entry.crew_id, true)?;
        if !entry.actual_member_ids.is_empty() {
            actual.retain(|member| entry.actual_member_ids.contains(&member.id));
            let official_for_rotation = list_members(connection, entry.crew_id, false)?;
            for member in official_for_rotation {
                if entry.actual_member_ids.contains(&member.id)
                    && !actual.iter().any(|item| item.id == member.id)
                {
                    actual.push(member);
                }
            }
        }
        sort_people_by_rank(&mut actual);
        let official = list_members(connection, entry.crew_id, false)?;
        let mut all = official.clone();
        for member in &actual {
            if !all.iter().any(|item| item.full_name == member.full_name) {
                all.push(member.clone());
            }
        }
        let missing = all
            .iter()
            .filter(|member| member.callsign.trim().is_empty())
            .map(|member| display_name(&member.full_name))
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            return Err(format!(
                "Не можна сформувати план: в екіпажі «{}» немає позивних у: {}.",
                crew.0,
                missing.join(", ")
            ));
        }
        let commander = entry
            .actual_commander_id
            .and_then(|id| actual.iter().find(|member| member.id == id))
            .or_else(|| {
                actual
                    .iter()
                    .find(|member| member.position.to_lowercase().contains("командир"))
                    .or_else(|| actual.first())
            });
        let mut uavs = Vec::<(String, String, i64, i64)>::new();
        for selected in &entry.uav_selections {
            let row=connection.query_row("SELECT name,inventory_number,total_quantity FROM equipment WHERE id=?1 AND crew_id=?2 AND category='uav'",rusqlite::params![selected.equipment_id,entry.crew_id],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,i64>(2)?))).optional().map_err(|e|e.to_string())?.ok_or_else(||"Один з вибраних БпЛА більше не закріплений за цим екіпажем.".to_string())?;
            let day = selected.day_quantity.max(0);
            let night = selected.night_quantity.max(0);
            if day + night > row.2 {
                return Err(format!(
                    "Для БпЛА «{}» вибрано більше одиниць, ніж закріплено за екіпажем.",
                    row.0
                ));
            }
            uavs.push((row.0, row.1, day, night));
        }
        let mut vehicles = if without_vehicle {
            Vec::new()
        } else {
            linked_assets(connection, entry.crew_id, "vehicles")?
        };
        if !without_vehicle && vehicles.len() > 1 {
            let selected_id = entry
                .actual_vehicle_id
                .ok_or_else(|| format!("Оберіть фактичний автомобіль екіпажу «{}».", crew.0))?;
            vehicles = connection
                .query_row(
                    "SELECT name,registration_number FROM vehicles WHERE id=?1 AND crew_id=?2",
                    rusqlite::params![selected_id, entry.crew_id],
                    |row| Ok(vec![(row.get(0)?, row.get(1)?)]),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .ok_or_else(|| {
                    "Вибраний автомобіль більше не закріплений за екіпажем.".to_string()
                })?;
        }
        let uav_column = [crew.1.to_uppercase(), crew.2.to_uppercase()]
            .into_iter()
            .filter(|item| !item.trim().is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        let day_uavs: i64 = uavs.iter().map(|(_, _, day, _)| day).sum();
        let night_uavs: i64 = uavs.iter().map(|(_, _, _, night)| night).sum();
        let total_uavs = day_uavs + night_uavs;
        let mut support = Vec::new();
        if total_uavs > 0 {
            let period = if day_uavs > 0 && night_uavs > 0 {
                "денні/ніч"
            } else if day_uavs > 0 {
                "денні"
            } else {
                "ніч"
            };
            support.push(format!("БпЛА {period} - {total_uavs} шт"));
        }
        support.extend(
            vehicles.iter().map(|(name, number)| {
                format!("{}\n{}", name.to_uppercase(), number.to_uppercase())
            }),
        );
        if let Some(payload) = &entry.payload_selection {
            let payload_name = match payload.source_type.as_str() {
                "equipment" => connection
                    .query_row(
                        "SELECT name FROM equipment WHERE id=?1 AND category='weapon_ammo' AND weapon_kind='ammunition' AND stock_quantity>0",
                        [payload.source_id],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()
                    .map_err(|error| error.to_string())?,
                "workshop" => connection
                    .query_row(
                        "SELECT name FROM workshop_products WHERE id=?1 AND quantity>0",
                        [payload.source_id],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()
                    .map_err(|error| error.to_string())?,
                _ => None,
            }
            .ok_or_else(|| "Обране бойове навантаження більше не доступне.".to_string())?;
            support.push(format!("БК: {}", payload_name.to_uppercase()));
        }
        let route = clean_points(&entry.route_points);
        let area = clean_points(&entry.area_points);
        let altitude = format!(
            "{}-{}м",
            entry.altitude_from.trim(),
            entry.altitude_to.trim()
        );
        let task = if entry.task.trim().is_empty() {
            "Розвідка противника та місцевості"
        } else {
            entry.task.trim()
        };
        let values = [
            (index + 1).to_string(),
            request.unit_name.trim().to_string(),
            uav_column,
            if crew.3.trim().is_empty() {
                crew.0.to_uppercase()
            } else {
                format!("{}\n({})", crew.0.to_uppercase(), crew.3.to_uppercase())
            },
            crew.4,
            commander.map(person_text).unwrap_or_default(),
            actual
                .iter()
                .map(person_text)
                .collect::<Vec<_>>()
                .join("\n"),
            weather_text,
            format!("{route}\n{altitude}"),
            if area.is_empty() {
                crew.5.to_uppercase()
            } else {
                area
            },
            format!("Бойове чергування, {}", task.to_lowercase()),
            support.join("\n"),
            String::new(),
            String::new(),
        ];
        rows.push(ExportRow {
            values,
            start: parse_time(&entry.start_time)?,
            end: parse_time(&entry.end_time)?,
        });
    }
    Ok(rows)
}

fn worksheet(rows: &[ExportRow]) -> String {
    let last = rows.len() + 2;
    let mut xml = format!(
        r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr filterMode="false"><pageSetUpPr fitToPage="true"/></sheetPr><dimension ref="A1:N{last}"/><sheetViews><sheetView showGridLines="false" zoomScale="40" zoomScaleNormal="40" workbookViewId="0"><selection activeCell="A3" sqref="A3"/></sheetView></sheetViews><sheetFormatPr defaultColWidth="8.4453125" defaultRowHeight="15" customHeight="true"/><cols>"#
    );
    for (index, width) in [
        7.0, 13.88, 28.33, 20.33, 17.67, 39.44, 46.44, 34.33, 32.44, 38.44, 28.67, 31.67, 17.0,
        18.44,
    ]
    .iter()
    .enumerate()
    {
        xml.push_str(&format!(
            r#"<col customWidth="true" min="{}" max="{}" style="1" width="{width}"/>"#,
            index + 1,
            index + 1
        ));
    }
    xml.push_str(r#"</cols><sheetData><row r="1" ht="126" customHeight="true">"#);
    for (index, value) in [
        "№ п/п",
        "Підрозділ",
        "Тип БпАК (№ борта)",
        "Найменування екіпажу\n(позиція)",
        "Смуга відпові- дальності \n(кому підпорядко- вано)",
        "Командир екіпажу БпАК, позивний",
        "ПІБ складу екіпажу БпАК",
        "Погодні умови польоту БпЛА",
        "Маршрут та висота польоту на ділянках маршруту",
        "Район виконання завдання (н.п.)",
        "Завдання польоту",
        "Озброєння та техніка, яка задіяна до забезпечення польотів БпАК",
        "Планований час початку завдання",
        "Планований час закінчення завдання",
    ]
    .iter()
    .enumerate()
    {
        xml.push_str(&inline_cell((b'A' + index as u8) as char, 1, value, 2));
    }
    xml.push_str(r#"</row><row r="2" ht="23.25" customHeight="true">"#);
    for index in 0..14 {
        xml.push_str(&number_cell(
            (b'A' + index as u8) as char,
            2,
            (index + 1) as f64,
            3,
        ));
    }
    xml.push_str("</row>");
    for (offset, data) in rows.iter().enumerate() {
        let row = offset + 3;
        let line_count = data.values[6]
            .lines()
            .count()
            .max(data.values[11].lines().count())
            .max(3);
        let height = (line_count * 20).max(90);
        xml.push_str(&format!(
            r#"<row r="{row}" ht="{height}" customHeight="true">"#
        ));
        for index in 0..12 {
            let style = match index {
                1 => 5,
                10 => 6,
                11 => 7,
                _ => 4,
            };
            xml.push_str(&inline_cell(
                (b'A' + index as u8) as char,
                row,
                &data.values[index],
                style,
            ));
        }
        xml.push_str(&number_cell('M', row, data.start, 8));
        xml.push_str(&number_cell('N', row, data.end, 9));
        xml.push_str("</row>");
    }
    xml.push_str(r#"</sheetData><printOptions headings="false" gridLines="false"/><pageMargins left="0.708333333333333" right="0.708333333333333" top="0.747916666666667" bottom="0.747916666666667" header="0.511811023622047" footer="0.511805555555556"/><pageSetup paperSize="1" scale="100" fitToWidth="1" fitToHeight="1" pageOrder="downThenOver" orientation="landscape" horizontalDpi="300" verticalDpi="300" copies="1"/><headerFooter><oddFooter>&amp;C&amp;&quot;Helvetica Neue,Regular&quot;&amp;12&amp;K000000&amp;P</oddFooter></headerFooter></worksheet>"#);
    xml
}

fn write_workbook(path: &Path, rows: &[ExportRow]) -> Result<(), String> {
    let mut source = ZipArchive::new(Cursor::new(TEMPLATE)).map_err(|e| e.to_string())?;
    let output =
        File::create(path).map_err(|_| "Не вдалося створити файл плану польотів.".to_string())?;
    let mut target = ZipWriter::new(output);
    for index in 0..source.len() {
        let mut entry = source.by_index(index).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        target
            .start_file(
                &name,
                SimpleFileOptions::default().compression_method(entry.compression()),
            )
            .map_err(|e| e.to_string())?;
        if name == "xl/worksheets/sheet1.xml" {
            target
                .write_all(worksheet(rows).as_bytes())
                .map_err(|e| e.to_string())?;
        } else {
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            target.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }
    target.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn export_flight_plan_excel(
    state: tauri::State<AppState>,
    path: String,
    request: FlightPlanRequest,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let rows = build_rows(&database.connection, &request)?;
    write_workbook(Path::new(&path), &rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;

    fn empty_request(unit_name: &str) -> FlightPlanRequest {
        FlightPlanRequest {
            unit_name: unit_name.into(),
            entries: vec![],
        }
    }

    #[test]
    fn sorts_exported_people_from_the_highest_rank_to_the_lowest() {
        let mut people = vec![
            PersonLine {
                id: 1,
                full_name: "КОЗАК Віктор Васильович".into(),
                rank: "солдат".into(),
                position: "оператор".into(),
                callsign: "СОКІЛ-021".into(),
            },
            PersonLine {
                id: 2,
                full_name: "ОЛІЙНИК Роман Миколайович".into(),
                rank: "старший солдат".into(),
                position: "оператор".into(),
                callsign: "СОКІЛ-022".into(),
            },
            PersonLine {
                id: 3,
                full_name: "ЯРЕМЧУК Микола Романович".into(),
                rank: "сержант".into(),
                position: "командир".into(),
                callsign: "СОКІЛ-020".into(),
            },
            PersonLine {
                id: 4,
                full_name: "ЛЕВЧЕНКО Іван Олександрович".into(),
                rank: "молодший сержант".into(),
                position: "оператор".into(),
                callsign: "СОКІЛ-023".into(),
            },
        ];

        sort_people_by_rank(&mut people);

        assert_eq!(
            people.iter().map(person_text).collect::<Vec<_>>(),
            vec![
                "серж. ЯРЕМЧУК М.Р. (СОКІЛ-020)",
                "мол. серж. ЛЕВЧЕНКО І.О. (СОКІЛ-023)",
                "ст. сол. ОЛІЙНИК Р.М. (СОКІЛ-022)",
                "сол. КОЗАК В.В. (СОКІЛ-021)",
            ]
        );
    }

    #[test]
    fn saving_tomorrows_plan_marks_the_replaced_crew_departure_in_today_plan() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        let base = |crew_id: i64, start: &str| {
            serde_json::json!({
                "crewId":crew_id,"actualMemberIds":[crew_id],"weather":{"temperature":"","windFrom":"","windTo":"","gustFrom":"","gustTo":"","cloudiness":"","cloudHeight":"","precipitation":""},
                "routePoints":[],"altitudeFrom":"","altitudeTo":"","areaPoints":[],"task":"","startTime":start,"endTime":"21:00","uavSelections":[],"positionId":7,"positionName":"ТЕСТ"
            })
        };
        let today_request: FlightPlanRequest = serde_json::from_value(
            serde_json::json!({"unitName":"РБАК","entries":[base(1,"05:00"),base(2,"19:00")]}),
        )
        .unwrap();
        let tomorrow_request: FlightPlanRequest = serde_json::from_value(
            serde_json::json!({"unitName":"РБАК","entries":[base(2,"05:00")]}),
        )
        .unwrap();
        save_flight_plan_snapshot_at(&connection, today, "2026-09-17", &today_request).unwrap();
        save_flight_plan_snapshot_at(&connection, today, "2026-09-18", &tomorrow_request).unwrap();
        let saved = get_flight_plan_snapshot_at(&connection, today, "2026-09-17")
            .unwrap()
            .unwrap();
        let saved: FlightPlanRequest = serde_json::from_str(&saved).unwrap();
        let outgoing = saved
            .entries
            .iter()
            .find(|entry| entry.crew_id == 1)
            .unwrap();
        assert!(outgoing.departs_today);
        assert_eq!(outgoing.departure_time, "19:00");
    }

    #[test]
    fn missing_today_plan_uses_only_crews_already_present_in_tomorrow_plan() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json) VALUES('2026-09-18',1,?1)",
            [serde_json::json!({"entries":[
                {"crewId":1,"actualMemberIds":[10,11],"startTime":"05:00","arrivesToday":false},
                {"crewId":2,"actualMemberIds":[20,21],"startTime":"19:00","arrivesToday":true}
            ]}).to_string()],
        ).unwrap();
        let schedules = flight_plan_location_schedule(&connection, "2026-09-17")
            .unwrap()
            .unwrap();
        assert_eq!(schedules.len(), 1);
        assert_eq!(schedules[0].crew_id, 1);
        assert_eq!(schedules[0].stages[0].member_ids, vec![10, 11]);
        assert_eq!(schedules[0].stages[0].start_time, "00:00");
        assert!(!schedules[0].arrives_on_plan_date);
    }

    #[test]
    fn accepts_the_inclusive_retention_and_future_boundaries() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let today = NaiveDate::from_ymd_opt(2024, 5, 31).unwrap();

        save_flight_plan_snapshot_at(
            &connection,
            today,
            "2024-02-29",
            &empty_request("retention boundary"),
        )
        .unwrap();
        save_flight_plan_snapshot_at(
            &connection,
            today,
            "2024-06-07",
            &empty_request("future boundary"),
        )
        .unwrap();

        assert!(save_flight_plan_snapshot_at(
            &connection,
            today,
            "2024-02-28",
            &empty_request("expired")
        )
        .unwrap_err()
        .contains("3 календарних місяців"));
        assert!(save_flight_plan_snapshot_at(
            &connection,
            today,
            "2024-06-08",
            &empty_request("too far")
        )
        .unwrap_err()
        .contains("7 днів"));
    }

    #[test]
    fn read_keeps_the_hidden_summary_dependency_day_without_deleting_older_rows() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        connection
            .execute_batch(
                "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json)
                VALUES('2026-06-15',1,'{}');
             INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json)
                VALUES('2026-06-16',1,'{\"unitName\":\"D-1\",\"entries\":[]}');",
            )
            .unwrap();

        assert_eq!(
            get_flight_plan_snapshot_at(&connection, today, "2026-06-15").unwrap(),
            None
        );
        assert!(
            get_flight_plan_snapshot_at(&connection, today, "2026-06-16")
                .unwrap()
                .is_some()
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT count(*) FROM flight_plan_snapshots WHERE plan_date='2026-06-15'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
        assert!(
            get_flight_plan_snapshot_at(&connection, today, "2026-09-25")
                .unwrap_err()
                .contains("7 днів")
        );
    }

    #[test]
    fn cleanup_cascades_snapshot_entries_and_preserves_flight_journal_data() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        connection
            .execute_batch(
                "INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json)
                    VALUES(41,'2026-06-15',1,'{}');
                 INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json)
                    VALUES(42,'2026-06-16',1,'{}');
                 INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json)
                    VALUES(43,'2026-06-17',1,'{}');
                 INSERT INTO flight_plan_snapshot_entries(
                    snapshot_id,crew_name_snapshot,entry_json
                 ) VALUES(41,'БАРС','{}');
                 INSERT INTO flight_journal_entries(
                    flight_date,snapshot_id,crew_name_snapshot,mission
                 ) VALUES('2026-06-15',41,'БАРС','Розвідка');",
            )
            .unwrap();

        assert_eq!(
            purge_expired_flight_plan_snapshots(&connection, today).unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT count(*) FROM flight_plan_snapshots WHERE id=41",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            0
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT count(*) FROM flight_plan_snapshots WHERE id IN (42,43)",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            2
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT count(*) FROM flight_plan_snapshot_entries WHERE snapshot_id=41",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            0
        );
        let journal: (Option<i64>, String, String) = connection
            .query_row(
                "SELECT snapshot_id,crew_name_snapshot,mission
                 FROM flight_journal_entries WHERE flight_date='2026-06-15'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(journal, (None, "БАРС".into(), "Розвідка".into()));
    }

    #[test]
    fn saving_the_same_day_overwrites_the_single_current_snapshot() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();

        save_flight_plan_snapshot_at(&connection, today, "2026-09-18", &empty_request("ПЕРШИЙ"))
            .unwrap();
        save_flight_plan_snapshot_at(&connection, today, "2026-09-18", &empty_request("ОСТАННІЙ"))
            .unwrap();

        assert_eq!(
            connection
                .query_row(
                    "SELECT count(*) FROM flight_plan_snapshots WHERE plan_date='2026-09-18'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
        let stored = get_flight_plan_snapshot_at(&connection, today, "2026-09-18")
            .unwrap()
            .unwrap();
        let request: FlightPlanRequest = serde_json::from_str(&stored).unwrap();
        assert_eq!(request.unit_name, "ОСТАННІЙ");
    }

    #[test]
    fn saving_a_legacy_multi_revision_day_keeps_the_latest_snapshot_id() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        connection
            .execute_batch(
                "INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json)
                    VALUES(51,'2026-09-16',1,'{\"unitName\":\"ПЕРШИЙ\",\"entries\":[]}');
                 INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json)
                    VALUES(52,'2026-09-16',2,'{\"unitName\":\"ДРУГИЙ\",\"entries\":[]}');
                 INSERT INTO flight_plan_snapshot_entries(
                    snapshot_id,crew_name_snapshot,entry_json
                 ) VALUES(52,'СТАРИЙ СКЛАД','{}');
                 INSERT INTO flight_journal_entries(
                    flight_date,snapshot_id,crew_name_snapshot,mission
                 ) VALUES('2026-09-16',52,'БАРС','Розвідка');",
            )
            .unwrap();

        save_flight_plan_snapshot_at(
            &connection,
            today,
            "2026-09-16",
            &empty_request("ВИПРАВЛЕНИЙ"),
        )
        .unwrap();

        let rows = connection
            .query_row(
                "SELECT count(*),min(id),min(revision)
                 FROM flight_plan_snapshots WHERE plan_date='2026-09-16'",
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(rows, (1, 52, 1));
        assert_eq!(
            connection
                .query_row(
                    "SELECT count(*) FROM flight_plan_snapshot_entries WHERE snapshot_id=52",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            0
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT snapshot_id FROM flight_journal_entries
                     WHERE flight_date='2026-09-16'",
                    [],
                    |row| row.get::<_, Option<i64>>(0)
                )
                .unwrap(),
            Some(52)
        );
        let stored = get_flight_plan_snapshot_at(&connection, today, "2026-09-16")
            .unwrap()
            .unwrap();
        let request: FlightPlanRequest = serde_json::from_str(&stored).unwrap();
        assert_eq!(request.unit_name, "ВИПРАВЛЕНИЙ");
    }

    #[test]
    fn editing_an_old_plan_does_not_change_the_current_bcs_location() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        database::seed_test_personnel(&connection).unwrap();
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        connection
            .execute(
                "UPDATE personnel SET current_location='На позиції' WHERE id=1",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO flight_plan_personnel_locations(personnel_id,plan_date,location)
                 VALUES(1,'2026-09-17','На позиції')",
                [],
            )
            .unwrap();

        save_flight_plan_snapshot_at(
            &connection,
            today,
            "2026-08-20",
            &empty_request("УТОЧНЕНИЙ МИНУЛИЙ ПЛАН"),
        )
        .unwrap();

        let current_state = connection
            .query_row(
                "SELECT personnel.current_location,state.plan_date,state.location
                 FROM personnel
                 JOIN flight_plan_personnel_locations state ON state.personnel_id=personnel.id
                 WHERE personnel.id=1",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            current_state,
            (
                "На позиції".into(),
                "2026-09-17".into(),
                "На позиції".into()
            )
        );
    }

    #[test]
    fn keeps_position_transition_metadata_in_a_snapshot() {
        let request: FlightPlanRequest = serde_json::from_value(serde_json::json!({
            "unitName": "РБПАК",
            "entries": [{
                "crewId": 1,
                "actualMemberIds": [1],
                "actualCommanderId": 1,
                "actualVehicleId": null,
                "weather": { "temperature": "", "windFrom": "", "windTo": "", "gustFrom": "", "gustTo": "", "cloudiness": "", "cloudHeight": "", "precipitation": "" },
                "routePoints": [],
                "altitudeFrom": "",
                "altitudeTo": "",
                "areaPoints": [],
                "task": "Розвідка",
                "startTime": "07:00",
                "endTime": "12:00",
                "uavSelections": [],
                "payloadSelection": null,
                "arrivesToday": true,
                "departsToday": true,
                "departureTime": "16:30"
            }]
        })).unwrap();

        let value = serde_json::to_value(request).unwrap();
        assert_eq!(value["entries"][0]["arrivesToday"], true);
        assert_eq!(value["entries"][0]["departsToday"], true);
        assert_eq!(value["entries"][0]["departureTime"], "16:30");
        assert_eq!(value["entries"][0]["withoutVehicle"], false);
    }

    #[test]
    fn fills_the_reference_template_and_keeps_excel_times_numeric() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,callsign) VALUES(1,'капітан','ТЕСТОВИЙ','Тест','Тестович','командир екіпажу','1','','','','','','','','СОКІЛ')", []).unwrap();
        connection
            .execute(
                "INSERT INTO crews(id,name,uav_name,uav_type) VALUES(1,'БАРС','MAVIC 3','Коптер')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,1)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO crew_actual_members(crew_id,personnel_id) VALUES(1,1)",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO equipment(id,category,name,inventory_number,crew_id,total_quantity,day_quantity,night_quantity) VALUES(7,'uav','SHARK','UAV-02',1,4,2,2)",[]).unwrap();
        connection.execute("INSERT INTO vehicles(id,name,registration_number,status,crew_id) VALUES(9,'Toyota Hilux','АА 0001 АА','Справний',1),(10,'Ford Ranger','АА 0002 АА','Справний',1)",[]).unwrap();
        let mut request = FlightPlanRequest {
            unit_name: "РБПАК".into(),
            entries: vec![FlightPlanEntry {
                crew_id: 1,
                actual_member_ids: vec![1],
                actual_commander_id: Some(1),
                actual_vehicle_id: Some(9),
                without_vehicle: false,
                weather: FlightPlanWeather {
                    temperature: "20".into(),
                    wind_from: "2".into(),
                    wind_to: "4".into(),
                    gust_from: "5".into(),
                    gust_to: "7".into(),
                    cloudiness: "30".into(),
                    cloud_height: "1200".into(),
                    precipitation: "10".into(),
                },
                route_points: vec!["Охтирка".into(), "Тростянець".into()],
                altitude_from: "800".into(),
                altitude_to: "1100".into(),
                area_points: vec!["Боромля".into()],
                task: "Розвідка противника та місцевості".into(),
                start_time: "05:00".into(),
                end_time: "21:00".into(),
                uav_selections: vec![FlightPlanUavSelection {
                    equipment_id: 7,
                    day_quantity: 2,
                    night_quantity: 2,
                }],
                payload_selection: None,
                rotation_id: None,
                crew_name: String::new(),
                crew_uav_type: String::new(),
                position_id: None,
                position_name: String::new(),
                position_mgrs: String::new(),
                position_locality: String::new(),
                work_strip: String::new(),
                battle_order: String::new(),
                uav_snapshots: vec![],
                member_snapshots: vec![],
                arrives_today: false,
                departs_today: false,
                departure_time: String::new(),
            }],
        };
        let rows = build_rows(&connection, &request).unwrap();
        assert!(rows[0].values[11].contains("TOYOTA HILUX"));
        request.entries[0].without_vehicle = true;
        let mut rotation = request.entries[0].clone();
        rotation.without_vehicle = false;
        rotation.actual_vehicle_id = None;
        request.entries.push(rotation);
        let rows_without_vehicle = build_rows(&connection, &request).unwrap();
        assert!(rows_without_vehicle
            .iter()
            .all(|row| !row.values[11].contains("TOYOTA HILUX")
                && !row.values[11].contains("FORD RANGER")));
        let path = std::env::temp_dir().join(format!("flight-plan-{}.xlsx", std::process::id()));
        write_workbook(&path, &rows).unwrap();
        let mut archive = ZipArchive::new(File::open(&path).unwrap()).unwrap();
        let mut xml = String::new();
        archive
            .by_name("xl/worksheets/sheet1.xml")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        assert!(
            xml.contains("РБПАК")
                && xml.contains("ОХТИРКА, ТРОСТЯНЕЦЬ")
                && xml.contains("800-1100м")
        );
        assert!(xml.contains("ТЕСТОВИЙ Т.Т.") && xml.contains("БпЛА денні/ніч - 4 шт"));
        assert!(xml.contains("r=\"M3\" s=\"8\" t=\"n\"") && xml.contains("0.20833333333333334"));
        if let Ok(destination) = std::env::var("FLIGHT_PLAN_TEST_OUTPUT") {
            std::fs::copy(&path, destination).unwrap();
        }
        let _ = std::fs::remove_file(path);
    }
}
