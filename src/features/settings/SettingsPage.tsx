import { open, save } from "@tauri-apps/plugin-dialog"
import { Archive, Building2, Download, FileSpreadsheet, FolderOpen, GripVertical, Pencil, Plus, Trash2, Upload, Users } from "lucide-react"
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { personnelService } from "../../shared/services/personnelService"
import type { SignerRole, SignerSettings, UnitSettings, UnitStructureNode } from "../../shared/types/domain"
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog"
import { Modal } from "../../shared/ui/Modal"
import { useNotifications } from "../../shared/ui/NotificationProvider"
import { PageFrame } from "../../shared/ui/PageFrame"
import { PageTitle } from "../../shared/ui/PageTitle"
import { Select } from "../../shared/ui/Select"
import { defaultUnitStructure, structureWithUnmappedPositions, usableUnitStructure } from "../../shared/unit-structure"
import { operationsService } from "../operations/services/operationsService"
import { useAppSettings } from "./hooks/useAppSettings"
import { settingsService } from "./services/settingsService"

const emptySigner: SignerSettings = { fullName: "", rank: "", position: "" };
const legacyRoles = (settings: { mainSigner: SignerSettings; commander: SignerSettings; chief: SignerSettings; deputyPpp: SignerSettings; deputyArmament: SignerSettings; deputyRear: SignerSettings; fuelChief: SignerSettings }): SignerRole[] => [
  ["основний_підписант", "Основний підписант", settings.mainSigner], ["командир", "Командир", settings.commander], ["начальник_штабу", "Начальник штабу", settings.chief], ["заступник_ппп", "Заступник командира з ППП", settings.deputyPpp], ["заступник_озброєння", "Заступник командира з озброєння", settings.deputyArmament], ["заступник_тилу", "Заступник командира з тилу", settings.deputyRear], ["начальник_пмм", "Начальник ПММ", settings.fuelChief]
].map(([id, name, signer]) => ({ id: id as string, name: name as string, signer: signer as SignerSettings }));

function SignerEditor({ role, onClose, onSave, busy }: { role: SignerRole | "new"; onClose: () => void; onSave: (name: string, signer: SignerSettings) => Promise<void>; busy: boolean }) {
  const [name, setName] = useState(role === "new" ? "" : role.name);
  const [signer, setSigner] = useState(role === "new" ? emptySigner : role.signer);
  const isNew = role === "new";
  const update = (key: keyof SignerSettings, value: string) => setSigner((current) => ({ ...current, [key]: value }));
  return <Modal title={isNew ? "Новий підписант" : `Редагування: ${role.name}`} onClose={onClose} className="signer-editor-modal">
    <div className="signer-editor-fields">
      <label>Назва ролі<input value={name} disabled={!isNew} onChange={(event) => setName(event.target.value)} placeholder="Наприклад: Черговий частини" /></label>
      {isNew && <small>З назви буде автоматично створено змінні, наприклад: {"{{черговий_частини_піб}}"}.</small>}
      <label>ПІБ<input value={signer.fullName} onChange={(event) => update("fullName", event.target.value)} /></label>
      <label>Звання<input value={signer.rank} onChange={(event) => update("rank", event.target.value)} /></label>
      <label>Посада<input value={signer.position} onChange={(event) => update("position", event.target.value)} /></label>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={() => void onSave(name, signer)}>{isNew ? "Додати підписанта" : "Зберегти зміни"}</button></footer>
  </Modal>;
}

function StructureEditor({ value, onChange }: { value: UnitStructureNode[]; onChange: (value: UnitStructureNode[]) => void }) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragPoint, setDragPoint] = useState({ x: 0, y: 0 });
  const dropTargetRef = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const roots = value.filter((item) => item.kind === "group" && item.parentId === null).sort((left, right) => left.order - right.order);
  const update = (id: string, patch: Partial<UnitStructureNode>) => onChange(value.map((item) => item.id === id ? { ...item, ...patch } : item));
  const remove = (id: string) => onChange(value.filter((item) => item.id !== id && item.parentId !== id));
  const add = (parentId: string | null, kind: UnitStructureNode["kind"], name: string) => onChange([...value, { id: `${kind}-${Date.now()}-${value.length}`, parentId, kind, name, order: value.filter((item) => item.parentId === parentId).length }]);
  const reorder = (sourceId: string | null, targetId: string) => {
    const finish = () => { setDraggedId(null); setDropTargetId(null); };
    if (!sourceId || sourceId === targetId) { finish(); return; }
    const dragged = value.find((item) => item.id === sourceId);
    const target = value.find((item) => item.id === targetId);
    if (!dragged || !target || dragged.parentId !== target.parentId || dragged.kind !== "position") { finish(); return; }
    const siblings = value.filter((item) => item.parentId === dragged.parentId && item.kind === "position").sort((left, right) => left.order - right.order);
    const from = siblings.findIndex((item) => item.id === sourceId);
    const to = siblings.findIndex((item) => item.id === targetId);
    siblings.splice(to, 0, siblings.splice(from, 1)[0]);
    onChange(value.map((item) => { const index = siblings.findIndex((sibling) => sibling.id === item.id); return index < 0 ? item : { ...item, order: index }; }));
    finish();
  };
  const startDrag = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggedId(id);
    setDropTargetId(id);
    dropTargetRef.current = id;
    setDragPoint({ x: event.clientX, y: event.clientY });
  };
  useEffect(() => {
    if (!draggedId) return;
    const targetAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-structure-position]")?.dataset.structurePosition ?? null;
    const move = (event: PointerEvent) => {
      event.preventDefault();
      setDragPoint({ x: event.clientX, y: event.clientY });
      const target = targetAt(event.clientX, event.clientY);
      dropTargetRef.current = target;
      setDropTargetId(target);
    };
    const finish = (event: PointerEvent) => {
      const target = targetAt(event.clientX, event.clientY) ?? dropTargetRef.current;
      if (target) reorder(draggedId, target);
      else { setDraggedId(null); setDropTargetId(null); }
      dropTargetRef.current = null;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); };
  }, [draggedId]);
  const draggedItem = value.find((item) => item.id === draggedId);
  return <section className="unit-structure-editor">
    <header><div><b>Структура підрозділу</b><span>Тягніть елемент за маркер ліворуч, щоб змінити порядок у своєму блоці.</span></div><button type="button" className="button" onClick={() => add(null, "group", "Новий блок")}><Plus />Блок</button></header>
    <div className="unit-structure-editor__scroll">{roots.map((root) => {
      const groups = value.filter((item) => item.kind === "group" && item.parentId === root.id).sort((left, right) => left.order - right.order);
      const directPositions = value.filter((item) => item.kind === "position" && item.parentId === root.id).sort((left, right) => left.order - right.order);
      const blocks = [{ id: root.id, name: root.name, positions: directPositions }, ...groups.map((group) => ({ id: group.id, name: group.name, positions: value.filter((item) => item.kind === "position" && item.parentId === group.id).sort((left, right) => left.order - right.order) }))];
      return <article key={root.id} className="unit-structure-root">
        <div className="unit-structure-root__title"><input value={root.name} onFocus={() => setEditingId(root.id)} onBlur={() => setEditingId(null)} className={editingId === root.id ? "is-editing" : ""} onChange={(event) => update(root.id, { name: event.target.value })} /><button type="button" className="button icon-only danger" aria-label={`Видалити блок ${root.name}`} onClick={() => remove(root.id)}><Trash2 /></button></div>
        {blocks.map((block) => <div className="unit-structure-block" key={block.id}>
          {block.id !== root.id && <div className="unit-structure-block__title"><input value={block.name} onFocus={() => setEditingId(block.id)} onBlur={() => setEditingId(null)} className={editingId === block.id ? "is-editing" : ""} onChange={(event) => update(block.id, { name: event.target.value })} /><button type="button" className="button icon-only danger" aria-label={`Видалити ${block.name}`} onClick={() => remove(block.id)}><Trash2 /></button></div>}
          <div className="unit-structure-positions">{block.positions.map((position) => <div key={position.id} data-structure-position={position.id} className={`unit-structure-position ${draggedId === position.id ? "is-dragging" : ""} ${dropTargetId === position.id && draggedId !== position.id ? "is-drop-target" : ""}`}><span className="unit-structure-position__handle" onPointerDown={(event)=>startDrag(event,position.id)} title="Перетягнути посаду"><GripVertical /></span><input value={position.name} onFocus={() => setEditingId(position.id)} onBlur={() => setEditingId(null)} className={editingId === position.id ? "is-editing" : ""} onChange={(event) => update(position.id, { name: event.target.value })} /><button type="button" className="button icon-only danger" aria-label={`Видалити ${position.name}`} onClick={() => remove(position.id)}><Trash2 /></button></div>)}</div>
          <button type="button" className="unit-structure-add" onClick={() => add(block.id, "position", "Нова посада")}><Plus />Додати посаду</button>
        </div>)}
        <div className="unit-structure-actions"><button type="button" className="button" onClick={() => add(root.id, "group", "Нове відділення")}><Plus />Підблок / відділення</button></div>
      </article>;
    })}</div>{draggedItem&&<div className="unit-structure-drag-preview" style={{left:dragPoint.x,top:dragPoint.y}}><GripVertical/><b>{draggedItem.name}</b></div>}
  </section>;
}

function UnitEditor({ initial, sourcePositions, onClose, onSave, busy }: { initial: UnitSettings; sourcePositions: string[]; onClose: () => void; onSave: (unit: UnitSettings) => Promise<void>; busy: boolean }) {
  const [unit, setUnit] = useState<UnitSettings>({ ...initial, structure: structureWithUnmappedPositions({ ...initial, structure: usableUnitStructure(initial) }, sourcePositions) });
  const changeKind = (kind: UnitSettings["kind"]) => setUnit((current) => ({ ...current, kind, structure: current.structure?.length ? current.structure : defaultUnitStructure(kind) }));
  return <Modal title="Параметри підрозділу" onClose={onClose} className="unit-editor-modal"><div className="operation-editor__body">
    <label className="form-field"><span>Тип підрозділу</span><Select ariaLabel="Тип підрозділу" value={unit.kind} onChange={(kind) => changeKind(kind as UnitSettings["kind"])} options={[{ value: "Рота", label: "Рота" }, { value: "Окремий взвод", label: "Окремий взвод" }, { value: "Інше", label: "Інше" }]} /></label>
    <label className="form-field"><span>Коротка назва</span><input autoFocus value={unit.shortName} onChange={(event) => setUnit((current) => ({ ...current, shortName: event.target.value }))} placeholder="РБАК" /></label>
    <label className="form-field"><span>Повна назва підрозділу</span><input value={unit.fullName ?? ""} onChange={(event) => setUnit((current) => ({ ...current, fullName: event.target.value }))} placeholder="Рота безпілотних авіаційних комплексів" /></label>
    <label className="form-field"><span>Номер військової частини</span><input value={unit.unitCode ?? ""} onChange={(event) => setUnit((current) => ({ ...current, unitCode: event.target.value.toUpperCase().replaceAll("A", "А") }))} placeholder="А0000" maxLength={5} /></label>
    <label className="form-field form-field--wide"><span>Чисельність за штатом</span><input type="number" min="0" value={unit.authorizedStrength || ""} onChange={(event) => setUnit((current) => ({ ...current, authorizedStrength: Number(event.target.value) || 0 }))} /></label>
    <StructureEditor value={unit.structure ?? []} onChange={(structure) => setUnit((current) => ({ ...current, structure }))} />
  </div><footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy} onClick={() => void onSave(unit)}>Зберегти</button></footer></Modal>;
}

export function SettingsPage() {
  const { settings, errorMessage, isSaving, updateSigner, addSigner, deleteSigner, updateUnit } = useAppSettings();
  const { notify } = useNotifications();
  const [exportOpen, setExportOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [editor, setEditor] = useState<SignerRole | "new" | null>(null);
  const [deleting, setDeleting] = useState<SignerRole | null>(null);
  const [unitEditor, setUnitEditor] = useState(false);
  const [sourcePositions, setSourcePositions] = useState<string[]>([]);
  const [options, setOptions] = useState({ database: true, settings: true, customVariables: true, templates: true, reports: false });
  useEffect(() => { if (errorMessage) notify(errorMessage, "error"); }, [errorMessage, notify]);
  useEffect(() => { void operationsService.listStaffingRecords().then((records) => setSourcePositions(records.map((record) => record.position))).catch(() => setSourcePositions([])); }, []);
  const createBackup = async () => { try { await settingsService.createDatabaseBackup(); notify("Резервну копію бази даних створено.", "success"); } catch { notify("Не вдалося створити резервну копію бази даних.", "error"); } };
  const importExcel = async (mode: "append" | "replace") => { try { const path = await open({ title: "Імпорт Excel-бази даних", filters: [{ name: "Таблиця Excel", extensions: ["xlsx"] }] }); if (!path || Array.isArray(path)) return; await personnelService.importExcel(path, mode); setExcelOpen(false); notify("Excel-базу імпортовано.", "success"); window.location.reload(); } catch (error) { notify(error instanceof Error ? error.message : "Не вдалося імпортувати Excel-базу даних.", "error"); } };
  const exportExcel = async () => { try { const path = await save({ title: "Експорт Excel-бази даних", defaultPath: "Excel-база.xlsx", filters: [{ name: "Таблиця Excel", extensions: ["xlsx"] }] }); if (!path) return; await personnelService.exportExcel(path.endsWith(".xlsx") ? path : `${path}.xlsx`); notify("Excel-базу експортовано.", "success"); } catch { notify("Не вдалося експортувати Excel-базу даних.", "error"); } };
  const importArchive = async () => { try { const path = await open({ title: "Імпорт архіву даних", filters: [{ name: "Архів перенесення", extensions: ["zip"] }] }); if (!path || Array.isArray(path)) return; await settingsService.importApplicationData(path); notify("Дані відновлено.", "success"); window.location.reload(); } catch { notify("Не вдалося імпортувати архів даних.", "error"); } };
  const exportArchive = async () => { try { const path = await save({ title: "Експорт усіх даних", defaultPath: "Шаблонізатор-перенесення.zip", filters: [{ name: "Архів перенесення", extensions: ["zip"] }] }); if (!path) return; await settingsService.exportApplicationData(path.endsWith(".zip") ? path : `${path}.zip`, options); setExportOpen(false); notify("Архів даних створено.", "success"); } catch { notify("Не вдалося створити архів даних.", "error"); } };
  const saveSigner = async (name: string, signer: SignerSettings) => {
    const ok = editor === "new" ? await addSigner(name, signer) : editor ? await updateSigner(editor.id, signer) : false;
    if (ok) { setEditor(null); notify(editor === "new" ? "Підписанта додано. Змінні вже доступні в конструкторі." : "Дані підписанта збережено.", "success"); }
  };
  const removeSigner = async () => { if (!deleting) return; if (await deleteSigner(deleting.id)) { setDeleting(null); notify("Підписанта та його змінні видалено.", "success"); } };
  const saveUnit = async (unit: UnitSettings) => { if (await updateUnit(unit)) { setUnitEditor(false); notify("Параметри підрозділу збережено.", "success"); } };
  return <PageFrame header={<PageTitle title="Налаштування" subtitle="Підписанти, Excel-база та перенесення даних" />} className="settings-page">
    <section className="settings-content">
      <section className="panel settings-panel unit-settings"><header className="settings-section-title"><Building2 /><div><h2>Підрозділ</h2><p>{settings?.unit?.kind ?? "Рота"} · {settings?.unit?.shortName || "Назву не вказано"} · {settings?.unit?.authorizedStrength || 0} за штатом</p></div><button className="button" onClick={() => setUnitEditor(true)}><Pencil />Налаштувати</button></header></section>
      <section className="panel settings-panel signers">
        <header className="settings-section-title"><Users /><div><h2>Підписанти</h2><p>Ролі й дані, доступні у шаблонах.</p></div><button className="button primary" onClick={() => setEditor("new")}><Plus />Додати підписанта</button></header>
        {settings ? <div className="signers-table-wrap"><table className="signers-table"><thead><tr><th>Роль</th><th>ПІБ</th><th>Звання</th><th>Посада</th><th>Дії</th></tr></thead><tbody>{(settings.signerRoles?.length ? settings.signerRoles : legacyRoles(settings)).map((role) => <tr key={role.id}><td><b>{role.name}</b><code>{`{{${role.id}_піб}}`}</code></td><td>{role.signer.fullName || "—"}</td><td>{role.signer.rank || "—"}</td><td>{role.signer.position || "—"}</td><td><div className="table-actions"><button className="button icon-only" aria-label={`Редагувати ${role.name}`} onClick={() => setEditor(role)}><Pencil /></button>{role.id !== "основний_підписант" && <button className="button icon-only danger" aria-label={`Видалити ${role.name}`} onClick={() => setDeleting(role)}><Trash2 /></button>}</div></td></tr>)}</tbody></table></div> : <p>Завантаження налаштувань…</p>}
      </section>
      <aside className="panel settings-actions"><button className="button" onClick={() => void settingsService.openApplicationDirectory()}><FolderOpen />Відкрити директорію</button><button className="button" onClick={() => void createBackup()}><Archive />Резервна копія БД</button><button className="button" onClick={() => setExcelOpen(true)}><FileSpreadsheet />Імпорт Excel-бази</button><button className="button" onClick={() => void exportExcel()}><FileSpreadsheet />Експорт Excel-бази</button><button className="button" onClick={() => setExportOpen(true)}><Download />Експортувати всі дані</button><button className="button" onClick={() => void importArchive()}><Upload />Імпортувати архів даних</button></aside>
    </section>
    {editor && <SignerEditor role={editor} onClose={() => setEditor(null)} onSave={saveSigner} busy={isSaving} />}
    {unitEditor && <UnitEditor initial={settings?.unit ?? { kind: "Рота", shortName: "", authorizedStrength: 0 }} sourcePositions={sourcePositions} onClose={() => setUnitEditor(false)} onSave={saveUnit} busy={isSaving} />}
    {deleting && <ConfirmDialog title="Видалити підписанта?" message={`Підписант «${deleting.name}» і змінні з префіксом {{${deleting.id}_…}} стануть недоступними.`} confirmLabel="Видалити" onConfirm={() => void removeSigner()} onCancel={() => setDeleting(null)} busy={isSaving} />}
    {excelOpen && <Modal title="Імпорт Excel-бази" onClose={() => setExcelOpen(false)} className="personnel-import-modal"><div className="personnel-import-modal__body"><p>Оберіть, як застосувати дані з локального Excel-файлу.</p><div className="personnel-import-options"><button className="personnel-import-option" onClick={() => void importExcel("append")}><b>Доповнити базу даних</b><span>Додати записи з файлу до наявних. Існуючі записи не видаляються.</span></button><button className="personnel-import-option personnel-import-option--danger" onClick={() => void importExcel("replace")}><b>Замінити базу даних</b><span>Очистити особовий склад і автомобілі, а потім завантажити записи з файлу.</span></button></div></div></Modal>}
    {exportOpen && <Modal title="Експорт усіх даних" onClose={() => setExportOpen(false)}><p>Оберіть складові архіву.</p>{Object.entries({ database: "База даних", settings: "Налаштування", customVariables: "Кастомні поля", templates: "Шаблони", reports: "Згенеровані рапорти" }).map(([key, label]) => <label key={key}><input type="checkbox" checked={options[key as keyof typeof options]} onChange={() => setOptions((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))} /> {label}</label>)}<footer className="modal-actions"><button className="button" onClick={() => setExportOpen(false)}>Скасувати</button><button className="button primary" onClick={() => void exportArchive()}>Створити архів</button></footer></Modal>}
  </PageFrame>;
}
