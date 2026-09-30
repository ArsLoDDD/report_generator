import { open, save } from "@tauri-apps/plugin-dialog";
import { Archive, BellRing, Braces, Check, ChevronDown, Database, Download, FileSpreadsheet, FileText, FlaskConical, FolderOpen, GitBranch, History, Pencil, Plus, Settings2, Trash2, Upload, UserRoundCheck, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ReleaseHistoryModal } from "../../app/components/ReleaseHistoryModal";
import type { CommissionTemplate, SignerRole, SignerSettings, UnitSettings, UnitStructureNode } from "../../shared/types/domain";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { SectionTabs } from "../../shared/ui/SectionTabs";
import { ServiceIcon } from "../../shared/ui/ServiceIcon";
import { structureWithUnmappedPositions, type UnitStructureSource } from "../../shared/unit-structure";
import { operationsService } from "../operations/services/operationsService";
import { CommissionEditorModal } from "./components/CommissionEditorModal";
import { DeadlineControlPanel } from "./components/DeadlineControlPanel";
import { DeveloperReminderPanel } from "./components/DeveloperReminderPanel";
import { SignerEditorModal } from "./components/SignerEditorModal";
import { UnitEditorModal } from "./components/UnitEditorModal";
import { UnitStructureEditor } from "./components/UnitStructureEditor";
import { useAppSettings } from "./hooks/useAppSettings";
import { settingsService, type DataArchiveInspection, type DataArchiveOptions, type DataImportOptions } from "./services/settingsService";

const legacyRoles = (settings: { mainSigner: SignerSettings; commander: SignerSettings; chief: SignerSettings; deputyPpp: SignerSettings; deputyArmament: SignerSettings; deputyRear: SignerSettings; fuelChief: SignerSettings }): SignerRole[] => [
  ["основний_підписант", "Основний підписант", settings.mainSigner], ["командир", "Командир", settings.commander], ["начальник_штабу", "Начальник штабу", settings.chief], ["заступник_ппп", "Заступник командира з ППП", settings.deputyPpp], ["заступник_озброєння", "Заступник командира з озброєння", settings.deputyArmament], ["заступник_тилу", "Заступник командира з тилу", settings.deputyRear], ["начальник_пмм", "Начальник ПММ", settings.fuelChief],
].map(([id, name, signer]) => ({ id: id as string, name: name as string, signer: signer as SignerSettings }));

const databaseGroups = [
  { title: "Підрозділ", items: [["personnel", "Особовий склад"], ["payments", "Виплати"], ["staffing", "Штат і рекомендаційні листи"], ["crews", "Екіпажі"], ["positions", "Позиції та роботи"], ["personnel_control", "Контроль особового складу"], ["deadlines", "Контроль строків"]] },
  { title: "Польоти й події", items: [["flight_plans", "Плани польотів"], ["flight_journal", "Журнал польотів"], ["summary_reports", "Підсумкові донесення"], ["incidents", "Інциденти"]] },
  { title: "Служби", items: [["zbbr", "ЗББР"], ["zu", "ЗУ"], ["gz_kb", "ГЗ та КБ"], ["siiz", "СІІЗ"], ["ms", "МС"], ["ets", "ЕТС"], ["ovtm", "ОВТМ"], ["rs", "РС"], ["sa_ppo", "СА та ППО"], ["svt", "СВТ"], ["pmm", "ПММ"], ["workshop", "Цукерня"]] },
] as const;

const databaseSections = databaseGroups.flatMap((group) => group.items.map(([key]) => key));
type FileOptionKey = "settings" | "customVariables" | "templates" | "reports" | "excel";
type FileOptions = Record<FileOptionKey, boolean>;
type TransferMode = "all" | "custom";
type SettingsTab = "unit" | "structure" | "signers" | "deadlines" | "data";
type SignersTab = "people" | "commissions";

const fileItems = [
  { key: "settings", label: "Налаштування", description: "Підрозділ, підписанти й параметри програми.", icon: Settings2 },
  { key: "customVariables", label: "Кастомні поля", description: "Створені поля та змінні для документів.", icon: Braces },
  { key: "templates", label: "Шаблони", description: "Власні DOCX-шаблони користувача.", icon: FileText },
  { key: "reports", label: "Згенеровані рапорти", description: "Готові документи; можуть збільшити архів.", icon: Archive },
  { key: "excel", label: "Excel-база", description: "Окрема таблиця Excel всередині архіву.", icon: FileSpreadsheet },
] as const;

const allFiles = (): FileOptions => ({ settings: true, customVariables: true, templates: true, reports: true, excel: true });
const errorText = (error: unknown, fallback: string) => typeof error === "string" ? error : error instanceof Error ? error.message : fallback;

function ModeSwitch({ value, onChange, importMode = false }: { value: TransferMode; onChange: (value: TransferMode) => void; importMode?: boolean }) {
  return <div className="data-transfer-mode" role="group" aria-label="Склад даних"><button className={value === "all" ? "is-active" : ""} type="button" onClick={() => onChange("all")}>{importMode ? "Увесь архів" : "Повний архів"}</button><button className={value === "custom" ? "is-active" : ""} type="button" onClick={() => onChange("custom")}>Вибрати склад даних</button></div>;
}

function DatabaseOptions({ selected, available, onToggle }: { selected: string[]; available?: Set<string>; onToggle: (section: string) => void }) {
  return <div className="data-transfer-groups">{databaseGroups.map((group) => <section className="data-transfer-group" key={group.title}><header><Database /><b>{group.title}</b></header><div>{group.items.map(([key, label]) => {
    const enabled = !available || available.has(key); const checked = selected.includes(key) && enabled;
    return <label className={`${checked ? "is-selected" : ""} ${enabled ? "" : "is-disabled"}`} key={key}><input type="checkbox" checked={checked} disabled={!enabled} onChange={() => onToggle(key)} /><span>{label}</span><i aria-hidden="true">{checked && <Check />}</i></label>;
  })}</div></section>)}</div>;
}

function FileOptionsGrid({ selected, available, includeExcel, onToggle }: { selected: FileOptions; available?: DataArchiveInspection; includeExcel: boolean; onToggle: (key: FileOptionKey) => void }) {
  return <section className="data-transfer-files"><header><FolderOpen /><b>Файли програми</b></header><div>{fileItems.filter((item) => includeExcel || item.key !== "excel").map(({ key, label, description, icon: Icon }) => {
    const enabled = available ? Boolean(available[key]) : true; const checked = selected[key] && enabled;
    return <label className={`${checked ? "is-selected" : ""} ${enabled ? "" : "is-disabled"}`} key={key}><input type="checkbox" checked={checked} disabled={!enabled} onChange={() => onToggle(key)} /><span className="data-export-option__icon"><Icon /></span><span><b>{label}</b><small>{enabled ? description : "Відсутнє в обраному архіві."}</small></span><i>{checked && <Check />}</i></label>;
  })}</div></section>;
}

export function SettingsPage() {
  const { settings, errorMessage, isSaving, updateSigner, addSigner, deleteSigner, updateUnit, saveCommission, deleteCommission } = useAppSettings();
  const { notify } = useNotifications();
  const [tab, setTab] = useState<SettingsTab>("unit");
  const [signersTab, setSignersTab] = useState<SignersTab>("people");
  const [editor, setEditor] = useState<SignerRole | "new" | null>(null);
  const [deleting, setDeleting] = useState<SignerRole | null>(null);
  const [commissionEditor, setCommissionEditor] = useState<CommissionTemplate | "new" | null>(null);
  const [deletingCommission, setDeletingCommission] = useState<CommissionTemplate | null>(null);
  const [unitEditor, setUnitEditor] = useState(false);
  const [sourcePositions, setSourcePositions] = useState<UnitStructureSource[]>([]);
  const [structureDraft, setStructureDraft] = useState<UnitStructureNode[] | null>(null);
  const [structureSaveState, setStructureSaveState] = useState<"idle" | "saving" | "saved" | "incomplete">("idle");
  const structureSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const structureRevision = useRef(0);
  const structureDirty = useRef(false);
  const structureSaveInFlight = useRef(false);
  const pendingStructureSave = useRef<{ revision: number; structure: UnitStructureNode[] } | null>(null);
  const unitRef = useRef<UnitSettings | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<TransferMode>("all");
  const [exportSections, setExportSections] = useState<string[]>([...databaseSections]);
  const [exportFiles, setExportFiles] = useState<FileOptions>(allFiles);
  const [importArchive, setImportArchive] = useState<{ path: string; inspection: DataArchiveInspection } | null>(null);
  const [importMode, setImportMode] = useState<TransferMode>("all");
  const [importSections, setImportSections] = useState<string[]>([]);
  const [importFiles, setImportFiles] = useState<FileOptions>(allFiles);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [developerPanelOpen, setDeveloperPanelOpen] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);

  useEffect(() => { if (errorMessage) notify(errorMessage, "error"); }, [errorMessage, notify]);
  useEffect(() => { void operationsService.listStaffingRecords().then((records) => setSourcePositions(records.map((record) => ({ position: record.position, slotId: record.staffSlotId })))).catch(() => setSourcePositions([])); }, []);
  useEffect(() => {
    if (!settings?.unit) return;
    unitRef.current = settings.unit;
    if (!structureDirty.current) setStructureDraft(structureWithUnmappedPositions(settings.unit, sourcePositions));
  }, [settings, sourcePositions]);
  useEffect(() => () => { if (structureSaveTimer.current) clearTimeout(structureSaveTimer.current); }, []);

  const signerRoles = useMemo(() => !settings ? [] : settings.signerRoles?.length ? settings.signerRoles : legacyRoles(settings), [settings]);
  const commissionTemplates = settings?.commissionTemplates ?? [];
  const structurePositionCount = structureDraft?.filter((item) => item.kind === "position").length ?? 0;
  const structureGroupCount = structureDraft?.filter((item) => item.kind === "group").length ?? 0;
  const runPendingStructureSave = async () => {
    if (structureSaveInFlight.current || !pendingStructureSave.current) return;
    const pending = pendingStructureSave.current;
    pendingStructureSave.current = null;
    const unit = unitRef.current;
    if (!unit) return;
    structureSaveInFlight.current = true;
    setStructureSaveState("saving");
    const ok = await updateUnit({ ...unit, structure: pending.structure });
    structureSaveInFlight.current = false;
    if (ok && pending.revision === structureRevision.current && !pendingStructureSave.current) {
      structureDirty.current = false;
      setStructureSaveState("saved");
    }
    if (pendingStructureSave.current) void runPendingStructureSave();
    else if (!ok) setStructureSaveState("idle");
  };
  const scheduleStructureSave = (structure: UnitStructureNode[]) => {
    setStructureDraft(structure);
    structureDirty.current = true;
    structureRevision.current += 1;
    const revision = structureRevision.current;
    if (structureSaveTimer.current) clearTimeout(structureSaveTimer.current);
    if (structure.some((item) => !item.name.trim())) {
      pendingStructureSave.current = null;
      setStructureSaveState("incomplete");
      return;
    }
    setStructureSaveState("idle");
    pendingStructureSave.current = { revision, structure };
    structureSaveTimer.current = setTimeout(() => void runPendingStructureSave(), 650);
  };

  const effectiveExportSections = exportMode === "all" ? [...databaseSections] : exportSections;
  const effectiveExportFiles = exportMode === "all" ? allFiles() : exportFiles;
  const exportCount = effectiveExportSections.length + Object.values(effectiveExportFiles).filter(Boolean).length;
  const availableImportSections = useMemo(() => new Set(importArchive?.inspection.databaseSections ?? []), [importArchive]);
  const effectiveImportSections = importMode === "all" ? [...availableImportSections] : importSections.filter((section) => availableImportSections.has(section));
  const effectiveImportFiles: FileOptions = importMode === "all" && importArchive ? { settings: importArchive.inspection.settings, customVariables: importArchive.inspection.customVariables, templates: importArchive.inspection.templates, reports: importArchive.inspection.reports, excel: false } : importFiles;
  const importCount = effectiveImportSections.length + (["settings", "customVariables", "templates", "reports"] as FileOptionKey[]).filter((key) => effectiveImportFiles[key]).length;
  const toggleDatabaseSection = (setter: Dispatch<SetStateAction<string[]>>, section: string) => setter((current) => {
    if (current.includes(section)) return section === "personnel" ? current.filter((item) => item !== "personnel" && item !== "payments") : current.filter((item) => item !== section);
    if (section === "payments") return [...new Set([...current, "personnel", "payments"])];
    return [...current, section];
  });
  const toggleFile = (setter: Dispatch<SetStateAction<FileOptions>>, key: FileOptionKey) => setter((current) => ({ ...current, [key]: !current[key] }));

  const chooseImportArchive = async () => {
    try {
      const path = await open({ title: "Імпорт архіву даних", filters: [{ name: "Архів перенесення", extensions: ["zip"] }] });
      if (!path || Array.isArray(path)) return;
      setTransferBusy(true);
      const inspection = await settingsService.inspectApplicationDataArchive(path);
      setImportArchive({ path, inspection }); setImportMode("all"); setImportSections([...inspection.databaseSections]);
      setImportFiles({ settings: inspection.settings, customVariables: inspection.customVariables, templates: inspection.templates, reports: inspection.reports, excel: false });
    } catch (error) { notify(errorText(error, "Не вдалося перевірити архів даних."), "error"); }
    finally { setTransferBusy(false); }
  };

  const exportData = async () => {
    try {
      const path = await save({ title: "Експорт даних", defaultPath: "Шаблонізатор-перенесення.zip", filters: [{ name: "Архів перенесення", extensions: ["zip"] }] });
      if (!path) return;
      setTransferBusy(true);
      const options: DataArchiveOptions = { database: effectiveExportSections.length > 0, databaseSections: effectiveExportSections, ...effectiveExportFiles };
      await settingsService.exportApplicationData(path.endsWith(".zip") ? path : `${path}.zip`, options);
      setExportOpen(false); notify("Архів даних створено.", "success");
    } catch (error) { notify(errorText(error, "Не вдалося створити архів даних."), "error"); }
    finally { setTransferBusy(false); }
  };

  const restoreData = async () => {
    if (!importArchive) return;
    try {
      setTransferBusy(true);
      const options: DataImportOptions = { database: effectiveImportSections.length > 0, databaseSections: effectiveImportSections, settings: effectiveImportFiles.settings, customVariables: effectiveImportFiles.customVariables, templates: effectiveImportFiles.templates, reports: effectiveImportFiles.reports };
      await settingsService.importApplicationData(importArchive.path, options);
      notify("Вибрані дані перевірено та імпортовано. Решту локальних даних збережено.", "success"); window.location.reload();
    } catch (error) { notify(errorText(error, "Не вдалося імпортувати архів даних."), "error"); }
    finally { setTransferBusy(false); }
  };

  const openDataDirectory = async () => { try { await settingsService.openApplicationDirectory(); } catch (error) { notify(errorText(error, "Не вдалося відкрити системну папку даних."), "error"); } };
  const saveSigner = async (name: string, signer: SignerSettings) => { const ok = editor === "new" ? await addSigner(name, signer) : editor ? await updateSigner(editor.id, signer) : false; if (ok) { setEditor(null); notify(editor === "new" ? "Підписанта додано. Змінні вже доступні в конструкторі." : "Дані підписанта збережено.", "success"); } };
  const removeSigner = async () => { if (!deleting) return; if (await deleteSigner(deleting.id)) { setDeleting(null); notify("Підписанта та його змінні видалено.", "success"); } };
  const saveUnit = async (unit: UnitSettings) => { if (await updateUnit({ ...unit, structure: structureDraft ?? unit.structure })) { setUnitEditor(false); notify("Параметри підрозділу збережено.", "success"); } };
  const saveCommissionTemplate = async (commission: CommissionTemplate) => { if (await saveCommission(commission)) { setCommissionEditor(null); notify("Комісію збережено.", "success"); } };
  const removeCommissionTemplate = async () => { if (!deletingCommission) return; if (await deleteCommission(deletingCommission.id)) { setDeletingCommission(null); notify("Комісію видалено.", "success"); } };

  return <PageFrame
    header={<PageTitle title="Налаштування" subtitle="Підрозділ, структура, підписанти, строки та локальні дані" />}
    tools={<div className="settings-tools-row"><SectionTabs
      ariaLabel="Розділи налаштувань"
      value={tab}
      onChange={setTab}
      tabs={[
        { id: "unit", label: "Підрозділ", icon: <ServiceIcon name="settings-unit" /> },
        { id: "structure", label: "Структура", icon: <GitBranch /> },
        { id: "signers", label: "Підписанти", icon: <ServiceIcon name="settings-signers" /> },
        { id: "deadlines", label: "Контроль строків", icon: <BellRing /> },
        { id: "data", label: "Дані", icon: <Database /> },
      ]}
    />{import.meta.env.DEV && <button type="button" className="button icon-only settings-developer-button" aria-label="Відкрити панель тестування" title="Панель тестування" onClick={() => setDeveloperPanelOpen(true)}><FlaskConical /></button>}</div>}
    className="settings-page"
  >
    {tab === "unit" && <section className="settings-tab-content settings-unit-tab">
      <section className="panel settings-overview-panel">
        <header><div><ServiceIcon name="settings-unit" /><span><b>Підрозділ</b><small>Основні реквізити, що використовуються у програмі та документах.</small></span></div><button className="button" onClick={() => setUnitEditor(true)}><Pencil />Налаштувати</button></header>
        <div className="settings-overview-grid">
          <article><small>Тип підрозділу</small><b>{settings?.unit?.kind ?? "—"}</b></article>
          <article><small>Коротка назва</small><b>{settings?.unit?.shortName || "—"}</b></article>
          <article className="is-wide"><small>Повна назва</small><b>{settings?.unit?.fullName || "—"}</b></article>
          <article><small>Військова частина</small><b>{settings?.unit?.unitCode || "—"}</b></article>
          <article><small>Чисельність за штатом</small><b>{settings?.unit?.authorizedStrength ?? 0}</b></article>
          <article><small>КСП</small><b>{settings?.unit?.kspName || "—"}</b></article>
          <article><small>Населений пункт КСП</small><b>{settings?.unit?.kspLocality || "—"}</b></article>
          <article className="is-wide"><small>Координати КСП</small><b>{settings?.unit?.kspMgrs || "—"}</b></article>
          <article><small>КСП входить в БРО</small><b>{settings?.unit?.kspInBro ? "Так" : "Ні"}</b></article>
        </div>
      </section>
    </section>}

    {tab === "structure" && <section className="settings-tab-content settings-structure-tab">
      <header className="settings-content-heading"><div><h2>Структура підрозділу</h2><p>{structureGroupCount} блоків · {structurePositionCount} посад</p></div><span className={`settings-autosave-state is-${structureSaveState}`}>{structureSaveState === "saving" ? "Збереження…" : structureSaveState === "saved" ? "Збережено" : structureSaveState === "incomplete" ? "Заповніть назву" : "Зміни зберігаються автоматично"}</span></header>
      {structureDraft ? <UnitStructureEditor value={structureDraft} onChange={scheduleStructureSave} /> : <section className="panel settings-loading">Завантаження структури…</section>}
    </section>}

    {tab === "signers" && <section className="settings-tab-content settings-signers-tab">
      <div className="settings-subnav-row"><nav className="entity-tabs" aria-label="Підписанти та комісії"><button type="button" className={signersTab === "people" ? "active" : ""} onClick={() => setSignersTab("people")}>Підписанти <b>{signerRoles.length}</b></button><button type="button" className={signersTab === "commissions" ? "active" : ""} onClick={() => setSignersTab("commissions")}>Комісії <b>{commissionTemplates.length}</b></button></nav><button className="button primary" onClick={() => signersTab === "people" ? setEditor("new") : setCommissionEditor("new")}><Plus />{signersTab === "people" ? "Додати підписанта" : "Додати комісію"}</button></div>
      {signersTab === "people" ? <section className="panel settings-table-panel"><div className="signers-table-wrap"><table className="signers-table"><thead><tr><th>Роль і змінна</th><th>ПІБ</th><th>Звання</th><th>Посада</th><th>Статус</th><th>Дії</th></tr></thead><tbody>{signerRoles.map((role) => {
        const ready = Boolean(role.signer.fullName && role.signer.rank && role.signer.position);
        return <tr key={role.id}><td><b>{role.name}</b><code>{`{{${role.id}_піб}}`}</code></td><td>{role.signer.fullName || "—"}</td><td>{role.signer.rank || "—"}</td><td>{role.signer.position || "—"}</td><td><span className={`status-pill ${ready ? "active" : "warning"}`}>{ready ? "Заповнено" : "Не заповнено"}</span></td><td><div className="table-actions"><button className="button icon-only" aria-label={`Редагувати ${role.name}`} onClick={() => setEditor(role)}><Pencil /></button>{role.id !== "основний_підписант" && <button className="button icon-only danger" aria-label={`Видалити ${role.name}`} onClick={() => setDeleting(role)}><Trash2 /></button>}</div></td></tr>;
      })}</tbody></table></div>{signerRoles.length === 0 && <div className="settings-empty-state"><Users /><b>Підписантів ще немає</b></div>}</section> : <section className="panel settings-table-panel"><div className="signers-table-wrap"><table className="signers-table commissions-table"><thead><tr><th>Комісія та змінна</th><th>Склад</th><th>Статус</th><th>Дії</th></tr></thead><tbody>{commissionTemplates.map((commission) => {
        const assigned = commission.members.filter((member) => signerRoles.some((role) => role.id === member.signerRoleId && Boolean(role.signer.fullName))).length;
        const ready = commission.members.length > 0 && assigned === commission.members.length;
        const memberNames = [...commission.members].sort((left, right) => left.order - right.order).map((member) => signerRoles.find((role) => role.id === member.signerRoleId)?.signer.fullName || "Не призначено");
        return <tr key={commission.id}><td><b>{commission.name}</b><code>{`{{${commission.variable}_1_піб}}`}</code></td><td>{memberNames.join(", ") || "—"}</td><td><span className={`status-pill ${ready ? "active" : "warning"}`}>{ready ? "Склад визначено" : `${assigned}/${commission.members.length} призначено`}</span></td><td><div className="table-actions"><button className="button icon-only" aria-label={`Редагувати ${commission.name}`} onClick={() => setCommissionEditor(commission)}><Pencil /></button><button className="button icon-only danger" aria-label={`Видалити ${commission.name}`} onClick={() => setDeletingCommission(commission)}><Trash2 /></button></div></td></tr>;
      })}</tbody></table></div>{commissionTemplates.length === 0 && <div className="settings-empty-state"><UserRoundCheck /><b>Комісій ще немає</b><span>Створіть комісію, задайте змінну та оберіть її учасників.</span></div>}</section>}
    </section>}

    {tab === "deadlines" && <DeadlineControlPanel />}

    {tab === "data" && <section className="settings-tab-content settings-data-tab"><div className="settings-data-grid">
      <button className="panel settings-data-card" onClick={() => void openDataDirectory()}><span><FolderOpen /></span><div><b>Системна папка</b><small>Відкрити директорію, де зберігаються поточні дані.</small></div></button>
      <button className="panel settings-data-card" onClick={() => setExportOpen(true)}><span><Download /></span><div><b>Експортувати дані</b><small>Створити повний архів або вибрати окремі розділи.</small></div></button>
      <button className="panel settings-data-card" disabled={transferBusy} onClick={() => void chooseImportArchive()}><span><Upload /></span><div><b>Імпортувати архів</b><small>Оновити тільки ті дані, які містяться у вибраному архіві.</small></div></button>
      <button className="panel settings-data-card" onClick={() => setHistoryOpen(true)}><span><History /></span><div><b>Історія версій</b><small>Переглянути зміни у попередніх оновленнях програми.</small></div></button>
    </div></section>}

    {editor && <SignerEditorModal role={editor} onClose={() => setEditor(null)} onSave={saveSigner} busy={isSaving} />}
    {commissionEditor && <CommissionEditorModal initial={commissionEditor} signerRoles={signerRoles} onClose={() => setCommissionEditor(null)} onSave={saveCommissionTemplate} busy={isSaving} />}
    {unitEditor && <UnitEditorModal initial={settings?.unit ?? { kind: "Рота", shortName: "", authorizedStrength: 0 }} onClose={() => setUnitEditor(false)} onSave={saveUnit} busy={isSaving} />}
    {deleting && <ConfirmDialog title="Видалити підписанта?" message={`Підписант «${deleting.name}» і змінні з префіксом {{${deleting.id}_…}} стануть недоступними. У комісіях його призначення буде очищене.`} confirmLabel="Видалити" onConfirm={() => void removeSigner()} onCancel={() => setDeleting(null)} busy={isSaving} />}
    {deletingCommission && <ConfirmDialog title="Видалити комісію?" message={`Комісію «${deletingCommission.name}» буде видалено з налаштувань.`} confirmLabel="Видалити" onConfirm={() => void removeCommissionTemplate()} onCancel={() => setDeletingCommission(null)} busy={isSaving} />}
    {historyOpen && <ReleaseHistoryModal onClose={() => setHistoryOpen(false)} />}
    {import.meta.env.DEV && developerPanelOpen && <DeveloperReminderPanel onClose={() => setDeveloperPanelOpen(false)} />}
    {exportOpen && <Modal title="Експорт даних" subtitle="Створіть один архів із повним або вибраним складом даних." className="data-export-modal data-transfer-modal" onClose={() => setExportOpen(false)}><div className="data-export-modal__body"><section className="data-export-summary"><span><Archive /></span><div><b>Склад архіву</b><small>Excel-база тепер експортується разом з іншими даними.</small></div><strong>{exportCount} вибрано</strong></section><ModeSwitch value={exportMode} onChange={setExportMode} />{exportMode === "custom" && <><DatabaseOptions selected={exportSections} onToggle={(section) => toggleDatabaseSection(setExportSections, section)} /><FileOptionsGrid selected={exportFiles} includeExcel onToggle={(key) => toggleFile(setExportFiles, key)} /></>}{exportMode === "all" && <p className="data-transfer-all"><Check />До архіву увійдуть усі розділи бази, налаштування, кастомні поля, шаблони, рапорти та Excel-база.</p>}<p className="data-export-hint">Експорт лише копіює дані — нічого в програмі не видаляється і не змінюється.</p></div><footer className="modal-actions"><span className="data-export-selected">Вибрано: <b>{exportCount}</b></span><button className="button" onClick={() => setExportOpen(false)}>Скасувати</button><button className="button primary" disabled={exportCount === 0 || transferBusy} onClick={() => void exportData()}><Archive />Створити архів</button></footer></Modal>}
    {importArchive && <Modal title="Імпорт даних" subtitle={`Архів створено у версії ${importArchive.inspection.applicationVersion}.`} className="data-export-modal data-transfer-modal" onClose={() => setImportArchive(null)}><div className="data-export-modal__body"><section className="data-export-summary"><span><Upload /></span><div><b>Безпечне відновлення</b><small>Перед змінами програма автоматично збереже резервну копію поточних даних.</small></div><strong>{importCount} вибрано</strong></section><ModeSwitch value={importMode} onChange={setImportMode} importMode />{importMode === "custom" && <><DatabaseOptions selected={importSections} available={availableImportSections} onToggle={(section) => toggleDatabaseSection(setImportSections, section)} /><FileOptionsGrid selected={importFiles} available={importArchive.inspection} includeExcel={false} onToggle={(key) => toggleFile(setImportFiles, key)} /></>}{importMode === "all" && <p className="data-transfer-all"><Check />Буде імпортовано весь підтримуваний вміст архіву. Excel-файл залишиться довідковою копією й не замінюватиме базу.</p>}<details className="data-transfer-details"><summary>Що станеться з іншими даними?<ChevronDown /></summary><p>Програма замінить тільки обрані розділи. Необрані локальні дані залишаться без змін, а посилання на відсутніх людей, екіпажі, позиції чи майно будуть безпечно пропущені.</p></details></div><footer className="modal-actions"><span className="data-export-selected">Вибрано: <b>{importCount}</b></span><button className="button" onClick={() => setImportArchive(null)}>Скасувати</button><button className="button primary" disabled={importCount === 0 || transferBusy} onClick={() => void restoreData()}><Upload />Імпортувати</button></footer></Modal>}
  </PageFrame>;
}
