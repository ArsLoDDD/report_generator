import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, SignerRole, SignerSettings } from "../../../shared/types/domain";

export const settingsService = {
  get: () => invoke<AppSettings>("get_app_settings"),
  updateSigner: (role: SignerRole, signer: SignerSettings) => invoke<AppSettings>("update_signer_settings", { role, signer }),
  updateVisiblePersonnelColumns: (columns: string[]) => invoke<AppSettings>("update_visible_personnel_columns", { columns }),
  updateVisibleVehicleColumns: (columns: string[]) => invoke<AppSettings>("update_visible_vehicle_columns", { columns }),
  openApplicationDirectory: () => invoke<void>("open_application_directory"),
  createDatabaseBackup: () => invoke<string>("create_database_backup"),
  exportApplicationData: (path: string, options: { database: boolean; settings: boolean; customVariables: boolean; templates: boolean; reports: boolean }) => invoke<void>("export_application_data", { path, options }),
  importApplicationData: (path: string) => invoke<void>("import_application_data", { path })
};
