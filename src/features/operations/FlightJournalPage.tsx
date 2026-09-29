import { useCallback, useEffect, useMemo, useRef, useState, type UIEventHandler } from "react";
import { BookOpenText, FileText, Plus } from "lucide-react";
import type { CommissionTemplate } from "../../shared/types/domain";
import { CheckBox } from "../../shared/ui/CheckBox";
import { DateNavigator } from "../../shared/ui/DateNavigator";
import { Modal } from "../../shared/ui/Modal";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Select } from "../../shared/ui/Select";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import { useEntityCollection } from "../../shared/hooks/useEntityCollection";
import { settingsService } from "../settings/services/settingsService";
import { flightPlanDraftRequest, flightPlanPendingDraftRequest } from "./flight-plan-storage";
import { operationsService } from "./services/operationsService";
import { FlightJournalCard, visibleFlightNotes } from "./FlightJournalCard";
import { isStrikeUavType } from "./flight-journal-rules";
import type { Crew, Equipment, FlightJournalDraft, FlightJournalEntry, FlightPlanRequest, Position, WorkshopProduct } from "./types";

type PayloadOption = { key: string; source: "equipment" | "workshop"; id: number; name: string; serial: string };
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const emptyDraft = (): FlightJournalDraft => ({ flightDate: todayIso(), skyTime: "", groundTime: "", completionType: "", completionTime: "", crewId: null, crewName: "", positionId: null, positionName: "", battleOrder: "", workStrip: "", uavId: null, uavName: "", uavType: "", uavSerialNumber: "", mission: "", payloadSource: "", payloadId: null, payloadType: "", payloadSerialNumber: "", notes: "" });
const parsePlan = (value: string | null | undefined): FlightPlanRequest | null => { try { const parsed = value ? JSON.parse(value) as FlightPlanRequest : null; return parsed && Array.isArray(parsed.entries) ? parsed : null; } catch { return null; } };
const displayDate = (value: string) => { const [year, month, day] = value.split("-"); return year && month && day ? `${day}.${month}.${year}` : value; };
const hasOwn = (value: object | null | undefined, key: PropertyKey) => Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
export const compareFlightJournalEntriesNewestFirst = (left: FlightJournalEntry, right: FlightJournalEntry) => right.flightDate.localeCompare(left.flightDate) || right.skyTime.localeCompare(left.skyTime) || right.id - left.id;

const columns: EntityTableColumn<FlightJournalEntry>[] = [
  { key: "id", title: "№", render: (_item, index) => index + 1 },
  { key: "date", title: "Дата", render: (item) => displayDate(item.flightDate) },
  { key: "sky", title: "Небо", render: (item) => item.skyTime || "—" },
  { key: "ground", title: "Завершення", render: (item) => item.completionType ? <><b>{item.completionType}</b><small>{[item.completionDetail, item.completionTime || item.groundTime].filter(Boolean).join(" · ")}</small></> : "—" },
  { key: "crew", title: "Екіпаж", render: (item) => <b>{item.crewName}</b> },
  { key: "position", title: "Позиція", render: (item) => item.positionName || "—" },
  { key: "battle-order", title: "БрО", render: (item) => item.battleOrder || "—" },
  { key: "strip", title: "Смуга роботи", render: (item) => item.workStrip || "—" },
  { key: "uav", title: "Назва БпЛА", render: (item) => item.uavName || "—" },
  { key: "uav-type", title: "Тип БпЛА", render: (item) => item.uavType || "—" },
  { key: "uav-serial", title: "Серійний номер БпЛА", render: (item) => item.uavSerialNumber || "—" },
  { key: "mission", title: "Мета польоту", render: (item) => item.mission || "—" },
  { key: "payload", title: "Тип БК", render: (item) => item.payloadType || "—" },
  { key: "payload-serial", title: "Серійний номер БК", render: (item) => item.payloadSerialNumber || "—" },
  { key: "notes", title: "Нотатки", render: (item) => visibleFlightNotes(item.notes) || "—" },
];

export function FlightJournalPage() {
  const { notify } = useNotifications();
  const [crews, setCrews] = useState<Crew[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [uavs, setUavs] = useState<Equipment[]>([]);
  const [ammunition, setAmmunition] = useState<Equipment[]>([]);
  const [products, setProducts] = useState<WorkshopProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<FlightJournalEntry | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const [journalDate, setJournalDate] = useState(todayIso);
  const [showAllDates, setShowAllDates] = useState(false);
  const [commissions, setCommissions] = useState<CommissionTemplate[]>([]);
  const [commissionsLoaded, setCommissionsLoaded] = useState(false);
  const [apOpen, setApOpen] = useState(false);
  const [apDate, setApDate] = useState(todayIso);
  const [apSelectedIds, setApSelectedIds] = useState<Set<number>>(() => new Set());
  const [apCommissionId, setApCommissionId] = useState("");
  const [draft, setDraft] = useState<FlightJournalDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const planRequestRef = useRef(0);
  const initialDraftRef = useRef(JSON.stringify(emptyDraft()));
  const savingRef = useRef(false);
  const loadEntries = useCallback(() => operationsService.listFlightJournalEntries(), []);
  const onLoadError = useCallback(() => notify("Не вдалося завантажити журнал польотів.", "error"), [notify]);
  const { items, isLoading, reload } = useEntityCollection({ load: loadEntries, onError: onLoadError });

  useEffect(() => { void Promise.all([operationsService.listCrews(), operationsService.listPositions(), operationsService.listEquipment("uav"), operationsService.listEquipment("weapon_ammo"), operationsService.listWorkshopProducts()]).then(([nextCrews, nextPositions, nextUavs, nextAmmunition, nextProducts]) => { setCrews(nextCrews); setPositions(nextPositions); setUavs(nextUavs); setAmmunition(nextAmmunition); setProducts(nextProducts); }).catch(() => notify("Не вдалося завантажити довідники журналу.", "error")); }, [notify]);
  useEffect(() => {
    let active = true;
    void settingsService.get().then((settings) => {
      if (!active) return;
      const nextCommissions = settings?.commissionTemplates ?? [];
      setCommissions(nextCommissions);
      setApCommissionId((current) => nextCommissions.some((commission) => commission.id === current) ? current : nextCommissions[0]?.id ?? "");
    }).catch(() => {
      if (active) notify("Не вдалося завантажити комісії з налаштувань.", "error");
    }).finally(() => { if (active) setCommissionsLoaded(true); });
    return () => { active = false; };
  }, [notify]);

  const payloadOptions = useMemo<PayloadOption[]>(() => [
    ...ammunition.filter((item) => item.weaponKind === "ammunition").map((item) => ({ key: `equipment:${item.id}`, source: "equipment" as const, id: item.id, name: item.name, serial: item.inventoryNumber })),
    ...products.map((item) => ({ key: `workshop:${item.id}`, source: "workshop" as const, id: item.id, name: item.name, serial: "" })),
  ], [ammunition, products]);

  const chooseCrew = async (value: string) => {
    const crew = crews.find((item) => item.id === Number(value));
    const requestId = ++planRequestRef.current;
    if (!crew) { setDraft((current) => ({ ...emptyDraft(), flightDate: current.flightDate })); return; }
    const requestedDate = draft.flightDate;
    setDraft((current) => current.flightDate === requestedDate ? { ...current, crewId: crew.id, crewName: crew.name } : current);
    const storedSnapshot = await operationsService.getFlightPlanSnapshot(requestedDate).catch(() => null);
    if (requestId !== planRequestRef.current) return;
    const plan: FlightPlanRequest | null = flightPlanPendingDraftRequest(requestedDate) ?? parsePlan(storedSnapshot) ?? flightPlanDraftRequest(requestedDate);
    const planEntry = plan?.entries.find((entry) => entry.crewId === crew.id);
    const currentPosition = positions.find((item) => item.id === crew.positionId);
    const hasPlannedPositionId = hasOwn(planEntry, "positionId");
    const plannedPositionId = hasPlannedPositionId ? planEntry?.positionId ?? null : currentPosition?.id ?? crew.positionId;
    const hasPlannedUavs = hasOwn(planEntry, "uavSelections");
    const selectedUavId = hasPlannedUavs ? planEntry?.uavSelections?.[0]?.equipmentId ?? null : crew.primaryUavId ?? uavs.find((item) => item.crewId === crew.id)?.id ?? null;
    const uav = uavs.find((item) => item.id === selectedUavId);
    const hasUavSnapshots = hasOwn(planEntry, "uavSnapshots");
    const uavSnapshot = planEntry?.uavSnapshots?.find((item) => item.equipmentId === selectedUavId) ?? planEntry?.uavSnapshots?.[0];
    const payloadKey = planEntry?.payloadSelection ? `${planEntry.payloadSelection.sourceType}:${planEntry.payloadSelection.sourceId}` : "";
    const payload = payloadOptions.find((item) => item.key === payloadKey);
    setDraft((current) => requestId !== planRequestRef.current || current.flightDate !== requestedDate ? current : ({
      ...current,
      crewId: crew.id,
      crewName: hasOwn(planEntry, "crewName") ? planEntry?.crewName ?? "" : crew.name,
      positionId: plannedPositionId,
      positionName: hasOwn(planEntry, "positionName") ? planEntry?.positionName ?? "" : currentPosition?.name || crew.positionName,
      battleOrder: hasOwn(planEntry, "battleOrder") ? planEntry?.battleOrder ?? "" : currentPosition?.battleOrder || crew.battleOrder,
      workStrip: hasOwn(planEntry, "workStrip") ? planEntry?.workStrip ?? "" : crew.sector,
      mission: planEntry?.task || current.mission,
      uavId: selectedUavId,
      uavName: hasUavSnapshots ? uavSnapshot?.name ?? "" : uav?.name || crew.uavName,
      uavType: hasOwn(planEntry, "crewUavType") ? planEntry?.crewUavType ?? "" : uav?.uavType || crew.uavType,
      uavSerialNumber: hasUavSnapshots ? uavSnapshot?.serialNumber ?? "" : uav?.inventoryNumber || "",
      payloadSource: isStrikeUavType(hasOwn(planEntry, "crewUavType") ? planEntry?.crewUavType ?? "" : uav?.uavType || crew.uavType) ? payload?.source || "" : "",
      payloadId: isStrikeUavType(hasOwn(planEntry, "crewUavType") ? planEntry?.crewUavType ?? "" : uav?.uavType || crew.uavType) ? payload?.id ?? null : null,
      payloadType: isStrikeUavType(hasOwn(planEntry, "crewUavType") ? planEntry?.crewUavType ?? "" : uav?.uavType || crew.uavType) ? payload?.name || "" : "",
      payloadSerialNumber: isStrikeUavType(hasOwn(planEntry, "crewUavType") ? planEntry?.crewUavType ?? "" : uav?.uavType || crew.uavType) ? payload?.serial || "" : "",
    }));
  };
  const choosePosition = (value: string) => { const position = positions.find((item) => item.id === Number(value)); setDraft((current) => ({ ...current, positionId: position?.id ?? null, positionName: position?.name ?? "", battleOrder: position?.battleOrder ?? current.battleOrder })); };
  const chooseUav = (value: string) => { const uav = uavs.find((item) => item.id === Number(value)); const strike = isStrikeUavType(uav?.uavType ?? ""); setDraft((current) => ({ ...current, uavId: uav?.id ?? null, uavName: uav?.name ?? "", uavType: uav?.uavType ?? "", uavSerialNumber: uav?.inventoryNumber ?? "", ...strike ? {} : { payloadSource: "", payloadId: null, payloadType: "", payloadSerialNumber: "" } })); };
  const choosePayload = (value: string) => { const payload = payloadOptions.find((item) => item.key === value); setDraft((current) => ({ ...current, payloadSource: payload?.source ?? "", payloadId: payload?.id ?? null, payloadType: payload?.name ?? "", payloadSerialNumber: payload?.serial ?? "" })); };
  const dismissEditor = () => { planRequestRef.current += 1; setOpen(false); setDraft(emptyDraft()); setSaving(false); savingRef.current = false; };
  const openEditor = () => { const next = emptyDraft(); planRequestRef.current += 1; initialDraftRef.current = JSON.stringify(next); setDraft(next); setOpen(true); };
  const save = async () => {
    if (savingRef.current) return false;
    if (!draft.crewName.trim()) { notify("Оберіть екіпаж.", "error"); return false; }
    const strike = isStrikeUavType(draft.uavType);
    const persistedDraft = {
      ...draft,
      flightDate: todayIso(),
      skyTime: "",
      groundTime: "",
      completionType: "",
      completionTime: "",
      positionId: positions.some((item) => item.id === draft.positionId) ? draft.positionId : null,
      uavId: uavs.some((item) => item.id === draft.uavId) ? draft.uavId : null,
      ...strike ? {} : { payloadSource: "", payloadId: null, payloadType: "", payloadSerialNumber: "" },
    };
    savingRef.current = true; setSaving(true);
    try { await operationsService.createFlightJournalEntry(persistedDraft); dismissEditor(); await reload(); notify("Запис журналу польотів збережено.", "success"); return true; } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти запис.", "error"); return false; } finally { savingRef.current = false; setSaving(false); }
  };
  const closeAndSave = () => {
    if (savingRef.current) return;
    if (JSON.stringify(draft) === initialDraftRef.current) { dismissEditor(); return; }
    void save();
  };
  const filteredItems = useMemo(() => (showAllDates ? [...items] : items.filter((item) => item.flightDate === journalDate)).sort(compareFlightJournalEntriesNewestFirst), [items, journalDate, showAllDates]);
  const visibleItems = filteredItems.slice(0, visibleLimit);
  const selectJournalDate = (value: string) => { if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return; setJournalDate(value); setShowAllDates(false); setVisibleLimit(20); setSelected(null); };
  const showAllJournalEntries = () => { setShowAllDates((current) => !current); setVisibleLimit(20); setSelected(null); };
  const onScroll: UIEventHandler<HTMLDivElement> = (event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 100) setVisibleLimit((current) => Math.min(current + 20, filteredItems.length)); };

  const apEntries = useMemo(() => items.filter((item) => item.flightDate === apDate && item.skyTime), [apDate, items]);
  const apSelectedEntries = useMemo(() => apEntries.filter((item) => apSelectedIds.has(item.id)), [apEntries, apSelectedIds]);
  const apCommission = commissions.find((commission) => commission.id === apCommissionId) ?? null;
  const openApPreview = () => {
    if (isLoading) return;
    const nextDate = journalDate;
    setApDate(nextDate);
    setApSelectedIds(new Set(items.filter((item) => item.flightDate === nextDate && item.skyTime).map((item) => item.id)));
    setApCommissionId((current) => commissions.some((commission) => commission.id === current) ? current : commissions[0]?.id ?? "");
    setApOpen(true);
  };
  const selectApDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return;
    setApDate(value);
    setApSelectedIds(new Set(items.filter((item) => item.flightDate === value && item.skyTime).map((item) => item.id)));
  };
  const toggleApEntry = (id: number) => setApSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllApEntries = () => setApSelectedIds((current) => apEntries.length > 0 && apEntries.every((entry) => current.has(entry.id)) ? new Set() : new Set(apEntries.map((entry) => entry.id)));
  const selectedCrewCount = new Set(apSelectedEntries.map((entry) => entry.crewName.trim()).filter(Boolean)).size;
  const selectedUavCount = new Set(apSelectedEntries.map((entry) => `${entry.uavId ?? "snapshot"}:${entry.uavSerialNumber || entry.uavName}`).filter((value) => !value.endsWith(":"))).size;
  const progressFlight = async (entry: FlightJournalEntry, eventType: "Небо" | "Земля" | "Втрата" | "Відпрацювання", eventTime: string, completionDetail: string) => {
    try {
      await operationsService.updateFlightJournalProgress(entry.id, eventType, eventTime, completionDetail);
      setSelected((current) => current?.id === entry.id ? eventType === "Небо"
        ? { ...current, skyTime: eventTime }
        : { ...current, groundTime: eventType === "Земля" ? eventTime : "", completionType: eventType, completionTime: eventTime, completionDetail } : current);
      await reload();
      notify(eventType === "Небо" ? "Час «Небо» зафіксовано." : `Політ завершено: ${eventType.toLocaleLowerCase("uk")}.`, "success");
    } catch (error) { notify(typeof error === "string" ? error : "Не вдалося оновити політ.", "error"); }
  };

  return <PageFrame className="flight-journal-page" header={<PageTitle title="Журнал польотів" subtitle="Фактичні польоти екіпажів із даними БпЛА та БК" actions={<><button className="button" onClick={openApPreview} disabled={isLoading}><FileText />{isLoading ? "Завантаження…" : "Сформувати АП"}</button><button className="button primary" onClick={openEditor}><Plus />Додати</button></>} />} tools={<div className="flight-journal-toolbar"><DateNavigator ariaLabel="Фільтр журналу за датою" dateLabel="Дата польоту" value={journalDate} onChange={selectJournalDate} allTime={{ active: showAllDates, onSelect: showAllJournalEntries }} /></div>}>
    <section className="panel operation-table data-table flight-journal-table"><EntityTable className="operation-table__table" items={visibleItems} columns={columns} rowKey={(item) => item.id} numberBy={false} selectedKey={selected?.id} onSelect={setSelected} onScroll={onScroll} emptyState={<div className="personnel-state"><BookOpenText /><b>{showAllDates ? "Записів польотів ще немає" : `За ${displayDate(journalDate)} польотів немає`}</b><span>Створіть запис для екіпажу, а фактичні події «Небо» та завершення внесіть у картці польоту.</span></div>} /><div className="pagination">Показано {visibleItems.length} із {filteredItems.length}</div></section>
    {open && <Modal title="Новий запис польоту" subtitle="Поля з плану та картки екіпажу можна змінити перед збереженням." onClose={closeAndSave} className="flight-journal-editor"><div className="operation-editor__body">
      <label className="form-field"><span>Дата <b>*</b></span><input aria-label="Дата польоту" type="date" value={draft.flightDate} readOnly /><small>Поточна дата встановлюється автоматично.</small></label>
      <label className="form-field"><span>Екіпаж <b>*</b></span><Select ariaLabel="Екіпаж польоту" value={draft.crewId?.toString() ?? ""} onChange={(value)=>{void chooseCrew(value);}} options={[{ value: "", label: "Оберіть екіпаж" }, ...crews.map((crew) => ({ value: String(crew.id), label: crew.name }))]} /></label>
      <label className="form-field"><span>Позиція</span><Select ariaLabel="Позиція польоту" value={draft.positionId?.toString() ?? ""} onChange={choosePosition} options={[{ value: "", label: "Не обрана" }, ...draft.positionId != null && !positions.some((item) => item.id === draft.positionId) ? [{ value: String(draft.positionId), label: `${draft.positionName || `Позиція №${draft.positionId}`} · зі знімка` }] : [], ...positions.map((position) => ({ value: String(position.id), label: position.name }))]} /></label>
      <label className="form-field"><span>БрО</span><input value={draft.battleOrder} onChange={(event) => setDraft({ ...draft, battleOrder: event.target.value })} /></label>
      <label className="form-field form-field--wide"><span>Смуга роботи</span><input value={draft.workStrip} onChange={(event) => setDraft({ ...draft, workStrip: event.target.value })} /></label>
      <label className="form-field"><span>Назва БпЛА</span><Select ariaLabel="БпЛА польоту" value={draft.uavId?.toString() ?? ""} onChange={chooseUav} options={[{ value: "", label: "Не обрано" }, ...draft.uavId != null && !uavs.some((item) => item.id === draft.uavId) ? [{ value: String(draft.uavId), label: `${draft.uavName || `БпЛА №${draft.uavId}`} · ${draft.uavSerialNumber || "без номера"} · зі знімка` }] : [], ...uavs.map((uav) => ({ value: String(uav.id), label: `${uav.name} · ${uav.inventoryNumber || "без номера"}` }))]} /></label>
      <label className="form-field"><span>Тип БпЛА</span><input value={draft.uavType} onChange={(event) => { const uavType = event.target.value; setDraft({ ...draft, uavType, ...isStrikeUavType(uavType) ? {} : { payloadSource: "", payloadId: null, payloadType: "", payloadSerialNumber: "" } }); }} /></label>
      <label className="form-field form-field--wide"><span>Серійний номер БпЛА</span><input value={draft.uavSerialNumber} onChange={(event) => setDraft({ ...draft, uavSerialNumber: event.target.value })} /></label>
      <label className="form-field form-field--wide"><span>Мета польоту</span><input value={draft.mission} onChange={(event) => setDraft({ ...draft, mission: event.target.value })} /></label>
      {isStrikeUavType(draft.uavType) && <><label className="form-field"><span>Тип БК</span><Select ariaLabel="БК польоту" value={draft.payloadSource && draft.payloadId ? `${draft.payloadSource}:${draft.payloadId}` : ""} onChange={choosePayload} options={[{ value: "", label: "Не обрано" }, ...payloadOptions.map((item) => ({ value: item.key, label: item.name }))]} /></label>
      <label className="form-field"><span>Серійний номер БК</span><input value={draft.payloadSerialNumber} onChange={(event) => setDraft({ ...draft, payloadSerialNumber: event.target.value })} /></label></>}
      <label className="form-field form-field--wide"><span>Нотатки</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    </div><footer className="modal-actions"><button className="button" onClick={dismissEditor} disabled={saving}>Скасувати</button><button className="button primary" onClick={() => void save()} disabled={saving}>{saving ? "Збереження…" : "Зберегти запис"}</button></footer></Modal>}
    {apOpen && <Modal title="Сформувати АП" subtitle="Підготовка акта пуску за записами журналу" onClose={() => setApOpen(false)} className="flight-journal-ap-modal"><div className="flight-journal-ap__body">
      <p className="flight-journal-ap__notice" role="note"><b>Формування АП у розробці</b>. Зараз доступні вибір польотів, комісії та перевірка підсумку без списання майна.</p>
      <div className="flight-journal-ap__controls"><label className="form-field"><span>Дата польотів</span><input aria-label="Дата польотів для АП" type="date" value={apDate} onChange={(event) => selectApDate(event.target.value)} /></label><label className="form-field"><span>Комісія</span><Select ariaLabel="Комісія для АП" value={apCommissionId} disabled={!commissions.length} onChange={setApCommissionId} options={commissions.length ? commissions.map((commission) => ({ value: commission.id, label: commission.name })) : [{ value: "", label: commissionsLoaded ? "Комісій немає" : "Завантаження…" }]} /></label></div>
      {!commissions.length && commissionsLoaded && <p className="flight-journal-ap__empty-commission">Комісію можна створити у налаштуваннях.</p>}
      <div className="flight-journal-ap__workspace"><section className="flight-journal-ap__selection"><header><div><b>Польоти за {displayDate(apDate)}</b><small>Вибрано: {apSelectedEntries.length} із {apEntries.length}</small></div><label className="flight-journal-ap__select-all"><CheckBox label="Обрати всі польоти" checked={apEntries.length > 0 && apEntries.every((entry) => apSelectedIds.has(entry.id))} disabled={apEntries.length === 0} onChange={toggleAllApEntries} /><span>Усі</span></label></header><div className="flight-journal-ap__entry-list">{apEntries.map((entry) => <label className={`flight-journal-ap__entry ${apSelectedIds.has(entry.id) ? "selected" : ""}`} key={entry.id}><CheckBox label={`Обрати політ №${entry.id}`} checked={apSelectedIds.has(entry.id)} onChange={() => toggleApEntry(entry.id)} /><span className="flight-journal-ap__entry-main"><b>{entry.crewName || "Екіпаж не вказано"}</b><small>{entry.positionName || "Позиція не вказана"} · {entry.skyTime || "—"}–{entry.completionTime || entry.groundTime || "—"}</small><span>{entry.uavName || "БпЛА не вказано"} · {entry.uavSerialNumber || "без номера"}</span>{entry.payloadType && <small>БК: {entry.payloadType}{entry.payloadSerialNumber ? ` · ${entry.payloadSerialNumber}` : ""}</small>}</span></label>)}{apEntries.length === 0 && <div className="flight-journal-ap__empty">За цю дату в журналі немає польотів.</div>}</div></section>
      <section className="flight-journal-ap__summary" aria-label="Підсумок вибору"><header><b>Підсумок вибору</b><span>{displayDate(apDate)}</span></header><div><article><strong>{apSelectedEntries.length}</strong><span>польотів</span></article><article><strong>{selectedCrewCount}</strong><span>екіпажів</span></article><article><strong>{selectedUavCount}</strong><span>БпЛА</span></article><article><strong>{apCommission?.members.length ?? 0}</strong><span>членів комісії</span></article></div><p>Комісія: <b>{apCommission?.name ?? "не обрана"}</b></p><p>Вартість і служби з’являться після погодження зв’язків із майном.</p></section></div>
    </div><footer className="modal-actions"><button className="button" onClick={() => setApOpen(false)}>Закрити</button><button className="button primary" disabled title="Формування АП ще недоступне">Сформувати АП</button></footer></Modal>}
    {selected && <FlightJournalCard entry={selected} onProgress={(eventType, eventTime, completionDetail) => progressFlight(selected, eventType, eventTime, completionDetail)} onClose={() => setSelected(null)} />}
  </PageFrame>;
}
