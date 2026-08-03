use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignerSettings {
    pub full_name: String,
    pub rank: String,
    pub position: String,
    pub signature_file_name: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub main_signer: SignerSettings,
    pub commander: SignerSettings,
    pub chief: SignerSettings,
}

pub fn defaults() -> AppSettings {
    AppSettings {
        main_signer: SignerSettings { full_name: "Іваненко Іван Іванович".into(), rank: "майор".into(), position: "Заступник командира з ППП".into(), signature_file_name: Some("main.png".into()) },
        commander: SignerSettings { full_name: "Петренко Петро Петрович".into(), rank: "капітан".into(), position: "Командир".into(), signature_file_name: None },
        chief: SignerSettings { full_name: "Сидоренко Сергій Сергійович".into(), rank: "капітан".into(), position: "Начальник штабу".into(), signature_file_name: None },
    }
}

pub fn path(root: &Path) -> std::path::PathBuf { root.join("Налаштування").join("налаштування.json") }

pub fn load(root: &Path) -> Result<AppSettings, String> {
    let settings_path = path(root);
    if let Ok(content) = fs::read_to_string(&settings_path) {
        if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) { return Ok(settings); }
    }
    let settings = defaults();
    save(root, &settings)?;
    Ok(settings)
}

pub fn save(root: &Path, settings: &AppSettings) -> Result<(), String> {
    let content = serde_json::to_string_pretty(settings).map_err(|_| "Не вдалося підготувати налаштування підписантів.".to_string())?;
    fs::create_dir_all(root.join("Налаштування")).map_err(|_| "Не вдалося створити папку налаштувань.".to_string())?;
    fs::write(path(root), content).map_err(|_| "Не вдалося зберегти налаштування підписантів.".to_string())
}

pub fn update_signer(root: &Path, role: &str, mut signer: SignerSettings) -> Result<AppSettings, String> {
    if signer.full_name.trim().is_empty() || signer.rank.trim().is_empty() || signer.position.trim().is_empty() { return Err("Заповніть ПІБ, звання та посаду підписанта.".into()); }
    if role == "main" {
        let file_name = signer.signature_file_name.take().unwrap_or_else(|| "main.png".into());
        if file_name.contains(['/', '\\']) || !file_name.to_ascii_lowercase().ends_with(".png") { return Err("Вкажіть назву PNG-файлу з папки «Підписи», наприклад main.png.".into()); }
        signer.signature_file_name = Some(file_name);
    } else { signer.signature_file_name = None; }
    let mut settings = load(root)?;
    match role { "main" => settings.main_signer = signer, "commander" => settings.commander = signer, "chief" => settings.chief = signer, _ => return Err("Невідомий тип підписанта.".into()) }
    save(root, &settings)?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_main_signer_keeps_a_signature_file() {
        let root = std::env::temp_dir().join(format!("raportgen-settings-{}", std::process::id()));
        fs::create_dir_all(root.join("Налаштування")).unwrap();
        let saved = update_signer(&root, "commander", SignerSettings { full_name: "Тест".into(), rank: "капітан".into(), position: "Командир".into(), signature_file_name: Some("other.png".into()) }).unwrap();
        assert_eq!(saved.commander.signature_file_name, None);
        let _ = fs::remove_dir_all(root);
    }
}
