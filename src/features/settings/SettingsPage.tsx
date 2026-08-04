import { Archive, FolderOpen, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { SignerForm } from "./components/SignerForm";
import { useAppSettings } from "./hooks/useAppSettings";
import { settingsService } from "./services/settingsService";

export function SettingsPage() {
  const { settings, errorMessage, isSaving, updateSigner } = useAppSettings();
  const { notify } = useNotifications();
  const [isBackingUp, setIsBackingUp] = useState(false);
  useEffect(() => { if (errorMessage) notify(errorMessage, "error"); }, [errorMessage, notify]);
  const openDirectory = async () => { try { await settingsService.openApplicationDirectory(); } catch { notify("Не вдалося відкрити директорію програми.", "error"); } };
  const createBackup = async () => { setIsBackingUp(true); try { await settingsService.createDatabaseBackup(); notify("Резервну копію бази даних створено.", "success"); } catch { notify("Не вдалося створити резервну копію бази даних.", "error"); } finally { setIsBackingUp(false); } };
  return <PageFrame header={<PageTitle title="Налаштування" subtitle="Підписанти та резервне копіювання даних" />} className="settings-page"><section className="settings-content">{settings ? <section className="panel settings-panel signers"><header className="settings-section-title"><Users /><div><h2>Підписанти</h2><p>Їхні дані доступні у всіх шаблонах через службові змінні.</p></div></header><SignerForm number={1} role="main" title="Основний підписант" value={settings.mainSigner} isSaving={isSaving} onSave={updateSigner} /><SignerForm number={2} role="commander" title="Командир" value={settings.commander} isSaving={isSaving} onSave={updateSigner} /><SignerForm number={3} role="chief" title="Начальник штабу" value={settings.chief} isSaving={isSaving} onSave={updateSigner} /><SignerForm number={4} role="deputyPpp" title="Заступник командира з ППП" value={settings.deputyPpp} isSaving={isSaving} onSave={updateSigner} /><SignerForm number={5} role="deputyArmament" title="Заступник командира з Озброєння" value={settings.deputyArmament} isSaving={isSaving} onSave={updateSigner} /><SignerForm number={6} role="deputyRear" title="Заступник командира з Тилу" value={settings.deputyRear} isSaving={isSaving} onSave={updateSigner} /><SignerForm number={7} role="fuelChief" title="Начальник ПММ" value={settings.fuelChief} isSaving={isSaving} onSave={updateSigner} /></section> : <section className="panel settings-panel"><p>Завантаження налаштувань…</p></section>}<aside className="panel settings-actions"><button className="button" onClick={() => void openDirectory()}><FolderOpen />Відкрити директорію програми</button><button className="button" onClick={() => void createBackup()} disabled={isBackingUp}><Archive />{isBackingUp ? "Створення копії…" : "Створити резервну копію БД"}</button></aside></section></PageFrame>;
}
