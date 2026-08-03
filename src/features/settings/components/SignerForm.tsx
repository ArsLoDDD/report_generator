import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { SignerRole, SignerSettings } from "../../../shared/types/domain";
import { useNotifications } from "../../../shared/ui/NotificationProvider";

type Props = { number: number; role: SignerRole; title: string; value: SignerSettings; isSaving: boolean; onSave: (role: SignerRole, signer: SignerSettings) => Promise<boolean> };

/** One reusable form; only the main signer exposes a signature file field. */
export function SignerForm({ number, role, title, value, isSaving, onSave }: Props) {
  const [draft, setDraft] = useState(value);
  const { notify } = useNotifications();
  useEffect(() => { setDraft(value); }, [value]);
  const change = (field: keyof SignerSettings, fieldValue: string) => setDraft((current) => ({ ...current, [field]: fieldValue }));
  const submit = async () => { if (await onSave(role, draft)) notify("Дані підписанта збережено.", "success"); };
  return <article className="signer-card"><header><b>{number}. {title}</b>{role === "main" && <span className="status-pill ready">Єдиний підпис</span>}</header><div className="signer-fields"><label>ПІБ<input value={draft.fullName} onChange={(event) => change("fullName", event.target.value)} /></label><label>Звання<input value={draft.rank} onChange={(event) => change("rank", event.target.value)} /></label><label>Посада<input value={draft.position} onChange={(event) => change("position", event.target.value)} /></label>{role === "main" && <label>PNG-файл підпису<input value={draft.signatureFileName ?? "main.png"} onChange={(event) => change("signatureFileName", event.target.value)} /><small>Файл має бути у папці «Підписи». За замовчуванням — main.png.</small></label>}</div><footer><button className="button primary" onClick={() => void submit()} disabled={isSaving}><Save />{isSaving ? "Збереження…" : "Зберегти"}</button></footer></article>;
}
