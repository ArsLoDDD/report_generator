use super::*;
use sha2::{Digest, Sha256};
use std::collections::{HashMap as StdHashMap, HashSet};
use std::fs::OpenOptions;
use std::sync::{Mutex as StdMutex, OnceLock};

const DATA_ARCHIVE_FORMAT: &str = "raportgen-data-archive";
const DATA_ARCHIVE_VERSION: u32 = 2;
const DATA_ARCHIVE_MANIFEST: &str = "raportgen-manifest.json";
const DATA_ARCHIVE_EXCEL_PATH: &str = "data/Excel-база.xlsx";
const DATABASE_ARCHIVE_SECTIONS: [&str; 22] = [
    "personnel",
    "staffing",
    "crews",
    "positions",
    "personnel_control",
    "flight_plans",
    "flight_journal",
    "summary_reports",
    "incidents",
    "workshop",
    "deadlines",
    "zbbr",
    "zu",
    "gz_kb",
    "siiz",
    "ms",
    "ets",
    "ovtm",
    "rs",
    "sa_ppo",
    "svt",
    "pmm",
];
const SERVICE_ARCHIVE_SECTIONS: [&str; 11] = [
    "zbbr", "zu", "gz_kb", "siiz", "ms", "ets", "ovtm", "rs", "sa_ppo", "svt", "pmm",
];
const MAX_ARCHIVE_ENTRIES: usize = 100_000;
const MAX_ARCHIVE_TOTAL_SIZE: u64 = 8 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_FILE_SIZE: u64 = 2 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_JSON_SIZE: u64 = 16 * 1024 * 1024;
const MAX_ARCHIVE_MANIFEST_SIZE: u64 = 2 * 1024 * 1024;
const MAX_ARCHIVE_COMPRESSION_RATIO: u64 = 10_000;

#[derive(Debug, Clone)]
struct ArchiveSource {
    source: PathBuf,
    archive_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DataArchiveManifest {
    format: String,
    version: u32,
    created_at: String,
    application_version: String,
    #[serde(default)]
    sections: Vec<String>,
    files: Vec<DataArchiveManifestFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataArchiveInspection {
    application_version: String,
    database: bool,
    database_sections: Vec<String>,
    settings: bool,
    custom_variables: bool,
    templates: bool,
    reports: bool,
    excel: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DataArchiveManifestFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Debug)]
struct StagedImport {
    directory: PathBuf,
    files: Vec<StagedImportFile>,
    legacy_archive: bool,
    manifest: Option<DataArchiveManifest>,
}

#[derive(Debug, Clone)]
struct StagedImportFile {
    relative_path: PathBuf,
    archive_path: String,
}

struct InstalledImport {
    rollback_directory: PathBuf,
    files: Vec<(PathBuf, Option<PathBuf>)>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedReportManifest {
    format_version: u32,
    generated_at: String,
    template: GeneratedReportTemplateManifest,
}

#[derive(Debug, Deserialize)]
struct GeneratedReportTemplateManifest {
    name: String,
}

#[derive(Debug, Clone)]
struct CachedTemplateInspection {
    size: u64,
    modified: Option<SystemTime>,
    is_valid: bool,
    variables: usize,
}

fn cached_template_inspection(path: &Path) -> (bool, usize) {
    static CACHE: OnceLock<StdMutex<StdHashMap<PathBuf, CachedTemplateInspection>>> =
        OnceLock::new();
    let metadata = fs::metadata(path).ok();
    let size = metadata.as_ref().map_or(0, fs::Metadata::len);
    let modified = metadata.and_then(|value| value.modified().ok());
    let cache = CACHE.get_or_init(|| StdMutex::new(StdHashMap::new()));
    if let Ok(cache) = cache.lock() {
        if let Some(cached) = cache
            .get(path)
            .filter(|cached| cached.size == size && cached.modified == modified)
        {
            return (cached.is_valid, cached.variables);
        }
    }
    let source_path = path.to_string_lossy();
    let inspection = report_generation::inspect(&source_path);
    let summary = CachedTemplateInspection {
        size,
        modified,
        is_valid: inspection.is_valid,
        variables: inspection.variables.len(),
    };
    if let Ok(mut cache) = cache.lock() {
        cache.insert(path.to_path_buf(), summary.clone());
    }
    (summary.is_valid, summary.variables)
}

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
            let source_path = path.to_string_lossy().to_string();
            let (is_valid, variables) = cached_template_inspection(&path);
            Some(TemplateFile {
                name: path.file_stem()?.to_str()?.to_string(),
                description: "Локальний DOCX-шаблон рапорту".to_string(),
                changed: "Локальний файл".to_string(),
                status: if is_valid {
                    "ready".to_string()
                } else {
                    "error".to_string()
                },
                variables: variables.min(u16::MAX as usize) as u16,
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
    app: tauri::AppHandle,
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
        Some(&settings::load(&application_root(&app)?)?),
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
    let root = ensure_application_structure(&app)?;
    let trash = root.join(".trash").join("templates");
    fs::create_dir_all(&trash).map_err(|_| "Не вдалося підготувати кошик шаблонів.".to_string())?;
    let file_name = template
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Ім’я шаблону містить непідтримувані символи.".to_string())?;
    let destination = unique_trash_path(&trash, file_name);
    fs::rename(template, destination).map_err(|_| {
        "Не вдалося перемістити шаблон у кошик. Можливо, файл відкритий у Word.".to_string()
    })
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
    let mut reports = Vec::with_capacity(report_paths.len());
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
        reports.push(report);
    }
    let root = ensure_application_structure(&app)?;
    let trash_root = root.join(".trash").join("reports");
    fs::create_dir_all(&trash_root)
        .map_err(|_| "Не вдалося підготувати кошик рапортів.".to_string())?;
    let staging = create_unique_directory(&trash_root, "deleted")?;
    let mut moved = Vec::new();
    let mut folders = Vec::new();
    for (index, report) in reports.iter().enumerate() {
        let mut related = vec![report.clone()];
        if let Some(manifest) = generated_report_manifest_path(report).filter(|path| path.exists())
        {
            related.push(manifest);
        }
        for (related_index, source) in related.into_iter().enumerate() {
            let file_name = source
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("report");
            let destination = staging.join(format!("{index}-{related_index}-{file_name}"));
            if fs::rename(&source, &destination).is_err() {
                for (staged, original) in moved.iter().rev() {
                    let _ = fs::rename(staged, original);
                }
                let _ = fs::remove_dir_all(&staging);
                return Err(
                    "Не вдалося видалити рапорти; вже переміщені файли відновлено.".to_string(),
                );
            }
            moved.push((destination, source));
        }
        if let Some(folder) = report.parent() {
            folders.push(folder.to_path_buf());
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

fn unique_trash_path(directory: &Path, file_name: &str) -> PathBuf {
    let timestamp = Local::now().format("%Y%m%d-%H%M%S%.3f");
    let candidate = directory.join(format!("{timestamp}-{file_name}"));
    if !candidate.exists() {
        return candidate;
    }
    for attempt in 1..1000_u32 {
        let candidate = directory.join(format!("{timestamp}-{attempt}-{file_name}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    directory.join(format!(
        "{}-{}-{file_name}",
        Local::now().timestamp_nanos_opt().unwrap_or_default(),
        std::process::id()
    ))
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
    let root = ensure_application_structure(&app)?;
    let work_directory = create_unique_directory(&root, ".database-backup")?;
    let result = (|| {
        let snapshot = work_directory.join(DATABASE_FILE_NAME);
        {
            let database = state
                .0
                .lock()
                .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
            snapshot_database(&database.connection, &snapshot)?;
        }
        let now = Local::now();
        let directory = root
            .join(BACKUPS_DIRECTORY_NAME)
            .join(now.format("%d.%m.%Y").to_string());
        fs::create_dir_all(&directory)
            .map_err(|_| "Не вдалося створити папку резервних копій.".to_string())?;
        create_unique_archive(
            &directory,
            &format!("Резервна копія БД {}", now.format("%H-%M-%S%.3f")),
            &[ArchiveSource {
                source: snapshot,
                archive_path: DATABASE_FILE_NAME.to_string(),
            }],
        )
    })();
    let _ = fs::remove_dir_all(work_directory);
    result.map(|path| path.to_string_lossy().to_string())
}

fn create_unique_directory(parent: &Path, prefix: &str) -> Result<PathBuf, String> {
    for attempt in 0..1000_u32 {
        let path = parent.join(format!(
            "{prefix}-{}-{}-{attempt}",
            std::process::id(),
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        match fs::create_dir(&path) {
            Ok(()) => return Ok(path),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("Не вдалося створити тимчасову папку.".to_string()),
        }
    }
    Err("Не вдалося підібрати безпечне ім’я тимчасової папки.".to_string())
}

fn snapshot_database(connection: &Connection, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        fs::remove_file(destination)
            .map_err(|_| "Не вдалося підготувати знімок бази даних.".to_string())?;
    }
    let destination = destination
        .to_str()
        .ok_or_else(|| "Шлях до знімка бази даних містить непідтримувані символи.".to_string())?;
    connection
        .execute("VACUUM INTO ?1", [destination])
        .map_err(|_| "Не вдалося створити узгоджений знімок бази даних.".to_string())?;
    Ok(())
}

fn selected_database_sections(options: &DataArchiveOptions) -> Result<HashSet<String>, String> {
    if !options.database && !options.excel {
        return Ok(HashSet::new());
    }
    let requested = if options.database_sections.is_empty() {
        DATABASE_ARCHIVE_SECTIONS
            .iter()
            .map(|value| (*value).to_string())
            .collect::<Vec<_>>()
    } else {
        options.database_sections.clone()
    };
    let supported = DATABASE_ARCHIVE_SECTIONS
        .into_iter()
        .collect::<HashSet<_>>();
    if let Some(unknown) = requested
        .iter()
        .find(|value| !supported.contains(value.as_str()))
    {
        return Err(format!("Непідтримуваний розділ архіву: {unknown}."));
    }
    Ok(requested.into_iter().collect())
}

fn execute_archive_sql(connection: &Connection, sql: &str, label: &str) -> Result<(), String> {
    connection
        .execute_batch(sql)
        .map_err(|error| format!("Не вдалося підготувати «{label}» для архіву: {error}"))
}

fn filter_database_snapshot(
    path: &Path,
    sections: &HashSet<String>,
    include_custom_variables: bool,
) -> Result<(), String> {
    if sections.len() == DATABASE_ARCHIVE_SECTIONS.len() && include_custom_variables {
        return Ok(());
    }
    let connection = Connection::open(path)
        .map_err(|_| "Не вдалося відкрити знімок бази для вибіркового експорту.".to_string())?;
    execute_archive_sql(
        &connection,
        "PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;",
        "базу даних",
    )?;
    let result = (|| {
        if !sections.contains("personnel") {
            execute_archive_sql(
                &connection,
                "
                DELETE FROM personnel_custom_fields;
                DELETE FROM personnel_staff_assignments;
                DELETE FROM staff_recommendations;
                DELETE FROM crew_members;
                DELETE FROM crew_actual_members;
                DELETE FROM personnel_control_assignments;
                DELETE FROM personnel_control_events;
                DELETE FROM position_work_members;
                DELETE FROM position_work_periods;
                DELETE FROM incident_personnel;
                DELETE FROM flight_plan_personnel_locations;
                UPDATE vehicles SET personnel_id=NULL;
                UPDATE equipment SET personnel_id=NULL;
                DELETE FROM personnel;
                DELETE FROM temporary_personnel;",
                "особовий склад",
            )?;
        }
        if !sections.contains("staffing") {
            execute_archive_sql(&connection, "DELETE FROM personnel_staff_assignments; DELETE FROM staff_recommendations; DELETE FROM staff_position_recommendations;", "штат і рекомендаційні листи")?;
        }
        if !sections.contains("crews") {
            execute_archive_sql(
                &connection,
                "
                DELETE FROM crew_members;
                DELETE FROM crew_actual_members;
                UPDATE vehicles SET crew_id=NULL;
                UPDATE equipment SET crew_id=NULL;
                UPDATE positions SET crew_id=NULL;
                UPDATE incidents SET crew_id=NULL;
                UPDATE flight_plan_snapshot_entries SET crew_id=NULL;
                DELETE FROM crews;",
                "екіпажі",
            )?;
        }
        if !sections.contains("positions") {
            execute_archive_sql(
                &connection,
                "
                DELETE FROM position_uavs;
                DELETE FROM position_work_members;
                DELETE FROM position_work_periods;
                DELETE FROM position_work_status_history;
                DELETE FROM position_work;
                DELETE FROM position_work_events;
                UPDATE crews SET position_id=NULL;
                UPDATE flight_journal_entries SET position_id=NULL;
                DELETE FROM positions;",
                "позиції",
            )?;
        }
        if !sections.contains("personnel_control") {
            execute_archive_sql(
                &connection,
                "DELETE FROM personnel_control_assignments; DELETE FROM personnel_control_events;",
                "контроль особового складу",
            )?;
        }
        if !sections.contains("flight_plans") {
            execute_archive_sql(&connection, "UPDATE flight_journal_entries SET snapshot_id=NULL; DELETE FROM flight_plan_snapshot_entries; DELETE FROM flight_plan_snapshots; DELETE FROM flight_plan_personnel_locations;", "плани польотів")?;
        }
        if !sections.contains("flight_journal") {
            execute_archive_sql(
                &connection,
                "DELETE FROM flight_journal_entries;",
                "журнал польотів",
            )?;
        }
        if !sections.contains("summary_reports") {
            execute_archive_sql(
                &connection,
                "DELETE FROM summary_report_drafts;",
                "підсумкові донесення",
            )?;
        }
        if !sections.contains("incidents") {
            execute_archive_sql(&connection, "UPDATE asset_write_offs SET incident_id=NULL; DELETE FROM incident_equipment; DELETE FROM incident_personnel; DELETE FROM incidents;", "інциденти")?;
        }
        if !sections.contains("workshop") {
            execute_archive_sql(
                &connection,
                "DELETE FROM workshop_ingredients; DELETE FROM workshop_products;",
                "Цукерню",
            )?;
        }
        if !sections.contains("deadlines") {
            execute_archive_sql(
                &connection,
                "DELETE FROM deadline_reminders;",
                "контроль строків",
            )?;
        }

        let selected_services = SERVICE_ARCHIVE_SECTIONS
            .iter()
            .filter(|code| sections.contains(**code))
            .copied()
            .collect::<Vec<_>>();
        let excluded_filter = if selected_services.is_empty() {
            "1=1".to_string()
        } else {
            format!(
                "service_code NOT IN ({})",
                selected_services
                    .iter()
                    .map(|code| format!("'{code}'"))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        };
        execute_archive_sql(&connection, &format!("
            DELETE FROM asset_write_off_history WHERE write_off_id IN (SELECT id FROM asset_write_offs WHERE equipment_id IN (SELECT id FROM equipment WHERE {excluded_filter}));
            DELETE FROM asset_write_offs WHERE equipment_id IN (SELECT id FROM equipment WHERE {excluded_filter});
            DELETE FROM position_uavs WHERE equipment_id IN (SELECT id FROM equipment WHERE {excluded_filter});
            DELETE FROM incident_equipment WHERE equipment_id IN (SELECT id FROM equipment WHERE {excluded_filter});
            DELETE FROM workshop_ingredients WHERE equipment_id IN (SELECT id FROM equipment WHERE {excluded_filter});
            DELETE FROM asset_custom_values WHERE equipment_id IN (SELECT id FROM equipment WHERE {excluded_filter});
            UPDATE crews SET primary_uav_id=NULL WHERE primary_uav_id IN (SELECT id FROM equipment WHERE {excluded_filter});
            UPDATE flight_journal_entries SET uav_id=NULL WHERE uav_id IN (SELECT id FROM equipment WHERE {excluded_filter});
            UPDATE equipment SET parent_equipment_id=NULL WHERE parent_equipment_id IN (SELECT id FROM equipment WHERE {excluded_filter});
            DELETE FROM equipment WHERE {excluded_filter};
            DELETE FROM asset_history WHERE {excluded_filter};
            DELETE FROM asset_catalog_fields WHERE catalog_id IN (SELECT id FROM asset_catalogs WHERE {excluded_filter});
            DELETE FROM asset_catalogs WHERE {excluded_filter};"), "служби")?;
        if !sections.contains("svt") {
            execute_archive_sql(
                &connection,
                "DELETE FROM vehicle_custom_fields; DELETE FROM vehicles;",
                "СВТ",
            )?;
        }
        if !include_custom_variables {
            execute_archive_sql(
                &connection,
                "
                DELETE FROM personnel_custom_fields;
                DELETE FROM vehicle_custom_fields;
                DELETE FROM custom_field_definitions;
                DELETE FROM vehicle_custom_field_definitions;
                DELETE FROM custom_field_template_aliases;",
                "кастомні поля",
            )?;
        }

        execute_archive_sql(&connection, "
            DELETE FROM crew_members WHERE crew_id NOT IN (SELECT id FROM crews) OR personnel_id NOT IN (SELECT id FROM personnel);
            DELETE FROM crew_actual_members WHERE crew_id NOT IN (SELECT id FROM crews) OR personnel_id NOT IN (SELECT id FROM personnel);
            DELETE FROM position_uavs WHERE position_id NOT IN (SELECT id FROM positions) OR equipment_id NOT IN (SELECT id FROM equipment);
            DELETE FROM incident_equipment WHERE incident_id NOT IN (SELECT id FROM incidents) OR equipment_id NOT IN (SELECT id FROM equipment);
            DELETE FROM incident_personnel WHERE incident_id NOT IN (SELECT id FROM incidents);
            UPDATE asset_write_offs SET incident_id=NULL WHERE incident_id IS NOT NULL AND incident_id NOT IN (SELECT id FROM incidents);
            UPDATE asset_write_offs SET equipment_id=NULL WHERE equipment_id IS NOT NULL AND equipment_id NOT IN (SELECT id FROM equipment);
            DELETE FROM workshop_ingredients WHERE product_id NOT IN (SELECT id FROM workshop_products) OR equipment_id NOT IN (SELECT id FROM equipment);
            UPDATE crews SET position_id=NULL WHERE position_id IS NOT NULL AND position_id NOT IN (SELECT id FROM positions);
            UPDATE crews SET primary_uav_id=NULL WHERE primary_uav_id IS NOT NULL AND primary_uav_id NOT IN (SELECT id FROM equipment);
            UPDATE positions SET crew_id=NULL WHERE crew_id IS NOT NULL AND crew_id NOT IN (SELECT id FROM crews);
            UPDATE equipment SET crew_id=NULL WHERE crew_id IS NOT NULL AND crew_id NOT IN (SELECT id FROM crews);
            UPDATE equipment SET personnel_id=NULL WHERE personnel_id IS NOT NULL AND personnel_id NOT IN (SELECT id FROM personnel);
            UPDATE equipment SET parent_equipment_id=NULL WHERE parent_equipment_id IS NOT NULL AND parent_equipment_id NOT IN (SELECT id FROM equipment);
            UPDATE equipment SET catalog_id=NULL WHERE catalog_id IS NOT NULL AND catalog_id NOT IN (SELECT id FROM asset_catalogs);
            UPDATE equipment SET legacy_vehicle_id=NULL WHERE legacy_vehicle_id IS NOT NULL AND legacy_vehicle_id NOT IN (SELECT id FROM vehicles);
            UPDATE vehicles SET crew_id=NULL WHERE crew_id IS NOT NULL AND crew_id NOT IN (SELECT id FROM crews);
            UPDATE vehicles SET personnel_id=NULL WHERE personnel_id IS NOT NULL AND personnel_id NOT IN (SELECT id FROM personnel);
            COMMIT; PRAGMA foreign_keys=ON;", "зв’язки даних")?;
        check_database_integrity(&connection)
    })();
    if result.is_err() {
        let _ = connection.execute_batch("ROLLBACK; PRAGMA foreign_keys=ON;");
    }
    result
}

fn validate_portable_archive_path(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.starts_with('/')
        || name.starts_with('\\')
        || name.contains('\\')
        || name.contains('\0')
    {
        return Err("Архів містить неприпустимий шлях до файлу.".to_string());
    }
    let trimmed = name.trim_end_matches('/');
    if trimmed.is_empty()
        || trimmed
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        || trimmed
            .split('/')
            .next()
            .is_some_and(|part| part.contains(':'))
    {
        return Err("Архів містить неприпустимий шлях до файлу.".to_string());
    }
    Ok(())
}

fn collect_archive_directory(
    sources: &mut Vec<ArchiveSource>,
    directory: &Path,
    prefix: &str,
    excluded: &HashSet<PathBuf>,
) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory)
        .map_err(|_| "Не вдалося прочитати папку для архіву.".to_string())?
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if excluded.contains(&path) {
            continue;
        }
        let metadata = fs::symlink_metadata(&path)
            .map_err(|_| "Не вдалося перевірити файл для архіву.".to_string())?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Архів не створено: символічні посилання не підтримуються ({0}).",
                path.display()
            ));
        }
        let file_name = entry
            .file_name()
            .to_str()
            .ok_or_else(|| "Ім’я файла містить непідтримувані символи.".to_string())?
            .to_string();
        let name = format!("{prefix}/{file_name}");
        validate_portable_archive_path(&name)?;
        if metadata.is_dir() {
            collect_archive_directory(sources, &path, &name, excluded)?;
        } else if metadata.is_file() {
            sources.push(ArchiveSource {
                source: path,
                archive_path: name,
            });
        }
    }
    Ok(())
}

fn write_archive_contents(
    output: fs::File,
    sources: &[ArchiveSource],
    sections: &[String],
) -> Result<(), String> {
    let mut archive = ZipWriter::new(output);
    let mut manifest_files = Vec::with_capacity(sources.len());
    let mut names = HashSet::new();
    let mut sorted_sources = sources.to_vec();
    sorted_sources.sort_by(|left, right| left.archive_path.cmp(&right.archive_path));
    for source in sorted_sources {
        validate_portable_archive_path(&source.archive_path)?;
        if !names.insert(source.archive_path.to_lowercase()) {
            return Err(format!(
                "В архіві виявлено два файли з однаковим шляхом: {}.",
                source.archive_path
            ));
        }
        archive
            .start_file(
                &source.archive_path,
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
            )
            .map_err(|_| "Не вдалося сформувати архів.".to_string())?;
        let mut input = fs::File::open(&source.source)
            .map_err(|_| format!("Не вдалося прочитати файл {}.", source.source.display()))?;
        let mut hasher = Sha256::new();
        let mut size = 0_u64;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = input
                .read(&mut buffer)
                .map_err(|_| "Не вдалося прочитати файл для архіву.".to_string())?;
            if read == 0 {
                break;
            }
            size = size.saturating_add(read as u64);
            hasher.update(&buffer[..read]);
            archive
                .write_all(&buffer[..read])
                .map_err(|_| "Не вдалося записати архів.".to_string())?;
        }
        manifest_files.push(DataArchiveManifestFile {
            path: source.archive_path,
            size,
            sha256: format!("{:x}", hasher.finalize()),
        });
    }
    let manifest = DataArchiveManifest {
        format: DATA_ARCHIVE_FORMAT.to_string(),
        version: DATA_ARCHIVE_VERSION,
        created_at: Local::now().to_rfc3339(),
        application_version: env!("CARGO_PKG_VERSION").to_string(),
        sections: sections.to_vec(),
        files: manifest_files,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|_| "Не вдалося сформувати опис архіву.".to_string())?;
    archive
        .start_file(
            DATA_ARCHIVE_MANIFEST,
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|_| "Не вдалося додати опис архіву.".to_string())?;
    archive
        .write_all(&manifest_bytes)
        .map_err(|_| "Не вдалося записати опис архіву.".to_string())?;
    let output = archive
        .finish()
        .map_err(|_| "Не вдалося завершити формування архіву.".to_string())?;
    output
        .sync_all()
        .map_err(|_| "Не вдалося синхронізувати архів із диском.".to_string())?;
    Ok(())
}

fn replace_file_atomically(temporary: &Path, destination: &Path) -> Result<(), String> {
    if !destination.exists() {
        return fs::rename(temporary, destination)
            .map_err(|_| "Не вдалося завершити запис архіву.".to_string());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "Не вдалося визначити папку архіву.".to_string())?;
    let backup_directory = create_unique_directory(parent, ".archive-replace")?;
    let previous = backup_directory.join("previous.zip");
    fs::rename(destination, &previous)
        .map_err(|_| "Не вдалося підготувати заміну наявного архіву.".to_string())?;
    if fs::rename(temporary, destination).is_err() {
        let _ = fs::rename(&previous, destination);
        let _ = fs::remove_dir_all(backup_directory);
        return Err("Не вдалося завершити запис архіву; попередній файл відновлено.".to_string());
    }
    let _ = fs::remove_dir_all(backup_directory);
    Ok(())
}

fn write_archive_atomically(
    destination: &Path,
    sources: &[ArchiveSource],
    sections: &[String],
) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Не вдалося визначити папку архіву.".to_string())?;
    fs::create_dir_all(parent).map_err(|_| "Не вдалося створити папку архіву.".to_string())?;
    let work = create_unique_directory(parent, ".archive-export")?;
    let temporary = work.join("archive.zip");
    let result = (|| {
        let output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| "Не вдалося створити тимчасовий архів.".to_string())?;
        write_archive_contents(output, sources, sections)?;
        replace_file_atomically(&temporary, destination)
    })();
    let _ = fs::remove_dir_all(work);
    result
}

fn create_unique_archive(
    directory: &Path,
    base_name: &str,
    sources: &[ArchiveSource],
) -> Result<PathBuf, String> {
    for attempt in 0..1000_u32 {
        let suffix = if attempt == 0 {
            String::new()
        } else {
            format!("-{attempt}")
        };
        let path = directory.join(format!("{base_name}{suffix}.zip"));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(output) => {
                if let Err(error) = write_archive_contents(output, sources, &[]) {
                    let _ = fs::remove_file(&path);
                    return Err(error);
                }
                return Ok(path);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("Не вдалося створити резервний архів.".to_string()),
        }
    }
    Err("Не вдалося підібрати унікальне ім’я резервного архіву.".to_string())
}

#[tauri::command]
pub(crate) fn export_application_data(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    path: String,
    options: DataArchiveOptions,
) -> Result<(), String> {
    write_application_data_archive(&app, state.inner(), &PathBuf::from(path), &options)
}

fn write_application_data_archive(
    app: &tauri::AppHandle,
    state: &AppState,
    destination: &Path,
    options: &DataArchiveOptions,
) -> Result<(), String> {
    let root = ensure_application_structure(app)?;
    write_application_data_archive_from_root(&root, state, destination, options)
}

fn write_application_data_archive_from_root(
    root: &Path,
    state: &AppState,
    destination: &Path,
    options: &DataArchiveOptions,
) -> Result<(), String> {
    let absolute_destination = if destination.is_absolute() {
        destination.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|_| "Не вдалося визначити шлях архіву.".to_string())?
            .join(destination)
    };
    let mut excluded = HashSet::new();
    excluded.insert(absolute_destination);
    let work_directory = create_unique_directory(root, ".application-export")?;
    let result = (|| {
        let mut sources = Vec::new();
        let sections = selected_database_sections(options)?;
        let mut manifest_sections = sections.iter().cloned().collect::<Vec<_>>();
        manifest_sections.sort();
        if options.database || options.excel {
            let snapshot = work_directory.join(DATABASE_FILE_NAME);
            {
                let database = state
                    .0
                    .lock()
                    .map_err(|_| "База даних тимчасово зайнята. Спробуйте ще раз.".to_string())?;
                snapshot_database(&database.connection, &snapshot)?;
            }
            filter_database_snapshot(&snapshot, &sections, options.custom_variables)?;
            if options.database {
                sources.push(ArchiveSource {
                    source: snapshot.clone(),
                    archive_path: format!("data/{DATABASE_FILE_NAME}"),
                });
            }
            if options.excel {
                let excel = work_directory.join("Excel-база.xlsx");
                let connection = Connection::open(&snapshot)
                    .map_err(|_| "Не вдалося відкрити дані для Excel-експорту.".to_string())?;
                crate::personnel_commands::export_personnel_xlsx_from_connection(
                    &connection,
                    &excel,
                )?;
                sources.push(ArchiveSource {
                    source: excel,
                    archive_path: DATA_ARCHIVE_EXCEL_PATH.to_string(),
                });
            }
        }
        if options.settings {
            let source = settings::path(root);
            if source.exists() {
                sources.push(ArchiveSource {
                    source,
                    archive_path: "data/settings.json".to_string(),
                });
            }
        }
        if options.custom_variables {
            let source = root.join(CUSTOM_VARIABLES_FILE_NAME);
            if source.exists() {
                sources.push(ArchiveSource {
                    source,
                    archive_path: "data/custom_variables.json".to_string(),
                });
            }
        }
        if options.templates {
            collect_archive_directory(
                &mut sources,
                &root.join(TEMPLATES_DIRECTORY_NAME),
                "templates",
                &excluded,
            )?;
        }
        if options.reports {
            collect_archive_directory(
                &mut sources,
                &root.join(REPORTS_DIRECTORY_NAME),
                "reports",
                &excluded,
            )?;
        }
        write_archive_atomically(
            destination,
            &sources,
            if options.database {
                &manifest_sections
            } else {
                &[]
            },
        )
    })();
    let _ = fs::remove_dir_all(work_directory);
    result
}

pub(crate) fn create_pre_update_backup(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    let root = ensure_application_structure(&app)?;
    let now = Local::now();
    let directory = root
        .join(BACKUPS_DIRECTORY_NAME)
        .join(now.format("%d.%m.%Y").to_string());
    fs::create_dir_all(&directory)
        .map_err(|_| "Не вдалося створити папку резервних копій.".to_string())?;
    let path = directory.join(format!(
        "Перед оновленням {}.zip",
        now.format("%H-%M-%S%.3f")
    ));
    let options = DataArchiveOptions {
        database: true,
        database_sections: Vec::new(),
        settings: true,
        custom_variables: true,
        templates: true,
        reports: true,
        excel: false,
    };
    write_application_data_archive(&app, state.inner(), &path, &options)?;
    Ok(path.to_string_lossy().to_string())
}

fn import_relative_path(name: &str) -> Option<PathBuf> {
    match name {
        value if value == format!("data/{DATABASE_FILE_NAME}") || value == DATABASE_FILE_NAME => {
            Some(PathBuf::from(DATABASE_FILE_NAME))
        }
        "data/settings.json" => Some(PathBuf::from("settings.json")),
        "data/custom_variables.json" => Some(PathBuf::from(CUSTOM_VARIABLES_FILE_NAME)),
        value if value.starts_with("templates/") && value.len() > "templates/".len() => Some(
            PathBuf::from(TEMPLATES_DIRECTORY_NAME).join(value.trim_start_matches("templates/")),
        ),
        value if value.starts_with("reports/") && value.len() > "reports/".len() => {
            Some(PathBuf::from(REPORTS_DIRECTORY_NAME).join(value.trim_start_matches("reports/")))
        }
        _ => None,
    }
}

fn archive_file_limit(name: &str) -> u64 {
    if name == DATA_ARCHIVE_MANIFEST {
        MAX_ARCHIVE_MANIFEST_SIZE
    } else if name.ends_with(".json") {
        MAX_ARCHIVE_JSON_SIZE
    } else {
        MAX_ARCHIVE_FILE_SIZE
    }
}

fn validate_archive_entry(
    item: &zip::read::ZipFile<'_>,
    total_size: &mut u64,
) -> Result<(), String> {
    validate_portable_archive_path(item.name())?;
    if item
        .unix_mode()
        .is_some_and(|mode| mode & 0o170000 == 0o120000)
    {
        return Err("Архів містить символічне посилання і не може бути імпортований.".to_string());
    }
    let size = item.size();
    if size > archive_file_limit(item.name()) {
        return Err(format!(
            "Файл «{}» в архіві перевищує дозволений розмір.",
            item.name()
        ));
    }
    *total_size = total_size
        .checked_add(size)
        .ok_or_else(|| "Загальний розмір архіву завеликий.".to_string())?;
    if *total_size > MAX_ARCHIVE_TOTAL_SIZE {
        return Err("Розпакований архів перевищує дозволений загальний розмір.".to_string());
    }
    let compressed = item.compressed_size();
    if compressed > 0 && size / compressed.max(1) > MAX_ARCHIVE_COMPRESSION_RATIO {
        return Err(format!(
            "Файл «{}» має підозріло високий коефіцієнт стиснення.",
            item.name()
        ));
    }
    Ok(())
}

fn read_archive_manifest(
    archive: &mut ZipArchive<fs::File>,
) -> Result<Option<DataArchiveManifest>, String> {
    let Some(index) = (0..archive.len()).find(|index| {
        archive
            .by_index(*index)
            .ok()
            .is_some_and(|item| item.name() == DATA_ARCHIVE_MANIFEST)
    }) else {
        return Ok(None);
    };
    let mut item = archive
        .by_index(index)
        .map_err(|_| "Не вдалося прочитати опис архіву.".to_string())?;
    if item.size() > MAX_ARCHIVE_MANIFEST_SIZE {
        return Err("Опис архіву перевищує дозволений розмір.".to_string());
    }
    let mut bytes = Vec::with_capacity(item.size() as usize);
    item.read_to_end(&mut bytes)
        .map_err(|_| "Не вдалося прочитати опис архіву.".to_string())?;
    let manifest: DataArchiveManifest = serde_json::from_slice(&bytes)
        .map_err(|_| "Опис архіву має пошкоджений формат JSON.".to_string())?;
    if manifest.format != DATA_ARCHIVE_FORMAT {
        return Err("Архів створено іншою або непідтримуваною програмою.".to_string());
    }
    if manifest.version == 0 || manifest.version > DATA_ARCHIVE_VERSION {
        return Err(format!(
            "Версія архіву {} новіша за підтримувану версію {}. Оновіть програму.",
            manifest.version, DATA_ARCHIVE_VERSION
        ));
    }
    let supported_sections = DATABASE_ARCHIVE_SECTIONS
        .into_iter()
        .collect::<HashSet<_>>();
    if let Some(unknown) = manifest
        .sections
        .iter()
        .find(|section| !supported_sections.contains(section.as_str()))
    {
        return Err(format!(
            "Архів містить непідтримуваний розділ бази даних: {unknown}."
        ));
    }
    Ok(Some(manifest))
}

fn stage_import_archive(root: &Path, archive_path: &Path) -> Result<StagedImport, String> {
    let file = fs::File::open(archive_path)
        .map_err(|_| "Не вдалося відкрити архів перенесення.".to_string())?;
    let mut archive = ZipArchive::new(file)
        .map_err(|_| "Файл не є коректним архівом перенесення.".to_string())?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err("Архів містить забагато файлів.".to_string());
    }
    let mut total_size = 0_u64;
    let mut archive_names = HashSet::new();
    for index in 0..archive.len() {
        let item = archive
            .by_index(index)
            .map_err(|_| "Не вдалося прочитати архів.".to_string())?;
        validate_archive_entry(&item, &mut total_size)?;
        if !archive_names.insert(item.name().to_lowercase()) {
            return Err(format!("Архів містить дубльований шлях «{}».", item.name()));
        }
    }
    let manifest = read_archive_manifest(&mut archive)?;
    let mut manifest_files = StdHashMap::new();
    if let Some(manifest) = &manifest {
        for file in &manifest.files {
            validate_portable_archive_path(&file.path)?;
            if manifest_files
                .insert(file.path.to_lowercase(), file.clone())
                .is_some()
            {
                return Err(format!("Опис архіву дублює файл «{}».", file.path));
            }
        }
    }
    let directory = create_unique_directory(root, ".application-import")?;
    let result = (|| {
        let mut files = Vec::new();
        let mut imported_paths = HashSet::new();
        let mut verified_manifest_paths = HashSet::new();
        for index in 0..archive.len() {
            let mut item = archive
                .by_index(index)
                .map_err(|_| "Не вдалося прочитати архів.".to_string())?;
            if item.is_dir() || item.name() == DATA_ARCHIVE_MANIFEST {
                continue;
            }
            let archive_name = item.name().to_string();
            let Some(relative_path) = import_relative_path(&archive_name) else {
                continue;
            };
            let normalized_relative = relative_path.to_string_lossy().to_lowercase();
            if !imported_paths.insert(normalized_relative) {
                return Err(format!(
                    "Кілька файлів архіву призначені для одного шляху: {archive_name}."
                ));
            }
            let destination = directory.join(&relative_path);
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .map_err(|_| "Не вдалося створити тимчасову папку імпорту.".to_string())?;
            }
            let mut output = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&destination)
                .map_err(|_| "Не вдалося підготувати файл імпорту.".to_string())?;
            let mut hasher = Sha256::new();
            let mut written = 0_u64;
            let limit = archive_file_limit(&archive_name);
            let mut buffer = [0_u8; 64 * 1024];
            loop {
                let read = item
                    .read(&mut buffer)
                    .map_err(|_| "Не вдалося розпакувати файл з архіву.".to_string())?;
                if read == 0 {
                    break;
                }
                written = written.saturating_add(read as u64);
                if written > limit {
                    return Err(format!(
                        "Файл «{archive_name}» перевищує дозволений розмір."
                    ));
                }
                hasher.update(&buffer[..read]);
                output
                    .write_all(&buffer[..read])
                    .map_err(|_| "Не вдалося записати файл імпорту.".to_string())?;
            }
            output
                .sync_all()
                .map_err(|_| "Не вдалося синхронізувати файл імпорту.".to_string())?;
            if let Some(expected) = manifest_files.get(&archive_name.to_lowercase()) {
                let actual_hash = format!("{:x}", hasher.finalize());
                if expected.size != written || !expected.sha256.eq_ignore_ascii_case(&actual_hash) {
                    return Err(format!(
                        "Контрольна сума файла «{archive_name}» не збігається. Архів пошкоджено або змінено."
                    ));
                }
                verified_manifest_paths.insert(archive_name.to_lowercase());
            } else if manifest.is_some() {
                return Err(format!("Файл «{archive_name}» відсутній в описі архіву."));
            }
            files.push(StagedImportFile {
                relative_path,
                archive_path: archive_name,
            });
        }
        if files.is_empty() {
            return Err("Архів не містить даних, які підтримує ця версія програми.".to_string());
        }
        if manifest.is_some() {
            for expected in manifest_files.values() {
                if import_relative_path(&expected.path).is_some()
                    && !verified_manifest_paths.contains(&expected.path.to_lowercase())
                {
                    return Err(format!(
                        "В архіві відсутній заявлений файл «{}».",
                        expected.path
                    ));
                }
            }
        }
        Ok(StagedImport {
            directory: directory.clone(),
            files,
            legacy_archive: manifest.is_none(),
            manifest,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&directory);
    }
    result
}

fn check_database_integrity(connection: &Connection) -> Result<(), String> {
    let result: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|_| "Не вдалося перевірити цілісність імпортованої бази даних.".to_string())?;
    if !result.eq_ignore_ascii_case("ok") {
        return Err(format!("Імпортована база даних пошкоджена: {result}"));
    }
    Ok(())
}

fn validate_staged_import(staged: &StagedImport) -> Result<(), String> {
    let settings_path = staged.directory.join("settings.json");
    if settings_path.exists() {
        let contents = fs::read_to_string(&settings_path)
            .map_err(|_| "Не вдалося прочитати імпортовані налаштування.".to_string())?;
        serde_json::from_str::<settings::AppSettings>(&contents)
            .map_err(|_| "Імпортовані налаштування мають несумісний формат.".to_string())?;
    }
    if staged.directory.join(CUSTOM_VARIABLES_FILE_NAME).exists() {
        database::load_custom_fields_file(&staged.directory, CUSTOM_VARIABLES_FILE_NAME)
            .map_err(|error| format!("Не вдалося перевірити кастомні поля: {error}"))?;
    }
    let database_path = staged.directory.join(DATABASE_FILE_NAME);
    if database_path.exists() {
        let connection = Connection::open(&database_path)
            .map_err(|_| "Не вдалося відкрити імпортовану базу даних.".to_string())?;
        check_database_integrity(&connection)?;
        database::initialise(&connection)
            .map_err(|error| format!("Не вдалося оновити стару базу даних: {error}"))?;
        crate::operations::sync_crew_equipment_responsibles(&connection, None)
            .map_err(|error| format!("Не вдалося виправити відповідальних за майно: {error}"))?;
        if staged.directory.join(CUSTOM_VARIABLES_FILE_NAME).exists() {
            database::sync_custom_fields_file(
                &connection,
                &staged.directory,
                CUSTOM_VARIABLES_FILE_NAME,
            )?;
        }
        check_database_integrity(&connection)?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn inspect_application_data_archive(
    app: tauri::AppHandle,
    path: String,
) -> Result<DataArchiveInspection, String> {
    let root = ensure_application_structure(&app)?;
    let staged = stage_import_archive(&root, Path::new(&path))?;
    let result = (|| {
        validate_staged_import(&staged)?;
        let database = staged.directory.join(DATABASE_FILE_NAME).exists();
        let database_sections = if database {
            match staged.manifest.as_ref() {
                Some(manifest) if !manifest.sections.is_empty() => manifest.sections.clone(),
                _ => DATABASE_ARCHIVE_SECTIONS
                    .iter()
                    .map(|section| (*section).to_string())
                    .collect(),
            }
        } else {
            Vec::new()
        };
        let contains_path = |path: &str| {
            staged
                .files
                .iter()
                .any(|item| item.archive_path.eq_ignore_ascii_case(path))
        };
        let contains_prefix = |prefix: &str| {
            staged
                .files
                .iter()
                .any(|item| item.archive_path.starts_with(prefix))
        };
        let excel = staged.manifest.as_ref().is_some_and(|manifest| {
            manifest
                .files
                .iter()
                .any(|file| file.path.eq_ignore_ascii_case(DATA_ARCHIVE_EXCEL_PATH))
        });
        let database_custom_variables = if database {
            let connection = Connection::open(staged.directory.join(DATABASE_FILE_NAME))
                .map_err(|_| "Не вдалося перевірити кастомні поля архіву.".to_string())?;
            connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM custom_field_definitions LIMIT 1)
                       OR EXISTS(SELECT 1 FROM vehicle_custom_field_definitions LIMIT 1)",
                    [],
                    |row| row.get::<_, bool>(0),
                )
                .unwrap_or(false)
        } else {
            false
        };
        Ok(DataArchiveInspection {
            application_version: staged
                .manifest
                .as_ref()
                .map(|manifest| manifest.application_version.clone())
                .unwrap_or_else(|| "Стара версія".to_string()),
            database,
            database_sections,
            settings: contains_path("data/settings.json"),
            custom_variables: contains_path("data/custom_variables.json")
                || database_custom_variables,
            templates: contains_prefix("templates/"),
            reports: contains_prefix("reports/"),
            excel,
        })
    })();
    let _ = fs::remove_dir_all(&staged.directory);
    result
}

fn create_pre_import_backup(
    root: &Path,
    database: &DatabaseState,
    staged: &StagedImport,
) -> Result<PathBuf, String> {
    let work = create_unique_directory(root, ".pre-import-backup")?;
    let snapshot = work.join(DATABASE_FILE_NAME);
    let result = (|| {
        snapshot_database(&database.connection, &snapshot)?;
        let mut sources = vec![ArchiveSource {
            source: snapshot,
            archive_path: format!("data/{DATABASE_FILE_NAME}"),
        }];
        let mut names = HashSet::from([format!("data/{DATABASE_FILE_NAME}").to_lowercase()]);
        for item in &staged.files {
            if item.relative_path == Path::new(DATABASE_FILE_NAME) {
                continue;
            }
            let existing = root.join(&item.relative_path);
            if existing.is_file() && names.insert(item.archive_path.to_lowercase()) {
                sources.push(ArchiveSource {
                    source: existing,
                    archive_path: item.archive_path.clone(),
                });
            }
        }
        let now = Local::now();
        let directory = root
            .join(BACKUPS_DIRECTORY_NAME)
            .join(now.format("%d.%m.%Y").to_string());
        fs::create_dir_all(&directory)
            .map_err(|_| "Не вдалося створити папку резервних копій.".to_string())?;
        create_unique_archive(
            &directory,
            &format!(
                "Автоматична копія перед імпортом {}",
                now.format("%H-%M-%S%.3f")
            ),
            &sources,
        )
    })();
    let _ = fs::remove_dir_all(work);
    result
}

fn rollback_installed_files(installed: &[(PathBuf, Option<PathBuf>)]) {
    for (target, previous) in installed.iter().rev() {
        if target.exists() {
            let _ = fs::remove_file(target);
        }
        if let Some(previous) = previous {
            if let Some(parent) = target.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::rename(previous, target);
        }
    }
}

fn install_staged_files(root: &Path, staged: &StagedImport) -> Result<InstalledImport, String> {
    let rollback = create_unique_directory(root, ".import-rollback")?;
    let mut installed = Vec::new();
    let mut files = staged.files.clone();
    files.sort_by_key(|item| item.relative_path == Path::new(DATABASE_FILE_NAME));
    for item in files {
        let source = staged.directory.join(&item.relative_path);
        let target = root.join(&item.relative_path);
        if let Some(parent) = target.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                rollback_installed_files(&installed);
                let _ = fs::remove_dir_all(&rollback);
                return Err(format!("Не вдалося створити папку імпорту: {error}"));
            }
        }
        let previous = if target.exists() {
            if !target.is_file() {
                rollback_installed_files(&installed);
                let _ = fs::remove_dir_all(&rollback);
                return Err(format!("Шлях {} зайнятий папкою.", target.display()));
            }
            let previous = rollback.join(&item.relative_path);
            if let Some(parent) = previous.parent() {
                if fs::create_dir_all(parent).is_err() {
                    rollback_installed_files(&installed);
                    let _ = fs::remove_dir_all(&rollback);
                    return Err("Не вдалося підготувати відкат імпорту.".to_string());
                }
            }
            if fs::rename(&target, &previous).is_err() {
                rollback_installed_files(&installed);
                let _ = fs::remove_dir_all(&rollback);
                return Err(format!(
                    "Не вдалося підготувати заміну файла {}.",
                    target.display()
                ));
            }
            Some(previous)
        } else {
            None
        };
        if fs::rename(&source, &target).is_err() {
            if let Some(previous) = &previous {
                let _ = fs::rename(previous, &target);
            }
            rollback_installed_files(&installed);
            let _ = fs::remove_dir_all(&rollback);
            return Err(format!("Не вдалося встановити файл {}.", target.display()));
        }
        installed.push((target, previous));
    }
    Ok(InstalledImport {
        rollback_directory: rollback,
        files: installed,
    })
}

fn import_table_columns(
    connection: &Connection,
    schema: &str,
    table: &str,
) -> Result<Vec<String>, String> {
    if !schema
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '_')
        || !table
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        return Err("Некоректна назва таблиці в архіві.".to_string());
    }
    let mut statement = connection
        .prepare(&format!("PRAGMA {schema}.table_info({table})"))
        .map_err(|error| format!("Не вдалося перевірити структуру таблиці «{table}»: {error}"))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("Не вдалося прочитати структуру таблиці «{table}»: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Не вдалося прочитати поля таблиці «{table}»: {error}"))
}

fn quote_import_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn replace_import_tables(connection: &Connection, tables: &[&str]) -> Result<(), String> {
    for table in tables {
        let current_columns = import_table_columns(connection, "main", table)?;
        let imported_columns = import_table_columns(connection, "imported", table)?;
        if imported_columns.is_empty() {
            return Err(format!("В архіві немає таблиці «{table}»."));
        }
        let imported_columns = imported_columns.into_iter().collect::<HashSet<_>>();
        let shared_columns = current_columns
            .into_iter()
            .filter(|column| imported_columns.contains(column))
            .collect::<Vec<_>>();
        if shared_columns.is_empty() {
            return Err(format!("Таблиця «{table}» в архіві не має сумісних полів."));
        }
        let columns = shared_columns
            .iter()
            .map(|column| quote_import_identifier(column))
            .collect::<Vec<_>>()
            .join(", ");
        connection
            .execute_batch(&format!(
                "DELETE FROM main.{table};\n\
                 INSERT INTO main.{table} ({columns}) SELECT {columns} FROM imported.{table};"
            ))
            .map_err(|error| format!("Не вдалося імпортувати розділ «{table}»: {error}"))?;
    }
    Ok(())
}

fn selected_import_sections(
    staged: &StagedImport,
    options: &DataImportOptions,
) -> Result<HashSet<String>, String> {
    if !options.database || !staged.directory.join(DATABASE_FILE_NAME).exists() {
        return Ok(HashSet::new());
    }
    let available = match staged.manifest.as_ref() {
        Some(manifest) if !manifest.sections.is_empty() => {
            manifest.sections.iter().cloned().collect::<HashSet<_>>()
        }
        _ => DATABASE_ARCHIVE_SECTIONS
            .iter()
            .map(|section| (*section).to_string())
            .collect(),
    };
    let requested = if options.database_sections.is_empty() {
        available.clone()
    } else {
        options.database_sections.iter().cloned().collect()
    };
    if let Some(unavailable) = requested
        .iter()
        .find(|section| !available.contains(*section))
    {
        return Err(format!("В обраному архіві немає розділу «{unavailable}»."));
    }
    Ok(requested)
}

fn service_filter(sections: &HashSet<String>) -> String {
    let values = SERVICE_ARCHIVE_SECTIONS
        .iter()
        .filter(|section| sections.contains(**section))
        .map(|section| format!("'{section}'"))
        .collect::<Vec<_>>();
    if values.is_empty() {
        "''".to_string()
    } else {
        values.join(",")
    }
}

fn merge_selected_database_sections(
    current: &Connection,
    staged: &StagedImport,
    sections: &HashSet<String>,
    include_custom_variables: bool,
) -> Result<(), String> {
    let source = staged.directory.join(DATABASE_FILE_NAME);
    let merged = staged.directory.join("selected-import.db");
    snapshot_database(current, &merged)?;
    let connection = Connection::open(&merged)
        .map_err(|_| "Не вдалося підготувати вибірковий імпорт бази даних.".to_string())?;
    database::initialise(&connection)?;
    connection
        .execute(
            "ATTACH DATABASE ?1 AS imported",
            [source.to_string_lossy().as_ref()],
        )
        .map_err(|_| "Не вдалося підключити дані з архіву для вибіркового імпорту.".to_string())?;

    connection
        .execute_batch("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;")
        .map_err(|_| "Не вдалося розпочати вибірковий імпорт.".to_string())?;
    let result = (|| {
        if sections.contains("personnel") {
            replace_import_tables(
                &connection,
                &[
                    "personnel_custom_fields",
                    "temporary_personnel",
                    "personnel",
                ],
            )?;
        }
        if sections.contains("staffing") {
            replace_import_tables(
                &connection,
                &[
                    "personnel_staff_assignments",
                    "staff_recommendations",
                    "staff_position_recommendations",
                ],
            )?;
        }
        if sections.contains("crews") {
            replace_import_tables(
                &connection,
                &["crew_actual_members", "crew_members", "crews"],
            )?;
        }
        if sections.contains("positions") {
            replace_import_tables(
                &connection,
                &[
                    "position_uavs",
                    "position_work_periods",
                    "position_work_members",
                    "position_work_status_history",
                    "position_work_events",
                    "position_work",
                    "positions",
                ],
            )?;
        }
        if sections.contains("personnel_control") {
            replace_import_tables(
                &connection,
                &["personnel_control_events", "personnel_control_assignments"],
            )?;
        }
        if sections.contains("flight_plans") {
            replace_import_tables(
                &connection,
                &[
                    "flight_plan_personnel_locations",
                    "flight_plan_snapshot_entries",
                    "flight_plan_snapshots",
                ],
            )?;
        }
        if sections.contains("flight_journal") {
            replace_import_tables(&connection, &["flight_journal_entries"])?;
        }
        if sections.contains("summary_reports") {
            replace_import_tables(&connection, &["summary_report_drafts"])?;
        }
        if sections.contains("incidents") {
            connection
                .execute("UPDATE asset_write_offs SET incident_id=NULL", [])
                .map_err(|_| {
                    "Не вдалося від’єднати старі записи списання від інцидентів.".to_string()
                })?;
            replace_import_tables(
                &connection,
                &["incident_equipment", "incident_personnel", "incidents"],
            )?;
        }
        if sections.contains("workshop") {
            replace_import_tables(&connection, &["workshop_ingredients", "workshop_products"])?;
        }
        if sections.contains("deadlines") {
            replace_import_tables(&connection, &["deadline_reminders"])?;
        }

        let service_codes = service_filter(sections);
        if service_codes != "''" {
            for (table, column) in [
                ("asset_catalogs", "id"),
                ("equipment", "id"),
                ("asset_history", "id"),
            ] {
                let conflicts: i64 = connection
                    .query_row(
                        &format!(
                            "SELECT COUNT(*) FROM imported.{table} incoming
                             JOIN main.{table} existing ON existing.{column}=incoming.{column}
                             WHERE incoming.service_code IN ({service_codes})
                               AND existing.service_code NOT IN ({service_codes})"
                        ),
                        [],
                        |row| row.get(0),
                    )
                    .map_err(|_| "Не вдалося перевірити ідентифікатори майна.".to_string())?;
                if conflicts > 0 {
                    return Err("Вибрані служби мають конфлікт ідентифікаторів з іншим локальним майном. Імпортуйте весь розділ майна одним архівом.".to_string());
                }
            }
            connection
                .execute_batch(&format!(
                    "DELETE FROM asset_custom_values
                       WHERE equipment_id IN (SELECT id FROM equipment WHERE service_code IN ({service_codes}))
                          OR field_id IN (SELECT f.id FROM asset_catalog_fields f JOIN asset_catalogs c ON c.id=f.catalog_id WHERE c.service_code IN ({service_codes}));
                     DELETE FROM asset_catalog_fields WHERE catalog_id IN (SELECT id FROM asset_catalogs WHERE service_code IN ({service_codes}));
                     DELETE FROM asset_history WHERE service_code IN ({service_codes});
                     DELETE FROM equipment WHERE service_code IN ({service_codes});
                     DELETE FROM asset_catalogs WHERE service_code IN ({service_codes});
                     INSERT INTO asset_catalogs SELECT * FROM imported.asset_catalogs WHERE service_code IN ({service_codes});
                     INSERT INTO asset_catalog_fields SELECT f.* FROM imported.asset_catalog_fields f JOIN imported.asset_catalogs c ON c.id=f.catalog_id WHERE c.service_code IN ({service_codes});
                     INSERT INTO equipment SELECT * FROM imported.equipment WHERE service_code IN ({service_codes});
                     INSERT INTO asset_custom_values SELECT v.* FROM imported.asset_custom_values v JOIN imported.equipment e ON e.id=v.equipment_id WHERE e.service_code IN ({service_codes});
                     INSERT INTO asset_history SELECT * FROM imported.asset_history WHERE service_code IN ({service_codes});"
                ))
                .map_err(|error| format!("Не вдалося імпортувати майно вибраних служб: {error}"))?;
        }

        if sections.contains("svt") {
            connection
                .execute_batch(
                    "UPDATE equipment SET legacy_vehicle_id=NULL WHERE service_code<>'svt';
                 DELETE FROM vehicle_custom_fields;
                 DELETE FROM vehicles;
                 INSERT INTO vehicles SELECT * FROM imported.vehicles;
                 INSERT INTO vehicle_custom_fields SELECT * FROM imported.vehicle_custom_fields;",
                )
                .map_err(|error| format!("Не вдалося імпортувати техніку СВТ: {error}"))?;
        }
        if include_custom_variables {
            replace_import_tables(
                &connection,
                &[
                    "custom_field_template_aliases",
                    "custom_field_definitions",
                    "vehicle_custom_field_definitions",
                ],
            )?;
        }

        connection.execute_batch(
            "DELETE FROM personnel_custom_fields WHERE personnel_id NOT IN (SELECT id FROM personnel);
             DELETE FROM personnel_staff_assignments WHERE personnel_id NOT IN (SELECT id FROM personnel);
             DELETE FROM staff_recommendations WHERE personnel_id NOT IN (SELECT id FROM personnel);
             DELETE FROM crew_members WHERE crew_id NOT IN (SELECT id FROM crews) OR personnel_id NOT IN (SELECT id FROM personnel);
             DELETE FROM crew_actual_members WHERE crew_id NOT IN (SELECT id FROM crews) OR personnel_id NOT IN (SELECT id FROM personnel);
             DELETE FROM personnel_control_assignments WHERE personnel_id NOT IN (SELECT id FROM personnel);
             UPDATE personnel_control_events SET assignment_id=NULL WHERE assignment_id IS NOT NULL AND assignment_id NOT IN (SELECT id FROM personnel_control_assignments);
             DELETE FROM flight_plan_personnel_locations WHERE personnel_id NOT IN (SELECT id FROM personnel);
             DELETE FROM position_work_members WHERE work_id NOT IN (SELECT id FROM position_work) OR personnel_id NOT IN (SELECT id FROM personnel);
             DELETE FROM position_work_periods WHERE work_id NOT IN (SELECT id FROM position_work) OR personnel_id NOT IN (SELECT id FROM personnel);
             DELETE FROM position_work_status_history WHERE work_id NOT IN (SELECT id FROM position_work);
             DELETE FROM position_uavs WHERE position_id NOT IN (SELECT id FROM positions) OR equipment_id NOT IN (SELECT id FROM equipment);
             DELETE FROM asset_catalog_fields WHERE catalog_id NOT IN (SELECT id FROM asset_catalogs);
             DELETE FROM asset_custom_values WHERE equipment_id NOT IN (SELECT id FROM equipment) OR field_id NOT IN (SELECT id FROM asset_catalog_fields);
             DELETE FROM incident_equipment WHERE incident_id NOT IN (SELECT id FROM incidents) OR equipment_id NOT IN (SELECT id FROM equipment);
             DELETE FROM incident_personnel WHERE incident_id NOT IN (SELECT id FROM incidents) OR personnel_id NOT IN (SELECT id FROM personnel);
             DELETE FROM workshop_ingredients WHERE product_id NOT IN (SELECT id FROM workshop_products) OR equipment_id NOT IN (SELECT id FROM equipment);
             DELETE FROM flight_plan_snapshot_entries WHERE snapshot_id NOT IN (SELECT id FROM flight_plan_snapshots);
             UPDATE vehicles SET personnel_id=NULL WHERE personnel_id NOT IN (SELECT id FROM personnel);
             UPDATE vehicles SET crew_id=NULL WHERE crew_id NOT IN (SELECT id FROM crews);
             UPDATE equipment SET personnel_id=NULL WHERE personnel_id NOT IN (SELECT id FROM personnel);
             UPDATE equipment SET crew_id=NULL WHERE crew_id NOT IN (SELECT id FROM crews);
             UPDATE equipment SET catalog_id=NULL WHERE catalog_id NOT IN (SELECT id FROM asset_catalogs);
             UPDATE equipment SET parent_equipment_id=NULL WHERE parent_equipment_id NOT IN (SELECT id FROM equipment);
             UPDATE equipment SET legacy_vehicle_id=NULL WHERE legacy_vehicle_id NOT IN (SELECT id FROM vehicles);
             UPDATE asset_history SET equipment_id=NULL WHERE equipment_id NOT IN (SELECT id FROM equipment);
             UPDATE asset_history SET from_personnel_id=NULL WHERE from_personnel_id NOT IN (SELECT id FROM personnel);
             UPDATE asset_history SET to_personnel_id=NULL WHERE to_personnel_id NOT IN (SELECT id FROM personnel);
             UPDATE asset_history SET from_crew_id=NULL WHERE from_crew_id NOT IN (SELECT id FROM crews);
             UPDATE asset_history SET to_crew_id=NULL WHERE to_crew_id NOT IN (SELECT id FROM crews);
             UPDATE crews SET position_id=NULL WHERE position_id NOT IN (SELECT id FROM positions);
             UPDATE crews SET primary_uav_id=NULL WHERE primary_uav_id NOT IN (SELECT id FROM equipment);
             UPDATE positions SET crew_id=NULL WHERE crew_id NOT IN (SELECT id FROM crews);
             UPDATE position_work SET position_id=NULL WHERE position_id NOT IN (SELECT id FROM positions);
             UPDATE incidents SET crew_id=NULL WHERE crew_id NOT IN (SELECT id FROM crews);
             UPDATE incidents SET equipment_id=NULL WHERE equipment_id NOT IN (SELECT id FROM equipment);
             UPDATE flight_plan_snapshot_entries SET crew_id=NULL WHERE crew_id NOT IN (SELECT id FROM crews);
             UPDATE flight_journal_entries SET crew_id=NULL WHERE crew_id NOT IN (SELECT id FROM crews);
             UPDATE flight_journal_entries SET position_id=NULL WHERE position_id NOT IN (SELECT id FROM positions);
             UPDATE flight_journal_entries SET uav_id=NULL WHERE uav_id NOT IN (SELECT id FROM equipment);
             UPDATE flight_journal_entries SET snapshot_id=NULL WHERE snapshot_id NOT IN (SELECT id FROM flight_plan_snapshots);",
        ).map_err(|error| format!("Не вдалося узгодити зв’язки вибіркового імпорту: {error}"))?;
        connection
            .execute_batch("COMMIT;")
            .map_err(|_| "Не вдалося завершити вибірковий імпорт бази даних.".to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = connection.execute_batch("ROLLBACK;");
    }
    let _ = connection.execute_batch("PRAGMA foreign_keys=ON;");
    result?;
    database::initialise(&connection)?;
    crate::operations::sync_crew_equipment_responsibles(&connection, None)?;
    check_database_integrity(&connection)?;
    let violations: i64 = connection
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .map_err(|_| "Не вдалося перевірити зв’язки вибірково імпортованих даних.".to_string())?;
    if violations > 0 {
        return Err("Вибрані частини архіву мають несумісні зв’язки. Додайте пов’язані розділи або імпортуйте весь архів.".to_string());
    }
    drop(connection);
    fs::remove_file(&source)
        .map_err(|_| "Не вдалося замінити підготовлену базу даних.".to_string())?;
    fs::rename(&merged, &source)
        .map_err(|_| "Не вдалося завершити підготовку вибіркового імпорту.".to_string())?;
    Ok(())
}

fn apply_import_options(
    staged: &mut StagedImport,
    current: &Connection,
    options: &DataImportOptions,
) -> Result<(), String> {
    let sections = selected_import_sections(staged, options)?;
    let imports_database = options.database
        && staged.directory.join(DATABASE_FILE_NAME).exists()
        && !sections.is_empty();
    if imports_database {
        filter_database_snapshot(
            &staged.directory.join(DATABASE_FILE_NAME),
            &sections,
            options.custom_variables,
        )?;
        if sections.len() < DATABASE_ARCHIVE_SECTIONS.len() {
            merge_selected_database_sections(current, staged, &sections, options.custom_variables)?;
        }
    }
    staged.files.retain(|item| {
        if item.relative_path == Path::new(DATABASE_FILE_NAME) {
            imports_database
        } else if item.relative_path == Path::new("settings.json") {
            options.settings
        } else if item.relative_path == Path::new(CUSTOM_VARIABLES_FILE_NAME) {
            options.custom_variables
        } else if item.relative_path.starts_with(TEMPLATES_DIRECTORY_NAME) {
            options.templates
        } else if item.relative_path.starts_with(REPORTS_DIRECTORY_NAME) {
            options.reports
        } else {
            false
        }
    });
    if staged.files.is_empty() {
        return Err("Оберіть хоча б один доступний розділ для імпорту.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn import_application_data(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    path: String,
    options: Option<DataImportOptions>,
) -> Result<(), String> {
    let root = ensure_application_structure(&app)?;
    let mut staged = stage_import_archive(&root, Path::new(&path))?;
    let result = (|| {
        validate_staged_import(&staged)?;
        let options = options.unwrap_or(DataImportOptions {
            database: true,
            database_sections: Vec::new(),
            settings: true,
            custom_variables: true,
            templates: true,
            reports: true,
        });
        {
            let database = state
                .0
                .lock()
                .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
            apply_import_options(&mut staged, &database.connection, &options)?;
        }
        let imports_database = staged
            .files
            .iter()
            .any(|item| item.relative_path == Path::new(DATABASE_FILE_NAME));
        let imports_custom_fields = staged
            .files
            .iter()
            .any(|item| item.relative_path == Path::new(CUSTOM_VARIABLES_FILE_NAME));
        let mut database = state
            .0
            .lock()
            .map_err(|_| "База даних тимчасово зайнята.".to_string())?;
        let _backup_path = create_pre_import_backup(&root, &database, &staged)?;

        if imports_database {
            let placeholder = Connection::open_in_memory()
                .map_err(|_| "Не вдалося підготувати безпечну заміну бази даних.".to_string())?;
            database::initialise(&placeholder)?;
            let previous_was_persistent = database.is_persistent;
            let old = std::mem::replace(&mut database.connection, placeholder);
            drop(old);
            let installed = match install_staged_files(&root, &staged) {
                Ok(result) => result,
                Err(error) => {
                    database.connection = if previous_was_persistent && database.path.exists() {
                        Connection::open(&database.path).map_err(|_| {
                            "Імпорт не виконано, а попередню базу не вдалося відкрити.".to_string()
                        })?
                    } else {
                        Connection::open_in_memory()
                            .map_err(|_| "Не вдалося відновити тимчасову базу даних.".to_string())?
                    };
                    database::initialise(&database.connection)?;
                    return Err(error);
                }
            };
            let open_result = (|| {
                let connection = Connection::open(&database.path)
                    .map_err(|_| "Не вдалося відкрити імпортовану базу даних.".to_string())?;
                database::initialise(&connection)?;
                crate::operations::sync_crew_equipment_responsibles(&connection, None)?;
                check_database_integrity(&connection)?;
                if imports_custom_fields {
                    database::sync_custom_fields_file(
                        &connection,
                        &root,
                        CUSTOM_VARIABLES_FILE_NAME,
                    )?;
                }
                Ok(connection)
            })();
            match open_result {
                Ok(connection) => {
                    database.connection = connection;
                    database.is_persistent = true;
                    let _ = fs::remove_dir_all(installed.rollback_directory);
                }
                Err(error) => {
                    rollback_installed_files(&installed.files);
                    let _ = fs::remove_dir_all(installed.rollback_directory);
                    database.connection = if previous_was_persistent && database.path.exists() {
                        Connection::open(&database.path).map_err(|_| {
                            "Імпорт скасовано, але попередню базу не вдалося відкрити.".to_string()
                        })?
                    } else {
                        Connection::open_in_memory()
                            .map_err(|_| "Не вдалося відновити тимчасову базу даних.".to_string())?
                    };
                    database::initialise(&database.connection)?;
                    database.is_persistent = previous_was_persistent;
                    return Err(error);
                }
            }
        } else if imports_custom_fields {
            let transaction = database.connection.transaction().map_err(|_| {
                "Не вдалося розпочати безпечний імпорт кастомних полів.".to_string()
            })?;
            database::sync_custom_fields_file(
                &transaction,
                &staged.directory,
                CUSTOM_VARIABLES_FILE_NAME,
            )?;
            let installed = install_staged_files(&root, &staged)?;
            if transaction.commit().is_err() {
                rollback_installed_files(&installed.files);
                let _ = fs::remove_dir_all(installed.rollback_directory);
                return Err(
                    "Не вдалося завершити імпорт кастомних полів; зміни скасовано.".to_string(),
                );
            }
            let _ = fs::remove_dir_all(installed.rollback_directory);
        } else {
            let installed = install_staged_files(&root, &staged)?;
            let _ = fs::remove_dir_all(installed.rollback_directory);
        }
        Ok(())
    })();
    let _ = fs::remove_dir_all(&staged.directory);
    result.map_err(|error| {
        if staged.legacy_archive {
            format!("Не вдалося імпортувати старий архів: {error}")
        } else {
            error
        }
    })
}

fn generated_report_manifest_path(docx_path: &Path) -> Option<PathBuf> {
    let mut file_name = docx_path.file_name()?.to_os_string();
    file_name.push(".manifest.json");
    Some(docx_path.with_file_name(file_name))
}

fn read_generated_report_manifest(docx_path: &Path) -> Option<GeneratedReportManifest> {
    let path = generated_report_manifest_path(docx_path)?;
    let metadata = fs::metadata(&path).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_ARCHIVE_JSON_SIZE {
        return None;
    }
    let contents = fs::read_to_string(path).ok()?;
    let manifest: GeneratedReportManifest = serde_json::from_str(&contents).ok()?;
    (manifest.format_version == 1).then_some(manifest)
}

fn current_template_names(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let directory = templates_directory(app)?;
    let mut names = fs::read_dir(directory)
        .map_err(|_| "Не вдалося відкрити папку шаблонів.".to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            path.extension()
                .and_then(|value| value.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("docx"))
                .then(|| path.file_stem()?.to_str().map(str::to_string))?
        })
        .collect::<Vec<_>>();
    names.sort();
    Ok(names)
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
    let template_names = current_template_names(&app)?;
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
            let manifest = read_generated_report_manifest(&docx_path);
            let template = manifest
                .as_ref()
                .map(|manifest| manifest.template.name.trim())
                .filter(|name| !name.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| {
                    template_names
                        .iter()
                        .filter(|template| name.starts_with(template.as_str()))
                        .max_by_key(|template| template.len())
                        .cloned()
                        .unwrap_or_else(|| name.clone())
                });
            let modified = fs::metadata(&docx_path)
                .ok()
                .and_then(|metadata| metadata.modified().ok());
            let local_modified = modified.map(DateTime::<Local>::from);
            let manifest_generated_at = manifest
                .as_ref()
                .and_then(|manifest| DateTime::parse_from_rfc3339(&manifest.generated_at).ok())
                .map(|value| value.with_timezone(&Local));
            let effective_generated_at = manifest_generated_at.as_ref().or(local_modified.as_ref());
            if minimum_date.is_some_and(|minimum| {
                effective_generated_at.is_some_and(|value| value.date_naive() < minimum)
            }) {
                continue;
            }
            let generated_at = effective_generated_at
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
            let order = effective_generated_at
                .map(DateTime::timestamp_millis)
                .unwrap_or_else(|| {
                    modified
                        .unwrap_or(UNIX_EPOCH)
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64
                });
            reports.push((order, report));
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

#[cfg(test)]
mod archive_tests {
    use super::*;

    fn test_directory(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "shablonizator-{label}-{}-{}",
            std::process::id(),
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn write_raw_archive(path: &Path, entries: &[(&str, &[u8])]) {
        let output = fs::File::create(path).unwrap();
        let mut archive = ZipWriter::new(output);
        for (name, bytes) in entries {
            archive
                .start_file(
                    *name,
                    SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
                )
                .unwrap();
            archive.write_all(bytes).unwrap();
        }
        archive.finish().unwrap();
    }

    #[test]
    fn generated_transfer_archive_contains_verified_manifest() {
        let root = test_directory("archive-manifest");
        let source = root.join("settings.json");
        fs::write(&source, br#"{"example":true}"#).unwrap();
        let archive_path = root.join("transfer.zip");
        write_archive_atomically(
            &archive_path,
            &[ArchiveSource {
                source,
                archive_path: "data/settings.json".into(),
            }],
            &[],
        )
        .unwrap();

        let file = fs::File::open(&archive_path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let manifest = read_archive_manifest(&mut archive).unwrap().unwrap();
        assert_eq!(manifest.format, DATA_ARCHIVE_FORMAT);
        assert_eq!(manifest.version, DATA_ARCHIVE_VERSION);
        assert_eq!(manifest.files.len(), 1);
        assert_eq!(manifest.files[0].path, "data/settings.json");
        assert_eq!(manifest.files[0].size, 16);
        assert_eq!(manifest.files[0].sha256.len(), 64);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn pre_update_archive_contains_every_user_data_category() {
        let root = test_directory("pre-update-full");
        fs::create_dir_all(root.join(TEMPLATES_DIRECTORY_NAME)).unwrap();
        fs::create_dir_all(root.join(REPORTS_DIRECTORY_NAME).join("25.09.2026")).unwrap();
        fs::write(root.join("settings.json"), br#"{"unit":{}}"#).unwrap();
        fs::write(root.join(CUSTOM_VARIABLES_FILE_NAME), b"[]").unwrap();
        fs::write(
            root.join(TEMPLATES_DIRECTORY_NAME).join("template.docx"),
            b"docx",
        )
        .unwrap();
        fs::write(
            root.join(REPORTS_DIRECTORY_NAME)
                .join("25.09.2026")
                .join("report.docx"),
            b"report",
        )
        .unwrap();
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute("CREATE TABLE sample(id INTEGER)", [])
            .unwrap();
        let state = AppState(
            Mutex::new(DatabaseState {
                connection,
                path: root.join(DATABASE_FILE_NAME),
                is_persistent: false,
            }),
            Vec::new(),
        );
        let archive_path = root.join("before-update.zip");
        write_application_data_archive_from_root(
            &root,
            &state,
            &archive_path,
            &DataArchiveOptions {
                database: true,
                settings: true,
                custom_variables: true,
                templates: true,
                reports: true,
                ..Default::default()
            },
        )
        .unwrap();

        let file = fs::File::open(&archive_path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        for expected in [
            format!("data/{DATABASE_FILE_NAME}"),
            "data/settings.json".into(),
            "data/custom_variables.json".into(),
            "templates/template.docx".into(),
            "reports/25.09.2026/report.docx".into(),
        ] {
            assert!(archive.by_name(&expected).is_ok(), "missing {expected}");
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn selective_export_filters_database_and_embeds_excel_copy() {
        let root = test_directory("selective-export");
        let connection = Connection::open_in_memory().unwrap();
        database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(rank,surname,given_name,position,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES('солдат','Тестовий','Боєць','оператор','','','','','','','')", []).unwrap();
        connection.execute("INSERT INTO summary_report_drafts(report_date,manual_json) VALUES('2026-09-27','{}')", []).unwrap();
        let state = AppState(
            Mutex::new(DatabaseState {
                connection,
                path: root.join(DATABASE_FILE_NAME),
                is_persistent: false,
            }),
            Vec::new(),
        );
        let archive_path = root.join("personnel.zip");
        write_application_data_archive_from_root(
            &root,
            &state,
            &archive_path,
            &DataArchiveOptions {
                database: true,
                database_sections: vec!["personnel".to_string()],
                excel: true,
                ..Default::default()
            },
        )
        .unwrap();

        let file = fs::File::open(&archive_path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();
        let manifest = read_archive_manifest(&mut archive).unwrap().unwrap();
        assert_eq!(manifest.sections, vec!["personnel"]);
        assert!(archive.by_name(DATA_ARCHIVE_EXCEL_PATH).is_ok());
        let extracted = root.join("filtered.db");
        let mut database_file = archive
            .by_name(&format!("data/{DATABASE_FILE_NAME}"))
            .unwrap();
        let mut output = fs::File::create(&extracted).unwrap();
        io::copy(&mut database_file, &mut output).unwrap();
        drop(database_file);
        drop(archive);
        let filtered = Connection::open(extracted).unwrap();
        assert_eq!(
            filtered
                .query_row("SELECT COUNT(*) FROM personnel", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            filtered
                .query_row("SELECT COUNT(*) FROM summary_report_drafts", [], |row| row
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
            0
        );
        drop(filtered);
        drop(output);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn selective_asset_export_clears_a_responsible_person_that_is_not_exported() {
        let root = test_directory("selective-asset-missing-person");
        let database_path = root.join(DATABASE_FILE_NAME);
        let connection = Connection::open(&database_path).unwrap();
        database::initialise(&connection).unwrap();
        connection.execute("INSERT INTO personnel(id,rank,surname,given_name,position,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(1,'солдат','Тестовий','Боєць','оператор','','','','','','','')", []).unwrap();
        connection.execute("INSERT INTO equipment(category,name,service_code,personnel_id) VALUES('communications','Тестове майно','ovtm',1)", []).unwrap();
        drop(connection);

        filter_database_snapshot(&database_path, &HashSet::from(["ovtm".to_string()]), false)
            .unwrap();

        let filtered = Connection::open(&database_path).unwrap();
        assert_eq!(
            filtered
                .query_row("SELECT COUNT(*) FROM personnel", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            filtered
                .query_row(
                    "SELECT COUNT(*) FROM equipment WHERE service_code='ovtm'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );
        let responsible: Option<i64> = filtered
            .query_row(
                "SELECT personnel_id FROM equipment WHERE service_code='ovtm'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(responsible, None);
        let violations: i64 = filtered
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(violations, 0);
        drop(filtered);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn staged_import_rejects_path_traversal_before_writing_files() {
        let root = test_directory("archive-traversal");
        let archive_path = root.join("unsafe.zip");
        write_raw_archive(&archive_path, &[("../settings.json", b"{}")]);

        let result = stage_import_archive(&root, &archive_path);
        assert!(result.is_err());
        assert!(!root.parent().unwrap().join("settings.json").exists());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn staged_import_rejects_manifest_checksum_mismatch() {
        let root = test_directory("archive-checksum");
        let archive_path = root.join("tampered.zip");
        let manifest = serde_json::to_vec(&DataArchiveManifest {
            format: DATA_ARCHIVE_FORMAT.into(),
            version: DATA_ARCHIVE_VERSION,
            created_at: Local::now().to_rfc3339(),
            application_version: env!("CARGO_PKG_VERSION").into(),
            sections: Vec::new(),
            files: vec![DataArchiveManifestFile {
                path: "data/settings.json".into(),
                size: 2,
                sha256: "0".repeat(64),
            }],
        })
        .unwrap();
        write_raw_archive(
            &archive_path,
            &[
                ("data/settings.json", b"{}"),
                (DATA_ARCHIVE_MANIFEST, &manifest),
            ],
        );

        let error = stage_import_archive(&root, &archive_path).unwrap_err();
        assert!(error.contains("Контрольна сума"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_database_backup_is_accepted_and_migrated_in_staging() {
        let root = test_directory("legacy-archive");
        let source_database = root.join("source.db");
        {
            let connection = Connection::open(&source_database).unwrap();
            database::initialise(&connection).unwrap();
            connection
                .execute_batch("DROP TABLE crew_actual_members;")
                .unwrap();
        }
        let archive_path = root.join("legacy.zip");
        let bytes = fs::read(&source_database).unwrap();
        write_raw_archive(&archive_path, &[(DATABASE_FILE_NAME, &bytes)]);

        let staged = stage_import_archive(&root, &archive_path).unwrap();
        assert!(staged.legacy_archive);
        validate_staged_import(&staged).unwrap();
        let migrated = Connection::open(staged.directory.join(DATABASE_FILE_NAME)).unwrap();
        let table_exists: i64 = migrated
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='crew_actual_members')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_exists, 1);
        drop(migrated);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn archive_collection_excludes_the_destination_file() {
        let root = test_directory("archive-self-exclusion");
        let reports = root.join(REPORTS_DIRECTORY_NAME);
        fs::create_dir_all(&reports).unwrap();
        let destination = reports.join("transfer.zip");
        let report = reports.join("report.docx");
        fs::write(&destination, b"old archive").unwrap();
        fs::write(&report, b"docx").unwrap();
        let mut sources = Vec::new();
        collect_archive_directory(
            &mut sources,
            &reports,
            "reports",
            &HashSet::from([destination]),
        )
        .unwrap();
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].source, report);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_staged_install_restores_every_already_replaced_file() {
        let root = test_directory("import-rollback");
        let stage = test_directory("import-rollback-stage");
        fs::write(root.join("settings.json"), b"old settings").unwrap();
        fs::write(stage.join("settings.json"), b"new settings").unwrap();
        fs::create_dir_all(root.join("blocked.json")).unwrap();
        fs::write(stage.join("blocked.json"), b"cannot replace a directory").unwrap();
        let staged = StagedImport {
            directory: stage.clone(),
            files: vec![
                StagedImportFile {
                    relative_path: PathBuf::from("settings.json"),
                    archive_path: "data/settings.json".into(),
                },
                StagedImportFile {
                    relative_path: PathBuf::from("blocked.json"),
                    archive_path: "data/blocked.json".into(),
                },
            ],
            legacy_archive: true,
            manifest: None,
        };

        assert!(install_staged_files(&root, &staged).is_err());
        assert_eq!(
            fs::read(root.join("settings.json")).unwrap(),
            b"old settings"
        );
        assert!(root.join("blocked.json").is_dir());

        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(stage).unwrap();
    }

    #[test]
    fn selective_personnel_import_preserves_unselected_summary_reports() {
        let root = test_directory("selective-personnel-import");
        let stage = test_directory("selective-personnel-stage");
        let current = Connection::open_in_memory().unwrap();
        database::initialise(&current).unwrap();
        current.execute("INSERT INTO personnel(rank,surname,given_name,position,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES('солдат','Старий','Боєць','оператор','','','','','','','')", []).unwrap();
        current.execute("INSERT INTO summary_report_drafts(report_date,manual_json) VALUES('2026-09-27','{\"local\":true}')", []).unwrap();

        let source = stage.join(DATABASE_FILE_NAME);
        let imported = Connection::open(&source).unwrap();
        database::initialise(&imported).unwrap();
        imported.execute("INSERT INTO personnel(rank,surname,given_name,position,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES('сержант','Новий','Боєць','командир','','','','','','','')", []).unwrap();
        drop(imported);

        let staged = StagedImport {
            directory: stage.clone(),
            files: vec![StagedImportFile {
                relative_path: PathBuf::from(DATABASE_FILE_NAME),
                archive_path: format!("data/{DATABASE_FILE_NAME}"),
            }],
            legacy_archive: false,
            manifest: None,
        };
        merge_selected_database_sections(
            &current,
            &staged,
            &HashSet::from(["personnel".to_string()]),
            false,
        )
        .unwrap();

        let merged = Connection::open(stage.join(DATABASE_FILE_NAME)).unwrap();
        let surname: String = merged
            .query_row("SELECT surname FROM personnel", [], |row| row.get(0))
            .unwrap();
        let report_count: i64 = merged
            .query_row("SELECT COUNT(*) FROM summary_report_drafts", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(surname, "Новий");
        assert_eq!(report_count, 1);
        drop(merged);
        drop(current);
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(stage).unwrap();
    }

    #[test]
    fn selective_import_accepts_an_older_table_without_new_columns() {
        let stage = test_directory("selective-old-schema");
        let source = stage.join(DATABASE_FILE_NAME);
        let imported = Connection::open(&source).unwrap();
        imported
            .execute_batch(
                "CREATE TABLE flight_journal_entries (
                    id INTEGER PRIMARY KEY,
                    flight_date TEXT NOT NULL
                );
                INSERT INTO flight_journal_entries (id, flight_date)
                VALUES (17, '2026-09-28');",
            )
            .unwrap();
        drop(imported);

        let current = Connection::open_in_memory().unwrap();
        current
            .execute_batch(
                "CREATE TABLE flight_journal_entries (
                    id INTEGER PRIMARY KEY,
                    flight_date TEXT NOT NULL,
                    completion_type TEXT NOT NULL DEFAULT '',
                    completion_time TEXT NOT NULL DEFAULT ''
                );
                INSERT INTO flight_journal_entries (id, flight_date)
                VALUES (3, '2026-09-29');",
            )
            .unwrap();
        current
            .execute(
                "ATTACH DATABASE ?1 AS imported",
                [source.to_string_lossy().as_ref()],
            )
            .unwrap();

        replace_import_tables(&current, &["flight_journal_entries"]).unwrap();

        let imported_row: (i64, String, String, String) = current
            .query_row(
                "SELECT id, flight_date, completion_type, completion_time
                 FROM flight_journal_entries",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(
            imported_row,
            (17, "2026-09-28".to_string(), String::new(), String::new())
        );

        current.execute_batch("DETACH DATABASE imported").unwrap();
        drop(current);
        fs::remove_dir_all(stage).unwrap();
    }

    #[test]
    fn selective_control_import_skips_a_missing_person_without_failing() {
        let stage = test_directory("selective-control-missing-person");
        let current = Connection::open_in_memory().unwrap();
        database::initialise(&current).unwrap();

        let source = stage.join(DATABASE_FILE_NAME);
        let imported = Connection::open(&source).unwrap();
        database::initialise(&imported).unwrap();
        imported.execute("INSERT INTO personnel(id,rank,surname,given_name,position,birth_date,education_level,education_details,armed_forces_service_start_date,position_assigned_date,position_assignment_order,military_id) VALUES(44,'солдат','Відсутній','Боєць','оператор','','','','','','','')", []).unwrap();
        imported.execute("INSERT INTO personnel_control_assignments(id,personnel_id,location_type,institution,start_date) VALUES(10,44,'ВІДР','Навчальний центр','2026-09-27')", []).unwrap();
        imported.execute("INSERT INTO personnel_control_events(id,assignment_id,personnel_id,full_name_snapshot,action,location_type,start_date) VALUES(11,10,44,'ВІДСУТНІЙ Боєць','created','ВІДР','2026-09-27')", []).unwrap();
        drop(imported);

        let staged = StagedImport {
            directory: stage.clone(),
            files: vec![StagedImportFile {
                relative_path: PathBuf::from(DATABASE_FILE_NAME),
                archive_path: format!("data/{DATABASE_FILE_NAME}"),
            }],
            legacy_archive: false,
            manifest: None,
        };
        merge_selected_database_sections(
            &current,
            &staged,
            &HashSet::from(["personnel_control".to_string()]),
            false,
        )
        .unwrap();

        let merged = Connection::open(stage.join(DATABASE_FILE_NAME)).unwrap();
        assert_eq!(
            merged
                .query_row(
                    "SELECT COUNT(*) FROM personnel_control_assignments",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
        let assignment_id: Option<i64> = merged
            .query_row(
                "SELECT assignment_id FROM personnel_control_events WHERE id=11",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(assignment_id, None);
        assert_eq!(
            merged
                .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
        drop(merged);
        drop(current);
        fs::remove_dir_all(stage).unwrap();
    }

    #[test]
    fn report_history_prefers_the_versioned_generation_manifest() {
        let root = test_directory("report-history-manifest");
        let report = root.join("Рапорт.docx");
        fs::write(&report, b"docx").unwrap();
        let manifest_path = generated_report_manifest_path(&report).unwrap();
        fs::write(
            manifest_path,
            r#"{
              "formatVersion": 1,
              "generatedAt": "2026-09-17T10:00:00+03:00",
              "appVersion": "0.1.0",
              "template": {"name": "Рапорт на відпустку", "path": "/tmp/template.docx", "sha256": "abc"},
              "selections": {"personnelIds": [1]},
              "reportDate": "2026-09-17",
              "parameters": {},
              "output": {"path": "/tmp/report.docx", "name": "Рапорт.docx", "sha256": "def"}
            }"#,
        )
        .unwrap();

        let manifest = read_generated_report_manifest(&report).unwrap();
        assert_eq!(manifest.format_version, 1);
        assert_eq!(manifest.template.name, "Рапорт на відпустку");
        assert_eq!(manifest.generated_at, "2026-09-17T10:00:00+03:00");

        fs::remove_dir_all(root).unwrap();
    }
}
