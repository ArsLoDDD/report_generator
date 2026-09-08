use super::*;

#[tauri::command]
pub(crate) fn analyse_report_for_template(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    report_path: String,
) -> Result<TemplateAnalysis, String> {
    let path = PathBuf::from(&report_path);
    if !path.is_file()
        || !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("docx"))
    {
        return Err("Оберіть DOCX-файл рапорту.".into());
    }
    let text = report_generation::read_docx_text(&path)?;
    let paragraphs = report_generation::read_docx_paragraphs(&path)?;
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
    let mut proposals = Vec::new();
    let signer_roles = settings::load(&application_root_from_path(&path)?)?.signer_roles;
    for role in &signer_roles {
        detected_signer_block_proposals(&mut proposals, &text, role);
    }
    for person in personnel::list(&database.connection)? {
        // Do not turn a shared rank or position into a military-person token.
        // A personnel record is relevant only when its complete name appears in
        // the document. This also leaves a recognized signature block solely
        // with the appropriate signer variables.
        if whole_text_match_count(&text, &person.full_name) == 0 {
            continue;
        }
        template_analysis_value(
            &mut proposals,
            &text,
            &person.full_name,
            "військовий_1_піб",
            "ПІБ військовослужбовця",
            "Військовослужбовець",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &person.surname,
            "військовий_1_прізвище",
            "Прізвище військовослужбовця",
            "Військовослужбовець",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &person.given_name,
            "військовий_1_імя",
            "Ім’я військовослужбовця",
            "Військовослужбовець",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &person.patronymic,
            "військовий_1_по_батькові",
            "По батькові військовослужбовця",
            "Військовослужбовець",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &person.rank,
            "військовий_1_звання",
            "Звання військовослужбовця",
            "Військовослужбовець",
        );
        template_analysis_value(
            &mut proposals,
            &text,
            &person.position,
            "військовий_1_посада",
            "Посада військовослужбовця",
            "Військовослужбовець",
        );
    }
    if !is_simple_edition(&app) {
        let mut vehicle_statement = database
            .connection
            .prepare("SELECT name, registration_number, status FROM vehicles")
            .map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?;
        let vehicles = vehicle_statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?;
        for (name, registration, status) in vehicles {
            if whole_text_match_count(&text, &name) == 0
                && whole_text_match_count(&text, &registration) == 0
            {
                continue;
            }
            template_analysis_value(
                &mut proposals,
                &text,
                &name,
                "автомобіль_1_назва",
                "Назва автомобіля",
                "Автомобіль",
            );
            template_analysis_value(
                &mut proposals,
                &text,
                &registration,
                "автомобіль_1_номер",
                "Номер автомобіля",
                "Автомобіль",
            );
            template_analysis_value(
                &mut proposals,
                &text,
                &status,
                "автомобіль_1_статус",
                "Статус автомобіля",
                "Автомобіль",
            );
        }
        let mut crew_statement = database
            .connection
            .prepare("SELECT c.name,c.platoon,COALESCE(p.name,c.position_name),COALESCE(p.locality,c.reconnaissance_area) FROM crews c LEFT JOIN positions p ON p.id=c.position_id")
            .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?;
        let crews = crew_statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?;
        for (name, platoon, position, area) in crews {
            if whole_text_match_count(&text, &name) == 0 {
                continue;
            }
            for (value, token, label) in [
                (name, "екіпаж_1_назва", "Назва екіпажу"),
                (platoon, "екіпаж_1_взвод", "Взвод екіпажу"),
                (position, "екіпаж_1_позиція", "Позиція екіпажу"),
                (area, "екіпаж_1_район_розвідки", "Район розвідки"),
            ] {
                template_analysis_value(&mut proposals, &text, &value, token, label, "Екіпаж");
            }
        }
        let mut position_statement = database
        .connection
        .prepare("SELECT name,position_type,strip_name,locality,battle_order,sector,condition,size,mgrs,suitable_uav_text,condition_level,field_type FROM positions")
        .map_err(|_| "Не вдалося прочитати позиції.".to_string())?;
        let positions = position_statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, i64>(10)?.to_string(),
                    row.get::<_, String>(11)?,
                ))
            })
            .map_err(|_| "Не вдалося прочитати позиції.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати позиції.".to_string())?;
        for (
            name,
            position_type,
            strip,
            locality,
            battle_order,
            sector,
            condition,
            size,
            mgrs,
            suitable_uavs,
            condition_level,
            field_type,
        ) in positions
        {
            if whole_text_match_count(&text, &name) == 0 {
                continue;
            }
            for (value, token, label) in [
                (name, "позиція_1_назва", "Назва позиції"),
                (position_type, "позиція_1_тип", "Тип позиції"),
                (strip, "позиція_1_смуга", "Смуга позиції"),
                (
                    locality,
                    "позиція_1_населений_пункт",
                    "Населений пункт позиції",
                ),
                (battle_order, "позиція_1_бро", "БРО позиції"),
                (sector, "позиція_1_сектор", "Сектор позиції"),
                (condition, "позиція_1_стан", "Стан позиції"),
                (
                    condition_level,
                    "позиція_1_стан_відсоток",
                    "Стан позиції у відсотках",
                ),
                (field_type, "позиція_1_тип_поля", "Тип поля позиції"),
                (size, "позиція_1_розмір", "Розмір позиції"),
                (mgrs, "позиція_1_mgrs", "MGRS позиції"),
                (suitable_uavs, "позиція_1_бпла", "Сумісні БпЛА позиції"),
            ] {
                template_analysis_value(&mut proposals, &text, &value, token, label, "Позиція");
            }
        }
        let mut equipment_statement = database
            .connection
            .prepare("SELECT category,name,inventory_number,status,notes FROM equipment")
            .map_err(|_| "Не вдалося прочитати майно.".to_string())?;
        let equipment = equipment_statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|_| "Не вдалося прочитати майно.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати майно.".to_string())?;
        for (category, name, inventory, status, notes) in equipment {
            if whole_text_match_count(&text, &name) == 0
                && whole_text_match_count(&text, &inventory) == 0
            {
                continue;
            }
            let (prefix, category_label) = match category.as_str() {
                "generator" => ("генератор", "Генератор"),
                "uav" => ("бпла", "БпЛА"),
                "communications" => ("звʼязок", "Зв’язок"),
                "weapon_ammo" => ("зброя_та_бк", "Зброя та БК"),
                _ => continue,
            };
            for (value, field, label) in [
                (name, "назва", "Назва"),
                (inventory, "інвентарний_номер", "Інвентарний номер"),
                (status, "статус", "Статус"),
                (notes, "примітка", "Примітка"),
            ] {
                template_analysis_value(
                    &mut proposals,
                    &text,
                    &value,
                    &format!("{prefix}_1_{field}"),
                    &format!("{label}: {category_label}"),
                    category_label,
                );
            }
        }
    }
    detected_document_proposals_for_edition(&mut proposals, &text, is_simple_edition(&app));
    consolidate_analysis_proposals(&mut proposals);
    let document_crew_values = proposals
        .iter()
        .filter(|proposal| proposal.token == "назва_екіпажу_1")
        .map(|proposal| proposal.value.to_lowercase())
        .collect::<Vec<_>>();
    proposals.retain(|proposal| {
        proposal.token != "екіпаж_1_назва"
            || !document_crew_values
                .iter()
                .any(|value| value == &proposal.value.to_lowercase())
    });
    let position_values = proposals
        .iter()
        .filter(|proposal| proposal.token.ends_with("_посада"))
        .map(|proposal| proposal.value.to_lowercase())
        .collect::<Vec<_>>();
    proposals.retain(|proposal| {
        !proposal.token.starts_with("військова_частина_")
            || !position_values
                .iter()
                .any(|position| position.contains(&proposal.value.to_lowercase()))
    });
    if is_simple_edition(&app) {
        for proposal in &mut proposals {
            proposal.alternatives.retain(|alternative| {
                !matches!(
                    alternative.token.as_str(),
                    token if token.starts_with("автомобіль_")
                        || token.starts_with("екіпаж_")
                        || token.starts_with("позиція_")
                        || token.starts_with("генератор_")
                        || token.starts_with("бпла_")
                        || token.starts_with("звʼязок_")
                        || token.starts_with("зброя_та_бк_")
                        || token.contains("_автомобіль_")
                        || token.contains("_екіпаж")
                )
            });
        }
    }
    proposals.sort_by(|left, right| {
        confidence_score(&right.confidence)
            .cmp(&confidence_score(&left.confidence))
            .then(right.auto_select.cmp(&left.auto_select))
            .then(right.occurrences.cmp(&left.occurrences))
            .then(left.label.cmp(&right.label))
    });
    let source_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Рапорт.docx")
        .to_string();
    Ok(TemplateAnalysis {
        source_name,
        text_preview: text,
        paragraphs,
        proposals,
    })
}

#[tauri::command]
pub(crate) fn render_report_analysis_preview(
    report_path: String,
    replacements: Vec<TemplateAnalysisReplacement>,
) -> Result<Vec<u8>, String> {
    let source = PathBuf::from(report_path);
    if !source.is_file() {
        return Err("Вихідний рапорт не знайдено.".into());
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = std::env::temp_dir().join(format!(
        "shablonizator-preview-{}-{nonce}.docx",
        std::process::id()
    ));
    let replacement_values = ordered_analysis_replacements(replacements);
    report_generation::create_template_from_literal_replacements(
        &source,
        &temporary,
        &replacement_values,
    )?;
    let bytes = std::fs::read(&temporary)
        .map_err(|_| "Не вдалося підготувати перегляд документа.".to_string());
    let _ = std::fs::remove_file(temporary);
    bytes
}

pub(crate) fn application_root_from_path(_path: &Path) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Не вдалося визначити папку програми.".to_string())
    }
    #[cfg(not(debug_assertions))]
    {
        executable_root()
    }
}

#[tauri::command]
pub(crate) async fn create_template_from_report_analysis(
    app: tauri::AppHandle,
    report_path: String,
    template_name: String,
    replacements: Vec<TemplateAnalysisReplacement>,
) -> Result<String, String> {
    let source = PathBuf::from(report_path);
    if !source.is_file() {
        return Err("Вихідний рапорт не знайдено.".into());
    }
    let safe_name = template_name.trim().trim_end_matches(".docx");
    if safe_name.is_empty() || safe_name.contains(['/', '\\']) {
        return Err("Вкажіть коректну назву шаблону.".into());
    }
    let directory = templates_directory(&app)?;
    let mut destination = directory.join(format!("{safe_name}.docx"));
    let mut suffix = 2;
    while destination.exists() {
        destination = directory.join(format!("{safe_name} ({suffix}).docx"));
        suffix += 1;
    }
    let replacements = ordered_analysis_replacements(replacements);
    let source_for_task = source.clone();
    let destination_for_task = destination.clone();
    tauri::async_runtime::spawn_blocking(move || {
        report_generation::create_template_from_literal_replacements(
            &source_for_task,
            &destination_for_task,
            &replacements,
        )
    })
    .await
    .map_err(|_| "Не вдалося завершити створення DOCX-шаблону.".to_string())??;
    Ok(destination.to_string_lossy().into())
}

#[cfg(test)]
pub(crate) fn create_validation_example_template(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    let file =
        fs::File::create(path).map_err(|_| "Не вдалося створити тестовий шаблон.".to_string())?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let entries = [
        (
            "[Content_Types].xml",
            r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#,
        ),
        (
            "_rels/.rels",
            r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#,
        ),
        (
            "word/document.xml",
            r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Тест повної перевірки шаблону</w:t></w:r></w:p><w:p><w:r><w:t>{{soldier.name}}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>"#,
        ),
    ];
    for (name, contents) in entries {
        archive
            .start_file(name, options)
            .map_err(|_| "Не вдалося сформувати тестовий шаблон.".to_string())?;
        archive
            .write_all(contents.as_bytes())
            .map_err(|_| "Не вдалося записати тестовий шаблон.".to_string())?;
    }
    archive
        .finish()
        .map_err(|_| "Не вдалося завершити створення тестового шаблону.".to_string())?;
    Ok(())
}
