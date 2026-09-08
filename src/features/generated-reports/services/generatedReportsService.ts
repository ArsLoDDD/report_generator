import { invoke } from "@tauri-apps/api/core";
import type { GeneratedReportSummary, PaginatedResult } from "../../../shared/types/domain";

/** Typed boundary between the generated reports feature and Tauri commands. */
export const generatedReportsService = {
  list: (offset: number, limit: number, filters: { query?: string; fromDate?: string } = {}) => invoke<PaginatedResult<GeneratedReportSummary>>("list_generated_reports", {
    offset,
    limit,
    query: filters.query?.trim() || null,
    fromDate: filters.fromDate || null,
  }),
  openDocument: (reportPath: string) => invoke<void>("open_generated_report", { reportPath }),
  openFolder: (folderPath: string) => invoke<void>("open_generated_report_folder", { folderPath }),
  delete: (reportPaths: string[]) => invoke<void>("delete_generated_reports", { reportPaths })
};
