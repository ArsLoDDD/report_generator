import { BatteryCharging, Crosshair, Plus, Radio, Shield, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Modal } from "../../shared/ui/Modal";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import type { Person } from "../../shared/types/domain";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, EquipmentCategory } from "./types";
const statuses = ["Справний", "Потребує ремонту", "Ремонтується", "Несправний"];
const bySearch = (query: string, ...values: Array<string | null | undefined>) => values.join(" ").toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"));
const categoryMeta = { generator: { title: "Генератори", subtitle: "Облік генераторів за екіпажами", icon: BatteryCharging, noun: "генератор" }, uav: { title: "БпЛА", subtitle: "Облік безпілотних літальних апаратів за екіпажами", icon: Crosshair, noun: "БпЛА" }, communications: { title: "Зв’язок", subtitle: "Облік засобів зв’язку за екіпажами", icon: Radio, noun: "засіб зв’язку" }, weapon_ammo: { title: "Зброя та БК", subtitle: "Облік зброї та боєкомплекту за військовослужбовцями", icon: Shield, noun: "запис" } } as const;

export function EquipmentPage({ category, people }: { category: EquipmentCategory; people: Person[] }) {
  const meta = categoryMeta[category]; const Icon = meta.icon;
  const [items, setItems] = useState<Equipment[]>([]); const [crews, setCrews] = useState<Crew[]>([]); const [query, setQuery] = useState(""); const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", inventoryNumber: "", status: statuses[0], crewId: "", personnelId: "", notes: "" }); const { notify } = useNotifications();
  const reload = useCallback(() => { void operationsService.listEquipment(category).then(setItems).catch(() => notify("Не вдалося завантажити записи.", "error")); void operationsService.listCrews().then(setCrews).catch(() => setCrews([])); }, [category, notify]);
  useEffect(() => { reload(); }, [reload]);
  const filtered = useMemo(() => items.filter((item) => bySearch(query, item.name, item.inventoryNumber, item.status, item.crewName, item.holderName)), [items, query]);
  const close = () => { setEditorOpen(false); setDraft({ name: "", inventoryNumber: "", status: statuses[0], crewId: "", personnelId: "", notes: "" }); };
  const save = async () => { if (!draft.name.trim()) return notify("Вкажіть назву.", "error"); if (category === "weapon_ammo" && !draft.personnelId) return notify("Оберіть військовослужбовця, за яким закріплено зброю або БК.", "error"); try { await operationsService.createEquipment({ category, name: draft.name, inventoryNumber: draft.inventoryNumber, status: draft.status, crewId: draft.crewId ? Number(draft.crewId) : null, personnelId: draft.personnelId ? Number(draft.personnelId) : null, notes: draft.notes }); close(); reload(); notify("Запис додано.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося додати запис.", "error"); } };
  const remove = async (id: number) => { try { await operationsService.deleteEquipment(id); reload(); notify("Запис видалено.", "success"); } catch { notify("Не вдалося видалити запис.", "error"); } };
  const columns: EntityTableColumn<Equipment>[] = [
    { key: "id", title: "№", render: (item) => item.id },
    { key: "name", title: "Назва", render: (item) => <><b>{item.name}</b>{item.notes && <small>{item.notes}</small>}</> },
    { key: "inventoryNumber", title: "Інвентарний номер", render: (item) => item.inventoryNumber || "—" },
    { key: "status", title: "Стан", render: (item) => <span className="vehicle-badge">{item.status}</span> },
    { key: "owner", title: category === "weapon_ammo" ? "Закріплено за" : "Екіпаж", render: (item) => category === "weapon_ammo" ? item.holderName ?? "—" : item.crewName ?? "Не закріплено" },
    { key: "actions", title: "Дії", render: (item) => <button className="icon-button danger" title="Видалити" onClick={() => void remove(item.id)}><Trash2 /></button> },
  ];
  return <PageFrame className="operations-page" header={<PageTitle title={meta.title} subtitle={meta.subtitle} actions={<button className="button primary" onClick={() => setEditorOpen(true)}><Plus />Додати</button>} />} tools={<div className="table-tools main-tools"><SearchInput placeholder="Пошук за назвою, номером, екіпажем…" value={query} onChange={setQuery} /></div>}><section className="panel operation-table"><EntityTable className="operation-table__table" items={filtered} columns={columns} rowKey={(item) => item.id} emptyState={<div className="personnel-state"><Icon /><b>Записів поки немає</b><span>Додайте перший {meta.noun}.</span></div>} /></section>{editorOpen && <Modal title={`Новий ${meta.noun}`} onClose={close} className="operation-editor"><div className="operation-editor__body"><label className="form-field"><span>Назва <b>*</b></span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="form-field"><span>Інвентарний номер</span><input value={draft.inventoryNumber} onChange={(event) => setDraft({ ...draft, inventoryNumber: event.target.value })} /></label><label className="form-field"><span>Стан</span><Select ariaLabel="Стан" value={draft.status} onChange={(status) => setDraft({ ...draft, status })} options={statuses.map((value) => ({ value, label: value }))} /></label>{category === "weapon_ammo" ? <label className="form-field"><span>Військовослужбовець <b>*</b></span><Select ariaLabel="Військовослужбовець" value={draft.personnelId} onChange={(personnelId) => setDraft({ ...draft, personnelId })} options={[{ value: "", label: "Оберіть військовослужбовця" }, ...people.map((person) => ({ value: String(person.id), label: person.fullName }))]} /></label> : <label className="form-field"><span>Екіпаж</span><Select ariaLabel="Екіпаж" value={draft.crewId} onChange={(crewId) => setDraft({ ...draft, crewId })} options={[{ value: "", label: "Не закріплювати" }, ...crews.map((crew) => ({ value: String(crew.id), label: crew.name }))]} /></label>}<label className="form-field form-field--wide"><span>Примітка</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label></div><footer className="modal-actions"><button className="button" onClick={close}>Скасувати</button><button className="button primary" onClick={() => void save()}><Plus />Додати</button></footer></Modal>}</PageFrame>;
}
