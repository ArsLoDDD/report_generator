use super::*;
use chrono::NaiveDate;

fn overdue_position_work_warnings(
    connection: &Connection,
    current_local_date_time: &str,
) -> Vec<StartupWarning> {
    let overdue = connection
        .prepare(
            "SELECT w.id,w.work_type,w.status,w.end_date,w.end_time,
                    COALESCE(NULLIF(trim(w.position_name),''),NULLIF(trim(p.name),''),
                             NULLIF(trim(w.position_locality),''),NULLIF(trim(w.strip_name),''),'Без назви'),
                    COUNT(DISTINCT pwm.personnel_id)
             FROM position_work w
             LEFT JOIN positions p ON p.id=w.position_id
             LEFT JOIN position_work_members pwm ON pwm.work_id=w.id
             WHERE w.status<>'Завершили'
               AND trim(w.end_date)<>'' AND trim(w.end_time)<>''
               AND (w.end_date||'T'||w.end_time)<?1
             GROUP BY w.id
             ORDER BY w.end_date,w.end_time,w.id",
        )
        .and_then(|mut statement| {
            statement
                .query_map([current_local_date_time], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, i64>(6)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()
        })
        .unwrap_or_default();

    overdue
        .into_iter()
        .map(
            |(id, work_type, status, end_date, end_time, location, member_count)| {
                StartupWarning {
                    code: format!("position-work-overdue-{id}"),
                    title: format!("Прострочено: {work_type}"),
                    message: format!(
                        "Група «{location}» мала завершити роботу {end_date} о {end_time}, але досі має статус «{status}». Учасників: {member_count}. Відкрийте картку та завершіть роботу вручну."
                    ),
                }
            },
        )
        .collect()
}

fn personnel_planning_warnings(connection: &Connection, current_date: &str) -> Vec<StartupWarning> {
    type Plan = (i64, i64, String, String, String, String);
    let plans = connection
        .prepare(
            "SELECT assignment.id,assignment.personnel_id,
                    trim(person.surname||' '||person.given_name||' '||person.patronymic),
                    assignment.location_type,assignment.start_date,assignment.end_date
             FROM personnel_control_assignments assignment
             JOIN personnel person ON person.id=assignment.personnel_id
             WHERE assignment.closed_at IS NULL
               AND trim(assignment.previous_location)=''
               AND date(assignment.start_date)>date(?1)
             ORDER BY assignment.start_date,assignment.id",
        )
        .and_then(|mut statement| {
            statement
                .query_map([current_date], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                })?
                .collect::<Result<Vec<Plan>, _>>()
        })
        .unwrap_or_default();
    if plans.is_empty() {
        return Vec::new();
    }

    let mut warnings = Vec::new();
    let mut emitted = std::collections::HashSet::<String>::new();
    let work_conflicts = connection
        .prepare(
            "SELECT assignment.id,assignment.personnel_id,
                    trim(person.surname||' '||person.given_name||' '||person.patronymic),
                    assignment.location_type,assignment.start_date,assignment.end_date,
                    work.id,work.work_type,
                    COALESCE(NULLIF(trim(work.position_name),''),NULLIF(trim(position.name),''),
                             NULLIF(trim(work.position_locality),''),'Без назви')
             FROM personnel_control_assignments assignment
             JOIN personnel person ON person.id=assignment.personnel_id
             JOIN position_work_periods period ON period.personnel_id=assignment.personnel_id
             JOIN position_work work ON work.id=period.work_id
             LEFT JOIN positions position ON position.id=work.position_id
             WHERE assignment.closed_at IS NULL
               AND trim(assignment.previous_location)=''
               AND date(assignment.start_date)>date(?1)
               AND work.status<>'Завершили'
               AND date(period.start_date)<=date(CASE WHEN trim(assignment.end_date)<>''
                                                      THEN assignment.end_date ELSE '9999-12-31' END)
               AND date(CASE WHEN trim(period.end_date)<>''
                             THEN period.end_date ELSE '9999-12-31' END)>=date(assignment.start_date)
             ORDER BY assignment.start_date,assignment.id,work.id",
        )
        .and_then(|mut statement| {
            statement
                .query_map([current_date], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, String>(8)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()
        })
        .unwrap_or_default();
    for (assignment_id, _, full_name, state, start, end, work_id, work_type, place) in
        work_conflicts
    {
        let code = format!("personnel-plan-work-{assignment_id}-{work_id}");
        if emitted.insert(code.clone()) {
            let period = if end.trim().is_empty() {
                format!("з {start}")
            } else {
                format!("{start}–{end}")
            };
            warnings.push(StartupWarning {
                code,
                title: format!("Конфлікт плану ОС: {full_name}"),
                message: format!(
                    "На {period} заплановано «{state}», але цей час перетинається із завданням «{work_type}» — {place}. Змініть один із періодів."
                ),
            });
        }
    }

    let saved_plan_dates = connection
        .prepare(
            "SELECT DISTINCT plan_date FROM flight_plan_snapshots
             WHERE date(plan_date)>date(?1) ORDER BY plan_date",
        )
        .and_then(|mut statement| {
            statement
                .query_map([current_date], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()
        })
        .unwrap_or_default();
    for plan_date in saved_plan_dates {
        let Ok(Some(schedules)) =
            crate::flight_plan::flight_plan_location_schedule(connection, &plan_date)
        else {
            continue;
        };
        let scheduled_people = schedules
            .iter()
            .flat_map(|schedule| schedule.stages.iter())
            .flat_map(|stage| stage.member_ids.iter().copied())
            .collect::<std::collections::HashSet<_>>();
        for (assignment_id, personnel_id, full_name, state, start, end) in &plans {
            let in_period = plan_date.as_str() >= start.as_str()
                && (end.trim().is_empty() || plan_date.as_str() <= end.as_str());
            if !in_period || !scheduled_people.contains(personnel_id) {
                continue;
            }
            let code = format!("personnel-plan-flight-{assignment_id}-{plan_date}");
            if emitted.insert(code.clone()) {
                warnings.push(StartupWarning {
                    code,
                    title: format!("Конфлікт плану польотів: {full_name}"),
                    message: format!(
                        "На {plan_date} у контролі ОС заплановано «{state}», але військовослужбовець залишається у збереженому плані польотів. Виведіть його зі складу на цю дату або змініть план ОС."
                    ),
                });
            }
        }
    }

    let tomorrow = NaiveDate::parse_from_str(current_date, "%Y-%m-%d")
        .ok()
        .and_then(|date| date.succ_opt())
        .map(|date| date.format("%Y-%m-%d").to_string());
    if let Some(tomorrow) = tomorrow {
        let today_schedules = connection
            .query_row(
                "SELECT snapshot_json FROM flight_plan_snapshots
                 WHERE plan_date=?1 ORDER BY revision DESC,id DESC LIMIT 1",
                [current_date],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .ok()
            .flatten()
            .and_then(|snapshot| {
                crate::flight_plan::flight_plan_location_schedule_from_saved_snapshot(&snapshot)
                    .ok()
            })
            .unwrap_or_default();
        for (assignment_id, personnel_id, full_name, state, start, _) in &plans {
            if start != &tomorrow {
                continue;
            }
            let current_location = connection
                .query_row(
                    "SELECT current_location FROM personnel WHERE id=?1",
                    [personnel_id],
                    |row| row.get::<_, String>(0),
                )
                .unwrap_or_default();
            if !["На позиції", "ЗБЗ", "ПБЗ"].contains(&current_location.trim()) {
                continue;
            }
            let has_exit = today_schedules.iter().any(|schedule| {
                let initially_present = schedule
                    .stages
                    .first()
                    .is_some_and(|stage| stage.member_ids.contains(personnel_id));
                let finally_present = schedule
                    .stages
                    .last()
                    .is_some_and(|stage| stage.member_ids.contains(personnel_id));
                initially_present && (!finally_present || schedule.departs_on_plan_date)
            });
            if has_exit {
                continue;
            }
            let code = format!("personnel-plan-position-exit-{assignment_id}");
            if emitted.insert(code.clone()) {
                warnings.push(StartupWarning {
                    code,
                    title: format!("Не заплановано вихід із позиції: {full_name}"),
                    message: format!(
                        "На завтра заплановано «{state}», але військовослужбовець зараз має стан «{current_location}» і в сьогоднішньому плані польотів немає його виведення. Заплануйте вихід із позиції до початку нового стану."
                    ),
                });
            }
        }
    }
    warnings
}

#[tauri::command]
pub(crate) fn get_startup_warnings(state: tauri::State<AppState>) -> Vec<StartupWarning> {
    let mut warnings = state.1.clone();
    let Ok(database) = state.0.lock() else {
        return warnings;
    };
    let missing = database.connection.prepare(
        "SELECT trim(p.surname||' '||p.given_name||' '||p.patronymic), GROUP_CONCAT(DISTINCT c.name)
         FROM personnel p
         JOIN (
           SELECT crew_id,personnel_id FROM crew_members WHERE left_at IS NULL
           UNION SELECT crew_id,personnel_id FROM crew_actual_members
         ) membership ON membership.personnel_id=p.id
         JOIN crews c ON c.id=membership.crew_id
         WHERE trim(COALESCE(p.callsign,''))=''
         GROUP BY p.id ORDER BY p.surname,p.given_name,p.patronymic",
    ).and_then(|mut statement| {
        statement.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>, _>>()
    }).unwrap_or_default();
    if !missing.is_empty() {
        let preview = missing
            .iter()
            .take(8)
            .map(|(name, crews)| format!("{name} — {crews}"))
            .collect::<Vec<_>>()
            .join("; ");
        let tail = if missing.len() > 8 {
            format!("; та ще {}", missing.len() - 8)
        } else {
            String::new()
        };
        warnings.push(StartupWarning {
            code: "crew-callsign-missing".into(),
            title: format!("Немає позивних у складі екіпажів: {}", missing.len()),
            message: format!("Заповніть поле «Позивний» в особовому складі: {preview}{tail}. Без цього план польотів не експортується."),
        });
    }
    let missing_uav_types=database.connection.prepare("SELECT name,inventory_number FROM equipment WHERE category='uav' AND trim(COALESCE(uav_type,''))='' ORDER BY id").and_then(|mut statement|statement.query_map([],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?)))?.collect::<Result<Vec<_>,_>>()).unwrap_or_default();
    if !missing_uav_types.is_empty() {
        let names = missing_uav_types
            .iter()
            .take(8)
            .map(|(name, number)| {
                if number.trim().is_empty() {
                    name.clone()
                } else {
                    format!("{name} ({number})")
                }
            })
            .collect::<Vec<_>>()
            .join(", ");
        warnings.push(StartupWarning {
            code: "uav-type-missing".into(),
            title: format!("Не вказано тип БпАК: {}", missing_uav_types.len()),
            message: format!("Заповніть поле «Тип БпАК» у картках: {names}."),
        });
    }
    let missing_primary=database.connection.query_row("SELECT COUNT(*) FROM crews c WHERE EXISTS(SELECT 1 FROM equipment e WHERE e.crew_id=c.id AND e.category='uav') AND c.primary_uav_id IS NULL",[],|row|row.get::<_,i64>(0)).unwrap_or(0);
    if missing_primary > 0 {
        warnings.push(StartupWarning { code:"crew-primary-uav-missing".into(),title:format!("Не обрано основний БпЛА: {missing_primary}"),message:"У картках цих екіпажів оберіть основний борт серед закріплених БпЛА. Він використовується у БЧС і плані польотів.".into() });
    }
    let current_local_date_time = Local::now().format("%Y-%m-%dT%H:%M").to_string();
    warnings.extend(overdue_position_work_warnings(
        &database.connection,
        &current_local_date_time,
    ));
    warnings.extend(personnel_planning_warnings(
        &database.connection,
        &Local::now().format("%Y-%m-%d").to_string(),
    ));
    warnings.extend(deadline_reminders::warning_rows(
        &database.connection,
        Local::now().naive_local(),
    ));
    warnings
}

#[tauri::command]
pub(crate) fn get_app_settings(app: tauri::AppHandle) -> Result<settings::AppSettings, String> {
    settings::load(&application_root(&app)?)
}

#[tauri::command]
pub(crate) fn update_signer_settings(
    app: tauri::AppHandle,
    role: String,
    signer: settings::SignerSettings,
) -> Result<settings::AppSettings, String> {
    settings::update_signer(&application_root(&app)?, &role, signer)
}

#[tauri::command]
pub(crate) fn add_signer(
    app: tauri::AppHandle,
    name: String,
    signer: settings::SignerSettings,
) -> Result<settings::AppSettings, String> {
    settings::add_signer(&application_root(&app)?, name, signer)
}

#[tauri::command]
pub(crate) fn delete_signer(
    app: tauri::AppHandle,
    id: String,
) -> Result<settings::AppSettings, String> {
    settings::delete_signer(&application_root(&app)?, &id)
}

#[tauri::command]
pub(crate) fn save_commission(
    app: tauri::AppHandle,
    commission: settings::CommissionTemplate,
) -> Result<settings::AppSettings, String> {
    settings::save_commission(&application_root(&app)?, commission)
}

#[tauri::command]
pub(crate) fn delete_commission(
    app: tauri::AppHandle,
    id: String,
) -> Result<settings::AppSettings, String> {
    settings::delete_commission(&application_root(&app)?, &id)
}

#[tauri::command]
pub(crate) fn update_visible_personnel_columns(
    app: tauri::AppHandle,
    columns: Vec<String>,
) -> Result<settings::AppSettings, String> {
    settings::update_visible_personnel_columns(&application_root(&app)?, columns)
}

#[tauri::command]
pub(crate) fn update_visible_vehicle_columns(
    app: tauri::AppHandle,
    columns: Vec<String>,
) -> Result<settings::AppSettings, String> {
    settings::update_visible_vehicle_columns(&application_root(&app)?, columns)
}

#[tauri::command]
pub(crate) fn update_unit_settings(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    unit: settings::UnitSettings,
) -> Result<settings::AppSettings, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let saved = settings::update_unit_settings(&application_root(&app)?, unit)?;
    let valid_slot_ids = (!saved.unit.structure.is_empty()).then(|| {
        saved
            .unit
            .structure
            .iter()
            .filter(|item| item.kind == "position")
            .map(|item| item.id.clone())
            .collect::<std::collections::HashSet<_>>()
    });
    operations::cleanup_vacancy_recommendations(&database.connection, valid_slot_ids.as_ref())?;
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;

    #[test]
    fn overdue_position_work_stays_warned_until_manually_completed() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE positions(id INTEGER PRIMARY KEY,name TEXT NOT NULL);
                 CREATE TABLE position_work(
                    id INTEGER PRIMARY KEY,position_id INTEGER,position_name TEXT NOT NULL DEFAULT '',
                    strip_name TEXT NOT NULL DEFAULT '',position_locality TEXT NOT NULL DEFAULT '',
                    work_type TEXT NOT NULL,status TEXT NOT NULL,end_date TEXT NOT NULL DEFAULT '',
                    end_time TEXT NOT NULL DEFAULT ''
                 );
                 CREATE TABLE position_work_members(work_id INTEGER NOT NULL,personnel_id INTEGER NOT NULL);
                 INSERT INTO positions(id,name) VALUES(1,'ТЕСТОВА ПОЗИЦІЯ');
                 INSERT INTO position_work(id,position_id,work_type,status,end_date,end_time)
                 VALUES
                   (10,NULL,'Рекогностування','Продовжують','2026-09-25','12:00'),
                   (11,1,'Облаштування','Приступили','2026-09-25','14:00'),
                   (12,NULL,'Рекогностування','Приступили','2026-09-27','12:00'),
                   (13,1,'Облаштування','Завершили','2026-09-24','12:00');
                 INSERT INTO position_work_members(work_id,personnel_id) VALUES(10,1),(10,2),(11,3);",
            )
            .unwrap();

        let warnings = overdue_position_work_warnings(&connection, "2026-09-26T10:00");
        assert_eq!(warnings.len(), 2);
        assert_eq!(warnings[0].code, "position-work-overdue-10");
        assert!(warnings[0].title.contains("Рекогностування"));
        assert!(warnings[0].message.contains("Учасників: 2"));
        assert_eq!(warnings[1].code, "position-work-overdue-11");
        assert!(warnings[1].message.contains("ТЕСТОВА ПОЗИЦІЯ"));

        connection
            .execute(
                "UPDATE position_work SET status='Завершили' WHERE id=10",
                [],
            )
            .unwrap();
        let warnings = overdue_position_work_warnings(&connection, "2026-09-26T10:00");
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].code, "position-work-overdue-11");
    }

    #[test]
    fn future_personnel_plan_warns_about_work_and_missing_position_exit() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        connection.execute(
            "INSERT INTO personnel(
                id,rank,surname,given_name,patronymic,position,tax_id,birth_date,
                education_level,education_details,armed_forces_service_start_date,
                position_assigned_date,position_assignment_order,military_id,current_location
             ) VALUES(1,'солдат','ПЛАНОВИЙ','Петро','Іванович','оператор','','','','','','','','','На позиції')",
            [],
        ).unwrap();
        connection
            .execute(
                "INSERT INTO personnel_control_assignments(
                id,personnel_id,location_type,institution,start_date,end_date,previous_location
             ) VALUES(7,1,'ВІДП','','2026-10-02','2026-10-05','')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO position_work(
                id,position_name,work_type,status,start_date,start_time,end_date,end_time
             ) VALUES(9,'СОКІЛ','Облаштування','Приступили','2026-10-01','08:00','','')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO position_work_periods(
                work_id,personnel_id,duty_type,start_date,start_time,end_date,end_time
             ) VALUES(9,1,'Облаштування','2026-10-01','08:00','','')",
                [],
            )
            .unwrap();

        let warnings = personnel_planning_warnings(&connection, "2026-10-01");
        assert!(warnings
            .iter()
            .any(|warning| warning.code == "personnel-plan-work-7-9"));
        assert!(warnings
            .iter()
            .any(|warning| warning.code == "personnel-plan-position-exit-7"));
    }
}
