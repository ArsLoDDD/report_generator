import { AlertTriangle, Archive, Car, PackageOpen, Plus, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEventHandler } from "react";
import { useEntityCollection } from "../../shared/hooks/useEntityCollection";
import { personnelService } from "../../shared/services/personnelService";
import type { Person } from "../../shared/types/domain";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { RecordPickerModal } from "../../shared/ui/record-picker/RecordPickerModal";
import { SearchableSelect } from "../../shared/ui/SearchableSelect";
import { SectionTabs } from "../../shared/ui/SectionTabs";
import { Select } from "../../shared/ui/Select";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import { vehiclesService } from "../vehicles/services/vehiclesService";
import type { Vehicle } from "../vehicles/types";
import { flightPlanPersonnelAtTime, reconstructInitialMemberIds } from "./flight-plan-model";
import { incidentDateTimeParts } from "./incident-date";
import { incidentTypeConfig, incidentRequiresWitnesses, incidentTypeLabel } from "./incident-config";
import { incidentAssetLabel, incidentFieldsByType, incidentTypesByCategory, isFlightWithinLastDay } from "./incident-fields";
import { IncidentCard, incidentPrimaryName, type IncidentCardTab } from "./IncidentCard";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, EquipmentCategory, FlightJournalEntry, FlightPlanRequest, Incident, IncidentDataDraft, IncidentDocument, IncidentDraft, IncidentStep, Position } from "./types";

const equipmentCategories: EquipmentCategory[] = ["uav", "generator", "communications", "weapon_ammo"];
const equipmentCategoryLabels: Record<EquipmentCategory, string> = { uav: "БпЛА та БпАК", generator: "Генератори", communications: "Зв’язок", weapon_ammo: "Зброя та БК" };
const flightStages = ["Підготовка", "Пуск", "Політ", "Виконання завдання", "Повернення", "Посадка"];
const archiveReasons = ["Опрацювання завершено", "Дублікат", "Створено помилково", "Інше"];

const localDateParts = () => { const now = new Date(); return { incidentDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, incidentTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` }; };
const parsePlan = (value: string | null | undefined): FlightPlanRequest | null => { try { const parsed = value ? JSON.parse(value) as FlightPlanRequest : null; return parsed && Array.isArray(parsed.entries) ? parsed : null; } catch { return null; } };
type Explanation = { personId: string; text: string };
type SubjectMode = "crew" | "person";
type IncidentListView = "active" | "archive";
type EditorDraft = ReturnType<typeof emptyDraft>;

function emptyDraft() {
  return {
    category: "Майно", incidentType: "Втрата майна", customEvent: "", status: "Чернетка", ...localDateParts(),
    subjectMode: "crew" as SubjectMode, crewId: "", vehicleId: "", equipmentIds: [] as number[], personnelIds: [] as number[],
    positionName: "", reconnaissanceArea: "", description: "", immediateActions: "", consequences: "", flightStage: "", preliminaryCause: "",
    reportedTo: "", reportedDate: "", reportedTime: "", sourceFlightId: "", eventData: {} as Record<string, unknown>,
    explanations: [{ personId: "", text: "" }, { personId: "", text: "" }] as Explanation[],
  };
}

function incidentToDraft(incident: Incident): EditorDraft {
  const categoryTypes = incidentTypesByCategory[incident.category] ?? [];
  const known = categoryTypes.includes(incident.incidentType);
  const customType = incident.incidentType === "Інший інцидент" || !known;
  const reported = incident.reportedAt?.split("T") ?? [];
  const rawExplanations = Array.isArray(incident.eventData?.explanations) ? incident.eventData.explanations : [];
  const explanations = rawExplanations.map((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { personId: item.personId ? String(item.personId) : "", text: String(item.text ?? "") };
  });
  return {
    category: customType ? "Інше" : incident.category, incidentType: customType ? "Інший інцидент" : incident.incidentType, customEvent: customType ? incident.customTypeName?.trim() || (known ? "" : incident.incidentType) : "",
    status: incident.status, incidentDate: incident.occurredAt.slice(0, 10), incidentTime: incident.occurredAt.slice(11, 16),
    subjectMode: incident.crewId && !(incident.personnelIds?.length) ? "crew" : "person", crewId: incident.crewId ? String(incident.crewId) : "",
    vehicleId: incident.vehicleId ? String(incident.vehicleId) : "", equipmentIds: incident.equipmentIds ?? [], personnelIds: incident.personnelIds ?? [],
    positionName: incident.positionName, reconnaissanceArea: incident.reconnaissanceArea, description: incident.description,
    immediateActions: incident.immediateActions, consequences: incident.consequences, flightStage: incident.flightStage, preliminaryCause: incident.preliminaryCause,
    reportedTo: incident.reportedTo, reportedDate: reported[0] ?? "", reportedTime: reported[1]?.slice(0, 5) ?? "", sourceFlightId: incident.sourceFlightId ? String(incident.sourceFlightId) : "",
    eventData: incident.eventData ?? {}, explanations: explanations.length >= 2 ? explanations : [...explanations, ...Array.from({ length: 2 - explanations.length }, () => ({ personId: "", text: "" }))],
  };
}

const nextStepLabel = (item: Incident) => (item.steps ?? []).find((step) => !["Виконано", "Пропущено"].includes(step.status))?.title || ((item.steps ?? []).length ? "Обов’язкові кроки завершено" : "Алгоритм не налаштовано");
const incidentColumns = (equipment: Equipment[], crews: Crew[], archived: boolean): EntityTableColumn<Incident>[] => [
  { key: "id", title: "№", render: (item) => item.id },
  { key: "event", title: "Інцидент", render: (item) => <><b>{incidentTypeLabel(item)}</b><small>{incidentPrimaryName(item, equipment, crews)}</small></> },
  { key: "date", title: "Дата й час", render: (item) => <>{incidentDateTimeParts(item.occurredAt).date}<small>{incidentDateTimeParts(item.occurredAt).time}</small></> },
  { key: "status", title: "Стан", render: (item) => <span className={`status-pill ${archived ? "" : item.status === "Завершено" ? "active" : item.status === "Опрацьовується" ? "warning" : ""}`}>{archived ? "Архів" : item.status || "Чернетка"}</span> },
  { key: "object", title: "Пов’язано", render: (item) => {
    const itemConfig = incidentTypeConfig(item.incidentType);
    const related = itemConfig.subject === "vehicle"
      ? item.vehicleName
      : itemConfig.assets
        ? item.equipmentNames?.join(" · ") || item.equipmentName || item.crewName
        : item.crewName;
    return <>{related || "—"}{itemConfig.showCrewContext && item.positionName ? <small>{item.positionName}</small> : null}</>;
  } },
  { key: "next", title: archived ? "Причина архівації" : "Наступна дія", render: (item) => <span className="incident-table__pending">{archived ? item.archiveReason || "—" : nextStepLabel(item)}</span> },
];

function positionArea(position?: Position) {
  return [position?.locality, position?.mgrs].filter(Boolean).join(" · ");
}

type IncidentPlanContext = { crewId: number | null; positionName: string; area: string };

const emptyPlanContext = (): IncidentPlanContext => ({ crewId: null, positionName: "", area: "" });
const planMinute = (value: string | undefined) => {
  const [hours, minutes] = (value ?? "").split(":").map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60
    ? hours * 60 + minutes
    : null;
};

function incidentStageAtTime(plan: FlightPlanRequest, crewId: number, incidentTime: string) {
  const incidentMinute = planMinute(incidentTime);
  const stages = plan.entries.filter((entry) => entry.crewId === crewId);
  if (incidentMinute === null || !stages.length) return null;
  const primary = stages[0];
  const finalStage = stages[stages.length - 1];
  const arrivalMinute = planMinute(primary.startTime);
  const departureMinute = planMinute(primary.departureTime);
  if (primary.arrivesToday && (arrivalMinute === null || incidentMinute < arrivalMinute)) return null;
  if (primary.departsToday && departureMinute !== null && incidentMinute >= departureMinute) return null;

  let activeStage = primary;
  for (const stage of stages.slice(1)) {
    const startMinute = planMinute(stage.startTime);
    if (startMinute !== null && startMinute <= incidentMinute) activeStage = stage;
  }
  const transitions = plan.personnelTransitions?.filter((transition) => transition.crewId === crewId) ?? [];
  const actualMemberIds = activeStage === finalStage && transitions.length
    ? flightPlanPersonnelAtTime(reconstructInitialMemberIds(finalStage.actualMemberIds, transitions, crewId), transitions, crewId, incidentTime)
    : activeStage.actualMemberIds;
  return { entry: activeStage, actualMemberIds };
}

/** Resolves only a factually confirmed position assignment at the incident date and time. */
export function resolveIncidentPersonContext(
  plan: FlightPlanRequest | null,
  personnelId: number,
  incidentTime: string,
  crews: Crew[],
  positions: Position[],
): IncidentPlanContext {
  if (!plan) return emptyPlanContext();
  for (const crewId of [...new Set(plan.entries.map((entry) => entry.crewId))]) {
    const stage = incidentStageAtTime(plan, crewId, incidentTime);
    if (!stage?.actualMemberIds.includes(personnelId)) continue;
    const crew = crews.find((item) => item.id === crewId);
    const position = positions.find((item) => item.id === (stage.entry.positionId ?? crew?.positionId));
    return {
      crewId,
      positionName: stage.entry.positionName || position?.name || crew?.positionName || "",
      area: [stage.entry.positionLocality || position?.locality, stage.entry.positionMgrs || position?.mgrs].filter(Boolean).join(" · "),
    };
  }
  return emptyPlanContext();
}

function editorValidation(draft: EditorDraft) {
  if (draft.incidentType === "Інший інцидент" && !draft.customEvent.trim()) return "Вкажіть назву події.";
  if (!draft.incidentDate || !draft.incidentTime) return "Вкажіть обов’язкові дату та час інциденту.";
  const config = incidentTypeConfig(draft.incidentType);
  if (config.subject === "flight" && !draft.sourceFlightId) return "Для втрати БпЛА оберіть запис із журналу польотів.";
  if (config.subject === "person" && !draft.personnelIds[0]) return "Оберіть військовослужбовця.";
  if (config.subject === "vehicle" && !draft.vehicleId) return "Оберіть автомобіль.";
  if (config.subject === "crew" && !draft.crewId) return "Оберіть екіпаж.";
  if (config.subject === "crew-or-person" && !draft.crewId && !draft.personnelIds[0]) return "Оберіть екіпаж або військовослужбовця.";
  if (draft.incidentType === "Втрата майна" && draft.equipmentIds.length === 0) return "Оберіть втрачене майно.";
  if (incidentRequiresWitnesses(draft.incidentType)) {
    const complete = draft.explanations.filter((item) => item.personId && item.text.trim());
    if (complete.length < 2) return "Додайте щонайменше два пояснення свідків.";
    if (new Set(complete.map((item) => item.personId)).size !== complete.length) return "Кожен свідок може надати лише одне пояснення.";
  }
  return "";
}

export function IncidentsPage() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [flights, setFlights] = useState<FlightJournalEntry[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [listView, setListView] = useState<IncidentListView>("active");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [selectedTab, setSelectedTab] = useState<IncidentCardTab>("overview");
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Incident | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Incident | null>(null);
  const [archiveReason, setArchiveReason] = useState(archiveReasons[0]);
  const [archiveDetails, setArchiveDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const [datedPlanSnapshot, setDatedPlanSnapshot] = useState<{ date: string; plan: FlightPlanRequest | null }>({ date: "", plan: null });
  const { notify } = useNotifications();
  const [draft, setDraft] = useState(emptyDraft);
  const initialDraftSignature = useRef(JSON.stringify(draft));
  const contextNeedsRefresh = useRef(true);
  const loadIncidents = useCallback(async () => [...await (listView === "archive" ? operationsService.listArchivedIncidents() : operationsService.listIncidents())].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id - left.id), [listView]);
  const onLoadError = useCallback(() => notify("Не вдалося завантажити інциденти.", "error"), [notify]);
  const { items, reload: reloadItems } = useEntityCollection({ load: loadIncidents, onError: onLoadError });

  const loadReferences = useCallback(() => {
    void operationsService.listCrews().then((value) => setCrews(value ?? [])).catch(() => setCrews([]));
    void operationsService.listPositions().then((value) => setPositions(value ?? [])).catch(() => setPositions([]));
    void operationsService.listFlightJournalEntries().then((value) => setFlights(value ?? [])).catch(() => setFlights([]));
    void vehiclesService.list().then((value) => setVehicles(value ?? [])).catch(() => setVehicles([]));
    void Promise.all(equipmentCategories.map((category) => operationsService.listEquipment(category))).then((groups) => setEquipment(groups.flatMap((group) => group ?? []))).catch(() => setEquipment([]));
  }, []);
  useEffect(() => { loadReferences(); void personnelService.list(0, 10000).then((result) => setPeople(result.items)).catch(() => setPeople([])); }, [loadReferences]);

  const contextFor = useCallback((plan: FlightPlanRequest | null, crewId: number | null, personnelId?: number | null, incidentTime = "") => {
    if (personnelId) return resolveIncidentPersonContext(plan, personnelId, incidentTime, crews, positions);
    const entry = plan?.entries.find((item) => item.crewId === crewId);
    const crew = crews.find((item) => item.id === (entry?.crewId ?? crewId));
    const position = positions.find((item) => item.id === (entry?.positionId ?? crew?.positionId));
    return { crewId: entry?.crewId ?? crew?.id ?? null, positionName: entry?.positionName || position?.name || crew?.positionName || "", area: [entry?.positionLocality || position?.locality, entry?.positionMgrs || position?.mgrs].filter(Boolean).join(" · ") };
  }, [crews, positions]);

  useEffect(() => {
    setDatedPlanSnapshot({ date: draft.incidentDate, plan: null });
    if (!open || !draft.incidentDate) return;
    let active = true;
    const incidentDate = draft.incidentDate;
    const applyPlan = (plan: FlightPlanRequest | null) => {
      if (!active) return;
      setDatedPlanSnapshot({ date: incidentDate, plan });
      setDraft((current) => {
        if (current.incidentDate !== incidentDate || current.sourceFlightId || !contextNeedsRefresh.current) return current;
        const currentConfig = incidentTypeConfig(current.incidentType);
        const primaryId = current.personnelIds[0] ?? null;
        const personSubject = (currentConfig.subject === "person" || (currentConfig.subject === "crew-or-person" && current.subjectMode === "person")) && primaryId;
        const context = personSubject ? contextFor(plan, null, primaryId, current.incidentTime) : contextFor(plan, current.crewId ? Number(current.crewId) : null);
        const next = { ...current, crewId: context.crewId ? String(context.crewId) : current.subjectMode === "crew" ? current.crewId : "", positionName: context.positionName, reconnaissanceArea: context.area };
        return next.crewId === current.crewId && next.positionName === current.positionName && next.reconnaissanceArea === current.reconnaissanceArea ? current : next;
      });
    };
    // Related incident data is a historical fact, so only the snapshot already
    // persisted in the database may determine crew and position. A local flight
    // plan draft can still change and must never leak into an incident snapshot.
    void operationsService.getFlightPlanSnapshot(incidentDate)
      .then((value) => applyPlan(parsePlan(value)))
      .catch(() => applyPlan(null));
    return () => { active = false; };
  }, [contextFor, crews, draft.incidentDate, open]);

  const datedPlan = datedPlanSnapshot.date === draft.incidentDate ? datedPlanSnapshot.plan : null;
  const datedPlanEntries = datedPlan?.entries ?? [];
  const config = incidentTypeConfig(draft.incidentType);
  const selectedCrew = crews.find((crew) => crew.id === Number(draft.crewId));
  const selectedPeople = draft.personnelIds.map((id) => people.find((person) => person.id === id)).filter((person): person is Person => Boolean(person));
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === Number(draft.vehicleId));
  const selectedEquipment = draft.equipmentIds.map((id) => equipment.find((asset) => asset.id === id)).filter((asset): asset is Equipment => Boolean(asset));
  const availableEquipment = useMemo(() => {
    const memberIds = new Set((selectedCrew?.actualMembers ?? []).map((member) => member.personnelId));
    const primaryId = draft.personnelIds[0];
    return equipment.filter((asset) => asset.crewId === selectedCrew?.id || Boolean(asset.personnelId && (memberIds.has(asset.personnelId) || asset.personnelId === primaryId)));
  }, [draft.personnelIds, equipment, selectedCrew]);
  const typeFields = incidentFieldsByType[draft.incidentType] ?? [];
  const incidentTypes = incidentTypesByCategory[draft.category] ?? incidentTypesByCategory["Інше"];
  const recentFlights = useMemo(() => flights.filter((flight) => isFlightWithinLastDay(flight.flightDate, flight.skyTime)), [flights]);
  const relatedReady = config.subject !== "flight" || Boolean(draft.sourceFlightId);
  const crewOnSelectedDatePlan = Boolean(draft.crewId && datedPlanEntries.some((entry) => entry.crewId === Number(draft.crewId)));
  const primaryPerson = selectedPeople[0];
  const sourceFlight = flights.find((flight) => flight.id === Number(draft.sourceFlightId));
  const flightWitnessIds = sourceFlight?.personnelIds ?? [];
  const witnessPeople = (config.subject === "flight" ? people.filter((person) => flightWitnessIds.includes(person.id)) : people).filter((person) => config.subject === "flight" || person.id !== primaryPerson?.id);
  const maxExplanations = Math.max(2, config.subject === "flight" ? witnessPeople.length : people.length);
  const isDirty = JSON.stringify(draft) !== initialDraftSignature.current;

  const setEditor = (value: EditorDraft, incidentId: number | null) => { contextNeedsRefresh.current = incidentId === null; setDraft(value); initialDraftSignature.current = JSON.stringify(value); setEditingId(incidentId); setOpen(true); };
  const openNew = () => setEditor(emptyDraft(), null);
  const openEdit = (incident: Incident) => { setSelected(null); setEditor(incidentToDraft(incident), incident.id); };
  const closeEditor = () => { setOpen(false); setEditingId(null); setDiscardConfirmOpen(false); setAssetPickerOpen(false); };

  const chooseCrew = (crewId: string) => {
    contextNeedsRefresh.current = true;
    const context = contextFor(datedPlan, crewId ? Number(crewId) : null);
    setDraft((current) => ({ ...current, crewId, personnelIds: current.subjectMode === "crew" ? [] : current.personnelIds.slice(0, 1), equipmentIds: [], positionName: context.positionName, reconnaissanceArea: context.area }));
  };
  const choosePrimaryPerson = (personnelId: number) => {
    contextNeedsRefresh.current = true;
    const context = contextFor(datedPlan, null, personnelId, draft.incidentTime);
    setDraft((current) => ({ ...current, personnelIds: [personnelId], crewId: context.crewId ? String(context.crewId) : "", vehicleId: "", equipmentIds: [], positionName: context.positionName, reconnaissanceArea: context.area }));
  };
  const chooseIncidentTime = (incidentTime: string) => {
    contextNeedsRefresh.current = true;
    setDraft((current) => {
      const currentConfig = incidentTypeConfig(current.incidentType);
      const primaryId = current.personnelIds[0];
      const personSubject = currentConfig.subject === "person" || (currentConfig.subject === "crew-or-person" && current.subjectMode === "person");
      if (!personSubject || !primaryId) return { ...current, incidentTime };
      const context = contextFor(datedPlan, null, primaryId, incidentTime);
      return { ...current, incidentTime, crewId: context.crewId ? String(context.crewId) : "", positionName: context.positionName, reconnaissanceArea: context.area };
    });
  };
  const chooseVehicle = (vehicleId: number) => {
    contextNeedsRefresh.current = true;
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    if (!vehicle) return;
    const context = contextFor(datedPlan, vehicle.crewId);
    setDraft((current) => ({ ...current, vehicleId: String(vehicle.id), crewId: vehicle.crewId ? String(vehicle.crewId) : "", personnelIds: vehicle.personnelId ? [vehicle.personnelId] : [], equipmentIds: [], positionName: context.positionName, reconnaissanceArea: context.area, eventData: { ...current.eventData, vehicleName: vehicle.name, vehicleRegistrationNumber: vehicle.registrationNumber, vehicleDriver: vehicle.driverName ?? "", vehicleStatus: vehicle.status } }));
  };
  const chooseFlight = (sourceFlightId: string) => {
    contextNeedsRefresh.current = false;
    const flight = flights.find((item) => item.id === Number(sourceFlightId));
    if (!flight) { setDraft((current) => ({ ...current, sourceFlightId: "", crewId: "", equipmentIds: [], personnelIds: [], positionName: "", reconnaissanceArea: "", eventData: {}, explanations: [{ personId: "", text: "" }, { personId: "", text: "" }] })); return; }
    const crew = crews.find((item) => item.id === flight.crewId);
    const position = positions.find((item) => item.id === (flight.positionId ?? crew?.positionId));
    setDraft((current) => ({ ...current, sourceFlightId, incidentDate: flight.flightDate, incidentTime: flight.skyTime || current.incidentTime, crewId: flight.crewId ? String(flight.crewId) : "", positionName: flight.positionName || position?.name || crew?.positionName || "", reconnaissanceArea: positionArea(position), equipmentIds: flight.uavId ? [flight.uavId] : [], personnelIds: [...(flight.personnelIds ?? [])], explanations: [{ personId: "", text: "" }, { personId: "", text: "" }], eventData: { sourceFlight: `Політ №${flight.id}: ${flight.crewName} · ${flight.skyTime || "—"}–${flight.completionTime || flight.groundTime || "—"}`, battleOrder: flight.battleOrder, workStrip: flight.workStrip, mission: flight.mission, uavName: flight.uavName, uavType: flight.uavType, uavSerialNumber: flight.uavSerialNumber, payloadType: flight.payloadType, payloadSerialNumber: flight.payloadSerialNumber } }));
  };
  const toggleEquipment = (equipmentId: number) => setDraft((current) => ({ ...current, equipmentIds: current.equipmentIds.includes(equipmentId) ? current.equipmentIds.filter((id) => id !== equipmentId) : [...current.equipmentIds, equipmentId] }));
  const updateEventData = (key: string, value: string) => setDraft((current) => ({ ...current, eventData: { ...current.eventData, [key]: value } }));

  const toIncidentDraft = (): IncidentDraft => {
    const explanations = draft.explanations.filter((item) => item.personId && item.text.trim()).map((item) => ({ personId: Number(item.personId), person: people.find((person) => person.id === Number(item.personId))?.fullName || "Особа", text: item.text.trim() }));
    const singlePersonSubject = config.subject === "person" || (config.subject === "crew-or-person" && draft.subjectMode === "person") || config.subject === "vehicle";
    return { category: draft.category, incidentType: draft.incidentType, customTypeName: draft.incidentType === "Інший інцидент" ? draft.customEvent.trim() : "", status: "Чернетка", occurredAt: `${draft.incidentDate}T${draft.incidentTime}`, crewId: draft.crewId ? Number(draft.crewId) : null, equipmentId: draft.equipmentIds[0] ?? null, equipmentIds: draft.equipmentIds, personnelIds: singlePersonSubject ? draft.personnelIds.slice(0, 1) : draft.personnelIds, positionName: draft.positionName, reconnaissanceArea: draft.reconnaissanceArea, description: draft.description, immediateActions: draft.immediateActions, consequences: draft.consequences, flightStage: draft.flightStage, preliminaryCause: draft.preliminaryCause, snapshotSource: draft.sourceFlightId ? "flight-journal" : crewOnSelectedDatePlan ? "flight-plan-snapshot" : "current", reportedTo: draft.reportedTo, reportedAt: draft.reportedDate && draft.reportedTime ? `${draft.reportedDate}T${draft.reportedTime}` : "", sourceFlightId: draft.sourceFlightId ? Number(draft.sourceFlightId) : null, vehicleId: draft.vehicleId ? Number(draft.vehicleId) : null, eventData: { ...draft.eventData, explanations } };
  };

  const persistEditor = async (validate = true) => {
    const problem = editorValidation(draft);
    if (problem) { if (validate) notify(problem, "error"); return false; }
    if (busy) return false;
    setBusy(true);
    try {
      const payload = toIncidentDraft();
      if (editingId) await operationsService.updateIncidentDraft(editingId, payload); else await operationsService.createIncident(payload);
      const message = editingId ? "Чернетку оновлено." : "Інцидент збережено.";
      closeEditor(); await reloadItems(); loadReferences(); notify(message, "success");
      return true;
    } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти інцидент.", "error"); return false; }
    finally { setBusy(false); }
  };
  const requestEditorClose = () => {
    if (busy) return;
    if (!isDirty && editingId !== null) { closeEditor(); return; }
    if (!editorValidation(draft)) { void persistEditor(false); return; }
    setDiscardConfirmOpen(true);
  };

  const refreshSelected = async (incidentId: number) => {
    const fresh = await (listView === "archive" ? operationsService.listArchivedIncidents() : operationsService.listIncidents());
    setSelected((current) => current?.id === incidentId ? fresh.find((item) => item.id === incidentId) ?? null : current);
    await reloadItems();
  };
  const changeStatus = async (status: string, reason: string) => { if (!selected) return; try { await operationsService.updateIncidentStatus(selected.id, status, reason); await refreshSelected(selected.id); notify("Стан інциденту оновлено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося змінити стан.", "error"); throw error; } };
  const changeData = async (data: IncidentDataDraft) => { if (!selected) return; try { await operationsService.updateIncidentData(selected.id, data); await reloadItems(); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти дані події.", "error"); throw error; } };
  const changeStep = async (step: IncidentStep, status: string, comment: string) => { if (!selected) return; try { await operationsService.updateIncidentStep(selected.id, step.id, status, comment); await refreshSelected(selected.id); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося оновити крок.", "error"); throw error; } };
  const changeDocument = async (document: IncidentDocument, status: string) => { if (!selected) return; try { await operationsService.updateIncidentDocumentStatus(selected.id, document.id, status); await refreshSelected(selected.id); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося оновити документ.", "error"); } };
  const removeIncident = async () => { if (!deleteTarget || busy) return; setBusy(true); try { await operationsService.deleteIncident(deleteTarget.id); setDeleteTarget(null); setSelected(null); await reloadItems(); notify("Чернетку видалено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося видалити чернетку.", "error"); } finally { setBusy(false); } };
  const archiveIncident = async () => { if (!archiveTarget || busy) return; const reason = archiveReason === "Інше" ? archiveDetails.trim() : archiveReason; if (!reason) { notify("Вкажіть причину архівації.", "error"); return; } setBusy(true); try { await operationsService.archiveIncident(archiveTarget.id, reason); setArchiveTarget(null); setArchiveDetails(""); setArchiveReason(archiveReasons[0]); setSelected(null); await reloadItems(); notify("Інцидент перенесено в архів.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося архівувати інцидент.", "error"); } finally { setBusy(false); } };

  const visibleItems = items.slice(0, visibleLimit);
  const onTableScroll: UIEventHandler<HTMLDivElement> = (event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 100) setVisibleLimit((current) => Math.min(current + 20, items.length)); };
  const updateExplanation = (index: number, patch: Partial<Explanation>) => setDraft((current) => ({ ...current, explanations: current.explanations.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));

  return <PageFrame className="incidents-page" header={<PageTitle title="Інциденти" subtitle="Реєстрація та супровід подій" actions={<><SectionTabs className="incident-list-tabs" tabs={[{ id: "active", label: "Активні" }, { id: "archive", label: "Архів" }]} value={listView} onChange={(value) => { setSelected(null); setVisibleLimit(20); setListView(value); }} ariaLabel="Стан списку інцидентів" />{listView === "active" && <button className="button primary" onClick={openNew}><Plus />Додати інцидент</button>}</>} />}>
    <section className="panel operation-table data-table incident-table"><EntityTable className="operation-table__table" items={visibleItems} columns={incidentColumns(equipment, crews, listView === "archive")} rowKey={(item) => item.id} selectedKey={selected?.id} onSelect={(incident) => { setSelected(incident); setSelectedTab("overview"); }} onScroll={onTableScroll} emptyState={<div className="personnel-state"><AlertTriangle /><b>{listView === "archive" ? "Архів порожній" : "Інцидентів поки немає"}</b><span>{listView === "archive" ? "Архівовані записи з’являться тут." : "Зафіксуйте першу подію."}</span></div>} /><div className="pagination">Показано {visibleItems.length} із {items.length}</div></section>

    {open && <Modal title={editingId ? "Редагування чернетки" : "Новий інцидент"} subtitle="Заповнюються тільки дані обраного типу" onClose={requestEditorClose} className="incident-editor">
      <div className="operation-editor__body incident-editor__body">
        <section className="incident-editor__section"><h3>Подія</h3><div className="incident-editor__grid">
          <label className="form-field"><span>Група</span><Select ariaLabel="Категорія інциденту" value={draft.category} onChange={(category) => { contextNeedsRefresh.current = true; setDraft((current) => ({ ...emptyDraft(), category, incidentType: incidentTypesByCategory[category][0], incidentDate: current.incidentDate, incidentTime: current.incidentTime })); }} options={Object.keys(incidentTypesByCategory).map((value) => ({ value, label: value }))} /></label>
          <label className="form-field"><span>Тип інциденту</span><Select ariaLabel="Тип інциденту" value={draft.incidentType} onChange={(incidentType) => { contextNeedsRefresh.current = true; setDraft((current) => ({ ...emptyDraft(), category: current.category, incidentType, incidentDate: current.incidentDate, incidentTime: current.incidentTime })); }} options={incidentTypes.map((value) => ({ value, label: value }))} /></label>
          {draft.incidentType === "Інший інцидент" && <label className="form-field form-field--wide"><span>Назва події <b>*</b></span><input value={draft.customEvent} onChange={(event) => setDraft({ ...draft, customEvent: event.target.value })} placeholder="Наприклад, вимушена посадка" /></label>}
          {config.subject === "flight" && <label className="form-field form-field--wide"><span>Політ за останні 24 години <b>*</b></span><Select ariaLabel="Запис журналу польотів" value={draft.sourceFlightId} onChange={chooseFlight} options={[{ value: "", label: recentFlights.length ? "Оберіть запис" : "За останні 24 години записів немає" }, ...recentFlights.map((flight) => ({ value: String(flight.id), label: `${flight.flightDate} · ${flight.skyTime || "—"} · ${flight.crewName || "без екіпажу"} · ${flight.uavName || "без БпЛА"}` }))]} /></label>}
          <label className="form-field"><span>Дата <b>*</b></span><input aria-label="Дата" required type="date" disabled={config.subject === "flight"} value={draft.incidentDate} onChange={(event) => { contextNeedsRefresh.current = true; setDraft((current) => ({ ...current, incidentDate: event.target.value, crewId: config.subject === "person" ? "" : current.crewId, positionName: "", reconnaissanceArea: "" })); }} /></label>
          <label className="form-field"><span>Час <b>*</b></span><input aria-label="Час" required type="time" disabled={config.subject === "flight"} value={draft.incidentTime} onChange={(event) => chooseIncidentTime(event.target.value)} /></label>
          <div className="form-field"><span>Стан</span><div className="incident-editor__readonly-status">Чернетка</div></div>
        </div></section>

        {!relatedReady && <section className="incident-editor__section incident-editor__locked"><PackageOpen /><div><b>Спочатку оберіть запис журналу польотів</b><p>Екіпаж, позиція, БпЛА, БК та інші пов’язані дані будуть підставлені з нього автоматично.</p></div></section>}
        {relatedReady && <section className="incident-editor__section"><h3>Пов’язані дані</h3>
          {config.subject === "crew-or-person" && <div className="incident-editor__grid"><label className="form-field"><span>За ким було закріплено</span><Select ariaLabel="Джерело закріплення" value={draft.subjectMode} onChange={(subjectMode) => setDraft((current) => ({ ...current, subjectMode: subjectMode as SubjectMode, crewId: "", personnelIds: [], equipmentIds: [], positionName: "", reconnaissanceArea: "" }))} options={[{ value: "crew", label: "Екіпаж" }, { value: "person", label: "Військовослужбовець" }]} /></label></div>}
          {(config.subject === "crew" || (config.subject === "crew-or-person" && draft.subjectMode === "crew")) && <label className="form-field incident-editor__subject-field"><span>Екіпаж <b>*</b></span><Select ariaLabel="Екіпаж інциденту" value={draft.crewId} onChange={chooseCrew} options={[{ value: "", label: "Оберіть екіпаж" }, ...crews.map((crew) => ({ value: String(crew.id), label: crew.name }))]} /></label>}
          {(config.subject === "person" || (config.subject === "crew-or-person" && draft.subjectMode === "person")) && <div className="incident-editor__picker-row"><div><UserRound /><span><b>{config.subject === "person" ? "Військовослужбовець" : "Відповідальна особа"} <i>*</i></b><small>{primaryPerson ? `${primaryPerson.rank} · ${primaryPerson.position}` : "Пошук за ПІБ, званням або посадою"}</small></span></div><SearchableSelect ariaLabel="Військовослужбовець інциденту" value={primaryPerson ? String(primaryPerson.id) : ""} onChange={(value) => choosePrimaryPerson(Number(value))} placeholder="Обрати військовослужбовця" searchPlaceholder="Пошук за ПІБ, званням або посадою…" options={people.map((person) => ({ value: String(person.id), label: `${person.fullName} — ${person.rank} · ${person.position}` }))} /></div>}
          {config.subject === "vehicle" && <div className="incident-editor__picker-row"><div><Car /><span><b>Автомобіль <i>*</i></b><small>{selectedVehicle ? `${selectedVehicle.registrationNumber} · ${selectedVehicle.driverName || "водія не закріплено"}` : "Пошук за назвою, номером або водієм"}</small></span></div><SearchableSelect ariaLabel="Автомобіль інциденту" value={selectedVehicle ? String(selectedVehicle.id) : ""} onChange={(value) => chooseVehicle(Number(value))} placeholder="Обрати автомобіль" searchPlaceholder="Пошук за назвою, номером або водієм…" options={vehicles.map((vehicle) => ({ value: String(vehicle.id), label: `${vehicle.name} — ${vehicle.registrationNumber || "без номера"}${vehicle.driverName ? ` · ${vehicle.driverName}` : ""}` }))} /></div>}
          {config.subject === "flight" && <div className="incident-editor__picker-row"><div><PackageOpen /><span><b>{String(draft.eventData.uavName || "БпЛА не вказано")}</b><small>{String(draft.eventData.uavSerialNumber || "серійний номер не вказано")}{draft.eventData.payloadType ? ` · БК: ${String(draft.eventData.payloadType)}` : ""}</small></span></div><span className="status-pill">З журналу</span></div>}
          {config.showCrewContext && (draft.crewId || draft.positionName || draft.reconnaissanceArea) && <div className="incident-editor__grid incident-editor__context-grid"><div className="form-field"><span>Екіпаж</span><div className="incident-editor__readonly-status">{selectedCrew?.name || "—"}</div></div><div className="form-field"><span>Позиція</span><div className="incident-editor__readonly-status">{draft.positionName || "—"}</div></div><div className="form-field"><span>Район позиції</span><div className="incident-editor__readonly-status">{draft.reconnaissanceArea || "—"}</div></div></div>}
          {config.assets && config.subject !== "flight" && <div className="incident-editor__picker-row"><div><PackageOpen /><span><b>{incidentAssetLabel(draft.incidentType)}</b><small>Доступно за обраним екіпажем або особою · вибрано {selectedEquipment.length}</small></span></div><button type="button" className="button" disabled={!draft.crewId && !draft.personnelIds[0]} onClick={() => setAssetPickerOpen(true)}><Plus />Обрати майно</button></div>}
          {selectedEquipment.length > 0 && config.subject !== "flight" && <div className="incident-editor__chips">{selectedEquipment.map((asset) => <button type="button" key={asset.id} onClick={() => toggleEquipment(asset.id)}>{asset.name} ×</button>)}</div>}
          {selectedCrew && <details className="incident-editor__snapshot"><summary>Фактичний склад екіпажу · {(selectedCrew.actualMembers ?? []).length} ос.</summary>{(selectedCrew.actualMembers ?? []).map((member) => <span key={member.personnelId}><b>{member.fullName}</b><small>{member.rank} · {member.position}</small></span>)}</details>}
        </section>}

        {relatedReady && <section className="incident-editor__section"><h3>Фактичні дані події</h3><div className="incident-editor__grid">
          {config.subject === "flight" && <><label className="form-field"><span>Етап польоту</span><Select ariaLabel="Етап польоту" value={draft.flightStage} onChange={(flightStage) => setDraft({ ...draft, flightStage })} options={[{ value: "", label: "Не вказано" }, ...flightStages.map((value) => ({ value, label: value }))]} /></label><label className="form-field"><span>Попередня причина</span><input value={draft.preliminaryCause} onChange={(event) => setDraft({ ...draft, preliminaryCause: event.target.value })} /></label></>}
          {typeFields.map((field) => <label key={field.key} className={`form-field ${field.wide ? "form-field--wide" : ""}`}><span>{field.label}</span>{field.inputType === "textarea" ? <textarea value={String(draft.eventData[field.key] ?? "")} onChange={(event) => updateEventData(field.key, event.target.value)} placeholder={field.placeholder} /> : <input type={field.inputType ?? "text"} value={String(draft.eventData[field.key] ?? "")} onChange={(event) => updateEventData(field.key, event.target.value)} placeholder={field.placeholder} />}</label>)}
          <label className="form-field form-field--wide"><span>Обставини події</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        </div></section>}

        {relatedReady && config.witnesses && <section className="incident-editor__section"><div className="incident-editor__section-title"><div><h3>{config.subject === "flight" ? "Пояснення осіб" : "Свідки та пояснення"}</h3><small>Мінімум два окремі свідки з поясненнями</small></div><button type="button" className="button" disabled={draft.explanations.length >= maxExplanations} onClick={() => setDraft((current) => ({ ...current, explanations: [...current.explanations, { personId: "", text: "" }] }))}><Plus />Додати</button></div><div className="incident-editor__explanations">{draft.explanations.map((explanation, index) => <div key={index}><SearchableSelect ariaLabel={`Свідок ${index + 1}`} value={explanation.personId} onChange={(personId) => updateExplanation(index, { personId })} placeholder="Обрати свідка" searchPlaceholder="Пошук за ПІБ, званням або посадою…" options={witnessPeople.filter((person) => !draft.explanations.some((item, itemIndex) => itemIndex !== index && Number(item.personId) === person.id)).map((person) => ({ value: String(person.id), label: `${person.fullName} — ${person.rank} · ${person.position}` }))} /><textarea aria-label={`Пояснення ${index + 1}`} value={explanation.text} onChange={(event) => updateExplanation(index, { text: event.target.value })} placeholder="Пояснення свідка" />{draft.explanations.length > 2 && <button type="button" className="icon-button danger" aria-label={`Видалити пояснення ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, explanations: current.explanations.filter((_, itemIndex) => itemIndex !== index) }))}>×</button>}</div>)}</div></section>}
      </div>
      <footer className="modal-actions"><button type="button" className="button" disabled={busy} onClick={requestEditorClose}>Скасувати</button><button type="button" className="button primary" disabled={busy} onClick={() => void persistEditor()}>{busy ? "Збереження…" : editingId ? "Зберегти зміни" : "Зберегти інцидент"}</button></footer>
    </Modal>}

    {assetPickerOpen && <RecordPickerModal title={incidentAssetLabel(draft.incidentType)} searchPlaceholder="Пошук за назвою, номером або станом…" items={availableEquipment.map((asset) => ({ id: asset.id, title: asset.name, subtitle: `${equipmentCategoryLabels[asset.category]} · ${asset.inventoryNumber || "без номера"} · ${asset.status}`, owner: asset.holderName || undefined }))} selectedIds={draft.equipmentIds} onToggle={toggleEquipment} onClose={() => setAssetPickerOpen(false)} />}
    {discardConfirmOpen && <ConfirmDialog title="Закрити без створення?" message="Не всі обов’язкові дані заповнено. Введена інформація буде втрачена." confirmLabel="Закрити без збереження" onConfirm={closeEditor} onCancel={() => setDiscardConfirmOpen(false)} busy={busy} />}

    {selected && <IncidentCard incident={selected} equipment={equipment} crews={crews} tab={selectedTab} onTabChange={setSelectedTab} onClose={() => setSelected(null)} onStatusChange={listView === "active" && !selected.archivedAt ? changeStatus : undefined} onDataChange={listView === "active" && selected.status === "Чернетка" && !selected.archivedAt ? changeData : undefined} onStepChange={listView === "active" && !selected.archivedAt ? changeStep : undefined} onDocumentChange={listView === "active" && !selected.archivedAt ? changeDocument : undefined} onEdit={listView === "active" && selected.status === "Чернетка" ? () => openEdit(selected) : undefined} onDelete={listView === "active" && selected.status === "Чернетка" ? () => setDeleteTarget(selected) : undefined} onArchive={listView === "active" && selected.status !== "Чернетка" ? () => { setArchiveTarget(selected); setArchiveReason(archiveReasons[0]); setArchiveDetails(""); } : undefined} />}
    {deleteTarget && <ConfirmDialog title="Видалити чернетку?" message={`Чернетку інциденту «${incidentTypeLabel(deleteTarget)}» буде видалено без можливості відновлення.`} confirmLabel="Видалити" onConfirm={() => void removeIncident()} onCancel={() => setDeleteTarget(null)} busy={busy} />}
    {archiveTarget && <Modal title="Архівувати інцидент" subtitle="Архівний запис залишиться доступним лише для перегляду" onClose={() => setArchiveTarget(null)} className="confirm-dialog incident-archive-dialog"><div className="confirm-dialog__message"><Archive /><div><p>Оберіть причину архівації інциденту №{archiveTarget.id}.</p><label className="form-field"><span>Причина <b>*</b></span><Select ariaLabel="Причина архівації" value={archiveReason} onChange={setArchiveReason} options={archiveReasons.map((value) => ({ value, label: value }))} /></label>{archiveReason === "Інше" && <label className="form-field"><span>Уточнення <b>*</b></span><textarea value={archiveDetails} onChange={(event) => setArchiveDetails(event.target.value)} placeholder="Вкажіть причину" /></label>}</div></div><footer className="modal-actions"><button className="button" disabled={busy} onClick={() => setArchiveTarget(null)}>Скасувати</button><button className="button primary" disabled={busy || (archiveReason === "Інше" && !archiveDetails.trim())} onClick={() => void archiveIncident()}><Archive />{busy ? "Архівація…" : "Архівувати"}</button></footer></Modal>}
  </PageFrame>;
}
