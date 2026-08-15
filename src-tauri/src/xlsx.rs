use crate::personnel::{Personnel, PersonnelDraft};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

pub const PERSONNEL_KEYS: &[&str] = &[
    "rank",
    "surname",
    "given_name",
    "patronymic",
    "position",
    "tax_id",
    "birth_date",
    "education_level",
    "education_details",
    "armed_forces_service_start_date",
    "position_assigned_date",
    "position_assignment_order",
    "military_id",
    "gender",
    "full_name",
    "passport_series",
    "passport_number",
    "passport_issued_by",
    "passport_issue_date",
    "foreign_passport",
    "foreign_passport_issued_by",
    "foreign_passport_issue_date",
    "foreign_passport_series",
    "foreign_passport_number",
    "military_document_issued_by",
    "military_document_issue_date",
    "combatant_certificate",
    "combatant_certificate_issued_by",
    "combatant_certificate_issue_date",
    "combatant_certificate_series",
    "combatant_certificate_number",
    "driver_license",
    "driver_license_issued_by",
    "driver_license_categories",
    "driver_license_valid_until",
    "driver_license_issue_date",
    "driver_license_series",
    "driver_license_number",
    "basic_military_training",
    "basic_training_start_date",
    "basic_training_end_date",
    "basic_training_location",
    "phone",
    "email",
    "marital_status",
    "blood_type",
    "military_fitness",
    "oath_date",
    "service_type",
    "service_start_date",
    "conscription_institution",
];
pub const VEHICLE_KEYS: &[&str] = &[
    "name",
    "registration_number",
    "status",
    "driver_tax_id",
    "driver_full_name",
    "crew_name",
];
pub const CREW_KEYS: &[&str] = &["name", "platoon", "position_name", "reconnaissance_area"];
pub const CREW_MEMBER_KEYS: &[&str] = &["crew_name", "personnel_tax_id", "personnel_full_name"];
pub const EQUIPMENT_KEYS: &[&str] = &[
    "name",
    "inventory_number",
    "status",
    "crew_name",
    "holder_tax_id",
    "holder_full_name",
    "notes",
];
pub const INCIDENT_KEYS: &[&str] = &[
    "incident_type",
    "occurred_at",
    "crew_name",
    "equipment_category",
    "equipment_inventory_number",
    "equipment_name",
    "position_name",
    "reconnaissance_area",
    "description",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VehicleRow {
    pub name: String,
    pub registration_number: String,
    pub status: String,
    pub driver_tax_id: String,
    pub driver_full_name: String,
    pub crew_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CrewRow {
    pub name: String,
    pub platoon: String,
    pub position_name: String,
    pub reconnaissance_area: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CrewMemberRow {
    pub crew_name: String,
    pub personnel_tax_id: String,
    pub personnel_full_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EquipmentRow {
    pub category: String,
    pub name: String,
    pub inventory_number: String,
    pub status: String,
    pub crew_name: String,
    pub holder_tax_id: String,
    pub holder_full_name: String,
    pub notes: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncidentRow {
    pub incident_type: String,
    pub occurred_at: String,
    pub crew_name: String,
    pub equipment_category: String,
    pub equipment_inventory_number: String,
    pub equipment_name: String,
    pub position_name: String,
    pub reconnaissance_area: String,
    pub description: String,
}

pub struct ImportData {
    pub personnel: Vec<PersonnelDraft>,
    pub vehicles: Vec<VehicleRow>,
    pub crews: Vec<CrewRow>,
    pub crew_members: Vec<CrewMemberRow>,
    pub equipment: Vec<EquipmentRow>,
    pub incidents: Vec<IncidentRow>,
    pub personnel_custom_fields: Vec<CustomValueRow>,
    pub vehicle_custom_fields: Vec<CustomValueRow>,
    pub personnel_custom_field_maps: Vec<CustomFieldMapRow>,
    pub vehicle_custom_field_maps: Vec<CustomFieldMapRow>,
}

#[derive(Debug, Clone)]
struct RowWithNumber {
    values: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomValueRow {
    pub owner_key: String,
    pub values: HashMap<String, String>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomFieldMapRow {
    pub display_name: String,
    pub field_key: String,
    pub description: String,
    pub initial_value: String,
}

fn esc(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
fn unescape(value: &str) -> String {
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
fn column_index(cell: &str) -> Option<usize> {
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
        "status" => "Статус",
        "crew_name" => "Екіпаж",
        "holder_tax_id" => "ІПН відповідального",
        "holder_full_name" => "ПІБ відповідального",
        "notes" => "Примітка",
        _ => key,
    }
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
fn worksheet_xml(headers: &[String], keys: &[String], rows: &[Vec<String>]) -> String {
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
                crew.name.clone(),
                crew.platoon.clone(),
                crew.position_name.clone(),
                crew.reconnaissance_area.clone(),
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
            &vec!["Назва в Excel".into(), "Назва змінної в БД".into()],
            &vec!["excel_name".into(), "field_key".into()],
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

fn shared_strings(archive: &mut ZipArchive<File>) -> Vec<String> {
    let Ok(mut file) = archive.by_name("xl/sharedStrings.xml") else {
        return Vec::new();
    };
    let mut xml = String::new();
    if file.read_to_string(&mut xml).is_err() {
        return Vec::new();
    }
    xml.replace("<x:", "<")
        .replace("</x:", "</")
        .split("<si>")
        .skip(1)
        .map(|item| {
            item.split("</si>")
                .next()
                .unwrap_or("")
                .split("<t>")
                .skip(1)
                .filter_map(|part| part.split("</t>").next())
                .map(unescape)
                .collect::<String>()
        })
        .collect()
}
fn attribute(cell: &str, name: &str) -> Option<String> {
    cell.split_once(&format!("{name}=\""))?
        .1
        .split_once('"')
        .map(|(value, _)| value.to_string())
}
fn cell_value(cell: &str, shared: &[String]) -> String {
    if let Some(text) = cell
        .split("<t>")
        .nth(1)
        .and_then(|part| part.split("</t>").next())
    {
        return unescape(text);
    }
    let value = cell
        .split("<v>")
        .nth(1)
        .and_then(|part| part.split("</v>").next())
        .unwrap_or("");
    if cell.contains("t=\"s\"") {
        return value
            .parse::<usize>()
            .ok()
            .and_then(|index| shared.get(index))
            .cloned()
            .unwrap_or_default();
    }
    unescape(value)
}
fn rows_from_xml(xml: &str, shared: &[String]) -> Vec<Vec<String>> {
    xml.replace("<x:", "<")
        .replace("</x:", "</")
        .split("<row ")
        .skip(1)
        .filter_map(|raw| raw.split("</row>").next())
        .map(|row| {
            let cells = row
                .split("<c ")
                .skip(1)
                .filter_map(|cell| {
                    let cell = cell.split("</c>").next().unwrap_or(cell);
                    Some((
                        column_index(&attribute(cell, "r")?)?,
                        cell_value(cell, shared),
                    ))
                })
                .collect::<Vec<_>>();
            let length = cells
                .iter()
                .map(|(index, _)| index + 1)
                .max()
                .unwrap_or_default();
            let mut values = vec![String::new(); length];
            for (index, value) in cells {
                values[index] = value;
            }
            values
        })
        .collect()
}
fn workbook_rows(
    archive: &mut ZipArchive<File>,
    name: &str,
    shared: &[String],
) -> Result<Vec<Vec<String>>, String> {
    let mut xml = String::new();
    archive
        .by_name(name)
        .map_err(|_| format!("Відсутній аркуш «{name}»."))?
        .read_to_string(&mut xml)
        .map_err(|_| "Не вдалося прочитати Excel-файл.".to_string())?;
    Ok(rows_from_xml(&xml, shared))
}

/// Resolves an XLSX worksheet by its visible name instead of relying on a
/// sheet number. Excel is free to reorder worksheets, so `sheet4.xml` is not
/// necessarily the same logical sheet in every workbook.
fn worksheet_path_by_name(
    archive: &mut ZipArchive<File>,
    expected_name: &str,
) -> Result<Option<String>, String> {
    let mut workbook = String::new();
    archive
        .by_name("xl/workbook.xml")
        .map_err(|_| "Excel-файл не містить опису аркушів.".to_string())?
        .read_to_string(&mut workbook)
        .map_err(|_| "Не вдалося прочитати структуру Excel-файлу.".to_string())?;
    let relationship_id = workbook
        .replace("<x:", "<")
        .replace("</x:", "</")
        .split("<sheet ")
        .skip(1)
        .filter_map(|sheet| sheet.split('>').next())
        .find(|sheet| attribute(sheet, "name").as_deref() == Some(expected_name))
        .and_then(|sheet| attribute(sheet, "r:id"));
    let Some(relationship_id) = relationship_id else {
        return Ok(None);
    };
    let mut relationships = String::new();
    archive
        .by_name("xl/_rels/workbook.xml.rels")
        .map_err(|_| "Excel-файл не містить зв’язків аркушів.".to_string())?
        .read_to_string(&mut relationships)
        .map_err(|_| "Не вдалося прочитати структуру Excel-файлу.".to_string())?;
    let target = relationships
        .split("<Relationship ")
        .skip(1)
        .filter_map(|relationship| relationship.split('>').next())
        .find(|relationship| attribute(relationship, "Id").as_deref() == Some(&relationship_id))
        .and_then(|relationship| attribute(relationship, "Target"))
        .ok_or_else(|| format!("Не вдалося знайти аркуш «{expected_name}»."))?;
    // Most XLSX writers store targets relative to `xl/` (for example,
    // `worksheets/sheet1.xml`). Some valid writers store the complete archive
    // path (`xl/worksheets/sheet1.xml`). Support both so that a workbook made
    // in Excel, LibreOffice or the exported control template imports equally.
    let target = target.trim_start_matches('/');
    Ok(Some(if target.starts_with("xl/") {
        target.to_string()
    } else {
        format!("xl/{target}")
    }))
}
fn records(rows: Vec<Vec<String>>, sheet: &str) -> Result<Vec<RowWithNumber>, String> {
    if rows.len() < 2 {
        return Err(format!(
            "Аркуш «{sheet}» має містити два рядки заголовків: назви та ключі."
        ));
    }
    let keys = rows[1].clone();
    Ok(rows
        .into_iter()
        .skip(2)
        .filter_map(|row| {
            let map = keys
                .iter()
                .enumerate()
                .filter_map(|(index, key)| {
                    (!key.trim().is_empty())
                        .then(|| (key.clone(), row.get(index).cloned().unwrap_or_default()))
                })
                .collect::<HashMap<_, _>>();
            (!map.values().all(|value| value.trim().is_empty()))
                .then_some(RowWithNumber { values: map })
        })
        .collect())
}
fn optional_records(
    archive: &mut ZipArchive<File>,
    expected_name: &str,
    shared: &[String],
) -> Result<Vec<RowWithNumber>, String> {
    match worksheet_path_by_name(archive, expected_name)? {
        Some(path) => records(workbook_rows(archive, &path, shared)?, expected_name),
        None => Ok(Vec::new()),
    }
}
fn optional_custom_values(
    archive: &mut ZipArchive<File>,
    expected_name: &str,
    owner_key: &str,
    shared: &[String],
) -> Result<(Vec<CustomValueRow>, Vec<CustomFieldMapRow>), String> {
    let Some(path) = worksheet_path_by_name(archive, expected_name)? else {
        return Ok((Vec::new(), Vec::new()));
    };
    let rows = workbook_rows(archive, &path, shared)?;
    if rows.len() < 2 {
        return Err(format!(
            "Аркуш «{expected_name}» має містити два рядки заголовків: назви та ключі."
        ));
    }
    let labels = rows[0].clone();
    let keys = rows[1].clone();
    let maps = keys
        .iter()
        .enumerate()
        .filter_map(|(index, key)| {
            let key = key.trim();
            (!key.is_empty() && key != owner_key).then(|| CustomFieldMapRow {
                display_name: labels
                    .get(index)
                    .cloned()
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| key.to_string()),
                field_key: key.to_string(),
                description: String::new(),
                initial_value: String::new(),
            })
        })
        .collect::<Vec<_>>();
    let values = rows
        .into_iter()
        .skip(2)
        .filter_map(|row| {
            let fields = keys
                .iter()
                .enumerate()
                .filter_map(|(index, key)| {
                    (!key.trim().is_empty()).then(|| {
                        (
                            key.trim().to_string(),
                            row.get(index).cloned().unwrap_or_default(),
                        )
                    })
                })
                .collect::<HashMap<_, _>>();
            let owner = fields.get(owner_key).cloned().unwrap_or_default();
            (!owner.trim().is_empty()).then(|| CustomValueRow {
                owner_key: owner,
                values: fields
                    .into_iter()
                    .filter(|(key, _)| key != owner_key)
                    .collect(),
            })
        })
        .collect::<Vec<_>>();
    Ok((values, maps))
}
pub fn import(path: &Path) -> Result<ImportData, String> {
    let file = File::open(path).map_err(|_| "Не вдалося відкрити Excel-файл.".to_string())?;
    let mut archive =
        ZipArchive::new(file).map_err(|_| "Файл має пошкоджений формат XLSX.".to_string())?;
    let shared = shared_strings(&mut archive);
    let personnel_path = worksheet_path_by_name(&mut archive, "Особовий склад")?
        .ok_or_else(|| "Відсутній аркуш «Особовий склад».".to_string())?;
    let personnel_rows = records(
        workbook_rows(&mut archive, &personnel_path, &shared)?,
        "Особовий склад",
    )?;
    let vehicle_rows = optional_records(&mut archive, "Автомобілі", &shared)?;
    let personnel = personnel_rows
        .into_iter()
        .map(|row| {
            let mut values = row.values;
            let full_name = values.remove("full_name").unwrap_or_default();
            let source_surname = values.remove("surname").unwrap_or_default();
            // Older workbooks often contain the whole name in the first name column.
            // Keep accepting that format while storing the name in three proper fields.
            let split_source = if !full_name.trim().is_empty() {
                full_name
            } else if source_surname.split_whitespace().count() > 1 {
                source_surname.clone()
            } else {
                String::new()
            };
            let parts = split_source
                .split_whitespace()
                .map(str::to_string)
                .collect::<Vec<_>>();
            let surname = if source_surname.split_whitespace().count() > 1 {
                parts.first().cloned().unwrap_or_default()
            } else if !source_surname.trim().is_empty() {
                source_surname
            } else {
                parts.first().cloned().unwrap_or_default()
            };
            let given_name = values
                .remove("given_name")
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| parts.get(1).cloned().unwrap_or_default());
            let patronymic = values
                .remove("patronymic")
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| parts.get(2).cloned().unwrap_or_default());
            let rank = values.get("rank").cloned().unwrap_or_default();
            let position = values.get("position").cloned().unwrap_or_default();
            let tax_id = values.get("tax_id").cloned().unwrap_or_default();
            let birth_date = values.get("birth_date").cloned().unwrap_or_default();
            let education_level = values.get("education_level").cloned().unwrap_or_default();
            let education_details = values.get("education_details").cloned().unwrap_or_default();
            let armed_forces_service_start_date = values
                .get("armed_forces_service_start_date")
                .cloned()
                .unwrap_or_default();
            let position_assigned_date = values
                .get("position_assigned_date")
                .cloned()
                .unwrap_or_default();
            let position_assignment_order = values
                .get("position_assignment_order")
                .cloned()
                .unwrap_or_default();
            let military_id = values.get("military_id").cloned().unwrap_or_default();
            let gender = values.get("gender").cloned().unwrap_or_default();
            values.remove("rank");
            values.remove("position");
            values.remove("tax_id");
            values.remove("gender");
            PersonnelDraft {
                rank,
                surname,
                given_name,
                patronymic,
                position,
                tax_id,
                birth_date,
                education_level,
                education_details,
                armed_forces_service_start_date,
                position_assigned_date,
                position_assignment_order,
                military_id,
                gender,
                core_fields: values,
            }
        })
        .collect::<Vec<_>>();
    let vehicles = vehicle_rows
        .into_iter()
        .map(|row| VehicleRow {
            name: row.values.get("name").cloned().unwrap_or_default(),
            registration_number: row
                .values
                .get("registration_number")
                .cloned()
                .unwrap_or_default(),
            status: row.values.get("status").cloned().unwrap_or_default(),
            driver_tax_id: row.values.get("driver_tax_id").cloned().unwrap_or_default(),
            driver_full_name: row
                .values
                .get("driver_full_name")
                .cloned()
                .unwrap_or_default(),
            crew_name: row.values.get("crew_name").cloned().unwrap_or_default(),
        })
        .collect();
    let crews = optional_records(&mut archive, "Екіпажі", &shared)?
        .into_iter()
        .map(|row| CrewRow {
            name: row.values.get("name").cloned().unwrap_or_default(),
            platoon: row.values.get("platoon").cloned().unwrap_or_default(),
            position_name: row.values.get("position_name").cloned().unwrap_or_default(),
            reconnaissance_area: row
                .values
                .get("reconnaissance_area")
                .cloned()
                .unwrap_or_default(),
        })
        .collect();
    let crew_members = optional_records(&mut archive, "Склад екіпажів", &shared)?
        .into_iter()
        .map(|row| CrewMemberRow {
            crew_name: row.values.get("crew_name").cloned().unwrap_or_default(),
            personnel_tax_id: row
                .values
                .get("personnel_tax_id")
                .cloned()
                .unwrap_or_default(),
            personnel_full_name: row
                .values
                .get("personnel_full_name")
                .cloned()
                .unwrap_or_default(),
        })
        .collect();
    let mut equipment = Vec::new();
    for (sheet, category) in [
        ("Генератори", "generator"),
        ("БпЛА", "uav"),
        ("Зв’язок", "communications"),
        ("Зброя та БК", "weapon_ammo"),
    ] {
        equipment.extend(
            optional_records(&mut archive, sheet, &shared)?
                .into_iter()
                .map(|row| EquipmentRow {
                    category: category.into(),
                    name: row.values.get("name").cloned().unwrap_or_default(),
                    inventory_number: row
                        .values
                        .get("inventory_number")
                        .cloned()
                        .unwrap_or_default(),
                    status: row.values.get("status").cloned().unwrap_or_default(),
                    crew_name: row.values.get("crew_name").cloned().unwrap_or_default(),
                    holder_tax_id: row.values.get("holder_tax_id").cloned().unwrap_or_default(),
                    holder_full_name: row
                        .values
                        .get("holder_full_name")
                        .cloned()
                        .unwrap_or_default(),
                    notes: row.values.get("notes").cloned().unwrap_or_default(),
                }),
        );
    }
    let incidents = optional_records(&mut archive, "Інциденти", &shared)?
        .into_iter()
        .map(|row| IncidentRow {
            incident_type: row.values.get("incident_type").cloned().unwrap_or_default(),
            occurred_at: row.values.get("occurred_at").cloned().unwrap_or_default(),
            crew_name: row.values.get("crew_name").cloned().unwrap_or_default(),
            equipment_category: row
                .values
                .get("equipment_category")
                .cloned()
                .unwrap_or_default(),
            equipment_inventory_number: row
                .values
                .get("equipment_inventory_number")
                .cloned()
                .unwrap_or_default(),
            equipment_name: row
                .values
                .get("equipment_name")
                .cloned()
                .unwrap_or_default(),
            position_name: row.values.get("position_name").cloned().unwrap_or_default(),
            reconnaissance_area: row
                .values
                .get("reconnaissance_area")
                .cloned()
                .unwrap_or_default(),
            description: row.values.get("description").cloned().unwrap_or_default(),
        })
        .collect();
    let (personnel_custom_fields, personnel_custom_field_maps) = optional_custom_values(
        &mut archive,
        "Кастомні поля ОС",
        "personnel_reference",
        &shared,
    )?;
    let (vehicle_custom_fields, vehicle_custom_field_maps) = optional_custom_values(
        &mut archive,
        "Кастомні поля автомобілів",
        "registration_number",
        &shared,
    )?;
    Ok(ImportData {
        personnel,
        vehicles,
        crews,
        crew_members,
        equipment,
        incidents,
        personnel_custom_fields,
        vehicle_custom_fields,
        personnel_custom_field_maps,
        vehicle_custom_field_maps,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn person() -> Personnel {
        Personnel {
            id: 1,
            rank: "Солдат".into(),
            full_name: "Тест Іван Іванович".into(),
            surname: "Тест".into(),
            given_name: "Іван".into(),
            patronymic: "Іванович".into(),
            position: "Водій".into(),
            tax_id: "1234567890".into(),
            birth_date: String::new(),
            education_level: String::new(),
            education_details: String::new(),
            armed_forces_service_start_date: String::new(),
            position_assigned_date: String::new(),
            position_assignment_order: String::new(),
            military_id: String::new(),
            assigned_vehicle_name: String::new(),
            assigned_vehicle_registration: String::new(),
            gender: String::new(),
            core_fields: HashMap::from([("phone".into(), "+380501234567".into())]),
            custom_fields: HashMap::new(),
        }
    }
    #[test]
    fn exports_and_imports_personnel_and_vehicles_in_one_workbook() {
        let path = std::env::temp_dir().join(format!(
            "shablonizator-roundtrip-{}.xlsx",
            std::process::id()
        ));
        export(
            &path,
            &[person()],
            &[VehicleRow {
                name: "Toyota Hilux".into(),
                registration_number: "АА 1111 АА".into(),
                status: "Справний".into(),
                driver_tax_id: "1234567890".into(),
                driver_full_name: "Тест Іван Іванович".into(),
                crew_name: String::new(),
            }],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        let mut archive = ZipArchive::new(File::open(&path).unwrap()).unwrap();
        let mut workbook = String::new();
        archive
            .by_name("xl/workbook.xml")
            .unwrap()
            .read_to_string(&mut workbook)
            .unwrap();
        assert!(workbook.contains("Автомобілі"));
        let imported = import(&path).unwrap();
        assert_eq!(imported.personnel.len(), 1);
        assert_eq!(
            imported.personnel[0].core_fields.get("phone").unwrap(),
            "+380501234567"
        );
        assert_eq!(imported.vehicles[0].registration_number, "АА 1111 АА");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn round_trips_crews_equipment_incidents_and_custom_values() {
        let path = std::env::temp_dir().join(format!(
            "shablonizator-operational-roundtrip-{}.xlsx",
            std::process::id()
        ));
        export(
            &path,
            &[person()],
            &[VehicleRow {
                name: "Toyota Hilux".into(),
                registration_number: "АА 1111 АА".into(),
                status: "Справний".into(),
                driver_tax_id: "1234567890".into(),
                driver_full_name: "Тест Іван Іванович".into(),
                crew_name: "Екіпаж Сокіл".into(),
            }],
            &[CustomFieldMapRow {
                display_name: "Позивний".into(),
                field_key: "callsign".into(),
                description: "Тест".into(),
                initial_value: String::new(),
            }],
            &[CustomValueRow {
                owner_key: "1234567890".into(),
                values: HashMap::from([("callsign".into(), "Сокіл".into())]),
            }],
            &[CustomFieldMapRow {
                display_name: "Гараж".into(),
                field_key: "garage".into(),
                description: "Тест".into(),
                initial_value: String::new(),
            }],
            &[CustomValueRow {
                owner_key: "АА 1111 АА".into(),
                values: HashMap::from([("garage".into(), "1".into())]),
            }],
            &[CrewRow {
                name: "Екіпаж Сокіл".into(),
                platoon: "1 взвод".into(),
                position_name: "СП-1".into(),
                reconnaissance_area: "Північ".into(),
            }],
            &[CrewMemberRow {
                crew_name: "Екіпаж Сокіл".into(),
                personnel_tax_id: "1234567890".into(),
                personnel_full_name: "Тест Іван Іванович".into(),
            }],
            &[
                EquipmentRow {
                    category: "generator".into(),
                    name: "EcoFlow Delta".into(),
                    inventory_number: "GEN-01".into(),
                    status: "Справний".into(),
                    crew_name: "Екіпаж Сокіл".into(),
                    holder_tax_id: String::new(),
                    holder_full_name: String::new(),
                    notes: String::new(),
                },
                EquipmentRow {
                    category: "uav".into(),
                    name: "Mavic 3".into(),
                    inventory_number: "UAV-01".into(),
                    status: "Справний".into(),
                    crew_name: "Екіпаж Сокіл".into(),
                    holder_tax_id: String::new(),
                    holder_full_name: String::new(),
                    notes: String::new(),
                },
                EquipmentRow {
                    category: "communications".into(),
                    name: "Motorola".into(),
                    inventory_number: "COM-01".into(),
                    status: "Справний".into(),
                    crew_name: "Екіпаж Сокіл".into(),
                    holder_tax_id: String::new(),
                    holder_full_name: String::new(),
                    notes: String::new(),
                },
                EquipmentRow {
                    category: "weapon_ammo".into(),
                    name: "АК-74".into(),
                    inventory_number: "WPN-01".into(),
                    status: "Справний".into(),
                    crew_name: String::new(),
                    holder_tax_id: "1234567890".into(),
                    holder_full_name: "Тест Іван Іванович".into(),
                    notes: String::new(),
                },
            ],
            &[IncidentRow {
                incident_type: "Втрата БпЛА".into(),
                occurred_at: "2026-08-15 12:30".into(),
                crew_name: "Екіпаж Сокіл".into(),
                equipment_category: "uav".into(),
                equipment_inventory_number: "UAV-01".into(),
                equipment_name: "Mavic 3".into(),
                position_name: "СП-1".into(),
                reconnaissance_area: "Північ".into(),
                description: "Тестовий запис".into(),
            }],
        )
        .unwrap();
        let imported = import(&path).unwrap();
        assert_eq!(imported.crews.len(), 1);
        assert_eq!(imported.crew_members.len(), 1);
        assert_eq!(imported.equipment.len(), 4);
        assert_eq!(imported.incidents[0].equipment_inventory_number, "UAV-01");
        assert_eq!(
            imported.personnel_custom_field_maps[0].field_key,
            "callsign"
        );
        assert_eq!(imported.vehicle_custom_fields[0].values["garage"], "1");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn checked_in_excel_template_matches_the_current_import_format() {
        let template = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("outputs/personnel-import-template.xlsx");
        let imported = import(&template).expect("контрольний Excel-шаблон має імпортуватися");

        assert!(imported.personnel.is_empty());
        assert!(imported.vehicles.is_empty());
        assert!(imported.crews.is_empty());
        assert!(imported.crew_members.is_empty());
        assert!(imported.equipment.is_empty());
        assert!(imported.incidents.is_empty());
        let mut archive = ZipArchive::new(File::open(template).unwrap()).unwrap();
        let mut workbook = String::new();
        archive
            .by_name("xl/workbook.xml")
            .unwrap()
            .read_to_string(&mut workbook)
            .unwrap();
        for sheet in [
            "Екіпажі",
            "Склад екіпажів",
            "Генератори",
            "БпЛА",
            "Зв’язок",
            "Зброя та БК",
            "Інциденти",
        ] {
            assert!(
                workbook.contains(sheet),
                "у шаблоні відсутній аркуш {sheet}"
            );
        }
    }

    #[test]
    fn imports_a_workbook_when_the_vehicle_sheet_is_not_the_fifth_sheet() {
        let path = std::env::temp_dir().join(format!(
            "shablonizator-reordered-{}.xlsx",
            std::process::id()
        ));
        export(
            &path,
            &[person()],
            &[VehicleRow {
                name: "Toyota Hilux".into(),
                registration_number: "АА 1111 АА".into(),
                status: "Справний".into(),
                driver_tax_id: "1234567890".into(),
                driver_full_name: "Тест Іван Іванович".into(),
                crew_name: String::new(),
            }],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
            &[],
        )
        .unwrap();
        let source = File::open(&path).unwrap();
        let mut source = ZipArchive::new(source).unwrap();
        let reordered = path.with_file_name(format!(
            "shablonizator-reordered-copy-{}.xlsx",
            std::process::id()
        ));
        let destination = File::create(&reordered).unwrap();
        let mut destination = ZipWriter::new(destination);
        let options = SimpleFileOptions::default();
        for index in 0..source.len() {
            let mut entry = source.by_index(index).unwrap();
            let name = entry.name().to_string();
            let mut content = String::new();
            entry.read_to_string(&mut content).unwrap();
            if name == "xl/workbook.xml" {
                content = content.replace("r:id=\"rId4\"", "r:id=\"rId5\"");
            }
            if name == "xl/_rels/workbook.xml.rels" {
                content = content.replace("Id=\"rId4\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet4.xml\"", "Id=\"rId4\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet5.xml\"");
                content = content.replace("Id=\"rId5\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet5.xml\"", "Id=\"rId5\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet4.xml\"");
            }
            destination.start_file(name, options).unwrap();
            destination.write_all(content.as_bytes()).unwrap();
        }
        destination.finish().unwrap();
        let imported = import(&reordered).unwrap();
        assert_eq!(imported.personnel.len(), 1);
        assert_eq!(imported.vehicles[0].name, "Toyota Hilux");
        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(reordered);
    }

    #[test]
    fn imports_incomplete_personnel_row_and_splits_a_full_name_from_surname_cell() {
        let path = std::env::temp_dir().join(format!(
            "shablonizator-incomplete-{}.xlsx",
            std::process::id()
        ));
        let headers = vec![
            "Звання".into(),
            "Прізвище".into(),
            "Посада".into(),
            "ІПН".into(),
        ];
        let keys = vec![
            "rank".into(),
            "surname".into(),
            "position".into(),
            "tax_id".into(),
        ];
        let personnel_xml = worksheet_xml(
            &headers,
            &keys,
            &[vec![
                "штаб-сержант".into(),
                "БАРДАЧУК АНАТОЛІЙ АНАТОЛІЙОВИЧ".into(),
                String::new(),
                String::new(),
            ]],
        );
        let file = File::create(&path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        archive.start_file("xl/workbook.xml", options).unwrap();
        archive
            .write_all("<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Особовий склад\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>".as_bytes())
            .unwrap();
        archive
            .start_file("xl/_rels/workbook.xml.rels", options)
            .unwrap();
        archive.write_all(b"<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>").unwrap();
        archive
            .start_file("xl/worksheets/sheet1.xml", options)
            .unwrap();
        archive.write_all(personnel_xml.as_bytes()).unwrap();
        archive.finish().unwrap();
        let imported = import(&path).unwrap();
        assert_eq!(imported.personnel.len(), 1);
        assert_eq!(imported.personnel[0].surname, "БАРДАЧУК");
        assert_eq!(imported.personnel[0].given_name, "АНАТОЛІЙ");
        assert_eq!(imported.personnel[0].patronymic, "АНАТОЛІЙОВИЧ");
        assert!(imported.personnel[0].tax_id.is_empty());
        let _ = std::fs::remove_file(path);
    }
}
