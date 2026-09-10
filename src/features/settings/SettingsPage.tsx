import { open, save } from "@tauri-apps/plugin-dialog"
import { Archive, Building2, ClipboardCopy, Download, FileSpreadsheet, FolderOpen, Pencil, Plus, Trash2, Upload, Users } from "lucide-react"
import { useEffect, useState } from "react"
import { personnelService } from "../../shared/services/personnelService"
import type { SignerRole, SignerSettings, UnitSettings } from "../../shared/types/domain"
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog"
import { Modal } from "../../shared/ui/Modal"
import { useNotifications } from "../../shared/ui/NotificationProvider"
import { PageFrame } from "../../shared/ui/PageFrame"
import { PageTitle } from "../../shared/ui/PageTitle"
import type { UnitStructureSource } from "../../shared/unit-structure"
import { operationsService } from "../operations/services/operationsService"
import { useAppSettings } from "./hooks/useAppSettings"
import { settingsService } from "./services/settingsService"
import { SignerEditorModal } from "./components/SignerEditorModal"
import { UnitEditorModal } from "./components/UnitEditorModal"

const legacyRoles = (settings: { mainSigner: SignerSettings; commander: SignerSettings; chief: SignerSettings; deputyPpp: SignerSettings; deputyArmament: SignerSettings; deputyRear: SignerSettings; fuelChief: SignerSettings }): SignerRole[] => [
  ["основний_підписант", "Основний підписант", settings.mainSigner], ["командир", "Командир", settings.commander], ["начальник_штабу", "Начальник штабу", settings.chief], ["заступник_ппп", "Заступник командира з ППП", settings.deputyPpp], ["заступник_озброєння", "Заступник командира з озброєння", settings.deputyArmament], ["заступник_тилу", "Заступник командира з тилу", settings.deputyRear], ["начальник_пмм", "Начальник ПММ", settings.fuelChief]
].map(([id, name, signer]) => ({ id: id as string, name: name as string, signer: signer as SignerSettings }));

export function SettingsPage() {
  const { settings, errorMessage, isSaving, updateSigner, addSigner, deleteSigner, updateUnit } = useAppSettings();
  const { notify } = useNotifications();
  const [exportOpen, setExportOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [excelImportError, setExcelImportError] = useState("");
  const [editor, setEditor] = useState<SignerRole | "new" | null>(null);
  const [deleting, setDeleting] = useState<SignerRole | null>(null);
  const [unitEditor, setUnitEditor] = useState(false);
  const [sourcePositions, setSourcePositions] = useState<UnitStructureSource[]>([]);
  const [options, setOptions] = useState({ database: true, settings: true, customVariables: true, templates: true, reports: false });
  useEffect(() => { if (errorMessage) notify(errorMessage, "error"); }, [errorMessage, notify]);
  useEffect(() => { void operationsService.listStaffingRecords().then((records) => setSourcePositions(records.map((record) => ({ position: record.position, slotId: record.staffSlotId })))).catch(() => setSourcePositions([])); }, []);
  const createBackup = async () => { try { await settingsService.createDatabaseBackup(); notify("Резервну копію бази даних створено.", "success"); } catch { notify("Не вдалося створити резервну копію бази даних.", "error"); } };
  const importExcel = async (mode: "append" | "replace") => { try { setExcelImportError(""); const path = await open({ title: "Імпорт Excel-бази даних", filters: [{ name: "Таблиця Excel", extensions: ["xlsx"] }] }); if (!path || Array.isArray(path)) return; await personnelService.importExcel(path, mode); setExcelOpen(false); notify("Excel-базу імпортовано.", "success"); window.location.reload(); } catch (error) { const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Не вдалося імпортувати Excel-базу даних."; console.error("Excel import failed", { mode, error }); setExcelImportError(message); notify(message, "error"); } };
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
    {editor && <SignerEditorModal role={editor} onClose={() => setEditor(null)} onSave={saveSigner} busy={isSaving} />}
    {unitEditor && <UnitEditorModal initial={settings?.unit ?? { kind: "Рота", shortName: "", authorizedStrength: 0 }} sourcePositions={sourcePositions} onClose={() => setUnitEditor(false)} onSave={saveUnit} busy={isSaving} />}
    {deleting && <ConfirmDialog title="Видалити підписанта?" message={`Підписант «${deleting.name}» і змінні з префіксом {{${deleting.id}_…}} стануть недоступними.`} confirmLabel="Видалити" onConfirm={() => void removeSigner()} onCancel={() => setDeleting(null)} busy={isSaving} />}
    {excelOpen && <Modal title="Імпорт Excel-бази" onClose={() => { setExcelOpen(false); setExcelImportError(""); }} className="personnel-import-modal"><div className="personnel-import-modal__body"><p>Оберіть, як застосувати дані з локального Excel-файлу.</p>{excelImportError && <div className="excel-import-error" role="alert"><b>Імпорт зупинено</b><span>{excelImportError}</span><button className="button" type="button" onClick={() => void navigator.clipboard.writeText(excelImportError).then(() => notify("Текст помилки скопійовано.", "success"))}><ClipboardCopy />Копіювати помилку</button></div>}<div className="personnel-import-options"><button className="personnel-import-option" onClick={() => void importExcel("append")}><b>Доповнити базу даних</b><span>Додати записи з файлу до наявних. Існуючі записи не видаляються.</span></button><button className="personnel-import-option personnel-import-option--danger" onClick={() => void importExcel("replace")}><b>Замінити базу даних</b><span>Очистити особовий склад і автомобілі, а потім завантажити записи з файлу.</span></button></div></div></Modal>}
    {exportOpen && <Modal title="Експорт усіх даних" onClose={() => setExportOpen(false)}><p>Оберіть складові архіву.</p>{Object.entries({ database: "База даних", settings: "Налаштування", customVariables: "Кастомні поля", templates: "Шаблони", reports: "Згенеровані рапорти" }).map(([key, label]) => <label key={key}><input type="checkbox" checked={options[key as keyof typeof options]} onChange={() => setOptions((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))} /> {label}</label>)}<footer className="modal-actions"><button className="button" onClick={() => setExportOpen(false)}>Скасувати</button><button className="button primary" onClick={() => void exportArchive()}>Створити архів</button></footer></Modal>}
  </PageFrame>;
}
