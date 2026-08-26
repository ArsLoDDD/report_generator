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
pub struct SignerRole {
    pub id: String,
    pub name: String,
    pub signer: SignerSettings,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitSettings {
    #[serde(default = "default_unit_kind")]
    pub kind: String,
    #[serde(default)]
    pub short_name: String,
    #[serde(default)]
    pub authorized_strength: i64,
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
    #[serde(default)]
    pub signer_roles: Vec<SignerRole>,
    #[serde(default)]
    pub visible_personnel_columns: Vec<String>,
    #[serde(default)]
    pub visible_vehicle_columns: Vec<String>,
    #[serde(default = "default_unit")]
    pub unit: UnitSettings,
}

fn default_unit_kind() -> String {
    "Рота".into()
}
fn default_unit() -> UnitSettings {
    UnitSettings {
        kind: default_unit_kind(),
        short_name: String::new(),
        authorized_strength: 0,
    }
}

const MAIN_SIGNER_ID: &str = "основний_підписант";

fn default_roles(settings: &AppSettings) -> Vec<SignerRole> {
    [
        (
            MAIN_SIGNER_ID,
            "Основний підписант",
            settings.main_signer.clone(),
        ),
        ("командир", "Командир", settings.commander.clone()),
        ("начальник_штабу", "Начальник штабу", settings.chief.clone()),
    ]
    .into_iter()
    .map(|(id, name, signer)| SignerRole {
        id: id.into(),
        name: name.into(),
        signer,
    })
    .collect()
}

/// Keeps previously entered additional signers when an older settings file is
/// opened for the first time after the switch to dynamic roles. New installs
/// still receive only the three base roles from `default_roles`.
fn migrated_roles(settings: &AppSettings) -> Vec<SignerRole> {
    let mut roles = default_roles(settings);
    for (id, name, signer) in [
        (
            "заступник_ппп",
            "Заступник командира з ППП",
            settings.deputy_ppp.clone(),
        ),
        (
            "заступник_озброєння",
            "Заступник командира з озброєння",
            settings.deputy_armament.clone(),
        ),
        (
            "заступник_тилу",
            "Заступник командира з тилу",
            settings.deputy_rear.clone(),
        ),
        (
            "начальник_пмм",
            "Начальник ПММ",
            settings.fuel_chief.clone(),
        ),
    ] {
        if !signer.full_name.trim().is_empty() || !signer.rank.trim().is_empty() {
            roles.push(SignerRole {
                id: id.into(),
                name: name.into(),
                signer,
            });
        }
    }
    roles
}

fn empty_signer(position: &str) -> SignerSettings {
    SignerSettings {
        full_name: String::new(),
        rank: String::new(),
        position: position.into(),
    }
}
fn default_deputy_ppp() -> SignerSettings {
    empty_signer("")
}
fn default_deputy_armament() -> SignerSettings {
    empty_signer("")
}
fn default_deputy_rear() -> SignerSettings {
    empty_signer("")
}
fn default_fuel_chief() -> SignerSettings {
    empty_signer("")
}

pub fn defaults() -> AppSettings {
    let mut settings = AppSettings {
        main_signer: empty_signer(""),
        commander: empty_signer(""),
        chief: empty_signer(""),
        deputy_ppp: empty_signer(""),
        deputy_armament: empty_signer(""),
        deputy_rear: empty_signer(""),
        fuel_chief: empty_signer(""),
        signer_roles: Vec::new(),
        visible_personnel_columns: Vec::new(),
        visible_vehicle_columns: Vec::new(),
        unit: default_unit(),
    };
    settings.signer_roles = default_roles(&settings);
    settings
}

pub fn update_unit_settings(root: &Path, unit: UnitSettings) -> Result<AppSettings, String> {
    let kind = unit.kind.trim();
    if !matches!(kind, "Рота" | "Окремий взвод") {
        return Err("Оберіть тип підрозділу: «Рота» або «Окремий взвод».".into());
    }
    if unit.short_name.trim().is_empty() {
        return Err("Вкажіть коротку назву підрозділу, наприклад «РБАК».".into());
    }
    if unit.authorized_strength < 0 {
        return Err("Чисельність за штатом не може бути від’ємною.".into());
    }
    let mut settings = load(root)?;
    settings.unit = UnitSettings {
        kind: kind.into(),
        short_name: unit.short_name.trim().into(),
        authorized_strength: unit.authorized_strength,
    };
    save(root, &settings)?;
    Ok(settings)
}

pub fn update_visible_personnel_columns(
    root: &Path,
    columns: Vec<String>,
) -> Result<AppSettings, String> {
    let mut settings = load(root)?;
    settings.visible_personnel_columns = columns;
    save(root, &settings)?;
    Ok(settings)
}

pub fn update_visible_vehicle_columns(
    root: &Path,
    columns: Vec<String>,
) -> Result<AppSettings, String> {
    let mut settings = load(root)?;
    settings.visible_vehicle_columns = columns;
    save(root, &settings)?;
    Ok(settings)
}

pub fn path(root: &Path) -> std::path::PathBuf {
    root.join("settings.json")
}

pub fn load(root: &Path) -> Result<AppSettings, String> {
    let settings_path = path(root);
    if let Ok(content) = fs::read_to_string(&settings_path) {
        if let Ok(mut settings) = serde_json::from_str::<AppSettings>(&content) {
            if settings.signer_roles.is_empty() {
                settings.signer_roles = migrated_roles(&settings);
                save(root, &settings)?;
            }
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
    let legacy = match role {
        "main" => MAIN_SIGNER_ID,
        "commander" => "командир",
        "chief" => "начальник_штабу",
        "deputyPpp" => "заступник_ппп",
        "deputyArmament" => "заступник_озброєння",
        "deputyRear" => "заступник_тилу",
        "fuelChief" => "начальник_пмм",
        value => value,
    };
    let Some(item) = settings
        .signer_roles
        .iter_mut()
        .find(|item| item.id == legacy)
    else {
        return Err("Підписанта не знайдено.".into());
    };
    item.signer = signer.clone();
    // Keep the legacy fields in sync while older settings files are still
    // readable. The dynamic role remains the source used by new screens.
    match legacy {
        MAIN_SIGNER_ID => settings.main_signer = signer,
        "командир" => settings.commander = signer,
        "начальник_штабу" => settings.chief = signer,
        "заступник_ппп" => settings.deputy_ppp = signer,
        "заступник_озброєння" => settings.deputy_armament = signer,
        "заступник_тилу" => settings.deputy_rear = signer,
        "начальник_пмм" => settings.fuel_chief = signer,
        _ => {}
    }
    save(root, &settings)?;
    Ok(settings)
}

pub fn add_signer(
    root: &Path,
    name: String,
    signer: SignerSettings,
) -> Result<AppSettings, String> {
    if name.trim().is_empty()
        || signer.full_name.trim().is_empty()
        || signer.rank.trim().is_empty()
        || signer.position.trim().is_empty()
    {
        return Err("Заповніть назву ролі, ПІБ, звання та посаду підписанта.".into());
    }
    let mut settings = load(root)?;
    let id = role_id(&name)?;
    if settings.signer_roles.iter().any(|item| item.id == id) {
        return Err("Підписант із такою назвою вже існує.".into());
    }
    settings.signer_roles.push(SignerRole {
        id,
        name: name.trim().into(),
        signer,
    });
    save(root, &settings)?;
    Ok(settings)
}

pub fn delete_signer(root: &Path, id: &str) -> Result<AppSettings, String> {
    if id == MAIN_SIGNER_ID {
        return Err("Основного підписанта видалити не можна.".into());
    }
    let mut settings = load(root)?;
    let before = settings.signer_roles.len();
    settings.signer_roles.retain(|item| item.id != id);
    if before == settings.signer_roles.len() {
        return Err("Підписанта не знайдено.".into());
    }
    save(root, &settings)?;
    Ok(settings)
}

fn role_id(name: &str) -> Result<String, String> {
    let id = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>();
    let id = id
        .trim_matches('_')
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_");
    if id.is_empty() || !id.chars().next().is_some_and(char::is_alphabetic) {
        return Err("Назва ролі має починатися з літери.".into());
    }
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saves_an_initial_signer_role() {
        let root =
            std::env::temp_dir().join(format!("shablonizator-settings-{}", std::process::id()));
        fs::create_dir_all(root.join("Налаштування")).unwrap();
        let saved = update_signer(
            &root,
            "commander",
            SignerSettings {
                full_name: "Тест Тестович Тестенко".into(),
                rank: "капітан".into(),
                position: "Командир".into(),
            },
        )
        .unwrap();
        assert_eq!(
            saved
                .signer_roles
                .iter()
                .find(|role| role.id == "командир")
                .unwrap()
                .signer
                .position,
            "Командир"
        );
        assert!(saved.visible_personnel_columns.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn adds_and_removes_a_signer_role_but_keeps_the_main_one() {
        let root =
            std::env::temp_dir().join(format!("shablonizator-signers-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let signer = SignerSettings {
            full_name: "ПЕТРЕНКО Петро Петрович".into(),
            rank: "капітан".into(),
            position: "Черговий частини".into(),
        };
        let added = add_signer(&root, "Черговий частини".into(), signer).unwrap();
        assert!(added
            .signer_roles
            .iter()
            .any(|role| role.id == "черговий_частини"));
        let removed = delete_signer(&root, "черговий_частини").unwrap();
        assert!(!removed
            .signer_roles
            .iter()
            .any(|role| role.id == "черговий_частини"));
        assert!(delete_signer(&root, MAIN_SIGNER_ID).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn fresh_settings_start_with_only_three_empty_signers() {
        let settings = defaults();
        assert_eq!(settings.signer_roles.len(), 3);
        assert_eq!(
            settings
                .signer_roles
                .iter()
                .map(|role| role.id.as_str())
                .collect::<Vec<_>>(),
            vec!["основний_підписант", "командир", "начальник_штабу"]
        );
        assert!(settings
            .signer_roles
            .iter()
            .all(|role| role.signer.full_name.is_empty()
                && role.signer.rank.is_empty()
                && role.signer.position.is_empty()));
    }
}
