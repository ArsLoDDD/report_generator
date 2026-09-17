use super::{
    busy, PersonnelControlAssignmentDraft, PersonnelControlHistoryEntry, PersonnelControlRecord,
};
use crate::AppState;
use chrono::{Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};

const MANUAL_LOCATIONS: [&str; 3] = ["НАВЧ", "ВІДР", "ЛІК"];
const POSITION_LOCATIONS: [&str; 4] = ["На позиції", "ЗБЗ", "ПБЗ", "ГШР"];
const POSITION_WORK_LOCATIONS: [&str; 3] = ["Реко", "Облаштування", "Реко та облаштування"];

pub(crate) fn is_manual_control_location(value: &str) -> bool {
    MANUAL_LOCATIONS.contains(&value.trim())
}

pub(crate) fn is_automatic_control_location(value: &str) -> bool {
    POSITION_LOCATIONS.contains(&value.trim()) || POSITION_WORK_LOCATIONS.contains(&value.trim())
}

fn parse_date(value: &str, label: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| format!("{label} має бути вказана у форматі РРРР-ММ-ДД."))
}

fn today() -> NaiveDate {
    Local::now().date_naive()
}

fn safe_previous_location(value: &str) -> String {
    let value = value.trim();
    if value.is_empty() || is_manual_control_location(value) || is_automatic_control_location(value)
    {
        "ОХ".into()
    } else {
        value.into()
    }
}

fn validate_draft(
    draft: &PersonnelControlAssignmentDraft,
    local_today: NaiveDate,
) -> Result<(NaiveDate, Option<NaiveDate>), String> {
    let location = draft.location_type.trim();
    if !is_manual_control_location(location) {
        return Err("У контролі особового складу вручну доступні лише НАВЧ, ВІДР і ЛІК. Автоматичні стани змінюються у відповідному робочому розділі.".into());
    }
    if draft.institution.trim().is_empty() {
        return Err("Вкажіть заклад або установу, де перебуває військовослужбовець.".into());
    }
    let start = parse_date(&draft.start_date, "Дата початку")?;
    if start > local_today {
        return Err("Дата початку не може бути пізніше за сьогодні. Заплановані переміщення слід фіксувати після їх фактичного початку.".into());
    }
    let end = if draft.end_date.trim().is_empty() {
        None
    } else {
        Some(parse_date(&draft.end_date, "Дата завершення")?)
    };
    if location == "НАВЧ" && end.is_none() {
        return Err("Для навчання обов’язково вкажіть дату завершення.".into());
    }
    if let Some(end) = end {
        if end < start {
            return Err("Дата завершення не може бути раніше за дату початку.".into());
        }
        if end < local_today {
            return Err("Активне переміщення не може завершуватися раніше за сьогодні.".into());
        }
    }
    Ok((start, end))
}

fn active_position_work(connection: &Connection, personnel_id: i64) -> bool {
    connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM position_work_members member
                JOIN position_work work ON work.id=member.work_id
                WHERE member.personnel_id=?1 AND work.status<>'Завершили'
            )",
            [personnel_id],
            |row| row.get(0),
        )
        .unwrap_or(false)
}

fn overlaps_existing_assignment(
    connection: &Connection,
    personnel_id: i64,
    excluded_id: Option<i64>,
    start: NaiveDate,
    end: Option<NaiveDate>,
) -> Result<bool, String> {
    let start = start.format("%Y-%m-%d").to_string();
    let end = end
        .map(|value| value.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "9999-12-31".into());
    connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM personnel_control_assignments assignment
                WHERE assignment.personnel_id=?1
                  AND (?2 IS NULL OR assignment.id<>?2)
                  AND date(assignment.start_date)<=date(?4)
                  AND date(CASE
                        WHEN trim(assignment.closed_on)<>'' THEN assignment.closed_on
                        WHEN trim(assignment.end_date)<>'' THEN assignment.end_date
                        ELSE '9999-12-31'
                      END)>=date(?3)
            )",
            params![personnel_id, excluded_id, start, end],
            |row| row.get(0),
        )
        .map_err(|_| "Не вдалося перевірити історію переміщень.".to_string())
}

struct ControlEvent<'a> {
    assignment_id: i64,
    personnel_id: i64,
    action: &'a str,
    location_type: &'a str,
    institution: &'a str,
    start_date: &'a str,
    end_date: &'a str,
    notes: &'a str,
    reason: &'a str,
}

fn save_event(connection: &Connection, event: ControlEvent<'_>) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO personnel_control_events(
                assignment_id,personnel_id,full_name_snapshot,rank_snapshot,position_snapshot,
                action,location_type,institution,
                start_date,end_date,notes,reason
             )
             SELECT ?1,person.id,
                    trim(person.surname||' '||person.given_name||' '||person.patronymic),
                    person.rank,person.position,?3,?4,?5,?6,?7,?8,?9
             FROM personnel person WHERE person.id=?2",
            params![
                event.assignment_id,
                event.personnel_id,
                event.action,
                event.location_type,
                event.institution,
                event.start_date,
                event.end_date,
                event.notes,
                event.reason
            ],
        )
        .map_err(|_| "Не вдалося зберегти історію контролю особового складу.".to_string())?;
    Ok(())
}

/// Reconciles planned completion dates with the canonical BCS projection.
/// An end date is inclusive: the person remains in that state through that day.
pub(crate) fn sync_manual_assignments_for_date(
    connection: &Connection,
    local_today: &str,
) -> Result<(), String> {
    let today = parse_date(local_today, "Поточна дата")?;
    let due = {
        let mut statement = connection
            .prepare(
                "SELECT id,personnel_id,location_type,institution,start_date,end_date,
                        notes,previous_location
                 FROM personnel_control_assignments
                 WHERE closed_at IS NULL AND trim(end_date)<>'' AND date(end_date)<date(?1)
                 ORDER BY end_date,id",
            )
            .map_err(|_| "Не вдалося прочитати завершені переміщення.".to_string())?;
        let rows = statement
            .query_map([today.format("%Y-%m-%d").to_string()], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })
            .map_err(|_| "Не вдалося прочитати завершені переміщення.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати завершені переміщення.".to_string())?;
        rows
    };
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося почати оновлення контролю особового складу.".to_string())?;
    for (id, personnel_id, location, institution, start_date, end_date, notes, previous) in due {
        transaction
            .execute(
                "UPDATE personnel_control_assignments
                 SET closed_on=end_date,closed_at=CURRENT_TIMESTAMP,
                     close_reason='Завершено автоматично за вказаною датою',updated_at=CURRENT_TIMESTAMP
                 WHERE id=?1 AND closed_at IS NULL",
                [id],
            )
            .map_err(|_| "Не вдалося завершити переміщення.".to_string())?;
        transaction
            .execute(
                "UPDATE personnel SET current_location=?1,updated_at=CURRENT_TIMESTAMP
                 WHERE id=?2 AND current_location=?3",
                params![safe_previous_location(&previous), personnel_id, location],
            )
            .map_err(|_| "Не вдалося синхронізувати стан у БЧС.".to_string())?;
        save_event(
            &transaction,
            ControlEvent {
                assignment_id: id,
                personnel_id,
                action: "closed",
                location_type: &location,
                institution: &institution,
                start_date: &start_date,
                end_date: &end_date,
                notes: &notes,
                reason: "Завершено автоматично за вказаною датою",
            },
        )?;
    }
    transaction
        .execute(
            "UPDATE personnel
             SET current_location=(
                    SELECT assignment.location_type
                    FROM personnel_control_assignments assignment
                    WHERE assignment.personnel_id=personnel.id
                      AND assignment.closed_at IS NULL
                      AND date(assignment.start_date)<=date(?1)
                      AND (trim(assignment.end_date)='' OR date(assignment.end_date)>=date(?1))
                    ORDER BY assignment.id DESC LIMIT 1
                 ),
                 updated_at=CURRENT_TIMESTAMP
             WHERE EXISTS(
                    SELECT 1 FROM personnel_control_assignments assignment
                    WHERE assignment.personnel_id=personnel.id
                      AND assignment.closed_at IS NULL
                      AND date(assignment.start_date)<=date(?1)
                      AND (trim(assignment.end_date)='' OR date(assignment.end_date)>=date(?1))
                 )
               AND COALESCE(current_location,'')<>COALESCE((
                    SELECT assignment.location_type
                    FROM personnel_control_assignments assignment
                    WHERE assignment.personnel_id=personnel.id
                      AND assignment.closed_at IS NULL
                      AND date(assignment.start_date)<=date(?1)
                      AND (trim(assignment.end_date)='' OR date(assignment.end_date)>=date(?1))
                    ORDER BY assignment.id DESC LIMIT 1
                 ),'')",
            [local_today],
        )
        .map_err(|_| "Не вдалося синхронізувати активні переміщення з БЧС.".to_string())?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити оновлення контролю особового складу.".to_string())
}

fn tab_for(location: &str) -> String {
    if POSITION_LOCATIONS.contains(&location) {
        "На позиції".into()
    } else if POSITION_WORK_LOCATIONS.contains(&location) {
        "Реко та облаштування".into()
    } else if location.trim().is_empty() {
        "Не вказано".into()
    } else {
        location.into()
    }
}

type ManualAssignment = (i64, String, String, String, String, bool, String);
type AutomaticContext = (
    Option<i64>,
    String,
    Option<i64>,
    String,
    Option<i64>,
    String,
    String,
    String,
);

fn active_manual_assignment(
    connection: &Connection,
    personnel_id: i64,
    local_today: &str,
) -> Result<Option<ManualAssignment>, String> {
    connection
        .query_row(
            "SELECT id,location_type,institution,start_date,end_date,until_separate_order,notes
             FROM personnel_control_assignments
             WHERE personnel_id=?1 AND closed_at IS NULL
               AND date(start_date)<=date(?2)
               AND (trim(end_date)='' OR date(end_date)>=date(?2))
             ORDER BY id DESC LIMIT 1",
            params![personnel_id, local_today],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get::<_, i64>(5)? != 0,
                    row.get(6)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "Не вдалося прочитати активне переміщення.".to_string())
}

fn automatic_context(
    connection: &Connection,
    personnel_id: i64,
) -> Result<AutomaticContext, String> {
    let flight_plan_date = connection
        .query_row(
            "SELECT plan_date FROM flight_plan_personnel_locations
             WHERE personnel_id=?1 LIMIT 1",
            [personnel_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| "Не вдалося визначити дату плану польотів.".to_string())?
        .unwrap_or_default();
    let crew = connection
        .query_row(
            "SELECT crew.id,crew.name,
                    COALESCE(crew.position_id,(
                        SELECT id FROM positions WHERE crew_id=crew.id
                        ORDER BY is_active DESC,id LIMIT 1
                    )),
                    COALESCE((
                        SELECT name FROM positions
                        WHERE id=COALESCE(crew.position_id,(
                            SELECT id FROM positions WHERE crew_id=crew.id
                            ORDER BY is_active DESC,id LIMIT 1
                        ))
                    ),'')
             FROM crews crew
             WHERE crew.id=COALESCE(
                 (SELECT crew_id FROM crew_actual_members WHERE personnel_id=?1 LIMIT 1),
                 (SELECT crew_id FROM crew_members
                  WHERE personnel_id=?1 AND left_at IS NULL ORDER BY id DESC LIMIT 1)
             )",
            [personnel_id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "Не вдалося визначити екіпаж військовослужбовця.".to_string())?;
    let work = connection
        .query_row(
            "SELECT work.id,work.work_type,work.position_id,position.name,
                    work.start_date,work.end_date
             FROM position_work_members member
             JOIN position_work work ON work.id=member.work_id
             JOIN positions position ON position.id=work.position_id
             WHERE member.personnel_id=?1 AND work.status<>'Завершили'
             ORDER BY work.id DESC LIMIT 1",
            [personnel_id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "Не вдалося визначити роботи військовослужбовця.".to_string())?;
    Ok(match (crew, work) {
        (
            Some((crew_id, crew_name, _position_id, _position_name)),
            Some((
                work_id,
                work_type,
                work_position_id,
                work_position_name,
                work_start_date,
                work_end_date,
            )),
        ) => (
            Some(crew_id),
            crew_name,
            Some(work_position_id),
            work_position_name,
            Some(work_id),
            work_type,
            work_start_date,
            work_end_date,
        ),
        (Some((crew_id, crew_name, position_id, position_name)), None) => (
            Some(crew_id),
            crew_name,
            position_id,
            position_name,
            None,
            String::new(),
            flight_plan_date.clone(),
            flight_plan_date,
        ),
        (None, Some((work_id, work_type, position_id, position_name, start_date, end_date))) => (
            None,
            String::new(),
            Some(position_id),
            position_name,
            Some(work_id),
            work_type,
            start_date,
            end_date,
        ),
        (None, None) => (
            None,
            String::new(),
            None,
            String::new(),
            None,
            String::new(),
            flight_plan_date.clone(),
            flight_plan_date,
        ),
    })
}

fn has_automatic_source(connection: &Connection, personnel_id: i64, location: &str) -> bool {
    if POSITION_WORK_LOCATIONS.contains(&location) {
        return active_position_work(connection, personnel_id);
    }
    if POSITION_LOCATIONS.contains(&location) {
        return connection
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM flight_plan_personnel_locations WHERE personnel_id=?1
                )",
                [personnel_id],
                |row| row.get(0),
            )
            .unwrap_or(false);
    }
    false
}

fn personnel_control_records(
    connection: &Connection,
    local_today: &str,
) -> Result<Vec<PersonnelControlRecord>, String> {
    let local_time = Local::now().format("%H:%M").to_string();
    super::reconcile_flight_plan_for_moment(connection, local_today, &local_time)?;
    let people = {
        let mut statement = connection
            .prepare(
                "SELECT id,trim(surname||' '||given_name||' '||patronymic),rank,position,
                        COALESCE(current_location,''),updated_at
                 FROM personnel ORDER BY surname COLLATE NOCASE,given_name COLLATE NOCASE,id",
            )
            .map_err(|_| "Не вдалося прочитати особовий склад.".to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|_| "Не вдалося прочитати особовий склад.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати особовий склад.".to_string())?;
        rows
    };

    people
        .into_iter()
        .map(
            |(personnel_id, full_name, rank, position, stored_location, updated_at)| {
                let manual = active_manual_assignment(connection, personnel_id, local_today)?;
                let (
                    assignment_id,
                    location_type,
                    institution,
                    start_date,
                    end_date,
                    until_separate_order,
                    notes,
                ) = manual
                    .as_ref()
                    .map(|item| {
                        (
                            Some(item.0),
                            item.1.clone(),
                            item.2.clone(),
                            item.3.clone(),
                            item.4.clone(),
                            item.5,
                            item.6.clone(),
                        )
                    })
                    .unwrap_or_else(|| {
                        (
                            None,
                            stored_location.clone(),
                            String::new(),
                            String::new(),
                            String::new(),
                            false,
                            String::new(),
                        )
                    });
                let automatic = manual.is_none()
                    && has_automatic_source(connection, personnel_id, &location_type);
                let source = if manual.is_some() {
                    "manual"
                } else if automatic {
                    "automatic"
                } else {
                    "bcs"
                };
                let source_label = match source {
                    "manual" => "Внесено в контролі особового складу",
                    "automatic" if POSITION_WORK_LOCATIONS.contains(&location_type.as_str()) => {
                        "Автоматично з робіт на позиції"
                    }
                    "automatic" => "Автоматично з БЧС і плану польотів",
                    _ => "Стан із БЧС",
                };
                let (
                    crew_id,
                    crew_name,
                    position_id,
                    position_name,
                    work_id,
                    work_type,
                    automatic_start_date,
                    automatic_end_date,
                ) = if automatic {
                    automatic_context(connection, personnel_id)?
                } else {
                    (
                        None,
                        String::new(),
                        None,
                        String::new(),
                        None,
                        String::new(),
                        String::new(),
                        String::new(),
                    )
                };
                let (start_date, end_date) = if automatic {
                    (automatic_start_date, automatic_end_date)
                } else {
                    (start_date, end_date)
                };
                Ok(PersonnelControlRecord {
                    personnel_id,
                    full_name,
                    rank,
                    position,
                    tab: tab_for(&location_type),
                    location_type,
                    source: source.into(),
                    source_label: source_label.into(),
                    can_edit: manual.is_some(),
                    assignment_id,
                    institution,
                    start_date,
                    end_date,
                    until_separate_order,
                    notes,
                    crew_id,
                    crew_name,
                    position_id,
                    position_name,
                    work_id,
                    work_type,
                    updated_at,
                })
            },
        )
        .collect()
}

#[tauri::command]
pub fn list_personnel_control_records(
    state: tauri::State<AppState>,
) -> Result<Vec<PersonnelControlRecord>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    personnel_control_records(&db.connection, &Local::now().format("%Y-%m-%d").to_string())
}

fn save_assignment(
    connection: &Connection,
    assignment_id: Option<i64>,
    draft: &PersonnelControlAssignmentDraft,
    local_today: NaiveDate,
) -> Result<i64, String> {
    let (start, end) = validate_draft(draft, local_today)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося почати збереження переміщення.".to_string())?;
    let current_location = transaction
        .query_row(
            "SELECT current_location FROM personnel WHERE id=?1",
            [draft.personnel_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "Військовослужбовця не знайдено.".to_string())?;
    let existing = assignment_id
        .map(|id| {
            transaction
                .query_row(
                    "SELECT personnel_id,location_type,previous_location,closed_at
                     FROM personnel_control_assignments WHERE id=?1",
                    [id],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, Option<String>>(3)?,
                        ))
                    },
                )
                .map_err(|_| "Переміщення не знайдено.".to_string())
        })
        .transpose()?;
    if let Some((personnel_id, _, _, closed_at)) = &existing {
        if *personnel_id != draft.personnel_id {
            return Err("Не можна перенести запис до іншого військовослужбовця.".into());
        }
        if closed_at.is_some() {
            return Err("Завершений запис не редагується. Створіть нове переміщення.".into());
        }
    } else {
        if is_manual_control_location(&current_location) {
            return Err("Для військовослужбовця вже вказано ручний стан. Відредагуйте або завершіть чинний запис.".into());
        }
        if !super::is_operationally_available(&current_location) {
            return Err(format!(
                "Не можна встановити ручний стан: військовослужбовець має стан «{}». Спочатку завершіть або змініть його у джерелі.",
                current_location.trim()
            ));
        }
        if super::is_protected_manual_control_origin(&current_location)
            || active_position_work(&transaction, draft.personnel_id)
        {
            return Err("Військовослужбовець зараз перебуває у системному процесі. Спочатку завершіть перебування на позиції, ротацію або роботи з рекогностування/облаштування.".into());
        }
    }
    if overlaps_existing_assignment(&transaction, draft.personnel_id, assignment_id, start, end)? {
        return Err(
            "Вказаний період перетинається з іншим переміщенням військовослужбовця.".into(),
        );
    }
    let until_separate_order = draft.location_type.trim() == "ВІДР" && end.is_none();
    let previous_location = existing
        .as_ref()
        .map(|item| item.2.clone())
        .unwrap_or_else(|| safe_previous_location(&current_location));
    let id = if let Some(id) = assignment_id {
        transaction
            .execute(
                "UPDATE personnel_control_assignments
                 SET location_type=?1,institution=?2,start_date=?3,end_date=?4,
                     until_separate_order=?5,notes=?6,updated_at=CURRENT_TIMESTAMP
                 WHERE id=?7 AND closed_at IS NULL",
                params![
                    draft.location_type.trim(),
                    draft.institution.trim(),
                    draft.start_date.trim(),
                    draft.end_date.trim(),
                    until_separate_order,
                    draft.notes.trim(),
                    id
                ],
            )
            .map_err(|_| "Не вдалося оновити переміщення.".to_string())?;
        id
    } else {
        transaction
            .execute(
                "INSERT INTO personnel_control_assignments(
                    personnel_id,location_type,institution,start_date,end_date,
                    until_separate_order,notes,previous_location
                 ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    draft.personnel_id,
                    draft.location_type.trim(),
                    draft.institution.trim(),
                    draft.start_date.trim(),
                    draft.end_date.trim(),
                    until_separate_order,
                    draft.notes.trim(),
                    previous_location
                ],
            )
            .map_err(|_| "Для військовослужбовця вже є активне переміщення.".to_string())?;
        transaction.last_insert_rowid()
    };
    transaction
        .execute(
            "UPDATE personnel SET current_location=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2",
            params![draft.location_type.trim(), draft.personnel_id],
        )
        .map_err(|_| "Не вдалося синхронізувати переміщення з БЧС.".to_string())?;
    save_event(
        &transaction,
        ControlEvent {
            assignment_id: id,
            personnel_id: draft.personnel_id,
            action: if assignment_id.is_some() {
                "updated"
            } else {
                "created"
            },
            location_type: draft.location_type.trim(),
            institution: draft.institution.trim(),
            start_date: draft.start_date.trim(),
            end_date: draft.end_date.trim(),
            notes: draft.notes.trim(),
            reason: "",
        },
    )?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити збереження переміщення.".to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn save_personnel_control_assignment(
    state: tauri::State<AppState>,
    assignment_id: Option<i64>,
    draft: PersonnelControlAssignmentDraft,
) -> Result<i64, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let local_today = today();
    let local_today_text = local_today.format("%Y-%m-%d").to_string();
    let local_time = Local::now().format("%H:%M").to_string();
    super::reconcile_flight_plan_for_moment(&db.connection, &local_today_text, &local_time)?;
    save_assignment(&db.connection, assignment_id, &draft, local_today)
}

fn close_assignment(
    connection: &Connection,
    assignment_id: i64,
    end_date: &str,
    reason: &str,
    local_today: NaiveDate,
) -> Result<(), String> {
    let end = parse_date(end_date, "Дата завершення")?;
    if end > local_today {
        return Err("Для майбутньої дати змініть планову дату завершення у записі.".into());
    }
    let transaction = connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося почати завершення переміщення.".to_string())?;
    let (personnel_id, location, institution, start_date, notes, previous) = transaction
        .query_row(
            "SELECT personnel_id,location_type,institution,start_date,notes,previous_location
             FROM personnel_control_assignments WHERE id=?1 AND closed_at IS NULL",
            [assignment_id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .map_err(|_| "Активне переміщення не знайдено.".to_string())?;
    if end < parse_date(&start_date, "Дата початку")? {
        return Err("Дата завершення не може бути раніше за дату початку.".into());
    }
    transaction
        .execute(
            "UPDATE personnel_control_assignments
             SET closed_on=?1,closed_at=CURRENT_TIMESTAMP,close_reason=?2,updated_at=CURRENT_TIMESTAMP
             WHERE id=?3 AND closed_at IS NULL",
            params![end_date.trim(), reason.trim(), assignment_id],
        )
        .map_err(|_| "Не вдалося завершити переміщення.".to_string())?;
    transaction
        .execute(
            "UPDATE personnel SET current_location=?1,updated_at=CURRENT_TIMESTAMP
             WHERE id=?2 AND current_location=?3",
            params![safe_previous_location(&previous), personnel_id, location],
        )
        .map_err(|_| "Не вдалося синхронізувати завершення з БЧС.".to_string())?;
    save_event(
        &transaction,
        ControlEvent {
            assignment_id,
            personnel_id,
            action: "closed",
            location_type: &location,
            institution: &institution,
            start_date: &start_date,
            end_date: end_date.trim(),
            notes: &notes,
            reason: reason.trim(),
        },
    )?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося завершити переміщення.".to_string())
}

#[tauri::command]
pub fn close_personnel_control_assignment(
    state: tauri::State<AppState>,
    assignment_id: i64,
    end_date: String,
    reason: Option<String>,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    close_assignment(
        &db.connection,
        assignment_id,
        &end_date,
        reason.as_deref().unwrap_or("Завершено користувачем"),
        today(),
    )
}

#[tauri::command]
pub fn list_personnel_control_history(
    state: tauri::State<AppState>,
    personnel_id: Option<i64>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<PersonnelControlHistoryEntry>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let offset = offset.unwrap_or(0).max(0);
    let mut statement = db
        .connection
        .prepare(
            "SELECT event.id,event.assignment_id,event.personnel_id,event.full_name_snapshot,
                    event.action,event.location_type,event.institution,event.start_date,
                    event.end_date,event.notes,event.reason,event.occurred_at
             FROM personnel_control_events event
             WHERE (?1 IS NULL OR event.personnel_id=?1)
             ORDER BY event.occurred_at DESC,event.id DESC
             LIMIT ?2 OFFSET ?3",
        )
        .map_err(|_| "Не вдалося прочитати історію контролю особового складу.".to_string())?;
    let rows = statement
        .query_map(rusqlite::params![personnel_id, limit, offset], |row| {
            Ok(PersonnelControlHistoryEntry {
                id: row.get(0)?,
                assignment_id: row.get(1)?,
                personnel_id: row.get(2)?,
                full_name: row.get(3)?,
                action: row.get(4)?,
                location_type: row.get(5)?,
                institution: row.get(6)?,
                start_date: row.get(7)?,
                end_date: row.get(8)?,
                notes: row.get(9)?,
                reason: row.get(10)?,
                occurred_at: row.get(11)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати історію контролю особового складу.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати історію контролю особового складу.".to_string())?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;

    fn connection() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        connection.execute(
            "INSERT INTO personnel(
                id,rank,surname,given_name,patronymic,position,tax_id,birth_date,
                education_level,education_details,armed_forces_service_start_date,
                position_assigned_date,position_assignment_order,military_id,current_location
             ) VALUES(1,'солдат','ТЕСТОВИЙ','Іван','Іванович','оператор','','','','','','','','','ОХ')",
            [],
        ).unwrap();
        connection
    }

    fn draft(location: &str, end_date: &str) -> PersonnelControlAssignmentDraft {
        PersonnelControlAssignmentDraft {
            personnel_id: 1,
            location_type: location.into(),
            institution: "Навчальний центр".into(),
            start_date: "2026-09-10".into(),
            end_date: end_date.into(),
            notes: "Тест".into(),
        }
    }

    #[test]
    fn validates_manual_types_and_training_end_date() {
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        assert!(validate_draft(&draft("На позиції", ""), today).is_err());
        assert!(validate_draft(&draft("НАВЧ", ""), today).is_err());
        assert!(validate_draft(&draft("НАВЧ", "2026-09-30"), today).is_ok());
        assert!(validate_draft(&draft("ВІДР", ""), today).is_ok());
        assert!(validate_draft(&draft("ЛІК", ""), today).is_ok());
    }

    #[test]
    fn manual_assignment_updates_bcs_and_keeps_history_when_closed() {
        let connection = connection();
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        let id = save_assignment(&connection, None, &draft("ВІДР", ""), today).unwrap();
        let location: String = connection
            .query_row(
                "SELECT current_location FROM personnel WHERE id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(location, "ВІДР");
        let records = personnel_control_records(&connection, "2026-09-17").unwrap();
        assert_eq!(records[0].assignment_id, Some(id));
        assert_eq!(records[0].tab, "ВІДР");
        assert!(records[0].until_separate_order);

        close_assignment(&connection, id, "2026-09-17", "Наказ", today).unwrap();
        let (location, assignments, events): (String, i64, i64) = (
            connection
                .query_row(
                    "SELECT current_location FROM personnel WHERE id=1",
                    [],
                    |row| row.get(0),
                )
                .unwrap(),
            connection
                .query_row(
                    "SELECT COUNT(*) FROM personnel_control_assignments",
                    [],
                    |row| row.get(0),
                )
                .unwrap(),
            connection
                .query_row("SELECT COUNT(*) FROM personnel_control_events", [], |row| {
                    row.get(0)
                })
                .unwrap(),
        );
        assert_eq!(location, "ОХ");
        assert_eq!(assignments, 1);
        assert_eq!(events, 2);
    }

    #[test]
    fn active_assignment_repairs_an_out_of_band_bcs_change() {
        let connection = connection();
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        save_assignment(&connection, None, &draft("ЛІК", ""), today).unwrap();
        connection
            .execute("UPDATE personnel SET current_location='ОХ' WHERE id=1", [])
            .unwrap();

        sync_manual_assignments_for_date(&connection, "2026-09-17").unwrap();

        let location: String = connection
            .query_row(
                "SELECT current_location FROM personnel WHERE id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(location, "ЛІК");
    }

    #[test]
    fn event_keeps_the_person_snapshot_after_the_person_is_deleted() {
        let connection = connection();
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        save_assignment(&connection, None, &draft("ЛІК", ""), today).unwrap();

        connection
            .execute("DELETE FROM personnel WHERE id=1", [])
            .unwrap();

        let (personnel_id, full_name, assignment_id): (i64, String, Option<i64>) = connection
            .query_row(
                "SELECT personnel_id,full_name_snapshot,assignment_id
                 FROM personnel_control_events",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(personnel_id, 1);
        assert_eq!(full_name, "ТЕСТОВИЙ Іван Іванович");
        assert_eq!(assignment_id, None);
    }

    #[test]
    fn automatic_locations_are_grouped_and_read_only() {
        let connection = connection();
        connection
            .execute("UPDATE personnel SET current_location='ЗБЗ' WHERE id=1", [])
            .unwrap();
        connection
            .execute(
                "INSERT INTO flight_plan_personnel_locations(personnel_id,plan_date,location)
                 VALUES(1,'2026-09-17','ЗБЗ')",
                [],
            )
            .unwrap();
        let record = personnel_control_records(&connection, "2026-09-17")
            .unwrap()
            .remove(0);
        assert_eq!(record.tab, "На позиції");
        assert_eq!(record.location_type, "ЗБЗ");
        assert_eq!(record.source, "automatic");
        assert_eq!(record.start_date, "2026-09-17");
        assert_eq!(record.end_date, "2026-09-17");
        assert!(!record.can_edit);
        assert!(save_assignment(
            &connection,
            None,
            &draft("ЛІК", ""),
            NaiveDate::from_ymd_opt(2026, 9, 17).unwrap()
        )
        .is_err());
    }

    #[test]
    fn manual_assignment_does_not_overwrite_absence_or_logistics() {
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        for location in [
            "ВІДП",
            "Відкомандировані",
            "СЗЧ",
            "ПТЗ Новостав",
            "Логістика на позиції",
        ] {
            let connection = connection();
            connection
                .execute(
                    "UPDATE personnel SET current_location=?1 WHERE id=1",
                    [location],
                )
                .unwrap();

            let error =
                save_assignment(&connection, None, &draft("ЛІК", ""), today).expect_err(location);
            if location == "Логістика на позиції" {
                assert!(error.contains("системному процесі"));
            } else {
                assert!(error.contains(location), "{error}");
                assert!(error.contains("у джерелі"), "{error}");
            }
            let (current_location, assignments): (String, i64) = (
                connection
                    .query_row(
                        "SELECT current_location FROM personnel WHERE id=1",
                        [],
                        |row| row.get(0),
                    )
                    .unwrap(),
                connection
                    .query_row(
                        "SELECT COUNT(*) FROM personnel_control_assignments",
                        [],
                        |row| row.get(0),
                    )
                    .unwrap(),
            );
            assert_eq!(current_location, location);
            assert_eq!(assignments, 0);
        }
    }

    #[test]
    fn active_position_work_exposes_its_real_date_range() {
        let connection = connection();
        connection
            .execute("INSERT INTO positions(id,name) VALUES(1,'САПСАН')", [])
            .unwrap();
        connection
            .execute(
                "INSERT INTO position_work(
                id,position_id,work_type,status,start_date,start_time,end_date,end_time
             ) VALUES(10,1,'Облаштування','Продовжують','2026-09-15','08:00','2026-09-20','18:00')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO position_work_members(work_id,personnel_id) VALUES(10,1)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "UPDATE personnel SET current_location='Реко та облаштування' WHERE id=1",
                [],
            )
            .unwrap();

        let record = personnel_control_records(&connection, "2026-09-17")
            .unwrap()
            .remove(0);

        assert_eq!(record.source, "automatic");
        assert_eq!(record.work_id, Some(10));
        assert_eq!(record.work_type, "Облаштування");
        assert_eq!(record.start_date, "2026-09-15");
        assert_eq!(record.end_date, "2026-09-20");
    }

    #[test]
    fn legacy_position_label_without_a_source_is_grouped_but_not_claimed_as_automatic() {
        let connection = connection();
        connection
            .execute("UPDATE personnel SET current_location='ГШР' WHERE id=1", [])
            .unwrap();
        let record = personnel_control_records(&connection, "2026-09-17")
            .unwrap()
            .remove(0);
        assert_eq!(record.tab, "На позиції");
        assert_eq!(record.source, "bcs");
        assert_eq!(record.source_label, "Стан із БЧС");
    }

    #[test]
    fn opening_control_directly_normalizes_yesterdays_transition_state() {
        let connection = connection();
        connection
            .execute("UPDATE personnel SET current_location='ЗБЗ' WHERE id=1", [])
            .unwrap();
        connection
            .execute(
                "INSERT INTO flight_plan_personnel_locations(personnel_id,plan_date,location)
                 VALUES(1,'2026-09-16','ЗБЗ')",
                [],
            )
            .unwrap();

        let record = personnel_control_records(&connection, "2026-09-17")
            .unwrap()
            .remove(0);

        assert_eq!(record.location_type, "На позиції");
        assert_eq!(record.tab, "На позиції");
        assert_eq!(record.source, "bcs");
        let service_rows: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM flight_plan_personnel_locations WHERE personnel_id=1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(service_rows, 0);
    }

    #[test]
    fn planned_end_is_inclusive_then_closes_and_restores_bcs() {
        let connection = connection();
        let today = NaiveDate::from_ymd_opt(2026, 9, 17).unwrap();
        let id = save_assignment(&connection, None, &draft("НАВЧ", "2026-09-17"), today).unwrap();
        sync_manual_assignments_for_date(&connection, "2026-09-17").unwrap();
        let open_today: i64 = connection.query_row("SELECT COUNT(*) FROM personnel_control_assignments WHERE id=?1 AND closed_at IS NULL", [id], |row| row.get(0)).unwrap();
        assert_eq!(open_today, 1);

        sync_manual_assignments_for_date(&connection, "2026-09-18").unwrap();
        let (open_tomorrow, location): (i64, String) = (
            connection.query_row("SELECT COUNT(*) FROM personnel_control_assignments WHERE id=?1 AND closed_at IS NULL", [id], |row| row.get(0)).unwrap(),
            connection.query_row("SELECT current_location FROM personnel WHERE id=1", [], |row| row.get(0)).unwrap(),
        );
        assert_eq!(open_tomorrow, 0);
        assert_eq!(location, "ОХ");
    }

    #[test]
    fn migration_turns_legacy_manual_location_into_editable_assignment() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        connection.execute(
            "INSERT INTO personnel(id,rank,surname,given_name,patronymic,position,tax_id,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id,current_location,updated_at)
             VALUES(1,'солдат','ТЕСТОВИЙ','Іван','Іванович','оператор','','','','','','','','','ВІДР','2026-09-10 12:00:00')",
            [],
        ).unwrap();
        database::initialise(&connection).unwrap();
        let record = personnel_control_records(&connection, "2026-09-17")
            .unwrap()
            .remove(0);
        assert_eq!(record.assignment_id, Some(1));
        assert_eq!(record.institution, "Не вказано");
        assert!(record.until_separate_order);
        assert!(record.can_edit);
    }
}
