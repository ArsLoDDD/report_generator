import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, SignerSettings, UnitSettings } from "../../../shared/types/domain";

export type UpdateStatus = {
  currentVersion: string;
  supported: boolean;
  dataDirectory: string;
};

export type OfflineUpdateInfo = {
  currentVersion: string;
  version: string;
  edition: string;
  architecture: string;
  notes: string;
  sizeBytes: number;
};

const mutateSettings = <T>(command: string, args?: Record<string, unknown>) => Promise.resolve(invoke<T>(command, args)).then((result) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("settings-updated", { detail: { command } }));
  return result;
});

export const settingsService = {
  get: () => invoke<AppSettings>("get_app_settings"),
  updateSigner: (role: string, signer: SignerSettings) => mutateSettings<AppSettings>("update_signer_settings", { role, signer }),
  addSigner: (name: string, signer: SignerSettings) => mutateSettings<AppSettings>("add_signer", { name, signer }),
  deleteSigner: (id: string) => mutateSettings<AppSettings>("delete_signer", { id }),
  updateVisiblePersonnelColumns: (columns: string[]) => invoke<AppSettings>("update_visible_personnel_columns", { columns }),
  updateVisibleVehicleColumns: (columns: string[]) => invoke<AppSettings>("update_visible_vehicle_columns", { columns }),
  updateUnit: (unit: UnitSettings) => mutateSettings<AppSettings>("update_unit_settings", { unit }),
  openApplicationDirectory: () => invoke<void>("open_application_directory"),
  createDatabaseBackup: () => invoke<string>("create_database_backup"),
  getUpdateStatus: () => invoke<UpdateStatus>("get_update_status"),
  inspectOfflineUpdate: (path: string) => invoke<OfflineUpdateInfo>("inspect_offline_update", { path }),
  installOfflineUpdate: (path: string) => invoke<void>("install_offline_update", { path }),
  exportApplicationData: (path: string, options: { database: boolean; settings: boolean; customVariables: boolean; templates: boolean; reports: boolean }) => invoke<void>("export_application_data", { path, options }),
  importApplicationData: (path: string) => invoke<void>("import_application_data", { path })
};
