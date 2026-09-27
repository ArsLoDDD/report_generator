use super::*;
use chrono::{Duration, NaiveDateTime};

const DEADLINE_FORMAT: &str = "%Y-%m-%dT%H:%M";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeadlineReminder {
    id: i64,
    description: String,
    due_at: String,
    status: String,
    warning_seen_at: Option<String>,
    last_notification_slot: Option<String>,
    completed_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeadlineReminderInput {
    id: Option<i64>,
    description: String,
    due_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeadlineNotification {
    reminder: DeadlineReminder,
    slot: String,
    cadence_minutes: i64,
    overdue: bool,
}

fn read_reminder(row: &rusqlite::Row<'_>) -> rusqlite::Result<DeadlineReminder> {
    Ok(DeadlineReminder {
        id: row.get(0)?,
        description: row.get(1)?,
        due_at: row.get(2)?,
        status: row.get(3)?,
        warning_seen_at: row.get(4)?,
        last_notification_slot: row.get(5)?,
        completed_at: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn list(connection: &Connection) -> Result<Vec<DeadlineReminder>, String> {
    connection
        .prepare(
            "SELECT id,description,due_at,status,warning_seen_at,last_notification_slot,
                    completed_at,created_at,updated_at
             FROM deadline_reminders
             ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,
                      CASE status WHEN 'active' THEN due_at END ASC,
                      completed_at DESC,id DESC",
        )
        .and_then(|mut statement| {
            statement
                .query_map([], read_reminder)?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|error| format!("Не вдалося прочитати контроль строків: {error}"))
}

fn validate_input(input: &DeadlineReminderInput) -> Result<(String, String), String> {
    let description = input.description.trim().to_string();
    if description.is_empty() {
        return Err("Вкажіть опис завдання.".into());
    }
    let due_at = input.due_at.trim().to_string();
    let parsed = NaiveDateTime::parse_from_str(&due_at, DEADLINE_FORMAT)
        .map_err(|_| "Вкажіть коректні дату та час дедлайну.".to_string())?;
    if parsed.date() < Local::now().date_naive() {
        return Err("Дата дедлайну не може бути раніше за сьогодні.".into());
    }
    Ok((description, due_at))
}

fn notification_slot(now: NaiveDateTime, due_at: NaiveDateTime) -> Option<(String, i64, bool)> {
    let notification_start = due_at - Duration::hours(24);
    if now < notification_start {
        return None;
    }
    if now >= due_at {
        let index = (now - due_at).num_minutes().max(0) / 10;
        return Some((format!("overdue-{index}"), 10, true));
    }
    if now >= due_at - Duration::hours(1) {
        let index = (now - (due_at - Duration::hours(1))).num_minutes().max(0) / 10;
        return Some((format!("last-hour-{index}"), 10, false));
    }
    let index = (now - notification_start).num_minutes().max(0) / 60;
    Some((format!("hour-{index}"), 60, false))
}

pub(crate) fn warning_rows(connection: &Connection, now: NaiveDateTime) -> Vec<StartupWarning> {
    let upper_bound = (now + Duration::hours(48))
        .format(DEADLINE_FORMAT)
        .to_string();
    let now_text = now.format(DEADLINE_FORMAT).to_string();
    connection
        .prepare(
            "SELECT id,description,due_at FROM deadline_reminders
             WHERE status='active' AND warning_seen_at IS NULL AND due_at<=?1
             ORDER BY due_at,id",
        )
        .and_then(|mut statement| {
            statement
                .query_map([upper_bound], |row| {
                    let id = row.get::<_, i64>(0)?;
                    let description = row.get::<_, String>(1)?;
                    let due_at = row.get::<_, String>(2)?;
                    let overdue = due_at <= now_text;
                    Ok(StartupWarning {
                        code: format!("deadline-reminder-{id}"),
                        title: if overdue {
                            "Прострочений контрольний строк".into()
                        } else {
                            "Наближається контрольний строк".into()
                        },
                        message: format!(
                            "{} — до {}. Перегляньте запис у налаштуваннях «Контроль строків».",
                            description,
                            due_at.replace('T', " о ")
                        ),
                    })
                })?
                .collect::<Result<Vec<_>, _>>()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) fn list_deadline_reminders(
    state: tauri::State<AppState>,
) -> Result<Vec<DeadlineReminder>, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "Не вдалося відкрити базу даних.".to_string())?;
    list(&database.connection)
}

#[tauri::command]
pub(crate) fn save_deadline_reminder(
    state: tauri::State<AppState>,
    reminder: DeadlineReminderInput,
) -> Result<DeadlineReminder, String> {
    let (description, due_at) = validate_input(&reminder)?;
    let database = state
        .0
        .lock()
        .map_err(|_| "Не вдалося відкрити базу даних.".to_string())?;
    let id = if let Some(id) = reminder.id {
        let changed = database
            .connection
            .execute(
                "UPDATE deadline_reminders
                 SET description=?1,due_at=?2,warning_seen_at=NULL,last_notification_slot=NULL,
                     updated_at=CURRENT_TIMESTAMP
                 WHERE id=?3 AND status='active'",
                rusqlite::params![description, due_at, id],
            )
            .map_err(|error| format!("Не вдалося оновити контрольний строк: {error}"))?;
        if changed == 0 {
            return Err("Активний запис не знайдено.".into());
        }
        id
    } else {
        database
            .connection
            .execute(
                "INSERT INTO deadline_reminders(description,due_at) VALUES(?1,?2)",
                rusqlite::params![description, due_at],
            )
            .map_err(|error| format!("Не вдалося створити контрольний строк: {error}"))?;
        database.connection.last_insert_rowid()
    };
    database
        .connection
        .query_row(
            "SELECT id,description,due_at,status,warning_seen_at,last_notification_slot,
                    completed_at,created_at,updated_at FROM deadline_reminders WHERE id=?1",
            [id],
            read_reminder,
        )
        .map_err(|error| format!("Не вдалося прочитати збережений запис: {error}"))
}

#[tauri::command]
pub(crate) fn complete_deadline_reminder(
    state: tauri::State<AppState>,
    id: i64,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "Не вдалося відкрити базу даних.".to_string())?;
    let changed = database
        .connection
        .execute(
            "UPDATE deadline_reminders
             SET status='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
             WHERE id=?1 AND status='active'",
            [id],
        )
        .map_err(|error| format!("Не вдалося завершити контрольний строк: {error}"))?;
    if changed == 0 {
        return Err("Активний запис не знайдено.".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_deadline_reminder(
    state: tauri::State<AppState>,
    id: i64,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "Не вдалося відкрити базу даних.".to_string())?;
    database
        .connection
        .execute("DELETE FROM deadline_reminders WHERE id=?1", [id])
        .map_err(|error| format!("Не вдалося видалити запис: {error}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn acknowledge_deadline_warnings(
    state: tauri::State<AppState>,
    ids: Vec<i64>,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let mut database = state
        .0
        .lock()
        .map_err(|_| "Не вдалося відкрити базу даних.".to_string())?;
    let transaction = database
        .connection
        .transaction()
        .map_err(|_| "Не вдалося почати оновлення попереджень.".to_string())?;
    for id in ids {
        transaction
            .execute(
                "UPDATE deadline_reminders SET warning_seen_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='active'",
                [id],
            )
            .map_err(|_| "Не вдалося позначити попередження переглянутим.".to_string())?;
    }
    transaction
        .commit()
        .map_err(|_| "Не вдалося зберегти перегляд попереджень.".to_string())
}

#[tauri::command]
pub(crate) fn list_deadline_notifications(
    state: tauri::State<AppState>,
) -> Result<Vec<DeadlineNotification>, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "Не вдалося відкрити базу даних.".to_string())?;
    let now = Local::now().naive_local();
    Ok(list(&database.connection)?
        .into_iter()
        .filter(|reminder| reminder.status == "active")
        .filter_map(|reminder| {
            let due_at = NaiveDateTime::parse_from_str(&reminder.due_at, DEADLINE_FORMAT).ok()?;
            let (slot, cadence_minutes, overdue) = notification_slot(now, due_at)?;
            (reminder.last_notification_slot.as_deref() != Some(slot.as_str())).then_some(
                DeadlineNotification {
                    reminder,
                    slot,
                    cadence_minutes,
                    overdue,
                },
            )
        })
        .collect())
}

#[tauri::command]
pub(crate) fn acknowledge_deadline_notification(
    state: tauri::State<AppState>,
    id: i64,
    slot: String,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "Не вдалося відкрити базу даних.".to_string())?;
    database
        .connection
        .execute(
            "UPDATE deadline_reminders SET last_notification_slot=?1,updated_at=CURRENT_TIMESTAMP
             WHERE id=?2 AND status='active'",
            rusqlite::params![slot, id],
        )
        .map_err(|error| format!("Не вдалося підтвердити нагадування: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notification_cadence_changes_for_the_last_hour_and_overdue_period() {
        let due = NaiveDateTime::parse_from_str("2026-09-28T12:00", DEADLINE_FORMAT).unwrap();
        assert!(notification_slot(due - Duration::hours(25), due).is_none());
        assert_eq!(
            notification_slot(due - Duration::hours(24), due).unwrap().1,
            60
        );
        assert_eq!(
            notification_slot(due - Duration::minutes(59), due)
                .unwrap()
                .1,
            10
        );
        let overdue = notification_slot(due + Duration::minutes(12), due).unwrap();
        assert_eq!(overdue.0, "overdue-1");
        assert!(overdue.2);
    }

    #[test]
    fn completed_items_stay_in_history() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO deadline_reminders(description,due_at) VALUES('Надіслати відповідь','2026-09-28T12:00')", []).unwrap();
        connection.execute("UPDATE deadline_reminders SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=1", []).unwrap();
        let items = list(&connection).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].status, "completed");
        assert!(items[0].completed_at.is_some());
    }

    #[test]
    fn warning_is_shown_inside_48_hours_until_it_is_seen() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO deadline_reminders(description,due_at) VALUES('Надіслати відповідь','2026-09-29T11:00')", []).unwrap();
        let now = NaiveDateTime::parse_from_str("2026-09-27T12:00", DEADLINE_FORMAT).unwrap();
        let warnings = warning_rows(&connection, now);
        assert_eq!(warnings.len(), 1);
        assert_eq!(warnings[0].code, "deadline-reminder-1");
        connection
            .execute(
                "UPDATE deadline_reminders SET warning_seen_at=CURRENT_TIMESTAMP WHERE id=1",
                [],
            )
            .unwrap();
        assert!(warning_rows(&connection, now).is_empty());
    }

    #[test]
    fn rejects_a_deadline_date_before_today() {
        let yesterday = (Local::now().date_naive() - Duration::days(1))
            .format("%Y-%m-%d")
            .to_string();
        let input = DeadlineReminderInput {
            id: None,
            description: "Надіслати відповідь".into(),
            due_at: format!("{yesterday}T12:00"),
        };
        assert_eq!(
            validate_input(&input).unwrap_err(),
            "Дата дедлайну не може бути раніше за сьогодні."
        );
    }
}
