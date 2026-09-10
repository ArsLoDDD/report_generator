import { ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { UnitStructureNode } from "../../../shared/types/domain";

export function UnitStructureEditor({ value, onChange }: { value: UnitStructureNode[]; onChange: (value: UnitStructureNode[]) => void }) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragPoint, setDragPoint] = useState({ x: 0, y: 0 });
  const dropTargetRef = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set(value.filter((item) => item.kind === "group").map((item) => item.id)));
  const roots = value.filter((item) => item.kind === "group" && item.parentId === null).sort((left, right) => left.order - right.order);
  const update = (id: string, patch: Partial<UnitStructureNode>) => onChange(value.map((item) => item.id === id ? { ...item, ...patch } : item));
  const remove = (id: string) => {
    const removed = new Set([id]);
    let changed = true;
    while (changed) { changed = false; value.forEach((item) => { if (item.parentId && removed.has(item.parentId) && !removed.has(item.id)) { removed.add(item.id); changed = true; } }); }
    onChange(value.filter((item) => !removed.has(item.id)));
  };
  const add = (parentId: string | null, kind: UnitStructureNode["kind"], name: string) => onChange([...value, { id: `${kind}-${Date.now()}-${value.length}`, parentId, kind, name, order: value.filter((item) => item.parentId === parentId).length }]);
  const toggle = (id: string) => setCollapsedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const reorder = useCallback((sourceId: string | null, targetId: string) => {
    const finish = () => { setDraggedId(null); setDropTargetId(null); };
    if (!sourceId || sourceId === targetId) { finish(); return; }
    const dragged = value.find((item) => item.id === sourceId);
    const target = value.find((item) => item.id === targetId);
    if (!dragged || !target || dragged.parentId !== target.parentId || dragged.kind !== target.kind) { finish(); return; }
    const siblings = value.filter((item) => item.parentId === dragged.parentId && item.kind === dragged.kind).sort((left, right) => left.order - right.order);
    const from = siblings.findIndex((item) => item.id === sourceId);
    const to = siblings.findIndex((item) => item.id === targetId);
    siblings.splice(to, 0, siblings.splice(from, 1)[0]);
    onChange(value.map((item) => { const index = siblings.findIndex((sibling) => sibling.id === item.id); return index < 0 ? item : { ...item, order: index }; }));
    finish();
  }, [onChange, value]);
  const startDrag = (event: ReactPointerEvent<HTMLElement>, id: string) => { event.preventDefault(); event.stopPropagation(); setDraggedId(id); setDropTargetId(id); dropTargetRef.current = id; setDragPoint({ x: event.clientX, y: event.clientY }); };
  useEffect(() => {
    if (!draggedId) return;
    const targetAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-structure-node]")?.dataset.structureNode ?? null;
    const move = (event: PointerEvent) => { event.preventDefault(); setDragPoint({ x: event.clientX, y: event.clientY }); const target = targetAt(event.clientX, event.clientY); dropTargetRef.current = target; setDropTargetId(target); };
    const finish = (event: PointerEvent) => { const target = targetAt(event.clientX, event.clientY) ?? dropTargetRef.current; if (target) reorder(draggedId, target); else { setDraggedId(null); setDropTargetId(null); } dropTargetRef.current = null; };
    window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", finish, { once: true }); window.addEventListener("pointercancel", finish, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); };
  }, [draggedId, reorder]);
  const draggedItem = value.find((item) => item.id === draggedId);
  return <section className="unit-structure-editor">
    <header><div><b>Структура підрозділу</b><span>Згортайте блоки стрілкою. Тягніть маркер ліворуч, щоб змінювати порядок блоків або посад у них.</span></div><button type="button" className="button" onClick={() => add(null, "group", "Новий блок")}><Plus />Блок</button></header>
    <div className="unit-structure-editor__scroll">{roots.map((root) => {
      const groups = value.filter((item) => item.kind === "group" && item.parentId === root.id).sort((left, right) => left.order - right.order);
      const directPositions = value.filter((item) => item.kind === "position" && item.parentId === root.id).sort((left, right) => left.order - right.order);
      const blocks = [{ id: root.id, name: root.name, positions: directPositions }, ...groups.map((group) => ({ id: group.id, name: group.name, positions: value.filter((item) => item.kind === "position" && item.parentId === group.id).sort((left, right) => left.order - right.order) }))];
      const rootCollapsed = collapsedIds.has(root.id);
      return <article key={root.id} data-structure-node={root.id} className={`unit-structure-root ${draggedId === root.id ? "is-dragging" : ""} ${dropTargetId === root.id && draggedId !== root.id ? "is-drop-target" : ""}`}>
        <div className="unit-structure-root__title"><button type="button" className="unit-structure-collapse" aria-label={`${rootCollapsed ? "Розгорнути" : "Згорнути"} ${root.name}`} onClick={() => toggle(root.id)}>{rootCollapsed ? <ChevronRight /> : <ChevronDown />}</button><span className="unit-structure-position__handle" onPointerDown={(event) => startDrag(event, root.id)} title="Перетягнути блок"><GripVertical /></span><input value={root.name} onFocus={() => setEditingId(root.id)} onBlur={() => setEditingId(null)} className={editingId === root.id ? "is-editing" : ""} onChange={(event) => update(root.id, { name: event.target.value })} /><button type="button" className="button icon-only danger" aria-label={`Видалити блок ${root.name}`} onClick={() => remove(root.id)}><Trash2 /></button></div>
        {!rootCollapsed && <>{blocks.map((block) => { const blockCollapsed = collapsedIds.has(block.id); return <div data-structure-node={block.id} className={`unit-structure-block ${block.id !== root.id && draggedId === block.id ? "is-dragging" : ""} ${block.id !== root.id && dropTargetId === block.id && draggedId !== block.id ? "is-drop-target" : ""}`} key={block.id}>
          {block.id !== root.id && <div className="unit-structure-block__title"><button type="button" className="unit-structure-collapse" aria-label={`${blockCollapsed ? "Розгорнути" : "Згорнути"} ${block.name}`} onClick={() => toggle(block.id)}>{blockCollapsed ? <ChevronRight /> : <ChevronDown />}</button><span className="unit-structure-position__handle" onPointerDown={(event) => startDrag(event, block.id)} title="Перетягнути блок"><GripVertical /></span><input value={block.name} onFocus={() => setEditingId(block.id)} onBlur={() => setEditingId(null)} className={editingId === block.id ? "is-editing" : ""} onChange={(event) => update(block.id, { name: event.target.value })} /><button type="button" className="button icon-only danger" aria-label={`Видалити ${block.name}`} onClick={() => remove(block.id)}><Trash2 /></button></div>}
          {!blockCollapsed && <><div className="unit-structure-positions">{block.positions.map((position) => <div key={position.id} data-structure-node={position.id} className={`unit-structure-position ${draggedId === position.id ? "is-dragging" : ""} ${dropTargetId === position.id && draggedId !== position.id ? "is-drop-target" : ""}`}><span className="unit-structure-position__handle" onPointerDown={(event) => startDrag(event, position.id)} title="Перетягнути посаду"><GripVertical /></span><input value={position.name} onFocus={() => setEditingId(position.id)} onBlur={() => setEditingId(null)} className={editingId === position.id ? "is-editing" : ""} onChange={(event) => update(position.id, { name: event.target.value })} /><button type="button" className="button icon-only danger" aria-label={`Видалити ${position.name}`} onClick={() => remove(position.id)}><Trash2 /></button></div>)}</div><button type="button" className="unit-structure-add" onClick={() => add(block.id, "position", "Нова посада")}><Plus />Додати посаду</button></>}
        </div>; })}<div className="unit-structure-actions"><button type="button" className="button" onClick={() => add(root.id, "group", "Нове відділення")}><Plus />Підблок / відділення</button></div></>}
      </article>;
    })}</div>{draggedItem && <div className="unit-structure-drag-preview" style={{ left: dragPoint.x, top: dragPoint.y }}><GripVertical /><b>{draggedItem.name}</b></div>}
  </section>;
}

