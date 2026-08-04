import { invoke } from "@tauri-apps/api/core";
import type { GeneratedReportSummary, PaginatedResult } from "../../../shared/types/domain";

/** Typed boundary between the generated reports feature and Tauri commands. */
export const generatedReportsService = {
  list: (offset: number, limit: number) => invoke<PaginatedResult<GeneratedReportSummary>>("list_generated_reports", { offset, limit }),
  openDocument: (reportPath: string) => invoke<void>("open_generated_report", { reportPath }),
  openFolder: (folderPath: string) => invoke<void>("open_generated_report_folder", { folderPath })
};
