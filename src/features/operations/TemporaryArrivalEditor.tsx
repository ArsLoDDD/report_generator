import { useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import { BCS_LOCATIONS } from "./bcs-model";
import type { TemporaryPerson } from "./types";

export function TemporaryArrivalEditor({ initial, actingPositions = [], onClose, onSave }: { initial?: Partial<TemporaryPerson>; actingPositions?: Array<{ id: string; name: string }>; onClose: () => void; onSave: (person: TemporaryPerson) => Promise<void> }) {
  const [person, setPerson] = useState<TemporaryPerson>({ id: 0, fullName: "", rank: "", position: "", actingSlotId: "", actingPosition: "", duties: "", arrivedAt: new Date().toLocaleDateString("sv-SE"), currentLocation: "", notes: "", category: "Тимчасово прибулі", groupName: "", ...initial });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof TemporaryPerson, value: string) => setPerson((current) => ({ ...current, [key]: value }));
  return <Modal title={person.category === "Прикомандировані" ? "Прикомандирована людина" : person.category === "Інша підгрупа" ? "Людина у підгрупі БЧС" : "Тимчасово прибула людина"} onClose={onClose}>
    <div className="operation-editor__body"><p>Відображається тільки у БЧС і не займає штатну посаду.</p>
      <label className="form-field"><span>Категорія</span><select value={person.category} onChange={(event) => setPerson((current) => ({ ...current, category: event.target.value as TemporaryPerson["category"], ...(event.target.value === "Тимчасово прибулі" ? {} : { actingSlotId: "", actingPosition: "" }) }))}><option>Тимчасово прибулі</option><option>Прикомандировані</option><option>Інша підгрупа</option></select></label>
      {person.category === "Інша підгрупа" && <label className="form-field"><span>Назва підгрупи</span><input value={person.groupName} onChange={(event) => set("groupName", event.target.value)} placeholder="Назва підгрупи" /></label>}
      <label className="form-field"><span>ПІБ</span><input autoFocus value={person.fullName} onChange={(event) => set("fullName", event.target.value)} /></label>
      <label className="form-field"><span>Звання</span><input value={person.rank} onChange={(event) => set("rank", event.target.value)} /></label>
      <label className="form-field form-field--wide"><span>Посада</span><input value={person.position} onChange={(event) => set("position", event.target.value)} placeholder="Посада людини" /></label>
      {person.category === "Тимчасово прибулі" && <label className="form-field form-field--wide"><span>ТВО на штатній посаді</span><select value={person.actingSlotId} onChange={(event) => { const option = actingPositions.find((item) => item.id === event.target.value); setPerson((current) => ({ ...current, actingSlotId: option?.id ?? "", actingPosition: option?.name ?? "" })); }}><option value="">Не призначено</option>{actingPositions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}</select><small>Якщо обрати посаду, людина додатково враховується у показнику «По списку».</small></label>}
      <label className="form-field"><span>Дата прибуття</span><input type="date" value={person.arrivedAt} onChange={(event) => set("arrivedAt", event.target.value)} /></label>
      <label className="form-field"><span>Функціональні обов’язки</span><input value={person.duties} onChange={(event) => set("duties", event.target.value)} /></label>
      <label className="form-field"><span>Де знаходиться</span><select value={person.currentLocation} onChange={(event) => set("currentLocation", event.target.value)}><option value="">Не вказано</option>{BCS_LOCATIONS.map((location) => <option key={location}>{location}</option>)}</select></label>
      <label className="form-field"><span>Примітка</span><textarea value={person.notes} onChange={(event) => set("notes", event.target.value)} /></label>
    </div><footer className="modal-actions"><button className="button" disabled={saving} onClick={onClose}>Скасувати</button><button className="button primary" disabled={saving || !person.fullName.trim() || !person.arrivedAt || (person.category === "Інша підгрупа" && !person.groupName.trim())} onClick={async () => { setSaving(true); try { await onSave(person); } finally { setSaving(false); } }}>{person.id ? "Зберегти" : "Додати у БЧС"}</button></footer>
  </Modal>;
}
