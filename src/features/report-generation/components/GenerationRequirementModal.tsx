import type { SelectionRequirement } from "../../../shared/template-language/registry";
import { CheckBox } from "../../../shared/ui/CheckBox";
import { Modal } from "../../../shared/ui/Modal";
import type { RequirementItem } from "../types";
import { ArrowDown, ArrowUp } from "lucide-react";

type Props = {
  requirement: SelectionRequirement;
  items: RequirementItem[];
  columns: string[];
  selected: number[];
  onToggle: (id: number) => void;
  onMove?: (id: number, direction: -1 | 1) => void;
  onClose: () => void;
};

export function GenerationRequirementModal({ requirement, items, columns, selected, onToggle, onMove, onClose }: Props) {
  return <Modal title={requirement.label} subtitle={`Оберіть рівно ${requirement.count}. Зайві записи обрати неможливо.`} onClose={onClose} className="generation-selection-modal">
    <div className="generation-selection-modal__body"><table><thead><tr><th>№</th><th>Вибір</th>{columns.map((column) => <th key={column}>{column}</th>)}<th>Порядок</th></tr></thead><tbody>{items.map((item) => { const checked = selected.includes(item.id); const order = selected.indexOf(item.id); return <tr key={item.id} className={checked ? "selected-row" : ""} onClick={() => onToggle(item.id)}><td>{checked ? order + 1 : "—"}</td><td onClick={(event) => event.stopPropagation()}><CheckBox label={`Обрати ${item.summary}`} checked={checked} onChange={() => onToggle(item.id)} /></td>{item.cells.map((cell, index) => <td key={index}>{cell}</td>)}<td onClick={(event) => event.stopPropagation()}>{checked && selected.length > 1 && <span className="generation-order-controls"><button type="button" className="icon-button" aria-label={`Перемістити ${item.summary} вище`} disabled={order === 0} onClick={() => onMove?.(item.id, -1)}><ArrowUp /></button><button type="button" className="icon-button" aria-label={`Перемістити ${item.summary} нижче`} disabled={order === selected.length - 1} onClick={() => onMove?.(item.id, 1)}><ArrowDown /></button></span>}</td></tr>; })}</tbody></table></div>
    <footer className="modal-actions"><span>Обрано: <b className="green">{selected.length}/{requirement.count}</b></span><button className="button primary" disabled={selected.length !== requirement.count} onClick={onClose}>Готово</button></footer>
  </Modal>;
}
