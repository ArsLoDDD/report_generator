import { Car, Pencil, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Modal } from "../../shared/ui/Modal";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { FilterButton } from "../../shared/ui/FilterButton";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import type { CustomFieldDefinition, Person } from "../../shared/types/domain";
import { personnelService } from "../../shared/services/personnelService";
import { settingsService } from "../settings/services/settingsService";

type Vehicle = {
  id: number;
  name: string;
  registrationNumber: string;
  status: string;
  personnelId: number | null;
  driverName: string | null;
  crewId: number | null;
  crewName: string | null;
};
type Crew = { id: number; name: string };

const statuses = ["Справний", "Потребує ремонту", "Ремонтується", "Несправний"];
const statusOptions = statuses.map((value) => ({ value, label: value }));

function statusClass(status: string) {
  return `status-${status.replace(/ /g, "-")}`;
}

export function VehiclesPage({ people }: { people: Person[] }) {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [status, setStatus] = useState(statuses[0]);
  const [driverId, setDriverId] = useState("");
  const [crewId, setCrewId] = useState("");
  const [crews, setCrews] = useState<Crew[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const { notify } = useNotifications();

  const reload = () => void invoke<Vehicle[]>("list_vehicles")
    .then((rows) => {
      setItems(rows);
      setSelected((current) => current ? rows.find((item) => item.id === current.id) ?? null : null);
    })
    .catch(() => notify("Не вдалося завантажити автомобілі.", "error"));

  useEffect(reload, []);
  useEffect(() => { void invoke<Crew[]>("list_crews").then((items) => setCrews(Array.isArray(items) ? items : [])).catch(() => setCrews([])); }, []);
  useEffect(() => {
    void settingsService.get()
      .then((settings) => setVisibleColumns(settings.visibleVehicleColumns ?? []))
      .catch(() => setVisibleColumns([]));
  }, []);
  useEffect(() => {
    const loadCustomFields = () => {
      void personnelService
        .listVehicleCustomFields()
        .then((fields) => setCustomFields(fields ?? []))
        .catch(() => setCustomFields([]));
    };
    const refresh = () => {
      reload();
      loadCustomFields();
    };
    loadCustomFields();
    window.addEventListener("vehicles-refresh", refresh);
    return () => window.removeEventListener("vehicles-refresh", refresh);
  }, []);

  const drivers = useMemo(
    () => people.filter((person) => person.position.toLocaleLowerCase("uk").includes("водій")),
    [people],
  );
  const driverOptions = useMemo(
    () => [{ value: "all", label: "Усі водії" }, { value: "none", label: "Не закріплені" }, ...drivers.map((person) => ({ value: String(person.id), label: person.fullName }))],
    [drivers],
  );
  const filtered = useMemo(() => items.filter((vehicle) =>
    (statusFilter === "all" || vehicle.status === statusFilter)
      && (driverFilter === "all" || (driverFilter === "none" ? vehicle.personnelId === null : vehicle.personnelId === Number(driverFilter)))
      && `${vehicle.name} ${vehicle.registrationNumber} ${vehicle.driverName ?? ""} ${vehicle.status}`
      .toLocaleLowerCase("uk")
      .includes(query.toLocaleLowerCase("uk")),
  ), [items, query, statusFilter, driverFilter]);

  const tableColumns = useMemo(
    () => [
      ["name", "Автомобіль"],
      ["registrationNumber", "Номер"],
      ["status", "Стан"],
      ["driverName", "Закріплений водій"],
      ...customFields.map((field) => [`custom:${field.fieldKey}`, field.displayName]),
    ] as Array<[string, string]>,
    [customFields],
  );
  const isVisible = (key: string) => visibleColumns.length === 0 || visibleColumns.includes(key);
  const toggleColumn = (key: string) => {
    const all = tableColumns.map(([column]) => column);
    const current = visibleColumns.length === 0 ? all : visibleColumns;
    const next = current.includes(key) ? current.filter((column) => column !== key) : [...current, key];
    setVisibleColumns(next);
    void settingsService.updateVisibleVehicleColumns(next).catch(() => notify("Не вдалося зберегти видимість колонок.", "error"));
  };
  const resetFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setDriverFilter("all");
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setName("");
    setRegistrationNumber("");
    setStatus(statuses[0]);
  };
  const save = async () => {
    if (!name.trim() || !registrationNumber.trim()) {
      notify("Вкажіть назву та державний номер автомобіля.", "error");
      return;
    }
    try {
      await invoke("create_vehicle", { name: name.trim(), registrationNumber: registrationNumber.trim(), status });
      closeEditor();
      reload();
      notify("Автомобіль додано.", "success");
    } catch {
      notify("Перевірте назву та унікальність номера.", "error");
    }
  };
  const reassign = async () => {
    if (!selected) return;
    try {
      await invoke("assign_vehicle", { vehicleId: selected.id, personnelId: driverId ? Number(driverId) : null, crewId: crewId ? Number(crewId) : null });
      setAssignmentOpen(false);
      reload();
      notify("Закріплення автомобіля оновлено.", "success");
    } catch {
      notify("Закріпити автомобіль можна лише за військовослужбовцем із посадою водія.", "error");
    }
  };
  const updateStatus = async (nextStatus: string) => {
    if (!selected) return;
    try {
      await invoke("update_vehicle_status", { vehicleId: selected.id, status: nextStatus });
      reload();
      notify("Статус автомобіля оновлено.", "success");
    } catch {
      notify("Не вдалося оновити статус автомобіля.", "error");
    }
  };
  const remove = async () => {
    if (!selected) return;
    try {
      await invoke("delete_vehicle", { vehicleId: selected.id });
      setRemoving(false);
      setSelected(null);
      reload();
      notify("Автомобіль видалено.", "success");
    } catch {
      notify("Не вдалося видалити автомобіль.", "error");
    }
  };

  return <PageFrame
    className="vehicles-page"
    header={<PageTitle title="Автомобілі" subtitle="Облік автомобілів та закріплених водіїв" customFieldsScope="vehicle" actions={<button className="button primary" onClick={() => setEditorOpen(true)}><UserPlus />Додати автомобіль</button>} />}
    tools={<div className="table-tools main-tools"><SearchInput placeholder="Пошук за назвою, номером, статусом або водієм…" value={query} onChange={setQuery} /><FilterButton active={filtersOpen} onClick={() => setFiltersOpen(true)} label="Додаткові фільтри" /></div>}
  >
    <div className={`people-layout ${selected ? "with-details" : ""}`}>
      <section className="panel data-table">
        <div className="data-table__scroll">
          <table className="personnel-table vehicle-table">
            <thead><tr><th>№</th>{isVisible("name") && <th>Автомобіль</th>}{isVisible("registrationNumber") && <th>Номер</th>}{isVisible("status") && <th>Стан</th>}{isVisible("driverName") && <th>Закріплений водій</th>}{customFields.filter((field) => isVisible(`custom:${field.fieldKey}`)).map((field) => <th key={field.fieldKey}>{field.displayName}</th>)}</tr></thead>
            <tbody>{filtered.map((vehicle) => <tr key={vehicle.id} className={selected?.id === vehicle.id ? "selected" : ""} onClick={() => setSelected(vehicle)}>
              <td><div className="personnel-id">{vehicle.id}</div></td>
              {isVisible("name") && <td><b>{vehicle.name}</b></td>}{isVisible("registrationNumber") && <td>{vehicle.registrationNumber}</td>}
              {isVisible("status") && <td><span className={`vehicle-badge ${statusClass(vehicle.status)}`}>{vehicle.status}</span></td>}
              {isVisible("driverName") && <td>{vehicle.driverName ?? vehicle.crewName ?? "Не закріплено"}</td>}
              {customFields.filter((field) => isVisible(`custom:${field.fieldKey}`)).map((field) => <td key={field.fieldKey}>{field.initialValue || "—"}</td>)}
            </tr>)}</tbody>
          </table>
          {!filtered.length && <div className="personnel-state"><Car /><b>Автомобілі не знайдені</b><span>Додайте автомобіль або змініть пошук.</span></div>}
        </div>
        <div className="pagination">Показано {filtered.length} із {items.length}</div>
      </section>
      {selected && <aside className="panel person-details vehicle-details">
        <button className="close" aria-label="Закрити деталі" onClick={() => setSelected(null)}><X /></button>
        <h2>Деталі автомобіля</h2>
        <div className="identity"><div className="avatar"><Car /></div><div><b>{selected.name}</b><p>{selected.registrationNumber}</p></div></div>
        <div className="person-details__fields">
          <div className="person-detail"><span>Статус автомобіля</span><Select ariaLabel="Статус автомобіля" value={selected.status} options={statusOptions} onChange={(value) => void updateStatus(value)} /></div>
          <div className="person-detail"><span>Закріплений водій</span><b>{selected.driverName ?? "Не закріплено"}</b></div><div className="person-detail"><span>Екіпаж</span><b>{selected.crewName ?? "Не закріплено"}</b></div>
        </div>
        <div className="detail-buttons"><button className="button" onClick={() => { setDriverId(selected.personnelId?.toString() ?? ""); setCrewId(selected.crewId?.toString() ?? ""); setAssignmentOpen(true); }}><Pencil />Перезакріпити</button><button className="button danger" onClick={() => setRemoving(true)}><Trash2 />Видалити</button></div>
      </aside>}
    </div>
    {filtersOpen && <Modal title="Фільтр і видимість колонок" onClose={() => setFiltersOpen(false)} className="personnel-filter-modal">
      <div className="personnel-filter-modal__body">
        <section><h3>Відбір автомобілів</h3><div className="personnel-filter-modal__controls"><Select ariaLabel="Фільтр за станом" value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "Усі стани" }, ...statusOptions]} /><Select ariaLabel="Фільтр за водієм" value={driverFilter} onChange={setDriverFilter} options={driverOptions} /></div></section>
        <section><div className="personnel-filter-modal__section-title"><h3>Колонки в таблиці</h3><button className="button" onClick={() => { setVisibleColumns([]); void settingsService.updateVisibleVehicleColumns([]); }}>Показати всі</button></div><p>Номер ID завжди показується. Позначте інші дані, які потрібно бачити в таблиці.</p><div className="personnel-filter-modal__columns">{tableColumns.map(([key, label]) => <label key={key}><input type="checkbox" checked={isVisible(key)} onChange={() => toggleColumn(key)} /><span>{label}</span></label>)}</div></section>
      </div>
      <footer className="modal-actions"><button className="button" onClick={resetFilters}><RefreshCw />Скинути фільтри</button><button className="button primary" onClick={() => setFiltersOpen(false)}>Готово</button></footer>
    </Modal>}
    {editorOpen && <Modal title="Новий автомобіль" onClose={closeEditor} className="vehicle-editor">
      <div className="vehicle-editor__scroll">
        <div className="vehicle-editor__intro"><span className="vehicle-editor__icon"><Car /></span><div><b>Дані автомобіля</b><p>Додайте автомобіль до спільного переліку. Водія можна закріпити після створення.</p></div></div>
        <div className="vehicle-editor__grid">
          <label className="form-field"><span>Назва автомобіля <b>*</b></span><input autoFocus placeholder="Наприклад, Toyota Hilux" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="form-field"><span>Державний номер <b>*</b></span><input placeholder="Наприклад, АА 1234 АА" value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} /></label>
          <div className="form-field form-field--wide"><span>Початковий статус</span><Select ariaLabel="Початковий статус" value={status} options={statusOptions} onChange={setStatus} /></div>
        </div>
      </div>
      <footer className="modal-actions"><button className="button" onClick={closeEditor}>Скасувати</button><button className="button primary" onClick={() => void save()}><Car />Додати автомобіль</button></footer>
    </Modal>}
    {assignmentOpen && <Modal title="Перезакріпити автомобіль" onClose={() => setAssignmentOpen(false)} className="vehicle-assignment-modal">
      <div className="vehicle-assignment-modal__body"><div className="vehicle-editor__intro"><span className="vehicle-editor__icon"><Car /></span><div><b>{selected?.name}</b><p>{selected?.registrationNumber}</p></div></div><p>Автомобіль може бути закріплений окремо за водієм і за екіпажем.</p><label className="form-field"><span>Водій</span><Select ariaLabel="Водій автомобіля" value={driverId} onChange={setDriverId} options={[{ value: "", label: "Не закріплювати" }, ...drivers.map((person) => ({ value: String(person.id), label: person.fullName }))]} /></label><label className="form-field"><span>Екіпаж</span><Select ariaLabel="Екіпаж автомобіля" value={crewId} onChange={setCrewId} options={[{ value: "", label: "Не закріплювати" }, ...crews.map((crew) => ({ value: String(crew.id), label: crew.name }))]} /></label></div>
      <footer className="modal-actions"><button className="button" onClick={() => setAssignmentOpen(false)}>Скасувати</button><button className="button primary" onClick={() => void reassign()}>Зберегти закріплення</button></footer>
    </Modal>}
    {removing && <Modal title="Видалити автомобіль?" onClose={() => setRemoving(false)} className="vehicle-delete-modal"><div className="vehicle-delete-modal__body"><Trash2 /><p>Автомобіль буде видалений, а закріплений водій — автоматично відкріплений.</p></div><footer className="modal-actions"><button className="button" onClick={() => setRemoving(false)}>Скасувати</button><button className="button danger" onClick={() => void remove()}>Видалити</button></footer></Modal>}
  </PageFrame>;
}
