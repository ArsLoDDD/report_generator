use super::*;

#[tauri::command]
pub(crate) fn get_startup_warnings(state: tauri::State<AppState>) -> Vec<StartupWarning> {
    state.1.clone()
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
