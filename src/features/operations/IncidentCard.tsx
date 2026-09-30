import { AlertTriangle, Archive, CalendarDays, Check, Clock3, Copy, FilePlus2, FileText, History, ListChecks, PackageOpen, Pencil, Trash2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import { SectionTabs } from "../../shared/ui/SectionTabs";
import { Select } from "../../shared/ui/Select";
import { incidentDateTimeParts } from "./incident-date";
import { incidentTypeConfig, incidentTypeLabel } from "./incident-config";
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
  onEdit?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
};

const incidentStatuses = ["Чернетка", "Зареєстровано", "Першочергові дії", "Опрацьовується", "Очікує", "Завершено", "Скасовано"];
const stepStatuses = ["Не розпочато", "В роботі", "Очікує", "Виконано", "Пропущено"];
const documentStatuses = ["Не створено", "Чернетка", "Сформовано", "Погоджено", "Зареєстровано", "Повернуто на доопрацювання"];
const documentRequirement: Record<string, { label: string; tone: string }> = {
  "Так": { label: "Обов’язковий", tone: "required" },
  "Ні": { label: "Необов’язковий", tone: "optional" },
  "Уточнити": { label: "Потребує уточнення", tone: "clarify" },
};
const fieldLabels: Record<string, string> = {
  ...incidentFieldLabels,
  sourceFlight: "Запис журналу польотів", battleOrder: "Бойове розпорядження", workStrip: "Смуга роботи", mission: "Завдання польоту", uavName: "БпЛА", uavType: "Тип БпЛА", uavSerialNumber: "Серійний номер БпЛА", payloadType: "БК / додаткове обладнання", payloadSerialNumber: "Серійний номер БК", damageKind: "Вид наслідку", vehicleName: "Автомобіль", vehicleRegistrationNumber: "Номерний знак", vehicleDriver: "Водій", vehicleStatus: "Стан автомобіля", explanations: "Пояснення осіб",
};
const hiddenLegacyFields = new Set(["reportChain", "reportMethod", "responsible", "explanation", "explanations", "writeoff", "notified", "officialDocumentStatus", "serviceActions", "investigation", "investigationResult", "restorationDate", "resolution", "locality", "mgrs"]);

function shortName(fullName?: string) {
  const parts = (fullName ?? "").trim().split(/\s+/u).filter(Boolean);
  if (!parts.length) return "особу не вказано";
  return `${parts[0].toLocaleUpperCase("uk")}${parts.length > 1 ? ` ${parts.slice(1).map((part) => `${part[0].toLocaleUpperCase("uk")}.`).join("")}` : ""}`;
}

export function incidentPrimaryName(incident: Incident, equipment: Equipment[], crews: Crew[]) {
  const people = (incident.personnelNames ?? []).filter((name) => name.trim());
  if (people.length) return `${shortName(people[0])}${people.length > 1 ? ` +${people.length - 1}` : ""}`;
  const vehicleDriver = typeof incident.eventData?.vehicleDriver === "string" ? incident.eventData.vehicleDriver : "";
  if (vehicleDriver.trim()) return shortName(vehicleDriver);
  const frozen = incident.crewSnapshot?.split(",").map((name) => name.trim()).find(Boolean);
  if (frozen) return shortName(frozen);
  const holder = [...(incident.equipmentIds ?? []), incident.equipmentId].filter((id): id is number => typeof id === "number").map((id) => equipment.find((item) => item.id === id)?.holderName).find((name) => name?.trim());
  if (holder) return shortName(holder);
  const crew = crews.find((item) => item.id === incident.crewId);
  const members = [...(crew?.members ?? []), ...(crew?.actualMembers ?? [])];
  return shortName((members.find((member) => member.position.toLocaleLowerCase("uk").includes("командир")) ?? members[0])?.fullName);
}

export function incidentCardTitle(incident: Incident, equipment: Equipment[], crews: Crew[]) {
  return `${incidentTypeLabel(incident)} - ${incidentPrimaryName(incident, equipment, crews)} - ${incidentDateTimeParts(incident.occurredAt).date}`;
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

function forwardOptions(values: string[], current: string, terminal: string[] = []) {
  if (terminal.includes(current)) return [{ value: current, label: current }];
  const index = Math.max(0, values.indexOf(current));
  const later = values.slice(index).filter((value) => !terminal.includes(value));
  return [...later.map((value) => ({ value, label: value })), ...terminal.filter((value) => value !== current).map((value) => ({ value, label: value }))];
}

function TransitionDialog({ title, from, to, reasonRequired = false, initialReason = "", onCancel, onConfirm }: { title: string; from: string; to: string; reasonRequired?: boolean; initialReason?: string; onCancel: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState(initialReason);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (reasonRequired && !reason.trim()) return;
    setBusy(true);
    try { await onConfirm(reason.trim()); onCancel(); } catch { /* The owner displays the domain error and the dialog stays open. */ } finally { setBusy(false); }
  };
  return <Modal title={title} subtitle={`${from} → ${to}`} onClose={onCancel} className="confirm-dialog incident-transition-dialog">
    <div className="confirm-dialog__message"><AlertTriangle /><div><p>Після підтвердження повернути попередній стан буде неможливо.</p>{reasonRequired && <label className="form-field"><span>Причина <b>*</b></span><textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder={to === "Пропущено" ? "Вкажіть причину пропуску" : "Вкажіть причину скасування"} /></label>}</div></div>
    <footer className="modal-actions"><button className="button" disabled={busy} onClick={onCancel}>Скасувати</button><button className="button primary" disabled={busy || (reasonRequired && !reason.trim())} onClick={() => void confirm()}>{busy ? "Збереження…" : "Підтвердити"}</button></footer>
  </Modal>;
}

export function IncidentCard({ incident, equipment, crews, tab, onTabChange, onClose, onStatusChange, onDataChange, onStepChange, onDocumentChange, onEdit, onDelete, onArchive }: Props) {
  const date = incidentDateTimeParts(incident.occurredAt);
  const assetNames = incident.equipmentNames?.join(" · ") || incident.equipmentName;
  const config = incidentTypeConfig(incident.incidentType);
  const steps = incident.steps ?? [];
  const documents = incident.documents ?? [];
  const history = incident.history ?? [];
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pendingStep, setPendingStep] = useState<{ step: IncidentStep; status: string } | null>(null);
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
  const relevantSystemFieldKeys = useMemo(() => {
    if (config.subject === "flight") return new Set(["sourceFlight", "battleOrder", "workStrip", "mission", "uavName", "uavType", "uavSerialNumber", "payloadType", "payloadSerialNumber"]);
    if (config.subject === "vehicle") return new Set(["vehicleName", "vehicleRegistrationNumber", "vehicleDriver", "vehicleStatus", "damageKind"]);
    return config.subject === "custom" ? null : new Set<string>();
  }, [config.subject]);
  const eventFields = useMemo(() => Object.entries(dataDraft.eventData ?? {}).filter(([key, value]) => !editableFieldKeys.has(key) && !hiddenLegacyFields.has(key) && (relevantSystemFieldKeys === null || relevantSystemFieldKeys.has(key)) && value !== "" && value !== null && value !== undefined), [dataDraft.eventData, editableFieldKeys, relevantSystemFieldKeys]);
  const explanations = useMemo(() => Array.isArray(dataDraft.eventData?.explanations) ? dataDraft.eventData.explanations.map((value) => value && typeof value === "object" ? value as Record<string, unknown> : {}).filter((value) => value.text) : [], [dataDraft.eventData]);
  useEffect(() => { setPendingStatus(null); setPendingStep(null); }, [incident.id, incident.status]);
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

  const close = () => {
    void persistData().catch(() => undefined).finally(onClose);
  };

  const overviewFields = [
    ...(config.subject === "person" ? [{ label: "Військовослужбовець", value: incident.personnelNames?.[0] }] : []),
    ...(config.subject === "vehicle" ? [{ label: "Автомобіль", value: incident.vehicleName }] : []),
    ...(config.showCrewContext && incident.crewName ? [{ label: "Екіпаж", value: incident.crewName }] : []),
    ...(config.showCrewContext && incident.positionName ? [{ label: "Позиція", value: incident.positionName }] : []),
    ...(config.assets && assetNames ? [{ label: incidentAssetLabel(incident.incidentType), value: assetNames }] : []),
  ];
  const dataFields = [
    { label: "Дата й час", value: `${date.date} · ${date.time}` },
    { label: "Стан", value: incident.status },
    ...overviewFields,
    ...(config.showCrewContext && incident.reconnaissanceArea ? [{ label: "Район позиції", value: incident.reconnaissanceArea }] : []),
  ];

  return <Modal title={incidentCardTitle(incident, equipment, crews)} subtitle={<span className="incident-card__subtitle"><span>Інцидент №{incident.id}</span><span>{incident.category || "Інше"}</span>{incident.archivedAt && <span>Архів · {incident.archiveReason}</span>}</span>} onClose={close} className="incident-card">
    <div className="incident-card__tabs"><SectionTabs tabs={tabs.map(({ id, name, icon: Icon }) => ({ id, label: name, icon: <Icon /> }))} value={tab} onChange={onTabChange} ariaLabel="Розділи інциденту" /></div>
    <div className="incident-card__body">
      {tab === "overview" && <>
        <div className="incident-card__summary-row"><div><b>{incidentTypeLabel(incident)}</b><span>{date.date} · {date.time}</span></div><span className="status-pill">{incident.status || "Чернетка"}</span>{steps.length > 0 && <div><b>{completed}/{steps.length}</b><span>кроків виконано</span></div>}</div>
        {overviewFields.length > 0 && <div className="incident-card__grid">{overviewFields.map((field) => <Field key={field.label} label={field.label} value={field.value} />)}</div>}
        <section className="incident-card__section"><h3>Короткий підсумок</h3><p>{incident.description || "Опис події ще не додано."}</p></section>
        <section className="incident-card__next"><ListChecks /><div><span>Наступна дія</span><b>{nextStep?.title || (steps.length ? "Обов’язкові кроки завершено" : "Алгоритм не налаштовано")}</b></div></section>
        {onStatusChange && <section className="incident-card__status-editor"><label><span>Стан інциденту</span><Select ariaLabel="Стан інциденту" value={incident.status} onChange={(value) => { if (value !== incident.status) setPendingStatus(value); }} options={forwardOptions(incidentStatuses, incident.status, ["Завершено", "Скасовано"])} /></label><small>Стан змінюється лише вперед і тільки після підтвердження.</small></section>}
      </>}
      {tab === "data" && <>
        <div className="incident-card__grid">{dataFields.map((field) => <Field key={field.label} label={field.label} value={field.value} />)}</div>
        {onDataChange && <section className="incident-card__data-editor"><div className="incident-card__data-editor-grid">
          {incident.incidentType === "Втрата БпЛА" && <><label className="form-field"><span>Етап польоту</span><Select ariaLabel="Етап польоту в картці" value={dataDraft.flightStage} onChange={(flightStage) => setDataDraft((current) => ({ ...current, flightStage }))} options={[{ value: "", label: "Не вказано" }, ...["Підготовка", "Пуск", "Політ", "Виконання завдання", "Повернення", "Посадка"].map((value) => ({ value, label: value }))]} /></label><label className="form-field"><span>Попередня причина</span><input value={dataDraft.preliminaryCause} onChange={(event) => setDataDraft((current) => ({ ...current, preliminaryCause: event.target.value }))} /></label></>}
          {editableFields.map((field) => <label key={field.key} className={`form-field ${field.wide ? "form-field--wide" : ""}`}><span>{field.label}</span>{field.inputType === "textarea" ? <textarea value={String(dataDraft.eventData[field.key] ?? "")} onChange={(event) => setDataDraft((current) => ({ ...current, eventData: { ...current.eventData, [field.key]: event.target.value } }))} placeholder={field.placeholder} /> : <input type={field.inputType ?? "text"} value={String(dataDraft.eventData[field.key] ?? "")} onChange={(event) => setDataDraft((current) => ({ ...current, eventData: { ...current.eventData, [field.key]: event.target.value } }))} placeholder={field.placeholder} />}</label>)}
          <label className="form-field form-field--wide"><span>Обставини події</span><textarea value={dataDraft.description} onChange={(event) => setDataDraft((current) => ({ ...current, description: event.target.value }))} /></label>
        </div><small>Зміни зберігаються автоматично.</small></section>}
        {eventFields.length > 0 && <section className="incident-card__data-list">{eventFields.map(([key, value]) => <Field key={key} label={fieldLabels[key] || key} value={valueText(value)} />)}</section>}
        {!onDataChange && editableFields.length > 0 && <section className="incident-card__data-list">{editableFields.map((field) => <Field key={field.key} label={field.label} value={valueText(incident.eventData?.[field.key])} />)}</section>}
        {explanations.length > 0 && <section className="incident-card__section"><h3>Свідки та пояснення</h3>{explanations.map((explanation, index) => <p key={`${String(explanation.personId ?? "")}-${index}`}><b>{String(explanation.person ?? `Свідок ${index + 1}`)}</b><br />{String(explanation.text ?? "")}</p>)}</section>}
        {config.subject === "person" && incident.personnelNames?.length > 0 && <section className="incident-card__section"><h3>Військовослужбовець</h3><p>{incident.personnelNames[0]}</p></section>}
        {incident.crewSnapshot && <section className="incident-card__section"><h3><UsersRound /> Склад екіпажу на момент події</h3><p>{incident.crewSnapshot}</p></section>}
        {!onDataChange && <section className="incident-card__section"><h3>Обставини</h3><p>{incident.description || unavailable}</p></section>}
      </>}
      {tab === "algorithm" && <>{steps.length ? <>
        <section className="incident-card__workflow-head"><div><h3>Контрольні кроки</h3><p>Обов’язкові дії та строки від фактичного часу події.</p></div><div className="incident-card__workflow-progress"><span><b>{completed}</b> із {steps.length}</span><i><span style={{ width: `${steps.length ? completed / steps.length * 100 : 0}%` }} /></i></div></section>
        {nextStep && <section className="incident-card__workflow-next"><span>Найближча дія</span><b>{nextStep.title}</b>{stepDeadline(nextStep.dueAt, false) && <small className={`incident-card__deadline is-${stepDeadline(nextStep.dueAt, false)?.tone}`}><Clock3 />{stepDeadline(nextStep.dueAt, false)?.label}</small>}</section>}
        <div className="incident-card__steps">{steps.map((step) => { const finished = ["Виконано", "Пропущено"].includes(step.status); const deadline = stepDeadline(step.dueAt, finished); return <article key={step.id} className={finished ? "is-complete" : ""}><span className="incident-card__step-number">{finished ? <Check /> : String(step.order).padStart(2, "0")}</span><div className="incident-card__step-content"><b>{step.title}{step.required ? <em>Обов’язково</em> : null}</b><small>{step.description}</small><div className="incident-card__step-meta">{deadline && <span className={`incident-card__deadline is-${deadline.tone}`} title={deadline.absolute}><Clock3 />{deadline.label}</span>}{step.completedAt && <span><Check />Виконано {compactDateTime(step.completedAt)}</span>}</div>{onStepChange && <input aria-label={`Коментар до кроку ${step.title}`} value={stepComments[step.id] ?? step.comment} onChange={(event) => setStepComments((current) => ({ ...current, [step.id]: event.target.value }))} onBlur={() => { const comment = stepComments[step.id]; if (comment !== undefined && comment !== step.comment) void onStepChange(step, step.status, comment); }} placeholder="Додати коментар…" />}{!onStepChange && step.comment && <small>Коментар: {step.comment}</small>}</div>{onStepChange ? <div className="incident-card__step-controls"><Select ariaLabel={`Стан кроку ${step.title}`} value={step.status} onChange={(value) => { if (value !== step.status) setPendingStep({ step, status: value }); }} options={forwardOptions(stepStatuses, step.status, ["Виконано", "Пропущено"])} /></div> : <span className="status-pill">{step.status}</span>}</article>; })}</div>
      </> : <div className="incident-card__empty"><ListChecks /><b>Алгоритм не налаштовано</b><p>Для цього типу ще немає контрольних кроків.</p></div>}</>}
      {tab === "documents" && <>{documents.length ? <>
        <section className="incident-card__workflow-head"><div><h3>Документи</h3><p>Кожен документ створюватиметься з даних інциденту після додавання погодженого шаблону.</p></div><div className="incident-card__document-count"><b>{readyDocuments}</b><span>із {documents.length} сформовано</span></div></section>
        <div className="incident-card__document-list">{documents.map((document) => { const requirement = documentRequirement[document.requirement ?? ""] ?? { label: "Обов’язковість не визначена", tone: "unknown" }; const copyAction = document.actionKind === "copy"; return <article key={document.id}><FileText /><div><b>{document.documentType}</b><span className={`incident-card__document-requirement is-${requirement.tone}`}>{requirement.label}</span><small>{document.updatedAt ? `Оновлено ${compactDateTime(document.updatedAt)}` : "Ще не створено"}</small></div>{onDocumentChange ? <Select ariaLabel={`Стан документа ${document.documentType}`} value={document.status} onChange={(value) => void onDocumentChange(document, value)} options={documentStatuses.map((value) => ({ value, label: value }))} /> : <span className="status-pill">{document.status}</span>}<button type="button" className="button compact incident-card__create-document" disabled title={copyAction ? "Текст повідомлення ще не додано" : "Шаблон документа ще не додано"}>{copyAction ? <Copy /> : <FilePlus2 />}{copyAction ? "Скопіювати текст" : "Створити документ"}</button></article>; })}</div>
      </> : <div className="incident-card__empty"><PackageOpen /><b>Документів ще немає</b><p>Для цього типу інциденту ще не додано перелік документів.</p></div>}</>}
      {tab === "history" && <>{history.length ? <div className="incident-card__history">{history.map((event) => <article key={event.id}><span /><div><b>{event.action}</b><p>{event.details}</p><small>{event.createdAt}</small></div></article>)}</div> : <div className="incident-card__empty"><History /><b>Історія порожня</b><p>Старий запис збережено без вигаданих подій.</p></div>}</>}
    </div>
    {(onEdit || onDelete || onArchive) && <footer className="modal-actions incident-card__actions">{onEdit && <button className="button" onClick={onEdit}><Pencil />Редагувати чернетку</button>}{onDelete && <button className="button danger" onClick={onDelete}><Trash2 />Видалити</button>}{onArchive && <button className="button" onClick={onArchive}><Archive />Архівувати</button>}</footer>}
    {pendingStatus && <TransitionDialog title="Підтвердити зміну стану інциденту" from={incident.status} to={pendingStatus} reasonRequired={pendingStatus === "Скасовано"} onCancel={() => setPendingStatus(null)} onConfirm={async (reason) => { await persistData(); await (onStatusChange?.(pendingStatus, reason) ?? Promise.resolve()); }} />}
    {pendingStep && <TransitionDialog title="Підтвердити зміну стану кроку" from={pendingStep.step.status} to={pendingStep.status} reasonRequired={pendingStep.status === "Пропущено"} initialReason={stepComments[pendingStep.step.id] ?? pendingStep.step.comment} onCancel={() => setPendingStep(null)} onConfirm={(reason) => onStepChange?.(pendingStep.step, pendingStep.status, reason || stepComments[pendingStep.step.id] || pendingStep.step.comment) ?? Promise.resolve()} />}
  </Modal>;
}
