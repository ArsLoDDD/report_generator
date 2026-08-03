import { invoke } from "@tauri-apps/api/core";
import type { StartupWarning } from "../../shared/types/domain";

/** Typed application-level diagnostics boundary. */
export const applicationService = {
  getStartupWarnings: () => invoke<StartupWarning[]>("get_startup_warnings")
};
