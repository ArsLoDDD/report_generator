import { Car } from "lucide-react";
import { useState } from "react";
import { Modal } from "../../../shared/ui/Modal";
import { Select } from "../../../shared/ui/Select";

type Props = {
  statuses: string[];
  onClose: () => void;
  onSave: (name: string, registrationNumber: string, status: string) => Promise<boolean>;
};

export function VehicleEditorModal({ statuses, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [status, setStatus] = useState(statuses[0]);
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { if (await onSave(name, registrationNumber, status)) onClose(); } finally { setBusy(false); } };
  return <Modal title="Новий автомобіль" onClose={onClose} className="vehicle-editor">
    <div className="vehicle-editor__scroll">
      <div className="vehicle-editor__intro"><span className="vehicle-editor__icon"><Car /></span><div><b>Дані автомобіля</b><p>Додайте автомобіль до спільного переліку. Водія можна закріпити після створення.</p></div></div>
      <div className="vehicle-editor__grid">
        <label className="form-field"><span>Назва автомобіля <b>*</b></span><input autoFocus placeholder="Наприклад, Toyota Hilux" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="form-field"><span>Державний номер <b>*</b></span><input placeholder="Наприклад, АА 1234 АА" value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} /></label>
        <div className="form-field form-field--wide"><span>Початковий статус</span><Select ariaLabel="Початковий статус" value={status} options={statuses.map((value) => ({ value, label: value }))} onChange={setStatus} /></div>
      </div>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={() => void save()}><Car />{busy ? "Збереження…" : "Додати автомобіль"}</button></footer>
  </Modal>;
}

