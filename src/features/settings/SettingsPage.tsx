import { Archive, Download, FileSpreadsheet, FolderOpen, Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Modal } from "../../shared/ui/Modal";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { personnelService } from "../../shared/services/personnelService";
import { useAppSettings } from "./hooks/useAppSettings";
import { settingsService } from "./services/settingsService";
import type { SignerRole, SignerSettings } from "../../shared/types/domain";

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

export function SettingsPage() {
  const { settings, errorMessage, isSaving, updateSigner, addSigner, deleteSigner } = useAppSettings();
  const { notify } = useNotifications();
  const [exportOpen, setExportOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [editor, setEditor] = useState<SignerRole | "new" | null>(null);
  const [deleting, setDeleting] = useState<SignerRole | null>(null);
  const [options, setOptions] = useState({ database: true, settings: true, customVariables: true, templates: true, reports: false });
  useEffect(() => { if (errorMessage) notify(errorMessage, "error"); }, [errorMessage, notify]);
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
  return <PageFrame header={<PageTitle title="Налаштування" subtitle="Підписанти, Excel-база та перенесення даних" />} className="settings-page">
    <section className="settings-content">
      <section className="panel settings-panel signers">
        <header className="settings-section-title"><Users /><div><h2>Підписанти</h2><p>Ролі й дані, доступні у шаблонах.</p></div><button className="button primary" onClick={() => setEditor("new")}><Plus />Додати підписанта</button></header>
        {settings ? <div className="signers-table-wrap"><table className="signers-table"><thead><tr><th>Роль</th><th>ПІБ</th><th>Звання</th><th>Посада</th><th>Дії</th></tr></thead><tbody>{(settings.signerRoles?.length ? settings.signerRoles : legacyRoles(settings)).map((role) => <tr key={role.id}><td><b>{role.name}</b><code>{`{{${role.id}_піб}}`}</code></td><td>{role.signer.fullName || "—"}</td><td>{role.signer.rank || "—"}</td><td>{role.signer.position || "—"}</td><td><div className="table-actions"><button className="button icon-only" aria-label={`Редагувати ${role.name}`} onClick={() => setEditor(role)}><Pencil /></button>{role.id !== "основний_підписант" && <button className="button icon-only danger" aria-label={`Видалити ${role.name}`} onClick={() => setDeleting(role)}><Trash2 /></button>}</div></td></tr>)}</tbody></table></div> : <p>Завантаження налаштувань…</p>}
      </section>
      <aside className="panel settings-actions"><button className="button" onClick={() => void settingsService.openApplicationDirectory()}><FolderOpen />Відкрити директорію</button><button className="button" onClick={() => void createBackup()}><Archive />Резервна копія БД</button><button className="button" onClick={() => setExcelOpen(true)}><FileSpreadsheet />Імпорт Excel-бази</button><button className="button" onClick={() => void exportExcel()}><FileSpreadsheet />Експорт Excel-бази</button><button className="button" onClick={() => setExportOpen(true)}><Download />Експортувати всі дані</button><button className="button" onClick={() => void importArchive()}><Upload />Імпортувати архів даних</button></aside>
    </section>
    {editor && <SignerEditor role={editor} onClose={() => setEditor(null)} onSave={saveSigner} busy={isSaving} />}
    {deleting && <ConfirmDialog title="Видалити підписанта?" message={`Підписант «${deleting.name}» і змінні з префіксом {{${deleting.id}_…}} стануть недоступними.`} confirmLabel="Видалити" onConfirm={() => void removeSigner()} onCancel={() => setDeleting(null)} busy={isSaving} />}
    {excelOpen && <Modal title="Імпорт Excel-бази" onClose={() => setExcelOpen(false)} className="personnel-import-modal"><div className="personnel-import-modal__body"><p>Оберіть, як застосувати дані з локального Excel-файлу.</p><div className="personnel-import-options"><button className="personnel-import-option" onClick={() => void importExcel("append")}><b>Доповнити базу даних</b><span>Додати записи з файлу до наявних. Існуючі записи не видаляються.</span></button><button className="personnel-import-option personnel-import-option--danger" onClick={() => void importExcel("replace")}><b>Замінити базу даних</b><span>Очистити особовий склад і автомобілі, а потім завантажити записи з файлу.</span></button></div></div></Modal>}
    {exportOpen && <Modal title="Експорт усіх даних" onClose={() => setExportOpen(false)}><p>Оберіть складові архіву.</p>{Object.entries({ database: "База даних", settings: "Налаштування", customVariables: "Кастомні поля", templates: "Шаблони", reports: "Згенеровані рапорти" }).map(([key, label]) => <label key={key}><input type="checkbox" checked={options[key as keyof typeof options]} onChange={() => setOptions((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))} /> {label}</label>)}<footer className="modal-actions"><button className="button" onClick={() => setExportOpen(false)}>Скасувати</button><button className="button primary" onClick={() => void exportArchive()}>Створити архів</button></footer></Modal>}
  </PageFrame>;
}
