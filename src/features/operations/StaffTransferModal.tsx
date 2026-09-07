import { useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import { Select } from "../../shared/ui/Select";
import type { StaffingRecord } from "./types";
import { actingForSlot, projectedOccupants, transferConflicts, type ActingChange, type SlotTransfer, type StaffSlot } from "./staffing-slots";

export function StaffTransferModal({ records, slots, onClose, onSave }: { records: StaffingRecord[]; slots: StaffSlot[]; onClose: () => void; onSave: (moves: SlotTransfer[], acting: ActingChange[]) => Promise<void> }) {
  const [activeId, setActiveId] = useState("");
  const [moves, setMoves] = useState<SlotTransfer[]>([]);
  const [acting, setActing] = useState<ActingChange[]>([]);
  const [showFree, setShowFree] = useState(false);
  const [asActing, setAsActing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actingDecision, setActingDecision] = useState<{ slot: StaffSlot; person: StaffingRecord; incumbents: StaffingRecord[] } | null>(null);
  const active = records.find((person) => String(person.personnelId) === activeId);
  const conflicts = transferConflicts(slots, moves, records);
  const stageMove = (slot: StaffSlot, person: StaffingRecord) => {
    const occupants = projectedOccupants(slot, moves, records);
    setMoves((current) => [...current.filter((move) => move.personnelId !== person.personnelId), { personnelId: person.personnelId, position: slot.position, slotId: slot.id, expectedPosition: person.position, expectedOccupantIds: slot.occupants.map((item) => item.personnelId) }]);
    const displaced = occupants.find((item) => item.personnelId !== person.personnelId);
    if (displaced) setActiveId(String(displaced.personnelId));
  };
  const choose = (slot: StaffSlot) => {
    if (!active) return;
    if (asActing) {
      setActing((current) => [...current.filter((item) => item.personnelId !== active.personnelId), { personnelId: active.personnelId, position: slot.position, slotId: slot.id }]);
      return;
    }
    const incumbents = actingForSlot(slot, records, slots).filter((person) => !acting.some((item) => item.personnelId === person.personnelId && !item.slotId));
    if (incumbents.length) setActingDecision({ slot, person: active, incumbents });
    else stageMove(slot, active);
  };
  const save = async () => { setSaving(true); try { await onSave(moves, acting); } finally { setSaving(false); } };
  return <Modal title="Переміщення та ТВО" onClose={onClose} className="staff-transfer-modal">
    <div className="transfer-layout"><section className="transfer-source">
      <label className="form-field"><span>Кого переміщуємо</span><Select ariaLabel="Військовослужбовець для переміщення" value={activeId} onChange={setActiveId} options={[{ value: "", label: "Оберіть військовослужбовця" }, ...records.map((person) => ({ value: String(person.personnelId), label: `${person.fullName} — ${person.position}` }))]} /></label>
      {active && <div className="transfer-current"><b>{active.fullName}</b><span>{active.position}</span></div>}
      <label className="switch-line transfer-acting-toggle"><input type="checkbox" checked={asActing} onChange={(event) => setAsActing(event.target.checked)} />Призначити ТВО — основна посада залишається</label>
      <div className="transfer-chain">{moves.map((move, index) => <div key={move.personnelId}><button onClick={() => setActiveId(String(move.personnelId))}><b>{index + 1}. {records.find((person) => person.personnelId === move.personnelId)?.fullName}</b><span>{slots.find((slot) => slot.id === move.slotId)?.path} · {move.position}</span></button><button className="button" onClick={() => setMoves((current) => current.filter((item) => item !== move))}>Скасувати крок</button></div>)}{acting.map((item) => <p key={item.personnelId}>{records.find((person) => person.personnelId === item.personnelId)?.fullName}: {item.slotId ? `ТВО · ${item.position}` : "Зняти ТВО"}</p>)}</div>
    </section><section className="transfer-targets"><header><h3>Штатні посади</h3><label className="switch-line"><input type="checkbox" checked={showFree || asActing} disabled={asActing} onChange={(event) => setShowFree(event.target.checked)} />Лише вільні</label></header>
      <div className="position-choice-list">{slots.filter((slot) => !(showFree || asActing) || projectedOccupants(slot, moves, records).length === 0).map((slot) => {
        const occupants = projectedOccupants(slot, moves, records);
        const currentActing = actingForSlot(slot, records, slots);
        const selected = asActing ? acting.some((item) => item.personnelId === active?.personnelId && item.slotId === slot.id) : moves.some((item) => item.personnelId === active?.personnelId && item.slotId === slot.id);
        return <button type="button" className={`position-choice ${selected ? "selected" : ""}`} key={slot.id} disabled={!active || occupants.some((person) => person.personnelId === active.personnelId) || (asActing && currentActing.length > 0)} onClick={() => choose(slot)}><b>{slot.name}<small>{slot.path}</small></b><span>{occupants.length ? occupants.map((person) => person.fullName).join(", ") : "Вільна посада"}{currentActing.length > 0 && <small>ТВО: {currentActing.map((person) => person.fullName).join(", ")}</small>}</span></button>;
      })}</div>
    </section></div>
    {actingDecision && <section className="transfer-current" role="alert"><b>На цій посаді є ТВО: {actingDecision.incumbents.map((person) => person.fullName).join(", ")}</b><p>Зняти ТВО після призначення постійного військовослужбовця?</p><button className="button primary" onClick={() => { setActing((current) => [...current.filter((item) => !actingDecision.incumbents.some((person) => person.personnelId === item.personnelId)), ...actingDecision.incumbents.map((person) => ({ personnelId: person.personnelId, slotId: "", position: "" }))]); stageMove(actingDecision.slot, actingDecision.person); setActingDecision(null); }}>Зняти ТВО та призначити</button><button className="button" onClick={() => setActingDecision(null)}>Скасувати призначення</button></section>}
    <footer className="modal-actions"><span className={conflicts.length ? "transfer-summary transfer-summary--warning" : "transfer-summary"}>{conflicts.length ? `Завершіть переміщення: ${conflicts.map(({ slot, people }) => `${slot.path} · ${slot.name}: ${people.map((person) => person.fullName).join(", ")}`).join("; ")}` : `Переміщень: ${moves.length}`}</span><button className="button" onClick={onClose} disabled={saving}>Скасувати</button><button className="button primary" onClick={() => void save()} disabled={saving || !!actingDecision || conflicts.length > 0 || (!moves.length && !acting.length)}>Застосувати переміщення</button></footer>
  </Modal>;
}
