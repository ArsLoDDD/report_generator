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
    #[serde(default = "personnel_scope")]
    pub scope: String,
}
fn personnel_scope() -> String {
    "personnel".into()
}

pub const STANDARD_EXTRA_FIELDS: &[(&str, &str)] = &[
    ("full_name", "ПІБ (повністю)"),
    ("passport_series", "Серія паспорту"),
    ("passport_number", "Номер паспорту"),
    ("passport_issued_by", "Ким виданий"),
    ("passport_issue_date", "Дата видачі"),
    ("foreign_passport", "Закордонний паспорт"),
    (
        "foreign_passport_issued_by",
        "Закордонний паспорт: Ким виданий",
    ),
    (
        "foreign_passport_issue_date",
        "Закордонний паспорт: Дата видачі",
    ),
    ("foreign_passport_series", "Закордонний паспорт: Серія"),
    ("foreign_passport_number", "Закордонний паспорт: Номер"),
    (
        "military_document_issued_by",
        "Військовий документ: Ким виданий",
    ),
    (
        "military_document_issue_date",
        "Військовий документ: Дата видачі",
    ),
    ("combatant_certificate", "Посвідчення УБД"),
    (
        "combatant_certificate_issued_by",
        "Посвідчення УБД: Ким видане",
    ),
    (
        "combatant_certificate_issue_date",
        "Посвідчення УБД: Дата видачі",
    ),
    ("combatant_certificate_series", "Посвідчення УБД: Серія"),
    ("combatant_certificate_number", "Посвідчення УБД: Номер"),
    ("driver_license", "Посвідчення водія"),
    (
        "driver_license_issued_by",
        "Посвідчення водія: Орган що видав",
    ),
    ("driver_license_categories", "Посвідчення водія: Категорії"),
    ("driver_license_valid_until", "Посвідчення водія: Дійсне до"),
    (
        "driver_license_issue_date",
        "Посвідчення водія: Дата видачі",
    ),
    ("driver_license_series", "Посвідчення водія: Серія"),
    ("driver_license_number", "Посвідчення водія: Номер"),
    ("basic_military_training", "БЗВП"),
    ("basic_training_start_date", "БЗВП: Дата початку"),
    ("basic_training_end_date", "БЗВП: Дата закінчення"),
    ("basic_training_location", "БЗВП: Місце проходження"),
    ("phone", "Номер телефону"),
    ("email", "Email"),
    ("marital_status", "Сімейний стан"),
    ("blood_type", "Група крові"),
    ("military_fitness", "Придатність до військової служби"),
    ("oath_date", "Дата прийняття присяги"),
    ("service_type", "Вид служби"),
    ("service_start_date", "Дата призову / Укладання контракту"),
    ("conscription_institution", "Установа призову"),
];

#[derive(Debug, Serialize, Deserialize)]
struct CustomFieldsFile {
    version: u8,
    fields: Vec<CustomFieldDefinition>,
}

pub fn load_custom_fields_file(
    root: &Path,
    file_name: &str,
) -> Result<Vec<CustomFieldDefinition>, String> {
    let path = root.join(file_name);
    if !path.exists() {
        return Err("Файл кастомних змінних ще не створено.".into());
    }
    let text = fs::read_to_string(path)
        .map_err(|_| "Не вдалося прочитати файл кастомних змінних.".to_string())?;
    let file: CustomFieldsFile = serde_json::from_str(&text)
        .map_err(|_| "Файл кастомних змінних має пошкоджений формат JSON.".to_string())?;
    Ok(file.fields)
}

pub fn save_custom_field_file(
    root: &Path,
    file_name: &str,
    field: &CustomFieldDefinition,
) -> Result<(), String> {
    let path = root.join(file_name);
    let mut fields = if path.exists() {
        load_custom_fields_file(root, file_name)?
    } else {
        Vec::new()
    };
    if let Some(existing) = fields
        .iter_mut()
        .find(|item| item.field_key == field.field_key && item.scope == field.scope)
    {
        *existing = field.clone();
    } else {
        fields.push(field.clone());
    }
    fields.sort_by(|left, right| {
        left.display_name
            .to_lowercase()
            .cmp(&right.display_name.to_lowercase())
    });
    let text = serde_json::to_string_pretty(&CustomFieldsFile { version: 1, fields })
        .map_err(|_| "Не вдалося сформувати JSON кастомних змінних.".to_string())?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, format!("{text}\n"))
        .map_err(|_| "Не вдалося записати файл кастомних змінних біля програми.".to_string())?;
    fs::rename(temp, path).map_err(|_| "Не вдалося завершити запис кастомних змінних.".to_string())
}

pub fn replace_custom_fields_file(
    root: &Path,
    file_name: &str,
    mut fields: Vec<CustomFieldDefinition>,
) -> Result<(), String> {
    let path = root.join(file_name);
    if fields.is_empty() {
        if path.exists() {
            fs::remove_file(path)
                .map_err(|_| "Не вдалося оновити файл кастомних змінних.".to_string())?;
        }
        return Ok(());
    }
    fields.sort_by(|left, right| {
        left.scope.cmp(&right.scope).then_with(|| {
            left.display_name
                .to_lowercase()
                .cmp(&right.display_name.to_lowercase())
        })
    });
    let text = serde_json::to_string_pretty(&CustomFieldsFile { version: 1, fields })
        .map_err(|_| "Не вдалося сформувати JSON кастомних змінних.".to_string())?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, format!("{text}\n"))
        .map_err(|_| "Не вдалося записати файл кастомних змінних біля програми.".to_string())?;
    fs::rename(temp, path).map_err(|_| "Не вдалося завершити запис кастомних змінних.".to_string())
}

pub fn remove_custom_field_file(
    root: &Path,
    file_name: &str,
    field_key: &str,
    scope: &str,
) -> Result<(), String> {
    let path = root.join(file_name);
    if !path.exists() {
        return Ok(());
    }
    let mut fields = load_custom_fields_file(root, file_name)?;
    fields.retain(|field| field.field_key != field_key || field.scope != scope);
    let text = serde_json::to_string_pretty(&CustomFieldsFile { version: 1, fields })
        .map_err(|_| "Не вдалося сформувати JSON кастомних змінних.".to_string())?;
    fs::write(&path, format!("{text}\n"))
        .map_err(|_| "Не вдалося оновити файл кастомних змінних.".to_string())
}

pub fn sync_custom_fields_file(
    connection: &Connection,
    root: &Path,
    file_name: &str,
) -> Result<(), String> {
    let fields = match load_custom_fields_file(root, file_name) {
        Ok(fields) => fields,
        Err(_) => return Ok(()),
    };
    for field in fields {
        if field.scope == "vehicle" {
            connection.execute("INSERT OR IGNORE INTO vehicle_custom_field_definitions (field_key, display_name, description, initial_value) VALUES (?1, ?2, ?3, ?4)", params![field.field_key, field.display_name, field.description, field.initial_value])
                .map_err(|_| "Не вдалося синхронізувати кастомні поля автомобілів.".to_string())?;
            connection.execute("INSERT OR IGNORE INTO vehicle_custom_fields (vehicle_id, field_key, field_value) SELECT id, ?1, ?2 FROM vehicles", params![field.field_key, field.initial_value])
                .map_err(|_| "Не вдалося встановити значення поля автомобіля.".to_string())?;
            continue;
        }
        connection.execute("INSERT OR IGNORE INTO custom_field_definitions (field_key, display_name, description, initial_value) VALUES (?1, ?2, ?3, ?4)", params![field.field_key, field.display_name, field.description, field.initial_value])
            .map_err(|_| "Не вдалося синхронізувати кастомні змінні з базою даних.".to_string())?;
        connection.execute("INSERT OR IGNORE INTO personnel_custom_fields (personnel_id, field_key, field_value) SELECT id, ?1, ?2 FROM personnel", params![field.field_key, field.initial_value])
            .map_err(|_| "Не вдалося встановити значення кастомних змінних.".to_string())?;
    }
    Ok(())
}

pub fn initialise(connection: &Connection) -> Result<(), String> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS vehicles (id INTEGER PRIMARY KEY, name TEXT NOT NULL, registration_number TEXT NOT NULL UNIQUE, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);").map_err(|_| "Не вдалося створити таблицю автомобілів.".to_string())?;
    connection.execute_batch("PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS personnel (id INTEGER PRIMARY KEY, rank TEXT NOT NULL, surname TEXT NOT NULL, given_name TEXT NOT NULL, patronymic TEXT NOT NULL DEFAULT '', position TEXT NOT NULL, tax_id TEXT NOT NULL DEFAULT '', birth_date TEXT NOT NULL, education_level TEXT NOT NULL, education_details TEXT NOT NULL, armed_forces_service_start_date TEXT NOT NULL, position_assigned_date TEXT NOT NULL, position_assignment_order TEXT NOT NULL, military_id TEXT NOT NULL, gender TEXT NOT NULL DEFAULT '' CHECK(gender IN ('', 'чоловіча', 'жіноча')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS personnel_custom_fields (personnel_id INTEGER NOT NULL, field_key TEXT NOT NULL, field_value TEXT NOT NULL, PRIMARY KEY(personnel_id, field_key), FOREIGN KEY(personnel_id) REFERENCES personnel(id) ON DELETE CASCADE); CREATE TABLE IF NOT EXISTS custom_field_definitions (field_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT NOT NULL, initial_value TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS vehicle_custom_field_definitions (field_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT NOT NULL, initial_value TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS vehicle_custom_fields (vehicle_id INTEGER NOT NULL, field_key TEXT NOT NULL, field_value TEXT NOT NULL, PRIMARY KEY(vehicle_id, field_key), FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE);")
        .map_err(|_| "Не вдалося підготувати базу даних.".to_string())?;
    migrate_personnel_tax_id_for_import(connection)?;
    connection
        .execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS personnel_tax_id_nonempty_unique ON personnel(tax_id) WHERE tax_id <> ''",
            [],
        )
        .map_err(|_| "Не вдалося налаштувати унікальність ІПН.".to_string())?;
    connection.execute("ALTER TABLE vehicles ADD COLUMN personnel_id INTEGER REFERENCES personnel(id) ON DELETE SET NULL", []).ok();
    connection.execute("ALTER TABLE vehicles ADD COLUMN crew_id INTEGER REFERENCES crews(id) ON DELETE SET NULL", []).ok();
    connection
        .execute(
            "ALTER TABLE vehicles ADD COLUMN status TEXT NOT NULL DEFAULT 'Справний'",
            [],
        )
        .ok();
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS crews (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            platoon TEXT NOT NULL DEFAULT '',
            position_name TEXT NOT NULL DEFAULT '',
            reconnaissance_area TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS crew_members (
            id INTEGER PRIMARY KEY,
            crew_id INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
            personnel_id INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
            joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            left_at TEXT,
            UNIQUE(crew_id, personnel_id, joined_at)
        );
        CREATE INDEX IF NOT EXISTS crew_members_active_idx ON crew_members(crew_id, left_at);
        CREATE TABLE IF NOT EXISTS equipment (
            id INTEGER PRIMARY KEY,
            category TEXT NOT NULL CHECK(category IN ('generator','uav','communications','weapon_ammo')),
            name TEXT NOT NULL,
            inventory_number TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Справний',
            crew_id INTEGER REFERENCES crews(id) ON DELETE SET NULL,
            personnel_id INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS equipment_category_idx ON equipment(category);
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY,
            incident_type TEXT NOT NULL,
            occurred_at TEXT NOT NULL DEFAULT '',
            crew_id INTEGER REFERENCES crews(id) ON DELETE SET NULL,
            equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
            position_name TEXT NOT NULL DEFAULT '',
            reconnaissance_area TEXT NOT NULL DEFAULT '',
            crew_snapshot TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS incidents_created_idx ON incidents(created_at DESC);",
    ).map_err(|_| "Не вдалося підготувати таблиці підрозділів і майна.".to_string())?;
    let existing_columns = connection
        .prepare("PRAGMA table_info(personnel)")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, String>(1))
                .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        })
        .map_err(|_| "Не вдалося прочитати структуру особового складу.".to_string())?;
    let has_legacy_vehicle_columns = existing_columns
        .iter()
        .any(|column| column == "assigned_vehicle_name")
        && existing_columns
            .iter()
            .any(|column| column == "assigned_vehicle_registration");
    if has_legacy_vehicle_columns {
        connection.execute("INSERT OR IGNORE INTO vehicles (name, registration_number, personnel_id) SELECT assigned_vehicle_name, assigned_vehicle_registration, id FROM personnel WHERE assigned_vehicle_name <> '' AND assigned_vehicle_registration <> ''", []).map_err(|_| "Не вдалося перенести автомобілі зі старої бази.".to_string())?;
        connection.execute("UPDATE vehicles SET personnel_id=(SELECT id FROM personnel WHERE assigned_vehicle_registration=vehicles.registration_number AND assigned_vehicle_name=vehicles.name LIMIT 1) WHERE personnel_id IS NULL", []).map_err(|_| "Не вдалося відновити зв’язок автомобіля з водієм.".to_string())?;
        connection
            .execute(
                "ALTER TABLE personnel DROP COLUMN assigned_vehicle_name",
                [],
            )
            .map_err(|_| "Не вдалося прибрати застаріле поле автомобіля з бази.".to_string())?;
        connection
            .execute(
                "ALTER TABLE personnel DROP COLUMN assigned_vehicle_registration",
                [],
            )
            .map_err(|_| "Не вдалося прибрати застарілий номер автомобіля з бази.".to_string())?;
    }
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
        .pragma_update(None, "user_version", 3)
        .map_err(|_| "Не вдалося завершити міграцію бази даних.".to_string())?;
    let columns = connection
        .prepare("PRAGMA table_info(personnel)")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, String>(1))
                .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        })
        .map_err(|_| "Не вдалося прочитати структуру особового складу.".to_string())?;
    for (field_key, _) in STANDARD_EXTRA_FIELDS {
        connection
            .execute(
                "DELETE FROM custom_field_definitions WHERE field_key = ?1",
                params![field_key],
            )
            .map_err(|_| {
                "Не вдалося очистити стандартні поля з реєстру кастомних полів.".to_string()
            })?;
        connection
            .execute(
                "DELETE FROM personnel_custom_fields WHERE field_key = ?1",
                params![field_key],
            )
            .map_err(|_| "Не вдалося очистити застарілі значення стандартних полів.".to_string())?;
        if !columns.iter().any(|column| column == field_key) {
            connection
                .execute(
                    &format!(
                        "ALTER TABLE personnel ADD COLUMN {field_key} TEXT NOT NULL DEFAULT ''"
                    ),
                    [],
                )
                .map_err(|_| format!("Не вдалося додати основне поле «{field_key}»."))?;
        }
    }
    Ok(())
}

/// Old databases required every record to have a unique ten-digit tax ID. Excel
/// bases intentionally allow incomplete rows, therefore only non-empty IDs are
/// unique from now on. SQLite needs a table rebuild to remove the old constraint.
fn migrate_personnel_tax_id_for_import(connection: &Connection) -> Result<(), String> {
    let sql = connection
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='personnel'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "Не вдалося прочитати структуру особового складу.".to_string())?;
    if !sql.contains("tax_id TEXT NOT NULL UNIQUE") && !sql.contains("CHECK(length(tax_id)") {
        return Ok(());
    }
    let columns = connection
        .prepare("PRAGMA table_info(personnel)")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, i64>(5)?,
                    ))
                })
                .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        })
        .map_err(|_| "Не вдалося прочитати поля особового складу.".to_string())?;
    let definitions = columns
        .iter()
        .map(|(name, kind, required, default, primary)| {
            if name == "tax_id" {
                "tax_id TEXT NOT NULL DEFAULT ''".to_string()
            } else if *primary > 0 {
                format!("{name} {kind} PRIMARY KEY")
            } else {
                format!(
                    "{name} {kind}{}{}",
                    if *required != 0 { " NOT NULL" } else { "" },
                    default
                        .as_ref()
                        .map(|value| format!(" DEFAULT {value}"))
                        .unwrap_or_default()
                )
            }
        })
        .collect::<Vec<_>>();
    let names = columns
        .iter()
        .map(|(name, _, _, _, _)| name.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    connection
        .execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|_| "Не вдалося підготувати міграцію ІПН.".to_string())?;
    let result = connection.execute_batch(&format!(
        "CREATE TABLE personnel_import_ready ({}); \
         INSERT INTO personnel_import_ready ({names}) SELECT {names} FROM personnel; \
         DROP TABLE personnel; \
         ALTER TABLE personnel_import_ready RENAME TO personnel;",
        definitions.join(", ")
    ));
    let _ = connection.execute_batch("PRAGMA foreign_keys = ON;");
    result.map_err(|_| "Не вдалося оновити базу для імпорту неповних Excel-даних.".to_string())?;
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
                scope: "personnel".into(),
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
        scope: "personnel".into(),
    })
}

pub fn update_custom_field(
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
    let changed = connection.execute("UPDATE custom_field_definitions SET display_name = ?1, description = ?2, initial_value = ?3 WHERE field_key = ?4", params![field.display_name.trim(), field.description.trim(), field.initial_value, key]).map_err(|_| "Не вдалося оновити поле БД.".to_string())?;
    if changed == 0 {
        return Err("Поле БД не знайдено.".into());
    }
    Ok(CustomFieldDefinition {
        field_key: key.into(),
        display_name: field.display_name.trim().into(),
        description: field.description.trim().into(),
        initial_value: field.initial_value,
        scope: "personnel".into(),
    })
}

pub fn delete_custom_field(connection: &Connection, field_key: &str) -> Result<(), String> {
    let tx = connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося змінити поле БД.".to_string())?;
    tx.execute(
        "DELETE FROM personnel_custom_fields WHERE field_key = ?1",
        [field_key],
    )
    .map_err(|_| "Не вдалося видалити значення поля.".to_string())?;
    let changed = tx
        .execute(
            "DELETE FROM custom_field_definitions WHERE field_key = ?1",
            [field_key],
        )
        .map_err(|_| "Не вдалося видалити поле БД.".to_string())?;
    if changed == 0 {
        return Err("Поле БД не знайдено.".into());
    }
    tx.commit()
        .map_err(|_| "Не вдалося завершити видалення поля БД.".to_string())
}

pub fn list_vehicle_custom_fields(
    connection: &Connection,
) -> Result<Vec<CustomFieldDefinition>, String> {
    let mut statement = connection.prepare("SELECT field_key, display_name, description, initial_value FROM vehicle_custom_field_definitions ORDER BY display_name COLLATE NOCASE").map_err(|_| "Не вдалося прочитати поля автомобілів.".to_string())?;
    let result = statement
        .query_map([], |row| {
            Ok(CustomFieldDefinition {
                field_key: row.get(0)?,
                display_name: row.get(1)?,
                description: row.get(2)?,
                initial_value: row.get(3)?,
                scope: "vehicle".into(),
            })
        })
        .map_err(|_| "Не вдалося прочитати поля автомобілів.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати поля автомобілів.".to_string());
    result
}
pub fn create_vehicle_custom_field(
    connection: &Connection,
    field: CustomFieldDefinition,
) -> Result<CustomFieldDefinition, String> {
    let key = field.field_key.trim();
    if key.is_empty()
        || !key.chars().next().is_some_and(|c| c.is_ascii_lowercase())
        || !key
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        return Err("Ключ поля має починатися з малої латинської літери та містити лише малі латинські літери, цифри й підкреслення.".into());
    }
    if field.display_name.trim().is_empty() {
        return Err("Вкажіть українську назву поля.".into());
    }
    connection.execute("INSERT INTO vehicle_custom_field_definitions(field_key,display_name,description,initial_value) VALUES(?1,?2,?3,?4)", params![key, field.display_name.trim(), field.description.trim(), field.initial_value]).map_err(|_| "Поле з таким ключем уже існує або не може бути збережене.".to_string())?;
    connection.execute("INSERT INTO vehicle_custom_fields(vehicle_id,field_key,field_value) SELECT id,?1,?2 FROM vehicles", params![key, field.initial_value]).map_err(|_| "Не вдалося встановити початкові значення поля автомобіля.".to_string())?;
    Ok(CustomFieldDefinition {
        field_key: key.into(),
        display_name: field.display_name.trim().into(),
        description: field.description.trim().into(),
        initial_value: field.initial_value,
        scope: "vehicle".into(),
    })
}
pub fn update_vehicle_custom_field(
    connection: &Connection,
    field: CustomFieldDefinition,
) -> Result<CustomFieldDefinition, String> {
    let changed = connection.execute("UPDATE vehicle_custom_field_definitions SET display_name=?1,description=?2,initial_value=?3 WHERE field_key=?4", params![field.display_name.trim(), field.description.trim(), field.initial_value, field.field_key]).map_err(|_| "Не вдалося оновити поле автомобіля.".to_string())?;
    if changed == 0 {
        return Err("Поле автомобіля не знайдено.".into());
    }
    Ok(CustomFieldDefinition {
        scope: "vehicle".into(),
        ..field
    })
}
pub fn delete_vehicle_custom_field(connection: &Connection, field_key: &str) -> Result<(), String> {
    let tx = connection
        .unchecked_transaction()
        .map_err(|_| "Не вдалося почати видалення поля автомобіля.".to_string())?;
    tx.execute(
        "DELETE FROM vehicle_custom_fields WHERE field_key=?1",
        [field_key],
    )
    .map_err(|_| "Не вдалося видалити значення поля автомобіля.".to_string())?;
    if tx
        .execute(
            "DELETE FROM vehicle_custom_field_definitions WHERE field_key=?1",
            [field_key],
        )
        .map_err(|_| "Не вдалося видалити поле автомобіля.".to_string())?
        == 0
    {
        return Err("Поле автомобіля не знайдено.".into());
    }
    tx.commit()
        .map_err(|_| "Не вдалося завершити видалення поля автомобіля.".to_string())
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
        connection.execute("INSERT OR IGNORE INTO personnel (rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)", params![record.0, record.1, record.2, record.3, record.4, record.5, record.6, record.7, record.8, record.9, record.10, record.11, record.12]).map_err(|_| "Не вдалося створити початкові дані.".to_string())?;
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
            3
        );
        let columns = connection
            .prepare("PRAGMA table_info(personnel)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert!(!columns.contains(&"assigned_vehicle_name".to_string()));
        assert!(!columns.contains(&"assigned_vehicle_registration".to_string()));
    }

    #[test]
    fn migrates_legacy_tax_id_constraint_to_allow_empty_import_values() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE personnel (id INTEGER PRIMARY KEY, rank TEXT NOT NULL, surname TEXT NOT NULL, given_name TEXT NOT NULL, patronymic TEXT NOT NULL DEFAULT '', position TEXT NOT NULL, tax_id TEXT NOT NULL UNIQUE CHECK(length(tax_id) = 10), birth_date TEXT NOT NULL, education_level TEXT NOT NULL, education_details TEXT NOT NULL, armed_forces_service_start_date TEXT NOT NULL, position_assigned_date TEXT NOT NULL, position_assignment_order TEXT NOT NULL, military_id TEXT NOT NULL, gender TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);").unwrap();
        initialise(&connection).unwrap();
        for surname in ["ПЕРШИЙ", "ДРУГИЙ"] {
            connection.execute("INSERT INTO personnel (rank, surname, given_name, patronymic, position, tax_id, birth_date, education_level, education_details, armed_forces_service_start_date, position_assigned_date, position_assignment_order, military_id, gender) VALUES ('', ?1, '', '', '', '', '', '', '', '', '', '', '', '')", [surname]).unwrap();
        }
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM personnel WHERE tax_id = ''",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn custom_field_is_seeded_for_existing_personnel() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        seed_test_personnel(&connection).unwrap();
        create_custom_field(
            &connection,
            CustomFieldDefinition {
                field_key: "custom_unit_code".into(),
                display_name: "Код підрозділу".into(),
                description: "Внутрішній код".into(),
                initial_value: "А0000".into(),
                scope: "personnel".into(),
            },
        )
        .unwrap();
        let count: i64 = connection.query_row("SELECT COUNT(*) FROM personnel_custom_fields WHERE field_key='custom_unit_code' AND field_value='А0000'", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 15);
    }

    #[test]
    fn custom_field_can_be_updated_and_deleted() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        create_custom_field(
            &connection,
            CustomFieldDefinition {
                field_key: "unit_name".into(),
                display_name: "Підрозділ".into(),
                description: "Назва".into(),
                initial_value: "А0000".into(),
                scope: "personnel".into(),
            },
        )
        .unwrap();
        let updated = update_custom_field(
            &connection,
            CustomFieldDefinition {
                field_key: "unit_name".into(),
                display_name: "Назва підрозділу".into(),
                description: "Оновлено".into(),
                initial_value: "Б0000".into(),
                scope: "personnel".into(),
            },
        )
        .unwrap();
        assert_eq!(updated.display_name, "Назва підрозділу");
        delete_custom_field(&connection, "unit_name").unwrap();
        assert!(!list_custom_fields(&connection)
            .unwrap()
            .iter()
            .any(|field| field.field_key == "unit_name"));
    }

    #[test]
    fn custom_field_key_does_not_require_a_prefix() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        assert!(create_custom_field(
            &connection,
            CustomFieldDefinition {
                field_key: "unit_name".into(),
                display_name: "Підрозділ".into(),
                description: "".into(),
                initial_value: "".into(),
                scope: "personnel".into()
            }
        )
        .is_ok());
    }

    #[test]
    fn creates_operational_registers_and_keeps_vehicle_crew_relation() {
        let connection = Connection::open_in_memory().unwrap();
        initialise(&connection).unwrap();
        connection
            .execute("INSERT INTO crews(name) VALUES('Екіпаж 1')", [])
            .unwrap();
        connection.execute("INSERT INTO vehicles(name, registration_number, crew_id) VALUES('Тестове авто', 'АА0001АА', 1)", []).unwrap();
        connection
            .execute(
                "INSERT INTO equipment(category, name, crew_id) VALUES('uav', 'Тестовий БпЛА', 1)",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO incidents(incident_type, crew_id, equipment_id) VALUES('Втрата БпЛА', 1, 1)", []).unwrap();
        let linked: i64 = connection
            .query_row("SELECT COUNT(*) FROM vehicles WHERE crew_id=1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(linked, 1);
        let incident: String = connection
            .query_row("SELECT incident_type FROM incidents", [], |row| row.get(0))
            .unwrap();
        assert_eq!(incident, "Втрата БпЛА");
    }
}
