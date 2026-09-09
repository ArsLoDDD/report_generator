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
        gender: "Чоловіча".into(),
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
    assert_eq!(imported.personnel[0].gender, "чоловіча");
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
            ..CrewRow::default()
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
        &[PositionRow {
            name: "СП Тест".into(),
            position_type: "Основна".into(),
            strip_name: "Смуга 1".into(),
            locality: "н.п. Тестове".into(),
            battle_order: "БР №1".into(),
            sector: "Північ".into(),
            condition: "Готова".into(),
            condition_level: "80".into(),
            field_type: "Відкрите".into(),
            size: "20 × 30 м".into(),
            mgrs: "36U UV 12000 67000".into(),
            suitable_uav_text: "Mavic".into(),
            is_active: "Так".into(),
            crew_name: "Екіпаж Сокіл".into(),
            notes: String::new(),
        }],
    )
    .unwrap();
    let imported = import(&path).unwrap();
    assert_eq!(imported.crews.len(), 1);
    assert_eq!(imported.crew_members.len(), 1);
    assert_eq!(imported.equipment.len(), 4);
    assert_eq!(imported.positions.len(), 1);
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
    assert!(imported.positions.is_empty());
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
        "Фактичний склад екіпажів",
        "Генератори",
        "БпЛА",
        "Зв’язок",
        "Зброя та БК",
        "Інциденти",
        "Позиції",
        "Мапа полів позицій",
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

#[test]
fn exports_bcs_with_the_reference_columns_and_location_totals() {
    let path = std::env::temp_dir().join(format!("shablonizator-bcs-{}.xlsx", std::process::id()));
    export_bcs(
        &path,
        "РБАК",
        "16.08.2026",
        78,
        &[
            BcsRow {
                group_key: "crew-1".into(),
                section: "Екіпаж".into(),
                color_key: "crew-working".into(),
                crew_name: "Екіпаж ТЕСТ".into(),
                crew_actual: "3".into(),
                crew_official: "4".into(),
                full_name: "ТЕСТОВИЙ Тест Тестович".into(),
                location: "На позиції".into(),
                ..BcsRow::default()
            },
            BcsRow {
                group_key: "crew-1".into(),
                section: "Екіпаж".into(),
                color_key: "crew-working".into(),
                crew_name: "Екіпаж ТЕСТ".into(),
                crew_actual: "3".into(),
                crew_official: "4".into(),
                full_name: "ДРУГИЙ Тест Тестович".into(),
                location: "На позиції".into(),
                ..BcsRow::default()
            },
        ],
    )
    .unwrap();
    let mut archive = ZipArchive::new(File::open(&path).unwrap()).unwrap();
    let mut workbook = String::new();
    archive
        .by_name("xl/workbook.xml")
        .unwrap()
        .read_to_string(&mut workbook)
        .unwrap();
    assert!(workbook.contains("БЧС"));
    let mut sheet = String::new();
    archive
        .by_name("xl/worksheets/sheet1.xml")
        .unwrap()
        .read_to_string(&mut sheet)
        .unwrap();
    assert!(sheet.contains("Підрозділи по типу"));
    assert!(sheet.contains("Логістика на позиції"));
    assert!(sheet.contains("По штату"));
    assert!(sheet.contains("s=\"171\""));
    assert!(sheet.contains("<mergeCell ref=\"A7:A8\"/>"));
    assert!(sheet.contains("<mergeCell ref=\"J7:J8\"/>"));
    assert_eq!(sheet.matches("Екіпаж ТЕСТ").count(), 1);
    assert!(sheet.contains("ТЕСТОВИЙ Тест Тестович"));
    assert!(sheet.contains("ДРУГИЙ Тест Тестович"));
    let mut styles = String::new();
    archive
        .by_name("xl/styles.xml")
        .unwrap()
        .read_to_string(&mut styles)
        .unwrap();
    assert!(styles.contains("<fills count=\"19\">"));
    assert!(styles.contains("FFD7E48D"));
    assert!(styles.contains("FFFCD5B4"));
    let _ = std::fs::remove_file(path);
}
