import type { AppSettings } from "../../shared/types/domain";
import type { Crew, FlightJournalEntry, FlightPlanRequest, Position, StaffingRecord } from "./types";

export type SummaryTextItem = { id: string; text: string };
export type SummaryDutyItem = SummaryTextItem & { personnelId: number | null };
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
  commandDuties: SummaryDutyItem[];
  guardDuties: SummaryDutyItem[];
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
  reportNumber: "", enemyLosses: { personnel: "0", irreversible: "0", sanitary: "0", captured: "0", ovt: "0", ovtDestroyed: "0", ovtDamaged: "0", tanks: "0", tanksDestroyed: "0", tanksDamaged: "0", afv: "0", afvDestroyed: "0", afvDamaged: "0", artillery: "0", artilleryDestroyed: "0", artilleryDamaged: "0", mlrs: "0", mlrsDestroyed: "0", mlrsDamaged: "0", reb: "0", rebDestroyed: "0", rebDamaged: "0", vehicles: "0", vehiclesDestroyed: "0", vehiclesDamaged: "0", aircraft: "0", aircraftDestroyed: "0", aircraftDamaged: "0", uav: "0", uavDestroyed: "0", uavDamaged: "0", uavReb: "0", specialEquipment: "0", specialEquipmentDestroyed: "0", specialEquipmentDamaged: "0", reconEquipment: "0", reconEquipmentDestroyed: "0", reconEquipmentDamaged: "0", uavControl: "0", uavControlDestroyed: "0", uavControlDamaged: "0", communications: "0", communicationsDestroyed: "0", communicationsDamaged: "0", commandPosts: "0", shelters: "0", commandPostsDestroyed: "0", commandPostsDamaged: "0", ammoDepots: "0", fuelDepots: "0", depotsDestroyed: "0", depotsDamaged: "0", airDefence: "0" },
  compositionOverride: false, compositionChanges: "Без змін", completeness: { personnel: "", weapons: "", equipment: "" },
  rocketStrikes: "0", airStrikes: "0", va: "0", sha: "0", aa: "0", enemyAssault: false, enemyAssaultText: "Не проводив.", shellings: [], ownAssault: false, ownAssaultText: "Не проводили.",
  commandDuties: [], guardDuties: [], manualEvents: [], autoEventEdits: {}, autoOverrides: {}, autoBaselines: {}, commissionsOverride: false, commissions: "В поточному періоді не працювали.", fortificationOverride: false, fortification: "Заходи з фортифікаційного обладнання не велись.", dzvinOverride: false, dzvin: "Зміни не відбувалися.", nextTasks: [emptyItem()],
  personnelLosses: { total: "0", irreversible: "0", combatIrreversible: "0", killed: "0", diedFromWounds: "0", other: "0", temporary: "0", combatTemporary: "0", wounded: "0", captured: "0", missing: "0", deserters: "0", szch: "0", sick: "0" }, equipmentLosses: { total: "0", destroyed: "0", damaged: "0", lost: "0", tanks: "0", tanksDestroyed: "0", tanksDamaged: "0", afv: "0", afvDestroyed: "0", afvDamaged: "0", artillery: "0", artilleryDestroyed: "0", artilleryDamaged: "0", airDefence: "0", airDefenceDestroyed: "0", airDefenceDamaged: "0", vehicles: "0", vehiclesDestroyed: "0", vehiclesDamaged: "0", reb: "0", rebDestroyed: "0", communications: "0", communicationsDestroyed: "0", uav: "0", uavLost: "0", uavDamaged: "0" }, equipmentLossesDetails: "", ammunitionExpenses: "", problems: "", otherIssues: [],
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
const personName = (fullName: string) => { const [surname = "", given = "", ...patronymic] = fullName.trim().split(/\s+/u); return `${surname.toLocaleUpperCase("uk")} ${given} ${patronymic.join(" ")}`.trim(); };
const dutyText = (items: SummaryDutyItem[], staffing: StaffingRecord[], positionPersonnel: Set<number>, fallback: string) => items.filter((item) => !item.personnelId || !positionPersonnel.has(item.personnelId)).map((item) => {
  const person = staffing.find((record) => record.personnelId === item.personnelId);
  const identity = person ? `${person.rank} ${personName(person.fullName)}` : "";
  return [identity, item.text.trim()].filter(Boolean).join(" — ");
}).filter(Boolean).join("\n") || fallback;

export function buildSummaryDocument(input: { reportDate: string; manual: SummaryManual; settings: AppSettings; crews: Crew[]; positions: Position[]; journal: FlightJournalEntry[]; snapshots: Array<FlightPlanRequest | null>; staffing?: StaffingRecord[] }): { document: SummaryDocument; warnings: string[]; automatic: Record<string, string> } {
  const { reportDate, manual, settings, crews, positions } = input;
  const period = reportPeriod(reportDate);
  const flights = input.journal.filter((flight) => flight.skyTime && `${flight.flightDate}T${flight.skyTime}` >= period.start && `${flight.flightDate}T${flight.skyTime}` <= period.end);
  const entries = planEntries(input.snapshots);
  const positionPersonnel = new Set(entries.flatMap((entry) => entry.actualMemberIds ?? []));
  const crewIds = [...new Set(entries.map((entry) => entry.crewId))];
  const plannedCrews = crewIds.map((id) => crews.find((crew) => crew.id === id)).filter((crew): crew is Crew => Boolean(crew));
  const grouped = new Map<string, Crew[]>();
  plannedCrews.forEach((crew) => { const strip = crew.sector.trim() || "Смуга роботи не вказана"; grouped.set(strip, [...(grouped.get(strip) ?? []), crew]); });
  const forceComposition = [...grouped.entries()].map(([strip, group]) => `${strip}: ${group.map((crew) => crew.name).join(", ")}.`).join("\n") || "Екіпажі у плані польотів відсутні.";
  const positionText = plannedCrews.map((crew) => { const position = positions.find((item) => item.id === crew.positionId); return `${crew.name} — ${position?.name || crew.positionName || "позиція не вказана"}, БрО ${position?.battleOrder || crew.battleOrder || "—"}, ${position?.locality || "населений пункт не вказано"}, MGRS ${position?.mgrs || "—"}, БпЛА ${crew.uavName || "—"}.`; }).join("\n") || "Позиції не визначені.";
  const flightOperations = [...new Map(flights.map((flight) => [flight.workStrip || "Смуга не вказана", true])).keys()].map((strip) => {
    const rows = flights.filter((flight) => (flight.workStrip || "Смуга не вказана") === strip);
    return `У межах смуги оборони ${strip}:\n${rows.map((flight) => {
      const crew = crews.find((item) => item.id === flight.crewId);
      const position = positions.find((item) => item.id === flight.positionId);
      const entry = [...entries].reverse().find((item) => item.crewId === flight.crewId);
      const members = (entry?.actualMemberIds ?? []).map((id) => crew?.members.find((member) => member.personnelId === id)).filter(Boolean).map((member) => `-${member!.rank} ${personName(member!.fullName)} — з 18:01 год ${displayDate(shiftDate(reportDate, -1))} по 18:00 год ${displayDate(reportDate)};`).join("\n");
      return `Із стартової позиції «${flight.positionName || "позиція не вказана"}» (${position?.mgrs || "—"}) в районі ${position?.locality || "—"} екіпажем ${settings.unit.shortName || "—"} «${flight.crewName}» (БпЛА ${flight.uavName || "—"}${flight.uavSerialNumber ? `, серійний № ${flight.uavSerialNumber}` : ""}) виконується бойове чергування з повітряної розвідки в районі ${crew?.reconnaissanceArea || "—"} у складі:\n${members || "-склад не вказаний;"}\nВ період з 18:01 год ${displayDate(shiftDate(reportDate, -1))} по 18:00 год ${displayDate(reportDate)} здійснено розвідувальний виліт ${displayDate(flight.flightDate)} о ${flight.skyTime} год. Більш детально в ІС «DELTA» за відповідними шарами.`;
    }).join("\n\n")}`;
  }).join("\n\n") || "Польоти за звітний період відсутні.";
  const reconnaissance = flights.filter((flight) => /розвід/iu.test(flight.mission)).length;
  const autoEvents = entries.length > crewIds.length ? ["Проведено внутрішню ротацію складу екіпажу відповідно до плану польотів."] : [];
  const periodEvents = [...autoEvents.map((text, index) => manual.autoEventEdits[`auto-${index}`] || text), ...manual.manualEvents.map((item) => item.text)].filter(Boolean).join("\n") || "Подій не зафіксовано.";
  const signer = settings.mainSigner;
  const name = signer.fullName.trim().split(/\s+/u);
  const staffing = input.staffing ?? [];
  const kspConflict = [...manual.commandDuties, ...manual.guardDuties].some((item) => item.personnelId && positionPersonnel.has(item.personnelId));
  const automatic = { forceComposition, positions: positionText, flightOperations, periodEvents };
  const auto = (key: keyof typeof automatic) => manual.autoOverrides[key]?.trim() || automatic[key];
  const warnings = [!settings.unit.shortName && "Не вказана коротка назва підрозділу.", !settings.unit.reportRecipient && "Не вказаний адресат донесення.", !settings.unit.kspName && "Не вказана назва КСП.", !settings.unit.kspLocality && "Не вказаний населений пункт КСП.", !manual.reportNumber && "Не вказаний номер донесення.", !signer.fullName && "Не вказаний основний підписант.", input.journal.some((flight) => flight.flightDate >= shiftDate(reportDate, -1) && flight.flightDate <= reportDate && !flight.skyTime) && "У журналі є політ без часу «Небо».", kspConflict && "Людина з чергування КСП одночасно зазначена на позиції. Приберіть її з КСП або плану польотів."].filter((item): item is string => Boolean(item));
  const enemy = manual.enemyLosses;
  const values: Record<string, string> = {
    recipient: settings.unit.reportRecipient || "—", report_number: manual.reportNumber || "—", unit_short_name: settings.unit.shortName || "—", military_unit_short_name: settings.unit.militaryUnitShortName || settings.unit.unitCode || "—", ksp_name: settings.unit.kspName || "—", ksp_locality: settings.unit.kspLocality || "—", report_date: displayDate(reportDate),
    enemy_losses: `особового складу – ${value(enemy, "personnel")}, з них:\nбезповоротні – ${value(enemy, "irreversible")};\nсанітарні – ${value(enemy, "sanitary")};\nполон – ${value(enemy, "captured")}.\nОВТ – ${value(enemy, "ovt")} од., з них: знищено – ${value(enemy, "ovtDestroyed")} од.; пошкоджено – ${value(enemy, "ovtDamaged")} од.;\nтанків – ${value(enemy, "tanks")} од., з них: знищено – ${value(enemy, "tanksDestroyed")} од.; пошкоджено – ${value(enemy, "tanksDamaged")} од.;\nББМ – ${value(enemy, "afv")} од., з них: знищено – ${value(enemy, "afvDestroyed")} од.; пошкоджено – ${value(enemy, "afvDamaged")} од.;\nГіМ – ${value(enemy, "artillery")} од., з них: знищено – ${value(enemy, "artilleryDestroyed")} од.; пошкоджено – ${value(enemy, "artilleryDamaged")} од.;\nРСЗВ – ${value(enemy, "mlrs")} од., з них: знищено – ${value(enemy, "mlrsDestroyed")} од.; пошкоджено – ${value(enemy, "mlrsDamaged")} од.;\nРЕБ – ${value(enemy, "reb")} од., з них: знищено – ${value(enemy, "rebDestroyed")} од.; пошкоджено – ${value(enemy, "rebDamaged")} од.;\nАТТ – ${value(enemy, "vehicles")} од., з них: знищено – ${value(enemy, "vehiclesDestroyed")} од.; пошкоджено – ${value(enemy, "vehiclesDamaged")} од.;\nЛітаки/гелікоптери – ${value(enemy, "aircraft")} од., з них: знищено – ${value(enemy, "aircraftDestroyed")} од.; пошкоджено – ${value(enemy, "aircraftDamaged")} од.;\nБпЛА – ${value(enemy, "uav")} од., з них: знищено – ${value(enemy, "uavDestroyed")} од.; пошкоджено – ${value(enemy, "uavDamaged")} од.;\nзасоби ППО – ${value(enemy, "airDefence")} од.;\nзасоби зв’язку – ${value(enemy, "communications")} од.`,
    composition_changes: manual.compositionOverride ? manual.compositionChanges : "Без змін", force_composition: auto("forceComposition"), completeness: `особовий склад — ${manual.completeness.personnel || "—"}; озброєння — ${manual.completeness.weapons || "—"}; техніка — ${manual.completeness.equipment || "—"}.`, positions: auto("positions"),
    enemy_actions: `Ракетних ударів — ${manual.rocketStrikes || "0"}; авіаційних ударів — ${manual.airStrikes || "0"}; ВА — ${manual.va || "0"}; ША — ${manual.sha || "0"}; АА — ${manual.aa || "0"}. Штурмові дії: ${manual.enemyAssault ? manual.enemyAssaultText : "не проводив"}.`, assault_actions: manual.ownAssault ? manual.ownAssaultText : "Не проводили.", battalion_short_name: settings.unit.battalionShortName || "—", period_start_date: displayDate(shiftDate(reportDate, -1)), period_end_date: displayDate(reportDate), flight_count: `${flights.length} (розвідувальних — ${reconnaissance})`, flight_operations: flightOperations,
    ksp_mgrs: settings.unit.kspMgrs || "—", command_duties: dutyText(manual.commandDuties, staffing, positionPersonnel, "Чергових не зазначено."), guard_duties: dutyText(manual.guardDuties, staffing, positionPersonnel, "Склад охорони не зазначено."), period_events: auto("periodEvents"), commissions: manual.commissionsOverride ? manual.commissions : "В поточному періоді не працювали.", fortification: manual.fortificationOverride ? manual.fortification : "Заходи з фортифікаційного обладнання не велись.", dzvin: manual.dzvinOverride ? manual.dzvin : "Зміни не відбувалися.", next_tasks: joinItems(manual.nextTasks),
    personnel_losses: `Загальні втрати особового складу за період з 18:01 год ${displayDate(shiftDate(reportDate, -1))} по 18:00 год ${displayDate(reportDate)} склали ${value(manual.personnelLosses, "total")} осіб, з них:\nБезповоротні – ${value(manual.personnelLosses, "irreversible")}, у тому числі:\nБойові – ${value(manual.personnelLosses, "combatIrreversible")}, з них:\nзагинули – ${value(manual.personnelLosses, "killed")};\nпомерли від ран – ${value(manual.personnelLosses, "diedFromWounds")};\nІнші – ${value(manual.personnelLosses, "other")};\nТимчасові – ${value(manual.personnelLosses, "temporary")}, у тому числі:\nБойові – ${value(manual.personnelLosses, "combatTemporary")}, з них:\nсанітарні бойові – ${value(manual.personnelLosses, "wounded")};\nполон – ${value(manual.personnelLosses, "captured")};\nзникли безвісті – ${value(manual.personnelLosses, "missing")};\nдезертири – ${value(manual.personnelLosses, "deserters")};\nСЗЧ – ${value(manual.personnelLosses, "szch")};`, equipment_losses: `Всього: – ${value(manual.equipmentLosses, "total")} од., з них: знищено – ${value(manual.equipmentLosses, "destroyed")} од., втрачено – ${value(manual.equipmentLosses, "lost")} од., пошкоджено – ${value(manual.equipmentLosses, "damaged")} од.;\nтанків – ${value(manual.equipmentLosses, "tanks")} од.;\nББМ – ${value(manual.equipmentLosses, "afv")} од.;\nГіМ – ${value(manual.equipmentLosses, "artillery")} од.;\nзасоби ППО – ${value(manual.equipmentLosses, "airDefence")} од.;\nАТ – ${value(manual.equipmentLosses, "vehicles")} од.;\nзасоби РЕБ – ${value(manual.equipmentLosses, "reb")} од.; засоби зв’язку – ${value(manual.equipmentLosses, "communications")} од.;\nБпЛА – ${value(manual.equipmentLosses, "uav")} од.`, equipment_losses_details: manual.equipmentLossesDetails || "Відсутні.", ammunition_expenses: manual.ammunitionExpenses || "-не застосовувалися.", problems: manual.problems || "—", other_issues: joinItems(manual.otherIssues, "-відсутні."), signer_position: signer.position || "—", signer_rank: signer.rank || "—", signer_given_name: name[1] || "—", signer_surname: name[0]?.toLocaleUpperCase("uk") || "—", arm_number: settings.unit.armNumber || settings.unit.armyCorpsNumber || "—",
  };
  const numericValues: Record<string, [Record<string, string>, string]> = {
    enemy_personnel: [enemy, "personnel"], enemy_irreversible: [enemy, "irreversible"], enemy_sanitary: [enemy, "sanitary"], enemy_captured: [enemy, "captured"], enemy_ovt: [enemy, "ovt"], enemy_ovt_destroyed: [enemy, "ovtDestroyed"], enemy_ovt_damaged: [enemy, "ovtDamaged"], enemy_tanks: [enemy, "tanks"], enemy_tanks_destroyed: [enemy, "tanksDestroyed"], enemy_tanks_damaged: [enemy, "tanksDamaged"], enemy_afv: [enemy, "afv"], enemy_afv_destroyed: [enemy, "afvDestroyed"], enemy_afv_damaged: [enemy, "afvDamaged"], enemy_artillery: [enemy, "artillery"], enemy_artillery_destroyed: [enemy, "artilleryDestroyed"], enemy_artillery_damaged: [enemy, "artilleryDamaged"], enemy_mlrs: [enemy, "mlrs"], enemy_mlrs_destroyed: [enemy, "mlrsDestroyed"], enemy_mlrs_damaged: [enemy, "mlrsDamaged"], enemy_reb: [enemy, "reb"], enemy_reb_destroyed: [enemy, "rebDestroyed"], enemy_reb_damaged: [enemy, "rebDamaged"], enemy_vehicles: [enemy, "vehicles"], enemy_vehicles_destroyed: [enemy, "vehiclesDestroyed"], enemy_vehicles_damaged: [enemy, "vehiclesDamaged"], enemy_aircraft: [enemy, "aircraft"], enemy_aircraft_destroyed: [enemy, "aircraftDestroyed"], enemy_aircraft_damaged: [enemy, "aircraftDamaged"], enemy_uav: [enemy, "uav"], enemy_uav_destroyed: [enemy, "uavDestroyed"], enemy_uav_damaged: [enemy, "uavDamaged"], enemy_uav_reb: [enemy, "uavReb"], enemy_special_equipment: [enemy, "specialEquipment"], enemy_special_equipment_destroyed: [enemy, "specialEquipmentDestroyed"], enemy_special_equipment_damaged: [enemy, "specialEquipmentDamaged"], enemy_recon_equipment: [enemy, "reconEquipment"], enemy_recon_equipment_destroyed: [enemy, "reconEquipmentDestroyed"], enemy_recon_equipment_damaged: [enemy, "reconEquipmentDamaged"], enemy_uav_control: [enemy, "uavControl"], enemy_uav_control_destroyed: [enemy, "uavControlDestroyed"], enemy_uav_control_damaged: [enemy, "uavControlDamaged"], enemy_communications: [enemy, "communications"], enemy_communications_destroyed: [enemy, "communicationsDestroyed"], enemy_communications_damaged: [enemy, "communicationsDamaged"], enemy_command_posts: [enemy, "commandPosts"], enemy_shelters: [enemy, "shelters"], enemy_command_posts_destroyed: [enemy, "commandPostsDestroyed"], enemy_command_posts_damaged: [enemy, "commandPostsDamaged"], enemy_ammo_depots: [enemy, "ammoDepots"], enemy_fuel_depots: [enemy, "fuelDepots"], enemy_depots_destroyed: [enemy, "depotsDestroyed"], enemy_depots_damaged: [enemy, "depotsDamaged"],
    own_personnel_total: [manual.personnelLosses, "total"], own_personnel_irreversible: [manual.personnelLosses, "irreversible"], own_personnel_combat_irreversible: [manual.personnelLosses, "combatIrreversible"], own_personnel_killed: [manual.personnelLosses, "killed"], own_personnel_died_from_wounds: [manual.personnelLosses, "diedFromWounds"], own_personnel_other: [manual.personnelLosses, "other"], own_personnel_temporary: [manual.personnelLosses, "temporary"], own_personnel_combat_temporary: [manual.personnelLosses, "combatTemporary"], own_personnel_wounded: [manual.personnelLosses, "wounded"], own_personnel_captured: [manual.personnelLosses, "captured"], own_personnel_missing: [manual.personnelLosses, "missing"], own_personnel_deserters: [manual.personnelLosses, "deserters"], own_personnel_szch: [manual.personnelLosses, "szch"],
    own_equipment_total: [manual.equipmentLosses, "total"], own_equipment_destroyed: [manual.equipmentLosses, "destroyed"], own_equipment_lost: [manual.equipmentLosses, "lost"], own_equipment_damaged: [manual.equipmentLosses, "damaged"], own_tanks: [manual.equipmentLosses, "tanks"], own_tanks_destroyed: [manual.equipmentLosses, "tanksDestroyed"], own_tanks_damaged: [manual.equipmentLosses, "tanksDamaged"], own_afv: [manual.equipmentLosses, "afv"], own_afv_destroyed: [manual.equipmentLosses, "afvDestroyed"], own_afv_damaged: [manual.equipmentLosses, "afvDamaged"], own_artillery: [manual.equipmentLosses, "artillery"], own_artillery_destroyed: [manual.equipmentLosses, "artilleryDestroyed"], own_artillery_damaged: [manual.equipmentLosses, "artilleryDamaged"], own_air_defence: [manual.equipmentLosses, "airDefence"], own_air_defence_destroyed: [manual.equipmentLosses, "airDefenceDestroyed"], own_air_defence_damaged: [manual.equipmentLosses, "airDefenceDamaged"], own_vehicles: [manual.equipmentLosses, "vehicles"], own_vehicles_destroyed: [manual.equipmentLosses, "vehiclesDestroyed"], own_vehicles_damaged: [manual.equipmentLosses, "vehiclesDamaged"], own_reb: [manual.equipmentLosses, "reb"], own_reb_destroyed: [manual.equipmentLosses, "rebDestroyed"], own_communications: [manual.equipmentLosses, "communications"], own_communications_destroyed: [manual.equipmentLosses, "communicationsDestroyed"], own_uav: [manual.equipmentLosses, "uav"], own_uav_lost: [manual.equipmentLosses, "uavLost"], own_uav_damaged: [manual.equipmentLosses, "uavDamaged"],
  };
  Object.entries(numericValues).forEach(([key, [record, field]]) => { values[key] = value(record, field); });
  values.flight_operations = auto("flightOperations");
  return { document: { values, shellingRows: manual.shellings.map(({ id: _id, ...row }) => row) }, warnings, automatic };
}
