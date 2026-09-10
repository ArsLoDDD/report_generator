import { useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import { Select } from "../../shared/ui/Select";
import { BCS_LOCATIONS } from "./bcs-model";
import type { TemporaryPerson } from "./types";

export function TemporaryArrivalEditor({ initial, actingPositions = [], onClose, onSave }: { initial?: Partial<TemporaryPerson>; actingPositions?: Array<{ id: string; name: string; label?: string }>; onClose: () => void; onSave: (person: TemporaryPerson) => Promise<void> }) {
  const [person, setPerson] = useState<TemporaryPerson>({ id: 0, fullName: "", rank: "", position: "", actingSlotId: "", actingPosition: "", duties: "", arrivedAt: new Date().toLocaleDateString("sv-SE"), currentLocation: "", notes: "", category: "Тимчасово прибулі", groupName: "", ...initial });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof TemporaryPerson, value: string) => setPerson((current) => ({ ...current, [key]: value }));
  return <Modal title={person.category === "Прикомандировані" ? "Прикомандирована людина" : person.category === "Інша підгрупа" ? "Людина у підгрупі БЧС" : "Тимчасово прибула людина"} onClose={onClose}>
    <div className="operation-editor__body"><p>Відображається тільки у БЧС і не займає штатну посаду.</p>
      <label className="form-field"><span>Категорія</span><Select ariaLabel="Категорія" value={person.category} options={["Тимчасово прибулі","Прикомандировані","Інша підгрупа"].map((value)=>({value,label:value}))} onChange={(value) => setPerson((current) => ({ ...current, category: value as TemporaryPerson["category"], ...(value === "Тимчасово прибулі" ? {} : { actingSlotId: "", actingPosition: "" }) }))}/></label>
      {person.category === "Інша підгрупа" && <label className="form-field"><span>Назва підгрупи</span><input value={person.groupName} onChange={(event) => set("groupName", event.target.value)} placeholder="Назва підгрупи" /></label>}
      <label className="form-field"><span>ПІБ</span><input autoFocus value={person.fullName} onChange={(event) => set("fullName", event.target.value)} /></label>
      <label className="form-field"><span>Звання</span><input value={person.rank} onChange={(event) => set("rank", event.target.value)} /></label>
      <label className="form-field form-field--wide"><span>Посада</span><input value={person.position} onChange={(event) => set("position", event.target.value)} placeholder="Посада людини" /></label>
      {person.category === "Тимчасово прибулі" && <label className="form-field form-field--wide"><span>ТВО на штатній посаді</span><Select ariaLabel="ТВО на штатній посаді" value={person.actingSlotId} options={[{value:"",label:"Не призначено"},...actingPositions.map((position)=>({value:position.id,label:position.label??position.name}))]} onChange={(value) => { const option = actingPositions.find((item) => item.id === value); setPerson((current) => { const wasAutomatic = !current.notes.trim() || current.notes.startsWith("ТВО: "); const actingPosition = option?.name ?? ""; return { ...current, actingSlotId: option?.id ?? "", actingPosition, notes: wasAutomatic ? (actingPosition ? `ТВО: ${actingPosition}` : "") : current.notes }; }); }}/><small>Якщо обрати посаду, людина додатково враховується у показнику «По списку».</small></label>}
      <label className="form-field"><span>Дата прибуття</span><input type="date" value={person.arrivedAt} onChange={(event) => set("arrivedAt", event.target.value)} /></label>
      <label className="form-field"><span>Функціональні обов’язки</span><input value={person.duties} onChange={(event) => set("duties", event.target.value)} /></label>
      <label className="form-field"><span>Де знаходиться</span><Select ariaLabel="Де знаходиться" value={person.currentLocation} options={[{value:"",label:"Не вказано"},...BCS_LOCATIONS.map((value)=>({value,label:value}))]} onChange={(value)=>set("currentLocation",value)}/></label>
      <label className="form-field"><span>Примітка</span><textarea value={person.notes} onChange={(event) => set("notes", event.target.value)} /></label>
    </div><footer className="modal-actions"><button className="button" disabled={saving} onClick={onClose}>Скасувати</button><button className="button primary" disabled={saving || !person.fullName.trim() || !person.arrivedAt || (person.category === "Інша підгрупа" && !person.groupName.trim())} onClick={async () => { setSaving(true); try { await onSave(person); } finally { setSaving(false); } }}>{person.id ? "Зберегти" : "Додати у БЧС"}</button></footer>
  </Modal>;
}
