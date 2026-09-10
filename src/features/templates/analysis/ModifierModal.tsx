import { modifierRegistry, tokenFor, type VariableDefinition } from "../../../shared/template-language/registry";
import { Modal } from "../../../shared/ui/Modal";
import type { SelectedTemplateToken } from "./analysisModel";

type Props = {
  target: SelectedTemplateToken;
  variable: VariableDefinition;
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  onApply: () => void;
};

export function ModifierModal({ target, variable, selected, onToggle, onClose, onApply }: Props) {
  return <Modal title={`Модифікатори: ${variable.name}`} onClose={onClose} className="analyser-modifier-modal"><p>Відмінок і регістр можна обрати лише по одному. Жирний шрифт і підкреслення можна комбінувати.</p><div className="analyser-modifier-groups">{(["case", "text", "style"] as const).map((group) => <section key={group}><h3>{group === "case" ? "Відмінок" : group === "text" ? "Регістр" : "Форматування"}</h3><div>{modifierRegistry.filter((modifier) => modifier.group === group).map((modifier) => { const unavailable = group === "case" && !variable.supportsCases; return <label key={modifier.id} className={unavailable ? "disabled" : ""}><input type={group === "case" || group === "text" ? "radio" : "checkbox"} name={group} disabled={unavailable} checked={selected.includes(modifier.id)} onChange={() => onToggle(modifier.id)} />{modifier.name}</label>; })}</div></section>)}</div><footer className="modal-actions"><code>{tokenFor(target.id, selected)}</code><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" onClick={onApply}>Вставити змінну</button></footer></Modal>;
}
