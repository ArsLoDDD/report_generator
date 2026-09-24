import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { defaultUnitStructure } from "../../shared/unit-structure";
import { Modal } from "../../shared/ui/Modal";
import { Select } from "../../shared/ui/Select";
import { UnitStructureEditor } from "../settings/components/UnitStructureEditor";
import type { UnitSettings } from "../../shared/types/domain";
import type { AdminUnit, AdminUnitDraft, AdminUnitType } from "./adminTypes";

const unitTypeOptions: { value: AdminUnitType; label: string }[] = [
  { value: "Батальйон", label: "Батальйон" },
  { value: "Рота", label: "Рота" },
  { value: "Окремий взвод", label: "Окремий взвод" },
  { value: "Взвод", label: "Взвод у складі підрозділу" },
  { value: "Служба", label: "Майнова / інша служба" },
  { value: "Інше", label: "Інший тип" },
];

function skeletonKind(type: AdminUnitType): UnitSettings["kind"] {
  if (type === "Рота") return "Рота";
  if (type === "Окремий взвод" || type === "Взвод") return "Окремий взвод";
  return "Інше";
}

export function emptyAdminUnitDraft(): AdminUnitDraft {
  return {
    type: "Рота",
    shortName: "",
    fullName: "",
    unitCode: "",
    authorizedStrength: 0,
    structure: defaultUnitStructure("Рота"),
    metadata: {},
  };
}

function toDraft(unit: AdminUnit): AdminUnitDraft {
  return {
    parentUnitId: unit.parentUnitId,
    type: unit.type,
    shortName: unit.shortName,
    fullName: unit.fullName,
    unitCode: unit.unitCode,
    authorizedStrength: unit.authorizedStrength,
    structure: unit.structure,
    metadata: unit.metadata,
  };
}

export function AdminUnitEditor({ unit, units, busy, onClose, onSave }: {
  unit?: AdminUnit;
  units: AdminUnit[];
  busy: boolean;
  onClose: () => void;
  onSave: (draft: AdminUnitDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AdminUnitDraft>(() => unit ? toDraft(unit) : emptyAdminUnitDraft());
  const [error, setError] = useState("");
  const parentOptions = useMemo(() => [
    { value: "", label: "Без батьківського підрозділу" },
    ...units.filter((item) => item.id !== unit?.id && item.status !== "archived").map((item) => ({ value: item.id, label: `${item.shortName} · ${item.type}` })),
  ], [unit?.id, units]);
  const changeType = (type: AdminUnitType) => setDraft((current) => ({
    ...current,
    type,
    structure: current.structure.length ? current.structure : defaultUnitStructure(skeletonKind(type)),
  }));
  const resetSkeleton = () => {
    if (draft.structure.length && !window.confirm("Замінити поточний скелет типовою структурою? Власні блоки й посади буде втрачено.")) return;
    setDraft((current) => ({ ...current, structure: defaultUnitStructure(skeletonKind(current.type)) }));
  };
  const submit = async () => {
    if (!draft.shortName.trim()) { setError("Вкажіть коротку назву підрозділу."); return; }
    if (!draft.fullName.trim()) { setError("Вкажіть повну назву підрозділу."); return; }
    if (!draft.structure.length) { setError("Скелет підрозділу не може бути порожнім."); return; }
    setError("");
    await onSave({
      ...draft,
      shortName: draft.shortName.trim(),
      fullName: draft.fullName.trim(),
      unitCode: draft.unitCode?.trim() || undefined,
      parentUnitId: draft.parentUnitId || undefined,
    });
  };
  return <Modal
    title={unit ? `Редагування: ${unit.shortName}` : "Новий підрозділ"}
    subtitle={unit ? "Зміни збережуться локально й сформують нову версію сіду." : "Картка залишиться локально; сервер отримає лише сід і випустить основний код."}
    onClose={onClose}
    className="admin-unit-editor"
  >
    <div className="admin-unit-editor__body">
      <div className="admin-unit-editor__grid">
        <label className="form-field"><span>Тип підрозділу</span><Select ariaLabel="Тип підрозділу" value={draft.type} onChange={(value) => changeType(value as AdminUnitType)} options={unitTypeOptions} /></label>
        <label className="form-field"><span>Підпорядкування</span><Select ariaLabel="Батьківський підрозділ" value={draft.parentUnitId ?? ""} onChange={(parentUnitId) => setDraft((current) => ({ ...current, parentUnitId: parentUnitId || undefined }))} options={parentOptions} /></label>
        <label className="form-field"><span>Коротка назва *</span><input autoFocus value={draft.shortName} onChange={(event) => setDraft((current) => ({ ...current, shortName: event.target.value }))} placeholder="4 РБАК" /></label>
        <label className="form-field"><span>Номер / код частини</span><input value={draft.unitCode ?? ""} onChange={(event) => setDraft((current) => ({ ...current, unitCode: event.target.value }))} placeholder="Необов'язково" /></label>
        <label className="form-field form-field--wide"><span>Повна назва *</span><input value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} placeholder="Повна офіційна назва підрозділу" /></label>
        <label className="form-field"><span>Чисельність за штатом</span><input type="number" min="0" value={draft.authorizedStrength || ""} onChange={(event) => setDraft((current) => ({ ...current, authorizedStrength: Math.max(0, Number(event.target.value) || 0) }))} /></label>
        <div className="admin-unit-editor__reset"><span>Типовий скелет</span><button className="button" type="button" onClick={resetSkeleton}><RotateCcw />Завантажити для типу</button></div>
      </div>
      <UnitStructureEditor value={draft.structure} onChange={(structure) => setDraft((current) => ({ ...current, structure }))} />
      {error && <div className="admin-form-error" role="alert">{error}</div>}
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={() => void submit()}>{busy ? "Збереження…" : unit ? "Зберегти зміни" : "Створити й отримати код"}</button></footer>
  </Modal>;
}
