import { invoke } from "@tauri-apps/api/core";
import type { Crew, CrewDraft, Equipment, EquipmentCategory, EquipmentDraft, Incident, IncidentDraft } from "../types";

export const operationsService = {
  listCrews: () => invoke<Crew[]>("list_crews"),
  createCrew: (draft: CrewDraft) => invoke<void>("create_crew", { draft }),
  updateCrew: (crewId: number, draft: CrewDraft) => invoke<void>("update_crew", { crewId, draft }),
  deleteCrew: (crewId: number) => invoke<void>("delete_crew", { crewId }),
  listEquipment: (category: EquipmentCategory) => invoke<Equipment[]>("list_equipment", { category }),
  createEquipment: (draft: EquipmentDraft) => invoke<void>("create_equipment", { draft }),
  deleteEquipment: (equipmentId: number) => invoke<void>("delete_equipment", { equipmentId }),
  listIncidents: () => invoke<Incident[]>("list_incidents"),
  createIncident: (draft: IncidentDraft) => invoke<void>("create_incident", { draft }),
};
