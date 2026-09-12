import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Car, PackageOpen, Pencil, RefreshCw, Trash2, UserPlus, Users, X } from "lucide-react";
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
import { subscribeToAppDataEvent } from "../../shared/events/appEvents";
import { operationsService } from "../operations/services/operationsService";
import type { Equipment, EquipmentCategory } from "../operations/types";

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

type PersonDetailTab = "Основне" | "Служба" | "Документи" | "Контакти" | "БЧС" | "Майно" | "Кастомні поля";
const personDetailTabs: PersonDetailTab[] = ["Основне", "Служба", "Документи", "Контакти", "БЧС", "Майно", "Кастомні поля"];
const coreFieldLabels = new Map<string, string>(personnelCoreFields);
const equipmentCategories: EquipmentCategory[] = ["generator", "uav", "communications", "weapon_ammo"];
const equipmentCategoryLabels: Record<EquipmentCategory, string> = { generator: "Генератори", uav: "БпЛА та БпАК", communications: "Зв’язок", weapon_ammo: "Зброя та БК" };

export function PersonnelPage({ people, totalCount, hasMore, isLoading, isLoadingMore, errorMessage, onCreate, onUpdate, onDelete, onRefresh, onLoadMore }: PersonnelPageProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | "new" | null>(null);
  const [deletingPerson, setDeletingPerson] = useState<Person | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCoreColumns, setVisibleCoreColumns] = useState<string[]>([]);
  const [rank, setRank] = useState("all");
  const [education, setEducation] = useState("all");
  const [detailTab, setDetailTab] = useState<PersonDetailTab>("Основне");
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const { notify } = useNotifications();
  const selectedPerson = people.find((person) => person.id === selectedId) ?? null;
  useEffect(() => { setDetailTab("Основне"); }, [selectedId]);
  useEffect(() => subscribeToAppDataEvent("personnel-refresh", () => { void onRefresh(); }), [onRefresh]);
  useEffect(() => { void settingsService.get().then((settings) => setVisibleCoreColumns(settings.visiblePersonnelColumns ?? [])).catch(() => undefined); }, []);
  useEffect(() => { void Promise.all(equipmentCategories.map((category) => operationsService.listEquipment(category))).then((groups) => setEquipment(groups.flat())).catch(() => setEquipment([])); }, []);
  // The register is loaded in pages, but search must cover the whole database.
  // While a query is active, quietly fetch the remaining pages one by one.
  useEffect(() => { if (query.trim() && hasMore && !isLoadingMore) void onLoadMore(); }, [query, hasMore, isLoadingMore, onLoadMore]);
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
  const tools = <div className="table-tools main-tools"><SearchInput placeholder="Пошук за ПІБ, ІПН або посадою…" value={query} onChange={setQuery} /><FilterButton active={filtersOpen} onClick={() => setFiltersOpen(true)} label="Додаткові фільтри" /></div>;
  const personEquipment = selectedPerson ? equipment.filter((item) => item.personnelId === selectedPerson.id) : [];
  const hasPersonAssets = Boolean(selectedPerson?.assignedVehicleName || personEquipment.length);
  const detailRows = selectedPerson ? (() => {
    const core = selectedPerson.coreFields ?? {};
    const coreRows = (keys: string[]) => keys.map((key) => ({ key, label: coreFieldLabels.get(key) ?? key, value: core[key] }));
    const groups: Record<PersonDetailTab, Array<{ key: string; label: string; value?: string }>> = {
      "Основне": [{ key: "rank", label: "Звання", value: selectedPerson.rank }, { key: "surname", label: "Прізвище", value: selectedPerson.surname }, { key: "givenName", label: "Ім’я", value: selectedPerson.givenName }, { key: "patronymic", label: "По батькові", value: selectedPerson.patronymic }, { key: "gender", label: "Стать", value: selectedPerson.gender }, { key: "position", label: "Посада", value: selectedPerson.position }, { key: "birthDate", label: "Дата народження", value: selectedPerson.birthDate }],
      "Служба": [{ key: "armedForcesServiceStartDate", label: "У ЗСУ з", value: selectedPerson.armedForcesServiceStartDate }, { key: "positionAssignedDate", label: "Дата призначення", value: selectedPerson.positionAssignedDate }, { key: "positionAssignmentOrder", label: "Наказ про призначення", value: selectedPerson.positionAssignmentOrder }, ...coreRows(["service_type", "service_start_date", "conscription_institution", "basic_military_training", "basic_training_start_date", "basic_training_end_date", "basic_training_location"])],
      "Документи": [{ key: "taxId", label: "ІПН", value: selectedPerson.taxId }, { key: "militaryId", label: "Військовий квиток", value: selectedPerson.militaryId }, { key: "educationLevel", label: "Формат освіти", value: selectedPerson.educationLevel }, { key: "educationDetails", label: "Де отримана освіта", value: selectedPerson.educationDetails }, ...coreRows(["passport_series", "passport_number", "passport_issued_by", "passport_issue_date", "foreign_passport", "foreign_passport_series", "foreign_passport_number", "foreign_passport_issued_by", "foreign_passport_issue_date", "military_document_issued_by", "military_document_issue_date", "combatant_certificate", "combatant_certificate_series", "combatant_certificate_number", "combatant_certificate_issued_by", "combatant_certificate_issue_date", "driver_license", "driver_license_series", "driver_license_number", "driver_license_issued_by", "driver_license_issue_date", "driver_license_valid_until", "driver_license_categories"])],
      "Контакти": coreRows(["phone", "email", "marital_status", "blood_type"]),
      "БЧС": coreRows(["military_fitness", "oath_date"]),
      "Майно": [],
      "Кастомні поля": Object.entries(selectedPerson.customFields ?? {}).map(([key, value]) => ({ key, label: key, value })),
    };
    return groups[detailTab];
  })() : [];
  return <PageFrame header={<PageTitle title="Особовий склад" subtitle="Облік та керування даними військовослужбовців" actions={<button className="button primary" onClick={() => setEditingPerson("new")}><UserPlus />Додати військовослужбовця</button>} />} tools={tools} className="personnel-page"><div className={`people-layout ${selectedPerson ? "with-details" : ""}`}><section className="panel data-table">{isLoading ? <div className="data-table__scroll"><div className="personnel-state">Завантаження особового складу…</div></div> : errorMessage ? <div className="data-table__scroll"><div className="personnel-state personnel-state--error"><AlertCircle /><span>{errorMessage}</span><button className="button" onClick={() => void onRefresh()}>Оновити</button></div></div> : filteredPeople.length === 0 ? <div className="data-table__scroll"><div className="personnel-state"><Users /><b>{totalCount === 0 ? "Особовий склад порожній" : "Записів не знайдено"}</b><span>{totalCount === 0 ? "Додайте першого військовослужбовця." : "Змініть пошук або фільтри."}</span></div></div> : <PersonnelTable people={filteredPeople} visibleColumns={visibleCoreColumns} selectedId={selectedId} onSelect={(id) => setSelectedId((current) => current === id ? null : id)} onEdit={setEditingPerson} onDelete={setDeletingPerson} onScroll={onTableScroll} footer={isLoadingMore && <div className="infinite-loading">Завантаження наступних 20 записів…</div>} />}<div className="pagination">Показано {filteredPeople.length} із {totalCount}</div></section>{selectedPerson && <aside className="panel person-details entity-details person-details--personnel"><div className="entity-details__header"><button className="close" aria-label="Закрити деталі" onClick={() => setSelectedId(null)}><X /></button><h2>Деталі військовослужбовця</h2><div className="identity"><div className="avatar">{selectedPerson.givenName.slice(0, 1)}{selectedPerson.surname.slice(0, 1)}</div><div><b>{selectedPerson.fullName}</b><p>{selectedPerson.rank} · {selectedPerson.coreFields?.callsign || "без позивного"}</p></div></div><nav className="person-detail-tabs" aria-label="Групи даних військовослужбовця">{personDetailTabs.map((tab) => <button key={tab} className={detailTab === tab ? "active" : ""} onClick={() => setDetailTab(tab)}>{tab}</button>)}</nav></div><div className="entity-details__body">{detailTab === "Майно" ? <div className="person-assets">{!hasPersonAssets && <div className="person-assets__empty"><PackageOpen /><span>За людиною майно не закріплене.</span></div>}{selectedPerson.assignedVehicleName && <article><header><Car /><b>Автомобіль</b></header><div><span>Назва автомобіля</span><b>{selectedPerson.assignedVehicleName}</b></div><div><span>Номер автомобіля</span><b>{selectedPerson.assignedVehicleRegistration || "—"}</b></div></article>}{equipmentCategories.map((category) => { const items = personEquipment.filter((item) => item.category === category); return items.length ? <article key={category}><header><PackageOpen /><b>{equipmentCategoryLabels[category]}</b></header>{items.map((item) => <div key={item.id}><span>{item.name}</span><b>{[item.inventoryNumber, `${item.totalQuantity} шт`, item.status].filter(Boolean).join(" · ")}</b></div>)}</article> : null; })}</div> : <div className="person-details__fields">{detailRows.length ? detailRows.map((field) => <div className="person-detail" key={field.key}><span>{field.label}</span><b>{field.value || "—"}</b></div>) : <div className="person-detail-empty">У цій групі дані ще не заповнені.</div>}</div>}</div><div className="detail-buttons entity-details__actions"><button className="button" onClick={() => setEditingPerson(selectedPerson)}><Pencil />Редагувати</button><button className="button danger" onClick={() => setDeletingPerson(selectedPerson)}><Trash2 />Видалити</button></div></aside>}</div>{filtersOpen && <Modal title="Фільтр і видимість колонок" onClose={() => setFiltersOpen(false)} className="personnel-filter-modal"><div className="personnel-filter-modal__body"><section><h3>Відбір записів</h3><div className="personnel-filter-modal__controls"><Select ariaLabel="Фільтр за званням" value={rank} onChange={setRank} options={[{ value: "all", label: "Усі звання" }, ...ranks.map((item) => ({ value: item, label: item }))]} /><Select ariaLabel="Фільтр за освітою" value={education} onChange={setEducation} options={[{ value: "all", label: "Уся освіта" }, ...educationLevels.map((item) => ({ value: item, label: item }))]} /></div></section><section><div className="personnel-filter-modal__section-title"><h3>Колонки в таблиці</h3><button className="button" onClick={() => { setVisibleCoreColumns([]); void settingsService.updateVisiblePersonnelColumns([]); }}>Показати всі</button></div><p>Позначте дані, які потрібно бачити в таблиці. Вибір збережеться.</p><div className="personnel-filter-modal__columns">{[...baseColumns, ...personnelCoreFields.filter(([key]) => key !== "full_name")].map(([key, label]) => <label key={key}><input type="checkbox" checked={visibleCoreColumns.length === 0 || visibleCoreColumns.includes(key)} onChange={() => toggleCoreColumn(key)} /><span>{label}</span></label>)}{customColumns.map((key) => <label key={`custom:${key}`}><input type="checkbox" checked={visibleCoreColumns.length === 0 || visibleCoreColumns.includes(`custom:${key}`)} onChange={() => toggleCoreColumn(`custom:${key}`)} /><span>{key}</span></label>)}</div></section></div><footer className="modal-actions"><button className="button" onClick={resetFilters}><RefreshCw />Скинути фільтри</button><button className="button primary" onClick={() => setFiltersOpen(false)}>Готово</button></footer></Modal>}{editingPerson && <Modal title={editingPerson === "new" ? "Новий військовослужбовець" : `Редагування: ${editingPerson.fullName}`} onClose={() => setEditingPerson(null)} className="personnel-editor"><PersonnelForm initialValue={editingPerson === "new" ? emptyPersonnelDraft : toDraft(editingPerson)} submitLabel={editingPerson === "new" ? "Додати" : "Зберегти зміни"} onSubmit={savePerson} onCancel={() => setEditingPerson(null)} /></Modal>}{deletingPerson && <ConfirmDialog title="Видалити запис?" message={`Військовослужбовець «${deletingPerson.fullName}» буде видалений із бази даних. Цю дію не можна скасувати.`} confirmLabel="Видалити" onConfirm={() => void confirmDelete()} onCancel={() => setDeletingPerson(null)} busy={isDeleting} />}</PageFrame>;
}
