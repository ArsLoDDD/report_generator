import { invoke } from "@tauri-apps/api/core";
import type { SummaryDocument } from "../summary-report-model";

export type SummaryDraftState = { current: string | null; previous: string | null };
export const summaryReportService = {
  loadDraft: (reportDate: string) => invoke<SummaryDraftState>("load_summary_report_draft", { reportDate }),
  saveDraft: (reportDate: string, manualJson: string) => invoke<void>("save_summary_report_draft", { reportDate, manualJson }),
  render: (document: SummaryDocument) => invoke<number[]>("render_summary_report_preview", { document }),
  export: (path: string, document: SummaryDocument) => invoke<void>("export_summary_report", { path, document }),
  open: (path: string) => invoke<void>("open_summary_report", { path }),
};
