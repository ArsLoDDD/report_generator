import { useState } from "react";
import { Check, Copy, KeyRound, ServerCog } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import type { AdminActivationCode, AdminApiMode, AdminServerSettings } from "./adminTypes";

export function IssuedCodeDialog({ code, mode, onClose }: { code: AdminActivationCode; mode: AdminApiMode; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!code.plainCode) return;
    await navigator.clipboard.writeText(code.plainCode);
    setCopied(true);
  };
  return <Modal title="Код активації створено" subtitle="Скопіюйте його зараз: після закриття повний код більше не показуватиметься." onClose={onClose} className="admin-code-modal">
    <div className="admin-code-modal__body">
      <div className="admin-code-modal__icon"><KeyRound /></div>
      <div><small>{code.kind === "primary" ? "Основний код" : "Резервний код"} · {code.label}</small><code>{code.plainCode ?? `•••••-${code.codeHint}`}</code></div>
      <button className="button" onClick={() => void copy()} disabled={!code.plainCode}>{copied ? <Check /> : <Copy />}{copied ? "Скопійовано" : "Копіювати"}</button>
      {mode === "local-demo" && <p className="admin-demo-warning">Це демонстраційний локальний код. Він перевіряє інтерфейс, але не активує клієнтський застосунок. Для робочих кодів підключіть сервер.</p>}
    </div>
    <footer className="modal-actions"><button className="button primary" onClick={onClose}>Готово</button></footer>
  </Modal>;
}

export function AdminServerDialog({ initial, onClose, onSave }: { initial: AdminServerSettings; onClose: () => void; onSave: (settings: AdminServerSettings) => void }) {
  const [settings, setSettings] = useState(initial);
  return <Modal title="Підключення до сервера" subtitle="Адреса має вести на Edge Function admin-api. Без неї застосунок працює як локальний макет." onClose={onClose} className="admin-server-modal">
    <div className="admin-server-modal__body">
      <div className="admin-server-modal__lead"><ServerCog /><div><b>API центру керування</b><span>Ключ адміністратора передається лише в заголовку X-Admin-Key.</span></div></div>
      <label className="form-field"><span>Базова адреса API</span><input autoFocus value={settings.baseUrl} onChange={(event) => setSettings((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://…supabase.co/functions/v1/admin-api" /></label>
      <label className="form-field"><span>Ключ адміністратора</span><input type="password" value={settings.adminApiKey} onChange={(event) => setSettings((current) => ({ ...current, adminApiKey: event.target.value }))} placeholder="Зберігається тільки на цьому комп'ютері" /></label>
      <p>Для робочої експлуатації краще замінити спільний ключ на окремі адмінські облікові записи. Клієнтські коди активації не є ключами адміністратора.</p>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" onClick={() => onSave(settings)}>Зберегти й перепідключити</button></footer>
  </Modal>;
}
