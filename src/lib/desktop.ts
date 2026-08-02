import { invoke } from "@tauri-apps/api/core";
import type { Person, Report, ReportDraft } from "./models";

export const desktop = {
  listPeople: () => invoke<Person[]>("list_people"),
  listReports: () => invoke<Report[]>("list_reports"),
  createReport: (draft: ReportDraft) => invoke<Report>("create_report", { draft })
};
