import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { CommissionMember, CommissionTemplate, SignerRole } from "../../../shared/types/domain";
import { Modal } from "../../../shared/ui/Modal";
import { Select } from "../../../shared/ui/Select";

const newMember = (order: number): CommissionMember => ({ id: `member-${Date.now()}-${order}`, signerRoleId: "", order });
const normaliseVariable = (raw: string) => {
  const value = raw.toLocaleLowerCase("uk-UA").replace(/^комісія_?/u, "");
  const suffix = value.replace(/[^\p{L}\p{N}_]+/gu, "_").replace(/_+/g, "_").replace(/^_+/u, "");
  return `комісія_${suffix}`;
};
const validVariable = (value: string) => /^комісія_[\p{L}\p{N}]+(?:_[\p{L}\p{N}]+)*$/u.test(value);

export function CommissionEditorModal({ initial, signerRoles, onClose, onSave, busy }: {
  initial: CommissionTemplate | "new";
  signerRoles: SignerRole[];
  onClose: () => void;
  onSave: (commission: CommissionTemplate) => Promise<void>;
  busy: boolean;
}) {
  const [commission, setCommission] = useState<CommissionTemplate>(() => initial === "new"
    ? { id: "", name: "", variable: "комісія_", members: [newMember(0)] }
    : { ...initial, members: initial.members.map((member) => ({ ...member })) });
  const signerOptions = useMemo(() => [{ value: "", label: "Не призначено" }, ...signerRoles.map((role) => ({ value: role.id, label: `${role.name}${role.signer.fullName ? ` · ${role.signer.fullName}` : ""}` }))], [signerRoles]);
  const updateMember = (id: string, patch: Partial<CommissionMember>) => setCommission((current) => ({ ...current, members: current.members.map((member) => member.id === id ? { ...member, ...patch } : member) }));
  const move = (index: number, direction: -1 | 1) => setCommission((current) => {
    const members = [...current.members];
    const target = index + direction;
    if (target < 0 || target >= members.length) return current;
    [members[index], members[target]] = [members[target], members[index]];
    return { ...current, members: members.map((member, order) => ({ ...member, order })) };
  });
  const remove = (id: string) => setCommission((current) => ({ ...current, members: current.members.filter((member) => member.id !== id).map((member, order) => ({ ...member, order })) }));
  return <Modal title={initial === "new" ? "Нова комісія" : `Редагування: ${initial.name}`} subtitle="Оберіть підписантів і їх порядок у комісії. Окремі ролі всередині комісії не потрібні." onClose={onClose} className="commission-editor-modal">
    <div className="commission-editor-body">
      <div className="commission-main-fields"><label className="form-field"><span>Назва комісії</span><input autoFocus value={commission.name} onChange={(event) => setCommission((current) => ({ ...current, name: event.target.value }))} placeholder="Наприклад: Комісія зі списання" /></label><label className="form-field commission-variable-field"><span>Назва змінної</span><input value={commission.variable} onChange={(event) => setCommission((current) => ({ ...current, variable: normaliseVariable(event.target.value) }))} placeholder="комісія_списання" /><small>Завжди починається з <code>комісія_</code>. Цю назву можна змінювати.</small></label></div>
      <section className="commission-members"><header><div><b>Склад комісії</b><small>Для кожного номера доступні: ПІБ, прізвище, ім’я, по батькові, звання та посада.</small></div><button type="button" className="button" onClick={() => setCommission((current) => ({ ...current, members: [...current.members, newMember(current.members.length)] }))}><Plus />Додати учасника</button></header>
        <div>{commission.members.map((member, index) => <article key={member.id}><span className="commission-member-order">{index + 1}</span><label className="form-field"><span>Підписант</span><Select ariaLabel={`Учасник комісії №${index + 1}`} value={member.signerRoleId} options={signerOptions} onChange={(signerRoleId) => updateMember(member.id, { signerRoleId })} /></label><code className="commission-member-variable">{`{{${commission.variable.replace(/_+$/u, "") || "комісія_…"}_${index + 1}_піб}}`}</code><div className="commission-member-actions"><button type="button" className="button icon-only" title="Вище" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></button><button type="button" className="button icon-only" title="Нижче" disabled={index === commission.members.length - 1} onClick={() => move(index, 1)}><ArrowDown /></button><button type="button" className="button icon-only danger" title="Видалити учасника" onClick={() => remove(member.id)}><Trash2 /></button></div></article>)}</div>
      </section>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={busy || !commission.name.trim() || !validVariable(commission.variable) || commission.members.length === 0} onClick={() => void onSave(commission)}>Зберегти комісію</button></footer>
  </Modal>;
}
