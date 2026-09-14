import type { AppSettings } from "../../shared/types/domain";
import type { Crew, FlightJournalEntry, FlightPlanRequest, Position } from "./types";

export type SummaryTextItem = { id: string; text: string };
export type SummaryShelling = { id: string; time: string; shellingType: string; target: string; direction: string; response: string };
export type SummaryManual = {
  reportNumber: string;
  enemyLosses: Record<string, string>;
  compositionOverride: boolean;
  compositionChanges: string;
  completeness: Record<string, string>;
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
  commandDuties: SummaryTextItem[];
  guardDuties: SummaryTextItem[];
  manualEvents: SummaryTextItem[];
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

export type SummaryDocument = { values: Record<string, string>; shellingRows: Omit<SummaryShelling, "id">[] };

const emptyItem = (): SummaryTextItem => ({ id: crypto.randomUUID(), text: "" });
export const defaultSummaryManual = (): SummaryManual => ({
  reportNumber: "", enemyLosses: { personnel: "0", tanks: "0", afv: "0", artillery: "0", mlrs: "0", airDefence: "0", aircraft: "0", helicopters: "0", uav: "0", vehicles: "0", ships: "0", missiles: "0" },
  compositionOverride: false, compositionChanges: "Без змін", completeness: { personnel: "", weapons: "", equipment: "" },
  rocketStrikes: "0", airStrikes: "0", va: "0", sha: "0", aa: "0", enemyAssault: false, enemyAssaultText: "Не проводив.", shellings: [], ownAssault: false, ownAssaultText: "Не проводили.",
  commandDuties: [], guardDuties: [], manualEvents: [], autoEventEdits: {}, autoOverrides: {}, autoBaselines: {}, commissionsOverride: false, commissions: "Без змін", fortificationOverride: false, fortification: "Без змін", dzvinOverride: false, dzvin: "Без змін", nextTasks: [emptyItem()],
  personnelLosses: { killed: "0", wounded: "0", missing: "0", captured: "0", sick: "0" }, equipmentLosses: { destroyed: "0", damaged: "0", lost: "0" }, equipmentLossesDetails: "", ammunitionExpenses: "", problems: "", otherIssues: [],
});

export const carryForwardSummary = (previous?: SummaryManual | null): SummaryManual => {
  const fresh = defaultSummaryManual();
  if (!previous) return fresh;
  return { ...fresh, reportNumber: previous.reportNumber, commandDuties: previous.commandDuties.map((item) => ({ ...item, id: crypto.randomUUID() })), guardDuties: previous.guardDuties.map((item) => ({ ...item, id: crypto.randomUUID() })), nextTasks: previous.nextTasks.map((item) => ({ ...item, id: crypto.randomUUID() })), problems: previous.problems, otherIssues: previous.otherIssues.map((item) => ({ ...item, id: crypto.randomUUID() })) };
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

export function buildSummaryDocument(input: { reportDate: string; manual: SummaryManual; settings: AppSettings; crews: Crew[]; positions: Position[]; journal: FlightJournalEntry[]; snapshots: Array<FlightPlanRequest | null> }): { document: SummaryDocument; warnings: string[]; automatic: Record<string, string> } {
  const { reportDate, manual, settings, crews, positions } = input;
  const period = reportPeriod(reportDate);
  const flights = input.journal.filter((flight) => flight.skyTime && `${flight.flightDate}T${flight.skyTime}` >= period.start && `${flight.flightDate}T${flight.skyTime}` <= period.end);
  const entries = planEntries(input.snapshots);
  const crewIds = [...new Set(entries.map((entry) => entry.crewId))];
  const plannedCrews = crewIds.map((id) => crews.find((crew) => crew.id === id)).filter((crew): crew is Crew => Boolean(crew));
  const grouped = new Map<string, Crew[]>();
  plannedCrews.forEach((crew) => { const strip = crew.sector.trim() || "Смуга роботи не вказана"; grouped.set(strip, [...(grouped.get(strip) ?? []), crew]); });
  const forceComposition = [...grouped.entries()].map(([strip, group]) => `${strip}: ${group.map((crew) => crew.name).join(", ")}.`).join("\n") || "Екіпажі у плані польотів відсутні.";
  const positionText = plannedCrews.map((crew) => { const position = positions.find((item) => item.id === crew.positionId); return `${crew.name} — ${position?.name || crew.positionName || "позиція не вказана"}, БрО ${position?.battleOrder || crew.battleOrder || "—"}, ${position?.locality || "населений пункт не вказано"}, MGRS ${position?.mgrs || "—"}, БпЛА ${crew.uavName || "—"}.`; }).join("\n") || "Позиції не визначені.";
  const flightOperations = [...new Map(flights.map((flight) => [flight.workStrip || "Смуга не вказана", true])).keys()].map((strip) => {
    const rows = flights.filter((flight) => (flight.workStrip || "Смуга не вказана") === strip);
    return `${strip}:\n${rows.map((flight) => `${flight.positionName || "позиція не вказана"}; екіпаж ${flight.crewName}; ${flight.uavName || "БпЛА"}${flight.uavSerialNumber ? ` № ${flight.uavSerialNumber}` : ""}; «Небо» ${displayDate(flight.flightDate)} ${flight.skyTime}; мета: ${flight.mission || "не вказана"}.`).join("\n")}`;
  }).join("\n\n") || "Польоти за звітний період відсутні.";
  const reconnaissance = flights.filter((flight) => /розвід/iu.test(flight.mission)).length;
  const autoEvents = entries.length > crewIds.length ? ["Проведено внутрішню ротацію складу екіпажу відповідно до плану польотів."] : [];
  const periodEvents = [...autoEvents.map((text, index) => manual.autoEventEdits[`auto-${index}`] || text), ...manual.manualEvents.map((item) => item.text)].filter(Boolean).join("\n") || "Подій не зафіксовано.";
  const signer = settings.mainSigner;
  const name = signer.fullName.trim().split(/\s+/u);
  const automatic = { forceComposition, positions: positionText, flightOperations, periodEvents };
  const auto = (key: keyof typeof automatic) => manual.autoOverrides[key]?.trim() || automatic[key];
  const warnings = [!settings.unit.shortName && "Не вказана коротка назва підрозділу.", !settings.unit.reportRecipient && "Не вказаний адресат донесення.", !settings.unit.kspName && "Не вказана назва КСП.", !settings.unit.kspLocality && "Не вказаний населений пункт КСП.", !manual.reportNumber && "Не вказаний номер донесення.", !signer.fullName && "Не вказаний основний підписант.", input.journal.some((flight) => flight.flightDate >= shiftDate(reportDate, -1) && flight.flightDate <= reportDate && !flight.skyTime) && "У журналі є політ без часу «Небо»."].filter((item): item is string => Boolean(item));
  const enemy = manual.enemyLosses;
  const values: Record<string, string> = {
    recipient: settings.unit.reportRecipient || "—", report_number: manual.reportNumber || "—", unit_short_name: settings.unit.shortName || "—", military_unit_short_name: settings.unit.militaryUnitShortName || settings.unit.unitCode || "—", ksp_name: settings.unit.kspName || "—", ksp_locality: settings.unit.kspLocality || "—", report_date: displayDate(reportDate),
    enemy_losses: `особового складу — ${value(enemy, "personnel")}; танків — ${value(enemy, "tanks")}; ББМ — ${value(enemy, "afv")}; артилерійських систем — ${value(enemy, "artillery")}; РСЗВ — ${value(enemy, "mlrs")}; засобів ППО — ${value(enemy, "airDefence")}; літаків — ${value(enemy, "aircraft")}; гелікоптерів — ${value(enemy, "helicopters")}; БпЛА — ${value(enemy, "uav")}; автомобільної техніки — ${value(enemy, "vehicles")}; кораблів — ${value(enemy, "ships")}; крилатих ракет — ${value(enemy, "missiles")}.`,
    composition_changes: manual.compositionOverride ? manual.compositionChanges : "Без змін", force_composition: auto("forceComposition"), completeness: `особовий склад — ${manual.completeness.personnel || "—"}; озброєння — ${manual.completeness.weapons || "—"}; техніка — ${manual.completeness.equipment || "—"}.`, positions: auto("positions"),
    enemy_actions: `Ракетних ударів — ${manual.rocketStrikes || "0"}; авіаційних ударів — ${manual.airStrikes || "0"}; ВА — ${manual.va || "0"}; ША — ${manual.sha || "0"}; АА — ${manual.aa || "0"}. Штурмові дії: ${manual.enemyAssault ? manual.enemyAssaultText : "не проводив"}.`, assault_actions: manual.ownAssault ? manual.ownAssaultText : "Не проводили.", battalion_short_name: settings.unit.battalionShortName || "—", period_start_date: displayDate(shiftDate(reportDate, -1)), period_end_date: displayDate(reportDate), flight_count: `${flights.length} (розвідувальних — ${reconnaissance})`, flight_operations: flightOperations,
    ksp_mgrs: settings.unit.kspMgrs || "—", command_duties: joinItems(manual.commandDuties), guard_duties: joinItems(manual.guardDuties), period_events: auto("periodEvents"), commissions: manual.commissionsOverride ? manual.commissions : "Без змін", fortification: manual.fortificationOverride ? manual.fortification : "Без змін", dzvin: manual.dzvinOverride ? manual.dzvin : "Без змін", next_tasks: joinItems(manual.nextTasks),
    personnel_losses: `загинуло — ${value(manual.personnelLosses, "killed")}; поранено — ${value(manual.personnelLosses, "wounded")}; зникло безвісти — ${value(manual.personnelLosses, "missing")}; полон — ${value(manual.personnelLosses, "captured")}; захворіло — ${value(manual.personnelLosses, "sick")}.`, equipment_losses: `знищено — ${value(manual.equipmentLosses, "destroyed")}; пошкоджено — ${value(manual.equipmentLosses, "damaged")}; втрачено — ${value(manual.equipmentLosses, "lost")}.`, equipment_losses_details: manual.equipmentLossesDetails || "—", ammunition_expenses: manual.ammunitionExpenses || "—", problems: manual.problems || "—", other_issues: joinItems(manual.otherIssues, "—"), signer_position: signer.position || "—", signer_rank: signer.rank || "—", signer_given_name: name.slice(1).join(" ") || "—", signer_surname: name[0] || "—", arm_number: settings.unit.armNumber || settings.unit.armyCorpsNumber || "—",
  };
  values.flight_operations = auto("flightOperations");
  return { document: { values, shellingRows: manual.shellings.map(({ id: _id, ...row }) => row) }, warnings, automatic };
}
