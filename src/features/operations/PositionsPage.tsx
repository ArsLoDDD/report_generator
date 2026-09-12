import { Car, Clock3, Crosshair, MapPin, PackageOpen, Plane, Plus, Radio, Shield, Trash2, UsersRound, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type UIEventHandler } from "react";
import { useEntityCollection } from "../../shared/hooks/useEntityCollection";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { CardGridSkeleton } from "../../shared/ui/entity-card/CardGridSkeleton";
import { EntityCard, EntityCardGrid } from "../../shared/ui/entity-card/EntityCard";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { RegistryToolbar } from "../../shared/ui/RegistryToolbar";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, EquipmentCategory, Incident, Position, PositionDraft } from "./types";
import { flightPlanSelectedCrewIds } from "./flight-plan-storage";
import { incidentDateTimeParts } from "./incident-date";
import { vehiclesService } from "../vehicles/services/vehiclesService";
import type { Vehicle } from "../vehicles/types";

type PositionTab = "overview" | "relations" | "history";
type PositionAssetTab = EquipmentCategory | "vehicles";
const emptyDraft = (): PositionDraft => ({ name: "", positionType: "Основна", stripName: "", locality: "", battleOrder: "", sector: "", condition: "", conditionLevel: 0, fieldType: "", size: "", mgrs: "", suitableUavText: "", isActive: false, crewId: null, notes: "", uavIds: [] });
const includes = (query: string, ...values: (string | null | undefined)[]) => values.join(" ").toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"));
const positionTypeClass = (type: Position["positionType"]) => type === "Основна" ? "primary" : type === "Запасна" ? "reserve" : type === "Облаштовується" ? "building" : type === "Виявлена ворогом" ? "compromised" : "allied";
const equipmentCategoryLabels: Record<EquipmentCategory, string> = { uav: "БпЛА та БпАК", generator: "Генератори", communications: "Зв’язок", weapon_ammo: "Зброя та БК" };

export function PositionsPage() {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Position | null>(null);
  const [open, setOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<PositionTab>("overview");
  const [draft, setDraft] = useState<PositionDraft>(emptyDraft);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [assetTab, setAssetTab] = useState<PositionAssetTab>("uav");
  const [deleting, setDeleting] = useState<Position | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const { notify } = useNotifications();
  const loadPositions = useCallback(() => operationsService.listPositions(), []);
  const onLoadError = useCallback(() => notify("Не вдалося завантажити позиції.", "error"), [notify]);
  const { items, isLoading, reload: reloadItems } = useEntityCollection({ load: loadPositions, onError: onLoadError });
  const reload = useCallback(() => { void reloadItems(); }, [reloadItems]);

  useEffect(() => {
    void Promise.all([operationsService.listIncidents(), operationsService.listCrews(), Promise.all((["uav", "generator", "communications", "weapon_ammo"] as EquipmentCategory[]).map((category) => operationsService.listEquipment(category))), vehiclesService.list()])
      .then(([nextIncidents, nextCrews, nextEquipment, nextVehicles]) => { setIncidents(nextIncidents ?? []); setCrews(nextCrews ?? []); setEquipment(nextEquipment.flatMap((group) => group ?? [])); setVehicles(nextVehicles ?? []); })
      .catch(() => { setIncidents([]); setCrews([]); setEquipment([]); setVehicles([]); });
  }, []);

  const filtered = useMemo(() => items.filter((item) => includes(query, item.name, item.locality, item.battleOrder, item.notes, item.condition, item.crewName)), [items, query]);
  useEffect(() => setVisibleLimit(20), [query]);
  const visibleItems = filtered.slice(0, visibleLimit);
  const onContentScroll: UIEventHandler<HTMLDivElement> = (event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 100) setVisibleLimit((current) => Math.min(current + 20, filtered.length)); };
  const positionIncidents = useMemo(() => editing ? incidents.filter((incident) => incident.positionName === editing.name) : [], [editing, incidents]);
  const edit = (item?: Position) => { setEditing(item ?? null); setDraft(item ? { ...item, uavIds: [] } : emptyDraft()); setEditorTab("overview"); setAssetTab("uav"); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); setDraft(emptyDraft()); setEditorTab("overview"); setAssetTab("uav"); };
  const savePosition = async () => { try { const payload = { ...draft, uavIds: [] }; if (editing) await operationsService.updatePosition(editing.id, payload); else await operationsService.createPosition(payload); close(); reload(); notify("Позицію збережено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти позицію.", "error"); } };
  const remove = async () => { if (!deleting) return; setDeletingBusy(true); try { await operationsService.deletePosition(deleting.id); setDeleting(null); reload(); notify("Позицію видалено.", "success"); } catch { notify("Не вдалося видалити позицію.", "error"); } finally { setDeletingBusy(false); } };

  const onPositionCrewIds = flightPlanSelectedCrewIds();
  const editingCrews = editing ? crews.filter((crew) => crew.positionId === editing.id) : [];
  const activePositionCrews = editingCrews.filter((crew) => onPositionCrewIds.has(crew.id));
  const activeCrewIds = new Set(activePositionCrews.map((crew) => crew.id));
  const activePersonnelIds = new Set(activePositionCrews.flatMap((crew) => (crew.actualMembers ?? []).map((member) => member.personnelId)));
  const positionEquipment = equipment.filter((item) => Boolean(item.crewId && activeCrewIds.has(item.crewId)) || Boolean(item.personnelId && activePersonnelIds.has(item.personnelId)));
  const positionVehicles = vehicles.filter((item) => Boolean(item.crewId && activeCrewIds.has(item.crewId)) || Boolean(item.personnelId && activePersonnelIds.has(item.personnelId)));
  const assetsForTab = assetTab === "vehicles" ? positionVehicles : positionEquipment.filter((item) => item.category === assetTab);
  const assetCount = (tab: PositionAssetTab) => tab === "vehicles" ? positionVehicles.length : positionEquipment.filter((item) => item.category === tab).length;
  return <PageFrame className="positions-page" onContentScroll={onContentScroll} footer={<div className="panel pagination card-registry__pagination">Показано {visibleItems.length} із {filtered.length}</div>} header={<PageTitle title="Позиції" subtitle="Робочі райони, прив’язані екіпажі та готовність позицій" actions={<button className="button primary" onClick={() => edit()}><Plus />Додати позицію</button>} />} tools={<RegistryToolbar className="card-registry-toolbar" placeholder="Пошук за назвою, районом, БРО або екіпажем…" query={query} onQueryChange={setQuery} />}>
    <EntityCardGrid className="positions-grid">{visibleItems.map((item) => { const positionCrews = crews.filter((crew) => crew.positionId === item.id).sort((left, right) => Number(onPositionCrewIds.has(right.id)) - Number(onPositionCrewIds.has(left.id))); const visibleCrews = positionCrews.slice(0, 2); const hiddenCrewCount = positionCrews.length - visibleCrews.length; const hasCrewOnPosition = positionCrews.some((crew) => onPositionCrewIds.has(crew.id)); return <EntityCard className={`position-card position-card--${positionTypeClass(item.positionType)}`} key={item.id} onClick={() => edit(item)}>
      <header><span className="position-card__icon"><Crosshair /></span><div><small>Позиція</small><h2>{item.name}</h2></div><div className="position-card__indicators"><span className="position-card__type">{item.positionType}</span>{hasCrewOnPosition && <span className="on-position-indicator">На позиції</span>}</div></header>
      <div className="position-card__chips position-card__meta">
        {item.battleOrder && <span className="position-card__chip">{item.battleOrder}</span>}
        <span className="position-card__chip"><MapPin />{item.locality || "Населений пункт не вказано"}</span>
      </div>
      <div className="position-card__chips position-card__crews">{visibleCrews.length ? visibleCrews.map((crew) => <span title={`${crew.name} · ${crew.status} · фактично ${crew.workingStrength} із ${crew.officialStrength}`} key={crew.id} className={`position-card__chip position-card__crew ${onPositionCrewIds.has(crew.id) ? "is-on-position" : ""}`}><UsersRound />{crew.name}</span>) : <span className="position-card__chip position-card__crew is-empty"><UsersRound />Екіпаж не закріплений</span>}{hiddenCrewCount > 0 && <span className="position-card__chip position-card__more" title={positionCrews.slice(2).map((crew) => crew.name).join(", ")}>+{hiddenCrewCount}</span>}</div>
    </EntityCard>; })}</EntityCardGrid>
    {isLoading && <div className="operations-loading-overlay"><CardGridSkeleton variant="position" /></div>}

    {open && <Modal title={editing ? editing.name : "Нова позиція"} subtitle={editing ? editing.locality || "Район не вказано" : "Створення нової позиції"} onClose={close} className="position-editor"><div className="position-editor__body">
      <nav className="entity-tabs" aria-label="Розділи картки позиції"><button className={editorTab === "overview" ? "active" : ""} onClick={() => setEditorTab("overview")}>Огляд</button><button className={editorTab === "relations" ? "active" : ""} disabled={!editing} onClick={() => setEditorTab("relations")}>Екіпажі і майно</button><button className={editorTab === "history" ? "active" : ""} disabled={!editing} onClick={() => setEditorTab("history")}>Історія <b>{positionIncidents.length}</b></button></nav>
      {editorTab === "overview" && <div className="operation-editor__body position-editor__form"><label className="form-field"><span>Назва <b>*</b></span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="form-field"><span>БРО</span><input value={draft.battleOrder} onChange={(event) => setDraft({ ...draft, battleOrder: event.target.value })} /></label><label className="form-field"><span>Населений пункт / район</span><input value={draft.locality} onChange={(event) => setDraft({ ...draft, locality: event.target.value })} /></label><label className="form-field form-field--wide"><span>Орієнтовні координати MGRS</span><input value={draft.mgrs} onChange={(event) => setDraft({ ...draft, mgrs: event.target.value })} placeholder="36U UV 12000 67000" /><small>Останні три цифри двох п’ятизначних груп зберігаються як 000.</small></label><label className="form-field form-field--wide"><span>Опис позиції</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Особливості позиції, під’їзду, маскування та роботи…" /></label></div>}
      {editorTab === "relations" && <section className="position-relations">
        <article className="position-relation-group"><header><div><UsersRound /><span><b>Екіпажі</b><small>{editingCrews.length} закріплено</small></span></div></header><div className="position-relation-list">{editingCrews.map((crew) => { const primaryUav = equipment.find((asset) => asset.id === crew.primaryUavId); return <div className={`position-relation-item ${onPositionCrewIds.has(crew.id) ? "is-on-position" : ""}`} key={crew.id}><div><b>{crew.name}</b><small>Статус: {crew.status}</small><em>Основний БпЛА: {primaryUav?.name || crew.uavName || "не обрано"} · Смуга: {crew.sector || "не вказана"}</em></div>{onPositionCrewIds.has(crew.id) && <span className="on-position-indicator">На позиції</span>}</div>; })}{!editingCrews.length && <div className="position-relation-empty">Екіпажі не закріплені. Прив’язка змінюється у картці екіпажу.</div>}</div></article>
        <article className="position-relation-group"><header><div><PackageOpen /><span><b>Майно на позиції</b><small>{positionEquipment.length + positionVehicles.length} одиниць</small></span></div><nav className="position-asset-tabs" aria-label="Категорії майна на позиції"><button className={assetTab === "uav" ? "active" : ""} title="БпЛА та БпАК" aria-label={`БпЛА та БпАК: ${assetCount("uav")}`} onClick={() => setAssetTab("uav")}><Plane /><b>{assetCount("uav")}</b></button><button className={assetTab === "vehicles" ? "active" : ""} title="Автомобілі" aria-label={`Автомобілі: ${assetCount("vehicles")}`} onClick={() => setAssetTab("vehicles")}><Car /><b>{assetCount("vehicles")}</b></button><button className={assetTab === "generator" ? "active" : ""} title="Генератори" aria-label={`Генератори: ${assetCount("generator")}`} onClick={() => setAssetTab("generator")}><Zap /><b>{assetCount("generator")}</b></button><button className={assetTab === "communications" ? "active" : ""} title="Зв’язок" aria-label={`Зв’язок: ${assetCount("communications")}`} onClick={() => setAssetTab("communications")}><Radio /><b>{assetCount("communications")}</b></button><button className={assetTab === "weapon_ammo" ? "active" : ""} title="Зброя та БК" aria-label={`Зброя та БК: ${assetCount("weapon_ammo")}`} onClick={() => setAssetTab("weapon_ammo")}><Shield /><b>{assetCount("weapon_ammo")}</b></button></nav></header><div className="position-relation-list">{assetsForTab.map((asset) => "registrationNumber" in asset ? <div className="position-relation-item" key={`vehicle-${asset.id}`}><div><b>{asset.name}</b><small>{asset.registrationNumber || "без номера"} · {asset.status}</small><em>{asset.crewName || asset.driverName || "екіпаж не вказано"}</em></div></div> : <div className="position-relation-item" key={`equipment-${asset.id}`}><div><b>{asset.name}</b><small>{asset.inventoryNumber || "без номера"} · {asset.status} · {asset.totalQuantity} шт</small><em>{asset.crewName || asset.holderName || equipmentCategoryLabels[asset.category]}</em></div></div>)}{!activePositionCrews.length && <div className="position-relation-empty">За планом польотів на цій позиції зараз немає екіпажу.</div>}{activePositionCrews.length > 0 && !assetsForTab.length && <div className="position-relation-empty">У вибраній категорії майна немає.</div>}</div></article>
      </section>}
      {editorTab === "history" && <section className="position-history">{positionIncidents.length ? positionIncidents.map((incident) => { const occurred = incidentDateTimeParts(incident.occurredAt); return <article key={incident.id}><Clock3 /><div><b>{incident.incidentType}</b><span>{occurred.date} · {occurred.time} · {incident.crewName || "екіпаж не вказано"}</span><p>{incident.description || "Без опису"}</p></div></article>; }) : <div className="position-history__empty"><Clock3 /><b>Історія порожня</b><span>Інциденти на цій позиції з’являться тут автоматично.</span></div>}</section>}
    </div><footer className="modal-actions position-editor__actions">{editing && <button className="button danger" onClick={() => { setDeleting(editing); setOpen(false); }}><Trash2 />Видалити позицію</button>}<button className="button" onClick={close}>Скасувати</button><button className="button primary" onClick={() => void savePosition()}>Зберегти позицію</button></footer></Modal>}
    {deleting && <ConfirmDialog title="Видалити позицію?" message={`Позицію «${deleting.name}» буде видалено. Екіпажі, які її використовують, залишаться без обраної позиції.`} confirmLabel="Видалити" onConfirm={() => void remove()} onCancel={() => setDeleting(null)} busy={deletingBusy} />}
  </PageFrame>;
}
