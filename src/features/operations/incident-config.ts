export type IncidentSubjectKind = "flight" | "person" | "vehicle" | "crew" | "crew-or-person" | "custom";

export type IncidentTypeConfig = {
  subject: IncidentSubjectKind;
  witnesses?: boolean;
  assets?: boolean;
  showCrewContext?: boolean;
};

const personnelTypes = new Set([
  "Поранення",
  "Загибель",
  "Травма",
  "СЗЧ",
  "Алкогольне/наркотичне сп’яніння",
  "Самогубство",
  "Втрата військового квитка/посвідчення УБД",
]);

const witnessTypes = new Set([
  "Травма",
  "СЗЧ",
  "Алкогольне/наркотичне сп’яніння",
  "Самогубство",
  "Втрата військового квитка/посвідчення УБД",
]);

const transportTypes = new Set(["Знищення машини", "Пошкодження машини", "ДТП"]);
const positionTypes = new Set(["Обстріл", "Знищення позиції"]);

export function incidentTypeConfig(incidentType: string): IncidentTypeConfig {
  if (incidentType === "Втрата БпЛА") return { subject: "flight", witnesses: true, assets: true, showCrewContext: true };
  if (incidentType === "Втрата майна") return { subject: "crew-or-person", assets: true, showCrewContext: true };
  if (personnelTypes.has(incidentType)) return { subject: "person", witnesses: witnessTypes.has(incidentType), assets: incidentType === "СЗЧ", showCrewContext: true };
  if (transportTypes.has(incidentType)) return { subject: "vehicle", showCrewContext: true };
  if (positionTypes.has(incidentType)) return { subject: "crew", assets: true, showCrewContext: true };
  return { subject: "custom" };
}

export function incidentTypeLabel(incident: { incidentType: string; customTypeName?: string }) {
  return incident.customTypeName?.trim() || incident.incidentType;
}

export function incidentShowsAssets(incidentType: string) {
  return Boolean(incidentTypeConfig(incidentType).assets);
}

export function incidentShowsPerson(incidentType: string) {
  return incidentTypeConfig(incidentType).subject === "person";
}

export function incidentShowsVehicle(incidentType: string) {
  return incidentTypeConfig(incidentType).subject === "vehicle";
}

export function incidentRequiresWitnesses(incidentType: string) {
  return Boolean(incidentTypeConfig(incidentType).witnesses);
}
