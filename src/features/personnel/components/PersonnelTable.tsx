import { CircleAlert, Pencil, Trash2 } from "lucide-react";
import type { Person } from "../../../shared/types/domain";
import { isPersonnelComplete } from "../utils/personnelCompleteness";

type PersonnelTableProps = {
  people: Person[];
  selectedId: number | null;
  onSelect: (personnelId: number) => void;
  onEdit: (person: Person) => void;
  onDelete: (person: Person) => void;
};

export function PersonnelTable({ people, selectedId, onSelect, onEdit, onDelete }: PersonnelTableProps) {
  const customColumns = [...new Set(people.flatMap((person) => Object.keys(person.customFields ?? {})))];
  return <table className="personnel-table"><thead><tr><th>№</th><th>Звання</th><th>Прізвище</th><th>Ім’я</th><th>По батькові</th><th>Посада</th><th>ІПН</th><th>Дата народження</th><th>Формат освіти</th><th>Де отримана освіта</th><th>У ЗСУ з</th><th>Дата призначення</th><th>Наказ про призначення</th><th>Військовий квиток</th><th>Автомобіль</th><th>Номер автомобіля</th>{customColumns.map((column) => <th key={column}>{column}</th>)}<th>Дії</th></tr></thead><tbody>{people.map((person) => {
    const complete = isPersonnelComplete(person);
    return <tr key={person.id} className={`${selectedId === person.id ? "selected-row " : ""}${complete ? "" : "incomplete-row"}`} onClick={() => onSelect(person.id)}><td><div className="personnel-id">{person.id}{!complete && <span className="personnel-incomplete-badge" title="Неповні дані"><CircleAlert /><span>Неповні дані</span></span>}</div></td><td>{person.rank}</td><td>{person.surname}</td><td>{person.givenName}</td><td>{person.patronymic || "—"}</td><td title={person.position}>{person.position}</td><td>{person.taxId}</td><td>{person.birthDate}</td><td>{person.educationLevel}</td><td title={person.educationDetails}>{person.educationDetails || "—"}</td><td>{person.armedForcesServiceStartDate || "—"}</td><td>{person.positionAssignedDate || "—"}</td><td>{person.positionAssignmentOrder || "—"}</td><td>{person.militaryId || "—"}</td><td>{person.assignedVehicleName || "—"}</td><td>{person.assignedVehicleRegistration || "—"}</td>{customColumns.map((column) => <td key={column}>{person.customFields?.[column] || "—"}</td>)}<td className="personnel-table__actions"><button className="icon-button" aria-label={`Редагувати ${person.fullName}`} onClick={(event) => { event.stopPropagation(); onEdit(person); }}><Pencil /></button><button className="icon-button danger" aria-label={`Видалити ${person.fullName}`} onClick={(event) => { event.stopPropagation(); onDelete(person); }}><Trash2 /></button></td></tr>;
  })}</tbody></table>;
}
