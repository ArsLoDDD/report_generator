import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, History, ListChecks, LockKeyhole, Pencil, Plus, RefreshCw, Search, UsersRound } from "lucide-react";
import type { Person } from "../../../shared/types/domain";
import { Modal } from "../../../shared/ui/Modal";
import { Select } from "../../../shared/ui/Select";
import { useNotifications } from "../../../shared/ui/NotificationProvider";
import { includesSearch } from "../../../shared/utils/search";
import { personnelControlService } from "../services/personnelControlService";
import { blocksManualPersonnelAssignment, controlPeriod, controlTab, controlTabs, formatControlDate, formatControlDateTime, MANUAL_PERSONNEL_LOCATIONS, personnelLocationRequiresEndDate, personnelLocationRequiresInstitution, personnelLocationShowsEndDate, personnelLocationShowsInstitution, todayLocal, validatePersonnelControlDraft } from "../personnel-control-model";
import type { ManualPersonnelLocation, PersonnelControlDraft, PersonnelControlHistoryEvent, PersonnelControlRecord } from "../types";

type PersonnelControlProps = {
  people: Person[];
  hasMorePeople: boolean;
  onLoadMorePeople: () => Promise<void>;
};

const emptyDraft = (): PersonnelControlDraft => ({
  personnelId: 0,
  locationType: "НАВЧ",
  institution: "",
  startDate: todayLocal(),
  endDate: "",
  notes: "",
});

const sourceNames = {
  automatic: "Автоматично",
  manual: "Вручну",
  bcs: "БЧС",
} as const;

const historyActionNames: Record<string, string> = {
  created: "Додано",
  updated: "Оновлено",
  closed: "Завершено",
  create: "Додано",
  update: "Оновлено",
  close: "Завершено",
  migrated: "Перенесено зі старої бази",
};

const HISTORY_PAGE_SIZE = 100;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Сталася невідома помилка.";
}

function recordPlace(record: PersonnelControlRecord) {
  return record.institution.trim() || record.positionName.trim() || record.crewName.trim() || "—";
}

function ManualAssignmentModal({ people, unavailablePersonnelIds, record, onClose, onSaved }: {
  people: Person[];
  unavailablePersonnelIds: Set<number>;
  record: PersonnelControlRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { notify } = useNotifications();
  const [selectedPersonnelIds, setSelectedPersonnelIds] = useState<number[]>(() => record ? [record.personnelId] : []);
  const [draft, setDraft] = useState<PersonnelControlDraft>(() => record ? {
    personnelId: record.personnelId,
    locationType: record.locationType as ManualPersonnelLocation,
    institution: record.institution,
    startDate: record.startDate,
    endDate: record.endDate,
    notes: record.notes,
  } : emptyDraft());
  const [errors, setErrors] = useState<ReturnType<typeof validatePersonnelControlDraft>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PersonnelControlDraft>(key: K, value: PersonnelControlDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const save = async () => {
    const personnelIds = record ? [record.personnelId] : selectedPersonnelIds;
    const nextErrors = validatePersonnelControlDraft({ ...draft, personnelId: personnelIds[0] ?? 0 });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      if (record) await personnelControlService.save(record.assignmentId, draft);
      else await Promise.all(personnelIds.map((personnelId) => personnelControlService.save(null, { ...draft, personnelId })));
      await onSaved();
      notify(record ? "Запис контролю оновлено." : `${personnelIds.length} осіб розподілено. БЧС оновлено автоматично.`, "success");
      onClose();
    } catch (error) {
      notify(errorText(error), "error");
    } finally {
      setSaving(false);
    }
  };
  const sortedPeople = useMemo(() => people.filter((person) => person.id === record?.personnelId || !unavailablePersonnelIds.has(person.id)).sort((left, right) => left.fullName.localeCompare(right.fullName, "uk")), [people, record?.personnelId, unavailablePersonnelIds]);
  const requiresInstitution = personnelLocationRequiresInstitution(draft.locationType);
  const showsInstitution = personnelLocationShowsInstitution(draft.locationType);
  const requiresEndDate = personnelLocationRequiresEndDate(draft.locationType);
  const showsEndDate = personnelLocationShowsEndDate(draft.locationType);
  const institutionLabel = draft.locationType === "НАВЧ" ? "Навчальний заклад" : draft.locationType === "ЛІК" ? "Заклад лікування" : draft.locationType === "ВІДР" ? "Місце / установа відрядження" : "Місце / уточнення";
  return <Modal title={record ? "Редагування місця перебування" : "Розподілити особовий склад"} subtitle="Оберіть неавтоматичну вкладку й одразу всіх потрібних людей. БЧС оновиться автоматично." onClose={onClose} className="personnel-control-editor">
    <div className="personnel-control-editor__body">
      {record ? <label className="form-field form-field--wide"><span>Військовослужбовець</span><input value={record.fullName} readOnly /></label> : <fieldset className="personnel-control-editor__people form-field--wide"><legend>Військовослужбовці * · обрано {selectedPersonnelIds.length}</legend>{sortedPeople.length ? <><div className="personnel-control-editor__people-list">{sortedPeople.map((person) => <label key={person.id}><input type="checkbox" checked={selectedPersonnelIds.includes(person.id)} onChange={(event) => { setSelectedPersonnelIds((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id)); setErrors((current) => ({ ...current, personnelId: undefined })); }} /><span><strong>{person.fullName}</strong><small>{person.rank} · {person.position}</small></span></label>)}</div><small className="personnel-control-editor__scroll-hint">Прокрутіть список, щоб переглянути всіх доступних людей.</small></> : <small className="form-hint">Немає доступних військовослужбовців.</small>}{errors.personnelId && <small className="form-error">{errors.personnelId}</small>}</fieldset>}
      <label className="form-field"><span>Тип перебування *</span><Select ariaLabel="Тип перебування" value={draft.locationType} onChange={(value) => { const locationType = value as ManualPersonnelLocation; setDraft((current) => ({ ...current, locationType, institution: personnelLocationShowsInstitution(locationType) ? current.institution : "", endDate: personnelLocationShowsEndDate(locationType) ? current.endDate : "" })); setErrors({}); }} options={MANUAL_PERSONNEL_LOCATIONS.map((value) => ({ value, label: value }))} />{errors.locationType && <small className="form-error">{errors.locationType}</small>}</label>
      {showsInstitution && <label className="form-field"><span>{institutionLabel}{requiresInstitution ? " *" : ""}</span><input aria-label={institutionLabel} value={draft.institution} onChange={(event) => set("institution", event.target.value)} placeholder={requiresInstitution ? "Вкажіть назву та населений пункт" : "Необов’язково"} />{errors.institution && <small className="form-error">{errors.institution}</small>}</label>}
      <label className="form-field"><span>З якого числа *</span><input aria-label="З якого числа" type="date" value={draft.startDate} onChange={(event) => set("startDate", event.target.value)} />{errors.startDate && <small className="form-error">{errors.startDate}</small>}</label>
      {showsEndDate && <label className="form-field"><span>По яке число{requiresEndDate ? " *" : ""}</span><input aria-label="По яке число" type="date" value={draft.endDate} onChange={(event) => set("endDate", event.target.value)} />{errors.endDate && <small className="form-error">{errors.endDate}</small>}{draft.locationType === "ВІДР" && !draft.endDate && <small className="form-hint">Без дати — до окремого розпорядження.</small>}</label>}
      <label className="form-field form-field--wide"><span>Примітка</span><textarea aria-label="Примітка" value={draft.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Необов’язкове уточнення" /></label>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose} disabled={saving}>Скасувати</button><button className="button primary" data-modal-enter-action onClick={() => void save()} disabled={saving}>{saving ? "Збереження…" : "Зберегти"}</button></footer>
  </Modal>;
}

function CloseAssignmentModal({ record, onClose, onSaved }: { record: PersonnelControlRecord; onClose: () => void; onSaved: () => Promise<void> }) {
  const { notify } = useNotifications();
  const [endDate, setEndDate] = useState(todayLocal());
  const [reason, setReason] = useState("");
  const [nextLocation, setNextLocation] = useState<ManualPersonnelLocation | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!endDate) { setError("Вкажіть дату завершення."); return; }
    if (record.startDate && endDate < record.startDate) { setError("Дата завершення не може бути раніше початку."); return; }
    if (endDate > todayLocal()) { setError("Дата фактичного завершення не може бути пізніше за сьогодні."); return; }
    if (record.assignmentId == null) { notify("Для цього запису немає ручного призначення.", "error"); return; }
    if (!nextLocation) { setError("Оберіть, куди розподілити військовослужбовця після завершення."); return; }
    setSaving(true);
    try {
      await personnelControlService.close(record.assignmentId, endDate, reason, nextLocation);
      await onSaved();
      notify(`Запис завершено. Військовослужбовця розподілено: ${nextLocation}.`, "success");
      onClose();
    } catch (caught) {
      notify(errorText(caught), "error");
    } finally {
      setSaving(false);
    }
  };
  return <Modal title="Завершити перебування?" subtitle={`${record.fullName} · ${record.locationType}`} onClose={onClose} className="personnel-control-close">
    <div className="personnel-control-close__body">
      <p>Оберіть наступне місце перебування: завершити запис без розподілу неможливо. Історія попереднього перебування збережеться.</p>
      <label className="form-field"><span>Дата завершення *</span><input aria-label="Дата завершення" type="date" max={todayLocal()} value={endDate} onChange={(event) => { setEndDate(event.target.value); setError(""); }} />{error && <small className="form-error">{error}</small>}</label>
      <label className="form-field"><span>Розподілити після завершення *</span><Select ariaLabel="Розподілити після завершення" value={nextLocation} onChange={(value) => { setNextLocation(value as ManualPersonnelLocation | ""); setError(""); }} options={[{ value: "", label: "Оберіть місце перебування" }, ...MANUAL_PERSONNEL_LOCATIONS.map((value) => ({ value, label: value }))]} /></label>
      <label className="form-field"><span>Підстава / примітка</span><textarea aria-label="Підстава завершення" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose} disabled={saving}>Скасувати</button><button className="button primary" data-modal-enter-action onClick={() => void save()} disabled={saving}>{saving ? "Збереження…" : "Завершити"}</button></footer>
  </Modal>;
}

export function PersonnelControl({ people, hasMorePeople, onLoadMorePeople }: PersonnelControlProps) {
  const [records, setRecords] = useState<PersonnelControlRecord[]>([]);
  const [historyRecords, setHistoryRecords] = useState<PersonnelControlHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"current" | "history">("current");
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("personnel-control-tab") || "Усі");
  const [editing, setEditing] = useState<PersonnelControlRecord | "new" | null>(null);
  const [closing, setClosing] = useState<PersonnelControlRecord | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setRecords(await personnelControlService.list());
    } catch (error) {
      setLoadError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, []);
  const loadHistory = useCallback(async (append = false) => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const page = await personnelControlService.history(null, HISTORY_PAGE_SIZE, append ? historyRecords.length : 0);
      setHistoryRecords((current) => append ? [...current, ...page] : page);
      setHistoryHasMore(page.length === HISTORY_PAGE_SIZE);
      setHistoryLoaded(true);
    } catch (error) {
      setHistoryError(errorText(error));
    } finally {
      setHistoryLoading(false);
    }
  }, [historyRecords.length]);
  const refreshAfterMutation = useCallback(async () => {
    await reload();
    setHistoryLoaded(false);
  }, [reload]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const refresh = () => { void reload(); };
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("operational-data-updated", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("operational-data-updated", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [reload]);
  useEffect(() => { if (hasMorePeople) void onLoadMorePeople(); }, [hasMorePeople, people.length, onLoadMorePeople]);
  useEffect(() => { if (view === "history" && !historyLoaded && !historyLoading) void loadHistory(); }, [view, historyLoaded, historyLoading, loadHistory]);

  const tabs = useMemo(() => controlTabs(records), [records]);
  useEffect(() => {
    if (activeTab !== "Усі" && !tabs.includes(activeTab)) setActiveTab("Усі");
  }, [activeTab, tabs]);
  const selectTab = (tab: string) => { setActiveTab(tab); localStorage.setItem("personnel-control-tab", tab); };
  const tabCount = (tab: string) => tab === "Усі" ? records.length : records.filter((record) => controlTab(record) === tab).length;
  const shown = records.filter((record) => (activeTab === "Усі" || controlTab(record) === activeTab) && includesSearch(query, record.fullName, record.rank, record.position, record.locationType, record.institution, record.positionName, record.crewName, record.sourceLabel, record.notes));
  const unassigned = records.filter((record) => !record.locationType.trim());
  const shownHistory = historyRecords.filter((record) => includesSearch(query, record.fullName, record.locationType, record.institution, record.notes, record.reason, record.action));
  const unavailablePersonnelIds = useMemo(() => new Set(records.filter(blocksManualPersonnelAssignment).map((record) => record.personnelId)), [records]);

  return <section className="personnel-control" aria-label="Контроль особового складу">
    <div className="personnel-control__toolbar">
      <label className="search"><Search /><input aria-label="Пошук у контролі особового складу" placeholder="Пошук за ПІБ, місцем або закладом…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <button className="button primary" onClick={() => setEditing("new")}><Plus />Розподілити особовий склад</button>
    </div>
    <div className="personnel-control__filters">
      <nav className="personnel-control__view-tabs" aria-label="Актуальні дані або історія"><button type="button" className={view === "current" ? "active" : ""} onClick={() => setView("current")}><ListChecks />Актуальні</button><button type="button" className={view === "history" ? "active" : ""} onClick={() => setView("history")}><History />Історія</button></nav>
      {view === "current" ? <nav className="personnel-control__tabs" aria-label="Фільтр за місцем перебування">{["Усі", ...tabs].map((tab) => <button type="button" key={tab} className={activeTab === tab ? "active" : ""} onClick={() => selectTab(tab)}>{tab}<b>{tabCount(tab)}</b></button>)}</nav> : <p className="personnel-control__history-hint">Зміни ручних записів зберігаються та не видаляються після завершення.</p>}
    </div>
    {view === "current" && unassigned.length > 0 && <div className="personnel-control__unassigned" role="alert"><CircleAlert /><span>Нерозподілений особовий склад: {unassigned.length}. Вкажіть місце перебування для кожної людини.</span><button type="button" onClick={() => selectTab("Не вказано")}>Показати</button></div>}
    <div className="panel personnel-control__table-wrap">
      {view === "current" ? loading ? <div className="personnel-control__state"><RefreshCw className="spin" /><b>Оновлюємо місця перебування…</b></div> : loadError ? <div className="personnel-control__state personnel-control__state--error"><CircleAlert /><b>Не вдалося завантажити контроль</b><span>{loadError}</span><button className="button" onClick={() => void reload()}>Спробувати ще раз</button></div> : shown.length === 0 ? <div className="personnel-control__state"><UsersRound /><b>У цій вкладці немає записів</b><span>{query ? "Змініть пошуковий запит." : "Дані з’являться автоматично після змін у БЧС, плані польотів або роботах на позиції."}</span></div> : <table className="personnel-control__table"><thead><tr><th>Військовослужбовець</th><th>Тип</th><th>Місце / заклад</th><th>Період</th><th>Джерело</th><th>Примітка</th><th>Дії</th></tr></thead><tbody>{shown.map((record) => <tr key={`${record.personnelId}:${record.assignmentId ?? record.locationType}:${record.updatedAt}`}><td><strong>{record.fullName}</strong><small>{[record.rank, record.position].filter(Boolean).join(" · ")}</small></td><td><span className={`personnel-control__location personnel-control__location--${record.source}`}>{record.locationType || "Не вказано"}</span>{record.workType && <small>Робота: {record.workType}</small>}{controlTab(record) !== record.locationType && <small>вкладка «{controlTab(record)}»</small>}</td><td><strong>{recordPlace(record)}</strong>{record.positionName && record.crewName && <small>{record.positionName} · екіпаж {record.crewName}</small>}</td><td><span>{controlPeriod(record)}</span></td><td><span className={`personnel-control__source personnel-control__source--${record.source}`}>{sourceNames[record.source]}</span><small>{record.sourceLabel}</small></td><td><span className="personnel-control__notes">{record.notes || "—"}</span></td><td className="personnel-control__actions">{record.canEdit ? <>{record.assignmentId == null ? <button className="icon-button" aria-label={`Розподілити ${record.fullName}`} title="Розподілити військовослужбовця" onClick={() => setEditing(record)}><Pencil /></button> : <><button className="icon-button" aria-label={`Редагувати ${record.fullName}`} onClick={() => setEditing(record)}><Pencil /></button><button className="icon-button personnel-control__finish" aria-label={`Завершити ${record.fullName}`} onClick={() => setClosing(record)}><CheckCircle2 /></button></>}</> : <span className="personnel-control__locked" title={record.source === "automatic" ? "Запис керується робочим джерелом автоматично" : "Місце перебування змінюється у БЧС"}><LockKeyhole />{record.source === "automatic" ? "Автоматично" : "У БЧС"}</span>}</td></tr>)}</tbody></table> : historyLoading && !historyLoaded ? <div className="personnel-control__state"><RefreshCw className="spin" /><b>Завантажуємо історію…</b></div> : historyError ? <div className="personnel-control__state personnel-control__state--error"><CircleAlert /><b>Не вдалося завантажити історію</b><span>{historyError}</span><button className="button" onClick={() => void loadHistory(false)}>Спробувати ще раз</button></div> : shownHistory.length === 0 ? <><div className="personnel-control__state"><History /><b>{query ? "У завантаженій історії збігів немає" : "Історія поки порожня"}</b><span>{query ? "Змініть запит або завантажте давніші події." : "Тут з’являться створення, редагування та завершення ручних записів."}</span></div>{historyHasMore && <button className="button personnel-control__load-more" onClick={() => void loadHistory(true)} disabled={historyLoading}>{historyLoading ? "Завантаження…" : "Показати ще 100 подій"}</button>}</> : <><table className="personnel-control__table personnel-control__history-table"><thead><tr><th>Військовослужбовець</th><th>Подія</th><th>Тип</th><th>Місце / заклад</th><th>Період</th><th>Причина / примітка</th><th>Зафіксовано</th></tr></thead><tbody>{shownHistory.map((record) => <tr key={record.id}><td><strong>{record.fullName}</strong></td><td><span className="personnel-control__history-action">{historyActionNames[record.action] ?? record.action}</span></td><td><span className="personnel-control__location personnel-control__location--manual">{record.locationType}</span></td><td><strong>{record.institution || "—"}</strong></td><td>{record.startDate ? `${formatControlDate(record.startDate)}${record.endDate ? ` — ${formatControlDate(record.endDate)}` : ""}` : "—"}</td><td><span className="personnel-control__notes">{[record.reason, record.notes].filter(Boolean).join(" · ") || "—"}</span></td><td>{formatControlDateTime(record.occurredAt)}</td></tr>)}</tbody></table>{historyHasMore && <button className="button personnel-control__load-more" onClick={() => void loadHistory(true)} disabled={historyLoading}>{historyLoading ? "Завантаження…" : "Показати ще 100 подій"}</button>}</>}
    </div>
    {editing && <ManualAssignmentModal people={people} unavailablePersonnelIds={unavailablePersonnelIds} record={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refreshAfterMutation} />}
    {closing && <CloseAssignmentModal record={closing} onClose={() => setClosing(null)} onSaved={refreshAfterMutation} />}
  </section>;
}
