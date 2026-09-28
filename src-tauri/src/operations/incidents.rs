use super::crews::actual_crew_members;
use super::{
    busy, Incident, IncidentDataDraft, IncidentDocument, IncidentDraft, IncidentHistoryEvent,
    IncidentStep,
};
use crate::AppState;
use rusqlite::Connection;

const INCIDENT_STATUSES: [&str; 7] = [
    "Чернетка",
    "Зареєстровано",
    "Першочергові дії",
    "Опрацьовується",
    "Очікує",
    "Завершено",
    "Скасовано",
];
const STEP_STATUSES: [&str; 5] = [
    "Не розпочато",
    "В роботі",
    "Очікує",
    "Виконано",
    "Пропущено",
];
const DOCUMENT_STATUSES: [&str; 6] = [
    "Не створено",
    "Чернетка",
    "Сформовано",
    "Погоджено",
    "Зареєстровано",
    "Повернуто на доопрацювання",
];
type HistoricalPersonnelSnapshot = (i64, String, String, String);

fn valid_incident_datetime(value: &str) -> bool {
    chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M").is_ok()
}

fn flight_is_within_last_day(
    flight_date: &str,
    sky_time: &str,
    now: chrono::NaiveDateTime,
) -> bool {
    let value = format!("{}T{}", flight_date.trim(), sky_time.trim());
    let Ok(occurred_at) = chrono::NaiveDateTime::parse_from_str(&value, "%Y-%m-%dT%H:%M") else {
        return false;
    };
    let age = now.signed_duration_since(occurred_at).num_seconds();
    (0..=24 * 60 * 60).contains(&age)
}

fn source_flight_personnel_snapshot(
    connection: &Connection,
    source_flight_id: Option<i64>,
) -> (String, Vec<i64>, Vec<HistoricalPersonnelSnapshot>) {
    let Some(source_flight_id) = source_flight_id else {
        return (String::new(), Vec::new(), Vec::new());
    };
    let flight = connection
        .query_row(
            "SELECT flight_date,sky_time,crew_id,personnel_snapshot_json FROM flight_journal_entries WHERE id=?1",
            [source_flight_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .ok();
    let Some((flight_date, sky_time, Some(crew_id), frozen_json)) = flight else {
        return (String::new(), Vec::new(), Vec::new());
    };
    let frozen = serde_json::from_str::<Vec<serde_json::Value>>(&frozen_json).unwrap_or_default();
    if !frozen.is_empty() {
        let historical = frozen
            .into_iter()
            .filter_map(|member| {
                Some((
                    member.get("personnelId")?.as_i64()?,
                    member.get("fullName")?.as_str()?.to_string(),
                    member
                        .get("rank")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    member
                        .get("position")
                        .and_then(|value| value.as_str())
                        .unwrap_or_default()
                        .to_string(),
                ))
            })
            .collect::<Vec<_>>();
        let ids = historical.iter().map(|(id, _, _, _)| *id).collect();
        let names = historical
            .iter()
            .map(|(_, name, _, _)| name.clone())
            .collect::<Vec<_>>()
            .join(", ");
        return (names, ids, historical);
    }
    let snapshot_json = connection.query_row(
        "SELECT snapshot_json FROM flight_plan_snapshots WHERE plan_date=?1 ORDER BY revision DESC,id DESC LIMIT 1",
        [flight_date],
        |row| row.get::<_, String>(0),
    ).ok();
    let Some(snapshot) =
        snapshot_json.and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok())
    else {
        return (String::new(), Vec::new(), Vec::new());
    };
    let entry = snapshot
        .get("entries")
        .and_then(|value| value.as_array())
        .and_then(|entries| {
            entries
                .iter()
                .find(|entry| {
                    entry.get("crewId").and_then(|value| value.as_i64()) == Some(crew_id)
                        && entry.get("startTime").and_then(|value| value.as_str())
                            == Some(sky_time.as_str())
                })
                .or_else(|| {
                    entries.iter().find(|entry| {
                        entry.get("crewId").and_then(|value| value.as_i64()) == Some(crew_id)
                    })
                })
        });
    let Some(entry) = entry else {
        return (String::new(), Vec::new(), Vec::new());
    };
    let mut ids = entry
        .get("actualMemberIds")
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_i64())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if let Some(commander_id) = entry
        .get("actualCommanderId")
        .and_then(|value| value.as_i64())
    {
        ids.retain(|id| *id != commander_id);
        ids.insert(0, commander_id);
    }
    let snapshots = entry
        .get("memberSnapshots")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let historical = ids
        .iter()
        .filter_map(|id| {
            snapshots
                .iter()
                .find(|member| {
                    member.get("personnelId").and_then(|value| value.as_i64()) == Some(*id)
                })
                .and_then(|member| {
                    Some((
                        *id,
                        member.get("fullName")?.as_str()?.to_string(),
                        member
                            .get("rank")
                            .and_then(|value| value.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        connection
                            .query_row("SELECT position FROM personnel WHERE id=?1", [*id], |row| {
                                row.get::<_, String>(0)
                            })
                            .unwrap_or_default(),
                    ))
                })
        })
        .collect::<Vec<_>>();
    let names = historical
        .iter()
        .map(|(_, name, _, _)| name.clone())
        .collect::<Vec<_>>();
    (names.join(", "), ids, historical)
}

fn incident_equipment(
    connection: &Connection,
    incident_id: i64,
) -> Result<(Vec<i64>, Vec<String>), String> {
    let mut statement = connection
        .prepare("SELECT e.id,e.name FROM incident_equipment ie JOIN equipment e ON e.id=ie.equipment_id WHERE ie.incident_id=?1 ORDER BY e.name COLLATE NOCASE,e.id")
        .map_err(|_| "Не вдалося прочитати майно інциденту.".to_string())?;
    let rows = statement
        .query_map([incident_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|_| "Не вдалося прочитати майно інциденту.".to_string())?
        .collect::<Result<Vec<(i64, String)>, _>>()
        .map_err(|_| "Не вдалося прочитати майно інциденту.".to_string())?;
    Ok(rows.into_iter().unzip())
}

fn incident_personnel(
    connection: &Connection,
    incident_id: i64,
) -> Result<(Vec<i64>, Vec<String>), String> {
    let mut statement = connection
        .prepare("SELECT personnel_id,full_name_snapshot FROM incident_personnel WHERE incident_id=?1 ORDER BY selection_order,rowid")
        .map_err(|_| "Не вдалося прочитати осіб інциденту.".to_string())?;
    let rows = statement
        .query_map([incident_id], |row| {
            Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| "Не вдалося прочитати осіб інциденту.".to_string())?
        .collect::<Result<Vec<(Option<i64>, String)>, _>>()
        .map_err(|_| "Не вдалося прочитати осіб інциденту.".to_string())?;
    let personnel_ids = rows.iter().filter_map(|(id, _)| *id).collect();
    let personnel_names = rows.into_iter().map(|(_, name)| name).collect();
    Ok((personnel_ids, personnel_names))
}

fn incident_steps(connection: &Connection, incident_id: i64) -> Result<Vec<IncidentStep>, String> {
    let mut statement = connection.prepare("SELECT id,step_order,title,description,is_required,status,due_at,completed_at,comment,updated_at FROM incident_steps WHERE incident_id=?1 ORDER BY step_order,id")
        .map_err(|_| "Не вдалося прочитати алгоритм інциденту.".to_string())?;
    let result = statement
        .query_map([incident_id], |row| {
            Ok(IncidentStep {
                id: row.get(0)?,
                order: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                required: row.get::<_, i64>(4)? != 0,
                status: row.get(5)?,
                due_at: row.get(6)?,
                completed_at: row.get(7)?,
                comment: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати алгоритм інциденту.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати алгоритм інциденту.".to_string());
    result
}

fn incident_documents(
    connection: &Connection,
    incident_id: i64,
) -> Result<Vec<IncidentDocument>, String> {
    let mut statement = connection.prepare("SELECT id,document_type,status,updated_at FROM incident_documents WHERE incident_id=?1 ORDER BY id")
        .map_err(|_| "Не вдалося прочитати документи інциденту.".to_string())?;
    let result = statement
        .query_map([incident_id], |row| {
            Ok(IncidentDocument {
                id: row.get(0)?,
                document_type: row.get(1)?,
                status: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати документи інциденту.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати документи інциденту.".to_string());
    result
}

fn incident_history(
    connection: &Connection,
    incident_id: i64,
) -> Result<Vec<IncidentHistoryEvent>, String> {
    let mut statement = connection.prepare("SELECT id,action,details,created_at FROM incident_history WHERE incident_id=?1 ORDER BY id DESC")
        .map_err(|_| "Не вдалося прочитати історію інциденту.".to_string())?;
    let result = statement
        .query_map([incident_id], |row| {
            Ok(IncidentHistoryEvent {
                id: row.get(0)?,
                action: row.get(1)?,
                details: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати історію інциденту.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати історію інциденту.".to_string());
    result
}

#[tauri::command]
pub fn list_incidents(state: tauri::State<AppState>) -> Result<Vec<Incident>, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    initialize_all_incident_workflows(&db.connection)?;
    let mut statement = db.connection.prepare("SELECT i.id,i.category,i.incident_type,i.status,i.occurred_at,i.crew_id,c.name,i.equipment_id,e.name,i.position_name,i.reconnaissance_area,i.crew_snapshot,COALESCE((SELECT group_concat(v.name || ' ' || v.registration_number, ', ') FROM vehicles v WHERE v.crew_id=i.crew_id),''),i.description,i.immediate_actions,i.consequences,i.flight_stage,i.preliminary_cause,i.snapshot_source,i.reported_to,i.reported_at,i.source_flight_id,i.event_data_json FROM incidents i LEFT JOIN crews c ON c.id=i.crew_id LEFT JOIN equipment e ON e.id=i.equipment_id ORDER BY i.occurred_at DESC,i.id DESC").map_err(|_|"Не вдалося прочитати інциденти.".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<i64>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, String>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, String>(14)?,
                row.get::<_, String>(15)?,
                row.get::<_, String>(16)?,
                row.get::<_, String>(17)?,
                row.get::<_, String>(18)?,
                row.get::<_, String>(19)?,
                row.get::<_, String>(20)?,
                row.get::<_, Option<i64>>(21)?,
                row.get::<_, String>(22)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати інциденти.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати інциденти.".to_string())?;
    rows.into_iter()
        .map(
            |(
                id,
                category,
                incident_type,
                status,
                occurred_at,
                crew_id,
                crew_name,
                legacy_equipment_id,
                legacy_equipment_name,
                position_name,
                reconnaissance_area,
                crew_snapshot,
                vehicle_name,
                description,
                immediate_actions,
                consequences,
                flight_stage,
                preliminary_cause,
                snapshot_source,
                reported_to,
                reported_at,
                source_flight_id,
                event_data_json,
            )| {
                let (mut equipment_ids, mut equipment_names) =
                    incident_equipment(&db.connection, id)?;
                if equipment_ids.is_empty() {
                    if let Some(equipment_id) = legacy_equipment_id {
                        equipment_ids.push(equipment_id);
                    }
                    if let Some(equipment_name) = legacy_equipment_name.clone() {
                        equipment_names.push(equipment_name);
                    }
                }
                let (personnel_ids, personnel_names) = incident_personnel(&db.connection, id)?;
                let event_data = serde_json::from_str(&event_data_json)
                    .unwrap_or_else(|_| serde_json::json!({}));
                Ok(Incident {
                    id,
                    category,
                    incident_type,
                    status,
                    occurred_at,
                    crew_id,
                    crew_name,
                    equipment_id: equipment_ids.first().copied(),
                    equipment_name: equipment_names.first().cloned(),
                    equipment_ids,
                    equipment_names,
                    personnel_ids,
                    personnel_names,
                    position_name,
                    reconnaissance_area,
                    crew_snapshot,
                    vehicle_name,
                    description,
                    immediate_actions,
                    consequences,
                    flight_stage,
                    preliminary_cause,
                    snapshot_source,
                    reported_to,
                    reported_at,
                    source_flight_id,
                    event_data,
                    steps: incident_steps(&db.connection, id)?,
                    documents: incident_documents(&db.connection, id)?,
                    history: incident_history(&db.connection, id)?,
                })
            },
        )
        .collect()
}

type WorkflowStepTemplate = (i64, &'static str, &'static str, Option<i64>);

struct WorkflowTemplate {
    steps: &'static [WorkflowStepTemplate],
    documents: &'static [&'static str],
}

const UAV_LOSS_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Негайна доповідь черговому/командиру",
        "Зафіксувати факт і час первинної доповіді",
        None,
    ),
    (
        2,
        "Першочергове донесення",
        "Підготувати та подати першочергове донесення",
        Some(3),
    ),
    (
        3,
        "Позатермінове донесення",
        "Підготувати та подати позатермінове донесення",
        Some(24),
    ),
    (
        4,
        "Рапорт на втрату",
        "Підготувати рапорт на втрату",
        Some(72),
    ),
    (
        5,
        "Передача матеріалів для списання",
        "Передати майно та матеріали у процес списання",
        None,
    ),
    (
        6,
        "Закриття інциденту",
        "Перевірити виконання обов’язкових дій",
        None,
    ),
];
const UAV_LOSS_DOCUMENTS: &[&str] = &[
    "Першочергове донесення",
    "Позатермінове донесення",
    "Рапорт на втрату",
];
const ASSET_LOSS_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Зафіксувати втрату майна",
        "Перевірити найменування, кількість, одиницю обліку, дату й час події",
        None,
    ),
    (
        2,
        "Доповісти про втрату",
        "Зафіксувати факт первинної доповіді",
        None,
    ),
    (
        3,
        "Зібрати пояснення",
        "Додати пояснення щодо обставин втрати",
        None,
    ),
    (
        4,
        "Передати матеріали на списання",
        "Підготувати й передати матеріали для рішення щодо списання",
        None,
    ),
    (
        5,
        "Зафіксувати результат",
        "Внести прийняте рішення та завершити інцидент після виконання обов’язкових дій",
        None,
    ),
];
const ASSET_LOSS_DOCUMENTS: &[&str] = &[
    "Доповідь про втрату майна",
    "Пояснення щодо втрати",
    "Матеріали на списання",
];
const VEHICLE_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Зафіксувати стан машини",
        "Вказати машину, водія, місце, час і характер пошкодження або знищення",
        None,
    ),
    (
        2,
        "Доповісти про подію",
        "Зафіксувати первинну доповідь про машину",
        None,
    ),
    (
        3,
        "Зібрати матеріали",
        "Додати відомості про обставини та пошкодження",
        None,
    ),
    (
        4,
        "Визначити подальше рішення",
        "Зафіксувати ремонт, списання або повернення машини в стрій",
        None,
    ),
    (
        5,
        "Завершити інцидент",
        "Перевірити виконання обов’язкових дій і зафіксувати результат",
        None,
    ),
];
const VEHICLE_DOCUMENTS: &[&str] = &[
    "Доповідь про подію з машиною",
    "Матеріали щодо пошкоджень",
    "Рішення про ремонт або списання",
];
const ACCIDENT_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Зафіксувати ДТП",
        "Вказати машину, водія, учасників, постраждалих і свідків",
        None,
    ),
    (
        2,
        "Доповісти про ДТП",
        "Зафіксувати первинну доповідь",
        None,
    ),
    (
        3,
        "Зібрати службові матеріали",
        "Додати обставини та відомості про пошкодження",
        None,
    ),
    (
        4,
        "Провести службове розслідування",
        "Контролювати підготовку матеріалів і рішення",
        None,
    ),
    (
        5,
        "Зафіксувати результат розслідування",
        "Внести результат службового розслідування",
        None,
    ),
    (
        6,
        "Завершити інцидент",
        "Перевірити виконання обов’язкових дій",
        None,
    ),
];
const ACCIDENT_DOCUMENTS: &[&str] = &[
    "Доповідь про ДТП",
    "Матеріали службового розслідування",
    "Результат службового розслідування",
];
const SHELLING_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповісти про обстріл",
        "Зафіксувати первинну доповідь",
        None,
    ),
    (
        2,
        "Зафіксувати обставини",
        "Вказати позицію, час, засіб ураження та орієнтовну кількість",
        None,
    ),
    (
        3,
        "Зафіксувати наслідки",
        "Додати постраждалих, пошкодження позиції та майна",
        None,
    ),
    (
        4,
        "Зафіксувати вжиті заходи",
        "Внести зміну позиції, евакуацію та інші виконані заходи",
        None,
    ),
    (
        5,
        "Завершити інцидент",
        "Перевірити виконання обов’язкових дій",
        None,
    ),
];
const SHELLING_DOCUMENTS: &[&str] = &["Доповідь про обстріл", "Матеріали фіксації наслідків"];
const POSITION_LOSS_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповісти про знищення позиції",
        "Зафіксувати первинну доповідь",
        None,
    ),
    (
        2,
        "Зафіксувати руйнування",
        "Вказати позицію, причину, час і ступінь руйнування",
        None,
    ),
    (
        3,
        "Зафіксувати людей і майно",
        "Зберегти склад людей, екіпажів, майна й техніки на момент події",
        None,
    ),
    (
        4,
        "Зафіксувати евакуацію",
        "Внести припинення роботи, евакуацію та резервну позицію",
        None,
    ),
    (
        5,
        "Підтвердити зміну стану позиції",
        "Змінити стан позиції в реєстрі лише після рішення користувача",
        None,
    ),
    (
        6,
        "Завершити інцидент",
        "Перевірити виконання обов’язкових дій",
        None,
    ),
];
const POSITION_LOSS_DOCUMENTS: &[&str] = &[
    "Доповідь про знищення позиції",
    "Матеріали фіксації руйнування",
    "Підтвердження зміни стану позиції",
];
const PERSONNEL_EVENT_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповісти про подію",
        "Зафіксувати кому і коли повідомлено",
        None,
    ),
    (
        2,
        "Зафіксувати фактичні дані",
        "Вказати осіб, час, місце, обставини, засіб і зону ураження",
        None,
    ),
    (
        3,
        "Зафіксувати евакуацію",
        "Внести час евакуації та медичний заклад",
        None,
    ),
    (
        4,
        "Зібрати медичні й службові документи",
        "Контролювати отримання офіційних документів без підміни їхнього висновку",
        None,
    ),
    (
        5,
        "Зафіксувати офіційний результат",
        "Внести отриманий офіційний документ і поточний результат",
        None,
    ),
    (
        6,
        "Завершити інцидент",
        "Перевірити виконання обов’язкових дій",
        None,
    ),
];
const PERSONNEL_EVENT_DOCUMENTS: &[&str] = &[
    "Первинна доповідь",
    "Медичні документи",
    "Службові матеріали",
];
const ABSENCE_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Зафіксувати факт СЗЧ",
        "Вказати особу, місце, дату й час",
        None,
    ),
    (
        2,
        "Зафіксувати майно при особі",
        "Внести зброю, майно, документи та транспорт",
        None,
    ),
    (
        3,
        "Зафіксувати спроби зв’язку",
        "Додати виконані спроби встановити зв’язок",
        None,
    ),
    (
        4,
        "Оформити доповіді, повідомлення й накази",
        "Внести їхні номери та стани",
        None,
    ),
    (
        5,
        "Зафіксувати поточний результат",
        "Вказати встановлений результат події",
        None,
    ),
    (
        6,
        "Завершити інцидент",
        "Перевірити виконання обов’язкових дій",
        None,
    ),
];
const ABSENCE_DOCUMENTS: &[&str] = &[
    "Доповідь про СЗЧ",
    "Повідомлення та накази",
    "Матеріали щодо результату",
];
const INTOXICATION_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Зафіксувати виявлення",
        "Вказати особу, підставу, місце, час і свідків",
        None,
    ),
    (
        2,
        "Зафіксувати перевірку",
        "Внести спосіб, прилад, номер і результат перевірки",
        None,
    ),
    (
        3,
        "Зафіксувати повторний вимір або відмову",
        "Внести повторний результат, згоду або відмову",
        None,
    ),
    (
        4,
        "Зафіксувати направлення до медичного закладу",
        "Додати відомості про направлення та офіційний документ",
        None,
    ),
    (
        5,
        "Оформити службові матеріали",
        "Контролювати доповіді, службовий акт і накази",
        None,
    ),
    (
        6,
        "Завершити інцидент",
        "Перевірити виконання обов’язкових дій",
        None,
    ),
];
const INTOXICATION_DOCUMENTS: &[&str] = &[
    "Службовий акт",
    "Медичний документ",
    "Наказ або службове рішення",
];
const DOCUMENT_LOSS_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Доповісти про втрату документа",
        "Зафіксувати кому й коли доповіли",
        None,
    ),
    (
        2,
        "Зафіксувати пошукові дії",
        "Внести останнє підтверджене місце та виконані пошукові дії",
        None,
    ),
    (
        3,
        "Провести службове розслідування",
        "Внести номер і результат службового розслідування",
        None,
    ),
    (
        4,
        "Подати звернення на відновлення",
        "Зафіксувати подання документів на відновлення",
        None,
    ),
    (
        5,
        "Зафіксувати отримання нового документа",
        "Внести дату отримання нового документа",
        None,
    ),
    (
        6,
        "Завершити інцидент",
        "Перевірити виконання обов’язкових дій",
        None,
    ),
];
const DOCUMENT_LOSS_DOCUMENTS: &[&str] = &[
    "Матеріали службового розслідування",
    "Звернення на відновлення",
    "Підтвердження отримання нового документа",
];
const BASE_STEPS: &[WorkflowStepTemplate] = &[
    (
        1,
        "Зафіксувати факт події",
        "Перевірити дату, час, пов’язаних осіб або об’єкти та обставини",
        None,
    ),
    (
        2,
        "Доповісти про подію",
        "Зафіксувати первинну доповідь",
        None,
    ),
    (
        3,
        "Зібрати пояснення та матеріали",
        "Додати наявні фактичні матеріали без зміни зафіксованого факту",
        None,
    ),
    (
        4,
        "Зафіксувати рішення або результат",
        "Внести отримане рішення та поточний результат",
        None,
    ),
    (
        5,
        "Завершити інцидент",
        "Перевірити виконання обов’язкових дій",
        None,
    ),
];
const BASE_DOCUMENTS: &[&str] = &[
    "Первинна доповідь",
    "Пояснення та матеріали",
    "Підсумковий документ",
];

fn workflow_template(incident_type: &str) -> WorkflowTemplate {
    match incident_type {
        "Втрата БпЛА" => WorkflowTemplate {
            steps: UAV_LOSS_STEPS,
            documents: UAV_LOSS_DOCUMENTS,
        },
        "Втрата майна" => WorkflowTemplate {
            steps: ASSET_LOSS_STEPS,
            documents: ASSET_LOSS_DOCUMENTS,
        },
        "Знищення машини"
        | "Пошкодження машини"
        | "Знищення автомобіля"
        | "Пошкодження автомобіля" => WorkflowTemplate {
            steps: VEHICLE_STEPS,
            documents: VEHICLE_DOCUMENTS,
        },
        "ДТП" => WorkflowTemplate {
            steps: ACCIDENT_STEPS,
            documents: ACCIDENT_DOCUMENTS,
        },
        "Обстріл" => WorkflowTemplate {
            steps: SHELLING_STEPS,
            documents: SHELLING_DOCUMENTS,
        },
        "Знищення позиції" => WorkflowTemplate {
            steps: POSITION_LOSS_STEPS,
            documents: POSITION_LOSS_DOCUMENTS,
        },
        "Поранення" | "Травма" | "Загибель" | "Самогубство" => {
            WorkflowTemplate {
                steps: PERSONNEL_EVENT_STEPS,
                documents: PERSONNEL_EVENT_DOCUMENTS,
            }
        }
        "СЗЧ" => WorkflowTemplate {
            steps: ABSENCE_STEPS,
            documents: ABSENCE_DOCUMENTS,
        },
        "Алкогольне/наркотичне сп’яніння" => WorkflowTemplate {
            steps: INTOXICATION_STEPS,
            documents: INTOXICATION_DOCUMENTS,
        },
        "Втрата військового квитка/посвідчення УБД" => {
            WorkflowTemplate {
                steps: DOCUMENT_LOSS_STEPS,
                documents: DOCUMENT_LOSS_DOCUMENTS,
            }
        }
        _ => WorkflowTemplate {
            steps: BASE_STEPS,
            documents: BASE_DOCUMENTS,
        },
    }
}

fn initialize_incident_workflow(
    connection: &Connection,
    incident_id: i64,
    incident_type: &str,
) -> Result<(), String> {
    let occurred_at = connection
        .query_row(
            "SELECT occurred_at FROM incidents WHERE id=?1",
            [incident_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "Інцидент не знайдено.".to_string())?;
    let occurred_at = chrono::NaiveDateTime::parse_from_str(&occurred_at, "%Y-%m-%dT%H:%M").ok();
    let template = workflow_template(incident_type);
    for &(order, title, description, deadline_hours) in template.steps {
        let due_at = occurred_at
            .zip(deadline_hours)
            .map(|(value, hours)| {
                (value + chrono::Duration::hours(hours))
                    .format("%Y-%m-%dT%H:%M")
                    .to_string()
            })
            .unwrap_or_default();
        connection.execute(
            "INSERT OR IGNORE INTO incident_steps(incident_id,step_order,title,description,is_required,due_at) VALUES(?1,?2,?3,?4,1,?5)",
            rusqlite::params![incident_id, order, title, description, due_at],
        ).map_err(|_| "Не вдалося створити алгоритм інциденту.".to_string())?;
    }
    for document_type in template.documents {
        connection
            .execute(
                "INSERT OR IGNORE INTO incident_documents(incident_id,document_type) VALUES(?1,?2)",
                rusqlite::params![incident_id, document_type],
            )
            .map_err(|_| "Не вдалося створити перелік документів інциденту.".to_string())?;
    }
    Ok(())
}

pub(crate) fn initialize_all_incident_workflows(connection: &Connection) -> Result<(), String> {
    let incidents = connection
        .prepare("SELECT id,incident_type FROM incidents ORDER BY id")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|_| "Не вдалося прочитати інциденти для підготовки алгоритмів.".to_string())?;
    for (incident_id, incident_type) in incidents {
        initialize_incident_workflow(connection, incident_id, &incident_type)?;
    }
    Ok(())
}

fn validate_incident_equipment(
    connection: &Connection,
    crew_id: Option<i64>,
    personnel_ids: &[i64],
    equipment_ids: &[i64],
) -> Result<(), String> {
    if equipment_ids.is_empty() {
        return Ok(());
    }
    for equipment_id in equipment_ids {
        let owner: Option<(Option<i64>, Option<i64>)> = connection
            .query_row(
                "SELECT crew_id,personnel_id FROM equipment WHERE id=?1",
                [equipment_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        let valid = owner.is_some_and(|(asset_crew_id, asset_personnel_id)| {
            asset_crew_id.is_some() && asset_crew_id == crew_id
                || asset_personnel_id.is_some_and(|personnel_id| {
                    personnel_ids.contains(&personnel_id)
                        || crew_id.is_some_and(|crew_id| {
                            connection.query_row(
                                "SELECT COUNT(*) FROM crew_actual_members WHERE crew_id=?1 AND personnel_id=?2",
                                rusqlite::params![crew_id, personnel_id],
                                |row| row.get::<_, i64>(0),
                            ).unwrap_or(0) > 0
                        })
                })
        });
        if !valid {
            return Err("До інциденту можна додати лише майно обраного екіпажу або особи.".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn create_incident(state: tauri::State<AppState>, draft: IncidentDraft) -> Result<(), String> {
    if draft.incident_type.trim().is_empty() {
        return Err("Оберіть тип інциденту.".into());
    }
    let occurred_at = draft.occurred_at.trim();
    if !valid_incident_datetime(occurred_at) {
        return Err("Вкажіть коректні дату та час інциденту.".into());
    }
    let mut equipment_ids = draft.equipment_ids.clone();
    if let Some(equipment_id) = draft.equipment_id {
        if !equipment_ids.contains(&equipment_id) {
            equipment_ids.push(equipment_id);
        }
    }
    let db = state.0.lock().map_err(|_| busy())?;
    if draft.incident_type.trim() == "Втрата БпЛА" {
        let source_flight_id = draft
            .source_flight_id
            .ok_or_else(|| "Для втрати БпЛА оберіть запис із журналу польотів.".to_string())?;
        let flight_time = db
            .connection
            .query_row(
                "SELECT flight_date,sky_time FROM flight_journal_entries WHERE id=?1",
                [source_flight_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .map_err(|_| "Обраний запис журналу польотів не знайдено.".to_string())?;
        if !flight_is_within_last_day(
            &flight_time.0,
            &flight_time.1,
            chrono::Local::now().naive_local(),
        ) {
            return Err("Для втрати БпЛА можна обрати лише політ за останні 24 години.".into());
        }
    }
    let (source_crew_snapshot, source_personnel_ids, source_personnel_snapshots) =
        source_flight_personnel_snapshot(&db.connection, draft.source_flight_id);
    let personnel_ids = if draft.personnel_ids.is_empty() && !source_personnel_ids.is_empty() {
        source_personnel_ids
    } else {
        draft.personnel_ids.clone()
    };
    validate_incident_equipment(
        &db.connection,
        draft.crew_id,
        &personnel_ids,
        &equipment_ids,
    )?;
    let (position_name, reconnaissance_area, crew_snapshot) = if let Some(id) = draft.crew_id {
        let info: (String, String) = db
            .connection
            .query_row(
                "SELECT position_name,reconnaissance_area FROM crews WHERE id=?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| "Екіпаж не знайдено.".to_string())?;
        let members = actual_crew_members(&db.connection, id)?
            .into_iter()
            .map(|member| member.full_name)
            .collect::<Vec<_>>()
            .join(", ");
        (
            if draft.position_name.trim().is_empty() {
                info.0
            } else {
                draft.position_name.trim().into()
            },
            if draft.reconnaissance_area.trim().is_empty() {
                info.1
            } else {
                draft.reconnaissance_area.trim().into()
            },
            if source_crew_snapshot.is_empty() {
                members
            } else {
                source_crew_snapshot
            },
        )
    } else {
        (
            draft.position_name.trim().into(),
            draft.reconnaissance_area.trim().into(),
            String::new(),
        )
    };
    let category = if draft.category.trim().is_empty() {
        "Інше"
    } else {
        draft.category.trim()
    };
    let status = if draft.status.trim().is_empty() {
        "Чернетка"
    } else {
        draft.status.trim()
    };
    if status != "Чернетка" {
        return Err("Новий інцидент спочатку зберігається як чернетка.".into());
    }
    let event_data = if draft.event_data.is_null() {
        serde_json::json!({})
    } else {
        draft.event_data.clone()
    };
    let event_data_json = serde_json::to_string(&event_data)
        .map_err(|_| "Не вдалося підготувати дані інциденту.".to_string())?;
    db.connection.execute("INSERT INTO incidents(category,incident_type,status,occurred_at,crew_id,equipment_id,position_name,reconnaissance_area,crew_snapshot,description,immediate_actions,consequences,flight_stage,preliminary_cause,snapshot_source,reported_to,reported_at,source_flight_id,event_data_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)",rusqlite::params![category,draft.incident_type.trim(),status,occurred_at,draft.crew_id,equipment_ids.first(),position_name,reconnaissance_area,crew_snapshot,draft.description.trim(),draft.immediate_actions.trim(),draft.consequences.trim(),draft.flight_stage.trim(),draft.preliminary_cause.trim(),if draft.snapshot_source.trim().is_empty(){"current"}else{draft.snapshot_source.trim()},draft.reported_to.trim(),draft.reported_at.trim(),draft.source_flight_id,event_data_json]).map_err(|_|"Не вдалося зберегти інцидент.".to_string())?;
    let incident_id = db.connection.last_insert_rowid();
    for equipment_id in equipment_ids {
        db.connection
            .execute(
                "INSERT INTO incident_equipment(incident_id,equipment_id) VALUES(?1,?2)",
                rusqlite::params![incident_id, equipment_id],
            )
            .map_err(|_| "Не вдалося зберегти майно інциденту.".to_string())?;
    }
    for (selection_order, personnel_id) in personnel_ids.into_iter().enumerate() {
        let current_snapshot = db.connection.query_row(
            "SELECT trim(surname || ' ' || given_name || ' ' || patronymic),rank,position FROM personnel WHERE id=?1",
            [personnel_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
        ).ok();
        let historical_snapshot = source_personnel_snapshots
            .iter()
            .find(|(id, _, _, _)| *id == personnel_id);
        let (personnel_reference, snapshot) = if let Some(snapshot) = current_snapshot {
            (Some(personnel_id), snapshot)
        } else if let Some((_, full_name, rank, position)) = historical_snapshot {
            (None, (full_name.clone(), rank.clone(), position.clone()))
        } else {
            return Err("Обрану особу не знайдено.".to_string());
        };
        db.connection.execute(
            "INSERT OR IGNORE INTO incident_personnel(incident_id,personnel_id,full_name_snapshot,rank_snapshot,position_snapshot,selection_order) VALUES(?1,?2,?3,?4,?5,?6)",
            rusqlite::params![incident_id,personnel_reference,snapshot.0,snapshot.1,snapshot.2,selection_order as i64],
        ).map_err(|_| "Не вдалося зберегти осіб інциденту.".to_string())?;
    }
    initialize_incident_workflow(&db.connection, incident_id, draft.incident_type.trim())?;
    db.connection.execute(
        "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Створено чернетку',?2)",
        rusqlite::params![incident_id, format!("Тип: {}", draft.incident_type.trim())],
    ).map_err(|_| "Не вдалося записати історію інциденту.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_incident_data(
    state: tauri::State<AppState>,
    incident_id: i64,
    draft: IncidentDataDraft,
) -> Result<(), String> {
    if !draft.event_data.is_object() && !draft.event_data.is_null() {
        return Err("Дані події мають некоректний формат.".into());
    }
    let event_data = if draft.event_data.is_null() {
        serde_json::json!({})
    } else {
        draft.event_data
    };
    let event_data_json = serde_json::to_string(&event_data)
        .map_err(|_| "Не вдалося підготувати дані події.".to_string())?;
    let db = state.0.lock().map_err(|_| busy())?;
    let previous = db.connection.query_row(
        "SELECT description,flight_stage,preliminary_cause,event_data_json FROM incidents WHERE id=?1",
        [incident_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)),
    ).map_err(|_| "Інцидент не знайдено.".to_string())?;
    let next = (
        draft.description.trim().to_string(),
        draft.flight_stage.trim().to_string(),
        draft.preliminary_cause.trim().to_string(),
        event_data_json,
    );
    if previous == next {
        return Ok(());
    }
    db.connection.execute(
        "UPDATE incidents SET description=?1,flight_stage=?2,preliminary_cause=?3,event_data_json=?4 WHERE id=?5",
        rusqlite::params![next.0, next.1, next.2, next.3, incident_id],
    ).map_err(|_| "Не вдалося зберегти дані події.".to_string())?;
    db.connection.execute(
        "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Доповнено дані події','Зміни збережено автоматично.')",
        [incident_id],
    ).map_err(|_| "Не вдалося записати історію інциденту.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_incident_status(
    state: tauri::State<AppState>,
    incident_id: i64,
    status: String,
    reason: String,
) -> Result<(), String> {
    if !INCIDENT_STATUSES.contains(&status.as_str()) {
        return Err("Невідомий стан інциденту.".into());
    }
    if status == "Скасовано" && reason.trim().is_empty() {
        return Err("Для скасування вкажіть причину.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    if status == "Завершено" {
        let pending = db.connection.query_row(
            "SELECT COUNT(*) FROM incident_steps WHERE incident_id=?1 AND is_required=1 AND status NOT IN ('Виконано','Пропущено')",
            [incident_id],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0);
        if pending > 0 {
            return Err(
                "Спочатку завершіть або обґрунтовано пропустіть усі обов’язкові кроки.".into(),
            );
        }
    }
    let previous: String = db
        .connection
        .query_row(
            "SELECT status FROM incidents WHERE id=?1",
            [incident_id],
            |row| row.get(0),
        )
        .map_err(|_| "Інцидент не знайдено.".to_string())?;
    if previous == status {
        return Ok(());
    }
    db.connection
        .execute(
            "UPDATE incidents SET status=?1 WHERE id=?2",
            rusqlite::params![status, incident_id],
        )
        .map_err(|_| "Не вдалося змінити стан інциденту.".to_string())?;
    let details = if reason.trim().is_empty() {
        format!("{} → {}", previous, status)
    } else {
        format!("{} → {}. Причина: {}", previous, status, reason.trim())
    };
    db.connection
        .execute(
            "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Змінено стан',?2)",
            rusqlite::params![incident_id, details],
        )
        .map_err(|_| "Не вдалося записати історію інциденту.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_incident_step(
    state: tauri::State<AppState>,
    incident_id: i64,
    step_id: i64,
    status: String,
    comment: String,
) -> Result<(), String> {
    if !STEP_STATUSES.contains(&status.as_str()) {
        return Err("Невідомий стан кроку.".into());
    }
    if status == "Пропущено" && comment.trim().is_empty() {
        return Err("Для пропуску кроку вкажіть причину.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    let title: String = db
        .connection
        .query_row(
            "SELECT title FROM incident_steps WHERE id=?1 AND incident_id=?2",
            rusqlite::params![step_id, incident_id],
            |row| row.get(0),
        )
        .map_err(|_| "Крок інциденту не знайдено.".to_string())?;
    db.connection.execute(
        "UPDATE incident_steps SET status=?1,comment=?2,completed_at=CASE WHEN ?1 IN ('Виконано','Пропущено') THEN CURRENT_TIMESTAMP ELSE '' END,updated_at=CURRENT_TIMESTAMP WHERE id=?3 AND incident_id=?4",
        rusqlite::params![status, comment.trim(), step_id, incident_id],
    ).map_err(|_| "Не вдалося оновити крок інциденту.".to_string())?;
    db.connection.execute(
        "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Оновлено крок',?2)",
        rusqlite::params![incident_id, format!("{}: {}{}", title, status, if comment.trim().is_empty() { String::new() } else { format!(" — {}", comment.trim()) })],
    ).map_err(|_| "Не вдалося записати історію інциденту.".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_incident_document_status(
    state: tauri::State<AppState>,
    incident_id: i64,
    document_id: i64,
    status: String,
) -> Result<(), String> {
    if !DOCUMENT_STATUSES.contains(&status.as_str()) {
        return Err("Невідомий стан документа.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    let document_type: String = db
        .connection
        .query_row(
            "SELECT document_type FROM incident_documents WHERE id=?1 AND incident_id=?2",
            rusqlite::params![document_id, incident_id],
            |row| row.get(0),
        )
        .map_err(|_| "Документ інциденту не знайдено.".to_string())?;
    db.connection.execute(
        "UPDATE incident_documents SET status=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2 AND incident_id=?3",
        rusqlite::params![status, document_id, incident_id],
    ).map_err(|_| "Не вдалося оновити стан документа.".to_string())?;
    db.connection.execute(
        "INSERT INTO incident_history(incident_id,action,details) VALUES(?1,'Оновлено документ',?2)",
        rusqlite::params![incident_id, format!("{}: {}", document_type, status)],
    ).map_err(|_| "Не вдалося записати історію інциденту.".to_string())?;
    Ok(())
}

#[cfg(test)]
mod incident_tests {
    use super::*;

    #[test]
    fn requires_a_valid_incident_date_and_time() {
        assert!(valid_incident_datetime("2026-09-15T07:05"));
        assert!(!valid_incident_datetime(""));
        assert!(!valid_incident_datetime("2026-09-15"));
        assert!(!valid_incident_datetime("2026-09-15T25:00"));
        assert!(!valid_incident_datetime("15.09.2026T07:05"));
    }

    #[test]
    fn limits_uav_loss_sources_to_the_previous_twenty_four_hours() {
        let now = chrono::NaiveDate::from_ymd_opt(2026, 9, 28)
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap();
        assert!(flight_is_within_last_day("2026-09-27", "12:00", now));
        assert!(flight_is_within_last_day("2026-09-28", "11:59", now));
        assert!(!flight_is_within_last_day("2026-09-27", "11:59", now));
        assert!(!flight_is_within_last_day("2026-09-28", "12:01", now));
        assert!(!flight_is_within_last_day("невірна дата", "12:00", now));
    }

    #[test]
    fn sets_uav_loss_document_deadlines_from_the_incident_time() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO incidents(incident_type,occurred_at) VALUES('Втрата БпЛА','2026-09-28T10:15')",
                [],
            )
            .unwrap();
        let incident_id = connection.last_insert_rowid();

        initialize_incident_workflow(&connection, incident_id, "Втрата БпЛА").unwrap();

        let deadlines = connection
            .prepare("SELECT step_order,due_at FROM incident_steps WHERE incident_id=?1 AND due_at<>'' ORDER BY step_order")
            .unwrap()
            .query_map([incident_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            deadlines,
            vec![
                (2, "2026-09-28T13:15".into()),
                (3, "2026-09-29T10:15".into()),
                (4, "2026-10-01T10:15".into()),
            ]
        );
    }

    #[test]
    fn every_agreed_incident_type_has_an_initial_algorithm_and_documents() {
        for incident_type in [
            "Втрата БпЛА",
            "Втрата майна",
            "Втрата військового квитка/посвідчення УБД",
            "Знищення машини",
            "Пошкодження машини",
            "ДТП",
            "Обстріл",
            "Знищення позиції",
            "Поранення",
            "Загибель",
            "Травма",
            "СЗЧ",
            "Алкогольне/наркотичне сп’яніння",
            "Самогубство",
        ] {
            let template = workflow_template(incident_type);
            assert!(
                !template.steps.is_empty(),
                "empty steps for {incident_type}"
            );
            assert!(
                !template.documents.is_empty(),
                "empty documents for {incident_type}"
            );
        }
    }

    #[test]
    fn backfills_the_initial_asset_loss_workflow_for_an_existing_incident() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE incidents (
                    id INTEGER PRIMARY KEY,
                    incident_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL DEFAULT '',
                    crew_id INTEGER,
                    equipment_id INTEGER,
                    position_name TEXT NOT NULL DEFAULT '',
                    reconnaissance_area TEXT NOT NULL DEFAULT '',
                    crew_snapshot TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                 );
                 INSERT INTO incidents(id,incident_type,occurred_at,description)
                 VALUES(11,'Втрата майна','2026-09-28T10:00','Втрачено майно');",
            )
            .unwrap();

        crate::database::initialise(&connection).unwrap();

        let first_step = connection
            .query_row(
                "SELECT title FROM incident_steps WHERE incident_id=11 ORDER BY step_order LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        let documents = connection
            .query_row(
                "SELECT COUNT(*) FROM incident_documents WHERE incident_id=11",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap();
        assert_eq!(first_step, "Зафіксувати втрату майна");
        assert_eq!(documents, 3);
    }

    #[test]
    fn accepts_multiple_assets_of_the_selected_crew() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(name) VALUES('ГРІМ')", [])
            .unwrap();
        let crew_id = connection.last_insert_rowid();
        for name in ["Mavic", "EcoFlow"] {
            connection
                .execute(
                    "INSERT INTO equipment(category,name,crew_id) VALUES('uav',?1,?2)",
                    rusqlite::params![name, crew_id],
                )
                .unwrap();
        }
        let equipment_ids = connection
            .prepare("SELECT id FROM equipment ORDER BY id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<i64>, _>>()
            .unwrap();
        assert!(
            validate_incident_equipment(&connection, Some(crew_id), &[], &equipment_ids).is_ok()
        );
        assert!(validate_incident_equipment(&connection, None, &[], &equipment_ids).is_err());
    }

    #[test]
    fn keeps_incident_personnel_in_their_selection_order() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE incident_personnel (
                incident_id INTEGER NOT NULL,
                personnel_id INTEGER,
                full_name_snapshot TEXT NOT NULL,
                rank_snapshot TEXT NOT NULL DEFAULT '',
                position_snapshot TEXT NOT NULL DEFAULT '',
                selection_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(incident_id,personnel_id)
             );
             INSERT INTO incident_personnel(incident_id,personnel_id,full_name_snapshot)
             VALUES(7,10,'ДРУГА Особа');
             INSERT INTO incident_personnel(incident_id,personnel_id,full_name_snapshot,selection_order)
             VALUES(7,20,'ПЕРША Особа',0);
             UPDATE incident_personnel SET selection_order=1 WHERE personnel_id=10;",
            )
            .unwrap();

        let (ids, names) = incident_personnel(&connection, 7).unwrap();

        assert_eq!(ids, vec![20, 10]);
        assert_eq!(names, vec!["ПЕРША Особа", "ДРУГА Особа"]);
    }

    #[test]
    fn migrates_existing_incident_personnel_to_an_explicit_order() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE incident_personnel (
                   incident_id INTEGER NOT NULL,
                   personnel_id INTEGER,
                   full_name_snapshot TEXT NOT NULL,
                   rank_snapshot TEXT NOT NULL DEFAULT '',
                   position_snapshot TEXT NOT NULL DEFAULT '',
                   PRIMARY KEY(incident_id,personnel_id)
                 );
                 INSERT INTO incident_personnel(incident_id,personnel_id,full_name_snapshot)
                 VALUES(3,30,'ПЕРША Особа'),(3,10,'ДРУГА Особа');",
            )
            .unwrap();

        crate::database::initialise(&connection).unwrap();
        let (ids, names) = incident_personnel(&connection, 3).unwrap();

        assert_eq!(ids, vec![30, 10]);
        assert_eq!(names, vec!["ПЕРША Особа", "ДРУГА Особа"]);
        let orders = connection
            .prepare(
                "SELECT selection_order FROM incident_personnel WHERE incident_id=3 ORDER BY selection_order",
            )
            .unwrap()
            .query_map([], |row| row.get::<_, i64>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(orders, vec![0, 1]);
    }

    #[test]
    fn reads_historical_personnel_from_the_source_flight_plan() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(4,'ГРІМ')", [])
            .unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json) VALUES(1,'2026-09-12',1,?1)",
            [r#"{"unitName":"РБАК","entries":[{"crewId":4,"startTime":"14:45","actualMemberIds":[41,42],"actualCommanderId":42,"memberSnapshots":[{"personnelId":41,"fullName":"ІВАНЕНКО Іван Іванович","rank":"солдат"},{"personnelId":42,"fullName":"ПЕТРЕНКО Петро Петрович","rank":"сержант"}]}]}"#],
        ).unwrap();
        connection.execute(
            "INSERT INTO flight_journal_entries(id,flight_date,sky_time,crew_id,snapshot_id) VALUES(77,'2026-09-12','14:45',4,1)",
            [],
        ).unwrap();

        let (snapshot, ids, historical) = source_flight_personnel_snapshot(&connection, Some(77));

        assert_eq!(ids, vec![42, 41]);
        assert_eq!(snapshot, "ПЕТРЕНКО Петро Петрович, ІВАНЕНКО Іван Іванович");
        assert_eq!(historical[0].2, "сержант");
    }

    #[test]
    fn prefers_the_frozen_flight_roster_over_a_later_plan_change() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(id,name) VALUES(4,'ГРІМ')", [])
            .unwrap();
        connection.execute(
            "INSERT INTO flight_journal_entries(id,flight_date,sky_time,crew_id,personnel_snapshot_json) VALUES(77,'2026-09-12','14:45',4,?1)",
            [r#"[{"personnelId":42,"fullName":"ПЕТРЕНКО Петро Петрович","rank":"сержант","position":"командир","isCommander":true}]"#],
        ).unwrap();
        connection.execute(
            "INSERT INTO flight_plan_snapshots(id,plan_date,revision,snapshot_json) VALUES(1,'2026-09-12',1,?1)",
            [r#"{"entries":[{"crewId":4,"startTime":"14:45","actualMemberIds":[99],"actualCommanderId":99,"memberSnapshots":[{"personnelId":99,"fullName":"НОВИЙ Склад","rank":"солдат"}]}]}"#],
        ).unwrap();

        let (snapshot, ids, historical) = source_flight_personnel_snapshot(&connection, Some(77));

        assert_eq!(ids, vec![42]);
        assert_eq!(snapshot, "ПЕТРЕНКО Петро Петрович");
        assert_eq!(historical[0].3, "командир");
    }

    #[test]
    fn upgrades_an_existing_uav_loss_without_deleting_its_fact() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE incidents (
                id INTEGER PRIMARY KEY,
                incident_type TEXT NOT NULL,
                occurred_at TEXT NOT NULL DEFAULT '',
                crew_id INTEGER,
                equipment_id INTEGER,
                position_name TEXT NOT NULL DEFAULT '',
                reconnaissance_area TEXT NOT NULL DEFAULT '',
                crew_snapshot TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
             );
             INSERT INTO incidents(id,incident_type,occurred_at,position_name,description)
             VALUES(9,'Втрата БпЛА','2026-09-12T14:45','ПОЗИЦІЯ-1','Історичний опис');",
            )
            .unwrap();

        crate::database::initialise(&connection).unwrap();

        let record = connection.query_row(
            "SELECT status,occurred_at,position_name,description,event_data_json FROM incidents WHERE id=9",
            [],
            |row| Ok((row.get::<_, String>(0)?,row.get::<_, String>(1)?,row.get::<_, String>(2)?,row.get::<_, String>(3)?,row.get::<_, String>(4)?)),
        ).unwrap();
        assert_eq!(
            record,
            (
                "Чернетка".into(),
                "2026-09-12T14:45".into(),
                "ПОЗИЦІЯ-1".into(),
                "Історичний опис".into(),
                "{}".into(),
            )
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM incident_steps WHERE incident_id=9",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            6
        );
        let deadlines = connection
            .prepare("SELECT step_order,due_at FROM incident_steps WHERE incident_id=9 AND due_at<>'' ORDER BY step_order")
            .unwrap()
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(
            deadlines,
            vec![
                (2, "2026-09-12T17:45".into()),
                (3, "2026-09-13T14:45".into()),
                (4, "2026-09-15T14:45".into()),
            ]
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM incident_documents WHERE incident_id=9",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            3
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM incident_history WHERE incident_id=9",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
    }
}
