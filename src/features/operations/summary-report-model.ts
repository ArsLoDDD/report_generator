import type { AppSettings } from "../../shared/types/domain";
import type { Crew, FlightJournalEntry, FlightPlanRequest, Position, StaffingRecord } from "./types";

export type SummaryTextItem = { id: string; text: string; date?: string; time?: string };
export type SummaryDutyItem = { id: string; personnelId: number | null; startDate: string; startTime: string; endDate: string; endTime: string };
export type SummaryCompositionItem = { id: string; count: string; uavKind: string; battleOrder: string; workStrip: string };
export type SummaryPositionItem = { id: string; workStrip: string; uavName: string; positionName: string; mgrs: string; locality: string };
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
  flightItems: SummaryTextItem[] | null;
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
  return { ...fresh, reportNumber: previous.reportNumber, kspOutskirts: previous.kspOutskirts, compositionItems: previous.compositionItems?.map((item) => ({ ...item, id: crypto.randomUUID() })) ?? null, positionItems: previous.positionItems?.map((item) => ({ ...item, id: crypto.randomUUID() })) ?? null, flightItems: null, commandDuties: previous.commandDuties.map((item) => ({ ...item, id: crypto.randomUUID() })), guardDuties: previous.guardDuties.map((item) => ({ ...item, id: crypto.randomUUID() })), nextTasks: previous.nextTasks.map((item) => ({ ...item, id: crypto.randomUUID() })), problems: previous.problems, otherIssues: previous.otherIssues.map((item) => ({ ...item, id: crypto.randomUUID() })) };
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
const crewCompositionItems = (crews: Crew[], entries: ReturnType<typeof planEntries>): SummaryCompositionItem[] => {
  const groups = new Map<string, { crew: Crew; count: number }>();
  [...new Set(entries.map((entry) => entry.crewId))].forEach((id) => {
    const crew = crews.find((item) => item.id === id); if (!crew) return;
    const key = [roleFromCrew(crew), crew.battleOrder, crew.sector].join("|");
    const current = groups.get(key); groups.set(key, { crew, count: (current?.count ?? 0) + 1 });
  });
  return [...groups.values()].map(({ crew, count }) => ({ id: `auto-composition-${crew.id}`, count: String(count), uavKind: roleFromCrew(crew), battleOrder: crew.battleOrder, workStrip: crew.sector }));
};
const crewPositionItems = (crews: Crew[], positions: Position[], entries: ReturnType<typeof planEntries>): SummaryPositionItem[] => [...new Set(entries.map((entry) => entry.crewId))].flatMap((id) => {
  const crew = crews.find((item) => item.id === id); if (!crew) return [];
  const position = positions.find((item) => item.id === crew.positionId);
  return [{ id: `auto-position-${crew.id}`, workStrip: crew.sector, uavName: crew.uavName, positionName: position?.name || crew.positionName, mgrs: position?.mgrs || "", locality: position?.locality || "" }];
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
    { text: `Для виконання бойових (спеціальних) завдань в смузі оборони ${strip} ${settings.unit.armyCorpsNumber || "номер не вказано"} АК на глибину батальйонних районів оборони підрозділів виставлено:`, bold: true, kind: "paragraph" as const },
    ...rows.map((item) => ({ text: `- стартову позицію БпАК «${item.uavName || "назву не вказано"}» – «${(item.positionName || "назву не вказано").toLocaleUpperCase("uk")}» (${item.mgrs || "координати не вказано"}) в районі ${item.locality || "населений пункт не вказано"};`, kind: "item" as const })),
  ]);
};

export function buildSummaryDocument(input: { reportDate: string; manual: SummaryManual; settings: AppSettings; crews: Crew[]; positions: Position[]; journal: FlightJournalEntry[]; snapshots: Array<FlightPlanRequest | null>; staffing?: StaffingRecord[] }): { document: SummaryDocument; warnings: string[]; automatic: Record<string, string>; objects: { compositionItems: SummaryCompositionItem[]; positionItems: SummaryPositionItem[]; flightItems: SummaryTextItem[]; rotationEvents: SummaryTextItem[] } } {
  const { reportDate, manual, settings, crews, positions } = input;
  const period = reportPeriod(reportDate);
  const flights = input.journal.filter((flight) => flight.skyTime && `${flight.flightDate}T${flight.skyTime}` >= period.start && `${flight.flightDate}T${flight.skyTime}` <= period.end);
  const entries = planEntries(input.snapshots);
  const positionPersonnel = new Set(entries.flatMap((entry) => entry.actualMemberIds ?? []));
  const automaticCompositionItems = crewCompositionItems(crews, entries);
  const automaticPositionItems = crewPositionItems(crews, positions, entries);
  const selectedCompositionItems = manual.compositionItems ?? automaticCompositionItems;
  const selectedPositionItems = manual.positionItems ?? automaticPositionItems;
  const forceComposition = compositionLines(selectedCompositionItems, settings).map((item) => item.text).join("\n") || "Екіпажі у плані польотів відсутні.";
  const positionText = positionLines(selectedPositionItems, settings).map((item) => item.text).join("\n") || "Позиції не визначені.";
  const flightGroups = new Map<string, FlightJournalEntry[]>();
  flights.forEach((flight) => { const key = `${flight.workStrip}|${flight.crewId}|${flight.positionId}|${flight.uavId}`; flightGroups.set(key, [...(flightGroups.get(key) ?? []), flight]); });
  const flightLines: SummaryBlockLine[] = [];
  const automaticFlightItems: SummaryTextItem[] = [];
  let previousStrip = "";
  [...flightGroups.values()].forEach((rows) => {
    const flight = rows[0]; const crew = crews.find((item) => item.id === flight.crewId); const position = positions.find((item) => item.id === flight.positionId);
    const strip = flight.workStrip || crew?.sector || "Смуга роботи не вказана";
    const groupLines: SummaryBlockLine[] = [];
    if (strip !== previousStrip) { groupLines.push({ text: `У межах смуги оборони ${strip}:`, bold: true, kind: "paragraph" }); previousStrip = strip; }
    const entry = [...entries].reverse().find((item) => item.crewId === flight.crewId);
    groupLines.push({ text: `Із стартової позиції «${flight.positionName || "позиція не вказана"}» (${position?.mgrs || "не вказано"}) в районі ${position?.locality || "не вказано"} екіпажем ${settings.unit.shortName || "не вказано"} «${flight.crewName}» (БпЛА ${flight.uavName || "не вказано"}${flight.uavSerialNumber ? `, серійний № ${flight.uavSerialNumber}` : ""}) виконується бойове чергування з повітряної розвідки в районі ${crew?.reconnaissanceArea || position?.locality || "не вказано"} у складі:`, kind: "paragraph" });
    const members = (entry?.actualMemberIds ?? []).map((id) => crew?.members.find((member) => member.personnelId === id)).filter((member): member is NonNullable<typeof member> => Boolean(member));
    members.forEach((member) => groupLines.push({ text: `-${member.rank} ${personName(member.fullName)} – з 18:01 год ${displayDate(shiftDate(reportDate, -1))} по 18:00 год ${displayDate(reportDate)};`, kind: "item" }));
    if (!members.length) groupLines.push({ text: "-склад не вказаний;", kind: "item" });
    const times = rows.map((item) => `${displayDate(item.flightDate)} о ${item.skyTime} год`).join(", ");
    const noun = rows.length === 1 ? "розвідувальний виліт" : `розвідувальні вильоти у кількості ${rows.length}`;
    groupLines.push({ text: `В період з 18:01 год ${displayDate(shiftDate(reportDate, -1))} по 18:00 год ${displayDate(reportDate)} здійснено ${noun}: ${times}. Більш детально в ІС «DELTA» за відповідними шарами.`, kind: "paragraph" });
    flightLines.push(...groupLines);
    automaticFlightItems.push({ id: `auto-flight-${flight.id}`, text: groupLines.map((line) => line.text).join("\n") });
  });
  if (!flightLines.length) flightLines.push({ text: "Польоти за звітний період відсутні.", kind: "paragraph" });
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
  const selectedAutoEvents = rotationEvents.filter((item) => manual.includedAutoEventIds.includes(item.id)).map((item) => manual.autoEventEdits[item.id] || item.text);
  const periodEvents = [...selectedAutoEvents, ...manual.manualEvents.map((item) => item.text.trim())].filter(Boolean).join("\n") || "Подій не зафіксовано.";
  const signer = settings.mainSigner;
  const name = signer.fullName.trim().split(/\s+/u);
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
    flight_operations: manual.flightItems === null ? flightLines : manual.flightItems.flatMap((item) => textLines(item.text)),
    command_duties: commandLines.length ? commandLines : [{ text: "Чергових не зазначено.", kind: "paragraph" }],
    guard_duties: guardLines.length ? guardLines : [{ text: "Склад охорони не зазначено.", kind: "paragraph" }],
    period_events: periodEventLines.length ? periodEventLines : [{ text: "Подій не зафіксовано.", kind: "paragraph" }],
    next_tasks: manual.nextTasks.length ? manual.nextTasks.flatMap((item) => textLines(item.text)) : [{ text: "Завдання не зазначено.", kind: "paragraph" }],
  };
  return { document: { values, shellingRows: manual.shellings.map(({ id: _id, ...row }) => row), blocks }, warnings, automatic, objects: { compositionItems: automaticCompositionItems, positionItems: automaticPositionItems, flightItems: automaticFlightItems, rotationEvents } };
}
