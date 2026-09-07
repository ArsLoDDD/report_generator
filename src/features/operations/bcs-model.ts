import schema from "../../shared/bcs-schema.json";
import type { StaffingRecord, TemporaryPerson } from "./types";

export const BCS_HEADERS = schema.headers;
export const BCS_LOCATIONS = schema.locations;
export type BcsExportRow = { isTemporary: boolean; isExternal: boolean; section: string; colorKey: string; positionName: string; battleOrder: string; sector: string; crewName: string; crewActual: string; crewOfficial: string; crewStatus: string; uavName: string; uavType: string; personnelPosition: string; rank: string; fullName: string; duties: string; location: string; notes: string };

const normalize = (value: string) => value.toLocaleLowerCase("uk").replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
export const CREW_WORKING_LOCATIONS = ["На позиції", "ЗБЗ", "ПБЗ", "Реко та облаштування", "Логістика на позиції", "ГШР", "ОХ", "ЗАБ"] as const;
export function isCrewWorkingLocation(value: string) {
  const location = normalize(value);
  return CREW_WORKING_LOCATIONS.some((item) => normalize(item) === location);
}
export function crewWorkingStrength(records: StaffingRecord[], crewId: number | null) {
  if (crewId == null) return 0;
  return new Set(records.filter((person) => !person.isCrewPlaceholder && person.crewId === crewId && isCrewWorkingLocation(person.currentLocation)).map((person) => person.personnelId)).size;
}
export function specializedStructuralGroup(section: string, group: string) {
  const candidates=[group,section].map((value)=>value.trim()).filter(Boolean);
  return candidates.find((value)=>/відділен/iu.test(value)&&!/^окремі\s+відділення$/iu.test(value)&&!/^(?:\d+|перш(?:е|ий)|друг(?:е|ий)|трет(?:є|ій)|четверт(?:е|ий))\s+відділен/iu.test(value));
}
const companyManagement = [
  /^командир роти(?=\s|$)/, /^заступник командира роти(?=\s|$)/, /^заступник командира(?=\s|$)/,
  /^головний сержант(?!\s*-?\s*командир)/, /^старший технік(?=\s|$)/, /^технік(?=\s|$)/,
  /^сержант (із|з) матеріального забезпечення(?=\s|$)/, /^старший бойовий медик(?=\s|$)/,
  /^бойовий медик(?=\s|$)/, /^водій-електрик(?=\s|$)/, /^водій(?=\s|$)/,
];

export function bcsSection(record: StaffingRecord) {
  if (record.isExternal) return record.bcsGroupName || (record.isTemporary ? "Тимчасово прибулі" : "");
  const position = normalize(record.position);
  if (/^командир взводу(?=\s|$)/u.test(position)) return "Управління взводів";
  if (record.crewId) return "Екіпаж";
  if (record.bcsStructureKind === "company") return "Управління роти";
  if (record.bcsStructureKind === "special") return record.bcsGroupName || "";
  if (record.bcsStructureKind === "ordinary") return "";
  const hasStructuralOwner = /(?:^|\s)(?:\S*взвод\S*|\S*відділен\S*)(?=\s|$)/u.test(position);
  if (!hasStructuralOwner && companyManagement.some((pattern) => pattern.test(position))) return "Управління роти";
  if (record.bcsGroupName) return record.bcsGroupName;
  return "";
}

export function canonicalCrewStatus(value: string) {
  const status = normalize(value).replace(/\s/g, "");
  if (status.startsWith("форм")) return "Формується";
  if (status.startsWith("прац") || status === "активний") return "Працюючий";
  return "Не активний";
}

export function bcsColorKey(record: StaffingRecord, section = bcsSection(record)) {
  if (record.isExternal) return section === "Прикомандировані" ? "attached" : "temporary";
  if (section === "Екіпаж") {
    const status = canonicalCrewStatus(record.crewStatus);
    if (status === "Працюючий") return "crew-working";
    if (status === "Формується") return "crew-forming";
    return "crew-inactive";
  }
  if (section === "Управління роти") return "company-management";
  if (section === "Управління взводів") return "platoon-management";
  if (section) return "independent";
  return "unassigned";
}

const sectionOrder = (section: string, first: StaffingRecord) => {
  if (section === "Екіпаж") return 0;
  if (section === "Управління роти") return 1;
  if (section === "Управління взводів") return 2;
  if (!first.isExternal && section) return 3;
  if (!first.isExternal) return 4;
  if (section === "Прикомандировані") return 5;
  if (section === "Тимчасово прибулі") return 6;
  return 7;
};

export function bcsGroups(records: StaffingRecord[]) {
  const groups = new Map<string, StaffingRecord[]>();
  const orderedRecords = [...new Map(records.map((person) => [person.personnelId, person])).values()]
    .sort((left, right) => (left.bcsOrder ?? Number.MAX_SAFE_INTEGER) - (right.bcsOrder ?? Number.MAX_SAFE_INTEGER));
  for (const record of orderedRecords) {
    const section = bcsSection(record);
    const owner = section === "Екіпаж" ? `crew-${record.crewId}` : record.isExternal ? `external-${section}` : section || "unassigned";
    groups.set(owner, [...(groups.get(owner) ?? []), record]);
  }
  const crewStatusOrder=(record:StaffingRecord)=>canonicalCrewStatus(record.crewStatus)==="Працюючий"?0:canonicalCrewStatus(record.crewStatus)==="Формується"?1:2;
  return [...groups].map(([key, people]) => ({ key, people, section: bcsSection(people[0]), colorKey: bcsColorKey(people[0]), order: Math.min(...people.map((person) => person.bcsOrder ?? Number.MAX_SAFE_INTEGER)) }))
    .sort((left, right) => sectionOrder(left.section, left.people[0]) - sectionOrder(right.section, right.people[0]) || (left.section==="Екіпаж"?crewStatusOrder(left.people[0])-crewStatusOrder(right.people[0]):0) || (left.section==="Екіпаж"?(left.people[0].crewName || "").localeCompare(right.people[0].crewName || "", "uk"):left.order-right.order) || left.section.localeCompare(right.section, "uk"));
}

export function bcsExportRows(records: StaffingRecord[]): BcsExportRow[] {
  return bcsGroups(records).flatMap(({ people, section, colorKey }) => {
    return people.map((person) => ({
    isTemporary: !!person.isTemporary, isExternal: !!person.isExternal, section, colorKey, positionName: section === "Екіпаж" ? person.crewPositionName : "", battleOrder: section === "Екіпаж" ? person.battleOrder : "", sector: section === "Екіпаж" ? person.sector : "",
    crewName: section === "Екіпаж" ? person.crewName || "" : "", crewActual: section === "Екіпаж" ? String(crewWorkingStrength(records, person.crewId)) : "",
    crewOfficial: String(section === "Екіпаж" ? person.actualStrength : people.length), crewStatus: section === "Екіпаж" ? canonicalCrewStatus(person.crewStatus) : "", uavName: section === "Екіпаж" ? person.uavName : "", uavType: section === "Екіпаж" ? person.uavType : "",
    personnelPosition: person.position, rank: person.rank, fullName: person.fullName, duties: person.functionalDuties, location: person.currentLocation, notes: person.notes,
    }));
  });
}

export function bcsSummary(records: StaffingRecord[], authorized: number) {
  const people = [...new Map(records.filter((person)=>!person.isCrewPlaceholder).map((person) => [person.personnelId, person])).values()];
  const own = people.filter((person) => !person.isExternal);
  const count = (location: string) => people.filter((person) => person.currentLocation === location).length;
  const absent = new Set(["ВІДП", "ЛІК", "НАВЧ", "ВІДР", "Відкомандировані", "СЗЧ"]);
  return [
    ["По штату", authorized], ["По списку", own.length], ["В наявності", own.filter((person) => !absent.has(person.currentLocation)).length],
    ["Відпустка", count("ВІДП")], ["Шпиталь", count("ЛІК")], ["Відрядження", count("НАВЧ") + count("ВІДР")],
    ["Відкомандировані", count("Відкомандировані")], ["Прикомандировані", people.filter((person) => person.isExternal && person.bcsGroupName === "Прикомандировані").length], ["ПТЗ Новостав", count("ПТЗ Новостав")], ["СЗЧ", count("СЗЧ")], ["Тимчасово прибулі", people.filter((person) => person.isTemporary).length],
  ] as const;
}

export function bcsFunctionalSummary(records: StaffingRecord[]) {
  const groups = bcsGroups(records);
  const crews = groups.filter(({ section }) => section === "Екіпаж");
  const wings = crews.filter(({ people }) => /крил|літак/iu.test(people[0].uavType));
  const status = (pattern: RegExp) => crews.filter(({ people }) => pattern.test(people[0].crewStatus)).length;
  const sectionCount = (name: string) => groups.filter((group) => group.section === name).reduce((sum, group) => sum + group.people.length, 0);
  return [
    ["Екіпажі крил (ос-загальна)", wings.reduce((sum, group) => sum + group.people[0].actualStrength, 0)],
    ["Екіпажі крил (ос-в задіяні)", wings.reduce((sum, group) => sum + crewWorkingStrength(records, group.people[0].crewId), 0)],
    ["Екіпажі крил (екіпажі)", wings.length], ["Екіпажі - формуються", status(/^форм/iu)],
    ["Екіпажі - працюючі", status(/^прац/iu)], ["Екіпажі - не активні", status(/^не.?актив/iu)],
    ["Управління роти", sectionCount("Управління роти")], ["Управління взводів", sectionCount("Управління взводів")],
    ["Відділення збору та обробки інформації", sectionCount("Відділення збору та обробки інформації")],
  ] as const;
}

export function temporaryStaffingRecord(person: TemporaryPerson): StaffingRecord {
  const section = person.category === "Інша підгрупа" ? person.groupName.trim() || "Інша підгрупа" : person.category;
  return { isTemporary: person.category === "Тимчасово прибулі", isExternal: true, bcsGroupName: section, personnelId: -person.id, fullName: person.fullName, rank: person.rank, position: "", crewId: null, crewName: null, platoon: "", companyName: "", unitType: section, crewPositionName: "", battleOrder: "", sector: "", officialStrength: 0, actualStrength: 0, crewStatus: "", uavName: "", uavType: "", functionalDuties: person.duties, currentLocation: person.currentLocation, bcsStatus: "", notes: person.notes, actingPosition: "", recommendationCount: 0 };
}
