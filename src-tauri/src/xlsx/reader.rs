use super::writer::{column_index, unescape};
use super::*;

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
                .split("<t")
                .skip(1)
                .filter_map(|part| part.split_once('>').map(|(_, text)| text))
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
        .split("<t")
        .nth(1)
        .and_then(|part| part.split_once('>').map(|(_, text)| text))
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
            let mut map = keys
                .iter()
                .enumerate()
                .filter(|(_, key)| !key.trim().is_empty())
                .map(|(index, key)| (key.clone(), row.get(index).cloned().unwrap_or_default()))
                .collect::<HashMap<_, _>>();
            if sheet == "Особовий склад" {
                // The callsign became a standard field after the first database
                // template release. Older workbooks stay importable and receive
                // an explicitly empty value that users can complete later.
                map.entry("callsign".into()).or_default();
            }
            (!map.values().all(|value| value.trim().is_empty()))
                .then_some(RowWithNumber { values: map })
        })
        .collect())
}

#[cfg(test)]
mod compatibility_tests {
    use super::*;

    #[test]
    fn old_personnel_rows_without_callsign_receive_an_empty_value() {
        let rows = vec![
            vec!["Звання".into(), "Прізвище".into()],
            vec!["rank".into(), "surname".into()],
            vec!["солдат".into(), "ТЕСТОВИЙ".into()],
        ];
        let imported = records(rows, "Особовий склад").unwrap();
        assert_eq!(imported[0].values.get("callsign"), Some(&String::new()));
    }
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
                .filter(|(_, key)| !key.trim().is_empty())
                .map(|(index, key)| {
                    (
                        key.trim().to_string(),
                        row.get(index).cloned().unwrap_or_default(),
                    )
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
            // Excel users naturally enter the visible labels "Чоловіча" and
            // "Жіноча", while the database stores their lowercase values.
            // Normalise casing and surrounding spaces at the import boundary.
            let gender = values
                .get("gender")
                .map(|value| value.trim().to_lowercase())
                .unwrap_or_default();
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
            working_strength: row
                .values
                .get("working_strength")
                .cloned()
                .unwrap_or_else(|| "0".into()),
            name: row.values.get("name").cloned().unwrap_or_default(),
            platoon: row.values.get("platoon").cloned().unwrap_or_default(),
            position_name: row.values.get("position_name").cloned().unwrap_or_default(),
            reconnaissance_area: row
                .values
                .get("reconnaissance_area")
                .cloned()
                .unwrap_or_default(),
            unit_type: row
                .values
                .get("unit_type")
                .cloned()
                .unwrap_or_else(|| "Екіпаж".into()),
            company_name: row.values.get("company_name").cloned().unwrap_or_default(),
            battle_order: row.values.get("battle_order").cloned().unwrap_or_default(),
            sector: row.values.get("sector").cloned().unwrap_or_default(),
            official_strength: row
                .values
                .get("official_strength")
                .cloned()
                .unwrap_or_else(|| "4".into()),
            status: row.values.get("status").cloned().unwrap_or_default(),
            uav_name: row.values.get("uav_name").cloned().unwrap_or_default(),
            uav_type: row.values.get("uav_type").cloned().unwrap_or_default(),
            primary_uav_inventory_number: row
                .values
                .get("primary_uav_inventory_number")
                .cloned()
                .unwrap_or_default(),
            functional_duties: row
                .values
                .get("functional_duties")
                .cloned()
                .unwrap_or_default(),
            current_location: row
                .values
                .get("current_location")
                .cloned()
                .unwrap_or_default(),
            notes: row.values.get("notes").cloned().unwrap_or_default(),
        })
        .collect();
    let positions = optional_records(&mut archive, "Позиції", &shared)?
        .into_iter()
        .map(|row| PositionRow {
            name: row.values.get("name").cloned().unwrap_or_default(),
            position_type: row.values.get("position_type").cloned().unwrap_or_default(),
            strip_name: row.values.get("strip_name").cloned().unwrap_or_default(),
            locality: row.values.get("locality").cloned().unwrap_or_default(),
            battle_order: row.values.get("battle_order").cloned().unwrap_or_default(),
            sector: row.values.get("sector").cloned().unwrap_or_default(),
            condition: row.values.get("condition").cloned().unwrap_or_default(),
            condition_level: row
                .values
                .get("condition_level")
                .cloned()
                .unwrap_or_else(|| "0".into()),
            field_type: row.values.get("field_type").cloned().unwrap_or_default(),
            size: row.values.get("size").cloned().unwrap_or_default(),
            mgrs: row.values.get("mgrs").cloned().unwrap_or_default(),
            suitable_uav_text: row
                .values
                .get("suitable_uav_text")
                .cloned()
                .unwrap_or_default(),
            is_active: row.values.get("is_active").cloned().unwrap_or_default(),
            crew_name: row.values.get("crew_name").cloned().unwrap_or_default(),
            notes: row.values.get("notes").cloned().unwrap_or_default(),
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
                    total_quantity: row
                        .values
                        .get("total_quantity")
                        .cloned()
                        .unwrap_or_else(|| "1".into()),
                    day_quantity: row.values.get("day_quantity").cloned().unwrap_or_default(),
                    night_quantity: row
                        .values
                        .get("night_quantity")
                        .cloned()
                        .unwrap_or_default(),
                    uav_type: row.values.get("uav_type").cloned().unwrap_or_default(),
                    asset_kind: row
                        .values
                        .get("asset_kind")
                        .cloned()
                        .unwrap_or_else(|| "aircraft".into()),
                    components_json: row
                        .values
                        .get("components_json")
                        .cloned()
                        .unwrap_or_default(),
                    assigned_quantity: row
                        .values
                        .get("assigned_quantity")
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
    let mut staffing = crate::staffing_exchange::ExtraSheets::new();
    for (name, _) in crate::staffing_exchange::SHEETS {
        if worksheet_path_by_name(&mut archive, name)?.is_some() {
            staffing.insert(
                name.to_string(),
                optional_records(&mut archive, name, &shared)?
                    .into_iter()
                    .map(|row| row.values)
                    .collect(),
            );
        }
    }
    Ok(ImportData {
        staffing,
        personnel,
        vehicles,
        crews,
        crew_members,
        equipment,
        incidents,
        positions,
        personnel_custom_fields,
        vehicle_custom_fields,
        personnel_custom_field_maps,
        vehicle_custom_field_maps,
    })
}
