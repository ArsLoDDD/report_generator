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
pub struct CommissionMember {
    pub id: String,
    pub signer_role_id: String,
    pub order: i64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommissionTemplate {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub variable: String,
    #[serde(default)]
    pub members: Vec<CommissionMember>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitStructureNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub kind: String,
    pub name: String,
    pub order: i64,
    #[serde(default)]
    pub rank_requirement: String,
    #[serde(default)]
    pub vos: String,
    #[serde(default)]
    pub tariff_grade: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitSettings {
    #[serde(default = "default_unit_kind")]
    pub kind: String,
    #[serde(default)]
    pub short_name: String,
    #[serde(default)]
    pub full_name: String,
    #[serde(default)]
    pub unit_code: String,
    #[serde(default)]
    pub authorized_strength: i64,
    #[serde(default)]
    pub structure: Vec<UnitStructureNode>,
    #[serde(default)]
    pub battalion_full_name: String,
    #[serde(default)]
    pub battalion_short_name: String,
    #[serde(default)]
    pub military_unit_short_name: String,
    #[serde(default)]
    pub report_recipient: String,
    #[serde(default)]
    pub ksp_name: String,
    #[serde(default)]
    pub ksp_locality: String,
    #[serde(default)]
    pub ksp_mgrs: String,
    #[serde(default)]
    pub ksp_in_bro: bool,
    #[serde(default)]
    pub army_corps_number: String,
    #[serde(default)]
    pub arm_number: String,
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
    pub commission_templates: Vec<CommissionTemplate>,
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
        full_name: String::new(),
        unit_code: String::new(),
        authorized_strength: 0,
        structure: Vec::new(),
        battalion_full_name: String::new(),
        battalion_short_name: String::new(),
        military_unit_short_name: String::new(),
        report_recipient: String::new(),
        ksp_name: String::new(),
        ksp_locality: String::new(),
        ksp_mgrs: String::new(),
        ksp_in_bro: false,
        army_corps_number: String::new(),
        arm_number: String::new(),
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
        commission_templates: Vec::new(),
        visible_personnel_columns: Vec::new(),
        visible_vehicle_columns: Vec::new(),
        unit: default_unit(),
    };
    settings.signer_roles = default_roles(&settings);
    settings
}

pub fn update_unit_settings(root: &Path, unit: UnitSettings) -> Result<AppSettings, String> {
    let kind = unit.kind.trim();
    if !matches!(kind, "Рота" | "Окремий взвод" | "Інше") {
        return Err("Оберіть тип підрозділу: «Рота», «Окремий взвод» або «Інше».".into());
    }
    if unit.short_name.trim().is_empty() {
        return Err("Вкажіть коротку назву підрозділу, наприклад «РБАК».".into());
    }
    let unit_code = unit.unit_code.trim().to_uppercase().replace('A', "А");
    let unit_code_chars: Vec<char> = unit_code.chars().collect();
    if !unit_code.is_empty()
        && !(unit_code_chars.len() == 5
            && unit_code_chars.first() == Some(&'А')
            && unit_code_chars
                .iter()
                .skip(1)
                .all(|symbol| symbol.is_ascii_digit()))
    {
        return Err("Номер військової частини має формат «А0000».".into());
    }
    if unit.authorized_strength < 0 {
        return Err("Чисельність за штатом не може бути від’ємною.".into());
    }
    if unit.structure.iter().any(|item| {
        item.id.trim().is_empty()
            || item.name.trim().is_empty()
            || !matches!(item.kind.as_str(), "group" | "position")
    }) {
        return Err("Структура підрозділу містить некоректний блок або посаду.".into());
    }
    let mut settings = load(root)?;
    settings.unit = UnitSettings {
        kind: kind.into(),
        short_name: unit.short_name.trim().into(),
        full_name: unit.full_name.trim().into(),
        unit_code,
        authorized_strength: unit.authorized_strength,
        structure: unit
            .structure
            .into_iter()
            .map(|mut item| {
                item.name = item.name.trim().into();
                item.rank_requirement = item.rank_requirement.trim().into();
                item.vos = item.vos.trim().into();
                item.tariff_grade = item.tariff_grade.trim().into();
                item
            })
            .collect(),
        battalion_full_name: unit.battalion_full_name.trim().into(),
        battalion_short_name: unit.battalion_short_name.trim().into(),
        military_unit_short_name: unit.military_unit_short_name.trim().into(),
        report_recipient: unit.report_recipient.trim().into(),
        ksp_name: unit.ksp_name.trim().into(),
        ksp_locality: unit.ksp_locality.trim().into(),
        ksp_mgrs: unit.ksp_mgrs.trim().into(),
        ksp_in_bro: unit.ksp_in_bro,
        army_corps_number: unit.army_corps_number.trim().into(),
        arm_number: unit.arm_number.trim().into(),
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
            let mut changed = false;
            if settings.signer_roles.is_empty() {
                settings.signer_roles = migrated_roles(&settings);
                changed = true;
            }
            let mut used_variables = std::collections::HashSet::new();
            for commission in &mut settings.commission_templates {
                let source = if commission.variable.trim().is_empty() {
                    if commission.id.starts_with("комісія_") {
                        commission.id.clone()
                    } else {
                        role_id(&commission.name)
                            .map(|value| {
                                if value.starts_with("комісія_") {
                                    value
                                } else {
                                    format!("комісія_{value}")
                                }
                            })
                            .unwrap_or_else(|_| "комісія_без_назви".into())
                    }
                } else {
                    commission.variable.clone()
                };
                let canonical = role_id(&source).unwrap_or_else(|_| "комісія_без_назви".into());
                let mut variable = if canonical.starts_with("комісія_") {
                    canonical
                } else {
                    format!("комісія_{canonical}")
                };
                if used_variables.contains(&variable) {
                    let base = variable.clone();
                    let mut suffix = 2;
                    while used_variables.contains(&variable) {
                        variable = format!("{base}_{suffix}");
                        suffix += 1;
                    }
                }
                used_variables.insert(variable.clone());
                if commission.variable != variable {
                    commission.variable = variable;
                    changed = true;
                }
            }
            if changed {
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
    for commission in &mut settings.commission_templates {
        for member in &mut commission.members {
            if member.signer_role_id == id {
                member.signer_role_id.clear();
            }
        }
    }
    save(root, &settings)?;
    Ok(settings)
}

pub fn save_commission(
    root: &Path,
    mut commission: CommissionTemplate,
) -> Result<AppSettings, String> {
    if commission.name.trim().is_empty() {
        return Err("Вкажіть назву комісії.".into());
    }
    if commission.members.is_empty() {
        return Err("Додайте хоча б одного учасника до комісії.".into());
    }
    let mut settings = load(root)?;
    let variable = role_id(&commission.variable)
        .map_err(|_| "Вкажіть назву змінної після префікса «комісія_».".to_string())?;
    if !variable.starts_with("комісія_") {
        return Err("Назва змінної комісії повинна починатися з «комісія_».".into());
    }
    commission.variable = variable;
    let existing_index = (!commission.id.trim().is_empty())
        .then(|| {
            settings
                .commission_templates
                .iter()
                .position(|item| item.id == commission.id)
        })
        .flatten();
    if !commission.id.trim().is_empty() && existing_index.is_none() {
        return Err("Комісію для редагування не знайдено.".into());
    }
    if settings
        .commission_templates
        .iter()
        .enumerate()
        .any(|(index, item)| Some(index) != existing_index && item.variable == commission.variable)
    {
        return Err("Комісія з такою змінною вже існує.".into());
    }
    if commission.id.trim().is_empty() {
        let mut number = settings.commission_templates.len() + 1;
        loop {
            let candidate = format!("commission_{number}");
            if !settings
                .commission_templates
                .iter()
                .any(|item| item.id == candidate)
            {
                commission.id = candidate;
                break;
            }
            number += 1;
        }
    }
    let signer_ids = settings
        .signer_roles
        .iter()
        .map(|role| role.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    for (index, member) in commission.members.iter_mut().enumerate() {
        if !member.signer_role_id.is_empty() && !signer_ids.contains(member.signer_role_id.as_str())
        {
            return Err("Один із підписантів комісії більше не існує.".into());
        }
        if member.id.trim().is_empty() {
            member.id = format!("member-{}", index + 1);
        }
        member.order = index as i64;
    }
    commission.name = commission.name.trim().into();
    if let Some(index) = existing_index {
        settings.commission_templates[index] = commission;
    } else {
        settings.commission_templates.push(commission);
    }
    save(root, &settings)?;
    Ok(settings)
}

pub fn delete_commission(root: &Path, id: &str) -> Result<AppSettings, String> {
    let mut settings = load(root)?;
    let before = settings.commission_templates.len();
    settings.commission_templates.retain(|item| item.id != id);
    if before == settings.commission_templates.len() {
        return Err("Комісію не знайдено.".into());
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

    #[test]
    fn saves_a_cyrillic_or_latin_unit_code_in_the_canonical_format() {
        let root =
            std::env::temp_dir().join(format!("shablonizator-unit-code-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let mut unit = default_unit();
        unit.short_name = "РБАК".into();
        unit.unit_code = "A0000".into();
        unit.ksp_name = "ОРІОН".into();
        unit.ksp_locality = "КАЛИНІВКА".into();
        unit.ksp_mgrs = "36U UV 40000 47000".into();
        unit.ksp_in_bro = true;
        let saved = update_unit_settings(&root, unit).unwrap();
        assert_eq!(saved.unit.unit_code, "А0000");
        assert_eq!(saved.unit.ksp_name, "ОРІОН");
        assert_eq!(saved.unit.ksp_locality, "КАЛИНІВКА");
        assert_eq!(saved.unit.ksp_mgrs, "36U UV 40000 47000");
        assert!(saved.unit.ksp_in_bro);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn saves_commissions_and_clears_a_removed_signer_assignment() {
        let root =
            std::env::temp_dir().join(format!("shablonizator-commissions-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let signer = SignerSettings {
            full_name: "ПЕТРЕНКО Петро Петрович".into(),
            rank: "капітан".into(),
            position: "Черговий частини".into(),
        };
        add_signer(&root, "Черговий частини".into(), signer).unwrap();
        let saved = save_commission(
            &root,
            CommissionTemplate {
                id: String::new(),
                name: "Комісія зі списання".into(),
                variable: "комісія_списання".into(),
                members: vec![CommissionMember {
                    id: "member-1".into(),
                    signer_role_id: "черговий_частини".into(),
                    order: 8,
                }],
            },
        )
        .unwrap();
        assert_eq!(saved.commission_templates.len(), 1);
        assert_eq!(saved.commission_templates[0].id, "commission_1");
        assert_eq!(saved.commission_templates[0].variable, "комісія_списання");
        assert_eq!(saved.commission_templates[0].members[0].order, 0);

        let after_delete = delete_signer(&root, "черговий_частини").unwrap();
        assert!(after_delete.commission_templates[0].members[0]
            .signer_role_id
            .is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn opens_an_older_settings_file_without_new_structure_metadata() {
        let root =
            std::env::temp_dir().join(format!("shablonizator-old-settings-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let mut json = serde_json::to_value(defaults()).unwrap();
        json.as_object_mut().unwrap().remove("commissionTemplates");
        json["unit"].as_object_mut().unwrap().remove("kspInBro");
        json["unit"]["shortName"] = serde_json::Value::String("РБАК".into());
        json["unit"]["structure"] = serde_json::json!([{
            "id": "position-old",
            "parentId": null,
            "kind": "position",
            "name": "Командир",
            "order": 0
        }]);
        fs::write(path(&root), serde_json::to_string_pretty(&json).unwrap()).unwrap();

        let loaded = load(&root).unwrap();
        assert!(loaded.commission_templates.is_empty());
        assert!(loaded.unit.structure[0].rank_requirement.is_empty());
        assert!(loaded.unit.structure[0].vos.is_empty());
        assert!(loaded.unit.structure[0].tariff_grade.is_empty());
        assert!(!loaded.unit.ksp_in_bro);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn migrates_an_old_commission_to_a_prefixed_template_variable() {
        let root = std::env::temp_dir().join(format!(
            "shablonizator-old-commission-{}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let mut json = serde_json::to_value(defaults()).unwrap();
        json["commissionTemplates"] = serde_json::json!([{
            "id": "списання",
            "name": "Списання",
            "members": [{
                "id": "member-1",
                "roleName": "Голова комісії",
                "signerRoleId": "командир",
                "order": 0
            }]
        }]);
        fs::write(path(&root), serde_json::to_string_pretty(&json).unwrap()).unwrap();

        let loaded = load(&root).unwrap();
        assert_eq!(loaded.commission_templates[0].variable, "комісія_списання");
        assert_eq!(
            loaded.commission_templates[0].members[0].signer_role_id,
            "командир"
        );
        let saved = fs::read_to_string(path(&root)).unwrap();
        assert!(!saved.contains("roleName"));
        let _ = fs::remove_dir_all(root);
    }
}
