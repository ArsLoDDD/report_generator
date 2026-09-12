import { Plus, X } from "lucide-react";
import { useState } from "react";

export function PointTagsInput({ label, value, onChange }: { label: string; value: string[]; onChange: (points: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const add = () => {
    const additions = draft.split(/[,;\n]+/u).map((point) => point.trim().toLocaleUpperCase("uk")).filter(Boolean);
    if (!additions.length) return;
    onChange([...new Set([...value, ...additions])]);
    setDraft("");
  };
  const move = (to: number) => {
    if (draggedIndex === null || draggedIndex === to) return;
    const next = [...value];
    const [point] = next.splice(draggedIndex, 1);
    next.splice(to, 0, point);
    setDraggedIndex(to);
    onChange(next);
  };
  return <div className="form-field flight-point-field"><span>{label}</span><div className="flight-point-input"><input aria-label={label} value={draft} placeholder="Введіть населений пункт" onChange={(event) => setDraft(event.target.value)} onBlur={add} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(); } }} /><button type="button" className="icon-button" title="Додати населений пункт" onMouseDown={(event) => event.preventDefault()} onClick={add}><Plus /></button></div><div className="flight-point-tags">{value.map((point, index) => <span key={point} draggable className={draggedIndex === index ? "is-dragging" : ""} onDragStart={(event) => { setDraggedIndex(index); event.dataTransfer.effectAllowed = "move"; }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; move(index); }} onDrop={(event) => event.preventDefault()} onDragEnd={() => setDraggedIndex(null)} title="Перетягніть, щоб змінити порядок">{point}<button type="button" draggable={false} aria-label={`Видалити ${point}`} onClick={() => onChange(value.filter((item) => item !== point))}><X /></button></span>)}{!value.length && <small>Населені пункти ще не додані</small>}</div></div>;
}
