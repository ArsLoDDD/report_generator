import { renderAsync } from "docx-preview";
import { save } from "@tauri-apps/plugin-dialog";
import { Clock3, FileOutput, MapPin, Pencil, Plane, Plus, RefreshCw, Settings2, Trash2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AppSettings, UnitSettings } from "../../shared/types/domain";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { Select } from "../../shared/ui/Select";
import { settingsService } from "../settings/services/settingsService";
import { flightPlanDraftRequest } from "./flight-plan-storage";
import { operationsService } from "./services/operationsService";
import { summaryReportService } from "./services/summaryReportService";
import { buildAlternatingDutySchedule, buildSummaryDocument, canOpenNextReport, canReturnToPreviousReport, carryForwardSummary, defaultSummaryManual, displayDate, initialReportDate, shiftDate, type SummaryCompositionItem, type SummaryDutyItem, type SummaryDutyPeriod, type SummaryFlightItem, type SummaryManual, type SummaryPositionItem, type SummaryTextItem } from "./summary-report-model";
import type { Crew, Equipment, FlightJournalEntry, FlightPlanRequest, Position, PositionWork, PositionWorkStatusEvent, StaffingRecord } from "./types";

const parseDraft = (value: string | null): SummaryManual | null => {
  try {
    if (!value) return null;
    const defaults = defaultSummaryManual();
    const stored = JSON.parse(value) as Partial<SummaryManual> & { flightItems?: unknown };
    const duties = (items: unknown): SummaryDutyItem[] => Array.isArray(items) ? items.map((item) => {
      const duty = item as Partial<SummaryDutyItem> & Partial<SummaryDutyPeriod> & { text?: string };
      const matches = duty.text?.match(/(\d{2}:\d{2}).*?(\d{2}\.\d{2}\.\d{4}).*?(\d{2}:\d{2}).*?(\d{2}\.\d{2}\.\d{4})/u);
      const legacyPeriod = { id: crypto.randomUUID(), startTime: duty.startTime || matches?.[1] || "", startDate: duty.startDate || matches?.[2]?.split(".").reverse().join("-") || "", endTime: duty.endTime || matches?.[3] || "", endDate: duty.endDate || matches?.[4]?.split(".").reverse().join("-") || "" };
      const hasLegacyPeriod = Boolean(legacyPeriod.startDate || legacyPeriod.startTime || legacyPeriod.endDate || legacyPeriod.endTime);
      const periods = Array.isArray(duty.periods) ? duty.periods.map((period) => ({ id: period.id || crypto.randomUUID(), startDate: period.startDate || "", startTime: period.startTime || "", endDate: period.endDate || "", endTime: period.endTime || "" })) : hasLegacyPeriod ? [legacyPeriod] : [];
      return { id: duty.id || crypto.randomUUID(), personnelId: duty.personnelId ?? null, periods };
    }) : [];
    const structuredFlights = Array.isArray(stored.flightItems) && stored.flightItems.every((item) => item && typeof item === "object" && "crewId" in item) ? stored.flightItems as SummaryFlightItem[] : null;
    const compositionItems = Array.isArray(stored.compositionItems) && stored.compositionItems.length ? stored.compositionItems : null;
    const positionItems = Array.isArray(stored.positionItems) && stored.positionItems.length ? stored.positionItems : null;
    return { ...defaults, ...stored, compositionItems, positionItems, flightItems: structuredFlights, enemyLosses: { ...defaults.enemyLosses, ...stored.enemyLosses }, completeness: { ...defaults.completeness, ...stored.completeness }, personnelLosses: { ...defaults.personnelLosses, ...stored.personnelLosses }, equipmentLosses: { ...defaults.equipmentLosses, ...stored.equipmentLosses }, commandDuties: duties(stored.commandDuties), guardDuties: duties(stored.guardDuties) };
  } catch { return null; }
};
const blankSettings = (): AppSettings => ({ mainSigner: { fullName: "", rank: "", position: "" }, commander: { fullName: "", rank: "", position: "" }, chief: { fullName: "", rank: "", position: "" }, deputyPpp: { fullName: "", rank: "", position: "" }, deputyArmament: { fullName: "", rank: "", position: "" }, deputyRear: { fullName: "", rank: "", position: "" }, fuelChief: { fullName: "", rank: "", position: "" }, signerRoles: [], unit: { kind: "Інше", shortName: "", authorizedStrength: 0 } });
const parseSnapshot = (value: string | null): FlightPlanRequest | null => { try { return value ? JSON.parse(value) as FlightPlanRequest : null; } catch { return null; } };
const enemyLossLabels: Array<[string, string]> = [["personnel", "Особовий склад – всього"], ["irreversible", "Безповоротні"], ["sanitary", "Санітарні"], ["captured", "Полон"], ["ovt", "ОВТ – всього"], ["ovtDestroyed", "ОВТ знищено"], ["ovtDamaged", "ОВТ пошкоджено"], ["tanks", "Танки"], ["tanksDestroyed", "Танки знищено"], ["tanksDamaged", "Танки пошкоджено"], ["afv", "ББМ"], ["afvDestroyed", "ББМ знищено"], ["afvDamaged", "ББМ пошкоджено"], ["artillery", "ГіМ"], ["artilleryDestroyed", "ГіМ знищено"], ["artilleryDamaged", "ГіМ пошкоджено"], ["mlrs", "РСЗВ"], ["mlrsDestroyed", "РСЗВ знищено"], ["mlrsDamaged", "РСЗВ пошкоджено"], ["reb", "РЕБ"], ["rebDestroyed", "РЕБ знищено"], ["rebDamaged", "РЕБ пошкоджено"], ["vehicles", "АТТ"], ["vehiclesDestroyed", "АТТ знищено"], ["vehiclesDamaged", "АТТ пошкоджено"], ["aircraft", "Літаки / гелікоптери"], ["aircraftDestroyed", "Авіація знищена"], ["aircraftDamaged", "Авіація пошкоджена"], ["uav", "БпЛА"], ["uavDestroyed", "БпЛА знищено"], ["uavDamaged", "БпЛА пошкоджено"], ["airDefence", "Засоби ППО"], ["communications", "Засоби зв’язку"]];
const personnelLossLabels: Array<[string, string]> = [["total", "Загальні втрати"], ["irreversible", "Безповоротні"], ["combatIrreversible", "Бойові безповоротні"], ["killed", "Загинули"], ["diedFromWounds", "Померли від ран"], ["other", "Інші"], ["temporary", "Тимчасові"], ["combatTemporary", "Бойові тимчасові"], ["wounded", "Санітарні бойові"], ["captured", "Полон"], ["missing", "Зникли безвісти"], ["deserters", "Дезертири"], ["szch", "СЗЧ"]];
const equipmentLossLabels: Array<[string, string]> = [["total", "ОВТ – всього"], ["destroyed", "Знищено"], ["lost", "Втрачено"], ["damaged", "Пошкоджено"], ["tanks", "Танки"], ["afv", "ББМ"], ["artillery", "ГіМ"], ["airDefence", "Засоби ППО"], ["vehicles", "АТ"], ["reb", "Засоби РЕБ"], ["communications", "Засоби зв’язку"], ["uav", "БпЛА"]];
const enemyExtendedLossLabels: Array<[string, string]> = [...enemyLossLabels, ["uavLoitering", "Баражуючі боєприпаси"], ["uavMolniya", "Молнія"], ["uavLancet", "Ланцет"], ["uavReb", "БпЛА, посаджені РЕБ"], ["specialEquipment", "Спеціальна техніка"], ["specialEquipmentDestroyed", "Спецтехніка знищена"], ["specialEquipmentDamaged", "Спецтехніка пошкоджена"], ["reconEquipment", "Засоби розвідки"], ["reconEquipmentDestroyed", "Засоби розвідки знищено"], ["reconEquipmentDamaged", "Засоби розвідки пошкоджено"], ["uavControl", "ПУ БпЛА"], ["uavControlDestroyed", "ПУ БпЛА знищено"], ["uavControlDamaged", "ПУ БпЛА пошкоджено"], ["communicationsDestroyed", "Зв’язок знищено"], ["communicationsDamaged", "Зв’язок пошкоджено"], ["commandPosts", "Пункти управління"], ["shelters", "Укриття"], ["commandPostsDestroyed", "Пункти управління знищено"], ["commandPostsDamaged", "Пункти управління пошкоджено"], ["sheltersDamaged", "Пошкоджено укриттів"], ["ammoDepots", "Склади боєприпасів"], ["fuelDepots", "Склади ПММ"], ["depotsDestroyed", "Склади знищено"], ["depotsDamaged", "Склади пошкоджено"]];
const equipmentExtendedLossLabels: Array<[string, string]> = [...equipmentLossLabels, ["tanksDestroyed", "Танки знищено"], ["tanksDamaged", "Танки пошкоджено"], ["afvDestroyed", "ББМ знищено"], ["afvDamaged", "ББМ пошкоджено"], ["artilleryDestroyed", "ГіМ знищено"], ["artilleryDamaged", "ГіМ пошкоджено"], ["airDefenceDestroyed", "ППО знищено"], ["airDefenceDamaged", "ППО пошкоджено"], ["vehiclesDestroyed", "АТ знищено"], ["vehiclesDamaged", "АТ пошкоджено"], ["rebDestroyed", "РЕБ знищено"], ["communicationsDestroyed", "Зв’язок знищено"], ["uavLost", "БпЛА втрачено"], ["uavDamaged", "БпЛА пошкоджено"]];
const openSectionsStorageKey = "summary-report:open-sections:v1";
type PdParametersDraft = { reportNumber: string; kspOutskirts: string; unit: UnitSettings };
type ReportNavigation = { direction: "next" | "previous"; targetDate: string };

function ItemEditor({ title, items, onChange }: { title: string; items: SummaryTextItem[]; onChange: (items: SummaryTextItem[]) => void }) {
  return <section className="summary-editor-block"><header><b>{title}</b><button className="icon-button" aria-label={`Додати: ${title}`} onClick={() => onChange([...items, { id: crypto.randomUUID(), text: "" }])}><Plus /></button></header>{items.length ? items.map((item) => <div className="summary-object" key={item.id}><textarea value={item.text} onChange={(event) => onChange(items.map((value) => value.id === item.id ? { ...value, text: event.target.value } : value))} /><button className="icon-button danger" aria-label="Видалити" onClick={() => onChange(items.filter((value) => value.id !== item.id))}><Trash2 /></button></div>) : <small>Об’єктів немає. Додайте за потреби.</small>}</section>;
}

function DutyEditor({ title, items, people, reportDate = initialReportDate(), onChange }: { title: string; items: SummaryDutyItem[]; people: StaffingRecord[]; reportDate?: string; onChange: (items: SummaryDutyItem[]) => void }) {
  const available = people.filter((person) => person.personnelId > 0);
  const [shiftHours, setShiftHours] = useState("4");
  const setPerson = (id: string, personnelId: number | null) => onChange(items.map((item) => item.id === id ? { ...item, personnelId } : item));
  const setPeriod = (itemId: string, periodId: string, patch: Partial<SummaryDutyPeriod>) => onChange(items.map((item) => item.id === itemId ? { ...item, periods: item.periods.map((period) => period.id === periodId ? { ...period, ...patch } : period) } : item));
  const addPeriod = (itemId: string) => onChange(items.map((item) => item.id === itemId ? { ...item, periods: [...item.periods, { id: crypto.randomUUID(), startDate: "", startTime: "", endDate: "", endTime: "" }] } : item));
  const removePeriod = (itemId: string, periodId: string) => onChange(items.map((item) => item.id === itemId ? { ...item, periods: item.periods.filter((period) => period.id !== periodId) } : item));
  const selectedIds = new Set(items.map((item) => item.personnelId).filter((id): id is number => Boolean(id)));
  return <section className="summary-editor-block summary-duty-editor"><header><div><b>{title}</b><small>Графік має безперервно покривати всю добу 18:01–18:00. Кожен період можна скоригувати або видалити окремо.</small></div><div className="summary-header-actions"><span className="source-badge">Вручну</span><Select ariaLabel="Тривалість однієї зміни" value={shiftHours} onChange={setShiftHours} options={[1, 2, 3, 4, 6, 8, 12].map((hours) => ({ value: String(hours), label: `${hours} год` }))} /><button className="button compact" disabled={!items.some((item) => item.personnelId)} onClick={() => onChange(buildAlternatingDutySchedule(items, reportDate, Number(shiftHours)))}><Clock3 />Розподілити добу</button><button className="icon-button" aria-label={`Додати: ${title}`} onClick={() => onChange([...items, { id: crypto.randomUUID(), personnelId: null, periods: [] }])}><Plus /></button></div></header>{items.length ? <div className="summary-duty-list">{items.map((item) => <article className="summary-duty-object" key={item.id}><header className="summary-duty-person"><label><span>Військовослужбовець</span><Select ariaLabel="Військовослужбовець" value={String(item.personnelId ?? "")} onChange={(value) => setPerson(item.id, value ? Number(value) : null)} options={[{ value: "", label: "Оберіть військовослужбовця" }, ...available.filter((person) => person.personnelId === item.personnelId || !selectedIds.has(person.personnelId)).map((person) => ({ value: String(person.personnelId), label: `${person.fullName} · ${person.rank}` }))]} /></label><div className="summary-card-actions"><button className="button compact" onClick={() => addPeriod(item.id)}><Plus />Додати період</button><button className="icon-button danger" aria-label="Видалити військовослужбовця" onClick={() => onChange(items.filter((value) => value.id !== item.id))}><Trash2 /></button></div></header><div className="summary-duty-period-list">{item.periods.map((period, index) => <section className="summary-duty-period" key={period.id}><header><span>Період {index + 1}</span><button className="icon-button danger" aria-label="Видалити період" onClick={() => removePeriod(item.id, period.id)}><Trash2 /></button></header><div className="summary-duty-range"><div className="summary-time-group"><b>Від</b><label><span>Дата</span><input aria-label="Дата першого часу" type="date" value={period.startDate} onChange={(event) => setPeriod(item.id, period.id, { startDate: event.target.value })} /></label><label><span>Час</span><input aria-label="Перший час" type="time" value={period.startTime} onChange={(event) => setPeriod(item.id, period.id, { startTime: event.target.value })} /></label></div><div className="summary-time-group"><b>До</b><label><span>Дата</span><input aria-label="Дата другого часу" type="date" value={period.endDate} onChange={(event) => setPeriod(item.id, period.id, { endDate: event.target.value })} /></label><label><span>Час</span><input aria-label="Другий час" type="time" value={period.endTime} onChange={(event) => setPeriod(item.id, period.id, { endTime: event.target.value })} /></label></div></div></section>)}{!item.periods.length && <small>Періодів ще немає. Розподіліть добу автоматично або додайте період.</small>}</div></article>)}</div> : <small>Чергових ще не додано.</small>}</section>;
}

function CompositionEditor({ automatic, value, onChange }: { automatic: SummaryCompositionItem[]; value: SummaryCompositionItem[] | null; onChange: (items: SummaryCompositionItem[] | null) => void }) {
  const overrides = value ?? [];
  const automaticItems = automatic.map((item) => ({ ...item, ...overrides.find((override) => override.id === item.id) }));
  const custom = overrides.filter((item) => !item.id.startsWith("auto-composition-"));
  const items = [...automaticItems, ...custom].filter((item) => !item.excluded);
  const edit = (item: SummaryCompositionItem, patch: Partial<SummaryCompositionItem>) => onChange([...overrides.filter((value) => value.id !== item.id), { ...item, ...patch }]);
  const remove = (item: SummaryCompositionItem) => onChange(item.id.startsWith("auto-composition-") ? [...overrides.filter((value) => value.id !== item.id), { ...item, excluded: true }] : overrides.filter((value) => value.id !== item.id));
  return <section className="summary-editor-block"><header><div><b>Склад та бойовий порядок</b><small>Кількість, тип, БрО і смуга автоматично перераховуються з актуального плану польотів.</small></div><div className="summary-header-actions"><span className="source-badge">План польотів</span>{overrides.length > 0 && <span className="source-badge is-edited">Змінено вручну</span>}<button className="icon-button" aria-label="Додати ручну групу" onClick={() => onChange([...overrides, { id: crypto.randomUUID(), count: "1", uavKind: "екіпажі розвідувальних БпЛА літакового типу", battleOrder: "", workStrip: "" }])}><Plus /></button></div></header><div className="summary-structured-list">{items.map((item, index) => <article className={`summary-structured-object summary-composition-object ${item.id.startsWith("auto-composition-") ? "is-automatic" : ""}`} key={item.id}><header><span>Група {index + 1}</span><button className="icon-button danger" aria-label="Видалити групу" onClick={() => remove(item)}><Trash2 /></button></header><div className="summary-composition-fields"><label className="summary-count-field"><span>Кількість</span><input inputMode="numeric" value={item.count} onChange={(event) => edit(item, { count: event.target.value.replace(/\D/gu, "") })} /></label><label><span>Тип екіпажів і БпЛА</span><input value={item.uavKind} onChange={(event) => edit(item, { uavKind: event.target.value })} /></label><label><span>БрО виконання</span><input value={item.battleOrder} onChange={(event) => edit(item, { battleOrder: event.target.value })} /></label><label><span>Смуга роботи / взаємодії</span><input value={item.workStrip} onChange={(event) => edit(item, { workStrip: event.target.value })} /></label></div></article>)}</div>{!automatic.length && !custom.length && <div className="summary-empty-card">У плані польотів ще немає екіпажів.</div>}</section>;
}

function PositionEditor({ automatic, value, onChange }: { automatic: SummaryPositionItem[]; value: SummaryPositionItem[] | null; onChange: (items: SummaryPositionItem[] | null) => void }) {
  const overrides = value ?? [];
  const automaticItems = automatic.map((item) => ({ ...item, ...overrides.find((override) => override.id === item.id) }));
  const custom = overrides.filter((item) => !item.id.startsWith("auto-position-"));
  const items = [...automaticItems, ...custom].filter((item) => !item.excluded);
  const edit = (item: SummaryPositionItem, patch: Partial<SummaryPositionItem>) => onChange([...overrides.filter((value) => value.id !== item.id), { ...item, ...patch }]);
  const remove = (item: SummaryPositionItem) => onChange(item.id.startsWith("auto-position-") ? [...overrides.filter((value) => value.id !== item.id), { ...item, excluded: true }] : overrides.filter((value) => value.id !== item.id));
  return <section className="summary-editor-block"><header><div><b>Положення підрозділів</b><small>Смуга, позиція, координати, район і БпАК автоматично беруться з плану польотів.</small></div><div className="summary-header-actions"><span className="source-badge">План польотів</span>{overrides.length > 0 && <span className="source-badge is-edited">Змінено вручну</span>}<button className="icon-button" aria-label="Додати ручну позицію" onClick={() => onChange([...overrides, { id: crypto.randomUUID(), workStrip: "", uavName: "", positionName: "", mgrs: "", locality: "" }])}><Plus /></button></div></header><div className="summary-structured-list">{items.map((item, index) => <article className={`summary-structured-object summary-position-object ${item.id.startsWith("auto-position-") ? "is-automatic" : ""}`} key={item.id}><header><div><span>Позиція {index + 1}</span><b>{item.positionName || "Без назви"}</b></div><button className="icon-button danger" aria-label="Видалити позицію" onClick={() => remove(item)}><Trash2 /></button></header><div className="summary-position-fields">{([['workStrip','Смуга роботи'],['uavName','Назва БпАК'],['positionName','Назва позиції'],['mgrs','Координати MGRS'],['locality','Район населеного пункту']] as const).map(([key,label]) => <label key={key}><span>{label}</span><input value={item[key]} onChange={(event) => edit(item, { [key]: event.target.value })} /></label>)}</div></article>)}</div>{!automatic.length && !custom.length && <div className="summary-empty-card">Позиції з плану польотів ще не визначені.</div>}</section>;
}

const cloneFlight = (item: SummaryFlightItem): SummaryFlightItem => ({ ...item, id: crypto.randomUUID(), uavs: item.uavs.map((uav) => ({ ...uav, id: crypto.randomUUID() })), members: item.members.map((member) => ({ ...member, id: crypto.randomUUID() })), flightTimes: item.flightTimes.map((flight) => ({ ...flight })) });

function FlightItemsEditor({ automatic, value, onChange }: { automatic: SummaryFlightItem[]; value: SummaryFlightItem[] | null; onChange: (items: SummaryFlightItem[] | null) => void }) {
  const overrides = value ?? [];
  const automaticItems = automatic.map((source) => {
    const override = overrides.find((item) => item.id === source.id);
    if (!override) return source;
    const members = source.members.map((member) => {
      const samePersonCount = source.members.filter((item) => item.personnelId === member.personnelId).length;
      const corrected = override.members.find((item) => item.id === member.id) ?? (samePersonCount === 1 ? override.members.find((item) => item.personnelId === member.personnelId) : undefined);
      return corrected ? { ...member, startDate: corrected.startDate, startTime: corrected.startTime, endDate: corrected.endDate, endTime: corrected.endTime } : member;
    });
    return { ...source, uavs: override.uavs, members, excluded: override.excluded };
  });
  const custom = overrides.filter((item) => !item.id.startsWith("auto-flight-"));
  const items = [...automaticItems, ...custom].filter((item) => !item.excluded);
  const [editing, setEditing] = useState<SummaryFlightItem | null>(null);
  const startAdd = () => automatic[0] && setEditing(cloneFlight(automatic[0]));
  const saveItem = () => {
    if (!editing) return;
    onChange(overrides.some((item) => item.id === editing.id) ? overrides.map((item) => item.id === editing.id ? editing : item) : [...overrides, editing]);
    setEditing(null);
  };
  const chooseCrew = (crewId: number) => {
    const source = automatic.find((item) => item.crewId === crewId);
    if (source) setEditing((current) => ({ ...cloneFlight(source), id: current?.id || crypto.randomUUID() }));
  };
  const editUav = (id: string, patch: { name?: string; serialNumber?: string }) => editing && setEditing({ ...editing, uavs: editing.uavs.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const addSerial = (uav: SummaryFlightItem["uavs"][number]) => editing && setEditing({ ...editing, uavs: [...editing.uavs, { ...uav, id: crypto.randomUUID(), serialNumber: "" }] });
  return <section className="summary-editor-block summary-flight-editor">
    <header><div><b>Польоти за смугами, позиціями та екіпажами</b><small>Кожен блок – один екіпаж на конкретній позиції із вкладеними БпЛА, складом і фактичними вильотами.</small></div><div className="summary-header-actions"><span className="source-badge">План польотів</span><span className="source-badge">Журнал польотів</span>{overrides.length > 0 && <span className="source-badge is-edited">Змінено вручну</span>}<button className="icon-button" disabled={!automatic.length} aria-label="Додати екіпаж" onClick={startAdd}><Plus /></button></div></header>
    {items.length ? <div className="summary-flight-list">{items.map((item) => { const automaticItem = item.id.startsWith("auto-flight-"); return <article className="summary-flight-card" key={item.id}><header><div><span className="summary-flight-kicker">{item.workStrip} · {item.positionName}</span><b>{item.crewName}</b></div><div className="summary-card-actions"><button className="icon-button" aria-label="Редагувати екіпаж" onClick={() => setEditing({ ...item, uavs: item.uavs.map((uav) => ({ ...uav })), members: item.members.map((member) => ({ ...member })) })}><Pencil /></button><button className="icon-button danger" aria-label="Видалити екіпаж" onClick={() => onChange(automaticItem ? [...overrides.filter((value) => value.id !== item.id), { ...item, excluded: true }] : overrides.filter((value) => value.id !== item.id))}><Trash2 /></button></div></header><div className="summary-flight-facts"><span><MapPin />{item.locality || "Район не вказано"}</span><span><Plane />{item.uavs.length} бортів</span><span><UsersRound />{item.members.length} ос.</span><span><Clock3 />{item.flightTimes.length} вильотів</span></div><small>{item.taskArea || "Район виконання завдання не вказано"}</small></article>; })}</div> : <div className="summary-empty-card">У плані польотів немає екіпажів за цей період.</div>}
    {editing && <Modal title={`Екіпаж: ${editing.crewName}`} subtitle="Позиція та смуга підтягуються зі знімка плану польотів і не змінюються тут." onClose={() => setEditing(null)} className="summary-flight-modal"><div className="summary-flight-modal__body">
      <label className="form-field"><span>Екіпаж з плану польотів</span><Select ariaLabel="Екіпаж з плану польотів" value={String(editing.crewId)} disabled={editing.id.startsWith("auto-flight-")} onChange={(value) => chooseCrew(Number(value))} options={automatic.map((item) => ({ value: String(item.crewId), label: `${item.crewName} · ${item.positionName}` }))} /></label>
      <div className="summary-source-facts"><div><span>Смуга</span><b>{editing.workStrip}</b></div><div><span>Позиція</span><b>{editing.positionName}</b></div><div><span>MGRS</span><b>{editing.mgrs || "–"}</b></div><div><span>Район н.п.</span><b>{editing.locality || "–"}</b></div><div className="wide"><span>Район виконання завдання</span><b>{editing.taskArea || "–"}</b></div></div>
      <section className="summary-modal-group"><header><div><b>БпЛА та серійні номери</b><small>Плюс у рядку дублює тип БпЛА для введення ще одного серійного номера.</small></div><button className="icon-button" aria-label="Додати інший БпЛА" onClick={() => setEditing({ ...editing, uavs: [...editing.uavs, { id: crypto.randomUUID(), equipmentId: null, name: "", serialNumber: "" }] })}><Plus /></button></header>{editing.uavs.map((uav) => <div className="summary-modal-row" key={uav.id}><input placeholder="Назва БпЛА" value={uav.name} onChange={(event) => editUav(uav.id, { name: event.target.value })} /><input placeholder="Серійний номер" value={uav.serialNumber} onChange={(event) => editUav(uav.id, { serialNumber: event.target.value })} /><button className="icon-button" title="Ще один серійний номер" aria-label={`Додати серійний номер для ${uav.name || "БпЛА"}`} onClick={() => addSerial(uav)}><Plus /></button><button className="icon-button danger" aria-label="Видалити БпЛА" onClick={() => setEditing({ ...editing, uavs: editing.uavs.filter((item) => item.id !== uav.id) })}><Trash2 /></button></div>)}</section>
      <section className="summary-modal-group"><header><div><b>Фактичний склад на позиції</b><small>ПІБ береться з етапу плану; редагується лише період.</small></div></header>{editing.members.map((member) => <article className="summary-member-row" key={member.id}><div className="summary-member-identity"><b>{member.fullName}</b><small>{member.rank}</small></div><div className="summary-member-times"><div className="summary-time-group"><b>Від</b><label><span>Дата</span><input aria-label={`Дата початку: ${member.fullName}`} type="date" value={member.startDate} onChange={(event) => setEditing({ ...editing, members: editing.members.map((item) => item.id === member.id ? { ...item, startDate: event.target.value } : item) })} /></label><label><span>Час</span><input aria-label={`Час початку: ${member.fullName}`} type="time" value={member.startTime} onChange={(event) => setEditing({ ...editing, members: editing.members.map((item) => item.id === member.id ? { ...item, startTime: event.target.value } : item) })} /></label></div><div className="summary-time-group"><b>До</b><label><span>Дата</span><input aria-label={`Дата завершення: ${member.fullName}`} type="date" value={member.endDate} onChange={(event) => setEditing({ ...editing, members: editing.members.map((item) => item.id === member.id ? { ...item, endDate: event.target.value } : item) })} /></label><label><span>Час</span><input aria-label={`Час завершення: ${member.fullName}`} type="time" value={member.endTime} onChange={(event) => setEditing({ ...editing, members: editing.members.map((item) => item.id === member.id ? { ...item, endTime: event.target.value } : item) })} /></label></div></div></article>)}</section>
    </div><footer className="modal-actions"><button className="button" onClick={() => setEditing(null)}>Скасувати</button><button className="button primary" onClick={saveItem}>Зберегти блок</button></footer></Modal>}
  </section>;
}

function EventEditor({ items, onChange }: { items: SummaryTextItem[]; onChange: (items: SummaryTextItem[]) => void }) {
  const set = (id: string, patch: Partial<SummaryTextItem>) => onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  return <section className="summary-editor-block"><header><div><b>Події, проведені за звітний період</b><small>Додавайте лише фактичні події. Програма не створює довільних формулювань.</small></div><button className="icon-button" aria-label="Додати подію" onClick={() => onChange([...items, { id: crypto.randomUUID(), date: "", time: "", text: "" }])}><Plus /></button></header>{items.map((item) => <div className="summary-event-object" key={item.id}><label><span>Дата</span><input type="date" value={item.date || ""} onChange={(event) => set(item.id, { date: event.target.value })} /></label><label><span>Час</span><input type="time" value={item.time || ""} onChange={(event) => set(item.id, { time: event.target.value })} /></label><label><span>Текст події</span><textarea value={item.text} onChange={(event) => set(item.id, { text: event.target.value })} /></label><button className="icon-button danger" aria-label="Видалити подію" onClick={() => onChange(items.filter((value) => value.id !== item.id))}><Trash2 /></button></div>)}</section>;
}

function RotationEventEditor({ events, included, edits, onIncluded, onEdits }: { events: SummaryTextItem[]; included: string[]; edits: Record<string, string>; onIncluded: (ids: string[]) => void; onEdits: (value: Record<string, string>) => void }) {
  return <section className="summary-editor-block"><header><div><b>Автоматичні події звітного періоду</b><small>Вхід і вихід екіпажів, ротації, нові чергування КСП та роботи на позиціях одразу потрапляють у документ.</small></div><div className="summary-header-actions"><span className="source-badge">План польотів</span><span className="source-badge">КСП</span><span className="source-badge">Позиції</span></div></header>{events.length ? events.map((item) => { const checked = included.includes(item.id); return <div className={`summary-rotation-event ${checked ? "is-included" : ""}`} key={item.id}><label className="check-row"><input type="checkbox" checked={checked} onChange={() => onIncluded(checked ? included.filter((id) => id !== item.id) : [...included, item.id])} /><span>{item.date ? `${displayDate(item.date)} ${item.time || ""}` : "Подія"} · Вивести у підсумковому</span></label><textarea disabled={!checked} value={edits[item.id] ?? item.text} onChange={(event) => onEdits({ ...edits, [item.id]: event.target.value })} /></div>; }) : <div className="summary-empty-card">За звітний період автоматичних подій не виявлено.</div>}</section>;
}

function NumberGrid({ title, values, labels, onChange }: { title: string; values: Record<string, string>; labels: Array<[string, string]>; onChange: (value: Record<string, string>) => void }) {
  return <section className="summary-editor-block"><header><b>{title}</b></header><div className="summary-number-grid">{labels.map(([key, label]) => <label className="form-field" key={key}><span>{label}</span><input inputMode="numeric" value={values[key] ?? ""} onChange={(event) => onChange({ ...values, [key]: event.target.value.replace(/[^0-9]/gu, "") })} /></label>)}</div></section>;
}

export function SummaryReportPage() {
  const { notify } = useNotifications();
  const [reportDate, setReportDate] = useState(initialReportDate);
  const [manual, setManual] = useState<SummaryManual>(defaultSummaryManual);
  const [settings, setSettings] = useState<AppSettings>(blankSettings);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [journal, setJournal] = useState<FlightJournalEntry[]>([]);
  const [staffing, setStaffing] = useState<StaffingRecord[]>([]);
  const [positionWork, setPositionWork] = useState<PositionWork[]>([]);
  const [positionWorkHistory, setPositionWorkHistory] = useState<PositionWorkStatusEvent[]>([]);
  const [snapshots, setSnapshots] = useState<Array<FlightPlanRequest | null>>([]);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [lastPath, setLastPath] = useState("");
  const [parametersOpen, setParametersOpen] = useState(false);
  const [savingParameters, setSavingParameters] = useState(false);
  const [parameterDraft, setParameterDraft] = useState<PdParametersDraft>(() => ({ reportNumber: "", kspOutskirts: "", unit: blankSettings().unit }));
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(openSectionsStorageKey) || "null") ?? { situation: true }; } catch { return { situation: true }; }
  });
  const [clock, setClock] = useState(() => Date.now());
  const [reportNavigation, setReportNavigation] = useState<ReportNavigation | null>(null);
  const [switchingReport, setSwitchingReport] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const sourceSignatureRef = useRef("");
  const manualRef = useRef(manual);
  const switchingReportRef = useRef(false);

  useLayoutEffect(() => { manualRef.current = manual; }, [manual]);

  const loadSources = useCallback(async (date: string) => {
    const [nextSettings, nextCrews, nextPositions, nextEquipment, nextJournal, nextStaffing, nextPositionWork, nextPositionWorkHistory, previousStored, currentStored] = await Promise.all([settingsService.get(), operationsService.listCrews(), operationsService.listPositions(), operationsService.listEquipment("uav"), operationsService.listFlightJournalEntries(), operationsService.listStaffingRecords(), Promise.resolve(operationsService.listPositionWork?.() ?? []), operationsService.listPositionWorkStatusHistory(), operationsService.getFlightPlanSnapshot(shiftDate(date, -1)), operationsService.getFlightPlanSnapshot(date)]);
    const previousSnapshot = parseSnapshot(previousStored) ?? flightPlanDraftRequest(shiftDate(date, -1));
    const currentSnapshot = parseSnapshot(currentStored) ?? flightPlanDraftRequest(date);
    const nextSnapshots = [previousSnapshot, currentSnapshot];
    const signature = JSON.stringify([nextSettings, nextCrews, nextPositions, nextEquipment, nextJournal, nextStaffing, nextPositionWork, nextPositionWorkHistory, nextSnapshots]);
    if (signature === sourceSignatureRef.current) return false;
    sourceSignatureRef.current = signature;
    setSettings(nextSettings); setCrews(nextCrews); setPositions(nextPositions); setEquipment(nextEquipment); setJournal(nextJournal); setStaffing(nextStaffing); setPositionWork(nextPositionWork); setPositionWorkHistory(nextPositionWorkHistory); setSnapshots(nextSnapshots);
    return true;
  }, []);
  const load = useCallback(async (date = reportDate) => {
    try {
      const draft = await summaryReportService.loadDraft(date);
      await loadSources(date);
      setManual(parseDraft(draft.current) ?? carryForwardSummary(parseDraft(draft.previous)));
      setReady(true);
    } catch { notify("Не вдалося завантажити підсумкове донесення.", "error"); }
  }, [loadSources, notify, reportDate]);
  useEffect(() => { setReady(false); void load(reportDate); }, [load, reportDate]);
  useEffect(() => { const refresh = () => { if (document.visibilityState === "visible") void loadSources(reportDate).catch(() => undefined); }; window.addEventListener("flight-plan-updated", refresh); window.addEventListener("operational-data-updated", refresh); window.addEventListener("settings-updated", refresh); return () => { window.removeEventListener("flight-plan-updated", refresh); window.removeEventListener("operational-data-updated", refresh); window.removeEventListener("settings-updated", refresh); }; }, [loadSources, reportDate]);
  const switchReportDate = useCallback(async (targetDate: string) => {
    if (targetDate === reportDate || switchingReportRef.current) return;
    switchingReportRef.current = true;
    setSwitchingReport(true);
    try {
      await summaryReportService.saveDraft(reportDate, JSON.stringify(manualRef.current));
      sourceSignatureRef.current = "";
      setReady(false);
      setReportNavigation(null);
      setReportDate(targetDate);
    } catch {
      notify("Не вдалося зберегти поточне донесення. Перехід скасовано, щоб не втратити правки.", "error");
    } finally {
      switchingReportRef.current = false;
      setSwitchingReport(false);
    }
  }, [notify, reportDate]);
  useEffect(() => {
    const checkDate = () => {
      const now = new Date();
      setClock(now.getTime());
      const automaticDate = initialReportDate(now);
      if (automaticDate > reportDate) void switchReportDate(automaticDate);
    };
    checkDate();
    let timer = 0;
    const scheduleBoundary = () => {
      const now = new Date();
      const futureBoundaries = [
        new Date(`${reportDate}T12:00:00`),
        new Date(`${reportDate}T18:01:00`),
        new Date(`${shiftDate(reportDate, 1)}T12:00:00`),
      ].filter((boundary) => boundary.getTime() > now.getTime());
      const boundary = futureBoundaries.sort((left, right) => left.getTime() - right.getTime())[0] ?? new Date(now.getTime() + 1_000);
      timer = window.setTimeout(() => { checkDate(); scheduleBoundary(); }, Math.max(0, boundary.getTime() - now.getTime()) + 20);
    };
    scheduleBoundary();
    const checkWhenVisible = () => { if (document.visibilityState === "visible") checkDate(); };
    document.addEventListener("visibilitychange", checkWhenVisible);
    window.addEventListener("focus", checkDate);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      window.removeEventListener("focus", checkDate);
    };
  }, [reportDate, switchReportDate]);
  useEffect(() => { if (!ready) return; const timer = window.setTimeout(() => void summaryReportService.saveDraft(reportDate, JSON.stringify(manual)).catch(() => notify("Не вдалося автоматично зберегти правки донесення.", "error")), 350); return () => window.clearTimeout(timer); }, [manual, notify, ready, reportDate]);
  useEffect(() => { try { localStorage.setItem(openSectionsStorageKey, JSON.stringify(openSections)); } catch { /* Стан вкладок не критичний для документа. */ } }, [openSections]);

  const built = useMemo(() => buildSummaryDocument({ reportDate, manual, settings, crews, positions, equipment, journal, snapshots, staffing, positionWork, positionWorkHistory }), [crews, equipment, journal, manual, positions, positionWork, positionWorkHistory, reportDate, settings, snapshots, staffing]);
  useEffect(() => {
    const known = (manual.autoBaselines.rotationEventIds || "").split(",").filter(Boolean);
    const discovered = built.objects.rotationEvents.map((item) => item.id);
    const additions = discovered.filter((id) => !known.includes(id));
    if (!additions.length && known.length === discovered.length) return;
    setManual((current) => ({ ...current, includedAutoEventIds: [...new Set([...current.includedAutoEventIds, ...additions])], autoBaselines: { ...current.autoBaselines, rotationEventIds: discovered.join(",") } }));
  }, [built.objects.rotationEvents, manual.autoBaselines.rotationEventIds]);
  useEffect(() => {
    if (!ready || !previewRef.current) return;
    let cancelled = false; const target = previewRef.current; setPreviewError("");
    const timer = window.setTimeout(() => void summaryReportService.render(built.document).then(async (bytes) => { if (cancelled) return; const scrollTop = target.scrollTop; const scrollLeft = target.scrollLeft; target.replaceChildren(); await renderAsync(new Blob([new Uint8Array(bytes)]), target, target, { inWrapper: true, breakPages: true, renderHeaders: true, renderFooters: true, useBase64URL: true }); if (!cancelled) { target.scrollTop = scrollTop; target.scrollLeft = scrollLeft; } }).catch(() => { if (!cancelled) setPreviewError("Не вдалося оновити перегляд документа."); }), 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [built.document, ready]);

  const patch = <K extends keyof SummaryManual>(key: K, value: SummaryManual[K]) => setManual((current) => ({ ...current, [key]: value }));
  const setSectionOpen = (key: string, open: boolean) => setOpenSections((current) => current[key] === open ? current : { ...current, [key]: open });
  const openParameters = () => { setParameterDraft({ reportNumber: manual.reportNumber, kspOutskirts: manual.kspOutskirts, unit: { ...settings.unit } }); setParametersOpen(true); };
  const saveParameters = async () => {
    setSavingParameters(true);
    try {
      const updated = await settingsService.updateUnit(parameterDraft.unit);
      setSettings(updated);
      setManual((current) => ({ ...current, reportNumber: parameterDraft.reportNumber, kspOutskirts: parameterDraft.kspOutskirts }));
      setParametersOpen(false);
      notify("Параметри підсумкового донесення збережено.", "success");
    } catch { notify("Не вдалося зберегти параметри підсумкового донесення.", "error"); } finally { setSavingParameters(false); }
  };
  const exportDocument = async () => {
    if (built.warnings.length) { notify("Спочатку заповніть критичні поля, перелічені над редактором.", "error"); return; }
    const shortName = settings.unit.shortName || "Підрозділ";
    const defaultPath = `Підсумкове бойове донесення_${shortName}_${displayDate(reportDate)}.docx`;
    const selected = await save({ title: "Зберегти підсумкове донесення", defaultPath, filters: [{ name: "Документ Word", extensions: ["docx"] }] });
    if (!selected) return; const path = selected.endsWith(".docx") ? selected : `${selected}.docx`;
    setExporting(true); try { await summaryReportService.saveDraft(reportDate, JSON.stringify(manual)); await summaryReportService.export(path, built.document); setLastPath(path); notify("Підсумкове донесення збережено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося створити донесення.", "error"); } finally { setExporting(false); }
  };
  const currentTime = new Date(clock);
  const requestNextReport = () => {
    const now = new Date();
    setClock(now.getTime());
    if (canOpenNextReport(reportDate, now)) setReportNavigation({ direction: "next", targetDate: shiftDate(reportDate, 1) });
  };
  const requestPreviousReport = () => {
    const now = new Date();
    setClock(now.getTime());
    if (canReturnToPreviousReport(reportDate, now)) setReportNavigation({ direction: "previous", targetDate: shiftDate(reportDate, -1) });
  };
  const confirmReportNavigation = () => {
    if (!reportNavigation) return;
    const now = new Date();
    setClock(now.getTime());
    const allowed = reportNavigation.direction === "next"
      ? canOpenNextReport(reportDate, now)
      : canReturnToPreviousReport(reportDate, now);
    if (allowed) {
      void switchReportDate(reportNavigation.targetDate);
      return;
    }
    setReportNavigation(null);
    const automaticDate = initialReportDate(now);
    if (automaticDate > reportDate) void switchReportDate(automaticDate);
    else notify("Ручний перехід між донесеннями доступний лише до 12:00.", "error");
  };

  return <PageFrame className="summary-report-page" header={<PageTitle title="Підсумкове донесення" subtitle={`Звітний період: ${displayDate(shiftDate(reportDate, -1))} 18:01 – ${displayDate(reportDate)} 18:00`} actions={<div className="summary-title-actions"><button className="button" onClick={openParameters}><Settings2 />Параметри ПД</button>{canReturnToPreviousReport(reportDate, currentTime) && <button className="button" disabled={switchingReport} onClick={requestPreviousReport}>Повернутися до попереднього донесення</button>}{canOpenNextReport(reportDate, currentTime) && <button className="button" disabled={switchingReport} onClick={requestNextReport}>Перейти до нового донесення</button>}<button className="button primary" disabled={exporting || switchingReport || !ready} onClick={() => void exportDocument()}><FileOutput />{exporting ? "Створення…" : "Створити підсумкове донесення"}</button></div>} />}>
    <div className="summary-report-layout">
      <section className="panel summary-preview"><header><div><b>Документ за {displayDate(reportDate)}</b><small>Перегляд оновлюється лише після зміни даних або ручного оновлення.</small></div><button className="icon-button" aria-label="Оновити" onClick={() => void loadSources(reportDate)}><RefreshCw /></button></header><div ref={previewRef} className="summary-preview__document">{previewError && <div className="empty-state">{previewError}</div>}</div></section>
      <aside className="summary-controls">
        {built.warnings.length > 0 && <section className="summary-warnings"><b>Потрібно заповнити перед створенням</b>{built.warnings.map((warning) => <span key={warning}>{warning}</span>)}</section>}
        <details open={Boolean(openSections.enemyLosses ?? openSections.situation)} onToggle={(event) => setSectionOpen("enemyLosses", event.currentTarget.open)}>
          <summary>1. ВИСНОВКИ З ОЦІНКИ ПРОТИВНИКА</summary>
          <NumberGrid title="Орієнтовні втрати противника протягом доби" values={manual.enemyLosses} onChange={(value) => patch("enemyLosses", value)} labels={enemyExtendedLossLabels} />
        </details>
        <details open={Boolean(openSections.situation)} onToggle={(event) => setSectionOpen("situation", event.currentTarget.open)}>
          <summary>2. ПОЛОЖЕННЯ ТА СТАН ПІДРОЗДІЛІВ НАШИХ ВІЙСЬК</summary>
          <section className="summary-editor-block">
            <header><b>2.1. Зміни в складі та положенні</b><span className="source-badge">Без змін</span></header>
            <label className="check-row"><input type="checkbox" checked={manual.compositionOverride} onChange={(event) => patch("compositionOverride", event.target.checked)} /><span>Вказати зміни вручну</span></label>
            {manual.compositionOverride && <textarea value={manual.compositionChanges} onChange={(event) => patch("compositionChanges", event.target.value)} />}
          </section>
          <div className="summary-subsection-title">2.2. Положення військових частин (підрозділів)</div>
          <CompositionEditor automatic={built.objects.compositionItems} value={manual.compositionItems} onChange={(value) => patch("compositionItems", value)} />
          <section className="summary-editor-block">
            <header><div><b>Укомплектованість</b><small>Поля підставляються у фразу шаблону в зазначеному вигляді.</small></div><span className="source-badge">Вручну</span></header>
            {([['personnel','Особовий склад, %'],['automotive','Автомобільна техніка, %'],['uavType','Вид БпАК у дужках'],['uav','БпАК, %'],['zbbr','ЗББР, %'],['fuel','ПММ, %']] as const).map(([key,label]) => <label className="form-field" key={key}><span>{label}</span><input value={manual.completeness[key]} onChange={(event) => patch("completeness", { ...manual.completeness, [key]: event.target.value })} /></label>)}
          </section>
          <section className="summary-editor-block"><header><div><b>Управління підрозділами здійснюється</b><small>Околиці редагуються у «Параметрах ПД» та підставляються у фразу про КСП.</small></div><span className="source-badge">Параметри ПД</span></header></section>
          <PositionEditor automatic={built.objects.positionItems} value={manual.positionItems} onChange={(value) => patch("positionItems", value)} />
        </details>
        <details open={Boolean(openSections.enemyActions)} onToggle={(event) => setSectionOpen("enemyActions", event.currentTarget.open)}>
          <summary>3. ХІД ВЕДЕННЯ БОЙОВИХ ДІЙ ТА ВИКОНАННЯ СПЛАНОВАНИХ ЗАВДАНЬ</summary>
          <section className="summary-editor-block">
            <header><div><b>3.1. За противника</b><small>Згідно розвідувальних даних. Формулювання збережено без змін із шаблону.</small></div></header>
          </section>
          <div className="summary-subsection-title">3.2. За свої війська</div>
          <section className="summary-editor-block">
            <header><b>Противником нанесено</b></header>
            <div className="summary-number-grid">{([['rocketStrikes','Ракетних ударів'],['airStrikes','Авіаційних ударів'],['va','ВА'],['sha','ША'],['aa','АА']] as const).map(([key,label]) => <label className="form-field" key={key}><span>{label}</span><input inputMode="numeric" value={manual[key]} onChange={(event) => patch(key, event.target.value.replace(/[^0-9]/gu, ""))} /></label>)}</div>
            <label className="check-row"><input type="checkbox" checked={manual.enemyAssault} onChange={(event) => patch("enemyAssault", event.target.checked)} />Противник проводив наступальні дії</label>
            {manual.enemyAssault && <textarea value={manual.enemyAssaultText} onChange={(event) => patch("enemyAssaultText", event.target.value)} />}
          </section>
          <section className="summary-editor-block">
            <header><div><b>Противник здійснив обстріли</b><small>Кожен обстріл формує окремий рядок таблиці.</small></div><button className="icon-button" onClick={() => patch("shellings", [...manual.shellings, { id: crypto.randomUUID(), time: "", shellingType: "", target: "", direction: "", response: "" }])}><Plus /></button></header>
            {manual.shellings.map((row) => <div className="summary-shelling" key={row.id}>{([['time','Час'],['shellingType','Вид обстрілу'],['target','По чому нанесено'],['direction','Звідки / напрямок'],['response','Вжиті заходи']] as const).map(([key,label]) => <label key={key}><span>{label}</span><input value={row[key]} onChange={(event) => patch("shellings", manual.shellings.map((item) => item.id === row.id ? { ...item, [key]: event.target.value } : item))} /></label>)}<button className="icon-button danger" onClick={() => patch("shellings", manual.shellings.filter((item) => item.id !== row.id))}><Trash2 /></button></div>)}
          </section>
        </details>
        <details open={Boolean(openSections.unitWork)} onToggle={(event) => setSectionOpen("unitWork", event.currentTarget.open)}>
          <summary>3.3–3.5. Виконання завдань підрозділом</summary>
          <section className="summary-editor-block">
            <header><b>3.3. Хід ведення наступальних (штурмових) дій (нанесення вогневого ураження по противнику)</b><span className="source-badge">Вручну</span></header>
            <label className="check-row"><input type="checkbox" checked={manual.ownAssault} onChange={(event) => patch("ownAssault", event.target.checked)} />Підрозділ проводив наступальні дії</label>
            {manual.ownAssault && <textarea value={manual.ownAssaultText} onChange={(event) => patch("ownAssaultText", event.target.value)} />}
          </section>
          <FlightItemsEditor automatic={built.objects.flightItems} value={manual.flightItems} onChange={(value) => patch("flightItems", value)} />
          <DutyEditor title="Позмінне управління боєм на КСП" items={manual.commandDuties} people={staffing} reportDate={reportDate} onChange={(value) => patch("commandDuties", value)} />
          <DutyEditor title="Позмінна охорона та оборона КСП" items={manual.guardDuties} people={staffing} reportDate={reportDate} onChange={(value) => patch("guardDuties", value)} />
          <RotationEventEditor events={built.objects.rotationEvents} included={manual.includedAutoEventIds} edits={manual.autoEventEdits} onIncluded={(value) => patch("includedAutoEventIds", value)} onEdits={(value) => patch("autoEventEdits", value)} />
          <EventEditor items={manual.manualEvents} onChange={(value) => patch("manualEvents", value)} />
          <section className="summary-editor-block">
            <header><b>3.4. Робота комісій, робочих та інспекційних груп</b><span className="source-badge">Вручну</span></header>
            <label className="check-row"><input type="checkbox" checked={manual.commissionsOverride} onChange={(event) => patch("commissionsOverride", event.target.checked)} />Змінити текст вручну</label>
            {manual.commissionsOverride && <textarea value={manual.commissions} onChange={(event) => patch("commissions", event.target.value)} />}
          </section>
          <section className="summary-editor-block">
            <header><b>3.5. Хід фортифікаційного обладнання оборонного рубежу (за добу)</b><span className="source-badge">Вручну</span></header>
            <label className="check-row"><input type="checkbox" checked={manual.fortificationOverride} onChange={(event) => patch("fortificationOverride", event.target.checked)} />Змінити текст вручну</label>
            {manual.fortificationOverride && <textarea value={manual.fortification} onChange={(event) => patch("fortification", event.target.value)} />}
          </section>
        </details>
        <details open={Boolean(openSections.system ?? openSections.unitWork)} onToggle={(event) => setSectionOpen("system", event.currentTarget.open)}>
          <summary>4. СИСТЕМА АС ЦОК ЗС УКРАЇНИ (АС «ДЗВІН»)</summary>
          <section className="summary-editor-block">
            <header><b>Стан системи</b><span className="source-badge">Вручну</span></header>
            <label className="check-row"><input type="checkbox" checked={manual.dzvinOverride} onChange={(event) => patch("dzvinOverride", event.target.checked)} />Змінити текст вручну</label>
            {manual.dzvinOverride && <textarea value={manual.dzvin} onChange={(event) => patch("dzvin", event.target.value)} />}
          </section>
        </details>
        <details open={Boolean(openSections.tasks)} onToggle={(event) => setSectionOpen("tasks", event.currentTarget.open)}>
          <summary>5. ОСНОВНІ ЗАВДАННЯ, ЯКІ ПЛАНУЮТЬСЯ НА НАСТУПНУ ДОБУ</summary>
          <ItemEditor title="Завдання на наступну добу" items={manual.nextTasks} onChange={(value) => patch("nextTasks", value)} />
        </details>
        <details open={Boolean(openSections.losses ?? openSections.ownLosses)} onToggle={(event) => setSectionOpen("losses", event.currentTarget.open)}>
          <summary>6. ВТРАТИ</summary>
          <NumberGrid title="6.1. Відомості про безповоротні та санітарні втрати особового складу" values={manual.personnelLosses} onChange={(value) => patch("personnelLosses", value)} labels={personnelLossLabels} />
          <NumberGrid title="6.2. Втрати ОВТ" values={manual.equipmentLosses} onChange={(value) => patch("equipmentLosses", value)} labels={equipmentExtendedLossLabels} />
          <section className="summary-editor-block"><label className="form-field"><span>Деталі втрат ОВТ за звітний період</span><textarea value={manual.equipmentLossesDetails} onChange={(event) => patch("equipmentLossesDetails", event.target.value)} /></label></section>
        </details>
        <details open={Boolean(openSections.ammunition ?? openSections.losses)} onToggle={(event) => setSectionOpen("ammunition", event.currentTarget.open)}>
          <summary>ВИТРАТИ БОЄПРИПАСІВ, ІНЖЕНЕРНИХ ТА АВІАЦІЙНИХ ЗАСОБІВ УРАЖЕННЯ:</summary>
          <section className="summary-editor-block"><label className="form-field"><span>Відомості про витрати</span><textarea value={manual.ammunitionExpenses} onChange={(event) => patch("ammunitionExpenses", event.target.value)} /></label></section>
        </details>
        <details open={Boolean(openSections.issues)} onToggle={(event) => setSectionOpen("issues", event.currentTarget.open)}>
          <summary>8. ПРОБЛЕМНІ ПИТАННЯ:</summary>
          <section className="summary-editor-block"><label className="form-field"><span>Проблемні питання</span><textarea value={manual.problems} onChange={(event) => patch("problems", event.target.value)} /></label></section>
        </details>
        <details open={Boolean(openSections.otherIssues ?? openSections.issues)} onToggle={(event) => setSectionOpen("otherIssues", event.currentTarget.open)}>
          <summary>9. ІНШІ ПИТАННЯ:</summary>
          <ItemEditor title="Перелік інших питань" items={manual.otherIssues} onChange={(value) => patch("otherIssues", value)} />
        </details>
        {lastPath && <button className="button full" onClick={() => void summaryReportService.open(lastPath)}>Відкрити створений DOCX</button>}
      </aside>
    </div>
    {parametersOpen && <Modal title="Параметри ПД" subtitle="Реквізити зберігаються для наступних донесень; номер і околиці належать поточному донесенню." onClose={() => setParametersOpen(false)} className="summary-parameters-modal"><div className="summary-parameters-modal__body">
      <section className="summary-modal-group"><header><div><b>Поточне донесення</b><small>Ці значення використовуються у шапці та описі КСП.</small></div></header><div className="summary-parameters-grid"><label className="form-field"><span>Номер донесення</span><input autoFocus value={parameterDraft.reportNumber} onChange={(event) => setParameterDraft((current) => ({ ...current, reportNumber: event.target.value }))} /></label><label className="form-field"><span>Дата донесення</span><input value={displayDate(reportDate)} readOnly /></label><label className="form-field"><span>Примірник</span><input value="Прим. № 1" readOnly /></label><label className="form-field"><span>Околиці населеного пункту КСП</span><input value={parameterDraft.kspOutskirts} onChange={(event) => setParameterDraft((current) => ({ ...current, kspOutskirts: event.target.value }))} placeholder="південні околиці" /><small>У документі: «КСП … – південні околиці населеного пункту …».</small></label></div></section>
      <section className="summary-modal-group"><header><div><b>Реквізити підсумкового донесення</b><small>Підказка під кожним полем показує, де саме значення буде використано.</small></div></header><div className="summary-parameters-grid">{([
        ["battalionFullName", "Повна назва батальйону у родовому відмінку", "Для посади підписанта: «477 окремого батальйону безпілотних систем»."],
        ["battalionShortName", "Коротка назва батальйону", "Після короткої назви підрозділу у пункті 3.3."],
        ["militaryUnitShortName", "Коротка назва військової частини", "У дужках після короткої назви підрозділу. Використовується значення, введене в цьому полі."],
        ["reportRecipient", "Адресат донесення", "У шапці після слова «Командиру»."],
        ["kspName", "Назва КСП", "У формі «КСП «НАЗВА»»."],
        ["kspLocality", "Населений пункт КСП", "Без «н.п.»; потрібний префікс додається у документі."],
        ["kspMgrs", "Координати КСП", "У дужках після району КСП."],
        ["armyCorpsNumber", "Номер АК", "Вводьте лише номер; «АК» додається у документі."],
        ["armNumber", "Номер АРМ", "У службовій позначці «АРМ № …»."],
      ] as const).map(([key, label, help]) => <label className={`form-field ${key === "battalionFullName" || key === "reportRecipient" ? "wide" : ""}`} key={key}><span>{label}</span><input value={parameterDraft.unit[key] ?? ""} onChange={(event) => setParameterDraft((current) => ({ ...current, unit: { ...current.unit, [key]: event.target.value } }))} /><small>{help}</small></label>)}</div></section>
      <div className="summary-signer-note"><span>Основний підписант</span><b>{[settings.mainSigner.rank, settings.mainSigner.fullName].filter(Boolean).join(" · ") || "Не вказаний у налаштуваннях"}</b><small>У підписі використовується формат «Ім’я ПРІЗВИЩЕ» згідно з шаблоном.</small></div>
    </div><footer className="modal-actions"><button className="button" onClick={() => setParametersOpen(false)}>Скасувати</button><button className="button primary" disabled={savingParameters} onClick={() => void saveParameters()}>{savingParameters ? "Збереження…" : "Зберегти параметри"}</button></footer></Modal>}
    {reportNavigation && <Modal title={reportNavigation.direction === "next" ? "Перейти до нового донесення?" : "Повернутися до попереднього донесення?"} subtitle={`Донесення за ${displayDate(reportNavigation.targetDate)}`} onClose={() => { if (!switchingReport) setReportNavigation(null); }} className="summary-navigation-modal"><div className="summary-navigation-modal__body"><p>Усі поточні правки буде збережено перед переходом.</p>{reportNavigation.direction === "next" && <p>До 12:00 можна буде повернутися до попереднього донесення. О 12:00 програма остаточно перейде до нового.</p>}</div><footer className="modal-actions"><button className="button" disabled={switchingReport} onClick={() => setReportNavigation(null)}>Скасувати</button><button className="button primary" disabled={switchingReport} onClick={confirmReportNavigation}>{switchingReport ? "Збереження…" : "Так, перейти"}</button></footer></Modal>}
  </PageFrame>;
}
