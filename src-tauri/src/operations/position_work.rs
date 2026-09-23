use super::{
    busy, PositionWork, PositionWorkDraft, PositionWorkMember, PositionWorkMemberDraft,
    PositionWorkStatusEvent,
};
use crate::AppState;
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;

fn members(connection: &Connection, work_id: i64) -> Result<Vec<PositionWorkMember>, String> {
    let mut statement = connection
        .prepare(
            "SELECT pwp.id,p.id,trim(p.surname||' '||p.given_name||' '||p.patronymic),p.rank,
                COALESCE(NULLIF(pwp.duty_type,''),w.work_type),
                COALESCE(NULLIF(pwp.start_date,''),w.start_date),COALESCE(NULLIF(pwp.start_time,''),w.start_time),
                COALESCE(NULLIF(pwp.end_date,''),w.end_date),COALESCE(NULLIF(pwp.end_time,''),w.end_time)
         FROM position_work_periods pwp JOIN personnel p ON p.id=pwp.personnel_id JOIN position_work w ON w.id=pwp.work_id
         WHERE pwp.work_id=?1 ORDER BY p.surname,p.given_name,p.id,pwp.start_date,pwp.start_time,pwp.id",
        )
        .map_err(|_| "Не вдалося прочитати склад групи.".to_string())?;
    let result = statement
        .query_map([work_id], |row| {
            Ok(PositionWorkMember {
                assignment_id: row.get(0)?,
                personnel_id: row.get(1)?,
                full_name: row.get(2)?,
                rank: row.get(3)?,
                duty_type: row.get(4)?,
                start_date: row.get(5)?,
                start_time: row.get(6)?,
                end_date: row.get(7)?,
                end_time: row.get(8)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати склад групи.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати склад групи.".to_string());
    result
}

#[tauri::command]
pub fn list_position_work(state: tauri::State<AppState>) -> Result<Vec<PositionWork>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db.connection.prepare(
        "SELECT w.id,w.position_id,p.name,w.work_type,w.status,w.start_date,w.start_time,w.end_date,w.end_time,w.battle_order,w.notes
         FROM position_work w JOIN positions p ON p.id=w.position_id ORDER BY w.start_date DESC,w.start_time DESC,w.id DESC"
    ).map_err(|_| "Не вдалося прочитати роботи на позиціях.".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати роботи на позиціях.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати роботи на позиціях.".to_string())?;
    rows.into_iter()
        .map(|row| {
            Ok(PositionWork {
                id: row.0,
                position_id: row.1,
                position_name: row.2,
                work_type: row.3,
                status: row.4,
                start_date: row.5,
                start_time: row.6,
                end_date: row.7,
                end_time: row.8,
                battle_order: row.9,
                notes: row.10,
                members: members(&db.connection, row.0)?,
            })
        })
        .collect()
}

#[tauri::command]
pub fn list_position_work_status_history(
    state: tauri::State<AppState>,
) -> Result<Vec<PositionWorkStatusEvent>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db
        .connection
        .prepare(
            "SELECT id,work_id,position_id,position_name,position_mgrs,position_locality,work_type,status,
                start_date,start_time,end_date,end_time,battle_order,notes,members_json,created_at
         FROM position_work_events
         ORDER BY start_date DESC,start_time DESC,id DESC",
        )
        .map_err(|_| "Не вдалося прочитати історію робіт на позиціях.".to_string())?;
    let result = statement
        .query_map([], |row| {
            Ok(PositionWorkStatusEvent {
                id: row.get(0)?,
                work_id: row.get(1)?,
                position_id: row.get(2)?,
                position_name: row.get(3)?,
                position_mgrs: row.get(4)?,
                position_locality: row.get(5)?,
                work_type: row.get(6)?,
                status: row.get(7)?,
                start_date: row.get(8)?,
                start_time: row.get(9)?,
                end_date: row.get(10)?,
                end_time: row.get(11)?,
                battle_order: row.get(12)?,
                notes: row.get(13)?,
                members: serde_json::from_str(&row.get::<_, String>(14)?).unwrap_or_default(),
                created_at: row.get(15)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати історію робіт на позиціях.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати історію робіт на позиціях.".to_string());
    result
}

fn parse_date_time(date: &str, time: &str, field: &str) -> Result<NaiveDateTime, String> {
    let date_text = date.trim();
    let time_text = time.trim();
    let date_bytes = date_text.as_bytes();
    if date_bytes.len() != 10
        || date_bytes[4] != b'-'
        || date_bytes[7] != b'-'
        || date_bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| ![4, 7].contains(&index) && !byte.is_ascii_digit())
    {
        return Err(format!("{field}: дата повинна мати формат РРРР-ММ-ДД."));
    }
    let time_bytes = time_text.as_bytes();
    if time_bytes.len() != 5
        || time_bytes[2] != b':'
        || time_bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| index != 2 && !byte.is_ascii_digit())
    {
        return Err(format!("{field}: час повинен мати формат ГГ:ХХ."));
    }
    let date = NaiveDate::parse_from_str(date_text, "%Y-%m-%d")
        .map_err(|_| format!("{field}: дата повинна мати формат РРРР-ММ-ДД."))?;
    let time = NaiveTime::parse_from_str(time_text, "%H:%M")
        .map_err(|_| format!("{field}: час повинен мати формат ГГ:ХХ."))?;
    Ok(date.and_time(time))
}

fn validate_and_assignments(
    draft: &PositionWorkDraft,
) -> Result<Vec<PositionWorkMemberDraft>, String> {
    let work_type = draft.work_type.trim();
    let status = draft.status.trim();
    if !["Рекогностування", "Облаштування"].contains(&work_type) {
        return Err("Оберіть вид робіт.".into());
    }
    if !["Приступили", "Продовжують", "Завершили"].contains(&status) {
        return Err("Оберіть стан робіт.".into());
    }
    let group_start = parse_date_time(&draft.start_date, &draft.start_time, "Початок робіт")?;
    let has_end_date = !draft.end_date.trim().is_empty();
    let has_end_time = !draft.end_time.trim().is_empty();
    if has_end_date != has_end_time {
        return Err("Для завершення робіт вкажіть одночасно дату й час.".into());
    }
    if status == "Завершили" && !has_end_date {
        return Err("Для завершених робіт обов’язково вкажіть дату й час завершення.".into());
    }
    let group_end = if has_end_date {
        let value = parse_date_time(&draft.end_date, &draft.end_time, "Завершення робіт")?;
        if value <= group_start {
            return Err("Завершення робіт має бути пізніше за початок.".into());
        }
        Some(value)
    } else {
        None
    };

    let assignments = if draft.member_assignments.is_empty() {
        if draft.personnel_ids.is_empty() {
            return Err("Оберіть хоча б одного військовослужбовця.".into());
        }
        if group_end.is_none() {
            return Err("Для старого формату складу спочатку вкажіть завершення робіт або додайте окремі періоди.".into());
        }
        draft
            .personnel_ids
            .iter()
            .map(|personnel_id| PositionWorkMemberDraft {
                personnel_id: *personnel_id,
                duty_type: work_type.to_string(),
                start_date: draft.start_date.clone(),
                start_time: draft.start_time.clone(),
                end_date: draft.end_date.clone(),
                end_time: draft.end_time.clone(),
            })
            .collect::<Vec<_>>()
    } else {
        draft.member_assignments.clone()
    };

    let mut periods_by_person = HashMap::<i64, Vec<(NaiveDateTime, NaiveDateTime)>>::new();
    for item in &assignments {
        if item.personnel_id <= 0 {
            return Err("Оберіть військовослужбовця для кожного періоду.".into());
        }
        if !["Охорона та оборона", "Рекогностування", "Облаштування"]
            .contains(&item.duty_type.trim())
        {
            return Err("Оберіть роботу для кожного періоду.".into());
        }
        let start = parse_date_time(&item.start_date, &item.start_time, "Початок періоду")?;
        let end = parse_date_time(&item.end_date, &item.end_time, "Завершення періоду")?;
        if end <= start {
            return Err("Час завершення періоду має бути пізніше за час початку.".into());
        }
        if start < group_start || group_end.is_some_and(|group_end| end > group_end) {
            return Err("Кожен особистий період має бути в межах загального періоду робіт.".into());
        }
        periods_by_person
            .entry(item.personnel_id)
            .or_default()
            .push((start, end));
    }
    for periods in periods_by_person.values_mut() {
        periods.sort_by_key(|period| period.0);
        if periods.windows(2).any(|pair| pair[1].0 <= pair[0].1) {
            return Err("Періоди однієї людини не можуть перетинатися.".into());
        }
    }
    Ok(assignments)
}

fn is_work_location(value: &str) -> bool {
    ["Реко", "Облаштування", "Реко та облаштування"].contains(&value.trim())
}

fn validate_person_availability(
    current_location: &str,
    belongs_to_current_work: bool,
    current_work_is_active: bool,
    _draft_is_active: bool,
    has_other_active: bool,
) -> Result<(), String> {
    if has_other_active {
        return Err(
            "Військовослужбовець уже залучений до іншої активної роботи на позиції.".into(),
        );
    }
    let current_location = current_location.trim();
    if ["На позиції", "ЗБЗ", "ПБЗ", "ГШР", "Логістика на позиції"].contains(&current_location)
    {
        return Err("До робіт не можна залучити людей, які перебувають, заходять на позицію або вибувають з неї за планом польотів.".into());
    }
    if !super::is_operationally_available(current_location) {
        return Err(format!(
            "До робіт не можна залучити військовослужбовця зі станом «{current_location}». Спочатку завершіть або змініть цей стан у його джерелі."
        ));
    }
    if is_work_location(current_location) && !(belongs_to_current_work && current_work_is_active) {
        return Err("Військовослужбовець уже перебуває на іншій роботі на позиції.".into());
    }
    Ok(())
}

fn safe_previous_location(value: Option<String>) -> String {
    match value.map(|value| value.trim().to_string()) {
        Some(value) if !is_work_location(&value) => value,
        _ => "ОХ".to_string(),
    }
}

fn refresh_person_location(
    connection: &Connection,
    personnel_id: i64,
    excluded_work_id: Option<i64>,
    previous_location: Option<String>,
) -> Result<(), String> {
    let has_active = connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM position_work_members pwm JOIN position_work w ON w.id=pwm.work_id
                WHERE pwm.personnel_id=?1 AND w.status<>'Завершили' AND (?2 IS NULL OR w.id<>?2)
            )",
            params![personnel_id, excluded_work_id],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false);
    let current = connection
        .query_row(
            "SELECT current_location FROM personnel WHERE id=?1",
            [personnel_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_default();
    let location = if has_active {
        Some("Реко та облаштування".to_string())
    } else if is_work_location(&current) {
        let flight_plan_location = connection
            .query_row(
                "SELECT location FROM flight_plan_personnel_locations
                 WHERE personnel_id=?1
                   AND date(plan_date)=date('now','localtime')
                   AND location IN ('На позиції','ЗБЗ','ПБЗ')
                 LIMIT 1",
                [personnel_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|_| "Не вдалося перевірити актуальний стан із плану польотів.".to_string())?;
        if let Some(location) = flight_plan_location {
            Some(location)
        } else {
            let stored = previous_location.or_else(|| {
                connection
                    .query_row(
                        "SELECT previous_location FROM position_work_members
                         WHERE personnel_id=?1 AND previous_location IS NOT NULL
                         ORDER BY work_id DESC LIMIT 1",
                        [personnel_id],
                        |row| row.get::<_, Option<String>>(0),
                    )
                    .ok()
                    .flatten()
            });
            Some(safe_previous_location(stored))
        }
    } else {
        None
    };
    if let Some(location) = location {
        connection
            .execute(
                "UPDATE personnel SET current_location=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2",
                params![location, personnel_id],
            )
            .map_err(|_| "Не вдалося оновити БЧС.".to_string())?;
    }
    Ok(())
}

fn restore_removed(connection: &Connection, work_id: i64, selected: &[i64]) -> Result<(), String> {
    let mut statement = connection
        .prepare(
            "SELECT personnel_id,previous_location FROM position_work_members WHERE work_id=?1",
        )
        .map_err(|_| "Не вдалося перевірити попередній склад групи.".to_string())?;
    let old = statement
        .query_map([work_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|_| "Не вдалося перевірити попередній склад групи.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося перевірити попередній склад групи.".to_string())?;
    for (personnel_id, previous_location) in
        old.into_iter().filter(|(id, _)| !selected.contains(id))
    {
        refresh_person_location(connection, personnel_id, Some(work_id), previous_location)?;
    }
    Ok(())
}

fn restore_position_type(
    connection: &Connection,
    position_id: i64,
    excluded_work_id: Option<i64>,
    previous_position_type: Option<String>,
) -> Result<(), String> {
    let has_active = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM position_work WHERE position_id=?1 AND status<>'Завершили' AND (?2 IS NULL OR id<>?2))",
            params![position_id, excluded_work_id],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false);
    if !has_active {
        if let Some(previous) = previous_position_type.filter(|value| {
            [
                "Основна",
                "Запасна",
                "Виявлена ворогом",
                "Зайнята суміжниками",
            ]
            .contains(&value.as_str())
        }) {
            connection
                .execute(
                    "UPDATE positions SET position_type=?1 WHERE id=?2 AND position_type='Облаштовується'",
                    params![previous, position_id],
                )
                .map_err(|_| "Не вдалося відновити тип позиції.".to_string())?;
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn save_event_snapshot(
    connection: &Connection,
    work_id: i64,
    position_id: i64,
    position_name: &str,
    position_mgrs: &str,
    position_locality: &str,
    draft: &PositionWorkDraft,
    members_json: &str,
    create_transition: bool,
) -> Result<(), String> {
    let updated = if create_transition {
        0
    } else {
        connection.execute(
            "UPDATE position_work_events
             SET position_id=?1,position_name=?2,position_mgrs=?3,position_locality=?4,
                 work_type=?5,battle_order=?6,notes=?7,members_json=?8
             WHERE id=(SELECT id FROM position_work_events WHERE work_id=?9 ORDER BY id DESC LIMIT 1)",
            params![position_id,position_name,position_mgrs,position_locality,draft.work_type.trim(),draft.battle_order.trim(),draft.notes.trim(),members_json,work_id],
        ).map_err(|_| "Не вдалося оновити знімок події робіт.".to_string())?
    };
    if create_transition || updated == 0 {
        connection.execute(
            "INSERT INTO position_work_events(work_id,position_id,position_name,position_mgrs,position_locality,work_type,status,start_date,start_time,end_date,end_time,battle_order,notes,members_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![work_id,position_id,position_name,position_mgrs,position_locality,draft.work_type.trim(),draft.status.trim(),draft.start_date.trim(),draft.start_time.trim(),draft.end_date.trim(),draft.end_time.trim(),draft.battle_order.trim(),draft.notes.trim(),members_json],
        ).map_err(|_| "Не вдалося зберегти незмінний знімок події робіт.".to_string())?;
    }
    Ok(())
}

fn sync_personnel_state_before_position_work(
    connection: &Connection,
    local_today: &str,
) -> Result<(), String> {
    super::reconcile_flight_plan_for_moment(
        connection,
        local_today,
        &chrono::Local::now().format("%H:%M").to_string(),
    )
}

#[tauri::command]
pub fn save_position_work(
    state: tauri::State<AppState>,
    work_id: Option<i64>,
    draft: PositionWorkDraft,
) -> Result<(), String> {
    let assignments = validate_and_assignments(&draft)?;
    let db = state.0.lock().map_err(|_| busy())?;
    let local_today = chrono::Local::now().format("%Y-%m-%d").to_string();
    sync_personnel_state_before_position_work(&db.connection, &local_today)?;
    let transaction = db
        .connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося розпочати збереження робіт на позиції.".to_string())?;
    let (position_type, position_name, position_mgrs, position_locality) = transaction
        .query_row(
            "SELECT position_type,name,mgrs,locality FROM positions WHERE id=?1",
            [draft.position_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .map_err(|_| "Позицію не знайдено.".to_string())?;
    let old_work = if let Some(id) = work_id {
        Some(
            transaction
                .query_row(
                    "SELECT position_id,status,previous_position_type,start_date,start_time,end_date,end_time FROM position_work WHERE id=?1",
                    [id],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, Option<String>>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, String>(4)?,
                            row.get::<_, String>(5)?,
                            row.get::<_, String>(6)?,
                        ))
                    },
                )
                .map_err(|_| "Роботи на позиції не знайдено.".to_string())?,
        )
    } else {
        None
    };
    let old_members = if let Some(id) = work_id {
        let mut statement = transaction
            .prepare(
                "SELECT personnel_id,previous_location FROM position_work_members WHERE work_id=?1",
            )
            .map_err(|_| "Не вдалося перевірити попередній склад групи.".to_string())?;
        let rows = statement
            .query_map([id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .map_err(|_| "Не вдалося перевірити попередній склад групи.".to_string())?
            .collect::<Result<HashMap<_, _>, _>>()
            .map_err(|_| "Не вдалося перевірити попередній склад групи.".to_string())?;
        rows
    } else {
        HashMap::new()
    };
    let mut selected_ids = assignments
        .iter()
        .map(|item| item.personnel_id)
        .collect::<Vec<_>>();
    selected_ids.sort_unstable();
    selected_ids.dedup();
    let draft_is_active = draft.status.trim() != "Завершили";
    let old_is_active = old_work
        .as_ref()
        .is_some_and(|(_, status, _, _, _, _, _)| status != "Завершили");
    for personnel_id in &selected_ids {
        let current_location = transaction
            .query_row(
                "SELECT current_location FROM personnel WHERE id=?1",
                [personnel_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|_| "Одного з обраних військовослужбовців не знайдено.".to_string())?;
        let has_other_active = transaction
            .query_row(
                "SELECT EXISTS(
                SELECT 1 FROM position_work_members pwm JOIN position_work w ON w.id=pwm.work_id
                WHERE pwm.personnel_id=?1 AND w.status<>'Завершили' AND (?2 IS NULL OR w.id<>?2)
            )",
                params![personnel_id, work_id],
                |row| row.get::<_, bool>(0),
            )
            .unwrap_or(false);
        let belongs_to_current_work = old_members.contains_key(personnel_id);
        validate_person_availability(
            &current_location,
            belongs_to_current_work,
            old_is_active,
            draft_is_active,
            has_other_active,
        )?;
    }
    let previous_position_type = if draft_is_active {
        match &old_work {
            Some((old_position_id, old_status, previous, _, _, _, _))
                if *old_position_id == draft.position_id && old_status != "Завершили" =>
            {
                previous.clone()
            }
            _ if position_type != "Облаштовується" => Some(position_type.clone()),
            _ => transaction
                .query_row(
                    "SELECT previous_position_type FROM position_work
                     WHERE position_id=?1 AND status<>'Завершили'
                       AND previous_position_type IS NOT NULL
                       AND (?2 IS NULL OR id<>?2)
                     ORDER BY id LIMIT 1",
                    params![draft.position_id, work_id],
                    |row| row.get::<_, Option<String>>(0),
                )
                .ok()
                .flatten()
                .or_else(|| Some("Основна".to_string())),
        }
    } else {
        old_work
            .as_ref()
            .and_then(|(_, _, previous, _, _, _, _)| previous.clone())
    };
    let id = if let Some(id) = work_id {
        restore_removed(&transaction, id, &selected_ids)?;
        transaction.execute("UPDATE position_work SET position_id=?1,work_type=?2,status=?3,start_date=?4,start_time=?5,end_date=?6,end_time=?7,battle_order=?8,notes=?9,previous_position_type=?10,updated_at=CURRENT_TIMESTAMP WHERE id=?11",
            params![draft.position_id,draft.work_type.trim(),draft.status.trim(),draft.start_date.trim(),draft.start_time.trim(),draft.end_date.trim(),draft.end_time.trim(),draft.battle_order.trim(),draft.notes.trim(),previous_position_type,id])
            .map_err(|_| "Не вдалося оновити роботи на позиції.".to_string())?;
        transaction
            .execute("DELETE FROM position_work_members WHERE work_id=?1", [id])
            .map_err(|_| "Не вдалося оновити склад групи.".to_string())?;
        transaction
            .execute("DELETE FROM position_work_periods WHERE work_id=?1", [id])
            .map_err(|_| "Не вдалося оновити періоди групи.".to_string())?;
        id
    } else {
        transaction.execute("INSERT INTO position_work(position_id,work_type,status,start_date,start_time,end_date,end_time,battle_order,notes,previous_position_type) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![draft.position_id,draft.work_type.trim(),draft.status.trim(),draft.start_date.trim(),draft.start_time.trim(),draft.end_date.trim(),draft.end_time.trim(),draft.battle_order.trim(),draft.notes.trim(),previous_position_type])
            .map_err(|_| "Не вдалося додати роботи на позиції.".to_string())?;
        transaction.last_insert_rowid()
    };
    for personnel_id in &selected_ids {
        let first = assignments
            .iter()
            .find(|assignment| assignment.personnel_id == *personnel_id)
            .ok_or_else(|| "Не вдалося підготувати склад групи.".to_string())?;
        let previous_location = old_members
            .get(personnel_id)
            .cloned()
            .flatten()
            .or_else(|| {
                transaction
                    .query_row(
                        "SELECT current_location FROM personnel WHERE id=?1",
                        [personnel_id],
                        |row| row.get::<_, String>(0),
                    )
                    .ok()
            });
        transaction.execute("INSERT OR IGNORE INTO position_work_members(work_id,personnel_id,duty_type,start_date,start_time,end_date,end_time,previous_location) SELECT ?1,id,?3,?4,?5,?6,?7,?8 FROM personnel WHERE id=?2", params![id,personnel_id,first.duty_type.trim(),first.start_date.trim(),first.start_time.trim(),first.end_date.trim(),first.end_time.trim(),previous_location])
            .map_err(|_| "Не вдалося зберегти склад групи.".to_string())?;
        if draft_is_active {
            transaction.execute(
                "UPDATE personnel SET current_location='Реко та облаштування',updated_at=CURRENT_TIMESTAMP WHERE id=?1",
                [personnel_id],
            ).map_err(|_| "Не вдалося оновити БЧС.".to_string())?;
        } else if old_is_active {
            refresh_person_location(&transaction, *personnel_id, Some(id), previous_location)?;
        }
    }
    for assignment in &assignments {
        transaction.execute("INSERT INTO position_work_periods(work_id,personnel_id,duty_type,start_date,start_time,end_date,end_time) SELECT ?1,id,?3,?4,?5,?6,?7 FROM personnel WHERE id=?2", params![id,assignment.personnel_id,assignment.duty_type.trim(),assignment.start_date.trim(),assignment.start_time.trim(),assignment.end_date.trim(),assignment.end_time.trim()])
            .map_err(|_| "Не вдалося зберегти періоди групи.".to_string())?;
    }
    let history_changed = old_work.as_ref().is_none_or(
        |(_, old_status, _, old_start_date, old_start_time, old_end_date, old_end_time)| {
            old_status != draft.status.trim()
                || old_start_date != draft.start_date.trim()
                || old_start_time != draft.start_time.trim()
                || old_end_date != draft.end_date.trim()
                || old_end_time != draft.end_time.trim()
        },
    );
    let member_snapshot = serde_json::to_string(&members(&transaction, id)?)
        .map_err(|_| "Не вдалося підготувати знімок складу робіт.".to_string())?;
    if history_changed {
        transaction.execute(
            "INSERT INTO position_work_status_history(work_id,status,start_date,start_time,end_date,end_time) VALUES(?1,?2,?3,?4,?5,?6)",
            params![id,draft.status.trim(),draft.start_date.trim(),draft.start_time.trim(),draft.end_date.trim(),draft.end_time.trim()],
        ).map_err(|_| "Не вдалося зберегти історію станів робіт.".to_string())?;
    }
    save_event_snapshot(
        &transaction,
        id,
        draft.position_id,
        &position_name,
        &position_mgrs,
        &position_locality,
        &draft,
        &member_snapshot,
        history_changed,
    )?;
    if let Some((old_position_id, _, old_previous_type, _, _, _, _)) = &old_work {
        if *old_position_id != draft.position_id || old_is_active && !draft_is_active {
            restore_position_type(
                &transaction,
                *old_position_id,
                Some(id),
                old_previous_type.clone(),
            )?;
        }
    }
    if draft_is_active {
        transaction
            .execute(
                "UPDATE positions SET position_type='Облаштовується' WHERE id=?1",
                [draft.position_id],
            )
            .map_err(|_| "Не вдалося оновити стан позиції.".to_string())?;
    } else {
        restore_position_type(
            &transaction,
            draft.position_id,
            Some(id),
            previous_position_type,
        )?;
    }
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити збереження робіт на позиції.".to_string())
}

#[tauri::command]
pub fn delete_position_work(state: tauri::State<AppState>, work_id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let transaction = db
        .connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося розпочати видалення робіт на позиції.".to_string())?;
    let (position_id, previous_position_type) = transaction
        .query_row(
            "SELECT position_id,previous_position_type FROM position_work WHERE id=?1",
            [work_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .map_err(|_| "Роботи на позиції не знайдено.".to_string())?;
    let personnel = transaction
        .prepare(
            "SELECT personnel_id,previous_location FROM position_work_members WHERE work_id=?1",
        )
        .and_then(|mut statement| {
            statement
                .query_map([work_id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|_| "Не вдалося прочитати склад групи.".to_string())?;
    transaction
        .execute("DELETE FROM position_work WHERE id=?1", [work_id])
        .map_err(|_| "Не вдалося видалити роботи на позиції.".to_string())?;
    for (personnel_id, previous_location) in personnel {
        refresh_person_location(&transaction, personnel_id, None, previous_location)?;
    }
    restore_position_type(&transaction, position_id, None, previous_position_type)?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити видалення робіт на позиції.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::operations::PositionWorkMemberDraft;

    fn draft(assignment: PositionWorkMemberDraft) -> PositionWorkDraft {
        PositionWorkDraft {
            position_id: 1,
            work_type: "Рекогностування".into(),
            status: "Приступили".into(),
            start_date: "2026-09-15".into(),
            start_time: "08:00".into(),
            end_date: String::new(),
            end_time: String::new(),
            battle_order: String::new(),
            notes: String::new(),
            personnel_ids: vec![],
            member_assignments: vec![assignment],
        }
    }

    #[test]
    fn requires_a_duty_date_and_time_for_every_member() {
        let valid = PositionWorkMemberDraft {
            personnel_id: 1,
            duty_type: "Охорона та оборона".into(),
            start_date: "2026-09-15".into(),
            start_time: "08:00".into(),
            end_date: "2026-09-15".into(),
            end_time: "12:00".into(),
        };
        assert!(validate_and_assignments(&draft(valid.clone())).is_ok());
        assert!(validate_and_assignments(&draft(PositionWorkMemberDraft {
            start_time: String::new(),
            ..valid
        }))
        .is_err());
    }

    #[test]
    fn stores_multiple_periods_for_the_same_person() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ТЕСТОВИЙ','Тест','Тестович','оператор','1','','','','','','','','ОХ')", []).unwrap();
        connection
            .execute("INSERT INTO positions(id,name) VALUES(1,'САПСАН')", [])
            .unwrap();
        connection.execute("INSERT INTO position_work(id,position_id,work_type,status,start_date,start_time) VALUES(10,1,'Облаштування','Продовжують','2026-09-15','08:00')", []).unwrap();
        connection
            .execute(
                "INSERT INTO position_work_members(work_id,personnel_id) VALUES(10,1)",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO position_work_periods(work_id,personnel_id,duty_type,start_date,start_time,end_date,end_time) VALUES(10,1,'Охорона та оборона','2026-09-15','08:00','2026-09-15','10:00'),(10,1,'Облаштування','2026-09-15','10:01','2026-09-15','12:00')", []).unwrap();

        let periods = members(&connection, 10).unwrap();
        assert_eq!(periods.len(), 2);
        assert_eq!(periods[0].personnel_id, periods[1].personnel_id);
        assert_eq!(periods[0].duty_type, "Охорона та оборона");
        assert_eq!(periods[1].duty_type, "Облаштування");
    }

    #[test]
    fn migrates_legacy_member_assignment_into_a_period() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ТЕСТОВИЙ','Тест','Тестович','оператор','1','','','','','','','','ОХ')", []).unwrap();
        connection
            .execute("INSERT INTO positions(id,name) VALUES(1,'САПСАН')", [])
            .unwrap();
        connection.execute("INSERT INTO position_work(id,position_id,work_type,status,start_date,start_time,end_date,end_time) VALUES(10,1,'Рекогностування','Продовжують','2026-09-15','08:00','2026-09-15','12:00')", []).unwrap();
        connection
            .execute(
                "INSERT INTO position_work_members(work_id,personnel_id) VALUES(10,1)",
                [],
            )
            .unwrap();

        crate::database::initialise(&connection).unwrap();
        let migrated = members(&connection, 10).unwrap();
        assert_eq!(migrated.len(), 1);
        assert_eq!(migrated[0].duty_type, "Рекогностування");
        assert_eq!(migrated[0].start_time, "08:00");
        assert_eq!(migrated[0].end_time, "12:00");
    }

    #[test]
    fn rejects_overlapping_periods_for_one_person() {
        let first = PositionWorkMemberDraft {
            personnel_id: 1,
            duty_type: "Охорона та оборона".into(),
            start_date: "2026-09-15".into(),
            start_time: "08:00".into(),
            end_date: "2026-09-15".into(),
            end_time: "12:00".into(),
        };
        let second = PositionWorkMemberDraft {
            duty_type: "Облаштування".into(),
            start_time: "11:59".into(),
            end_time: "14:00".into(),
            ..first.clone()
        };
        let mut overlapping = draft(first);
        overlapping.member_assignments.push(second);
        assert_eq!(
            validate_and_assignments(&overlapping).map(|_| ()),
            Err("Періоди однієї людини не можуть перетинатися.".into())
        );
    }

    #[test]
    fn strictly_validates_group_and_period_boundaries() {
        let assignment = PositionWorkMemberDraft {
            personnel_id: 1,
            duty_type: "Облаштування".into(),
            start_date: "2026-09-15".into(),
            start_time: "08:00".into(),
            end_date: "2026-09-15".into(),
            end_time: "12:00".into(),
        };
        let mut invalid_date = draft(assignment.clone());
        invalid_date.start_date = "2026-02-30".into();
        assert!(validate_and_assignments(&invalid_date).is_err());

        let mut completed = draft(assignment.clone());
        completed.status = "Завершили".into();
        assert_eq!(
            validate_and_assignments(&completed).map(|_| ()),
            Err("Для завершених робіт обов’язково вкажіть дату й час завершення.".into())
        );

        let mut outside = draft(PositionWorkMemberDraft {
            start_time: "07:59".into(),
            ..assignment
        });
        outside.end_date = "2026-09-15".into();
        outside.end_time = "13:00".into();
        assert_eq!(
            validate_and_assignments(&outside).map(|_| ()),
            Err("Кожен особистий період має бути в межах загального періоду робіт.".into())
        );
    }

    #[test]
    fn legacy_member_ids_cannot_create_empty_periods() {
        let mut legacy = draft(PositionWorkMemberDraft {
            personnel_id: 1,
            duty_type: "Облаштування".into(),
            start_date: "2026-09-15".into(),
            start_time: "08:00".into(),
            end_date: "2026-09-15".into(),
            end_time: "12:00".into(),
        });
        legacy.member_assignments.clear();
        legacy.personnel_ids = vec![1];
        assert!(validate_and_assignments(&legacy).is_err());
        legacy.end_date = "2026-09-15".into();
        legacy.end_time = "12:00".into();
        assert_eq!(validate_and_assignments(&legacy).unwrap().len(), 1);
    }

    #[test]
    fn only_free_people_or_members_of_the_current_active_work_are_allowed() {
        assert!(validate_person_availability("ОХ", false, false, true, false).is_ok());
        assert!(validate_person_availability("", false, false, true, false).is_ok());
        assert!(validate_person_availability("ЗАБ", false, false, true, false).is_ok());
        for location in [
            "ВІДП",
            "Відкомандировані",
            "СЗЧ",
            "ПТЗ Новостав",
            "НАВЧ",
            "ВІДР",
            "ЛІК",
        ] {
            assert!(
                validate_person_availability(location, false, false, true, false).is_err(),
                "{location}"
            );
        }
        assert!(
            validate_person_availability("Реко та облаштування", true, true, true, false).is_ok()
        );
        assert!(
            validate_person_availability("Реко та облаштування", true, true, false, false).is_ok()
        );
        assert!(validate_person_availability("На позиції", true, true, true, false).is_err());
        assert!(validate_person_availability("ЗБЗ", true, true, true, false).is_err());
        assert!(validate_person_availability("ПБЗ", false, false, true, false).is_err());
        assert!(
            validate_person_availability("Логістика на позиції", false, false, true, false)
                .is_err()
        );
        assert!(validate_person_availability("КСП", false, false, true, false).is_ok());
        assert!(validate_person_availability("КСП", false, false, false, false).is_ok());
        assert!(validate_person_availability("КСП", true, false, false, false).is_ok());
        assert!(validate_person_availability("ОХ", false, false, true, true).is_err());
    }

    #[test]
    fn expired_manual_assignment_is_synchronized_before_position_work_availability() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ТЕСТОВИЙ','Тест','Тестович','оператор','1','','','','','','','','ЛІК')", []).unwrap();
        connection
            .execute(
                "INSERT INTO personnel_control_assignments(
                personnel_id,location_type,institution,start_date,end_date,previous_location
             ) VALUES(1,'ЛІК','Шпиталь','2026-09-15','2026-09-16','ОХ')",
                [],
            )
            .unwrap();

        sync_personnel_state_before_position_work(&connection, "2026-09-17").unwrap();

        let location: String = connection
            .query_row(
                "SELECT current_location FROM personnel WHERE id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(location, "ОХ");
        assert!(validate_person_availability(&location, false, false, true, false).is_ok());
    }

    #[test]
    fn restores_ox_only_after_the_last_active_position_work_is_gone() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ТЕСТОВИЙ','Тест','Тестович','оператор','1','','','','','','','','Реко')", []).unwrap();
        connection
            .execute("INSERT INTO positions(id,name) VALUES(1,'САПСАН')", [])
            .unwrap();
        connection.execute("INSERT INTO position_work(id,position_id,work_type,status,start_date,start_time) VALUES(10,1,'Рекогностування','Продовжують','2026-09-15','08:00'),(11,1,'Облаштування','Продовжують','2026-09-15','09:00')", []).unwrap();
        connection
            .execute(
                "INSERT INTO position_work_members(work_id,personnel_id) VALUES(10,1),(11,1)",
                [],
            )
            .unwrap();

        refresh_person_location(&connection, 1, Some(10), Some("ОХ".into())).unwrap();
        let active: String = connection
            .query_row(
                "SELECT current_location FROM personnel WHERE id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(active, "Реко та облаштування");

        connection
            .execute("UPDATE position_work SET status='Завершили'", [])
            .unwrap();
        refresh_person_location(&connection, 1, None, Some("ОХ".into())).unwrap();
        let restored: String = connection
            .query_row(
                "SELECT current_location FROM personnel WHERE id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(restored, "ОХ");
    }

    #[test]
    fn restores_the_recorded_previous_location_after_the_last_work() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ТЕСТОВИЙ','Тест','Тестович','оператор','1','','','','','','','','Реко та облаштування')", []).unwrap();
        connection
            .execute("INSERT INTO positions(id,name) VALUES(1,'САПСАН')", [])
            .unwrap();
        connection.execute("INSERT INTO position_work(id,position_id,work_type,status,start_date,start_time) VALUES(10,1,'Облаштування','Завершили','2026-09-15','08:00')", []).unwrap();
        connection.execute("INSERT INTO position_work_members(work_id,personnel_id,previous_location) VALUES(10,1,'')", []).unwrap();

        refresh_person_location(&connection, 1, None, Some(String::new())).unwrap();
        let restored: String = connection
            .query_row(
                "SELECT current_location FROM personnel WHERE id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(restored, "");
    }

    #[test]
    fn restores_the_current_flight_plan_location_after_the_last_work() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ТЕСТОВИЙ','Тест','Тестович','оператор','1','','','','','','','','Реко та облаштування')", []).unwrap();
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        connection.execute(
            "INSERT INTO flight_plan_personnel_locations(personnel_id,plan_date,location) VALUES(1,?1,'ЗБЗ')",
            [today],
        ).unwrap();

        refresh_person_location(&connection, 1, None, Some("ОХ".into())).unwrap();

        let restored: String = connection
            .query_row(
                "SELECT current_location FROM personnel WHERE id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(restored, "ЗБЗ");
    }

    #[test]
    fn ignores_a_stale_flight_plan_location_when_restoring_work() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ТЕСТОВИЙ','Тест','Тестович','оператор','1','','','','','','','','Реко та облаштування')", []).unwrap();
        connection.execute(
            "INSERT INTO flight_plan_personnel_locations(personnel_id,plan_date,location) VALUES(1,'2000-01-01','ЗБЗ')",
            [],
        ).unwrap();

        refresh_person_location(&connection, 1, None, Some("ОХ".into())).unwrap();

        let restored: String = connection
            .query_row(
                "SELECT current_location FROM personnel WHERE id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(restored, "ОХ");
    }

    #[test]
    fn backfills_one_status_history_event_for_legacy_work() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO positions(id,name) VALUES(1,'САПСАН')", [])
            .unwrap();
        connection.execute("INSERT INTO position_work(id,position_id,work_type,status,start_date,start_time) VALUES(10,1,'Облаштування','Приступили','2026-09-15','08:00')", []).unwrap();
        crate::database::initialise(&connection).unwrap();
        crate::database::initialise(&connection).unwrap();
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM position_work_status_history WHERE work_id=10",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn durable_event_survives_current_work_deletion() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO positions(id,name) VALUES(1,'САПСАН')", [])
            .unwrap();
        connection.execute("INSERT INTO position_work(id,position_id,work_type,status,start_date,start_time) VALUES(10,1,'Облаштування','Приступили','2026-09-15','08:00')", []).unwrap();
        connection.execute("INSERT INTO position_work_events(work_id,position_id,position_name,work_type,status,start_date,start_time,members_json) VALUES(10,1,'САПСАН','Облаштування','Приступили','2026-09-15','08:00','[]')", []).unwrap();
        connection
            .execute("DELETE FROM position_work WHERE id=10", [])
            .unwrap();
        let snapshot: (String, String, String) = connection
            .query_row(
                "SELECT position_name,work_type,members_json FROM position_work_events WHERE work_id=10",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            snapshot,
            ("САПСАН".into(), "Облаштування".into(), "[]".into())
        );
    }

    #[test]
    fn editing_details_updates_the_latest_snapshot_without_creating_a_transition() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO position_work_events(work_id,position_id,position_name,work_type,status,start_date,start_time,members_json) VALUES(10,1,'СТАРА','Облаштування','Приступили','2026-09-15','08:00','[]')", []).unwrap();
        let assignment = PositionWorkMemberDraft {
            personnel_id: 1,
            duty_type: "Облаштування".into(),
            start_date: "2026-09-15".into(),
            start_time: "08:00".into(),
            end_date: "2026-09-15".into(),
            end_time: "12:00".into(),
        };
        let mut updated = draft(assignment);
        updated.battle_order = "БР-22".into();
        updated.notes = "Уточнено".into();
        let members_json = serde_json::to_string(&vec![PositionWorkMember {
            assignment_id: Some(5),
            personnel_id: 1,
            full_name: "ТЕСТОВИЙ Тест Тестович".into(),
            rank: "солдат".into(),
            duty_type: "Облаштування".into(),
            start_date: "2026-09-15".into(),
            start_time: "08:00".into(),
            end_date: "2026-09-15".into(),
            end_time: "13:00".into(),
        }])
        .unwrap();

        save_event_snapshot(
            &connection,
            10,
            1,
            "НОВА",
            "36U UV 10000 20000",
            "ЛІСОВЕ",
            &updated,
            &members_json,
            false,
        )
        .unwrap();

        let snapshot: (i64, String, String, String, String, String) = connection
            .query_row(
                "SELECT COUNT(*),position_name,position_mgrs,battle_order,notes,members_json FROM position_work_events WHERE work_id=10",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .unwrap();
        assert_eq!(snapshot.0, 1);
        assert_eq!(snapshot.1, "НОВА");
        assert_eq!(snapshot.2, "36U UV 10000 20000");
        assert_eq!(snapshot.3, "БР-22");
        assert_eq!(snapshot.4, "Уточнено");
        let members: Vec<PositionWorkMember> = serde_json::from_str(&snapshot.5).unwrap();
        assert_eq!(members[0].end_time, "13:00");
    }

    #[test]
    fn restores_position_type_only_after_the_last_active_work() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO positions(id,name,position_type) VALUES(1,'САПСАН','Облаштовується')",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO position_work(id,position_id,work_type,status,start_date,start_time,previous_position_type) VALUES(10,1,'Облаштування','Завершили','2026-09-15','08:00','Запасна'),(11,1,'Рекогностування','Продовжують','2026-09-15','09:00','Запасна')", []).unwrap();

        restore_position_type(&connection, 1, None, Some("Запасна".into())).unwrap();
        let active_type: String = connection
            .query_row(
                "SELECT position_type FROM positions WHERE id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(active_type, "Облаштовується");

        connection
            .execute(
                "UPDATE position_work SET status='Завершили' WHERE id=11",
                [],
            )
            .unwrap();
        restore_position_type(&connection, 1, None, Some("Запасна".into())).unwrap();
        let restored_type: String = connection
            .query_row(
                "SELECT position_type FROM positions WHERE id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(restored_type, "Запасна");
    }
}
