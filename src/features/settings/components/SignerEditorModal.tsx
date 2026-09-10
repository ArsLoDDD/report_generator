import { useState } from "react";
import type { SignerRole, SignerSettings } from "../../../shared/types/domain";
import { Modal } from "../../../shared/ui/Modal";

const emptySigner: SignerSettings = { fullName: "", rank: "", position: "" };

export function SignerEditorModal({ role, onClose, onSave, busy }: { role: SignerRole | "new"; onClose: () => void; onSave: (name: string, signer: SignerSettings) => Promise<void>; busy: boolean }) {
  const [name, setName] = useState(role === "new" ? "" : role.name);
  const [signer, setSigner] = useState(role === "new" ? emptySigner : role.signer);
  const isNew = role === "new";
  const update = (key: keyof SignerSettings, value: string) => setSigner((current) => ({ ...current, [key]: value }));
  return <Modal title={isNew ? "Новий підписант" : `Редагування: ${role.name}`} onClose={onClose} className="signer-editor-modal">
    <div className="signer-editor-fields">
      <label>Назва ролі<input value={name} disabled={!isNew} onChange={(event) => setName(event.target.value)} placeholder="Наприклад: Черговий частини" /></label>
      {isNew && <small>З назви буде автоматично створено змінні, наприклад: {"{{черговий_частини_піб}}"}.</small>}
      <label>ПІБ<input value={signer.fullName} onChange={(event) => update("fullName", event.target.value)} /></label>
      <label>Звання<input value={signer.rank} onChange={(event) => update("rank", event.target.value)} /></label>
      <label>Посада<input value={signer.position} onChange={(event) => update("position", event.target.value)} /></label>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={() => void onSave(name, signer)}>{isNew ? "Додати підписанта" : "Зберегти зміни"}</button></footer>
  </Modal>;
}

