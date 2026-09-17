import { Car, Clock3, Crosshair, Hammer, MapPin, PackageOpen, Pencil, Plane, Plus, Radio, Route, Shield, Trash2, UsersRound, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type UIEventHandler } from "react";
import { useEntityCollection } from "../../shared/hooks/useEntityCollection";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { CardGridSkeleton } from "../../shared/ui/entity-card/CardGridSkeleton";
import { EntityCard, EntityCardGrid } from "../../shared/ui/entity-card/EntityCard";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { RegistryToolbar } from "../../shared/ui/RegistryToolbar";
import { Select } from "../../shared/ui/Select";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, EquipmentCategory, Incident, Position, PositionDraft, PositionWork, PositionWorkDraft, PositionWorkMemberDraft, StaffingRecord } from "./types";
import { flightPlanActiveCrewIds, flightPlanActiveMemberIds, flightPlanDateMatches, flightPlanSnapshot } from "./flight-plan-storage";
import { incidentDateTimeParts } from "./incident-date";
import { isAvailableForPositionWork } from "./bcs-model";
import { vehiclesService } from "../vehicles/services/vehiclesService";
import type { Vehicle } from "../vehicles/types";

type PositionTab = "overview" | "relations" | "history";
type PositionAssetTab = EquipmentCategory | "vehicles";
type SetupPositionMode = "existing" | "new";
type BasePositionType = Extract<Position["positionType"], "Основна" | "Запасна">;
type PositionWorkPerson = Pick<StaffingRecord, "personnelId" | "fullName" | "rank" | "position">;
const emptyDraft = (): PositionDraft => ({ name: "", positionType: "Основна", stripName: "", locality: "", battleOrder: "", sector: "", condition: "", conditionLevel: 0, fieldType: "", size: "", mgrs: "", suitableUavText: "", isActive: false, crewId: null, notes: "", uavIds: [] });
const includes = (query: string, ...values: (string | null | undefined)[]) => values.join(" ").toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"));
const positionTypeClass = (type: Position["positionType"]) => type === "Основна" ? "primary" : type === "Запасна" ? "reserve" : type === "Облаштовується" ? "building" : type === "Виявлена ворогом" ? "compromised" : "allied";
const equipmentCategoryLabels: Record<EquipmentCategory, string> = { uav: "БпЛА та БпАК", generator: "Генератори", communications: "Зв’язок", weapon_ammo: "Зброя та БК" };
const emptyWork = (positionId = 0, workType: PositionWorkDraft["workType"] = "Рекогностування"): PositionWorkDraft => ({ positionId, workType, status: "Приступили", startDate: new Date().toLocaleDateString("sv-SE"), startTime: "", endDate: "", endTime: "", battleOrder: "", notes: "", personnelIds: [], memberAssignments: [] });
const displayWorkDate = (value: string) => value ? value.split("-").reverse().join(".") : "дату не вказано";
const workTypeOptions = [{ value: "Рекогностування", label: "Рекогностування" }, { value: "Облаштування", label: "Облаштування" }];
const workStatusOptions = [{ value: "Приступили", label: "Приступили" }, { value: "Продовжують", label: "Продовжують" }, { value: "Завершили", label: "Завершили" }];
const workDutyOptions = [{ value: "Охорона та оборона", label: "Охорона та оборона" }, ...workTypeOptions];
const basePositionTypeOptions = [{ value: "Основна", label: "Основна" }, { value: "Запасна", label: "Запасна" }];
const rotationHourOptions = [1, 2, 3, 4, 6, 8, 12].map((hours) => ({ value: String(hours), label: `${hours} год` }));
const uniquePersonnelIds = (assignments: PositionWorkMemberDraft[]) => [...new Set(assignments.map((item) => item.personnelId))];
const withAssignments = (draft: PositionWorkDraft, memberAssignments: PositionWorkMemberDraft[]): PositionWorkDraft => ({ ...draft, personnelIds: uniquePersonnelIds(memberAssignments), memberAssignments });
const freshAssignment = (draft: PositionWorkDraft, personnelId: number): PositionWorkMemberDraft => ({ assignmentId: null, personnelId, dutyType: draft.workType, startDate: draft.startDate, startTime: draft.startTime, endDate: draft.endDate || draft.startDate, endTime: draft.endTime });
const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
};
const isValidTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const workMoment = (date: string, time: string) => `${date}T${time}`;
const shiftedWorkMoment = (date: string, time: string, minutes: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minute] = time.split(":").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, hours, minute + minutes));
  return { date: value.toISOString().slice(0, 10), time: value.toISOString().slice(11, 16) };
};
const rotatingWorkDraft = (draft: PositionWorkDraft, personnelIds: number[], rotationHours: number) => {
  const ids = [...new Set(personnelIds)];
  if (!ids.length) return withAssignments({ ...draft, endDate: "", endTime: "" }, []);
  if (!isValidIsoDate(draft.startDate) || !isValidTime(draft.startTime)) {
    return withAssignments(draft, ids.flatMap((personnelId) => {
      const work = freshAssignment(draft, personnelId);
      return [work, { ...work, dutyType: "Охорона та оборона" }];
    }));
  }
  const slotMinutes = rotationHours * 60;
  const slotCount = ids.length === 1 ? 2 : ids.length;
  const assignments = ids.flatMap((personnelId, index) => {
    const slots = [
      { slot: index, dutyType: draft.workType as PositionWorkMemberDraft["dutyType"] },
      { slot: ids.length === 1 ? 1 : (index + 1) % ids.length, dutyType: "Охорона та оборона" as const },
    ].sort((left, right) => left.slot - right.slot);
    return slots.map(({ slot, dutyType }, periodIndex) => {
      const rawStart = shiftedWorkMoment(draft.startDate, draft.startTime, slot * slotMinutes);
      const start = periodIndex > 0 && slots[periodIndex - 1].slot + 1 === slot
        ? shiftedWorkMoment(rawStart.date, rawStart.time, 1)
        : rawStart;
      const end = shiftedWorkMoment(draft.startDate, draft.startTime, (slot + 1) * slotMinutes);
      return { assignmentId: null, personnelId, dutyType, startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time };
    });
  });
  const end = shiftedWorkMoment(draft.startDate, draft.startTime, slotCount * slotMinutes);
  return withAssignments({ ...draft, endDate: end.date, endTime: end.time }, assignments);
};
const invalidWorkMessage = (draft: PositionWorkDraft) => {
  if (!isValidIsoDate(draft.startDate) || !isValidTime(draft.startTime)) return "Вкажіть коректні дату та час початку робіт.";
  if (Boolean(draft.endDate) !== Boolean(draft.endTime)) return "Для завершення групи вкажіть і дату, і час.";
  if (draft.status === "Завершили" && (!draft.endDate || !draft.endTime)) return "Для завершених робіт вкажіть дату та час завершення групи.";
  if (draft.endDate && (!isValidIsoDate(draft.endDate) || !isValidTime(draft.endTime))) return "Вкажіть коректні дату та час завершення групи.";
  if (draft.endDate && workMoment(draft.endDate, draft.endTime) <= workMoment(draft.startDate, draft.startTime)) return "Завершення групи має бути пізніше за її початок.";
  if (!draft.memberAssignments.length) return "Оберіть склад групи та додайте періоди робіт.";
  if (draft.memberAssignments.some((item) => !isValidIsoDate(item.startDate) || !isValidTime(item.startTime) || !isValidIsoDate(item.endDate) || !isValidTime(item.endTime))) return "Заповніть коректні дату й час початку та завершення кожного періоду.";
  if (draft.memberAssignments.some((item) => workMoment(item.endDate, item.endTime) <= workMoment(item.startDate, item.startTime))) return "Час завершення періоду має бути пізніше за час початку.";
  const groupStart = workMoment(draft.startDate, draft.startTime);
  const groupEnd = draft.endDate ? workMoment(draft.endDate, draft.endTime) : "";
  if (draft.memberAssignments.some((item) => workMoment(item.startDate, item.startTime) < groupStart || (groupEnd && workMoment(item.endDate, item.endTime) > groupEnd))) return "Кожен період має бути в межах часу роботи групи.";
  const people = uniquePersonnelIds(draft.memberAssignments);
  if (people.some((personnelId) => draft.memberAssignments.filter((item) => item.personnelId === personnelId).map((item) => [workMoment(item.startDate, item.startTime), workMoment(item.endDate, item.endTime)] as const).sort((left, right) => left[0].localeCompare(right[0])).some((item, index, periods) => index > 0 && item[0] <= periods[index - 1][1]))) return "Періоди однієї людини не можуть перетинатися.";
  return "";
};

function PositionWorkFields({ draft, onChange }: { draft: PositionWorkDraft; onChange: (next: PositionWorkDraft) => void }) {
  return <div className="position-work-fields">
    <div className="form-field"><span>Вид робіт</span><Select ariaLabel="Вид робіт на позиції" value={draft.workType} onChange={(value) => onChange({ ...draft, workType: value as PositionWorkDraft["workType"] })} options={workTypeOptions} /></div>
    <div className="form-field"><span>Стан</span><Select ariaLabel="Стан робіт на позиції" value={draft.status} onChange={(value) => onChange({ ...draft, status: value as PositionWorkDraft["status"] })} options={workStatusOptions} /></div>
    <label className="form-field"><span>Дата події</span><input type="date" value={draft.startDate} onChange={(event) => onChange({ ...draft, startDate: event.target.value })} /></label>
    <label className="form-field"><span>Час події</span><input type="time" value={draft.startTime} onChange={(event) => onChange({ ...draft, startTime: event.target.value })} /></label>
    <label className="form-field"><span>Дата завершення групи</span><input type="date" value={draft.endDate} onChange={(event) => onChange({ ...draft, endDate: event.target.value })} /></label>
    <label className="form-field"><span>Час завершення групи</span><input type="time" value={draft.endTime} onChange={(event) => onChange({ ...draft, endTime: event.target.value })} /></label>
    <label className="form-field form-field--wide"><span>Бойове розпорядження</span><input value={draft.battleOrder} onChange={(event) => onChange({ ...draft, battleOrder: event.target.value })} /></label>
    <label className="form-field form-field--wide"><span>Примітка</span><textarea value={draft.notes} onChange={(event) => onChange({ ...draft, notes: event.target.value })} /></label>
  </div>;
}

function PositionWorkPeople({ draft, people, onChange, automaticRotationHours, onAutomaticRotationHoursChange }: { draft: PositionWorkDraft; people: PositionWorkPerson[]; onChange: (next: PositionWorkDraft) => void; automaticRotationHours?: number; onAutomaticRotationHoursChange?: (hours: number) => void }) {
  const toggle = (personnelId: number) => {
    const hasPerson = draft.memberAssignments.some((item) => item.personnelId === personnelId);
    if (automaticRotationHours) {
      const ids = hasPerson ? draft.personnelIds.filter((id) => id !== personnelId) : [...draft.personnelIds, personnelId];
      onChange(rotatingWorkDraft(draft, ids, automaticRotationHours));
      return;
    }
    onChange(withAssignments(draft, hasPerson ? draft.memberAssignments.filter((item) => item.personnelId !== personnelId) : [...draft.memberAssignments, freshAssignment(draft, personnelId)]));
  };
  const addPeriod = (personnelId: number) => onChange(withAssignments(draft, [...draft.memberAssignments, freshAssignment(draft, personnelId)]));
  const patchPeriod = (index: number, patch: Partial<PositionWorkMemberDraft>) => onChange(withAssignments(draft, draft.memberAssignments.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)));
  const removePeriod = (index: number) => onChange(withAssignments(draft, draft.memberAssignments.filter((_, itemIndex) => itemIndex !== index)));
  return <section className="position-work-people"><header><div><b>Склад групи</b><small>Доступні всі, хто зараз не перебуває на позиції, не заходить на неї та не вибуває з неї.</small></div><div className="position-work-rotation">{automaticRotationHours && onAutomaticRotationHoursChange && <><span>Чергування</span><Select ariaLabel="Тривалість чергування" value={String(automaticRotationHours)} onChange={(value) => onAutomaticRotationHoursChange(Number(value))} options={rotationHourOptions} /></>}<strong>{draft.personnelIds.length} обрано</strong></div></header><div>{people.map((person) => {
    const periods = draft.memberAssignments.map((assignment, index) => ({ assignment, index })).filter(({ assignment }) => assignment.personnelId === person.personnelId);
    return <article className={periods.length ? "selected" : ""} key={person.personnelId}><div className="position-work-person"><label><input type="checkbox" checked={periods.length > 0} onChange={() => toggle(person.personnelId)} /><span><b>{person.fullName}</b><small>{person.rank} · {person.position}</small></span></label>{periods.length > 0 && <button className="button compact" type="button" aria-label={`Додати період: ${person.fullName}`} onClick={() => addPeriod(person.personnelId)}><Plus />Додати період</button>}</div>{periods.length > 0 && <div className="position-work-periods">{periods.map(({ assignment, index }, periodIndex) => <section className="position-work-period" key={assignment.assignmentId ?? `${person.personnelId}-${index}`}><header><b>Період {periodIndex + 1}</b><button className="icon-button danger" type="button" title="Видалити період" aria-label={`Видалити період ${periodIndex + 1}: ${person.fullName}`} onClick={() => removePeriod(index)}><Trash2 /></button></header><div className="form-field"><span>Завдання</span><Select ariaLabel={`Завдання, період ${periodIndex + 1}: ${person.fullName}`} value={assignment.dutyType} onChange={(value) => patchPeriod(index, { dutyType: value as PositionWorkMemberDraft["dutyType"] })} options={workDutyOptions} /></div><div className="position-work-period__dates"><label><span>Від</span><input aria-label={`Дата початку, період ${periodIndex + 1}: ${person.fullName}`} type="date" value={assignment.startDate} onChange={(event) => patchPeriod(index, { startDate: event.target.value })} /></label><input aria-label={`Час початку, період ${periodIndex + 1}: ${person.fullName}`} type="time" value={assignment.startTime} onChange={(event) => patchPeriod(index, { startTime: event.target.value })} /><label><span>До</span><input aria-label={`Дата завершення, період ${periodIndex + 1}: ${person.fullName}`} type="date" value={assignment.endDate} onChange={(event) => patchPeriod(index, { endDate: event.target.value })} /></label><input aria-label={`Час завершення, період ${periodIndex + 1}: ${person.fullName}`} type="time" value={assignment.endTime} onChange={(event) => patchPeriod(index, { endTime: event.target.value })} /></div></section>)}</div>}</article>;
  })}{!people.length && <div className="position-work-people__empty">Вільних військовослужбовців немає.</div>}</div></section>;
}

function SetupPositionFields({ draft, onChange, onBattleOrderChange }: { draft: PositionDraft; onChange: (next: PositionDraft) => void; onBattleOrderChange: (value: string) => void }) {
  return <div className="position-setup-fields">
    <label className="form-field"><span>Назва <b>*</b></span><input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label>
    <div className="form-field"><span>Базовий тип позиції</span><Select ariaLabel="Базовий тип нової позиції" value={draft.positionType} onChange={(value) => onChange({ ...draft, positionType: value as BasePositionType })} options={basePositionTypeOptions} /></div>
    <label className="form-field"><span>БРО</span><input value={draft.battleOrder} onChange={(event) => onBattleOrderChange(event.target.value)} /></label>
    <label className="form-field"><span>Смуга роботи</span><input value={draft.stripName} onChange={(event) => onChange({ ...draft, stripName: event.target.value })} /></label>
    <label className="form-field"><span>Сектор</span><input value={draft.sector} onChange={(event) => onChange({ ...draft, sector: event.target.value })} /></label>
    <label className="form-field"><span>Населений пункт / район</span><input value={draft.locality} onChange={(event) => onChange({ ...draft, locality: event.target.value })} /></label>
    <label className="form-field form-field--wide"><span>Координати MGRS</span><input value={draft.mgrs} onChange={(event) => onChange({ ...draft, mgrs: event.target.value })} placeholder="36U UV 12000 67000" /><small>Останні три цифри двох п’ятизначних груп зберігаються як 000.</small></label>
    <label className="form-field"><span>Стан позиції</span><input value={draft.condition} onChange={(event) => onChange({ ...draft, condition: event.target.value })} /></label>
    <label className="form-field"><span>Готовність, %</span><input type="number" min={0} max={100} value={draft.conditionLevel} onChange={(event) => onChange({ ...draft, conditionLevel: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} /></label>
    <label className="form-field"><span>Тип місцевості</span><input value={draft.fieldType} onChange={(event) => onChange({ ...draft, fieldType: event.target.value })} /></label>
    <label className="form-field"><span>Розмір позиції</span><input value={draft.size} onChange={(event) => onChange({ ...draft, size: event.target.value })} /></label>
    <label className="form-field form-field--wide"><span>Придатні БпЛА / БпАК</span><input value={draft.suitableUavText} onChange={(event) => onChange({ ...draft, suitableUavText: event.target.value })} /></label>
    <label className="form-field form-field--wide"><span>Опис позиції</span><textarea value={draft.notes} onChange={(event) => onChange({ ...draft, notes: event.target.value })} /></label>
  </div>;
}

export function PositionsPage() {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Position | null>(null);
  const [open, setOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<PositionTab>("overview");
  const [draft, setDraft] = useState<PositionDraft>(emptyDraft);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [staffing, setStaffing] = useState<StaffingRecord[]>([]);
  const [positionWork, setPositionWork] = useState<PositionWork[]>([]);
  const [workEditing, setWorkEditing] = useState<PositionWork | "new" | null>(null);
  const [workDraft, setWorkDraft] = useState<PositionWorkDraft>(emptyWork());
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupMode, setSetupMode] = useState<SetupPositionMode>("existing");
  const [setupPositionId, setSetupPositionId] = useState("");
  const [setupPositionDraft, setSetupPositionDraft] = useState<PositionDraft>(emptyDraft);
  const [setupWorkDraft, setSetupWorkDraft] = useState<PositionWorkDraft>(() => emptyWork(0, "Облаштування"));
  const [setupRotationHours, setSetupRotationHours] = useState(2);
  const [setupBusy, setSetupBusy] = useState(false);
  const [assetTab, setAssetTab] = useState<PositionAssetTab>("uav");
  const [deleting, setDeleting] = useState<Position | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const { notify } = useNotifications();
  const loadPositions = useCallback(() => operationsService.listPositions(), []);
  const onLoadError = useCallback(() => notify("Не вдалося завантажити позиції.", "error"), [notify]);
  const { items, isLoading, reload: reloadItems } = useEntityCollection({ load: loadPositions, onError: onLoadError });
  const reload = useCallback(() => { void reloadItems(); }, [reloadItems]);

  useEffect(() => {
    void Promise.all([operationsService.listIncidents(), operationsService.listCrews(), Promise.all((["uav", "generator", "communications", "weapon_ammo"] as EquipmentCategory[]).map((category) => operationsService.listEquipment(category))), vehiclesService.list(), operationsService.listStaffingRecords(), Promise.resolve(operationsService.listPositionWork?.() ?? [])])
      .then(([nextIncidents, nextCrews, nextEquipment, nextVehicles, nextStaffing, nextWork]) => { setIncidents(nextIncidents ?? []); setCrews(nextCrews ?? []); setEquipment(nextEquipment.flatMap((group) => group ?? [])); setVehicles(nextVehicles ?? []); setStaffing(nextStaffing ?? []); setPositionWork(nextWork ?? []); })
      .catch(() => { setIncidents([]); setCrews([]); setEquipment([]); setVehicles([]); setStaffing([]); setPositionWork([]); });
  }, []);

  const filtered = useMemo(() => items.filter((item) => includes(query, item.name, item.locality, item.battleOrder, item.notes, item.condition, item.crewName)), [items, query]);
  useEffect(() => setVisibleLimit(20), [query]);
  const visibleItems = filtered.slice(0, visibleLimit);
  const onContentScroll: UIEventHandler<HTMLDivElement> = (event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 100) setVisibleLimit((current) => Math.min(current + 20, filtered.length)); };
  const positionIncidents = useMemo(() => editing ? incidents.filter((incident) => incident.positionName === editing.name) : [], [editing, incidents]);
  const edit = (item?: Position) => { setEditing(item ?? null); setDraft(item ? { ...item, uavIds: [] } : emptyDraft()); setEditorTab("overview"); setAssetTab("uav"); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); setDraft(emptyDraft()); setEditorTab("overview"); setAssetTab("uav"); };
  const savePosition = async () => { try { const payload = { ...draft, uavIds: [] }; if (editing) await operationsService.updatePosition(editing.id, payload); else await operationsService.createPosition(payload); close(); reload(); notify("Позицію збережено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти позицію.", "error"); } };
  const remove = async () => { if (!deleting) return; setDeletingBusy(true); try { await operationsService.deletePosition(deleting.id); setDeleting(null); reload(); notify("Позицію видалено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося видалити позицію.", "error"); } finally { setDeletingBusy(false); } };
  const openWork = (type: PositionWorkDraft["workType"], work?: PositionWork) => { if (!editing) return; setWorkEditing(work ?? "new"); setWorkDraft(work ? { positionId: work.positionId, workType: work.workType, status: work.status, startDate: work.startDate, startTime: work.startTime, endDate: work.endDate, endTime: work.endTime, battleOrder: work.battleOrder, notes: work.notes, personnelIds: uniquePersonnelIds(work.members), memberAssignments: work.members.map((member) => ({ assignmentId: member.assignmentId, personnelId: member.personnelId, dutyType: member.dutyType || work.workType, startDate: member.startDate || work.startDate, startTime: member.startTime || work.startTime, endDate: member.endDate || work.endDate || work.startDate, endTime: member.endTime || work.endTime })) } : { ...emptyWork(editing.id, type), battleOrder: editing.battleOrder || "" }); };
  const saveWork = async () => { const conflict = workDraft.personnelIds.find((personnelId) => allPositionPersonnelIds.has(personnelId) || !isAvailableForEditedWork(personnelId)); if (conflict) { const person = staffing.find((item) => item.personnelId === conflict); notify(`${person?.fullName || "Обрана людина"} зараз має інше місце служби або завдання. Приберіть її зі складу групи.`, "error"); return; } const invalid = invalidWorkMessage(workDraft); if (invalid) { notify(invalid, "error"); return; } try { await operationsService.savePositionWork(workEditing === "new" ? null : workEditing?.id ?? null, workDraft); const next = await operationsService.listPositionWork(); setPositionWork(next); setStaffing(await operationsService.listStaffingRecords()); setWorkEditing(null); await reloadItems(); notify("Роботи на позиції збережено та БЧС оновлено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти роботи на позиції.", "error"); } };
  const removeWork = async (id: number) => { try { await operationsService.deletePositionWork(id); setPositionWork(await operationsService.listPositionWork()); setStaffing(await operationsService.listStaffingRecords()); await reloadItems(); notify("Запис робіт видалено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося видалити запис робіт.", "error"); } };
  const openSetup = () => { setSetupMode(items.length ? "existing" : "new"); setSetupPositionId(""); setSetupPositionDraft(emptyDraft()); setSetupWorkDraft(emptyWork(0, "Облаштування")); setSetupRotationHours(2); setSetupOpen(true); };
  const closeSetup = () => { if (setupBusy) return; setSetupOpen(false); setSetupPositionId(""); };
  const chooseSetupPosition = (value: string) => { const position = items.find((item) => item.id === Number(value)); setSetupPositionId(value); setSetupWorkDraft((current) => ({ ...current, positionId: position?.id ?? 0, battleOrder: position?.battleOrder || "" })); };

  const storedPlan = flightPlanSnapshot();
  const planIsCurrent = Boolean(storedPlan.date) && flightPlanDateMatches(new Date().toLocaleDateString("sv-SE"));
  const onPositionCrewIds = planIsCurrent ? flightPlanActiveCrewIds() : new Set<number>();
  const editingCrews = editing ? crews.filter((crew) => crew.positionId === editing.id) : [];
  const activePositionCrews = editingCrews.filter((crew) => onPositionCrewIds.has(crew.id));
  const activeCrewIds = new Set(activePositionCrews.map((crew) => crew.id));
  const activePersonnelIds = new Set(activePositionCrews.flatMap((crew) => (crew.actualMembers ?? []).map((member) => member.personnelId)));
  const exactActivePersonnelIds = planIsCurrent ? flightPlanActiveMemberIds() : new Set<number>();
  const storedPlanEntries = planIsCurrent ? storedPlan.entries : undefined;
  const allPositionPersonnelIds = new Set([
    ...exactActivePersonnelIds,
    ...crews
      .filter((crew) => onPositionCrewIds.has(crew.id) && !storedPlanEntries?.[crew.id])
      .flatMap((crew) => (crew.actualMembers ?? []).map((member) => member.personnelId)),
  ]);
  const editingWork = editing ? positionWork.filter((work) => work.positionId === editing.id) : [];
  const originalWorkPersonnelIds = new Set(workEditing && workEditing !== "new" ? workEditing.members.map((member) => member.personnelId) : []);
  const isAvailableForEditedWork = (personnelId: number) => { const person = staffing.find((item) => item.personnelId === personnelId); if (!person) return false; const location = person.currentLocation.trim(); const completedOriginal = workEditing && workEditing !== "new" && workEditing.status === "Завершили" && originalWorkPersonnelIds.has(personnelId); return isAvailableForPositionWork(location) || completedOriginal || (originalWorkPersonnelIds.has(personnelId) && ["Реко", "Облаштування", "Реко та облаштування"].includes(location)); };
  const availableStaffingWorkPeople: PositionWorkPerson[] = staffing.filter((person) => person.personnelId > 0 && (
    originalWorkPersonnelIds.has(person.personnelId)
    || (!allPositionPersonnelIds.has(person.personnelId) && isAvailableForEditedWork(person.personnelId))
  ));
  const missingOriginalWorkPeople: PositionWorkPerson[] = workEditing && workEditing !== "new"
    ? [...new Map(workEditing.members.filter((member) => !staffing.some((person) => person.personnelId === member.personnelId)).map((member) => [member.personnelId, member])).values()].map((member) => ({ personnelId: member.personnelId, fullName: member.fullName, rank: member.rank, position: "Запис відсутній у БЧС" }))
    : [];
  const availableWorkPeople = [...availableStaffingWorkPeople, ...missingOriginalWorkPeople];
  const availableSetupPeople = staffing.filter((person) => person.personnelId > 0 && !allPositionPersonnelIds.has(person.personnelId) && isAvailableForPositionWork(person.currentLocation));
  const updateSetupWorkDraft = (next: PositionWorkDraft) => setSetupWorkDraft((current) => {
    const scheduleBasisChanged = current.startDate !== next.startDate || current.startTime !== next.startTime || current.workType !== next.workType;
    return scheduleBasisChanged && next.personnelIds.length ? rotatingWorkDraft(next, next.personnelIds, setupRotationHours) : next;
  });
  const updateSetupRotationHours = (hours: number) => { setSetupRotationHours(hours); setSetupWorkDraft((current) => rotatingWorkDraft(current, current.personnelIds, hours)); };
  const saveSetup = async () => {
    const position = setupMode === "existing" ? items.find((item) => item.id === Number(setupPositionId)) : null;
    if (setupMode === "existing" && !position) { notify("Оберіть позицію для облаштування.", "error"); return; }
    if (setupMode === "new" && !setupPositionDraft.name.trim()) { notify("Вкажіть назву нової позиції.", "error"); return; }
    if (setupMode === "new" && [setupPositionDraft.battleOrder, setupPositionDraft.stripName, setupPositionDraft.locality, setupPositionDraft.mgrs, setupPositionDraft.suitableUavText].some((value) => !value.trim())) { notify("Для нової позиції вкажіть БРО, смугу роботи, населений пункт, координати MGRS та придатні БпЛА / БпАК.", "error"); return; }
    const conflict = setupWorkDraft.personnelIds.find((personnelId) => !availableSetupPeople.some((person) => person.personnelId === personnelId));
    if (conflict) { const person = staffing.find((item) => item.personnelId === conflict); notify(`${person?.fullName || "Обрана людина"} більше не є вільною для цього завдання.`, "error"); return; }
    const invalid = invalidWorkMessage(setupWorkDraft); if (invalid) { notify(invalid, "error"); return; }
    setSetupBusy(true);
    let createdPositionId: number | null = null;
    try {
      let positionId: number;
      if (position) {
        positionId = position.id;
      } else {
        positionId = await operationsService.createPosition({ ...setupPositionDraft, crewId: null, isActive: false, uavIds: [] });
        createdPositionId = positionId;
      }
      await operationsService.savePositionWork(null, { ...setupWorkDraft, positionId });
      const [nextWork, nextStaffing] = await Promise.all([operationsService.listPositionWork(), operationsService.listStaffingRecords()]);
      setPositionWork(nextWork); setStaffing(nextStaffing); await reloadItems(); setSetupOpen(false);
      notify("Облаштування позиції розпочато, склад групи передано до БЧС.", "success");
    } catch (error) {
      let rollbackFailed = false;
      if (createdPositionId != null) {
        try { await operationsService.deletePosition(createdPositionId); }
        catch { rollbackFailed = true; }
      }
      const message = typeof error === "string" ? error : "Не вдалося розпочати облаштування позиції.";
      notify(rollbackFailed ? `${message} Нову позицію створено, але автоматичне скасування не вдалося.` : message, "error");
    }
    finally { setSetupBusy(false); }
  };
  const positionEquipment = equipment.filter((item) => Boolean(item.crewId && activeCrewIds.has(item.crewId)) || Boolean(item.personnelId && activePersonnelIds.has(item.personnelId)));
  const positionVehicles = vehicles.filter((item) => Boolean(item.crewId && activeCrewIds.has(item.crewId)) || Boolean(item.personnelId && activePersonnelIds.has(item.personnelId)));
  const assetsForTab = assetTab === "vehicles" ? positionVehicles : positionEquipment.filter((item) => item.category === assetTab);
  const assetCount = (tab: PositionAssetTab) => tab === "vehicles" ? positionVehicles.length : positionEquipment.filter((item) => item.category === tab).length;
  return <PageFrame className="positions-page" onContentScroll={onContentScroll} footer={<div className="panel pagination card-registry__pagination">Показано {visibleItems.length} із {filtered.length}</div>} header={<PageTitle title="Позиції" subtitle="Робочі райони, прив’язані екіпажі та готовність позицій" actions={<><button className="button" disabled={isLoading} onClick={openSetup}><Hammer />Облаштувати позицію</button><button className="button primary" onClick={() => edit()}><Plus />Додати позицію</button></>} />} tools={<RegistryToolbar className="card-registry-toolbar" placeholder="Пошук за назвою, районом, БРО або екіпажем…" query={query} onQueryChange={setQuery} />}>
    <EntityCardGrid className="positions-grid">{visibleItems.map((item) => { const positionCrews = crews.filter((crew) => crew.positionId === item.id).sort((left, right) => Number(onPositionCrewIds.has(right.id)) - Number(onPositionCrewIds.has(left.id))); const visibleCrews = positionCrews.slice(0, 2); const hiddenCrewCount = positionCrews.length - visibleCrews.length; const hasCrewOnPosition = positionCrews.some((crew) => onPositionCrewIds.has(crew.id)); return <EntityCard className={`position-card position-card--${positionTypeClass(item.positionType)}`} key={item.id} role="button" tabIndex={0} aria-label={`Відкрити позицію ${item.name}`} onClick={() => edit(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); edit(item); } }}>
      <header><span className="position-card__icon"><Crosshair /></span><div><small>Позиція</small><h2>{item.name}</h2></div><div className="position-card__indicators"><span className="position-card__type">{item.positionType}</span>{hasCrewOnPosition && <span className="on-position-indicator">На позиції</span>}</div></header>
      <div className="position-card__chips position-card__meta">
        {item.battleOrder && <span className="position-card__chip">{item.battleOrder}</span>}
        <span className="position-card__chip"><MapPin />{item.locality || "Населений пункт не вказано"}</span>
      </div>
      <div className="position-card__chips position-card__crews">{visibleCrews.length ? visibleCrews.map((crew) => <span title={`${crew.name} · ${crew.status} · фактично ${crew.workingStrength} із ${crew.officialStrength}`} key={crew.id} className={`position-card__chip position-card__crew ${onPositionCrewIds.has(crew.id) ? "is-on-position" : ""}`}><UsersRound />{crew.name}</span>) : <span className="position-card__chip position-card__crew is-empty"><UsersRound />Екіпаж не закріплений</span>}{hiddenCrewCount > 0 && <span className="position-card__chip position-card__more" title={positionCrews.slice(2).map((crew) => crew.name).join(", ")}>+{hiddenCrewCount}</span>}</div>
    </EntityCard>; })}</EntityCardGrid>
    {isLoading && <div className="operations-loading-overlay"><CardGridSkeleton variant="position" /></div>}

    {open && <Modal title={editing ? editing.name : "Нова позиція"} subtitle={editing ? editing.locality || "Район не вказано" : "Створення нової позиції"} onClose={close} className="position-editor"><div className="position-editor__body">
      <nav className="entity-tabs" aria-label="Розділи картки позиції"><button className={editorTab === "overview" ? "active" : ""} onClick={() => setEditorTab("overview")}>Огляд</button><button className={editorTab === "relations" ? "active" : ""} disabled={!editing} onClick={() => setEditorTab("relations")}>Екіпажі і майно</button><button className={editorTab === "history" ? "active" : ""} disabled={!editing} onClick={() => setEditorTab("history")}>Історія <b>{positionIncidents.length}</b></button></nav>
      {editorTab === "overview" && <div className="position-overview"><div className="operation-editor__body position-editor__form"><label className="form-field"><span>Назва <b>*</b></span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="form-field"><span>БРО</span><input value={draft.battleOrder} onChange={(event) => setDraft({ ...draft, battleOrder: event.target.value })} /></label><label className="form-field"><span>Населений пункт / район</span><input value={draft.locality} onChange={(event) => setDraft({ ...draft, locality: event.target.value })} /></label><label className="form-field form-field--wide"><span>Орієнтовні координати MGRS</span><input value={draft.mgrs} onChange={(event) => setDraft({ ...draft, mgrs: event.target.value })} placeholder="36U UV 12000 67000" /><small>Останні три цифри двох п’ятизначних груп зберігаються як 000.</small></label><label className="form-field form-field--wide"><span>Опис позиції</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Особливості позиції, під’їзду, маскування та роботи…" /></label></div>{editing && <section className="position-work-panel"><header><div><b>Роботи на позиції</b><small>Групи автоматично змінюють місце людей у БЧС і потрапляють у підсумкове донесення.</small></div><div><button className="button" onClick={() => openWork("Рекогностування")}><Route />Провести рекогностування</button><button className="button" onClick={() => openWork("Облаштування")}><Hammer />Провести облаштування</button></div></header>{editingWork.length ? <div className="position-work-list">{editingWork.map((work) => <article key={work.id}><span className={`position-work-type ${work.status === "Завершили" ? "is-done" : ""}`}>{work.workType}</span><div><b>{work.status} · {displayWorkDate(work.startDate)} {work.startTime}</b><small>{[...new Set(work.members.map((member) => member.fullName))].join(", ")} · {work.members.length} періодів</small></div><button className="icon-button" type="button" title="Редагувати роботи" aria-label={`Редагувати роботи: ${work.workType}, ${displayWorkDate(work.startDate)} ${work.startTime}`} onClick={() => openWork(work.workType, work)}><Pencil /></button><button className="icon-button danger" type="button" title="Видалити роботи" aria-label={`Видалити роботи: ${work.workType}, ${displayWorkDate(work.startDate)} ${work.startTime}`} onClick={() => void removeWork(work.id)}><Trash2 /></button></article>)}</div> : <div className="position-relation-empty">Рекогностування або облаштування ще не проводились.</div>}</section>}</div>}
      {editorTab === "relations" && <section className="position-relations">
        <article className="position-relation-group"><header><div><UsersRound /><span><b>Екіпажі</b><small>{editingCrews.length} закріплено</small></span></div></header><div className="position-relation-list">{editingCrews.map((crew) => { const primaryUav = equipment.find((asset) => asset.id === crew.primaryUavId); return <div className={`position-relation-item ${onPositionCrewIds.has(crew.id) ? "is-on-position" : ""}`} key={crew.id}><div><b>{crew.name}</b><small>Статус: {crew.status}</small><em>Основний БпЛА: {primaryUav?.name || crew.uavName || "не обрано"} · Смуга: {crew.sector || "не вказана"}</em></div>{onPositionCrewIds.has(crew.id) && <span className="on-position-indicator">На позиції</span>}</div>; })}{!editingCrews.length && <div className="position-relation-empty">Екіпажі не закріплені. Прив’язка змінюється у картці екіпажу.</div>}</div></article>
        <article className="position-relation-group"><header><div><PackageOpen /><span><b>Майно на позиції</b><small>{positionEquipment.length + positionVehicles.length} одиниць</small></span></div><nav className="position-asset-tabs" aria-label="Категорії майна на позиції"><button className={assetTab === "uav" ? "active" : ""} title="БпЛА та БпАК" aria-label={`БпЛА та БпАК: ${assetCount("uav")}`} onClick={() => setAssetTab("uav")}><Plane /><b>{assetCount("uav")}</b></button><button className={assetTab === "vehicles" ? "active" : ""} title="Автомобілі" aria-label={`Автомобілі: ${assetCount("vehicles")}`} onClick={() => setAssetTab("vehicles")}><Car /><b>{assetCount("vehicles")}</b></button><button className={assetTab === "generator" ? "active" : ""} title="Генератори" aria-label={`Генератори: ${assetCount("generator")}`} onClick={() => setAssetTab("generator")}><Zap /><b>{assetCount("generator")}</b></button><button className={assetTab === "communications" ? "active" : ""} title="Зв’язок" aria-label={`Зв’язок: ${assetCount("communications")}`} onClick={() => setAssetTab("communications")}><Radio /><b>{assetCount("communications")}</b></button><button className={assetTab === "weapon_ammo" ? "active" : ""} title="Зброя та БК" aria-label={`Зброя та БК: ${assetCount("weapon_ammo")}`} onClick={() => setAssetTab("weapon_ammo")}><Shield /><b>{assetCount("weapon_ammo")}</b></button></nav></header><div className="position-relation-list">{assetsForTab.map((asset) => "registrationNumber" in asset ? <div className="position-relation-item" key={`vehicle-${asset.id}`}><div><b>{asset.name}</b><small>{asset.registrationNumber || "без номера"} · {asset.status}</small><em>{asset.crewName || asset.driverName || "екіпаж не вказано"}</em></div></div> : <div className="position-relation-item" key={`equipment-${asset.id}`}><div><b>{asset.name}</b><small>{asset.inventoryNumber || "без номера"} · {asset.status} · {asset.totalQuantity} шт</small><em>{asset.crewName || asset.holderName || equipmentCategoryLabels[asset.category]}</em></div></div>)}{!activePositionCrews.length && <div className="position-relation-empty">За планом польотів на цій позиції зараз немає екіпажу.</div>}{activePositionCrews.length > 0 && !assetsForTab.length && <div className="position-relation-empty">У вибраній категорії майна немає.</div>}</div></article>
      </section>}
      {editorTab === "history" && <section className="position-history">{positionIncidents.length ? positionIncidents.map((incident) => { const occurred = incidentDateTimeParts(incident.occurredAt); return <article key={incident.id}><Clock3 /><div><b>{incident.incidentType}</b><span>{occurred.date} · {occurred.time} · {incident.crewName || "екіпаж не вказано"}</span><p>{incident.description || "Без опису"}</p></div></article>; }) : <div className="position-history__empty"><Clock3 /><b>Історія порожня</b><span>Інциденти на цій позиції з’являться тут автоматично.</span></div>}</section>}
    </div><footer className="modal-actions position-editor__actions">{editing && <button className="button danger" onClick={() => { setDeleting(editing); setOpen(false); }}><Trash2 />Видалити позицію</button>}<button className="button" onClick={close}>Скасувати</button><button className="button primary" onClick={() => void savePosition()}>Зберегти позицію</button></footer></Modal>}
      {setupOpen && <Modal title="Облаштування позиції" subtitle="Створіть нову позицію або переведіть наявну в облаштування" onClose={closeSetup} className="position-setup-modal"><div className="position-setup-modal__body"><section className="position-setup-target"><header><div><b>Позиція</b><small>Екіпаж на цьому етапі не закріплюється.</small></div></header><div className="form-field"><span>Що облаштовуємо</span><Select ariaLabel="Вибір нової або наявної позиції" value={setupMode} onChange={(value) => { const mode = value as SetupPositionMode; setSetupMode(mode); setSetupPositionId(""); setSetupPositionDraft(emptyDraft()); setSetupWorkDraft(emptyWork(0, "Облаштування")); setSetupRotationHours(2); }} options={[{ value: "existing", label: "Наявну позицію" }, { value: "new", label: "Нову позицію" }]} /></div>{setupMode === "existing" ? <div className="form-field"><span>Позиція <b>*</b></span><Select ariaLabel="Позиція для облаштування" value={setupPositionId} onChange={chooseSetupPosition} options={[{ value: "", label: "Оберіть позицію" }, ...items.map((item) => ({ value: String(item.id), label: `${item.name}${item.locality ? ` · ${item.locality}` : ""}` }))]} /></div> : <SetupPositionFields draft={setupPositionDraft} onChange={setSetupPositionDraft} onBattleOrderChange={(battleOrder) => { setSetupPositionDraft({ ...setupPositionDraft, battleOrder }); setSetupWorkDraft({ ...setupWorkDraft, battleOrder }); }} />}</section><section className="position-setup-work"><header><div><b>Подія та графік групи</b><small>Після вибору людей програма створить кожному неперетинні періоди робіт та охорони.</small></div></header><div className="position-work-modal__body"><PositionWorkFields draft={setupWorkDraft} onChange={updateSetupWorkDraft} /><PositionWorkPeople draft={setupWorkDraft} people={availableSetupPeople} onChange={setSetupWorkDraft} automaticRotationHours={setupRotationHours} onAutomaticRotationHoursChange={updateSetupRotationHours} /></div></section></div><footer className="modal-actions"><button className="button" disabled={setupBusy} onClick={closeSetup}>Скасувати</button><button className="button primary" disabled={setupBusy} onClick={() => void saveSetup()}><Hammer />{setupBusy ? "Збереження…" : "Розпочати роботи"}</button></footer></Modal>}
    {workEditing && <Modal title={workDraft.workType} subtitle={`Позиція «${editing?.name || ""}» · оберіть групу та фактичні періоди`} onClose={() => setWorkEditing(null)} className="position-work-modal"><div className="position-work-modal__body"><PositionWorkFields draft={workDraft} onChange={setWorkDraft} /><PositionWorkPeople draft={workDraft} people={availableWorkPeople} onChange={setWorkDraft} /></div><footer className="modal-actions"><button className="button" onClick={() => setWorkEditing(null)}>Скасувати</button><button className="button primary" onClick={() => void saveWork()}>Зберегти групу</button></footer></Modal>}
    {deleting && <ConfirmDialog title="Видалити позицію?" message={`Позицію «${deleting.name}» буде видалено. Екіпажі, які її використовують, залишаться без обраної позиції.`} confirmLabel="Видалити" onConfirm={() => void remove()} onCancel={() => setDeleting(null)} busy={deletingBusy} />}
  </PageFrame>;
}
