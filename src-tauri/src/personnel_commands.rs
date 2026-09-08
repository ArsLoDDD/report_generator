use super::*;

#[tauri::command]
pub(crate) fn list_personnel(
    state: tauri::State<AppState>,
    offset: u32,
    limit: u32,
) -> Result<personnel::PersonnelPage, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    personnel::list_page(&database.connection, offset, limit)
}

#[tauri::command]
pub(crate) fn create_personnel(
    state: tauri::State<AppState>,
    draft: personnel::PersonnelDraft,
) -> Result<personnel::Personnel, String> {
    personnel::validate(&draft)?;
    let mut database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    ensure_persistent_database(&mut database)?;
    personnel::create(&database.connection, draft)
}

#[tauri::command]
pub(crate) fn update_personnel(
    state: tauri::State<AppState>,
    personnel_id: i64,
    draft: personnel::PersonnelDraft,
) -> Result<personnel::Personnel, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    personnel::update(&database.connection, personnel_id, draft)
}

#[tauri::command]
pub(crate) fn delete_personnel(
    state: tauri::State<AppState>,
    personnel_id: i64,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    personnel::delete(&database.connection, personnel_id)
}

#[tauri::command]
pub(crate) fn import_personnel_xlsx(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    path: String,
    mode: String,
) -> Result<u32, String> {
    let data = xlsx::import(std::path::Path::new(&path))?;
    let imported_custom_fields = data
        .personnel_custom_field_maps
        .iter()
        .cloned()
        .map(|field| database::CustomFieldDefinition {
            field_key: field.field_key,
            display_name: field.display_name,
            description: field.description,
            initial_value: field.initial_value,
            scope: "personnel".into(),
        })
        .chain(data.vehicle_custom_field_maps.iter().cloned().map(|field| {
            database::CustomFieldDefinition {
                field_key: field.field_key,
                display_name: field.display_name,
                description: field.description,
                initial_value: field.initial_value,
                scope: "vehicle".into(),
            }
        }))
        .collect::<Vec<_>>();
    if !["append", "replace"].contains(&mode.as_str()) {
        return Err("Невідомий режим імпорту.".into());
    }
    let mut ids = std::collections::HashSet::new();
    if data
        .personnel
        .iter()
        .filter(|draft| !draft.tax_id.trim().is_empty())
        .any(|draft| !ids.insert(draft.tax_id.clone()))
    {
        return Err("У файлі є дублікати ІПН. Виправте їх перед імпортом.".into());
    }
    let mut vehicle_numbers = std::collections::HashSet::new();
    for vehicle in &data.vehicles {
        if vehicle.name.trim().is_empty() || vehicle.registration_number.trim().is_empty() {
            return Err(
                "На аркуші «Автомобілі» вкажіть назву та державний номер кожного автомобіля."
                    .into(),
            );
        }
        if !vehicle_numbers.insert(vehicle.registration_number.trim().to_string()) {
            return Err("На аркуші «Автомобілі» є дублікати державних номерів.".into());
        }
        if !vehicle.status.trim().is_empty()
            && !["Справний", "Потребує ремонту", "Ремонтується", "Несправний"]
                .contains(&vehicle.status.trim())
        {
            return Err("Вкажіть коректний статус автомобіля: Справний, Потребує ремонту, Ремонтується або Несправний.".into());
        }
    }
    let mut crew_names = std::collections::HashSet::new();
    for crew in &data.crews {
        if crew.name.trim().is_empty() {
            return Err("На аркуші «Екіпажі» вкажіть назву кожного екіпажу.".into());
        }
        if !crew_names.insert(crew.name.trim().to_lowercase()) {
            return Err("На аркуші «Екіпажі» є дублікати назв.".into());
        }
    }
    for equipment in &data.equipment {
        if equipment.name.trim().is_empty() {
            return Err("На аркушах майна вкажіть назву кожного запису.".into());
        }
        if equipment.category == "weapon_ammo"
            && equipment.holder_tax_id.trim().is_empty()
            && equipment.holder_full_name.trim().is_empty()
        {
            return Err(
                "Для запису на аркуші «Зброя та БК» вкажіть відповідального військовослужбовця."
                    .into(),
            );
        }
    }
    let mut db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    ensure_persistent_database(&mut db)?;
    db.connection
        .execute_batch("BEGIN IMMEDIATE")
        .map_err(|_| "Не вдалося почати імпорт.".to_string())?;
    let result = (|| -> Result<u32, String> {
        if mode == "replace" {
            db.connection.execute_batch(
                "DELETE FROM incidents; DELETE FROM positions; DELETE FROM equipment; DELETE FROM vehicles; DELETE FROM crews; DELETE FROM personnel; DELETE FROM custom_field_definitions; DELETE FROM vehicle_custom_field_definitions;",
            ).map_err(|_| "Не вдалося очистити дані перед імпортом.".to_string())?;
        }
        let ensure_custom_fields = |scope: &str,
                                    fields: &[xlsx::CustomFieldMapRow]|
         -> Result<(), String> {
            let (definitions, values) = if scope == "vehicle" {
                ("vehicle_custom_field_definitions", "vehicle_custom_fields")
            } else {
                ("custom_field_definitions", "personnel_custom_fields")
            };
            for field in fields {
                if field.field_key.trim().is_empty() {
                    continue;
                }
                db.connection.execute(
                    &format!("INSERT OR IGNORE INTO {definitions}(field_key,display_name,description,initial_value) VALUES(?1,?2,'','')"),
                    rusqlite::params![field.field_key.trim(), field.display_name.trim()],
                ).map_err(|_| "Не вдалося створити кастомне поле з Excel.".to_string())?;
                let owner = if scope == "vehicle" {
                    "vehicle_id"
                } else {
                    "personnel_id"
                };
                let source = if scope == "vehicle" {
                    "vehicles"
                } else {
                    "personnel"
                };
                db.connection.execute(
                    &format!("INSERT OR IGNORE INTO {values}({owner},field_key,field_value) SELECT id,?1,'' FROM {source}"),
                    [field.field_key.trim()],
                ).map_err(|_| "Не вдалося підготувати значення кастомного поля.".to_string())?;
            }
            Ok(())
        };
        ensure_custom_fields("personnel", &data.personnel_custom_field_maps)?;
        ensure_custom_fields("vehicle", &data.vehicle_custom_field_maps)?;
        let mut count = 0;
        for draft in data.personnel {
            personnel::create_import(&db.connection, draft)?;
            count += 1;
        }
        let personnel_id = |tax_id: &str,
                            full_name: &str|
         -> Result<Option<(i64, String)>, String> {
            if !tax_id.trim().is_empty() {
                return db
                    .connection
                    .query_row(
                        "SELECT id,position FROM personnel WHERE tax_id=?1",
                        [tax_id.trim()],
                        |row| Ok((row.get(0)?, row.get(1)?)),
                    )
                    .optional()
                    .map_err(|_| "Не вдалося знайти військовослужбовця за ІПН.".to_string());
            }
            if !full_name.trim().is_empty() {
                return db.connection.query_row("SELECT id,position FROM personnel WHERE trim(surname || ' ' || given_name || ' ' || patronymic)=?1", [full_name.trim()], |row| Ok((row.get(0)?, row.get(1)?))).optional().map_err(|_| "Не вдалося знайти військовослужбовця за ПІБ.".to_string());
            }
            Ok(None)
        };
        for crew in data.crews {
            db.connection.execute("INSERT OR IGNORE INTO crews(name,platoon,position_name,reconnaissance_area,unit_type,company_name,battle_order,sector,official_strength,status,uav_name,uav_type,functional_duties,current_location,notes) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)", rusqlite::params![crew.name.trim(),crew.platoon.trim(),crew.position_name.trim(),crew.reconnaissance_area.trim(),crew.unit_type.trim(),crew.company_name.trim(),crew.battle_order.trim(),crew.sector.trim(),crew.official_strength.parse::<i64>().unwrap_or(4),crew.status.trim(),crew.uav_name.trim(),crew.uav_type.trim(),crew.functional_duties.trim(),crew.current_location.trim(),crew.notes.trim()]).map_err(|_| "Не вдалося імпортувати екіпаж.".to_string())?;
            db.connection
                .execute(
                    "UPDATE crews SET working_strength=?1 WHERE name=?2",
                    rusqlite::params![
                        crew.working_strength
                            .parse::<i64>()
                            .map_err(|_| "Некоректна кількість в/с працює в екіпажах.")?,
                        crew.name.trim()
                    ],
                )
                .map_err(|e| e.to_string())?;
            count += 1;
        }
        for position in data.positions {
            let is_active = false;
            let position_type = match position.position_type.trim() {
                "" => "Основна",
                "В облаштуванні" => "Облаштовується",
                value => value,
            };
            if ![
                "Основна",
                "Запасна",
                "Облаштовується",
                "Виявлена ворогом",
                "Зайнята суміжниками",
            ]
            .contains(&position_type)
            {
                return Err(format!(
                    "Для позиції «{}» вказано невідомий тип.",
                    position.name
                ));
            }
            let mgrs = operations::normalise_mgrs(&position.mgrs)?;
            db.connection.execute("INSERT INTO positions(name,position_type,strip_name,locality,battle_order,sector,condition,size,mgrs,suitable_uav_text,is_active,crew_id,notes,condition_level,field_type) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,NULL,?12,?13,?14) ON CONFLICT(name) DO UPDATE SET position_type=excluded.position_type,strip_name=excluded.strip_name,locality=excluded.locality,battle_order=excluded.battle_order,condition=excluded.condition,mgrs=excluded.mgrs,notes=excluded.notes,condition_level=excluded.condition_level,field_type=excluded.field_type",rusqlite::params![position.name.trim(),position_type,position.strip_name.trim(),position.locality.trim(),position.battle_order.trim(),position.sector.trim(),position.condition.trim(),position.size.trim(),mgrs,position.suitable_uav_text.trim(),is_active,position.notes.trim(),position.condition_level.parse::<i64>().unwrap_or(0).clamp(0,100),position.field_type.trim()]).map_err(|_|"Не вдалося імпортувати позицію.".to_string())?;
            count += 1;
            db.connection.execute("UPDATE crews SET position_id=(SELECT id FROM positions WHERE name=?1) WHERE position_name=?1",[position.name.trim()]).map_err(|_|"Не вдалося відновити зв’язок екіпажів із позицією.".to_string())?;
        }
        for member in data.crew_members {
            let crew_id = db
                .connection
                .query_row(
                    "SELECT id FROM crews WHERE name=?1",
                    [member.crew_name.trim()],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(|_| "Не вдалося знайти екіпаж для його складу.".to_string())?
                .ok_or_else(|| format!("Для складу екіпажу не знайдено «{}».", member.crew_name))?;
            let person_id = personnel_id(&member.personnel_tax_id, &member.personnel_full_name)?
                .map(|value| value.0)
                .ok_or_else(|| {
                    format!(
                        "Не знайдено військовослужбовця для екіпажу «{}».",
                        member.crew_name
                    )
                })?;
            db.connection
                .execute(
                    "INSERT OR IGNORE INTO crew_members(crew_id,personnel_id) VALUES(?1,?2)",
                    rusqlite::params![crew_id, person_id],
                )
                .map_err(|_| "Не вдалося імпортувати склад екіпажу.".to_string())?;
            count += 1;
        }
        for vehicle in data.vehicles {
            let driver_id = if vehicle.driver_tax_id.trim().is_empty()
                && vehicle.driver_full_name.trim().is_empty()
            {
                None
            } else {
                let (id, position) =
                    personnel_id(&vehicle.driver_tax_id, &vehicle.driver_full_name)?.ok_or_else(
                        || {
                            format!(
                                "Для автомобіля «{}» не знайдено водія.",
                                vehicle.registration_number
                            )
                        },
                    )?;
                if !position.to_lowercase().contains("водій") {
                    return Err(format!(
                        "Закріплений за автомобілем «{}» військовослужбовець не має посади водія.",
                        vehicle.registration_number
                    ));
                }
                Some(id)
            };
            let crew_id = if vehicle.crew_name.trim().is_empty() {
                None
            } else {
                Some(
                    db.connection
                        .query_row(
                            "SELECT id FROM crews WHERE name=?1",
                            [vehicle.crew_name.trim()],
                            |row| row.get::<_, i64>(0),
                        )
                        .optional()
                        .map_err(|_| "Не вдалося знайти екіпаж автомобіля.".to_string())?
                        .ok_or_else(|| {
                            format!(
                                "Для автомобіля «{}» не знайдено екіпаж «{}».",
                                vehicle.registration_number, vehicle.crew_name
                            )
                        })?,
                )
            };
            db.connection.execute("INSERT INTO vehicles(name, registration_number, status, personnel_id, crew_id) VALUES(?1, ?2, ?3, ?4, ?5)", rusqlite::params![vehicle.name.trim(), vehicle.registration_number.trim(), if vehicle.status.trim().is_empty() { "Справний" } else { vehicle.status.trim() }, driver_id, crew_id]).map_err(|_| format!("Не вдалося додати автомобіль з номером «{}». Перевірте, чи такого номера ще немає в базі.", vehicle.registration_number))?;
            let vehicle_id = db.connection.last_insert_rowid();
            db.connection.execute("INSERT INTO vehicle_custom_fields(vehicle_id,field_key,field_value) SELECT ?1,field_key,initial_value FROM vehicle_custom_field_definitions", [vehicle_id]).map_err(|_| "Не вдалося встановити кастомні поля автомобіля.".to_string())?;
            count += 1;
        }
        for equipment in data.equipment {
            let crew_id = if equipment.crew_name.trim().is_empty() {
                None
            } else {
                Some(
                    db.connection
                        .query_row(
                            "SELECT id FROM crews WHERE name=?1",
                            [equipment.crew_name.trim()],
                            |row| row.get::<_, i64>(0),
                        )
                        .optional()
                        .map_err(|_| "Не вдалося знайти екіпаж майна.".to_string())?
                        .ok_or_else(|| {
                            format!(
                                "Для майна «{}» не знайдено екіпаж «{}».",
                                equipment.name, equipment.crew_name
                            )
                        })?,
                )
            };
            let holder_id = personnel_id(&equipment.holder_tax_id, &equipment.holder_full_name)?
                .map(|value| value.0);
            if equipment.category == "weapon_ammo" && holder_id.is_none() {
                return Err(format!(
                    "Для «{}» не знайдено відповідального військовослужбовця.",
                    equipment.name
                ));
            }
            db.connection.execute("INSERT INTO equipment(category,name,inventory_number,status,crew_id,personnel_id,notes) VALUES(?1,?2,?3,?4,?5,?6,?7)", rusqlite::params![equipment.category,equipment.name.trim(),equipment.inventory_number.trim(),if equipment.status.trim().is_empty(){"Справний"}else{equipment.status.trim()},crew_id,holder_id,equipment.notes.trim()]).map_err(|_| "Не вдалося імпортувати майно.".to_string())?;
            count += 1;
        }
        for incident in data.incidents {
            if incident.incident_type.trim().is_empty() {
                return Err("На аркуші «Інциденти» вкажіть тип інциденту.".into());
            }
            let crew_id = if incident.crew_name.trim().is_empty() {
                None
            } else {
                Some(
                    db.connection
                        .query_row(
                            "SELECT id FROM crews WHERE name=?1",
                            [incident.crew_name.trim()],
                            |row| row.get::<_, i64>(0),
                        )
                        .optional()
                        .map_err(|_| "Не вдалося знайти екіпаж інциденту.".to_string())?
                        .ok_or_else(|| {
                            format!("Для інциденту не знайдено екіпаж «{}».", incident.crew_name)
                        })?,
                )
            };
            let equipment_id = if incident.equipment_category.trim().is_empty()
                && incident.equipment_inventory_number.trim().is_empty()
                && incident.equipment_name.trim().is_empty()
            {
                None
            } else {
                db.connection.query_row("SELECT id FROM equipment WHERE category=?1 AND ((?2 <> '' AND inventory_number=?2) OR (?2 = '' AND name=?3)) ORDER BY id LIMIT 1", rusqlite::params![incident.equipment_category.trim(),incident.equipment_inventory_number.trim(),incident.equipment_name.trim()], |row| row.get::<_,i64>(0)).optional().map_err(|_| "Не вдалося знайти майно інциденту.".to_string())?
            };
            let snapshot = crew_id
                .map(|id| {
                    operations::crew_members(&db.connection, id)
                        .unwrap_or_default()
                        .into_iter()
                        .map(|member| member.full_name)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            db.connection.execute("INSERT INTO incidents(incident_type,occurred_at,crew_id,equipment_id,position_name,reconnaissance_area,crew_snapshot,description) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",rusqlite::params![incident.incident_type.trim(),incident.occurred_at.trim(),crew_id,equipment_id,incident.position_name.trim(),incident.reconnaissance_area.trim(),snapshot,incident.description.trim()]).map_err(|_| "Не вдалося імпортувати інцидент.".to_string())?;
            count += 1;
        }
        for row in data.personnel_custom_fields {
            let person_id = personnel_id(&row.owner_key, "")?
                .or(personnel_id("", &row.owner_key)?)
                .map(|value| value.0)
                .ok_or_else(|| {
                    format!(
                        "Не знайдено військовослужбовця для кастомних полів «{}».",
                        row.owner_key
                    )
                })?;
            for (key, value) in row.values {
                db.connection.execute("INSERT INTO personnel_custom_fields(personnel_id,field_key,field_value) VALUES(?1,?2,?3) ON CONFLICT(personnel_id,field_key) DO UPDATE SET field_value=excluded.field_value", rusqlite::params![person_id,key,value]).map_err(|_| "Не вдалося зберегти кастомне поле військовослужбовця.".to_string())?;
            }
        }
        for row in data.vehicle_custom_fields {
            let vehicle_id = db
                .connection
                .query_row(
                    "SELECT id FROM vehicles WHERE registration_number=?1",
                    [row.owner_key.trim()],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(|_| "Не вдалося знайти автомобіль для кастомних полів.".to_string())?
                .ok_or_else(|| "Не знайдено автомобіль для кастомних полів.".to_string())?;
            for (key, value) in row.values {
                db.connection.execute("INSERT INTO vehicle_custom_fields(vehicle_id,field_key,field_value) VALUES(?1,?2,?3) ON CONFLICT(vehicle_id,field_key) DO UPDATE SET field_value=excluded.field_value", rusqlite::params![vehicle_id,key,value]).map_err(|_| "Не вдалося зберегти кастомне поле автомобіля.".to_string())?;
            }
        }
        staffing_exchange::import(&db.connection, &data.staffing, mode == "replace")?;
        Ok(count)
    })();
    match result {
        Ok(count) => {
            db.connection
                .execute_batch("COMMIT")
                .map_err(|_| "Не вдалося завершити імпорт.".to_string())?;
            if mode == "replace" || !imported_custom_fields.is_empty() {
                let root = application_root(&app)?;
                let fields = if mode == "replace" {
                    imported_custom_fields
                } else {
                    let mut fields =
                        database::load_custom_fields_file(&root, CUSTOM_VARIABLES_FILE_NAME)
                            .unwrap_or_default();
                    for imported in imported_custom_fields {
                        if let Some(existing) = fields.iter_mut().find(|field| {
                            field.field_key == imported.field_key && field.scope == imported.scope
                        }) {
                            *existing = imported;
                        } else {
                            fields.push(imported);
                        }
                    }
                    fields
                };
                database::replace_custom_fields_file(&root, CUSTOM_VARIABLES_FILE_NAME, fields)?;
            }
            Ok(count)
        }
        Err(error) => {
            let _ = db.connection.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}

#[tauri::command]
pub(crate) fn export_personnel_xlsx(
    state: tauri::State<AppState>,
    path: String,
) -> Result<(), String> {
    let path = PathBuf::from(path);
    let db = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let people = personnel::list(&db.connection)?;
    let mut statement = db.connection.prepare("SELECT v.name,v.registration_number,v.status,COALESCE(p.tax_id,''),COALESCE(trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic),''),COALESCE(c.name,'') FROM vehicles v LEFT JOIN personnel p ON p.id=v.personnel_id LEFT JOIN crews c ON c.id=v.crew_id ORDER BY v.id").map_err(|_| "Не вдалося прочитати автомобілі для експорту.".to_string())?;
    let vehicles = statement
        .query_map([], |row| {
            Ok(xlsx::VehicleRow {
                name: row.get(0)?,
                registration_number: row.get(1)?,
                status: row.get(2)?,
                driver_tax_id: row.get(3)?,
                driver_full_name: row.get(4)?,
                crew_name: row.get(5)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати автомобілі для експорту.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати автомобілі для експорту.".to_string())?;
    let personnel_custom_maps = database::list_custom_fields(&db.connection)?
        .into_iter()
        .map(|field| xlsx::CustomFieldMapRow {
            display_name: field.display_name,
            field_key: field.field_key,
            description: field.description,
            initial_value: field.initial_value,
        })
        .collect::<Vec<_>>();
    let vehicle_custom_maps = database::list_vehicle_custom_fields(&db.connection)?
        .into_iter()
        .map(|field| xlsx::CustomFieldMapRow {
            display_name: field.display_name,
            field_key: field.field_key,
            description: field.description,
            initial_value: field.initial_value,
        })
        .collect::<Vec<_>>();
    let custom_rows = |query: &str| -> Result<Vec<xlsx::CustomValueRow>, String> {
        let mut statement = db
            .connection
            .prepare(query)
            .map_err(|_| "Не вдалося прочитати кастомні поля для Excel.".to_string())?;
        let entries = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|_| "Не вдалося прочитати кастомні поля для Excel.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати кастомні поля для Excel.".to_string())?;
        let mut grouped =
            std::collections::BTreeMap::<String, std::collections::HashMap<String, String>>::new();
        for (owner, key, value) in entries {
            grouped.entry(owner).or_default().insert(key, value);
        }
        Ok(grouped
            .into_iter()
            .map(|(owner_key, values)| xlsx::CustomValueRow { owner_key, values })
            .collect())
    };
    let personnel_custom_values = custom_rows("SELECT CASE WHEN p.tax_id<>'' THEN p.tax_id ELSE trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) END,v.field_key,v.field_value FROM personnel_custom_fields v JOIN personnel p ON p.id=v.personnel_id")?;
    let vehicle_custom_values = custom_rows("SELECT v.registration_number,c.field_key,c.field_value FROM vehicle_custom_fields c JOIN vehicles v ON v.id=c.vehicle_id")?;
    let crews = db
        .connection
        .prepare("SELECT c.name,c.platoon,COALESCE(p.name,c.position_name),COALESCE(p.locality,c.reconnaissance_area),c.unit_type,c.company_name,COALESCE(p.battle_order,c.battle_order),c.sector,c.official_strength,c.status,c.uav_name,c.uav_type,c.functional_duties,c.current_location,c.notes,(SELECT COUNT(*) FROM crew_actual_members am WHERE am.crew_id=c.id) FROM crews c LEFT JOIN positions p ON p.id=c.position_id ORDER BY c.id")
        .map_err(|_| "Не вдалося прочитати екіпажі для експорту.".to_string())?
        .query_map([], |row| {
            Ok(xlsx::CrewRow {
                working_strength:row.get::<_,i64>(15)?.to_string(),
                name: row.get(0)?,
                platoon: row.get(1)?,
                position_name: row.get(2)?,
                reconnaissance_area: row.get(3)?,
                unit_type:row.get(4)?,company_name:row.get(5)?,battle_order:row.get(6)?,sector:row.get(7)?,official_strength:row.get::<_,i64>(8)?.to_string(),status:row.get(9)?,uav_name:row.get(10)?,uav_type:row.get(11)?,functional_duties:row.get(12)?,current_location:row.get(13)?,notes:row.get(14)?,
            })
        })
        .map_err(|_| "Не вдалося прочитати екіпажі для експорту.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Не вдалося прочитати екіпажі для експорту.".to_string())?;
    let crew_members = db.connection.prepare("SELECT c.name,COALESCE(p.tax_id,''),trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) FROM crew_members cm JOIN crews c ON c.id=cm.crew_id JOIN personnel p ON p.id=cm.personnel_id WHERE cm.left_at IS NULL ORDER BY cm.id").map_err(|_| "Не вдалося прочитати склад екіпажів для експорту.".to_string())?.query_map([], |row| Ok(xlsx::CrewMemberRow { crew_name:row.get(0)?,personnel_tax_id:row.get(1)?,personnel_full_name:row.get(2)? })).map_err(|_| "Не вдалося прочитати склад екіпажів для експорту.".to_string())?.collect::<Result<Vec<_>,_>>().map_err(|_| "Не вдалося прочитати склад екіпажів для експорту.".to_string())?;
    let equipment = db.connection.prepare("SELECT e.category,e.name,e.inventory_number,e.status,COALESCE(c.name,''),COALESCE(p.tax_id,''),COALESCE(trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic),''),e.notes FROM equipment e LEFT JOIN crews c ON c.id=e.crew_id LEFT JOIN personnel p ON p.id=e.personnel_id ORDER BY e.id").map_err(|_| "Не вдалося прочитати майно для експорту.".to_string())?.query_map([], |row| Ok(xlsx::EquipmentRow { category:row.get(0)?,name:row.get(1)?,inventory_number:row.get(2)?,status:row.get(3)?,crew_name:row.get(4)?,holder_tax_id:row.get(5)?,holder_full_name:row.get(6)?,notes:row.get(7)? })).map_err(|_| "Не вдалося прочитати майно для експорту.".to_string())?.collect::<Result<Vec<_>,_>>().map_err(|_| "Не вдалося прочитати майно для експорту.".to_string())?;
    let incidents = db.connection.prepare("SELECT i.incident_type,i.occurred_at,COALESCE(c.name,''),COALESCE(e.category,''),COALESCE(e.inventory_number,''),COALESCE(e.name,''),i.position_name,i.reconnaissance_area,i.description FROM incidents i LEFT JOIN crews c ON c.id=i.crew_id LEFT JOIN equipment e ON e.id=i.equipment_id ORDER BY i.id").map_err(|_| "Не вдалося прочитати інциденти для експорту.".to_string())?.query_map([], |row| Ok(xlsx::IncidentRow { incident_type:row.get(0)?,occurred_at:row.get(1)?,crew_name:row.get(2)?,equipment_category:row.get(3)?,equipment_inventory_number:row.get(4)?,equipment_name:row.get(5)?,position_name:row.get(6)?,reconnaissance_area:row.get(7)?,description:row.get(8)? })).map_err(|_| "Не вдалося прочитати інциденти для експорту.".to_string())?.collect::<Result<Vec<_>,_>>().map_err(|_| "Не вдалося прочитати інциденти для експорту.".to_string())?;
    let positions=db.connection.prepare("SELECT p.name,p.position_type,p.strip_name,p.locality,p.battle_order,p.sector,p.condition,p.condition_level,p.field_type,p.size,p.mgrs,p.suitable_uav_text,p.is_active,COALESCE(GROUP_CONCAT(c.name, ', '),''),p.notes FROM positions p LEFT JOIN crews c ON c.position_id=p.id GROUP BY p.id ORDER BY p.id").map_err(|_|"Не вдалося прочитати позиції для експорту.".to_string())?.query_map([],|row|Ok(xlsx::PositionRow{name:row.get(0)?,position_type:row.get(1)?,strip_name:row.get(2)?,locality:row.get(3)?,battle_order:row.get(4)?,sector:row.get(5)?,condition:row.get(6)?,condition_level:row.get::<_,i64>(7)?.to_string(),field_type:row.get(8)?,size:row.get(9)?,mgrs:row.get(10)?,suitable_uav_text:row.get(11)?,is_active:if row.get::<_,bool>(12)?{"Так".into()}else{"Ні".into()},crew_name:row.get(13)?,notes:row.get(14)?})).map_err(|_|"Не вдалося прочитати позиції для експорту.".to_string())?.collect::<Result<Vec<_>,_>>().map_err(|_|"Не вдалося прочитати позиції для експорту.".to_string())?;
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        xlsx::export_with_staffing(
            &path,
            &people,
            &vehicles,
            &personnel_custom_maps,
            &personnel_custom_values,
            &vehicle_custom_maps,
            &vehicle_custom_values,
            &crews,
            &crew_members,
            &equipment,
            &incidents,
            &positions,
            &staffing_exchange::export(&db.connection)?,
        )
    }))
    .map_err(|_| "Не вдалося сформувати Excel-файл: внутрішня помилка архіву.".to_string())??;
    Ok(())
}

#[tauri::command]
pub(crate) fn export_bcs_excel(
    app: tauri::AppHandle,
    path: String,
    unit_name: String,
    date: String,
    rows: Vec<xlsx::BcsRow>,
) -> Result<(), String> {
    let root = application_root(&app)?;
    let unit = settings::load(&root)?.unit;
    xlsx::export_bcs(
        Path::new(&path),
        if unit_name.trim().is_empty() {
            &unit.short_name
        } else {
            unit_name.trim()
        },
        &date,
        unit.authorized_strength,
        &rows,
    )
}

#[tauri::command]
pub(crate) fn list_custom_fields(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<Vec<database::CustomFieldDefinition>, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    let root = application_root(&app)?;
    let mut fields = database::list_custom_fields(&database.connection)?;
    if root.join(CUSTOM_VARIABLES_FILE_NAME).exists() {
        for file_field in database::load_custom_fields_file(&root, CUSTOM_VARIABLES_FILE_NAME)? {
            if let Some(existing) = fields
                .iter_mut()
                .find(|field| field.field_key == file_field.field_key)
            {
                *existing = file_field;
            } else {
                fields.push(file_field);
            }
        }
    }
    fields.sort_by(|left, right| {
        left.display_name
            .to_lowercase()
            .cmp(&right.display_name.to_lowercase())
    });
    Ok(fields)
}

#[tauri::command]
pub(crate) fn list_personnel_fields(
    state: tauri::State<AppState>,
) -> Result<Vec<database::CustomFieldDefinition>, String> {
    let _database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    Ok(database::STANDARD_EXTRA_FIELDS
        .iter()
        .map(
            |(field_key, display_name)| database::CustomFieldDefinition {
                field_key: (*field_key).into(),
                display_name: (*display_name).into(),
                description: "Основне поле особового складу".into(),
                initial_value: String::new(),
                scope: "personnel".into(),
            },
        )
        .collect())
}

#[tauri::command]
pub(crate) fn create_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    field: database::CustomFieldDefinition,
) -> Result<database::CustomFieldDefinition, String> {
    let mut database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    ensure_persistent_database(&mut database)?;
    let root = application_root(&app)?;
    let seed_existing = if root.join(CUSTOM_VARIABLES_FILE_NAME).exists() {
        Vec::new()
    } else {
        database::list_custom_fields(&database.connection)?
    };
    let saved = database::create_custom_field(&database.connection, field)?;
    for existing in seed_existing {
        database::save_custom_field_file(&root, CUSTOM_VARIABLES_FILE_NAME, &existing)?;
    }
    database::save_custom_field_file(&root, CUSTOM_VARIABLES_FILE_NAME, &saved)?;
    Ok(saved)
}

#[tauri::command]
pub(crate) fn update_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    field: database::CustomFieldDefinition,
) -> Result<database::CustomFieldDefinition, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    let saved = database::update_custom_field(&database.connection, field)?;
    let root = application_root(&app)?;
    database::save_custom_field_file(&root, CUSTOM_VARIABLES_FILE_NAME, &saved)?;
    Ok(saved)
}

#[tauri::command]
pub(crate) fn delete_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    field_key: String,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    database::delete_custom_field(&database.connection, &field_key)?;
    let root = application_root(&app)?;
    database::remove_custom_field_file(&root, CUSTOM_VARIABLES_FILE_NAME, &field_key, "personnel")
}

#[tauri::command]
pub(crate) fn list_vehicle_custom_fields(
    state: tauri::State<AppState>,
) -> Result<Vec<database::CustomFieldDefinition>, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    database::list_vehicle_custom_fields(&database.connection)
}
#[tauri::command]
pub(crate) fn create_vehicle_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    mut field: database::CustomFieldDefinition,
) -> Result<database::CustomFieldDefinition, String> {
    let mut database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    ensure_persistent_database(&mut database)?;
    field.scope = "vehicle".into();
    let saved = database::create_vehicle_custom_field(&database.connection, field)?;
    database::save_custom_field_file(&application_root(&app)?, CUSTOM_VARIABLES_FILE_NAME, &saved)?;
    Ok(saved)
}
#[tauri::command]
pub(crate) fn update_vehicle_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    mut field: database::CustomFieldDefinition,
) -> Result<database::CustomFieldDefinition, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    field.scope = "vehicle".into();
    let saved = database::update_vehicle_custom_field(&database.connection, field)?;
    database::save_custom_field_file(&application_root(&app)?, CUSTOM_VARIABLES_FILE_NAME, &saved)?;
    Ok(saved)
}
#[tauri::command]
pub(crate) fn delete_vehicle_custom_field(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    field_key: String,
) -> Result<(), String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    database::delete_vehicle_custom_field(&database.connection, &field_key)?;
    database::remove_custom_field_file(
        &application_root(&app)?,
        CUSTOM_VARIABLES_FILE_NAME,
        &field_key,
        "vehicle",
    )
}
