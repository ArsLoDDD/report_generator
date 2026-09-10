import type { ReactNode } from "react";
import { Modal } from "./Modal";

type Props = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
  busy?: boolean;
  dirty?: boolean;
  className?: string;
  saveLabel?: string;
};

/** Standard editor shell. Domain forms keep ownership of fields and validation. */
export function EntityEditorModal({ title, children, onClose, onSave, busy = false, dirty = false, className = "", saveLabel = "Зберегти" }: Props) {
  const requestClose = () => {
    if (!dirty || window.confirm("Закрити без збереження змін?")) onClose();
  };
  return <Modal title={title} onClose={requestClose} className={`entity-editor-modal ${className}`}>
    <div className="entity-editor-modal__body">{children}</div>
    <footer className="modal-actions"><button className="button" disabled={busy} onClick={requestClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={onSave}>{busy ? "Збереження…" : saveLabel}</button></footer>
  </Modal>;
}

