use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFieldDefinition {
    pub field_key: String,
    pub display_name: String,
    pub description: String,
    pub initial_value: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CustomFieldsFile {
    version: u8,
    fields: Vec<CustomFieldDefinition>,
}

pub fn load_custom_fields_file(root: &Path, file_name: &str) -> Result<Vec<CustomFieldDefinition>, String> {
    let path = root.join(file_name);
    if !path.exists() { return Err("Файл кастомних змінних ще не створено.".into()); }
    let text = fs::read_to_string(path).map_err(|_| "Не вдалося прочитати файл кастомних змінних.".to_string())?;
    let file: CustomFieldsFile = serde_json::from_str(&text).map_err(|_| "Файл кастомних змінних має пошкоджений формат JSON.".to_string())?;
    Ok(file.fields)
}

pub fn save_custom_field_file(root: &Path, file_name: &str, field: &CustomFieldDefinition) -> Result<(), String> {
    let path = root.join(file_name);
    let mut fields = if path.exists() { load_custom_fields_file(root, file_name)? } else { Vec::new() };
    if let Some(existing) = fields.iter_mut().find(|item| item.field_key == field.field_key) { *existing = field.clone(); } else { fields.push(field.clone()); }
    fields.sort_by(|left, right| left.display_name.to_lowercase().cmp(&right.display_name.to_lowercase()));
    let text = serde_json::to_string_pretty(&CustomFieldsFile { version: 1, fields }).map_err(|_| "Не вдалося сформувати JSON кастомних змінних.".to_string())?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, format!("{text}\n")).map_err(|_| "Не вдалося записати файл кастомних змінних біля програми.".to_string())?;
    fs::rename(temp, path).map_err(|_| "Не вдалося завершити запис кастомних змінних.".to_string())
}

pub fn remove_custom_field_file(root: &Path, file_name: &str, field_key: &str) -> Result<(), String> {
    let path = root.join(file_name);
    if !path.exists() { return Ok(()); }
    let mut fields = load_custom_fields_file(root, file_name)?;
    fields.retain(|field| field.field_key != field_key);
    let text = serde_json::to_string_pretty(&CustomFieldsFile { version: 1, fields }).map_err(|_| "Не вдалося сформувати JSON кастомних змінних.".to_string())?;
    fs::write(&path, format!("{text}\n")).map_err(|_| "Не вдалося оновити файл кастомних змінних.".to_string())
}

pub fn sync_custom_fields_file(connection: &Connection, root: &Path, file_name: &str) -> Result<(), String> {
    let fields = match load_custom_fields_file(root, file_name) { Ok(fields) => fields, Err(_) => return Ok(()) };
    for field in fields {
        connection.execute("INSERT OR IGNORE INTO custom_field_definitions (field_key, display_name, description, initial_value) VALUES (?1, ?2, ?3, ?4)", params![field.field_key, field.display_name, field.description, field.initial_value])
            .map_err(|_| "Не вдалося синхронізувати кастомні змінні з базою даних.".to_string())?;
        connection.execute("INSERT OR IGNORE INTO personnel_custom_fields (personnel_id, field_key, field_value) SELECT id, ?1, ?2 FROM personnel", params![field.field_key, field.initial_value])
            .map_err(|_| "Не вдалося встановити значення кастомних змінних.".to_string())?;
    }
    Ok(())
}

pub fn initialise(connection: &Connection) -> Result<(), String> {
    connection.execute_batch("PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS personnel (id INTEGER PRIMARY KEY, rank TEXT NOT NULL, surname TEXT NOT NULL, given_name TEXT NOT NULL, patronymic TEXT NOT NULL DEFAULT '', position TEXT NOT NULL, tax_id TEXT NOT NULL UNIQUE CHECK(length(tax_id) = 10), birth_date TEXT NOT NULL, education_level TEXT NOT NULL, education_details TEXT NOT NULL, armed_forces_service_start_date TEXT NOT NULL, position_assigned_date TEXT NOT NULL, position_assignment_order TEXT NOT NULL, military_id TEXT NOT NULL, assigned_vehicle_name TEXT NOT NULL, assigned_vehicle_registration TEXT NOT NULL, gender TEXT NOT NULL DEFAULT '' CHECK(gender IN ('', 'чоловіча', 'жіноча')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS personnel_custom_fields (personnel_id INTEGER NOT NULL, field_key TEXT NOT NULL, field_value TEXT NOT NULL, PRIMARY KEY(personnel_id, field_key), FOREIGN KEY(personnel_id) REFERENCES personnel(id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS custom_field_definitions (field_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT NOT NULL, initial_value TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);")
        .map_err(|_| "Не вдалося підготувати базу даних.".to_string())?;
    let has_gender = connection
        .prepare("PRAGMA table_info(personnel)")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, String>(1))
                .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        })
        .map(|columns| columns.iter().any(|column| column == "gender"))
        .unwrap_or(false);
    if !has_gender {
        connection
            .execute(
                "ALTER TABLE personnel ADD COLUMN gender TEXT NOT NULL DEFAULT ''",
                [],
            )
            .map_err(|_| "Не вдалося додати стать до бази даних.".to_string())?;
    }
    connection
        .pragma_update(None, "user_version", 2)
        .map_err(|_| "Не вдалося завершити міграцію бази даних.".to_string())?;
    Ok(())
}

pub fn list_custom_fields(connection: &Connection) -> Result<Vec<CustomFieldDefinition>, String> {
    let mut statement = connection.prepare("SELECT field_key, display_name, description, initial_value FROM custom_field_definitions ORDER BY display_name COLLATE NOCASE").map_err(|_| "Не вдалося відкрити список додаткових полів.".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(CustomFieldDefinition {
                field_key: row.get(0)?,
                display_name: row.get(1)?,
                description: row.get(2)?,
                initial_value: row.get(3)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати додаткові поля.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати додаткове поле.".to_string())?;
    Ok(rows)
}

pub fn create_custom_field(
    connection: &Connection,
    field: CustomFieldDefinition,
) -> Result<CustomFieldDefinition, String> {
    let key = field.field_key.trim();
    if key.is_empty()
        || !key
            .chars()
            .all(|c| c == '_' || c.is_ascii_lowercase() || c.is_ascii_digit())
        || key.starts_with('_')
        || key.chars().next().is_some_and(|c| c.is_ascii_digit())
    {
        return Err("Назва поля має починатися з малої латинської літери та містити лише малі латинські літери, цифри й підкреслення.".into());
    }
    if field.display_name.trim().is_empty() {
        return Err("Вкажіть українську назву поля.".into());
    }
    connection.execute("INSERT INTO custom_field_definitions (field_key, display_name, description, initial_value) VALUES (?1, ?2, ?3, ?4)", params![key, field.display_name.trim(), field.description.trim(), field.initial_value]).map_err(|_| "Поле з таким ключем уже існує або не може бути збережене.".to_string())?;
    let ids = connection
        .prepare("SELECT id FROM personnel")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, i64>(0))
                .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        })
        .map_err(|_| "Не вдалося прочитати особовий склад.".to_string())?;
    for id in ids {
        connection.execute("INSERT INTO personnel_custom_fields (personnel_id, field_key, field_value) VALUES (?1, ?2, ?3)", params![id, key, field.initial_value]).map_err(|_| "Не вдалося встановити початкове значення додаткового поля.".to_string())?;
    }
    Ok(CustomFieldDefinition {
        field_key: key.into(),
        display_name: field.display_name.trim().into(),
        description: field.description.trim().into(),
        initial_value: field.initial_value,
    })
}

pub fn update_custom_field(connection: &Connection, field: CustomFieldDefinition) -> Result<CustomFieldDefinition, String> {
    let key = field.field_key.trim();
    if key.is_empty() || !key.chars().all(|c| c == '_' || c.is_ascii_lowercase() || c.is_ascii_digit()) || key.starts_with('_') || key.chars().next().is_some_and(|c| c.is_ascii_digit()) { return Err("Назва поля має починатися з малої латинської літери та містити лише малі латинські літери, цифри й підкреслення.".into()); }
    if field.display_name.trim().is_empty() { return Err("Вкажіть українську назву поля.".into()); }
    let changed = connection.execute("UPDATE custom_field_definitions SET display_name = ?1, description = ?2, initial_value = ?3 WHERE field_key = ?4", params![field.display_name.trim(), field.description.trim(), field.initial_value, key]).map_err(|_| "Не вдалося оновити поле БД.".to_string())?;
    if changed == 0 { return Err("Поле БД не знайдено.".into()); }
    Ok(CustomFieldDefinition { field_key: key.into(), display_name: field.display_name.trim().into(), description: field.description.trim().into(), initial_value: field.initial_value })
}

pub fn delete_custom_field(connection: &Connection, field_key: &str) -> Result<(), String> {
    let tx = connection.unchecked_transaction().map_err(|_| "Не вдалося змінити поле БД.".to_string())?;
    tx.execute("DELETE FROM personnel_custom_fields WHERE field_key = ?1", [field_key]).map_err(|_| "Не вдалося видалити значення поля.".to_string())?;
    let changed = tx.execute("DELETE FROM custom_field_definitions WHERE field_key = ?1", [field_key]).map_err(|_| "Не вдалося видалити поле БД.".to_string())?;
    if changed == 0 { return Err("Поле БД не знайдено.".into()); }
    tx.commit().map_err(|_| "Не вдалося завершити видалення поля БД.".to_string())
}

#[cfg(test)]
pub fn seed_test_personnel(connection: &Connection) -> Result<(), String> {
    use rusqlite::params;
    let records = [
        (
            "Солдат",
            "ВАСИЛЬОК",
            "Іван",
            "Аркадійович",
            "Стрілець, військова частина А0000",
            "7462389812",
            "02.03.1999 року",
            "вища",
            "Львівська комерційна академія у 2002р",
            "у ЗС — із 27.02.2022 року",
            "02.08.2026 року",
            "КВ ОК «Пуп» №000-ПС",
            "АВ №077672",
            "Great Wall",
            "АВ 7265",
        ),
        (
            "Старший солдат",
            "ПЕТРЕНКО",
            "Петро",
            "Петрович",
            "Оператор БпЛА, військова частина А0000",
            "7462389813",
            "14.05.1998 року",
            "середня спеціальна",
            "Львівський фаховий коледж у 2018р",
            "у ЗС — із 24.02.2022 року",
            "10.03.2023 року",
            "КВ ОК «Пуп» №018-ПС",
            "АВ №077673",
            "Mitsubishi L200",
            "АВ 7266",
        ),
        (
            "Сержант",
            "СИДОРЕНКО",
            "Сидір",
            "Сидорович",
            "Командир відділення, військова частина А0000",
            "7462389814",
            "21.11.1995 року",
            "вища",
            "Національний університет у 2017р",
            "у ЗС — із 01.09.2018 року",
            "12.06.2024 року",
            "КВ ОК «Пуп» №044-ПС",
            "АВ №077674",
            "Great Wall",
            "АВ 7267",
        ),
        (
            "Молодший сержант",
            "КОВАЛЕНКО",
            "Дмитро",
            "Сергійович",
            "Стрілець, військова частина А0000",
            "7462389815",
            "08.08.1997 року",
            "вища",
            "Київський університет у 2019р",
            "у ЗС — із 03.03.2022 року",
            "17.08.2024 року",
            "КВ ОК «Пуп» №053-ПС",
            "АВ №077675",
            "Great Wall",
            "АВ 7268",
        ),
        (
            "Солдат",
            "БОНДАРЕНКО",
            "Андрій",
            "Олексійович",
            "Помічник оператора, військова частина А0000",
            "7462389816",
            "12.02.2000 року",
            "середня",
            "Ліцей №5 у 2017р",
            "у ЗС — із 26.02.2022 року",
            "20.03.2023 року",
            "КВ ОК «Пуп» №024-ПС",
            "АВ №077676",
            "Mitsubishi L200",
            "АВ 7269",
        ),
        (
            "Старший солдат",
            "ТКАЧЕНКО",
            "Олексій",
            "Миколайович",
            "Механік-водій, військова частина А0000",
            "7462389817",
            "05.09.1994 року",
            "середня спеціальна",
            "Автотранспортний коледж у 2014р",
            "у ЗС — із 15.04.2016 року",
            "11.01.2023 року",
            "КВ ОК «Пуп» №012-ПС",
            "АВ №077677",
            "HMMWV",
            "АВ 7270",
        ),
        (
            "Сержант",
            "ШЕВЧЕНКО",
            "Тарас",
            "Григорович",
            "Командир відділення, військова частина А0000",
            "7462389818",
            "17.07.1992 року",
            "вища",
            "Національна академія у 2015р",
            "у ЗС — із 11.10.2014 року",
            "01.03.2024 року",
            "КВ ОК «Пуп» №035-ПС",
            "АВ №077678",
            "Great Wall",
            "АВ 7271",
        ),
        (
            "Солдат",
            "МЕЛЬНИК",
            "Віталій",
            "Васильович",
            "Стрілець, військова частина А0000",
            "7462389819",
            "27.12.1999 року",
            "вища",
            "Тернопільський університет у 2021р",
            "у ЗС — із 28.02.2022 року",
            "14.07.2023 року",
            "КВ ОК «Пуп» №032-ПС",
            "АВ №077679",
            "Mitsubishi L200",
            "АВ 7272",
        ),
        (
            "Солдат",
            "ГНАТЮК",
            "Роман",
            "Ігорович",
            "Стрілець, військова частина А0000",
            "7462389820",
            "19.04.1998 року",
            "середня спеціальна",
            "Фаховий коледж у 2018р",
            "у ЗС — із 25.02.2022 року",
            "08.09.2023 року",
            "КВ ОК «Пуп» №041-ПС",
            "АВ №077680",
            "Great Wall",
            "АВ 7273",
        ),
        (
            "Молодший сержант",
            "КРАВЧУК",
            "Олег",
            "Петрович",
            "Оператор БпЛА, військова частина А0000",
            "7462389821",
            "22.06.1996 року",
            "вища",
            "Львівська політехніка у 2018р",
            "у ЗС — із 12.03.2022 року",
            "21.11.2024 року",
            "КВ ОК «Пуп» №061-ПС",
            "АВ №077681",
            "HMMWV",
            "АВ 7274",
        ),
        (
            "Солдат",
            "ЛИСЕНКО",
            "Максим",
            "Олегович",
            "Стрілець, військова частина А0000",
            "7462389822",
            "03.01.2001 року",
            "середня",
            "Ліцей №2 у 2018р",
            "у ЗС — із 05.03.2022 року",
            "05.05.2024 року",
            "КВ ОК «Пуп» №048-ПС",
            "АВ №077682",
            "Great Wall",
            "АВ 7275",
        ),
        (
            "Старший солдат",
            "РИБАК",
            "Богдан",
            "Васильович",
            "Водій, військова частина А0000",
            "7462389823",
            "28.10.1993 року",
            "середня спеціальна",
            "Технічний коледж у 2013р",
            "у ЗС — із 03.05.2015 року",
            "28.02.2023 року",
            "КВ ОК «Пуп» №017-ПС",
            "АВ №077683",
            "Mitsubishi L200",
            "АВ 7276",
        ),
        (
            "Сержант",
            "ПОЛІЩУК",
            "Владислав",
            "Романович",
            "Командир екіпажу, військова частина А0000",
            "7462389824",
            "09.03.1991 року",
            "вища",
            "Військовий інститут у 2013р",
            "у ЗС — із 19.08.2013 року",
            "04.04.2024 року",
            "КВ ОК «Пуп» №039-ПС",
            "АВ №077684",
            "HMMWV",
            "АВ 7277",
        ),
        (
            "Солдат",
            "САВЧУК",
            "Михайло",
            "Ілліч",
            "Оператор БпЛА, військова частина А0000",
            "7462389825",
            "24.05.2000 року",
            "вища",
            "Харківський університет у 2022р",
            "у ЗС — із 02.03.2022 року",
            "19.01.2025 року",
            "КВ ОК «Пуп» №070-ПС",
            "АВ №077685",
            "Great Wall",
            "АВ 7278",
        ),
        (
            "Старший солдат",
            "ДУБИНА",
            "Артем",
            "Євгенович",
            "Механік-водій, військова частина А0000",
            "7462389826",
            "16.08.1995 року",
            "середня спеціальна",
            "Автомеханічний коледж у 2015р",
            "у ЗС — із 01.06.2017 року",
            "02.02.2024 року",
            "КВ ОК «Пуп» №046-ПС",
            "АВ №077686",
            "Mitsubishi L200",
            "АВ 7279",
        ),
    ];
    for record in records {
        connection.execute("INSERT OR IGNORE INTO personnel (rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id, assigned_vehicle_name, assigned_vehicle_registration) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)", params![record.0, record.1, record.2, record.3, record.4, record.5, record.6, record.7, record.8, record.9, record.10, record.11, record.12, record.13, record.14]).map_err(|_| "Не вдалося створити початкові дані.".to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn creates_an_empty_schema_without_demo_records() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM personnel", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_fixtures_are_opt_in() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        seed_test_personnel(&connection).unwrap();
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM personnel", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 15);
    }

    #[test]
    fn migrates_v1_personnel_with_an_empty_gender() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE personnel (id INTEGER PRIMARY KEY, rank TEXT NOT NULL, surname TEXT NOT NULL, given_name TEXT NOT NULL, patronymic TEXT NOT NULL DEFAULT '', position TEXT NOT NULL, tax_id TEXT NOT NULL UNIQUE, birth_date TEXT NOT NULL, education_level TEXT NOT NULL, education_details TEXT NOT NULL, armed_forces_service_start_date TEXT NOT NULL, position_assigned_date TEXT NOT NULL, position_assignment_order TEXT NOT NULL, military_id TEXT NOT NULL, assigned_vehicle_name TEXT NOT NULL, assigned_vehicle_registration TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);").unwrap();
        initialise(&connection).unwrap();
        let gender: String = connection
            .query_row("SELECT gender FROM personnel LIMIT 1", [], |row| row.get(0))
            .unwrap_or_default();
        assert_eq!(gender, "");
        assert_eq!(
            connection
                .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            2
        );
    }

    #[test]
    fn custom_field_is_seeded_for_existing_personnel() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        seed_test_personnel(&connection).unwrap();
        create_custom_field(&connection, CustomFieldDefinition { field_key: "custom_unit_code".into(), display_name: "Код підрозділу".into(), description: "Внутрішній код".into(), initial_value: "А0000".into() }).unwrap();
        let count: i64 = connection.query_row("SELECT COUNT(*) FROM personnel_custom_fields WHERE field_key='custom_unit_code' AND field_value='А0000'", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 15);
    }

    #[test]
    fn custom_field_can_be_updated_and_deleted() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        create_custom_field(&connection, CustomFieldDefinition { field_key: "unit_name".into(), display_name: "Підрозділ".into(), description: "Назва".into(), initial_value: "А0000".into() }).unwrap();
        let updated = update_custom_field(&connection, CustomFieldDefinition { field_key: "unit_name".into(), display_name: "Назва підрозділу".into(), description: "Оновлено".into(), initial_value: "Б0000".into() }).unwrap();
        assert_eq!(updated.display_name, "Назва підрозділу");
        delete_custom_field(&connection, "unit_name").unwrap();
        assert_eq!(list_custom_fields(&connection).unwrap().len(), 0);
    }

    #[test]
    fn custom_field_key_does_not_require_a_prefix() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        assert!(create_custom_field(&connection, CustomFieldDefinition { field_key: "unit_name".into(), display_name: "Підрозділ".into(), description: "".into(), initial_value: "".into() }).is_ok());
    }
}
