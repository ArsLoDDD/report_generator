import { AlertTriangle, BellRing, Clock3, TimerReset } from "lucide-react";
import { useState } from "react";
import { Modal } from "../../../shared/ui/Modal";
import { useNotifications } from "../../../shared/ui/NotificationProvider";
import { deadlineReminderService } from "../services/deadlineReminderService";

const localDeadline = (offsetMinutes: number) => {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export function DeveloperReminderPanel({ onClose }: { onClose: () => void }) {
  const { notify } = useNotifications();
  const [busy, setBusy] = useState(false);
  const create = async (description: string, offsetMinutes: number) => {
    try {
      setBusy(true);
      await deadlineReminderService.save({ description: `[ТЕСТ] ${description}`, dueAt: localDeadline(offsetMinutes) });
      notify("Тестовий запис створено.", "success");
    } catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
    finally { setBusy(false); }
  };
  return <Modal title="Панель тестування" subtitle="Доступна лише під час розробки та не входить у production-збірку." className="developer-reminder-modal" onClose={onClose}>
    <div className="developer-reminder-body">
      <button className="panel" disabled={busy} onClick={() => void create("Попередження за 48 годин", 47 * 60)}><AlertTriangle /><span><b>Попередження 48 год</b><small>Створити строк через 47 годин.</small></span></button>
      <button className="panel" disabled={busy} onClick={() => void create("Щогодинне нагадування", 23 * 60)}><BellRing /><span><b>Щогодинний режим</b><small>Створити строк через 23 години.</small></span></button>
      <button className="panel" disabled={busy} onClick={() => void create("Нагадування останньої години", 50)}><Clock3 /><span><b>Кожні 10 хвилин</b><small>Створити строк через 50 хвилин.</small></span></button>
      <button className="panel" disabled={busy} onClick={() => void create("Прострочений дедлайн", -10)}><TimerReset /><span><b>Прострочений строк</b><small>Створити строк, що минув 10 хвилин тому.</small></span></button>
    </div>
    <footer className="modal-actions"><button className="button primary" onClick={onClose}>Закрити</button></footer>
  </Modal>;
}
