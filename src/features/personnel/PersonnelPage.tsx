import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Download, Pencil, RefreshCw, Upload, UserPlus, Users, X } from "lucide-react";
import type { Person } from "../../shared/types/domain";
import { CheckBox } from "../../shared/ui/CheckBox";
import { FilterButton } from "../../shared/ui/FilterButton";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { Stat } from "../../shared/ui/Stat";
import { includesSearch } from "../../shared/utils/search";

export function PersonnelPage({ people }: { people: Person[] }) {
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(people[0] ?? null);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rank, setRank] = useState("all");
  const [education, setEducation] = useState("all");
  const ranks = useMemo(() => [...new Set(people.map((person) => person.rank))], [people]);
  const educationLevels = useMemo(() => [...new Set(people.map((person) => person.educationLevel))], [people]);
  const filteredPeople = people.filter((person) => (rank === "all" || person.rank === rank) && (education === "all" || person.educationLevel === education) && includesSearch(query, person.fullName, person.taxId, person.position, person.rank));
  const resetFilters = () => { setQuery(""); setRank("all"); setEducation("all"); };
  const tools = <><div className="table-tools main-tools"><SearchInput placeholder="Пошук за ПІБ, ІПН або посадою…" value={query} onChange={setQuery} /><FilterButton active={filtersOpen} onClick={() => setFiltersOpen((current) => !current)} label="Додаткові фільтри" /></div>{filtersOpen && <div className="filter-bar functional-filter-bar"><Select ariaLabel="Фільтр за званням" value={rank} onChange={setRank} options={[{ value: "all", label: "Усі звання" }, ...ranks.map((item) => ({ value: item, label: item }))]} /><Select ariaLabel="Фільтр за освітою" value={education} onChange={setEducation} options={[{ value: "all", label: "Уся освіта" }, ...educationLevels.map((item) => ({ value: item, label: item }))]} /><button className="reset" aria-label="Скинути фільтри" title="Скинути фільтри" onClick={resetFilters}><RefreshCw />Скинути фільтри</button></div>}</>;
  return <PageFrame header={<PageTitle title="Особовий склад" subtitle="Облік та керування даними військовослужбовців" actions={<><button className="button primary"><UserPlus />Додати військовослужбовця</button><button className="button"><Upload />Імпорт</button><button className="button"><Download />Експорт</button></>} />} tools={tools} footer={<div className="statbar"><Stat icon={Users} label="Усього військовослужбовців" value={people.length} /><Stat icon={CheckCircle2} label="Повні дані" value={people.length} tone="green" /><Stat icon={CalendarDays} label="Оновлено сьогодні" value="0" /></div>} className="personnel-page"><div className={`people-layout ${selectedPerson ? "with-details" : ""}`}><section className="panel data-table"><div className="data-table__scroll"><table><thead><tr><th><CheckBox /></th><th>ПІБ</th><th>Звання</th><th>Посада</th><th>ІПН</th><th>Військовий квиток</th><th>Статус даних</th><th>Дії</th></tr></thead><tbody>{filteredPeople.map((person) => <tr key={person.id}><td><CheckBox /></td><td>{person.fullName}</td><td>{person.rank}</td><td>{person.position}</td><td>{person.taxId}</td><td>{person.militaryId}</td><td><span className="status-complete"><CheckCircle2 />Повні дані</span></td><td><button className="icon-button" aria-label={`Редагувати ${person.fullName}`} onClick={() => setSelectedPerson(person)}><Pencil /></button></td></tr>)}</tbody></table></div><div className="pagination">Показано {filteredPeople.length} із {people.length}</div></section>{selectedPerson && <aside className="panel person-details"><button className="close" onClick={() => setSelectedPerson(null)}><X /></button><h2>Деталі військовослужбовця</h2><div className="identity"><div className="avatar">{selectedPerson.givenName.slice(0, 1)}{selectedPerson.surname.slice(0, 1)}</div><div><b>{selectedPerson.fullName}</b><p>{selectedPerson.rank}</p><span className="status-complete"><CheckCircle2 />Повні дані</span></div></div><div className="tabs"><button className="tab-active">Основні дані</button><button>Служба й освіта</button></div>{[["Звання", selectedPerson.rank], ["Посада", selectedPerson.position], ["ІПН", selectedPerson.taxId], ["Дата народження", selectedPerson.birthDate], ["Освіта", selectedPerson.educationLevel], ["Військовий квиток", selectedPerson.militaryId], ["Автомобіль", `${selectedPerson.assignedVehicleName}, ${selectedPerson.assignedVehicleRegistration}`]].map(([label, value]) => <label className="field" key={label}>{label}<input value={value} readOnly /></label>)}</aside>}</div></PageFrame>;
}
