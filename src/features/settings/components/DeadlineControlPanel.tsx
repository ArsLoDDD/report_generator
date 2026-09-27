import { Check, CheckCircle2, Clock3, History, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeadlineReminder } from "../../../shared/types/domain";
import { ConfirmDialog } from "../../../shared/ui/ConfirmDialog";
import { useNotifications } from "../../../shared/ui/NotificationProvider";
import { deadlineReminderService, type DeadlineReminderInput } from "../services/deadlineReminderService";
import { DeadlineReminderEditor } from "./DeadlineReminderEditor";

type View = "active" | "history";
const dateTime = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" });
const formatDateTime = (value?: string | null) => value ? dateTime.format(new Date(value.replace(" ", "T"))) : "—";
const deadlineStatus = (value: DeadlineReminder) => {
  const left = new Date(value.dueAt).getTime() - Date.now();
  if (left < 0) return { label: "Прострочено", tone: "danger" };
  if (left <= 60 * 60 * 1000) return { label: "Остання година", tone: "warning" };
  if (left <= 24 * 60 * 60 * 1000) return { label: "Менше 24 год", tone: "warning" };
  if (left <= 48 * 60 * 60 * 1000) return { label: "Менше 48 год", tone: "warning" };
  return { label: "Заплановано", tone: "active" };
};

export function DeadlineControlPanel() {
  const { notify } = useNotifications();
  const [items, setItems] = useState<DeadlineReminder[]>([]);
  const [view, setView] = useState<View>("active");
  const [editor, setEditor] = useState<DeadlineReminder | "new" | null>(null);
  const [completeItem, setCompleteItem] = useState<DeadlineReminder | null>(null);
  const [deleteItem, setDeleteItem] = useState<DeadlineReminder | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setItems(await deadlineReminderService.list()); }
    catch { notify("Не вдалося завантажити контрольні строки.", "error"); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener("deadline-reminders-updated", refresh);
    return () => window.removeEventListener("deadline-reminders-updated", refresh);
  }, [load]);
  const visible = useMemo(() => items.filter((item) => view === "active" ? item.status === "active" : item.status === "completed"), [items, view]);
  const save = async (value: DeadlineReminderInput) => {
    try { setBusy(true); await deadlineReminderService.save(value); setEditor(null); notify("Контрольний строк збережено.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    if (!completeItem) return;
    try { setBusy(true); await deadlineReminderService.complete(completeItem.id); setCompleteItem(null); notify("Запис виконано та перенесено в історію.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleteItem) return;
    try { setBusy(true); await deadlineReminderService.delete(deleteItem.id); setDeleteItem(null); notify("Запис видалено.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
    finally { setBusy(false); }
  };
  return <section className="settings-tab-content settings-deadlines-tab">
    <div className="settings-subnav-row"><nav className="entity-tabs" aria-label="Контроль строків та історія"><button type="button" className={view === "active" ? "active" : ""} onClick={() => setView("active")}><Clock3 />Активні <b>{items.filter((item) => item.status === "active").length}</b></button><button type="button" className={view === "history" ? "active" : ""} onClick={() => setView("history")}><History />Історія <b>{items.filter((item) => item.status === "completed").length}</b></button></nav>{view === "active" && <button className="button primary" onClick={() => setEditor("new")}><Plus />Додати строк</button>}</div>
    <section className="panel settings-table-panel"><div className="signers-table-wrap"><table className="signers-table deadlines-table"><thead><tr><th>№</th><th>Опис</th><th>Дедлайн</th><th>{view === "active" ? "Статус" : "Виконано"}</th><th>Дії</th></tr></thead><tbody>{visible.map((item) => { const status = deadlineStatus(item); return <tr key={item.id}><td><b>#{item.id}</b></td><td className="deadline-description">{item.description}</td><td>{formatDateTime(item.dueAt)}</td><td>{view === "active" ? <span className={`status-pill ${status.tone}`}>{status.label}</span> : formatDateTime(item.completedAt)}</td><td><div className="table-actions">{view === "active" && <><button className="button icon-only success" aria-label={`Виконати запис №${item.id}`} onClick={() => setCompleteItem(item)}><Check /></button><button className="button icon-only" aria-label={`Редагувати запис №${item.id}`} onClick={() => setEditor(item)}><Pencil /></button></>}<button className="button icon-only danger" aria-label={`Видалити запис №${item.id}`} onClick={() => setDeleteItem(item)}><Trash2 /></button></div></td></tr>; })}</tbody></table></div>{visible.length === 0 && <div className="settings-empty-state">{view === "active" ? <Clock3 /> : <CheckCircle2 />}<b>{view === "active" ? "Активних строків немає" : "Історія поки порожня"}</b><span>{view === "active" ? "Додайте завдання з датою та часом дедлайну." : "Виконані записи зберігатимуться тут."}</span></div>}</section>
    {editor && <DeadlineReminderEditor initial={editor === "new" ? undefined : editor} busy={busy} onClose={() => setEditor(null)} onSave={(value) => void save(value)} />}
    {completeItem && <ConfirmDialog title="Позначити виконаним?" message={`Запис №${completeItem.id} буде прибрано з активного списку та перенесено в історію.`} confirmLabel="Виконано" busyLabel="Завершення…" confirmTone="primary" onConfirm={() => void complete()} onCancel={() => setCompleteItem(null)} busy={busy} />}
    {deleteItem && <ConfirmDialog title="Видалити запис?" message={`Запис №${deleteItem.id} буде видалено без можливості відновлення.`} confirmLabel="Видалити" onConfirm={() => void remove()} onCancel={() => setDeleteItem(null)} busy={busy} />}
  </section>;
}
