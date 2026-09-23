import { invoke } from "@tauri-apps/api/core";
import type { Crew, CrewDraft, Equipment, EquipmentCategory, EquipmentDraft, FlightJournalDraft, FlightJournalEntry, FlightPlanCrewLocationAssignment, FlightPlanRequest, Incident, IncidentDraft, Position, PositionDraft, PositionWork, PositionWorkDraft, PositionWorkStatusEvent, StaffRecommendation, StaffingRecord, VacancyRecommendation, WorkshopDraft, WorkshopProduct } from "../types";

const mutate = <T>(command: string, args?: Record<string, unknown>) => Promise.resolve(invoke<T>(command, args)).then((result) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("operational-data-updated", { detail: { command } }));
  return result;
});

export const operationsService = {
  listCrews: () => invoke<Crew[]>("list_crews"),
  createCrew: (draft: CrewDraft) => mutate<void>("create_crew", { draft }),
  updateCrew: (crewId: number, draft: CrewDraft) => mutate<void>("update_crew", { crewId, draft }),
  deleteCrew: (crewId: number) => mutate<void>("delete_crew", { crewId }),
  listTemporaryPersonnel: () => invoke<import("../types").TemporaryPerson[]>("list_temporary_personnel"),
  saveTemporaryPersonnel: (person: import("../types").TemporaryPerson) => mutate<void>("save_temporary_personnel", { person }),
  deleteTemporaryPersonnel: (personId: number) => mutate<void>("delete_temporary_personnel", { personId }),
  listStaffingRecords: () => invoke<StaffingRecord[]>("list_staffing_records"),
  listStaffingRecordsForDate: (targetDate: string) => invoke<StaffingRecord[]>("list_staffing_records_for_date", { targetDate }),
  syncFlightPlanLocations: (planDate: string, assignments: FlightPlanCrewLocationAssignment[]) => mutate<void>("sync_flight_plan_locations", { planDate, assignments }),
  updateStaffingPersonnel: (payload: { personnelId: number; position: string; actingPosition: string; currentLocation: string; functionalDuties: string; notes: string }) => mutate<void>("update_staffing_personnel", payload),
  transferStaffingChain: (assignments: import("../staffing-slots").SlotTransfer[], actingChanges: import("../staffing-slots").ActingChange[] = []) => mutate<void>("transfer_staffing_chain", { assignments, actingChanges }),
  createStaffRecommendation: (payload: { personnelId: number; positionName: string; issuedAt: string; notes: string }) => invoke<void>("create_staff_recommendation", payload),
  listStaffRecommendations: () => invoke<StaffRecommendation[]>("list_staff_recommendations"),
  createVacancyRecommendation: (payload: { slotId?: string; positionName: string; fullName: string; phone: string; rank: string; birthDate: string; issuedAt: string; notes: string }) => invoke<void>("create_vacancy_recommendation", payload),
  listVacancyRecommendations: () => invoke<VacancyRecommendation[]>("list_vacancy_recommendations"),
  updateBcsCrewStrength: (crewId: number, value: number) => mutate<void>("update_bcs_crew_strength", { crewId, value }),
  exportBcs: (path: string, unitName: string, date: string, rows: import("../bcs-model").BcsExportRow[]) => invoke<void>("export_bcs_excel", { path, unitName, date, rows }),
  exportFlightPlan: (path: string, request: FlightPlanRequest) => invoke<void>("export_flight_plan_excel", { path, request }),
  saveFlightPlanSnapshot: (planDate: string, request: FlightPlanRequest) => mutate<void>("save_flight_plan_snapshot", { planDate, request }),
  getFlightPlanSnapshot: (planDate: string) => invoke<string | null>("get_flight_plan_snapshot", { planDate }),
  listPositions: () => invoke<Position[]>("list_positions"),
  createPosition: (draft: PositionDraft) => mutate<number>("create_position", { draft }),
  updatePosition: (positionId: number, draft: PositionDraft) => mutate<void>("update_position", { positionId, draft }),
  deletePosition: (positionId: number) => mutate<void>("delete_position", { positionId }),
  listPositionWork: () => invoke<PositionWork[]>("list_position_work"),
  listPositionWorkStatusHistory: () => invoke<PositionWorkStatusEvent[]>("list_position_work_status_history"),
  savePositionWork: (workId: number | null, draft: PositionWorkDraft) => mutate<void>("save_position_work", { workId, draft }),
  deletePositionWork: (workId: number) => mutate<void>("delete_position_work", { workId }),
  listEquipment: (category: EquipmentCategory) => invoke<Equipment[]>("list_equipment", { category }),
  createEquipment: (draft: EquipmentDraft) => mutate<void>("create_equipment", { draft }),
  updateEquipment: (equipmentId: number, draft: EquipmentDraft) => mutate<void>("update_equipment", { equipmentId, draft }),
  assignEquipment: (equipmentId: number, crewId: number | null, quantity?: number) => mutate<void>("assign_equipment", { equipmentId, crewId, quantity }),
  deleteEquipment: (equipmentId: number) => mutate<void>("delete_equipment", { equipmentId }),
  listWorkshopProducts: () => invoke<WorkshopProduct[]>("list_workshop_products"),
  createWorkshopProduct: (draft: WorkshopDraft) => mutate<void>("create_workshop_product", { draft }),
  listIncidents: () => invoke<Incident[]>("list_incidents"),
  createIncident: (draft: IncidentDraft) => mutate<void>("create_incident", { draft }),
  listFlightJournalEntries: () => invoke<FlightJournalEntry[]>("list_flight_journal_entries"),
  createFlightJournalEntry: (draft: FlightJournalDraft) => mutate<void>("create_flight_journal_entry", { draft }),
};
