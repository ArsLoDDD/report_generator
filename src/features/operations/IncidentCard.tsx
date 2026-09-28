import { AlertTriangle, CalendarDays, Check, Clock3, FilePlus2, FileText, History, ListChecks, PackageOpen, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import { SectionTabs } from "../../shared/ui/SectionTabs";
import { Select } from "../../shared/ui/Select";
import { incidentDateTimeParts } from "./incident-date";
import { incidentAssetLabel, incidentFieldLabels, incidentFieldsByType } from "./incident-fields";
import type { Crew, Equipment, Incident, IncidentDataDraft, IncidentDocument, IncidentStep } from "./types";

export type IncidentCardTab = "overview" | "data" | "algorithm" | "documents" | "history";
type Props = {
  incident: Incident;
  equipment: Equipment[];
  crews: Crew[];
  tab: IncidentCardTab;
  onTabChange: (tab: IncidentCardTab) => void;
  onClose: () => void;
  onStatusChange?: (status: string, reason: string) => Promise<void>;
  onDataChange?: (draft: IncidentDataDraft) => Promise<void>;
  onStepChange?: (step: IncidentStep, status: string, comment: string) => Promise<void>;
  onDocumentChange?: (document: IncidentDocument, status: string) => Promise<void>;
};

const incidentStatuses = ["Чернетка", "Зареєстровано", "Першочергові дії", "Опрацьовується", "Очікує", "Завершено", "Скасовано"];
const stepStatuses = ["Не розпочато", "В роботі", "Очікує", "Виконано", "Пропущено"];
const documentStatuses = ["Не створено", "Чернетка", "Сформовано", "Погоджено", "Зареєстровано", "Повернуто на доопрацювання"];
const fieldLabels: Record<string, string> = {
  ...incidentFieldLabels,
  sourceFlight: "Запис журналу польотів", battleOrder: "Бойове розпорядження", workStrip: "Смуга роботи", mission: "Завдання польоту", uavName: "БпЛА", uavType: "Тип БпЛА", uavSerialNumber: "Серійний номер БпЛА", payloadType: "БК / додаткове обладнання", payloadSerialNumber: "Серійний номер БК", damageKind: "Вид наслідку", explanations: "Пояснення осіб",
};
const hiddenLegacyFields = new Set(["reportChain", "reportMethod", "responsible", "explanation", "writeoff", "notified", "officialDocumentStatus", "serviceActions", "investigation", "investigationResult", "restorationDate", "resolution", "locality", "mgrs"]);

function shortName(fullName?: string) {
  const parts = (fullName ?? "").trim().split(/\s+/u).filter(Boolean);
  if (!parts.length) return "особу не вказано";
  return `${parts[0].toLocaleUpperCase("uk")}${parts.length > 1 ? ` ${parts.slice(1).map((part) => `${part[0].toLocaleUpperCase("uk")}.`).join("")}` : ""}`;
}

export function incidentPrimaryName(incident: Incident, equipment: Equipment[], crews: Crew[]) {
  const people = (incident.personnelNames ?? []).filter((name) => name.trim());
  if (people.length) return `${shortName(people[0])}${people.length > 1 ? ` +${people.length - 1}` : ""}`;
  const holder = [...(incident.equipmentIds ?? []), incident.equipmentId].filter((id): id is number => typeof id === "number").map((id) => equipment.find((item) => item.id === id)?.holderName).find((name) => name?.trim());
  if (holder) return shortName(holder);
  const frozen = incident.crewSnapshot?.split(",").map((name) => name.trim()).find(Boolean);
  if (frozen) return shortName(frozen);
  const crew = crews.find((item) => item.id === incident.crewId);
  const members = [...(crew?.members ?? []), ...(crew?.actualMembers ?? [])];
  return shortName((members.find((member) => member.position.toLocaleLowerCase("uk").includes("командир")) ?? members[0])?.fullName);
}

export function incidentCardTitle(incident: Incident, equipment: Equipment[], crews: Crew[]) {
  return `${incident.incidentType} - ${incidentPrimaryName(incident, equipment, crews)} - ${incidentDateTimeParts(incident.occurredAt).date}`;
}

const tabs: { id: IncidentCardTab; name: string; icon: typeof AlertTriangle }[] = [
  { id: "overview", name: "Огляд", icon: AlertTriangle }, { id: "data", name: "Дані події", icon: CalendarDays }, { id: "algorithm", name: "Алгоритм", icon: ListChecks }, { id: "documents", name: "Документи", icon: FileText }, { id: "history", name: "Історія", icon: History },
];
const unavailable = "Не зафіксовано";

function storedDateTime(value?: string) {
  const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/u);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
}

function compactDateTime(value?: string) {
  const date = storedDateTime(value);
  if (!date) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function durationText(milliseconds: number) {
  const totalMinutes = Math.max(1, Math.ceil(Math.abs(milliseconds) / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days} д ${hours ? `${hours} год` : ""}`.trim();
  if (hours) return `${hours} год ${minutes ? `${minutes} хв` : ""}`.trim();
  return `${minutes} хв`;
}

function stepDeadline(dueAt: string, finished: boolean) {
  const due = storedDateTime(dueAt);
  if (!due) return null;
  const now = new Date();
  const absolute = `до ${compactDateTime(dueAt)}`;
  if (finished) return { label: `Строк: ${absolute}`, tone: "done", absolute };
  const difference = due.getTime() - now.getTime();
  if (difference < 0) return { label: `Прострочено на ${durationText(difference)}`, tone: "overdue", absolute };
  const sameDay = due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate();
  if (sameDay) return { label: `Сьогодні о ${due.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`, tone: "today", absolute };
  return { label: `Залишилось ${durationText(difference)}`, tone: "upcoming", absolute };
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div className="incident-card__field"><span>{label}</span><b>{value?.trim() || unavailable}</b></div>;
}

function valueText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" && item ? Object.values(item as Record<string, unknown>).filter(Boolean).join(" — ") : String(item)).join("; ");
  if (typeof value === "boolean") return value ? "Так" : "Ні";
  if (value === null || value === undefined || value === "") return unavailable;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function IncidentCard({ incident, equipment, crews, tab, onTabChange, onClose, onStatusChange, onDataChange, onStepChange, onDocumentChange }: Props) {
  const date = incidentDateTimeParts(incident.occurredAt);
  const assetNames = incident.equipmentNames?.join(" · ") || incident.equipmentName;
  const steps = incident.steps ?? [];
  const documents = incident.documents ?? [];
  const history = incident.history ?? [];
  const [status, setStatus] = useState(incident.status || "Чернетка");
  const [reason, setReason] = useState("");
  const [stepComments, setStepComments] = useState<Record<number, string>>({});
  const initialData = useMemo<IncidentDataDraft>(() => ({ description: incident.description, flightStage: incident.flightStage, preliminaryCause: incident.preliminaryCause, eventData: incident.eventData ?? {} }), [incident.description, incident.eventData, incident.flightStage, incident.preliminaryCause]);
  const [dataDraft, setDataDraft] = useState<IncidentDataDraft>(initialData);
  const savedDataRef = useRef(JSON.stringify(initialData));
  const dataDraftRef = useRef(dataDraft);
  const savingDataRef = useRef<Promise<void> | null>(null);
  const queuedDataSignatureRef = useRef("");
  const completed = steps.filter((step) => ["Виконано", "Пропущено"].includes(step.status)).length;
  const nextStep = steps.find((step) => !["Виконано", "Пропущено"].includes(step.status));
  const readyDocuments = documents.filter((document) => !["Не створено", "Чернетка"].includes(document.status)).length;
  const editableFields = useMemo(() => incidentFieldsByType[incident.incidentType] ?? [], [incident.incidentType]);
  const editableFieldKeys = useMemo(() => new Set(editableFields.map((field) => field.key)), [editableFields]);
  const eventFields = useMemo(() => Object.entries(dataDraft.eventData ?? {}).filter(([key, value]) => !editableFieldKeys.has(key) && !hiddenLegacyFields.has(key) && value !== "" && value !== null && value !== undefined), [dataDraft.eventData, editableFieldKeys]);
  useEffect(() => { setStatus(incident.status || "Чернетка"); setReason(""); }, [incident.id, incident.status]);
  useEffect(() => { setDataDraft(initialData); dataDraftRef.current = initialData; savedDataRef.current = JSON.stringify(initialData); }, [incident.id, initialData]);
  useEffect(() => { dataDraftRef.current = dataDraft; }, [dataDraft]);

  const persistData = useCallback(async () => {
    if (!onDataChange) return;
    const next = dataDraftRef.current;
    const signature = JSON.stringify(next);
    if (signature === savedDataRef.current) return;
    if (signature === queuedDataSignatureRef.current && savingDataRef.current) return savingDataRef.current;
    const previous = savingDataRef.current ?? Promise.resolve();
    queuedDataSignatureRef.current = signature;
    const saving = previous.catch(() => undefined).then(() => onDataChange(next)).then(() => { savedDataRef.current = signature; }).finally(() => {
      if (queuedDataSignatureRef.current === signature) {
        queuedDataSignatureRef.current = "";
        savingDataRef.current = null;
      }
    });
    savingDataRef.current = saving;
    await saving;
  }, [onDataChange]);
  useEffect(() => {
    if (!onDataChange || JSON.stringify(dataDraft) === savedDataRef.current) return;
    const timeout = window.setTimeout(() => { void persistData().catch(() => undefined); }, 500);
    return () => window.clearTimeout(timeout);
  }, [dataDraft, onDataChange, persistData]);

  const changeStatus = (nextStatus: string) => {
    setStatus(nextStatus);
    if (nextStatus !== "Скасовано" && nextStatus !== incident.status) void onStatusChange?.(nextStatus, "");
  };
  const close = () => {
    const statusSave = status === "Скасовано" && status !== incident.status && reason.trim() ? onStatusChange?.(status, reason.trim()) : Promise.resolve();
    void Promise.all([statusSave, persistData()]).catch(() => undefined).finally(onClose);
  };

  return <Modal title={incidentCardTitle(incident, equipment, crews)} subtitle={<span className="incident-card__subtitle"><span>Інцидент №{incident.id}</span><span>{incident.category || "Інше"}</span></span>} onClose={close} className="incident-card">
    <div className="incident-card__tabs"><SectionTabs tabs={tabs.map(({ id, name, icon: Icon }) => ({ id, label: name, icon: <Icon /> }))} value={tab} onChange={onTabChange} ariaLabel="Розділи інциденту" /></div>
    <div className="incident-card__body">
      {tab === "overview" && <>
        <div className="incident-card__summary-row"><div><b>{incident.incidentType}</b><span>{date.date} · {date.time}</span></div><span className="status-pill">{incident.status || "Чернетка"}</span>{steps.length > 0 && <div><b>{completed}/{steps.length}</b><span>кроків виконано</span></div>}</div>
        <div className="incident-card__grid"><Field label="Основна особа" value={incidentPrimaryName(incident, equipment, crews)} /><Field label="Екіпаж" value={incident.crewName} /><Field label="Позиція" value={incident.positionName} /><Field label={incidentAssetLabel(incident.incidentType)} value={assetNames} /></div>
        <section className="incident-card__section"><h3>Короткий підсумок</h3><p>{incident.description || "Опис події ще не додано."}</p></section>
        <section className="incident-card__next"><ListChecks /><div><span>Наступна дія</span><b>{nextStep?.title || (steps.length ? "Обов’язкові кроки завершено" : "Алгоритм не налаштовано")}</b></div></section>
        {onStatusChange && <section className="incident-card__status-editor"><label><span>Стан інциденту</span><Select ariaLabel="Стан інциденту" value={status} onChange={changeStatus} options={incidentStatuses.map((value) => ({ value, label: value }))} /></label>{status === "Скасовано" && <label><span>Причина скасування</span><input value={reason} onChange={(event) => setReason(event.target.value)} onBlur={() => { if (reason.trim() && status !== incident.status) void onStatusChange(status, reason.trim()); }} /></label>}</section>}
      </>}
      {tab === "data" && <>
        <div className="incident-card__grid"><Field label="Дата й час" value={`${date.date} · ${date.time}`} /><Field label="Стан" value={incident.status} /><Field label="Екіпаж" value={incident.crewName} /><Field label="Позиція" value={incident.positionName} /><Field label="Район" value={incident.reconnaissanceArea} /><Field label={incidentAssetLabel(incident.incidentType)} value={assetNames} />{incident.vehicleName && <Field label="Автомобіль" value={incident.vehicleName} />}</div>
        {onDataChange && <section className="incident-card__data-editor"><div className="incident-card__data-editor-grid">
          {incident.incidentType === "Втрата БпЛА" && <><label className="form-field"><span>Етап польоту</span><Select ariaLabel="Етап польоту в картці" value={dataDraft.flightStage} onChange={(flightStage) => setDataDraft((current) => ({ ...current, flightStage }))} options={[{ value: "", label: "Не вказано" }, ...["Підготовка", "Пуск", "Політ", "Виконання завдання", "Повернення", "Посадка"].map((value) => ({ value, label: value }))]} /></label><label className="form-field"><span>Попередня причина</span><input value={dataDraft.preliminaryCause} onChange={(event) => setDataDraft((current) => ({ ...current, preliminaryCause: event.target.value }))} /></label></>}
          {editableFields.map((field) => <label key={field.key} className={`form-field ${field.wide ? "form-field--wide" : ""}`}><span>{field.label}</span>{field.inputType === "textarea" ? <textarea value={String(dataDraft.eventData[field.key] ?? "")} onChange={(event) => setDataDraft((current) => ({ ...current, eventData: { ...current.eventData, [field.key]: event.target.value } }))} placeholder={field.placeholder} /> : <input type={field.inputType ?? "text"} value={String(dataDraft.eventData[field.key] ?? "")} onChange={(event) => setDataDraft((current) => ({ ...current, eventData: { ...current.eventData, [field.key]: event.target.value } }))} placeholder={field.placeholder} />}</label>)}
          <label className="form-field form-field--wide"><span>Обставини події</span><textarea value={dataDraft.description} onChange={(event) => setDataDraft((current) => ({ ...current, description: event.target.value }))} /></label>
        </div><small>Зміни зберігаються автоматично.</small></section>}
        {eventFields.length > 0 && <section className="incident-card__data-list">{eventFields.map(([key, value]) => <Field key={key} label={fieldLabels[key] || key} value={valueText(value)} />)}</section>}
        {incident.personnelNames?.length > 0 && <section className="incident-card__section"><h3>Особи події</h3><p>{incident.personnelNames.join(" · ")}</p></section>}
        {incident.crewSnapshot && <section className="incident-card__section"><h3><UsersRound /> Склад екіпажу на момент події</h3><p>{incident.crewSnapshot}</p></section>}
        {!onDataChange && <section className="incident-card__section"><h3>Обставини</h3><p>{incident.description || unavailable}</p></section>}
      </>}
      {tab === "algorithm" && <>{steps.length ? <>
        <section className="incident-card__workflow-head"><div><h3>Контрольні кроки</h3><p>Обов’язкові дії та строки від фактичного часу події.</p></div><div className="incident-card__workflow-progress"><span><b>{completed}</b> із {steps.length}</span><i><span style={{ width: `${steps.length ? completed / steps.length * 100 : 0}%` }} /></i></div></section>
        {nextStep && <section className="incident-card__workflow-next"><span>Найближча дія</span><b>{nextStep.title}</b>{stepDeadline(nextStep.dueAt, false) && <small className={`incident-card__deadline is-${stepDeadline(nextStep.dueAt, false)?.tone}`}><Clock3 />{stepDeadline(nextStep.dueAt, false)?.label}</small>}</section>}
        <div className="incident-card__steps">{steps.map((step) => { const finished = ["Виконано", "Пропущено"].includes(step.status); const deadline = stepDeadline(step.dueAt, finished); return <article key={step.id} className={finished ? "is-complete" : ""}><span className="incident-card__step-number">{finished ? <Check /> : String(step.order).padStart(2, "0")}</span><div className="incident-card__step-content"><b>{step.title}{step.required ? <em>Обов’язково</em> : null}</b><small>{step.description}</small><div className="incident-card__step-meta">{deadline && <span className={`incident-card__deadline is-${deadline.tone}`} title={deadline.absolute}><Clock3 />{deadline.label}</span>}{step.completedAt && <span><Check />Виконано {compactDateTime(step.completedAt)}</span>}</div>{onStepChange && <input aria-label={`Коментар до кроку ${step.title}`} value={stepComments[step.id] ?? step.comment} onChange={(event) => setStepComments((current) => ({ ...current, [step.id]: event.target.value }))} onBlur={() => { const comment = stepComments[step.id]; if (comment !== undefined && comment !== step.comment) void onStepChange(step, step.status, comment); }} placeholder="Коментар або причина пропуску" />}{!onStepChange && step.comment && <small>Коментар: {step.comment}</small>}</div>{onStepChange ? <div className="incident-card__step-controls"><Select ariaLabel={`Стан кроку ${step.title}`} value={step.status} onChange={(value) => void onStepChange(step, value, stepComments[step.id] ?? step.comment)} options={stepStatuses.map((value) => ({ value, label: value }))} /></div> : <span className="status-pill">{step.status}</span>}</article>; })}</div>
      </> : <div className="incident-card__empty"><ListChecks /><b>Алгоритм не налаштовано</b><p>Для цього типу ще немає контрольних кроків.</p></div>}</>}
      {tab === "documents" && <>{documents.length ? <>
        <section className="incident-card__workflow-head"><div><h3>Документи</h3><p>Кожен документ створюватиметься з даних інциденту після додавання погодженого шаблону.</p></div><div className="incident-card__document-count"><b>{readyDocuments}</b><span>із {documents.length} сформовано</span></div></section>
        <div className="incident-card__document-list">{documents.map((document) => <article key={document.id}><FileText /><div><b>{document.documentType}</b><small>{document.updatedAt ? `Оновлено ${compactDateTime(document.updatedAt)}` : "Ще не створено"}</small></div>{onDocumentChange ? <Select ariaLabel={`Стан документа ${document.documentType}`} value={document.status} onChange={(value) => void onDocumentChange(document, value)} options={documentStatuses.map((value) => ({ value, label: value }))} /> : <span className="status-pill">{document.status}</span>}<button type="button" className="button compact incident-card__create-document" disabled title="Шаблон документа ще не додано"><FilePlus2 />Створити документ</button></article>)}</div>
      </> : <div className="incident-card__empty"><PackageOpen /><b>Документів ще немає</b><p>Для цього типу інциденту ще не додано перелік документів.</p></div>}</>}
      {tab === "history" && <>{history.length ? <div className="incident-card__history">{history.map((event) => <article key={event.id}><span /><div><b>{event.action}</b><p>{event.details}</p><small>{event.createdAt}</small></div></article>)}</div> : <div className="incident-card__empty"><History /><b>Історія порожня</b><p>Старий запис збережено без вигаданих подій.</p></div>}</>}
    </div>
  </Modal>;
}
