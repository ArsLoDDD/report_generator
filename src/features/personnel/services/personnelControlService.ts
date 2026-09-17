import { invoke } from "@tauri-apps/api/core";
import type { PersonnelControlDraft, PersonnelControlHistoryEvent, PersonnelControlRecord } from "../types";

export const personnelControlService = {
  list: () => invoke<PersonnelControlRecord[]>("list_personnel_control_records"),
  save: (assignmentId: number | null, draft: PersonnelControlDraft) => invoke<number>("save_personnel_control_assignment", { assignmentId, draft }),
  close: (assignmentId: number, endDate: string, reason = "") => invoke<void>("close_personnel_control_assignment", { assignmentId, endDate, reason }),
  history: (personnelId: number | null = null, limit = 100, offset = 0) => invoke<PersonnelControlHistoryEvent[]>("list_personnel_control_history", { personnelId, limit, offset }),
};
