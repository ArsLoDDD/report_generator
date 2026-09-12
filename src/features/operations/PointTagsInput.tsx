import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function PointTagsInput({ label, value, onChange }: { label: string; value: string[]; onChange: (points: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragPoint, setDragPoint] = useState({ x: 0, y: 0 });
  const draggedIndexRef = useRef<number | null>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const add = () => {
    const additions = draft.split(/[,;\n]+/u).map((point) => point.trim().toLocaleUpperCase("uk")).filter(Boolean);
    if (!additions.length) return;
    onChange([...new Set([...value, ...additions])]);
    setDraft("");
  };
  const swap = (to: number) => {
    const from = draggedIndexRef.current;
    if (from === null || from === to) return;
    const next = [...value];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };

  useEffect(() => {
    if (draggedIndex === null) return;
    const targetAt = (x: number, y: number) => {
      const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-flight-point-index]");
      if (!element || !tagsRef.current?.contains(element)) return null;
      const index = Number(element.dataset.flightPointIndex);
      return Number.isInteger(index) ? index : null;
    };
    const move = (event: PointerEvent) => {
      event.preventDefault();
      setDragPoint({ x: event.clientX, y: event.clientY });
      setDropIndex(targetAt(event.clientX, event.clientY));
    };
    const finish = (event: PointerEvent) => {
      const target = targetAt(event.clientX, event.clientY);
      if (target !== null) swap(target);
      draggedIndexRef.current = null;
      setDraggedIndex(null);
      setDropIndex(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [draggedIndex, value, onChange]);

  return <div className="form-field flight-point-field"><span>{label}</span><div className="flight-point-input"><input aria-label={label} value={draft} placeholder="Введіть населений пункт" onChange={(event) => setDraft(event.target.value)} onBlur={add} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(); } }} /><button type="button" className="icon-button" title="Додати населений пункт" onMouseDown={(event) => event.preventDefault()} onClick={add}><Plus /></button></div><div ref={tagsRef} className="flight-point-tags">{value.map((point, index) => <span key={point} data-flight-point-index={index} className={`${draggedIndex === index ? "is-dragging" : ""} ${dropIndex === index && draggedIndex !== index ? "is-drop-target" : ""}`} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); draggedIndexRef.current=index; setDraggedIndex(index); setDropIndex(index); setDragPoint({x:event.clientX,y:event.clientY}); }} title="Захопіть і перенесіть на інший населений пункт, щоб поміняти їх місцями">{point}<button type="button" aria-label={`Видалити ${point}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => onChange(value.filter((item) => item !== point))}><X /></button></span>)}{!value.length && <small>Населені пункти ще не додані</small>}</div>{draggedIndex !== null && <div className="flight-point-drag-preview" style={{left:dragPoint.x,top:dragPoint.y}}>{value[draggedIndex]}</div>}</div>;
}
