import { useCallback, useEffect, useMemo, useState, type UIEventHandler } from "react";
import { BookOpenText, Clock3, MapPin, PackageOpen, Plane, Plus, UsersRound } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Select } from "../../shared/ui/Select";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import { useEntityCollection } from "../../shared/hooks/useEntityCollection";
import { flightPlanDraftRequest, flightPlanPendingDraftRequest } from "./flight-plan-storage";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, FlightJournalDraft, FlightJournalEntry, FlightPlanRequest, Position, WorkshopProduct } from "./types";

type PayloadOption = { key: string; source: "equipment" | "workshop"; id: number; name: string; serial: string };
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const emptyDraft = (): FlightJournalDraft => ({ flightDate: todayIso(), skyTime: "", groundTime: "", crewId: null, crewName: "", positionId: null, positionName: "", battleOrder: "", workStrip: "", uavId: null, uavName: "", uavType: "", uavSerialNumber: "", mission: "", payloadSource: "", payloadId: null, payloadType: "", payloadSerialNumber: "", notes: "" });
const parsePlan = (value: string | null | undefined): FlightPlanRequest | null => { try { const parsed = value ? JSON.parse(value) as FlightPlanRequest : null; return parsed && Array.isArray(parsed.entries) ? parsed : null; } catch { return null; } };
const displayDate = (value: string) => { const [year, month, day] = value.split("-"); return year && month && day ? `${day}.${month}.${year}` : value; };

const columns: EntityTableColumn<FlightJournalEntry>[] = [
  { key: "id", title: "№", render: (_item, index) => index + 1 },
  { key: "date", title: "Дата", render: (item) => displayDate(item.flightDate) },
  { key: "sky", title: "Небо", render: (item) => item.skyTime || "—" },
  { key: "ground", title: "Земля", render: (item) => item.groundTime || "—" },
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
  { key: "notes", title: "Нотатки", render: (item) => item.notes || "—" },
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
  const [draft, setDraft] = useState<FlightJournalDraft>(emptyDraft);
  const loadEntries = useCallback(() => operationsService.listFlightJournalEntries(), []);
  const onLoadError = useCallback(() => notify("Не вдалося завантажити журнал польотів.", "error"), [notify]);
  const { items, reload } = useEntityCollection({ load: loadEntries, onError: onLoadError });

  useEffect(() => { void Promise.all([operationsService.listCrews(), operationsService.listPositions(), operationsService.listEquipment("uav"), operationsService.listEquipment("weapon_ammo"), operationsService.listWorkshopProducts()]).then(([nextCrews, nextPositions, nextUavs, nextAmmunition, nextProducts]) => { setCrews(nextCrews); setPositions(nextPositions); setUavs(nextUavs); setAmmunition(nextAmmunition); setProducts(nextProducts); }).catch(() => notify("Не вдалося завантажити довідники журналу.", "error")); }, [notify]);

  const payloadOptions = useMemo<PayloadOption[]>(() => [
    ...ammunition.filter((item) => item.weaponKind === "ammunition").map((item) => ({ key: `equipment:${item.id}`, source: "equipment" as const, id: item.id, name: item.name, serial: item.inventoryNumber })),
    ...products.map((item) => ({ key: `workshop:${item.id}`, source: "workshop" as const, id: item.id, name: item.name, serial: "" })),
  ], [ammunition, products]);

  const chooseCrew = async (value: string) => {
    const crew = crews.find((item) => item.id === Number(value));
    if (!crew) { setDraft((current) => ({ ...emptyDraft(), flightDate: current.flightDate })); return; }
    const storedSnapshot = await operationsService.getFlightPlanSnapshot(draft.flightDate).catch(() => null);
    const plan: FlightPlanRequest | null = flightPlanPendingDraftRequest(draft.flightDate) ?? parsePlan(storedSnapshot) ?? flightPlanDraftRequest(draft.flightDate);
    const planEntry = plan?.entries.find((entry) => entry.crewId === crew.id);
    const selectedUavId = planEntry?.uavSelections?.[0]?.equipmentId ?? crew.primaryUavId ?? uavs.find((item) => item.crewId === crew.id)?.id ?? null;
    const uav = uavs.find((item) => item.id === selectedUavId);
    const payloadKey = planEntry?.payloadSelection ? `${planEntry.payloadSelection.sourceType}:${planEntry.payloadSelection.sourceId}` : "";
    const payload = payloadOptions.find((item) => item.key === payloadKey);
    const position = positions.find((item) => item.id === crew.positionId);
    setDraft((current) => ({ ...current, crewId: crew.id, crewName: crew.name, positionId: position?.id ?? crew.positionId, positionName: position?.name || crew.positionName, battleOrder: position?.battleOrder || crew.battleOrder, workStrip: crew.sector, skyTime: planEntry?.startTime || current.skyTime, groundTime: planEntry?.endTime || current.groundTime, mission: planEntry?.task || current.mission, uavId: uav?.id ?? null, uavName: uav?.name || crew.uavName, uavType: uav?.uavType || crew.uavType, uavSerialNumber: uav?.inventoryNumber || "", payloadSource: payload?.source || "", payloadId: payload?.id ?? null, payloadType: payload?.name || "", payloadSerialNumber: payload?.serial || "" }));
  };
  const choosePosition = (value: string) => { const position = positions.find((item) => item.id === Number(value)); setDraft((current) => ({ ...current, positionId: position?.id ?? null, positionName: position?.name ?? "", battleOrder: position?.battleOrder ?? current.battleOrder })); };
  const chooseUav = (value: string) => { const uav = uavs.find((item) => item.id === Number(value)); setDraft((current) => ({ ...current, uavId: uav?.id ?? null, uavName: uav?.name ?? "", uavType: uav?.uavType ?? "", uavSerialNumber: uav?.inventoryNumber ?? "" })); };
  const choosePayload = (value: string) => { const payload = payloadOptions.find((item) => item.key === value); setDraft((current) => ({ ...current, payloadSource: payload?.source ?? "", payloadId: payload?.id ?? null, payloadType: payload?.name ?? "", payloadSerialNumber: payload?.serial ?? "" })); };
  const save = async () => {
    if (!draft.skyTime || !draft.groundTime) { notify("Вкажіть обов’язкові часи «Небо» та «Земля».", "error"); return; }
    try { await operationsService.createFlightJournalEntry(draft); setOpen(false); setDraft(emptyDraft()); await reload(); notify("Запис журналу польотів збережено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти запис.", "error"); }
  };
  const onScroll: UIEventHandler<HTMLDivElement> = (event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 100) setVisibleLimit((current) => Math.min(current + 20, items.length)); };
  const visibleItems = items.slice(0, visibleLimit);

  return <PageFrame className="flight-journal-page" header={<PageTitle title="Журнал польотів" subtitle="Фактичні польоти екіпажів із даними БпЛА та БК" actions={<button className="button primary" onClick={() => { setDraft(emptyDraft()); setOpen(true); }}><Plus />Додати</button>} />}>
    <section className="panel operation-table data-table flight-journal-table"><EntityTable className="operation-table__table" items={visibleItems} columns={columns} rowKey={(item) => item.id} numberBy={false} selectedKey={selected?.id} onSelect={setSelected} onScroll={onScroll} emptyState={<div className="personnel-state"><BookOpenText /><b>Записів ще немає</b><span>Додайте перший фактичний політ.</span></div>} /><div className="pagination">Показано {visibleItems.length} із {items.length}</div></section>
    {open && <Modal title="Новий запис польоту" subtitle="Поля з плану та картки екіпажу можна змінити перед збереженням." onClose={() => setOpen(false)} className="flight-journal-editor"><div className="operation-editor__body">
      <label className="form-field"><span>Дата <b>*</b></span><input type="date" value={draft.flightDate} onChange={(event) => setDraft({ ...emptyDraft(), flightDate: event.target.value })} /></label>
      <label className="form-field"><span>Екіпаж <b>*</b></span><Select ariaLabel="Екіпаж польоту" value={draft.crewId?.toString() ?? ""} onChange={(value)=>{void chooseCrew(value);}} options={[{ value: "", label: "Оберіть екіпаж" }, ...crews.map((crew) => ({ value: String(crew.id), label: crew.name }))]} /></label>
      <label className="form-field"><span>Час «Небо» <b>*</b></span><input aria-label="Час «Небо»" required type="time" value={draft.skyTime} onChange={(event) => setDraft({ ...draft, skyTime: event.target.value })} /></label>
      <label className="form-field"><span>Час «Земля» <b>*</b></span><input aria-label="Час «Земля»" required type="time" value={draft.groundTime} onChange={(event) => setDraft({ ...draft, groundTime: event.target.value })} /></label>
      <label className="form-field"><span>Позиція</span><Select ariaLabel="Позиція польоту" value={draft.positionId?.toString() ?? ""} onChange={choosePosition} options={[{ value: "", label: "Не обрана" }, ...positions.map((position) => ({ value: String(position.id), label: position.name }))]} /></label>
      <label className="form-field"><span>БрО</span><input value={draft.battleOrder} onChange={(event) => setDraft({ ...draft, battleOrder: event.target.value })} /></label>
      <label className="form-field form-field--wide"><span>Смуга роботи</span><input value={draft.workStrip} onChange={(event) => setDraft({ ...draft, workStrip: event.target.value })} /></label>
      <label className="form-field"><span>Назва БпЛА</span><Select ariaLabel="БпЛА польоту" value={draft.uavId?.toString() ?? ""} onChange={chooseUav} options={[{ value: "", label: "Не обрано" }, ...uavs.map((uav) => ({ value: String(uav.id), label: `${uav.name} · ${uav.inventoryNumber || "без номера"}` }))]} /></label>
      <label className="form-field"><span>Тип БпЛА</span><input value={draft.uavType} onChange={(event) => setDraft({ ...draft, uavType: event.target.value })} /></label>
      <label className="form-field form-field--wide"><span>Серійний номер БпЛА</span><input value={draft.uavSerialNumber} onChange={(event) => setDraft({ ...draft, uavSerialNumber: event.target.value })} /></label>
      <label className="form-field form-field--wide"><span>Мета польоту</span><input value={draft.mission} onChange={(event) => setDraft({ ...draft, mission: event.target.value })} /></label>
      <label className="form-field"><span>Тип БК</span><Select ariaLabel="БК польоту" value={draft.payloadSource && draft.payloadId ? `${draft.payloadSource}:${draft.payloadId}` : ""} onChange={choosePayload} options={[{ value: "", label: "Не обрано" }, ...payloadOptions.map((item) => ({ value: item.key, label: item.name }))]} /></label>
      <label className="form-field"><span>Серійний номер БК</span><input value={draft.payloadSerialNumber} onChange={(event) => setDraft({ ...draft, payloadSerialNumber: event.target.value })} /></label>
      <label className="form-field form-field--wide"><span>Нотатки</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    </div><footer className="modal-actions"><button className="button" onClick={() => setOpen(false)}>Скасувати</button><button className="button primary" onClick={() => void save()}>Зберегти запис</button></footer></Modal>}
    {selected && <Modal title={`Політ №${selected.id}`} subtitle={`${displayDate(selected.flightDate)} · ${selected.crewName}`} onClose={() => setSelected(null)} className="flight-journal-details"><div className="flight-journal-details__body"><div className="incident-details__facts"><article><Clock3 /><span>Небо / Земля<b>{selected.skyTime || "—"} / {selected.groundTime || "—"}</b></span></article><article><UsersRound /><span>Екіпаж<b>{selected.crewName}</b></span></article><article><MapPin /><span>Позиція та БрО<b>{selected.positionName || "—"} · {selected.battleOrder || "—"}</b></span></article><article><Plane /><span>БпЛА<b>{selected.uavName || "—"} · {selected.uavType || "—"}</b></span></article><article><PackageOpen /><span>БК<b>{selected.payloadType || "—"} · {selected.payloadSerialNumber || "без номера"}</b></span></article></div><section><span>Смуга роботи</span><p>{selected.workStrip || "Не вказано"}</p></section><section><span>Мета польоту</span><p>{selected.mission || "Не вказано"}</p></section><section><span>Нотатки</span><p>{selected.notes || "Без нотаток"}</p></section></div><footer className="modal-actions"><button className="button primary" onClick={() => setSelected(null)}>Готово</button></footer></Modal>}
  </PageFrame>;
}
