import { Car } from "lucide-react";
import { useState } from "react";
import { Modal } from "../../../shared/ui/Modal";
import { Select } from "../../../shared/ui/Select";
import type { Person } from "../../../shared/types/domain";

type Props = {
  statuses: string[];
  people: Person[];
  onClose: () => void;
  onSave: (name: string, registrationNumber: string, status: string, personnelId: number | null) => Promise<boolean>;
};

export function VehicleEditorModal({ statuses, people, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [status, setStatus] = useState(statuses[0]);
  const [personnelId, setPersonnelId] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { if (await onSave(name, registrationNumber, status, personnelId ? Number(personnelId) : null)) onClose(); } finally { setBusy(false); } };
  return <Modal title="Новий автомобіль" onClose={onClose} className="vehicle-editor">
    <div className="vehicle-editor__scroll">
      <div className="vehicle-editor__grid">
        <label className="form-field"><span>Назва автомобіля <b>*</b></span><input autoFocus placeholder="Наприклад, Toyota Hilux" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="form-field"><span>Державний номер <b>*</b></span><input placeholder="Наприклад, АА 1234 АА" value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} /></label>
        <div className="form-field form-field--wide"><span>Початковий статус</span><Select ariaLabel="Початковий статус" value={status} options={statuses.map((value) => ({ value, label: value }))} onChange={setStatus} /></div>
        <div className="form-field form-field--wide"><span>Закріпити за військовослужбовцем</span><Select ariaLabel="Військовослужбовець автомобіля" value={personnelId} options={[{value:"",label:"Не закріплювати"},...people.map((person)=>({value:String(person.id),label:person.fullName}))]} onChange={setPersonnelId} /></div>
      </div>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={() => void save()}><Car />{busy ? "Збереження…" : "Додати автомобіль"}</button></footer>
  </Modal>;
}
