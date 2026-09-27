import { useState } from "react";
import type { DeadlineReminder } from "../../../shared/types/domain";
import { Modal } from "../../../shared/ui/Modal";
import type { DeadlineReminderInput } from "../services/deadlineReminderService";

const localDate = (value = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function DeadlineReminderEditor({ initial, busy, onClose, onSave }: { initial?: DeadlineReminder; busy: boolean; onClose: () => void; onSave: (value: DeadlineReminderInput) => void }) {
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueAt, setDueAt] = useState(initial?.dueAt ?? "");
  const today = localDate();
  const valid = description.trim().length > 0 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(dueAt) && dueAt.slice(0, 10) >= today;
  return <Modal title={initial ? `Редагування запису №${initial.id}` : "Новий контрольний строк"} subtitle="Вкажіть, що треба виконати, і точний час завершення." className="deadline-editor-modal" onClose={onClose}>
    <div className="deadline-editor-body">
      <label className="form-field deadline-editor-description"><span>Опис</span><textarea autoFocus value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Наприклад: відправити відповідь на розпорядження стосовно особового складу" /></label>
      <label className="form-field"><span>Дата та час дедлайну</span><input type="datetime-local" min={`${today}T00:00`} value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose} disabled={busy}>Скасувати</button><button className="button primary" disabled={busy || !valid} onClick={() => onSave({ id: initial?.id, description: description.trim(), dueAt })}>{busy ? "Збереження…" : "Зберегти"}</button></footer>
  </Modal>;
}
