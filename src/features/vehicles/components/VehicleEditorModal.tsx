import { Car } from "lucide-react";
import { useState } from "react";
import { Modal } from "../../../shared/ui/Modal";
import { Select } from "../../../shared/ui/Select";
import type { Person } from "../../../shared/types/domain";
import type { Vehicle } from "../types";

type Props = {
  statuses: string[];
  people: Person[];
  vehicle?: Vehicle | null;
  onClose: () => void;
  onSave: (name: string, registrationNumber: string, status: string, personnelId: number | null) => Promise<boolean>;
};

export function VehicleEditorModal({ statuses, people, vehicle, onClose, onSave }: Props) {
  const [name, setName] = useState(vehicle?.name ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(vehicle?.registrationNumber ?? "");
  const [status, setStatus] = useState(vehicle?.status ?? statuses[0]);
  const [personnelId, setPersonnelId] = useState(vehicle?.personnelId?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { if (await onSave(name, registrationNumber, status, personnelId ? Number(personnelId) : null)) onClose(); } finally { setBusy(false); } };
  return <Modal title={vehicle ? "Редагування автомобіля" : "Новий автомобіль"} subtitle="Облікові дані, технічний стан і відповідальна особа" onClose={onClose} className="operation-editor asset-editor asset-editor--compact vehicle-editor vehicle-editor--refined">
    <div className="operation-editor__body asset-editor__form vehicle-editor__form">
      <div className="asset-editor__section-title form-field--wide"><span>01</span><div><b>Основні дані</b><small>Назва та державний номер автомобіля</small></div></div>
      <label className="form-field"><span>Назва автомобіля <b>*</b></span><input autoFocus placeholder="Наприклад, Toyota Hilux" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="form-field"><span>Державний номер <b>*</b></span><input placeholder="Наприклад, АА 1234 АА" value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} /></label>
      <div className="asset-editor__section-title form-field--wide"><span>02</span><div><b>Стан і закріплення</b><small>Відповідальним може бути будь-який військовослужбовець</small></div></div>
      <div className="form-field"><span>Стан автомобіля</span><Select ariaLabel="Початковий статус" value={status} options={statuses.map((value) => ({ value, label: value }))} onChange={setStatus} /></div>
      <div className="form-field"><span>Відповідальна особа</span><Select ariaLabel="Військовослужбовець автомобіля" value={personnelId} options={[{value:"",label:"Не закріплювати"},...people.map((person)=>({value:String(person.id),label:person.fullName}))]} onChange={setPersonnelId} /></div>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={() => void save()}><Car />{busy ? "Збереження…" : vehicle ? "Зберегти" : "Додати автомобіль"}</button></footer>
  </Modal>;
}
