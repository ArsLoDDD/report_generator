use super::{busy, Crew, CrewDraft, CrewMember};
use crate::AppState;
use rusqlite::{Connection, OptionalExtension};
use std::collections::HashSet;

pub(crate) fn crew_members(
    connection: &Connection,
    crew_id: i64,
) -> Result<Vec<CrewMember>, String> {
    let mut s=connection.prepare("SELECT DISTINCT p.id, trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic), p.rank, p.position, COALESCE(p.callsign,''), COALESCE(p.current_location,'') FROM crew_members cm JOIN personnel p ON p.id=cm.personnel_id WHERE cm.crew_id=?1 AND cm.left_at IS NULL ORDER BY cm.joined_at, p.id").map_err(|_|"Не вдалося прочитати склад екіпажу.".to_string())?;
    let result = s
        .query_map([crew_id], |r| {
            Ok(CrewMember {
                personnel_id: r.get(0)?,
                full_name: r.get(1)?,
                rank: r.get(2)?,
                position: r.get(3)?,
                callsign: r.get(4)?,
                current_location: r.get(5)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string());
    result
}

pub(crate) fn actual_crew_members(
    connection: &Connection,
    crew_id: i64,
) -> Result<Vec<CrewMember>, String> {
    let mut statement=connection.prepare("SELECT p.id,trim(p.surname||' '||p.given_name||' '||p.patronymic),p.rank,p.position,COALESCE(p.callsign,''),COALESCE(p.current_location,'') FROM crew_actual_members cm JOIN personnel p ON p.id=cm.personnel_id WHERE cm.crew_id=?1 ORDER BY p.position,p.id").map_err(|_|"Не вдалося прочитати фактичний склад екіпажу.".to_string())?;
    let members = statement
        .query_map([crew_id], |row| {
            Ok(CrewMember {
                personnel_id: row.get(0)?,
                full_name: row.get(1)?,
                rank: row.get(2)?,
                position: row.get(3)?,
                callsign: row.get(4)?,
                current_location: row.get(5)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати фактичний склад екіпажу.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати фактичний склад екіпажу.".to_string())?;
    Ok(members)
}
#[tauri::command]
pub fn list_crews(state: tauri::State<AppState>) -> Result<Vec<Crew>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    super::reconcile_flight_plan_for_now(&db.connection)?;
    let mut s=db.connection.prepare("SELECT c.id,c.name,c.platoon,COALESCE(p.name,c.position_name),COALESCE(p.locality,c.reconnaissance_area),c.unit_type,c.company_name,COALESCE(p.battle_order,c.battle_order),c.sector,c.official_strength,(SELECT COUNT(*) FROM crew_actual_members am WHERE am.crew_id=c.id),c.status,COALESCE(primary_uav.name,c.uav_name),COALESCE(primary_uav.uav_type,c.uav_type),c.functional_duties,c.current_location,c.notes,COUNT(DISTINCT cm.personnel_id),c.position_id,c.primary_uav_id FROM crews c LEFT JOIN crew_members cm ON cm.crew_id=c.id AND cm.left_at IS NULL LEFT JOIN positions p ON p.id=c.position_id LEFT JOIN equipment primary_uav ON primary_uav.id=c.primary_uav_id AND primary_uav.crew_id=c.id AND primary_uav.category='uav' GROUP BY c.id ORDER BY c.platoon COLLATE NOCASE,c.name COLLATE NOCASE").map_err(|_|"Не вдалося прочитати екіпажі.".to_string())?;
    let rows = s
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, String>(7)?,
                r.get::<_, String>(8)?,
                r.get::<_, i64>(9)?,
                r.get::<_, i64>(10)?,
                r.get::<_, String>(11)?,
                r.get::<_, String>(12)?,
                r.get::<_, String>(13)?,
                r.get::<_, String>(14)?,
                r.get::<_, String>(15)?,
                r.get::<_, String>(16)?,
                r.get::<_, i64>(17)?,
                r.get::<_, Option<i64>>(18)?,
                r.get::<_, Option<i64>>(19)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?;
    rows.into_iter()
        .map(
            |(
                id,
                name,
                platoon,
                position_name,
                reconnaissance_area,
                unit_type,
                company_name,
                battle_order,
                sector,
                official_strength,
                working_strength,
                status,
                uav_name,
                uav_type,
                functional_duties,
                current_location,
                notes,
                member_count,
                position_id,
                primary_uav_id,
            )| {
                Ok(Crew {
                    id,
                    name,
                    platoon,
                    position_name,
                    reconnaissance_area,
                    unit_type,
                    company_name,
                    battle_order,
                    sector,
                    official_strength,
                    working_strength,
                    position_id,
                    status,
                    uav_name,
                    uav_type,
                    primary_uav_id,
                    functional_duties,
                    current_location,
                    notes,
                    member_count,
                    members: crew_members(&db.connection, id)?,
                    actual_members: actual_crew_members(&db.connection, id)?,
                })
            },
        )
        .collect()
}
#[tauri::command]
pub fn create_crew(state: tauri::State<AppState>, draft: CrewDraft) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    create_crew_record(&db.connection, draft)
}

fn unique_ids(ids: Vec<i64>) -> Vec<i64> {
    let mut seen = HashSet::new();
    ids.into_iter().filter(|id| seen.insert(*id)).collect()
}

fn insert_official_member(
    connection: &Connection,
    crew_id: i64,
    personnel_id: i64,
) -> Result<(), String> {
    let exists = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM personnel WHERE id=?1)",
            [personnel_id],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false);
    if !exists {
        return Err("Одного з учасників екіпажу не знайдено.".into());
    }
    connection
        .execute(
            "UPDATE crew_members SET left_at=CURRENT_TIMESTAMP WHERE personnel_id=?1 AND crew_id<>?2 AND left_at IS NULL",
            rusqlite::params![personnel_id, crew_id],
        )
        .map_err(|_| "Не вдалося перемістити учасника з попереднього екіпажу.".to_string())?;
    let active = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM crew_members WHERE crew_id=?1 AND personnel_id=?2 AND left_at IS NULL)",
            rusqlite::params![crew_id, personnel_id],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false);
    if !active {
        connection
            .execute(
                "INSERT INTO crew_members(crew_id,personnel_id,joined_at) VALUES(?1,?2,strftime('%Y-%m-%d %H:%M:%f','now')||'-'||lower(hex(randomblob(4))))",
                rusqlite::params![crew_id, personnel_id],
            )
            .map_err(|_| "Не вдалося додати учасника екіпажу.".to_string())?;
    }
    Ok(())
}

fn sync_crew_assets(connection: &Connection) -> Result<(), String> {
    connection.execute("UPDATE vehicles SET crew_id=(SELECT crew_id FROM crew_actual_members WHERE personnel_id=vehicles.personnel_id UNION SELECT crew_id FROM crew_members WHERE personnel_id=vehicles.personnel_id AND left_at IS NULL LIMIT 1) WHERE personnel_id IS NOT NULL", []).map_err(|_|"Не вдалося синхронізувати автомобілі екіпажу.".to_string())?;
    Ok(())
}

fn ensure_crew_position_available(
    connection: &Connection,
    position_id: Option<i64>,
) -> Result<(), String> {
    let Some(position_id) = position_id else {
        return Ok(());
    };
    let position = connection
        .query_row(
            "SELECT p.name,p.position_type,EXISTS(
                SELECT 1 FROM position_work w
                WHERE w.position_id=p.id AND w.work_type='Облаштування' AND w.status<>'Завершили'
             )
             FROM positions p WHERE p.id=?1",
            [position_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, bool>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "Не вдалося перевірити стан позиції.".to_string())?
        .ok_or_else(|| "Обрану позицію не знайдено.".to_string())?;
    if position.1 == "Облаштовується" || position.2 {
        return Err(format!(
            "Позиція «{}» зараз облаштовується. Її можна закріпити за екіпажем лише після завершення облаштування.",
            position.0
        ));
    }
    Ok(())
}

fn create_crew_record(connection: &Connection, mut draft: CrewDraft) -> Result<(), String> {
    if draft.name.trim().is_empty() {
        return Err("Вкажіть назву екіпажу.".into());
    }
    ensure_crew_position_available(connection, draft.position_id)?;
    draft.member_ids = unique_ids(draft.member_ids);
    let actual_member_ids = unique_ids(draft.actual_member_ids);
    let working_strength = actual_member_ids.len() as i64;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося розпочати збереження екіпажу.".to_string())?;
    transaction
        .execute(
            "INSERT INTO crews(name,platoon,position_name,reconnaissance_area,unit_type,company_name,battle_order,sector,official_strength,working_strength,status,uav_name,uav_type,functional_duties,current_location,notes,position_id,primary_uav_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
            rusqlite::params![
                draft.name.trim(),
                draft.platoon.trim(),
                draft.position_name.trim(),
                draft.reconnaissance_area.trim(), draft.unit_type.trim(), draft.company_name.trim(),
                draft.battle_order.trim(), draft.sector.trim(), draft.member_ids.len() as i64, working_strength,
                draft.status.trim(),
                draft.uav_name.trim(), draft.uav_type.trim(), draft.functional_duties.trim(),
                draft.current_location.trim(), draft.notes.trim(), draft.position_id, draft.primary_uav_id
            ],
        )
        .map_err(|_| "Не вдалося створити екіпаж. Перевірте унікальність назви.".to_string())?;
    let id = transaction.last_insert_rowid();
    for personnel_id in draft.member_ids {
        insert_official_member(&transaction, id, personnel_id)?;
    }
    for personnel_id in actual_member_ids {
        transaction
            .execute(
                "INSERT OR REPLACE INTO crew_actual_members(crew_id,personnel_id) VALUES(?1,?2)",
                rusqlite::params![id, personnel_id],
            )
            .map_err(|_| "Не вдалося додати фактичного учасника екіпажу.".to_string())?;
    }
    super::equipment::sync_crew_equipment_responsibles(&transaction, Some(id))?;
    sync_crew_assets(&transaction)?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити збереження екіпажу.".to_string())
}
#[tauri::command]
pub fn update_crew(
    state: tauri::State<AppState>,
    crew_id: i64,
    draft: CrewDraft,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    update_crew_record(&db.connection, crew_id, draft)
}

fn update_crew_record(
    connection: &Connection,
    crew_id: i64,
    mut draft: CrewDraft,
) -> Result<(), String> {
    if draft.name.trim().is_empty() {
        return Err("Вкажіть назву екіпажу.".into());
    }
    ensure_crew_position_available(connection, draft.position_id)?;
    draft.member_ids = unique_ids(draft.member_ids);
    let actual_member_ids = unique_ids(draft.actual_member_ids);
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося розпочати оновлення екіпажу.".to_string())?;
    if let Some(primary_uav_id) = draft.primary_uav_id {
        let valid = transaction
            .query_row(
                "SELECT COUNT(*) FROM equipment WHERE id=?1 AND crew_id=?2 AND category='uav'",
                rusqlite::params![primary_uav_id, crew_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;
        if !valid {
            return Err("Основним можна обрати лише БпЛА, закріплений за цим екіпажем.".into());
        }
    }
    let changed = transaction.execute("UPDATE crews SET name=?1,platoon=?2,position_name=?3,reconnaissance_area=?4,unit_type=?5,company_name=?6,battle_order=?7,sector=?8,official_strength=?9,working_strength=?10,status=?11,uav_name=?12,uav_type=?13,functional_duties=?14,current_location=?15,notes=?16,position_id=?17,primary_uav_id=?18 WHERE id=?19",rusqlite::params![draft.name.trim(),draft.platoon.trim(),draft.position_name.trim(),draft.reconnaissance_area.trim(),draft.unit_type.trim(),draft.company_name.trim(),draft.battle_order.trim(),draft.sector.trim(),draft.member_ids.len() as i64,actual_member_ids.len() as i64,draft.status.trim(),draft.uav_name.trim(),draft.uav_type.trim(),draft.functional_duties.trim(),draft.current_location.trim(),draft.notes.trim(),draft.position_id,draft.primary_uav_id,crew_id]).map_err(|_|"Не вдалося оновити екіпаж.".to_string())?;
    if changed == 0 {
        return Err("Екіпаж не знайдено.".into());
    }
    transaction.execute("UPDATE crews SET uav_name=COALESCE((SELECT name FROM equipment WHERE id=primary_uav_id),''),uav_type=COALESCE((SELECT uav_type FROM equipment WHERE id=primary_uav_id),'') WHERE id=?1",[crew_id]).map_err(|_|"Не вдалося оновити основний БпЛА екіпажу.".to_string())?;
    let selected = draft.member_ids.iter().copied().collect::<HashSet<_>>();
    let current = {
        let mut statement = transaction
            .prepare("SELECT DISTINCT personnel_id FROM crew_members WHERE crew_id=?1 AND left_at IS NULL")
            .map_err(|_| "Не вдалося прочитати поточний склад екіпажу.".to_string())?;
        let result = statement
            .query_map([crew_id], |row| row.get::<_, i64>(0))
            .map_err(|_| "Не вдалося прочитати поточний склад екіпажу.".to_string())?
            .collect::<Result<HashSet<_>, _>>()
            .map_err(|_| "Не вдалося прочитати поточний склад екіпажу.".to_string())?;
        result
    };
    for personnel_id in current.difference(&selected) {
        transaction
            .execute(
                "UPDATE crew_members SET left_at=CURRENT_TIMESTAMP WHERE crew_id=?1 AND personnel_id=?2 AND left_at IS NULL",
                rusqlite::params![crew_id, personnel_id],
            )
            .map_err(|_| "Не вдалося прибрати учасника з офіційного складу.".to_string())?;
    }
    for personnel_id in draft.member_ids {
        insert_official_member(&transaction, crew_id, personnel_id)?;
    }
    transaction
        .execute(
            "DELETE FROM crew_actual_members WHERE crew_id=?1",
            [crew_id],
        )
        .map_err(|_| "Не вдалося оновити фактичний склад екіпажу.".to_string())?;
    for personnel_id in actual_member_ids {
        transaction
            .execute(
                "INSERT OR REPLACE INTO crew_actual_members(crew_id,personnel_id) VALUES(?1,?2)",
                rusqlite::params![crew_id, personnel_id],
            )
            .map_err(|_| "Не вдалося оновити фактичний склад екіпажу.".to_string())?;
    }
    super::equipment::sync_crew_equipment_responsibles(&transaction, Some(crew_id))?;
    sync_crew_assets(&transaction)?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити оновлення екіпажу.".to_string())
}
#[tauri::command]
pub fn delete_crew(state: tauri::State<AppState>, crew_id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute("DELETE FROM crews WHERE id=?1", [crew_id])
        .map_err(|_| "Не вдалося видалити екіпаж.".to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draft(name: &str, member_ids: Vec<i64>, actual_member_ids: Vec<i64>) -> CrewDraft {
        CrewDraft {
            name: name.into(),
            platoon: String::new(),
            position_name: String::new(),
            reconnaissance_area: String::new(),
            unit_type: "Екіпаж".into(),
            company_name: String::new(),
            battle_order: String::new(),
            sector: String::new(),
            official_strength: member_ids.len() as i64,
            working_strength: actual_member_ids.len() as i64,
            position_id: None,
            status: "Працюючий".into(),
            uav_name: String::new(),
            uav_type: String::new(),
            primary_uav_id: None,
            functional_duties: String::new(),
            current_location: String::new(),
            notes: String::new(),
            member_ids,
            actual_member_ids,
        }
    }

    fn database() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        for id in 1..=2 {
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(?1,'солдат',?2,'Іван','Іванович','оператор',?3,'','','','','','','')", rusqlite::params![id,format!("ТЕСТ{id}"),format!("tax-{id}")]).unwrap();
        }
        connection
    }

    #[test]
    fn repeated_save_keeps_the_official_roster_instead_of_recreating_it() {
        let connection = database();
        create_crew_record(&connection, draft("Сокіл", vec![1], vec![1])).unwrap();
        update_crew_record(&connection, 1, draft("Сокіл", vec![1], vec![1])).unwrap();
        update_crew_record(&connection, 1, draft("Сокіл", vec![1], vec![1])).unwrap();

        let active: i64 = connection.query_row("SELECT COUNT(*) FROM crew_members WHERE crew_id=1 AND personnel_id=1 AND left_at IS NULL", [], |row| row.get(0)).unwrap();
        assert_eq!(active, 1);
    }

    #[test]
    fn failed_roster_update_rolls_back_every_partial_change() {
        let connection = database();
        create_crew_record(&connection, draft("Сокіл", vec![1], vec![1])).unwrap();

        assert!(update_crew_record(&connection, 1, draft("Сокіл", vec![2], vec![999])).is_err());

        let active = crew_members(&connection, 1).unwrap();
        assert_eq!(
            active
                .iter()
                .map(|member| member.personnel_id)
                .collect::<Vec<_>>(),
            vec![1]
        );
        let actual = actual_crew_members(&connection, 1).unwrap();
        assert_eq!(
            actual
                .iter()
                .map(|member| member.personnel_id)
                .collect::<Vec<_>>(),
            vec![1]
        );
    }

    #[test]
    fn position_under_setup_cannot_be_assigned_until_setup_is_finished() {
        let connection = database();
        connection
            .execute(
                "INSERT INTO positions(id,name,position_type) VALUES(1,'САПСАН','Облаштовується')",
                [],
            )
            .unwrap();
        let mut crew = draft("Сокіл", vec![1], vec![1]);
        crew.position_id = Some(1);
        let error = create_crew_record(&connection, crew.clone()).unwrap_err();
        assert!(error.contains("зараз облаштовується"));

        connection
            .execute(
                "UPDATE positions SET position_type='Основна' WHERE id=1",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO position_work(position_id,work_type,status,start_date,start_time)
                 VALUES(1,'Облаштування','Продовжують','2026-09-15','08:00')",
                [],
            )
            .unwrap();
        assert!(create_crew_record(&connection, crew.clone()).is_err());

        connection
            .execute("UPDATE position_work SET status='Завершили'", [])
            .unwrap();
        create_crew_record(&connection, crew).unwrap();
    }

    #[test]
    fn updated_roster_survives_closing_and_reopening_the_database_file() {
        let path = std::env::temp_dir().join(format!(
            "shablonizator-crew-persistence-{}-{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        {
            let connection = Connection::open(&path).unwrap();
            crate::database::initialise(&connection).unwrap();
            for id in 1..=2 {
                connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(?1,'солдат',?2,'Іван','Іванович','оператор',?3,'','','','','','','')", rusqlite::params![id,format!("ТЕСТ{id}"),format!("tax-{id}")]).unwrap();
            }
            create_crew_record(&connection, draft("Сокіл", vec![1], vec![1])).unwrap();
            update_crew_record(&connection, 1, draft("Сокіл", vec![2], vec![2])).unwrap();
        }
        {
            let reopened = Connection::open(&path).unwrap();
            crate::database::initialise(&reopened).unwrap();
            assert_eq!(
                crew_members(&reopened, 1)
                    .unwrap()
                    .into_iter()
                    .map(|member| member.personnel_id)
                    .collect::<Vec<_>>(),
                vec![2]
            );
            assert_eq!(
                actual_crew_members(&reopened, 1)
                    .unwrap()
                    .into_iter()
                    .map(|member| member.personnel_id)
                    .collect::<Vec<_>>(),
                vec![2]
            );
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn removed_actual_member_is_not_restored_when_the_database_reopens() {
        let path = std::env::temp_dir().join(format!(
            "shablonizator-crew-removal-{}-{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        {
            let connection = Connection::open(&path).unwrap();
            crate::database::initialise(&connection).unwrap();
            connection.execute("INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(1,'солдат','ТЕСТ','Іван','Іванович','оператор','tax-1','','','','','','','')", []).unwrap();
            create_crew_record(&connection, draft("Сокіл", vec![1], vec![1])).unwrap();
            update_crew_record(&connection, 1, draft("Сокіл", vec![1], vec![])).unwrap();
            assert!(actual_crew_members(&connection, 1).unwrap().is_empty());
        }
        {
            let reopened = Connection::open(&path).unwrap();
            crate::database::initialise(&reopened).unwrap();
            assert_eq!(crew_members(&reopened, 1).unwrap().len(), 1);
            assert!(actual_crew_members(&reopened, 1).unwrap().is_empty());
        }
        std::fs::remove_file(path).unwrap();
    }
}
