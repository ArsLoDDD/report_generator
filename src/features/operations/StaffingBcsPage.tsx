import { Building2, ChevronRight, ClipboardList, FileSpreadsheet, FileText, Plus, RefreshCw, Route, UsersRound } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Modal } from "../../shared/ui/Modal";
import { Select } from "../../shared/ui/Select";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { settingsService } from "../settings/services/settingsService";
import type { UnitSettings } from "../../shared/types/domain";
import { operationsService } from "./services/operationsService";
import type { Crew, StaffRecommendation, StaffingRecord } from "./types";

export const BCS_LOCATIONS = ["ПУ", "ШТАБ", "УПР", "КСП Роти", "ЗАБ", "ОХ", "ГШР", "На позиції", "ЗБЗ", "ПБЗ", "ЗХВ", "ВІДП", "НАВЧ", "ВІДР", "ЛІК", "Відкомандировані", "ОХП", "Прикомандирований", "СЗЧ", "ПТЗ Новостав", "Реко та облаштування", "Логістика на позиції"];
export const STAFF_POSITION_SLOTS = [
  "Командир роти", "Заступник командира роти", "Заступник з психологічної підтримки персоналу", "Головний сержант", "Старший технік", "Технік", "Сержант із матеріального забезпечення", "Старший бойовий медик", "Водій-електрик", "Водій",
  "Командир взводу 1", "Командир взводу 2", "Командир взводу 3", "Командир відділення 1 взводу", "Командир відділення 2 взводу", "Командир відділення 3 взводу", "Відділення збору та обробки інформації",
];
const normalizePosition = (value: string) => value.trim().toLocaleLowerCase("uk").replace(/[іїі]/gu, "і").replace(/\s+/gu, " ");

const commandWeight = (position: string) => {
  const value = position.toLocaleLowerCase("uk");
  if (value.includes("командир роти")) return 0;
  if (value.includes("заступник командира роти") || value.includes("головний сержант")) return 1;
  if (value.includes("старший технік")) return 2;
  if (value.includes("технік") || value.includes("сержант із мат")) return 3;
  if (value.includes("старший бойовий медик")) return 4;
  if (value.includes("командир взводу")) return 5;
  if (value.includes("командир відділення") || value.includes("командир екіпажу")) return 6;
  if (value.includes("оператор")) return 7;
  if (value.includes("водій-електрик")) return 8;
  if (value.includes("водій")) return 9;
  return 10;
};

const classify = (record: StaffingRecord) => {
  const position = record.position.toLocaleLowerCase("uk");
  if (record.currentLocation === "Прикомандирований") return "Прикомандировані";
  if (record.crewId || position.includes("екіпаж")) return "Екіпажі";
  if (position.includes("збору") && position.includes("оброб")) return "Відділення збору та обробки інформації";
  if (position.includes("взводу") || record.platoon.trim()) return "Управління взводів";
  return "Управління роти";
};

export function buildStaffingHierarchy(records: StaffingRecord[]) {
  const groups = new Map<string, Map<string, StaffingRecord[]>>();
  for (const record of records) {
    const section = classify(record);
    const subgroup = section === "Екіпажі" ? record.crewName || "Екіпаж без назви" : section === "Управління взводів" ? record.platoon || "Взвод не визначено" : section;
    const sectionGroups = groups.get(section) ?? new Map<string, StaffingRecord[]>();
    sectionGroups.set(subgroup, [...(sectionGroups.get(subgroup) ?? []), record].sort((a, b) => commandWeight(a.position) - commandWeight(b.position) || a.position.localeCompare(b.position, "uk")));
    groups.set(section, sectionGroups);
  }
  const order = ["Управління роти", "Управління взводів", "Відділення збору та обробки інформації", "Екіпажі", "Прикомандировані"];
  return [...groups].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([section, groups]) => ({ section, groups: [...groups].map(([name, people]) => ({ name, people })) }));
}

function PersonCard({ person }: { person: StaffingRecord; onActing?: () => void; onRecommendation?: () => void }) {
  return <article className="staff-person-card"><div className="staff-person-card__head"><span>{person.rank || "без звання"}</span>{person.actingPosition && <em>ТВО: {person.actingPosition}</em>}</div><div><b>{person.fullName}</b><p>{person.position}</p></div></article>;
}

type TransferAssignment = { personnelId: number; position: string };
function LegacyTransferModal({ records, onClose, onSave }: { records: StaffingRecord[]; onClose: () => void; onSave: (assignments: TransferAssignment[]) => Promise<void> }) {
  const [activeId, setActiveId] = useState(records[0]?.personnelId ?? 0);
  const [assignments, setAssignments] = useState<TransferAssignment[]>([]);
  const [showFree, setShowFree] = useState(false);
  const active = records.find((person) => person.personnelId === activeId);
  const occupied = new Map(records.map((person) => [normalizePosition(person.position), person]));
  const choose = (position: string) => {
    if (!active) return;
    const current = assignments.find((item) => item.personnelId === active.personnelId);
    const next = assignments.filter((item) => item.personnelId !== active.personnelId).concat({ personnelId: active.personnelId, position });
    setAssignments(next);
    const occupant = occupied.get(normalizePosition(position));
    if (occupant && occupant.personnelId !== active.personnelId && !next.some((item) => item.personnelId === occupant.personnelId)) setActiveId(occupant.personnelId);
    else if (!current) setActiveId(records.find((person) => !next.some((item) => item.personnelId === person.personnelId))?.personnelId ?? active.personnelId);
  };
  return <Modal title="Переміщення по штатних посадах" onClose={onClose} className="staff-transfer-modal"><div className="transfer-layout"><section className="transfer-source"><span className="transfer-kicker">Зараз обирається</span><h3>{active?.fullName || "—"}</h3><p>{active?.position || "—"}</p><label className="form-field"><span>Інший військовослужбовець</span><Select ariaLabel="Військовослужбовець для переміщення" value={String(activeId)} onChange={(value) => setActiveId(Number(value))} options={records.map((person) => ({ value: String(person.personnelId), label: person.fullName }))} /></label><div className="transfer-chain">{assignments.map((item) => <button key={item.personnelId} onClick={() => setActiveId(item.personnelId)}>{records.find((person) => person.personnelId === item.personnelId)?.fullName}<span>{item.position}</span></button>)}</div></section><section className="transfer-targets"><header><div><span className="transfer-kicker">Крок переміщення</span><h3>Оберіть нову посаду</h3></div><label className="switch-line"><input type="checkbox" checked={showFree} onChange={(event) => setShowFree(event.target.checked)} />Показати лише вільні</label></header><div className="position-choice-list">{STAFF_POSITION_SLOTS.filter((position) => !showFree || !occupied.has(normalizePosition(position)) || normalizePosition(position) === normalizePosition(active?.position ?? "")).map((position) => { const person = occupied.get(normalizePosition(position)); const selected = assignments.find((item) => item.personnelId === activeId)?.position === position; return <button className={`position-choice ${selected ? "selected" : ""} ${person && person.personnelId !== activeId ? "occupied" : "free"}`} key={position} onClick={() => choose(position)}><span>{person ? person.fullName : "Вільна посада"}</span><b>{position}</b><small>{person ? "Зайнята · після вибору потрібно визначити нову посаду" : "Вільна"}</small></button>; })}</div></section></div><footer className="modal-actions"><span className="transfer-summary">Підготовлено переміщень: <b>{assignments.length}</b></span><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={!assignments.length} onClick={() => void onSave(assignments)}>Застосувати ланцюжок</button></footer></Modal>;
}

void LegacyTransferModal;

function TransferModal({ records, onClose, onSave }: { records: StaffingRecord[]; onClose: () => void; onSave: (assignments: TransferAssignment[]) => Promise<void> }) {
  const [activeId, setActiveId] = useState(records[0]?.personnelId ?? 0);
  const [assignments, setAssignments] = useState<TransferAssignment[]>([]);
  const [actingByPersonnel, setActingByPersonnel] = useState<Record<number, string>>({});
  const [showFree, setShowFree] = useState(false);
  const [saving, setSaving] = useState(false);
  const active = records.find((person) => person.personnelId === activeId);
  const occupied = new Map(records.map((person) => [normalizePosition(person.position), person]));
  const activeActing = actingByPersonnel[activeId] ?? active?.actingPosition ?? "";
  const choose = (position: string) => {
    if (!active) return;
    const next = assignments.filter((item) => item.personnelId !== active.personnelId).concat({ personnelId: active.personnelId, position });
    setAssignments(next);
    const occupant = occupied.get(normalizePosition(position));
    if (occupant && occupant.personnelId !== active.personnelId && !next.some((item) => item.personnelId === occupant.personnelId)) setActiveId(occupant.personnelId);
  };
  const save = async () => {
    if (!assignments.length) return;
    setSaving(true);
    try {
      await Promise.all(Object.entries(actingByPersonnel).map(async ([personnelId, actingPosition]) => {
        const person = records.find((item) => item.personnelId === Number(personnelId));
        if (!person) return;
        const movedPosition = assignments.find((item) => item.personnelId === person.personnelId)?.position ?? person.position;
        await operationsService.updateStaffingPersonnel({ personnelId: person.personnelId, position: movedPosition, actingPosition, currentLocation: person.currentLocation, notes: person.notes });
      }));
      await onSave(assignments);
    } finally { setSaving(false); }
  };
  const choices = STAFF_POSITION_SLOTS.filter((position) => !showFree || !occupied.has(normalizePosition(position)) || normalizePosition(position) === normalizePosition(active?.position ?? ""));
  return <Modal title="Переміщення та ТВО" onClose={onClose} className="staff-transfer-modal"><div className="transfer-layout"><section className="transfer-source"><span className="transfer-kicker">Кого переміщуємо</span><label className="form-field"><span>Військовослужбовець</span><Select ariaLabel="Військовослужбовець для переміщення" value={String(activeId)} onChange={(value) => setActiveId(Number(value))} options={records.map((person) => ({ value: String(person.personnelId), label: `${person.fullName} — ${person.position}` }))} /></label>{active && <><div className="transfer-current"><b>{active.fullName}</b><span>{active.position}</span></div><label className="form-field"><span>Тимчасово виконує обов’язки</span><input value={activeActing} onChange={(event) => setActingByPersonnel((current) => ({ ...current, [active.personnelId]: event.target.value }))} placeholder="Не встановлено" /></label></>}<div className="transfer-chain">{assignments.map((item, index) => <button type="button" key={item.personnelId} onClick={() => setActiveId(item.personnelId)}><b>{index + 1}. {records.find((person) => person.personnelId === item.personnelId)?.fullName}</b><span>Нова посада: {item.position}</span></button>)}</div></section><section className="transfer-targets"><header><div><span className="transfer-kicker">Наступний крок</span><h3>Оберіть посаду</h3></div><label className="switch-line"><input type="checkbox" checked={showFree} onChange={(event) => setShowFree(event.target.checked)} />Лише вільні</label></header><div className="position-choice-list">{choices.map((position) => { const occupant = occupied.get(normalizePosition(position)); const selected = assignments.find((item) => item.personnelId === activeId)?.position === position; return <button type="button" className={`position-choice ${selected ? "selected" : ""} ${occupant && occupant.personnelId !== activeId ? "occupied" : "free"}`} key={position} onClick={() => choose(position)}><b>{position}</b><span>{occupant && occupant.personnelId !== activeId ? `Зайнята: ${occupant.fullName}` : "Вільна посада"}</span><small>{occupant && occupant.personnelId !== activeId ? "Після вибору відкриється наступний крок ланцюжка" : "Можна завершити переміщення"}</small></button>; })}</div></section></div><footer className="modal-actions"><span className="transfer-summary">У ланцюжку: <b>{assignments.length}</b></span><button className="button" onClick={onClose} disabled={saving}>Скасувати</button><button className="button primary" disabled={!assignments.length || saving} onClick={() => void save()}>{saving ? "Збереження…" : "Застосувати переміщення"}</button></footer></Modal>;
}

function VacancyRecommendationEditor({ positionName, onClose, onSaved }: { positionName: string; onClose: () => void; onSaved: (data: { positionName: string; fullName: string; phone: string; rank: string; birthDate: string; issuedAt: string; notes: string }) => Promise<void> }) {
  const [data, setData] = useState({ positionName, fullName: "", phone: "", rank: "", birthDate: "", issuedAt: new Date().toISOString().slice(0, 10), notes: "" });
  const set = (key: keyof typeof data, value: string) => setData((current) => ({ ...current, [key]: value }));
  return <Modal title={`Рекомендаційний лист · ${positionName}`} onClose={onClose} className="vacancy-recommendation-modal"><div className="operation-editor__body"><div className="vacancy-callout"><b>Вільна посада</b><span>{positionName}</span></div><label className="form-field"><span>ПІБ кандидата</span><input autoFocus value={data.fullName} onChange={(event) => set("fullName", event.target.value)} /></label><label className="form-field"><span>Телефон</span><input value={data.phone} onChange={(event) => set("phone", event.target.value)} /></label><label className="form-field"><span>Звання</span><input value={data.rank} onChange={(event) => set("rank", event.target.value)} /></label><label className="form-field"><span>Дата народження</span><input type="date" value={data.birthDate} onChange={(event) => set("birthDate", event.target.value)} /></label><label className="form-field"><span>Дата видачі</span><input type="date" value={data.issuedAt} onChange={(event) => set("issuedAt", event.target.value)} /></label><label className="form-field form-field--wide"><span>Примітка</span><textarea value={data.notes} onChange={(event) => set("notes", event.target.value)} /></label></div><footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" onClick={() => void onSaved(data)}>Зберегти лист</button></footer></Modal>;
}

function AddPeopleToSubgroupModal({ crews, records, onClose, onSaved }: { crews: Crew[]; records: StaffingRecord[]; onClose: () => void; onSaved: (crew: Crew, memberIds: number[]) => Promise<void> }) {
  const [crewId, setCrewId] = useState(String(crews[0]?.id ?? ""));
  const selectedCrew = crews.find((crew) => String(crew.id) === crewId);
  const [memberIds, setMemberIds] = useState<number[]>(selectedCrew?.members.map((member) => member.personnelId) ?? []);
  const chooseCrew = (value: string) => { const crew = crews.find((item) => String(item.id) === value); setCrewId(value); setMemberIds(crew?.members.map((member) => member.personnelId) ?? []); };
  const toggle = (personnelId: number) => setMemberIds((current) => current.includes(personnelId) ? current.filter((id) => id !== personnelId) : [...current, personnelId]);
  return <Modal title="Додати людей у підгрупу" onClose={onClose} className="subgroup-people-modal"><div className="operation-editor__body"><label className="form-field form-field--wide"><span>Підгрупа</span><Select ariaLabel="Підгрупа для складу" value={crewId} onChange={chooseCrew} options={crews.map((crew) => ({ value: String(crew.id), label: `${crew.name}${crew.platoon ? ` · ${crew.platoon}` : ""}` }))} /></label><div className="subgroup-people-list">{records.map((person) => <label key={person.personnelId}><input type="checkbox" checked={memberIds.includes(person.personnelId)} onChange={() => toggle(person.personnelId)} /><span><b>{person.fullName}</b><small>{person.rank} · {person.position}</small></span></label>)}</div></div><footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={!selectedCrew} onClick={() => selectedCrew && void onSaved(selectedCrew, memberIds)}>Зберегти склад</button></footer></Modal>;
}

function StaffEditor({ person, mode, onClose, onSaved }: { person: StaffingRecord; mode: "transfer" | "acting"; onClose: () => void; onSaved: (value: string) => Promise<void> }) {
  const [value, setValue] = useState(mode === "transfer" ? person.position : person.actingPosition);
  return <Modal title={mode === "transfer" ? `Перемістити: ${person.fullName}` : `ТВО: ${person.fullName}`} onClose={onClose} className="staffing-editor-modal"><div className="operation-editor__body"><label className="form-field form-field--wide"><span>{mode === "transfer" ? "Нова штатна посада" : "Тимчасово виконує обов’язки"}</span><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Повна назва посади" />{mode === "acting" && <small>Очистіть поле, щоб скасувати ТВО.</small>}</label></div><footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" onClick={() => void onSaved(value)}>Зберегти</button></footer></Modal>;
}

function RecommendationEditor({ person, onClose, onSaved }: { person: StaffingRecord; onClose: () => void; onSaved: (positionName: string, issuedAt: string, notes: string) => Promise<void> }) {
  const [positionName, setPositionName] = useState(person.position);
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  return <Modal title={`Рекомендаційний лист: ${person.fullName}`} onClose={onClose} className="staffing-editor-modal"><div className="operation-editor__body"><label className="form-field"><span>На посаду</span><input value={positionName} onChange={(event) => setPositionName(event.target.value)} /></label><label className="form-field"><span>Дата видачі</span><input type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} /></label><label className="form-field form-field--wide"><span>Примітка</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div><footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" onClick={() => void onSaved(positionName, issuedAt, notes)}>Зареєструвати лист</button></footer></Modal>;
}

export function StaffingBcsPage() {
  const { notify } = useNotifications();
  const [records, setRecords] = useState<StaffingRecord[]>([]);
  const [unit, setUnit] = useState<UnitSettings>({ kind: "Рота", shortName: "", authorizedStrength: 0 });
  const [recommendations, setRecommendations] = useState<StaffRecommendation[]>([]);
  const [vacancyRecommendations, setVacancyRecommendations] = useState<import("./types").VacancyRecommendation[]>([]);
  const [tab, setTab] = useState<"staff" | "bcs">("staff");
  const [editing, setEditing] = useState<{ person: StaffingRecord; mode: "transfer" | "acting" } | null>(null);
  const [recommendationFor, setRecommendationFor] = useState<StaffingRecord | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [vacancyFor, setVacancyFor] = useState<string | null>(null);
  const [subgroupOpen, setSubgroupOpen] = useState(false);
  const [subgroupName, setSubgroupName] = useState("");
  const [subgroupPlatoon, setSubgroupPlatoon] = useState("");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [crews, setCrews] = useState<Crew[]>([]);
  const reload = useCallback(async () => { const [nextRecords, nextSettings, nextRecommendations, nextVacancyRecommendations, nextCrews] = await Promise.all([operationsService.listStaffingRecords(), settingsService.get(), operationsService.listStaffRecommendations(), operationsService.listVacancyRecommendations(), operationsService.listCrews()]); setRecords(nextRecords); setUnit(nextSettings.unit ?? { kind: "Рота", shortName: "", authorizedStrength: 0 }); setRecommendations(nextRecommendations); setVacancyRecommendations(nextVacancyRecommendations); setCrews(nextCrews); }, []);
  useEffect(() => { void reload(); }, [reload]);
  const hierarchy = useMemo(() => buildStaffingHierarchy(records), [records]);
  const saveStaff = async (position: string, actingPosition: string, person = editing?.person) => { if (!person) return; try { await operationsService.updateStaffingPersonnel({ personnelId: person.personnelId, position, actingPosition, currentLocation: person.currentLocation, notes: person.notes }); setEditing(null); await reload(); notify("Штатні дані оновлено.", "success"); } catch (error) { notify(error instanceof Error ? error.message : "Не вдалося оновити штатні дані.", "error"); } };
  const saveLocation = async (person: StaffingRecord, currentLocation: string, notes = person.notes) => { try { await operationsService.updateStaffingPersonnel({ personnelId: person.personnelId, position: person.position, actingPosition: person.actingPosition, currentLocation, notes }); await reload(); } catch { notify("Не вдалося зберегти дані БЧС.", "error"); } };
  const saveRecommendation = async (person: StaffingRecord, positionName: string, issuedAt: string, notes: string) => { try { await operationsService.createStaffRecommendation({ personnelId: person.personnelId, positionName, issuedAt, notes }); setRecommendationFor(null); await reload(); notify("Рекомендаційний лист додано.", "success"); } catch (error) { notify(error instanceof Error ? error.message : "Не вдалося зберегти лист.", "error"); } };
  const saveChain = async (assignments: TransferAssignment[]) => { try { await operationsService.transferStaffingChain(assignments); setTransferOpen(false); await reload(); notify("Ланцюжок переміщень застосовано.", "success"); } catch (error) { notify(error instanceof Error ? error.message : "Не вдалося застосувати переміщення.", "error"); } };
  const saveVacancyRecommendation = async (data: { positionName: string; fullName: string; phone: string; rank: string; birthDate: string; issuedAt: string; notes: string }) => { try { await operationsService.createVacancyRecommendation(data); setVacancyFor(null); await reload(); notify("Рекомендаційний лист для вільної посади додано.", "success"); } catch (error) { notify(error instanceof Error ? error.message : "Не вдалося зберегти лист.", "error"); } };
  const createSubgroup = async () => { if (!subgroupName.trim()) return; try { await operationsService.createCrew({ name: subgroupName.trim(), platoon: subgroupPlatoon.trim(), positionName: "", reconnaissanceArea: "", unitType: "Екіпаж", companyName: unit.shortName, battleOrder: "", sector: "", officialStrength: 4, status: "Формується", uavName: "", uavType: "", functionalDuties: "", currentLocation: "", notes: "", memberIds: [] }); setSubgroupOpen(false); setSubgroupName(""); setSubgroupPlatoon(""); await reload(); notify("Підгрупу створено.", "success"); } catch (error) { notify(error instanceof Error ? error.message : "Не вдалося створити підгрупу.", "error"); } };
  const saveSubgroupPeople = async (crew: Crew, memberIds: number[]) => { try { await operationsService.updateCrew(crew.id, { name: crew.name, platoon: crew.platoon, positionName: crew.positionName, reconnaissanceArea: crew.reconnaissanceArea, unitType: crew.unitType, companyName: crew.companyName, battleOrder: crew.battleOrder, sector: crew.sector, officialStrength: crew.officialStrength, status: crew.status, uavName: crew.uavName, uavType: crew.uavType, functionalDuties: crew.functionalDuties, currentLocation: crew.currentLocation, notes: crew.notes, memberIds }); setPeopleOpen(false); await reload(); notify("Склад підгрупи оновлено.", "success"); } catch (error) { notify(error instanceof Error ? error.message : "Не вдалося оновити склад.", "error"); } };
  const availableSlots = useMemo(() => STAFF_POSITION_SLOTS.filter((slot) => !records.some((record) => normalizePosition(record.position) === normalizePosition(slot))), [records]);
  const exportBcs = async () => { try { const path = await save({ title: "Експорт БЧС", defaultPath: `БЧС ${unit.shortName || "підрозділ"}.xlsx`, filters: [{ name: "Таблиця Excel", extensions: ["xlsx"] }] }); if (!path) return; await operationsService.exportBcs(path.endsWith(".xlsx") ? path : `${path}.xlsx`, new Date(Date.now() + 86400000).toISOString().slice(0, 10)); notify("БЧС експортовано.", "success"); } catch (error) { notify(error instanceof Error ? error.message : "Не вдалося експортувати БЧС.", "error"); } };
  return <PageFrame className="staffing-page" header={<PageTitle title="Штат та БЧС" subtitle="Штат формується з посад, а БЧС — лише з актуальних даних програми" actions={<div className="staffing-actions"><button className="button" onClick={() => void reload()}><RefreshCw />Оновити</button><button className="button primary" onClick={() => setTransferOpen(true)} disabled={!records.length}><Route />Переміщення</button></div>} />} tools={<div className="staffing-tabs"><button className={tab === "staff" ? "active" : ""} onClick={() => setTab("staff")}><UsersRound />Штат</button><button className={tab === "bcs" ? "active" : ""} onClick={() => setTab("bcs")}><ClipboardList />БЧС</button></div>}>
    {tab === "staff" ? <div className="staff-tree"><section className="panel staff-overview"><Building2 /><div><b>{unit.shortName || "Підрозділ"}</b><span>{unit.kind} · за штатом {unit.authorizedStrength || "не вказано"} · за списком {records.length}</span></div><strong>{records.length}/{unit.authorizedStrength || "—"}</strong></section>{hierarchy.map((section) => <section className="panel staff-company" key={section.section}><header><Building2 /><div><h2>{section.section}</h2><span>{section.groups.reduce((sum, group) => sum + group.people.length, 0)} осіб</span></div></header><div className="staff-platoons">{section.groups.map((group) => <article key={group.name}><h3><ChevronRight />{group.name}</h3><div className="staff-people">{group.people.map((person) => <PersonCard key={person.personnelId} person={person} onActing={() => setEditing({ person, mode: "acting" })} onRecommendation={() => setRecommendationFor(person)} />)}</div></article>)}</div></section>)}<section className="panel vacancies-panel"><header><div><h2>Штатні посади</h2><p>Вільні місця видно окремо; рекомендаційний лист можна прив’язати прямо до посади.</p></div><span>{availableSlots.length} вільних</span></header><div className="vacancy-list">{STAFF_POSITION_SLOTS.map((position) => { const occupant = records.find((record) => normalizePosition(record.position) === normalizePosition(position)); const vacancy = vacancyRecommendations.find((item) => normalizePosition(item.positionName) === normalizePosition(position)); return <article className={occupant ? "filled" : "vacant"} key={position}><div><b>{position}</b>{occupant ? <span>{occupant.fullName}</span> : <em>Вільна посада</em>}</div>{vacancy && <small>Рек. лист: {vacancy.fullName} · {vacancy.issuedAt}</small>}{!occupant && <button className="button" onClick={() => setVacancyFor(position)}><FileText />Рек. лист</button>}</article>; })}</div></section><section className="panel recommendation-history"><header><FileText /><div><h2>Рекомендаційні листи</h2><p>Видано людям і кандидатам на вакантні посади.</p></div></header>{recommendations.length || vacancyRecommendations.length ? <div>{recommendations.map((item) => <article key={`person-${item.id}`}><b>{item.fullName}</b><span>{item.positionName}</span><time>{item.issuedAt}</time><small>{item.notes || "Без примітки"}</small></article>)}{vacancyRecommendations.map((item) => <article key={`vacancy-${item.id}`}><b>{item.fullName}</b><span>Вільна посада · {item.positionName}</span><time>{item.issuedAt}</time><small>{[item.rank, item.phone].filter(Boolean).join(" · ") || "Дані не вказані"}</small></article>)}</div> : <p>Рекомендаційних листів ще немає.</p>}</section></div> : <div className="bcs-board"><section className="panel bcs-toolbar"><div><b>БЧС {unit.shortName || "підрозділу"}</b><span>Станом на 08:00 · дані оновлюються з особового складу та екіпажів</span></div><div className="bcs-toolbar__actions"><button className="button" onClick={() => setSubgroupOpen(true)}><Plus />Додати підгрупу</button><button className="button primary" onClick={() => void exportBcs()}><FileSpreadsheet />Експорт БЧС</button></div></section><section className="panel bcs-table"><div className="bcs-table__scroll"><table><thead><tr>{["Підрозділи по типу","Назва позиції","БРО","Сектор роботи","Назва екіпажу","В екіпажі / штат","Статус екіпажу","БпАК","Посада по штату","Звання","П.І.Б.","Функціональні обов’язки","Де знаходиться","Примітка"].map((title) => <th key={title}>{title}</th>)}</tr></thead><tbody>{[...new Map(records.reduce((groups, record) => { const key = `${classify(record)}::${record.crewName || record.platoon || classify(record)}`; const current = groups.get(key) ?? []; groups.set(key, [...current, record]); return groups; }, new Map<string, StaffingRecord[]>())).entries()].map(([key, group]) => <Fragment key={key}><tr className="bcs-group-row"><td colSpan={14}><b>{classify(group[0])}</b><span>{group[0].crewName || group[0].platoon || "Управління"}</span><em>{group.length} осіб</em></td></tr>{group.map((record) => <tr key={record.personnelId}><td>{classify(record)}</td><td>{record.crewPositionName || "—"}</td><td>{record.battleOrder || "—"}</td><td>{record.sector || "—"}</td><td>{record.crewName || "—"}</td><td>{record.crewId ? `${record.actualStrength} / ${record.officialStrength}` : "—"}</td><td>{record.crewStatus || "—"}</td><td>{[record.uavName, record.uavType].filter(Boolean).join(" · ") || "—"}</td><td>{record.position}{record.actingPosition && <small>ТВО: {record.actingPosition}</small>}</td><td>{record.rank || "—"}</td><td><b>{record.fullName}</b></td><td>{record.functionalDuties || "—"}</td><td><Select ariaLabel={`Де знаходиться: ${record.fullName}`} value={record.currentLocation} onChange={(value) => void saveLocation(record, value)} options={[{ value: "", label: "Не вказано" }, ...BCS_LOCATIONS.map((value) => ({ value, label: value }))]} /></td><td><input aria-label={`Примітка: ${record.fullName}`} defaultValue={record.notes} onBlur={(event) => { if (event.target.value !== record.notes) void saveLocation(record, record.currentLocation, event.target.value); }} /></td></tr>)}</Fragment>)}</tbody></table></div></section><section className="bcs-totals"><article><span>За штатом</span><b>{unit.authorizedStrength || 0}</b></article><article><span>За списком</span><b>{records.length}</b></article>{BCS_LOCATIONS.map((location) => <article key={location}><span>{location}</span><b>{records.filter((record) => record.currentLocation === location).length}</b></article>)}</section></div>}
    {editing && <StaffEditor person={editing.person} mode={editing.mode} onClose={() => setEditing(null)} onSaved={(value) => saveStaff(editing.mode === "transfer" ? value : editing.person.position, editing.mode === "acting" ? value : editing.person.actingPosition)} />}
    {recommendationFor && <RecommendationEditor person={recommendationFor} onClose={() => setRecommendationFor(null)} onSaved={(positionName, issuedAt, notes) => saveRecommendation(recommendationFor, positionName, issuedAt, notes)} />}
    {transferOpen && <TransferModal records={records} onClose={() => setTransferOpen(false)} onSave={saveChain} />}
    {vacancyFor && <VacancyRecommendationEditor positionName={vacancyFor} onClose={() => setVacancyFor(null)} onSaved={saveVacancyRecommendation} />}
    {subgroupOpen && <Modal title="Нова підгрупа БЧС" onClose={() => setSubgroupOpen(false)} className="subgroup-editor-modal"><div className="operation-editor__body"><p>Підгрупа створюється як екіпаж і одразу з’являється у БЧС. Людей можна додати на сторінці екіпажів.</p><label className="form-field"><span>Назва підгрупи</span><input autoFocus value={subgroupName} onChange={(event) => setSubgroupName(event.target.value)} placeholder="Екіпаж Альфа" /></label><label className="form-field"><span>Взвод</span><input value={subgroupPlatoon} onChange={(event) => setSubgroupPlatoon(event.target.value)} placeholder="1 взвод" /></label></div><footer className="modal-actions"><button className="button" onClick={() => setSubgroupOpen(false)}>Скасувати</button><button className="button primary" onClick={() => void createSubgroup()}>Створити підгрупу</button></footer></Modal>}
    {tab === "bcs" && <button className="button bcs-add-people-button" onClick={() => setPeopleOpen(true)} disabled={!crews.length}><UsersRound />Додати людей у підгрупу</button>}
    {peopleOpen && <AddPeopleToSubgroupModal crews={crews} records={records} onClose={() => setPeopleOpen(false)} onSaved={saveSubgroupPeople} />}
  </PageFrame>;
}
