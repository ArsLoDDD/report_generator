import type { ReactNode } from "react";
import { CheckBox } from "../../../shared/ui/CheckBox";

type Props<T extends { id: number }> = {
  title: string;
  items: T[];
  selected: number[];
  onToggle: (id: number) => void;
  onAll: () => void;
  onClear: () => void;
  parametersButton: ReactNode;
  columns: string[];
  values: (item: T) => string[];
};

export function GenerationSelectionTable<T extends { id: number }>({ title, items, selected, onToggle, onAll, onClear, parametersButton, columns, values }: Props<T>) {
  return <div className="panel people-select"><h2>{title}</h2><div className="people-select__scroll"><table><thead><tr><th>№</th><th>Вибір</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{items.map((item) => { const itemValues = values(item); const checked = selected.includes(item.id); return <tr key={item.id} onClick={() => onToggle(item.id)} className={checked ? "selected-row" : ""}><td>{checked ? selected.indexOf(item.id) + 1 : "—"}</td><td onClick={(event) => event.stopPropagation()}><CheckBox label={`Обрати ${itemValues.join(" · ")}`} checked={checked} onChange={() => onToggle(item.id)} /></td>{itemValues.map((value, index) => <td key={index}>{value}</td>)}</tr>; })}</tbody></table></div><div className="selection-footer">Вибрано: <b className="green">{selected.length}</b><span />{parametersButton}<button className="button" onClick={onClear} disabled={!selected.length}>Очистити вибір</button><button className="button" onClick={onAll}>Обрати потрібну кількість</button></div></div>;
}
