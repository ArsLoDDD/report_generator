import { Plus, Trash2, UsersRound, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Person } from "../../shared/types/domain";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { operationsService } from "./services/operationsService";
import type { Crew, CrewDraft } from "./types";

const emptyDraft = (): CrewDraft => ({ name: "", platoon: "", positionName: "", reconnaissanceArea: "", unitType: "Екіпаж", companyName: "", battleOrder: "", sector: "", officialStrength: 4, status: "Формується", uavName: "", uavType: "", functionalDuties: "", currentLocation: "", notes: "", memberIds: [] });
const statuses = ["Працює", "Формується", "Тимчасово не працює", "Ротація"];
const bySearch = (query: string, ...values: string[]) => values.join(" ").toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"));

export function CrewsPage({ people }: { people: Person[] }) {
  const [items, setItems] = useState<Crew[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Crew | null>(null);
  const [draft, setDraft] = useState<CrewDraft>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const { notify } = useNotifications();
  const reload = useCallback(() => void operationsService.listCrews().then(setItems).catch(() => notify("Не вдалося завантажити екіпажі.", "error")), [notify]);
  useEffect(reload, [reload]);
  const grouped = useMemo(() => items.filter((crew) => bySearch(query, crew.name, crew.platoon, crew.companyName, crew.battleOrder, crew.sector, crew.positionName)).reduce<Record<string, Crew[]>>((groups, crew) => { (groups[crew.platoon || "Управління роти"] ??= []).push(crew); return groups; }, {}), [items, query]);
  const close = () => { setEditorOpen(false); setEditing(null); setDraft(emptyDraft()); };
  const open = (crew?: Crew) => { setEditing(crew ?? null); setDraft(crew ? { ...crew, memberIds: crew.members.map((member) => member.personnelId) } : emptyDraft()); setEditorOpen(true); };
  const save = async () => { try { if (editing) await operationsService.updateCrew(editing.id, draft); else await operationsService.createCrew(draft); close(); reload(); notify("Екіпаж збережено.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти екіпаж.", "error"); } };
  const remove = async (id: number) => { try { await operationsService.deleteCrew(id); reload(); notify("Екіпаж видалено.", "success"); } catch { notify("Не вдалося видалити екіпаж.", "error"); } };
  const toggle = (id: number) => setDraft((current) => ({ ...current, memberIds: current.memberIds.includes(id) ? current.memberIds.filter((value) => value !== id) : [...current.memberIds, id] }));
  return <PageFrame className="crews-page" header={<PageTitle title="Екіпажі" subtitle="Живий склад, БЧС, позиції та бойове застосування екіпажів" actions={<button className="button primary" onClick={() => open()}><Plus />Створити екіпаж</button>} />} tools={<div className="table-tools main-tools"><SearchInput placeholder="Пошук за екіпажем, взводом, БРО або сектором…" value={query} onChange={setQuery} /></div>}>
    <div className="crews-board">{Object.entries(grouped).map(([platoon, crews]) => <section className="panel crew-platoon" key={platoon}><header><span>{platoon}</span><b>{crews.length} екіпаж(ів)</b></header><div>{crews.map((crew) => <article className="crew-card" key={crew.id}><header><div><h2>{crew.name}</h2><p>{crew.companyName || crew.unitType}</p></div><span>{crew.memberCount}/{crew.officialStrength}</span></header><div className="crew-card__tags"><span>{crew.status}</span>{crew.battleOrder && <span>{crew.battleOrder}</span>}{crew.sector && <span>{crew.sector}</span>}</div><p className="crew-card__area">{crew.positionName || "Позиція не вказана"} · {crew.currentLocation || crew.reconnaissanceArea || "місце не вказано"}</p><p>{crew.uavName || "БпАК не вказано"}{crew.uavType ? ` · ${crew.uavType}` : ""}</p><div className="crew-members">{crew.members.map((member) => <div key={member.personnelId}><b>{member.fullName}</b><small>{member.rank} · {member.position}</small></div>)}{!crew.members.length && <small>Склад ще не сформовано</small>}</div><footer><button className="button" onClick={() => open(crew)}><Wrench />Редагувати</button><button className="icon-button danger" title="Видалити екіпаж" onClick={() => void remove(crew.id)}><Trash2 /></button></footer></article>)}</div></section>)}{!Object.keys(grouped).length && <section className="panel personnel-state"><UsersRound /><b>Екіпажів поки немає</b><span>Створіть екіпаж і додайте до нього учасників.</span></section>}</div>
    {editorOpen && <Modal title={editing ? "Редагування екіпажу" : "Новий екіпаж"} onClose={close} className="crew-editor"><div className="crew-editor__body"><div className="operation-editor__body">
      <label className="form-field"><span>Тип підрозділу</span><Select ariaLabel="Тип підрозділу" value={draft.unitType} onChange={(unitType) => setDraft({ ...draft, unitType })} options={["Екіпаж", "Управління роти", "Управління взводу", "Відділення збору та обробки інформації", "Прикомандировані"].map((value) => ({ value, label: value }))} /></label>
      <label className="form-field"><span>Назва екіпажу <b>*</b></span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="form-field"><span>Рота / окремий взвод</span><input value={draft.companyName} onChange={(event) => setDraft({ ...draft, companyName: event.target.value })} /></label>
      <label className="form-field"><span>Взвод</span><input value={draft.platoon} onChange={(event) => setDraft({ ...draft, platoon: event.target.value })} placeholder="1 взвод" /></label>
      <label className="form-field"><span>БРО</span><input value={draft.battleOrder} onChange={(event) => setDraft({ ...draft, battleOrder: event.target.value })} /></label>
      <label className="form-field"><span>Сектор роботи</span><input value={draft.sector} onChange={(event) => setDraft({ ...draft, sector: event.target.value })} /></label>
      <label className="form-field"><span>Штатна кількість в/с</span><input type="number" min="0" value={draft.officialStrength} onChange={(event) => setDraft({ ...draft, officialStrength: Number(event.target.value) })} /></label>
      <label className="form-field"><span>Статус екіпажу</span><Select ariaLabel="Статус екіпажу" value={draft.status} onChange={(status) => setDraft({ ...draft, status })} options={statuses.map((value) => ({ value, label: value }))} /></label>
      <label className="form-field"><span>Назва БпАК</span><input value={draft.uavName} onChange={(event) => setDraft({ ...draft, uavName: event.target.value })} /></label>
      <label className="form-field"><span>Тип БпАК</span><input value={draft.uavType} onChange={(event) => setDraft({ ...draft, uavType: event.target.value })} /></label>
      <label className="form-field"><span>Функціональні обов’язки</span><input value={draft.functionalDuties} onChange={(event) => setDraft({ ...draft, functionalDuties: event.target.value })} /></label>
      <label className="form-field"><span>Де знаходиться</span><input value={draft.currentLocation} onChange={(event) => setDraft({ ...draft, currentLocation: event.target.value })} /></label>
      <label className="form-field form-field--wide"><span>Примітка</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    </div><section className="crew-editor__members"><header><h3>Фактичний склад</h3><span>Зараз {draft.memberIds.length}, за штатом {draft.officialStrength}. Зміни одразу потрапляють у БЧС.</span></header>{people.map((person) => <label key={person.id}><input type="checkbox" checked={draft.memberIds.includes(person.id)} onChange={() => toggle(person.id)} /><span><b>{person.fullName}</b><small>{person.rank} · {person.position}</small></span></label>)}</section></div><footer className="modal-actions"><button className="button" onClick={close}>Скасувати</button><button className="button primary" onClick={() => void save()}>Зберегти екіпаж</button></footer></Modal>}
  </PageFrame>;
}
