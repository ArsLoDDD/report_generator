use super::*;

#[test]
fn creates_a_template_copy_from_confirmed_literal_replacements() {
    let root = std::env::temp_dir().join(format!("shablonizator-analyser-{}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    let source = root.join("source.docx");
    let destination = root.join("template.docx");
    let mut writer = ZipWriter::new(File::create(&source).unwrap());
    writer
        .start_file("word/document.xml", SimpleFileOptions::default())
        .unwrap();
    writer
            .write_all("<w:r><w:t>ІВАНЕНКО Іван </w:t></w:r><w:r><w:t>Іванович, Заступник командира</w:t></w:r>".as_bytes())
            .unwrap();
    writer.finish().unwrap();
    create_template_from_replacements(
        &source,
        &destination,
        &[
            ("ІВАНЕНКО Іван Іванович".into(), "військовий_1_піб".into()),
            ("заступник командира".into(), "військовий_1_посада".into()),
        ],
    )
    .unwrap();
    assert!(read_docx_text(&source)
        .unwrap()
        .contains("ІВАНЕНКО Іван Іванович"));
    assert!(read_docx_text(&destination)
        .unwrap()
        .contains("{{військовий_1_піб}}"));
    assert!(read_docx_text(&destination)
        .unwrap()
        .contains("{{військовий_1_посада}}"));
    assert!(ZipArchive::new(File::open(&destination).unwrap()).is_ok());
    assert!(!destination
        .with_file_name(format!(
            ".{}.partial-{}",
            destination.file_name().unwrap().to_string_lossy(),
            std::process::id()
        ))
        .exists());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn literal_replacement_keeps_case_and_boundary_spaces() {
    let xml = "<w:r><w:t>ПОЧАТОК</w:t></w:r>";
    let result = replace_word_token_case_insensitive(xml, "початок", "  як Введено ");
    assert!(result.contains("<w:t xml:space=\"preserve\">  як Введено </w:t>"));
}

#[test]
fn literal_replacement_can_delete_whitespace() {
    let xml = "<w:r><w:t>ліве  праве</w:t></w:r>";
    let result = replace_word_token_case_insensitive(xml, "  ", "");
    assert!(result.contains("<w:t>лівеправе</w:t>"));
}

#[test]
fn literal_replacement_can_target_one_specific_occurrence() {
    let xml = "<w:r><w:t>один пробіл один пробіл один</w:t></w:r>";
    let result = replace_word_token_occurrence_case_insensitive(xml, " ", "_", Some(1));
    assert!(result.contains("<w:t>один пробіл_один пробіл один</w:t>"));
}

#[test]
fn creates_a_readable_template_from_a_real_docx_when_available() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("Згенеровані рапорти/11.08.2026/Прибуття з ПТЗ Новостав в РВЗ Охтирка КОВАЛЕНКО 11.08.2026.docx");
    if !source.is_file() {
        return;
    }
    let root = std::env::temp_dir().join(format!(
        "shablonizator-real-analyser-{}",
        std::process::id()
    ));
    fs::create_dir_all(&root).unwrap();
    let destination = root.join("template.docx");
    create_template_from_replacements(&source, &destination, &[]).unwrap();
    let archive = ZipArchive::new(File::open(&destination).unwrap()).unwrap();
    assert!(archive.file_names().any(|name| name == "word/document.xml"));
    assert!(!read_docx_text(&destination).unwrap().trim().is_empty());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn creates_a_readable_template_from_the_analyser_report_when_available() {
    let source = Path::new("/Users/macbook/Downloads/Щодо завершення виконання завдань згідно БР№307 Екіпаж ПОЮШКА з 12.08.2026.docx");
    if !source.is_file() {
        return;
    }
    let root = std::env::temp_dir().join(format!(
        "shablonizator-analyser-report-{}",
        std::process::id()
    ));
    fs::create_dir_all(&root).unwrap();
    let destination = root.join("template.docx");
    create_template_from_replacements(
        source,
        &destination,
        &[
            ("ПЛЮШКА".into(), "назва_екіпажу_1".into()),
            ("СІЛЬПО".into(), "назва_позиції_1".into()),
            ("ОСОЇВКА".into(), "населений_пункт_1".into()),
            ("Арсеній ШКОЛЬНІКОВ".into(), "основний_підписант_піб".into()),
        ],
    )
    .unwrap();
    assert!(ZipArchive::new(File::open(&destination).unwrap()).is_ok());
    let result = read_docx_text(&destination).unwrap();
    assert!(result.contains("{{назва_екіпажу_1}}"));
    assert!(result.contains("{{назва_позиції_1}}"));
    assert!(result.contains("{{населений_пункт_1}}"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn creates_a_readable_template_from_the_allowed_test_report() {
    let source = Path::new("/Users/macbook/Downloads/Щодо завершення виконання завдань згідно БР№999 Екіпаж ТЕСТЮШКІ з 12.08.2026.docx");
    if !source.is_file() {
        return;
    }
    let root = std::env::temp_dir().join(format!(
        "shablonizator-allowed-analyser-report-{}",
        std::process::id()
    ));
    fs::create_dir_all(&root).unwrap();
    let destination = root.join("template.docx");
    create_template_from_replacements(
        source,
        &destination,
        &[
            ("ТЕСТЮШКІ".into(), "назва_екіпажу_1".into()),
            ("Максім".into(), "військовий_1_імя".into()),
            ("ТАКТІКУЛЬЩІК".into(), "військовий_1_прізвище".into()),
            ("12.08.2026".into(), "дата_рапорту_1".into()),
        ],
    )
    .unwrap();
    assert!(ZipArchive::new(File::open(&destination).unwrap()).is_ok());
    let result = read_docx_text(&destination).unwrap();
    assert!(result.contains("{{назва_екіпажу_1}}"));
    // Не прив'язуємо результат до конкретного наповнення локального документа:
    // в ньому може не бути тестового імені як окремого текстового фрагмента.
    assert!(result.contains("{{дата_рапорту_1}}"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn registry_accepts_every_v2_variable() {
    for f in &registry().person_fields {
        assert!(validate_token(&format!("військовий_12_{}", f.id)).is_empty())
    }
    for r in &registry().signer_roles {
        for f in &registry().signer_fields {
            assert!(validate_token(&format!("{}_{}", r.id, f.id)).is_empty())
        }
    }
    for field in &registry().crew_fields {
        assert!(validate_token(&format!("екіпаж_1_{}", field.id)).is_empty())
    }
    for field in &registry().vehicle_fields {
        assert!(validate_token(&format!("автомобіль_1_{}", field.id)).is_empty());
        assert!(validate_token(&format!("військовий_1_автомобіль_1_{}", field.id)).is_empty());
    }
    for field in &registry().position_fields {
        assert!(validate_token(&format!("позиція_1_{}", field.id)).is_empty())
    }
    for prefix in ["генератор", "бпла", "звʼязок", "зброя_та_бк"] {
        for field in &registry().equipment_fields {
            assert!(validate_token(&format!("{prefix}_1_{}", field.id)).is_empty())
        }
    }
    for field in &registry().document_fields {
        assert!(validate_token(&field.id).is_empty())
    }
}

#[test]
fn requires_an_explicit_field_for_a_numbered_crew_subject() {
    assert!(validate_token("назва_екіпажу_1").is_empty());
    assert_eq!(selection_kind("назва_екіпажу_1"), None);
    assert!(!validate_token("екіпаж_1").is_empty());
    assert!(!validate_token("екіпаж_назва").is_empty());
}

#[test]
fn derives_exact_counts_for_every_selected_subject_without_confusing_document_parameters() {
    let tokens = vec![
        "назва_екіпажу_1".to_string(),
        "військовий_2_піб".to_string(),
        "автомобіль_3_номер".to_string(),
        "генератор_2_назва".to_string(),
        "бпла_1_статус".to_string(),
        "позиція_2_mgrs".to_string(),
    ];
    let result = selection_requirements(&tokens);
    assert_eq!(result.get("personnel"), Some(&2));
    assert_eq!(result.get("vehicle"), Some(&3));
    assert_eq!(result.get("generator"), Some(&2));
    assert_eq!(result.get("uav"), Some(&1));
    assert_eq!(result.get("position"), Some(&2));
    assert_eq!(result.get("crew"), None);
}

#[test]
fn resolves_selected_crew_and_equipment_values() {
    let connection = Connection::open_in_memory().unwrap();
    crate::database::initialise(&connection).unwrap();
    crate::database::seed_test_personnel(&connection).unwrap();
    let member_id = personnel::list(&connection).unwrap().remove(0).id;
    connection
        .execute(
            "UPDATE personnel SET position='Командир екіпажу' WHERE id=?1",
            [member_id],
        )
        .unwrap();
    connection.execute("INSERT INTO crews(name,platoon,position_name,reconnaissance_area) VALUES('Екіпаж «Тест»','1 взвод','СП «Тест»','район Тестовий')", []).unwrap();
    let crew_id = connection.last_insert_rowid();
    connection
        .execute(
            "INSERT INTO crew_members(crew_id,personnel_id) VALUES(?1,?2)",
            rusqlite::params![crew_id, member_id],
        )
        .unwrap();
    connection
        .execute(
            "INSERT OR REPLACE INTO crew_actual_members(crew_id,personnel_id) VALUES(?1,?2)",
            rusqlite::params![crew_id, member_id],
        )
        .unwrap();
    connection.execute("INSERT INTO vehicles(name,registration_number,status,crew_id) VALUES('Тест-авто','ТЕСТ 001','Справний',?1)", [crew_id]).unwrap();
    connection.execute("INSERT INTO equipment(category,name,inventory_number,status,crew_id,notes) VALUES('uav','Тест-БпЛА','БПЛА-Т','Справний',?1,'Контрольний запис')", [crew_id]).unwrap();
    let equipment_id = connection.last_insert_rowid();
    connection.execute("INSERT INTO equipment(category,name,inventory_number,status,personnel_id,notes) VALUES('weapon_ammo','АК-74','АБ 123','Справний',?1,'Особисто закріплено')", [member_id]).unwrap();
    connection.execute("INSERT INTO positions(name,position_type,locality,mgrs,is_active,crew_id) VALUES('СП «Тест»','Основна','н.п. Тестове','36U UV 12000 67000',1,?1)", [crew_id]).unwrap();
    let position_id = connection.last_insert_rowid();
    let mut values = HashMap::new();
    add_selected_crews(&connection, &[crew_id], &mut values).unwrap();
    add_selected_equipment(&connection, &[equipment_id], &mut values).unwrap();
    add_selected_positions(&connection, &[position_id], &mut values).unwrap();
    assert_eq!(values["екіпаж_1_назва"].text, "Екіпаж «Тест»");
    assert_eq!(values["екіпаж_1_автомобілі"].text, "Тест-авто ТЕСТ 001");
    assert_eq!(values["екіпаж_1_бпла"].text, "Тест-БпЛА БПЛА-Т");
    assert!(values["екіпаж_1_майно"].text.contains("Тест-БпЛА БПЛА-Т"));
    assert!(values["екіпаж_1_майно"].text.contains("АК-74 АБ 123"));
    assert_eq!(values["екіпаж_1_зброя_та_бк"].text, "АК-74 АБ 123");
    assert_eq!(
        values["екіпаж_1_командир_піб"].text,
        "ВАСИЛЬОК Іван Аркадійович"
    );
    assert_eq!(values["бпла_1_назва"].text, "Тест-БпЛА");
    assert_eq!(values["бпла_1_екіпаж"].text, "Екіпаж «Тест»");
    assert_eq!(values["бпла_1_позиція"].text, "СП «Тест»");
    assert_eq!(values["позиція_1_назва"].text, "СП «Тест»");
    assert_eq!(values["позиція_1_mgrs"].text, "36U UV 12000 67000");
}

#[test]
fn keeps_official_and_actual_crew_relations_separate_for_a_person() {
    let connection = Connection::open_in_memory().unwrap();
    crate::database::initialise(&connection).unwrap();
    crate::database::seed_test_personnel(&connection).unwrap();
    let person = personnel::list(&connection).unwrap().remove(0);
    connection
        .execute("INSERT INTO crews(name) VALUES('ОФІЦІЙНИЙ')", [])
        .unwrap();
    let official_id = connection.last_insert_rowid();
    connection
        .execute("INSERT INTO crews(name) VALUES('ФАКТИЧНИЙ')", [])
        .unwrap();
    let actual_id = connection.last_insert_rowid();
    connection
        .execute(
            "INSERT INTO crew_members(crew_id,personnel_id) VALUES(?1,?2)",
            rusqlite::params![official_id, person.id],
        )
        .unwrap();
    connection
        .execute(
            "INSERT OR REPLACE INTO crew_actual_members(crew_id,personnel_id) VALUES(?1,?2)",
            rusqlite::params![actual_id, person.id],
        )
        .unwrap();

    let values = values_for(&connection, &[person], &settings::defaults(), None, None).unwrap();
    assert_eq!(values["військовий_1_екіпаж"].text, "ОФІЦІЙНИЙ");
    assert_eq!(values["військовий_1_фактичний_екіпаж"].text, "ФАКТИЧНИЙ");
}

#[test]
fn resolves_driver_and_crew_from_a_selected_vehicle() {
    let connection = Connection::open_in_memory().unwrap();
    crate::database::initialise(&connection).unwrap();
    crate::database::seed_test_personnel(&connection).unwrap();
    let driver = personnel::list(&connection).unwrap().remove(0);
    connection
        .execute("INSERT INTO crews(name) VALUES('СОКІЛ')", [])
        .unwrap();
    let crew_id = connection.last_insert_rowid();
    connection.execute("INSERT INTO vehicles(name,registration_number,status,personnel_id,crew_id) VALUES('HILUX','АА 0001 АА','Справний',?1,?2)", rusqlite::params![driver.id, crew_id]).unwrap();
    let vehicle_id = connection.last_insert_rowid();
    let mut values = HashMap::new();
    add_selected_vehicles(&connection, &[vehicle_id], &mut values).unwrap();
    assert_eq!(
        values["автомобіль_1_водій_піб"].text,
        "ВАСИЛЬОК Іван Аркадійович"
    );
    assert_eq!(values["автомобіль_1_екіпаж"].text, "СОКІЛ");
}

#[test]
fn resolves_stable_and_legacy_custom_field_tokens() {
    let connection = Connection::open_in_memory().unwrap();
    crate::database::initialise(&connection).unwrap();
    crate::database::seed_test_personnel(&connection).unwrap();
    let person = personnel::list(&connection).unwrap().remove(0);
    crate::database::create_custom_field(
        &connection,
        crate::database::CustomFieldDefinition {
            field_key: "unit_code".into(),
            display_name: "Код підрозділу".into(),
            description: String::new(),
            initial_value: String::new(),
            scope: "personnel".into(),
        },
    )
    .unwrap();
    connection.execute("UPDATE personnel_custom_fields SET field_value='А0000' WHERE personnel_id=?1 AND field_key='unit_code'", [person.id]).unwrap();
    crate::database::update_custom_field(
        &connection,
        crate::database::CustomFieldDefinition {
            field_key: "unit_code".into(),
            display_name: "Шифр підрозділу".into(),
            description: String::new(),
            initial_value: String::new(),
            scope: "personnel".into(),
        },
    )
    .unwrap();
    let mut values = HashMap::new();
    add_custom_values(&connection, &[person], &mut values).unwrap();
    assert_eq!(values["військовий_1_custom_unit_code"].text, "А0000");
    assert_eq!(values["військовий_1_код_підрозділу"].text, "А0000");
    assert_eq!(values["військовий_1_шифр_підрозділу"].text, "А0000");
    assert!(
        validate_custom_field_reference(&connection, "військовий_1_custom_unit_code").is_none()
    );
    assert!(validate_custom_field_reference(&connection, "військовий_1_код_підрозділу").is_none());
    assert!(validate_custom_field_reference(&connection, "військовий_1_custom_missing").is_some());
}

#[test]
fn generates_an_existing_template_after_custom_field_was_renamed() {
    let connection = Connection::open_in_memory().unwrap();
    crate::database::initialise(&connection).unwrap();
    crate::database::seed_test_personnel(&connection).unwrap();
    crate::database::create_custom_field(
        &connection,
        crate::database::CustomFieldDefinition {
            field_key: "unit_code".into(),
            display_name: "Стара назва".into(),
            description: String::new(),
            initial_value: "А0000".into(),
            scope: "personnel".into(),
        },
    )
    .unwrap();
    crate::database::update_custom_field(
        &connection,
        crate::database::CustomFieldDefinition {
            field_key: "unit_code".into(),
            display_name: "Нова назва".into(),
            description: String::new(),
            initial_value: "А0000".into(),
            scope: "personnel".into(),
        },
    )
    .unwrap();

    let root = std::env::temp_dir().join(format!(
        "shablonizator-legacy-custom-{}-{}",
        std::process::id(),
        Local::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    fs::create_dir_all(root.join("Налаштування")).unwrap();
    let template = root.join("legacy.docx");
    let mut writer = ZipWriter::new(File::create(&template).unwrap());
    writer
        .start_file("word/document.xml", SimpleFileOptions::default())
        .unwrap();
    writer
        .write_all("<w:t>{{військовий_1_стара_назва}}</w:t>".as_bytes())
        .unwrap();
    writer.finish().unwrap();

    let generated = generate(
        &connection,
        &root,
        GenerateReportRequest {
            template_path: template.to_string_lossy().into(),
            personnel_ids: vec![1],
            report_date: None,
            vehicle_ids: Vec::new(),
            crew_ids: Vec::new(),
            position_ids: Vec::new(),
            equipment_ids: Vec::new(),
            parameters: HashMap::new(),
        },
    )
    .unwrap();
    assert!(read_docx_text(Path::new(&generated.docx_path))
        .unwrap()
        .contains("А0000"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn resolves_custom_fields_for_a_standalone_selected_vehicle() {
    let connection = Connection::open_in_memory().unwrap();
    crate::database::initialise(&connection).unwrap();
    connection.execute("INSERT INTO vehicles(name,registration_number,status) VALUES('Тест','АА 0001 АА','Справний')", []).unwrap();
    let vehicle_id = connection.last_insert_rowid();
    connection.execute("INSERT INTO vehicle_custom_field_definitions(field_key,display_name,description,initial_value) VALUES('fuel_type','Тип пального','','')", []).unwrap();
    connection.execute("INSERT INTO vehicle_custom_fields(vehicle_id,field_key,field_value) VALUES(?1,'fuel_type','ДП')", [vehicle_id]).unwrap();
    let mut values = HashMap::new();
    add_selected_vehicles(&connection, &[vehicle_id], &mut values).unwrap();
    assert_eq!(values["автомобіль_1_custom_fuel_type"].text, "ДП");
    assert_eq!(values["автомобіль_1_тип_пального"].text, "ДП");
}

#[test]
fn resolves_variables_for_a_signer_added_in_settings() {
    let connection = Connection::open_in_memory().unwrap();
    let mut configured = settings::defaults();
    configured.signer_roles.push(settings::SignerRole {
        id: "черговий_частини".into(),
        name: "Черговий частини".into(),
        signer: settings::SignerSettings {
            full_name: "ПЕТРЕНКО Петро Петрович".into(),
            rank: "капітан".into(),
            position: "Черговий частини".into(),
        },
    });
    assert!(validate_token("черговий_частини_піб").is_empty());
    let values = values_for(&connection, &[], &configured, None, None).unwrap();
    assert_eq!(values["черговий_частини_звання"].text, "капітан");
    assert_eq!(
        values["черговий_частини_піб"].text,
        "ПЕТРЕНКО Петро Петрович"
    );
}
#[test]
fn accepts_v1_compatibility_variables_and_explains_typos() {
    for field in [
        "rank",
        "surname",
        "givenName",
        "patronymic",
        "fullName",
        "position",
        "taxId",
        "birthDate",
        "educationLevel",
        "educationDetails",
        "armedForcesServiceStartDate",
        "positionAssignedDate",
        "positionAssignmentOrder",
        "militaryId",
        "assignedVehicleName",
        "assignedVehicleRegistration",
    ] {
        assert!(validate_token(&format!("soldier.{field}")).is_empty());
        assert!(validate_token(&format!("soldiers[2].{field}")).is_empty());
    }
    for token in [
        "mainRank",
        "mainName",
        "mainPosition",
        "mainSignature",
        "commanderName",
        "chiefName",
    ] {
        assert!(validate_token(token).is_empty(), "{token}");
    }
    assert!(!validate_token("soldier.unknown").is_empty());
    assert!(!validate_token("soldiers[x].fullName").is_empty());
    assert!(!validate_token("невідома.змінна").is_empty());
    assert!(validate_token("військовий_1_піб:родовийй")[0].contains("родовий"))
}

#[test]
fn derives_personnel_count_from_zero_based_v1_variables() {
    let result = selection_requirements(&[
        "soldier.fullName".into(),
        "soldiers[0].rank".into(),
        "soldiers[2].position".into(),
        "mainName".into(),
    ]);
    assert_eq!(result.get("personnel"), Some(&3));
    assert_eq!(person_number("soldier.fullName"), Some(1));
    assert_eq!(person_number("soldiers[2].fullName"), Some(3));
}

#[test]
fn resolves_v1_person_and_signer_aliases_from_current_data() {
    let connection = Connection::open_in_memory().unwrap();
    crate::database::initialise(&connection).unwrap();
    crate::database::seed_test_personnel(&connection).unwrap();
    let people = personnel::list(&connection).unwrap();
    let mut configured = settings::defaults();
    for (role, full_name, rank, position) in [
        (
            "основний_підписант",
            "ІВАНЕНКО Іван Іванович",
            "майор",
            "командир роти",
        ),
        (
            "командир",
            "ПЕТРЕНКО Петро Петрович",
            "полковник",
            "командир батальйону",
        ),
        (
            "начальник_штабу",
            "СИДОРЕНКО Сергій Сергійович",
            "підполковник",
            "начальник штабу",
        ),
    ] {
        configured
            .signer_roles
            .iter_mut()
            .find(|item| item.id == role)
            .unwrap()
            .signer = settings::SignerSettings {
            full_name: full_name.into(),
            rank: rank.into(),
            position: position.into(),
        };
    }
    let values = values_for(&connection, &people[..2], &configured, None, None).unwrap();
    for (legacy, current) in [
        ("soldier.fullName", "військовий_1_піб"),
        ("soldier.assignedVehicleName", "військовий_1_автомобіль"),
        ("soldiers[0].rank", "військовий_1_звання"),
        ("soldiers[1].taxId", "військовий_2_іпн"),
        ("mainRank", "основний_підписант_звання"),
        ("mainName", "основний_підписант_піб"),
        ("mainPosition", "основний_підписант_посада"),
        ("commanderName", "командир_піб"),
        ("chiefName", "начальник_штабу_піб"),
    ] {
        assert_eq!(values[legacy].text, values[current].text, "{legacy}");
    }
    assert_eq!(values["mainSignature"].text, "");
}
#[test]
fn validates_duplicates_conflicts_and_types() {
    assert_eq!(validate_token("військовий_1_піб:родовий:родовий").len(), 2);
    assert!(!validate_token("військовий_1_піб:великими:маленькими").is_empty());
    assert!(!validate_token("військовий_1_іпн:родовий").is_empty());
    assert!(!validate_token("військовий_1_код_нагороди:родовий").is_empty())
}
#[test]
fn applies_unlimited_pipeline() {
    let v = Value::new("Іван".into(), "person-name", Some("чоловіча"));
    assert_eq!(
        apply_modifiers(&v, &["родовий", "великими"]).unwrap(),
        "ІВАНА"
    )
}

#[test]
fn keeps_the_unit_code_capital_after_position_modifiers() {
    let position = Value::new(
        "Командир відділення, військова частина А5027".into(),
        "position",
        Some("чоловіча"),
    );
    assert_eq!(
        apply_modifiers(&position, &["маленькими"]).unwrap(),
        "командир відділення, військова частина А5027"
    );
    assert!(apply_modifiers(&position, &["родовий", "маленькими"])
        .unwrap()
        .ends_with("військова частина А5027"));
}

#[test]
fn accepts_and_formats_numbered_generation_parameters() {
    assert!(validate_token("дата_рапорту").is_empty());
    assert!(validate_token("дата_рапорту_1").is_empty());
    assert!(validate_token("дата_рапорту_2").is_empty());
    assert!(validate_token("обставини_3").is_empty());
    assert!(!validate_token("дата_рапорту_0").is_empty());

    let mut values = HashMap::new();
    let parameters = HashMap::from([
        ("дата_рапорту_1".to_string(), "2026-08-12".to_string()),
        ("дата_рапорту_2".to_string(), "2026-08-13".to_string()),
        (
            "обставини_3".to_string(),
            "Виявлено несправність".to_string(),
        ),
    ]);
    add_generation_parameters(&mut values, &parameters, None).unwrap();
    assert_eq!(values["дата_рапорту_1"].text, "12.08.2026 року");
    assert_eq!(values["дата_рапорту_2"].text, "13.08.2026 року");
    assert_eq!(values["обставини_3"].text, "Виявлено несправність");
}

#[test]
fn accepts_a_manual_ukrainian_template_parameter() {
    assert!(validate_token("умови_передачі").is_empty());
    assert!(validate_token("адреса_лікарні").is_empty());
    assert!(!validate_token("soldier_name").is_empty());

    let mut values = HashMap::new();
    let parameters = HashMap::from([(
        "умови_передачі".to_string(),
        "Згідно з актом приймання-передачі".to_string(),
    )]);
    add_generation_parameters(&mut values, &parameters, None).unwrap();
    assert_eq!(
        values["умови_передачі"].text,
        "Згідно з актом приймання-передачі"
    );
}

#[test]
fn protects_runtime_signers_and_rejects_obvious_parameter_typos() {
    assert!(validate_token("черговий_частини_піб").is_empty());
    assert!(!validate_token("дата_рапортуа").is_empty());
    assert!(validate_token("параметр_особливі_умови").is_empty());

    let mut values = HashMap::from([(
        "черговий_частини_піб".to_string(),
        Value::new(
            "ПЕТРЕНКО Петро Петрович".into(),
            "person-name",
            Some("чоловіча"),
        ),
    )]);
    let parameters = HashMap::from([(
        "черговий_частини_піб".to_string(),
        "НЕ ПОВИННО ПЕРЕЗАПИСАТИСЯ".to_string(),
    )]);
    add_generation_parameters(&mut values, &parameters, None).unwrap();
    assert_eq!(
        values["черговий_частини_піб"].text,
        "ПЕТРЕНКО Петро Петрович"
    );
}

#[test]
fn supports_every_compatible_modifier_for_document_parameters() {
    for field in &registry().document_fields {
        let styles = format!("{}:жирним:підкреслити", field.id);
        assert!(validate_token(&styles).is_empty(), "{styles}");

        if field.kind == "number" {
            assert!(
                !validate_token(&format!("{}:великими", field.id)).is_empty(),
                "numeric parameter {} must reject a case-changing modifier",
                field.id
            );
        } else {
            for modifier in ["великими", "маленькими", "з_великої"] {
                let token = format!("{}:{modifier}", field.id);
                assert!(validate_token(&token).is_empty(), "{token}");
            }
        }

        for modifier in ["родовий", "давальний", "орудний"] {
            let token = format!("{}:{modifier}", field.id);
            assert_eq!(validate_token(&token).is_empty(), field.cases, "{token}");
        }
    }

    let value = Value::new("тестове значення".into(), "text", None);
    assert_eq!(
        apply_modifiers(&value, &["великими"]).unwrap(),
        "ТЕСТОВЕ ЗНАЧЕННЯ"
    );
    assert_eq!(
        apply_modifiers(&value, &["маленькими"]).unwrap(),
        "тестове значення"
    );
    assert_eq!(
        apply_modifiers(&value, &["з_великої"]).unwrap(),
        "Тестове значення"
    );
}

#[test]
fn generates_docx_with_each_numbered_parameter_value() {
    use crate::database;
    let connection = Connection::open_in_memory().unwrap();
    database::initialise(&connection).unwrap();
    let root =
        std::env::temp_dir().join(format!("shablonizator-parameters-{}", std::process::id()));
    fs::create_dir_all(root.join("Налаштування")).unwrap();
    let template = root.join("parameters.docx");
    let mut writer = ZipWriter::new(File::create(&template).unwrap());
    writer
        .start_file("word/document.xml", SimpleFileOptions::default())
        .unwrap();
    writer.write_all("<w:r><w:t>{{дата_рапорту_1}}; {{дата_рапорту_2}}; {{обставини:з_великої:жирним:підкреслити}}; {{тема_рапорту:великими}}; {{адресат:маленькими}}</w:t></w:r>".as_bytes()).unwrap();
    writer.finish().unwrap();
    let generated = generate(
        &connection,
        &root,
        GenerateReportRequest {
            template_path: template.to_string_lossy().into(),
            personnel_ids: Vec::new(),
            report_date: None,
            vehicle_ids: Vec::new(),
            crew_ids: Vec::new(),
            position_ids: Vec::new(),
            equipment_ids: Vec::new(),
            parameters: HashMap::from([
                ("дата_рапорту_1".into(), "2026-08-12".into()),
                ("дата_рапорту_2".into(), "2026-08-13".into()),
                ("обставини".into(), "виявлено несправність".into()),
                ("тема_рапорту".into(), "контрольний рапорт".into()),
                ("адресат".into(), "КОМАНДИРУ ЧАСТИНИ".into()),
            ]),
        },
    )
    .unwrap();
    let mut archive = ZipArchive::new(File::open(generated.docx_path).unwrap()).unwrap();
    let mut xml = String::new();
    archive
        .by_name("word/document.xml")
        .unwrap()
        .read_to_string(&mut xml)
        .unwrap();
    assert!(xml.contains("12.08.2026 року; 13.08.2026 року; Виявлено несправність; КОНТРОЛЬНИЙ РАПОРТ; командиру частини"));
    assert!(xml.contains("<w:b/>") && xml.contains("<w:u w:val=\"single\"/>"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn applies_docx_style_modifiers_without_conflict() {
    let xml = "<w:r><w:t>{{військовий_1_піб:жирним:підкреслити}}</w:t></w:r>";
    let mut m = HashMap::new();
    m.insert(
        "військовий_1_піб".into(),
        Value::new("Іван".into(), "person-name", Some("чоловіча")),
    );
    let replaced = replace_variables(xml, &m).unwrap();
    assert!(replaced.contains("<w:b/>") && replaced.contains("<w:u w:val=\"single\"/>"));
}
#[test]
fn replaces_split_token() {
    let xml = "<w:t>{{військовий_</w:t><w:t>1_піб:великими}}</w:t>";
    let mut m = HashMap::new();
    m.insert(
        "військовий_1_піб".into(),
        Value::new("Іван".into(), "person-name", Some("чоловіча")),
    );
    assert_eq!(
        replace_variables(xml, &m).unwrap(),
        "<w:t>ІВАН</w:t><w:t></w:t>"
    )
}
#[test]
fn resolves_signer_token_split_by_word_spacing() {
    let mut settings = settings::defaults();
    settings.main_signer = settings::SignerSettings {
        full_name: "ІВАНЕНКО Іван Іванович".into(),
        rank: "майор".into(),
        position: "командир роти".into(),
    };
    let connection = Connection::open_in_memory().unwrap();
    crate::database::initialise(&connection).unwrap();
    let values = values_for(&connection, &[], &settings, Some("2026-08-11"), None).unwrap();
    let xml = "<w:t>{{ о с н о в н и й _ п і д п и с а н т _ з в а н н я }}</w:t>";
    assert_eq!(replace_variables(xml, &values).unwrap(), "<w:t>майор</w:t>");
}
#[test]
fn uses_the_edited_dynamic_signer_instead_of_a_stale_legacy_value() {
    let mut settings = settings::defaults();
    settings.main_signer = settings::SignerSettings {
        full_name: "СТАРИЙ Петро Петрович".into(),
        rank: "майор".into(),
        position: "стара посада".into(),
    };
    settings
        .signer_roles
        .iter_mut()
        .find(|role| role.id == "основний_підписант")
        .unwrap()
        .signer = settings::SignerSettings {
        full_name: "НОВИЙ Петро Петрович".into(),
        rank: "капітан".into(),
        position: "нова посада".into(),
    };
    let connection = Connection::open_in_memory().unwrap();
    crate::database::initialise(&connection).unwrap();
    let values = values_for(&connection, &[], &settings, None, None).unwrap();
    assert_eq!(values["основний_підписант_посада"].text, "нова посада");
}
#[test]
fn resolves_numbered_vehicles_of_the_selected_driver() {
    let connection = Connection::open_in_memory().unwrap();
    crate::database::initialise(&connection).unwrap();
    crate::database::seed_test_personnel(&connection).unwrap();
    let person = personnel::list(&connection).unwrap().remove(0);
    connection
        .execute(
            "UPDATE personnel SET position='Водій' WHERE id=?1",
            [person.id],
        )
        .unwrap();
    connection.execute("INSERT INTO vehicles(name, registration_number, status, personnel_id) VALUES ('Toyota Hilux', 'АА 1111 АА', 'Справний', ?1), ('Ford Ranger', 'АА 2222 АА', 'Ремонтується', ?1)", [person.id]).unwrap();
    let person = personnel::list(&connection).unwrap().remove(0);
    let values = values_for(&connection, &[person], &settings::defaults(), None, None).unwrap();
    assert_eq!(values["військовий_1_автомобіль_1_номер"].text, "АА 1111 АА");
    assert_eq!(
        values["військовий_1_автомобіль_2_статус"].text,
        "Ремонтується"
    );
    assert!(validate_token("військовий_1_автомобіль_1_номер").is_empty());
}

#[test]
fn keeps_related_vehicle_tokens_available_when_person_has_no_vehicle() {
    let connection = Connection::open_in_memory().unwrap();
    crate::database::initialise(&connection).unwrap();
    crate::database::seed_test_personnel(&connection).unwrap();
    let person = personnel::list(&connection).unwrap().remove(0);
    let values = values_for(&connection, &[person], &settings::defaults(), None, None).unwrap();
    assert_eq!(values["військовий_1_автомобіль_1_назва"].text, "");
    assert_eq!(values["військовий_1_автомобіль_1_номер"].text, "");
}
#[test]
fn rank_and_female_declensions() {
    assert_eq!(decline_rank("солдат", "орудний", "чоловіча"), "солдатом");
    assert_eq!(decline_word("Олена", "родовий", "жіноча"), "Олени");
    assert_eq!(
        decline_position_head(
            "оператор безпілотних літальних апаратів 1 відділення",
            "родовий"
        ),
        "оператора безпілотних літальних апаратів 1 відділення"
    );
    assert_eq!(
        decline_position_head("стрілець, військова частина А0000", "родовий"),
        "стрільця, військова частина А0000"
    );
    assert_eq!(
        capitalize_first("оператор безпілотних літальних апаратів"),
        "Оператор безпілотних літальних апаратів"
    );
    assert_eq!(decline_rank("сержант", "кличний", "чоловіча"), "сержанте");
    assert_eq!(decline_rank("капітан", "орудний", "чоловіча"), "капітаном");
    assert_eq!(decline_rank("майор", "давальний", "чоловіча"), "майору");
    assert_eq!(decline_position_head("механік", "місцевий"), "механіку");
    assert_eq!(decline_word("Сергій", "родовий", "чоловіча"), "Сергія");
    assert_eq!(
        decline_word("ВАСИЛЬОК", "давальний", "чоловіча"),
        "ВАСИЛЬКУ"
    );
    assert_eq!(decline_word("Ковальчук", "родовий", "жіноча"), "Ковальчук");
}

#[test]
fn generates_and_revalidates_a_control_docx() {
    use crate::database;
    let connection = Connection::open_in_memory().unwrap();
    database::initialise(&connection).unwrap();
    database::seed_test_personnel(&connection).unwrap();
    let root = std::env::temp_dir().join(format!("shablonizator-v2-e2e-{}", std::process::id()));
    fs::create_dir_all(root.join("Налаштування")).unwrap();
    let template = root.join("control.docx");
    let file = File::create(&template).unwrap();
    let mut writer = ZipWriter::new(file);
    writer
        .start_file("word/document.xml", SimpleFileOptions::default())
        .unwrap();
    writer.write_all(b"<w:t>{{\xd0\xb2\xd1\x96\xd0\xb9\xd1\x81\xd1\x8c\xd0\xba\xd0\xbe\xd0\xb2\xd0\xb8\xd0\xb9_1_\xd0\xbf\xd1\x96\xd0\xb1:\xd1\x80\xd0\xbe\xd0\xb4\xd0\xbe\xd0\xb2\xd0\xb8\xd0\xb9:\xd0\xb2\xd0\xb5\xd0\xbb\xd0\xb8\xd0\xba\xd0\xb8\xd0\xbc\xd0\xb8}}</w:t>").unwrap();
    writer.finish().unwrap();
    assert!(inspect(template.to_str().unwrap()).is_valid);
    let generated = generate(
        &connection,
        &root,
        GenerateReportRequest {
            template_path: template.to_string_lossy().into(),
            personnel_ids: vec![1],
            report_date: None,
            vehicle_ids: Vec::new(),
            crew_ids: Vec::new(),
            position_ids: Vec::new(),
            equipment_ids: Vec::new(),
            parameters: HashMap::new(),
        },
    )
    .unwrap();
    let output = fs::read(&generated.docx_path).unwrap();
    assert!(!output.is_empty());
    assert!(inspect(&generated.docx_path).variables.is_empty());
    let manifest_path = format!("{}.manifest.json", generated.docx_path);
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(manifest_path).unwrap()).unwrap();
    assert_eq!(manifest["formatVersion"], 1);
    assert_eq!(manifest["template"]["name"], "control");
    assert_eq!(
        manifest["selections"]["personnelIds"],
        serde_json::json!([1])
    );
    assert_eq!(manifest["output"]["sha256"].as_str().unwrap().len(), 64);
    let _ = fs::remove_dir_all(root);
}

#[test]
fn generates_a_report_from_a_v1_template_without_rewriting_it() {
    use crate::database;
    let connection = Connection::open_in_memory().unwrap();
    database::initialise(&connection).unwrap();
    database::seed_test_personnel(&connection).unwrap();
    let person = personnel::list(&connection).unwrap().remove(0);
    let root = std::env::temp_dir().join(format!(
        "shablonizator-v1-e2e-{}-{}",
        std::process::id(),
        Local::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    fs::create_dir_all(&root).unwrap();
    let template = root.join("legacy-v1.docx");
    let mut writer = ZipWriter::new(File::create(&template).unwrap());
    writer
        .start_file("word/document.xml", SimpleFileOptions::default())
        .unwrap();
    writer
        .write_all(
            br#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{{soldier.fullName}}; {{soldier.rank}}; {{mainName}}; {{mainSignature}}</w:t></w:r></w:p></w:body></w:document>"#,
        )
        .unwrap();
    writer.finish().unwrap();

    let inspection = inspect(template.to_str().unwrap());
    assert!(inspection.is_valid, "{:?}", inspection.errors);
    let generated = generate(
        &connection,
        &root,
        GenerateReportRequest {
            template_path: template.to_string_lossy().into(),
            personnel_ids: vec![person.id],
            report_date: None,
            vehicle_ids: Vec::new(),
            crew_ids: Vec::new(),
            position_ids: Vec::new(),
            equipment_ids: Vec::new(),
            parameters: HashMap::new(),
        },
    )
    .unwrap();
    let generated_path = Path::new(&generated.docx_path);
    assert!(inspect(generated_path.to_str().unwrap())
        .variables
        .is_empty());
    let text = read_docx_text(generated_path).unwrap();
    assert!(text.contains(&person.surname.to_uppercase()));
    assert!(!text.contains("{{soldier."));
    assert!(!text.contains("{{main"));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn report_file_names_are_portable_bounded_and_non_destructive() {
    assert_eq!(safe_report_stem("CON", 140), "CON_");
    assert_eq!(safe_report_stem("  Тест:*?  . ", 140), "Тест___");
    assert!(safe_report_stem(&"а".repeat(500), 140).chars().count() <= 140);

    let root = std::env::temp_dir().join(format!("shablonizator-publish-{}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    let source = root.join("source.tmp");
    fs::write(&source, b"new").unwrap();
    fs::write(root.join("Рапорт.docx"), b"old").unwrap();
    let published = publish_without_overwrite(&source, &root, "Рапорт", "docx").unwrap();
    assert_eq!(
        published.file_name().unwrap().to_string_lossy(),
        "Рапорт (2).docx"
    );
    assert_eq!(fs::read(root.join("Рапорт.docx")).unwrap(), b"old");
    let _ = fs::remove_dir_all(root);
}

#[test]
fn every_shipped_docx_uses_valid_v2_tokens() {
    let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("templates");
    for entry in fs::read_dir(directory).unwrap().flatten() {
        if entry.path().extension().and_then(|value| value.to_str()) == Some("docx") {
            let result = inspect(entry.path().to_str().unwrap());
            assert!(
                result.is_valid,
                "{}: {:?}",
                entry.path().display(),
                result.errors
            );
        }
    }
}

#[test]
fn complex_relationship_templates_use_valid_v2_tokens() {
    let directory = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("Шаблони");
    for name in [
        "ТЕСТ 01 Військовослужбовець екіпаж і автомобіль.docx",
        "ТЕСТ 02 Паспорт екіпажу та всього майна.docx",
        "ТЕСТ 03 Автомобіль водій і екіпаж.docx",
        "ТЕСТ 04 Майно екіпажі позиції відповідальні.docx",
    ] {
        let path = directory.join(name);
        let result = inspect(path.to_str().unwrap());
        assert!(result.is_valid, "{}: {:?}", path.display(), result.errors);
    }
}
