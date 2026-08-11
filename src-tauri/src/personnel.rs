use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Personnel {
    pub id: i64,
    pub rank: String,
    pub full_name: String,
    pub surname: String,
    pub given_name: String,
    pub patronymic: String,
    pub position: String,
    pub tax_id: String,
    pub birth_date: String,
    pub education_level: String,
    pub education_details: String,
    pub armed_forces_service_start_date: String,
    pub position_assigned_date: String,
    pub position_assignment_order: String,
    pub military_id: String,
    /// Calculated from `vehicles`; it is not persisted in the personnel record.
    pub assigned_vehicle_name: String,
    /// Calculated from `vehicles`; it is not persisted in the personnel record.
    pub assigned_vehicle_registration: String,
    pub gender: String,
    #[serde(default)]
    pub core_fields: HashMap<String, String>,
    #[serde(default)]
    pub custom_fields: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonnelPage {
    pub items: Vec<Personnel>,
    pub total_count: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonnelDraft {
    pub rank: String,
    pub surname: String,
    pub given_name: String,
    pub patronymic: String,
    pub position: String,
    pub tax_id: String,
    pub birth_date: String,
    pub education_level: String,
    pub education_details: String,
    pub armed_forces_service_start_date: String,
    pub position_assigned_date: String,
    pub position_assignment_order: String,
    pub military_id: String,
    pub gender: String,
    #[serde(default)]
    pub core_fields: HashMap<String, String>,
}

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Personnel> {
    let surname: String = row.get(2)?;
    let given_name: String = row.get(3)?;
    let patronymic: String = row.get(4)?;
    Ok(Personnel {
        id: row.get(0)?,
        rank: row.get(1)?,
        full_name: format!("{} {} {}", surname, given_name, patronymic),
        surname,
        given_name,
        patronymic,
        position: row.get(5)?,
        tax_id: row.get(6)?,
        birth_date: row.get(7)?,
        education_level: row.get(8)?,
        education_details: row.get(9)?,
        armed_forces_service_start_date: row.get(10)?,
        position_assigned_date: row.get(11)?,
        position_assignment_order: row.get(12)?,
        military_id: row.get(13)?,
        assigned_vehicle_name: String::new(),
        assigned_vehicle_registration: String::new(),
        gender: row.get(14)?,
        core_fields: HashMap::new(),
        custom_fields: HashMap::new(),
    })
}

fn enrich_extra_fields(connection: &Connection, people: &mut [Personnel]) -> Result<(), String> {
    for person in people.iter_mut() {
        let mut statement = connection
            .prepare(
                "SELECT name, registration_number FROM vehicles WHERE personnel_id=?1 ORDER BY id",
            )
            .map_err(|_| "Не вдалося прочитати прив’язані автомобілі.".to_string())?;
        let linked = statement
            .query_map([person.id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| "Не вдалося прочитати прив’язані автомобілі.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати прив’язані автомобілі.".to_string())?;
        person.assigned_vehicle_name = linked
            .iter()
            .map(|(name, _)| name.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        person.assigned_vehicle_registration = linked
            .iter()
            .map(|(_, number)| number.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        for (key, _) in crate::database::STANDARD_EXTRA_FIELDS {
            let value = connection
                .query_row(
                    &format!("SELECT {key} FROM personnel WHERE id = ?1"),
                    [person.id],
                    |row| row.get::<_, String>(0),
                )
                .unwrap_or_default();
            let value = if *key == "full_name" {
                person.full_name.clone()
            } else {
                value
            };
            person.core_fields.insert((*key).into(), value);
        }
        let mut statement = connection.prepare("SELECT d.display_name, v.field_value FROM personnel_custom_fields v JOIN custom_field_definitions d ON d.field_key = v.field_key WHERE v.personnel_id = ?1 ORDER BY d.display_name COLLATE NOCASE").map_err(|_| "Не вдалося прочитати кастомні поля.".to_string())?;
        let rows = statement
            .query_map([person.id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| "Не вдалося прочитати кастомні поля.".to_string())?;
        for row in rows {
            let (name, value) =
                row.map_err(|_| "Не вдалося прочитати кастомне поле.".to_string())?;
            person.custom_fields.insert(name, value);
        }
    }
    Ok(())
}

pub fn list(connection: &Connection) -> Result<Vec<Personnel>, String> {
    let mut statement = connection.prepare("SELECT id, rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id, gender FROM personnel ORDER BY id ASC")
        .map_err(|_| "Не вдалося відкрити особовий склад. Спробуйте перезапустити програму.".to_string())?;
    let rows = statement
        .query_map([], map_row)
        .map_err(|_| "Не вдалося прочитати особовий склад.".to_string())?;
    let mut people = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати один із записів особового складу.".to_string())?;
    enrich_extra_fields(connection, &mut people)?;
    Ok(people)
}

pub fn list_page(
    connection: &Connection,
    offset: u32,
    limit: u32,
) -> Result<PersonnelPage, String> {
    let total_count = connection
        .query_row("SELECT COUNT(*) FROM personnel", [], |row| {
            row.get::<_, u64>(0)
        })
        .map_err(|_| "Не вдалося визначити кількість записів особового складу.".to_string())?;
    let safe_limit = i64::from(limit.clamp(1, 100));
    let safe_offset = i64::from(offset);
    let mut statement = connection.prepare("SELECT id, rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id, gender FROM personnel ORDER BY id ASC LIMIT ?1 OFFSET ?2")
        .map_err(|_| "Не вдалося відкрити особовий склад. Спробуйте перезапустити програму.".to_string())?;
    let items = statement
        .query_map(params![safe_limit, safe_offset], map_row)
        .map_err(|_| "Не вдалося прочитати особовий склад.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати один із записів особового складу.".to_string())?;
    let mut items = items;
    enrich_extra_fields(connection, &mut items)?;
    Ok(PersonnelPage { items, total_count })
}

pub fn create(connection: &Connection, draft: PersonnelDraft) -> Result<Personnel, String> {
    validate(&draft)?;
    connection.execute("INSERT INTO personnel (rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id, gender) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)", params![draft.rank, draft.surname, draft.given_name, draft.patronymic, draft.position, draft.tax_id, draft.birth_date, draft.education_level, draft.education_details, draft.armed_forces_service_start_date, draft.position_assigned_date, draft.position_assignment_order, draft.military_id, draft.gender])
        .map_err(|_| "Не вдалося зберегти військовослужбовця. Перевірте унікальність ІПН.".to_string())?;
    let id = connection.last_insert_rowid();
    sync_vehicle(connection, id, &draft)?;
    save_core_fields(connection, id, &draft.core_fields)?;
    let definitions = connection
        .prepare("SELECT field_key, initial_value FROM custom_field_definitions")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        });
    if let Ok(definitions) = definitions {
        for (key, value) in definitions {
            connection.execute("INSERT INTO personnel_custom_fields (personnel_id, field_key, field_value) VALUES (?1, ?2, ?3)", params![id, key, value]).map_err(|_| "Не вдалося встановити початкові значення додаткових полів.".to_string())?;
        }
    }
    let mut person = find(connection, id)?;
    enrich_extra_fields(connection, std::slice::from_mut(&mut person))?;
    Ok(person)
}

pub fn update(
    connection: &Connection,
    id: i64,
    draft: PersonnelDraft,
) -> Result<Personnel, String> {
    validate(&draft)?;
    let updated = connection.execute("UPDATE personnel SET rank=?1, surname=?2, given_name=?3, patronymic=?4, position=?5, tax_id=?6, birth_date=?7, education_level=?8, education_details=?9, armed_forces_service_start_date=?10, position_assigned_date=?11, position_assignment_order=?12, military_id=?13, gender=?14, updated_at=CURRENT_TIMESTAMP WHERE id=?15", params![draft.rank, draft.surname, draft.given_name, draft.patronymic, draft.position, draft.tax_id, draft.birth_date, draft.education_level, draft.education_details, draft.armed_forces_service_start_date, draft.position_assigned_date, draft.position_assignment_order, draft.military_id, draft.gender, id])
        .map_err(|_| "Не вдалося оновити військовослужбовця.".to_string())?;
    if updated == 0 {
        return Err(
            "Військовослужбовця не знайдено. Оновіть список і спробуйте знову.".to_string(),
        );
    }
    sync_vehicle(connection, id, &draft)?;
    save_core_fields(connection, id, &draft.core_fields)?;
    let mut person = find(connection, id)?;
    enrich_extra_fields(connection, std::slice::from_mut(&mut person))?;
    Ok(person)
}

fn sync_vehicle(
    connection: &Connection,
    personnel_id: i64,
    draft: &PersonnelDraft,
) -> Result<(), String> {
    if !draft.position.to_lowercase().contains("водій") {
        connection
            .execute(
                "UPDATE vehicles SET personnel_id=NULL WHERE personnel_id=?1",
                [personnel_id],
            )
            .map_err(|_| "Не вдалося відкріпити автомобіль.".to_string())?;
        return Ok(());
    }
    Ok(())
}

pub fn delete(connection: &Connection, id: i64) -> Result<(), String> {
    let deleted = connection
        .execute("DELETE FROM personnel WHERE id=?1", [id])
        .map_err(|_| "Не вдалося видалити військовослужбовця.".to_string())?;
    if deleted == 0 {
        return Err(
            "Військовослужбовця не знайдено. Оновіть список і спробуйте знову.".to_string(),
        );
    }
    Ok(())
}

fn find(connection: &Connection, id: i64) -> Result<Personnel, String> {
    connection.query_row("SELECT id, rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id, gender FROM personnel WHERE id=?1", [id], map_row)
        .map_err(|_| "Не вдалося знайти збережений запис.".to_string())
}

/// Writes only the fixed, migrated personnel columns. Arbitrary client keys are never interpolated.
fn save_core_fields(
    connection: &Connection,
    id: i64,
    values: &HashMap<String, String>,
) -> Result<(), String> {
    for (key, _) in crate::database::STANDARD_EXTRA_FIELDS {
        if *key == "full_name" {
            continue;
        }
        let value = values.get(*key).cloned().unwrap_or_default();
        connection
            .execute(
                &format!(
                    "UPDATE personnel SET {key} = ?1, updated_at=CURRENT_TIMESTAMP WHERE id = ?2"
                ),
                params![value, id],
            )
            .map_err(|_| format!("Не вдалося зберегти основне поле «{key}»."))?;
    }
    Ok(())
}

pub(crate) fn validate(draft: &PersonnelDraft) -> Result<(), String> {
    if [
        draft.rank.as_str(),
        draft.surname.as_str(),
        draft.given_name.as_str(),
        draft.position.as_str(),
    ]
    .iter()
    .any(|value| value.trim().is_empty())
    {
        return Err("Заповніть звання, прізвище, ім'я та посаду.".to_string());
    }
    if draft.tax_id.len() != 10
        || !draft
            .tax_id
            .chars()
            .all(|character| character.is_ascii_digit())
    {
        return Err("ІПН має містити рівно 10 цифр.".to_string());
    }
    if !["", "чоловіча", "жіноча"].contains(&draft.gender.as_str()) {
        return Err("Оберіть чоловічу або жіночу стать.".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;

    fn valid_draft() -> PersonnelDraft {
        PersonnelDraft {
            rank: "Солдат".into(),
            surname: "ТЕСТ".into(),
            given_name: "Іван".into(),
            patronymic: "Іванович".into(),
            position: "Стрілець, в/ч А0000".into(),
            tax_id: "7462389899".into(),
            birth_date: "01.01.2000 року".into(),
            education_level: "вища".into(),
            education_details: "Університет".into(),
            armed_forces_service_start_date: "із 01.01.2022 року".into(),
            position_assigned_date: "01.01.2023 року".into(),
            position_assignment_order: "№1".into(),
            military_id: "АВ №000001".into(),

            gender: "чоловіча".into(),
            core_fields: HashMap::new(),
        }
    }

    #[test]
    fn saves_reads_updates_and_deletes_valid_personnel() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let saved = create(&connection, valid_draft()).unwrap();
        assert_eq!(saved.full_name, "ТЕСТ Іван Іванович");
        let mut changed = valid_draft();
        changed.position = "Командир відділення, в/ч А0000".into();
        changed
            .core_fields
            .insert("passport_series".into(), "МС".into());
        let updated = update(&connection, saved.id, changed).unwrap();
        assert_eq!(updated.position, "Командир відділення, в/ч А0000");
        assert_eq!(updated.core_fields["passport_series"], "МС");
        delete(&connection, saved.id).unwrap();
        assert!(list(&connection).unwrap().is_empty());
    }

    #[test]
    fn rejects_invalid_tax_id() {
        let mut draft = valid_draft();
        draft.tax_id = "123".into();
        assert_eq!(
            validate(&draft).unwrap_err(),
            "ІПН має містити рівно 10 цифр."
        );
    }

    #[test]
    fn lists_personnel_by_ascending_id() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let mut first = valid_draft();
        first.surname = "ЯКОВЕНКО".into();
        create(&connection, first).unwrap();
        let mut second = valid_draft();
        second.surname = "АБРАМЕНКО".into();
        second.tax_id = "7462389898".into();
        create(&connection, second).unwrap();
        assert_eq!(
            list(&connection)
                .unwrap()
                .iter()
                .map(|person| person.id)
                .collect::<Vec<_>>(),
            vec![1, 2]
        );
    }

    #[test]
    fn keeps_multiple_vehicles_as_a_database_relation_and_unassigns_them_when_driver_role_changes()
    {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let mut draft = valid_draft();
        draft.position = "Водій".into();
        let driver = create(&connection, draft).unwrap();
        connection.execute("INSERT INTO vehicles(name, registration_number, status, personnel_id) VALUES ('Toyota Hilux', 'АА 1111 АА', 'Справний', ?1), ('Ford Ranger', 'АА 2222 АА', 'Справний', ?1)", [driver.id]).unwrap();

        let listed = list(&connection).unwrap();
        assert_eq!(listed[0].assigned_vehicle_name, "Toyota Hilux, Ford Ranger");
        assert_eq!(
            listed[0].assigned_vehicle_registration,
            "АА 1111 АА, АА 2222 АА"
        );

        let mut changed = valid_draft();
        changed.position = "Стрілець".into();
        update(&connection, driver.id, changed).unwrap();
        let linked: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM vehicles WHERE personnel_id IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(linked, 0);
    }

    #[test]
    fn deleting_a_driver_unassigns_vehicles_via_foreign_key() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        let mut draft = valid_draft();
        draft.position = "Водій".into();
        let driver = create(&connection, draft).unwrap();
        connection.execute("INSERT INTO vehicles(name, registration_number, status, personnel_id) VALUES ('Toyota Hilux', 'АА 1111 АА', 'Справний', ?1)", [driver.id]).unwrap();
        delete(&connection, driver.id).unwrap();
        let assigned: Option<i64> = connection
            .query_row(
                "SELECT personnel_id FROM vehicles WHERE registration_number='АА 1111 АА'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(assigned, None);
    }

    #[test]
    fn reads_personnel_in_fixed_pages() {
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        for index in 0..25 {
            let mut draft = valid_draft();
            draft.tax_id = format!("7462389{index:03}");
            create(&connection, draft).unwrap();
        }
        let first_page = list_page(&connection, 0, 20).unwrap();
        let second_page = list_page(&connection, 20, 20).unwrap();
        assert_eq!(first_page.total_count, 25);
        assert_eq!(first_page.items.len(), 20);
        assert_eq!(second_page.items.len(), 5);
        assert_eq!(second_page.items.first().unwrap().id, 21);
    }
}
