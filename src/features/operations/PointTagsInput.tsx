import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";

export function PointTagsInput({ label, value, onChange }: { label: string; value: string[]; onChange: (points: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const add = () => {
    const additions = draft.split(/[,;\n]+/u).map((point) => point.trim().toLocaleUpperCase("uk")).filter(Boolean);
    if (!additions.length) return;
    onChange([...new Set([...value, ...additions])]);
    setDraft("");
  };
  const move = (to: number) => {
    const from = draggedIndexRef.current;
    if (from === null || from === to) return;
    const next = [...value];
    const [point] = next.splice(from, 1);
    next.splice(to, 0, point);
    draggedIndexRef.current = to;
    setDraggedIndex(to);
    onChange(next);
  };
  return <div className="form-field flight-point-field"><span>{label}</span><div className="flight-point-input"><input aria-label={label} value={draft} placeholder="Введіть населений пункт" onChange={(event) => setDraft(event.target.value)} onBlur={add} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(); } }} /><button type="button" className="icon-button" title="Додати населений пункт" onMouseDown={(event) => event.preventDefault()} onClick={add}><Plus /></button></div><div className="flight-point-tags">{value.map((point, index) => <span key={point} draggable className={draggedIndex === index ? "is-dragging" : ""} onDragStart={(event) => { draggedIndexRef.current=index; setDraggedIndex(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", point); }} onDragEnter={(event) => { event.preventDefault(); move(index); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => event.preventDefault()} onDragEnd={() => { draggedIndexRef.current=null; setDraggedIndex(null); }} title="Перетягніть, щоб змінити порядок">{point}<button type="button" draggable={false} aria-label={`Видалити ${point}`} onClick={() => onChange(value.filter((item) => item !== point))}><X /></button></span>)}{!value.length && <small>Населені пункти ще не додані</small>}</div></div>;
}
