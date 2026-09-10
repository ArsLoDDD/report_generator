import type { GenerationParameterField } from "../../shared/template-language/registry";

export type ReportVehicle = { id: number; name: string; registrationNumber: string; status: string; driverName: string | null };
export type ReportCrew = { id: number; name: string; platoon: string; positionName: string; reconnaissanceArea: string; memberCount: number };
export type ReportEquipment = { id: number; category: string; name: string; inventoryNumber: string; status: string; crewName: string | null; holderName: string | null };
export type ReportPosition = { id: number; name: string; positionType: string; stripName: string; locality: string; condition: string; crewName: string | null };
export type ParameterToken = { token: string; field: GenerationParameterField };
export type RequirementItem = { id: number; cells: string[]; summary: string };

