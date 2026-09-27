import { BriefcaseBusiness, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { UnitStructureNode } from "../../../shared/types/domain";
import { Select, type SelectOption } from "../../../shared/ui/Select";

const shpkRankOptions: SelectOption[] = [
  { value: "", label: "Не вказано" },
  { value: "рекрут", label: "Рекрут" },
  { value: "солдат", label: "Солдат" },
  { value: "старший солдат", label: "Старший солдат" },
  { value: "молодший сержант", label: "Молодший сержант" },
  { value: "сержант", label: "Сержант" },
  { value: "старший сержант", label: "Старший сержант" },
  { value: "головний сержант", label: "Головний сержант" },
  { value: "штаб-сержант", label: "Штаб-сержант" },
  { value: "майстер-сержант", label: "Майстер-сержант" },
  { value: "старший майстер-сержант", label: "Старший майстер-сержант" },
  { value: "головний майстер-сержант", label: "Головний майстер-сержант" },
  { value: "молодший лейтенант", label: "Молодший лейтенант" },
  { value: "лейтенант", label: "Лейтенант" },
  { value: "старший лейтенант", label: "Старший лейтенант" },
  { value: "капітан", label: "Капітан" },
  { value: "майор", label: "Майор" },
  { value: "підполковник", label: "Підполковник" },
  { value: "полковник", label: "Полковник" },
];

const byOrder = (left: UnitStructureNode, right: UnitStructureNode) => left.order - right.order;

function descendantsOf(nodes: UnitStructureNode[], id: string) {
  const result = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach((node) => {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id);
        changed = true;
      }
    });
  }
  return result;
}

function orderedGroups(nodes: UnitStructureNode[]) {
  const groups = nodes.filter((item) => item.kind === "group");
  const result: Array<{ node: UnitStructureNode; depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => groups
    .filter((item) => item.parentId === parentId)
    .sort(byOrder)
    .forEach((node) => {
      result.push({ node, depth });
      visit(node.id, depth + 1);
    });
  visit(null, 0);
  return result;
}

export function UnitStructureEditor({ value, onChange }: { value: UnitStructureNode[]; onChange: (value: UnitStructureNode[]) => void }) {
  const groups = useMemo(() => orderedGroups(value), [value]);
  const [selectedGroupId, setSelectedGroupId] = useState(() => groups[0]?.node.id ?? "");
  const [selectedPositionId, setSelectedPositionId] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragPoint, setDragPoint] = useState({ x: 0, y: 0 });
  const dropTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!value.some((item) => item.kind === "group" && item.id === selectedGroupId)) {
      setSelectedGroupId(groups[0]?.node.id ?? "");
    }
  }, [groups, selectedGroupId, value]);

  const positions = value.filter((item) => item.kind === "position" && item.parentId === selectedGroupId).sort(byOrder);
  const selectedGroup = value.find((item) => item.id === selectedGroupId && item.kind === "group");
  const selectedPosition = value.find((item) => item.id === selectedPositionId && item.kind === "position");

  useEffect(() => {
    if (selectedPosition && selectedPosition.parentId !== selectedGroupId) setSelectedPositionId("");
  }, [selectedGroupId, selectedPosition]);

  const update = (id: string, patch: Partial<UnitStructureNode>) => onChange(value.map((item) => item.id === id ? { ...item, ...patch } : item));
  const addGroup = (parentId: string | null) => {
    const id = `group-${Date.now()}-${value.length}`;
    const next: UnitStructureNode = { id, parentId, kind: "group", name: parentId ? "Новий підрозділ" : "Новий блок", order: value.filter((item) => item.kind === "group" && item.parentId === parentId).length };
    onChange([...value, next]);
    setSelectedGroupId(id);
    setSelectedPositionId("");
  };
  const addPosition = () => {
    if (!selectedGroupId) return;
    const id = `position-${Date.now()}-${value.length}`;
    const next: UnitStructureNode = { id, parentId: selectedGroupId, kind: "position", name: "Нова посада", order: positions.length, rankRequirement: "", vos: "", tariffGrade: "" };
    onChange([...value, next]);
    setSelectedPositionId(id);
  };
  const removeGroup = (id: string) => {
    const removed = descendantsOf(value, id);
    const next = value.filter((item) => !removed.has(item.id));
    onChange(next);
    setSelectedGroupId(orderedGroups(next)[0]?.node.id ?? "");
    setSelectedPositionId("");
  };
  const removePosition = (id: string) => {
    onChange(value.filter((item) => item.id !== id));
    if (selectedPositionId === id) setSelectedPositionId("");
  };
  const reorder = useCallback((sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) return;
    const source = value.find((item) => item.id === sourceId);
    const target = value.find((item) => item.id === targetId);
    if (!source || !target || source.kind !== target.kind || source.parentId !== target.parentId) return;
    const siblings = value.filter((item) => item.kind === source.kind && item.parentId === source.parentId).sort(byOrder);
    const from = siblings.findIndex((item) => item.id === sourceId);
    const to = siblings.findIndex((item) => item.id === targetId);
    siblings.splice(to, 0, siblings.splice(from, 1)[0]);
    onChange(value.map((item) => {
      const index = siblings.findIndex((sibling) => sibling.id === item.id);
      return index < 0 ? item : { ...item, order: index };
    }));
  }, [onChange, value]);
  const startDrag = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggedId(id);
    setDropTargetId(id);
    dropTargetRef.current = id;
    setDragPoint({ x: event.clientX, y: event.clientY });
  };
  useEffect(() => {
    if (!draggedId) return undefined;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const findTarget = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-structure-node]");
      const targetId = element?.dataset.structureNode ?? null;
      const source = value.find((item) => item.id === draggedId);
      const target = value.find((item) => item.id === targetId);
      const validTarget = source && target && source.kind === target.kind && source.parentId === target.parentId ? target.id : null;
      dropTargetRef.current = validTarget;
      setDropTargetId(validTarget);
    };
    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      setDragPoint({ x: event.clientX, y: event.clientY });
      findTarget(event.clientX, event.clientY);
    };
    const finish = () => {
      const targetId = dropTargetRef.current;
      if (targetId) reorder(draggedId, targetId);
      dropTargetRef.current = null;
      setDraggedId(null);
      setDropTargetId(null);
    };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [draggedId, reorder, value]);

  const draggedItem = draggedId ? value.find((item) => item.id === draggedId) : undefined;
  const selectedRank = selectedPosition?.rankRequirement?.trim() ?? "";
  const rankOptions = selectedRank && !shpkRankOptions.some((option) => option.value === selectedRank)
    ? [shpkRankOptions[0], { value: selectedRank, label: `${selectedRank} (поточне значення)` }, ...shpkRankOptions.slice(1)]
    : shpkRankOptions;

  return <section className="structure-workspace">
    <section className="structure-column structure-groups">
      <header><div><b>Скелет підрозділу</b><small>Блоки та підрозділи</small></div><button type="button" className="button icon-only" title="Додати блок" onClick={() => addGroup(null)}><Plus /></button></header>
      <div className="structure-list">{groups.map(({ node, depth }) => <article
        key={node.id}
        data-structure-node={node.id}
        className={`${selectedGroupId === node.id ? "is-selected" : ""} ${draggedId === node.id ? "is-dragging" : ""} ${dropTargetId === node.id ? "is-drop-target" : ""}`}
        style={{ paddingLeft: `${12 + depth * 22}px` }}
        onClick={() => { setSelectedGroupId(node.id); setSelectedPositionId(""); }}
      >
        <span className="structure-drag-handle" title="Перетягнути блок" onPointerDown={(event) => startDrag(event, node.id)}><GripVertical /></span>
        {depth > 0 && <ChevronRight className="structure-depth-icon" />}
        <input aria-label="Назва блоку структури" value={node.name} onClick={(event) => event.stopPropagation()} onChange={(event) => update(node.id, { name: event.target.value })} />
        <button type="button" className="button icon-only danger" title="Видалити блок" onClick={(event) => { event.stopPropagation(); removeGroup(node.id); }}><Trash2 /></button>
      </article>)}{groups.length === 0 && <div className="structure-empty"><BriefcaseBusiness /><b>Скелет порожній</b><span>Додайте перший блок підрозділу.</span></div>}</div>
      <footer><button type="button" className="button" disabled={!selectedGroupId} onClick={() => addGroup(selectedGroupId)}><Plus />Підрозділ</button></footer>
    </section>

    <section className="structure-column structure-positions">
      <header><div><b>Посади</b><small>{selectedGroup?.name ?? "Оберіть блок"}</small></div><button type="button" className="button primary" disabled={!selectedGroupId} onClick={addPosition}><Plus />Додати посаду</button></header>
      <div className="structure-list">{positions.map((position) => <article
        key={position.id}
        data-structure-node={position.id}
        className={`${selectedPositionId === position.id ? "is-selected" : ""} ${draggedId === position.id ? "is-dragging" : ""} ${dropTargetId === position.id ? "is-drop-target" : ""}`}
        onClick={() => setSelectedPositionId(position.id)}
      >
        <span className="structure-drag-handle" title="Перетягнути посаду" onPointerDown={(event) => startDrag(event, position.id)}><GripVertical /></span>
        <span className="structure-position-copy"><b>{position.name}</b><small>{[position.rankRequirement, position.vos && `ВОС ${position.vos}`, position.tariffGrade && `${position.tariffGrade} т.р.`].filter(Boolean).join(" · ") || "Параметри не вказані"}</small></span>
        <button type="button" className="button icon-only danger" title="Видалити посаду" onClick={(event) => { event.stopPropagation(); removePosition(position.id); }}><Trash2 /></button>
      </article>)}{selectedGroupId && positions.length === 0 && <div className="structure-empty"><BriefcaseBusiness /><b>Посад ще немає</b><span>Додайте першу посаду до вибраного блоку.</span></div>}{!selectedGroupId && <div className="structure-empty"><BriefcaseBusiness /><b>Блок не обрано</b><span>Оберіть блок у лівій колонці.</span></div>}</div>
    </section>

    <section className="structure-column structure-inspector">
      <header><div><b>Інформація про посаду</b><small>Лише штатні параметри</small></div></header>
      {selectedPosition ? <div className="structure-inspector-fields">
        <label className="form-field"><span>Назва посади</span><textarea value={selectedPosition.name} onChange={(event) => update(selectedPosition.id, { name: event.target.value })} /></label>
        <label className="form-field"><span>ШПК</span><Select ariaLabel="ШПК посади" value={selectedRank} options={rankOptions} onChange={(rankRequirement) => update(selectedPosition.id, { rankRequirement })} /></label>
        <label className="form-field"><span>ВОС</span><input value={selectedPosition.vos ?? ""} onChange={(event) => update(selectedPosition.id, { vos: event.target.value })} /></label>
        <label className="form-field"><span>Тарифний розряд</span><input value={selectedPosition.tariffGrade ?? ""} onChange={(event) => update(selectedPosition.id, { tariffGrade: event.target.value })} /></label>
      </div> : <div className="structure-empty structure-empty--inspector"><BriefcaseBusiness /><b>Оберіть посаду</b><span>Тут з’являться назва, ШПК, ВОС і тарифний розряд.</span></div>}
    </section>
    {draggedItem && <div className="structure-drag-preview" style={{ left: dragPoint.x, top: dragPoint.y }}><GripVertical /><b>{draggedItem.name}</b></div>}
  </section>;
}
