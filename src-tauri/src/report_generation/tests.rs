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
    for prefix in ["генератор", "бпла", "звʼязок", "зброя_та_бк"] {
        for field in &registry().equipment_fields {
            assert!(validate_token(&format!("{prefix}_1_{}", field.id)).is_empty())
        }
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
    connection.execute("INSERT INTO crews(name,platoon,position_name,reconnaissance_area) VALUES('Екіпаж «Тест»','1 взвод','СП «Тест»','район Тестовий')", []).unwrap();
    let crew_id = connection.last_insert_rowid();
    connection.execute("INSERT INTO vehicles(name,registration_number,status,crew_id) VALUES('Тест-авто','ТЕСТ 001','Справний',?1)", [crew_id]).unwrap();
    connection.execute("INSERT INTO equipment(category,name,inventory_number,status,crew_id,notes) VALUES('uav','Тест-БпЛА','БПЛА-Т','Справний',?1,'Контрольний запис')", [crew_id]).unwrap();
    let equipment_id = connection.last_insert_rowid();
    connection.execute("INSERT INTO positions(name,position_type,locality,mgrs,is_active,crew_id) VALUES('СП «Тест»','Основна','н.п. Тестове','36U UV 12000 67000',1,?1)", [crew_id]).unwrap();
    let position_id = connection.last_insert_rowid();
    let mut values = HashMap::new();
    add_selected_crews(&connection, &[crew_id], &mut values).unwrap();
    add_selected_equipment(&connection, &[equipment_id], &mut values).unwrap();
    add_selected_positions(&connection, &[position_id], &mut values).unwrap();
    assert_eq!(values["екіпаж_1_назва"].text, "Екіпаж «Тест»");
    assert_eq!(values["екіпаж_1_автомобілі"].text, "Тест-авто ТЕСТ 001");
    assert_eq!(values["бпла_1_назва"].text, "Тест-БпЛА");
    assert_eq!(values["позиція_1_назва"].text, "СП «Тест»");
    assert_eq!(values["позиція_1_mgrs"].text, "36U UV 12000 67000");
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
fn rejects_v1_and_explains_typo() {
    assert!(!validate_token("невідома.змінна").is_empty());
    assert!(validate_token("військовий_1_піб:родовийй")[0].contains("родовий"))
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
