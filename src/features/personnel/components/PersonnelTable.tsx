import { CircleAlert, Pencil, Trash2 } from "lucide-react";
import type { Person } from "../../../shared/types/domain";
import { isPersonnelComplete } from "../utils/personnelCompleteness";
import { personnelCoreFields } from "../../../shared/constants/personnelCoreFields";
import { EntityTable, type EntityTableColumn } from "../../../shared/ui/data-table/EntityTable";
import type { ReactNode, UIEventHandler } from "react";

type PersonnelTableProps = {
  people: Person[];
  selectedId: number | null;
  onSelect: (personnelId: number) => void;
  onEdit: (person: Person) => void;
  onDelete: (person: Person) => void;
  visibleColumns?: string[];
  onScroll?: UIEventHandler<HTMLDivElement>;
  footer?: ReactNode;
};

const baseColumns = [
  ["rank", "Звання"], ["surname", "Прізвище"], ["givenName", "Ім’я"], ["patronymic", "По батькові"], ["position", "Посада"], ["taxId", "ІПН"], ["birthDate", "Дата народження"], ["educationLevel", "Формат освіти"], ["educationDetails", "Де отримана освіта"], ["armedForcesServiceStartDate", "У ЗСУ з"], ["positionAssignedDate", "Дата призначення"], ["positionAssignmentOrder", "Наказ про призначення"], ["militaryId", "Військовий квиток"], ["assignedVehicleName", "Автомобіль"], ["assignedVehicleRegistration", "Номер автомобіля"]
] as const;

export function PersonnelTable({ people, selectedId, onSelect, onEdit, onDelete, visibleColumns = [], onScroll, footer }: PersonnelTableProps) {
  const customColumns = [...new Set(people.flatMap((person) => Object.keys(person.customFields ?? {})))];
  const visible = (key: string) => visibleColumns.length === 0 || visibleColumns.includes(key);
  const shownBaseColumns = baseColumns.filter(([key]) => visible(key));
  const coreColumns = personnelCoreFields.filter(([key]) => key !== "full_name" && visible(key));
  const shownCustomColumns = customColumns.filter((key) => visible(`custom:${key}`));
  const value = (person: Person, key: typeof baseColumns[number][0]) => person[key] || "—";
  const columns: EntityTableColumn<Person>[] = [
    { key: "id", title: "№", render: (person) => {
      const complete = isPersonnelComplete(person);
      return <div className="personnel-id">{person.id}{!complete && <span className="personnel-incomplete-badge" title="Неповні дані"><CircleAlert /><span>Неповні дані</span></span>}</div>;
    } },
    ...shownBaseColumns.map(([key, label]) => ({ key, title: label, render: (person: Person) => value(person, key) })),
    ...coreColumns.map(([key, label]) => ({ key, title: label, render: (person: Person) => person.coreFields?.[key] || "—" })),
    ...shownCustomColumns.map((column) => ({ key: `custom:${column}`, title: column, render: (person: Person) => person.customFields?.[column] || "—" })),
    { key: "actions", title: "Дії", className: "personnel-table__actions", render: (person) => <><button className="icon-button" aria-label={`Редагувати ${person.fullName}`} onClick={(event) => { event.stopPropagation(); onEdit(person); }}><Pencil /></button><button className="icon-button danger" aria-label={`Видалити ${person.fullName}`} onClick={(event) => { event.stopPropagation(); onDelete(person); }}><Trash2 /></button></> },
  ];
  return <EntityTable className="personnel-table" items={people} columns={columns} rowKey={(person) => person.id} selectedKey={selectedId} onSelect={(person) => onSelect(person.id)} rowClassName={(person) => isPersonnelComplete(person) ? "" : "incomplete-row"} onScroll={onScroll} footer={footer} />;
}
