use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
#[cfg(test)]
mod test_support;

#[cfg(test)]
pub(crate) use test_support::seed_test_personnel;

use std::{fs, path::Path};

pub(crate) fn is_valid_bcs_location(value: &str) -> bool {
    if value.trim().is_empty() {
        return true;
    }
    let schema: serde_json::Value =
        serde_json::from_str(include_str!("../../src/shared/bcs-schema.json"))
            .expect("вбудований довідник БЧС має бути коректним JSON");
    schema["locations"].as_array().is_some_and(|locations| {
        locations
            .iter()
            .any(|item| item.as_str() == Some(value.trim()))
    })
}

/// A штатна посада is assembled from several sources (Excel, structure and
/// transfers). Keep a single canonical spelling so it remains comparable to
/// the skeleton: lowercase text, "роти" in the unit descriptor and one
/// occurrence of the military-unit suffix with an uppercase Ukrainian "А".
fn canonical_unit_code(value: &str) -> Option<String> {
    let chars = value.chars().collect::<Vec<_>>();
    (chars.len() == 5
        && matches!(chars.first(), Some('а') | Some('a'))
        && chars
            .iter()
            .skip(1)
            .all(|character| character.is_ascii_digit()))
    .then(|| format!("А{}", chars.iter().skip(1).collect::<String>()))
}

pub(crate) fn canonical_staff_position(value: &str) -> String {
    let words = value
        .trim()
        .to_lowercase()
        .split_whitespace()
        .map(|word| {
            if word == "рота" {
                "роти".to_string()
            } else {
                word.to_string()
            }
        })
        .collect::<Vec<_>>();
    let mut normalized = Vec::new();
    let mut has_unit_code = false;
    let mut index = 0;
    while index < words.len() {
        let raw_code = if words.get(index).is_some_and(|word| word == "військової")
            && words.get(index + 1).is_some_and(|word| word == "частини")
        {
            words.get(index + 2)
        } else {
            None
        };
        if let Some(raw_code) = raw_code {
            if let Some(code) = canonical_unit_code(raw_code) {
                if !has_unit_code {
                    normalized.push("військової".into());
                    normalized.push("частини".into());
                    normalized.push(code);
                    has_unit_code = true;
                }
                index += 3;
                continue;
            }
        }
        normalized.push(canonical_unit_code(&words[index]).unwrap_or_else(|| words[index].clone()));
        index += 1;
    }
    normalized.join(" ")
}

pub(crate) fn normalize_staff_positions(connection: &Connection) -> Result<(), String> {
    let rows = {
        let mut statement = connection
            .prepare("SELECT id, position FROM personnel")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };
    for (id, position) in rows {
        let normalized = canonical_staff_position(&position);
        if normalized != position {
            connection
                .execute(
                    "UPDATE personnel SET position=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2",
                    params![normalized, id],
                )
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn normalize_bcs_locations(connection: &Connection) -> Result<(), String> {
    for table in ["personnel", "temporary_personnel"] {
        let query = format!(
            "SELECT DISTINCT current_location FROM {table} WHERE trim(current_location)<>''"
        );
        let invalid = {
            let mut statement = connection.prepare(&query).map_err(|e| e.to_string())?;
            let values = statement
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            values
                .into_iter()
                .filter(|value| !is_valid_bcs_location(value))
                .collect::<Vec<_>>()
        };
        let update = format!("UPDATE {table} SET current_location='' WHERE current_location=?1");
        for value in invalid {
            connection
                .execute(&update, [value])
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

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
    ("callsign", "Позивний"),
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
    ("functional_duties", "Функціональні обов’язки"),
    ("current_location", "Де знаходиться"),
    ("bcs_status", "Статус у БЧС"),
    ("bcs_notes", "Примітка БЧС"),
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
            unit_type TEXT NOT NULL DEFAULT 'Екіпаж',
            company_name TEXT NOT NULL DEFAULT '',
            battle_order TEXT NOT NULL DEFAULT '',
            sector TEXT NOT NULL DEFAULT '',
            official_strength INTEGER NOT NULL DEFAULT 4,
            status TEXT NOT NULL DEFAULT 'Формується',
            uav_name TEXT NOT NULL DEFAULT '',
            uav_type TEXT NOT NULL DEFAULT '',
            functional_duties TEXT NOT NULL DEFAULT '',
            current_location TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
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
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS incident_equipment (
               incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
               equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
               PRIMARY KEY(incident_id,equipment_id)
             );
             CREATE INDEX IF NOT EXISTS incident_equipment_incident_idx ON incident_equipment(incident_id);
             INSERT OR IGNORE INTO incident_equipment(incident_id,equipment_id)
               SELECT id,equipment_id FROM incidents WHERE equipment_id IS NOT NULL;",
        )
        .map_err(|_| "Не вдалося підготувати майно інцидентів.".to_string())?;
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS personnel_staff_assignments (
            personnel_id INTEGER PRIMARY KEY REFERENCES personnel(id) ON DELETE CASCADE,
            acting_position TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS staff_recommendations (
            id INTEGER PRIMARY KEY,
            personnel_id INTEGER NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
            position_name TEXT NOT NULL,
            issued_at TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS staff_recommendations_personnel_idx ON staff_recommendations(personnel_id, issued_at DESC);
        CREATE TABLE IF NOT EXISTS staff_position_recommendations (
            id INTEGER PRIMARY KEY,
            position_name TEXT NOT NULL,
            full_name TEXT NOT NULL,
            phone TEXT NOT NULL DEFAULT '',
            rank TEXT NOT NULL DEFAULT '',
            birth_date TEXT NOT NULL DEFAULT '',
            issued_at TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS staff_position_recommendations_position_idx ON staff_position_recommendations(position_name, issued_at DESC);"
    ).map_err(|_| "Не вдалося підготувати кадрові призначення.".to_string())?;
    crate::temporary_personnel::prepare(connection)?;
    for statement in [
        "ALTER TABLE personnel_staff_assignments ADD COLUMN slot_id TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE personnel_staff_assignments ADD COLUMN acting_slot_id TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE staff_position_recommendations ADD COLUMN slot_id TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE crews ADD COLUMN working_strength INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE crews ADD COLUMN unit_type TEXT NOT NULL DEFAULT 'Екіпаж'",
        "ALTER TABLE crews ADD COLUMN company_name TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE crews ADD COLUMN battle_order TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE crews ADD COLUMN sector TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE crews ADD COLUMN official_strength INTEGER NOT NULL DEFAULT 4",
        "ALTER TABLE crews ADD COLUMN status TEXT NOT NULL DEFAULT 'Формується'",
        "ALTER TABLE crews ADD COLUMN uav_name TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE crews ADD COLUMN uav_type TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE crews ADD COLUMN functional_duties TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE crews ADD COLUMN current_location TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE crews ADD COLUMN notes TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE equipment ADD COLUMN total_quantity INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE equipment ADD COLUMN day_quantity INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE equipment ADD COLUMN night_quantity INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE equipment ADD COLUMN uav_type TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE equipment ADD COLUMN asset_kind TEXT NOT NULL DEFAULT 'aircraft'",
        "ALTER TABLE equipment ADD COLUMN components_json TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE equipment ADD COLUMN assigned_quantity INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE crews ADD COLUMN primary_uav_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL",
    ] {
        connection.execute(statement, []).ok();
    }
    connection.execute("INSERT INTO equipment(category,name,status,crew_id,total_quantity,day_quantity,night_quantity) SELECT 'uav',c.uav_name,'Справний',c.id,1,1,0 FROM crews c WHERE trim(c.uav_name)<>'' AND NOT EXISTS(SELECT 1 FROM equipment e WHERE e.category='uav' AND e.crew_id=c.id AND lower(trim(e.name))=lower(trim(c.uav_name)))",[]).map_err(|_|"Не вдалося перенести старі назви БпАК до реєстру БпЛА.".to_string())?;
    connection.execute("UPDATE equipment SET uav_type=COALESCE((SELECT c.uav_type FROM crews c WHERE c.id=equipment.crew_id),'') WHERE category='uav' AND trim(uav_type)=''",[]).map_err(|_|"Не вдалося перенести типи БпАК до реєстру БпЛА.".to_string())?;
    connection.execute("UPDATE equipment SET uav_type=COALESCE((SELECT c.uav_type FROM crews c WHERE lower(trim(c.uav_name))=lower(trim(equipment.name)) AND trim(c.uav_type)<>'' LIMIT 1),'') WHERE category='uav' AND trim(uav_type)=''",[]).map_err(|_|"Не вдалося зіставити старі типи БпАК.".to_string())?;
    connection.execute("UPDATE equipment SET uav_type=CASE WHEN upper(name) LIKE '%FPV%' OR upper(name) LIKE '%ФПВ%' THEN 'ФПВ' WHEN upper(name) LIKE '%MAVIC%' THEN 'Коптер' ELSE uav_type END WHERE category='uav' AND trim(uav_type)=''",[]).map_err(|_|"Не вдалося визначити типи старих БпЛА.".to_string())?;
    connection.execute("UPDATE equipment SET assigned_quantity=CASE WHEN crew_id IS NULL THEN 0 ELSE total_quantity END WHERE category='uav' AND assigned_quantity=0",[]).map_err(|_|"Не вдалося перенести кількість закріплених БпЛА.".to_string())?;
    connection.execute_batch("CREATE TRIGGER IF NOT EXISTS clear_changed_staff_slot AFTER UPDATE OF position ON personnel WHEN OLD.position <> NEW.position BEGIN UPDATE personnel_staff_assignments SET slot_id='' WHERE personnel_id=NEW.id; END;").map_err(|e| e.to_string())?;
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS positions (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            position_type TEXT NOT NULL DEFAULT 'Основна' CHECK(position_type IN ('Основна','Запасна','Облаштовується','Виявлена ворогом','Зайнята суміжниками')),
            strip_name TEXT NOT NULL DEFAULT '',
            locality TEXT NOT NULL DEFAULT '',
            battle_order TEXT NOT NULL DEFAULT '',
            sector TEXT NOT NULL DEFAULT '',
            condition TEXT NOT NULL DEFAULT 'Готова',
            size TEXT NOT NULL DEFAULT '',
            mgrs TEXT NOT NULL DEFAULT '',
            suitable_uav_text TEXT NOT NULL DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
            crew_id INTEGER REFERENCES crews(id) ON DELETE SET NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK(is_active = 0 OR crew_id IS NOT NULL)
        );
        CREATE INDEX IF NOT EXISTS positions_type_idx ON positions(position_type);
        CREATE INDEX IF NOT EXISTS positions_crew_idx ON positions(crew_id);
        CREATE TABLE IF NOT EXISTS position_uavs (
            position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
            equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
            PRIMARY KEY(position_id, equipment_id)
        );"
    ).map_err(|_| "Не вдалося підготувати таблицю позицій.".to_string())?;
    let positions_sql: String = connection
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='positions'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();
    if !positions_sql.contains("Виявлена ворогом") {
        connection.execute_batch(
            "CREATE TEMP TABLE position_uavs_backup AS SELECT position_id,equipment_id FROM position_uavs;
             DROP TABLE position_uavs;
             ALTER TABLE positions RENAME TO positions_legacy;
             CREATE TABLE positions (
               id INTEGER PRIMARY KEY,
               name TEXT NOT NULL UNIQUE,
               position_type TEXT NOT NULL DEFAULT 'Основна' CHECK(position_type IN ('Основна','Запасна','Облаштовується','Виявлена ворогом','Зайнята суміжниками')),
               strip_name TEXT NOT NULL DEFAULT '', locality TEXT NOT NULL DEFAULT '', battle_order TEXT NOT NULL DEFAULT '',
               sector TEXT NOT NULL DEFAULT '', condition TEXT NOT NULL DEFAULT '0', size TEXT NOT NULL DEFAULT '', mgrs TEXT NOT NULL DEFAULT '',
               suitable_uav_text TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
               crew_id INTEGER REFERENCES crews(id) ON DELETE SET NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
               condition_level INTEGER NOT NULL DEFAULT 0, field_type TEXT NOT NULL DEFAULT ''
             );
             INSERT INTO positions(id,name,position_type,strip_name,locality,battle_order,sector,condition,size,mgrs,suitable_uav_text,is_active,crew_id,notes,created_at)
               SELECT id,name,CASE WHEN position_type='В облаштуванні' THEN 'Облаштовується' ELSE position_type END,strip_name,locality,battle_order,sector,condition,size,mgrs,suitable_uav_text,is_active,crew_id,notes,created_at FROM positions_legacy;
             DROP TABLE positions_legacy;
             CREATE TABLE position_uavs(position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,PRIMARY KEY(position_id,equipment_id));
             INSERT OR IGNORE INTO position_uavs SELECT position_id,equipment_id FROM position_uavs_backup;
             DROP TABLE position_uavs_backup;
             CREATE INDEX IF NOT EXISTS positions_type_idx ON positions(position_type);
             CREATE INDEX IF NOT EXISTS positions_crew_idx ON positions(crew_id);"
        ).map_err(|_| "Не вдалося оновити структуру позицій.".to_string())?;
    }
    for statement in [
        "ALTER TABLE positions ADD COLUMN condition_level INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE positions ADD COLUMN field_type TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE crews ADD COLUMN position_id INTEGER REFERENCES positions(id) ON DELETE SET NULL",
    ] {
        connection.execute(statement, []).ok();
    }
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS crew_actual_members (
           crew_id INTEGER NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
           personnel_id INTEGER NOT NULL UNIQUE REFERENCES personnel(id) ON DELETE CASCADE,
           PRIMARY KEY(crew_id,personnel_id)
         );
         INSERT OR IGNORE INTO crew_actual_members(crew_id,personnel_id)
           SELECT crew_id,personnel_id FROM crew_members WHERE left_at IS NULL;",
        )
        .map_err(|_| "Не вдалося підготувати фактичний склад екіпажів.".to_string())?;
    connection.execute("UPDATE crews SET status=CASE WHEN trim(status) IN ('Активний','активний','Працює','працює','Робочий','робочий') THEN 'Працюючий' WHEN trim(status) LIKE 'Форм%' OR trim(status) LIKE 'форм%' THEN 'Формується' ELSE 'Не активний' END WHERE status NOT IN ('Працюючий','Формується','Не активний')", []).map_err(|_| "Не вдалося нормалізувати статуси екіпажів.".to_string())?;
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
        .pragma_update(None, "user_version", 4)
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
    normalize_bcs_locations(connection)?;
    normalize_staff_positions(connection)?;
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
