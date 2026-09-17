import { Check } from "lucide-react";

export function CheckBox({ checked, onChange, label = "Обрати", disabled = false }: { checked?: boolean; onChange?: () => void; label?: string; disabled?: boolean }) {
  return <button type="button" role="checkbox" aria-checked={Boolean(checked)} aria-label={label} disabled={disabled} onClick={(event) => { event.stopPropagation(); onChange?.(); }} className={`check ${checked ? "checked" : ""}`}>{checked && <Check size={14} />}</button>;
}
