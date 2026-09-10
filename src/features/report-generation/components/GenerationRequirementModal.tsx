import type { SelectionRequirement } from "../../../shared/template-language/registry";
import { CheckBox } from "../../../shared/ui/CheckBox";
import { Modal } from "../../../shared/ui/Modal";
import type { RequirementItem } from "../types";

type Props = {
  requirement: SelectionRequirement;
  items: RequirementItem[];
  columns: string[];
  selected: number[];
  onToggle: (id: number) => void;
  onClose: () => void;
};

export function GenerationRequirementModal({ requirement, items, columns, selected, onToggle, onClose }: Props) {
  return <Modal title={requirement.label} subtitle={`Оберіть рівно ${requirement.count}. Зайві записи обрати неможливо.`} onClose={onClose} className="generation-selection-modal">
    <div className="generation-selection-modal__body"><table><thead><tr><th></th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{items.map((item) => { const checked = selected.includes(item.id); return <tr key={item.id} className={checked ? "selected-row" : ""} onClick={() => onToggle(item.id)}><td onClick={(event) => event.stopPropagation()}><CheckBox checked={checked} onChange={() => onToggle(item.id)} /></td>{item.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>; })}</tbody></table></div>
    <footer className="modal-actions"><span>Обрано: <b className="green">{selected.length}/{requirement.count}</b></span><button className="button primary" disabled={selected.length !== requirement.count} onClick={onClose}>Готово</button></footer>
  </Modal>;
}
