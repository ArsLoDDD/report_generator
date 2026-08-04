import { useMemo, useState } from "react";
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

const detailFields: Array<{ key: keyof PersonnelDraft; label: string }> = [
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
  const [rank, setRank] = useState("all");
  const [education, setEducation] = useState("all");
  const { notify } = useNotifications();
  const selectedPerson = people.find((person) => person.id === selectedId) ?? null;
  const ranks = useMemo(() => [...new Set(people.map((person) => person.rank))], [people]);
  const educationLevels = useMemo(() => [...new Set(people.map((person) => person.educationLevel).filter(Boolean))], [people]);
  const filteredPeople = people.filter((person) => (rank === "all" || person.rank === rank) && (education === "all" || person.educationLevel === education) && includesSearch(query, person.fullName, person.surname, person.givenName, person.taxId, person.position, person.rank, person.militaryId));
  const resetFilters = () => { setQuery(""); setRank("all"); setEducation("all"); };
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
  const tools = <><div className="table-tools main-tools"><SearchInput placeholder="Пошук за ПІБ, ІПН або посадою…" value={query} onChange={setQuery} /><FilterButton active={filtersOpen} onClick={() => setFiltersOpen((current) => !current)} label="Додаткові фільтри" /></div>{filtersOpen && <div className="filter-bar functional-filter-bar"><Select ariaLabel="Фільтр за званням" value={rank} onChange={setRank} options={[{ value: "all", label: "Усі звання" }, ...ranks.map((item) => ({ value: item, label: item }))]} /><Select ariaLabel="Фільтр за освітою" value={education} onChange={setEducation} options={[{ value: "all", label: "Уся освіта" }, ...educationLevels.map((item) => ({ value: item, label: item }))]} /><button className="reset" aria-label="Скинути фільтри" title="Скинути фільтри" onClick={resetFilters}><RefreshCw />Скинути фільтри</button></div>}</>;
  return <PageFrame header={<PageTitle title="Особовий склад" subtitle="Облік та керування даними військовослужбовців" actions={<button className="button primary" onClick={() => setEditingPerson("new")}><UserPlus />Додати військовослужбовця</button>} />} tools={tools} className="personnel-page"><div className={`people-layout ${selectedPerson ? "with-details" : ""}`}><section className="panel data-table"><div className="data-table__scroll" onScroll={onTableScroll}>{isLoading ? <div className="personnel-state">Завантаження особового складу…</div> : errorMessage ? <div className="personnel-state personnel-state--error"><AlertCircle /><span>{errorMessage}</span><button className="button" onClick={() => void onRefresh()}>Оновити</button></div> : filteredPeople.length === 0 ? <div className="personnel-state"><Users /><b>{totalCount === 0 ? "Особовий склад порожній" : "Записів не знайдено"}</b><span>{totalCount === 0 ? "Додайте першого військовослужбовця." : "Змініть пошук або фільтри."}</span></div> : <PersonnelTable people={filteredPeople} selectedId={selectedId} onSelect={(id) => setSelectedId((current) => current === id ? null : id)} onEdit={setEditingPerson} onDelete={setDeletingPerson} />}{isLoadingMore && <div className="infinite-loading">Завантаження наступних 20 записів…</div>}</div><div className="pagination">Показано {filteredPeople.length} із {totalCount}</div></section>{selectedPerson && <aside className="panel person-details"><button className="close" aria-label="Закрити деталі" onClick={() => setSelectedId(null)}><X /></button><h2>Деталі військовослужбовця</h2><div className="identity"><div className="avatar">{selectedPerson.givenName.slice(0, 1)}{selectedPerson.surname.slice(0, 1)}</div><div><b>{selectedPerson.fullName}</b><p>{selectedPerson.rank}</p></div></div><div className="person-details__fields">{detailFields.map((field) => <div className="person-detail" key={field.key}><span>{field.label}</span><b>{selectedPerson[field.key] || "—"}</b></div>)}</div><div className="detail-buttons"><button className="button" onClick={() => setEditingPerson(selectedPerson)}><Pencil />Редагувати</button><button className="button danger" onClick={() => setDeletingPerson(selectedPerson)}><Trash2 />Видалити</button></div></aside>}</div>{editingPerson && <Modal title={editingPerson === "new" ? "Новий військовослужбовець" : `Редагування: ${editingPerson.fullName}`} onClose={() => setEditingPerson(null)} className="personnel-editor"><PersonnelForm initialValue={editingPerson === "new" ? emptyPersonnelDraft : toDraft(editingPerson)} submitLabel={editingPerson === "new" ? "Додати" : "Зберегти зміни"} onSubmit={savePerson} onCancel={() => setEditingPerson(null)} /></Modal>}{deletingPerson && <ConfirmDialog title="Видалити запис?" message={`Військовослужбовець «${deletingPerson.fullName}» буде видалений із бази даних. Цю дію не можна скасувати.`} confirmLabel="Видалити" onConfirm={() => void confirmDelete()} onCancel={() => setDeletingPerson(null)} busy={isDeleting} />}</PageFrame>;
}
