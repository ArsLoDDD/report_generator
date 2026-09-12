import { Car, Pencil, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type UIEventHandler } from "react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Modal } from "../../shared/ui/Modal";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { FilterButton } from "../../shared/ui/FilterButton";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import type { Person } from "../../shared/types/domain";
import { settingsService } from "../settings/services/settingsService";
import { vehiclesService } from "./services/vehiclesService";
import type { Vehicle } from "./types";
import { subscribeToAppDataEvent } from "../../shared/events/appEvents";
import { useEntityCollection } from "../../shared/hooks/useEntityCollection";
import { VehicleEditorModal } from "./components/VehicleEditorModal";
import { VehicleAssignmentModal } from "./components/VehicleAssignmentModal";
import { EntityDetailsPanel } from "../../shared/ui/EntityDetailsPanel";

const statuses = ["Справний", "Потребує ремонту", "Ремонтується", "Несправний"];
const statusOptions = statuses.map((value) => ({ value, label: value }));

function statusClass(status: string) {
  return `status-${status.replace(/ /g, "-")}`;
}

export function VehiclesPage({ people }: { people: Person[] }) {
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(20);
  const { notify } = useNotifications();

  const loadVehicles = useCallback(() => vehiclesService.list(), []);
  const onLoadError = useCallback(() => notify("Не вдалося завантажити автомобілі.", "error"), [notify]);
  const { items, reload: reloadItems } = useEntityCollection({ load: loadVehicles, onError: onLoadError });
  const reload = useCallback(() => { void reloadItems().then((rows) => setSelected((current) => current && rows ? rows.find((item) => item.id === current.id) ?? null : current)); }, [reloadItems]);
  useEffect(() => {
    void settingsService.get()
      .then((settings) => setVisibleColumns(settings.visibleVehicleColumns ?? []))
      .catch(() => setVisibleColumns([]));
  }, [reload]);
  useEffect(() => {
    const refresh = () => reload();
    return subscribeToAppDataEvent("vehicles-refresh", refresh);
  }, [reload]);

  const drivers = people;
  const driverOptions = useMemo(
    () => [{ value: "all", label: "Усі військовослужбовці" }, { value: "none", label: "Не закріплені" }, ...drivers.map((person) => ({ value: String(person.id), label: person.fullName }))],
    [drivers],
  );
  const filtered = useMemo(() => items.filter((vehicle) =>
    (statusFilter === "all" || vehicle.status === statusFilter)
      && (driverFilter === "all" || (driverFilter === "none" ? vehicle.personnelId === null : vehicle.personnelId === Number(driverFilter)))
      && `${vehicle.name} ${vehicle.registrationNumber} ${vehicle.driverName ?? ""} ${vehicle.status}`
      .toLocaleLowerCase("uk")
      .includes(query.toLocaleLowerCase("uk")),
  ), [items, query, statusFilter, driverFilter]);

  const tableColumns = useMemo(() => [
      ["name", "Автомобіль"],
      ["registrationNumber", "Номер"],
      ["status", "Стан"],
      ["driverName", "Закріплено за"],
    ] as Array<[string, string]>, []);
  const isVisible = useCallback(
    (key: string) => visibleColumns.length === 0 || visibleColumns.includes(key),
    [visibleColumns],
  );
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

  const save = async (name: string, registrationNumber: string, status: string, personnelId: number | null) => {
    if (!name.trim() || !registrationNumber.trim()) {
      notify("Вкажіть назву та державний номер автомобіля.", "error");
      return false;
    }
    try {
      await vehiclesService.create(name.trim(), registrationNumber.trim(), status, personnelId);
      reload();
      notify("Автомобіль додано.", "success");
      return true;
    } catch {
      notify("Перевірте назву та унікальність номера.", "error");
      return false;
    }
  };
  const reassign = async (driverId: number | null, crewId: number | null) => {
    if (!selected) return false;
    try {
      await vehiclesService.assign(selected.id, driverId, crewId);
      reload();
      notify("Закріплення автомобіля оновлено.", "success");
      return true;
    } catch {
      notify("Не вдалося оновити закріплення автомобіля.", "error");
      return false;
    }
  };
  const updateStatus = async (nextStatus: string) => {
    if (!selected) return;
    try {
      await vehiclesService.updateStatus(selected.id, nextStatus);
      reload();
      notify("Статус автомобіля оновлено.", "success");
    } catch {
      notify("Не вдалося оновити статус автомобіля.", "error");
    }
  };
  const remove = async () => {
    if (!selected) return;
    try {
      await vehiclesService.remove(selected.id);
      setRemoving(false);
      setSelected(null);
      reload();
      notify("Автомобіль видалено.", "success");
    } catch {
      notify("Не вдалося видалити автомобіль.", "error");
    }
  };

  const visibleTableColumns = useMemo<EntityTableColumn<Vehicle>[]>(() => [
    { key: "id", title: "№", render: (_vehicle, rowIndex) => <div className="personnel-id">{rowIndex + 1}</div> },
    ...(isVisible("name") ? [{ key: "name", title: "Автомобіль", render: (vehicle: Vehicle) => <b>{vehicle.name}</b> }] : []),
    ...(isVisible("registrationNumber") ? [{ key: "registrationNumber", title: "Номер", render: (vehicle: Vehicle) => vehicle.registrationNumber }] : []),
    ...(isVisible("status") ? [{ key: "status", title: "Стан", render: (vehicle: Vehicle) => <span className={`vehicle-badge ${statusClass(vehicle.status)}`}>{vehicle.status}</span> }] : []),
    ...(isVisible("driverName") ? [{ key: "driverName", title: "Закріплено за", render: (vehicle: Vehicle) => vehicle.driverName ?? "Не закріплено" }] : []),
  ], [isVisible]);
  useEffect(() => setVisibleLimit(20), [query, statusFilter, driverFilter]);
  const visibleItems = filtered.slice(0, visibleLimit);
  const onTableScroll: UIEventHandler<HTMLDivElement> = (event) => { const el=event.currentTarget; if(el.scrollHeight-el.scrollTop-el.clientHeight<100)setVisibleLimit((n)=>Math.min(n+20,filtered.length)); };

  return <PageFrame
    className="vehicles-page"
    header={<PageTitle title="Автомобілі" subtitle="Облік автомобілів та відповідальних військовослужбовців" actions={<button className="button primary" onClick={() => setEditorOpen(true)}><UserPlus />Додати автомобіль</button>} />}
    tools={<div className="table-tools main-tools"><SearchInput placeholder="Пошук за назвою, номером, статусом або відповідальним…" value={query} onChange={setQuery} /><FilterButton active={filtersOpen} onClick={() => setFiltersOpen(true)} label="Додаткові фільтри" /></div>}
  >
    <div className={`people-layout ${selected ? "with-details" : ""}`}>
      <section className="panel data-table">
        <EntityTable
          className="personnel-table vehicle-table"
          items={visibleItems}
          onScroll={onTableScroll}
          columns={visibleTableColumns}
          rowKey={(vehicle) => vehicle.id}
          selectedKey={selected?.id}
          onSelect={setSelected}
          emptyState={<div className="personnel-state"><Car /><b>Автомобілі не знайдені</b><span>Додайте автомобіль або змініть пошук.</span></div>}
        />
        <div className="pagination">Показано {visibleItems.length} із {filtered.length}</div>
      </section>
      {selected && <EntityDetailsPanel className="vehicle-details" title="Деталі автомобіля" onClose={() => setSelected(null)} identity={<div className="identity"><div className="avatar"><Car /></div><div><b>{selected.name}</b><p>{selected.registrationNumber}</p></div></div>} actions={<><button className="button" onClick={() => setAssignmentOpen(true)}><Pencil />Перезакріпити</button><button className="button danger" onClick={() => setRemoving(true)}><Trash2 />Видалити</button></>}>
          <div className="person-detail"><span>Статус автомобіля</span><Select ariaLabel="Статус автомобіля" value={selected.status} options={statusOptions} onChange={(value) => void updateStatus(value)} /></div>
          <div className="person-detail"><span>Закріплено за</span><b>{selected.driverName ?? "Не закріплено"}</b></div><div className="person-detail"><span>Екіпаж відповідального</span><b>{selected.crewName ?? "Не закріплено"}</b></div>
      </EntityDetailsPanel>}
    </div>
    {filtersOpen && <Modal title="Фільтр і видимість колонок" onClose={() => setFiltersOpen(false)} className="personnel-filter-modal">
      <div className="personnel-filter-modal__body">
        <section><h3>Відбір автомобілів</h3><div className="personnel-filter-modal__controls"><Select ariaLabel="Фільтр за станом" value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "Усі стани" }, ...statusOptions]} /><Select ariaLabel="Фільтр за відповідальним" value={driverFilter} onChange={setDriverFilter} options={driverOptions} /></div></section>
        <section><div className="personnel-filter-modal__section-title"><h3>Колонки в таблиці</h3><button className="button" onClick={() => { setVisibleColumns([]); void settingsService.updateVisibleVehicleColumns([]); }}>Показати всі</button></div><p>Номер ID завжди показується. Позначте інші дані, які потрібно бачити в таблиці.</p><div className="personnel-filter-modal__columns">{tableColumns.map(([key, label]) => <label key={key}><input type="checkbox" checked={isVisible(key)} onChange={() => toggleColumn(key)} /><span>{label}</span></label>)}</div></section>
      </div>
      <footer className="modal-actions"><button className="button" onClick={resetFilters}><RefreshCw />Скинути фільтри</button><button className="button primary" onClick={() => setFiltersOpen(false)}>Готово</button></footer>
    </Modal>}
    {editorOpen && <VehicleEditorModal statuses={statuses} people={people} onClose={() => setEditorOpen(false)} onSave={save} />}
    {assignmentOpen && selected && <VehicleAssignmentModal vehicle={selected} drivers={drivers} onClose={() => setAssignmentOpen(false)} onSave={reassign} />}
    {removing && <Modal title="Видалити автомобіль?" onClose={() => setRemoving(false)} className="vehicle-delete-modal"><div className="vehicle-delete-modal__body"><Trash2 /><p>Автомобіль буде видалений, а закріплений водій — автоматично відкріплений.</p></div><footer className="modal-actions"><button className="button" onClick={() => setRemoving(false)}>Скасувати</button><button className="button danger" onClick={() => void remove()}>Видалити</button></footer></Modal>}
  </PageFrame>;
}
