import type { AppSettings } from "../../shared/types/domain";
import type { Crew, Equipment, FlightJournalEntry, FlightPlanRequest, Position, PositionWork, StaffingRecord } from "./types";

export type SummaryTextItem = { id: string; text: string; date?: string; time?: string };
export type SummaryDutyItem = { id: string; personnelId: number | null; startDate: string; startTime: string; endDate: string; endTime: string };
export type SummaryCompositionItem = { id: string; count: string; uavKind: string; battleOrder: string; workStrip: string };
export type SummaryPositionItem = { id: string; workStrip: string; uavName: string; positionName: string; mgrs: string; locality: string };
export type SummaryFlightUav = { id: string; equipmentId: number | null; name: string; serialNumber: string };
export type SummaryFlightMember = { id: string; personnelId: number; fullName: string; rank: string; startDate: string; startTime: string; endDate: string; endTime: string };
export type SummaryFlightItem = { id: string; crewId: number; workStrip: string; positionName: string; mgrs: string; locality: string; unitShortName: string; crewName: string; taskArea: string; uavs: SummaryFlightUav[]; members: SummaryFlightMember[]; flightTimes: Array<{ date: string; time: string }> };
export type SummaryBlockLine = { text: string; bold?: boolean; kind?: "paragraph" | "item" | "continuation" };
export type SummaryShelling = { id: string; time: string; shellingType: string; target: string; direction: string; response: string };
export type SummaryManual = {
  reportNumber: string;
  enemyLosses: Record<string, string>;
  compositionOverride: boolean;
  compositionChanges: string;
  completeness: Record<string, string>;
  kspOutskirts: string;
  compositionItems: SummaryCompositionItem[] | null;
  positionItems: SummaryPositionItem[] | null;
  flightItems: SummaryFlightItem[] | null;
  rocketStrikes: string;
  airStrikes: string;
  va: string;
  sha: string;
  aa: string;
  enemyAssault: boolean;
  enemyAssaultText: string;
  shellings: SummaryShelling[];
  ownAssault: boolean;
  ownAssaultText: string;
  commandDuties: SummaryDutyItem[];
  guardDuties: SummaryDutyItem[];
  manualEvents: SummaryTextItem[];
  includedAutoEventIds: string[];
  autoEventEdits: Record<string, string>;
  autoOverrides: Record<string, string>;
  autoBaselines: Record<string, string>;
  commissionsOverride: boolean;
  commissions: string;
  fortificationOverride: boolean;
  fortification: string;
  dzvinOverride: boolean;
  dzvin: string;
  nextTasks: SummaryTextItem[];
  personnelLosses: Record<string, string>;
  equipmentLosses: Record<string, string>;
  equipmentLossesDetails: string;
  ammunitionExpenses: string;
  problems: string;
  otherIssues: SummaryTextItem[];
};

export type SummaryDocument = { values: Record<string, string>; shellingRows: Omit<SummaryShelling, "id">[]; blocks: Record<string, SummaryBlockLine[]> };

const emptyItem = (): SummaryTextItem => ({ id: crypto.randomUUID(), text: "" });
export const defaultSummaryManual = (): SummaryManual => ({
  reportNumber: "", enemyLosses: { personnel: "0", irreversible: "0", sanitary: "0", captured: "0", ovt: "0", ovtDestroyed: "0", ovtDamaged: "0", tanks: "0", tanksDestroyed: "0", tanksDamaged: "0", afv: "0", afvDestroyed: "0", afvDamaged: "0", artillery: "0", artilleryDestroyed: "0", artilleryDamaged: "0", mlrs: "0", mlrsDestroyed: "0", mlrsDamaged: "0", reb: "0", rebDestroyed: "0", rebDamaged: "0", vehicles: "0", vehiclesDestroyed: "0", vehiclesDamaged: "0", aircraft: "0", aircraftDestroyed: "0", aircraftDamaged: "0", uav: "0", uavDestroyed: "0", uavDamaged: "0", uavLoitering: "0", uavMolniya: "0", uavLancet: "0", uavReb: "0", specialEquipment: "0", specialEquipmentDestroyed: "0", specialEquipmentDamaged: "0", reconEquipment: "0", reconEquipmentDestroyed: "0", reconEquipmentDamaged: "0", uavControl: "0", uavControlDestroyed: "0", uavControlDamaged: "0", communications: "0", communicationsDestroyed: "0", communicationsDamaged: "0", commandPosts: "0", shelters: "0", commandPostsDestroyed: "0", commandPostsDamaged: "0", sheltersDamaged: "0", ammoDepots: "0", fuelDepots: "0", depotsDestroyed: "0", depotsDamaged: "0", airDefence: "0" },
  compositionOverride: false, compositionChanges: "Без змін", completeness: { personnel: "78", automotive: "75", uavType: "розвідувальні літакового типу", uav: "30", zbbr: "100", fuel: "30" }, kspOutskirts: "південні околиці", compositionItems: null, positionItems: null, flightItems: null,
  rocketStrikes: "0", airStrikes: "0", va: "0", sha: "0", aa: "0", enemyAssault: false, enemyAssaultText: "Не проводив.", shellings: [], ownAssault: false, ownAssaultText: "Не проводили.",
  commandDuties: [], guardDuties: [], manualEvents: [], includedAutoEventIds: [], autoEventEdits: {}, autoOverrides: {}, autoBaselines: {}, commissionsOverride: false, commissions: "В поточному періоді не працювали.", fortificationOverride: false, fortification: "Заходи з фортифікаційного обладнання не велись.", dzvinOverride: false, dzvin: "Зміни не відбувалися.", nextTasks: [emptyItem()],
  personnelLosses: { total: "0", irreversible: "0", combatIrreversible: "0", killed: "0", diedFromWounds: "0", other: "0", temporary: "0", combatTemporary: "0", wounded: "0", captured: "0", missing: "0", deserters: "0", szch: "0", sick: "0" }, equipmentLosses: { total: "0", destroyed: "0", damaged: "0", lost: "0", tanks: "0", tanksDestroyed: "0", tanksDamaged: "0", afv: "0", afvDestroyed: "0", afvDamaged: "0", artillery: "0", artilleryDestroyed: "0", artilleryDamaged: "0", airDefence: "0", airDefenceDestroyed: "0", airDefenceDamaged: "0", vehicles: "0", vehiclesDestroyed: "0", vehiclesDamaged: "0", reb: "0", rebDestroyed: "0", communications: "0", communicationsDestroyed: "0", uav: "0", uavLost: "0", uavDamaged: "0" }, equipmentLossesDetails: "", ammunitionExpenses: "", problems: "", otherIssues: [],
});

export const carryForwardSummary = (previous?: SummaryManual | null): SummaryManual => {
  const fresh = defaultSummaryManual();
  if (!previous) return fresh;
  return { ...fresh, reportNumber: previous.reportNumber, kspOutskirts: previous.kspOutskirts, compositionItems: null, positionItems: null, flightItems: null, commandDuties: previous.commandDuties.map((item) => ({ ...item, id: crypto.randomUUID() })), guardDuties: previous.guardDuties.map((item) => ({ ...item, id: crypto.randomUUID() })), nextTasks: previous.nextTasks.map((item) => ({ ...item, id: crypto.randomUUID() })), problems: previous.problems, otherIssues: previous.otherIssues.map((item) => ({ ...item, id: crypto.randomUUID() })) };
};

const pad = (value: number) => String(value).padStart(2, "0");
export const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const displayDate = (value: string) => { const [year, month, day] = value.split("-"); return `${day}.${month}.${year}`; };
export const shiftDate = (value: string, days: number) => { const [year, month, day] = value.split("-").map(Number); return isoDate(new Date(year, month - 1, day + days)); };
export const initialReportDate = (now = new Date()) => isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < 12 ? 1 : 0)));
export const canOpenNextReport = (reportDate: string, now = new Date()) => now >= new Date(`${reportDate}T18:01:00`);
export const reportPeriod = (reportDate: string) => ({ start: `${shiftDate(reportDate, -1)}T18:01`, end: `${reportDate}T18:00` });

const joinItems = (items: SummaryTextItem[], fallback = "Без змін") => items.map((item) => item.text.trim()).filter(Boolean).join("\n") || fallback;
const value = (record: Record<string, string>, key: string) => record[key]?.trim() || "0";
const planEntries = (snapshots: Array<FlightPlanRequest | null>) => snapshots.flatMap((snapshot) => snapshot?.entries ?? []);
const personName = (fullName: string) => { const [surname = "", given = "", ...patronymic] = fullName.trim().split(/\s+/u); return `${surname.toLocaleUpperCase("uk")} ${given} ${patronymic.join(" ")}`.trim(); };
const dutyPeriod = (item: SummaryDutyItem) => `з ${item.startTime || "час не вказано"} год ${displayDate(item.startDate)} по ${item.endTime || "час не вказано"} год ${displayDate(item.endDate)}`;
const dutyLines = (items: SummaryDutyItem[], staffing: StaffingRecord[], positionPersonnel: Set<number>, kind: "command" | "guard"): SummaryBlockLine[] => items.filter((item) => !item.personnelId || !positionPersonnel.has(item.personnelId)).reduce<SummaryBlockLine[]>((lines, item) => {
  const person = staffing.find((record) => record.personnelId === item.personnelId);
  const identity = person ? `${person.rank} ${personName(person.fullName)}` : "";
  if (identity && item.startDate && item.endDate) lines.push({ text: kind === "command" ? `-${identity} в період ${dutyPeriod(item)}.` : `В період ${dutyPeriod(item)} – ${identity};`, kind: "item" });
  return lines;
}, []);
const countWord = (count: number) => ["Нуль", "Один", "Два", "Три", "Чотири", "П’ять", "Шість", "Сім", "Вісім", "Дев’ять", "Десять"][count] ?? String(count);
const roleFromCrew = (crew: Crew) => /удар|fpv|фпв/iu.test(`${crew.uavType} ${crew.functionalDuties}`) ? "екіпажі ударних БпЛА літакового типу" : "екіпажі розвідувальних БпЛА літакового типу";
const crewCompositionItems = (crews: Crew[], positions: Position[], equipment: Equipment[], entries: ReturnType<typeof planEntries>): SummaryCompositionItem[] => {
  const groups = new Map<string, { crew: Crew; count: number; role: string; battleOrder: string; workStrip: string }>();
  [...new Set(entries.map((entry) => entry.crewId))].forEach((id) => {
    const crew = crews.find((item) => item.id === id); if (!crew) return;
    const entry = entries.find((item) => item.crewId === id);
    const position = positions.find((item) => item.id === crew.positionId);
    const plannedUavText = (entry?.uavSelections ?? []).map((selection) => equipment.find((item) => item.id === selection.equipmentId)).filter((item): item is Equipment => Boolean(item)).map((item) => `${item.uavType} ${item.name}`).join(" ");
    const role = plannedUavText ? roleFromCrew({ ...crew, uavType: plannedUavText }) : roleFromCrew(crew);
    const battleOrder = position?.battleOrder || crew.battleOrder;
    const workStrip = position?.stripName || crew.sector;
    const key = [role, battleOrder, workStrip].join("|");
    const current = groups.get(key); groups.set(key, { crew, count: (current?.count ?? 0) + 1, role, battleOrder, workStrip });
  });
  return [...groups.values()].map(({ crew, count, role, battleOrder, workStrip }) => ({ id: `auto-composition-${crew.id}-${battleOrder}-${workStrip}`, count: String(count), uavKind: role, battleOrder, workStrip }));
};
const crewPositionItems = (crews: Crew[], positions: Position[], equipment: Equipment[], entries: ReturnType<typeof planEntries>): SummaryPositionItem[] => [...new Set(entries.map((entry) => entry.crewId))].flatMap((id) => {
  const crew = crews.find((item) => item.id === id); if (!crew) return [];
  const position = positions.find((item) => item.id === crew.positionId);
  const entry = entries.find((item) => item.crewId === id);
  const uavNames = (entry?.uavSelections ?? []).map((selection) => equipment.find((item) => item.id === selection.equipmentId)?.name).filter((name): name is string => Boolean(name));
  return [{ id: `auto-position-${crew.id}`, workStrip: position?.stripName || crew.sector, uavName: uavNames.join(", ") || crew.uavName, positionName: position?.name || crew.positionName, mgrs: position?.mgrs || "", locality: position?.locality || "" }];
});
const compositionLines = (items: SummaryCompositionItem[], settings: AppSettings): SummaryBlockLine[] => items.map((item) => {
  const count = Math.max(0, Number(item.count) || 0);
  const noun = count === 1 ? item.uavKind.replace(/^екіпажі/u, "екіпаж") : item.uavKind;
  return { text: `${countWord(count)} ${noun} (${settings.unit.shortName || "назву не вказано"} ${settings.unit.militaryUnitShortName || settings.unit.unitCode || "військову частину не вказано"}) забезпечує виконання бойових (спеціальних) завдань в межах смуги оборони ${item.battleOrder || "БрО не вказано"} в оперативній взаємодії з підрозділами ${item.workStrip || "смугу роботи не вказано"};`, kind: "paragraph" };
});
const positionLines = (items: SummaryPositionItem[], settings: AppSettings): SummaryBlockLine[] => {
  const grouped = new Map<string, SummaryPositionItem[]>();
  items.forEach((item) => grouped.set(item.workStrip || "Смуга роботи не вказана", [...(grouped.get(item.workStrip || "Смуга роботи не вказана") ?? []), item]));
  return [...grouped.entries()].flatMap(([strip, rows]) => [
    { text: `Для виконання бойових (спеціальних) завдань в смузі оборони ${strip} ${settings.unit.armyCorpsNumber || "номер не вказано"} АК на глибину батальйонних районів оборони підрозділів виставлено:`, kind: "paragraph" as const },
    ...rows.map((item) => ({ text: `- стартову позицію БпАК «${item.uavName || "назву не вказано"}» – «${(item.positionName || "назву не вказано").toLocaleUpperCase("uk")}» (${item.mgrs || "координати не вказано"}) в районі ${item.locality || "населений пункт не вказано"};`, kind: "item" as const })),
  ]);
};

export function buildSummaryDocument(input: { reportDate: string; manual: SummaryManual; settings: AppSettings; crews: Crew[]; positions: Position[]; equipment?: Equipment[]; journal: FlightJournalEntry[]; snapshots: Array<FlightPlanRequest | null>; staffing?: StaffingRecord[]; positionWork?: PositionWork[] }): { document: SummaryDocument; warnings: string[]; automatic: Record<string, string>; objects: { compositionItems: SummaryCompositionItem[]; positionItems: SummaryPositionItem[]; flightItems: SummaryFlightItem[]; rotationEvents: SummaryTextItem[] } } {
  const { reportDate, manual, settings, crews, positions } = input;
  const period = reportPeriod(reportDate);
  const flights = input.journal.filter((flight) => flight.skyTime && `${flight.flightDate}T${flight.skyTime}` >= period.start && `${flight.flightDate}T${flight.skyTime}` <= period.end);
  const entries = planEntries(input.snapshots);
  const positionPersonnel = new Set(entries.flatMap((entry) => entry.actualMemberIds ?? []));
  const equipment = input.equipment ?? [];
  const automaticCompositionItems = crewCompositionItems(crews, positions, equipment, entries);
  const automaticPositionItems = crewPositionItems(crews, positions, equipment, entries);
  const selectedCompositionItems = [...automaticCompositionItems, ...(manual.compositionItems ?? []).filter((item) => !item.id.startsWith("auto-composition-"))];
  const selectedPositionItems = [...automaticPositionItems, ...(manual.positionItems ?? []).filter((item) => !item.id.startsWith("auto-position-"))];
  const forceComposition = compositionLines(selectedCompositionItems, settings).map((item) => item.text).join("\n") || "Екіпажі у плані польотів відсутні.";
  const positionText = positionLines(selectedPositionItems, settings).map((item) => item.text).join("\n") || "Позиції не визначені.";
  const datedEntries = input.snapshots.flatMap((snapshot, snapshotIndex) => (snapshot?.entries ?? []).map((entry, index) => ({ entry, index, date: snapshotIndex === 0 ? shiftDate(reportDate, -1) : reportDate })));
  const automaticFlightItems: SummaryFlightItem[] = [...new Set(datedEntries.map(({ entry }) => entry.crewId))].flatMap((crewId) => {
    const crew = crews.find((item) => item.id === crewId); if (!crew) return [];
    const position = positions.find((item) => item.id === crew.positionId);
    const stages = datedEntries.filter(({ entry }) => entry.crewId === crewId);
    const crewFlights = flights.filter((flight) => flight.crewId === crewId);
    const uavs = new Map<string, SummaryFlightUav>();
    stages.flatMap(({ entry }) => entry.uavSelections ?? []).forEach((selection) => { const asset = equipment.find((item) => item.id === selection.equipmentId); if (asset) uavs.set(`equipment-${asset.id}`, { id: `equipment-${asset.id}`, equipmentId: asset.id, name: asset.name, serialNumber: asset.inventoryNumber }); });
    crewFlights.forEach((flight) => { const key = `${flight.uavId ?? "journal"}-${flight.uavSerialNumber || flight.uavName}`; if (!uavs.has(key)) uavs.set(key, { id: key, equipmentId: flight.uavId, name: flight.uavName, serialNumber: flight.uavSerialNumber }); });
    if (!uavs.size && crew.uavName) uavs.set(`crew-${crew.id}`, { id: `crew-${crew.id}`, equipmentId: crew.primaryUavId ?? null, name: crew.uavName, serialNumber: "" });
    const members = new Map<number, SummaryFlightMember>();
    stages.forEach(({ entry, date }) => entry.actualMemberIds.forEach((personnelId) => {
      const member = [...(crew.members ?? []), ...(crew.actualMembers ?? [])].find((item) => item.personnelId === personnelId);
      const person = input.staffing?.find((item) => item.personnelId === personnelId);
      const previous = members.get(personnelId);
      members.set(personnelId, { id: `member-${crewId}-${personnelId}`, personnelId, fullName: member?.fullName || person?.fullName || "ПІБ не вказано", rank: member?.rank || person?.rank || "звання не вказано", startDate: previous?.startDate || date, startTime: previous?.startTime || entry.startTime || "18:01", endDate: date, endTime: entry.endTime || "18:00" });
    }));
    const latest = stages[stages.length - 1]?.entry;
    return [{ id: `auto-flight-${crewId}`, crewId, workStrip: position?.stripName || crew.sector, positionName: position?.name || crew.positionName, mgrs: position?.mgrs || "", locality: position?.locality || "", unitShortName: settings.unit.shortName, crewName: crew.name, taskArea: latest?.areaPoints?.join(", ") || crew.reconnaissanceArea || position?.locality || "", uavs: [...uavs.values()], members: [...members.values()], flightTimes: crewFlights.map((flight) => ({ date: flight.flightDate, time: flight.skyTime })) }];
  });
  const selectedFlightItems = manual.flightItems ?? automaticFlightItems;
  const flightLines: SummaryBlockLine[] = [];
  let previousStrip = "";
  selectedFlightItems.forEach((item) => {
    if (item.workStrip !== previousStrip) { flightLines.push({ text: `У межах смуги оборони ${item.workStrip || "смугу не вказано"}:`, bold: true, kind: "paragraph" }); previousStrip = item.workStrip; }
    const uavText = item.uavs.map((uav) => `${uav.name || "назву не вказано"}${uav.serialNumber ? `, серійний № ${uav.serialNumber}` : ""}`).join("; ") || "не вказано";
    flightLines.push({ text: `Із стартової позиції «${item.positionName || "позиція не вказана"}» (${item.mgrs || "координати не вказано"}) в районі ${item.locality || "населений пункт не вказано"} екіпажем ${item.unitShortName || "підрозділ не вказано"} «${item.crewName || "екіпаж не вказано"}» (БпЛА ${uavText}) виконується бойове чергування з повітряної розвідки в районі ${item.taskArea || "район не вказано"} у складі:`, kind: "paragraph" });
    item.members.forEach((member) => flightLines.push({ text: `-${member.rank} ${personName(member.fullName)} – з ${member.startTime || "18:01"} год ${displayDate(member.startDate)} по ${member.endTime || "18:00"} год ${displayDate(member.endDate)};`, kind: "item" }));
    if (!item.members.length) flightLines.push({ text: "-склад не вказаний;", kind: "item" });
    const times = item.flightTimes.map((flight) => `${displayDate(flight.date)} о ${flight.time} год`).join(", ");
    const noun = item.flightTimes.length === 1 ? "розвідувальний виліт" : `розвідувальні вильоти у кількості ${item.flightTimes.length}`;
    flightLines.push({ text: item.flightTimes.length ? `В період з 18:01 год ${displayDate(shiftDate(reportDate, -1))} по 18:00 год ${displayDate(reportDate)} здійснено ${noun}: ${times}. Більш детально в ІС «DELTA» за відповідними шарами.` : `В період з 18:01 год ${displayDate(shiftDate(reportDate, -1))} по 18:00 год ${displayDate(reportDate)} розвідувальні вильоти не здійснювалися.`, kind: "paragraph" });
  });
  if (!flightLines.length) flightLines.push({ text: "Екіпажі у плані польотів за звітний період відсутні.", kind: "paragraph" });
  const flightOperations = flightLines.map((item) => item.text).join("\n");
  const rotationEvents: SummaryTextItem[] = [];
  input.snapshots.forEach((snapshot, snapshotIndex) => {
    const eventDate = snapshotIndex === 0 ? shiftDate(reportDate, -1) : reportDate;
    const byCrew = new Map<number, typeof entries>();
    (snapshot?.entries ?? []).forEach((entry) => byCrew.set(entry.crewId, [...(byCrew.get(entry.crewId) ?? []), entry]));
    byCrew.forEach((stages, crewId) => stages.slice(1).forEach((next, index) => {
      const previous = stages[index]; const crew = crews.find((item) => item.id === crewId); const position = positions.find((item) => item.id === crew?.positionId);
      if (!crew || !position) return;
      const leaving = previous.actualMemberIds.filter((id) => !next.actualMemberIds.includes(id)).map((id) => crew.members.find((member) => member.personnelId === id)).filter((member): member is NonNullable<typeof member> => Boolean(member));
      const entering = next.actualMemberIds.filter((id) => !previous.actualMemberIds.includes(id)).map((id) => crew.members.find((member) => member.personnelId === id)).filter((member): member is NonNullable<typeof member> => Boolean(member));
      if (!leaving.length && !entering.length) return;
      const identityList = (members: typeof leaving) => members.map((member) => `${member.rank} ${personName(member.fullName)};`).join("\n") || "склад не вказаний;";
      const paragraphs = [
        leaving.length ? `${previous.endTime || "час не вказано"} год ${displayDate(eventDate)} завершив бойове чергування та виконання бойових (спеціальних) завдань з ведення повітряної розвідки противника з позиції «${position.name.toLocaleUpperCase("uk")}» (${position.mgrs || "координати не вказано"}) в районі ${position.locality || "не вказано"} екіпаж «${crew.name.toLocaleUpperCase("uk")}» та вибув в розташування ${settings.unit.shortName || "підрозділу"} у складі:\n${identityList(leaving)}` : "",
        entering.length ? `${next.startTime || "час не вказано"} год ${displayDate(eventDate)} приступив до бойового чергування та виконання бойових (спеціальних) завдань з ведення повітряної розвідки противника з позиції «${position.name.toLocaleUpperCase("uk")}» (${position.mgrs || "координати не вказано"}) в районі ${position.locality || "не вказано"} екіпаж «${crew.name.toLocaleUpperCase("uk")}» у складі:\n${identityList(entering)}` : "",
      ].filter(Boolean).join("\n");
      rotationEvents.push({ id: `rotation-${eventDate}-${crewId}-${index}`, date: eventDate, time: next.startTime, text: paragraphs });
    }));
  });
  const stagesByPosition = new Map<number, Array<{ crew: Crew; entry: (typeof datedEntries)[number]["entry"]; date: string }>>();
  datedEntries.forEach(({ entry, date }) => {
    const crew = crews.find((item) => item.id === entry.crewId);
    if (!crew?.positionId) return;
    stagesByPosition.set(crew.positionId, [...(stagesByPosition.get(crew.positionId) ?? []), { crew, entry, date }]);
  });
  stagesByPosition.forEach((stages, positionId) => {
    const sorted = [...stages].sort((left, right) => `${left.date}T${left.entry.startTime || "00:00"}`.localeCompare(`${right.date}T${right.entry.startTime || "00:00"}`));
    sorted.slice(1).forEach((next, index) => {
      const previous = sorted[index];
      if (previous.crew.id === next.crew.id) return;
      const position = positions.find((item) => item.id === positionId);
      if (!position) return;
      const identities = (crew: Crew, ids: number[]) => ids.map((id) => [...(crew.members ?? []), ...(crew.actualMembers ?? [])].find((member) => member.personnelId === id)).filter((member): member is NonNullable<typeof member> => Boolean(member)).map((member) => `${member.rank} ${personName(member.fullName)};`).join("\n") || "склад не вказаний;";
      const leavingTime = previous.entry.endTime || next.entry.startTime || "час не вказано";
      const enteringTime = next.entry.startTime || previous.entry.endTime || "час не вказано";
      rotationEvents.push({ id: `crew-change-${positionId}-${next.date}-${next.crew.id}-${index}`, date: next.date, time: enteringTime, text: `${leavingTime} год ${displayDate(next.date)} завершив бойове чергування та виконання бойових (спеціальних) завдань з ведення повітряної розвідки противника з позиції «${position.name.toLocaleUpperCase("uk")}» (${position.mgrs || "координати не вказано"}) в районі ${position.locality || "не вказано"} екіпаж «${previous.crew.name.toLocaleUpperCase("uk")}» та вибув в розташування ${settings.unit.shortName || "підрозділу"} у складі:\n${identities(previous.crew, previous.entry.actualMemberIds)}\n${enteringTime} год ${displayDate(next.date)} приступив до бойового чергування та виконання бойових (спеціальних) завдань з ведення повітряної розвідки противника з позиції «${position.name.toLocaleUpperCase("uk")}» (${position.mgrs || "координати не вказано"}) в районі ${position.locality || "не вказано"} екіпаж «${next.crew.name.toLocaleUpperCase("uk")}» у складі:\n${identities(next.crew, next.entry.actualMemberIds)}` });
    });
  });
  (input.positionWork ?? []).forEach((work) => {
    const timestamp = `${work.startDate}T${work.startTime}`;
    if (timestamp < period.start || timestamp > period.end) return;
    const position = positions.find((item) => item.id === work.positionId);
    if (!position) return;
    const action = work.workType === "Рекогностування" ? "рекогностування" : "дооблаштування";
    const verb = work.status === "Приступили" ? `приступили до ${action}` : work.status === "Завершили" ? `завершили ${action}` : `продовжують ${action}`;
    const people = work.members.map((member) => `${member.rank} ${personName(member.fullName)};`).join("\n");
    const order = work.battleOrder ? ` на виконання БОЙОВОГО РОЗПОРЯДЖЕННЯ КОМАНДИРА ${settings.unit.battalionShortName || "батальйону"} ${work.battleOrder}` : "";
    rotationEvents.push({ id: `position-work-${work.id}`, date: work.startDate, time: work.startTime, text: `-${work.startTime} год ${displayDate(work.startDate)}${order} ${verb} позиції старту БпЛА «${position.name.toLocaleUpperCase("uk")}» (${position.mgrs || "координати не вказано"}) в районі ${position.locality || "населений пункт не вказано"} військовослужбовці:\n${people || "склад не вказаний;"}` });
  });
  const selectedAutoEvents = rotationEvents.filter((item) => manual.includedAutoEventIds.includes(item.id)).map((item) => manual.autoEventEdits[item.id] || item.text);
  const periodEvents = [...selectedAutoEvents, ...manual.manualEvents.map((item) => item.text.trim())].filter(Boolean).join("\n") || "Подій не зафіксовано.";
  const signer = settings.mainSigner;
  const name = (signer.fullName || "").trim().split(/\s+/u);
  const staffing = input.staffing ?? [];
  const kspConflict = [...manual.commandDuties, ...manual.guardDuties].some((item) => item.personnelId && positionPersonnel.has(item.personnelId));
  const automatic = { forceComposition, positions: positionText, flightOperations, periodEvents };
  const auto = (key: keyof typeof automatic) => manual.autoOverrides[key]?.trim() || automatic[key];
  const warnings = [!settings.unit.shortName && "Не вказана коротка назва підрозділу.", !settings.unit.reportRecipient && "Не вказаний адресат донесення.", !settings.unit.kspName && "Не вказана назва КСП.", !settings.unit.kspLocality && "Не вказаний населений пункт КСП.", !manual.reportNumber && "Не вказаний номер донесення.", !signer.fullName && "Не вказаний основний підписант.", input.journal.some((flight) => flight.flightDate >= shiftDate(reportDate, -1) && flight.flightDate <= reportDate && !flight.skyTime) && "У журналі є політ без часу «Небо».", kspConflict && "Людина з чергування КСП одночасно зазначена на позиції. Приберіть її з КСП або плану польотів."].filter((item): item is string => Boolean(item));
  const enemy = manual.enemyLosses;
  const values: Record<string, string> = {
    recipient: settings.unit.reportRecipient || "не вказано", report_number: manual.reportNumber || "не вказано", unit_short_name: settings.unit.shortName || "назву не вказано", military_unit_short_name: settings.unit.militaryUnitShortName || settings.unit.unitCode || "військову частину не вказано", ksp_name: settings.unit.kspName || "назву не вказано", ksp_locality: settings.unit.kspLocality || "населений пункт не вказано", report_date: displayDate(reportDate),
    composition_changes: manual.compositionOverride ? manual.compositionChanges : "Без змін", force_composition: auto("forceComposition"), completeness: `о/с–${manual.completeness.personnel || "0"}%; ОВТ: АТ–${manual.completeness.automotive || "0"}%, БпАК (${manual.completeness.uavType || "розвідувальні літакового типу"}) – ${manual.completeness.uav || "0"}%, ЗББР – ${manual.completeness.zbbr || "0"}%, ПММ – ${manual.completeness.fuel || "0"}%.`, positions: auto("positions"),
    enemy_actions: "", assault_actions: "", battalion_short_name: settings.unit.battalionShortName || "назву батальйону не вказано", period_start_date: displayDate(shiftDate(reportDate, -1)), period_end_date: displayDate(reportDate), flight_count: flights.length ? `здійснювалися ${flights.length} рази.` : "не здійснювалися.", flight_operations: flightOperations,
    ksp_mgrs: settings.unit.kspMgrs || "координати не вказано", ksp_outskirts: manual.kspOutskirts || "південні околиці", command_duties: "", guard_duties: "", period_events: auto("periodEvents"), commissions: manual.commissionsOverride ? manual.commissions : "В поточному періоді не працювали.", fortification: manual.fortificationOverride ? manual.fortification : "Заходи з фортифікаційного обладнання не велись.", dzvin: manual.dzvinOverride ? manual.dzvin : "Зміни не відбувалися.", next_tasks: joinItems(manual.nextTasks),
    personnel_losses: `Загальні втрати особового складу за період з 18:01 год ${displayDate(shiftDate(reportDate, -1))} по 18:00 год ${displayDate(reportDate)} склали ${value(manual.personnelLosses, "total")} осіб, з них:\nБезповоротні – ${value(manual.personnelLosses, "irreversible")}, у тому числі:\nБойові – ${value(manual.personnelLosses, "combatIrreversible")}, з них:\nзагинули – ${value(manual.personnelLosses, "killed")};\nпомерли від ран – ${value(manual.personnelLosses, "diedFromWounds")};\nІнші – ${value(manual.personnelLosses, "other")};\nТимчасові – ${value(manual.personnelLosses, "temporary")}, у тому числі:\nБойові – ${value(manual.personnelLosses, "combatTemporary")}, з них:\nсанітарні бойові – ${value(manual.personnelLosses, "wounded")};\nполон – ${value(manual.personnelLosses, "captured")};\nзникли безвісті – ${value(manual.personnelLosses, "missing")};\nдезертири – ${value(manual.personnelLosses, "deserters")};\nСЗЧ – ${value(manual.personnelLosses, "szch")};`, equipment_losses: `Всього: – ${value(manual.equipmentLosses, "total")} од., з них: знищено – ${value(manual.equipmentLosses, "destroyed")} од., втрачено – ${value(manual.equipmentLosses, "lost")} од., пошкоджено – ${value(manual.equipmentLosses, "damaged")} од.;\nтанків – ${value(manual.equipmentLosses, "tanks")} од.;\nББМ – ${value(manual.equipmentLosses, "afv")} од.;\nГіМ – ${value(manual.equipmentLosses, "artillery")} од.;\nзасоби ППО – ${value(manual.equipmentLosses, "airDefence")} од.;\nАТ – ${value(manual.equipmentLosses, "vehicles")} од.;\nзасоби РЕБ – ${value(manual.equipmentLosses, "reb")} од.; засоби зв’язку – ${value(manual.equipmentLosses, "communications")} од.;\nБпЛА – ${value(manual.equipmentLosses, "uav")} од.`, equipment_losses_details: manual.equipmentLossesDetails || "Відсутні.", ammunition_expenses: manual.ammunitionExpenses || "-не застосовувалися.", problems: manual.problems || "не вказано", other_issues: joinItems(manual.otherIssues, "-відсутні."), signer_position: signer.position || "не вказано", signer_rank: signer.rank || "не вказано", signer_given_name: name[1] || "ім’я не вказано", signer_surname: name[0]?.toLocaleUpperCase("uk") || "прізвище не вказано", arm_number: settings.unit.armNumber || settings.unit.armyCorpsNumber || "номер не вказано",
  };
  const numericValues: Record<string, [Record<string, string>, string]> = {
    enemy_personnel: [enemy, "personnel"], enemy_irreversible: [enemy, "irreversible"], enemy_sanitary: [enemy, "sanitary"], enemy_captured: [enemy, "captured"], enemy_ovt: [enemy, "ovt"], enemy_ovt_destroyed: [enemy, "ovtDestroyed"], enemy_ovt_damaged: [enemy, "ovtDamaged"], enemy_tanks: [enemy, "tanks"], enemy_tanks_destroyed: [enemy, "tanksDestroyed"], enemy_tanks_damaged: [enemy, "tanksDamaged"], enemy_afv: [enemy, "afv"], enemy_afv_destroyed: [enemy, "afvDestroyed"], enemy_afv_damaged: [enemy, "afvDamaged"], enemy_artillery: [enemy, "artillery"], enemy_artillery_destroyed: [enemy, "artilleryDestroyed"], enemy_artillery_damaged: [enemy, "artilleryDamaged"], enemy_mlrs: [enemy, "mlrs"], enemy_mlrs_destroyed: [enemy, "mlrsDestroyed"], enemy_mlrs_damaged: [enemy, "mlrsDamaged"], enemy_reb: [enemy, "reb"], enemy_reb_destroyed: [enemy, "rebDestroyed"], enemy_reb_damaged: [enemy, "rebDamaged"], enemy_vehicles: [enemy, "vehicles"], enemy_vehicles_destroyed: [enemy, "vehiclesDestroyed"], enemy_vehicles_damaged: [enemy, "vehiclesDamaged"], enemy_aircraft: [enemy, "aircraft"], enemy_aircraft_destroyed: [enemy, "aircraftDestroyed"], enemy_aircraft_damaged: [enemy, "aircraftDamaged"], enemy_uav: [enemy, "uav"], enemy_uav_destroyed: [enemy, "uavDestroyed"], enemy_uav_damaged: [enemy, "uavDamaged"], enemy_uav_loitering: [enemy, "uavLoitering"], enemy_uav_molniya: [enemy, "uavMolniya"], enemy_uav_lancet: [enemy, "uavLancet"], enemy_uav_reb: [enemy, "uavReb"], enemy_special_equipment: [enemy, "specialEquipment"], enemy_special_equipment_destroyed: [enemy, "specialEquipmentDestroyed"], enemy_special_equipment_damaged: [enemy, "specialEquipmentDamaged"], enemy_recon_equipment: [enemy, "reconEquipment"], enemy_recon_equipment_destroyed: [enemy, "reconEquipmentDestroyed"], enemy_recon_equipment_damaged: [enemy, "reconEquipmentDamaged"], enemy_uav_control: [enemy, "uavControl"], enemy_uav_control_destroyed: [enemy, "uavControlDestroyed"], enemy_uav_control_damaged: [enemy, "uavControlDamaged"], enemy_communications: [enemy, "communications"], enemy_communications_destroyed: [enemy, "communicationsDestroyed"], enemy_communications_damaged: [enemy, "communicationsDamaged"], enemy_command_posts: [enemy, "commandPosts"], enemy_shelters: [enemy, "shelters"], enemy_command_posts_destroyed: [enemy, "commandPostsDestroyed"], enemy_command_posts_damaged: [enemy, "commandPostsDamaged"], enemy_shelters_damaged: [enemy, "sheltersDamaged"], enemy_ammo_depots: [enemy, "ammoDepots"], enemy_fuel_depots: [enemy, "fuelDepots"], enemy_depots_destroyed: [enemy, "depotsDestroyed"], enemy_depots_damaged: [enemy, "depotsDamaged"],
    own_personnel_total: [manual.personnelLosses, "total"], own_personnel_irreversible: [manual.personnelLosses, "irreversible"], own_personnel_combat_irreversible: [manual.personnelLosses, "combatIrreversible"], own_personnel_killed: [manual.personnelLosses, "killed"], own_personnel_died_from_wounds: [manual.personnelLosses, "diedFromWounds"], own_personnel_other: [manual.personnelLosses, "other"], own_personnel_temporary: [manual.personnelLosses, "temporary"], own_personnel_combat_temporary: [manual.personnelLosses, "combatTemporary"], own_personnel_wounded: [manual.personnelLosses, "wounded"], own_personnel_captured: [manual.personnelLosses, "captured"], own_personnel_missing: [manual.personnelLosses, "missing"], own_personnel_deserters: [manual.personnelLosses, "deserters"], own_personnel_szch: [manual.personnelLosses, "szch"],
    own_equipment_total: [manual.equipmentLosses, "total"], own_equipment_destroyed: [manual.equipmentLosses, "destroyed"], own_equipment_lost: [manual.equipmentLosses, "lost"], own_equipment_damaged: [manual.equipmentLosses, "damaged"], own_tanks: [manual.equipmentLosses, "tanks"], own_tanks_destroyed: [manual.equipmentLosses, "tanksDestroyed"], own_tanks_damaged: [manual.equipmentLosses, "tanksDamaged"], own_afv: [manual.equipmentLosses, "afv"], own_afv_destroyed: [manual.equipmentLosses, "afvDestroyed"], own_afv_damaged: [manual.equipmentLosses, "afvDamaged"], own_artillery: [manual.equipmentLosses, "artillery"], own_artillery_destroyed: [manual.equipmentLosses, "artilleryDestroyed"], own_artillery_damaged: [manual.equipmentLosses, "artilleryDamaged"], own_air_defence: [manual.equipmentLosses, "airDefence"], own_air_defence_destroyed: [manual.equipmentLosses, "airDefenceDestroyed"], own_air_defence_damaged: [manual.equipmentLosses, "airDefenceDamaged"], own_vehicles: [manual.equipmentLosses, "vehicles"], own_vehicles_destroyed: [manual.equipmentLosses, "vehiclesDestroyed"], own_vehicles_damaged: [manual.equipmentLosses, "vehiclesDamaged"], own_reb: [manual.equipmentLosses, "reb"], own_reb_destroyed: [manual.equipmentLosses, "rebDestroyed"], own_communications: [manual.equipmentLosses, "communications"], own_communications_destroyed: [manual.equipmentLosses, "communicationsDestroyed"], own_uav: [manual.equipmentLosses, "uav"], own_uav_lost: [manual.equipmentLosses, "uavLost"], own_uav_damaged: [manual.equipmentLosses, "uavDamaged"],
  };
  Object.entries(numericValues).forEach(([key, [record, field]]) => { values[key] = value(record, field); });
  values.flight_operations = auto("flightOperations");
  const textLines = (text: string, bold = false): SummaryBlockLine[] => text.split("\n").filter(Boolean).map((line) => ({ text: line, bold, kind: line.startsWith("-") ? "item" : "paragraph" }));
  const commandLines = dutyLines(manual.commandDuties, staffing, positionPersonnel, "command");
  const guardLines = dutyLines(manual.guardDuties, staffing, positionPersonnel, "guard");
  const periodEventLines = [
    ...rotationEvents.filter((item) => manual.includedAutoEventIds.includes(item.id)).flatMap((item) => textLines(manual.autoEventEdits[item.id] || item.text)),
    ...manual.manualEvents.flatMap((item) => textLines(`${item.time ? `${item.time} год ` : ""}${item.date ? `${displayDate(item.date)} року ` : ""}${item.text}`)),
  ];
  const blocks: Record<string, SummaryBlockLine[]> = {
    force_composition: manual.autoOverrides.forceComposition === undefined ? compositionLines(selectedCompositionItems, settings) : textLines(auto("forceComposition")),
    positions: manual.autoOverrides.positions === undefined ? positionLines(selectedPositionItems, settings) : textLines(auto("positions")),
    enemy_actions: [
      { text: `ракетних ударів - ${manual.rocketStrikes || "0"};`, kind: "paragraph" },
      { text: `авіаційних ударів - ${manual.airStrikes || "0"} (ВА - ${manual.va || "0"}; ША - ${manual.sha || "0"}; АА - ${manual.aa || "0"});`, kind: "paragraph" },
      { text: manual.enemyAssault ? manual.enemyAssaultText : "Противник не проводив наступальні дії;", bold: true, kind: "paragraph" },
    ],
    assault_actions: [{ text: manual.ownAssault ? manual.ownAssaultText : `Штурмові дії ${settings.unit.shortName || "підрозділу"} ${settings.unit.battalionShortName || ""} по противнику не проводились.`.replace(/\s+/gu, " "), kind: "paragraph" }],
    flight_operations: flightLines,
    command_duties: commandLines.length ? commandLines : [{ text: "Чергових не зазначено.", kind: "paragraph" }],
    guard_duties: guardLines.length ? guardLines : [{ text: "Склад охорони не зазначено.", kind: "paragraph" }],
    period_events: periodEventLines.length ? periodEventLines : [{ text: "Подій не зафіксовано.", kind: "paragraph" }],
    next_tasks: manual.nextTasks.length ? manual.nextTasks.flatMap((item) => textLines(item.text)) : [{ text: "Завдання не зазначено.", kind: "paragraph" }],
  };
  return { document: { values, shellingRows: manual.shellings.map(({ id: _id, ...row }) => row), blocks }, warnings, automatic, objects: { compositionItems: automaticCompositionItems, positionItems: automaticPositionItems, flightItems: automaticFlightItems, rotationEvents } };
}
