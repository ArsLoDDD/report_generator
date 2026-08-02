import { Check } from "lucide-react";

export function CheckBox({ checked, onChange }: { checked?: boolean; onChange?: () => void }) {
  return <button aria-label="Обрати" onClick={(event) => { event.stopPropagation(); onChange?.(); }} className={`check ${checked ? "checked" : ""}`}>{checked && <Check size={14} />}</button>;
}
