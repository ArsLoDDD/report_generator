import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Pencil, RefreshCw, Trash2, UserPlus, Users, X } from "lucide-react";
import type { Person, PersonnelDraft } from "../../shared/types/domain";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { FilterButton } from "../../shared/ui/FilterButton";
import { Modal } from "../../shared/ui/Modal";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { includesSearch } from "../../shared/utils/search";
import { useLoadMoreOnScroll } from "../../shared/hooks/useLoadMoreOnScroll";
import { emptyPersonnelDraft, PersonnelForm } from "./components/PersonnelForm";
import { PersonnelTable } from "./components/PersonnelTable";
import { personnelCoreFields } from "../../shared/constants/personnelCoreFields";
import { settingsService } from "../settings/services/settingsService";
import { personnelService } from "../../shared/services/personnelService";
import { open, save } from "@tauri-apps/plugin-dialog";

type PersonnelPageProps = {
  people: Person[];
  totalCount: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  errorMessage: string | null;
  onCreate: (draft: PersonnelDraft) => Promise<Person>;
  onUpdate: (personnelId: number, draft: PersonnelDraft) => Promise<Person>;
  onDelete: (personnelId: number) => Promise<void>;
  onRefresh: () => Promise<void>;
  onLoadMore: () => Promise<void>;
};

function toDraft(person: Person): PersonnelDraft {
  const { id: _id, fullName: _fullName, ...draft } = person;
  return draft;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : typeof error === "string" ? error : "Сталася невідома помилка.";
}

const detailFields: Array<{ key: Exclude<keyof PersonnelDraft, "coreFields">; label: string }> = [
  { key: "rank", label: "Звання" }, { key: "surname", label: "Прізвище" }, { key: "givenName", label: "Ім’я" },
  { key: "patronymic", label: "По батькові" }, { key: "position", label: "Посада" }, { key: "taxId", label: "ІПН" },
  { key: "birthDate", label: "Дата народження" }, { key: "educationLevel", label: "Формат освіти" },
  { key: "educationDetails", label: "Де отримана освіта" }, { key: "armedForcesServiceStartDate", label: "У ЗСУ з" },
  { key: "positionAssignedDate", label: "Дата призначення" }, { key: "positionAssignmentOrder", label: "Наказ про призначення" },
  { key: "militaryId", label: "Військовий квиток" }, { key: "assignedVehicleName", label: "Автомобіль" },
  { key: "assignedVehicleRegistration", label: "Номер автомобіля" }
];

export function PersonnelPage({ people, totalCount, hasMore, isLoading, isLoadingMore, errorMessage, onCreate, onUpdate, onDelete, onRefresh, onLoadMore }: PersonnelPageProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | "new" | null>(null);
  const [deletingPerson, setDeletingPerson] = useState<Person | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importMode, setImportMode] = useState<"append" | "replace" | null>(null);
  const [visibleCoreColumns, setVisibleCoreColumns] = useState<string[]>([]);
  const [rank, setRank] = useState("all");
  const [education, setEducation] = useState("all");
  const { notify } = useNotifications();
  const selectedPerson = people.find((person) => person.id === selectedId) ?? null;
  useEffect(() => { const refresh = () => { void onRefresh(); }; window.addEventListener("personnel-refresh", refresh); return () => window.removeEventListener("personnel-refresh", refresh); }, [onRefresh]);
  useEffect(() => { void settingsService.get().then((settings) => setVisibleCoreColumns(settings.visiblePersonnelColumns ?? [])).catch(() => undefined); }, []);
  const ranks = useMemo(() => [...new Set(people.map((person) => person.rank))], [people]);
  const educationLevels = useMemo(() => [...new Set(people.map((person) => person.educationLevel).filter(Boolean))], [people]);
  const filteredPeople = people.filter((person) => (rank === "all" || person.rank === rank) && (education === "all" || person.educationLevel === education) && includesSearch(query, person.fullName, person.surname, person.givenName, person.taxId, person.position, person.rank, person.militaryId, ...Object.values(person.coreFields ?? {}), ...Object.values(person.customFields ?? {})));
  const resetFilters = () => { setQuery(""); setRank("all"); setEducation("all"); };
  const baseColumns = [["rank", "Звання"], ["surname", "Прізвище"], ["givenName", "Ім’я"], ["patronymic", "По батькові"], ["position", "Посада"], ["taxId", "ІПН"], ["birthDate", "Дата народження"], ["educationLevel", "Формат освіти"], ["educationDetails", "Де отримана освіта"], ["armedForcesServiceStartDate", "У ЗСУ з"], ["positionAssignedDate", "Дата призначення"], ["positionAssignmentOrder", "Наказ про призначення"], ["militaryId", "Військовий квиток"], ["assignedVehicleName", "Автомобіль"], ["assignedVehicleRegistration", "Номер автомобіля"]] as const;
  const customColumns = [...new Set(people.flatMap((person) => Object.keys(person.customFields ?? {})))];
  const toggleCoreColumn = (key: string) => {
    const all = [...baseColumns.map(([field]) => field), ...personnelCoreFields.filter(([field]) => field !== "full_name").map(([field]) => field), ...customColumns.map((field) => `custom:${field}`)];
    const current = visibleCoreColumns.length === 0 ? all : visibleCoreColumns;
    const next = current.includes(key) ? current.filter((field) => field !== key) : [...current, key];
    setVisibleCoreColumns(next);
    void settingsService.updateVisiblePersonnelColumns(next).catch((error) => notify(errorText(error), "error"));
  };
  const onTableScroll = useLoadMoreOnScroll({ hasMore, isLoading: isLoadingMore, loadMore: onLoadMore });
  const savePerson = async (draft: PersonnelDraft) => {
    try {
      const saved = editingPerson === "new" ? await onCreate(draft) : editingPerson ? await onUpdate(editingPerson.id, draft) : null;
      if (!saved) return;
      setSelectedId(saved.id); setEditingPerson(null);
      notify(editingPerson === "new" ? "Військовослужбовця додано." : "Дані військовослужбовця оновлено.", "success");
    } catch (error) { notify(errorText(error), "error"); }
  };
  const confirmDelete = async () => {
    if (!deletingPerson) return;
    setIsDeleting(true);
    try {
      await onDelete(deletingPerson.id);
      if (selectedId === deletingPerson.id) setSelectedId(null);
      setDeletingPerson(null); notify("Запис військовослужбовця видалено.", "success");
    } catch (error) { notify(errorText(error), "error"); }
    finally { setIsDeleting(false); }
  };
  const importExcel = async (mode: "append" | "replace") => { try { setImportMode(null); const path = await open({ title: "Імпорт особового складу", filters: [{ name: "Таблиця Excel", extensions: ["xlsx"] }] }); if (!path || Array.isArray(path)) return; const count = await personnelService.importExcel(path, mode); await onRefresh(); notify(mode === "replace" ? `Особовий склад замінено: ${count} записів.` : `Додано записів: ${count}.`, "success"); } catch (error) { notify(errorText(error), "error"); } };
  const exportExcel = async () => { try { const path = await save({ title: "Експорт особового складу", defaultPath: "особовий-склад.xlsx", filters: [{ name: "Таблиця Excel", extensions: ["xlsx"] }] }); if (!path) return; await personnelService.exportExcel(path.endsWith(".xlsx") ? path : `${path}.xlsx`); notify("Excel-файл успішно експортовано.", "success"); } catch (error) { notify(errorText(error), "error"); } };
  const tools = <div className="table-tools main-tools"><SearchInput placeholder="Пошук за ПІБ, ІПН або посадою…" value={query} onChange={setQuery} /><FilterButton active={filtersOpen} onClick={() => setFiltersOpen(true)} label="Додаткові фільтри" /></div>;
  return <PageFrame header={<PageTitle title="Особовий склад" subtitle="Облік та керування даними військовослужбовців" actions={<><button className="button" onClick={() => setImportMode("append")}>Імпорт Excel</button><button className="button" onClick={() => void exportExcel()}>Експорт Excel</button><button className="button primary" onClick={() => setEditingPerson("new")}><UserPlus />Додати військовослужбовця</button></>} />} tools={tools} className="personnel-page"><div className={`people-layout ${selectedPerson ? "with-details" : ""}`}><section className="panel data-table"><div className="data-table__scroll" onScroll={onTableScroll}>{isLoading ? <div className="personnel-state">Завантаження особового складу…</div> : errorMessage ? <div className="personnel-state personnel-state--error"><AlertCircle /><span>{errorMessage}</span><button className="button" onClick={() => void onRefresh()}>Оновити</button></div> : filteredPeople.length === 0 ? <div className="personnel-state"><Users /><b>{totalCount === 0 ? "Особовий склад порожній" : "Записів не знайдено"}</b><span>{totalCount === 0 ? "Додайте першого військовослужбовця." : "Змініть пошук або фільтри."}</span></div> : <PersonnelTable people={filteredPeople} visibleColumns={visibleCoreColumns} selectedId={selectedId} onSelect={(id) => setSelectedId((current) => current === id ? null : id)} onEdit={setEditingPerson} onDelete={setDeletingPerson} />}{isLoadingMore && <div className="infinite-loading">Завантаження наступних 20 записів…</div>}</div><div className="pagination">Показано {filteredPeople.length} із {totalCount}</div></section>{selectedPerson && <aside className="panel person-details"><button className="close" aria-label="Закрити деталі" onClick={() => setSelectedId(null)}><X /></button><h2>Деталі військовослужбовця</h2><div className="identity"><div className="avatar">{selectedPerson.givenName.slice(0, 1)}{selectedPerson.surname.slice(0, 1)}</div><div><b>{selectedPerson.fullName}</b><p>{selectedPerson.rank}</p></div></div><div className="person-details__fields">{detailFields.map((field) => <div className="person-detail" key={field.key}><span>{field.label}</span><b>{selectedPerson[field.key] || "—"}</b></div>)}{personnelCoreFields.filter(([key]) => key !== "full_name").map(([key, label]) => <div className="person-detail" key={key}><span>{label}</span><b>{selectedPerson.coreFields?.[key] || "—"}</b></div>)}</div><div className="detail-buttons"><button className="button" onClick={() => setEditingPerson(selectedPerson)}><Pencil />Редагувати</button><button className="button danger" onClick={() => setDeletingPerson(selectedPerson)}><Trash2 />Видалити</button></div></aside>}</div>{filtersOpen && <Modal title="Фільтр і видимість колонок" onClose={() => setFiltersOpen(false)} className="personnel-filter-modal"><div className="personnel-filter-modal__body"><section><h3>Відбір записів</h3><div className="personnel-filter-modal__controls"><Select ariaLabel="Фільтр за званням" value={rank} onChange={setRank} options={[{ value: "all", label: "Усі звання" }, ...ranks.map((item) => ({ value: item, label: item }))]} /><Select ariaLabel="Фільтр за освітою" value={education} onChange={setEducation} options={[{ value: "all", label: "Уся освіта" }, ...educationLevels.map((item) => ({ value: item, label: item }))]} /></div></section><section><div className="personnel-filter-modal__section-title"><h3>Колонки в таблиці</h3><button className="button" onClick={() => { setVisibleCoreColumns([]); void settingsService.updateVisiblePersonnelColumns([]); }}>Показати всі</button></div><p>Позначте дані, які потрібно бачити в таблиці. Вибір збережеться.</p><div className="personnel-filter-modal__columns">{[...baseColumns, ...personnelCoreFields.filter(([key]) => key !== "full_name")].map(([key, label]) => <label key={key}><input type="checkbox" checked={visibleCoreColumns.length === 0 || visibleCoreColumns.includes(key)} onChange={() => toggleCoreColumn(key)} /><span>{label}</span></label>)}{customColumns.map((key) => <label key={`custom:${key}`}><input type="checkbox" checked={visibleCoreColumns.length === 0 || visibleCoreColumns.includes(`custom:${key}`)} onChange={() => toggleCoreColumn(`custom:${key}`)} /><span>{key}</span></label>)}</div></section></div><footer className="modal-actions"><button className="button" onClick={resetFilters}><RefreshCw />Скинути фільтри</button><button className="button primary" onClick={() => setFiltersOpen(false)}>Готово</button></footer></Modal>}{importMode && <Modal title="Спосіб імпорту Excel" onClose={() => setImportMode(null)} className="personnel-import-modal"><div className="personnel-filter-modal__body"><p>Оберіть, як застосувати записи з Excel-файлу.</p><div className="personnel-import-options"><button className="personnel-import-option" onClick={() => void importExcel("append")}><b>Доповнити особовий склад</b><span>Додати нові записи з файлу. Наявні записи залишаться без змін.</span></button><button className="personnel-import-option personnel-import-option--danger" onClick={() => void importExcel("replace")}><b>Повністю замінити особовий склад</b><span>Очистити поточні записи й завантажити дані з файлу. Якщо файл має помилку, база не зміниться.</span></button></div></div><footer className="modal-actions"><button className="button" onClick={() => setImportMode(null)}>Скасувати</button></footer></Modal>}{editingPerson && <Modal title={editingPerson === "new" ? "Новий військовослужбовець" : `Редагування: ${editingPerson.fullName}`} onClose={() => setEditingPerson(null)} className="personnel-editor"><PersonnelForm initialValue={editingPerson === "new" ? emptyPersonnelDraft : toDraft(editingPerson)} submitLabel={editingPerson === "new" ? "Додати" : "Зберегти зміни"} onSubmit={savePerson} onCancel={() => setEditingPerson(null)} /></Modal>}{deletingPerson && <ConfirmDialog title="Видалити запис?" message={`Військовослужбовець «${deletingPerson.fullName}» буде видалений із бази даних. Цю дію не можна скасувати.`} confirmLabel="Видалити" onConfirm={() => void confirmDelete()} onCancel={() => setDeletingPerson(null)} busy={isDeleting} />}</PageFrame>;
}
