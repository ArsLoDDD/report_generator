use super::*;

pub(crate) fn list_all_templates(app: tauri::AppHandle) -> Result<Vec<TemplateFile>, String> {
    let directory = templates_directory(&app)?;
    let mut templates = fs::read_dir(directory)
        .map_err(|_| "Не вдалося відкрити папку шаблонів.".to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|value| value.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("docx"))
        })
        .filter_map(|path| {
            let file_name = path.file_name()?.to_str()?.to_string();
            let (description, _) = template_description(&file_name);
            let source_path = path.to_string_lossy().to_string();
            let inspection = report_generation::inspect(&source_path);
            Some(TemplateFile {
                name: path.file_stem()?.to_str()?.to_string(),
                description: description.to_string(),
                changed: "Локальний файл".to_string(),
                status: if inspection.is_valid {
                    "ready".to_string()
                } else {
                    "error".to_string()
                },
                variables: inspection.variables.len() as u16,
                source_path,
            })
        })
        .collect::<Vec<_>>();
    templates.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(templates)
}

#[tauri::command]
pub(crate) fn list_templates(
    app: tauri::AppHandle,
    offset: u32,
    limit: u32,
) -> Result<TemplatesPage, String> {
    let templates = list_all_templates(app)?;
    let total_count = templates.len() as u64;
    let items = templates
        .into_iter()
        .skip(offset as usize)
        .take(limit.clamp(1, 100) as usize)
        .collect();
    Ok(TemplatesPage { items, total_count })
}

#[tauri::command]
pub(crate) fn select_template_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("Шаблони DOCX", &["docx"])
        .blocking_pick_file();
    match file {
        Some(path) => Ok(Some(
            path.into_path()
                .map_err(|_| "Не вдалося прочитати шлях до вибраного шаблону.".to_string())?
                .to_string_lossy()
                .to_string(),
        )),
        None => Ok(None),
    }
}

#[tauri::command]
pub(crate) fn inspect_template(
    template_path: String,
) -> Result<report_generation::TemplateValidationResult, String> {
    Ok(report_generation::inspect(&template_path))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) fn validate_template(
    state: tauri::State<AppState>,
    template_path: String,
    personnel_ids: Vec<i64>,
    report_date: Option<String>,
    vehicle_ids: Vec<i64>,
    crew_ids: Vec<i64>,
    position_ids: Option<Vec<i64>>,
    equipment_ids: Vec<i64>,
    parameters: Option<std::collections::HashMap<String, String>>,
) -> Result<report_generation::TemplateValidationResult, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    Ok(report_generation::validate(
        &database.connection,
        &template_path,
        &personnel_ids,
        &vehicle_ids,
        &crew_ids,
        &position_ids.unwrap_or_default(),
        &equipment_ids,
        report_date.as_deref(),
        &parameters.unwrap_or_default(),
    ))
}

#[tauri::command]
pub(crate) fn generate_report(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    request: report_generation::GenerateReportRequest,
) -> Result<report_generation::GeneratedReport, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    let root = ensure_application_structure(&app)?;
    report_generation::generate(&database.connection, &root, request)
}

pub(crate) fn ensure_reports_item(
    app: &tauri::AppHandle,
    requested_path: &str,
) -> Result<PathBuf, String> {
    let reports_root = ensure_application_structure(app)?
        .join(REPORTS_DIRECTORY_NAME)
        .canonicalize()
        .map_err(|_| "Не вдалося відкрити папку рапортів.".to_string())?;
    let item = Path::new(requested_path)
        .canonicalize()
        .map_err(|_| "Файл або папку рапорту не знайдено.".to_string())?;
    if !item.starts_with(&reports_root) {
        return Err("Можна відкривати лише файли та папки зі структури Reports.".to_string());
    }
    Ok(item)
}

pub(crate) fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(path).spawn();
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer").arg(path).spawn();
    #[cfg(target_os = "linux")]
    let result = Command::new("xdg-open").arg(path).spawn();
    result.map(|_| ()).map_err(|_| {
        "Не вдалося відкрити файл або папку. Перевірте, чи є програма для DOCX-файлів.".to_string()
    })
}

pub(crate) fn ensure_template_path(
    templates_directory: &Path,
    requested_path: &str,
) -> Result<PathBuf, String> {
    let templates_root = templates_directory
        .canonicalize()
        .map_err(|_| "Не вдалося відкрити папку шаблонів.".to_string())?;
    let template = Path::new(requested_path)
        .canonicalize()
        .map_err(|_| "Шаблон не знайдено. Оновіть список шаблонів.".to_string())?;
    let is_docx = template
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("docx"));
    if !template.starts_with(&templates_root) || !is_docx {
        return Err("Можна відкривати лише DOCX-файли з папки «Шаблони».".to_string());
    }
    Ok(template)
}

pub(crate) fn ensure_template_item(
    app: &tauri::AppHandle,
    requested_path: &str,
) -> Result<PathBuf, String> {
    ensure_template_path(&templates_directory(app)?, requested_path)
}

#[tauri::command]
pub(crate) fn open_template(app: tauri::AppHandle, template_path: String) -> Result<(), String> {
    open_path(&ensure_template_item(&app, &template_path)?)
}

#[tauri::command]
pub(crate) fn open_templates_directory(app: tauri::AppHandle) -> Result<(), String> {
    open_path(&templates_directory(&app)?)
}

#[tauri::command]
pub(crate) fn delete_template(app: tauri::AppHandle, template_path: String) -> Result<(), String> {
    let template = ensure_template_item(&app, &template_path)?;
    fs::remove_file(template)
        .map_err(|_| "Не вдалося видалити шаблон. Можливо, файл відкритий у Word.".to_string())
}

#[tauri::command]
pub(crate) fn open_generated_report(
    app: tauri::AppHandle,
    report_path: String,
) -> Result<(), String> {
    open_path(&ensure_reports_item(&app, &report_path)?)
}

#[tauri::command]
pub(crate) fn open_generated_report_folder(
    app: tauri::AppHandle,
    folder_path: String,
) -> Result<(), String> {
    open_path(&ensure_reports_item(&app, &folder_path)?)
}

#[tauri::command]
pub(crate) fn delete_generated_reports(
    app: tauri::AppHandle,
    report_paths: Vec<String>,
) -> Result<(), String> {
    if report_paths.is_empty() {
        return Ok(());
    }
    let mut folders = Vec::new();
    for report_path in report_paths {
        let report = ensure_reports_item(&app, &report_path)?;
        if !report
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("docx"))
        {
            return Err(
                "Можна видаляти лише DOCX-рапорти з папки «Згенеровані рапорти».".to_string(),
            );
        }
        let parent = report.parent().map(Path::to_path_buf);
        fs::remove_file(&report).map_err(|_| {
            "Не вдалося видалити рапорт. Можливо, файл відкритий у Word.".to_string()
        })?;
        if let Some(folder) = parent {
            folders.push(folder);
        }
    }
    for folder in folders {
        if fs::read_dir(&folder)
            .ok()
            .is_some_and(|mut entries| entries.next().is_none())
        {
            let _ = fs::remove_dir(&folder);
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn open_application_directory(app: tauri::AppHandle) -> Result<(), String> {
    open_path(&ensure_application_structure(&app)?)
}

#[tauri::command]
pub(crate) fn create_database_backup(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let database = state
        .0
        .lock()
        .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
    if !database.is_persistent {
        return Err("Неможливо створити резервну копію: файл бази даних ще не існує. Спочатку додайте військовослужбовця.".to_string());
    }
    let root = ensure_application_structure(&app)?;
    let now = Local::now();
    let directory = root
        .join(BACKUPS_DIRECTORY_NAME)
        .join(now.format("%d.%m.%Y").to_string());
    fs::create_dir_all(&directory)
        .map_err(|_| "Не вдалося створити папку резервних копій.".to_string())?;
    let backup_path = directory.join(format!("Резервна копія БД {}.zip", now.format("%H-%M-%S")));
    let database_path = root.join(DATABASE_FILE_NAME);
    let mut database = fs::File::open(&database_path)
        .map_err(|_| "Не вдалося відкрити базу даних для резервного копіювання.".to_string())?;
    let output = fs::File::create(&backup_path)
        .map_err(|_| "Не вдалося створити резервну копію бази даних.".to_string())?;
    let mut archive = ZipWriter::new(output);
    archive
        .start_file(
            "особовий_склад.db",
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|_| "Не вдалося сформувати резервну копію.".to_string())?;
    let mut bytes = Vec::new();
    database
        .read_to_end(&mut bytes)
        .map_err(|_| "Не вдалося прочитати базу даних для резервного копіювання.".to_string())?;
    archive
        .write_all(&bytes)
        .map_err(|_| "Не вдалося записати резервну копію.".to_string())?;
    archive
        .finish()
        .map_err(|_| "Не вдалося завершити резервне копіювання.".to_string())?;
    Ok(backup_path.to_string_lossy().to_string())
}

pub(crate) fn archive_file(
    archive: &mut ZipWriter<fs::File>,
    source: &Path,
    name: &str,
) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }
    archive
        .start_file(
            name,
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|_| "Не вдалося сформувати архів.".to_string())?;
    let mut input =
        fs::File::open(source).map_err(|_| "Не вдалося прочитати файл для архіву.".to_string())?;
    io::copy(&mut input, archive).map_err(|_| "Не вдалося записати архів.".to_string())?;
    Ok(())
}
pub(crate) fn archive_directory(
    archive: &mut ZipWriter<fs::File>,
    directory: &Path,
    prefix: &str,
) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory)
        .map_err(|_| "Не вдалося прочитати папку для архіву.".to_string())?
        .filter_map(Result::ok)
    {
        let path = entry.path();
        let name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
        if path.is_dir() {
            archive_directory(archive, &path, &name)?;
        } else {
            archive_file(archive, &path, &name)?;
        }
    }
    Ok(())
}
#[tauri::command]
pub(crate) fn export_application_data(
    app: tauri::AppHandle,
    path: String,
    options: DataArchiveOptions,
) -> Result<(), String> {
    let root = ensure_application_structure(&app)?;
    let file =
        fs::File::create(path).map_err(|_| "Не вдалося створити архів перенесення.".to_string())?;
    let mut archive = ZipWriter::new(file);
    if options.database {
        archive_file(
            &mut archive,
            &root.join(DATABASE_FILE_NAME),
            "data/особовий_склад.db",
        )?;
    }
    if options.settings {
        archive_file(&mut archive, &settings::path(&root), "data/settings.json")?;
    }
    if options.custom_variables {
        archive_file(
            &mut archive,
            &root.join(CUSTOM_VARIABLES_FILE_NAME),
            "data/custom_variables.json",
        )?;
    }
    if options.templates {
        archive_directory(
            &mut archive,
            &root.join(TEMPLATES_DIRECTORY_NAME),
            "templates",
        )?;
    }
    if options.reports {
        archive_directory(&mut archive, &root.join(REPORTS_DIRECTORY_NAME), "reports")?;
    }
    archive
        .finish()
        .map_err(|_| "Не вдалося завершити архів перенесення.".to_string())?;
    Ok(())
}
#[tauri::command]
pub(crate) fn import_application_data(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    path: String,
) -> Result<(), String> {
    let root = ensure_application_structure(&app)?;
    let file =
        fs::File::open(path).map_err(|_| "Не вдалося відкрити архів перенесення.".to_string())?;
    let mut archive = ZipArchive::new(file)
        .map_err(|_| "Файл не є коректним архівом перенесення.".to_string())?;
    let allowed = [
        "data/особовий_склад.db",
        "data/settings.json",
        "data/custom_variables.json",
    ];
    let mut database_bytes = None;
    for index in 0..archive.len() {
        let mut item = archive
            .by_index(index)
            .map_err(|_| "Не вдалося прочитати архів.".to_string())?;
        let name = item.name().to_string();
        if Path::new(&name).components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        }) {
            return Err("Архів містить неприпустимий шлях до файлу.".to_string());
        }
        let target = if allowed.contains(&name.as_str()) {
            Some(root.join(name.trim_start_matches("data/")))
        } else if name.starts_with("templates/") {
            Some(
                root.join(TEMPLATES_DIRECTORY_NAME)
                    .join(name.trim_start_matches("templates/")),
            )
        } else if name.starts_with("reports/") {
            Some(
                root.join(REPORTS_DIRECTORY_NAME)
                    .join(name.trim_start_matches("reports/")),
            )
        } else {
            None
        };
        let Some(target) = target else { continue };
        if item.is_dir() {
            continue;
        }
        let mut bytes = Vec::new();
        item.read_to_end(&mut bytes)
            .map_err(|_| "Не вдалося прочитати файл з архіву.".to_string())?;
        if name == "data/особовий_склад.db" {
            database_bytes = Some(bytes);
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|_| "Не вдалося відновити папку даних.".to_string())?;
            }
            fs::write(target, bytes).map_err(|_| "Не вдалося відновити файл даних.".to_string())?;
        }
    }
    if let Some(bytes) = database_bytes {
        let mut database = state
            .0
            .lock()
            .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
        let temporary = root.join("особовий_склад.import.tmp");
        fs::write(&temporary, bytes).map_err(|_| "Не вдалося відновити базу даних.".to_string())?;
        let memory = Connection::open_in_memory()
            .map_err(|_| "Не вдалося підготувати базу даних.".to_string())?;
        let old = std::mem::replace(&mut database.connection, memory);
        drop(old);
        fs::rename(&temporary, root.join(DATABASE_FILE_NAME))
            .map_err(|_| "Не вдалося замінити базу даних.".to_string())?;
        database.connection = Connection::open(root.join(DATABASE_FILE_NAME))
            .map_err(|_| "Не вдалося відкрити відновлену базу даних.".to_string())?;
        database.is_persistent = true;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn list_generated_reports(
    app: tauri::AppHandle,
    offset: u32,
    limit: u32,
    query: Option<String>,
    from_date: Option<String>,
) -> Result<GeneratedReportsPage, String> {
    let reports_directory = ensure_application_structure(&app)?.join(REPORTS_DIRECTORY_NAME);
    let template_names = list_all_templates(app)?
        .into_iter()
        .map(|template| template.name)
        .collect::<Vec<_>>();
    let normalized_query = query.unwrap_or_default().trim().to_lowercase();
    let minimum_date = from_date
        .as_deref()
        .and_then(|value| chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());
    let mut reports = Vec::new();
    for date_entry in fs::read_dir(&reports_directory)
        .map_err(|_| "Не вдалося відкрити папку рапортів.".to_string())?
        .filter_map(Result::ok)
    {
        if !date_entry.path().is_dir() {
            continue;
        }
        for document_entry in fs::read_dir(date_entry.path())
            .map_err(|_| "Не вдалося прочитати папку згенерованих рапортів.".to_string())?
            .filter_map(Result::ok)
        {
            let docx_path = document_entry.path();
            if !docx_path.is_file()
                || !docx_path
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("docx"))
            {
                continue;
            }
            let name = docx_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Рапорт")
                .to_string();
            let template = template_names
                .iter()
                .filter(|template| name.starts_with(template.as_str()))
                .max_by_key(|template| template.len())
                .cloned()
                .unwrap_or_else(|| name.clone());
            let modified = fs::metadata(&docx_path)
                .ok()
                .and_then(|metadata| metadata.modified().ok());
            let local_modified = modified.map(DateTime::<Local>::from);
            if minimum_date.is_some_and(|minimum| {
                local_modified.is_some_and(|value| value.date_naive() < minimum)
            }) {
                continue;
            }
            let generated_at = local_modified
                .map(|value| value.format("%d.%m.%Y %H:%M").to_string())
                .unwrap_or_else(|| date_entry.file_name().to_string_lossy().to_string());
            let report = GeneratedReportFile {
                name,
                template,
                generated_at,
                docx_path: docx_path.to_string_lossy().to_string(),
                folder_path: date_entry.path().to_string_lossy().to_string(),
            };
            if !normalized_query.is_empty()
                && !format!(
                    "{} {} {}",
                    report.name, report.template, report.generated_at
                )
                .to_lowercase()
                .contains(&normalized_query)
            {
                continue;
            }
            reports.push((modified.unwrap_or(UNIX_EPOCH), report));
        }
    }
    reports.sort_by_key(|report| std::cmp::Reverse(report.0));
    let total_count = reports.len() as u64;
    let safe_offset = offset as usize;
    let safe_limit = limit.clamp(1, 100) as usize;
    let items = reports
        .into_iter()
        .skip(safe_offset)
        .take(safe_limit)
        .map(|(_, report)| report)
        .collect();
    Ok(GeneratedReportsPage { items, total_count })
}
