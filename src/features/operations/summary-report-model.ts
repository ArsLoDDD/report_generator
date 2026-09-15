import type { AppSettings } from "../../shared/types/domain";
import type { Crew, Equipment, FlightJournalEntry, FlightPlanRequest, Position, PositionWork, PositionWorkStatusEvent, StaffingRecord } from "./types";

export type SummaryTextItem = { id: string; text: string; date?: string; time?: string };
export type SummaryDutyPeriod = { id: string; startDate: string; startTime: string; endDate: string; endTime: string };
export type SummaryDutyItem = { id: string; personnelId: number | null; periods: SummaryDutyPeriod[] };
export type SummaryCompositionItem = { id: string; count: string; uavKind: string; battleOrder: string; workStrip: string; excluded?: boolean };
export type SummaryPositionItem = { id: string; workStrip: string; uavName: string; positionName: string; mgrs: string; locality: string; excluded?: boolean };
export type SummaryFlightUav = { id: string; equipmentId: number | null; name: string; serialNumber: string };
export type SummaryFlightMember = { id: string; personnelId: number; fullName: string; rank: string; startDate: string; startTime: string; endDate: string; endTime: string };
export type SummaryFlightItem = { id: string; crewId: number; workStrip: string; positionName: string; mgrs: string; locality: string; unitShortName: string; crewName: string; taskArea: string; uavs: SummaryFlightUav[]; members: SummaryFlightMember[]; flightTimes: Array<{ date: string; time: string }>; excluded?: boolean };
export type SummaryBlockRun = { text: string; bold?: boolean };
export type SummaryBlockLine = { text: string; runs?: SummaryBlockRun[]; bold?: boolean; kind?: "paragraph" | "item" | "continuation" };
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
  const carryDuties = (items: SummaryDutyItem[]) => items.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    periods: item.periods.map((period) => ({
      ...period,
      id: crypto.randomUUID(),
      startDate: period.startDate ? shiftDate(period.startDate, 1) : "",
      endDate: period.endDate ? shiftDate(period.endDate, 1) : "",
    })),
  }));
  return {
    ...fresh,
    reportNumber: previous.reportNumber,
    enemyLosses: { ...previous.enemyLosses },
    completeness: { ...previous.completeness },
    kspOutskirts: previous.kspOutskirts,
    compositionItems: null,
    positionItems: null,
    flightItems: null,
    rocketStrikes: previous.rocketStrikes,
    airStrikes: previous.airStrikes,
    va: previous.va,
    sha: previous.sha,
    aa: previous.aa,
    commandDuties: carryDuties(previous.commandDuties),
    guardDuties: carryDuties(previous.guardDuties),
    nextTasks: previous.nextTasks.map((item) => ({ ...item, id: crypto.randomUUID() })),
    personnelLosses: { ...previous.personnelLosses },
    equipmentLosses: { ...previous.equipmentLosses },
    problems: previous.problems,
    otherIssues: previous.otherIssues.map((item) => ({ ...item, id: crypto.randomUUID() })),
  };
};

const pad = (value: number) => String(value).padStart(2, "0");
export const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const displayDate = (value: string) => { const [year, month, day] = value.split("-"); return `${day}.${month}.${year}`; };
export const shiftDate = (value: string, days: number) => { const [year, month, day] = value.split("-").map(Number); return isoDate(new Date(year, month - 1, day + days)); };
export const initialReportDate = (now = new Date()) => isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < 12 ? 1 : 0)));
export const canOpenNextReport = (reportDate: string, now = new Date()) => now >= new Date(`${reportDate}T18:01:00`) && now < new Date(`${shiftDate(reportDate, 1)}T12:00:00`);
export const canReturnToPreviousReport = (reportDate: string, now = new Date()) => reportDate === shiftDate(initialReportDate(now), 1) && now < new Date(`${reportDate}T12:00:00`);
export const reportPeriod = (reportDate: string) => ({ start: `${shiftDate(reportDate, -1)}T18:01`, end: `${reportDate}T18:00` });

const dateTime = (date: string, time: string) => new Date(`${date}T${time}:00Z`);
const datePart = (value: Date) => `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
const timePart = (value: Date) => `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;

export const buildAlternatingDutySchedule = (items: SummaryDutyItem[], reportDate: string, shiftHours: number): SummaryDutyItem[] => {
  const assigned = items.filter((item) => item.personnelId);
  if (!assigned.length || !Number.isFinite(shiftHours) || shiftHours <= 0) return items;
  const start = dateTime(shiftDate(reportDate, -1), "18:01");
  const end = dateTime(reportDate, "18:00");
  const minutes = Math.max(1, Math.round(shiftHours * 60));
  const periods = new Map(assigned.map((item) => [item.id, [] as SummaryDutyPeriod[]]));
  let cursor = start;
  let index = 0;
  while (cursor.getTime() <= end.getTime()) {
    const intervalEnd = new Date(Math.min(cursor.getTime() + (minutes - 1) * 60_000, end.getTime()));
    const owner = assigned[index % assigned.length];
    periods.get(owner.id)?.push({ id: crypto.randomUUID(), startDate: datePart(cursor), startTime: timePart(cursor), endDate: datePart(intervalEnd), endTime: timePart(intervalEnd) });
    cursor = new Date(intervalEnd.getTime() + 60_000);
    index += 1;
  }
  return items.map((item) => ({ ...item, periods: periods.get(item.id) ?? [] }));
};

const joinItems = (items: SummaryTextItem[], fallback = "Без змін") => items.map((item) => item.text.trim()).filter(Boolean).join("\n") || fallback;
const value = (record: Record<string, string>, key: string) => record[key]?.trim() || "0";
type FlightPlanEntries = FlightPlanRequest["entries"];
const personName = (fullName: string) => { const [surname = "", given = "", ...patronymic] = fullName.trim().split(/\s+/u); return `${surname.toLocaleUpperCase("uk")} ${given} ${patronymic.join(" ")}`.trim(); };
const CANONICAL_COMPANY_COMMANDER_POSITION = "Командир роти безпілотних авіаційних комплексів";
const isCanonicalCompanyCommanderPosition = (position: string) => /^Командир роти безпілотних авіаційних комплексів(?:\s+військової частини(?:\s+\S+)*)?$/iu.test(position);
const summarySignerPosition = (settings: AppSettings): { text: string; warning: string } => {
  const position = settings.mainSigner.position?.trim() || "";
  const battalionFullName = settings.unit.battalionFullName?.trim().replace(/безпілолтних/giu, "безпілотних") || "";
  const battalionNumber = [settings.unit.militaryUnitShortName, settings.unit.battalionShortName]
    .map((name) => name?.trim().match(/^(\d+)/u)?.[1])
    .find(Boolean);
  const battalion = battalionFullName || (battalionNumber ? `${battalionNumber} окремого батальйону безпілотних систем` : "");
  if (isCanonicalCompanyCommanderPosition(position)) {
    return battalion
      ? { text: `${CANONICAL_COMPANY_COMMANDER_POSITION} ${battalion}`, warning: "" }
      : {
          text: `${CANONICAL_COMPANY_COMMANDER_POSITION} [повну назву батальйону не вказано]`,
          warning: "Не вказана повна назва батальйону для посади основного підписанта.",
        };
  }
  return { text: position || "не вказано", warning: "" };
};
const dutyPeriod = (period: SummaryDutyPeriod) => period.startDate === period.endDate
  ? `з ${period.startTime} по ${period.endTime} ${displayDate(period.startDate)}`
  : `з ${period.startTime} ${displayDate(period.startDate)} по ${period.endTime} ${displayDate(period.endDate)}`;
const dutyLines = (items: SummaryDutyItem[], staffing: StaffingRecord[], conflictingPeriodIds: Set<string>, kind: "command" | "guard"): SummaryBlockLine[] => items.reduce<SummaryBlockLine[]>((lines, item) => {
  const person = staffing.find((record) => record.personnelId === item.personnelId);
  const identity = person ? `${person.rank} ${personName(person.fullName)}` : "";
  const periods = item.periods.filter((period) => period.startDate && period.startTime && period.endDate && period.endTime && !conflictingPeriodIds.has(period.id));
  const periodText = periods.map(dutyPeriod).join("; ");
  if (identity && periodText) {
    const word = periods.length === 1 ? "період" : "періоди";
    lines.push({ text: kind === "command" ? `-${identity} в ${word} ${periodText}.` : `В ${word} ${periodText} – ${identity};`, kind: "item" });
  }
  return lines;
}, []);
const countWord = (count: number) => ["Нуль", "Один", "Два", "Три", "Чотири", "П’ять", "Шість", "Сім", "Вісім", "Дев’ять", "Десять"][count] ?? String(count);
const roleFromCrew = (crew: Crew) => /удар|fpv|фпв/iu.test(`${crew.uavType} ${crew.functionalDuties}`) ? "екіпажі ударних БпЛА літакового типу" : "екіпажі розвідувальних БпЛА літакового типу";
const entryCrew = (entry: FlightPlanRequest["entries"][number], crews: Crew[]): Crew | undefined => crews.find((item) => item.id === entry.crewId) ?? (entry.crewName ? { id: entry.crewId, name: entry.crewName, platoon: "", positionName: entry.positionName || "", reconnaissanceArea: entry.areaPoints?.join(", ") || entry.positionLocality || "", unitType: "", companyName: "", battleOrder: entry.battleOrder || "", sector: entry.workStrip || "", officialStrength: 0, workingStrength: 0, positionId: entry.positionId ?? null, status: "", uavName: entry.uavSnapshots?.map((item) => item.name).join(", ") || "", uavType: entry.crewUavType || "", functionalDuties: "", currentLocation: "", notes: "", memberCount: entry.actualMemberIds.length, members: [], actualMembers: [] } : undefined);
const entryPosition = (entry: FlightPlanRequest["entries"][number], crew: Crew | undefined, positions: Position[]) => positions.find((item) => item.id === entry.positionId) ?? positions.find((item) => item.id === crew?.positionId);
const entryPositionId = (entry: FlightPlanRequest["entries"][number], crew: Crew | undefined) => entry.positionId ?? crew?.positionId ?? null;
const entryPositionName = (entry: FlightPlanRequest["entries"][number], crew: Crew | undefined, position: Position | undefined) => entry.positionName || position?.name || crew?.positionName || "";
const entryWorkStrip = (entry: FlightPlanRequest["entries"][number], crew: Crew | undefined, position: Position | undefined) => entry.workStrip || position?.stripName || crew?.sector || "";
const entryBattleOrder = (entry: FlightPlanRequest["entries"][number], crew: Crew | undefined, position: Position | undefined) => entry.battleOrder || position?.battleOrder || crew?.battleOrder || "";
const entryMember = (entry: FlightPlanRequest["entries"][number], crew: Crew | undefined, staffing: StaffingRecord[] | undefined, personnelId: number) => entry.memberSnapshots?.find((item) => item.personnelId === personnelId) ?? [...(crew?.members ?? []), ...(crew?.actualMembers ?? [])].find((item) => item.personnelId === personnelId) ?? staffing?.find((item) => item.personnelId === personnelId);
const crewCompositionItems = (crews: Crew[], positions: Position[], equipment: Equipment[], entries: FlightPlanEntries): SummaryCompositionItem[] => {
  const groups = new Map<string, { crew: Crew; count: number; role: string; battleOrder: string; workStrip: string }>();
  [...new Set(entries.map((entry) => entry.crewId))].forEach((id) => {
    const entry = [...entries].reverse().find((item) => item.crewId === id);
    if (!entry) return;
    const crew = entryCrew(entry, crews); if (!crew) return;
    const position = entry ? entryPosition(entry, crew, positions) : undefined;
    const plannedUavText = entry?.uavSnapshots?.map((item) => item.name).join(" ") || (entry?.uavSelections ?? []).map((selection) => equipment.find((item) => item.id === selection.equipmentId)).filter((item): item is Equipment => Boolean(item)).map((item) => `${item.uavType} ${item.name}`).join(" ");
    const role = plannedUavText ? roleFromCrew({ ...crew, uavType: plannedUavText }) : roleFromCrew(crew);
    const battleOrder = entry ? entryBattleOrder(entry, crew, position) : crew.battleOrder;
    const workStrip = entry ? entryWorkStrip(entry, crew, position) : crew.sector;
    const key = [role, battleOrder, workStrip].join("|");
    const current = groups.get(key); groups.set(key, { crew, count: (current?.count ?? 0) + 1, role, battleOrder, workStrip });
  });
  return [...groups.values()].map(({ crew, count, role, battleOrder, workStrip }) => ({ id: `auto-composition-${crew.id}-${battleOrder}-${workStrip}`, count: String(count), uavKind: role, battleOrder, workStrip }));
};
const crewPositionItems = (crews: Crew[], positions: Position[], equipment: Equipment[], entries: FlightPlanEntries): SummaryPositionItem[] => {
  const grouped = new Map<string, SummaryPositionItem>();
  entries.forEach((entry) => {
    const crew = entryCrew(entry, crews); if (!crew) return;
    const position = entryPosition(entry, crew, positions);
    const key = String(entryPositionId(entry, crew) ?? entryPositionName(entry, crew, position));
    if (!key) return;
    const snapshotNames = entry.uavSnapshots?.map((item) => item.name).filter(Boolean) ?? [];
    const selectedNames = (entry.uavSelections ?? []).map((selection) => equipment.find((item) => item.id === selection.equipmentId)?.name).filter((name): name is string => Boolean(name));
    const names = snapshotNames.length ? snapshotNames : selectedNames.length ? selectedNames : [crew.uavName].filter(Boolean);
    const previous = grouped.get(key);
    const allNames = [...new Set([...(previous?.uavName.split(", ").filter(Boolean) ?? []), ...names])];
    grouped.set(key, { id: `auto-position-${key}`, workStrip: entryWorkStrip(entry, crew, position), uavName: allNames.join(", "), positionName: entryPositionName(entry, crew, position), mgrs: entry.positionMgrs || position?.mgrs || "", locality: entry.positionLocality || position?.locality || "" });
  });
  return [...grouped.values()];
};
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
    ...rows.map((item) => {
      const positionName = (item.positionName || "назву не вказано").toLocaleUpperCase("uk");
      const prefix = `- стартову позицію БпАК «${item.uavName || "назву не вказано"}» – `;
      const suffix = ` (${item.mgrs || "координати не вказано"}) в районі ${item.locality || "населений пункт не вказано"};`;
      return { text: `${prefix}«${positionName}»${suffix}`, runs: [{ text: prefix }, { text: `«${positionName}»`, bold: true }, { text: suffix }], kind: "item" as const };
    }),
  ]);
};

const dutyCoverageWarning = (items: SummaryDutyItem[], reportDate: string, label: string) => {
  const periods = items.flatMap((item) => item.periods.map((period) => ({ ...period, personnelId: item.personnelId })));
  if (!periods.length) return `${label} має покривати всю звітну добу з 18:01 до 18:00.`;
  if (periods.some((period) => !period.personnelId || !period.startDate || !period.startTime || !period.endDate || !period.endTime)) return `${label}: заповніть військовослужбовця і всі межі кожного періоду.`;
  const intervals = periods.map((period) => ({ start: dateTime(period.startDate, period.startTime).getTime(), end: dateTime(period.endDate, period.endTime).getTime() })).sort((left, right) => left.start - right.start);
  const requiredStart = dateTime(shiftDate(reportDate, -1), "18:01").getTime();
  const requiredEnd = dateTime(reportDate, "18:00").getTime();
  const invalid = intervals.some((interval) => !Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.end < interval.start);
  const discontinuous = intervals.some((interval, index) => index > 0 && interval.start !== intervals[index - 1].end + 60_000);
  return invalid || intervals[0].start !== requiredStart || intervals[intervals.length - 1]?.end !== requiredEnd || discontinuous ? `${label} має без пропусків і перетинів покривати всю звітну добу з 18:01 до 18:00.` : "";
};

export function buildSummaryDocument(input: { reportDate: string; manual: SummaryManual; settings: AppSettings; crews: Crew[]; positions: Position[]; equipment?: Equipment[]; journal: FlightJournalEntry[]; snapshots: Array<FlightPlanRequest | null>; staffing?: StaffingRecord[]; positionWork?: PositionWork[]; positionWorkHistory?: PositionWorkStatusEvent[] }): { document: SummaryDocument; warnings: string[]; automatic: Record<string, string>; objects: { compositionItems: SummaryCompositionItem[]; positionItems: SummaryPositionItem[]; flightItems: SummaryFlightItem[]; rotationEvents: SummaryTextItem[] } } {
  const { reportDate, manual, settings, crews, positions } = input;
  const period = reportPeriod(reportDate);
  const timestamp = (date: string, time: string) => Date.parse(`${date}T${time || "00:00"}:00Z`);
  const periodStart = timestamp(shiftDate(reportDate, -1), "18:01");
  const periodEnd = timestamp(reportDate, "18:00");
  const flights = input.journal.filter((flight) => flight.skyTime && `${flight.flightDate}T${flight.skyTime}` >= period.start && `${flight.flightDate}T${flight.skyTime}` <= period.end);
  const datedSnapshotEntries = input.snapshots.flatMap((snapshot, snapshotIndex) => (snapshot?.entries ?? []).map((entry, index) => ({ entry, index, snapshotIndex, date: snapshotIndex === 0 ? shiftDate(reportDate, -1) : reportDate })));
  const snapshotEntryGroupKey = (entry: FlightPlanRequest["entries"][number]) => { const crew = entryCrew(entry, crews); return `${entry.crewId}|${entryPositionId(entry, crew) ?? entryPositionName(entry, crew, entryPosition(entry, crew, positions))}`; };
  const previousSnapshotEntries = datedSnapshotEntries.filter(({ snapshotIndex }) => snapshotIndex === 0);
  const previousSnapshotGroupKeys = new Set(previousSnapshotEntries.map(({ entry }) => snapshotEntryGroupKey(entry)));
  const previousContinuingGroupKeys = new Set([...previousSnapshotGroupKeys].filter((groupKey) => !previousSnapshotEntries.some(({ entry }) => snapshotEntryGroupKey(entry) === groupKey && entry.departsToday)));
  const firstCurrentIndexByGroup = new Map<string, number>();
  datedSnapshotEntries.filter(({ snapshotIndex }) => snapshotIndex === 1).forEach(({ entry, index }) => {
    const groupKey = snapshotEntryGroupKey(entry);
    if (!firstCurrentIndexByGroup.has(groupKey)) firstCurrentIndexByGroup.set(groupKey, index);
  });
  const relevantSnapshotEntries = datedSnapshotEntries.filter(({ entry, date, snapshotIndex, index }) => {
    if (snapshotIndex === 0) return true;
    const groupKey = snapshotEntryGroupKey(entry);
    const entryTimestamp = entry.startTime ? timestamp(date, entry.startTime) : Number.NaN;
    const isLaterStage = index !== firstCurrentIndexByGroup.get(groupKey) || Boolean(entry.rotationId);
    if (isLaterStage && Number.isFinite(entryTimestamp) && entryTimestamp > periodEnd) return false;
    if (previousContinuingGroupKeys.has(groupKey)) return true;
    return !Number.isFinite(entryTimestamp) || entryTimestamp <= periodEnd;
  });
  const snapshotEntries = relevantSnapshotEntries.map(({ entry }) => entry);
  const snapshotGroupKeys = new Set(snapshotEntries.map((entry) => { const crew = entryCrew(entry, crews); return `${entry.crewId}|${entryPositionId(entry, crew) ?? entryPositionName(entry, crew, entryPosition(entry, crew, positions))}`; }));
  const journalFallbacks = new Map<string, { entry: FlightPlanRequest["entries"][number]; date: string }>();
  flights.forEach((flight) => {
    if (!flight.crewId) return;
    const key = `${flight.crewId}|${flight.positionId ?? flight.positionName ?? ""}`;
    if (snapshotGroupKeys.has(key)) return;
    const crew = crews.find((item) => item.id === flight.crewId);
    const existing = journalFallbacks.get(key);
    const uavSnapshots = [...(existing?.entry.uavSnapshots ?? [])];
    const uavKey = flight.uavSerialNumber || flight.uavName;
    if (!uavSnapshots.some((item) => (item.serialNumber || item.name) === uavKey)) uavSnapshots.push({ equipmentId: flight.uavId ?? -1, name: flight.uavName, serialNumber: flight.uavSerialNumber });
    journalFallbacks.set(key, { date: flight.flightDate, entry: { crewId: flight.crewId, crewName: flight.crewName || crew?.name || "", crewUavType: flight.uavType || crew?.uavType || "", actualMemberIds: existing?.entry.actualMemberIds ?? crew?.actualMembers?.map((member) => member.personnelId) ?? [], actualCommanderId: null, actualVehicleId: null, weather: { temperature: "", windFrom: "", windTo: "", gustFrom: "", gustTo: "", cloudiness: "", cloudHeight: "", precipitation: "" }, routePoints: [], altitudeFrom: "", altitudeTo: "", areaPoints: [], task: flight.mission, startTime: "", endTime: "", uavSelections: [], payloadSelection: null, positionId: flight.positionId, positionName: flight.positionName, workStrip: flight.workStrip, battleOrder: flight.battleOrder, uavSnapshots, memberSnapshots: crew?.actualMembers?.map((member) => ({ personnelId: member.personnelId, fullName: member.fullName, rank: member.rank })) ?? [] } });
  });
  const fallbackStages = [...journalFallbacks.values()];
  const entries = [...snapshotEntries, ...fallbackStages.map((item) => item.entry)];
  const equipment = input.equipment ?? [];
  const automaticCompositionItems = crewCompositionItems(crews, positions, equipment, entries);
  const automaticPositionItems = crewPositionItems(crews, positions, equipment, entries);
  const compositionOverrides = manual.compositionItems ?? [];
  const positionOverrides = manual.positionItems ?? [];
  const selectedCompositionItems = [...automaticCompositionItems.map((item) => ({ ...item, ...compositionOverrides.find((override) => override.id === item.id) })).filter((item) => !item.excluded), ...compositionOverrides.filter((item) => !item.id.startsWith("auto-composition-") && !item.excluded)];
  const selectedPositionItems = [...automaticPositionItems.map((item) => ({ ...item, ...positionOverrides.find((override) => override.id === item.id) })).filter((item) => !item.excluded), ...positionOverrides.filter((item) => !item.id.startsWith("auto-position-") && !item.excluded)];
  const forceComposition = compositionLines(selectedCompositionItems, settings).map((item) => item.text).join("\n") || "Екіпажі у плані польотів відсутні.";
  const positionText = positionLines(selectedPositionItems, settings).map((item) => item.text).join("\n") || "Позиції не визначені.";
  const datedEntries = [...relevantSnapshotEntries.map(({ entry, index, date, snapshotIndex }) => ({ entry, index, date, snapshotIndex })), ...fallbackStages.map(({ entry, date }, index) => ({ entry, date, index: snapshotEntries.length + index, snapshotIndex: -1 }))];
  type DatedPlanEntry = (typeof datedEntries)[number];
  type PhysicalMemberInterval = { personnelId: number; start: number; end: number; entry: DatedPlanEntry["entry"] };
  type CrossSnapshotTransition = { previous: DatedPlanEntry; current: DatedPlanEntry; previousGroupKey: string; currentGroupKey: string; at: number; departureAt: number; compositionChanged: boolean };
  const previousSnapshotKnown = input.snapshots[0] != null;
  const sameMemberIds = (left: number[], right: number[]) => left.length === right.length && left.every((personnelId) => right.includes(personnelId));
  const previousFinalByCrew = new Map<number, DatedPlanEntry>();
  const currentFirstByCrew = new Map<number, DatedPlanEntry>();
  datedEntries.filter(({ snapshotIndex }) => snapshotIndex === 0).forEach((stage) => previousFinalByCrew.set(stage.entry.crewId, stage));
  datedEntries.filter(({ snapshotIndex }) => snapshotIndex === 1).forEach((stage) => {
    if (!currentFirstByCrew.has(stage.entry.crewId)) currentFirstByCrew.set(stage.entry.crewId, stage);
  });
  const previousDepartedCrewIds = new Set(datedEntries.filter(({ snapshotIndex, entry }) => snapshotIndex === 0 && entry.departsToday && entry.departureTime).map(({ entry }) => entry.crewId));
  const crossSnapshotTransitions = [...currentFirstByCrew.entries()].flatMap<CrossSnapshotTransition>(([crewId, current]) => {
    const previous = previousFinalByCrew.get(crewId);
    const at = current.entry.startTime ? timestamp(current.date, current.entry.startTime) : Number.NaN;
    if (!previous || previousDepartedCrewIds.has(crewId) || !Number.isFinite(at) || at < periodStart || at > periodEnd) return [];
    return [{
      previous,
      current,
      previousGroupKey: snapshotEntryGroupKey(previous.entry),
      currentGroupKey: snapshotEntryGroupKey(current.entry),
      at,
      departureAt: at - 60_000,
      compositionChanged: !sameMemberIds(previous.entry.actualMemberIds, current.entry.actualMemberIds),
    }];
  });
  const forcedPreviousGroupEnds = new Map(crossSnapshotTransitions.filter(({ previousGroupKey, currentGroupKey }) => previousGroupKey !== currentGroupKey).map(({ previousGroupKey, departureAt }) => [previousGroupKey, departureAt]));
  const physicalPresenceByGroup = new Map<string, { intervals: PhysicalMemberInterval[]; start: number; end: number }>();
  [...new Set(datedEntries.map(({ entry }) => snapshotEntryGroupKey(entry)))].forEach((groupKey) => {
    const groupStages = datedEntries.filter(({ entry }) => snapshotEntryGroupKey(entry) === groupKey);
    const previousStages = groupStages.filter(({ snapshotIndex }) => snapshotIndex === 0).sort((left, right) => left.index - right.index);
    const currentStages = groupStages.filter(({ snapshotIndex }) => snapshotIndex === 1).sort((left, right) => left.index - right.index);
    const fallback = groupStages.filter(({ snapshotIndex }) => snapshotIndex < 0);
    const intervals: PhysicalMemberInterval[] = [];
    type PresenceTransition = { previous: DatedPlanEntry; next: DatedPlanEntry; at: number; leavingAt?: number };
    const stageTransitions = (stages: DatedPlanEntry[]): PresenceTransition[] => stages.slice(1).map((next, index) => ({ previous: stages[index], next, at: next.entry.startTime ? timestamp(next.date, next.entry.startTime) : Number.NaN }));
    const appendWindow = (start: number, end: number, initialStage: DatedPlanEntry, transitions: PresenceTransition[]) => {
      const windowStart = Math.max(periodStart, start); const windowEnd = Math.min(periodEnd, end);
      if (windowStart > windowEnd) return;
      let activeStage = initialStage;
      transitions.filter(({ at }) => Number.isFinite(at) && at <= windowStart).forEach(({ next }) => { activeStage = next; });
      const open = new Map<number, { start: number; entry: DatedPlanEntry["entry"] }>();
      activeStage.entry.actualMemberIds.forEach((personnelId) => open.set(personnelId, { start: windowStart, entry: activeStage.entry }));
      transitions.filter(({ at }) => Number.isFinite(at) && at > windowStart && at <= windowEnd).sort((left, right) => left.at - right.at).forEach(({ previous, next, at, leavingAt: explicitLeavingAt }) => {
        const leaving = previous.entry.actualMemberIds.filter((personnelId) => !next.entry.actualMemberIds.includes(personnelId));
        const entering = next.entry.actualMemberIds.filter((personnelId) => !previous.entry.actualMemberIds.includes(personnelId));
        const plannedEnd = explicitLeavingAt ?? (previous.entry.endTime ? timestamp(previous.date, previous.entry.endTime) : at - 60_000);
        const leavingAt = Math.min(at, Math.max(windowStart, plannedEnd));
        leaving.forEach((personnelId) => { const interval = open.get(personnelId); if (interval) intervals.push({ personnelId, start: interval.start, end: leavingAt, entry: interval.entry }); open.delete(personnelId); });
        entering.forEach((personnelId) => open.set(personnelId, { start: at, entry: next.entry }));
      });
      open.forEach((interval, personnelId) => intervals.push({ personnelId, start: interval.start, end: windowEnd, entry: interval.entry }));
    };
    const previousDeparture = previousStages.find(({ entry }) => entry.departsToday && entry.departureTime);
    const currentDeparture = currentStages.find(({ entry }) => entry.departsToday && entry.departureTime);
    if (previousStages.length) {
      const previousStart = previousStages[0].entry.arrivesToday && previousStages[0].entry.startTime ? timestamp(previousStages[0].date, previousStages[0].entry.startTime) : periodStart;
      const forcedPreviousEnd = forcedPreviousGroupEnds.get(groupKey);
      const previousEnd = previousDeparture?.entry.departureTime
        ? timestamp(previousDeparture.date, previousDeparture.entry.departureTime)
        : currentDeparture?.entry.departureTime
          ? timestamp(currentDeparture.date, currentDeparture.entry.departureTime)
          : forcedPreviousEnd ?? periodEnd;
      const boundary = crossSnapshotTransitions.find((transition) => transition.previousGroupKey === groupKey && transition.currentGroupKey === groupKey);
      const previousFinal = previousStages[previousStages.length - 1];
      const currentInitial = currentStages[0];
      const canApplyCurrentStages = !currentInitial || sameMemberIds(previousFinal.entry.actualMemberIds, currentInitial.entry.actualMemberIds) || Boolean(boundary);
      const joinedTransitions = previousDeparture ? stageTransitions(previousStages) : [
        ...stageTransitions(previousStages),
        ...(boundary ? [{ previous: boundary.previous, next: boundary.current, at: boundary.at, leavingAt: boundary.departureAt }] : []),
        ...(canApplyCurrentStages ? stageTransitions(currentStages) : []),
      ];
      appendWindow(previousStart, previousEnd, previousStages[0], joinedTransitions);
      if (previousDeparture && currentStages.length) {
        const currentIsArrival = currentStages[0].entry.arrivesToday || previousSnapshotKnown && !previousContinuingGroupKeys.has(groupKey);
        const currentStart = currentIsArrival && currentStages[0].entry.startTime ? timestamp(currentStages[0].date, currentStages[0].entry.startTime) : periodStart;
        const currentEnd = currentDeparture?.entry.departureTime ? timestamp(currentDeparture.date, currentDeparture.entry.departureTime) : periodEnd;
        appendWindow(currentStart, currentEnd, currentStages[0], stageTransitions(currentStages));
      }
    } else if (currentStages.length) {
      const previousCrewAtAnotherPosition = previousFinalByCrew.has(currentStages[0].entry.crewId);
      const validCurrentStart = currentStages[0].entry.startTime ? timestamp(currentStages[0].date, currentStages[0].entry.startTime) : Number.NaN;
      if (previousCrewAtAnotherPosition && !Number.isFinite(validCurrentStart)) return;
      const currentIsArrival = currentStages[0].entry.arrivesToday || previousSnapshotKnown && !previousContinuingGroupKeys.has(groupKey);
      const currentStart = currentIsArrival && currentStages[0].entry.startTime ? timestamp(currentStages[0].date, currentStages[0].entry.startTime) : periodStart;
      const currentEnd = currentDeparture?.entry.departureTime ? timestamp(currentDeparture.date, currentDeparture.entry.departureTime) : periodEnd;
      appendWindow(currentStart, currentEnd, currentStages[0], stageTransitions(currentStages));
    } else if (fallback[0]) {
      appendWindow(periodStart, periodEnd, fallback[0], stageTransitions(fallback));
    }
    if (intervals.length) physicalPresenceByGroup.set(groupKey, { intervals, start: Math.min(...intervals.map((item) => item.start)), end: Math.max(...intervals.map((item) => item.end)) });
  });
  const positionIntervals = [...physicalPresenceByGroup.values()].flatMap(({ intervals }) => intervals);
  const conflictingDutyPeriodIds = new Set([...manual.commandDuties, ...manual.guardDuties].flatMap((duty) => duty.periods.filter((dutyPeriod) => {
    if (!duty.personnelId || !dutyPeriod.startDate || !dutyPeriod.startTime || !dutyPeriod.endDate || !dutyPeriod.endTime) return false;
    const start = timestamp(dutyPeriod.startDate, dutyPeriod.startTime); const end = timestamp(dutyPeriod.endDate, dutyPeriod.endTime);
    return positionIntervals.some((interval) => interval.personnelId === duty.personnelId && start <= interval.end && end >= interval.start);
  }).map((dutyPeriod) => dutyPeriod.id)));
  const flightGroupKeys = [...new Set(datedEntries.map(({ entry }) => { const crew = entryCrew(entry, crews); return `${entry.crewId}|${entryPositionId(entry, crew) ?? entry.positionName ?? crew?.positionName ?? ""}`; }))];
  const automaticFlightItems: SummaryFlightItem[] = flightGroupKeys.flatMap((groupKey) => {
    const [rawCrewId, rawPositionKey] = groupKey.split("|");
    const crewId = Number(rawCrewId);
    const snapshotEntry = [...datedEntries].reverse().find(({ entry }) => entry.crewId === crewId)?.entry;
    const crew = snapshotEntry ? entryCrew(snapshotEntry, crews) : undefined; if (!crew) return [];
    const stages = datedEntries.filter(({ entry }) => `${entry.crewId}|${entryPositionId(entry, crew) ?? entry.positionName ?? crew.positionName ?? ""}` === groupKey);
    const latest = stages[stages.length - 1]?.entry;
    if (!latest) return [];
    const position = entryPosition(latest, crew, positions);
    const positionId = entryPositionId(latest, crew);
    const crewFlights = flights.filter((flight) => flight.crewId === crewId && (!positionId || !flight.positionId || flight.positionId === positionId));
    const uavs = new Map<string, SummaryFlightUav>();
    stages.flatMap(({ entry }) => entry.uavSnapshots ?? []).forEach((asset) => uavs.set(`equipment-${asset.equipmentId}-${asset.serialNumber}`, { id: `equipment-${asset.equipmentId}-${asset.serialNumber}`, equipmentId: asset.equipmentId, name: asset.name, serialNumber: asset.serialNumber }));
    stages.flatMap(({ entry }) => entry.uavSelections ?? []).forEach((selection) => { const asset = equipment.find((item) => item.id === selection.equipmentId); if (asset && ![...uavs.values()].some((item) => item.equipmentId === asset.id)) uavs.set(`equipment-${asset.id}`, { id: `equipment-${asset.id}`, equipmentId: asset.id, name: asset.name, serialNumber: asset.inventoryNumber }); });
    crewFlights.forEach((flight) => { const key = `${flight.uavId ?? "journal"}-${flight.uavSerialNumber || flight.uavName}`; if (!uavs.has(key)) uavs.set(key, { id: key, equipmentId: flight.uavId, name: flight.uavName, serialNumber: flight.uavSerialNumber }); });
    if (!uavs.size && crew.uavName) uavs.set(`crew-${crew.id}`, { id: `crew-${crew.id}`, equipmentId: crew.primaryUavId ?? null, name: crew.uavName, serialNumber: "" });
    const members = (physicalPresenceByGroup.get(groupKey)?.intervals ?? []).sort((left, right) => left.start - right.start).map(({ personnelId, start, end, entry }) => {
      const member = entryMember(entry, crew, input.staffing, personnelId);
      return { id: `member-${crewId}-${personnelId}-${start}`, personnelId, fullName: member?.fullName || "ПІБ не вказано", rank: member?.rank || "звання не вказано", startDate: datePart(new Date(start)), startTime: timePart(new Date(start)), endDate: datePart(new Date(end)), endTime: timePart(new Date(end)) };
    });
    return [{ id: `auto-flight-${crewId}-${rawPositionKey || "none"}`, crewId, workStrip: entryWorkStrip(latest, crew, position), positionName: entryPositionName(latest, crew, position), mgrs: latest.positionMgrs || position?.mgrs || "", locality: latest.positionLocality || position?.locality || "", unitShortName: settings.unit.shortName, crewName: latest.crewName || crew.name, taskArea: latest.areaPoints?.join(", ") || crew.reconnaissanceArea || latest.positionLocality || position?.locality || "", uavs: [...uavs.values()], members, flightTimes: crewFlights.map((flight) => ({ date: flight.flightDate, time: flight.skyTime })) }];
  });
  const flightOverrides = manual.flightItems ?? [];
  const selectedFlightItems = manual.flightItems === null ? automaticFlightItems : [
    ...automaticFlightItems.map((automatic) => {
      const override = flightOverrides.find((item) => item.id === automatic.id);
      if (!override) return automatic;
      const members = automatic.members.map((member) => {
        const samePersonCount = automatic.members.filter((item) => item.personnelId === member.personnelId).length;
        const corrected = override.members.find((item) => item.id === member.id) ?? (samePersonCount === 1 ? override.members.find((item) => item.personnelId === member.personnelId) : undefined);
        return corrected ? { ...member, startDate: corrected.startDate, startTime: corrected.startTime, endDate: corrected.endDate, endTime: corrected.endTime } : member;
      });
      return { ...automatic, uavs: override.uavs, members, excluded: override.excluded };
    }),
    ...flightOverrides.filter((item) => !item.id.startsWith("auto-flight-")),
  ].filter((item) => !item.excluded);
  const flightLines: SummaryBlockLine[] = [];
  let previousStrip: string | null = null;
  selectedFlightItems.forEach((item) => {
    if (item.workStrip !== previousStrip) {
      if (previousStrip !== null) flightLines.push({ text: "", kind: "paragraph" });
      flightLines.push(
        { text: `У межах смуги оборони ${item.workStrip || "смугу не вказано"}:`, bold: true, kind: "paragraph" },
        { text: "", kind: "paragraph" },
      );
      previousStrip = item.workStrip;
    }
    const uavText = item.uavs.map((uav) => `${uav.name || "назву не вказано"}${uav.serialNumber ? `, серійний № ${uav.serialNumber}` : ""}`).join("; ") || "не вказано";
    const positionName = `«${item.positionName || "позиція не вказана"}»`;
    const unitName = item.unitShortName || "підрозділ не вказано";
    const crewName = `«${item.crewName || "екіпаж не вказано"}»`;
    const flightIntroRuns = [
      { text: "Із стартової позиції " }, { text: positionName, bold: true },
      { text: ` (${item.mgrs || "координати не вказано"}) в районі ${item.locality || "населений пункт не вказано"} екіпажем ` },
      { text: `${unitName} ` }, { text: crewName, bold: true },
      { text: ` (БпЛА ${uavText}) виконується бойове чергування з повітряної розвідки в районі ${item.taskArea || "район не вказано"} у складі:` },
    ];
    flightLines.push({ text: flightIntroRuns.map((run) => run.text).join(""), runs: flightIntroRuns, kind: "paragraph" });
    item.members.forEach((member) => flightLines.push({ text: `-${member.rank} ${personName(member.fullName)} – з ${member.startTime || "18:01"} год ${displayDate(member.startDate)} по ${member.endTime || "18:00"} год ${displayDate(member.endDate)};`, kind: "item" }));
    if (!item.members.length) flightLines.push({ text: "-склад не вказаний;", kind: "item" });
    const times = item.flightTimes.map((flight) => `${displayDate(flight.date)} о ${flight.time} год`).join(", ");
    const noun = item.flightTimes.length === 1 ? "розвідувальний виліт" : `розвідувальні вильоти у кількості ${item.flightTimes.length}`;
    const periodPrefix = `В період з 18:01 год ${displayDate(shiftDate(reportDate, -1))} по 18:00 год ${displayDate(reportDate)} `;
    const flightResult = item.flightTimes.length ? `здійснено ${noun}: ${times}.` : "розвідувальні вильоти не здійснювалися.";
    const flightSuffix = item.flightTimes.length ? " Більш детально в ІС «DELTA» за відповідними шарами." : "";
    flightLines.push({ text: `${periodPrefix}${flightResult}${flightSuffix}`, runs: [{ text: periodPrefix }, { text: flightResult, bold: true }, { text: flightSuffix }], kind: "paragraph" });
  });
  if (!flightLines.length) flightLines.push({ text: "Екіпажі у плані польотів за звітний період відсутні.", kind: "paragraph" });
  const flightOperations = flightLines.map((item) => item.text).join("\n");
  const rotationEvents: SummaryTextItem[] = [];
  input.snapshots.forEach((_snapshot, snapshotIndex) => {
    const byCrew = new Map<number, typeof entries>();
    relevantSnapshotEntries.filter((stage) => stage.snapshotIndex === snapshotIndex).forEach(({ entry }) => byCrew.set(entry.crewId, [...(byCrew.get(entry.crewId) ?? []), entry]));
    byCrew.forEach((stages, crewId) => stages.slice(1).forEach((next, index) => {
      const previous = stages[index]; const crew = entryCrew(next, crews) ?? entryCrew(previous, crews); const position = entryPosition(next, crew, positions);
      if (!crew || (!position && !next.positionName && !previous.positionName)) return;
      const leaving = previous.actualMemberIds.filter((id) => !next.actualMemberIds.includes(id)).map((id) => entryMember(previous, crew, input.staffing, id)).filter((member): member is NonNullable<typeof member> => Boolean(member));
      const entering = next.actualMemberIds.filter((id) => !previous.actualMemberIds.includes(id)).map((id) => entryMember(next, crew, input.staffing, id)).filter((member): member is NonNullable<typeof member> => Boolean(member));
      if (!leaving.length && !entering.length) return;
      const eventDate = relevantSnapshotEntries.find((stage) => stage.snapshotIndex === snapshotIndex && stage.entry === next)?.date ?? (snapshotIndex === 0 ? shiftDate(reportDate, -1) : reportDate);
      const eventTimestamp = next.startTime ? timestamp(eventDate, next.startTime) : Number.NaN;
      if (!Number.isFinite(eventTimestamp) || eventTimestamp < periodStart || eventTimestamp > periodEnd) return;
      const identityList = (members: typeof leaving) => members.map((member) => `-${member.rank} ${personName(member.fullName)};`).join("\n") || "-склад не вказаний;";
      const paragraphs = [
        leaving.length ? `-${previous.endTime || "час не вказано"} год ${displayDate(eventDate)} завершив бойове чергування та виконання бойових (спеціальних) завдань з ведення повітряної розвідки противника з позиції «${entryPositionName(previous, crew, entryPosition(previous, crew, positions)).toLocaleUpperCase("uk")}» (${previous.positionMgrs || position?.mgrs || "координати не вказано"}) в районі ${previous.positionLocality || position?.locality || "не вказано"} екіпаж «${(previous.crewName || crew.name).toLocaleUpperCase("uk")}» та вибув в розташування ${settings.unit.shortName || "підрозділу"} у складі:\n${identityList(leaving)}` : "",
        entering.length ? `-${next.startTime || "час не вказано"} год ${displayDate(eventDate)} приступив до бойового чергування та виконання бойових (спеціальних) завдань з ведення повітряної розвідки противника з позиції «${entryPositionName(next, crew, position).toLocaleUpperCase("uk")}» (${next.positionMgrs || position?.mgrs || "координати не вказано"}) в районі ${next.positionLocality || position?.locality || "не вказано"} екіпаж «${(next.crewName || crew.name).toLocaleUpperCase("uk")}» у складі:\n${identityList(entering)}` : "",
      ].filter(Boolean).join("\n");
      rotationEvents.push({ id: `rotation-${eventDate}-${crewId}-${next.rotationId || index}`, date: eventDate, time: next.startTime, text: paragraphs });
    }));
  });
  crossSnapshotTransitions.forEach((transition) => {
    const crew = entryCrew(transition.current.entry, crews) ?? entryCrew(transition.previous.entry, crews);
    if (!crew) return;
    const identityList = (entry: typeof transition.current.entry, ids: number[]) => ids.map((id) => entryMember(entry, crew, input.staffing, id)).filter((member): member is NonNullable<typeof member> => Boolean(member)).map((member) => `-${member.rank} ${personName(member.fullName)};`).join("\n") || "-склад не вказаний;";
    const transitionContext = (entry: typeof transition.current.entry) => {
      const position = entryPosition(entry, crew, positions);
      return { name: entryPositionName(entry, crew, position).toLocaleUpperCase("uk") || "ПОЗИЦІЯ НЕ ВКАЗАНА", mgrs: entry.positionMgrs || position?.mgrs || "координати не вказано", locality: entry.positionLocality || position?.locality || "населений пункт не вказано" };
    };
    const departureDate = datePart(new Date(transition.departureAt));
    const departureTime = timePart(new Date(transition.departureAt));
    if (transition.previousGroupKey !== transition.currentGroupKey) {
      if (transition.departureAt < periodStart || transition.departureAt > periodEnd) return;
      const place = transitionContext(transition.previous.entry);
      rotationEvents.push({
        id: `crew-position-exit-${transition.previous.entry.crewId}-${transition.previousGroupKey}-${departureDate}-${departureTime}`,
        date: departureDate,
        time: departureTime,
        text: `-${departureTime} год ${displayDate(departureDate)} завершив бойове чергування та виконання бойових (спеціальних) завдань з ведення повітряної розвідки противника з позиції «${place.name}» (${place.mgrs}) в районі ${place.locality} екіпаж «${(transition.previous.entry.crewName || crew.name).toLocaleUpperCase("uk")}» та вибув в розташування ${settings.unit.shortName || "підрозділу"} у складі:\n${identityList(transition.previous.entry, transition.previous.entry.actualMemberIds)}`,
      });
      return;
    }
    if (!transition.compositionChanged) return;
    const leavingIds = transition.previous.entry.actualMemberIds.filter((id) => !transition.current.entry.actualMemberIds.includes(id));
    const enteringIds = transition.current.entry.actualMemberIds.filter((id) => !transition.previous.entry.actualMemberIds.includes(id));
    const previousPlace = transitionContext(transition.previous.entry);
    const currentPlace = transitionContext(transition.current.entry);
    const paragraphs = [
      leavingIds.length && transition.departureAt >= periodStart ? `-${departureTime} год ${displayDate(departureDate)} завершив бойове чергування та виконання бойових (спеціальних) завдань з ведення повітряної розвідки противника з позиції «${previousPlace.name}» (${previousPlace.mgrs}) в районі ${previousPlace.locality} екіпаж «${(transition.previous.entry.crewName || crew.name).toLocaleUpperCase("uk")}» та вибув в розташування ${settings.unit.shortName || "підрозділу"} у складі:\n${identityList(transition.previous.entry, leavingIds)}` : "",
      enteringIds.length ? `-${transition.current.entry.startTime} год ${displayDate(transition.current.date)} приступив до бойового чергування та виконання бойових (спеціальних) завдань з ведення повітряної розвідки противника з позиції «${currentPlace.name}» (${currentPlace.mgrs}) в районі ${currentPlace.locality} екіпаж «${(transition.current.entry.crewName || crew.name).toLocaleUpperCase("uk")}» у складі:\n${identityList(transition.current.entry, enteringIds)}` : "",
    ].filter(Boolean).join("\n");
    if (paragraphs) rotationEvents.push({ id: `snapshot-rotation-${transition.current.date}-${transition.current.entry.crewId}-${transition.current.entry.rotationId || transition.current.entry.startTime}`, date: transition.current.date, time: transition.current.entry.startTime, text: paragraphs });
  });
  const stagesByCrewPosition = new Map<string, typeof datedEntries>();
  datedEntries.forEach((stage) => {
    const crew = entryCrew(stage.entry, crews);
    const key = `${stage.entry.crewId}|${entryPositionId(stage.entry, crew) ?? entryPositionName(stage.entry, crew, entryPosition(stage.entry, crew, positions))}`;
    stagesByCrewPosition.set(key, [...(stagesByCrewPosition.get(key) ?? []), stage]);
  });
  stagesByCrewPosition.forEach((stages, key) => {
    const previousStages = stages.filter(({ snapshotIndex }) => snapshotIndex === 0).sort((left, right) => left.index - right.index);
    const currentStages = stages.filter(({ snapshotIndex }) => snapshotIndex === 1).sort((left, right) => left.index - right.index);
    const first = previousStages[0] ?? currentStages[0] ?? stages[0];
    const crew = first ? entryCrew(first.entry, crews) : undefined; if (!first || !crew) return;
    const identityList = (entry: typeof first.entry, ids: number[]) => ids.map((id) => entryMember(entry, crew, input.staffing, id)).filter((member): member is NonNullable<typeof member> => Boolean(member)).map((member) => `-${member.rank} ${personName(member.fullName)};`).join("\n") || "-склад не вказаний;";
    const context = (entry: typeof first.entry) => {
      const position = entryPosition(entry, crew, positions);
      return { name: entryPositionName(entry, crew, position).toLocaleUpperCase("uk") || "ПОЗИЦІЯ НЕ ВКАЗАНА", mgrs: entry.positionMgrs || position?.mgrs || "координати не вказано", locality: entry.positionLocality || position?.locality || "населений пункт не вказано" };
    };
    const currentStart = currentStages[0];
    const arrivalStages = [
      previousStages[0]?.entry.arrivesToday ? previousStages[0] : null,
      currentStart && (currentStart.entry.arrivesToday || previousSnapshotKnown && !previousContinuingGroupKeys.has(key)) ? currentStart : null,
    ].filter((stage): stage is typeof first => Boolean(stage));
    arrivalStages.forEach((arrival) => {
      const arrivalTimestamp = arrival.entry.startTime ? timestamp(arrival.date, arrival.entry.startTime) : Number.NaN;
      if (!Number.isFinite(arrivalTimestamp) || arrivalTimestamp < periodStart || arrivalTimestamp > periodEnd) return;
      const place = context(arrival.entry);
      rotationEvents.push({ id: `crew-enter-${key}-${arrival.date}-${arrival.entry.startTime}`, date: arrival.date, time: arrival.entry.startTime, text: `-${arrival.entry.startTime} год ${displayDate(arrival.date)} приступив до бойового чергування та виконання бойових (спеціальних) завдань з ведення повітряної розвідки противника з позиції «${place.name}» (${place.mgrs}) в районі ${place.locality} екіпаж «${(arrival.entry.crewName || crew.name).toLocaleUpperCase("uk")}» у складі:\n${identityList(arrival.entry, arrival.entry.actualMemberIds)}` });
    });
    [previousStages, currentStages].forEach((snapshotStages) => {
      const departure = snapshotStages.find(({ entry }) => entry.departsToday && entry.departureTime);
      if (!departure?.entry.departureTime) return;
      const departureTimestamp = timestamp(departure.date, departure.entry.departureTime);
      if (departureTimestamp < periodStart || departureTimestamp > periodEnd) return;
      const finalStage = snapshotStages[snapshotStages.length - 1] ?? departure;
      const place = context(finalStage.entry);
      rotationEvents.push({ id: `crew-exit-${key}-${departure.date}-${departure.entry.departureTime}`, date: departure.date, time: departure.entry.departureTime, text: `-${departure.entry.departureTime} год ${displayDate(departure.date)} завершив бойове чергування та виконання бойових (спеціальних) завдань з ведення повітряної розвідки противника з позиції «${place.name}» (${place.mgrs}) в районі ${place.locality} екіпаж «${(finalStage.entry.crewName || crew.name).toLocaleUpperCase("uk")}» та вибув в розташування ${settings.unit.shortName || "підрозділу"} у складі:\n${identityList(finalStage.entry, finalStage.entry.actualMemberIds)}` });
    });
  });

  const addDutyEvent = (duty: SummaryDutyItem, kind: "command" | "guard") => {
    const first = duty.periods.filter((item) => item.startDate && item.startTime && !conflictingDutyPeriodIds.has(item.id)).sort((left, right) => `${left.startDate}T${left.startTime}`.localeCompare(`${right.startDate}T${right.startTime}`))[0];
    if (!duty.personnelId || !first) return;
    const eventTimestamp = `${first.startDate}T${first.startTime}`;
    if (eventTimestamp < period.start || eventTimestamp > period.end) return;
    const person = input.staffing?.find((item) => item.personnelId === duty.personnelId); if (!person) return;
    const identity = `${person.rank} ${personName(person.fullName)}`;
    const place = `КСП «${settings.unit.kspName || "назву не вказано"}» ${settings.unit.shortName || "підрозділу"} (${settings.unit.kspMgrs || "координати не вказано"}) в населеному пункті ${settings.unit.kspLocality || "не вказано"}`;
    const action = kind === "guard" ? `заступив на охорону та оборону ${place}, забезпечуючи цілодобовий позмінний графік чергування, військовослужбовець - ${identity}.` : `заступив на позмінне управління боєм на ${place}, військовослужбовець - ${identity}.`;
    rotationEvents.push({ id: `ksp-${kind}-${duty.id}`, date: first.startDate, time: first.startTime, text: `-${first.startTime} год ${displayDate(first.startDate)} року ${action}` });
  };
  manual.commandDuties.forEach((duty) => addDutyEvent(duty, "command"));
  manual.guardDuties.forEach((duty) => addDutyEvent(duty, "guard"));

  const currentPositionWork = input.positionWork ?? [];
  const historicalPositionWork = (input.positionWorkHistory ?? []).map((event) => {
    if (event.members.length) return event;
    const current = currentPositionWork.find((work) => work.id === event.workId);
    return current ? { ...event, members: current.members } : event;
  });
  const historicalCurrentKeys = new Set(historicalPositionWork.map((event) => `${event.workId}|${event.status}|${event.startDate}|${event.startTime}|${event.endDate}|${event.endTime}`));
  const firstHistoricalEventIdByWork = historicalPositionWork.reduce((result, event) => result.set(event.workId, Math.min(result.get(event.workId) ?? event.id, event.id)), new Map<number, number>());
  const positionWorkEvents: Array<PositionWork | PositionWorkStatusEvent> = [
    ...historicalPositionWork,
    ...currentPositionWork.filter((work) => !historicalCurrentKeys.has(`${work.id}|${work.status}|${work.startDate}|${work.startTime}|${work.endDate}|${work.endTime}`)),
  ];
  positionWorkEvents.forEach((work) => {
    const eventDate = work.status === "Завершили" && work.endDate ? work.endDate : work.startDate;
    const eventTime = work.status === "Завершили" && work.endTime ? work.endTime : work.startTime;
    const timestamp = `${eventDate}T${eventTime}`;
    if (timestamp < period.start || timestamp > period.end) return;
    const position = positions.find((item) => item.id === work.positionId);
    const positionName = work.positionName || position?.name || "назву не вказано";
    const positionMgrs = ("workId" in work ? work.positionMgrs : "") || position?.mgrs;
    const positionLocality = ("workId" in work ? work.positionLocality : "") || position?.locality;
    const duties = new Set(work.members.map((member) => member.dutyType));
    const activity = duties.has("Рекогностування") && duties.has("Облаштування")
      ? "рекогностування і дооблаштування"
      : duties.has("Рекогностування")
        ? "рекогностування"
        : duties.has("Облаштування")
          ? "дооблаштування"
          : work.workType === "Рекогностування"
            ? "рекогностування"
            : "дооблаштування";
    const hasGuard = duties.has("Охорона та оборона");
    const verb = work.status === "Приступили"
      ? `приступили до ${hasGuard ? `позмінної охорони, оборони та ${activity}` : activity}`
      : work.status === "Завершили"
        ? `завершили ${hasGuard ? `позмінну охорону, оборону та ${activity}` : activity}`
        : `продовжують ${hasGuard ? `позмінну охорону, оборону та ${activity}` : activity}`;
    const groupedMembers = new Map<number, { fullName: string; rank: string; periods: typeof work.members }>();
    work.members.forEach((member) => {
      const current = groupedMembers.get(member.personnelId);
      groupedMembers.set(member.personnelId, {
        fullName: current?.fullName || member.fullName,
        rank: current?.rank || member.rank,
        periods: [...(current?.periods ?? []), member],
      });
    });
    const people = [...groupedMembers.values()].map((group) => {
      const periods = [...group.periods]
        .sort((left, right) => `${left.startDate || work.startDate}T${left.startTime || work.startTime}`.localeCompare(`${right.startDate || work.startDate}T${right.startTime || work.startTime}`))
        .map((member) => {
          const startDate = member.startDate || work.startDate;
          const startTime = member.startTime || work.startTime;
          const endDate = member.endDate || work.endDate;
          const endTime = member.endTime || work.endTime;
          if (!startDate || !startTime || !endDate || !endTime) return "";
          const dutyText = member.dutyType === "Охорона та оборона"
            ? "охорону та оборону, прикриття військовослужбовців залучених до даного завдання від БпЛА противника, диверсійно-розвідувальних груп ворога"
            : member.dutyType === "Облаштування"
              ? "дооблаштування позиції"
              : "рекогностування позиції";
          return `-в період з ${startTime} год ${displayDate(startDate)} по ${endTime} год ${displayDate(endDate)} здійснював ${dutyText};`;
        })
        .filter(Boolean);
      return [`${group.rank} ${personName(group.fullName)}:`, ...periods].join("\n");
    }).join("\n");
    const commander = settings.unit.militaryUnitShortName || settings.unit.unitCode || settings.unit.battalionShortName || "батальйону";
    const order = work.battleOrder ? ` на виконання БОЙОВОГО РОЗПОРЯДЖЕННЯ КОМАНДИРА ${commander} ${work.battleOrder}` : "";
    rotationEvents.push({
      id: "workId" in work && firstHistoricalEventIdByWork.get(work.workId) !== work.id ? `position-work-event-${work.id}` : `position-work-${"workId" in work ? work.workId : work.id}`,
      date: eventDate,
      time: eventTime,
      text: `-${eventTime} год ${displayDate(eventDate)}${order} ${verb} позиції старту БпЛА «${positionName.toLocaleUpperCase("uk")}» (${positionMgrs || "координати не вказано"}) в районі ${positionLocality || "населений пункт не вказано"} військовослужбовці:\n${people || "склад не вказаний;"}`,
    });
  });
  rotationEvents.sort((left, right) => `${left.date || ""}T${left.time || ""}|${left.id}`.localeCompare(`${right.date || ""}T${right.time || ""}|${right.id}`));
  const selectedAutoEvents = rotationEvents.filter((item) => manual.includedAutoEventIds.includes(item.id)).map((item) => manual.autoEventEdits[item.id] || item.text);
  const periodEvents = [...selectedAutoEvents, ...manual.manualEvents.map((item) => item.text.trim())].filter(Boolean).join("\n") || "Подій не зафіксовано.";
  const signer = settings.mainSigner;
  const name = (signer.fullName || "").trim().split(/\s+/u);
  const staffing = input.staffing ?? [];
  const kspConflict = conflictingDutyPeriodIds.size > 0;
  const commandCoverage = dutyCoverageWarning(manual.commandDuties, reportDate, "Позмінне управління боєм на КСП");
  const guardCoverage = dutyCoverageWarning(manual.guardDuties, reportDate, "Позмінна охорона та оборона КСП");
  const signerPosition = summarySignerPosition(settings);
  const automatic = { forceComposition, positions: positionText, flightOperations, periodEvents };
  const auto = (key: keyof typeof automatic) => manual.autoOverrides[key]?.trim() || automatic[key];
  const warnings = [!settings.unit.shortName && "Не вказана коротка назва підрозділу.", !settings.unit.reportRecipient && "Не вказаний адресат донесення.", !settings.unit.kspName && "Не вказана назва КСП.", !settings.unit.kspLocality && "Не вказаний населений пункт КСП.", !manual.reportNumber && "Не вказаний номер донесення.", !signer.fullName && "Не вказаний основний підписант.", signerPosition.warning, input.journal.some((flight) => flight.flightDate >= shiftDate(reportDate, -1) && flight.flightDate <= reportDate && !flight.skyTime) && "У журналі є політ без часу «Небо».", commandCoverage, guardCoverage, kspConflict && "Людина з чергування КСП одночасно зазначена на позиції. Приберіть її з КСП або плану польотів."].filter((item): item is string => Boolean(item));
  const enemy = manual.enemyLosses;
  const values: Record<string, string> = {
    recipient: settings.unit.reportRecipient || "не вказано", report_number: manual.reportNumber || "не вказано", unit_short_name: settings.unit.shortName || "назву не вказано", military_unit_short_name: settings.unit.militaryUnitShortName || settings.unit.unitCode || "військову частину не вказано", ksp_name: settings.unit.kspName || "назву не вказано", ksp_locality: settings.unit.kspLocality || "населений пункт не вказано", report_date: displayDate(reportDate),
    composition_changes: manual.compositionOverride ? manual.compositionChanges : "Без змін", force_composition: auto("forceComposition"), completeness: `о/с–${manual.completeness.personnel || "0"}%; ОВТ: АТ–${manual.completeness.automotive || "0"}%, БпАК (${manual.completeness.uavType || "розвідувальні літакового типу"}) – ${manual.completeness.uav || "0"}%, ЗББР – ${manual.completeness.zbbr || "0"}%, ПММ – ${manual.completeness.fuel || "0"}%.`, positions: auto("positions"),
    enemy_actions: "", assault_actions: "", battalion_short_name: settings.unit.battalionShortName || "назву батальйону не вказано", period_start_date: displayDate(shiftDate(reportDate, -1)), period_end_date: displayDate(reportDate), flight_count: flights.length ? `здійснювалися ${flights.length} рази.` : "не здійснювалися.", flight_operations: flightOperations,
    ksp_mgrs: settings.unit.kspMgrs || "координати не вказано", ksp_outskirts: manual.kspOutskirts || "південні околиці", command_duties: "", guard_duties: "", period_events: auto("periodEvents"), commissions: manual.commissionsOverride ? manual.commissions : "В поточному періоді не працювали.", fortification: manual.fortificationOverride ? manual.fortification : "Заходи з фортифікаційного обладнання не велись.", dzvin: manual.dzvinOverride ? manual.dzvin : "Зміни не відбувалися.", next_tasks: joinItems(manual.nextTasks),
    personnel_losses: `Загальні втрати особового складу за період з 18:01 год ${displayDate(shiftDate(reportDate, -1))} по 18:00 год ${displayDate(reportDate)} склали ${value(manual.personnelLosses, "total")} осіб, з них:\nБезповоротні – ${value(manual.personnelLosses, "irreversible")}, у тому числі:\nБойові – ${value(manual.personnelLosses, "combatIrreversible")}, з них:\nзагинули – ${value(manual.personnelLosses, "killed")};\nпомерли від ран – ${value(manual.personnelLosses, "diedFromWounds")};\nІнші – ${value(manual.personnelLosses, "other")};\nТимчасові – ${value(manual.personnelLosses, "temporary")}, у тому числі:\nБойові – ${value(manual.personnelLosses, "combatTemporary")}, з них:\nсанітарні бойові – ${value(manual.personnelLosses, "wounded")};\nполон – ${value(manual.personnelLosses, "captured")};\nзникли безвісті – ${value(manual.personnelLosses, "missing")};\nдезертири – ${value(manual.personnelLosses, "deserters")};\nСЗЧ – ${value(manual.personnelLosses, "szch")};`, equipment_losses: `Всього: – ${value(manual.equipmentLosses, "total")} од., з них: знищено – ${value(manual.equipmentLosses, "destroyed")} од., втрачено – ${value(manual.equipmentLosses, "lost")} од., пошкоджено – ${value(manual.equipmentLosses, "damaged")} од.;\nтанків – ${value(manual.equipmentLosses, "tanks")} од.;\nББМ – ${value(manual.equipmentLosses, "afv")} од.;\nГіМ – ${value(manual.equipmentLosses, "artillery")} од.;\nзасоби ППО – ${value(manual.equipmentLosses, "airDefence")} од.;\nАТ – ${value(manual.equipmentLosses, "vehicles")} од.;\nзасоби РЕБ – ${value(manual.equipmentLosses, "reb")} од.; засоби зв’язку – ${value(manual.equipmentLosses, "communications")} од.;\nБпЛА – ${value(manual.equipmentLosses, "uav")} од.`, equipment_losses_details: manual.equipmentLossesDetails || "Відсутні.", ammunition_expenses: manual.ammunitionExpenses || "-не застосовувалися.", problems: manual.problems || "не вказано", other_issues: joinItems(manual.otherIssues, "-відсутні."), signer_position: signerPosition.text, signer_rank: signer.rank || "не вказано", signer_given_name: name[1] || "ім’я не вказано", signer_surname: name[0]?.toLocaleUpperCase("uk") || "прізвище не вказано", arm_number: settings.unit.armNumber || settings.unit.armyCorpsNumber || "номер не вказано",
  };
  const numericValues: Record<string, [Record<string, string>, string]> = {
    enemy_personnel: [enemy, "personnel"], enemy_irreversible: [enemy, "irreversible"], enemy_sanitary: [enemy, "sanitary"], enemy_captured: [enemy, "captured"], enemy_ovt: [enemy, "ovt"], enemy_ovt_destroyed: [enemy, "ovtDestroyed"], enemy_ovt_damaged: [enemy, "ovtDamaged"], enemy_tanks: [enemy, "tanks"], enemy_tanks_destroyed: [enemy, "tanksDestroyed"], enemy_tanks_damaged: [enemy, "tanksDamaged"], enemy_afv: [enemy, "afv"], enemy_afv_destroyed: [enemy, "afvDestroyed"], enemy_afv_damaged: [enemy, "afvDamaged"], enemy_artillery: [enemy, "artillery"], enemy_artillery_destroyed: [enemy, "artilleryDestroyed"], enemy_artillery_damaged: [enemy, "artilleryDamaged"], enemy_mlrs: [enemy, "mlrs"], enemy_mlrs_destroyed: [enemy, "mlrsDestroyed"], enemy_mlrs_damaged: [enemy, "mlrsDamaged"], enemy_reb: [enemy, "reb"], enemy_reb_destroyed: [enemy, "rebDestroyed"], enemy_reb_damaged: [enemy, "rebDamaged"], enemy_vehicles: [enemy, "vehicles"], enemy_vehicles_destroyed: [enemy, "vehiclesDestroyed"], enemy_vehicles_damaged: [enemy, "vehiclesDamaged"], enemy_aircraft: [enemy, "aircraft"], enemy_aircraft_destroyed: [enemy, "aircraftDestroyed"], enemy_aircraft_damaged: [enemy, "aircraftDamaged"], enemy_uav: [enemy, "uav"], enemy_uav_destroyed: [enemy, "uavDestroyed"], enemy_uav_damaged: [enemy, "uavDamaged"], enemy_uav_loitering: [enemy, "uavLoitering"], enemy_uav_molniya: [enemy, "uavMolniya"], enemy_uav_lancet: [enemy, "uavLancet"], enemy_uav_reb: [enemy, "uavReb"], enemy_special_equipment: [enemy, "specialEquipment"], enemy_special_equipment_destroyed: [enemy, "specialEquipmentDestroyed"], enemy_special_equipment_damaged: [enemy, "specialEquipmentDamaged"], enemy_recon_equipment: [enemy, "reconEquipment"], enemy_recon_equipment_destroyed: [enemy, "reconEquipmentDestroyed"], enemy_recon_equipment_damaged: [enemy, "reconEquipmentDamaged"], enemy_uav_control: [enemy, "uavControl"], enemy_uav_control_destroyed: [enemy, "uavControlDestroyed"], enemy_uav_control_damaged: [enemy, "uavControlDamaged"], enemy_communications: [enemy, "communications"], enemy_communications_destroyed: [enemy, "communicationsDestroyed"], enemy_communications_damaged: [enemy, "communicationsDamaged"], enemy_command_posts: [enemy, "commandPosts"], enemy_shelters: [enemy, "shelters"], enemy_command_posts_destroyed: [enemy, "commandPostsDestroyed"], enemy_command_posts_damaged: [enemy, "commandPostsDamaged"], enemy_shelters_damaged: [enemy, "sheltersDamaged"], enemy_ammo_depots: [enemy, "ammoDepots"], enemy_fuel_depots: [enemy, "fuelDepots"], enemy_depots_destroyed: [enemy, "depotsDestroyed"], enemy_depots_damaged: [enemy, "depotsDamaged"],
    own_personnel_total: [manual.personnelLosses, "total"], own_personnel_irreversible: [manual.personnelLosses, "irreversible"], own_personnel_combat_irreversible: [manual.personnelLosses, "combatIrreversible"], own_personnel_killed: [manual.personnelLosses, "killed"], own_personnel_died_from_wounds: [manual.personnelLosses, "diedFromWounds"], own_personnel_other: [manual.personnelLosses, "other"], own_personnel_temporary: [manual.personnelLosses, "temporary"], own_personnel_combat_temporary: [manual.personnelLosses, "combatTemporary"], own_personnel_wounded: [manual.personnelLosses, "wounded"], own_personnel_captured: [manual.personnelLosses, "captured"], own_personnel_missing: [manual.personnelLosses, "missing"], own_personnel_deserters: [manual.personnelLosses, "deserters"], own_personnel_szch: [manual.personnelLosses, "szch"],
    own_equipment_total: [manual.equipmentLosses, "total"], own_equipment_destroyed: [manual.equipmentLosses, "destroyed"], own_equipment_lost: [manual.equipmentLosses, "lost"], own_equipment_damaged: [manual.equipmentLosses, "damaged"], own_tanks: [manual.equipmentLosses, "tanks"], own_tanks_destroyed: [manual.equipmentLosses, "tanksDestroyed"], own_tanks_damaged: [manual.equipmentLosses, "tanksDamaged"], own_afv: [manual.equipmentLosses, "afv"], own_afv_destroyed: [manual.equipmentLosses, "afvDestroyed"], own_afv_damaged: [manual.equipmentLosses, "afvDamaged"], own_artillery: [manual.equipmentLosses, "artillery"], own_artillery_destroyed: [manual.equipmentLosses, "artilleryDestroyed"], own_artillery_damaged: [manual.equipmentLosses, "artilleryDamaged"], own_air_defence: [manual.equipmentLosses, "airDefence"], own_air_defence_destroyed: [manual.equipmentLosses, "airDefenceDestroyed"], own_air_defence_damaged: [manual.equipmentLosses, "airDefenceDamaged"], own_vehicles: [manual.equipmentLosses, "vehicles"], own_vehicles_destroyed: [manual.equipmentLosses, "vehiclesDestroyed"], own_vehicles_damaged: [manual.equipmentLosses, "vehiclesDamaged"], own_reb: [manual.equipmentLosses, "reb"], own_reb_destroyed: [manual.equipmentLosses, "rebDestroyed"], own_communications: [manual.equipmentLosses, "communications"], own_communications_destroyed: [manual.equipmentLosses, "communicationsDestroyed"], own_uav: [manual.equipmentLosses, "uav"], own_uav_lost: [manual.equipmentLosses, "uavLost"], own_uav_damaged: [manual.equipmentLosses, "uavDamaged"],
  };
  Object.entries(numericValues).forEach(([key, [record, field]]) => { values[key] = value(record, field); });
  values.flight_operations = auto("flightOperations");
  const textLines = (text: string, bold = false): SummaryBlockLine[] => text.split("\n").filter(Boolean).map((line) => ({ text: line, bold, kind: line.startsWith("-") ? "item" : "paragraph" }));
  const commandLines = dutyLines(manual.commandDuties, staffing, conflictingDutyPeriodIds, "command");
  const guardLines = dutyLines(manual.guardDuties, staffing, conflictingDutyPeriodIds, "guard");
  const periodEventLines = [
    ...rotationEvents.filter((item) => manual.includedAutoEventIds.includes(item.id)).flatMap((item) => textLines(manual.autoEventEdits[item.id] || item.text)),
    ...manual.manualEvents.flatMap((item) => textLines(`${item.time ? `${item.time} год ` : ""}${item.date ? `${displayDate(item.date)} року ` : ""}${item.text}`)),
  ];
  const compositionBlockLines = compositionLines(selectedCompositionItems, settings);
  const positionBlockLines = positionLines(selectedPositionItems, settings);
  const blocks: Record<string, SummaryBlockLine[]> = {
    force_composition: manual.autoOverrides.forceComposition === undefined ? (compositionBlockLines.length ? compositionBlockLines : [{ text: "Екіпажі у плані польотів відсутні.", kind: "paragraph" }]) : textLines(auto("forceComposition")),
    positions: manual.autoOverrides.positions === undefined ? (positionBlockLines.length ? positionBlockLines : [{ text: "Позиції не визначені.", kind: "paragraph" }]) : textLines(auto("positions")),
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
