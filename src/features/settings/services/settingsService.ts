import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, SignerSettings, UnitSettings } from "../../../shared/types/domain";

export const settingsService = {
  get: () => invoke<AppSettings>("get_app_settings"),
  updateSigner: (role: string, signer: SignerSettings) => invoke<AppSettings>("update_signer_settings", { role, signer }),
  addSigner: (name: string, signer: SignerSettings) => invoke<AppSettings>("add_signer", { name, signer }),
  deleteSigner: (id: string) => invoke<AppSettings>("delete_signer", { id }),
  updateVisiblePersonnelColumns: (columns: string[]) => invoke<AppSettings>("update_visible_personnel_columns", { columns }),
  updateVisibleVehicleColumns: (columns: string[]) => invoke<AppSettings>("update_visible_vehicle_columns", { columns }),
  updateUnit: (unit: UnitSettings) => invoke<AppSettings>("update_unit_settings", { unit }),
  openApplicationDirectory: () => invoke<void>("open_application_directory"),
  createDatabaseBackup: () => invoke<string>("create_database_backup"),
  exportApplicationData: (path: string, options: { database: boolean; settings: boolean; customVariables: boolean; templates: boolean; reports: boolean }) => invoke<void>("export_application_data", { path, options }),
  importApplicationData: (path: string) => invoke<void>("import_application_data", { path })
};
