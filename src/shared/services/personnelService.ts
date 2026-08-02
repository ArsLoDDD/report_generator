import { invoke } from "@tauri-apps/api/core";
import type { Person, PersonnelDraft } from "../types/domain";

/** The single typed boundary between React features and Tauri personnel commands. */
export const personnelService = {
  list: () => invoke<Person[]>("list_personnel"),
  create: (draft: PersonnelDraft) => invoke<Person>("create_personnel", { draft }),
  update: (personnelId: number, draft: PersonnelDraft) => invoke<Person>("update_personnel", { personnelId, draft })
};
