import { useState } from "react";
import type { UnitSettings } from "../../../shared/types/domain";
import { Modal } from "../../../shared/ui/Modal";
import { Select } from "../../../shared/ui/Select";
import { defaultUnitStructure, structureWithUnmappedPositions, usableUnitStructure, type UnitStructureSource } from "../../../shared/unit-structure";
import { UnitStructureEditor } from "./UnitStructureEditor";

export function UnitEditorModal({ initial, sourcePositions, onClose, onSave, busy }: { initial: UnitSettings; sourcePositions: UnitStructureSource[]; onClose: () => void; onSave: (unit: UnitSettings) => Promise<void>; busy: boolean }) {
  const [unit, setUnit] = useState<UnitSettings>({ ...initial, structure: structureWithUnmappedPositions({ ...initial, structure: usableUnitStructure(initial) }, sourcePositions) });
  const changeKind = (kind: UnitSettings["kind"]) => setUnit((current) => ({ ...current, kind, structure: current.structure?.length ? current.structure : defaultUnitStructure(kind) }));
  return <Modal title="Параметри підрозділу" onClose={onClose} className="unit-editor-modal"><div className="operation-editor__body">
    <label className="form-field"><span>Тип підрозділу</span><Select ariaLabel="Тип підрозділу" value={unit.kind} onChange={(kind) => changeKind(kind as UnitSettings["kind"])} options={[{ value: "Рота", label: "Рота" }, { value: "Окремий взвод", label: "Окремий взвод" }, { value: "Інше", label: "Інше" }]} /></label>
    <label className="form-field"><span>Коротка назва</span><input autoFocus value={unit.shortName} onChange={(event) => setUnit((current) => ({ ...current, shortName: event.target.value }))} placeholder="РБАК" /></label>
    <label className="form-field"><span>Повна назва підрозділу</span><input value={unit.fullName ?? ""} onChange={(event) => setUnit((current) => ({ ...current, fullName: event.target.value }))} placeholder="Рота безпілотних авіаційних комплексів" /></label>
    <label className="form-field"><span>Номер військової частини</span><input value={unit.unitCode ?? ""} onChange={(event) => setUnit((current) => ({ ...current, unitCode: event.target.value.toUpperCase().replaceAll("A", "А") }))} placeholder="А0000" maxLength={5} /></label>
    <label className="form-field form-field--wide"><span>Чисельність за штатом</span><input type="number" min="0" value={unit.authorizedStrength || ""} onChange={(event) => setUnit((current) => ({ ...current, authorizedStrength: Number(event.target.value) || 0 }))} /></label>
    <UnitStructureEditor value={unit.structure ?? []} onChange={(structure) => setUnit((current) => ({ ...current, structure }))} />
  </div><footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={() => void onSave(unit)}>Зберегти</button></footer></Modal>;
}
