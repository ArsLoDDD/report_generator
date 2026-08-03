import { Database, FolderCheck, Info, Users } from "lucide-react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { SignerForm } from "./components/SignerForm";
import { useAppSettings } from "./hooks/useAppSettings";

export function SettingsPage() {
  const { settings, errorMessage, isSaving, updateSigner } = useAppSettings();
  return <PageFrame header={<PageTitle title="Налаштування" subtitle="Підписанти та автоматична структура даних" />} className="settings-page"><section className="settings-content">{settings ? <section className="panel settings-panel signers"><header className="settings-section-title"><Users /><div><h2>Підписанти</h2><p>Їхні дані доступні у всіх шаблонах через службові змінні.</p></div></header><SignerForm number={1} role="main" title="Основний підписант" value={settings.mainSigner} isSaving={isSaving} onSave={updateSigner} /><SignerForm number={2} role="commander" title="Командир" value={settings.commander} isSaving={isSaving} onSave={updateSigner} /><SignerForm number={3} role="chief" title="Начальник штабу" value={settings.chief} isSaving={isSaving} onSave={updateSigner} />{errorMessage && <p className="generation-message error">{errorMessage}</p>}</section> : <section className="panel settings-panel"><p>Завантаження налаштувань…</p>{errorMessage && <p className="generation-message error">{errorMessage}</p>}</section>}<aside className="panel settings-storage"><FolderCheck /><div><h2>Файли програми</h2><p>Папки «Шаблони», «Підписи», «Згенеровані рапорти», «База даних» і «Резервні копії» створюються автоматично. Їхні шляхи не потрібно налаштовувати.</p></div><Info /><small>Підпис використовується лише для основного підписанта. Командир і начальник штабу додаються до документа тільки як текстові дані.</small><Database /></aside></section></PageFrame>;
}
