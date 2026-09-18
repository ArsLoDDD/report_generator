import { invoke } from "@tauri-apps/api/core";
import type { ManualPersonnelLocation, PersonnelControlDraft, PersonnelControlHistoryEvent, PersonnelControlRecord } from "../types";

export const personnelControlService = {
  list: () => invoke<PersonnelControlRecord[]>("list_personnel_control_records"),
  save: (assignmentId: number | null, draft: PersonnelControlDraft) => invoke<number>("save_personnel_control_assignment", { assignmentId, draft }),
  close: (assignmentId: number, endDate: string, reason: string, nextLocation: ManualPersonnelLocation) => invoke<void>("close_personnel_control_assignment", { assignmentId, endDate, reason, nextLocation }),
  history: (personnelId: number | null = null, limit = 100, offset = 0) => invoke<PersonnelControlHistoryEvent[]>("list_personnel_control_history", { personnelId, limit, offset }),
};
