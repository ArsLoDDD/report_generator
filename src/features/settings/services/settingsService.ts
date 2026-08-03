import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, SignerRole, SignerSettings } from "../../../shared/types/domain";

export const settingsService = {
  get: () => invoke<AppSettings>("get_app_settings"),
  updateSigner: (role: SignerRole, signer: SignerSettings) => invoke<AppSettings>("update_signer_settings", { role, signer }),
  openApplicationDirectory: () => invoke<void>("open_application_directory"),
  createDatabaseBackup: () => invoke<string>("create_database_backup")
};
