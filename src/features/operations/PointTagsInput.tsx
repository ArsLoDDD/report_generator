import { Plus, X } from "lucide-react";
import { useState } from "react";

export function PointTagsInput({ label, value, onChange }: { label: string; value: string[]; onChange: (points: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const additions = draft.split(/[,;\n]+/u).map((point) => point.trim().toLocaleUpperCase("uk")).filter(Boolean);
    if (!additions.length) return;
    onChange([...new Set([...value, ...additions])]);
    setDraft("");
  };
  return <div className="form-field flight-point-field"><span>{label}</span><div className="flight-point-input"><input aria-label={label} value={draft} placeholder="Введіть населений пункт" onChange={(event) => setDraft(event.target.value)} onBlur={add} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(); } }} /><button type="button" className="icon-button" title="Додати населений пункт" onMouseDown={(event) => event.preventDefault()} onClick={add}><Plus /></button></div><div className="flight-point-tags">{value.map((point) => <span key={point}>{point}<button type="button" aria-label={`Видалити ${point}`} onClick={() => onChange(value.filter((item) => item !== point))}><X /></button></span>)}{!value.length && <small>Населені пункти ще не додані</small>}</div></div>;
}
