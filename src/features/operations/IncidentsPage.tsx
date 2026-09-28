import { AlertTriangle, PackageOpen, Plus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type UIEventHandler } from "react";
import { useEntityCollection } from "../../shared/hooks/useEntityCollection";
import { personnelService } from "../../shared/services/personnelService";
import type { Person } from "../../shared/types/domain";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { RecordPickerModal } from "../../shared/ui/record-picker/RecordPickerModal";
import { Select } from "../../shared/ui/Select";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import { flightPlanDraftRequest, flightPlanPendingDraftRequest } from "./flight-plan-storage";
import { incidentDateTimeParts } from "./incident-date";
import { incidentAssetLabel, incidentFieldsByType, incidentTypesByCategory, isFlightWithinLastDay } from "./incident-fields";
import { IncidentCard, incidentPrimaryName, type IncidentCardTab } from "./IncidentCard";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, EquipmentCategory, FlightJournalEntry, FlightPlanEntry, FlightPlanRequest, Incident, IncidentDataDraft, IncidentDocument, IncidentStep } from "./types";

const equipmentCategories: EquipmentCategory[] = ["uav", "generator", "communications", "weapon_ammo"];
const equipmentCategoryLabels: Record<EquipmentCategory, string> = { uav: "БпЛА та БпАК", generator: "Генератори", communications: "Зв’язок", weapon_ammo: "Зброя та БК" };
const flightStages = ["Підготовка", "Пуск", "Політ", "Виконання завдання", "Повернення", "Посадка"];

const localDateParts = () => { const now = new Date(); return { incidentDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, incidentTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` }; };
const parsePlan = (value: string | null | undefined): FlightPlanRequest | null => { try { const parsed = value ? JSON.parse(value) as FlightPlanRequest : null; return parsed && Array.isArray(parsed.entries) ? parsed : null; } catch { return null; } };
type Explanation = { personId: string; text: string };
const emptyDraft = () => ({ category: "Майно", incidentType: "Втрата майна", customEvent: "", status: "Чернетка", ...localDateParts(), crewId: "", equipmentIds: [] as number[], personnelIds: [] as number[], positionName: "", reconnaissanceArea: "", description: "", immediateActions: "", consequences: "", flightStage: "", preliminaryCause: "", reportedTo: "", reportedDate: "", reportedTime: "", sourceFlightId: "", eventData: {} as Record<string, string>, explanations: [{ personId: "", text: "" }, { personId: "", text: "" }] as Explanation[] });

const nextStepLabel = (item: Incident) => (item.steps ?? []).find((step) => !["Виконано", "Пропущено"].includes(step.status))?.title || ((item.steps ?? []).length ? "Обов’язкові кроки завершено" : "Алгоритм у розробці");
const incidentColumns = (equipment: Equipment[], crews: Crew[]): EntityTableColumn<Incident>[] => [
  { key: "id", title: "№", render: (item) => item.id },
  { key: "event", title: "Інцидент", render: (item) => <><b>{item.incidentType}</b><small>{incidentPrimaryName(item, equipment, crews)}</small></> },
  { key: "date", title: "Дата й час", render: (item) => <>{incidentDateTimeParts(item.occurredAt).date}<small>{incidentDateTimeParts(item.occurredAt).time}</small></> },
  { key: "status", title: "Стан", render: (item) => <span className={`status-pill ${item.status === "Завершено" ? "active" : item.status === "Опрацьовується" ? "warning" : ""}`}>{item.status || "Чернетка"}</span> },
  { key: "object", title: "Пов’язано", render: (item) => <>{item.equipmentNames?.join(" · ") || item.equipmentName || item.vehicleName || item.crewName || "—"}<small>{item.positionName}</small></> },
  { key: "next", title: "Наступна дія", render: (item) => <span className="incident-table__pending">{nextStepLabel(item)}</span> },
];

export function IncidentsPage() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [flights, setFlights] = useState<FlightJournalEntry[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [selectedTab, setSelectedTab] = useState<IncidentCardTab>("overview");
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const [datedPlanEntries, setDatedPlanEntries] = useState<FlightPlanEntry[]>([]);
  const { notify } = useNotifications();
  const [draft, setDraft] = useState(emptyDraft);
  const loadIncidents = useCallback(() => operationsService.listIncidents(), []);
  const onLoadError = useCallback(() => notify("Не вдалося завантажити інциденти.", "error"), [notify]);
  const { items, reload: reloadItems } = useEntityCollection({ load: loadIncidents, onError: onLoadError });

  const loadReferences = useCallback(() => {
    void operationsService.listCrews().then(setCrews).catch(() => setCrews([]));
    void operationsService.listFlightJournalEntries().then((value) => setFlights(value ?? [])).catch(() => setFlights([]));
    void Promise.all(equipmentCategories.map((category) => operationsService.listEquipment(category))).then((groups) => setEquipment(groups.flatMap((group) => group ?? []))).catch(() => setEquipment([]));
  }, []);
  useEffect(() => { loadReferences(); void personnelService.list(0, 10000).then((result) => setPeople(result.items)).catch(() => setPeople([])); }, [loadReferences]);
  useEffect(() => {
    setDatedPlanEntries([]);
    if (!open || !draft.incidentDate) return;
    let active = true;
    const incidentDate = draft.incidentDate;
    const applyPlan = (plan: FlightPlanRequest | null) => {
      const entries = plan?.entries ?? [];
      setDatedPlanEntries(entries);
      setDraft((current) => {
        if (current.incidentDate !== incidentDate || !current.crewId || current.sourceFlightId) return current;
        const crew = crews.find((item) => item.id === Number(current.crewId));
        return { ...current, positionName: entries.find((entry) => entry.crewId === crew?.id)?.positionName || crew?.positionName || "" };
      });
    };
    void operationsService.getFlightPlanSnapshot(incidentDate).then((value) => { if (active) applyPlan(flightPlanPendingDraftRequest(incidentDate) ?? parsePlan(value) ?? flightPlanDraftRequest(incidentDate)); }).catch(() => { if (active) applyPlan(flightPlanPendingDraftRequest(incidentDate) ?? flightPlanDraftRequest(incidentDate)); });
    return () => { active = false; };
  }, [crews, draft.incidentDate, open]);

  const selectedCrew = crews.find((crew) => crew.id === Number(draft.crewId));
  const crewOnSelectedDatePlan = Boolean(selectedCrew && datedPlanEntries.some((entry) => entry.crewId === selectedCrew.id));
  const selectedPeople = draft.personnelIds.map((id) => people.find((person) => person.id === id)).filter((person): person is Person => Boolean(person));
  const availableEquipment = useMemo(() => {
    const actualPersonnelIds = new Set((selectedCrew?.actualMembers ?? []).map((member) => member.personnelId));
    const selectedPersonnelIds = new Set(draft.personnelIds);
    return equipment.filter((asset) => asset.crewId === selectedCrew?.id || Boolean(asset.personnelId && (actualPersonnelIds.has(asset.personnelId) || selectedPersonnelIds.has(asset.personnelId))));
  }, [draft.personnelIds, equipment, selectedCrew]);
  const selectedEquipment = draft.equipmentIds.map((id) => equipment.find((asset) => asset.id === id)).filter((asset): asset is Equipment => Boolean(asset));
  const typeFields = incidentFieldsByType[draft.incidentType] ?? [];
  const incidentTypes = incidentTypesByCategory[draft.category] ?? incidentTypesByCategory["Інше"];
  const recentFlights = useMemo(() => flights.filter((flight) => isFlightWithinLastDay(flight.flightDate, flight.skyTime)), [flights]);
  const personnelIncident = draft.category === "Особовий склад" || ["Втрата майна", "Втрата військового квитка/посвідчення УБД", "Знищення машини", "Пошкодження машини", "ДТП"].includes(draft.incidentType);
  const needsEquipment = ["Втрата БпЛА", "Втрата майна", "Знищення машини", "Пошкодження машини", "ДТП", "Обстріл", "Знищення позиції", "СЗЧ"].includes(draft.incidentType);
  const flightIncident = draft.incidentType === "Втрата БпЛА";
  const addAssetLabel = flightIncident ? "Додати БпЛА" : ["Знищення машини", "Пошкодження машини", "ДТП"].includes(draft.incidentType) ? "Додати техніку" : "Додати майно";

  const chooseCrew = (crewId: string) => {
    const crew = crews.find((item) => item.id === Number(crewId));
    const planPositionName = datedPlanEntries.find((entry) => entry.crewId === crew?.id)?.positionName ?? "";
    setDraft((current) => ({ ...current, crewId, equipmentIds: current.sourceFlightId ? current.equipmentIds : [], positionName: planPositionName || crew?.positionName || "", reconnaissanceArea: crew?.reconnaissanceArea ?? "" }));
  };
  const chooseFlight = (sourceFlightId: string) => {
    const flight = flights.find((item) => item.id === Number(sourceFlightId));
    if (!flight) { setDraft((current) => ({ ...current, sourceFlightId: "" })); return; }
    const crew = crews.find((item) => item.id === flight.crewId);
    setDraft((current) => ({ ...current, sourceFlightId, incidentDate: flight.flightDate, incidentTime: flight.skyTime || current.incidentTime, crewId: flight.crewId ? String(flight.crewId) : "", positionName: flight.positionName, reconnaissanceArea: crew?.reconnaissanceArea ?? "", equipmentIds: flight.uavId ? [flight.uavId] : [], eventData: { ...current.eventData, sourceFlight: `Політ №${flight.id}: ${flight.crewName} · ${flight.skyTime || "—"}–${flight.groundTime || "—"}`, battleOrder: flight.battleOrder, workStrip: flight.workStrip, mission: flight.mission, uavName: flight.uavName, uavType: flight.uavType, uavSerialNumber: flight.uavSerialNumber, payloadType: flight.payloadType, payloadSerialNumber: flight.payloadSerialNumber } }));
  };
  const toggleEquipment = (equipmentId: number) => setDraft((current) => ({ ...current, equipmentIds: current.equipmentIds.includes(equipmentId) ? current.equipmentIds.filter((id) => id !== equipmentId) : [...current.equipmentIds, equipmentId] }));
  const togglePerson = (personnelId: number) => setDraft((current) => ({ ...current, personnelIds: current.personnelIds.includes(personnelId) ? current.personnelIds.filter((id) => id !== personnelId) : [...current.personnelIds, personnelId] }));
  const updateEventData = (key: string, value: string) => setDraft((current) => ({ ...current, eventData: { ...current.eventData, [key]: value } }));

  const refreshSelected = async (incidentId: number) => {
    const fresh = await operationsService.listIncidents();
    setSelected((current) => current?.id === incidentId ? fresh.find((item) => item.id === incidentId) ?? null : current);
    await reloadItems();
  };
  const changeStatus = async (status: string, reason: string) => { if (!selected) return; try { await operationsService.updateIncidentStatus(selected.id, status, reason); await refreshSelected(selected.id); notify("Стан інциденту оновлено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося змінити стан.", "error"); } };
  const changeData = async (data: IncidentDataDraft) => { if (!selected) return; try { await operationsService.updateIncidentData(selected.id, data); await reloadItems(); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти дані події.", "error"); throw error; } };
  const changeStep = async (step: IncidentStep, status: string, comment: string) => { if (!selected) return; try { await operationsService.updateIncidentStep(selected.id, step.id, status, comment); await refreshSelected(selected.id); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося оновити крок.", "error"); } };
  const changeDocument = async (document: IncidentDocument, status: string) => { if (!selected) return; try { await operationsService.updateIncidentDocumentStatus(selected.id, document.id, status); await refreshSelected(selected.id); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося оновити документ.", "error"); } };

  const save = async () => {
    const incidentType = draft.incidentType.startsWith("Інш") ? draft.customEvent.trim() : draft.incidentType;
    if (!incidentType) { notify("Вкажіть подію для іншого інциденту.", "error"); return; }
    if (!draft.incidentDate || !draft.incidentTime) { notify("Вкажіть обов’язкові дату та час інциденту.", "error"); return; }
    if (flightIncident && !draft.sourceFlightId) { notify("Для втрати БпЛА оберіть запис із журналу польотів.", "error"); return; }
    const explanations = draft.explanations.filter((item) => item.personId && item.text.trim()).map((item) => ({ person: people.find((person) => person.id === Number(item.personId))?.fullName || "Особа", text: item.text.trim() }));
    if (flightIncident && explanations.length < 2) { notify("Для втрати БпЛА додайте щонайменше два пояснення осіб, які були на позиції.", "error"); return; }
    try {
      await operationsService.createIncident({ category: draft.category, incidentType, status: draft.status, occurredAt: `${draft.incidentDate}T${draft.incidentTime}`, crewId: draft.crewId ? Number(draft.crewId) : null, equipmentId: draft.equipmentIds[0] ?? null, equipmentIds: draft.equipmentIds, personnelIds: draft.personnelIds, positionName: draft.positionName, reconnaissanceArea: draft.reconnaissanceArea, description: draft.description, immediateActions: draft.immediateActions, consequences: draft.consequences, flightStage: draft.flightStage, preliminaryCause: draft.preliminaryCause, snapshotSource: draft.sourceFlightId ? "flight-journal" : crewOnSelectedDatePlan ? "flight-plan-snapshot" : "current", reportedTo: draft.reportedTo, reportedAt: draft.reportedDate && draft.reportedTime ? `${draft.reportedDate}T${draft.reportedTime}` : "", sourceFlightId: draft.sourceFlightId ? Number(draft.sourceFlightId) : null, eventData: { ...draft.eventData, ...(explanations.length ? { explanations } : {}) } });
      setOpen(false); setDraft(emptyDraft()); await reloadItems(); loadReferences(); notify("Інцидент збережено.", "success");
    } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти інцидент.", "error"); }
  };

  const visibleItems = items.slice(0, visibleLimit);
  const onTableScroll: UIEventHandler<HTMLDivElement> = (event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 100) setVisibleLimit((current) => Math.min(current + 20, items.length)); };
  const explanationPeople = selectedCrew?.actualMembers ?? [];
  const maxExplanations = Math.max(2, explanationPeople.length);

  return <PageFrame className="incidents-page" header={<PageTitle title="Інциденти" subtitle="Реєстрація та супровід подій" actions={<button className="button primary" onClick={() => { setDraft(emptyDraft()); setOpen(true); }}><Plus />Додати інцидент</button>} />}>
    <section className="panel operation-table data-table incident-table"><EntityTable className="operation-table__table" items={visibleItems} columns={incidentColumns(equipment, crews)} rowKey={(item) => item.id} selectedKey={selected?.id} onSelect={(incident) => { setSelected(incident); setSelectedTab("overview"); }} onScroll={onTableScroll} emptyState={<div className="personnel-state"><AlertTriangle /><b>Інцидентів поки немає</b><span>Зафіксуйте першу подію.</span></div>} /><div className="pagination">Показано {visibleItems.length} із {items.length}</div></section>
    {open && <Modal title="Новий інцидент" subtitle="Заповнюються тільки дані обраного типу" onClose={() => setOpen(false)} className="incident-editor">
      <div className="operation-editor__body incident-editor__body">
        <section className="incident-editor__section"><h3>Подія</h3><div className="incident-editor__grid">
          <label className="form-field"><span>Група</span><Select ariaLabel="Категорія інциденту" value={draft.category} onChange={(category) => setDraft({ ...emptyDraft(), category, incidentType: incidentTypesByCategory[category][0] })} options={Object.keys(incidentTypesByCategory).map((value) => ({ value, label: value }))} /></label>
          <label className="form-field"><span>Тип інциденту</span><Select ariaLabel="Тип інциденту" value={draft.incidentType} onChange={(incidentType) => setDraft((current) => ({ ...current, incidentType, sourceFlightId: "", eventData: {}, equipmentIds: [], explanations: [{ personId: "", text: "" }, { personId: "", text: "" }] }))} options={incidentTypes.map((value) => ({ value, label: value }))} /></label>
          {draft.incidentType.startsWith("Інш") && <label className="form-field form-field--wide"><span>Назва події <b>*</b></span><input autoFocus value={draft.customEvent} onChange={(event) => setDraft({ ...draft, customEvent: event.target.value })} placeholder="Наприклад, вимушена посадка" /></label>}
          <label className="form-field"><span>Дата <b>*</b></span><input aria-label="Дата" required type="date" value={draft.incidentDate} onChange={(event) => setDraft({ ...draft, incidentDate: event.target.value })} /></label>
          <label className="form-field"><span>Час <b>*</b></span><input aria-label="Час" required type="time" value={draft.incidentTime} onChange={(event) => setDraft({ ...draft, incidentTime: event.target.value })} /></label>
          <div className="form-field"><span>Початковий стан</span><div className="incident-editor__readonly-status">Чернетка</div></div>
        </div></section>
        {flightIncident && <section className="incident-editor__section"><h3>Запис журналу польотів за останні 24 години</h3><label className="form-field form-field--wide"><span>Політ, під час якого втрачено БпЛА <b>*</b></span><Select ariaLabel="Запис журналу польотів" value={draft.sourceFlightId} onChange={chooseFlight} options={[{ value: "", label: recentFlights.length ? "Оберіть запис" : "За останні 24 години записів немає" }, ...recentFlights.map((flight) => ({ value: String(flight.id), label: `${flight.flightDate} · ${flight.skyTime || "—"} · ${flight.crewName || "без екіпажу"} · ${flight.uavName || "без БпЛА"}` }))]} /></label></section>}
        <section className="incident-editor__section"><h3>Пов’язані дані</h3><div className="incident-editor__grid">
          <label className="form-field"><span>Екіпаж</span><Select ariaLabel="Екіпаж інциденту" value={draft.crewId} onChange={chooseCrew} options={[{ value: "", label: "Не обирати екіпаж" }, ...crews.map((crew) => ({ value: String(crew.id), label: crew.name }))]} /></label>
          <label className="form-field"><span>Позиція</span><input value={draft.positionName} onChange={(event) => setDraft({ ...draft, positionName: event.target.value })} /></label>
          <label className="form-field"><span>Район розвідки</span><input value={draft.reconnaissanceArea} onChange={(event) => setDraft({ ...draft, reconnaissanceArea: event.target.value })} /></label>
        </div>
        {personnelIncident && <div className="incident-editor__picker-row"><div><UsersRound /><span><b>Особи події</b><small>Перша особа в списку є основною · вибрано {selectedPeople.length}</small></span></div><button className="button" onClick={() => setPersonPickerOpen(true)}><Plus />Обрати осіб</button></div>}
        {selectedPeople.length > 0 && <div className="incident-editor__chips">{selectedPeople.map((person) => <button key={person.id} onClick={() => togglePerson(person.id)}>{person.fullName} ×</button>)}</div>}
        {needsEquipment && <div className="incident-editor__picker-row"><div><PackageOpen /><span><b>{incidentAssetLabel(draft.incidentType)}</b><small>Доступно за обраним екіпажем або особою · вибрано {selectedEquipment.length}</small></span></div><button className="button" disabled={!selectedCrew && !selectedPeople.length} onClick={() => setAssetPickerOpen(true)}><Plus />{addAssetLabel}</button></div>}
        {selectedEquipment.length > 0 && <div className="incident-editor__chips">{selectedEquipment.map((asset) => <button key={asset.id} onClick={() => toggleEquipment(asset.id)}>{asset.name} ×</button>)}</div>}
        {selectedCrew && <details open className="incident-editor__snapshot"><summary>Фактичний склад екіпажу · {(selectedCrew.actualMembers ?? []).length} ос.</summary>{(selectedCrew.actualMembers ?? []).map((member) => <span key={member.personnelId}><b>{member.fullName}</b><small>{member.rank} · {member.position}</small></span>)}</details>}
        </section>
        <section className="incident-editor__section"><h3>Фактичні дані події</h3><div className="incident-editor__grid">
          {flightIncident && <><label className="form-field"><span>Етап польоту</span><Select ariaLabel="Етап польоту" value={draft.flightStage} onChange={(flightStage) => setDraft({ ...draft, flightStage })} options={[{ value: "", label: "Не вказано" }, ...flightStages.map((value) => ({ value, label: value }))]} /></label><label className="form-field"><span>Попередня причина</span><input value={draft.preliminaryCause} onChange={(event) => setDraft({ ...draft, preliminaryCause: event.target.value })} /></label></>}
          {typeFields.map((field) => <label key={field.key} className={`form-field ${field.wide ? "form-field--wide" : ""}`}><span>{field.label}</span>{field.inputType === "textarea" ? <textarea value={draft.eventData[field.key] ?? ""} onChange={(event) => updateEventData(field.key, event.target.value)} placeholder={field.placeholder} /> : <input type={field.inputType ?? "text"} value={draft.eventData[field.key] ?? ""} onChange={(event) => updateEventData(field.key, event.target.value)} placeholder={field.placeholder} />}</label>)}
          <label className="form-field form-field--wide"><span>Обставини події</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        </div></section>
        {flightIncident && <section className="incident-editor__section"><div className="incident-editor__section-title"><div><h3>Пояснення осіб</h3><small>Мінімум два; не більше фактичного складу на позиції</small></div><button className="button" disabled={draft.explanations.length >= maxExplanations} onClick={() => setDraft((current) => ({ ...current, explanations: [...current.explanations, { personId: "", text: "" }] }))}><Plus />Додати пояснення</button></div><div className="incident-editor__explanations">{draft.explanations.map((explanation, index) => <div key={index}><Select ariaLabel={`Особа пояснення ${index + 1}`} value={explanation.personId} onChange={(personId) => setDraft((current) => ({ ...current, explanations: current.explanations.map((item, itemIndex) => itemIndex === index ? { ...item, personId } : item) }))} options={[{ value: "", label: "Оберіть особу" }, ...explanationPeople.map((member) => ({ value: String(member.personnelId), label: member.fullName }))]} /><textarea aria-label={`Пояснення ${index + 1}`} value={explanation.text} onChange={(event) => setDraft((current) => ({ ...current, explanations: current.explanations.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) }))} placeholder="Текст пояснення" />{draft.explanations.length > 2 && <button className="icon-button danger" aria-label={`Видалити пояснення ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, explanations: current.explanations.filter((_, itemIndex) => itemIndex !== index) }))}>×</button>}</div>)}</div></section>}
      </div>
      <footer className="modal-actions"><button className="button" onClick={() => setOpen(false)}>Скасувати</button><button className="button primary" onClick={() => void save()}>Зберегти інцидент</button></footer>
    </Modal>}
    {assetPickerOpen && <RecordPickerModal title={incidentAssetLabel(draft.incidentType)} searchPlaceholder="Пошук за назвою, номером або станом…" items={availableEquipment.map((asset) => ({ id: asset.id, title: asset.name, subtitle: `${equipmentCategoryLabels[asset.category]} · ${asset.inventoryNumber || "без номера"} · ${asset.status}`, owner: asset.holderName || undefined }))} selectedIds={draft.equipmentIds} onToggle={toggleEquipment} onClose={() => setAssetPickerOpen(false)} />}
    {personPickerOpen && <RecordPickerModal title="Особи інциденту" items={people.map((person) => ({ id: person.id, title: person.fullName, subtitle: `${person.rank} · ${person.position}` }))} selectedIds={draft.personnelIds} onToggle={togglePerson} onClose={() => setPersonPickerOpen(false)} />}
    {selected && <IncidentCard incident={selected} equipment={equipment} crews={crews} tab={selectedTab} onTabChange={setSelectedTab} onClose={() => setSelected(null)} onStatusChange={changeStatus} onDataChange={changeData} onStepChange={changeStep} onDocumentChange={changeDocument} />}
  </PageFrame>;
}
