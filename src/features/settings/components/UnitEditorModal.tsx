import { useState } from "react";
import type { UnitSettings } from "../../../shared/types/domain";
import { Modal } from "../../../shared/ui/Modal";
import { Select } from "../../../shared/ui/Select";

export function UnitEditorModal({ initial, onClose, onSave, busy }: { initial: UnitSettings; onClose: () => void; onSave: (unit: UnitSettings) => Promise<void>; busy: boolean }) {
  const [unit, setUnit] = useState<UnitSettings>({ ...initial });
  const changeKind = (kind: UnitSettings["kind"]) => setUnit((current) => ({ ...current, kind }));
  return <Modal title="Параметри підрозділу" onClose={onClose} className="unit-editor-modal"><div className="operation-editor__body">
    <label className="form-field"><span>Тип підрозділу</span><Select ariaLabel="Тип підрозділу" value={unit.kind} onChange={(kind) => changeKind(kind as UnitSettings["kind"])} options={[{ value: "Рота", label: "Рота" }, { value: "Окремий взвод", label: "Окремий взвод" }, { value: "Інше", label: "Інше" }]} /></label>
    <label className="form-field"><span>Коротка назва</span><input autoFocus value={unit.shortName} onChange={(event) => setUnit((current) => ({ ...current, shortName: event.target.value }))} placeholder="РБАК" /></label>
    <label className="form-field"><span>Повна назва підрозділу</span><input value={unit.fullName ?? ""} onChange={(event) => setUnit((current) => ({ ...current, fullName: event.target.value }))} placeholder="Рота безпілотних авіаційних комплексів" /></label>
    <label className="form-field"><span>Номер військової частини</span><input value={unit.unitCode ?? ""} onChange={(event) => setUnit((current) => ({ ...current, unitCode: event.target.value.toUpperCase().replaceAll("A", "А") }))} placeholder="А0000" maxLength={5} /></label>
    <label className="form-field form-field--wide"><span>Чисельність за штатом</span><input type="number" min="0" value={unit.authorizedStrength || ""} onChange={(event) => setUnit((current) => ({ ...current, authorizedStrength: Number(event.target.value) || 0 }))} /></label>
    <label className="form-field"><span>Назва КСП</span><input value={unit.kspName ?? ""} onChange={(event) => setUnit((current) => ({ ...current, kspName: event.target.value }))} placeholder="ОРІОН" /></label>
    <label className="form-field"><span>Населений пункт КСП</span><input value={unit.kspLocality ?? ""} onChange={(event) => setUnit((current) => ({ ...current, kspLocality: event.target.value }))} placeholder="КАЛИНІВКА" /></label>
    <label className="form-field form-field--wide"><span>Координати КСП</span><input value={unit.kspMgrs ?? ""} onChange={(event) => setUnit((current) => ({ ...current, kspMgrs: event.target.value }))} placeholder="36U UV 40000 47000" /></label>
    <label className="check-row form-field--wide"><input type="checkbox" checked={Boolean(unit.kspInBro)} onChange={(event) => setUnit((current) => ({ ...current, kspInBro: event.target.checked }))} />КСП входить в БРО</label>
  </div><footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={() => void onSave(unit)}>Зберегти</button></footer></Modal>;
}
