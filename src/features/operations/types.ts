export type EquipmentCategory = "generator" | "uav" | "communications" | "weapon_ammo";

export type CrewMember = { personnelId: number; fullName: string; rank: string; position: string };
export type Crew = {
  id: number;
  name: string;
  platoon: string;
  positionName: string;
  reconnaissanceArea: string;
  memberCount: number;
  members: CrewMember[];
};
export type CrewDraft = {
  name: string;
  platoon: string;
  positionName: string;
  reconnaissanceArea: string;
  memberIds: number[];
};
export type Equipment = {
  id: number;
  category: EquipmentCategory;
  name: string;
  inventoryNumber: string;
  status: string;
  crewId: number | null;
  crewName: string | null;
  personnelId: number | null;
  holderName: string | null;
  notes: string;
};
export type EquipmentDraft = Omit<Equipment, "id" | "crewName" | "holderName">;
export type Incident = {
  id: number;
  incidentType: string;
  occurredAt: string;
  crewId: number | null;
  crewName: string | null;
  equipmentId: number | null;
  equipmentName: string | null;
  positionName: string;
  reconnaissanceArea: string;
  crewSnapshot: string;
  vehicleName: string;
  description: string;
};
export type IncidentDraft = Omit<Incident, "id" | "crewName" | "equipmentName" | "crewSnapshot" | "vehicleName">;
