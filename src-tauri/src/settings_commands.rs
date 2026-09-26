use super::*;

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
}
