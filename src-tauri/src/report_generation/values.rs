use super::*;

pub(super) fn selected_personnel(c: &Connection, ids: &[i64]) -> Result<Vec<Personnel>, String> {
    let all = personnel::list(c)?;
    ids.iter()
        .map(|id| {
            all.iter()
                .find(|p| p.id == *id)
                .cloned()
                .ok_or_else(|| "Не знайдено обраного військовослужбовця.".into())
        })
        .collect()
}
pub(super) fn values_for(
    connection: &Connection,
    people: &[Personnel],
    s: &settings::AppSettings,
    date: Option<&str>,
    selected_vehicle_id: Option<i64>,
) -> Result<HashMap<String, Value>, String> {
    let mut map = HashMap::new();
    for (i, p) in people.iter().enumerate() {
        let prefix = format!("військовий_{}", i + 1);
        let gender = detect_gender(&p.gender, &p.patronymic);
        let crew: Option<(String, String, String, String, String, String)> = connection
            .query_row(
                "SELECT c.name,COALESCE(position.name,c.position_name),c.status,c.sector,c.uav_name,c.uav_type FROM crew_members member JOIN crews c ON c.id=member.crew_id LEFT JOIN positions position ON position.id=c.position_id WHERE member.personnel_id=?1 AND member.left_at IS NULL ORDER BY member.joined_at DESC LIMIT 1",
                [p.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .ok();
        let actual_crew: Option<(String, String, String, String, String, String)> = connection
            .query_row(
                "SELECT c.name,COALESCE(position.name,c.position_name),c.status,c.sector,c.uav_name,c.uav_type FROM crew_actual_members member JOIN crews c ON c.id=member.crew_id LEFT JOIN positions position ON position.id=c.position_id WHERE member.personnel_id=?1 LIMIT 1",
                [p.id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .ok();
        for field in &registry().person_fields {
            let source_key = field.source_key.as_deref().unwrap_or_default();
            let text = match source_key {
                "crew_name" => crew
                    .as_ref()
                    .map(|value| value.0.clone())
                    .unwrap_or_default(),
                "crew_position" => crew
                    .as_ref()
                    .map(|value| value.1.clone())
                    .unwrap_or_default(),
                "crew_status" => crew
                    .as_ref()
                    .map(|value| value.2.clone())
                    .unwrap_or_default(),
                "crew_sector" => crew
                    .as_ref()
                    .map(|value| value.3.clone())
                    .unwrap_or_default(),
                "crew_uav_name" => crew
                    .as_ref()
                    .map(|value| value.4.clone())
                    .unwrap_or_default(),
                "crew_uav_type" => crew
                    .as_ref()
                    .map(|value| value.5.clone())
                    .unwrap_or_default(),
                "actual_crew_name" => actual_crew
                    .as_ref()
                    .map(|value| value.0.clone())
                    .unwrap_or_default(),
                "actual_crew_position" => actual_crew
                    .as_ref()
                    .map(|value| value.1.clone())
                    .unwrap_or_default(),
                "actual_crew_status" => actual_crew
                    .as_ref()
                    .map(|value| value.2.clone())
                    .unwrap_or_default(),
                "actual_crew_sector" => actual_crew
                    .as_ref()
                    .map(|value| value.3.clone())
                    .unwrap_or_default(),
                "actual_crew_uav_name" => actual_crew
                    .as_ref()
                    .map(|value| value.4.clone())
                    .unwrap_or_default(),
                "actual_crew_uav_type" => actual_crew
                    .as_ref()
                    .map(|value| value.5.clone())
                    .unwrap_or_default(),
                _ => person_value(p, source_key),
            };
            map.insert(
                format!("{prefix}_{}", field.id),
                Value::new(text, &field.kind, gender),
            );
        }
        add_person_vehicles(connection, p.id, i + 1, &mut map)?;
    }
    let vehicle_id = selected_vehicle_id.or_else(|| {
        people.first().and_then(|person| {
            connection
                .query_row(
                    "SELECT id FROM vehicles WHERE personnel_id=?1 LIMIT 1",
                    [person.id],
                    |row| row.get(0),
                )
                .ok()
        })
    });
    if let Some(vehicle_id) = vehicle_id {
        if let Ok((name, number, status)) = connection.query_row(
            "SELECT name, registration_number, status FROM vehicles WHERE id=?1",
            [vehicle_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        ) {
            for field in &registry().vehicle_fields {
                let text = match field.source_key.as_deref() {
                    Some("name") => name.clone(),
                    Some("registration_number") => number.clone(),
                    Some("status") => status.clone(),
                    _ => String::new(),
                };
                map.insert(
                    format!("автомобіль_{}", field.id),
                    Value::new(text, &field.kind, None),
                );
            }
            let mut statement = connection.prepare("SELECT d.display_name, v.field_value FROM vehicle_custom_fields v JOIN vehicle_custom_field_definitions d ON d.field_key=v.field_key WHERE v.vehicle_id=?1").map_err(|_| "Не вдалося прочитати додаткові поля автомобіля.".to_string())?;
            let rows = statement
                .query_map([vehicle_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|_| "Не вдалося прочитати додаткові поля автомобіля.".to_string())?;
            for row in rows {
                let (display_name, value) =
                    row.map_err(|_| "Не вдалося прочитати додаткове поле автомобіля.".to_string())?;
                map.insert(
                    format!("автомобіль_{}", custom_template_id(&display_name)),
                    Value::new(value, "text", None),
                );
            }
        }
    }
    let mut roles = s.signer_roles.clone();
    for (id, legacy) in [
        ("основний_підписант", &s.main_signer),
        ("командир", &s.commander),
        ("начальник_штабу", &s.chief),
        ("заступник_ппп", &s.deputy_ppp),
        ("заступник_озброєння", &s.deputy_armament),
        ("заступник_тилу", &s.deputy_rear),
        ("начальник_пмм", &s.fuel_chief),
    ] {
        if !legacy.full_name.trim().is_empty() {
            if let Some(role) = roles.iter_mut().find(|role| role.id == id) {
                // A dynamic role is authoritative. Legacy fields are used
                // only when opening an older settings object without values
                // in the dynamic role yet.
                if role.signer.full_name.trim().is_empty() {
                    role.signer = legacy.clone();
                }
            }
        }
    }
    for role in &roles {
        add_signer(&mut map, &role.id, &role.signer)
    }
    let date = match date.filter(|v| !v.is_empty()) {
        Some(v) => NaiveDate::parse_from_str(v, "%Y-%m-%d")
            .map_err(|_| "Не вдалося прочитати дату рапорту.".to_string())?,
        None => Local::now().date_naive(),
    };
    map.insert(
        "дата_рапорту".into(),
        Value::new(date.format("%d.%m.%Y року").to_string(), "date", None),
    );
    Ok(map)
}

pub(super) fn add_generation_parameters(
    values: &mut HashMap<String, Value>,
    parameters: &HashMap<String, String>,
    legacy_date: Option<&str>,
) -> Result<(), String> {
    for (token, raw) in parameters {
        let field = document_field_for(token);
        if field.is_none() && !dynamic_document_parameter(token) {
            continue;
        }
        let text = match field.and_then(|item| item.input_type.as_deref()) {
            Some("date") => NaiveDate::parse_from_str(raw, "%Y-%m-%d")
                .map(|date| date.format("%d.%m.%Y року").to_string())
                .map_err(|_| format!("Параметр «{token}» має містити коректну дату."))?,
            Some("datetime-local") => chrono::NaiveDateTime::parse_from_str(raw, "%Y-%m-%dT%H:%M")
                .map(|value| value.format("%d.%m.%Y %H:%M").to_string())
                .map_err(|_| format!("Параметр «{token}» має містити коректні дату й час."))?,
            _ => raw.trim().to_string(),
        };
        let gender = document_person_gender(parameters, token);
        let kind = field.map(|item| item.kind.as_str()).unwrap_or("text");
        values.insert(token.clone(), Value::new(text, kind, gender));
    }
    if !parameters.contains_key("дата_рапорту") {
        if let Some(raw) = legacy_date.filter(|value| !value.is_empty()) {
            let date = NaiveDate::parse_from_str(raw, "%Y-%m-%d")
                .map_err(|_| "Не вдалося прочитати дату рапорту.".to_string())?;
            values.insert(
                "дата_рапорту".into(),
                Value::new(date.format("%d.%m.%Y року").to_string(), "date", None),
            );
        }
    }
    Ok(())
}

/// Document parameters for a person are independent fields, but their common
/// numeric suffix lets rank/name declension use the patronymic entered for the
/// same person (for example `піб_військовий_1` and `звання_військовий_1`).
pub(super) fn document_person_gender(
    parameters: &HashMap<String, String>,
    token: &str,
) -> Option<&'static str> {
    let (base, number) = token.rsplit_once('_')?;
    if number
        .parse::<usize>()
        .ok()
        .filter(|number| *number > 0)
        .is_none()
        || !matches!(
            base,
            "піб_військовий"
                | "прізвище_військовий"
                | "імя_військовий"
                | "по_батькові_військовий"
                | "звання_військовий"
                | "посада_військовий"
        )
    {
        return None;
    }
    let values = [
        parameters.get(&format!("по_батькові_військовий_{number}")),
        parameters.get(&format!("піб_військовий_{number}")),
    ];
    values.into_iter().flatten().find_map(|value| {
        value
            .split_whitespace()
            .find_map(|word| detect_gender("", word))
    })
}

pub(super) fn add_person_vehicles(
    connection: &Connection,
    personnel_id: i64,
    person_number: usize,
    map: &mut HashMap<String, Value>,
) -> Result<(), String> {
    let mut statement = connection.prepare("SELECT vehicle.id,vehicle.name,vehicle.registration_number,vehicle.status,trim(person.surname || ' ' || person.given_name || ' ' || person.patronymic),person.rank,person.position,COALESCE(crew.name,'') FROM vehicles vehicle JOIN personnel person ON person.id=vehicle.personnel_id LEFT JOIN crews crew ON crew.id=vehicle.crew_id WHERE vehicle.personnel_id=?1 ORDER BY vehicle.id")
        .map_err(|_| "Не вдалося прочитати автомобілі військовослужбовця.".to_string())?;
    let vehicles = statement
        .query_map([personnel_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
            ))
        })
        .map_err(|_| "Не вдалося прочитати автомобілі військовослужбовця.".to_string())?;
    for (vehicle_number, vehicle) in vehicles.enumerate() {
        let (id, name, registration, status, driver_name, driver_rank, driver_position, crew_name) =
            vehicle
                .map_err(|_| "Не вдалося прочитати автомобіль військовослужбовця.".to_string())?;
        let prefix = format!(
            "військовий_{person_number}_автомобіль_{}",
            vehicle_number + 1
        );
        for field in &registry().vehicle_fields {
            let text = match field.source_key.as_deref() {
                Some("name") => name.clone(),
                Some("registration_number") => registration.clone(),
                Some("status") => status.clone(),
                Some("driver_full_name") => driver_name.clone(),
                Some("driver_rank") => driver_rank.clone(),
                Some("driver_position") => driver_position.clone(),
                Some("crew_name") => crew_name.clone(),
                _ => String::new(),
            };
            map.insert(
                format!("{prefix}_{}", field.id),
                Value::new(text, &field.kind, None),
            );
        }
        let mut fields = connection.prepare("SELECT d.display_name, v.field_value FROM vehicle_custom_fields v JOIN vehicle_custom_field_definitions d ON d.field_key=v.field_key WHERE v.vehicle_id=?1")
            .map_err(|_| "Не вдалося прочитати додаткові поля автомобіля.".to_string())?;
        let rows = fields
            .query_map([id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| "Не вдалося прочитати додаткові поля автомобіля.".to_string())?;
        for row in rows {
            let (display_name, value) =
                row.map_err(|_| "Не вдалося прочитати додаткове поле автомобіля.".to_string())?;
            map.insert(
                format!("{prefix}_{}", custom_template_id(&display_name)),
                Value::new(value, "text", None),
            );
        }
    }
    Ok(())
}

fn crew_equipment_text(
    connection: &Connection,
    crew_id: i64,
    category: &str,
) -> Result<String, String> {
    let mut statement = connection
        .prepare(
            "SELECT trim(e.name || CASE WHEN trim(e.inventory_number)='' THEN '' ELSE ' ' || e.inventory_number END)
             FROM equipment e
             WHERE (e.crew_id=?1 OR e.personnel_id IN (
                 SELECT personnel_id FROM crew_members WHERE crew_id=?1 AND left_at IS NULL
                 UNION
                 SELECT personnel_id FROM crew_actual_members WHERE crew_id=?1
             ))
             AND (?2='' OR e.category=?2)
             ORDER BY e.id",
        )
        .map_err(|_| "Не вдалося прочитати майно екіпажу.".to_string())?;
    let rows = statement
        .query_map(rusqlite::params![crew_id, category], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|_| "Не вдалося прочитати майно екіпажу.".to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map(|items| items.join(", "))
        .map_err(|_| "Не вдалося прочитати майно екіпажу.".to_string())
}

fn crew_members_for_position(
    connection: &Connection,
    crew_id: i64,
    lower_pattern: &str,
    title_pattern: &str,
) -> String {
    connection
        .prepare(
            "SELECT full_name FROM (
                 SELECT trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) AS full_name,
                        p.position AS position, 0 AS membership_priority, p.id AS personnel_id
                 FROM crew_members member
                 JOIN personnel p ON p.id=member.personnel_id
                 WHERE member.crew_id=?1 AND member.left_at IS NULL
                 UNION ALL
                 SELECT trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic),
                        p.position, 1, p.id
                 FROM crew_actual_members member
                 JOIN personnel p ON p.id=member.personnel_id
                 WHERE member.crew_id=?1
                   AND NOT EXISTS (
                     SELECT 1 FROM crew_members official
                     WHERE official.crew_id=?1
                       AND official.personnel_id=member.personnel_id
                       AND official.left_at IS NULL
                   )
             )
             WHERE position LIKE ?2 OR position LIKE ?3
             ORDER BY membership_priority,personnel_id",
        )
        .and_then(|mut statement| {
            statement
                .query_map(
                    rusqlite::params![crew_id, lower_pattern, title_pattern],
                    |row| row.get::<_, String>(0),
                )?
                .collect::<Result<Vec<_>, _>>()
        })
        .map(|items| items.join(", "))
        .unwrap_or_default()
}

#[allow(clippy::type_complexity)]
pub(super) fn add_selected_crews(
    connection: &Connection,
    crew_ids: &[i64],
    values: &mut HashMap<String, Value>,
) -> Result<(), String> {
    for (index, crew_id) in crew_ids.iter().enumerate() {
        let row: (String,String,String,String,String,String,String,String,i64,String,String,String,String,String,String) = connection
            .query_row(
                "SELECT c.name,c.platoon,COALESCE(p.name,c.position_name),COALESCE(p.locality,c.reconnaissance_area),c.unit_type,c.company_name,COALESCE(p.battle_order,c.battle_order),c.sector,(SELECT COUNT(*) FROM crew_members cm WHERE cm.crew_id=c.id AND cm.left_at IS NULL),c.status,c.uav_name,c.uav_type,c.functional_duties,c.current_location,c.notes FROM crews c LEFT JOIN positions p ON p.id=c.position_id WHERE c.id=?1",
                [crew_id],
                |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?,r.get(8)?,r.get(9)?,r.get(10)?,r.get(11)?,r.get(12)?,r.get(13)?,r.get(14)?)),
            )
            .map_err(|_| "Не вдалося прочитати вибраний екіпаж.".to_string())?;
        let members = connection.prepare("SELECT trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) FROM crew_members cm JOIN personnel p ON p.id=cm.personnel_id WHERE cm.crew_id=?1 AND cm.left_at IS NULL ORDER BY cm.joined_at,p.id")
            .map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string())?
            .query_map([crew_id], |row| row.get::<_, String>(0)).map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string())?
            .collect::<Result<Vec<_>, _>>().map_err(|_| "Не вдалося прочитати склад екіпажу.".to_string())?.join(", ");
        let actual_members = connection.prepare("SELECT trim(p.surname || ' ' || p.given_name || ' ' || p.patronymic) FROM crew_actual_members cm JOIN personnel p ON p.id=cm.personnel_id WHERE cm.crew_id=?1 ORDER BY p.position,p.id")
            .map_err(|_| "Не вдалося прочитати фактичний склад екіпажу.".to_string())?
            .query_map([crew_id], |row| row.get::<_, String>(0)).map_err(|_| "Не вдалося прочитати фактичний склад екіпажу.".to_string())?
            .collect::<Result<Vec<_>, _>>().map_err(|_| "Не вдалося прочитати фактичний склад екіпажу.".to_string())?.join(", ");
        let vehicles = connection.prepare("SELECT trim(v.name || ' ' || v.registration_number) FROM vehicles v WHERE v.crew_id=?1 OR v.personnel_id IN (SELECT personnel_id FROM crew_members WHERE crew_id=?1 AND left_at IS NULL UNION SELECT personnel_id FROM crew_actual_members WHERE crew_id=?1) ORDER BY v.id")
            .map_err(|_| "Не вдалося прочитати автомобілі екіпажу.".to_string())?
            .query_map([crew_id], |row| row.get::<_, String>(0)).map_err(|_| "Не вдалося прочитати автомобілі екіпажу.".to_string())?
            .collect::<Result<Vec<_>, _>>().map_err(|_| "Не вдалося прочитати автомобілі екіпажу.".to_string())?.join(", ");
        let uavs = crew_equipment_text(connection, *crew_id, "uav")?;
        let generators = crew_equipment_text(connection, *crew_id, "generator")?;
        let communications = crew_equipment_text(connection, *crew_id, "communications")?;
        let weapons = crew_equipment_text(connection, *crew_id, "weapon_ammo")?;
        let all_equipment = crew_equipment_text(connection, *crew_id, "")?;
        let commander_name =
            crew_members_for_position(connection, *crew_id, "%командир%", "%Командир%");
        let drivers = crew_members_for_position(connection, *crew_id, "%водій%", "%Водій%");
        let prefix = format!("екіпаж_{}", index + 1);
        let data = [
            ("name", row.0),
            ("platoon", row.1),
            ("position_name", row.2),
            ("reconnaissance_area", row.3),
            ("unit_type", row.4),
            ("company_name", row.5),
            ("battle_order", row.6),
            ("sector", row.7),
            ("official_strength", row.8.to_string()),
            (
                "actual_strength",
                actual_members
                    .split(", ")
                    .filter(|value| !value.is_empty())
                    .count()
                    .to_string(),
            ),
            ("status", row.9),
            ("uav_name", row.10),
            ("uav_type", row.11),
            ("functional_duties", row.12),
            ("current_location", row.13),
            ("notes", row.14),
            ("members", members.clone()),
            ("official_members", members.clone()),
            ("actual_members", actual_members.clone()),
            ("vehicles", vehicles.clone()),
            ("uavs", uavs),
            ("generators", generators),
            ("communications", communications),
            ("weapons", weapons),
            ("all_equipment", all_equipment),
            ("commander_name", commander_name),
            ("drivers", drivers),
        ]
        .into_iter()
        .collect::<HashMap<_, _>>();
        for field in &registry().crew_fields {
            let text = match field.source_key.as_deref() {
                Some(key) => data.get(key).cloned().unwrap_or_default(),
                _ => String::new(),
            };
            values.insert(
                format!("{prefix}_{}", field.id),
                Value::new(text, &field.kind, None),
            );
        }
    }
    Ok(())
}

pub(super) fn add_selected_vehicles(
    connection: &Connection,
    vehicle_ids: &[i64],
    values: &mut HashMap<String, Value>,
) -> Result<(), String> {
    for (index, vehicle_id) in vehicle_ids.iter().enumerate() {
        let (name, number, status, driver_name, driver_rank, driver_position, crew_name): (String, String, String, String, String, String, String) = connection
            .query_row(
                "SELECT vehicle.name,vehicle.registration_number,vehicle.status,COALESCE(trim(person.surname || ' ' || person.given_name || ' ' || person.patronymic),''),COALESCE(person.rank,''),COALESCE(person.position,''),COALESCE(crew.name,'') FROM vehicles vehicle LEFT JOIN personnel person ON person.id=vehicle.personnel_id LEFT JOIN crews crew ON crew.id=vehicle.crew_id WHERE vehicle.id=?1",
                [vehicle_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
            )
            .map_err(|_| "Не вдалося прочитати вибраний автомобіль.".to_string())?;
        let prefix = format!("автомобіль_{}", index + 1);
        for field in &registry().vehicle_fields {
            let text = match field.source_key.as_deref() {
                Some("name") => name.clone(),
                Some("registration_number") => number.clone(),
                Some("status") => status.clone(),
                Some("driver_full_name") => driver_name.clone(),
                Some("driver_rank") => driver_rank.clone(),
                Some("driver_position") => driver_position.clone(),
                Some("crew_name") => crew_name.clone(),
                _ => String::new(),
            };
            values.insert(
                format!("{prefix}_{}", field.id),
                Value::new(text, &field.kind, None),
            );
        }
    }
    Ok(())
}

pub(super) fn add_selected_positions(
    connection: &Connection,
    position_ids: &[i64],
    values: &mut HashMap<String, Value>,
) -> Result<(), String> {
    type PositionRow = (
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
        String,
    );
    for (index, id) in position_ids.iter().enumerate() {
        let row: PositionRow=connection.query_row("SELECT p.name,p.position_type,p.strip_name,p.locality,p.battle_order,p.sector,p.condition,p.condition_level,p.field_type,p.size,p.mgrs,COALESCE(GROUP_CONCAT(c.name, ', '),''),p.notes,p.suitable_uav_text FROM positions p LEFT JOIN crews c ON c.position_id=p.id WHERE p.id=?1 GROUP BY p.id",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get::<_,i64>(7)?.to_string(),r.get(8)?,r.get(9)?,r.get(10)?,r.get(11)?,r.get(12)?,r.get(13)?))).map_err(|_|"Не вдалося прочитати вибрану позицію.".to_string())?;
        let data = [
            ("name", row.0),
            ("position_type", row.1),
            ("strip_name", row.2),
            ("locality", row.3),
            ("battle_order", row.4),
            ("sector", row.5),
            ("condition", row.6),
            ("condition_level", row.7),
            ("field_type", row.8),
            ("size", row.9),
            ("mgrs", row.10),
            ("crew_name", row.11),
            ("notes", row.12),
            ("suitable_uavs", row.13),
        ]
        .into_iter()
        .collect::<HashMap<_, _>>();
        let prefix = format!("позиція_{}", index + 1);
        for field in &registry().position_fields {
            values.insert(
                format!("{prefix}_{}", field.id),
                Value::new(
                    data.get(field.source_key.as_deref().unwrap_or_default())
                        .cloned()
                        .unwrap_or_default(),
                    &field.kind,
                    None,
                ),
            );
        }
    }
    Ok(())
}

pub(super) fn add_selected_equipment(
    connection: &Connection,
    equipment_ids: &[i64],
    values: &mut HashMap<String, Value>,
) -> Result<(), String> {
    let mut category_indexes: HashMap<String, usize> = HashMap::new();
    for equipment_id in equipment_ids {
        let (category, name, inventory_number, status, notes, crew_name, responsible_name, position_name): (
            String,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
        ) = connection
            .query_row(
                "SELECT equipment.category,equipment.name,equipment.inventory_number,equipment.status,equipment.notes,COALESCE(crew.name,''),COALESCE(trim(holder.surname || ' ' || holder.given_name || ' ' || holder.patronymic),(SELECT trim(member_person.surname || ' ' || member_person.given_name || ' ' || member_person.patronymic) FROM crew_members member JOIN personnel member_person ON member_person.id=member.personnel_id WHERE member.crew_id=equipment.crew_id AND member.left_at IS NULL AND (member_person.position LIKE '%командир%' OR member_person.position LIKE '%Командир%') ORDER BY member.joined_at,member_person.id LIMIT 1),''),COALESCE(position.name,crew.position_name,'') FROM equipment LEFT JOIN crews crew ON crew.id=equipment.crew_id LEFT JOIN personnel holder ON holder.id=equipment.personnel_id LEFT JOIN positions position ON position.id=crew.position_id WHERE equipment.id=?1",
                [equipment_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                    ))
                },
            )
            .map_err(|_| "Не вдалося прочитати вибране майно.".to_string())?;
        let base_prefix = match category.as_str() {
            "generator" => "генератор",
            "uav" => "бпла",
            "communications" => "звʼязок",
            "weapon_ammo" => "зброя_та_бк",
            _ => continue,
        };
        let index = category_indexes
            .entry(category.clone())
            .and_modify(|value| *value += 1)
            .or_insert(1);
        let prefix = format!("{base_prefix}_{index}");
        for field in &registry().equipment_fields {
            let text = match field.source_key.as_deref() {
                Some("name") => name.clone(),
                Some("inventory_number") => inventory_number.clone(),
                Some("status") => status.clone(),
                Some("notes") => notes.clone(),
                Some("crew_name") => crew_name.clone(),
                Some("responsible_name") => responsible_name.clone(),
                Some("position_name") => position_name.clone(),
                _ => String::new(),
            };
            values.insert(
                format!("{prefix}_{}", field.id),
                Value::new(text, &field.kind, None),
            );
        }
    }
    Ok(())
}

pub(super) fn person_value(person: &Personnel, source_key: &str) -> String {
    match source_key {
        "surname" => person.surname.to_uppercase(),
        "given_name" => name_case(&person.given_name),
        "patronymic" => name_case(&person.patronymic),
        "full_name" => format!(
            "{} {} {}",
            person.surname.to_uppercase(),
            name_case(&person.given_name),
            name_case(&person.patronymic)
        )
        .trim()
        .to_string(),
        "rank" => sentence_case(&person.rank),
        "position" => sentence_case(&person.position),
        "tax_id" => person.tax_id.clone(),
        "birth_date" => person.birth_date.clone(),
        "education_level" => person.education_level.clone(),
        "education_details" => person.education_details.clone(),
        "armed_forces_service_start_date" => person.armed_forces_service_start_date.clone(),
        "position_assigned_date" => person.position_assigned_date.clone(),
        "position_assignment_order" => person.position_assignment_order.clone(),
        "military_id" => person.military_id.clone(),
        "assigned_vehicle_name" => person.assigned_vehicle_name.clone(),
        "assigned_vehicle_registration" => person.assigned_vehicle_registration.clone(),
        key => person.core_fields.get(key).cloned().unwrap_or_default(),
    }
}

pub(super) fn add_custom_values(
    connection: &Connection,
    people: &[Personnel],
    values: &mut HashMap<String, Value>,
) -> Result<(), String> {
    for (index, person) in people.iter().enumerate() {
        let mut statement = connection.prepare("SELECT definition.field_key, definition.display_name, value.field_value FROM personnel_custom_fields value JOIN custom_field_definitions definition ON definition.field_key = value.field_key WHERE value.personnel_id = ?1").map_err(|_| "Не вдалося прочитати додаткові поля.".to_string())?;
        let fields = statement
            .query_map([person.id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|_| "Не вдалося прочитати додаткові поля.".to_string())?;
        for field in fields {
            let (_key, display_name, value) =
                field.map_err(|_| "Не вдалося прочитати додаткове поле.".to_string())?;
            values.insert(
                format!(
                    "військовий_{}_{}",
                    index + 1,
                    custom_template_id(&display_name)
                ),
                Value::new(value, "text", None),
            );
        }
    }
    Ok(())
}
pub(super) fn custom_template_id(name: &str) -> String {
    let normalized = name
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    normalized
        .trim_matches('_')
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}
pub(super) fn add_signer(
    map: &mut HashMap<String, Value>,
    prefix: &str,
    s: &settings::SignerSettings,
) {
    let parts = s.full_name.split_whitespace().collect::<Vec<_>>();
    let surname = parts.first().copied().unwrap_or("");
    let given = parts.get(1).copied().unwrap_or("");
    let patronymic = parts.get(2..).unwrap_or_default().join(" ");
    let gender = detect_gender("", &patronymic);
    for (id, text, kind) in [
        ("прізвище", surname.to_uppercase(), "person-name"),
        ("імя", name_case(given), "person-name"),
        ("по_батькові", name_case(&patronymic), "person-name"),
        (
            "піб",
            format!(
                "{} {} {}",
                surname.to_uppercase(),
                name_case(given),
                name_case(&patronymic)
            )
            .trim()
            .into(),
            "person-name",
        ),
        ("звання", sentence_case(&s.rank), "rank"),
        ("посада", sentence_case(&s.position), "position"),
    ] {
        map.insert(format!("{prefix}_{id}"), Value::new(text, kind, gender));
    }
}
