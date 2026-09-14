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
      <fieldset className="form-field form-field--wide summary-report-settings"><legend>Реквізити підсумкового донесення</legend><div className="operation-editor__grid">
        <label className="form-field form-field--wide"><span>Повна назва батальйону</span><input value={unit.battalionFullName ?? ""} onChange={(event)=>setUnit((current)=>({...current,battalionFullName:event.target.value}))}/></label>
        <label className="form-field"><span>Коротка назва батальйону</span><input value={unit.battalionShortName ?? ""} onChange={(event)=>setUnit((current)=>({...current,battalionShortName:event.target.value}))}/></label>
        <label className="form-field"><span>Коротка назва військової частини</span><input value={unit.militaryUnitShortName ?? ""} onChange={(event)=>setUnit((current)=>({...current,militaryUnitShortName:event.target.value}))} placeholder="414 ОББпС"/></label>
        <label className="form-field form-field--wide"><span>Адресат донесення</span><input value={unit.reportRecipient ?? ""} onChange={(event)=>setUnit((current)=>({...current,reportRecipient:event.target.value}))}/></label>
        <label className="form-field"><span>Назва КСП</span><input value={unit.kspName ?? ""} onChange={(event)=>setUnit((current)=>({...current,kspName:event.target.value}))}/></label>
        <label className="form-field"><span>Населений пункт КСП</span><input value={unit.kspLocality ?? ""} onChange={(event)=>setUnit((current)=>({...current,kspLocality:event.target.value}))}/></label>
        <label className="form-field"><span>Координати КСП</span><input value={unit.kspMgrs ?? ""} onChange={(event)=>setUnit((current)=>({...current,kspMgrs:event.target.value}))}/></label>
        <label className="form-field"><span>Номер АК</span><input value={unit.armyCorpsNumber ?? ""} onChange={(event)=>setUnit((current)=>({...current,armyCorpsNumber:event.target.value}))}/></label>
        <label className="form-field"><span>Номер АРМ</span><input value={unit.armNumber ?? ""} onChange={(event)=>setUnit((current)=>({...current,armNumber:event.target.value}))}/></label>
      </div></fieldset>
    <UnitStructureEditor value={unit.structure ?? []} onChange={(structure) => setUnit((current) => ({ ...current, structure }))} />
  </div><footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={() => void onSave(unit)}>Зберегти</button></footer></Modal>;
}
