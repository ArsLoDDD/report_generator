import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  busyLabel?: string;
  confirmTone?: "danger" | "primary";
};

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, busy = false, busyLabel = "Видалення…", confirmTone = "danger" }: ConfirmDialogProps) {
  return <Modal title={title} onClose={onCancel} className="confirm-dialog">
    <div className="confirm-dialog__message"><AlertTriangle /><p>{message}</p></div>
    <footer className="modal-actions"><button className="button" onClick={onCancel} disabled={busy}>Скасувати</button><button className={`button ${confirmTone}`} onClick={onConfirm} disabled={busy}>{busy ? busyLabel : confirmLabel}</button></footer>
  </Modal>;
}
