import { Clock3, Crosshair, MapPin, PackageOpen, Plus, Trash2, UsersRound } from "lucide-react";
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
import { RecordPickerModal } from "../../shared/ui/record-picker/RecordPickerModal";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, EquipmentCategory, Incident, Position, PositionDraft } from "./types";
import { flightPlanSelectedCrewIds } from "./flight-plan-storage";

type PositionTab = "overview" | "relations" | "history";
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
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [deleting, setDeleting] = useState<Position | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const { notify } = useNotifications();
  const loadPositions = useCallback(() => operationsService.listPositions(), []);
  const onLoadError = useCallback(() => notify("Не вдалося завантажити позиції.", "error"), [notify]);
  const { items, isLoading, reload: reloadItems } = useEntityCollection({ load: loadPositions, onError: onLoadError });
  const reload = useCallback(() => { void reloadItems(); }, [reloadItems]);

  useEffect(() => {
    void Promise.all([operationsService.listIncidents(), operationsService.listCrews(), Promise.all((["uav", "generator", "communications", "weapon_ammo"] as EquipmentCategory[]).map((category) => operationsService.listEquipment(category)))])
      .then(([nextIncidents, nextCrews, nextEquipment]) => { setIncidents(nextIncidents ?? []); setCrews(nextCrews ?? []); setEquipment(nextEquipment.flatMap((group) => group ?? [])); })
      .catch(() => { setIncidents([]); setCrews([]); setEquipment([]); });
  }, []);

  const filtered = useMemo(() => items.filter((item) => includes(query, item.name, item.stripName, item.locality, item.battleOrder, item.notes, item.condition, item.crewName)), [items, query]);
  useEffect(() => setVisibleLimit(20), [query]);
  const visibleItems = filtered.slice(0, visibleLimit);
  const onContentScroll: UIEventHandler<HTMLDivElement> = (event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 100) setVisibleLimit((current) => Math.min(current + 20, filtered.length)); };
  const positionIncidents = useMemo(() => editing ? incidents.filter((incident) => incident.positionName === editing.name) : [], [editing, incidents]);
  const edit = (item?: Position) => { setEditing(item ?? null); setDraft(item ? { ...item } : emptyDraft()); setEditorTab("overview"); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); setDraft(emptyDraft()); setEditorTab("overview"); setAssetPickerOpen(false); };
  const savePosition = async () => { try { if (editing) await operationsService.updatePosition(editing.id, draft); else await operationsService.createPosition(draft); close(); reload(); notify("Позицію збережено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти позицію.", "error"); } };
  const remove = async () => { if (!deleting) return; setDeletingBusy(true); try { await operationsService.deletePosition(deleting.id); setDeleting(null); reload(); notify("Позицію видалено.", "success"); } catch { notify("Не вдалося видалити позицію.", "error"); } finally { setDeletingBusy(false); } };

  const onPositionCrewIds = flightPlanSelectedCrewIds();
  const editingCrews = editing ? crews.filter((crew) => crew.positionId === editing.id) : [];
  const positionEquipment = equipment.filter((item) => draft.uavIds.includes(item.id));
  const togglePositionEquipment = (equipmentId: number) => setDraft((current) => ({ ...current, uavIds: current.uavIds.includes(equipmentId) ? current.uavIds.filter((id) => id !== equipmentId) : [...current.uavIds, equipmentId] }));
  return <PageFrame className="positions-page" onContentScroll={onContentScroll} footer={<div className="panel pagination card-registry__pagination">Показано {visibleItems.length} із {filtered.length}</div>} header={<PageTitle title="Позиції" subtitle="Робочі райони, прив’язані екіпажі та готовність позицій" actions={<button className="button primary" onClick={() => edit()}><Plus />Додати позицію</button>} />} tools={<RegistryToolbar className="card-registry-toolbar" placeholder="Пошук за назвою, смугою, районом, БРО або екіпажем…" query={query} onQueryChange={setQuery} />}>
    <EntityCardGrid className="positions-grid">{visibleItems.map((item) => { const positionCrews = crews.filter((crew) => crew.positionId === item.id).sort((left, right) => Number(onPositionCrewIds.has(right.id)) - Number(onPositionCrewIds.has(left.id))); const visibleCrews = positionCrews.slice(0, 2); const hiddenCrewCount = positionCrews.length - visibleCrews.length; const hasCrewOnPosition = positionCrews.some((crew) => onPositionCrewIds.has(crew.id)); return <EntityCard className={`position-card position-card--${positionTypeClass(item.positionType)}`} key={item.id} onClick={() => edit(item)}>
      <header><span className="position-card__icon"><Crosshair /></span><div><small>{item.stripName || "Смуга не вказана"}</small><h2>{item.name}</h2></div><div className="position-card__indicators"><span className="position-card__type">{item.positionType}</span>{hasCrewOnPosition && <span className="on-position-indicator">На позиції</span>}</div></header>
      <div className="position-card__chips position-card__meta">
        {item.battleOrder && <span className="position-card__chip">{item.battleOrder}</span>}
        <span className="position-card__chip"><MapPin />{item.locality || "Населений пункт не вказано"}</span>
      </div>
      <div className="position-card__chips position-card__crews">{visibleCrews.length ? visibleCrews.map((crew) => <span title={`${crew.name} · ${crew.status} · фактично ${crew.workingStrength} із ${crew.officialStrength}`} key={crew.id} className={`position-card__chip position-card__crew ${onPositionCrewIds.has(crew.id) ? "is-on-position" : ""}`}><UsersRound />{crew.name}</span>) : <span className="position-card__chip position-card__crew is-empty"><UsersRound />Екіпаж не закріплений</span>}{hiddenCrewCount > 0 && <span className="position-card__chip position-card__more" title={positionCrews.slice(2).map((crew) => crew.name).join(", ")}>+{hiddenCrewCount}</span>}</div>
    </EntityCard>; })}</EntityCardGrid>
    {isLoading && <div className="operations-loading-overlay"><CardGridSkeleton variant="position" /></div>}

    {open && <Modal title={editing ? editing.name : "Нова позиція"} subtitle={editing ? `${editing.stripName || "Смуга не вказана"} · ${editing.locality || "район не вказано"}` : "Створення нової позиції"} onClose={close} className="position-editor"><div className="position-editor__body">
      <nav className="entity-tabs" aria-label="Розділи картки позиції"><button className={editorTab === "overview" ? "active" : ""} onClick={() => setEditorTab("overview")}>Огляд</button><button className={editorTab === "relations" ? "active" : ""} disabled={!editing} onClick={() => setEditorTab("relations")}>Екіпаж і майно</button><button className={editorTab === "history" ? "active" : ""} disabled={!editing} onClick={() => setEditorTab("history")}>Історія <b>{positionIncidents.length}</b></button></nav>
      {editorTab === "overview" && <div className="operation-editor__body position-editor__form"><label className="form-field"><span>Назва <b>*</b></span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="form-field"><span>Смуга роботи</span><input value={draft.stripName} onChange={(event) => setDraft({ ...draft, stripName: event.target.value })} /></label><label className="form-field"><span>БРО</span><input value={draft.battleOrder} onChange={(event) => setDraft({ ...draft, battleOrder: event.target.value })} /></label><label className="form-field"><span>Населений пункт / район</span><input value={draft.locality} onChange={(event) => setDraft({ ...draft, locality: event.target.value })} /></label><label className="form-field form-field--wide"><span>Орієнтовні координати MGRS</span><input value={draft.mgrs} onChange={(event) => setDraft({ ...draft, mgrs: event.target.value })} placeholder="36U UV 12000 67000" /><small>Останні три цифри двох п’ятизначних груп зберігаються як 000.</small></label><label className="form-field form-field--wide"><span>Опис позиції</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Особливості позиції, під’їзду, маскування та роботи…" /></label></div>}
      {editorTab === "relations" && <section className="position-relations">
        <article className="position-relation-group"><header><div><UsersRound /><span><b>Екіпажі</b><small>{editingCrews.length} закріплено</small></span></div></header><div className="position-relation-list">{editingCrews.map((crew) => <div className={`position-relation-item ${onPositionCrewIds.has(crew.id) ? "is-on-position" : ""}`} key={crew.id}><div><b>{crew.name}</b><small>{crew.status} · фактично {crew.workingStrength} із {crew.officialStrength}</small></div>{onPositionCrewIds.has(crew.id) && <span className="on-position-indicator">На позиції</span>}</div>)}{!editingCrews.length && <div className="position-relation-empty">Екіпажі не закріплені. Прив’язка змінюється у картці екіпажу.</div>}</div></article>
        <article className="position-relation-group"><header><div><PackageOpen /><span><b>Майно</b><small>{positionEquipment.length} закріплено</small></span><button className="button" onClick={() => setAssetPickerOpen(true)}><Plus />Додати майно</button></div></header><div className="position-relation-list">{positionEquipment.map((asset) => <div className="position-relation-item" key={asset.id}><div><b>{asset.name}</b><small>{equipmentCategoryLabels[asset.category]} · {asset.inventoryNumber || "без номера"} · {asset.status}</small></div><button className="icon-button danger" title="Зняти майно з позиції" onClick={() => togglePositionEquipment(asset.id)}><Trash2 /></button></div>)}{!positionEquipment.length && <div className="position-relation-empty">За позицією майно не закріплене.</div>}</div></article>
      </section>}
      {editorTab === "history" && <section className="position-history">{positionIncidents.length ? positionIncidents.map((incident) => <article key={incident.id}><Clock3 /><div><b>{incident.incidentType}</b><span>{incident.occurredAt} · {incident.crewName || "екіпаж не вказано"}</span><p>{incident.description || "Без опису"}</p></div></article>) : <div className="position-history__empty"><Clock3 /><b>Історія порожня</b><span>Інциденти на цій позиції з’являться тут автоматично.</span></div>}</section>}
    </div><footer className="modal-actions position-editor__actions">{editing && <button className="button danger" onClick={() => { setDeleting(editing); setOpen(false); }}><Trash2 />Видалити позицію</button>}<button className="button" onClick={close}>Скасувати</button><button className="button primary" onClick={() => void savePosition()}>Зберегти позицію</button></footer></Modal>}
    {assetPickerOpen && <RecordPickerModal title="Майно позиції" searchPlaceholder="Пошук за назвою, номером, категорією або станом…" items={equipment.map((asset) => ({ id: asset.id, title: asset.name, subtitle: `${equipmentCategoryLabels[asset.category]} · ${asset.inventoryNumber || "без номера"} · ${asset.status}`, owner: asset.crewName ? `Також закріплено за екіпажем «${asset.crewName}»` : undefined }))} selectedIds={draft.uavIds} onToggle={togglePositionEquipment} onClose={() => setAssetPickerOpen(false)} />}
    {deleting && <ConfirmDialog title="Видалити позицію?" message={`Позицію «${deleting.name}» буде видалено. Екіпажі, які її використовують, залишаться без обраної позиції.`} confirmLabel="Видалити" onConfirm={() => void remove()} onCancel={() => setDeleting(null)} busy={deletingBusy} />}
  </PageFrame>;
}
