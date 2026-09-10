use rusqlite::{params, Connection};
use std::collections::HashMap;

pub const SHEETS: &[(&str, &[&str])] = &[
    (
        "Штатні призначення",
        &[
            "personnel_tax_id",
            "personnel_full_name",
            "slot_id",
            "acting_slot_id",
            "acting_position",
        ],
    ),
    (
        "Рекомендаційні листи",
        &[
            "slot_id",
            "position_name",
            "full_name",
            "phone",
            "rank",
            "birth_date",
            "issued_at",
            "notes",
        ],
    ),
    (
        "Додані до БЧС",
        &[
            "category",
            "group_name",
            "full_name",
            "rank",
            "position",
            "acting_slot_id",
            "acting_position",
            "duties",
            "arrived_at",
            "current_location",
            "notes",
        ],
    ),
    (
        "Фактичний склад екіпажів",
        &["crew_name", "personnel_tax_id", "personnel_full_name"],
    ),
];
pub type ExtraSheets = HashMap<String, Vec<HashMap<String, String>>>;

pub fn export(connection: &Connection) -> Result<ExtraSheets, String> {
    let queries = [
        "SELECT p.tax_id,trim(p.surname||' '||p.given_name||' '||p.patronymic),a.slot_id,a.acting_slot_id,a.acting_position FROM personnel_staff_assignments a JOIN personnel p ON p.id=a.personnel_id ORDER BY p.id",
        "SELECT slot_id,position_name,full_name,phone,rank,birth_date,issued_at,notes FROM staff_position_recommendations ORDER BY id",
        "SELECT category,group_name,full_name,rank,position,acting_slot_id,acting_position,duties,arrived_at,current_location,notes FROM temporary_personnel ORDER BY id",
        "SELECT c.name,COALESCE(p.tax_id,''),trim(p.surname||' '||p.given_name||' '||p.patronymic) FROM crew_actual_members cm JOIN crews c ON c.id=cm.crew_id JOIN personnel p ON p.id=cm.personnel_id ORDER BY c.name,p.id",
    ];
    let mut sheets = ExtraSheets::new();
    for ((name, keys), sql) in SHEETS.iter().zip(queries) {
        let mut query = connection.prepare(sql).map_err(|e| e.to_string())?;
        let rows = query
            .query_map([], |row| {
                keys.iter()
                    .enumerate()
                    .map(|(i, key)| Ok((key.to_string(), row.get::<_, String>(i)?)))
                    .collect::<Result<HashMap<_, _>, _>>()
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        sheets.insert(name.to_string(), rows);
    }
    Ok(sheets)
}

/// Called within the existing Excel import transaction. Stable billet IDs are preserved verbatim.
pub fn import(connection: &Connection, sheets: &ExtraSheets, replace: bool) -> Result<(), String> {
    for (name, rows) in sheets {
        if replace {
            match name.as_str() {
                "Штатні призначення" => {
                    connection
                        .execute("DELETE FROM personnel_staff_assignments", [])
                        .map_err(|e| e.to_string())?;
                }
                "Рекомендаційні листи" => {
                    connection
                        .execute("DELETE FROM staff_position_recommendations", [])
                        .map_err(|e| e.to_string())?;
                }
                "Додані до БЧС" | "Тимчасово прибулі" => {
                    connection
                        .execute("DELETE FROM temporary_personnel", [])
                        .map_err(|e| e.to_string())?;
                }
                "Фактичний склад екіпажів" => {
                    connection
                        .execute("DELETE FROM crew_actual_members", [])
                        .map_err(|e| e.to_string())?;
                }
                _ => {}
            }
        }
        for row in rows {
            let get = |key: &str| row.get(key).map(String::as_str).unwrap_or("");
            match name.as_str() {
                "Штатні призначення" => {
                    let mut query=connection.prepare("SELECT id FROM personnel WHERE (?1<>'' AND tax_id=?1) OR (?1='' AND trim(surname||' '||given_name||' '||patronymic)=?2)").map_err(|e|e.to_string())?;
                    let ids = query
                        .query_map(
                            params![get("personnel_tax_id"), get("personnel_full_name")],
                            |r| r.get::<_, i64>(0),
                        )
                        .map_err(|e| e.to_string())?
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|e| e.to_string())?;
                    if ids.len() != 1 {
                        return Err("Для штатного призначення потрібен однозначний збіг військовослужбовця за ІПН або ПІБ.".into());
                    }
                    connection.execute("INSERT INTO personnel_staff_assignments(personnel_id,slot_id,acting_slot_id,acting_position) VALUES(?1,?2,?3,?4) ON CONFLICT(personnel_id) DO UPDATE SET slot_id=excluded.slot_id,acting_slot_id=excluded.acting_slot_id,acting_position=excluded.acting_position",params![ids[0],get("slot_id"),get("acting_slot_id"),get("acting_position")]).map_err(|e|e.to_string())?;
                }
                "Рекомендаційні листи" => {
                    connection.execute("INSERT INTO staff_position_recommendations(slot_id,position_name,full_name,phone,rank,birth_date,issued_at,notes) SELECT ?1,?2,?3,?4,?5,?6,?7,?8 WHERE NOT EXISTS(SELECT 1 FROM staff_position_recommendations WHERE slot_id=?1 AND position_name=?2 AND full_name=?3 AND issued_at=?7)",params![get("slot_id"),get("position_name"),get("full_name"),get("phone"),get("rank"),get("birth_date"),get("issued_at"),get("notes")]).map_err(|e|e.to_string())?;
                }
                "Додані до БЧС" | "Тимчасово прибулі" => {
                    if get("full_name").trim().is_empty() || get("arrived_at").is_empty() {
                        return Err("Для тимчасово прибулих вкажіть ПІБ та дату прибуття.".into());
                    }
                    let category = if get("category").is_empty() {
                        "Тимчасово прибулі"
                    } else {
                        get("category")
                    };
                    connection.execute("INSERT INTO temporary_personnel(category,group_name,full_name,rank,position,acting_slot_id,acting_position,duties,arrived_at,current_location,notes) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11 WHERE NOT EXISTS(SELECT 1 FROM temporary_personnel WHERE full_name=?3 AND arrived_at=?9 AND category=?1)",params![category,get("group_name"),get("full_name"),get("rank"),get("position"),get("acting_slot_id"),get("acting_position"),get("duties"),get("arrived_at"),get("current_location"),get("notes")]).map_err(|e|e.to_string())?;
                }
                "Фактичний склад екіпажів" => {
                    let crew_id = connection
                        .query_row(
                            "SELECT id FROM crews WHERE name=?1",
                            [get("crew_name").trim()],
                            |r| r.get::<_, i64>(0),
                        )
                        .map_err(|_| {
                            format!(
                                "Не знайдено екіпаж «{}» для фактичного складу.",
                                get("crew_name")
                            )
                        })?;
                    let personnel_id=connection.query_row("SELECT id FROM personnel WHERE (?1<>'' AND tax_id=?1) OR (?1='' AND trim(surname||' '||given_name||' '||patronymic)=?2)",params![get("personnel_tax_id").trim(),get("personnel_full_name").trim()],|r|r.get::<_,i64>(0)).map_err(|_|format!("Не знайдено військовослужбовця «{}» для фактичного складу.",get("personnel_full_name")))?;
                    connection.execute("INSERT OR REPLACE INTO crew_actual_members(crew_id,personnel_id) VALUES(?1,?2)",params![crew_id,personnel_id]).map_err(|e|e.to_string())?;
                }
                _ => {}
            }
        }
    }
    Ok(())
}
