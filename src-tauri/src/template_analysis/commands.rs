use super::*;

#[derive(Clone, Debug)]
pub(crate) struct AnalysisPerson {
    pub id: i64,
    pub full_name: String,
    pub surname: String,
    pub given_name: String,
    pub patronymic: String,
    pub rank: String,
    pub position: String,
}

#[derive(Clone, Debug)]
pub(crate) struct AnalysisVehicle {
    pub id: i64,
    pub name: String,
    pub registration: String,
    pub status: String,
}

#[derive(Clone, Debug)]
pub(crate) struct AnalysisCrew {
    pub id: i64,
    pub name: String,
    pub platoon: String,
    pub position: String,
    pub area: String,
}

#[derive(Clone, Debug)]
pub(crate) struct AnalysisPosition {
    pub id: i64,
    pub values: Vec<(String, &'static str, &'static str)>,
}

#[derive(Clone, Debug)]
pub(crate) struct AnalysisEquipment {
    pub id: i64,
    pub category: String,
    pub name: String,
    pub inventory: String,
    pub status: String,
    pub notes: String,
}

#[derive(Default)]
pub(crate) struct AnalysisDataSnapshot {
    pub people: Vec<AnalysisPerson>,
    pub vehicles: Vec<AnalysisVehicle>,
    pub crews: Vec<AnalysisCrew>,
    pub positions: Vec<AnalysisPosition>,
    pub equipment: Vec<AnalysisEquipment>,
}

fn load_analysis_snapshot(
    connection: &Connection,
    include_operational_data: bool,
) -> Result<AnalysisDataSnapshot, String> {
    let people = personnel::list(connection)?
        .into_iter()
        .map(|person| AnalysisPerson {
            id: person.id,
            full_name: person.full_name,
            surname: person.surname,
            given_name: person.given_name,
            patronymic: person.patronymic,
            rank: person.rank,
            position: person.position,
        })
        .collect();
    if !include_operational_data {
        return Ok(AnalysisDataSnapshot {
            people,
            ..AnalysisDataSnapshot::default()
        });
    }

    let vehicles = {
        let mut statement = connection
            .prepare("SELECT id,name,registration_number,status FROM vehicles ORDER BY id")
            .map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok(AnalysisVehicle {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    registration: row.get(2)?,
                    status: row.get(3)?,
                })
            })
            .map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати автомобілі.".to_string())?;
        rows
    };
    let crews = {
        let mut statement = connection
            .prepare("SELECT c.id,c.name,c.platoon,COALESCE(p.name,c.position_name),COALESCE(p.locality,c.reconnaissance_area) FROM crews c LEFT JOIN positions p ON p.id=c.position_id ORDER BY c.id")
            .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok(AnalysisCrew {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    platoon: row.get(2)?,
                    position: row.get(3)?,
                    area: row.get(4)?,
                })
            })
            .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати екіпажі.".to_string())?;
        rows
    };
    let positions = {
        let mut statement = connection
            .prepare("SELECT id,name,position_type,strip_name,locality,battle_order,sector,condition,size,mgrs,suitable_uav_text,condition_level,field_type FROM positions ORDER BY id")
            .map_err(|_| "Не вдалося прочитати позиції.".to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok(AnalysisPosition {
                    id: row.get(0)?,
                    values: vec![
                        (row.get(1)?, "назва", "Назва позиції"),
                        (row.get(2)?, "тип", "Тип позиції"),
                        (row.get(3)?, "смуга", "Смуга позиції"),
                        (row.get(4)?, "населений_пункт", "Населений пункт позиції"),
                        (row.get(5)?, "бро", "БРО позиції"),
                        (row.get(6)?, "сектор", "Сектор позиції"),
                        (row.get(7)?, "стан", "Стан позиції"),
                        (
                            row.get::<_, i64>(11)?.to_string(),
                            "стан_відсоток",
                            "Стан позиції у відсотках",
                        ),
                        (row.get(12)?, "тип_поля", "Тип поля позиції"),
                        (row.get(8)?, "розмір", "Розмір позиції"),
                        (row.get(9)?, "mgrs", "MGRS позиції"),
                        (row.get(10)?, "бпла", "Сумісні БпЛА позиції"),
                    ],
                })
            })
            .map_err(|_| "Не вдалося прочитати позиції.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати позиції.".to_string())?;
        rows
    };
    let equipment = {
        let mut statement = connection
            .prepare(
                "SELECT id,category,name,inventory_number,status,notes FROM equipment ORDER BY id",
            )
            .map_err(|_| "Не вдалося прочитати майно.".to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok(AnalysisEquipment {
                    id: row.get(0)?,
                    category: row.get(1)?,
                    name: row.get(2)?,
                    inventory: row.get(3)?,
                    status: row.get(4)?,
                    notes: row.get(5)?,
                })
            })
            .map_err(|_| "Не вдалося прочитати майно.".to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Не вдалося прочитати майно.".to_string())?;
        rows
    };
    Ok(AnalysisDataSnapshot {
        people,
        vehicles,
        crews,
        positions,
        equipment,
    })
}

fn first_value_offset(text: &str, values: &[&str]) -> usize {
    let haystack = text.to_lowercase();
    values
        .iter()
        .filter_map(|value| {
            let value = value.trim();
            (!value.is_empty())
                .then(|| haystack.find(&value.to_lowercase()))
                .flatten()
        })
        .min()
        .unwrap_or(usize::MAX)
}

pub(crate) fn detected_database_proposals(
    proposals: &mut Vec<TemplateAnalysisProposal>,
    text: &str,
    snapshot: &AnalysisDataSnapshot,
) {
    let mut people = snapshot
        .people
        .iter()
        .filter(|person| whole_text_match_count(text, &person.full_name) > 0)
        .collect::<Vec<_>>();
    people.sort_by_key(|person| (first_value_offset(text, &[&person.full_name]), person.id));
    for (index, person) in people.into_iter().enumerate() {
        let slot = index + 1;
        let category = format!("Військовослужбовець {slot} · {}", person.full_name);
        for (value, field, label) in [
            (&person.full_name, "піб", "ПІБ військовослужбовця"),
            (&person.surname, "прізвище", "Прізвище військовослужбовця"),
            (&person.given_name, "імя", "Ім’я військовослужбовця"),
            (
                &person.patronymic,
                "по_батькові",
                "По батькові військовослужбовця",
            ),
            (&person.rank, "звання", "Звання військовослужбовця"),
            (&person.position, "посада", "Посада військовослужбовця"),
        ] {
            template_analysis_value(
                proposals,
                text,
                value,
                &format!("військовий_{slot}_{field}"),
                label,
                &category,
            );
        }
    }

    let mut vehicles = snapshot
        .vehicles
        .iter()
        .filter(|vehicle| {
            whole_text_match_count(text, &vehicle.name) > 0
                || whole_text_match_count(text, &vehicle.registration) > 0
        })
        .collect::<Vec<_>>();
    vehicles.sort_by_key(|vehicle| {
        (
            first_value_offset(text, &[&vehicle.name, &vehicle.registration]),
            vehicle.id,
        )
    });
    for (index, vehicle) in vehicles.into_iter().enumerate() {
        let slot = index + 1;
        let category = format!("Автомобіль {slot} · {}", vehicle.name);
        for (value, field, label) in [
            (&vehicle.name, "назва", "Назва автомобіля"),
            (&vehicle.registration, "номер", "Номер автомобіля"),
            (&vehicle.status, "статус", "Статус автомобіля"),
        ] {
            template_analysis_value(
                proposals,
                text,
                value,
                &format!("автомобіль_{slot}_{field}"),
                label,
                &category,
            );
        }
    }

    let mut crews = snapshot
        .crews
        .iter()
        .filter(|crew| whole_text_match_count(text, &crew.name) > 0)
        .collect::<Vec<_>>();
    crews.sort_by_key(|crew| (first_value_offset(text, &[&crew.name]), crew.id));
    for (index, crew) in crews.into_iter().enumerate() {
        let slot = index + 1;
        let category = format!("Екіпаж {slot} · {}", crew.name);
        for (value, field, label) in [
            (&crew.name, "назва", "Назва екіпажу"),
            (&crew.platoon, "взвод", "Взвод екіпажу"),
            (&crew.position, "позиція", "Позиція екіпажу"),
            (&crew.area, "район_розвідки", "Район розвідки"),
        ] {
            template_analysis_value(
                proposals,
                text,
                value,
                &format!("екіпаж_{slot}_{field}"),
                label,
                &category,
            );
        }
    }

    let mut positions = snapshot
        .positions
        .iter()
        .filter(|position| {
            position
                .values
                .first()
                .is_some_and(|(name, _, _)| whole_text_match_count(text, name) > 0)
        })
        .collect::<Vec<_>>();
    positions.sort_by_key(|position| {
        let name = &position.values[0].0;
        (first_value_offset(text, &[name]), position.id)
    });
    for (index, position) in positions.into_iter().enumerate() {
        let slot = index + 1;
        let name = &position.values[0].0;
        let category = format!("Позиція {slot} · {name}");
        for (value, field, label) in &position.values {
            template_analysis_value(
                proposals,
                text,
                value,
                &format!("позиція_{slot}_{field}"),
                label,
                &category,
            );
        }
    }

    let mut equipment = snapshot
        .equipment
        .iter()
        .filter(|item| {
            whole_text_match_count(text, &item.name) > 0
                || whole_text_match_count(text, &item.inventory) > 0
        })
        .collect::<Vec<_>>();
    equipment.sort_by_key(|item| {
        (
            first_value_offset(text, &[&item.name, &item.inventory]),
            item.id,
        )
    });
    let mut equipment_slots: HashMap<&str, usize> = HashMap::new();
    for item in equipment {
        let (prefix, category_label) = match item.category.as_str() {
            "generator" => ("генератор", "Генератор"),
            "uav" => ("бпла", "БпЛА"),
            "communications" => ("звʼязок", "Зв’язок"),
            "weapon_ammo" => ("зброя_та_бк", "Зброя та БК"),
            _ => continue,
        };
        let slot = equipment_slots.entry(prefix).or_default();
        *slot += 1;
        let slot = *slot;
        let category = format!("{category_label} {slot} · {}", item.name);
        for (value, field, label) in [
            (&item.name, "назва", "Назва"),
            (&item.inventory, "інвентарний_номер", "Інвентарний номер"),
            (&item.status, "статус", "Статус"),
            (&item.notes, "примітка", "Примітка"),
        ] {
            template_analysis_value(
                proposals,
                text,
                value,
                &format!("{prefix}_{slot}_{field}"),
                &format!("{label}: {category_label}"),
                &category,
            );
        }
    }
}

fn finalise_analysis_proposals(
    proposals: &mut Vec<TemplateAnalysisProposal>,
    text: &str,
    simple_edition: bool,
) {
    detected_document_proposals_for_edition(proposals, text, simple_edition);
    consolidate_analysis_proposals(proposals);
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
    if simple_edition {
        for proposal in proposals.iter_mut() {
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
            .then(left.category.cmp(&right.category))
            .then(left.token.cmp(&right.token))
            .then(left.label.cmp(&right.label))
    });
}

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
    let initial_fingerprint = source_fingerprint(&path)?;
    let text = report_generation::read_docx_text(&path)?;
    let paragraphs = report_generation::read_docx_paragraphs(&path)?;
    remember_analysed_source(&path, initial_fingerprint)?;
    let simple_edition = is_simple_edition(&app);
    // Copy the small, immutable analysis snapshot while holding the database
    // mutex, then release it before the expensive text matching starts.
    let snapshot = {
        let database = state
            .0
            .lock()
            .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
        load_analysis_snapshot(&database.connection, !simple_edition)?
    };
    let mut proposals = Vec::new();
    let signer_roles = settings::load(&application_root_from_path(&path)?)?.signer_roles;
    for role in &signer_roles {
        detected_signer_block_proposals(&mut proposals, &text, role);
    }
    detected_database_proposals(&mut proposals, &text, &snapshot);
    finalise_analysis_proposals(&mut proposals, &text, simple_edition);
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
    let source_fingerprint = ensure_analysed_source_unchanged(&source)?;
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
    if let Err(error) = ensure_source_matches(&source, source_fingerprint) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }
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
    let source_fingerprint = ensure_analysed_source_unchanged(&source)?;
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
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        report_generation::create_template_from_literal_replacements(
            &source_for_task,
            &destination_for_task,
            &replacements,
        )?;
        if let Err(error) = ensure_source_matches(&source_for_task, source_fingerprint) {
            let _ = std::fs::remove_file(&destination_for_task);
            return Err(error);
        }
        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn person(id: i64, full_name: &str, surname: &str, given_name: &str) -> AnalysisPerson {
        AnalysisPerson {
            id,
            full_name: full_name.into(),
            surname: surname.into(),
            given_name: given_name.into(),
            patronymic: "Тестович".into(),
            rank: "солдат".into(),
            position: "оператор".into(),
        }
    }

    #[test]
    fn database_people_receive_stable_slots_in_document_order() {
        let snapshot = AnalysisDataSnapshot {
            // Deliberately reverse database order: slots must follow the DOCX.
            people: vec![
                person(10, "ІВАНЕНКО Іван Іванович", "ІВАНЕНКО", "Іван"),
                person(20, "ПЕТРЕНКО Петро Петрович", "ПЕТРЕНКО", "Петро"),
            ],
            ..AnalysisDataSnapshot::default()
        };
        let text =
            "ПЕТРЕНКО Петро Петрович виконав завдання. ІВАНЕНКО Іван Іванович прийняв зміну.";
        let mut proposals = Vec::new();

        detected_database_proposals(&mut proposals, text, &snapshot);

        let petrenko = proposals
            .iter()
            .find(|proposal| proposal.value == "ПЕТРЕНКО Петро Петрович")
            .expect("first person proposal");
        let ivanenko = proposals
            .iter()
            .find(|proposal| proposal.value == "ІВАНЕНКО Іван Іванович")
            .expect("second person proposal");
        assert_eq!(petrenko.token, "військовий_1_піб");
        assert_eq!(ivanenko.token, "військовий_2_піб");
        assert!(petrenko.category.starts_with("Військовослужбовець 1 ·"));
        assert!(ivanenko.category.starts_with("Військовослужбовець 2 ·"));
        assert!(proposals
            .iter()
            .filter(|proposal| proposal.token.starts_with("військовий_1_"))
            .all(|proposal| proposal.category == petrenko.category));
    }
}
