use super::*;

fn esc(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
pub(super) fn unescape(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}
fn column_name(mut value: usize) -> String {
    let mut out = String::new();
    loop {
        out.insert(0, (b'A' + (value % 26) as u8) as char);
        if value < 26 {
            break;
        }
        value = value / 26 - 1;
    }
    out
}
pub(super) fn column_index(cell: &str) -> Option<usize> {
    let letters = cell.chars().take_while(|value| value.is_ascii_alphabetic());
    let mut out = 0usize;
    let mut any = false;
    for letter in letters {
        any = true;
        out = out * 26 + (letter.to_ascii_uppercase() as u8 - b'A' + 1) as usize;
    }
    any.then_some(out - 1)
}

fn personnel_value(person: &Personnel, key: &str) -> String {
    match key {
        "rank" => person.rank.clone(),
        "surname" => person.surname.clone(),
        "given_name" => person.given_name.clone(),
        "patronymic" => person.patronymic.clone(),
        "position" => person.position.clone(),
        "tax_id" => person.tax_id.clone(),
        "birth_date" => person.birth_date.clone(),
        "education_level" => person.education_level.clone(),
        "education_details" => person.education_details.clone(),
        "armed_forces_service_start_date" => person.armed_forces_service_start_date.clone(),
        "position_assigned_date" => person.position_assigned_date.clone(),
        "position_assignment_order" => person.position_assignment_order.clone(),
        "military_id" => person.military_id.clone(),
        "gender" => person.gender.clone(),
        "full_name" => person.full_name.clone(),
        _ => person.core_fields.get(key).cloned().unwrap_or_default(),
    }
}
fn personnel_label(key: &str) -> String {
    match key {
        "rank" => "Звання",
        "surname" => "Прізвище",
        "given_name" => "Ім’я",
        "patronymic" => "По батькові",
        "position" => "Посада",
        "tax_id" => "ІПН",
        "birth_date" => "Дата народження",
        "education_level" => "Формат освіти",
        "education_details" => "Де отримана освіта",
        "armed_forces_service_start_date" => "У ЗСУ з",
        "position_assigned_date" => "Дата призначення",
        "position_assignment_order" => "Наказ про призначення",
        "military_id" => "Військовий квиток",
        "gender" => "Стать",
        "full_name" => "ПІБ",
        _ => crate::database::STANDARD_EXTRA_FIELDS
            .iter()
            .find(|(field, _)| *field == key)
            .map(|(_, label)| *label)
            .unwrap_or(key),
    }
    .to_string()
}
fn vehicle_label(key: &str) -> &str {
    match key {
        "name" => "Автомобіль",
        "registration_number" => "Державний номер",
        "status" => "Статус",
        "driver_tax_id" => "ІПН закріпленого водія",
        "driver_full_name" => "ПІБ закріпленого водія",
        "crew_name" => "Екіпаж",
        _ => key,
    }
}
fn crew_label(key: &str) -> &str {
    match key {
        "name" => "Назва екіпажу",
        "platoon" => "Взвод",
        "position_name" => "Позиція",
        "reconnaissance_area" => "Район розвідки",
        "unit_type" => "Підрозділ по типу",
        "company_name" => "Рота / окремий взвод",
        "battle_order" => "БРО",
        "sector" => "Сектор роботи",
        "working_strength" => "Кількість в/с працює в екіпажах",
        "official_strength" => "Кількість в/с за штатом",
        "status" => "Статус екіпажу",
        "uav_name" => "Назва БпАК",
        "uav_type" => "Тип БпАК",
        "primary_uav_inventory_number" => "Основний БпЛА (інвентарний номер)",
        "functional_duties" => "Функціональні обов’язки",
        "current_location" => "Де знаходиться",
        "notes" => "Примітка",
        "crew_name" => "Назва екіпажу",
        "personnel_tax_id" => "ІПН військовослужбовця",
        "personnel_full_name" => "ПІБ військовослужбовця",
        _ => key,
    }
}
fn equipment_label(key: &str) -> &str {
    match key {
        "name" => "Назва",
        "inventory_number" => "Інвентарний номер",
        "status" => "Стан",
        "crew_name" => "Екіпаж",
        "holder_tax_id" => "ІПН відповідального",
        "holder_full_name" => "ПІБ відповідального",
        "total_quantity" => "Кількість БпЛА загальна",
        "day_quantity" => "К-ть БпЛА денних",
        "night_quantity" => "К-ть БпЛА нічних",
        "uav_type" => "Тип БпАК",
        "notes" => "Примітка",
        _ => key,
    }
}
fn position_label(key: &str) -> &str {
    match key {
        "name" => "Назва позиції",
        "position_type" => "Тип позиції",
        "strip_name" => "Смуга",
        "locality" => "Район населеного пункту",
        "battle_order" => "БРО",
        "sector" => "Сектор",
        "condition" => "Стан",
        "condition_level" => "Стан, %",
        "field_type" => "Тип поля",
        "size" => "Розмір",
        "mgrs" => "Приблизні координати MGRS",
        "suitable_uav_text" => "Під які БпЛА підходить",
        "is_active" => "Активна",
        "crew_name" => "Закріплений екіпаж",
        "notes" => "Примітка",
        _ => key,
    }
}
fn position_export_label(key: &str) -> String {
    position_label(key).into()
}
fn incident_label(key: &str) -> &str {
    match key {
        "incident_type" => "Тип інциденту",
        "occurred_at" => "Дата та час",
        "crew_name" => "Екіпаж",
        "equipment_category" => "Категорія майна",
        "equipment_inventory_number" => "Інвентарний номер майна",
        "equipment_name" => "Назва майна",
        "position_name" => "Позиція",
        "reconnaissance_area" => "Район розвідки",
        "description" => "Опис",
        _ => key,
    }
}
fn personnel_export_label(key: &str) -> String {
    personnel_label(key)
}
fn vehicle_export_label(key: &str) -> String {
    vehicle_label(key).into()
}
fn crew_export_label(key: &str) -> String {
    crew_label(key).into()
}
fn equipment_export_label(key: &str) -> String {
    equipment_label(key).into()
}
fn incident_export_label(key: &str) -> String {
    incident_label(key).into()
}
fn cell(column: usize, row: usize, value: &str) -> String {
    format!(
        "<c r=\"{}{}\" t=\"inlineStr\"><is><t>{}</t></is></c>",
        column_name(column),
        row,
        esc(value)
    )
}
pub(super) fn worksheet_xml(headers: &[String], keys: &[String], rows: &[Vec<String>]) -> String {
    let mut xml = String::from("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"2\" topLeftCell=\"A3\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews><sheetData>");
    for (row_index, values) in std::iter::once(headers)
        .chain(std::iter::once(keys))
        .chain(rows.iter().map(Vec::as_slice))
        .enumerate()
    {
        xml.push_str(&format!("<row r=\"{}\">", row_index + 1));
        for (column, value) in values.iter().enumerate() {
            xml.push_str(&cell(column, row_index + 1, value));
        }
        xml.push_str("</row>");
    }
    xml.push_str("</sheetData><autoFilter ref=\"A1:");
    xml.push_str(&format!(
        "{}1\"/></worksheet>",
        column_name(keys.len().saturating_sub(1))
    ));
    xml
}

/// The exported workbook is the canonical interchange format: one personnel sheet and one vehicle sheet.
#[allow(clippy::too_many_arguments)]
#[cfg(test)]
pub fn export(
    path: &Path,
    people: &[Personnel],
    vehicles: &[VehicleRow],
    personnel_custom_maps: &[CustomFieldMapRow],
    personnel_custom_values: &[CustomValueRow],
    vehicle_custom_maps: &[CustomFieldMapRow],
    vehicle_custom_values: &[CustomValueRow],
    crews: &[CrewRow],
    crew_members: &[CrewMemberRow],
    equipment: &[EquipmentRow],
    incidents: &[IncidentRow],
    positions: &[PositionRow],
) -> Result<(), String> {
    export_with_staffing(
        path,
        people,
        vehicles,
        personnel_custom_maps,
        personnel_custom_values,
        vehicle_custom_maps,
        vehicle_custom_values,
        crews,
        crew_members,
        equipment,
        incidents,
        positions,
        &Default::default(),
    )
}

#[allow(clippy::too_many_arguments)]
pub fn export_with_staffing(
    path: &Path,
    people: &[Personnel],
    vehicles: &[VehicleRow],
    personnel_custom_maps: &[CustomFieldMapRow],
    personnel_custom_values: &[CustomValueRow],
    vehicle_custom_maps: &[CustomFieldMapRow],
    vehicle_custom_values: &[CustomValueRow],
    crews: &[CrewRow],
    crew_members: &[CrewMemberRow],
    equipment: &[EquipmentRow],
    incidents: &[IncidentRow],
    positions: &[PositionRow],
    staffing: &crate::staffing_exchange::ExtraSheets,
) -> Result<(), String> {
    let file = File::create(path).map_err(|_| "Не вдалося створити Excel-файл.".to_string())?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    let personnel_headers = PERSONNEL_KEYS
        .iter()
        .map(|key| personnel_label(key))
        .collect::<Vec<_>>();
    let personnel_keys = PERSONNEL_KEYS
        .iter()
        .map(|key| key.to_string())
        .collect::<Vec<_>>();
    let personnel_rows = people
        .iter()
        .map(|person| {
            PERSONNEL_KEYS
                .iter()
                .map(|key| personnel_value(person, key))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let vehicle_headers = VEHICLE_KEYS
        .iter()
        .map(|key| vehicle_label(key).to_string())
        .collect::<Vec<_>>();
    let vehicle_keys = VEHICLE_KEYS
        .iter()
        .map(|key| key.to_string())
        .collect::<Vec<_>>();
    let vehicle_rows = vehicles
        .iter()
        .map(|vehicle| {
            vec![
                vehicle.name.clone(),
                vehicle.registration_number.clone(),
                vehicle.status.clone(),
                vehicle.driver_tax_id.clone(),
                vehicle.driver_full_name.clone(),
                vehicle.crew_name.clone(),
            ]
        })
        .collect::<Vec<_>>();
    let crew_rows = crews
        .iter()
        .map(|crew| {
            vec![
                crew.unit_type.clone(),
                crew.company_name.clone(),
                crew.name.clone(),
                crew.platoon.clone(),
                crew.position_name.clone(),
                crew.reconnaissance_area.clone(),
                crew.battle_order.clone(),
                crew.sector.clone(),
                crew.official_strength.clone(),
                crew.working_strength.clone(),
                crew.status.clone(),
                crew.uav_name.clone(),
                crew.uav_type.clone(),
                crew.primary_uav_inventory_number.clone(),
                crew.functional_duties.clone(),
                crew.current_location.clone(),
                crew.notes.clone(),
            ]
        })
        .collect::<Vec<_>>();
    let position_rows = positions
        .iter()
        .map(|row| {
            vec![
                row.name.clone(),
                row.position_type.clone(),
                row.strip_name.clone(),
                row.locality.clone(),
                row.battle_order.clone(),
                row.sector.clone(),
                row.condition.clone(),
                row.condition_level.clone(),
                row.field_type.clone(),
                row.size.clone(),
                row.mgrs.clone(),
                row.suitable_uav_text.clone(),
                row.is_active.clone(),
                row.crew_name.clone(),
                row.notes.clone(),
            ]
        })
        .collect::<Vec<_>>();
    let crew_member_rows = crew_members
        .iter()
        .map(|member| {
            vec![
                member.crew_name.clone(),
                member.personnel_tax_id.clone(),
                member.personnel_full_name.clone(),
            ]
        })
        .collect::<Vec<_>>();
    let equipment_rows = |category: &str| {
        equipment
            .iter()
            .filter(|row| row.category == category)
            .map(|row| {
                vec![
                    row.name.clone(),
                    row.inventory_number.clone(),
                    row.status.clone(),
                    row.crew_name.clone(),
                    row.holder_tax_id.clone(),
                    row.holder_full_name.clone(),
                    row.total_quantity.clone(),
                    row.day_quantity.clone(),
                    row.night_quantity.clone(),
                    row.uav_type.clone(),
                    row.notes.clone(),
                ]
            })
            .collect::<Vec<_>>()
    };
    let incident_rows = incidents
        .iter()
        .map(|row| {
            vec![
                row.incident_type.clone(),
                row.occurred_at.clone(),
                row.crew_name.clone(),
                row.equipment_category.clone(),
                row.equipment_inventory_number.clone(),
                row.equipment_name.clone(),
                row.position_name.clone(),
                row.reconnaissance_area.clone(),
                row.description.clone(),
            ]
        })
        .collect::<Vec<_>>();
    let custom_sheet = |owner_label: &str,
                        owner_key: &str,
                        maps: &[CustomFieldMapRow],
                        values: &[CustomValueRow]| {
        let headers = std::iter::once(owner_label.to_string())
            .chain(maps.iter().map(|field| field.display_name.clone()))
            .collect::<Vec<_>>();
        let keys = std::iter::once(owner_key.to_string())
            .chain(maps.iter().map(|field| field.field_key.clone()))
            .collect::<Vec<_>>();
        let rows = values
            .iter()
            .map(|row| {
                std::iter::once(row.owner_key.clone())
                    .chain(maps.iter().map(|field| {
                        row.values
                            .get(&field.field_key)
                            .cloned()
                            .unwrap_or_default()
                    }))
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();
        worksheet_xml(&headers, &keys, &rows)
    };
    let map_sheet = |keys: &[&str], label: fn(&str) -> String| {
        worksheet_xml(
            &["Назва в Excel".into(), "Назва змінної в БД".into()],
            &["excel_name".into(), "field_key".into()],
            &keys
                .iter()
                .map(|key| vec![label(key), (*key).to_string()])
                .collect::<Vec<_>>(),
        )
    };
    let mut sheets = vec![
        (
            "Особовий склад".to_string(),
            worksheet_xml(&personnel_headers, &personnel_keys, &personnel_rows),
        ),
        (
            "Мапа полів ОС".to_string(),
            map_sheet(PERSONNEL_KEYS, personnel_export_label),
        ),
        (
            "Кастомні поля ОС".to_string(),
            custom_sheet(
                "ІПН / ПІБ",
                "personnel_reference",
                personnel_custom_maps,
                personnel_custom_values,
            ),
        ),
        (
            "Автомобілі".to_string(),
            worksheet_xml(&vehicle_headers, &vehicle_keys, &vehicle_rows),
        ),
        (
            "Мапа полів автомобілів".to_string(),
            map_sheet(VEHICLE_KEYS, vehicle_export_label),
        ),
        (
            "Кастомні поля автомобілів".to_string(),
            custom_sheet(
                "Державний номер",
                "registration_number",
                vehicle_custom_maps,
                vehicle_custom_values,
            ),
        ),
        (
            "Екіпажі".to_string(),
            worksheet_xml(
                &CREW_KEYS
                    .iter()
                    .map(|key| crew_label(key).to_string())
                    .collect::<Vec<_>>(),
                &CREW_KEYS
                    .iter()
                    .map(|key| key.to_string())
                    .collect::<Vec<_>>(),
                &crew_rows,
            ),
        ),
        (
            "Мапа полів екіпажів".to_string(),
            map_sheet(CREW_KEYS, crew_export_label),
        ),
        (
            "Позиції".to_string(),
            worksheet_xml(
                &POSITION_KEYS
                    .iter()
                    .map(|key| position_label(key).to_string())
                    .collect::<Vec<_>>(),
                &POSITION_KEYS
                    .iter()
                    .map(|key| key.to_string())
                    .collect::<Vec<_>>(),
                &position_rows,
            ),
        ),
        (
            "Мапа полів позицій".to_string(),
            map_sheet(POSITION_KEYS, position_export_label),
        ),
        (
            "Склад екіпажів".to_string(),
            worksheet_xml(
                &CREW_MEMBER_KEYS
                    .iter()
                    .map(|key| crew_label(key).to_string())
                    .collect::<Vec<_>>(),
                &CREW_MEMBER_KEYS
                    .iter()
                    .map(|key| key.to_string())
                    .collect::<Vec<_>>(),
                &crew_member_rows,
            ),
        ),
        (
            "Мапа складу екіпажів".to_string(),
            map_sheet(CREW_MEMBER_KEYS, crew_export_label),
        ),
        (
            "Генератори".to_string(),
            worksheet_xml(
                &EQUIPMENT_KEYS
                    .iter()
                    .map(|key| equipment_label(key).to_string())
                    .collect::<Vec<_>>(),
                &EQUIPMENT_KEYS
                    .iter()
                    .map(|key| key.to_string())
                    .collect::<Vec<_>>(),
                &equipment_rows("generator"),
            ),
        ),
        (
            "Мапа полів генераторів".to_string(),
            map_sheet(EQUIPMENT_KEYS, equipment_export_label),
        ),
        (
            "БпЛА".to_string(),
            worksheet_xml(
                &EQUIPMENT_KEYS
                    .iter()
                    .map(|key| equipment_label(key).to_string())
                    .collect::<Vec<_>>(),
                &EQUIPMENT_KEYS
                    .iter()
                    .map(|key| key.to_string())
                    .collect::<Vec<_>>(),
                &equipment_rows("uav"),
            ),
        ),
        (
            "Мапа полів БпЛА".to_string(),
            map_sheet(EQUIPMENT_KEYS, equipment_export_label),
        ),
        (
            "Зв’язок".to_string(),
            worksheet_xml(
                &EQUIPMENT_KEYS
                    .iter()
                    .map(|key| equipment_label(key).to_string())
                    .collect::<Vec<_>>(),
                &EQUIPMENT_KEYS
                    .iter()
                    .map(|key| key.to_string())
                    .collect::<Vec<_>>(),
                &equipment_rows("communications"),
            ),
        ),
        (
            "Мапа полів зв’язку".to_string(),
            map_sheet(EQUIPMENT_KEYS, equipment_export_label),
        ),
        (
            "Зброя та БК".to_string(),
            worksheet_xml(
                &EQUIPMENT_KEYS
                    .iter()
                    .map(|key| equipment_label(key).to_string())
                    .collect::<Vec<_>>(),
                &EQUIPMENT_KEYS
                    .iter()
                    .map(|key| key.to_string())
                    .collect::<Vec<_>>(),
                &equipment_rows("weapon_ammo"),
            ),
        ),
        (
            "Мапа полів зброї та БК".to_string(),
            map_sheet(EQUIPMENT_KEYS, equipment_export_label),
        ),
        (
            "Інциденти".to_string(),
            worksheet_xml(
                &INCIDENT_KEYS
                    .iter()
                    .map(|key| incident_label(key).to_string())
                    .collect::<Vec<_>>(),
                &INCIDENT_KEYS
                    .iter()
                    .map(|key| key.to_string())
                    .collect::<Vec<_>>(),
                &incident_rows,
            ),
        ),
        (
            "Мапа полів інцидентів".to_string(),
            map_sheet(INCIDENT_KEYS, incident_export_label),
        ),
    ];
    for (name, keys) in crate::staffing_exchange::SHEETS {
        let keys = keys.iter().map(|key| key.to_string()).collect::<Vec<_>>();
        let rows = staffing
            .get(*name)
            .into_iter()
            .flatten()
            .map(|row| {
                keys.iter()
                    .map(|key| row.get(key).cloned().unwrap_or_default())
                    .collect()
            })
            .collect::<Vec<_>>();
        sheets.push((name.to_string(), worksheet_xml(&keys, &keys, &rows)));
    }
    let content_types = format!("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>{}</Types>", sheets.iter().enumerate().map(|(index, _)| format!("<Override PartName=\"/xl/worksheets/sheet{}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>", index + 1)).collect::<String>());
    let relationships = format!("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">{}</Relationships>", sheets.iter().enumerate().map(|(index, _)| format!("<Relationship Id=\"rId{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{}.xml\"/>", index + 1, index + 1)).collect::<String>());
    let workbook = format!("<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets>{}</sheets></workbook>", sheets.iter().enumerate().map(|(index, (name, _))| format!("<sheet name=\"{}\" sheetId=\"{}\" r:id=\"rId{}\"/>", esc(name), index + 1, index + 1)).collect::<String>());
    let mut files = vec![
        ("[Content_Types].xml".to_string(), content_types),
        ("_rels/.rels".to_string(), "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>".to_string()),
        ("xl/_rels/workbook.xml.rels".to_string(), relationships),
        ("xl/workbook.xml".to_string(), workbook),
    ];
    files.extend(
        sheets.drain(..).enumerate().map(|(index, (_, content))| {
            (format!("xl/worksheets/sheet{}.xml", index + 1), content)
        }),
    );
    for (name, content) in files {
        archive
            .start_file(name, options)
            .map_err(|_| "Не вдалося сформувати Excel-файл.".to_string())?;
        archive
            .write_all(content.as_bytes())
            .map_err(|_| "Не вдалося записати Excel-файл.".to_string())?;
    }
    archive
        .finish()
        .map_err(|_| "Не вдалося завершити Excel-файл.".to_string())?;
    Ok(())
}

pub fn export_bcs(
    path: &Path,
    unit_name: &str,
    date: &str,
    authorized_strength: i64,
    rows: &[BcsRow],
) -> Result<(), String> {
    crate::bcs_export::export(path, unit_name, date, authorized_strength, rows)
}

pub(crate) fn write_styled_workbook(
    path: &Path,
    mut sheets: Vec<(String, String)>,
    styles: &str,
    theme: &str,
) -> Result<(), String> {
    let file = File::create(path).map_err(|_| "Не вдалося створити Excel-файл.".to_string())?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    let content_types = format!("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>{}</Types>", sheets.iter().enumerate().map(|(index, _)| format!("<Override PartName=\"/xl/worksheets/sheet{}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>", index + 1)).collect::<String>());
    let relationships = format!("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">{}</Relationships>", sheets.iter().enumerate().map(|(index, _)| format!("<Relationship Id=\"rId{}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{}.xml\"/>", index + 1, index + 1)).collect::<String>());
    let workbook = format!("<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets>{}</sheets></workbook>", sheets.iter().enumerate().map(|(index, (name, _))| format!("<sheet name=\"{}\" sheetId=\"{}\" r:id=\"rId{}\"/>", esc(name), index + 1, index + 1)).collect::<String>());
    let mut files = vec![("[Content_Types].xml".to_string(), content_types), ("_rels/.rels".to_string(), "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>".to_string()), ("xl/_rels/workbook.xml.rels".to_string(), relationships), ("xl/workbook.xml".to_string(), workbook)];
    if !styles.is_empty() {
        files[0].1 = files[0].1.replace("</Types>", r#"<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>"#);
        files[2].1 = files[2].1.replace("</Relationships>", r#"<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>"#);
        files.push(("xl/styles.xml".into(), styles.into()));
        files.push(("xl/theme/theme1.xml".into(), theme.into()));
    }
    files.extend(
        sheets
            .drain(..)
            .enumerate()
            .map(|(index, (_, xml))| (format!("xl/worksheets/sheet{}.xml", index + 1), xml)),
    );
    for (name, content) in files {
        archive
            .start_file(name, options)
            .map_err(|_| "Не вдалося сформувати Excel-файл.".to_string())?;
        archive
            .write_all(content.as_bytes())
            .map_err(|_| "Не вдалося записати Excel-файл.".to_string())?;
    }
    archive
        .finish()
        .map_err(|_| "Не вдалося завершити Excel-файл.".to_string())?;
    Ok(())
}
