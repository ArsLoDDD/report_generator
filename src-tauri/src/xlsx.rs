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
pub const VEHICLE_KEYS: &[&str] = &["name", "registration_number", "status", "driver_tax_id"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VehicleRow {
    pub name: String,
    pub registration_number: String,
    pub status: String,
    pub driver_tax_id: String,
}

pub struct ImportData {
    pub personnel: Vec<PersonnelDraft>,
    pub vehicles: Vec<VehicleRow>,
    pub personnel_custom_fields: Vec<CustomValueRow>,
    pub vehicle_custom_fields: Vec<CustomValueRow>,
    pub personnel_custom_field_maps: Vec<CustomFieldMapRow>,
    pub vehicle_custom_field_maps: Vec<CustomFieldMapRow>,
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
        _ => key,
    }
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
            ]
        })
        .collect::<Vec<_>>();
    let custom_headers = |owner: &str, maps: &[CustomFieldMapRow]| {
        std::iter::once(owner.to_string())
            .chain(maps.iter().map(|field| field.display_name.clone()))
            .collect::<Vec<_>>()
    };
    let custom_keys = |owner: &str, maps: &[CustomFieldMapRow]| {
        std::iter::once(owner.to_string())
            .chain(maps.iter().map(|field| field.field_key.clone()))
            .collect::<Vec<_>>()
    };
    let custom_rows = |values: &[CustomValueRow], maps: &[CustomFieldMapRow]| {
        values
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
            .collect::<Vec<_>>()
    };
    let map_rows = |maps: &[CustomFieldMapRow]| {
        maps.iter()
            .map(|field| {
                vec![
                    field.display_name.clone(),
                    field.field_key.clone(),
                    field.description.clone(),
                    field.initial_value.clone(),
                ]
            })
            .collect::<Vec<_>>()
    };
    let personnel_custom_headers = custom_headers("ІПН", personnel_custom_maps);
    let personnel_custom_keys = custom_keys("tax_id", personnel_custom_maps);
    let vehicle_custom_headers = custom_headers("Державний номер", vehicle_custom_maps);
    let vehicle_custom_keys = custom_keys("registration_number", vehicle_custom_maps);
    let files = [
        ("[Content_Types].xml", "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet3.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet4.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet5.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet6.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet7.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/worksheets/sheet8.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>".to_string()),
        ("_rels/.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>".to_string()),
        ("xl/_rels/workbook.xml.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/><Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet3.xml\"/><Relationship Id=\"rId4\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet4.xml\"/><Relationship Id=\"rId5\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet5.xml\"/><Relationship Id=\"rId6\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet6.xml\"/><Relationship Id=\"rId7\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet7.xml\"/><Relationship Id=\"rId8\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet8.xml\"/></Relationships>".to_string()),
        ("xl/workbook.xml", "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Особовий склад\" sheetId=\"1\" r:id=\"rId1\"/><sheet name=\"Мапа полів ОС\" sheetId=\"2\" r:id=\"rId2\"/><sheet name=\"Кастомні поля ОС\" sheetId=\"3\" r:id=\"rId3\"/><sheet name=\"Автомобілі\" sheetId=\"5\" r:id=\"rId5\"/><sheet name=\"Мапа полів автомобілів\" sheetId=\"6\" r:id=\"rId6\"/><sheet name=\"Кастомні поля автомобілів\" sheetId=\"7\" r:id=\"rId7\"/></sheets></workbook>".to_string()),
        ("xl/worksheets/sheet1.xml", worksheet_xml(&personnel_headers, &personnel_keys, &personnel_rows)),
        ("xl/worksheets/sheet2.xml", worksheet_xml(&vec!["Назва в Excel".into(), "Назва змінної в БД".into()], &vec!["excel_name".into(), "field_key".into()], &PERSONNEL_KEYS.iter().map(|key| vec![personnel_label(key), key.to_string()]).collect::<Vec<_>>())),
        ("xl/worksheets/sheet3.xml", worksheet_xml(&vec!["Назва поля".into(), "Змінна в БД".into(), "Опис".into(), "Початкове значення".into()], &vec!["display_name".into(), "field_key".into(), "description".into(), "initial_value".into()], &map_rows(personnel_custom_maps))),
        ("xl/worksheets/sheet4.xml", worksheet_xml(&vec!["Назва поля".into(), "Змінна в БД".into(), "Опис".into(), "Початкове значення".into()], &vec!["display_name".into(), "field_key".into(), "description".into(), "initial_value".into()], &map_rows(personnel_custom_maps))),
        ("xl/worksheets/sheet5.xml", worksheet_xml(&vehicle_headers, &vehicle_keys, &vehicle_rows)),
        ("xl/worksheets/sheet6.xml", worksheet_xml(&vec!["Назва в Excel".into(), "Назва змінної в БД".into()], &vec!["excel_name".into(), "field_key".into()], &VEHICLE_KEYS.iter().map(|key| vec![vehicle_label(key).into(), key.to_string()]).collect::<Vec<_>>())),
        ("xl/worksheets/sheet7.xml", worksheet_xml(&vec!["Назва поля".into(), "Змінна в БД".into(), "Опис".into(), "Початкове значення".into()], &vec!["display_name".into(), "field_key".into(), "description".into(), "initial_value".into()], &map_rows(vehicle_custom_maps))),
        ("xl/worksheets/sheet8.xml", worksheet_xml(&vec!["Назва поля".into(), "Змінна в БД".into(), "Опис".into(), "Початкове значення".into()], &vec!["display_name".into(), "field_key".into(), "description".into(), "initial_value".into()], &map_rows(vehicle_custom_maps))),
    ];
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
fn records(rows: Vec<Vec<String>>, sheet: &str) -> Result<Vec<HashMap<String, String>>, String> {
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
            (!map.values().all(|value| value.trim().is_empty())).then_some(map)
        })
        .collect())
}
pub fn import(path: &Path) -> Result<ImportData, String> {
    let file = File::open(path).map_err(|_| "Не вдалося відкрити Excel-файл.".to_string())?;
    let mut archive =
        ZipArchive::new(file).map_err(|_| "Файл має пошкоджений формат XLSX.".to_string())?;
    let shared = shared_strings(&mut archive);
    let personnel_rows = records(
        workbook_rows(&mut archive, "xl/worksheets/sheet1.xml", &shared)?,
        "Особовий склад",
    )?;
    let vehicle_rows = if archive.by_name("xl/worksheets/sheet5.xml").is_ok() {
        records(
            workbook_rows(&mut archive, "xl/worksheets/sheet5.xml", &shared)?,
            "Автомобілі",
        )?
    } else {
        Vec::new()
    };
    let personnel = personnel_rows
        .into_iter()
        .map(|mut values| {
            let full_name = values.remove("full_name").unwrap_or_default();
            let parts = full_name.split_whitespace().collect::<Vec<_>>();
            let surname = values
                .remove("surname")
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| parts.first().unwrap_or(&"").to_string());
            let given_name = values
                .remove("given_name")
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| parts.get(1).unwrap_or(&"").to_string());
            let patronymic = values
                .remove("patronymic")
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| parts.get(2).unwrap_or(&"").to_string());
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
            values.remove("rank");
            values.remove("position");
            values.remove("tax_id");
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
                gender: String::new(),
                core_fields: values,
            }
        })
        .collect();
    let vehicles = vehicle_rows
        .into_iter()
        .map(|values| VehicleRow {
            name: values.get("name").cloned().unwrap_or_default(),
            registration_number: values
                .get("registration_number")
                .cloned()
                .unwrap_or_default(),
            status: values.get("status").cloned().unwrap_or_default(),
            driver_tax_id: values.get("driver_tax_id").cloned().unwrap_or_default(),
        })
        .collect();
    Ok(ImportData {
        personnel,
        vehicles,
        personnel_custom_fields: Vec::new(),
        vehicle_custom_fields: Vec::new(),
        personnel_custom_field_maps: Vec::new(),
        vehicle_custom_field_maps: Vec::new(),
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
        let path =
            std::env::temp_dir().join(format!("raportgen-roundtrip-{}.xlsx", std::process::id()));
        export(
            &path,
            &[person()],
            &[VehicleRow {
                name: "Toyota Hilux".into(),
                registration_number: "АА 1111 АА".into(),
                status: "Справний".into(),
                driver_tax_id: "1234567890".into(),
            }],
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
}
