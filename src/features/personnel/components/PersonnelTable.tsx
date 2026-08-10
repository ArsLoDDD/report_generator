import { CircleAlert, Pencil, Trash2 } from "lucide-react";
import type { Person } from "../../../shared/types/domain";
import { isPersonnelComplete } from "../utils/personnelCompleteness";
import { personnelCoreFields } from "../../../shared/constants/personnelCoreFields";

type PersonnelTableProps = {
  people: Person[];
  selectedId: number | null;
  onSelect: (personnelId: number) => void;
  onEdit: (person: Person) => void;
  onDelete: (person: Person) => void;
  visibleColumns?: string[];
};

const baseColumns = [
  ["rank", "Звання"], ["surname", "Прізвище"], ["givenName", "Ім’я"], ["patronymic", "По батькові"], ["position", "Посада"], ["taxId", "ІПН"], ["birthDate", "Дата народження"], ["educationLevel", "Формат освіти"], ["educationDetails", "Де отримана освіта"], ["armedForcesServiceStartDate", "У ЗСУ з"], ["positionAssignedDate", "Дата призначення"], ["positionAssignmentOrder", "Наказ про призначення"], ["militaryId", "Військовий квиток"], ["assignedVehicleName", "Автомобіль"], ["assignedVehicleRegistration", "Номер автомобіля"]
] as const;

export function PersonnelTable({ people, selectedId, onSelect, onEdit, onDelete, visibleColumns = [] }: PersonnelTableProps) {
  const customColumns = [...new Set(people.flatMap((person) => Object.keys(person.customFields ?? {})))];
  const visible = (key: string) => visibleColumns.length === 0 || visibleColumns.includes(key);
  const shownBaseColumns = baseColumns.filter(([key]) => visible(key));
  const coreColumns = personnelCoreFields.filter(([key]) => key !== "full_name" && visible(key));
  const shownCustomColumns = customColumns.filter((key) => visible(`custom:${key}`));
  const value = (person: Person, key: typeof baseColumns[number][0]) => person[key] || "—";
  return <table className="personnel-table"><thead><tr><th>№</th>{shownBaseColumns.map(([key, label]) => <th key={key}>{label}</th>)}{coreColumns.map(([key, label]) => <th key={key}>{label}</th>)}{shownCustomColumns.map((column) => <th key={column}>{column}</th>)}<th>Дії</th></tr></thead><tbody>{people.map((person) => {
    const complete = isPersonnelComplete(person);
    return <tr key={person.id} className={`${selectedId === person.id ? "selected-row " : ""}${complete ? "" : "incomplete-row"}`} onClick={() => onSelect(person.id)}><td><div className="personnel-id">{person.id}{!complete && <span className="personnel-incomplete-badge" title="Неповні дані"><CircleAlert /><span>Неповні дані</span></span>}</div></td>{shownBaseColumns.map(([key]) => <td key={key}>{value(person, key)}</td>)}{coreColumns.map(([key]) => <td key={key}>{person.coreFields?.[key] || "—"}</td>)}{shownCustomColumns.map((column) => <td key={column}>{person.customFields?.[column] || "—"}</td>)}<td className="personnel-table__actions"><button className="icon-button" aria-label={`Редагувати ${person.fullName}`} onClick={(event) => { event.stopPropagation(); onEdit(person); }}><Pencil /></button><button className="icon-button danger" aria-label={`Видалити ${person.fullName}`} onClick={(event) => { event.stopPropagation(); onDelete(person); }}><Trash2 /></button></td></tr>;
  })}</tbody></table>;
}
