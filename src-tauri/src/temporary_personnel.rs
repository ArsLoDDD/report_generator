use crate::AppState;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemporaryPerson {
    #[serde(default)]
    pub id: i64,
    pub full_name: String,
    pub rank: String,
    #[serde(default)]
    pub position: String,
    #[serde(default)]
    pub acting_slot_id: String,
    #[serde(default)]
    pub acting_position: String,
    pub duties: String,
    pub arrived_at: String,
    pub current_location: String,
    pub notes: String,
    #[serde(default = "default_category")]
    pub category: String,
    #[serde(default)]
    pub group_name: String,
}

fn default_category() -> String {
    "Тимчасово прибулі".into()
}

pub fn prepare(connection: &rusqlite::Connection) -> Result<(), String> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS temporary_personnel (
        id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, rank TEXT NOT NULL DEFAULT '',
        duties TEXT NOT NULL DEFAULT '', arrived_at TEXT NOT NULL, current_location TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Тимчасово прибулі',
        group_name TEXT NOT NULL DEFAULT '', position TEXT NOT NULL DEFAULT '', acting_slot_id TEXT NOT NULL DEFAULT '',
        acting_position TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );").map_err(|e| e.to_string())?;
    connection.execute("ALTER TABLE temporary_personnel ADD COLUMN category TEXT NOT NULL DEFAULT 'Тимчасово прибулі'", []).ok();
    connection
        .execute(
            "ALTER TABLE temporary_personnel ADD COLUMN group_name TEXT NOT NULL DEFAULT ''",
            [],
        )
        .ok();
    connection
        .execute(
            "ALTER TABLE temporary_personnel ADD COLUMN position TEXT NOT NULL DEFAULT ''",
            [],
        )
        .ok();
    connection
        .execute(
            "ALTER TABLE temporary_personnel ADD COLUMN acting_slot_id TEXT NOT NULL DEFAULT ''",
            [],
        )
        .ok();
    connection
        .execute(
            "ALTER TABLE temporary_personnel ADD COLUMN acting_position TEXT NOT NULL DEFAULT ''",
            [],
        )
        .ok();
    Ok(())
}

pub fn list(connection: &rusqlite::Connection) -> Result<Vec<TemporaryPerson>, String> {
    let mut query=connection.prepare("SELECT id,full_name,rank,position,acting_slot_id,acting_position,duties,arrived_at,current_location,notes,category,group_name FROM temporary_personnel ORDER BY CASE category WHEN 'Прикомандировані' THEN 0 WHEN 'Тимчасово прибулі' THEN 1 ELSE 2 END,group_name,arrived_at,id").map_err(|e|e.to_string())?;
    let rows = query
        .query_map([], |row| {
            Ok(TemporaryPerson {
                id: row.get(0)?,
                full_name: row.get(1)?,
                rank: row.get(2)?,
                position: row.get(3)?,
                acting_slot_id: row.get(4)?,
                acting_position: row.get(5)?,
                duties: row.get(6)?,
                arrived_at: row.get(7)?,
                current_location: row.get(8)?,
                notes: row.get(9)?,
                category: row.get(10)?,
                group_name: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub fn save(connection: &rusqlite::Connection, person: &TemporaryPerson) -> Result<(), String> {
    if person.full_name.trim().is_empty() || person.arrived_at.trim().is_empty() {
        return Err("Вкажіть ПІБ та дату прибуття.".into());
    }
    if !crate::database::is_valid_bcs_location(&person.current_location) {
        return Err("Оберіть значення «Де знаходиться» з довідника БЧС.".into());
    }
    if !person.acting_slot_id.is_empty() {
        let occupied: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM temporary_personnel WHERE acting_slot_id=?1 AND id<>?2",
                rusqlite::params![person.acting_slot_id, person.id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if occupied > 0 {
            return Err("Ця штатна посада вже зайнята іншим тимчасово прибулим як ТВО.".into());
        }
    }
    if person.id == 0 {
        connection.execute("INSERT INTO temporary_personnel(full_name,rank,position,acting_slot_id,acting_position,duties,arrived_at,current_location,notes,category,group_name) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",rusqlite::params![person.full_name.trim(),person.rank,person.position,person.acting_slot_id,person.acting_position,person.duties,person.arrived_at,person.current_location,person.notes,person.category,person.group_name]).map_err(|e|e.to_string())?;
    } else if connection.execute("UPDATE temporary_personnel SET full_name=?1,rank=?2,position=?3,acting_slot_id=?4,acting_position=?5,duties=?6,arrived_at=?7,current_location=?8,notes=?9,category=?10,group_name=?11 WHERE id=?12",rusqlite::params![person.full_name.trim(),person.rank,person.position,person.acting_slot_id,person.acting_position,person.duties,person.arrived_at,person.current_location,person.notes,person.category,person.group_name,person.id]).map_err(|e|e.to_string())? != 1 { return Err("Запис БЧС не знайдено.".into()); }
    Ok(())
}

#[tauri::command]
pub fn list_temporary_personnel(
    state: tauri::State<AppState>,
) -> Result<Vec<TemporaryPerson>, String> {
    let db = state.0.lock().map_err(|_| "База даних зайнята.")?;
    list(&db.connection)
}

#[tauri::command]
pub fn save_temporary_personnel(
    state: tauri::State<AppState>,
    person: TemporaryPerson,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| "База даних зайнята.")?;
    save(&db.connection, &person)
}

#[tauri::command]
pub fn delete_temporary_personnel(
    state: tauri::State<AppState>,
    person_id: i64,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| "База даних зайнята.")?;
    if db
        .connection
        .execute("DELETE FROM temporary_personnel WHERE id=?1", [person_id])
        .map_err(|e| e.to_string())?
        != 1
    {
        return Err("Запис БЧС не знайдено.".into());
    }
    Ok(())
}
