use crate::{document_commands, AppState};
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};
use tauri_plugin_updater::UpdaterExt;
use zip::ZipArchive;

const PACKAGE_FORMAT_VERSION: u16 = 1;
const ADVANCED_IDENTIFIER: &str = "ua.shablonizator.advanced";
const MAX_MANIFEST_SIZE: u64 = 1024 * 1024;
const MAX_INSTALLER_SIZE: u64 = 700 * 1024 * 1024;
const UPDATER_PUBLIC_KEY: &str = include_str!("../updater.pubkey");

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OfflineUpdateManifest {
    format_version: u16,
    identifier: String,
    edition: String,
    version: String,
    architecture: String,
    #[serde(default)]
    notes: String,
    installer: String,
    signature: String,
    sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateStatus {
    current_version: String,
    supported: bool,
    data_directory: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OfflineUpdateInfo {
    current_version: String,
    version: String,
    edition: String,
    architecture: String,
    notes: String,
    size_bytes: u64,
}

struct ValidatedPackage {
    manifest: OfflineUpdateManifest,
    installer_bytes: Vec<u8>,
}

fn normalize_architecture(value: &str) -> &str {
    match value {
        "amd64" | "x64" => "x86_64",
        "arm64" => "aarch64",
        other => other,
    }
}

fn is_safe_archive_name(name: &str) -> bool {
    let path = Path::new(name);
    path.components().count() == 1
        && path.file_name().is_some()
        && !name.contains('/')
        && !name.contains('\\')
}

fn read_manifest(archive: &mut ZipArchive<File>) -> Result<OfflineUpdateManifest, String> {
    let mut entry = archive
        .by_name("manifest.json")
        .map_err(|_| "Файл оновлення не містить manifest.json.".to_string())?;
    if entry.size() > MAX_MANIFEST_SIZE {
        return Err("Опис пакета оновлення має неприпустимий розмір.".into());
    }
    let mut source = String::new();
    entry
        .read_to_string(&mut source)
        .map_err(|_| "Не вдалося прочитати опис пакета оновлення.".to_string())?;
    serde_json::from_str(&source)
        .map_err(|_| "Опис пакета оновлення має неправильний формат.".to_string())
}

fn validate_manifest(
    manifest: &OfflineUpdateManifest,
    current_identifier: &str,
    current_version: &Version,
) -> Result<(), String> {
    if manifest.format_version != PACKAGE_FORMAT_VERSION {
        return Err("Цей формат файла оновлення не підтримується.".into());
    }
    if current_identifier != ADVANCED_IDENTIFIER || manifest.identifier != current_identifier {
        return Err("Файл призначений для іншої редакції програми.".into());
    }
    if manifest.edition != "advanced" {
        return Err("Файл не є оновленням просунутої версії.".into());
    }
    let package_version = Version::parse(&manifest.version)
        .map_err(|_| "У файлі оновлення вказано неправильну версію.".to_string())?;
    if package_version <= *current_version {
        return Err(format!(
            "Версія {} не новіша за встановлену {}.",
            package_version, current_version
        ));
    }
    if normalize_architecture(&manifest.architecture)
        != normalize_architecture(std::env::consts::ARCH)
    {
        return Err("Файл оновлення створено для іншої архітектури Windows.".into());
    }
    if !is_safe_archive_name(&manifest.installer)
        || !manifest.installer.to_ascii_lowercase().ends_with(".exe")
    {
        return Err("Пакет містить неправильний шлях до інсталятора.".into());
    }
    if manifest.signature.trim().is_empty() {
        return Err("Пакет не містить цифрового підпису.".into());
    }
    if manifest.sha256.len() != 64
        || !manifest
            .sha256
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err("Пакет містить неправильну контрольну суму.".into());
    }
    Ok(())
}

fn load_and_validate_package(
    path: &Path,
    current_identifier: &str,
    current_version: &Version,
) -> Result<ValidatedPackage, String> {
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("shupd"))
    {
        return Err("Оберіть файл оновлення з розширенням .shupd.".into());
    }
    let file = File::open(path).map_err(|_| "Не вдалося відкрити файл оновлення.".to_string())?;
    let mut archive = ZipArchive::new(file)
        .map_err(|_| "Файл оновлення пошкоджений або має неправильний формат.".to_string())?;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|_| "Не вдалося перевірити вміст файла оновлення.".to_string())?;
        if entry.enclosed_name().is_none() || !is_safe_archive_name(entry.name()) {
            return Err("Пакет оновлення містить небезпечний шлях.".into());
        }
    }
    let manifest = read_manifest(&mut archive)?;
    validate_manifest(&manifest, current_identifier, current_version)?;
    let mut manifest_count = 0;
    let mut installer_count = 0;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|_| "Не вдалося перевірити склад пакета оновлення.".to_string())?;
        if entry.name() == "manifest.json" {
            manifest_count += 1;
        } else if entry.name() == manifest.installer {
            installer_count += 1;
        } else {
            return Err("Пакет оновлення містить сторонні файли.".into());
        }
    }
    if manifest_count != 1 || installer_count != 1 {
        return Err("Пакет оновлення має неправильний склад файлів.".into());
    }
    let mut installer = archive
        .by_name(&manifest.installer)
        .map_err(|_| "Пакет не містить зазначеного інсталятора.".to_string())?;
    if installer.size() == 0 || installer.size() > MAX_INSTALLER_SIZE {
        return Err("Інсталятор має неприпустимий розмір.".into());
    }
    let size = usize::try_from(installer.size())
        .map_err(|_| "Інсталятор завеликий для цього комп’ютера.".to_string())?;
    let mut installer_bytes = Vec::with_capacity(size);
    installer
        .read_to_end(&mut installer_bytes)
        .map_err(|_| "Не вдалося прочитати інсталятор з пакета.".to_string())?;
    let actual_hash = format!("{:x}", Sha256::digest(&installer_bytes));
    if !actual_hash.eq_ignore_ascii_case(&manifest.sha256) {
        return Err("Контрольна сума інсталятора не збігається. Файл пошкоджено.".into());
    }
    Ok(ValidatedPackage {
        manifest,
        installer_bytes,
    })
}

fn package_info(
    app: &tauri::AppHandle,
    path: &Path,
) -> Result<(OfflineUpdateInfo, ValidatedPackage), String> {
    let current_version = app.package_info().version.clone();
    let package = load_and_validate_package(path, &app.config().identifier, &current_version)?;
    let info = OfflineUpdateInfo {
        current_version: current_version.to_string(),
        version: package.manifest.version.clone(),
        edition: "Просунута версія".into(),
        architecture: package.manifest.architecture.clone(),
        notes: package.manifest.notes.clone(),
        size_bytes: package.installer_bytes.len() as u64,
    };
    Ok((info, package))
}

#[tauri::command]
pub(crate) fn get_update_status(app: tauri::AppHandle) -> Result<UpdateStatus, String> {
    let root = crate::ensure_application_structure(&app)?;
    Ok(UpdateStatus {
        current_version: app.package_info().version.to_string(),
        supported: cfg!(target_os = "windows") && app.config().identifier == ADVANCED_IDENTIFIER,
        data_directory: root.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub(crate) fn inspect_offline_update(
    app: tauri::AppHandle,
    path: String,
) -> Result<OfflineUpdateInfo, String> {
    package_info(&app, Path::new(&path)).map(|(info, _)| info)
}

fn write_http_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n",
        body.len()
    )?;
    stream.write_all(body)
}

struct LocalUpdateServer {
    endpoint: tauri::Url,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}

impl LocalUpdateServer {
    fn start(manifest: &OfflineUpdateManifest, installer: Vec<u8>) -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|_| "Не вдалося підготувати локальну перевірку оновлення.".to_string())?;
        listener
            .set_nonblocking(true)
            .map_err(|_| "Не вдалося запустити локальну перевірку оновлення.".to_string())?;
        let address = listener
            .local_addr()
            .map_err(|_| "Не вдалося визначити адресу перевірки оновлення.".to_string())?;
        let endpoint = format!("http://{address}/metadata")
            .parse::<tauri::Url>()
            .map_err(|_| "Не вдалося сформувати адресу перевірки оновлення.".to_string())?;
        let metadata = serde_json::json!({
            "version": manifest.version,
            "notes": manifest.notes,
            "url": format!("http://{address}/installer"),
            "signature": manifest.signature,
        })
        .to_string()
        .into_bytes();
        let stop = Arc::new(AtomicBool::new(false));
        let stop_for_thread = stop.clone();
        let server_thread = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(180);
            while !stop_for_thread.load(Ordering::Relaxed) && Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                        let mut request = [0_u8; 4096];
                        let count = stream.read(&mut request).unwrap_or_default();
                        let line = String::from_utf8_lossy(&request[..count]);
                        let path = line.split_whitespace().nth(1).unwrap_or_default();
                        let _ = match path {
                            "/metadata" => write_http_response(
                                &mut stream,
                                "200 OK",
                                "application/json",
                                &metadata,
                            ),
                            "/installer" => write_http_response(
                                &mut stream,
                                "200 OK",
                                "application/octet-stream",
                                &installer,
                            ),
                            _ => write_http_response(
                                &mut stream,
                                "404 Not Found",
                                "text/plain",
                                b"Not found",
                            ),
                        };
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(20));
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Self {
            endpoint,
            stop,
            thread: Some(server_thread),
        })
    }
}

impl Drop for LocalUpdateServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[tauri::command]
pub(crate) async fn install_offline_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    if !cfg!(target_os = "windows") {
        return Err("Офлайн-оновлення встановлюється лише у Windows-версії програми.".into());
    }
    let (_, package) = package_info(&app, Path::new(&path))?;
    document_commands::create_database_backup(app.clone(), state)?;
    install_validated_package(app, package).await
}

async fn install_validated_package(
    app: tauri::AppHandle,
    package: ValidatedPackage,
) -> Result<(), String> {
    let server = LocalUpdateServer::start(&package.manifest, package.installer_bytes)?;
    let updater = app
        .updater_builder()
        .pubkey(UPDATER_PUBLIC_KEY.trim())
        .endpoints(vec![server.endpoint.clone()])
        .map_err(|error| format!("Не вдалося підготувати перевірку підпису: {error}"))?
        .no_proxy()
        .build()
        .map_err(|error| format!("Не вдалося запустити механізм оновлення: {error}"))?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("Не вдалося перевірити цифровий підпис оновлення: {error}"))?
        .ok_or_else(|| "У пакеті немає новішої версії програми.".to_string())?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("Не вдалося встановити оновлення: {error}"))?;
    drop(server);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, io::Write, path::PathBuf};
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "shablonizator-update-{name}-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ))
    }

    fn create_package(path: &Path, mut manifest: OfflineUpdateManifest, installer: &[u8]) {
        manifest.sha256 = format!("{:x}", Sha256::digest(installer));
        let file = File::create(path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        archive.start_file("manifest.json", options).unwrap();
        archive
            .write_all(serde_json::to_string(&manifest).unwrap().as_bytes())
            .unwrap();
        archive.start_file(&manifest.installer, options).unwrap();
        archive.write_all(installer).unwrap();
        archive.finish().unwrap();
    }

    fn manifest() -> OfflineUpdateManifest {
        OfflineUpdateManifest {
            format_version: 1,
            identifier: ADVANCED_IDENTIFIER.into(),
            edition: "advanced".into(),
            version: "9.0.0".into(),
            architecture: std::env::consts::ARCH.into(),
            notes: "Перевірка".into(),
            installer: "update.exe".into(),
            signature: "trusted signature".into(),
            sha256: String::new(),
        }
    }

    #[test]
    fn valid_package_is_loaded_and_hashed() {
        let path = temp_path("valid").with_extension("shupd");
        create_package(&path, manifest(), b"signed installer bytes");
        let package = load_and_validate_package(
            &path,
            ADVANCED_IDENTIFIER,
            &Version::parse("1.0.0").unwrap(),
        )
        .unwrap();
        assert_eq!(package.manifest.version, "9.0.0");
        assert_eq!(package.installer_bytes, b"signed installer bytes");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn package_for_another_edition_is_rejected() {
        let path = temp_path("edition").with_extension("shupd");
        let mut value = manifest();
        value.identifier = "ua.shablonizator.admin".into();
        create_package(&path, value, b"installer");
        let error = load_and_validate_package(
            &path,
            ADVANCED_IDENTIFIER,
            &Version::parse("1.0.0").unwrap(),
        )
        .err()
        .unwrap();
        assert!(error.contains("іншої редакції"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn package_with_changed_installer_is_rejected() {
        let path = temp_path("hash").with_extension("shupd");
        let mut value = manifest();
        value.sha256 = "0".repeat(64);
        let file = File::create(&path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        archive.start_file("manifest.json", options).unwrap();
        archive
            .write_all(serde_json::to_string(&value).unwrap().as_bytes())
            .unwrap();
        archive.start_file("update.exe", options).unwrap();
        archive.write_all(b"changed").unwrap();
        archive.finish().unwrap();
        let error = load_and_validate_package(
            &path,
            ADVANCED_IDENTIFIER,
            &Version::parse("1.0.0").unwrap(),
        )
        .err()
        .unwrap();
        assert!(error.contains("Контрольна сума"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn package_cannot_downgrade_the_application() {
        let path = temp_path("downgrade").with_extension("shupd");
        let mut value = manifest();
        value.version = "1.0.0".into();
        create_package(&path, value, b"installer");
        let error = load_and_validate_package(
            &path,
            ADVANCED_IDENTIFIER,
            &Version::parse("2.0.0").unwrap(),
        )
        .err()
        .unwrap();
        assert!(error.contains("не новіша"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn package_with_an_archive_escape_is_rejected() {
        let path = temp_path("escape").with_extension("shupd");
        let value = manifest();
        let file = File::create(&path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        archive.start_file("manifest.json", options).unwrap();
        archive
            .write_all(serde_json::to_string(&value).unwrap().as_bytes())
            .unwrap();
        archive.start_file("../update.exe", options).unwrap();
        archive.write_all(b"installer").unwrap();
        archive.finish().unwrap();
        let error = load_and_validate_package(
            &path,
            ADVANCED_IDENTIFIER,
            &Version::parse("1.0.0").unwrap(),
        )
        .err()
        .unwrap();
        assert!(error.contains("небезпечний шлях"));
        let _ = fs::remove_file(path);
    }
}
