import { AlertTriangle, BellRing, Clock3 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DeadlineNotification } from "../../shared/types/domain";
import { deadlineReminderService } from "../../features/settings/services/deadlineReminderService";

const formatter = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" });

export function DeadlineReminderNotifications() {
  const [items, setItems] = useState<DeadlineNotification[]>([]);
  const refresh = useCallback(async () => {
    try { setItems(await deadlineReminderService.listNotifications()); }
    catch { setItems([]); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const update = () => { void refresh(); };
    window.addEventListener("focus", update);
    window.addEventListener("deadline-reminders-updated", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("deadline-reminders-updated", update); };
  }, [refresh]);
  const acknowledge = async (item: DeadlineNotification) => {
    try { await deadlineReminderService.acknowledgeNotification(item.reminder.id, item.slot); setItems((current) => current.filter((candidate) => candidate.reminder.id !== item.reminder.id)); }
    catch { /* Keep the notice visible until its acknowledgement is persisted. */ }
  };
  if (!items.length) return null;
  return <aside className="deadline-notifications" aria-live="assertive">{items.map((item) => <article className={item.overdue ? "is-overdue" : ""} key={`${item.reminder.id}-${item.slot}`}>{item.overdue ? <AlertTriangle /> : <BellRing />}<div><b>{item.overdue ? "Дедлайн прострочено" : item.cadenceMinutes === 10 ? "Наближається дедлайн" : "Контрольний строк"}</b><span>{item.reminder.description}</span><small><Clock3 />{formatter.format(new Date(item.reminder.dueAt))}</small></div><button type="button" aria-label={`Підтвердити нагадування №${item.reminder.id}`} title="Підтвердити" onClick={() => void acknowledge(item)}>++</button></article>)}</aside>;
}
