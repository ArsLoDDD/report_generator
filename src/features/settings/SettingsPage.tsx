import { Archive, FolderOpen, Users } from "lucide-react";
import { useState } from "react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { SignerForm } from "./components/SignerForm";
import { useAppSettings } from "./hooks/useAppSettings";
import { settingsService } from "./services/settingsService";

export function SettingsPage() {
  const { settings, errorMessage, isSaving, updateSigner } = useAppSettings();
  const [message, setMessage] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const openDirectory = async () => { try { await settingsService.openApplicationDirectory(); } catch { setMessage("Не вдалося відкрити робочу папку програми."); } };
  const createBackup = async () => { setIsBackingUp(true); setMessage(null); try { await settingsService.createDatabaseBackup(); setMessage("Резервну копію бази даних створено."); } catch { setMessage("Не вдалося створити резервну копію бази даних."); } finally { setIsBackingUp(false); } };
  return <PageFrame header={<PageTitle title="Налаштування" subtitle="Підписанти та резервне копіювання даних" />} className="settings-page"><section className="settings-content">{settings ? <section className="panel settings-panel signers"><header className="settings-section-title"><Users /><div><h2>Підписанти</h2><p>Їхні дані доступні у всіх шаблонах через службові змінні.</p></div></header><SignerForm number={1} role="main" title="Основний підписант" value={settings.mainSigner} isSaving={isSaving} onSave={updateSigner} /><SignerForm number={2} role="commander" title="Командир" value={settings.commander} isSaving={isSaving} onSave={updateSigner} /><SignerForm number={3} role="chief" title="Начальник штабу" value={settings.chief} isSaving={isSaving} onSave={updateSigner} />{errorMessage && <p className="generation-message error">{errorMessage}</p>}</section> : <section className="panel settings-panel"><p>Завантаження налаштувань…</p>{errorMessage && <p className="generation-message error">{errorMessage}</p>}</section>}<aside className="panel settings-actions"><div><FolderOpen /><h2>Дані програми</h2><p>Відкрити одну робочу папку з базою, шаблонами, підписами, рапортами та резервними копіями.</p></div><button className="button" onClick={() => void openDirectory()}><FolderOpen />Відкрити папку програми</button><div><Archive /><h2>Резервна копія</h2><p>Створює ZIP-копію поточної бази в папці «Резервні копії».</p></div><button className="button" onClick={() => void createBackup()} disabled={isBackingUp}><Archive />{isBackingUp ? "Створення…" : "Створити копію БД"}</button>{message && <p className={message.startsWith("Не вдалося") ? "generation-message error" : "generation-message success"}>{message}</p>}</aside></section></PageFrame>;
}
