import { useState, type FormEvent } from "react";
import type { PersonnelDraft } from "../../../shared/types/domain";
import { personnelCoreFields } from "../../../shared/constants/personnelCoreFields";
import { Select } from "../../../shared/ui/Select";

export const emptyPersonnelDraft: PersonnelDraft = {
  rank: "", surname: "", givenName: "", patronymic: "", position: "", taxId: "", birthDate: "",
  educationLevel: "", educationDetails: "", armedForcesServiceStartDate: "", positionAssignedDate: "",
  positionAssignmentOrder: "", militaryId: "", assignedVehicleName: "", assignedVehicleRegistration: "", gender: "", coreFields: {}
};

type DraftKey = Exclude<keyof PersonnelDraft, "coreFields">;
const fields: Array<{ key: DraftKey; label: string; placeholder: string; wide?: boolean; required?: boolean }> = [
  { key: "rank", label: "Звання", placeholder: "Солдат", required: true },
  { key: "surname", label: "Прізвище", placeholder: "ВАСИЛЬОК", required: true },
  { key: "givenName", label: "Ім’я", placeholder: "Іван", required: true },
  { key: "patronymic", label: "По батькові", placeholder: "Аркадійович" },
  { key: "position", label: "Посада (повна з військовою частиною)", placeholder: "Стрілець, військова частина А0000", wide: true, required: true },
  { key: "taxId", label: "ІПН / ідентифікатор", placeholder: "7462389812", required: true },
  { key: "birthDate", label: "Дата народження", placeholder: "02.03.1999 року" },
  { key: "educationLevel", label: "Формат освіти", placeholder: "вища" },
  { key: "educationDetails", label: "Де отримана освіта", placeholder: "Львівська комерційна академія у 2002р", wide: true },
  { key: "armedForcesServiceStartDate", label: "З якого часу в ЗСУ", placeholder: "у ЗС — із 27.02.2022 року", wide: true },
  { key: "positionAssignedDate", label: "Дата призначення на посаду", placeholder: "02.08.2026 року" },
  { key: "positionAssignmentOrder", label: "Наказ призначення на посаду", placeholder: "КВ ОК «Пуп» №000-ПС", wide: true },
  { key: "militaryId", label: "Військовий квиток", placeholder: "АВ №077672" }
];

type PersonnelFormProps = {
  initialValue: PersonnelDraft;
  submitLabel: string;
  onSubmit: (draft: PersonnelDraft) => Promise<void>;
  onCancel: () => void;
};

export function PersonnelForm({ initialValue, submitLabel, onSubmit, onCancel }: PersonnelFormProps) {
  const [draft, setDraft] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const change = (key: DraftKey, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const changeCore = (key: string, value: string) => setDraft((current) => ({ ...current, coreFields: { ...current.coreFields, [key]: value } }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.taxId.trim()) { setValidationMessage("Вкажіть ІПН або інший ідентифікатор."); return; }
    setValidationMessage(null); setIsSaving(true);
    try { await onSubmit(draft); } finally { setIsSaving(false); }
  };
  return <form className="personnel-form" onSubmit={(event) => void submit(event)}>
    <div className="personnel-form__scroll"><div className="personnel-form__grid"><div className="form-field"><span>Стать</span><Select ariaLabel="Стать" value={draft.gender} onChange={(value) => change("gender", value)} options={[{ value: "", label: "Визначати автоматично" }, { value: "чоловіча", label: "Чоловіча" }, { value: "жіноча", label: "Жіноча" }]} /></div>{fields.map((field) => <label key={field.key} className={field.wide ? "form-field form-field--wide" : "form-field"}><span>{field.label}{field.required && <b> *</b>}</span><input value={draft[field.key]} placeholder={field.placeholder} required={field.required} onChange={(event) => change(field.key, event.target.value)} /></label>)}</div><h3 className="personnel-form__section-title">Додаткові основні дані</h3><div className="personnel-form__grid">{personnelCoreFields.filter(([key]) => key !== "full_name").map(([key, label]) => <label key={key} className="form-field"><span>{label}</span><input value={draft.coreFields?.[key] ?? ""} onChange={(event) => changeCore(key, event.target.value)} /></label>)}</div>{!draft.gender && <p className="form-warning">Стать не вказана. Під час відмінювання програма спробує визначити її за ПІБ і попередить, якщо це неможливо.</p>}{validationMessage && <p className="form-error" role="alert">{validationMessage}</p>}</div>
    <footer className="modal-actions"><button className="button" type="button" onClick={onCancel} disabled={isSaving}>Скасувати</button><button className="button primary" type="submit" disabled={isSaving}>{isSaving ? "Збереження…" : submitLabel}</button></footer>
  </form>;
}
