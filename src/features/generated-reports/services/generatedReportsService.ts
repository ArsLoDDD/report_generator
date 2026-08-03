import { invoke } from "@tauri-apps/api/core";
import type { GeneratedReportSummary } from "../../../shared/types/domain";

/** Typed boundary between the generated reports feature and Tauri commands. */
export const generatedReportsService = {
  list: () => invoke<GeneratedReportSummary[]>("list_generated_reports"),
  openDocument: (reportPath: string) => invoke<void>("open_generated_report", { reportPath }),
  openFolder: (folderPath: string) => invoke<void>("open_generated_report_folder", { folderPath })
};
