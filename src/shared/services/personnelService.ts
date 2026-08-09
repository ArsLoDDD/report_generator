import { invoke } from "@tauri-apps/api/core";
import type { CustomFieldDefinition, PaginatedResult, Person, PersonnelDraft } from "../types/domain";

/** The single typed boundary between React features and Tauri personnel commands. */
export const personnelService = {
  list: (offset: number, limit: number) => invoke<PaginatedResult<Person>>("list_personnel", { offset, limit }),
  create: (draft: PersonnelDraft) => invoke<Person>("create_personnel", { draft }),
  update: (personnelId: number, draft: PersonnelDraft) => invoke<Person>("update_personnel", { personnelId, draft }),
  delete: (personnelId: number) => invoke<void>("delete_personnel", { personnelId }),
  listCustomFields: () => invoke<CustomFieldDefinition[]>("list_custom_fields"),
  createCustomField: (field: CustomFieldDefinition) => invoke<CustomFieldDefinition>("create_custom_field", { field })
};
