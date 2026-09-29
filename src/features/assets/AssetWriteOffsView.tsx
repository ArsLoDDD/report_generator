import { ClipboardList, History } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import { useEntityCollection } from "../../shared/hooks/useEntityCollection";
import { operationsService } from "../operations/services/operationsService";
import type { AssetWriteOff, AssetWriteOffHistoryEvent } from "../operations/types";

const statuses = ["Очікує списання", "Документи готуються", "Передано на списання", "Списано", "Скасовано"];
const serviceLabels: Record<string, string> = { zbbr: "ЗББР", zu: "ЗУ", gz_kb: "ГЗ та КБ", siiz: "СІІЗ", ms: "МС", ets: "ЕТС", ovtm: "ОВТМ", rs: "РС", sa_ppo: "СА та ППО", svt: "СВТ", pmm: "ПММ" };
const displayDateTime = (value: string) => value ? new Date(value.replace(" ", "T")).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" }) : "—";

export function AssetWriteOffsView() {
  const { notify } = useNotifications();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selected, setSelected] = useState<AssetWriteOff | null>(null);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [history, setHistory] = useState<AssetWriteOffHistoryEvent[] | null>(null);
  const load = useCallback(() => operationsService.listAssetWriteOffs(), []);
  const onLoadError = useCallback(() => notify("Не вдалося завантажити список списання.", "error"), [notify]);
  const { items, isLoading, reload } = useEntityCollection({ load, onError: onLoadError });
  const filtered = useMemo(() => items.filter((item) => {
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? !["Списано", "Скасовано"].includes(item.status) : item.status === statusFilter);
    const haystack = [item.assetName, item.inventoryNumber, item.serialNumber, item.incidentType, serviceLabels[item.serviceCode] ?? item.serviceCode].join(" ").toLocaleLowerCase("uk");
    return matchesStatus && haystack.includes(query.trim().toLocaleLowerCase("uk"));
  }), [items, query, statusFilter]);
  const openItem = (item: AssetWriteOff) => { setSelected(item); setDraftStatus(item.status); setDraftNotes(item.notes); setHistory(null); };
  const save = async () => {
    if (!selected) return;
    if (draftStatus === "Списано" && selected.status !== "Списано" && !confirmFinal) { setConfirmFinal(true); return; }
    try {
      await operationsService.updateAssetWriteOff(selected.id, draftStatus, draftNotes);
      setSelected(null); setConfirmFinal(false); await reload(); notify("Стан списання оновлено.", "success");
    } catch (error) { notify(typeof error === "string" ? error : "Не вдалося оновити списання.", "error"); }
  };
  const openHistory = async () => {
    if (!selected) return;
    try { setHistory(await operationsService.listAssetWriteOffHistory(selected.id)); }
    catch { notify("Не вдалося завантажити історію списання.", "error"); }
  };
  const columns: EntityTableColumn<AssetWriteOff>[] = [
    { key: "asset", title: "Майно", render: (item) => <><b>{item.assetName}</b><small>{item.serialNumber || item.inventoryNumber || "Без номера"}</small></> },
    { key: "service", title: "Служба", render: (item) => serviceLabels[item.serviceCode] ?? "—" },
    { key: "quantity", title: "Кількість", render: (item) => `${item.quantity.toLocaleString("uk-UA")} ${item.accountingUnit}` },
    { key: "incident", title: "Підстава", render: (item) => <><b>{item.incidentType || "Інцидент не вказано"}</b><small>{item.incidentId ? `Інцидент №${item.incidentId}` : "Запис інциденту недоступний"}</small></> },
    { key: "date", title: "Дата події", render: (item) => displayDateTime(item.incidentOccurredAt) },
    { key: "status", title: "Стан", render: (item) => <span className={`status-pill ${item.status === "Списано" ? "active" : item.status === "Скасовано" ? "" : "warning"}`}>{item.status}</span> },
  ];
  return <div className="asset-write-offs">
    <div className="asset-write-offs__toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Пошук майна, номера або інциденту…" /><Select ariaLabel="Стан списання" value={statusFilter} onChange={setStatusFilter} options={[{ value: "active", label: "У роботі" }, { value: "all", label: "Усі стани" }, ...statuses.map((value) => ({ value, label: value }))]} /></div>
    {isLoading || filtered.length === 0
      ? <section className="panel asset-write-offs__state"><ClipboardList /><div><b>{isLoading ? "Завантаження списку…" : items.length ? "Нічого не знайдено" : "Списання відсутні"}</b><span>{isLoading ? "" : items.length ? "Змініть пошук або вибраний стан." : "Немає майна, переданого на списання."}</span></div></section>
      : <section className="panel data-table asset-write-offs__table"><EntityTable items={filtered} columns={columns} rowKey={(item) => item.id} onSelect={openItem} /><div className="pagination">Показано {filtered.length} із {items.length}</div></section>}
    {selected && <Modal title={`Списання · ${selected.assetName}`} subtitle={`${selected.incidentType} · ${selected.incidentId ? `інцидент №${selected.incidentId}` : "без зв’язку з інцидентом"}`} className="asset-write-off-modal" onClose={() => setSelected(null)}><div className="asset-write-off-modal__body">
      <dl><div><dt>Служба</dt><dd>{serviceLabels[selected.serviceCode] ?? "—"}</dd></div><div><dt>Номер</dt><dd>{selected.serialNumber || selected.inventoryNumber || "—"}</dd></div><div><dt>Кількість</dt><dd>{selected.quantity} {selected.accountingUnit}</dd></div><div><dt>Дата події</dt><dd>{displayDateTime(selected.incidentOccurredAt)}</dd></div></dl>
      <label className="form-field"><span>Стан</span><Select ariaLabel="Новий стан списання" value={draftStatus} disabled={selected.status === "Списано"} onChange={setDraftStatus} options={statuses.map((value) => ({ value, label: value }))} /></label>
      <label className="form-field"><span>Примітка</span><textarea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} placeholder="Номер документа, етап погодження або причина скасування" /></label>
      {history && <section className="asset-write-off-history"><h3>Історія</h3>{history.map((event) => <article key={event.id}><span /><div><b>{event.status}</b><small>{displayDateTime(event.createdAt)}</small><p>{event.notes || "Без примітки"}</p></div></article>)}</section>}
    </div><footer className="modal-actions"><button className="button" onClick={() => void openHistory()}><History />Історія</button><button className="button" onClick={() => setSelected(null)}>Скасувати</button><button className="button primary" onClick={() => void save()} disabled={selected.status === "Списано" || (draftStatus === selected.status && draftNotes === selected.notes)}>Зберегти</button></footer></Modal>}
    {confirmFinal && selected && <ConfirmDialog title="Підтвердити списання?" message={`«${selected.assetName}» буде позначено як списане та знято із закріплення. Повернути запис до попереднього стану буде неможливо.`} confirmLabel="Списати" confirmTone="danger" onConfirm={() => { setConfirmFinal(false); void save(); }} onCancel={() => setConfirmFinal(false)} />}
  </div>;
}
