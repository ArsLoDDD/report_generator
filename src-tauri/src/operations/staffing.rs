use super::{
    busy, ActingChange, StaffRecommendation, StaffTransfer, StaffingRecord, VacancyRecommendation,
};
use crate::AppState;

#[tauri::command]
pub fn list_staffing_records(state: tauri::State<AppState>) -> Result<Vec<StaffingRecord>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    crate::database::normalize_staff_positions(&db.connection)?;
    let mut statement=db.connection.prepare("SELECT p.id,trim(p.surname||' '||p.given_name||' '||p.patronymic),p.rank,p.position,c.id,c.name,COALESCE(c.platoon,''),COALESCE(c.company_name,''),COALESCE(c.unit_type,'Екіпаж'),COALESCE(pos.name,''),COALESCE(pos.battle_order,''),COALESCE(c.sector,''),COALESCE(c.official_strength,0),COALESCE((SELECT COUNT(*) FROM crew_members x WHERE x.crew_id=c.id AND x.left_at IS NULL),0),COALESCE(c.status,''),COALESCE(c.uav_name,''),COALESCE(c.uav_type,''),COALESCE(NULLIF(p.functional_duties,''),c.functional_duties,''),COALESCE(p.current_location,''),COALESCE(p.bcs_status,''),COALESCE(NULLIF(p.bcs_notes,''),c.notes,''),COALESCE(a.acting_position,''),COALESCE((SELECT COUNT(*) FROM staff_recommendations sr WHERE sr.personnel_id=p.id),0),COALESCE(a.slot_id,''),COALESCE(a.acting_slot_id,''),COALESCE((SELECT COUNT(*) FROM crew_actual_members x WHERE x.crew_id=c.id),0) FROM personnel p LEFT JOIN crew_actual_members cam ON cam.personnel_id=p.id LEFT JOIN crews c ON c.id=cam.crew_id LEFT JOIN positions pos ON pos.id=c.position_id LEFT JOIN personnel_staff_assignments a ON a.personnel_id=p.id ORDER BY COALESCE(c.name,''),p.position,p.id").map_err(|_|"Не вдалося сформувати Штат та БЧС.".to_string())?;
    let result = statement
        .query_map([], |r| {
            Ok(StaffingRecord {
                personnel_id: r.get(0)?,
                full_name: r.get(1)?,
                rank: r.get(2)?,
                position: r.get(3)?,
                crew_id: r.get(4)?,
                crew_name: r.get(5)?,
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

#[tauri::command]
pub fn sync_flight_plan_locations(
    state: tauri::State<AppState>,
    crew_ids: Vec<i64>,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    db.connection
        .execute(
            "UPDATE personnel SET current_location='ОХ' WHERE current_location='На позиції'",
            [],
        )
        .map_err(|_| "Не вдалося оновити місцезнаходження особового складу.".to_string())?;
    for crew_id in crew_ids {
        db.connection.execute("UPDATE personnel SET current_location='На позиції' WHERE id IN (SELECT personnel_id FROM crew_actual_members WHERE crew_id=?1)",[crew_id]).map_err(|_|"Не вдалося позначити склад екіпажу на позиції.".to_string())?;
    }
    Ok(())
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
    if position.trim().is_empty() {
        return Err("Вкажіть посаду для переміщення.".into());
    }
    if !crate::database::is_valid_bcs_location(&current_location) {
        return Err("Оберіть значення «Де знаходиться» з довідника БЧС.".into());
    }
    db.connection.execute("UPDATE personnel SET position=?1,current_location=?2,functional_duties=?3,bcs_notes=?4,updated_at=CURRENT_TIMESTAMP WHERE id=?5", rusqlite::params![crate::database::canonical_staff_position(&position), current_location.trim(), functional_duties.trim(), notes.trim(), personnel_id]).map_err(|_| "Не вдалося оновити кадрові дані.".to_string())?;
    db.connection.execute("INSERT INTO personnel_staff_assignments(personnel_id,acting_position,updated_at) VALUES(?1,?2,CURRENT_TIMESTAMP) ON CONFLICT(personnel_id) DO UPDATE SET acting_position=excluded.acting_position,updated_at=CURRENT_TIMESTAMP", rusqlite::params![personnel_id, acting_position.trim()]).map_err(|_| "Не вдалося зберегти ТВО.".to_string())?;
    Ok(())
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
        let mut query = transaction.prepare("SELECT p.id FROM personnel p LEFT JOIN personnel_staff_assignments a ON a.personnel_id=p.id WHERE a.slot_id=?1 OR (COALESCE(a.slot_id,'')='' AND p.position=?2)").map_err(|e| e.to_string())?;
        occupants.extend(
            query
                .query_map(
                    rusqlite::params![assignment.slot_id, assignment.position],
                    |row| row.get::<_, i64>(0),
                )
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
