use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignerSettings {
    pub full_name: String,
    pub rank: String,
    pub position: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub main_signer: SignerSettings,
    pub commander: SignerSettings,
    pub chief: SignerSettings,
    #[serde(default = "default_deputy_ppp")]
    pub deputy_ppp: SignerSettings,
    #[serde(default = "default_deputy_armament")]
    pub deputy_armament: SignerSettings,
    #[serde(default = "default_deputy_rear")]
    pub deputy_rear: SignerSettings,
    #[serde(default = "default_fuel_chief")]
    pub fuel_chief: SignerSettings,
}

fn empty_signer(position: &str) -> SignerSettings {
    SignerSettings {
        full_name: String::new(),
        rank: String::new(),
        position: position.into(),
    }
}
fn default_deputy_ppp() -> SignerSettings {
    empty_signer("Заступник командира з ППП")
}
fn default_deputy_armament() -> SignerSettings {
    empty_signer("Заступник командира з Озброєння")
}
fn default_deputy_rear() -> SignerSettings {
    empty_signer("Заступник командира з Тилу")
}
fn default_fuel_chief() -> SignerSettings {
    empty_signer("Начальник ПММ")
}

pub fn defaults() -> AppSettings {
    AppSettings {
        main_signer: empty_signer("Основний підписант"),
        commander: empty_signer("Командир"),
        chief: empty_signer("Начальник штабу"),
        deputy_ppp: default_deputy_ppp(),
        deputy_armament: default_deputy_armament(),
        deputy_rear: default_deputy_rear(),
        fuel_chief: default_fuel_chief(),
    }
}

pub fn path(root: &Path) -> std::path::PathBuf {
    root.join("Налаштування").join("налаштування.json")
}

pub fn load(root: &Path) -> Result<AppSettings, String> {
    let settings_path = path(root);
    if let Ok(content) = fs::read_to_string(&settings_path) {
        if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
            return Ok(settings);
        }
    }
    let settings = defaults();
    save(root, &settings)?;
    Ok(settings)
}

pub fn save(root: &Path, settings: &AppSettings) -> Result<(), String> {
    let content = serde_json::to_string_pretty(settings)
        .map_err(|_| "Не вдалося підготувати налаштування підписантів.".to_string())?;
    fs::create_dir_all(root.join("Налаштування"))
        .map_err(|_| "Не вдалося створити папку налаштувань.".to_string())?;
    fs::write(path(root), content)
        .map_err(|_| "Не вдалося зберегти налаштування підписантів.".to_string())
}

pub fn update_signer(
    root: &Path,
    role: &str,
    signer: SignerSettings,
) -> Result<AppSettings, String> {
    if signer.full_name.trim().is_empty()
        || signer.rank.trim().is_empty()
        || signer.position.trim().is_empty()
    {
        return Err("Заповніть ПІБ, звання та посаду підписанта.".into());
    }
    let mut settings = load(root)?;
    match role {
        "main" => settings.main_signer = signer,
        "commander" => settings.commander = signer,
        "chief" => settings.chief = signer,
        "deputyPpp" => settings.deputy_ppp = signer,
        "deputyArmament" => settings.deputy_armament = signer,
        "deputyRear" => settings.deputy_rear = signer,
        "fuelChief" => settings.fuel_chief = signer,
        _ => return Err("Невідомий тип підписанта.".into()),
    }
    save(root, &settings)?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saves_each_additional_signer_role() {
        let root = std::env::temp_dir().join(format!("raportgen-settings-{}", std::process::id()));
        fs::create_dir_all(root.join("Налаштування")).unwrap();
        let saved = update_signer(
            &root,
            "fuelChief",
            SignerSettings {
                full_name: "Тест Тестович Тестенко".into(),
                rank: "капітан".into(),
                position: "Начальник ПММ".into(),
            },
        )
        .unwrap();
        assert_eq!(saved.fuel_chief.position, "Начальник ПММ");
        let _ = fs::remove_dir_all(root);
    }
}
