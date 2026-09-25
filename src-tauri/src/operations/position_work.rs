use super::{
    busy, PositionDraft, PositionWork, PositionWorkDraft, PositionWorkMember,
    PositionWorkMemberDraft, PositionWorkStatusEvent,
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
        "SELECT w.id,w.position_id,COALESCE(NULLIF(w.position_name,''),p.name,''),
                COALESCE(NULLIF(w.strip_name,''),p.strip_name,''),COALESCE(NULLIF(w.position_locality,''),p.locality,''),
                COALESCE(NULLIF(w.position_mgrs,''),p.mgrs,''),w.work_type,w.status,w.start_date,w.start_time,w.end_date,w.end_time,w.battle_order,w.notes
         FROM position_work w LEFT JOIN positions p ON p.id=w.position_id ORDER BY w.start_date DESC,w.start_time DESC,w.id DESC"
    ).map_err(|_| "Не вдалося прочитати роботи на позиціях.".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, String>(12)?,
                row.get::<_, String>(13)?,
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
                strip_name: row.3,
                locality: row.4,
                mgrs: row.5,
                work_type: row.6,
                status: row.7,
                start_date: row.8,
                start_time: row.9,
                end_date: row.10,
                end_time: row.11,
                battle_order: row.12,
                notes: row.13,
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
            "SELECT id,work_id,position_id,position_name,position_mgrs,position_locality,position_strip_name,work_type,status,
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
                strip_name: row.get(6)?,
                work_type: row.get(7)?,
                status: row.get(8)?,
                start_date: row.get(9)?,
                start_time: row.get(10)?,
                end_date: row.get(11)?,
                end_time: row.get(12)?,
                battle_order: row.get(13)?,
                notes: row.get(14)?,
                members: serde_json::from_str(&row.get::<_, String>(15)?).unwrap_or_default(),
                created_at: row.get(16)?,
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

    let mut periods_by_person = HashMap::<i64, Vec<(NaiveDateTime, Option<NaiveDateTime>)>>::new();
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
        let has_period_end_date = !item.end_date.trim().is_empty();
        let has_period_end_time = !item.end_time.trim().is_empty();
        if has_period_end_date != has_period_end_time {
            return Err("Для завершення періоду вкажіть одночасно дату й час.".into());
        }
        if status == "Завершили" && !has_period_end_date {
            return Err("Для завершеної групи закрийте всі періоди її учасників.".into());
        }
        let end = if has_period_end_date {
            let value = parse_date_time(&item.end_date, &item.end_time, "Завершення періоду")?;
            if value <= start {
                return Err("Час завершення періоду має бути пізніше за час початку.".into());
            }
            Some(value)
        } else {
            None
        };
        if start < group_start
            || group_end.is_some_and(|group_end| end.is_some_and(|end| end > group_end))
        {
            return Err("Кожен особистий період має бути в межах загального періоду робіт.".into());
        }
        periods_by_person
            .entry(item.personnel_id)
            .or_default()
            .push((start, end));
    }
    for periods in periods_by_person.values_mut() {
        periods.sort_by_key(|period| period.0);
        if periods
            .windows(2)
            .any(|pair| pair[0].1.is_none_or(|end| pair[1].0 <= end))
        {
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

fn ensure_position_is_free_for_setup(
    connection: &Connection,
    position_id: i64,
) -> Result<(), String> {
    let (position_name, crew_names) = connection
        .query_row(
            "SELECT p.name,COALESCE((
                SELECT GROUP_CONCAT(c.name, ', ') FROM crews c WHERE c.position_id=p.id
             ),'')
             FROM positions p WHERE p.id=?1",
            [position_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|_| "Позицію не знайдено.".to_string())?;
    if !crew_names.trim().is_empty() {
        return Err(format!(
            "Не можна розпочати облаштування позиції «{position_name}», доки вона закріплена за екіпажем «{crew_names}». Спочатку зніміть позицію з екіпажу."
        ));
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
    position_id: Option<i64>,
    position_name: &str,
    position_mgrs: &str,
    position_locality: &str,
    position_strip_name: &str,
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
                 position_strip_name=?5,work_type=?6,battle_order=?7,notes=?8,members_json=?9
             WHERE id=(SELECT id FROM position_work_events WHERE work_id=?10 ORDER BY id DESC LIMIT 1)",
            params![position_id,position_name,position_mgrs,position_locality,position_strip_name,draft.work_type.trim(),draft.battle_order.trim(),draft.notes.trim(),members_json,work_id],
        ).map_err(|_| "Не вдалося оновити знімок події робіт.".to_string())?
    };
    if create_transition || updated == 0 {
        connection.execute(
            "INSERT INTO position_work_events(work_id,position_id,position_name,position_mgrs,position_locality,position_strip_name,work_type,status,start_date,start_time,end_date,end_time,battle_order,notes,members_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![work_id,position_id,position_name,position_mgrs,position_locality,position_strip_name,draft.work_type.trim(),draft.status.trim(),draft.start_date.trim(),draft.start_time.trim(),draft.end_date.trim(),draft.end_time.trim(),draft.battle_order.trim(),draft.notes.trim(),members_json],
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

#[allow(clippy::too_many_arguments)]
fn complete_work_record(
    connection: &Connection,
    work_id: i64,
    end_date: &str,
    end_time: &str,
    work_type: &str,
    start_date: &str,
    start_time: &str,
    position_id: Option<i64>,
    position_name: &str,
    position_mgrs: &str,
    position_locality: &str,
    position_strip_name: &str,
    battle_order: &str,
    notes: &str,
) -> Result<(), String> {
    let completion = parse_date_time(end_date, end_time, "Завершення робіт")?;
    let start = parse_date_time(start_date, start_time, "Початок робіт")?;
    if completion <= start {
        return Err("Завершення робіт має бути пізніше за початок.".into());
    }
    let mut completed_members = members(connection, work_id)?;
    for member in &mut completed_members {
        if member.end_date.trim().is_empty() || member.end_time.trim().is_empty() {
            member.end_date = end_date.to_string();
            member.end_time = end_time.to_string();
        }
    }
    connection
        .execute(
            "UPDATE position_work_periods
             SET end_date=?1,end_time=?2
             WHERE work_id=?3 AND (trim(end_date)='' OR trim(end_time)='')",
            params![end_date, end_time, work_id],
        )
        .map_err(|_| "Не вдалося закрити періоди групи.".to_string())?;
    connection
        .execute(
            "UPDATE position_work_members
             SET end_date=?1,end_time=?2
             WHERE work_id=?3 AND (trim(end_date)='' OR trim(end_time)='')",
            params![end_date, end_time, work_id],
        )
        .map_err(|_| "Не вдалося закрити склад групи.".to_string())?;
    connection
        .execute(
            "UPDATE position_work SET status='Завершили',end_date=?1,end_time=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?3",
            params![end_date, end_time, work_id],
        )
        .map_err(|_| "Не вдалося завершити роботи.".to_string())?;
    connection.execute(
        "INSERT INTO position_work_status_history(work_id,status,start_date,start_time,end_date,end_time) VALUES(?1,'Завершили',?2,?3,?4,?5)",
        params![work_id,start_date,start_time,end_date,end_time],
    ).map_err(|_| "Не вдалося зберегти завершення робіт.".to_string())?;
    let completed_draft = PositionWorkDraft {
        position_id,
        position_name: position_name.to_string(),
        strip_name: position_strip_name.to_string(),
        locality: position_locality.to_string(),
        mgrs: position_mgrs.to_string(),
        work_type: work_type.to_string(),
        status: "Завершили".to_string(),
        start_date: start_date.to_string(),
        start_time: start_time.to_string(),
        end_date: end_date.to_string(),
        end_time: end_time.to_string(),
        battle_order: battle_order.to_string(),
        notes: notes.to_string(),
        personnel_ids: completed_members
            .iter()
            .map(|member| member.personnel_id)
            .collect(),
        member_assignments: Vec::new(),
    };
    let members_json = serde_json::to_string(&completed_members)
        .map_err(|_| "Не вдалося підготувати завершальний склад групи.".to_string())?;
    save_event_snapshot(
        connection,
        work_id,
        position_id,
        position_name,
        position_mgrs,
        position_locality,
        position_strip_name,
        &completed_draft,
        &members_json,
        true,
    )
}

#[tauri::command]
pub fn transition_reconnaissance_to_setup(
    state: tauri::State<AppState>,
    reconnaissance_work_id: i64,
    completion_date: String,
    completion_time: String,
    mut position_draft: PositionDraft,
    mut setup_draft: PositionWorkDraft,
) -> Result<i64, String> {
    if setup_draft.work_type.trim() != "Облаштування" || setup_draft.status.trim() == "Завершили"
    {
        return Err("Перехід із рекогностування має створювати активне облаштування.".into());
    }
    if setup_draft.position_id.is_some() {
        return Err("Під час переходу створюється нова позиція.".into());
    }
    if !["Основна", "Запасна"].contains(&position_draft.position_type.trim()) {
        return Err("Для нової позиції оберіть базовий тип «Основна» або «Запасна».".into());
    }
    if [
        position_draft.battle_order.as_str(),
        position_draft.strip_name.as_str(),
        position_draft.locality.as_str(),
        position_draft.mgrs.as_str(),
        position_draft.suitable_uav_text.as_str(),
    ]
    .iter()
    .any(|value| value.trim().is_empty())
    {
        return Err(
            "Для нової позиції вкажіть БРО, смугу роботи, населений пункт, координати MGRS та придатні БпЛА / БпАК."
                .into(),
        );
    }
    let assignments = validate_and_assignments(&setup_draft)?;
    let completion = parse_date_time(
        &completion_date,
        &completion_time,
        "Завершення рекогностування",
    )?;
    let setup_start = parse_date_time(
        &setup_draft.start_date,
        &setup_draft.start_time,
        "Початок облаштування",
    )?;
    if setup_start < completion {
        return Err("Облаштування не може початися раніше завершення рекогностування.".into());
    }
    position_draft.crew_id = None;
    position_draft.is_active = false;
    let normalized_mgrs = super::positions::validate_position(&position_draft)?;

    let db = state.0.lock().map_err(|_| busy())?;
    let local_today = chrono::Local::now().format("%Y-%m-%d").to_string();
    sync_personnel_state_before_position_work(&db.connection, &local_today)?;
    let transaction = db
        .connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося розпочати перехід до облаштування.".to_string())?;
    let source = transaction
        .query_row(
            "SELECT position_id,position_name,position_mgrs,position_locality,strip_name,
                    work_type,status,start_date,start_time,battle_order,notes
             FROM position_work WHERE id=?1",
            [reconnaissance_work_id],
            |row| {
                Ok((
                    row.get::<_, Option<i64>>(0)?,
                    row.get::<_, String>(1)?,
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
            },
        )
        .map_err(|_| "Групу рекогностування не знайдено.".to_string())?;
    if source.0.is_some() || source.5 != "Рекогностування" || source.6 == "Завершили"
    {
        return Err(
            "Перейти до облаштування можна лише з активної окремої групи рекогностування.".into(),
        );
    }
    if completion <= parse_date_time(&source.7, &source.8, "Початок рекогностування")?
    {
        return Err("Завершення рекогностування має бути пізніше за його початок.".into());
    }
    let source_members = transaction
        .prepare(
            "SELECT personnel_id,previous_location FROM position_work_members WHERE work_id=?1",
        )
        .and_then(|mut statement| {
            statement
                .query_map([reconnaissance_work_id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
                })?
                .collect::<Result<HashMap<_, _>, _>>()
        })
        .map_err(|_| "Не вдалося прочитати склад рекогностування.".to_string())?;
    let mut selected_ids = assignments
        .iter()
        .map(|assignment| assignment.personnel_id)
        .collect::<Vec<_>>();
    selected_ids.sort_unstable();
    selected_ids.dedup();
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
                    SELECT 1 FROM position_work_members pwm
                    JOIN position_work work ON work.id=pwm.work_id
                    WHERE pwm.personnel_id=?1 AND work.status<>'Завершили' AND work.id<>?2
                 )",
                params![personnel_id, reconnaissance_work_id],
                |row| row.get::<_, bool>(0),
            )
            .unwrap_or(false);
        validate_person_availability(
            &current_location,
            source_members.contains_key(personnel_id),
            true,
            true,
            has_other_active,
        )?;
    }

    let previous_position_type = position_draft.position_type.clone();
    let position_id = super::positions::create_position_record(&transaction, &position_draft)?;
    complete_work_record(
        &transaction,
        reconnaissance_work_id,
        completion_date.trim(),
        completion_time.trim(),
        &source.5,
        &source.7,
        &source.8,
        source.0,
        &source.1,
        &source.2,
        &source.3,
        &source.4,
        &source.9,
        &source.10,
    )?;

    setup_draft.position_id = Some(position_id);
    setup_draft.position_name = position_draft.name.trim().to_string();
    setup_draft.mgrs = normalized_mgrs;
    setup_draft.locality = position_draft.locality.trim().to_string();
    setup_draft.strip_name = position_draft.strip_name.trim().to_string();
    setup_draft.battle_order = position_draft.battle_order.trim().to_string();
    transaction.execute("INSERT INTO position_work(position_id,position_name,strip_name,position_locality,position_mgrs,work_type,status,start_date,start_time,end_date,end_time,battle_order,notes,previous_position_type) VALUES(?1,?2,?3,?4,?5,'Облаштування',?6,?7,?8,?9,?10,?11,?12,?13)",
        params![position_id,setup_draft.position_name,setup_draft.strip_name,setup_draft.locality,setup_draft.mgrs,setup_draft.status.trim(),setup_draft.start_date.trim(),setup_draft.start_time.trim(),setup_draft.end_date.trim(),setup_draft.end_time.trim(),setup_draft.battle_order.trim(),setup_draft.notes.trim(),previous_position_type])
        .map_err(|_| "Не вдалося створити облаштування позиції.".to_string())?;
    let setup_work_id = transaction.last_insert_rowid();
    for personnel_id in &selected_ids {
        let first = assignments
            .iter()
            .find(|assignment| assignment.personnel_id == *personnel_id)
            .ok_or_else(|| "Не вдалося підготувати склад облаштування.".to_string())?;
        let previous_location = source_members
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
        transaction.execute("INSERT INTO position_work_members(work_id,personnel_id,duty_type,start_date,start_time,end_date,end_time,previous_location) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![setup_work_id,personnel_id,first.duty_type.trim(),first.start_date.trim(),first.start_time.trim(),first.end_date.trim(),first.end_time.trim(),previous_location])
            .map_err(|_| "Не вдалося перенести склад до облаштування.".to_string())?;
        transaction.execute(
            "UPDATE personnel SET current_location='Реко та облаштування',updated_at=CURRENT_TIMESTAMP WHERE id=?1",
            [personnel_id],
        ).map_err(|_| "Не вдалося оновити БЧС після переходу до облаштування.".to_string())?;
    }
    for assignment in &assignments {
        transaction.execute("INSERT INTO position_work_periods(work_id,personnel_id,duty_type,start_date,start_time,end_date,end_time) VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![setup_work_id,assignment.personnel_id,assignment.duty_type.trim(),assignment.start_date.trim(),assignment.start_time.trim(),assignment.end_date.trim(),assignment.end_time.trim()])
            .map_err(|_| "Не вдалося перенести періоди до облаштування.".to_string())?;
    }
    for (personnel_id, previous_location) in &source_members {
        if !selected_ids.contains(personnel_id) {
            refresh_person_location(
                &transaction,
                *personnel_id,
                Some(reconnaissance_work_id),
                previous_location.clone(),
            )?;
        }
    }
    transaction.execute(
        "INSERT INTO position_work_status_history(work_id,status,start_date,start_time,end_date,end_time) VALUES(?1,?2,?3,?4,?5,?6)",
        params![setup_work_id,setup_draft.status.trim(),setup_draft.start_date.trim(),setup_draft.start_time.trim(),setup_draft.end_date.trim(),setup_draft.end_time.trim()],
    ).map_err(|_| "Не вдалося зберегти початок облаштування.".to_string())?;
    let setup_members_json = serde_json::to_string(&members(&transaction, setup_work_id)?)
        .map_err(|_| "Не вдалося підготувати склад облаштування.".to_string())?;
    save_event_snapshot(
        &transaction,
        setup_work_id,
        Some(position_id),
        &setup_draft.position_name,
        &setup_draft.mgrs,
        &setup_draft.locality,
        &setup_draft.strip_name,
        &setup_draft,
        &setup_members_json,
        true,
    )?;
    transaction
        .execute(
            "UPDATE positions SET position_type='Облаштовується' WHERE id=?1",
            [position_id],
        )
        .map_err(|_| "Не вдалося перевести позицію в облаштування.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити перехід до облаштування.".to_string())?;
    Ok(position_id)
}

#[tauri::command]
pub fn save_position_work(
    state: tauri::State<AppState>,
    work_id: Option<i64>,
    draft: PositionWorkDraft,
) -> Result<(), String> {
    let assignments = validate_and_assignments(&draft)?;
    if draft.work_type.trim() == "Облаштування" && draft.position_id.is_none() {
        return Err("Для облаштування оберіть наявну позицію або створіть нову.".to_string());
    }
    if draft.work_type.trim() == "Рекогностування" && draft.position_id.is_some() {
        return Err(
            "Рекогностування є окремою контрольною групою і не може бути прив’язане до позиції."
                .to_string(),
        );
    }
    if draft.work_type.trim() == "Рекогностування"
        && [
            draft.battle_order.as_str(),
            draft.strip_name.as_str(),
            draft.locality.as_str(),
        ]
        .iter()
        .any(|value| value.trim().is_empty())
    {
        return Err(
            "Для рекогностування вкажіть БРО, смугу роботи та населений пункт.".to_string(),
        );
    }
    let db = state.0.lock().map_err(|_| busy())?;
    let local_today = chrono::Local::now().format("%Y-%m-%d").to_string();
    sync_personnel_state_before_position_work(&db.connection, &local_today)?;
    let transaction = db
        .connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося розпочати збереження робіт на позиції.".to_string())?;
    let (position_type, position_name, position_mgrs, position_locality, position_strip_name) =
        if let Some(position_id) = draft.position_id {
            let row = transaction
                .query_row(
                    "SELECT position_type,name,mgrs,locality,strip_name FROM positions WHERE id=?1",
                    [position_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, String>(4)?,
                        ))
                    },
                )
                .map_err(|_| "Позицію не знайдено.".to_string())?;
            (Some(row.0), row.1, row.2, row.3, row.4)
        } else {
            (
                None,
                draft.position_name.trim().to_string(),
                draft.mgrs.trim().to_string(),
                draft.locality.trim().to_string(),
                draft.strip_name.trim().to_string(),
            )
        };
    let old_work = if let Some(id) = work_id {
        Some(
            transaction
                .query_row(
                    "SELECT position_id,status,previous_position_type,start_date,start_time,end_date,end_time FROM position_work WHERE id=?1",
                    [id],
                    |row| {
                        Ok((
                            row.get::<_, Option<i64>>(0)?,
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
    if draft_is_active && draft.work_type.trim() == "Облаштування" {
        if let Some(position_id) = draft.position_id {
            ensure_position_is_free_for_setup(&transaction, position_id)?;
        }
    }
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
    let previous_position_type = if draft.position_id.is_none() {
        None
    } else if draft_is_active {
        match &old_work {
            Some((old_position_id, old_status, previous, _, _, _, _))
                if *old_position_id == draft.position_id && old_status != "Завершили" =>
            {
                previous.clone()
            }
            _ if position_type.as_deref() != Some("Облаштовується") => {
                position_type.clone()
            }
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
        transaction.execute("UPDATE position_work SET position_id=?1,position_name=?2,strip_name=?3,position_locality=?4,position_mgrs=?5,work_type=?6,status=?7,start_date=?8,start_time=?9,end_date=?10,end_time=?11,battle_order=?12,notes=?13,previous_position_type=?14,updated_at=CURRENT_TIMESTAMP WHERE id=?15",
            params![draft.position_id,position_name,position_strip_name,position_locality,position_mgrs,draft.work_type.trim(),draft.status.trim(),draft.start_date.trim(),draft.start_time.trim(),draft.end_date.trim(),draft.end_time.trim(),draft.battle_order.trim(),draft.notes.trim(),previous_position_type,id])
            .map_err(|_| "Не вдалося оновити роботи на позиції.".to_string())?;
        transaction
            .execute("DELETE FROM position_work_members WHERE work_id=?1", [id])
            .map_err(|_| "Не вдалося оновити склад групи.".to_string())?;
        transaction
            .execute("DELETE FROM position_work_periods WHERE work_id=?1", [id])
            .map_err(|_| "Не вдалося оновити періоди групи.".to_string())?;
        id
    } else {
        transaction.execute("INSERT INTO position_work(position_id,position_name,strip_name,position_locality,position_mgrs,work_type,status,start_date,start_time,end_date,end_time,battle_order,notes,previous_position_type) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![draft.position_id,position_name,position_strip_name,position_locality,position_mgrs,draft.work_type.trim(),draft.status.trim(),draft.start_date.trim(),draft.start_time.trim(),draft.end_date.trim(),draft.end_time.trim(),draft.battle_order.trim(),draft.notes.trim(),previous_position_type])
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
        &position_strip_name,
        &draft,
        &member_snapshot,
        history_changed,
    )?;
    if let Some((old_position_id, _, old_previous_type, _, _, _, _)) = &old_work {
        if *old_position_id != draft.position_id || old_is_active && !draft_is_active {
            if let Some(old_position_id) = old_position_id {
                restore_position_type(
                    &transaction,
                    *old_position_id,
                    Some(id),
                    old_previous_type.clone(),
                )?;
            }
        }
    }
    if draft_is_active && draft.work_type.trim() == "Облаштування" && draft.position_id.is_some()
    {
        transaction
            .execute(
                "UPDATE positions SET position_type='Облаштовується' WHERE id=?1",
                [draft.position_id],
            )
            .map_err(|_| "Не вдалося оновити стан позиції.".to_string())?;
    } else if let Some(position_id) = draft.position_id {
        restore_position_type(&transaction, position_id, Some(id), previous_position_type)?;
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
            |row| {
                Ok((
                    row.get::<_, Option<i64>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            },
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
    if let Some(position_id) = position_id {
        restore_position_type(&transaction, position_id, None, previous_position_type)?;
    }
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
            position_id: Some(1),
            position_name: "САПСАН".into(),
            strip_name: "СМУГА".into(),
            locality: "ЛІСОВЕ".into(),
            mgrs: "36U UV 10000 20000".into(),
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
    fn open_ended_group_creates_open_periods_and_completion_requires_closing_them() {
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
        let open = validate_and_assignments(&legacy).unwrap();
        assert_eq!(open.len(), 1);
        assert!(open[0].end_date.is_empty());
        assert!(open[0].end_time.is_empty());
        legacy.status = "Завершили".into();
        assert!(validate_and_assignments(&legacy).is_err());
        legacy.status = "Продовжують".into();
        legacy.end_date = "2026-09-15".into();
        legacy.end_time = "12:00".into();
        assert_eq!(validate_and_assignments(&legacy).unwrap().len(), 1);
    }

    #[test]
    fn completing_open_standalone_reconnaissance_closes_members_and_snapshots_the_result() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location) VALUES(1,'солдат','ТЕСТОВИЙ','Тест','Тестович','оператор','1','','','','','','','','Реко та облаштування')", []).unwrap();
        connection.execute(
            "INSERT INTO position_work(id,position_id,position_name,strip_name,position_locality,work_type,status,start_date,start_time,battle_order)
             VALUES(10,NULL,'','СМУГА СХІД','СТЕПОВЕ','Рекогностування','Продовжують','2026-09-15','08:00','БРО-1')",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO position_work_members(work_id,personnel_id,duty_type,start_date,start_time,previous_location)
             VALUES(10,1,'Рекогностування','2026-09-15','08:00','ОХ')",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO position_work_periods(work_id,personnel_id,duty_type,start_date,start_time)
             VALUES(10,1,'Рекогностування','2026-09-15','08:00')",
            [],
        ).unwrap();

        complete_work_record(
            &connection,
            10,
            "2026-09-16",
            "10:00",
            "Рекогностування",
            "2026-09-15",
            "08:00",
            None,
            "",
            "",
            "СТЕПОВЕ",
            "СМУГА СХІД",
            "БРО-1",
            "",
        )
        .unwrap();

        let work: (String, String, String) = connection
            .query_row(
                "SELECT status,end_date,end_time FROM position_work WHERE id=10",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        let period: (String, String) = connection
            .query_row(
                "SELECT end_date,end_time FROM position_work_periods WHERE work_id=10",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        let event: (Option<i64>, String, String, String) = connection.query_row(
            "SELECT position_id,status,position_strip_name,members_json FROM position_work_events WHERE work_id=10 ORDER BY id DESC LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).unwrap();
        assert_eq!(
            work,
            ("Завершили".into(), "2026-09-16".into(), "10:00".into())
        );
        assert_eq!(period, ("2026-09-16".into(), "10:00".into()));
        assert_eq!(event.0, None);
        assert_eq!(event.1, "Завершили");
        assert_eq!(event.2, "СМУГА СХІД");
        assert!(event.3.contains("2026-09-16"));
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
    fn setup_cannot_start_while_the_position_is_assigned_to_a_crew() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO positions(id,name,position_type) VALUES(1,'САПСАН','Основна')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO crews(id,name,position_id) VALUES(1,'СОКІЛ',1)",
                [],
            )
            .unwrap();

        let error = ensure_position_is_free_for_setup(&connection, 1).unwrap_err();
        assert!(error.contains("САПСАН"));
        assert!(error.contains("СОКІЛ"));

        connection
            .execute("UPDATE crews SET position_id=NULL WHERE id=1", [])
            .unwrap();
        assert!(ensure_position_is_free_for_setup(&connection, 1).is_ok());
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
            Some(1),
            "НОВА",
            "36U UV 10000 20000",
            "ЛІСОВЕ",
            "СМУГА",
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
