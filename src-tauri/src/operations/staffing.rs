use super::{
    busy, ActingChange, FlightPlanCrewLocationAssignment, StaffRecommendation, StaffTransfer,
    StaffingRecord, VacancyRecommendation,
};
use crate::AppState;
use chrono::{Duration, Local, NaiveDate};
use rusqlite::{backup::Backup, Connection, OptionalExtension};
use std::collections::{HashMap, HashSet};
use std::time::Duration as StdDuration;

#[tauri::command]
pub fn list_staffing_records(state: tauri::State<AppState>) -> Result<Vec<StaffingRecord>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    crate::database::normalize_staff_positions(&db.connection)?;
    reconcile_flight_plan_for_now(&db.connection)?;
    staffing_records(&db.connection)
}

fn staffing_records_for_target_date(
    connection: &Connection,
    today: NaiveDate,
    current_time: &str,
    target_date: NaiveDate,
) -> Result<Vec<StaffingRecord>, String> {
    if target_date == today {
        reconcile_flight_plan_for_moment(
            connection,
            &today.format("%Y-%m-%d").to_string(),
            current_time,
        )?;
        return staffing_records(connection);
    }
    if target_date != today + Duration::days(1) {
        return Err("БЧС можна переглянути лише на сьогодні або на завтра.".into());
    }

    // The forecast runs on an in-memory copy. This lets us finish today's
    // transitions, cross midnight and then apply tomorrow's full plan without
    // changing the canonical current BCS or its audit history.
    let mut preview = Connection::open_in_memory()
        .map_err(|_| "Не вдалося підготувати прогноз БЧС на завтра.".to_string())?;
    {
        let backup = Backup::new(connection, &mut preview)
            .map_err(|_| "Не вдалося скопіювати дані для прогнозу БЧС.".to_string())?;
        backup
            .run_to_completion(64, StdDuration::from_millis(1), None)
            .map_err(|_| "Не вдалося скопіювати дані для прогнозу БЧС.".to_string())?;
    }
    reconcile_flight_plan_for_moment(&preview, &today.format("%Y-%m-%d").to_string(), "23:59")?;
    reconcile_flight_plan_for_moment(
        &preview,
        &target_date.format("%Y-%m-%d").to_string(),
        "23:59",
    )?;
    staffing_records(&preview)
}

#[tauri::command]
pub fn list_staffing_records_for_date(
    state: tauri::State<AppState>,
    target_date: String,
) -> Result<Vec<StaffingRecord>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    crate::database::normalize_staff_positions(&db.connection)?;
    reconcile_flight_plan_for_now(&db.connection)?;
    let target_date = NaiveDate::parse_from_str(target_date.trim(), "%Y-%m-%d")
        .map_err(|_| "Некоректна дата перегляду БЧС.".to_string())?;
    let now = Local::now();
    staffing_records_for_target_date(
        &db.connection,
        now.date_naive(),
        &now.format("%H:%M").to_string(),
        target_date,
    )
}

fn staffing_records(connection: &rusqlite::Connection) -> Result<Vec<StaffingRecord>, String> {
    let mut statement = connection.prepare(
        "SELECT p.id,trim(p.surname||' '||p.given_name||' '||p.patronymic),p.rank,p.position,
                c.id,c.name,COALESCE(c.platoon,''),COALESCE(c.company_name,''),COALESCE(c.unit_type,'Екіпаж'),
                COALESCE(pos.name,''),COALESCE(pos.battle_order,''),COALESCE(c.sector,''),COALESCE(c.official_strength,0),
                COALESCE((SELECT COUNT(*) FROM crew_members x WHERE x.crew_id=c.id AND x.left_at IS NULL),0),
                COALESCE(c.status,''),COALESCE(c.uav_name,''),COALESCE(c.uav_type,''),
                COALESCE(NULLIF(p.functional_duties,''),c.functional_duties,''),COALESCE(p.current_location,''),
                COALESCE(p.bcs_status,''),COALESCE(NULLIF(p.bcs_notes,''),c.notes,''),COALESCE(a.acting_position,''),
                COALESCE((SELECT COUNT(*) FROM staff_recommendations sr WHERE sr.personnel_id=p.id),0),
                COALESCE(a.slot_id,''),COALESCE(a.acting_slot_id,''),
                COALESCE((SELECT COUNT(*) FROM crew_actual_members x WHERE x.crew_id=c.id),0),
                actual_c.id,actual_c.name
         FROM personnel p
         LEFT JOIN crew_members cm ON cm.personnel_id=p.id AND cm.left_at IS NULL
         LEFT JOIN crews c ON c.id=cm.crew_id
         LEFT JOIN crew_actual_members cam ON cam.personnel_id=p.id
         LEFT JOIN crews actual_c ON actual_c.id=cam.crew_id
         LEFT JOIN positions pos ON pos.id=c.position_id
         LEFT JOIN personnel_staff_assignments a ON a.personnel_id=p.id
         ORDER BY COALESCE(c.name,''),p.position,p.id",
    ).map_err(|_| "Не вдалося сформувати Штат та БЧС.".to_string())?;
    let result = statement
        .query_map([], |r| {
            Ok(StaffingRecord {
                personnel_id: r.get(0)?,
                full_name: r.get(1)?,
                rank: r.get(2)?,
                position: r.get(3)?,
                crew_id: r.get(4)?,
                crew_name: r.get(5)?,
                actual_crew_id: r.get(26)?,
                actual_crew_name: r.get(27)?,
                platoon: r.get(6)?,
                company_name: r.get(7)?,
                unit_type: r.get(8)?,
                crew_position_name: r.get(9)?,
                battle_order: r.get(10)?,
                sector: r.get(11)?,
                official_strength: r.get(12)?,
                actual_strength: r.get(13)?,
                crew_status: r.get(14)?,
                uav_name: r.get(15)?,
                uav_type: r.get(16)?,
                functional_duties: r.get(17)?,
                current_location: r.get(18)?,
                bcs_status: r.get(19)?,
                notes: r.get(20)?,
                acting_position: r.get(21)?,
                recommendation_count: r.get(22)?,
                working_strength: r.get(25)?,
                staff_slot_id: r.get(23)?,
                acting_slot_id: r.get(24)?,
            })
        })
        .map_err(|_| "Не вдалося сформувати Штат та БЧС.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося сформувати Штат та БЧС.".to_string());
    result
}

pub(crate) fn normalize_stale_daily_locations(
    connection: &rusqlite::Connection,
    local_today: &str,
) -> Result<(), String> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося почати оновлення застарілих станів БЧС.".to_string())?;
    transaction
        .execute(
            "UPDATE personnel
             SET current_location=CASE current_location WHEN 'ЗБЗ' THEN 'На позиції' ELSE 'ОХ' END,
                 updated_at=CURRENT_TIMESTAMP
             WHERE current_location IN ('ЗБЗ','ПБЗ')
               AND EXISTS(
                 SELECT 1
                 FROM flight_plan_personnel_locations state
                 WHERE state.personnel_id=personnel.id
                   AND date(state.plan_date) < date(?1)
               )",
            [local_today],
        )
        .map_err(|_| "Не вдалося оновити застарілі добові стани БЧС.".to_string())?;
    transaction
        .execute(
            "DELETE FROM flight_plan_personnel_locations
             WHERE date(plan_date) < date(?1)
               AND EXISTS(
                 SELECT 1 FROM personnel
                 WHERE personnel.id=flight_plan_personnel_locations.personnel_id
                   AND personnel.current_location IN ('На позиції','ОХ')
               )",
            [local_today],
        )
        .map_err(|_| "Не вдалося очистити застарілі службові стани БЧС.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити оновлення застарілих станів БЧС.".to_string())?;
    Ok(())
}

fn minute_of_day(value: &str) -> Option<u32> {
    let (hours, minutes) = value.trim().split_once(':')?;
    let hours = hours.parse::<u32>().ok()?;
    let minutes = minutes.parse::<u32>().ok()?;
    (hours < 24 && minutes < 60).then_some(hours * 60 + minutes)
}

fn is_flight_plan_owned_location(value: &str) -> bool {
    matches!(
        value.trim(),
        "" | "ОХ" | "ЗАБ" | "На позиції" | "ЗБЗ" | "ПБЗ"
    )
}

pub(crate) fn reconcile_flight_plan_for_now(
    connection: &rusqlite::Connection,
) -> Result<(), String> {
    let now = chrono::Local::now();
    reconcile_flight_plan_for_moment(
        connection,
        &now.format("%Y-%m-%d").to_string(),
        &now.format("%H:%M").to_string(),
    )
}

pub(crate) fn reconcile_flight_plan_for_moment(
    connection: &rusqlite::Connection,
    local_date: &str,
    local_time: &str,
) -> Result<(), String> {
    super::sync_manual_assignments_for_date(connection, local_date)?;
    normalize_stale_daily_locations(connection, local_date)?;
    let Some(schedules) =
        crate::flight_plan::flight_plan_location_schedule(connection, local_date)?
    else {
        return Ok(());
    };
    let now_minute = minute_of_day(local_time)
        .ok_or_else(|| "Некоректний поточний час для синхронізації БЧС.".to_string())?;
    let mut desired = HashMap::<i64, &'static str>::new();
    for schedule in schedules {
        let Some(primary) = schedule.stages.first() else {
            continue;
        };
        let departure_has_happened = schedule.departs_on_plan_date
            && minute_of_day(&schedule.departure_time)
                .is_some_and(|departure| now_minute >= departure);
        if departure_has_happened {
            for personnel_id in schedule
                .stages
                .iter()
                .flat_map(|stage| stage.member_ids.iter().copied())
            {
                desired.insert(personnel_id, "ПБЗ");
            }
            continue;
        }
        if schedule.arrives_on_plan_date
            && minute_of_day(&primary.start_time).is_some_and(|start| now_minute < start)
        {
            continue;
        }
        let active_stage_index = schedule
            .stages
            .iter()
            .enumerate()
            .skip(1)
            .filter_map(|(index, stage)| {
                minute_of_day(&stage.start_time)
                    .filter(|start| now_minute >= *start)
                    .map(|_| index)
            })
            .next_back()
            .unwrap_or(0);
        let active_stage = &schedule.stages[active_stage_index];
        let appeared: HashSet<i64> = schedule.stages[..=active_stage_index]
            .iter()
            .flat_map(|stage| stage.member_ids.iter().copied())
            .collect();
        for personnel_id in appeared {
            if !active_stage.member_ids.contains(&personnel_id) {
                desired.insert(personnel_id, "ПБЗ");
                continue;
            }
            let has_remained_from_start = !schedule.arrives_on_plan_date
                && schedule.stages[..=active_stage_index]
                    .iter()
                    .all(|stage| stage.member_ids.contains(&personnel_id));
            desired.insert(
                personnel_id,
                if has_remained_from_start {
                    "На позиції"
                } else {
                    "ЗБЗ"
                },
            );
        }
    }

    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося почати активацію плану польотів у БЧС.".to_string())?;

    let tracked_locations = {
        let mut statement = transaction
            .prepare(
                "SELECT state.personnel_id,state.location,COALESCE(personnel.current_location,'')
                 FROM flight_plan_personnel_locations state
                 JOIN personnel ON personnel.id=state.personnel_id
                 WHERE date(state.plan_date)=date(?1)",
            )
            .map_err(|_| "Не вдалося прочитати попередні стани плану польотів.".to_string())?;
        let rows = statement
            .query_map([local_date], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|_| "Не вдалося прочитати попередні стани плану польотів.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати попередні стани плану польотів.".to_string())?;
        rows
    };
    for (personnel_id, source_location, current_location) in tracked_locations {
        if desired.contains_key(&personnel_id) {
            continue;
        }
        if current_location.trim() == source_location.trim()
            && matches!(source_location.trim(), "На позиції" | "ЗБЗ" | "ПБЗ")
        {
            transaction
                .execute(
                    "UPDATE personnel
                     SET current_location='ОХ',updated_at=CURRENT_TIMESTAMP
                     WHERE id=?1",
                    [personnel_id],
                )
                .map_err(|_| {
                    "Не вдалося нормалізувати стан людини з попереднього плану польотів."
                        .to_string()
                })?;
        }
        transaction
            .execute(
                "DELETE FROM flight_plan_personnel_locations
                 WHERE personnel_id=?1 AND date(plan_date)=date(?2)",
                rusqlite::params![personnel_id, local_date],
            )
            .map_err(|_| "Не вдалося очистити попереднє джерело стану БЧС.".to_string())?;
    }

    for (personnel_id, location) in desired {
        let Some(mut current_location) = transaction
            .query_row(
                "SELECT COALESCE(current_location,'') FROM personnel WHERE id=?1",
                [personnel_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|_| "Не вдалося перевірити стан людини з плану польотів.".to_string())?
        else {
            continue;
        };
        let has_active_position_work = transaction
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM position_work_members member
                    JOIN position_work work ON work.id=member.work_id
                    WHERE member.personnel_id=?1 AND work.status<>'Завершили'
                )",
                [personnel_id],
                |row| row.get::<_, bool>(0),
            )
            .unwrap_or(false);
        let active_manual_assignment = transaction
            .query_row(
                "SELECT id FROM personnel_control_assignments WHERE personnel_id=?1 AND closed_at IS NULL ORDER BY id DESC LIMIT 1",
                [personnel_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|_| "Не вдалося перевірити ручне місце перебування.".to_string())?;
        if let Some(assignment_id) = active_manual_assignment {
            transaction.execute(
                "UPDATE personnel_control_assignments SET closed_on=?1,closed_at=CURRENT_TIMESTAMP,close_reason='Замінено фактичним складом плану польотів',updated_at=CURRENT_TIMESTAMP WHERE id=?2",
                rusqlite::params![local_date, assignment_id],
            ).map_err(|_| "Не вдалося завершити попереднє ручне місце перебування.".to_string())?;
            transaction.execute(
                "INSERT INTO personnel_control_events(assignment_id,personnel_id,full_name_snapshot,rank_snapshot,position_snapshot,action,location_type,institution,start_date,end_date,notes,reason)
                 SELECT assignment.id,person.id,trim(person.surname||' '||person.given_name||' '||person.patronymic),person.rank,person.position,'closed',assignment.location_type,assignment.institution,assignment.start_date,?1,assignment.notes,'Замінено фактичним складом плану польотів'
                 FROM personnel_control_assignments assignment JOIN personnel person ON person.id=assignment.personnel_id WHERE assignment.id=?2",
                rusqlite::params![local_date, assignment_id],
            ).map_err(|_| "Не вдалося зафіксувати автоматичний перехід у журналі.".to_string())?;
            current_location = "ОХ".into();
        }
        if has_active_position_work || !is_flight_plan_owned_location(&current_location) {
            transaction
                .execute(
                    "DELETE FROM flight_plan_personnel_locations
                     WHERE personnel_id=?1 AND date(plan_date)=date(?2)",
                    rusqlite::params![personnel_id, local_date],
                )
                .map_err(|_| "Не вдалося узгодити джерело стану БЧС.".to_string())?;
            continue;
        }
        if current_location != location {
            transaction
                .execute(
                    "UPDATE personnel SET current_location=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2",
                    rusqlite::params![location, personnel_id],
                )
                .map_err(|_| "Не вдалося активувати стан людини з плану польотів.".to_string())?;
        }
        transaction
            .execute(
                "INSERT INTO flight_plan_personnel_locations(personnel_id,plan_date,location,updated_at)
                 VALUES(?1,?2,?3,CURRENT_TIMESTAMP)
                 ON CONFLICT(personnel_id) DO UPDATE SET
                   plan_date=excluded.plan_date,
                   location=excluded.location,
                   updated_at=CASE
                     WHEN flight_plan_personnel_locations.plan_date<>excluded.plan_date
                       OR flight_plan_personnel_locations.location<>excluded.location
                     THEN CURRENT_TIMESTAMP
                     ELSE flight_plan_personnel_locations.updated_at
                   END",
                rusqlite::params![personnel_id, local_date, location],
            )
            .map_err(|_| "Не вдалося зберегти активний стан плану польотів.".to_string())?;
    }
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити активацію плану польотів у БЧС.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn sync_flight_plan_locations(
    state: tauri::State<AppState>,
    plan_date: String,
    assignments: Vec<FlightPlanCrewLocationAssignment>,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let today = chrono::Local::now().format("%d.%m.%Y").to_string();
    let today_iso = chrono::Local::now().format("%Y-%m-%d").to_string();
    if plan_date.trim() != today && plan_date.trim() != today_iso {
        return Ok(());
    }
    apply_flight_plan_locations_for_date(&db.connection, &assignments, &today_iso)
}

fn apply_flight_plan_locations_for_date(
    connection: &rusqlite::Connection,
    assignments: &[FlightPlanCrewLocationAssignment],
    plan_date: &str,
) -> Result<(), String> {
    if chrono::NaiveDate::parse_from_str(plan_date, "%Y-%m-%d")
        .is_ok_and(|date| date > chrono::Local::now().date_naive())
    {
        return Err("Майбутній план не може змінювати поточний стан БЧС.".into());
    }
    super::sync_manual_assignments_for_date(
        connection,
        &chrono::Local::now().format("%Y-%m-%d").to_string(),
    )?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося почати оновлення БЧС.".to_string())?;
    transaction
        .execute(
            "UPDATE personnel
             SET current_location='ОХ'
             WHERE current_location IN ('На позиції','ЗБЗ','ПБЗ')
               AND EXISTS(
                 SELECT 1 FROM flight_plan_personnel_locations state
                 WHERE state.personnel_id=personnel.id
               )",
            [],
        )
        .map_err(|_| "Не вдалося оновити попередні добові стани БЧС.".to_string())?;
    transaction
        .execute("DELETE FROM flight_plan_personnel_locations", [])
        .map_err(|_| "Не вдалося очистити попередні службові стани БЧС.".to_string())?;
    for assignment in assignments {
        let Some(initial) = assignment.stages.first() else {
            continue;
        };
        let final_stage = assignment.stages.last().unwrap_or(initial);
        let initial_ids: HashSet<i64> = initial.iter().copied().collect();
        let final_ids: HashSet<i64> = final_stage.iter().copied().collect();
        let all_ids: HashSet<i64> = assignment.stages.iter().flatten().copied().collect();
        let allowed = transaction
            .prepare("SELECT personnel_id FROM crew_members WHERE crew_id=?1 AND left_at IS NULL UNION SELECT personnel_id FROM crew_actual_members WHERE crew_id=?1")
            .and_then(|mut query| query.query_map([assignment.crew_id], |row| row.get::<_, i64>(0))?.collect::<Result<HashSet<_>, _>>())
            .map_err(|_| "Не вдалося перевірити склад екіпажу для ротації.".to_string())?;
        if all_ids.iter().any(|id| !allowed.contains(id)) {
            return Err("До ротації потрапила людина, яка не входить до екіпажу.".into());
        }
        for personnel_id in &all_ids {
            let current_location = transaction
                .query_row(
                    "SELECT current_location FROM personnel WHERE id=?1",
                    [personnel_id],
                    |row| row.get::<_, String>(0),
                )
                .unwrap_or_default();
            if !super::is_operationally_available(&current_location) {
                return Err(format!(
                    "До плану польотів не можна додати військовослужбовця зі станом «{}». Спочатку завершіть або змініть цей стан у його джерелі.",
                    current_location.trim()
                ));
            }
            let has_active_position_work = transaction
                .query_row(
                    "SELECT EXISTS(
                        SELECT 1 FROM position_work_members member
                        JOIN position_work work ON work.id=member.work_id
                        WHERE member.personnel_id=?1 AND work.status<>'Завершили'
                    )",
                    [personnel_id],
                    |row| row.get::<_, bool>(0),
                )
                .unwrap_or(false);
            if has_active_position_work {
                return Err("До плану польотів не можна додати військовослужбовця, залученого до активного рекогностування або облаштування позиції. Спочатку завершіть роботи на позиції.".into());
            }
            let entered_during_plan = assignment.stages.windows(2).any(|stages| {
                !stages[0].contains(personnel_id) && stages[1].contains(personnel_id)
            });
            let location = if assignment.departs_today {
                "ПБЗ"
            } else if final_ids.contains(personnel_id) {
                if assignment.arrives_today
                    || !initial_ids.contains(personnel_id)
                    || entered_during_plan
                {
                    "ЗБЗ"
                } else {
                    "На позиції"
                }
            } else {
                "ПБЗ"
            };
            transaction
                .execute(
                    "UPDATE personnel
                     SET current_location=?1,updated_at=CURRENT_TIMESTAMP
                     WHERE id=?2",
                    rusqlite::params![location, personnel_id],
                )
                .map_err(|_| "Не вдалося оновити стан людини у БЧС.".to_string())?;
            transaction
                .execute(
                    "INSERT INTO flight_plan_personnel_locations(personnel_id,plan_date,location,updated_at)
                     VALUES(?1,?2,?3,CURRENT_TIMESTAMP)
                     ON CONFLICT(personnel_id) DO UPDATE SET
                       plan_date=excluded.plan_date,
                       location=excluded.location,
                       updated_at=CURRENT_TIMESTAMP",
                    rusqlite::params![personnel_id, plan_date, location],
                )
                .map_err(|_| "Не вдалося зберегти службовий стан людини у БЧС.".to_string())?;
        }
    }
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити оновлення БЧС.".to_string())?;
    Ok(())
}

#[cfg(test)]
fn apply_flight_plan_locations(
    connection: &rusqlite::Connection,
    assignments: &[FlightPlanCrewLocationAssignment],
) -> Result<(), String> {
    apply_flight_plan_locations_for_date(connection, assignments, "2026-09-15")
}

#[cfg(test)]
mod flight_plan_location_tests {
    use super::*;

    fn insert_test_personnel(connection: &rusqlite::Connection, personnel_id: i64, location: &str) {
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','',?4)", rusqlite::params![personnel_id,format!("ЛЮДИНА{personnel_id}"),format!("tax-{personnel_id}"),location]).unwrap();
    }

    fn insert_location_snapshot(connection: &rusqlite::Connection, member_ids: &[i64]) {
        connection
            .execute(
                "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json)
                 VALUES('2026-09-18',1,?1)
                 ON CONFLICT(plan_date,revision) DO UPDATE SET
                   snapshot_json=excluded.snapshot_json",
                rusqlite::params![serde_json::json!({"entries":[{
                    "crewId":1,
                    "actualMemberIds":member_ids,
                    "startTime":"07:00",
                    "arrivesToday":true
                }]})
                .to_string()],
            )
            .unwrap();
    }

    fn listed_location(records: &[StaffingRecord], personnel_id: i64) -> &str {
        records
            .iter()
            .find(|record| record.personnel_id == personnel_id)
            .unwrap()
            .current_location
            .as_str()
    }

    #[test]
    fn tomorrow_preview_applies_both_day_boundaries_without_mutating_current_bcs() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO crews(id,name) VALUES(1,'СОКІЛ'),(2,'БАРС')",
                [],
            )
            .unwrap();
        insert_test_personnel(&connection, 1, "ОХ");
        insert_test_personnel(&connection, 2, "На позиції");
        connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,1),(2,2)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json) VALUES(?1,1,?2),(?3,1,?4)",
                rusqlite::params![
                    "2026-09-23",
                    serde_json::json!({"entries":[{"crewId":2,"actualMemberIds":[2],"startTime":"05:00","departsToday":true,"departureTime":"18:00"}]}).to_string(),
                    "2026-09-24",
                    serde_json::json!({"entries":[{"crewId":1,"actualMemberIds":[1],"startTime":"07:00","arrivesToday":true}]}).to_string(),
                ],
            )
            .unwrap();

        let preview = staffing_records_for_target_date(
            &connection,
            NaiveDate::from_ymd_opt(2026, 9, 23).unwrap(),
            "12:00",
            NaiveDate::from_ymd_opt(2026, 9, 24).unwrap(),
        )
        .unwrap();

        assert_eq!(listed_location(&preview, 1), "ЗБЗ");
        assert_eq!(listed_location(&preview, 2), "ОХ");
        assert_eq!(
            connection
                .query_row(
                    "SELECT current_location FROM personnel WHERE id=1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "ОХ"
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT current_location FROM personnel WHERE id=2",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "На позиції"
        );
    }

    #[test]
    fn staffing_uses_the_official_crew_and_keeps_the_actual_crew_separate() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'СОКІЛ')", [])
            .unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(2,'БАРС')", [])
            .unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ЛЮДИНА','Тест','Тестович','штатний оператор','tax-1','','','','','','','','На позиції')", []).unwrap();
        connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,1)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO crew_actual_members(crew_id,personnel_id) VALUES(2,1)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO personnel_staff_assignments(personnel_id,acting_position) VALUES(1,'Командир відділення')",
                [],
            )
            .unwrap();

        let records = staffing_records(&connection).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].crew_id, Some(1));
        assert_eq!(records[0].crew_name.as_deref(), Some("СОКІЛ"));
        assert_eq!(records[0].actual_crew_id, Some(2));
        assert_eq!(records[0].actual_crew_name.as_deref(), Some("БАРС"));
        assert_eq!(records[0].position, "штатний оператор");
        assert_eq!(records[0].acting_position, "Командир відділення");
    }

    #[test]
    fn assigns_daily_rotation_locations() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        for id in 1..=4 {
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','','ОХ')", rusqlite::params![id,format!("ЛЮДИНА{id}"),format!("tax-{id}")]).unwrap();
            connection
                .execute(
                    "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,?1)",
                    [id],
                )
                .unwrap();
        }
        apply_flight_plan_locations(
            &connection,
            &[FlightPlanCrewLocationAssignment {
                crew_id: 1,
                stages: vec![vec![1, 2], vec![1, 3]],
                arrives_today: false,
                departs_today: false,
            }],
        )
        .unwrap();
        let locations = (1..=4)
            .map(|id| {
                connection
                    .query_row(
                        "SELECT current_location FROM personnel WHERE id=?1",
                        [id],
                        |row| row.get::<_, String>(0),
                    )
                    .unwrap()
            })
            .collect::<Vec<_>>();
        assert_eq!(locations, vec!["На позиції", "ПБЗ", "ЗБЗ", "ОХ"]);
    }

    #[test]
    fn point_personnel_change_sets_pbz_at_exit_and_zbz_at_entry_time() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        for id in 1..=2 {
            insert_test_personnel(&connection, id, "ОХ");
            connection
                .execute(
                    "INSERT INTO crew_actual_members(crew_id,personnel_id) VALUES(1,?1)",
                    [id],
                )
                .unwrap();
        }
        connection.execute(
            "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json) VALUES('2026-09-18',1,?1)",
            [serde_json::json!({
                "entries":[{"crewId":1,"actualMemberIds":[2],"startTime":"07:00"}],
                "personnelTransitions":[{
                    "id":"change-1","crewId":1,
                    "outgoingMemberIds":[1],"outgoingTime":"19:00",
                    "incomingMemberIds":[2],"incomingTime":"20:00"
                }]
            }).to_string()],
        ).unwrap();
        let location = |id| {
            connection
                .query_row(
                    "SELECT current_location FROM personnel WHERE id=?1",
                    [id],
                    |row| row.get::<_, String>(0),
                )
                .unwrap()
        };

        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "18:59").unwrap();
        assert_eq!(
            (location(1), location(2)),
            ("На позиції".into(), "ОХ".into())
        );
        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "19:00").unwrap();
        assert_eq!((location(1), location(2)), ("ПБЗ".into(), "ОХ".into()));
        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "20:00").unwrap();
        assert_eq!((location(1), location(2)), ("ПБЗ".into(), "ЗБЗ".into()));
    }

    #[test]
    fn rejects_absent_people_before_changing_flight_plan_locations() {
        for (index, location) in [
            "ВІДП",
            "Відкомандировані",
            "СЗЧ",
            "ПТЗ Новостав",
            "НАВЧ",
            "ВІДР",
            "ЛІК",
        ]
        .into_iter()
        .enumerate()
        {
            let connection = rusqlite::Connection::open_in_memory().unwrap();
            crate::database::initialise(&connection).unwrap();
            connection
                .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
                .unwrap();
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ЛЮДИНА','Тест','Тестович','оператор',?1,'','','','','','','',?2)", rusqlite::params![format!("tax-{index}"), location]).unwrap();
            connection
                .execute(
                    "INSERT INTO crew_actual_members(crew_id,personnel_id) VALUES(1,1)",
                    [],
                )
                .unwrap();

            assert!(apply_flight_plan_locations(
                &connection,
                &[FlightPlanCrewLocationAssignment {
                    crew_id: 1,
                    stages: vec![vec![1]],
                    arrives_today: true,
                    departs_today: false,
                }],
            )
            .is_err());
            let stored: String = connection
                .query_row(
                    "SELECT current_location FROM personnel WHERE id=1",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(stored, location);
        }
    }

    #[test]
    fn marks_a_member_who_leaves_and_reenters_the_final_stage_as_zbz() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        for id in 1..=2 {
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','','ОХ')", rusqlite::params![id,format!("ЛЮДИНА{id}"),format!("tax-{id}")]).unwrap();
            connection
                .execute(
                    "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,?1)",
                    [id],
                )
                .unwrap();
        }

        apply_flight_plan_locations(
            &connection,
            &[FlightPlanCrewLocationAssignment {
                crew_id: 1,
                stages: vec![vec![1], vec![2], vec![1]],
                arrives_today: false,
                departs_today: false,
            }],
        )
        .unwrap();

        let locations = (1..=2)
            .map(|id| {
                connection
                    .query_row(
                        "SELECT current_location FROM personnel WHERE id=?1",
                        [id],
                        |row| row.get::<_, String>(0),
                    )
                    .unwrap()
            })
            .collect::<Vec<_>>();
        assert_eq!(locations, vec!["ЗБЗ", "ПБЗ"]);
    }

    #[test]
    fn marks_an_explicit_departure_as_pbz_and_clears_it_on_the_next_plan() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        for id in 1..=2 {
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','','На позиції')", rusqlite::params![id,format!("ЛЮДИНА{id}"),format!("tax-{id}")]).unwrap();
            connection
                .execute(
                    "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,?1)",
                    [id],
                )
                .unwrap();
        }
        apply_flight_plan_locations(
            &connection,
            &[FlightPlanCrewLocationAssignment {
                crew_id: 1,
                stages: vec![vec![1, 2]],
                arrives_today: false,
                departs_today: true,
            }],
        )
        .unwrap();
        let location = |id| {
            connection
                .query_row(
                    "SELECT current_location FROM personnel WHERE id=?1",
                    [id],
                    |row| row.get::<_, String>(0),
                )
                .unwrap()
        };
        assert_eq!((location(1), location(2)), ("ПБЗ".into(), "ПБЗ".into()));

        apply_flight_plan_locations(&connection, &[]).unwrap();
        assert_eq!((location(1), location(2)), ("ОХ".into(), "ОХ".into()));
    }

    #[test]
    fn replacing_a_plan_resets_only_locations_owned_by_the_previous_plan() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        for id in 1..=2 {
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','','На позиції')", rusqlite::params![id,format!("ЛЮДИНА{id}"),format!("tax-{id}")]).unwrap();
        }
        connection.execute(
            "INSERT INTO flight_plan_personnel_locations(personnel_id,plan_date,location) VALUES(1,'2026-09-15','На позиції')",
            [],
        ).unwrap();

        apply_flight_plan_locations(&connection, &[]).unwrap();

        let location = |id| {
            connection
                .query_row(
                    "SELECT current_location FROM personnel WHERE id=?1",
                    [id],
                    |row| row.get::<_, String>(0),
                )
                .unwrap()
        };
        assert_eq!(location(1), "ОХ");
        assert_eq!(location(2), "На позиції");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM flight_plan_personnel_locations",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
    }

    #[test]
    fn marks_a_new_arrival_as_zbz_then_on_position_in_the_next_plan() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ЛЮДИНА','Тест','Тестович','оператор','tax-1','','','','','','','','ОХ')", []).unwrap();
        connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,1)",
                [],
            )
            .unwrap();
        apply_flight_plan_locations(
            &connection,
            &[FlightPlanCrewLocationAssignment {
                crew_id: 1,
                stages: vec![vec![1]],
                arrives_today: true,
                departs_today: false,
            }],
        )
        .unwrap();
        let location = || {
            connection
                .query_row(
                    "SELECT current_location FROM personnel WHERE id=1",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap()
        };
        assert_eq!(location(), "ЗБЗ");

        apply_flight_plan_locations(
            &connection,
            &[FlightPlanCrewLocationAssignment {
                crew_id: 1,
                stages: vec![vec![1]],
                arrives_today: false,
                departs_today: false,
            }],
        )
        .unwrap();
        assert_eq!(location(), "На позиції");
    }

    #[test]
    fn next_plan_turns_the_new_composition_into_on_position() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        for (id, location) in [(1, "На позиції"), (2, "ПБЗ"), (3, "ЗБЗ")] {
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','',?4)", rusqlite::params![id,format!("ЛЮДИНА{id}"),format!("tax-{id}"),location]).unwrap();
            connection
                .execute(
                    "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,?1)",
                    [id],
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO flight_plan_personnel_locations(personnel_id,plan_date,location) VALUES(?1,'2026-09-14',?2)",
                    rusqlite::params![id, location],
                )
                .unwrap();
        }
        apply_flight_plan_locations(
            &connection,
            &[FlightPlanCrewLocationAssignment {
                crew_id: 1,
                stages: vec![vec![1, 3]],
                arrives_today: false,
                departs_today: false,
            }],
        )
        .unwrap();
        let locations = (1..=3)
            .map(|id| {
                connection
                    .query_row(
                        "SELECT current_location FROM personnel WHERE id=?1",
                        [id],
                        |row| row.get::<_, String>(0),
                    )
                    .unwrap()
            })
            .collect::<Vec<_>>();
        assert_eq!(locations, vec!["На позиції", "ОХ", "На позиції"]);
    }

    #[test]
    fn tracks_members_who_only_participate_in_a_middle_rotation_stage() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        for id in 1..=3 {
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','','ОХ')", rusqlite::params![id,format!("ЛЮДИНА{id}"),format!("tax-{id}")]).unwrap();
            connection
                .execute(
                    "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,?1)",
                    [id],
                )
                .unwrap();
        }

        apply_flight_plan_locations(
            &connection,
            &[FlightPlanCrewLocationAssignment {
                crew_id: 1,
                stages: vec![vec![1], vec![1, 2], vec![1, 3]],
                arrives_today: true,
                departs_today: false,
            }],
        )
        .unwrap();

        let locations = (1..=3)
            .map(|id| {
                connection
                    .query_row(
                        "SELECT current_location FROM personnel WHERE id=?1",
                        [id],
                        |row| row.get::<_, String>(0),
                    )
                    .unwrap()
            })
            .collect::<Vec<_>>();
        assert_eq!(locations, vec!["ЗБЗ", "ПБЗ", "ЗБЗ"]);
    }

    #[test]
    fn active_position_work_is_rejected_without_creating_a_flight_plan_source() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        connection
            .execute("INSERT INTO positions(id,name) VALUES(1,'САПСАН')", [])
            .unwrap();
        for (id, location) in [(1, "Реко та облаштування"), (2, "ОХ")] {
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','',?4)", rusqlite::params![id,format!("ЛЮДИНА{id}"),format!("tax-{id}"),location]).unwrap();
            connection
                .execute(
                    "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,?1)",
                    [id],
                )
                .unwrap();
        }
        connection.execute("INSERT INTO position_work(id,position_id,work_type,status,start_date,start_time) VALUES(10,1,'Облаштування','Продовжують','2026-09-15','08:00')", []).unwrap();
        connection
            .execute(
                "INSERT INTO position_work_members(work_id,personnel_id) VALUES(10,1)",
                [],
            )
            .unwrap();

        let error = apply_flight_plan_locations(
            &connection,
            &[FlightPlanCrewLocationAssignment {
                crew_id: 1,
                stages: vec![vec![1, 2]],
                arrives_today: false,
                departs_today: false,
            }],
        )
        .unwrap_err();

        let locations = (1..=2)
            .map(|id| {
                connection
                    .query_row(
                        "SELECT current_location FROM personnel WHERE id=?1",
                        [id],
                        |row| row.get::<_, String>(0),
                    )
                    .unwrap()
            })
            .collect::<Vec<_>>();
        assert!(error.contains("активного рекогностування або облаштування"));
        assert_eq!(locations, vec!["Реко та облаштування", "ОХ"]);
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM flight_plan_personnel_locations",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
    }

    #[test]
    fn listing_normalizes_only_stale_daily_transition_locations() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        for (id, location, updated_at) in [
            (1, "ЗБЗ", "2026-09-14 12:00:00"),
            (2, "ПБЗ", "2026-09-14 12:00:00"),
            (3, "На позиції", "2026-09-14 12:00:00"),
            (4, "Реко та облаштування", "2026-09-14 12:00:00"),
            (5, "ЗБЗ", "2026-09-15 12:00:00"),
            (6, "ПБЗ", "2026-09-15 12:00:00"),
        ] {
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location,updated_at) VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','',?4,?5)", rusqlite::params![id,format!("ЛЮДИНА{id}"),format!("tax-{id}"),location,updated_at]).unwrap();
            if matches!(location, "ЗБЗ" | "ПБЗ") {
                connection
                    .execute(
                        "INSERT INTO flight_plan_personnel_locations(personnel_id,plan_date,location) VALUES(?1,date(?2),?3)",
                        rusqlite::params![id, updated_at, location],
                    )
                    .unwrap();
            }
        }

        normalize_stale_daily_locations(&connection, "2026-09-15").unwrap();

        let locations = (1..=6)
            .map(|id| {
                connection
                    .query_row(
                        "SELECT current_location FROM personnel WHERE id=?1",
                        [id],
                        |row| row.get::<_, String>(0),
                    )
                    .unwrap()
            })
            .collect::<Vec<_>>();
        assert_eq!(
            locations,
            vec![
                "На позиції",
                "ОХ",
                "На позиції",
                "Реко та облаштування",
                "ЗБЗ",
                "ПБЗ"
            ]
        );
    }

    #[test]
    fn unrelated_personnel_update_does_not_delay_daily_location_normalization() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ЛЮДИНА','Тест','Тестович','оператор','tax-1','','','','','','','','ОХ')", []).unwrap();
        connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,1)",
                [],
            )
            .unwrap();
        apply_flight_plan_locations_for_date(
            &connection,
            &[FlightPlanCrewLocationAssignment {
                crew_id: 1,
                stages: vec![vec![1]],
                arrives_today: true,
                departs_today: false,
            }],
            "2026-09-14",
        )
        .unwrap();
        connection
            .execute(
                "UPDATE personnel SET surname='ОНОВЛЕНО',updated_at='2026-09-15 12:00:00' WHERE id=1",
                [],
            )
            .unwrap();

        normalize_stale_daily_locations(&connection, "2026-09-15").unwrap();

        let location = connection
            .query_row(
                "SELECT current_location FROM personnel WHERE id=1",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        let service_rows = connection
            .query_row(
                "SELECT COUNT(*) FROM flight_plan_personnel_locations WHERE personnel_id=1",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap();
        assert_eq!(location, "На позиції");
        assert_eq!(service_rows, 0);
    }

    #[test]
    fn a_future_plan_date_does_not_finish_a_current_manual_assignment() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ЛЮДИНА','Тест','Тестович','оператор','tax-1','','','','','','','','ВІДР')", []).unwrap();
        connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,1)",
                [],
            )
            .unwrap();
        let today = chrono::Local::now().date_naive();
        connection
            .execute(
                "INSERT INTO personnel_control_assignments(
                personnel_id,location_type,institution,start_date,end_date,previous_location
             ) VALUES(1,'ВІДР','Установа',?1,?2,'ОХ')",
                rusqlite::params![
                    (today - chrono::Duration::days(1))
                        .format("%Y-%m-%d")
                        .to_string(),
                    today.format("%Y-%m-%d").to_string()
                ],
            )
            .unwrap();

        let error = apply_flight_plan_locations_for_date(
            &connection,
            &[FlightPlanCrewLocationAssignment {
                crew_id: 1,
                stages: vec![vec![1]],
                arrives_today: false,
                departs_today: false,
            }],
            "2099-01-01",
        )
        .unwrap_err();

        let (location, still_open): (String, i64) = (
            connection.query_row("SELECT current_location FROM personnel WHERE id=1", [], |row| row.get(0)).unwrap(),
            connection.query_row("SELECT COUNT(*) FROM personnel_control_assignments WHERE personnel_id=1 AND closed_at IS NULL", [], |row| row.get(0)).unwrap(),
        );
        assert_eq!(location, "ВІДР");
        assert_eq!(still_open, 1);
        assert!(error.contains("Майбутній план"));
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM flight_plan_personnel_locations",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
    }

    #[test]
    fn saved_plan_is_activated_only_when_its_timed_transitions_happen() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        for id in 1..=3 {
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','','ОХ')", rusqlite::params![id,format!("ЛЮДИНА{id}"),format!("tax-{id}")]).unwrap();
            connection
                .execute(
                    "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,?1)",
                    [id],
                )
                .unwrap();
        }
        connection.execute(
            "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json)
             VALUES('2026-09-18',1,?1)",
            [serde_json::json!({"unitName":"РБПАК","entries":[
                {"crewId":1,"actualMemberIds":[1,2],"startTime":"07:00","arrivesToday":true,"departsToday":true,"departureTime":"16:00"},
                {"crewId":1,"actualMemberIds":[2,3],"startTime":"12:00"}
            ]}).to_string()],
        ).unwrap();

        reconcile_flight_plan_for_moment(&connection, "2026-09-17", "12:00").unwrap();
        let unchanged_before_execution = (1..=3)
            .map(|id| {
                connection
                    .query_row(
                        "SELECT current_location FROM personnel WHERE id=?1",
                        [id],
                        |row| row.get::<_, String>(0),
                    )
                    .unwrap()
            })
            .collect::<Vec<_>>();
        assert_eq!(unchanged_before_execution, vec!["ОХ", "ОХ", "ОХ"]);

        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "06:59").unwrap();
        let locations = |connection: &rusqlite::Connection| {
            (1..=3)
                .map(|id| {
                    connection
                        .query_row(
                            "SELECT current_location FROM personnel WHERE id=?1",
                            [id],
                            |row| row.get::<_, String>(0),
                        )
                        .unwrap()
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(locations(&connection), vec!["ОХ", "ОХ", "ОХ"]);

        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "07:00").unwrap();
        assert_eq!(locations(&connection), vec!["ЗБЗ", "ЗБЗ", "ОХ"]);

        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "12:00").unwrap();
        assert_eq!(locations(&connection), vec!["ПБЗ", "ЗБЗ", "ЗБЗ"]);

        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "16:00").unwrap();
        assert_eq!(locations(&connection), vec!["ПБЗ", "ПБЗ", "ПБЗ"]);
    }

    #[test]
    fn automatic_plan_activation_does_not_override_manual_or_position_work_state() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        connection
            .execute("INSERT INTO positions(id,name) VALUES(1,'САПСАН')", [])
            .unwrap();
        for (id, location) in [(1, "НАВЧ"), (2, "Реко"), (3, "ОХ")] {
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(?1,'солдат',?2,'Тест','Тестович','оператор',?3,'','','','','','','',?4)", rusqlite::params![id,format!("ЛЮДИНА{id}"),format!("tax-{id}"),location]).unwrap();
            connection
                .execute(
                    "INSERT INTO crew_members(crew_id,personnel_id) VALUES(1,?1)",
                    [id],
                )
                .unwrap();
        }
        connection.execute("INSERT INTO personnel_control_assignments(personnel_id,location_type,institution,start_date,end_date,previous_location) VALUES(1,'НАВЧ','Центр','2026-09-17','2026-09-19','ОХ')", []).unwrap();
        connection.execute("INSERT INTO position_work(id,position_id,work_type,status,start_date,start_time) VALUES(10,1,'Рекогностування','Продовжують','2026-09-18','08:00')", []).unwrap();
        connection
            .execute(
                "INSERT INTO position_work_members(work_id,personnel_id) VALUES(10,2)",
                [],
            )
            .unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(plan_date,revision,snapshot_json) VALUES('2026-09-18',1,?1)",
            [serde_json::json!({"entries":[{"crewId":1,"actualMemberIds":[1,2,3],"startTime":"07:00","arrivesToday":true}]}).to_string()],
        ).unwrap();

        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "09:00").unwrap();

        let locations = (1..=3)
            .map(|id| {
                connection
                    .query_row(
                        "SELECT current_location FROM personnel WHERE id=?1",
                        [id],
                        |row| row.get::<_, String>(0),
                    )
                    .unwrap()
            })
            .collect::<Vec<_>>();
        assert_eq!(locations, vec!["ЗБЗ", "Реко", "ЗБЗ"]);
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM flight_plan_personnel_locations",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            2
        );
    }

    #[test]
    fn replacing_current_snapshot_reconciles_obsolete_plan_sources_only() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        connection
            .execute("INSERT INTO positions(id,name) VALUES(1,'САПСАН')", [])
            .unwrap();
        for (id, location) in [
            (1, "ОХ"),
            (2, "ОХ"),
            (3, "НАВЧ"),
            (4, "Реко"),
            (5, "ВІДП"),
            (6, "На позиції"),
        ] {
            insert_test_personnel(&connection, id, location);
        }
        connection.execute("INSERT INTO personnel_control_assignments(personnel_id,location_type,institution,start_date,end_date,previous_location) VALUES(3,'НАВЧ','Центр','2026-09-17','2026-09-19','ОХ')", []).unwrap();
        connection.execute("INSERT INTO position_work(id,position_id,work_type,status,start_date,start_time) VALUES(10,1,'Рекогностування','Продовжують','2026-09-18','08:00')", []).unwrap();
        connection
            .execute(
                "INSERT INTO position_work_members(work_id,personnel_id) VALUES(10,4)",
                [],
            )
            .unwrap();

        insert_location_snapshot(&connection, &[1]);
        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "09:00").unwrap();
        assert_eq!(
            listed_location(&staffing_records(&connection).unwrap(), 1),
            "ЗБЗ"
        );

        for personnel_id in 3..=5 {
            connection
                .execute(
                    "INSERT INTO flight_plan_personnel_locations(personnel_id,plan_date,location)
                 VALUES(?1,'2026-09-18','ЗБЗ')",
                    [personnel_id],
                )
                .unwrap();
        }
        insert_location_snapshot(&connection, &[2]);
        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "09:00").unwrap();

        let records = staffing_records(&connection).unwrap();
        assert_eq!(listed_location(&records, 1), "ОХ");
        assert_eq!(listed_location(&records, 2), "ЗБЗ");
        assert_eq!(listed_location(&records, 3), "НАВЧ");
        assert_eq!(listed_location(&records, 4), "Реко");
        assert_eq!(listed_location(&records, 5), "ВІДП");
        assert_eq!(listed_location(&records, 6), "На позиції");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM flight_plan_personnel_locations",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT personnel_id FROM flight_plan_personnel_locations",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            2
        );

        connection
            .execute(
                "UPDATE flight_plan_snapshots SET snapshot_json='{\"entries\":[]}'
                 WHERE plan_date='2026-09-18'",
                [],
            )
            .unwrap();
        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "09:00").unwrap();
        let records = staffing_records(&connection).unwrap();
        assert_eq!(listed_location(&records, 2), "ОХ");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM flight_plan_personnel_locations",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            0
        );
    }

    #[test]
    fn orphan_snapshot_personnel_are_skipped_without_breaking_bcs_listing() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(1,'БАРС')", [])
            .unwrap();
        insert_test_personnel(&connection, 1, "ОХ");
        insert_location_snapshot(&connection, &[1, 999]);

        reconcile_flight_plan_for_moment(&connection, "2026-09-18", "09:00").unwrap();

        let records = staffing_records(&connection).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(listed_location(&records, 1), "ЗБЗ");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM flight_plan_personnel_locations",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
    }
}

#[tauri::command]
pub fn update_staffing_personnel(
    state: tauri::State<AppState>,
    personnel_id: i64,
    position: String,
    acting_position: String,
    current_location: String,
    functional_duties: String,
    notes: String,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    reconcile_flight_plan_for_now(&db.connection)?;
    if position.trim().is_empty() {
        return Err("Вкажіть посаду для переміщення.".into());
    }
    if !crate::database::is_valid_bcs_location(&current_location) {
        return Err("Оберіть значення «Де знаходиться» з довідника БЧС.".into());
    }
    let previous_location = db
        .connection
        .query_row(
            "SELECT current_location FROM personnel WHERE id=?1",
            [personnel_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "Військовослужбовця не знайдено.".to_string())?;
    let has_manual_source = db
        .connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM personnel_control_assignments
                WHERE personnel_id=?1 AND closed_at IS NULL
            )",
            [personnel_id],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false);
    let has_position_source = db
        .connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM flight_plan_personnel_locations WHERE personnel_id=?1
            )",
            [personnel_id],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false);
    let has_work_source = db
        .connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM position_work_members member
                JOIN position_work work ON work.id=member.work_id
                WHERE member.personnel_id=?1 AND work.status<>'Завершили'
            )",
            [personnel_id],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false);
    validate_controlled_location_change(
        &previous_location,
        &current_location,
        has_manual_source,
        has_position_source,
        has_work_source,
    )?;
    db.connection.execute("UPDATE personnel SET position=?1,current_location=?2,functional_duties=?3,bcs_notes=?4,updated_at=CURRENT_TIMESTAMP WHERE id=?5", rusqlite::params![crate::database::canonical_staff_position(&position), current_location.trim(), functional_duties.trim(), notes.trim(), personnel_id]).map_err(|_| "Не вдалося оновити кадрові дані.".to_string())?;
    db.connection.execute("INSERT INTO personnel_staff_assignments(personnel_id,acting_position,updated_at) VALUES(?1,?2,CURRENT_TIMESTAMP) ON CONFLICT(personnel_id) DO UPDATE SET acting_position=excluded.acting_position,updated_at=CURRENT_TIMESTAMP", rusqlite::params![personnel_id, acting_position.trim()]).map_err(|_| "Не вдалося зберегти ТВО.".to_string())?;
    Ok(())
}

fn validate_controlled_location_change(
    previous: &str,
    next: &str,
    _has_manual_source: bool,
    _has_position_source: bool,
    _has_work_source: bool,
) -> Result<(), String> {
    if previous.trim() == next.trim() {
        return Ok(());
    }
    Err("Поле «Де знаходиться» є підсумком. Ручні місця змінюйте у вкладці «Контроль особового складу», автоматичні — у відповідному робочому розділі.".into())
}

#[cfg(test)]
mod controlled_location_change_tests {
    use super::validate_controlled_location_change;

    #[test]
    fn preserves_control_history_by_rejecting_direct_bcs_location_changes() {
        assert!(validate_controlled_location_change("ВІДР", "ОХ", true, false, false).is_err());
        assert!(validate_controlled_location_change("ОХ", "НАВЧ", false, false, false).is_err());
        assert!(validate_controlled_location_change("ОХ", "ЗБЗ", false, true, false).is_err());
        assert!(validate_controlled_location_change(
            "Реко та облаштування",
            "ОХ",
            false,
            false,
            true
        )
        .is_err());
        assert!(validate_controlled_location_change("ВІДР", "ВІДР", true, false, false).is_ok());
        assert!(validate_controlled_location_change("ОХ", "ШТАБ", false, false, false).is_err());
    }

    #[test]
    fn legacy_location_without_an_active_owner_can_be_corrected() {
        assert!(
            validate_controlled_location_change("ОХ", "На позиції", false, false, false).is_err()
        );
        assert!(validate_controlled_location_change("ОХ", "ГШР", false, false, false).is_err());
        assert!(validate_controlled_location_change("ГШР", "ОХ", false, false, false).is_err());
        assert!(validate_controlled_location_change("Реко", "ОХ", false, false, false).is_err());
        assert!(validate_controlled_location_change("ЛІК", "ОХ", false, false, false).is_err());
        assert!(validate_controlled_location_change("ЗБЗ", "ОХ", false, true, false).is_err());
    }
}

#[tauri::command]
pub fn transfer_staffing_chain(
    state: tauri::State<AppState>,
    assignments: Vec<StaffTransfer>,
    acting_changes: Vec<ActingChange>,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    apply_staff_transfers(&db.connection, &assignments, &acting_changes)
}

fn apply_staff_transfers(
    connection: &rusqlite::Connection,
    assignments: &[StaffTransfer],
    acting_changes: &[ActingChange],
) -> Result<(), String> {
    use std::collections::HashSet;
    if assignments.is_empty() && acting_changes.is_empty() {
        return Err("Не вибрано жодної зміни.".into());
    }
    let transaction = connection
        .unchecked_transaction()
        .map_err(|e| e.to_string())?;
    let mut people = HashSet::new();
    let mut targets = HashSet::new();
    for assignment in assignments {
        if assignment.slot_id.is_empty()
            || assignment.position.trim().is_empty()
            || !people.insert(assignment.personnel_id)
            || !targets.insert(&assignment.slot_id)
        {
            return Err("Людина або штатне місце призначені двічі, або місце не вказане.".into());
        }
        let current: String = transaction
            .query_row(
                "SELECT position FROM personnel WHERE id=?1",
                [assignment.personnel_id],
                |row| row.get(0),
            )
            .map_err(|_| "Військовослужбовця не знайдено.")?;
        if current != assignment.expected_position {
            return Err("Штат змінився. Відкрийте переміщення повторно.".into());
        }
    }
    for assignment in assignments {
        let mut occupants = assignment.expected_occupant_ids.clone();
        // A legacy person without a stored slot id is mapped to one concrete
        // billet by the staffing screen and is already present in
        // expected_occupant_ids.  Looking up every unassigned person with the
        // same position text made all identical billets appear occupied and
        // blocked moves into a visibly free slot.
        let mut query = transaction
            .prepare("SELECT personnel_id FROM personnel_staff_assignments WHERE slot_id=?1")
            .map_err(|e| e.to_string())?;
        occupants.extend(
            query
                .query_map([assignment.slot_id.as_str()], |row| row.get::<_, i64>(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?,
        );
        if occupants
            .iter()
            .any(|id| *id != assignment.personnel_id && !people.contains(id))
        {
            return Err("Незавершений ланцюжок: перемістіть людину, що займає цю посаду.".into());
        }
        let mut acting_query = transaction.prepare("SELECT personnel_id FROM personnel_staff_assignments WHERE acting_slot_id=?1 OR (acting_slot_id='' AND acting_position=?2)").map_err(|e| e.to_string())?;
        for id in acting_query
            .query_map(
                rusqlite::params![assignment.slot_id, assignment.position],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| e.to_string())?
        {
            let id = id.map_err(|e| e.to_string())?;
            if !acting_changes
                .iter()
                .any(|change| change.personnel_id == id && change.slot_id.is_empty())
            {
                return Err("Підтвердіть зняття ТВО перед призначенням на цю посаду.".into());
            }
        }
    }
    for assignment in assignments {
        transaction
            .execute(
                "UPDATE personnel SET position=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2",
                rusqlite::params![
                    crate::database::canonical_staff_position(&assignment.position),
                    assignment.personnel_id
                ],
            )
            .map_err(|e| e.to_string())?;
        transaction.execute("INSERT INTO personnel_staff_assignments(personnel_id,slot_id) VALUES(?1,?2) ON CONFLICT(personnel_id) DO UPDATE SET slot_id=excluded.slot_id,updated_at=CURRENT_TIMESTAMP", rusqlite::params![assignment.personnel_id, assignment.slot_id]).map_err(|e| e.to_string())?;
    }
    let mut acting_people = HashSet::new();
    let mut acting_slots = HashSet::new();
    for change in acting_changes {
        if !acting_people.insert(change.personnel_id)
            || (!change.slot_id.is_empty()
                && (!acting_slots.insert(&change.slot_id) || change.position.is_empty()))
        {
            return Err("ТВО призначено двічі.".into());
        }
        if !change.slot_id.is_empty() {
            let occupied: i64 = transaction.query_row("SELECT COUNT(*) FROM personnel p LEFT JOIN personnel_staff_assignments a ON a.personnel_id=p.id WHERE a.slot_id=?1 OR (COALESCE(a.slot_id,'')='' AND p.position=?2)", rusqlite::params![change.slot_id,change.position], |row| row.get(0)).map_err(|e| e.to_string())?;
            let other_acting: i64 = transaction.query_row("SELECT COUNT(*) FROM personnel_staff_assignments WHERE acting_slot_id=?1 AND personnel_id<>?2", rusqlite::params![change.slot_id,change.personnel_id], |row| row.get(0)).map_err(|e| e.to_string())?;
            if occupied > 0 || other_acting > 0 {
                return Err("ТВО можна призначити лише на вільне місце без іншого ТВО.".into());
            }
        }
        transaction.execute("INSERT INTO personnel_staff_assignments(personnel_id,acting_slot_id,acting_position) VALUES(?1,?2,?3) ON CONFLICT(personnel_id) DO UPDATE SET acting_slot_id=excluded.acting_slot_id,acting_position=excluded.acting_position,updated_at=CURRENT_TIMESTAMP", rusqlite::params![change.personnel_id,change.slot_id,change.position]).map_err(|e| e.to_string())?;
    }
    transaction.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_staff_recommendation(
    state: tauri::State<AppState>,
    personnel_id: i64,
    position_name: String,
    issued_at: String,
    notes: String,
) -> Result<(), String> {
    if position_name.trim().is_empty() || issued_at.trim().is_empty() {
        return Err("Вкажіть посаду та дату рекомендаційного листа.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection.execute("INSERT INTO staff_recommendations(personnel_id,position_name,issued_at,notes) VALUES(?1,?2,?3,?4)", rusqlite::params![personnel_id, position_name.trim(), issued_at.trim(), notes.trim()]).map_err(|_| "Не вдалося зберегти рекомендаційний лист.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_staff_recommendations(
    state: tauri::State<AppState>,
) -> Result<Vec<StaffRecommendation>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db.connection.prepare("SELECT sr.id,sr.personnel_id,trim(p.surname||' '||p.given_name||' '||p.patronymic),sr.position_name,sr.issued_at,sr.notes FROM staff_recommendations sr JOIN personnel p ON p.id=sr.personnel_id ORDER BY sr.issued_at DESC,sr.id DESC").map_err(|_| "Не вдалося прочитати рекомендаційні листи.".to_string())?;
    let result = statement
        .query_map([], |row| {
            Ok(StaffRecommendation {
                id: row.get(0)?,
                personnel_id: row.get(1)?,
                full_name: row.get(2)?,
                position_name: row.get(3)?,
                issued_at: row.get(4)?,
                notes: row.get(5)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати рекомендаційні листи.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати рекомендаційні листи.".to_string());
    result
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri exposes these form fields as separate command arguments.
pub fn create_vacancy_recommendation(
    state: tauri::State<AppState>,
    slot_id: Option<String>,
    position_name: String,
    full_name: String,
    phone: String,
    rank: String,
    birth_date: String,
    issued_at: String,
    notes: String,
) -> Result<(), String> {
    if position_name.trim().is_empty() || full_name.trim().is_empty() || issued_at.trim().is_empty()
    {
        return Err("Вкажіть посаду, ПІБ кандидата та дату видачі.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute(
            "INSERT INTO staff_position_recommendations(position_name,full_name,phone,rank,birth_date,issued_at,notes,slot_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![position_name.trim(), full_name.trim(), phone.trim(), rank.trim(), birth_date.trim(), issued_at.trim(), notes.trim(), slot_id.unwrap_or_default()],
        )
        .map_err(|_| "Не вдалося зберегти рекомендаційний лист для вільної посади.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_vacancy_recommendations(
    state: tauri::State<AppState>,
) -> Result<Vec<VacancyRecommendation>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db.connection.prepare("SELECT id,position_name,full_name,phone,rank,birth_date,issued_at,notes,slot_id FROM staff_position_recommendations ORDER BY issued_at DESC,id DESC").map_err(|_| "Не вдалося прочитати рекомендації для вільних посад.".to_string())?;
    let result = statement
        .query_map([], |row| {
            Ok(VacancyRecommendation {
                slot_id: row.get(8)?,
                id: row.get(0)?,
                position_name: row.get(1)?,
                full_name: row.get(2)?,
                phone: row.get(3)?,
                rank: row.get(4)?,
                birth_date: row.get(5)?,
                issued_at: row.get(6)?,
                notes: row.get(7)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати рекомендації для вільних посад.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати рекомендації для вільних посад.".to_string());
    result
}

#[cfg(test)]
mod staff_transfer_tests {
    use super::*;
    fn db() -> rusqlite::Connection {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::initialise(&db).unwrap();
        for id in 1..=3 {
            db.execute("INSERT INTO personnel(id,surname,given_name,patronymic,rank,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(?1,?2,'Іван','Тестович','солдат',?3,?4,'','','','','','','')",rusqlite::params![id,format!("Тест{id}"),format!("Посада {id}"),format!("ID{id}")]).unwrap();
            db.execute(
                "INSERT INTO personnel_staff_assignments(personnel_id,slot_id) VALUES(?1,?2)",
                rusqlite::params![id, format!("slot-{id}")],
            )
            .unwrap();
        }
        db
    }
    fn movement(id: i64, target: i64) -> StaffTransfer {
        StaffTransfer {
            personnel_id: id,
            position: format!("Посада {target}"),
            slot_id: format!("slot-{target}"),
            expected_position: format!("Посада {id}"),
            expected_occupant_ids: vec![target],
        }
    }
    #[test]
    fn rejects_unresolved_chain_without_partial_changes() {
        let db = db();
        assert!(apply_staff_transfers(&db, &[movement(1, 2)], &[]).is_err());
        assert_eq!(
            db.query_row("SELECT position FROM personnel WHERE id=1", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "Посада 1"
        );
    }
    #[test]
    fn swaps_specific_slots_atomically() {
        let db = db();
        apply_staff_transfers(&db, &[movement(1, 2), movement(2, 1)], &[]).unwrap();
        assert_eq!(
            db.query_row(
                "SELECT slot_id FROM personnel_staff_assignments WHERE personnel_id=1",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "slot-2"
        );
    }
    #[test]
    fn same_title_on_different_slots_is_allowed() {
        let db = db();
        let mut a = movement(1, 4);
        let mut b = movement(2, 5);
        a.expected_occupant_ids.clear();
        b.expected_occupant_ids.clear();
        a.position = "Водій-електрик".into();
        b.position = a.position.clone();
        apply_staff_transfers(&db, &[a, b], &[]).unwrap();
        assert_eq!(db.query_row("SELECT COUNT(DISTINCT slot_id) FROM personnel_staff_assignments WHERE personnel_id IN (1,2)",[],|r|r.get::<_,i64>(0)).unwrap(),2);
    }
    #[test]
    fn legacy_people_with_the_same_title_do_not_block_a_visibly_free_slot() {
        let db = db();
        db.execute(
            "DELETE FROM personnel_staff_assignments WHERE personnel_id IN (1,2)",
            [],
        )
        .unwrap();
        db.execute(
            "UPDATE personnel SET position='Оператор' WHERE id IN (1,2)",
            [],
        )
        .unwrap();
        let assignment = StaffTransfer {
            personnel_id: 1,
            position: "Оператор".into(),
            slot_id: "operator-slot-b".into(),
            expected_position: "Оператор".into(),
            expected_occupant_ids: vec![],
        };

        apply_staff_transfers(&db, &[assignment], &[]).unwrap();

        assert_eq!(
            db.query_row(
                "SELECT slot_id FROM personnel_staff_assignments WHERE personnel_id=1",
                [],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
            "operator-slot-b"
        );
    }
    #[test]
    fn clears_acting_only_when_confirmed_and_rolls_back_bad_acting() {
        let db = db();
        db.execute("UPDATE personnel_staff_assignments SET acting_slot_id='slot-4',acting_position='Посада 4' WHERE personnel_id=3",[]).unwrap();
        let mut a = movement(1, 4);
        a.expected_occupant_ids.clear();
        assert!(apply_staff_transfers(&db, &[a.clone()], &[]).is_err());
        apply_staff_transfers(
            &db,
            &[a],
            &[ActingChange {
                personnel_id: 3,
                slot_id: String::new(),
                position: String::new(),
            }],
        )
        .unwrap();
        assert_eq!(
            db.query_row(
                "SELECT acting_slot_id FROM personnel_staff_assignments WHERE personnel_id=3",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            ""
        );
        assert!(apply_staff_transfers(
            &db,
            &[],
            &[ActingChange {
                personnel_id: 3,
                slot_id: "slot-4".into(),
                position: "Посада 4".into()
            }]
        )
        .is_err());
    }
    #[test]
    fn detects_stale_source_and_duplicate_targets() {
        let db = db();
        let mut a = movement(1, 4);
        a.expected_position = "Застаріла".into();
        assert!(apply_staff_transfers(&db, &[a], &[]).is_err());
        assert!(apply_staff_transfers(&db, &[movement(1, 4), movement(2, 4)], &[]).is_err());
    }
}
