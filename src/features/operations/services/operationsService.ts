import { invoke } from "@tauri-apps/api/core";
import type { Crew, CrewDraft, Equipment, EquipmentCategory, EquipmentDraft, Incident, IncidentDraft, Position, PositionDraft, StaffRecommendation, StaffingRecord, VacancyRecommendation } from "../types";

export const operationsService = {
  listCrews: () => invoke<Crew[]>("list_crews"),
  createCrew: (draft: CrewDraft) => invoke<void>("create_crew", { draft }),
  updateCrew: (crewId: number, draft: CrewDraft) => invoke<void>("update_crew", { crewId, draft }),
  deleteCrew: (crewId: number) => invoke<void>("delete_crew", { crewId }),
  listStaffingRecords: () => invoke<StaffingRecord[]>("list_staffing_records"),
  updateStaffingPersonnel: (payload: { personnelId: number; position: string; actingPosition: string; currentLocation: string; notes: string }) => invoke<void>("update_staffing_personnel", payload),
  transferStaffingChain: (assignments: Array<{ personnelId: number; position: string }>) => invoke<void>("transfer_staffing_chain", { assignments }),
  createStaffRecommendation: (payload: { personnelId: number; positionName: string; issuedAt: string; notes: string }) => invoke<void>("create_staff_recommendation", payload),
  listStaffRecommendations: () => invoke<StaffRecommendation[]>("list_staff_recommendations"),
  createVacancyRecommendation: (payload: { positionName: string; fullName: string; phone: string; rank: string; birthDate: string; issuedAt: string; notes: string }) => invoke<void>("create_vacancy_recommendation", payload),
  listVacancyRecommendations: () => invoke<VacancyRecommendation[]>("list_vacancy_recommendations"),
  exportBcs: (path: string, date: string) => invoke<void>("export_bcs_excel", { path, date }),
  listPositions: () => invoke<Position[]>("list_positions"),
  createPosition: (draft: PositionDraft) => invoke<void>("create_position", { draft }),
  updatePosition: (positionId: number, draft: PositionDraft) => invoke<void>("update_position", { positionId, draft }),
  deletePosition: (positionId: number) => invoke<void>("delete_position", { positionId }),
  listEquipment: (category: EquipmentCategory) => invoke<Equipment[]>("list_equipment", { category }),
  createEquipment: (draft: EquipmentDraft) => invoke<void>("create_equipment", { draft }),
  deleteEquipment: (equipmentId: number) => invoke<void>("delete_equipment", { equipmentId }),
  listIncidents: () => invoke<Incident[]>("list_incidents"),
  createIncident: (draft: IncidentDraft) => invoke<void>("create_incident", { draft }),
};
