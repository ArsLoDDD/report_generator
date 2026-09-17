import { AlertTriangle, CalendarDays, Clock3, MapPin, PackageOpen, Plus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState, type UIEventHandler } from "react";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Select } from "../../shared/ui/Select";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, EquipmentCategory, FlightPlanEntry, FlightPlanRequest, Incident } from "./types";
import { useEntityCollection } from "../../shared/hooks/useEntityCollection";
import { incidentDateTimeParts } from "./incident-date";
import { RecordPickerModal } from "../../shared/ui/record-picker/RecordPickerModal";
import { flightPlanDraftRequest } from "./flight-plan-storage";
import { personnelService } from "../../shared/services/personnelService";
import type { Person } from "../../shared/types/domain";

const equipmentCategories: EquipmentCategory[] = ["uav", "generator", "communications", "weapon_ammo"];
const equipmentCategoryLabels: Record<EquipmentCategory, string> = { uav: "БпЛА та БпАК", generator: "Генератори", communications: "Зв’язок", weapon_ammo: "Зброя та БК" };
const incidentTypesByCategory: Record<string, string[]> = {
  "Особовий склад": ["СЗЧ", "Поранення", "Травма", "Загибель", "Зникнення", "Евакуація", "Інша подія з особовим складом"],
  "БпЛА та польоти": ["Втрата БпЛА", "Пошкодження БпЛА", "Аварійна посадка", "Невдалий пуск", "Втрата керування", "Втрата зв’язку", "Нештатна робота БК", "Інший польотний інцидент"],
  "Майно і транспорт": ["Втрата майна", "Пошкодження майна", "Крадіжка", "Нестача", "Поломка", "ДТП", "Інший майновий інцидент"],
  "Позиція та безпека": ["Виявлення позиції", "Обстріл", "Пожежа", "Мінна небезпека", "Вимушене залишення позиції", "Інший інцидент на позиції"],
  "Зв’язок та інформація": ["Втрата зв’язку", "Відмова засобів зв’язку", "Компрометація пристрою або даних", "Інший інцидент зв’язку"],
  "Інше": ["Інший інцидент"],
};
const incidentStatuses = ["Новий", "Опрацьовується", "Закритий"];
const flightStages = ["Підготовка", "Пуск", "Політ", "Виконання завдання", "Повернення", "Посадка"];
const localDateParts = () => { const now = new Date(); return { incidentDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, incidentTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` }; };
const incidentPersonShortName = (fullName?: string) => {
  const parts = (fullName ?? "").trim().split(/\s+/u).filter(Boolean);
  if (!parts.length) return "особу не вказано";
  return `${parts[0]}${parts.length > 1 ? ` ${parts.slice(1).map((part) => `${part[0].toLocaleUpperCase("uk")}.`).join("")}` : ""}`;
};
const incidentDetailsTitle = (incident: Incident) => `${incident.incidentType} - ${incidentPersonShortName(incident.personnelNames?.[0])} - ${incidentDateTimeParts(incident.occurredAt).date}`;
const parsePlan = (value: string | null | undefined): FlightPlanRequest | null => { try { const parsed = value ? JSON.parse(value) as FlightPlanRequest : null; return parsed && Array.isArray(parsed.entries) ? parsed : null; } catch { return null; } };
const emptyDraft = () => ({ category: "БпЛА та польоти", incidentType: "Втрата БпЛА", customEvent: "", status: "Новий", ...localDateParts(), crewId: "", equipmentIds: [] as number[], personnelIds: [] as number[], positionName: "", reconnaissanceArea: "", description: "", immediateActions: "", consequences: "", flightStage: "", preliminaryCause: "", reportedTo: "", reportedDate: "", reportedTime: "" });
const incidentColumns: EntityTableColumn<Incident>[] = [
  { key: "id", title: "№", render: (_item, rowIndex) => rowIndex + 1 },
  { key: "event", title: "Подія", render: (item) => <><b>{item.incidentType}</b><small>{item.description}</small></> },
  { key: "status", title: "Статус", render: (item) => <span className={`status-pill ${item.status === "Закритий" ? "active" : item.status === "Опрацьовується" ? "warning" : ""}`}>{item.status || "Новий"}</span> },
  { key: "date", title: "Дата", render: (item) => incidentDateTimeParts(item.occurredAt).date },
  { key: "time", title: "Час", render: (item) => incidentDateTimeParts(item.occurredAt).time },
  { key: "crew", title: "Екіпаж", render: (item) => <>{item.crewName ?? "—"}<small>{item.crewSnapshot}</small></> },
  { key: "equipment", title: "БпЛА / майно", render: (item) => <>{item.equipmentNames?.join(" · ") || item.equipmentName || "—"}<small>{item.vehicleName}</small></> },
  { key: "position", title: "Позиція", render: (item) => item.positionName || "—" },
  { key: "area", title: "Район", render: (item) => item.reconnaissanceArea || "—" },
];

export function IncidentsPage() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const [datedPlanEntries, setDatedPlanEntries] = useState<FlightPlanEntry[]>([]);
  const { notify } = useNotifications();
  const [draft, setDraft] = useState(emptyDraft);

  const loadIncidents = useCallback(() => operationsService.listIncidents(), []);
  const onLoadError = useCallback(() => notify("Не вдалося завантажити інциденти.", "error"), [notify]);
  const { items, reload: reloadItems } = useEntityCollection({ load: loadIncidents, onError: onLoadError });
  const reload = useCallback(() => {
    void reloadItems();
    void operationsService.listCrews().then(setCrews).catch(() => setCrews([]));
    void Promise.all(equipmentCategories.map((category) => operationsService.listEquipment(category))).then((groups) => setEquipment(groups.flatMap((group) => group ?? []))).catch(() => setEquipment([]));
  }, [reloadItems]);

  useEffect(() => { void operationsService.listCrews().then(setCrews).catch(() => setCrews([])); void Promise.all(equipmentCategories.map((category) => operationsService.listEquipment(category))).then((groups) => setEquipment(groups.flatMap((group) => group ?? []))).catch(() => setEquipment([])); void personnelService.list(0, 10000).then((result) => setPeople(result.items)).catch(() => setPeople([])); }, []);
  useEffect(() => {
    setDatedPlanEntries([]);
    setDraft((current) => {
      if (!current.crewId) return current;
      const crew = crews.find((item) => item.id === Number(current.crewId));
      return { ...current, positionName: crew?.positionName ?? "" };
    });
    if (!open || !draft.incidentDate) return;
    let active = true;
    const incidentDate = draft.incidentDate;
    const applyPlan = (plan: FlightPlanRequest | null) => {
      const entries = plan?.entries ?? [];
      setDatedPlanEntries(entries);
      setDraft((current) => {
        if (current.incidentDate !== incidentDate || !current.crewId) return current;
        const crew = crews.find((item) => item.id === Number(current.crewId));
        const planPositionName = entries.find((entry) => entry.crewId === crew?.id)?.positionName ?? "";
        return { ...current, positionName: planPositionName || crew?.positionName || "" };
      });
    };
    void operationsService.getFlightPlanSnapshot(incidentDate).then((value) => {
      if (!active) return;
      applyPlan(parsePlan(value) ?? flightPlanDraftRequest(incidentDate));
    }).catch(() => {
      if (active) applyPlan(flightPlanDraftRequest(incidentDate));
    });
    return () => { active = false; };
  }, [crews, draft.incidentDate, open]);

  const chooseCrew = (crewId: string) => {
    const crew = crews.find((item) => item.id === Number(crewId));
    const planPositionName = datedPlanEntries.find((entry) => entry.crewId === crew?.id)?.positionName ?? "";
    setDraft((current) => ({ ...current, crewId, equipmentIds: [], positionName: planPositionName || crew?.positionName || "", reconnaissanceArea: crew?.reconnaissanceArea ?? "" }));
  };

  const save = async () => {
    const incidentType = draft.incidentType.startsWith("Інш") ? draft.customEvent.trim() : draft.incidentType;
    if (!incidentType) { notify("Вкажіть подію для іншого інциденту.", "error"); return; }
    if (!draft.incidentDate || !draft.incidentTime) { notify("Вкажіть обов’язкові дату та час інциденту.", "error"); return; }
    try {
      await operationsService.createIncident({ category: draft.category, incidentType, status: draft.status, occurredAt: `${draft.incidentDate}T${draft.incidentTime}`, crewId: draft.crewId ? Number(draft.crewId) : null, equipmentId: draft.equipmentIds[0] ?? null, equipmentIds: draft.equipmentIds, personnelIds: draft.personnelIds, positionName: draft.positionName, reconnaissanceArea: draft.reconnaissanceArea, description: draft.description, immediateActions: draft.immediateActions, consequences: draft.consequences, flightStage: draft.flightStage, preliminaryCause: draft.preliminaryCause, snapshotSource: crewOnSelectedDatePlan ? "flight-plan-snapshot" : "current", reportedTo: draft.reportedTo, reportedAt: draft.reportedDate && draft.reportedTime ? `${draft.reportedDate}T${draft.reportedTime}` : "" });
      setOpen(false);
      setDraft(emptyDraft());
      reload();
      notify("Інцидент збережено.", "success");
    } catch (error) {
      notify(typeof error === "string" ? error : "Не вдалося зберегти інцидент.", "error");
    }
  };

  const visibleItems = items.slice(0, visibleLimit);
  const selectedCrew = crews.find((crew) => crew.id === Number(draft.crewId));
  const crewOnSelectedDatePlan = Boolean(selectedCrew && datedPlanEntries.some((entry) => entry.crewId === selectedCrew.id));
  const actualPersonnelIds = new Set(selectedCrew?.actualMembers.map((member) => member.personnelId) ?? []);
  const crewEquipment = equipment.filter((asset) => asset.crewId === selectedCrew?.id || Boolean(asset.personnelId && actualPersonnelIds.has(asset.personnelId)));
  const selectedEquipment = draft.equipmentIds.map((id) => crewEquipment.find((asset) => asset.id === id)).filter((asset): asset is Equipment => Boolean(asset));
  const selectedPeople = draft.personnelIds.map((id) => people.find((person) => person.id === id)).filter((person): person is Person => Boolean(person));
  const toggleEquipment = (equipmentId: number) => setDraft((current) => ({ ...current, equipmentIds: current.equipmentIds.includes(equipmentId) ? current.equipmentIds.filter((id) => id !== equipmentId) : [...current.equipmentIds, equipmentId] }));
  const togglePerson = (personnelId: number) => setDraft((current) => ({ ...current, personnelIds: current.personnelIds.includes(personnelId) ? current.personnelIds.filter((id) => id !== personnelId) : [...current.personnelIds, personnelId] }));
  const incidentTypes = incidentTypesByCategory[draft.category] ?? incidentTypesByCategory["Інше"];
  const customType = draft.incidentType.startsWith("Інш");
  const personnelIncident = draft.category === "Особовий склад";
  const flightIncident = draft.category === "БпЛА та польоти";
  const onTableScroll: UIEventHandler<HTMLDivElement> = (event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 100) setVisibleLimit((current) => Math.min(current + 20, items.length)); };

  return <PageFrame className="incidents-page" header={<PageTitle title="Інциденти" subtitle="Події з автоматичним збереженням пов’язаного екіпажу та майна" actions={<button className="button primary" onClick={() => { setDraft(emptyDraft()); setOpen(true); }}><Plus />Додати інцидент</button>} />}>
    <section className="panel operation-table data-table incident-table">
      <EntityTable className="operation-table__table" items={visibleItems} columns={incidentColumns} rowKey={(item) => item.id} selectedKey={selected?.id} onSelect={setSelected} onScroll={onTableScroll} emptyState={<div className="personnel-state"><AlertTriangle /><b>Інцидентів поки немає</b><span>Зафіксуйте першу подію.</span></div>} />
      <div className="pagination">Показано {visibleItems.length} із {items.length}</div>
    </section>
    {open && <Modal title="Новий інцидент" onClose={() => setOpen(false)} className="incident-editor">
      <div className="operation-editor__body">
        <label className="form-field"><span>Категорія</span><Select ariaLabel="Категорія інциденту" value={draft.category} onChange={(category) => setDraft({ ...draft, category, incidentType: incidentTypesByCategory[category][0], customEvent: "", equipmentIds: [], personnelIds: [] })} options={Object.keys(incidentTypesByCategory).map((value) => ({ value, label: value }))} /></label>
        <label className="form-field"><span>Тип інциденту</span><Select ariaLabel="Тип інциденту" value={draft.incidentType} onChange={(incidentType) => setDraft({ ...draft, incidentType })} options={incidentTypes.map((value) => ({ value, label: value }))} /></label>
        {customType && <label className="form-field form-field--wide"><span>Подія <b>*</b></span><input autoFocus value={draft.customEvent} onChange={(event) => setDraft({ ...draft, customEvent: event.target.value })} placeholder="Наприклад, вимушена посадка" /></label>}
        <label className="form-field"><span>Статус</span><Select ariaLabel="Статус інциденту" value={draft.status} onChange={(status) => setDraft({ ...draft, status })} options={incidentStatuses.map((value) => ({ value, label: value }))} /></label>
        <label className="form-field"><span>Дата <b>*</b></span><input aria-label="Дата" required type="date" value={draft.incidentDate} onChange={(event) => setDraft({ ...draft, incidentDate: event.target.value })} /></label>
        <label className="form-field"><span>Час <b>*</b></span><input aria-label="Час" required type="time" value={draft.incidentTime} onChange={(event) => setDraft({ ...draft, incidentTime: event.target.value })} /></label>
        <label className="form-field"><span>Екіпаж</span><Select ariaLabel="Екіпаж інциденту" value={draft.crewId} onChange={chooseCrew} options={[{ value: "", label: "Не обирати екіпаж" }, ...crews.map((crew) => ({ value: String(crew.id), label: crew.name }))]} /></label>
        <label className="form-field"><span>Позиція</span><input readOnly value={draft.positionName} placeholder={selectedCrew ? "Позиція не вказана в екіпажі" : "Спочатку оберіть екіпаж"} /></label>
        <label className="form-field"><span>Район розвідки</span><input value={draft.reconnaissanceArea} onChange={(event) => setDraft({ ...draft, reconnaissanceArea: event.target.value })} /></label>
        {personnelIncident && <section className="incident-assets form-field--wide"><header><div><UsersRound /><span><b>Особи інциденту</b><small>Без складної системи ролей · вибрано {selectedPeople.length}</small></span></div><button className="button" onClick={() => setPersonPickerOpen(true)}><Plus />Додати осіб</button></header><div>{selectedPeople.map((person) => <article key={person.id}><span><b>{person.fullName}</b><small>{person.rank} · {person.position}</small></span><button className="icon-button danger" aria-label={`Прибрати ${person.fullName}`} onClick={() => togglePerson(person.id)}>×</button></article>)}{!selectedPeople.length && <p>Осіб ще не вибрано.</p>}</div></section>}
        <section className="incident-crew-snapshot form-field--wide"><header><div><UsersRound /><span><b>Фактичний склад екіпажу</b><small>{selectedCrew ? `${selectedCrew.actualMembers.length} осіб · ${crewOnSelectedDatePlan ? "на позиції за планом польотів" : "буде зафіксовано у записі"}` : "Спочатку оберіть екіпаж"}</small></span></div></header><div>{selectedCrew?.actualMembers.map((member) => <article key={member.personnelId}><b>{member.fullName}</b><small>{member.rank} · {member.position} · {member.callsign || "без позивного"}</small></article>)}{selectedCrew && !selectedCrew.actualMembers.length && <p>Фактичний склад не заповнений.</p>}{!selectedCrew && <p>Склад з’явиться після вибору екіпажу.</p>}</div></section>
        <section className="incident-assets form-field--wide"><header><div><PackageOpen /><span><b>Майно інциденту</b><small>{selectedCrew ? `Доступно ${crewEquipment.length} · вибрано ${selectedEquipment.length}` : "Майно доступне після вибору екіпажу"}</small></span></div><button className="button" disabled={!selectedCrew} onClick={() => setAssetPickerOpen(true)}><Plus />Додати майно</button></header><div>{selectedEquipment.map((asset) => <article key={asset.id}><span><b>{asset.name}</b><small>{equipmentCategoryLabels[asset.category]} · {asset.inventoryNumber || "без номера"} · {asset.status}</small></span><button className="icon-button danger" aria-label={`Прибрати ${asset.name}`} onClick={() => toggleEquipment(asset.id)}>×</button></article>)}{selectedCrew && !selectedEquipment.length && <p>Майно ще не вибране.</p>}{!selectedCrew && <p>Спочатку оберіть екіпаж.</p>}</div></section>
        {flightIncident && <><label className="form-field"><span>Етап польоту</span><Select ariaLabel="Етап польоту" value={draft.flightStage} onChange={(flightStage) => setDraft({ ...draft, flightStage })} options={[{ value: "", label: "Не вказано" }, ...flightStages.map((value) => ({ value, label: value }))]} /></label><label className="form-field"><span>Попередня причина</span><input value={draft.preliminaryCause} onChange={(event) => setDraft({ ...draft, preliminaryCause: event.target.value })} /></label></>}
        <label className="form-field form-field--wide"><span>Обставини події</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="form-field form-field--wide"><span>Першочергові дії</span><textarea value={draft.immediateActions} onChange={(event) => setDraft({ ...draft, immediateActions: event.target.value })} /></label>
        <label className="form-field"><span>Кому доповіли</span><input value={draft.reportedTo} onChange={(event) => setDraft({ ...draft, reportedTo: event.target.value })} /></label>
        <label className="form-field"><span>Дата доповіді</span><input type="date" value={draft.reportedDate} onChange={(event) => setDraft({ ...draft, reportedDate: event.target.value })} /></label>
        <label className="form-field"><span>Час доповіді</span><input type="time" value={draft.reportedTime} onChange={(event) => setDraft({ ...draft, reportedTime: event.target.value })} /></label>
        <label className="form-field form-field--wide"><span>Наслідки / поточний результат</span><textarea value={draft.consequences} onChange={(event) => setDraft({ ...draft, consequences: event.target.value })} /></label>
      </div>
      <footer className="modal-actions"><button className="button" onClick={() => setOpen(false)}>Скасувати</button><button className="button primary" onClick={() => void save()}>Зберегти інцидент</button></footer>
    </Modal>}
    {assetPickerOpen && selectedCrew && <RecordPickerModal title={`Майно екіпажу «${selectedCrew.name}»`} searchPlaceholder="Пошук за назвою, номером або станом…" items={crewEquipment.map((asset) => ({ id: asset.id, title: asset.name, subtitle: `${equipmentCategoryLabels[asset.category]} · ${asset.inventoryNumber || "без номера"} · ${asset.status}`, owner: asset.holderName || undefined }))} selectedIds={draft.equipmentIds} onToggle={toggleEquipment} onClose={() => setAssetPickerOpen(false)} />}
    {personPickerOpen && <RecordPickerModal title="Особи інциденту" items={people.map((person) => ({ id: person.id, title: person.fullName, subtitle: `${person.rank} · ${person.position}` }))} selectedIds={draft.personnelIds} onToggle={togglePerson} onClose={() => setPersonPickerOpen(false)} />}
    {selected && <Modal title={incidentDetailsTitle(selected)} subtitle={selected.category || "Інше"} onClose={() => setSelected(null)} className="incident-details"><div className="incident-details__body"><div className="incident-details__facts"><article><AlertTriangle /><span>Категорія<b>{selected.category || "Інше"}</b></span></article><article><AlertTriangle /><span>Статус<b>{selected.status || "Новий"}</b></span></article><article><CalendarDays /><span>Дата<b>{incidentDateTimeParts(selected.occurredAt).date}</b></span></article><article><Clock3 /><span>Час<b>{incidentDateTimeParts(selected.occurredAt).time}</b></span></article><article><UsersRound /><span>Екіпаж<b>{selected.crewName || "Не вказано"}</b></span></article><article><PackageOpen /><span>БпЛА / майно<b>{selected.equipmentNames?.join(" · ") || selected.equipmentName || "Не вказано"}</b></span></article><article><MapPin /><span>Позиція<b>{selected.positionName || "Не вказано"}</b></span></article><article><MapPin /><span>Район<b>{selected.reconnaissanceArea || "Не вказано"}</b></span></article></div>{selected.personnelNames?.length > 0 && <section><span>Особи інциденту</span><p>{selected.personnelNames.join(" · ")}</p></section>}<section><span>Склад екіпажу на момент події</span><p>{selected.crewSnapshot || "Не зафіксовано"}</p></section>{selected.vehicleName && <section><span>Автомобіль екіпажу</span><p>{selected.vehicleName}</p></section>}{selected.flightStage && <section><span>Етап польоту</span><p>{selected.flightStage}</p></section>}{selected.preliminaryCause && <section><span>Попередня причина</span><p>{selected.preliminaryCause}</p></section>}<section><span>Обставини події</span><p>{selected.description || "Без опису"}</p></section>{selected.immediateActions && <section><span>Першочергові дії</span><p>{selected.immediateActions}</p></section>}{selected.consequences && <section><span>Наслідки / результат</span><p>{selected.consequences}</p></section>}</div><footer className="modal-actions"><button className="button primary" onClick={() => setSelected(null)}>Готово</button></footer></Modal>}
  </PageFrame>;
}
