import { AlertTriangle, CalendarDays, Clock3, MapPin, PackageOpen, Plus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState, type UIEventHandler } from "react";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Select } from "../../shared/ui/Select";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, EquipmentCategory, Incident } from "./types";
import { useEntityCollection } from "../../shared/hooks/useEntityCollection";
import { incidentDateTimeParts } from "./incident-date";
import { RecordPickerModal } from "../../shared/ui/record-picker/RecordPickerModal";
import { flightPlanDateMatches, flightPlanSelectedCrewIds } from "./flight-plan-storage";

const equipmentCategories: EquipmentCategory[] = ["uav", "generator", "communications", "weapon_ammo"];
const equipmentCategoryLabels: Record<EquipmentCategory, string> = { uav: "БпЛА та БпАК", generator: "Генератори", communications: "Зв’язок", weapon_ammo: "Зброя та БК" };
const incidentTypes = ["Втрата БпЛА", "Пошкодження БпЛА", "Втрата майна", "Пошкодження майна", "Втрата зв’язку", "Несправність генератора", "Пошкодження автомобіля", "Інший інцидент"];
const localDateParts = () => { const now = new Date(); return { incidentDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, incidentTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` }; };
const emptyDraft = () => ({ incidentType: "Втрата БпЛА", customEvent: "", ...localDateParts(), crewId: "", equipmentIds: [] as number[], positionName: "", reconnaissanceArea: "", description: "" });
const incidentColumns: EntityTableColumn<Incident>[] = [
  { key: "id", title: "№", render: (_item, rowIndex) => rowIndex + 1 },
  { key: "event", title: "Подія", render: (item) => <><b>{item.incidentType}</b><small>{item.description}</small></> },
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
  const [visibleLimit, setVisibleLimit] = useState(20);
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

  useEffect(() => { void operationsService.listCrews().then(setCrews).catch(() => setCrews([])); void Promise.all(equipmentCategories.map((category) => operationsService.listEquipment(category))).then((groups) => setEquipment(groups.flatMap((group) => group ?? []))).catch(() => setEquipment([])); }, []);

  const chooseCrew = (crewId: string) => {
    const crew = crews.find((item) => item.id === Number(crewId));
    const planPositionName = crew && flightPlanSelectedCrewIds().has(crew.id) && flightPlanDateMatches(draft.incidentDate) ? crew.positionName : "";
    setDraft((current) => ({ ...current, crewId, equipmentIds: [], positionName: planPositionName || crew?.positionName || "", reconnaissanceArea: crew?.reconnaissanceArea ?? "" }));
  };

  const save = async () => {
    const incidentType = draft.incidentType === "Інший інцидент" ? draft.customEvent.trim() : draft.incidentType;
    if (!incidentType) { notify("Вкажіть подію для іншого інциденту.", "error"); return; }
    try {
      await operationsService.createIncident({ incidentType, occurredAt: draft.incidentDate && draft.incidentTime ? `${draft.incidentDate}T${draft.incidentTime}` : "", crewId: draft.crewId ? Number(draft.crewId) : null, equipmentId: draft.equipmentIds[0] ?? null, equipmentIds: draft.equipmentIds, positionName: draft.positionName, reconnaissanceArea: draft.reconnaissanceArea, description: draft.description });
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
  const crewOnSelectedDatePlan = Boolean(selectedCrew && flightPlanSelectedCrewIds().has(selectedCrew.id) && flightPlanDateMatches(draft.incidentDate));
  const actualPersonnelIds = new Set(selectedCrew?.actualMembers.map((member) => member.personnelId) ?? []);
  const crewEquipment = equipment.filter((asset) => asset.crewId === selectedCrew?.id || Boolean(asset.personnelId && actualPersonnelIds.has(asset.personnelId)));
  const selectedEquipment = draft.equipmentIds.map((id) => crewEquipment.find((asset) => asset.id === id)).filter((asset): asset is Equipment => Boolean(asset));
  const toggleEquipment = (equipmentId: number) => setDraft((current) => ({ ...current, equipmentIds: current.equipmentIds.includes(equipmentId) ? current.equipmentIds.filter((id) => id !== equipmentId) : [...current.equipmentIds, equipmentId] }));
  const onTableScroll: UIEventHandler<HTMLDivElement> = (event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 100) setVisibleLimit((current) => Math.min(current + 20, items.length)); };

  return <PageFrame className="incidents-page" header={<PageTitle title="Інциденти" subtitle="Події з автоматичним збереженням пов’язаного екіпажу та майна" actions={<button className="button primary" onClick={() => { setDraft(emptyDraft()); setOpen(true); }}><Plus />Додати інцидент</button>} />}>
    <section className="panel operation-table data-table incident-table">
      <EntityTable className="operation-table__table" items={visibleItems} columns={incidentColumns} rowKey={(item) => item.id} selectedKey={selected?.id} onSelect={setSelected} onScroll={onTableScroll} emptyState={<div className="personnel-state"><AlertTriangle /><b>Інцидентів поки немає</b><span>Зафіксуйте першу подію.</span></div>} />
      <div className="pagination">Показано {visibleItems.length} із {items.length}</div>
    </section>
    {open && <Modal title="Новий інцидент" onClose={() => setOpen(false)} className="incident-editor">
      <div className="operation-editor__body">
        <label className="form-field"><span>Тип інциденту</span><Select ariaLabel="Тип інциденту" value={draft.incidentType} onChange={(incidentType) => setDraft({ ...draft, incidentType })} options={incidentTypes.map((value) => ({ value, label: value }))} /></label>
        {draft.incidentType === "Інший інцидент" && <label className="form-field"><span>Подія <b>*</b></span><input autoFocus value={draft.customEvent} onChange={(event) => setDraft({ ...draft, customEvent: event.target.value })} placeholder="Наприклад, вимушена посадка" /></label>}
        <label className="form-field"><span>Дата</span><input required type="date" value={draft.incidentDate} onChange={(event) => setDraft({ ...draft, incidentDate: event.target.value })} /></label>
        <label className="form-field"><span>Час</span><input required type="time" value={draft.incidentTime} onChange={(event) => setDraft({ ...draft, incidentTime: event.target.value })} /></label>
        <label className="form-field"><span>Екіпаж</span><Select ariaLabel="Екіпаж інциденту" value={draft.crewId} onChange={chooseCrew} options={[{ value: "", label: "Не обирати екіпаж" }, ...crews.map((crew) => ({ value: String(crew.id), label: crew.name }))]} /></label>
        <label className="form-field"><span>Позиція</span><input readOnly value={draft.positionName} placeholder={selectedCrew ? "Позиція не вказана в екіпажі" : "Спочатку оберіть екіпаж"} /></label>
        <label className="form-field"><span>Район розвідки</span><input value={draft.reconnaissanceArea} onChange={(event) => setDraft({ ...draft, reconnaissanceArea: event.target.value })} /></label>
        <section className="incident-crew-snapshot form-field--wide"><header><div><UsersRound /><span><b>Фактичний склад екіпажу</b><small>{selectedCrew ? `${selectedCrew.actualMembers.length} осіб · ${crewOnSelectedDatePlan ? "на позиції за планом польотів" : "буде зафіксовано у записі"}` : "Спочатку оберіть екіпаж"}</small></span></div></header><div>{selectedCrew?.actualMembers.map((member) => <article key={member.personnelId}><b>{member.fullName}</b><small>{member.rank} · {member.position} · {member.callsign || "без позивного"}</small></article>)}{selectedCrew && !selectedCrew.actualMembers.length && <p>Фактичний склад не заповнений.</p>}{!selectedCrew && <p>Склад з’явиться після вибору екіпажу.</p>}</div></section>
        <section className="incident-assets form-field--wide"><header><div><PackageOpen /><span><b>Майно інциденту</b><small>{selectedCrew ? `Доступно ${crewEquipment.length} · вибрано ${selectedEquipment.length}` : "Майно доступне після вибору екіпажу"}</small></span></div><button className="button" disabled={!selectedCrew} onClick={() => setAssetPickerOpen(true)}><Plus />Додати майно</button></header><div>{selectedEquipment.map((asset) => <article key={asset.id}><span><b>{asset.name}</b><small>{equipmentCategoryLabels[asset.category]} · {asset.inventoryNumber || "без номера"} · {asset.status}</small></span><button className="icon-button danger" aria-label={`Прибрати ${asset.name}`} onClick={() => toggleEquipment(asset.id)}>×</button></article>)}{selectedCrew && !selectedEquipment.length && <p>Майно ще не вибране.</p>}{!selectedCrew && <p>Спочатку оберіть екіпаж.</p>}</div></section>
        <label className="form-field form-field--wide"><span>Опис</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      </div>
      <footer className="modal-actions"><button className="button" onClick={() => setOpen(false)}>Скасувати</button><button className="button primary" onClick={() => void save()}>Зберегти інцидент</button></footer>
    </Modal>}
    {assetPickerOpen && selectedCrew && <RecordPickerModal title={`Майно екіпажу «${selectedCrew.name}»`} searchPlaceholder="Пошук за назвою, номером або станом…" items={crewEquipment.map((asset) => ({ id: asset.id, title: asset.name, subtitle: `${equipmentCategoryLabels[asset.category]} · ${asset.inventoryNumber || "без номера"} · ${asset.status}`, owner: asset.holderName || undefined }))} selectedIds={draft.equipmentIds} onToggle={toggleEquipment} onClose={() => setAssetPickerOpen(false)} />}
    {selected && <Modal title={`Інцидент №${selected.id}`} subtitle={selected.incidentType} onClose={() => setSelected(null)} className="incident-details"><div className="incident-details__body"><div className="incident-details__facts"><article><CalendarDays /><span>Дата<b>{incidentDateTimeParts(selected.occurredAt).date}</b></span></article><article><Clock3 /><span>Час<b>{incidentDateTimeParts(selected.occurredAt).time}</b></span></article><article><UsersRound /><span>Екіпаж<b>{selected.crewName || "Не вказано"}</b></span></article><article><PackageOpen /><span>БпЛА / майно<b>{selected.equipmentNames?.join(" · ") || selected.equipmentName || "Не вказано"}</b></span></article><article><MapPin /><span>Позиція<b>{selected.positionName || "Не вказано"}</b></span></article><article><MapPin /><span>Район<b>{selected.reconnaissanceArea || "Не вказано"}</b></span></article></div><section><span>Склад екіпажу на момент події</span><p>{selected.crewSnapshot || "Не зафіксовано"}</p></section>{selected.vehicleName && <section><span>Автомобіль екіпажу</span><p>{selected.vehicleName}</p></section>}<section><span>Опис події</span><p>{selected.description || "Без опису"}</p></section></div><footer className="modal-actions"><button className="button primary" onClick={() => setSelected(null)}>Готово</button></footer></Modal>}
  </PageFrame>;
}
