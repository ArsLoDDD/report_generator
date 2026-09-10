use super::*;

#[tauri::command]
pub(crate) fn get_startup_warnings(state: tauri::State<AppState>) -> Vec<StartupWarning> {
    let mut warnings = state.1.clone();
    let Ok(database) = state.0.lock() else {
        return warnings;
    };
    let missing = database.connection.prepare(
        "SELECT trim(p.surname||' '||p.given_name||' '||p.patronymic), GROUP_CONCAT(DISTINCT c.name)
         FROM personnel p
         JOIN (
           SELECT crew_id,personnel_id FROM crew_members WHERE left_at IS NULL
           UNION SELECT crew_id,personnel_id FROM crew_actual_members
         ) membership ON membership.personnel_id=p.id
         JOIN crews c ON c.id=membership.crew_id
         WHERE trim(COALESCE(p.callsign,''))=''
         GROUP BY p.id ORDER BY p.surname,p.given_name,p.patronymic",
    ).and_then(|mut statement| {
        statement.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
            .collect::<Result<Vec<_>, _>>()
    }).unwrap_or_default();
    if !missing.is_empty() {
        let preview = missing
            .iter()
            .take(8)
            .map(|(name, crews)| format!("{name} — {crews}"))
            .collect::<Vec<_>>()
            .join("; ");
        let tail = if missing.len() > 8 {
            format!("; та ще {}", missing.len() - 8)
        } else {
            String::new()
        };
        warnings.push(StartupWarning {
            code: "crew-callsign-missing".into(),
            title: format!("Немає позивних у складі екіпажів: {}", missing.len()),
            message: format!("Заповніть поле «Позивний» в особовому складі: {preview}{tail}. Без цього план польотів не експортується."),
        });
    }
    warnings
}

#[tauri::command]
pub(crate) fn get_app_settings(app: tauri::AppHandle) -> Result<settings::AppSettings, String> {
    settings::load(&application_root(&app)?)
}

#[tauri::command]
pub(crate) fn update_signer_settings(
    app: tauri::AppHandle,
    role: String,
    signer: settings::SignerSettings,
) -> Result<settings::AppSettings, String> {
    settings::update_signer(&application_root(&app)?, &role, signer)
}

#[tauri::command]
pub(crate) fn add_signer(
    app: tauri::AppHandle,
    name: String,
    signer: settings::SignerSettings,
) -> Result<settings::AppSettings, String> {
    settings::add_signer(&application_root(&app)?, name, signer)
}

#[tauri::command]
pub(crate) fn delete_signer(
    app: tauri::AppHandle,
    id: String,
) -> Result<settings::AppSettings, String> {
    settings::delete_signer(&application_root(&app)?, &id)
}

#[tauri::command]
pub(crate) fn update_visible_personnel_columns(
    app: tauri::AppHandle,
    columns: Vec<String>,
) -> Result<settings::AppSettings, String> {
    settings::update_visible_personnel_columns(&application_root(&app)?, columns)
}

#[tauri::command]
pub(crate) fn update_visible_vehicle_columns(
    app: tauri::AppHandle,
    columns: Vec<String>,
) -> Result<settings::AppSettings, String> {
    settings::update_visible_vehicle_columns(&application_root(&app)?, columns)
}

#[tauri::command]
pub(crate) fn update_unit_settings(
    app: tauri::AppHandle,
    unit: settings::UnitSettings,
) -> Result<settings::AppSettings, String> {
    settings::update_unit_settings(&application_root(&app)?, unit)
}
