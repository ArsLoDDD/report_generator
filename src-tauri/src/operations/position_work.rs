use super::{busy, PositionWork, PositionWorkDraft, PositionWorkMember};
use crate::AppState;
use rusqlite::{params, Connection};

fn members(connection: &Connection, work_id: i64) -> Result<Vec<PositionWorkMember>, String> {
    let mut statement = connection
        .prepare(
            "SELECT p.id,trim(p.surname||' '||p.given_name||' '||p.patronymic),p.rank
         FROM position_work_members pwm JOIN personnel p ON p.id=pwm.personnel_id
         WHERE pwm.work_id=?1 ORDER BY p.surname,p.given_name,p.id",
        )
        .map_err(|_| "Не вдалося прочитати склад групи.".to_string())?;
    let result = statement
        .query_map([work_id], |row| {
            Ok(PositionWorkMember {
                personnel_id: row.get(0)?,
                full_name: row.get(1)?,
                rank: row.get(2)?,
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

fn validate(draft: &PositionWorkDraft) -> Result<(), String> {
    if !["Рекогностування", "Облаштування"].contains(&draft.work_type.as_str())
    {
        return Err("Оберіть вид робіт.".into());
    }
    if !["Приступили", "Продовжують", "Завершили"].contains(&draft.status.as_str())
    {
        return Err("Оберіть стан робіт.".into());
    }
    if draft.start_date.trim().is_empty() || draft.start_time.trim().is_empty() {
        return Err("Вкажіть дату та час робіт.".into());
    }
    if draft.personnel_ids.is_empty() {
        return Err("Оберіть хоча б одного військовослужбовця.".into());
    }
    Ok(())
}

fn restore_removed(connection: &Connection, work_id: i64, selected: &[i64]) -> Result<(), String> {
    let mut statement = connection
        .prepare("SELECT personnel_id FROM position_work_members WHERE work_id=?1")
        .map_err(|_| "Не вдалося перевірити попередній склад групи.".to_string())?;
    let old = statement
        .query_map([work_id], |row| row.get::<_, i64>(0))
        .map_err(|_| "Не вдалося перевірити попередній склад групи.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося перевірити попередній склад групи.".to_string())?;
    for personnel_id in old.into_iter().filter(|id| !selected.contains(id)) {
        connection.execute("UPDATE personnel SET current_location='ОХ',updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND current_location IN ('Реко','Облаштування','Реко та облаштування')", [personnel_id])
            .map_err(|_| "Не вдалося оновити БЧС.".to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_position_work(
    state: tauri::State<AppState>,
    work_id: Option<i64>,
    draft: PositionWorkDraft,
) -> Result<(), String> {
    validate(&draft)?;
    let db = state.0.lock().map_err(|_| busy())?;
    let exists = db
        .connection
        .query_row(
            "SELECT COUNT(*) FROM positions WHERE id=?1",
            [draft.position_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;
    if !exists {
        return Err("Позицію не знайдено.".into());
    }
    let id = if let Some(id) = work_id {
        restore_removed(&db.connection, id, &draft.personnel_ids)?;
        db.connection.execute("UPDATE position_work SET position_id=?1,work_type=?2,status=?3,start_date=?4,start_time=?5,end_date=?6,end_time=?7,battle_order=?8,notes=?9,updated_at=CURRENT_TIMESTAMP WHERE id=?10",
            params![draft.position_id,draft.work_type.trim(),draft.status.trim(),draft.start_date.trim(),draft.start_time.trim(),draft.end_date.trim(),draft.end_time.trim(),draft.battle_order.trim(),draft.notes.trim(),id])
            .map_err(|_| "Не вдалося оновити роботи на позиції.".to_string())?;
        db.connection
            .execute("DELETE FROM position_work_members WHERE work_id=?1", [id])
            .map_err(|_| "Не вдалося оновити склад групи.".to_string())?;
        id
    } else {
        db.connection.execute("INSERT INTO position_work(position_id,work_type,status,start_date,start_time,end_date,end_time,battle_order,notes) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![draft.position_id,draft.work_type.trim(),draft.status.trim(),draft.start_date.trim(),draft.start_time.trim(),draft.end_date.trim(),draft.end_time.trim(),draft.battle_order.trim(),draft.notes.trim()])
            .map_err(|_| "Не вдалося додати роботи на позиції.".to_string())?;
        db.connection.last_insert_rowid()
    };
    for personnel_id in &draft.personnel_ids {
        db.connection.execute("INSERT OR IGNORE INTO position_work_members(work_id,personnel_id) SELECT ?1,id FROM personnel WHERE id=?2", params![id,personnel_id])
            .map_err(|_| "Не вдалося зберегти склад групи.".to_string())?;
        let location = if draft.status == "Завершили" {
            "ОХ"
        } else if draft.work_type == "Рекогностування" {
            "Реко"
        } else {
            "Облаштування"
        };
        db.connection
            .execute(
                "UPDATE personnel SET current_location=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2",
                params![location, personnel_id],
            )
            .map_err(|_| "Не вдалося оновити БЧС.".to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_position_work(state: tauri::State<AppState>, work_id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    restore_removed(&db.connection, work_id, &[])?;
    db.connection
        .execute("DELETE FROM position_work WHERE id=?1", [work_id])
        .map_err(|_| "Не вдалося видалити роботи на позиції.".to_string())?;
    Ok(())
}
