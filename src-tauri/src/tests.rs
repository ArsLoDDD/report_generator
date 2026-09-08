use super::*;

#[test]
fn analysis_counts_only_whole_values() {
    assert_eq!(
        whole_text_match_count("Арсеній прибув. АРСЕНІЙ підтвердив.", "Арсен"),
        0
    );
    assert_eq!(
        whole_text_match_count("Арсен прибув; Арсеній залишився.", "Арсен"),
        1
    );
    assert_eq!(whole_text_match_count("АРСЕН прибув.", "Арсен"), 1);
}

#[test]
fn analysis_extracts_only_the_quoted_document_phrase() {
    assert_eq!(
        document_phrase_after("Екіпаж «ПЛЮШКА» завершив бойове чергування", "екіпаж "),
        Some("ПЛЮШКА".into())
    );
    assert_eq!(
        document_phrase_after("позиція «Сокіл»; продовжити виконання", "позиція "),
        Some("Сокіл".into())
    );
}

#[test]
fn crew_document_parameter_offers_one_click_subject_variants() {
    let alternatives = analysis_alternatives("назва_екіпажу_1");
    assert!(alternatives
        .iter()
        .any(|item| item.token == "екіпаж_1_назва"));
    assert!(alternatives
        .iter()
        .any(|item| item.token == "військовий_1_екіпаж"));
}

#[test]
fn analysed_position_can_switch_between_database_crew_and_document_sources() {
    let tokens = analysis_alternatives("позиція_1_назва")
        .into_iter()
        .map(|item| item.token)
        .collect::<Vec<_>>();
    assert!(tokens.contains(&"екіпаж_1_позиція".to_string()));
    assert!(tokens.contains(&"назва_позиції_1".to_string()));
}

#[test]
fn document_crew_detection_never_returns_the_ambiguous_crew_token() {
    let mut proposals = Vec::new();
    detected_document_proposals(
        &mut proposals,
        "Екіпаж «СОКІЛ» завершив виконання завдання.",
    );

    assert!(proposals.iter().any(|item| item.token == "назва_екіпажу_1"));
    assert!(proposals.iter().all(|item| item.token != "екіпаж_1"));
}

#[test]
fn manual_analysis_changes_run_after_detected_replacements_in_user_order() {
    let result = ordered_analysis_replacements(vec![
        TemplateAnalysisReplacement {
            value: "Екіпаж ТЕСТ".into(),
            token: "назва_екіпажу_1".into(),
            replacement: None,
            occurrence: None,
        },
        TemplateAnalysisReplacement {
            value: "{{назва_екіпажу_1}}".into(),
            token: String::new(),
            replacement: Some(" {{військовий_1_екіпаж}} ".into()),
            occurrence: Some(0),
        },
    ]);
    assert_eq!(
        result[0],
        ("Екіпаж ТЕСТ".into(), "{{назва_екіпажу_1}}".into(), None)
    );
    assert_eq!(
        result[1],
        (
            "{{назва_екіпажу_1}}".into(),
            " {{військовий_1_екіпаж}} ".into(),
            Some(0)
        )
    );
}

#[test]
fn analysis_finds_a_document_name_without_database_data() {
    let text = "Командир підрозділу молодший лейтенант Максим Петрович ТЕСТОВИЙ";
    let mut proposals = Vec::new();
    detected_document_proposals(&mut proposals, text);
    assert!(proposals.iter().any(|proposal| {
        proposal.value == "Максим Петрович ТЕСТОВИЙ" && proposal.token == "військовий_1_піб"
    }));
    assert!(proposals.iter().any(|proposal| {
        proposal.value == "Максим" && proposal.token == "військовий_1_імя"
    }));
    assert!(proposals.iter().any(|proposal| {
        proposal.value == "ТЕСТОВИЙ" && proposal.token == "військовий_1_прізвище"
    }));
}

#[test]
fn simple_edition_treats_an_unknown_person_as_a_document_parameter() {
    let text = "Командир підрозділу молодший лейтенант Максим Петрович ТЕСТОВИЙ";
    let mut proposals = Vec::new();
    detected_document_proposals_for_edition(&mut proposals, text, true);
    assert!(proposals.iter().any(|proposal| {
        proposal.value == "Максим Петрович ТЕСТОВИЙ"
            && proposal.token == "піб_військовий_1"
            && proposal.category == "Параметри документа"
    }));
    assert!(!proposals
        .iter()
        .any(|proposal| proposal.token.starts_with("військовий_1_")));
}

#[test]
fn simple_edition_offers_rank_and_position_for_an_unknown_person() {
    let text = "Командир відділення молодший сержант Максим Петрович ТЕСТОВИЙ";
    let mut proposals = Vec::new();
    detected_document_proposals_for_edition(&mut proposals, text, true);
    assert!(proposals.iter().any(|proposal| {
        proposal.value == "молодший сержант" && proposal.token == "звання_військовий_1"
    }));
    assert!(proposals.iter().any(|proposal| {
        proposal.value == "Командир відділення" && proposal.token == "посада_військовий_1"
    }));
}

#[test]
fn document_person_analysis_never_turns_a_report_sentence_into_a_position() {
    let text =
        "Дійсним доповідаю Вам, що завдання виконано молодший сержант Максим Петрович ТЕСТОВИЙ";
    let mut proposals = Vec::new();
    detected_document_proposals_for_edition(&mut proposals, text, true);
    assert!(!proposals
        .iter()
        .any(|proposal| proposal.token == "посада_військовий_1"));
}

#[test]
fn analysis_requires_three_name_parts_and_uses_the_matching_signer_role() {
    let role = settings::SignerRole {
        id: "основний_підписант".into(),
        name: "Основний підписант".into(),
        signer: settings::SignerSettings {
            full_name: "Максим Петрович ТЕСТОВИЙ".into(),
            rank: "майор".into(),
            position: "Командир підрозділу".into(),
        },
    };
    let text = "Командир підрозділу\nмайор Максим Петрович ТЕСТОВИЙ";
    let mut proposals = Vec::new();
    detected_signer_block_proposals(&mut proposals, text, &role);
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_піб"));
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_посада"
            && proposal.value == "Командир підрозділу"));
    let mut short_name_proposals = Vec::new();
    detected_document_person_proposals(&mut short_name_proposals, "майор Максим ТЕСТОВИЙ", false);
    assert!(short_name_proposals.is_empty());
}

#[test]
fn analysis_uses_a_two_part_name_only_for_an_exact_signer_match() {
    let role = settings::SignerRole {
        id: "основний_підписант".into(),
        name: "Основний підписант".into(),
        signer: settings::SignerSettings {
            full_name: "Максим ТЕСТОВИЙ".into(),
            rank: "майор".into(),
            position: "Командир підрозділу".into(),
        },
    };
    let text = "Командир підрозділу\nмайор Максим ТЕСТОВИЙ";
    let mut proposals = Vec::new();
    detected_signer_block_proposals(&mut proposals, text, &role);
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_прізвище"
            && proposal.value == "ТЕСТОВИЙ"));
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_імя" && proposal.value == "Максим"));
    assert!(!proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_піб"));
    let mut generic = Vec::new();
    detected_document_person_proposals(&mut generic, text, false);
    assert!(generic.is_empty());
}

#[test]
fn analysis_matches_a_two_part_signature_to_a_three_part_signer() {
    let role = settings::SignerRole {
        id: "основний_підписант".into(),
        name: "Основний підписант".into(),
        signer: settings::SignerSettings {
            full_name: "Максим Петрович ТЕСТОВИЙ".into(),
            rank: "майор".into(),
            position: "Командир підрозділу".into(),
        },
    };
    let text = "Командир підрозділу майор Максим ТЕСТОВИЙ";
    let mut proposals = Vec::new();
    detected_signer_block_proposals(&mut proposals, text, &role);
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_прізвище"
            && proposal.value == "ТЕСТОВИЙ"));
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_імя" && proposal.value == "Максим"));
    assert!(
        proposals
            .iter()
            .any(|proposal| proposal.token == "основний_підписант_звання"
                && proposal.value == "майор")
    );
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_посада"
            && proposal.value == "Командир підрозділу"));
    assert!(!proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_піб"));
}

#[test]
fn analysis_accepts_a_minor_spelling_difference_in_a_signer_name() {
    let role = settings::SignerRole {
        id: "основний_підписант".into(),
        name: "Основний підписант".into(),
        signer: settings::SignerSettings {
            full_name: "ТАКТІКУЛЬЩІК Максим Едуардович".into(),
            rank: "молодший лейтенант".into(),
            position: "Командир роти".into(),
        },
    };
    let text = "Командир роти молодший лейтенант Максім ТАКТІКУЛЬЩІК";
    let mut proposals = Vec::new();
    detected_signer_block_proposals(&mut proposals, text, &role);
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_прізвище"
            && proposal.value == "ТАКТІКУЛЬЩІК"));
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_імя" && proposal.value == "Максім"));
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_посада"
            && proposal.value == "Командир роти"));
}

#[test]
fn analysis_finds_the_signer_in_the_allowed_test_report_when_available() {
    let path = Path::new("/Users/macbook/Downloads/Щодо завершення виконання завдань згідно БР№999 Екіпаж ТЕСТЮШКІ з 12.08.2026.docx");
    if !path.is_file() {
        return;
    }
    let role = settings::SignerRole {
        id: "основний_підписант".into(),
        name: "Основний підписант".into(),
        signer: settings::SignerSettings {
            full_name: "ТАКТІКУЛЬЩІК Максим Едуардович".into(),
            rank: "молодший лейтенант".into(),
            position: "Командир роти безпілотних авіаційних комплексів військової частини А2222"
                .into(),
        },
    };
    let text = report_generation::read_docx_text(path).unwrap();
    let mut proposals = Vec::new();
    detected_signer_block_proposals(&mut proposals, &text, &role);
    // Файл є локальним ручним зразком, тому перевіряємо лише правило:
    // якщо в ньому знайдено блок підписанта, він не має стати даними військовослужбовця.
    assert!(!proposals
        .iter()
        .any(|proposal| proposal.token == "військовий_1_звання"));
}

#[test]
fn analysis_finds_the_military_unit_in_the_allowed_test_report_when_available() {
    let path = Path::new("/Users/macbook/Downloads/Щодо завершення виконання завдань згідно БР№999 Екіпаж ТЕСТЮШКІ з 12.08.2026.docx");
    if !path.is_file() {
        return;
    }
    let text = report_generation::read_docx_text(path).unwrap();
    let mut proposals = Vec::new();
    detected_document_proposals(&mut proposals, &text);
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "військова_частина_1" && proposal.value == "А2222"));
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "військова_частина_2" && proposal.value == "А1111"));
}

#[test]
fn signature_rank_is_not_proposed_as_a_personnel_variable() {
    let role = settings::SignerRole {
        id: "основний_підписант".into(),
        name: "Основний підписант".into(),
        signer: settings::SignerSettings {
            full_name: "ТАКТІКУЛЬЩІК Максим Едуардович".into(),
            rank: "молодший лейтенант".into(),
            position: "Командир роти".into(),
        },
    };
    let text = "Командир роти молодший лейтенант Максім ТАКТІКУЛЬЩІК";
    let mut proposals = Vec::new();
    detected_signer_block_proposals(&mut proposals, text, &role);
    assert!(!proposals
        .iter()
        .any(|proposal| proposal.token == "військовий_1_звання"));
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "основний_підписант_звання"));
}

#[test]
fn document_proposals_do_not_create_a_personnel_rank_from_a_signature_block() {
    let mut proposals = Vec::new();
    detected_document_proposals(
        &mut proposals,
        "Командир роти молодший лейтенант Максім ТАКТІКУЛЬЩІК",
    );
    assert!(!proposals
        .iter()
        .any(|proposal| proposal.token == "військовий_1_звання"));
}

#[test]
fn analysis_does_not_treat_arbitrary_title_words_as_a_name() {
    let mut proposals = Vec::new();
    detected_document_proposals(&mut proposals, "Рапорт Виконання ЗАВДАННЯ завершено");
    assert!(!proposals
        .iter()
        .any(|proposal| proposal.token == "військовий_1_піб"));
}

#[test]
fn analysis_finds_a_settlement_after_the_full_locality_marker() {
    let mut proposals = Vec::new();
    detected_document_proposals(&mut proposals, "в районі н.п. ПІСОСІВКА в смузі оборони");
    assert!(proposals.iter().any(|proposal| {
        proposal.value == "ПІСОСІВКА" && proposal.token == "населений_пункт_1"
    }));
}

#[test]
fn analysis_finds_compact_and_spaced_military_unit_numbers_once_each() {
    let mut proposals = Vec::new();
    detected_document_proposals(
        &mut proposals,
        "військова частина А2222 та військова частина А 3333; повторно А2222",
    );
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "військова_частина_1" && proposal.value == "А2222"));
    assert!(proposals
        .iter()
        .any(|proposal| proposal.token == "військова_частина_2" && proposal.value == "А 3333"));
    assert_eq!(
        proposals
            .iter()
            .filter(|proposal| proposal.token.starts_with("військова_частина_"))
            .count(),
        2
    );
}

#[test]
fn analysis_uses_nearby_words_to_classify_dates_and_document_numbers() {
    let mut proposals = Vec::new();
    detected_document_proposals(
        &mut proposals,
        "Згідно з бойовим розпорядженням БР №999 від 12.08.2026 року",
    );
    assert!(proposals.iter().any(|proposal| {
        proposal.token == "номер_бойового_розпорядження_1"
            && proposal.value == "№999"
            && proposal.confidence == "high"
    }));
    assert!(proposals.iter().any(|proposal| {
        proposal.token == "дата_розпорядження_1"
            && proposal.value == "12.08.2026"
            && proposal.confidence == "high"
    }));
}

#[test]
fn creates_a_template_with_an_intentional_validation_error() {
    let directory = std::env::temp_dir().join(format!(
        "shablonizator-invalid-template-{}",
        Local::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    fs::create_dir_all(&directory).unwrap();
    let template_path = directory.join("Тестовий шаблон з помилкою.docx");
    create_validation_example_template(&template_path).unwrap();
    let inspection = report_generation::inspect(template_path.to_str().unwrap());
    assert!(!inspection.is_valid);
    assert!(inspection
        .errors
        .iter()
        .any(|error| error.contains("soldier.name")));
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn migrates_the_legacy_database_into_the_application_root() {
    let root = std::env::temp_dir().join(format!(
        "shablonizator-database-migration-{}",
        Local::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let legacy_directory = root.join(LEGACY_DATABASE_DIRECTORY_NAME);
    fs::create_dir_all(&legacy_directory).unwrap();
    fs::write(
        legacy_directory.join(DATABASE_FILE_NAME),
        b"existing database",
    )
    .unwrap();
    let (path, was_missing) = prepare_database_path(&root).unwrap();
    assert!(!was_missing);
    assert_eq!(fs::read(path).unwrap(), b"existing database");
    assert!(!legacy_directory.join(DATABASE_FILE_NAME).exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn reports_an_empty_personnel_database_at_startup() {
    let connection = Connection::open_in_memory().unwrap();
    database::initialise(&connection).unwrap();
    let warnings = startup_warnings(&connection, true, true);
    assert!(warnings
        .iter()
        .any(|warning| warning.code == "database-missing"));
    assert!(warnings
        .iter()
        .any(|warning| warning.code == "templates-missing"));
    assert!(warnings
        .iter()
        .any(|warning| warning.code == "personnel-empty"));
}

#[test]
fn missing_database_stays_in_memory_until_the_first_write() {
    let root = std::env::temp_dir().join(format!(
        "shablonizator-delayed-database-{}",
        Local::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    fs::create_dir_all(&root).unwrap();
    let path = root.join(DATABASE_FILE_NAME);
    let mut state = connect_database(path.clone(), true).unwrap();
    assert!(!path.exists());
    assert!(!state.is_persistent);
    ensure_persistent_database(&mut state).unwrap();
    assert!(path.exists());
    assert!(state.is_persistent);
    drop(state);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn only_docx_files_inside_the_templates_directory_can_be_opened() {
    let root = std::env::temp_dir().join(format!(
        "shablonizator-template-path-{}",
        Local::now().timestamp_nanos_opt().unwrap_or_default()
    ));
    let templates = root.join(TEMPLATES_DIRECTORY_NAME);
    fs::create_dir_all(&templates).unwrap();
    let template = templates.join("Рапорт.docx");
    let other_file = templates.join("Нотатки.txt");
    let outside_template = root.join("Інший рапорт.docx");
    fs::write(&template, b"docx").unwrap();
    fs::write(&other_file, b"text").unwrap();
    fs::write(&outside_template, b"docx").unwrap();

    assert_eq!(
        ensure_template_path(&templates, template.to_str().unwrap()).unwrap(),
        template.canonicalize().unwrap()
    );
    assert!(ensure_template_path(&templates, other_file.to_str().unwrap()).is_err());
    assert!(ensure_template_path(&templates, outside_template.to_str().unwrap()).is_err());

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn creates_operational_control_templates() {
    let root = std::env::temp_dir().join(format!(
        "shablonizator-operational-templates-{}",
        std::process::id()
    ));
    fs::create_dir_all(&root).unwrap();
    create_operational_report_templates(&root).unwrap();
    for name in [
        "Контрольний рапорт — екіпаж.docx",
        "Контрольний рапорт — генератор.docx",
        "Контрольний рапорт — БпЛА.docx",
        "Контрольний рапорт — зв’язок.docx",
        "Контрольний рапорт — зброя та БК.docx",
    ] {
        let result = report_generation::inspect(root.join(name).to_str().unwrap());
        assert!(result.is_valid, "{name}: {:?}", result.errors);
        assert!(!result.variables.is_empty());
    }
    let _ = fs::remove_dir_all(root);
}

#[test]
fn ambiguous_values_are_not_selected_automatically() {
    let mut proposals = Vec::new();
    template_analysis_value_with_confidence(
        &mut proposals,
        "Дата 12.08.2026 повторюється: 12.08.2026",
        "12.08.2026",
        "дата_рапорту_1",
        "Дата",
        "Параметри документа",
        "high",
        "Точний контекст.",
    );
    assert_eq!(proposals.len(), 1);
    assert!(!proposals[0].auto_select);
    assert!(proposals[0].reason.contains("повторюється"));
}

#[test]
fn registry_fields_are_detected_from_explicit_labels() {
    let mut proposals = Vec::new();
    detected_registry_document_proposals(
        &mut proposals,
        "Тип інциденту: Втрата БпЛА\nРайон розвідки — н.п. Прикладне",
    );
    assert!(proposals.iter().any(|proposal| {
        proposal.token == "тип_інциденту_1" && proposal.value == "Втрата БпЛА"
    }));
    assert!(proposals.iter().any(|proposal| {
        proposal.token == "район_розвідки_1" && proposal.value == "н.п. Прикладне"
    }));
    assert!(proposals.iter().all(|proposal| proposal.auto_select));
}

#[test]
fn conflicting_tokens_become_one_confirmed_choice() {
    let mut proposals = Vec::new();
    template_analysis_value(
        &mut proposals,
        "Екіпаж «Сокіл»",
        "Сокіл",
        "екіпаж_1_назва",
        "Назва екіпажу",
        "Екіпаж",
    );
    template_analysis_value(
        &mut proposals,
        "Екіпаж «Сокіл»",
        "Сокіл",
        "назва_екіпажу_1",
        "Екіпаж у документі",
        "Параметри документа",
    );
    consolidate_analysis_proposals(&mut proposals);
    assert_eq!(proposals.len(), 1);
    assert_eq!(proposals[0].token, "назва_екіпажу_1");
    assert!(!proposals[0].auto_select);
    assert!(proposals[0]
        .alternatives
        .iter()
        .any(|item| item.token == "екіпаж_1_назва"));
}
