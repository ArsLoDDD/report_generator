import { Car } from "lucide-react";
import { useState } from "react";
import type { Person } from "../../../shared/types/domain";
import { Modal } from "../../../shared/ui/Modal";
import { Select } from "../../../shared/ui/Select";
import type { Crew } from "../../operations/types";
import type { Vehicle } from "../types";

type Props = {
  vehicle: Vehicle;
  drivers: Person[];
  crews: Crew[];
  onClose: () => void;
  onSave: (driverId: number | null, crewId: number | null) => Promise<boolean>;
};

export function VehicleAssignmentModal({ vehicle, drivers, crews, onClose, onSave }: Props) {
  const [driverId, setDriverId] = useState(vehicle.personnelId?.toString() ?? "");
  const [crewId, setCrewId] = useState(vehicle.crewId?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { if (await onSave(driverId ? Number(driverId) : null, crewId ? Number(crewId) : null)) onClose(); } finally { setBusy(false); } };
  return <Modal title="Перезакріпити автомобіль" onClose={onClose} className="vehicle-assignment-modal">
    <div className="vehicle-assignment-modal__body"><div className="vehicle-editor__intro"><span className="vehicle-editor__icon"><Car /></span><div><b>{vehicle.name}</b><p>{vehicle.registrationNumber}</p></div></div><p>Автомобіль може бути закріплений окремо за водієм і за екіпажем.</p><label className="form-field"><span>Водій</span><Select ariaLabel="Водій автомобіля" value={driverId} onChange={setDriverId} options={[{ value: "", label: "Не закріплювати" }, ...drivers.map((person) => ({ value: String(person.id), label: person.fullName }))]} /></label><label className="form-field"><span>Екіпаж</span><Select ariaLabel="Екіпаж автомобіля" value={crewId} onChange={setCrewId} options={[{ value: "", label: "Не закріплювати" }, ...crews.map((crew) => ({ value: String(crew.id), label: crew.name }))]} /></label></div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? "Збереження…" : "Зберегти закріплення"}</button></footer>
  </Modal>;
}
