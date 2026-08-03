import { useState, type FormEvent } from "react";
import type { PersonnelDraft } from "../../../shared/types/domain";

export const emptyPersonnelDraft: PersonnelDraft = {
  rank: "", surname: "", givenName: "", patronymic: "", position: "", taxId: "", birthDate: "",
  educationLevel: "", educationDetails: "", armedForcesServiceStartDate: "", positionAssignedDate: "",
  positionAssignmentOrder: "", militaryId: "", assignedVehicleName: "", assignedVehicleRegistration: ""
};

type DraftKey = keyof PersonnelDraft;
const fields: Array<{ key: DraftKey; label: string; placeholder: string; wide?: boolean; required?: boolean }> = [
  { key: "rank", label: "Звання", placeholder: "Солдат", required: true },
  { key: "surname", label: "Прізвище", placeholder: "ВАСИЛЬОК", required: true },
  { key: "givenName", label: "Ім’я", placeholder: "Іван", required: true },
  { key: "patronymic", label: "По батькові", placeholder: "Аркадійович" },
  { key: "position", label: "Посада (повна з військовою частиною)", placeholder: "Стрілець, військова частина А0000", wide: true, required: true },
  { key: "taxId", label: "ІПН", placeholder: "7462389812", required: true },
  { key: "birthDate", label: "Дата народження", placeholder: "02.03.1999 року" },
  { key: "educationLevel", label: "Формат освіти", placeholder: "вища" },
  { key: "educationDetails", label: "Де отримана освіта", placeholder: "Львівська комерційна академія у 2002р", wide: true },
  { key: "armedForcesServiceStartDate", label: "З якого часу в ЗСУ", placeholder: "у ЗС — із 27.02.2022 року", wide: true },
  { key: "positionAssignedDate", label: "Дата призначення на посаду", placeholder: "02.08.2026 року" },
  { key: "positionAssignmentOrder", label: "Наказ призначення на посаду", placeholder: "КВ ОК «Пуп» №000-ПС", wide: true },
  { key: "militaryId", label: "Військовий квиток", placeholder: "АВ №077672" },
  { key: "assignedVehicleName", label: "Закріплений автомобіль", placeholder: "Great Wall" },
  { key: "assignedVehicleRegistration", label: "Номер автомобіля", placeholder: "АВ 7265" }
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
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (draft.taxId.length !== 10 || !/^\d{10}$/.test(draft.taxId)) { setValidationMessage("ІПН має містити рівно 10 цифр."); return; }
    setValidationMessage(null); setIsSaving(true);
    try { await onSubmit(draft); } finally { setIsSaving(false); }
  };
  return <form className="personnel-form" onSubmit={(event) => void submit(event)}>
    <div className="personnel-form__scroll"><div className="personnel-form__grid">{fields.map((field) => <label key={field.key} className={field.wide ? "form-field form-field--wide" : "form-field"}><span>{field.label}{field.required && <b> *</b>}</span><input value={draft[field.key]} placeholder={field.placeholder} required={field.required} onChange={(event) => change(field.key, event.target.value)} /></label>)}</div>{validationMessage && <p className="form-error" role="alert">{validationMessage}</p>}</div>
    <footer className="modal-actions"><button className="button" type="button" onClick={onCancel} disabled={isSaving}>Скасувати</button><button className="button primary" type="submit" disabled={isSaving}>{isSaving ? "Збереження…" : submitLabel}</button></footer>
  </form>;
}
