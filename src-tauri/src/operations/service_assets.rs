use super::{
    busy, equipment::official_crew_responsible, AssetCatalog, AssetCatalogDraft, AssetCatalogField,
    AssetHistoryEvent, ServiceAsset, ServiceAssetDraft,
};
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::{HashMap, HashSet};

const SERVICE_CODES: [&str; 11] = [
    "zbbr", "zu", "gz_kb", "siiz", "ms", "ets", "ovtm", "rs", "sa_ppo", "svt", "pmm",
];
const ACCOUNTING_UNITS: [&str; 6] = ["кг.", "шт.", "к-т.", "компл.", "пара", "уп."];

fn validate_service_code(value: &str) -> Result<(), String> {
    SERVICE_CODES
        .contains(&value)
        .then_some(())
        .ok_or_else(|| "Невідома служба майна.".to_string())
}

fn normalize_unit(value: &str) -> Result<String, String> {
    let normalized = match value.trim().trim_end_matches('.') {
        "кг" => "кг.",
        "шт" => "шт.",
        "к-т" => "к-т.",
        "компл" => "компл.",
        "пара" => "пара",
        "уп" => "уп.",
        _ => value.trim(),
    };
    ACCOUNTING_UNITS
        .contains(&normalized)
        .then(|| normalized.to_string())
        .ok_or_else(|| "Оберіть допустиму одиницю обліку.".to_string())
}

fn legacy_category(service_code: &str) -> &'static str {
    match service_code {
        "ets" => "generator",
        "sa_ppo" => "uav",
        "zbbr" | "zu" => "weapon_ammo",
        _ => "communications",
    }
}

fn no_condition(service_code: &str) -> bool {
    matches!(service_code, "zu" | "ms" | "rs" | "pmm")
}

fn catalog_name(connection: &Connection, catalog_id: Option<i64>) -> String {
    catalog_id
        .and_then(|id| {
            connection
                .query_row("SELECT name FROM asset_catalogs WHERE id=?1", [id], |row| {
                    row.get::<_, String>(0)
                })
                .ok()
        })
        .unwrap_or_default()
}

fn asset_kind(connection: &Connection, draft: &ServiceAssetDraft) -> String {
    if draft.service_code == "sa_ppo" {
        return match draft.asset_type.as_str() {
            "БпАК" => "complex",
            "Комплектуюче" => "component",
            _ => "aircraft",
        }
        .to_string();
    }
    if draft.service_code == "svt" {
        return match catalog_name(connection, draft.catalog_id).as_str() {
            "Техніка" => "vehicle",
            "АКБ" => "battery",
            "Шини" => "tire",
            _ => "",
        }
        .to_string();
    }
    String::new()
}

fn weapon_kind(connection: &Connection, draft: &ServiceAssetDraft) -> &'static str {
    let is_component = (draft.service_code == "sa_ppo" && draft.asset_type == "Комплектуюче")
        || (draft.service_code == "zu"
            && catalog_name(connection, draft.catalog_id)
                .to_lowercase()
                .contains("вибух"));
    if is_component {
        "component"
    } else if draft.service_code == "zu" {
        "ammunition"
    } else {
        "weapon"
    }
}

/// Keeps the legacy vehicle table (used by crews and flight plans) and the
/// service ledger view in sync without changing vehicle IDs or operational links.
pub(crate) fn sync_vehicle_assets(connection: &Connection) -> Result<(), String> {
    let vehicle_catalog_id = connection
        .query_row(
            "SELECT id FROM asset_catalogs WHERE service_code='svt' AND name='Техніка' LIMIT 1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|_| "Не знайдено системний каталог СВТ «Техніка».".to_string())?;
    connection
        .execute(
            "INSERT INTO equipment(
               category,service_code,catalog_id,name,full_name,inventory_number,serial_number,
               accounting_unit,quantity,asset_value,status,crew_id,personnel_id,responsible_manual,
               asset_kind,service_data_json,notes,total_quantity,day_quantity,night_quantity,
               assigned_quantity,measurement_unit,stock_quantity,legacy_vehicle_id,updated_at
             )
             SELECT 'communications','svt',?1,vehicle.name,vehicle.name,
                    vehicle.registration_number,vehicle.registration_number,'шт.',1,0,
                    vehicle.status,vehicle.crew_id,vehicle.personnel_id,
                    CASE WHEN vehicle.personnel_id IS NULL THEN 0 ELSE 1 END,
                    'vehicle',json_object('registration_number',vehicle.registration_number),
                    vehicle.notes,1,1,0,CASE WHEN vehicle.crew_id IS NULL THEN 0 ELSE 1 END,
                    'шт',1,vehicle.id,CURRENT_TIMESTAMP
             FROM vehicles vehicle
             WHERE NOT EXISTS(SELECT 1 FROM equipment mirror WHERE mirror.legacy_vehicle_id=vehicle.id)",
            [vehicle_catalog_id],
        )
        .map_err(|_| "Не вдалося додати автомобілі до обліку СВТ.".to_string())?;
    connection
        .execute(
            "UPDATE equipment SET
               catalog_id=?1,name=(SELECT name FROM vehicles WHERE id=legacy_vehicle_id),
               inventory_number=(SELECT registration_number FROM vehicles WHERE id=legacy_vehicle_id),
               serial_number=(SELECT registration_number FROM vehicles WHERE id=legacy_vehicle_id),
               status=(SELECT status FROM vehicles WHERE id=legacy_vehicle_id),
               crew_id=(SELECT crew_id FROM vehicles WHERE id=legacy_vehicle_id),
               personnel_id=(SELECT personnel_id FROM vehicles WHERE id=legacy_vehicle_id),
               notes=(SELECT notes FROM vehicles WHERE id=legacy_vehicle_id),
               asset_kind='vehicle',
               service_data_json=json_set(
                 CASE WHEN json_valid(service_data_json) THEN service_data_json ELSE '{}' END,
                 '$.registration_number',(SELECT registration_number FROM vehicles WHERE id=legacy_vehicle_id)
               ),updated_at=CURRENT_TIMESTAMP
             WHERE legacy_vehicle_id IS NOT NULL
               AND EXISTS(SELECT 1 FROM vehicles WHERE id=legacy_vehicle_id)",
            [vehicle_catalog_id],
        )
        .map_err(|_| "Не вдалося синхронізувати автомобілі з обліком СВТ.".to_string())?;
    connection
        .execute(
            "DELETE FROM equipment WHERE legacy_vehicle_id IS NOT NULL
             AND NOT EXISTS(SELECT 1 FROM vehicles WHERE id=legacy_vehicle_id)",
            [],
        )
        .map_err(|_| "Не вдалося очистити застарілі зв’язки автомобілів СВТ.".to_string())?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn append_history(
    connection: &Connection,
    equipment_id: Option<i64>,
    asset_name: &str,
    service_code: &str,
    event_type: &str,
    quantity_delta: f64,
    quantity_after: f64,
    from_personnel_id: Option<i64>,
    to_personnel_id: Option<i64>,
    from_crew_id: Option<i64>,
    to_crew_id: Option<i64>,
    details: &str,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO asset_history(
               equipment_id,asset_name,service_code,event_type,quantity_delta,quantity_after,
               from_personnel_id,to_personnel_id,from_crew_id,to_crew_id,details
             ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                equipment_id,
                asset_name,
                service_code,
                event_type,
                quantity_delta,
                quantity_after,
                from_personnel_id,
                to_personnel_id,
                from_crew_id,
                to_crew_id,
                details
            ],
        )
        .map_err(|_| "Не вдалося записати історію руху майна.".to_string())?;
    Ok(())
}

fn save_custom_values(
    connection: &Connection,
    equipment_id: i64,
    catalog_id: Option<i64>,
    values: &HashMap<String, String>,
) -> Result<(), String> {
    connection
        .execute(
            "DELETE FROM asset_custom_values WHERE equipment_id=?1",
            [equipment_id],
        )
        .map_err(|_| "Не вдалося оновити додаткові поля майна.".to_string())?;
    let Some(catalog_id) = catalog_id else {
        return Ok(());
    };
    let mut statement = connection
        .prepare("SELECT id,field_key,initial_value FROM asset_catalog_fields WHERE catalog_id=?1")
        .map_err(|_| "Не вдалося прочитати поля каталогу.".to_string())?;
    let fields = statement
        .query_map([catalog_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати поля каталогу.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати поля каталогу.".to_string())?;
    for (field_id, key, initial_value) in fields {
        let value = values.get(&key).cloned().unwrap_or(initial_value);
        connection
            .execute(
                "INSERT INTO asset_custom_values(equipment_id,field_id,field_value) VALUES(?1,?2,?3)",
                params![equipment_id, field_id, value],
            )
            .map_err(|_| "Не вдалося зберегти додаткове поле майна.".to_string())?;
    }
    Ok(())
}

fn custom_values(connection: &Connection, equipment_id: i64) -> HashMap<String, String> {
    connection
        .prepare(
            "SELECT field.field_key,value.field_value
             FROM asset_custom_values value
             JOIN asset_catalog_fields field ON field.id=value.field_id
             WHERE value.equipment_id=?1",
        )
        .and_then(|mut statement| {
            statement
                .query_map([equipment_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .and_then(|rows| rows.collect::<Result<HashMap<_, _>, _>>())
        })
        .unwrap_or_default()
}

fn catalog_fields(connection: &Connection, catalog_id: i64) -> Vec<AssetCatalogField> {
    connection
        .prepare(
            "SELECT id,catalog_id,field_key,display_name,field_type,initial_value,sort_order
             FROM asset_catalog_fields WHERE catalog_id=?1 ORDER BY sort_order,id",
        )
        .and_then(|mut statement| {
            statement
                .query_map([catalog_id], |row| {
                    Ok(AssetCatalogField {
                        id: row.get(0)?,
                        catalog_id: row.get(1)?,
                        field_key: row.get(2)?,
                        display_name: row.get(3)?,
                        field_type: row.get(4)?,
                        initial_value: row.get(5)?,
                        sort_order: row.get(6)?,
                    })
                })
                .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn list_asset_catalogs(
    state: tauri::State<AppState>,
    service_code: String,
) -> Result<Vec<AssetCatalog>, String> {
    validate_service_code(&service_code)?;
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement = db
        .connection
        .prepare(
            "SELECT id,service_code,name,is_system,sort_order FROM asset_catalogs
             WHERE service_code=?1 ORDER BY sort_order,name COLLATE NOCASE",
        )
        .map_err(|_| "Не вдалося прочитати каталоги служби.".to_string())?;
    let result = statement
        .query_map([service_code], |row| {
            let id = row.get::<_, i64>(0)?;
            Ok(AssetCatalog {
                id,
                service_code: row.get(1)?,
                name: row.get(2)?,
                is_system: row.get::<_, i64>(3)? != 0,
                sort_order: row.get(4)?,
                fields: catalog_fields(&db.connection, id),
            })
        })
        .map_err(|_| "Не вдалося прочитати каталоги служби.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати каталоги служби.".to_string());
    result
}

#[tauri::command]
pub fn save_asset_catalog(
    state: tauri::State<AppState>,
    catalog_id: Option<i64>,
    draft: AssetCatalogDraft,
) -> Result<i64, String> {
    validate_service_code(&draft.service_code)?;
    if draft.name.trim().is_empty() {
        return Err("Вкажіть назву каталогу.".into());
    }
    let mut seen = HashSet::new();
    for field in &draft.fields {
        let valid_key = field
            .field_key
            .chars()
            .next()
            .is_some_and(|value| value.is_ascii_lowercase())
            && field
                .field_key
                .chars()
                .all(|value| value.is_ascii_lowercase() || value.is_ascii_digit() || value == '_');
        if !valid_key || !seen.insert(field.field_key.clone()) {
            return Err("Ключі додаткових полів мають бути унікальними й містити лише малі латинські літери, цифри та підкреслення.".into());
        }
        if field.display_name.trim().is_empty() {
            return Err("Вкажіть українську назву додаткового поля.".into());
        }
    }
    let db = state.0.lock().map_err(|_| busy())?;
    let id = if let Some(id) = catalog_id {
        let system_name = db
            .connection
            .query_row(
                "SELECT name FROM asset_catalogs WHERE id=?1 AND service_code=?2 AND is_system=1",
                params![id, draft.service_code],
                |row| row.get::<_, String>(0),
            )
            .ok();
        if system_name
            .as_deref()
            .is_some_and(|name| name != draft.name.trim())
        {
            return Err("Назву системного каталогу СВТ змінювати не можна.".into());
        }
        let changed = db.connection.execute(
            "UPDATE asset_catalogs SET name=?1,updated_at=CURRENT_TIMESTAMP WHERE id=?2 AND service_code=?3",
            params![draft.name.trim(), id, draft.service_code],
        ).map_err(|_| "Каталог із такою назвою вже існує.".to_string())?;
        if changed == 0 {
            return Err("Каталог не знайдено.".into());
        }
        id
    } else {
        let sort_order = db
            .connection
            .query_row(
                "SELECT COALESCE(MAX(sort_order),0)+10 FROM asset_catalogs WHERE service_code=?1",
                [&draft.service_code],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(10);
        db.connection
            .execute(
                "INSERT INTO asset_catalogs(service_code,name,sort_order) VALUES(?1,?2,?3)",
                params![draft.service_code, draft.name.trim(), sort_order],
            )
            .map_err(|_| "Каталог із такою назвою вже існує.".to_string())?;
        db.connection.last_insert_rowid()
    };
    let previous_keys = db
        .connection
        .prepare("SELECT field_key FROM asset_catalog_fields WHERE catalog_id=?1")
        .and_then(|mut statement| {
            statement
                .query_map([id], |row| row.get::<_, String>(0))
                .and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
        })
        .unwrap_or_default();
    for (index, field) in draft.fields.iter().enumerate() {
        db.connection.execute(
            "INSERT INTO asset_catalog_fields(catalog_id,field_key,display_name,field_type,initial_value,sort_order)
             VALUES(?1,?2,?3,?4,?5,?6)
             ON CONFLICT(catalog_id,field_key) DO UPDATE SET
               display_name=excluded.display_name,field_type=excluded.field_type,
               initial_value=excluded.initial_value,sort_order=excluded.sort_order,
               updated_at=CURRENT_TIMESTAMP",
            params![id, field.field_key, field.display_name.trim(), field.field_type, field.initial_value, field.sort_order.max(index as i64)],
        ).map_err(|_| "Не вдалося зберегти поле каталогу.".to_string())?;
    }
    for key in previous_keys {
        if !seen.contains(&key) {
            db.connection
                .execute(
                    "DELETE FROM asset_catalog_fields WHERE catalog_id=?1 AND field_key=?2",
                    params![id, key],
                )
                .map_err(|_| "Не вдалося видалити поле каталогу.".to_string())?;
        }
    }
    Ok(id)
}

#[tauri::command]
pub fn delete_asset_catalog(state: tauri::State<AppState>, catalog_id: i64) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let is_system = db
        .connection
        .query_row(
            "SELECT is_system FROM asset_catalogs WHERE id=?1",
            [catalog_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|_| "Не вдалося перевірити каталог.".to_string())?;
    match is_system {
        None => Err("Каталог не знайдено.".into()),
        Some(1) => Err("Системний каталог не можна видалити.".into()),
        Some(_) => {
            db.connection
                .execute(
                    "UPDATE equipment SET catalog_id=NULL WHERE catalog_id=?1",
                    [catalog_id],
                )
                .map_err(|_| "Не вдалося від’єднати майно від каталогу.".to_string())?;
            db.connection
                .execute("DELETE FROM asset_catalogs WHERE id=?1", [catalog_id])
                .map_err(|_| "Не вдалося видалити каталог.".to_string())?;
            Ok(())
        }
    }
}

#[tauri::command]
pub fn list_service_assets(
    state: tauri::State<AppState>,
    service_code: String,
) -> Result<Vec<ServiceAsset>, String> {
    validate_service_code(&service_code)?;
    let db = state.0.lock().map_err(|_| busy())?;
    if service_code == "svt" {
        sync_vehicle_assets(&db.connection)?;
    }
    super::equipment::sync_crew_equipment_responsibles(&db.connection, None)?;
    let mut statement = db.connection.prepare(
        "SELECT e.id,e.category,e.service_code,e.catalog_id,catalog.name,e.name,e.full_name,
                e.nomenclature_number,e.inventory_number,e.serial_number,e.manufacture_year,
                e.accounting_unit,e.quantity,e.asset_value,e.status,e.crew_id,
                COALESCE(crew.name,official_crew.name),e.personnel_id,
                CASE WHEN holder.id IS NULL THEN NULL ELSE trim(holder.surname || ' ' || holder.given_name || ' ' || holder.patronymic) END,
                e.parent_equipment_id,parent.name,
                CASE WHEN e.service_code='sa_ppo' THEN CASE WHEN e.asset_kind='complex' THEN 'БпАК' WHEN e.weapon_kind='component' THEN 'Комплектуюче' ELSE 'БпЛА' END ELSE e.asset_kind END,
                e.service_data_json,e.notes,e.created_at,e.updated_at
         FROM equipment e
         LEFT JOIN asset_catalogs catalog ON catalog.id=e.catalog_id
         LEFT JOIN crews crew ON crew.id=e.crew_id
         LEFT JOIN personnel holder ON holder.id=e.personnel_id
         LEFT JOIN crew_members official_member ON official_member.personnel_id=e.personnel_id AND official_member.left_at IS NULL
         LEFT JOIN crews official_crew ON official_crew.id=official_member.crew_id
         LEFT JOIN equipment parent ON parent.id=e.parent_equipment_id
         WHERE e.service_code=?1
         GROUP BY e.id
         ORDER BY COALESCE(catalog.sort_order,0),catalog.name COLLATE NOCASE,e.name COLLATE NOCASE,e.id"
    ).map_err(|_| "Не вдалося прочитати майно служби.".to_string())?;
    let result = statement
        .query_map([service_code], |row| {
            let id = row.get::<_, i64>(0)?;
            let service_data_json = row.get::<_, String>(22)?;
            Ok(ServiceAsset {
                id,
                category: row.get(1)?,
                service_code: row.get(2)?,
                catalog_id: row.get(3)?,
                catalog_name: row.get(4)?,
                name: row.get(5)?,
                full_name: row.get(6)?,
                nomenclature_number: row.get(7)?,
                inventory_number: row.get(8)?,
                serial_number: row.get(9)?,
                manufacture_year: row.get(10)?,
                accounting_unit: row.get(11)?,
                quantity: row.get(12)?,
                value: row.get(13)?,
                status: row.get(14)?,
                crew_id: row.get(15)?,
                crew_name: row.get(16)?,
                personnel_id: row.get(17)?,
                holder_name: row.get(18)?,
                parent_equipment_id: row.get(19)?,
                parent_name: row.get(20)?,
                asset_type: row.get(21)?,
                service_data: serde_json::from_str(&service_data_json).unwrap_or_default(),
                custom_values: custom_values(&db.connection, id),
                notes: row.get(23)?,
                created_at: row.get(24)?,
                updated_at: row.get(25)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати майно служби.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати майно служби.".to_string());
    result
}

fn validate_draft(connection: &Connection, draft: &ServiceAssetDraft) -> Result<String, String> {
    validate_service_code(&draft.service_code)?;
    if draft.name.trim().is_empty() {
        return Err("Вкажіть коротку назву майна.".into());
    }
    if draft.quantity < 0.0 {
        return Err("Кількість не може бути від’ємною.".into());
    }
    let unit = normalize_unit(&draft.accounting_unit)?;
    if draft.service_code == "svt" && draft.catalog_id.is_none() {
        return Err("Для СВТ оберіть каталог: Техніка, АКБ або Шини.".into());
    }
    if let Some(catalog_id) = draft.catalog_id {
        let valid = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM asset_catalogs WHERE id=?1 AND service_code=?2)",
                params![catalog_id, draft.service_code],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            != 0;
        if !valid {
            return Err("Обраний каталог не належить цій службі.".into());
        }
    }
    if let Some(parent_id) = draft.parent_equipment_id {
        let valid = connection
            .query_row(
                "SELECT EXISTS(
               SELECT 1 FROM equipment child_parent
               LEFT JOIN asset_catalogs parent_catalog ON parent_catalog.id=child_parent.catalog_id
               WHERE child_parent.id=?1 AND child_parent.service_code=?2
                 AND CASE
                   WHEN ?2='sa_ppo' THEN child_parent.weapon_kind<>'component'
                   WHEN ?2='svt' THEN parent_catalog.name='Техніка'
                   ELSE 1 END
             )",
                params![parent_id, draft.service_code],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            != 0;
        if !valid {
            return Err("Батьківський об’єкт не знайдено в цій службі.".into());
        }
    }
    if draft.service_code == "svt" {
        let name = catalog_name(connection, draft.catalog_id);
        if name == "Техніка" {
            let registration = draft
                .service_data
                .get("registration_number")
                .map(|value| value.trim())
                .unwrap_or_default();
            if registration.is_empty() {
                return Err("Для техніки вкажіть автомобільний номерний знак.".into());
            }
        }
    }
    Ok(unit)
}

fn create_service_asset_record(
    connection: &Connection,
    draft: &ServiceAssetDraft,
) -> Result<i64, String> {
    let unit = validate_draft(connection, draft)?;
    let category = legacy_category(&draft.service_code);
    let status = if no_condition(&draft.service_code) {
        "—"
    } else {
        draft.status.trim()
    };
    let responsible = draft
        .personnel_id
        .or_else(|| official_crew_responsible(connection, draft.crew_id));
    let asset_kind = asset_kind(connection, draft);
    if draft.service_code == "svt" && asset_kind == "vehicle" {
        let registration = draft
            .service_data
            .get("registration_number")
            .cloned()
            .unwrap_or_default();
        let exists = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM vehicles WHERE registration_number=?1)",
                [registration.trim()],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            != 0;
        if exists {
            return Err("Техніка з таким номерним знаком уже є в обліку.".into());
        }
    }
    let weapon_kind = weapon_kind(connection, draft);
    let full_name = if draft.full_name.trim().is_empty() {
        draft.name.trim()
    } else {
        draft.full_name.trim()
    };
    let quantity = draft.quantity.max(0.0);
    let integral_quantity = quantity.ceil().max(1.0) as i64;
    let service_data_json = serde_json::to_string(&draft.service_data)
        .map_err(|_| "Не вдалося підготувати службові поля.".to_string())?;
    connection.execute(
        "INSERT INTO equipment(
           category,service_code,catalog_id,name,full_name,nomenclature_number,inventory_number,
           serial_number,manufacture_year,accounting_unit,quantity,asset_value,status,crew_id,
           personnel_id,responsible_manual,parent_equipment_id,asset_kind,weapon_kind,uav_type,
           service_data_json,notes,total_quantity,day_quantity,night_quantity,assigned_quantity,
           measurement_unit,stock_quantity,updated_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,0,?25,?26,?27,CURRENT_TIMESTAMP)",
        params![category,draft.service_code,draft.catalog_id,draft.name.trim(),full_name,draft.nomenclature_number.trim(),draft.inventory_number.trim(),draft.serial_number.trim(),draft.manufacture_year.trim(),unit,quantity,draft.value.max(0.0),status,draft.crew_id,responsible,i64::from(draft.personnel_id.is_some()),draft.parent_equipment_id,asset_kind,weapon_kind,draft.asset_type,service_data_json,draft.notes.trim(),integral_quantity,integral_quantity,if draft.crew_id.is_some(){integral_quantity}else{0},draft.accounting_unit.trim_end_matches('.'),quantity]
    ).map_err(|error| format!("Не вдалося додати майно служби: {error}"))?;
    let id = connection.last_insert_rowid();
    if draft.service_code == "svt" && asset_kind == "vehicle" {
        let registration = draft
            .service_data
            .get("registration_number")
            .cloned()
            .unwrap_or_default();
        if let Err(error) = connection.execute(
            "INSERT INTO vehicles(name,registration_number,status,personnel_id,crew_id,notes)
             VALUES(?1,?2,?3,?4,?5,?6)",
            params![
                draft.name.trim(),
                registration.trim(),
                status,
                responsible,
                draft.crew_id,
                draft.notes.trim()
            ],
        ) {
            connection
                .execute("DELETE FROM equipment WHERE id=?1", [id])
                .ok();
            return Err(format!("Не вдалося додати техніку до екіпажів: {error}"));
        }
        let vehicle_id = connection.last_insert_rowid();
        connection.execute(
            "UPDATE equipment SET legacy_vehicle_id=?1,inventory_number=?2,serial_number=?2 WHERE id=?3",
            params![vehicle_id,registration.trim(),id],
        ).map_err(|_| "Не вдалося зв’язати техніку з автомобілем.".to_string())?;
    }
    save_custom_values(connection, id, draft.catalog_id, &draft.custom_values)?;
    if draft.service_code == "sa_ppo" {
        if let Some(crew_id) = draft.crew_id {
            connection
                .execute(
                    "UPDATE crews SET primary_uav_id=?1 WHERE id=?2 AND primary_uav_id IS NULL",
                    params![id, crew_id],
                )
                .map_err(|_| "Не вдалося призначити основний БпЛА.".to_string())?;
        }
    }
    append_history(
        connection,
        Some(id),
        draft.name.trim(),
        &draft.service_code,
        "created",
        quantity,
        quantity,
        None,
        responsible,
        None,
        draft.crew_id,
        "Створено запис майна",
    )?;
    Ok(id)
}

#[tauri::command]
pub fn create_service_asset(
    state: tauri::State<AppState>,
    draft: ServiceAssetDraft,
) -> Result<i64, String> {
    let db = state.0.lock().map_err(|_| busy())?;
    create_service_asset_record(&db.connection, &draft)
}

#[tauri::command]
pub fn create_service_assets(
    state: tauri::State<AppState>,
    drafts: Vec<ServiceAssetDraft>,
) -> Result<Vec<i64>, String> {
    if drafts.is_empty() {
        return Err("Додайте хоча б один запис майна.".into());
    }
    if drafts.len() > 500 {
        return Err("За один раз можна додати не більше 500 записів.".into());
    }
    let mut db = state.0.lock().map_err(|_| busy())?;
    let transaction = db
        .connection
        .transaction()
        .map_err(|_| "Не вдалося почати пакетне додавання майна.".to_string())?;
    let ids = drafts
        .iter()
        .map(|draft| create_service_asset_record(&transaction, draft))
        .collect::<Result<Vec<_>, _>>()?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося зберегти пакет майна.".to_string())?;
    Ok(ids)
}

#[tauri::command]
pub fn create_uav_complex_with_children(
    state: tauri::State<AppState>,
    complex: ServiceAssetDraft,
    existing_child_ids: Vec<i64>,
    new_children: Vec<ServiceAssetDraft>,
) -> Result<i64, String> {
    if complex.service_code != "sa_ppo" || complex.asset_type != "БпАК" {
        return Err("Комплектацію можна створити лише для БпАК.".into());
    }
    let mut db = state.0.lock().map_err(|_| busy())?;
    let transaction = db
        .connection
        .transaction()
        .map_err(|_| "Не вдалося почати створення комплектації БпАК.".to_string())?;
    let parent_id = create_service_asset_record(&transaction, &complex)?;
    attach_uav_children(&transaction, parent_id, &existing_child_ids)?;
    for child in new_children {
        if child.service_code != "sa_ppo" || child.asset_type == "БпАК" {
            return Err("До комплектації можна додати лише БпЛА або комплектуюче.".into());
        }
        let mut child = child;
        child.parent_equipment_id = Some(parent_id);
        create_service_asset_record(&transaction, &child)?;
    }
    transaction
        .commit()
        .map_err(|_| "Не вдалося зберегти комплектацію БпАК.".to_string())?;
    Ok(parent_id)
}

fn attach_uav_children(
    connection: &Connection,
    parent_id: i64,
    child_ids: &[i64],
) -> Result<(), String> {
    let parent_name = connection
        .query_row(
            "SELECT name FROM equipment WHERE id=?1 AND service_code='sa_ppo' AND asset_kind='complex'",
            [parent_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "БпАК для комплектації не знайдено.".to_string())?;
    let unique = child_ids.iter().copied().collect::<HashSet<_>>();
    if unique.len() != child_ids.len() || unique.contains(&parent_id) {
        return Err("Комплектація містить дублікати або сам БпАК.".into());
    }
    for child_id in child_ids {
        let (child_name, quantity, previous_parent_id, previous_parent_name) = connection
            .query_row(
                "SELECT child.name,child.quantity,child.parent_equipment_id,COALESCE(parent.name,'')
                 FROM equipment child LEFT JOIN equipment parent ON parent.id=child.parent_equipment_id
                 WHERE child.id=?1 AND child.service_code='sa_ppo' AND child.asset_kind<>'complex'",
                [child_id],
                |row| Ok((row.get::<_, String>(0)?,row.get::<_, f64>(1)?,row.get::<_, Option<i64>>(2)?,row.get::<_, String>(3)?)),
            )
            .map_err(|_| "Один з обраних компонентів не знайдено або він є іншим БпАК.".to_string())?;
        if previous_parent_id == Some(parent_id) {
            continue;
        }
        let changed = connection
            .execute(
                "UPDATE equipment SET parent_equipment_id=?1,updated_at=CURRENT_TIMESTAMP
                 WHERE id=?2 AND service_code='sa_ppo' AND asset_kind<>'complex'",
                params![parent_id, child_id],
            )
            .map_err(|_| "Не вдалося закріпити складову за БпАК.".to_string())?;
        if changed != 1 {
            return Err("Один з обраних компонентів не знайдено або він є іншим БпАК.".into());
        }
        let details = if previous_parent_name.is_empty() {
            format!("Додано до комплектації «{parent_name}»")
        } else {
            format!("Переміщено з комплектації «{previous_parent_name}» до «{parent_name}»")
        };
        append_history(
            connection,
            Some(*child_id),
            &child_name,
            "sa_ppo",
            "reassigned",
            0.0,
            quantity,
            None,
            None,
            None,
            None,
            &details,
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_uav_complex_children(
    state: tauri::State<AppState>,
    parent_id: i64,
    child_ids: Vec<i64>,
) -> Result<(), String> {
    let mut db = state.0.lock().map_err(|_| busy())?;
    let transaction = db
        .connection
        .transaction()
        .map_err(|_| "Не вдалося почати оновлення комплектації.".to_string())?;
    let selected = child_ids.iter().copied().collect::<HashSet<_>>();
    let current_children = transaction
        .prepare("SELECT id,name,quantity FROM equipment WHERE service_code='sa_ppo' AND parent_equipment_id=?1")
        .and_then(|mut statement| statement.query_map([parent_id], |row| Ok((row.get::<_,i64>(0)?,row.get::<_,String>(1)?,row.get::<_,f64>(2)?)))?.collect::<Result<Vec<_>,_>>())
        .map_err(|_| "Не вдалося прочитати попередню комплектацію.".to_string())?;
    for (child_id, child_name, quantity) in current_children {
        if selected.contains(&child_id) {
            continue;
        }
        transaction.execute(
            "UPDATE equipment SET parent_equipment_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?1",
            [child_id],
        ).map_err(|_| "Не вдалося від’єднати складову від БпАК.".to_string())?;
        append_history(
            &transaction,
            Some(child_id),
            &child_name,
            "sa_ppo",
            "reassigned",
            0.0,
            quantity,
            None,
            None,
            None,
            None,
            "Від’єднано від комплектації БпАК",
        )?;
    }
    attach_uav_children(&transaction, parent_id, &child_ids)?;
    transaction
        .commit()
        .map_err(|_| "Не вдалося зберегти комплектацію.".to_string())
}

#[tauri::command]
pub fn update_service_asset(
    state: tauri::State<AppState>,
    equipment_id: i64,
    draft: ServiceAssetDraft,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let unit = validate_draft(&db.connection, &draft)?;
    if draft.parent_equipment_id == Some(equipment_id) {
        return Err("Об’єкт не може належати сам собі.".into());
    }
    let previous:(String,f64,Option<i64>,Option<i64>,Option<i64>)=db.connection.query_row(
        "SELECT name,quantity,personnel_id,crew_id,legacy_vehicle_id FROM equipment WHERE id=?1",
        [equipment_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?))
    ).map_err(|_|"Запис майна не знайдено.".to_string())?;
    let responsible = draft
        .personnel_id
        .or_else(|| official_crew_responsible(&db.connection, draft.crew_id));
    let category = legacy_category(&draft.service_code);
    let status = if no_condition(&draft.service_code) {
        "—"
    } else {
        draft.status.trim()
    };
    let asset_kind = asset_kind(&db.connection, &draft);
    if previous.4.is_some() && (draft.service_code != "svt" || asset_kind != "vehicle") {
        return Err(
            "Техніку, пов’язану з екіпажами, не можна перенести до іншої служби або каталогу."
                .into(),
        );
    }
    if draft.service_code == "svt" && asset_kind == "vehicle" {
        let registration = draft
            .service_data
            .get("registration_number")
            .cloned()
            .unwrap_or_default();
        let duplicate=db.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM vehicles WHERE registration_number=?1 AND (?2 IS NULL OR id<>?2))",
            params![registration.trim(),previous.4],
            |row|row.get::<_,i64>(0),
        ).unwrap_or(0)!=0;
        if duplicate {
            return Err("Техніка з таким номерним знаком уже є в обліку.".into());
        }
    }
    let weapon_kind = weapon_kind(&db.connection, &draft);
    let full_name = if draft.full_name.trim().is_empty() {
        draft.name.trim()
    } else {
        draft.full_name.trim()
    };
    let quantity = draft.quantity.max(0.0);
    let integral_quantity = quantity.ceil().max(1.0) as i64;
    let service_data_json = serde_json::to_string(&draft.service_data)
        .map_err(|_| "Не вдалося підготувати службові поля.".to_string())?;
    let changed=db.connection.execute(
        "UPDATE equipment SET category=?1,service_code=?2,catalog_id=?3,name=?4,full_name=?5,
           nomenclature_number=?6,inventory_number=?7,serial_number=?8,manufacture_year=?9,
           accounting_unit=?10,quantity=?11,asset_value=?12,status=?13,crew_id=?14,personnel_id=?15,
           responsible_manual=?16,parent_equipment_id=?17,asset_kind=?18,weapon_kind=?19,uav_type=?20,
           service_data_json=?21,notes=?22,total_quantity=?23,day_quantity=min(day_quantity,?23),
           assigned_quantity=CASE WHEN ?14 IS NULL THEN 0 ELSE ?23 END,measurement_unit=?24,
           stock_quantity=?11,updated_at=CURRENT_TIMESTAMP WHERE id=?25",
        params![category,draft.service_code,draft.catalog_id,draft.name.trim(),full_name,draft.nomenclature_number.trim(),draft.inventory_number.trim(),draft.serial_number.trim(),draft.manufacture_year.trim(),unit,quantity,draft.value.max(0.0),status,draft.crew_id,responsible,i64::from(draft.personnel_id.is_some()),draft.parent_equipment_id,asset_kind,weapon_kind,draft.asset_type,service_data_json,draft.notes.trim(),integral_quantity,draft.accounting_unit.trim_end_matches('.'),equipment_id]
    ).map_err(|error|format!("Не вдалося оновити майно служби: {error}"))?;
    if changed == 0 {
        return Err("Запис майна не знайдено.".into());
    }
    if let Some(vehicle_id) = previous.4 {
        let registration = draft
            .service_data
            .get("registration_number")
            .cloned()
            .unwrap_or_default();
        db.connection.execute(
            "UPDATE vehicles SET name=?1,registration_number=?2,status=?3,personnel_id=?4,crew_id=?5,notes=?6 WHERE id=?7",
            params![draft.name.trim(),registration.trim(),status,responsible,draft.crew_id,draft.notes.trim(),vehicle_id],
        ).map_err(|_|"Не вдалося оновити техніку. Перевірте унікальність номерного знака.".to_string())?;
        db.connection
            .execute(
                "UPDATE equipment SET inventory_number=?1,serial_number=?1 WHERE id=?2",
                params![registration.trim(), equipment_id],
            )
            .map_err(|_| "Не вдалося синхронізувати номерний знак техніки.".to_string())?;
    } else if draft.service_code == "svt" && asset_kind == "vehicle" {
        let registration = draft
            .service_data
            .get("registration_number")
            .cloned()
            .unwrap_or_default();
        db.connection.execute(
            "INSERT INTO vehicles(name,registration_number,status,personnel_id,crew_id,notes) VALUES(?1,?2,?3,?4,?5,?6)",
            params![draft.name.trim(),registration.trim(),status,responsible,draft.crew_id,draft.notes.trim()],
        ).map_err(|_|"Не вдалося додати техніку до екіпажів. Перевірте унікальність номерного знака.".to_string())?;
        let vehicle_id = db.connection.last_insert_rowid();
        db.connection.execute("UPDATE equipment SET legacy_vehicle_id=?1,inventory_number=?2,serial_number=?2 WHERE id=?3",params![vehicle_id,registration.trim(),equipment_id]).map_err(|_|"Не вдалося зв’язати техніку з автомобілем.".to_string())?;
    }
    save_custom_values(
        &db.connection,
        equipment_id,
        draft.catalog_id,
        &draft.custom_values,
    )?;
    if draft.service_code == "sa_ppo" {
        db.connection.execute("UPDATE crews SET primary_uav_id=NULL WHERE primary_uav_id=?1 AND (?2 IS NULL OR id<>?2)",params![equipment_id,draft.crew_id]).map_err(|_|"Не вдалося оновити основний БпЛА.".to_string())?;
        if let Some(crew_id) = draft.crew_id {
            db.connection
                .execute(
                    "UPDATE crews SET primary_uav_id=?1 WHERE id=?2 AND primary_uav_id IS NULL",
                    params![equipment_id, crew_id],
                )
                .map_err(|_| "Не вдалося призначити основний БпЛА.".to_string())?;
        }
    }
    let assignment_changed = previous.2 != responsible || previous.3 != draft.crew_id;
    append_history(
        &db.connection,
        Some(equipment_id),
        draft.name.trim(),
        &draft.service_code,
        if assignment_changed {
            "reassigned"
        } else {
            "updated"
        },
        quantity - previous.1,
        quantity,
        previous.2,
        responsible,
        previous.3,
        draft.crew_id,
        if assignment_changed {
            "Змінено закріплення"
        } else {
            "Оновлено дані"
        },
    )?;
    Ok(())
}

#[tauri::command]
pub fn add_service_asset_quantity(
    state: tauri::State<AppState>,
    equipment_id: i64,
    quantity: f64,
    details: String,
) -> Result<(), String> {
    if quantity <= 0.0 {
        return Err("Вкажіть кількість надходження більшу за нуль.".into());
    }
    let db = state.0.lock().map_err(|_| busy())?;
    let (name, service_code, current): (String, String, f64) = db
        .connection
        .query_row(
            "SELECT name,service_code,quantity FROM equipment WHERE id=?1",
            [equipment_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "Запис майна не знайдено.".to_string())?;
    if !matches!(service_code.as_str(), "zu" | "pmm") {
        return Err("Додавання кількості доступне лише для ЗУ та ПММ.".into());
    }
    let after = current + quantity;
    db.connection.execute("UPDATE equipment SET quantity=?1,stock_quantity=?1,total_quantity=max(1,CAST(ceil(?1) AS INTEGER)),updated_at=CURRENT_TIMESTAMP WHERE id=?2",params![after,equipment_id]).map_err(|_|"Не вдалося оприбуткувати надходження.".to_string())?;
    append_history(
        &db.connection,
        Some(equipment_id),
        &name,
        &service_code,
        "received",
        quantity,
        after,
        None,
        None,
        None,
        None,
        details.trim(),
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_service_asset(
    state: tauri::State<AppState>,
    equipment_id: i64,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| busy())?;
    let (name,service_code,quantity,personnel_id,crew_id,vehicle_id):(String,String,f64,Option<i64>,Option<i64>,Option<i64>)=db.connection.query_row("SELECT name,service_code,quantity,personnel_id,crew_id,legacy_vehicle_id FROM equipment WHERE id=?1",[equipment_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?))).map_err(|_|"Запис майна не знайдено.".to_string())?;
    append_history(
        &db.connection,
        None,
        &name,
        &service_code,
        "deleted",
        -quantity,
        0.0,
        personnel_id,
        None,
        crew_id,
        None,
        "Видалено запис майна",
    )?;
    db.connection
        .execute("DELETE FROM equipment WHERE id=?1", [equipment_id])
        .map_err(|_| "Не вдалося видалити майно. Перевірте пов’язані записи.".to_string())?;
    if let Some(vehicle_id) = vehicle_id {
        db.connection
            .execute("DELETE FROM vehicles WHERE id=?1", [vehicle_id])
            .map_err(|_| {
                "Майно видалено, але пов’язаний автомобіль використовується в інших записах."
                    .to_string()
            })?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_asset_history(
    state: tauri::State<AppState>,
    service_code: String,
    equipment_id: Option<i64>,
) -> Result<Vec<AssetHistoryEvent>, String> {
    validate_service_code(&service_code)?;
    let db = state.0.lock().map_err(|_| busy())?;
    let mut statement=db.connection.prepare(
        "SELECT h.id,h.equipment_id,h.asset_name,h.service_code,h.event_type,h.quantity_delta,h.quantity_after,
                COALESCE(trim(fp.surname || ' ' || fp.given_name || ' ' || fp.patronymic),fc.name,''),
                COALESCE(trim(tp.surname || ' ' || tp.given_name || ' ' || tp.patronymic),tc.name,''),
                h.details,h.occurred_at
         FROM asset_history h
         LEFT JOIN personnel fp ON fp.id=h.from_personnel_id LEFT JOIN personnel tp ON tp.id=h.to_personnel_id
         LEFT JOIN crews fc ON fc.id=h.from_crew_id LEFT JOIN crews tc ON tc.id=h.to_crew_id
         WHERE h.service_code=?1 AND (?2 IS NULL OR h.equipment_id=?2)
         ORDER BY h.occurred_at DESC,h.id DESC"
    ).map_err(|_|"Не вдалося прочитати історію майна.".to_string())?;
    let result = statement
        .query_map(params![service_code, equipment_id], |row| {
            Ok(AssetHistoryEvent {
                id: row.get(0)?,
                equipment_id: row.get(1)?,
                asset_name: row.get(2)?,
                service_code: row.get(3)?,
                event_type: row.get(4)?,
                quantity_delta: row.get(5)?,
                quantity_after: row.get(6)?,
                from_holder: row.get(7)?,
                to_holder: row.get(8)?,
                details: row.get(9)?,
                occurred_at: row.get(10)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати історію майна.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати історію майна.".to_string());
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_equipment_is_mapped_to_services_without_changing_ids() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO equipment(id,category,name,weapon_kind) VALUES(41,'uav','SHARK','weapon'),(42,'weapon_ammo','5.45','ammunition'),(43,'weapon_ammo','Вибуховий матеріал','component')",[]).unwrap();
        crate::database::initialise(&connection).unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT service_code FROM equipment WHERE id=41",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "sa_ppo"
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT service_code FROM equipment WHERE id=42",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "zu"
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT service_code FROM equipment WHERE id=43",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "zu"
        );
    }

    #[test]
    fn vehicle_mirror_keeps_the_operational_vehicle_identity() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO vehicles(id,name,registration_number,status) VALUES(17,'Hilux','1234 А1','Справний')",[]).unwrap();
        sync_vehicle_assets(&connection).unwrap();
        let mirror: (i64, String, String) = connection.query_row(
            "SELECT legacy_vehicle_id,service_code,json_extract(service_data_json,'$.registration_number') FROM equipment WHERE legacy_vehicle_id=17",
            [],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
        ).unwrap();
        assert_eq!(mirror, (17, "svt".into(), "1234 А1".into()));
        connection
            .execute(
                "UPDATE vehicles SET registration_number='5678 А2' WHERE id=17",
                [],
            )
            .unwrap();
        sync_vehicle_assets(&connection).unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT inventory_number FROM equipment WHERE legacy_vehicle_id=17",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "5678 А2"
        );
    }

    #[test]
    fn accounting_units_accept_old_values_without_a_dot() {
        assert_eq!(normalize_unit("шт").unwrap(), "шт.");
        assert_eq!(normalize_unit("к-т.").unwrap(), "к-т.");
    }

    #[test]
    fn uav_component_can_be_reused_by_another_complex() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::initialise(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO equipment(id,category,service_code,name,asset_kind,weapon_kind)
             VALUES(101,'uav','sa_ppo','БпАК 1','complex','weapon'),
                   (102,'uav','sa_ppo','БпАК 2','complex','weapon'),
                   (103,'uav','sa_ppo','Камера','aircraft','component')",
                [],
            )
            .unwrap();

        attach_uav_children(&connection, 101, &[103]).unwrap();
        attach_uav_children(&connection, 102, &[103]).unwrap();

        assert_eq!(
            connection
                .query_row(
                    "SELECT parent_equipment_id FROM equipment WHERE id=103",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            102,
        );
    }
}
