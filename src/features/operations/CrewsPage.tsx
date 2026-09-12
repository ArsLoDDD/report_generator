import { Box, Clock3, MapPin, PackageOpen, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Person } from "../../shared/types/domain";
import { personnelService } from "../../shared/services/personnelService";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { CardGridSkeleton } from "../../shared/ui/entity-card/CardGridSkeleton";
import { EntityCard, EntityCardGrid } from "../../shared/ui/entity-card/EntityCard";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { RecordPickerModal } from "../../shared/ui/record-picker/RecordPickerModal";
import { RegistryToolbar } from "../../shared/ui/RegistryToolbar";
import { Select } from "../../shared/ui/Select";
import { operationsService } from "./services/operationsService";
import type { Crew, CrewDraft, Equipment, EquipmentCategory, Incident, Position } from "./types";
import { vehiclesService } from "../vehicles/services/vehiclesService";
import type { Vehicle } from "../vehicles/types";

type CrewTab = "overview" | "members" | "assets" | "history";
type CrewAssetTab = "uav" | "vehicles" | Exclude<EquipmentCategory, "uav">;
const crewAssetTabs: Array<{ id: CrewAssetTab; label: string }> = [{ id: "uav", label: "БпЛА та БпАК" }, { id: "vehicles", label: "Автомобілі" }, { id: "generator", label: "Генератори" }, { id: "communications", label: "Зв’язок" }, { id: "weapon_ammo", label: "Зброя та БК" }];
const emptyDraft = (): CrewDraft => ({ name: "", platoon: "", positionName: "", reconnaissanceArea: "", unitType: "Екіпаж", companyName: "", battleOrder: "", sector: "", officialStrength: 0, workingStrength: 0, positionId: null, status: "Формується", uavName: "", uavType: "", primaryUavId: null, functionalDuties: "", currentLocation: "", notes: "", memberIds: [], actualMemberIds: [] });
const statuses = ["Працюючий", "Формується", "Не активний"];
const includes = (query: string, ...values: (string | null | undefined)[]) => values.join(" ").toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"));
async function allPersonnel() { const result: Person[] = []; let offset = 0; while (true) { const page = await personnelService.list(offset, 500); result.push(...page.items); offset = result.length; if (offset >= page.totalCount || !page.items.length) return result; } }

export function CrewsPage({ people }: { people: Person[] }) {
  const [items, setItems] = useState<Crew[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [uavs, setUavs] = useState<Equipment[]>([]);
  const [otherEquipment, setOtherEquipment] = useState<Equipment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [availablePeople, setAvailablePeople] = useState<Person[]>(people);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Crew | null>(null);
  const [draft, setDraft] = useState<CrewDraft>(emptyDraft);
  const [open, setOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<CrewTab>("overview");
  const [assetTab, setAssetTab] = useState<CrewAssetTab>("uav");
  const [memberTab, setMemberTab] = useState<"official" | "actual">("official");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleting, setDeleting] = useState<Crew | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [uavPickerOpen, setUavPickerOpen] = useState(false);
  const [pendingUav, setPendingUav] = useState<Equipment | null>(null);
  const [uavQuery, setUavQuery] = useState("");
  const [assignQuantity, setAssignQuantity] = useState(1);
  const { notify } = useNotifications();

  const reload = useCallback(() => {
    setIsLoading(true);
    void Promise.all([operationsService.listCrews(), operationsService.listPositions(), allPersonnel(), operationsService.listEquipment("uav"), operationsService.listIncidents(), Promise.all([operationsService.listEquipment("generator"), operationsService.listEquipment("communications"), operationsService.listEquipment("weapon_ammo")]), vehiclesService.list()])
      .then(([crews, nextPositions, nextPeople, nextUavs, nextIncidents, nextEquipment, nextVehicles]) => { setItems(crews); setPositions(nextPositions); setAvailablePeople(nextPeople); setUavs(nextUavs ?? []); setIncidents(nextIncidents ?? []); setOtherEquipment(nextEquipment.flatMap((group) => group ?? [])); setVehicles(nextVehicles ?? []); })
      .catch(() => notify("Не вдалося завантажити екіпажі.", "error"))
      .finally(() => setIsLoading(false));
  }, [notify]);
  useEffect(reload, [reload]);

  const filtered = useMemo(() => items.filter((crew) => includes(query, crew.name, crew.status, crew.sector, crew.uavName, crew.uavType, crew.positionName)), [items, query]);
  const close = () => { setOpen(false); setEditing(null); setDraft(emptyDraft()); setEditorTab("overview"); setMemberTab("official"); setPickerOpen(false); };
  const edit = (crew?: Crew) => { setEditing(crew ?? null); setDraft(crew ? { ...crew, memberIds: crew.members.map((member) => member.personnelId), actualMemberIds: crew.actualMembers.map((member) => member.personnelId) } : emptyDraft()); setEditorTab("overview"); setAssetTab("uav"); setOpen(true); };
  const save = async () => { try { const payload = { ...draft, officialStrength: draft.memberIds.length, workingStrength: draft.actualMemberIds.length }; if (editing) await operationsService.updateCrew(editing.id, payload); else await operationsService.createCrew(payload); close(); reload(); notify("Екіпаж збережено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти екіпаж.", "error"); } };
  const remove = async () => { if (!deleting) return; setDeletingBusy(true); try { await operationsService.deleteCrew(deleting.id); setDeleting(null); reload(); notify("Екіпаж видалено.", "success"); } catch { notify("Не вдалося видалити екіпаж.", "error"); } finally { setDeletingBusy(false); } };
  const assignUav = async (uav: Equipment, crewId: number | null, quantity = 1) => {
    try {
      await operationsService.assignEquipment(uav.id, crewId, quantity);
      if (editing) {
        const remaining = uavs.filter((item) => item.crewId === editing.id && item.id !== uav.id);
        const primaryUavId = crewId && draft.primaryUavId === null ? uav.id : !crewId && draft.primaryUavId === uav.id ? remaining[0]?.id ?? null : draft.primaryUavId;
        if (primaryUavId !== draft.primaryUavId) setDraft((current) => ({ ...current, primaryUavId }));
      }
      setPendingUav(null); setUavPickerOpen(false); setUavQuery(""); reload();
      notify(crewId ? "Майно закріплено за екіпажем." : "Майно знято з екіпажу.", "success");
    } catch { notify("Не вдалося змінити прив’язку майна.", "error"); }
  };
  const unassignVehicle = async (vehicle: Vehicle) => { try { await vehiclesService.assign(vehicle.id, null, null); reload(); notify("Автомобіль знято з екіпажу.", "success"); } catch { notify("Не вдалося змінити прив’язку автомобіля.", "error"); } };

  const memberIds = memberTab === "official" ? draft.memberIds : draft.actualMemberIds;
  const selectedPeople = memberIds.map((id) => availablePeople.find((person) => person.id === id)).filter((person): person is Person => Boolean(person));
  const assignment = (personId: number) => items.find((crew) => crew.id !== editing?.id && (memberTab === "official" ? crew.members : crew.actualMembers).some((member) => member.personnelId === personId));
  const toggle = (id: number) => setDraft((current) => {
    if (memberTab === "actual") return { ...current, actualMemberIds: current.actualMemberIds.includes(id) ? current.actualMemberIds.filter((value) => value !== id) : [...current.actualMemberIds, id] };
    if (current.memberIds.includes(id)) return { ...current, memberIds: current.memberIds.filter((value) => value !== id) };
    return { ...current, memberIds: [...current.memberIds, id], actualMemberIds: current.actualMemberIds.includes(id) ? current.actualMemberIds : [...current.actualMemberIds, id] };
  });
  const crewAssets = editing ? uavs.filter((uav) => uav.crewId === editing.id) : [];
  const crewMemberIds = new Set([...draft.memberIds, ...draft.actualMemberIds]);
  const crewOtherAssets = editing ? otherEquipment.filter((item) => item.crewId === editing.id || Boolean(item.personnelId && crewMemberIds.has(item.personnelId))) : [];
  const crewVehicles = editing ? vehicles.filter((item) => item.crewId === editing.id || Boolean(item.personnelId && crewMemberIds.has(item.personnelId))) : [];
  const crewAssetCount = crewAssets.length + crewOtherAssets.length + crewVehicles.length;
  const assetsForTab = assetTab === "uav" ? crewAssets : assetTab === "vehicles" ? crewVehicles : crewOtherAssets.filter((item) => item.category === assetTab);
  const assetCount = (tab: CrewAssetTab) => tab === "uav" ? crewAssets.length : tab === "vehicles" ? crewVehicles.length : crewOtherAssets.filter((item) => item.category === tab).length;
  const crewIncidents = editing ? incidents.filter((incident) => incident.crewId === editing.id) : [];

  return <PageFrame className="crews-page" header={<PageTitle title="Екіпажі" subtitle="Єдиний облік екіпажів, позицій, складу та майна" actions={<button className="button primary" onClick={() => edit()}><Plus />Створити екіпаж</button>} />} tools={<RegistryToolbar placeholder="Пошук за назвою, статусом, смугою, БпАК або позицією…" query={query} onQueryChange={setQuery} resultCount={filtered.length} />}>
    <EntityCardGrid className="crews-grid">{filtered.map((crew) => { const assets = uavs.filter((uav) => uav.crewId === crew.id); return <EntityCard className={`crew-card crew-card--${crew.status === "Працюючий" ? "working" : crew.status === "Формується" ? "forming" : "inactive"}`} key={crew.id} onClick={() => edit(crew)}>
      <header><div className="crew-card__mark"><Box /></div><div><h2>{crew.name}</h2><span>{crew.sector || "Смуга не вказана"}</span></div><span className="crew-card__status">{crew.status}</span></header>
      <div className="crew-card__context"><span><MapPin />{crew.positionName || "Позиція не обрана"}</span><span><PackageOpen />{assets.map((item) => item.name).join(" · ") || "БпЛА не закріплені"}</span></div>
      <div className="crew-card__roster">{crew.actualMembers.map((member) => <b key={member.personnelId} title={member.fullName}>{member.fullName.split(" ")[0]}</b>)}{!crew.actualMembers.length && <em>Склад не заповнений</em>}</div>
    </EntityCard>; })}{!filtered.length && <section className="panel personnel-state"><UsersRound /><b>Екіпажів поки немає</b><span>Створіть екіпаж і сформуйте його склад.</span></section>}</EntityCardGrid>
    {isLoading && <div className="operations-loading-overlay"><CardGridSkeleton /></div>}

    {open && <Modal title={editing ? editing.name : "Новий екіпаж"} subtitle={editing ? `${editing.sector || "Смуга не вказана"} · ${editing.positionName || "позиція не обрана"}` : undefined} onClose={close} className="crew-editor"><div className="crew-editor__body">
      <nav className="entity-tabs" aria-label="Розділи картки екіпажу"><button className={editorTab === "overview" ? "active" : ""} onClick={() => setEditorTab("overview")}>Огляд</button><button className={editorTab === "members" ? "active" : ""} disabled={!editing} onClick={() => setEditorTab("members")}>ОС <b>{draft.actualMemberIds.length}</b></button><button className={editorTab === "assets" ? "active" : ""} disabled={!editing} onClick={() => setEditorTab("assets")}>Майно <b>{crewAssetCount}</b></button><button className={editorTab === "history" ? "active" : ""} disabled={!editing} onClick={() => setEditorTab("history")}>Історія <b>{crewIncidents.length}</b></button></nav>
      {editorTab === "overview" && <div className="crew-editor__overview"><div className="operation-editor__body"><label className="form-field"><span>Назва <b>*</b></span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="form-field"><span>Статус</span><Select ariaLabel="Статус екіпажу" value={draft.status} onChange={(status) => setDraft({ ...draft, status })} options={statuses.map((value) => ({ value, label: value }))} /></label><label className="form-field"><span>Смуга роботи</span><input value={draft.sector} onChange={(event) => setDraft({ ...draft, sector: event.target.value })} /><small>Автоматично береться зі смуги обраної позиції.</small></label><label className="form-field"><span>Позиція</span><Select ariaLabel="Позиція екіпажу" value={draft.positionId?.toString() ?? ""} onChange={(value) => { const position = positions.find((item) => item.id === Number(value)); setDraft({ ...draft, positionId: value ? Number(value) : null, sector: position?.stripName || draft.sector }); }} options={[{ value: "", label: "Не обрана" }, ...positions.map((position) => ({ value: String(position.id), label: `${position.name} · ${position.stripName || "без смуги"}` }))]} /></label><label className="form-field"><span>Основний БпЛА</span><Select ariaLabel="Основний БпЛА" value={draft.primaryUavId?.toString() ?? ""} onChange={(value) => setDraft({ ...draft, primaryUavId: value ? Number(value) : null })} options={[{ value: "", label: "Не обрано" }, ...crewAssets.map((uav) => ({ value: String(uav.id), label: `${uav.name} · ${uav.inventoryNumber || "без номера"}` }))]} /><small>Оберіть серед БпЛА, закріплених за екіпажем.</small></label><label className="form-field form-field--wide"><span>Примітка</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>{!editing && <div className="crew-overview-actions form-field--wide"><button className="button" onClick={() => { setMemberTab("official"); setPickerOpen(true); }}><Plus />Додати людей</button></div>}</div></div>}
      {editorTab === "members" && <section className="crew-editor__members"><div className="crew-member-tabs"><button className={memberTab === "official" ? "active" : ""} onClick={() => setMemberTab("official")}>Офіційний склад <b>{draft.memberIds.length}</b></button><button className={memberTab === "actual" ? "active" : ""} onClick={() => setMemberTab("actual")}>Фактичний склад <b>{draft.actualMemberIds.length}</b></button></div><div className="crew-members-heading"><p>{memberTab === "official" ? "Люди, офіційно закріплені за екіпажем." : "Люди, які зараз фактично виконують завдання у цьому екіпажі."}</p><button className="button" onClick={() => setPickerOpen(true)}><Plus />Додати людей</button></div><div className="crew-selected-members">{selectedPeople.map((person) => <article key={person.id}><div><b>{person.fullName}</b><small>{person.rank} · {person.position} · {person.coreFields?.callsign || "без позивного"}</small></div><button className="icon-button danger" title="Прибрати зі складу" onClick={() => toggle(person.id)}><Trash2 /></button></article>)}{!selectedPeople.length && <span>Склад ще не заповнений.</span>}</div></section>}
      {editorTab === "assets" && <section className="crew-editor__uavs"><div className="crew-members-heading"><p><b>Майно екіпажу</b><br />Прямі прив’язки екіпажу та особисте майно його ОС показані окремо.</p>{assetTab === "uav" && <button className="button" onClick={() => setUavPickerOpen(true)}><Plus />Закріпити БпЛА</button>}</div><nav className="crew-asset-tabs" aria-label="Категорії майна екіпажу">{crewAssetTabs.map((tab) => <button key={tab.id} className={assetTab === tab.id ? "active" : ""} onClick={() => setAssetTab(tab.id)}>{tab.label}<b>{assetCount(tab.id)}</b></button>)}</nav><div className="crew-asset-tab-content">{assetTab === "uav" && crewAssets.map((uav) => <article key={uav.id}><div><b>{uav.name}</b><small>{uav.inventoryNumber || "Без номера"} · {uav.assignedQuantity || uav.totalQuantity} шт · денні {uav.dayQuantity}, нічні {uav.nightQuantity}</small><em>Закріплено за екіпажем</em></div><div className="crew-asset-actions">{uav.id === draft.primaryUavId && <span className="crew-asset-primary">Основний</span>}<button className="icon-button danger" title="Зняти з екіпажу" onClick={() => void assignUav(uav, null)}><Trash2 /></button></div></article>)}{assetTab === "vehicles" && crewVehicles.map((vehicle) => <article key={vehicle.id}><div><b>{vehicle.name}</b><small>{vehicle.registrationNumber} · {vehicle.status}</small><em>{vehicle.crewId === editing?.id ? `За екіпажем${vehicle.driverName ? ` · відповідальний: ${vehicle.driverName}` : ""}` : `За ОС: ${vehicle.driverName || "військовослужбовець"}`}</em></div>{vehicle.crewId === editing?.id && <button className="icon-button danger" title="Зняти автомобіль з екіпажу" onClick={() => void unassignVehicle(vehicle)}><Trash2 /></button>}</article>)}{assetTab !== "uav" && assetTab !== "vehicles" && (assetsForTab as Equipment[]).map((asset) => <article key={asset.id}><div><b>{asset.name}</b><small>{asset.inventoryNumber || "Без номера"} · {asset.totalQuantity} шт · {asset.status}</small><em>{asset.crewId === editing?.id ? `За екіпажем${asset.holderName ? ` · відповідальний: ${asset.holderName}` : ""}` : `За ОС: ${asset.holderName || "військовослужбовець"}`}</em></div>{asset.crewId === editing?.id && <button className="icon-button danger" title="Зняти майно з екіпажу" onClick={() => void assignUav(asset, null)}><Trash2 /></button>}</article>)}{assetsForTab.length === 0 && <div className="crew-assets-empty"><PackageOpen /><span>У цій категорії майно не закріплене.</span></div>}</div></section>}
      {editorTab === "history" && <section className="crew-history">{crewIncidents.length ? crewIncidents.map((incident) => <article key={incident.id}><Clock3 /><div><b>{incident.incidentType}</b><span>{incident.occurredAt} · {incident.positionName || "позицію не вказано"}</span><p>{incident.description || "Без опису"}</p></div></article>) : <div className="crew-history__empty"><Clock3 /><b>Історія порожня</b><span>Події екіпажу та пов’язані інциденти з’являться тут.</span></div>}</section>}
    </div><footer className="modal-actions crew-editor__actions">{editing && <button className="button danger" onClick={() => { setDeleting(editing); setOpen(false); }}><Trash2 />Видалити екіпаж</button>}<button className="button" onClick={close}>Скасувати</button><button className="button primary" onClick={() => void save()}>Зберегти екіпаж</button></footer></Modal>}

    {pickerOpen && <RecordPickerModal title={memberTab === "official" ? "Додати до офіційного складу" : "Додати до фактичного складу"} items={availablePeople.map((person) => { const current = assignment(person.id); return { id: person.id, title: person.fullName, subtitle: `${person.rank} · ${person.position}`, owner: current ? `Зараз у «${current.name}» — буде переміщено` : undefined }; })} selectedIds={memberIds} onToggle={toggle} onClose={() => setPickerOpen(false)} />}
    {uavPickerOpen && editing && <Modal title={`Закріпити БпЛА за «${editing.name}»`} onClose={() => { setUavPickerOpen(false); setPendingUav(null); setUavQuery(""); }} className="asset-picker"><div className="asset-picker__body"><label className="asset-picker__search"><Search /><input value={uavQuery} onChange={(event) => setUavQuery(event.target.value)} placeholder="Пошук за моделлю або номером…" /></label><div className="asset-picker__group"><span>Доступні · {uavs.filter((item) => !item.crewId).length}</span>{[...uavs].filter((item) => !item.crewId && includes(uavQuery, item.name, item.inventoryNumber, item.uavType)).sort((a, b) => a.name.localeCompare(b.name, "uk")).map((uav) => <button className={pendingUav?.id === uav.id ? "selected" : ""} key={uav.id} onClick={() => { setPendingUav(uav); setAssignQuantity(uav.assetKind === "complex" ? 1 : uav.totalQuantity); }}><div><b>{uav.name}</b><small>{uav.inventoryNumber || "без номера"} · доступно {uav.totalQuantity} шт</small></div><i /></button>)}</div><div className="asset-picker__group asset-picker__group--assigned"><span>Закріплені за іншими екіпажами · {uavs.filter((item) => item.crewId && item.crewId !== editing.id).length}</span>{uavs.filter((item) => item.crewId && item.crewId !== editing.id && includes(uavQuery, item.name, item.inventoryNumber, item.uavType)).map((uav) => <button key={uav.id} onClick={() => { setPendingUav(uav); setAssignQuantity(uav.assetKind === "complex" ? 1 : uav.totalQuantity); }}><div><b>{uav.name}</b><small>{uav.inventoryNumber || "без номера"} · {uav.assignedQuantity || uav.totalQuantity} шт</small></div><em>{uav.crewName}</em></button>)}</div></div>{pendingUav && !pendingUav.crewId && <footer className="asset-picker__footer"><div><b>{pendingUav.name}</b>{pendingUav.assetKind !== "complex" && <label>Кількість <input type="number" min="1" max={pendingUav.totalQuantity} value={assignQuantity} onChange={(event) => setAssignQuantity(Math.min(pendingUav.totalQuantity, Math.max(1, Number(event.target.value) || 1)))} /></label>}</div><button className="button primary" onClick={() => void assignUav(pendingUav, editing.id, assignQuantity)}>Закріпити</button></footer>}</Modal>}
    {pendingUav && editing && pendingUav.crewId && <ConfirmDialog title="Перепризначити БпЛА?" message={`«${pendingUav.name}» зараз закріплено за екіпажем «${pendingUav.crewName}». Після підтвердження попередню прив’язку буде знято.`} confirmLabel="Перепризначити" onConfirm={() => void assignUav(pendingUav, editing.id, assignQuantity)} onCancel={() => setPendingUav(null)} />}
    {deleting && <ConfirmDialog title="Видалити екіпаж?" message={`Екіпаж «${deleting.name}» буде видалено. Прив’язки його офіційного та фактичного складу буде знято.`} confirmLabel="Видалити" onConfirm={() => void remove()} onCancel={() => setDeleting(null)} busy={deletingBusy} />}
  </PageFrame>;
}
