import { Clock3, Crosshair, MapPin, PackageOpen, Plus, Radar, Trash2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { Crew, Incident, Position, PositionDraft } from "./types";
import { flightPlanSelectedCrewIds } from "./flight-plan-storage";

type PositionTab = "overview" | "relations" | "history";
const emptyDraft = (): PositionDraft => ({ name: "", positionType: "Основна", stripName: "", locality: "", battleOrder: "", sector: "", condition: "", conditionLevel: 0, fieldType: "", size: "", mgrs: "", suitableUavText: "", isActive: false, crewId: null, notes: "", uavIds: [] });
const includes = (query: string, ...values: (string | null | undefined)[]) => values.join(" ").toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"));
const positionTypeClass = (type: Position["positionType"]) => type === "Основна" ? "primary" : type === "Запасна" ? "reserve" : type === "Облаштовується" ? "building" : type === "Виявлена ворогом" ? "compromised" : "allied";

export function PositionsPage() {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Position | null>(null);
  const [open, setOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<PositionTab>("overview");
  const [draft, setDraft] = useState<PositionDraft>(emptyDraft);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [deleting, setDeleting] = useState<Position | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const { notify } = useNotifications();
  const loadPositions = useCallback(() => operationsService.listPositions(), []);
  const onLoadError = useCallback(() => notify("Не вдалося завантажити позиції.", "error"), [notify]);
  const { items, isLoading, reload: reloadItems } = useEntityCollection({ load: loadPositions, onError: onLoadError });
  const reload = useCallback(() => { void reloadItems(); }, [reloadItems]);

  useEffect(() => {
    void Promise.all([operationsService.listIncidents(), operationsService.listCrews()])
      .then(([nextIncidents, nextCrews]) => { setIncidents(nextIncidents ?? []); setCrews(nextCrews ?? []); })
      .catch(() => { setIncidents([]); setCrews([]); });
  }, []);

  const filtered = useMemo(() => items.filter((item) => includes(query, item.name, item.stripName, item.locality, item.battleOrder, item.notes, item.condition, item.crewName)), [items, query]);
  const positionIncidents = useMemo(() => editing ? incidents.filter((incident) => incident.positionName === editing.name) : [], [editing, incidents]);
  const edit = (item?: Position) => { setEditing(item ?? null); setDraft(item ? { ...item } : emptyDraft()); setEditorTab("overview"); setOpen(true); };
  const close = () => { setOpen(false); setEditing(null); setDraft(emptyDraft()); setEditorTab("overview"); };
  const savePosition = async () => { try { if (editing) await operationsService.updatePosition(editing.id, draft); else await operationsService.createPosition(draft); close(); reload(); notify("Позицію збережено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти позицію.", "error"); } };
  const remove = async () => { if (!deleting) return; setDeletingBusy(true); try { await operationsService.deletePosition(deleting.id); setDeleting(null); reload(); notify("Позицію видалено.", "success"); } catch { notify("Не вдалося видалити позицію.", "error"); } finally { setDeletingBusy(false); } };

  const onPositionCrewIds = flightPlanSelectedCrewIds();
  return <PageFrame className="positions-page" header={<PageTitle title="Позиції" subtitle="Робочі райони, прив’язані екіпажі та готовність позицій" actions={<button className="button primary" onClick={() => edit()}><Plus />Додати позицію</button>} />} tools={<RegistryToolbar placeholder="Пошук за назвою, смугою, районом, БРО або екіпажем…" query={query} onQueryChange={setQuery} resultCount={filtered.length} />}>
    <EntityCardGrid className="positions-grid">{filtered.map((item) => { const hasCrewOnPosition = crews.some((crew) => crew.positionId === item.id && onPositionCrewIds.has(crew.id)); return <EntityCard className={`position-card position-card--${positionTypeClass(item.positionType)}`} key={item.id} onClick={() => edit(item)}>
      <header><span className="position-card__icon"><Crosshair /></span><div><small>{item.stripName || "Смуга не вказана"}</small><h2>{item.name}</h2></div><div className="position-card__indicators"><span className="position-card__type">{item.positionType}</span>{hasCrewOnPosition && <span className="on-position-indicator">На позиції</span>}</div></header>
      {item.battleOrder && <div className="position-tags"><span>{item.battleOrder}</span></div>}
      <dl><div><dt><MapPin />Населений пункт</dt><dd>{item.locality || "Не вказано"}</dd></div><div><dt><Radar />MGRS</dt><dd>{item.mgrs || "Не вказано"}</dd></div><div><dt><UsersRound />Екіпаж</dt><dd>{item.crewName || "Не закріплений"}</dd></div><div><dt><PackageOpen />БпЛА та БпАК</dt><dd>{item.uavNames.length ? item.uavNames.join(", ") : "Не закріплені"}</dd></div></dl>
      <p className="position-notes">{item.notes || item.condition || "Опис позиції не заповнено."}</p>
    </EntityCard>; })}</EntityCardGrid>
    {isLoading && <div className="operations-loading-overlay"><CardGridSkeleton variant="position" /></div>}

    {open && <Modal title={editing ? editing.name : "Нова позиція"} subtitle={editing ? `${editing.stripName || "Смуга не вказана"} · ${editing.locality || "район не вказано"}` : "Створення нової позиції"} onClose={close} className="position-editor"><div className="position-editor__body">
      <nav className="entity-tabs" aria-label="Розділи картки позиції"><button className={editorTab === "overview" ? "active" : ""} onClick={() => setEditorTab("overview")}>Огляд</button><button className={editorTab === "relations" ? "active" : ""} disabled={!editing} onClick={() => setEditorTab("relations")}>Екіпаж і майно</button><button className={editorTab === "history" ? "active" : ""} disabled={!editing} onClick={() => setEditorTab("history")}>Історія <b>{positionIncidents.length}</b></button></nav>
      {editorTab === "overview" && <div className="operation-editor__body position-editor__form"><label className="form-field"><span>Назва <b>*</b></span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="form-field"><span>Смуга роботи</span><input value={draft.stripName} onChange={(event) => setDraft({ ...draft, stripName: event.target.value })} /></label><label className="form-field"><span>БРО</span><input value={draft.battleOrder} onChange={(event) => setDraft({ ...draft, battleOrder: event.target.value })} /></label><label className="form-field"><span>Населений пункт / район</span><input value={draft.locality} onChange={(event) => setDraft({ ...draft, locality: event.target.value })} /></label><label className="form-field form-field--wide"><span>Орієнтовні координати MGRS</span><input value={draft.mgrs} onChange={(event) => setDraft({ ...draft, mgrs: event.target.value })} placeholder="36U UV 12000 67000" /><small>Останні три цифри двох п’ятизначних груп зберігаються як 000.</small></label><label className="form-field form-field--wide"><span>Опис позиції</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Особливості позиції, під’їзду, маскування та роботи…" /></label></div>}
      {editorTab === "relations" && <section className="position-relations"><article><UsersRound /><div><small>Закріплений екіпаж</small><b>{editing?.crewName || "Екіпаж не закріплений"}</b><span>Прив’язка змінюється у картці екіпажу.</span></div></article><article><Radar /><div><small>БпЛА та БпАК на позиції</small><b>{editing?.uavNames.length ? editing.uavNames.join(" · ") : "Майно не закріплене"}</b><span>Склад формується з майна закріпленого екіпажу.</span></div></article></section>}
      {editorTab === "history" && <section className="position-history">{positionIncidents.length ? positionIncidents.map((incident) => <article key={incident.id}><Clock3 /><div><b>{incident.incidentType}</b><span>{incident.occurredAt} · {incident.crewName || "екіпаж не вказано"}</span><p>{incident.description || "Без опису"}</p></div></article>) : <div className="position-history__empty"><Clock3 /><b>Історія порожня</b><span>Інциденти на цій позиції з’являться тут автоматично.</span></div>}</section>}
    </div><footer className="modal-actions position-editor__actions">{editing && <button className="button danger" onClick={() => { setDeleting(editing); setOpen(false); }}><Trash2 />Видалити позицію</button>}<button className="button" onClick={close}>Скасувати</button><button className="button primary" onClick={() => void savePosition()}>Зберегти позицію</button></footer></Modal>}
    {deleting && <ConfirmDialog title="Видалити позицію?" message={`Позицію «${deleting.name}» буде видалено. Екіпажі, які її використовують, залишаться без обраної позиції.`} confirmLabel="Видалити" onConfirm={() => void remove()} onCancel={() => setDeleting(null)} busy={deletingBusy} />}
  </PageFrame>;
}
