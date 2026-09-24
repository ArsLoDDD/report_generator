import { useMemo, useState } from "react";
import { ArrowRightLeft, UserMinus, UserPlus } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import { POSITION_OCCUPANCY_LOCATIONS } from "./bcs-model";
import { isFlightPlanMemberAvailable, validateFlightPlanPersonnelTransitions } from "./flight-plan-model";
import type { Crew, FlightPlanPersonnelTransition } from "./types";

const transitionId = (crewId: number) => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `personnel-${crewId}-${Date.now()}`;

const isAlreadyOnPosition = (location: string) => {
  const value = location.trim().toLocaleLowerCase("uk").replace(/\s+/gu, " ");
  return POSITION_OCCUPANCY_LOCATIONS.some((candidate) => candidate.toLocaleLowerCase("uk") === value);
};

export function FlightPersonnelTransitionModal({ crew, currentMemberIds, notBeforeTime, notAfterTime, transition, onClose, onSave }: {
  crew: Crew;
  currentMemberIds: number[];
  notBeforeTime?: string;
  notAfterTime?: string;
  transition?: FlightPlanPersonnelTransition;
  onClose: () => void;
  onSave: (transition: FlightPlanPersonnelTransition) => void;
}) {
  const currentIds = useMemo(() => new Set(currentMemberIds), [currentMemberIds]);
  const memberDirectory = useMemo(() => new Map([...crew.members, ...crew.actualMembers].map((member) => [member.personnelId, member])), [crew]);
  const outgoingMembers = useMemo(() => currentMemberIds.map((id) => memberDirectory.get(id)).filter((member): member is NonNullable<typeof member> => Boolean(member)), [currentMemberIds, memberDirectory]);
  const incomingMembers = useMemo(() => crew.actualMembers.filter((member) => !currentIds.has(member.personnelId) && !isAlreadyOnPosition(member.currentLocation ?? "")), [crew.actualMembers, currentIds]);
  const [outgoingMemberIds, setOutgoingMemberIds] = useState<number[]>(transition?.outgoingMemberIds ?? []);
  const [incomingMemberIds, setIncomingMemberIds] = useState<number[]>(transition?.incomingMemberIds ?? []);
  const [outgoingTime, setOutgoingTime] = useState(transition?.outgoingTime ?? "");
  const [incomingTime, setIncomingTime] = useState(transition?.incomingTime ?? "");
  const [id] = useState(() => transition?.id || transitionId(crew.id));

  const draft = useMemo<FlightPlanPersonnelTransition>(() => {
    const selected = new Set([...outgoingMemberIds, ...incomingMemberIds]);
    const snapshots = [...selected].flatMap((personnelId) => {
      const member = memberDirectory.get(personnelId);
      const previous = transition?.memberSnapshots?.find((snapshot) => snapshot.personnelId === personnelId);
      return member
        ? [{ personnelId, fullName: member.fullName, rank: member.rank }]
        : previous ? [previous] : [];
    });
    return {
      id,
      crewId: crew.id,
      outgoingMemberIds,
      outgoingTime,
      incomingMemberIds,
      incomingTime,
      memberSnapshots: snapshots,
    };
  }, [crew.id, id, incomingMemberIds, incomingTime, memberDirectory, outgoingMemberIds, outgoingTime, transition]);

  const validation = useMemo(() => validateFlightPlanPersonnelTransitions(currentMemberIds, [draft], crew.id, crew.actualMembers.map((member) => member.personnelId), { stageStartTime: notBeforeTime, departureTime: notAfterTime }), [crew.actualMembers, crew.id, currentMemberIds, draft, notAfterTime, notBeforeTime]);
  const toggle = (ids: number[], personnelId: number, setIds: (ids: number[]) => void) => setIds(ids.includes(personnelId) ? ids.filter((id) => id !== personnelId) : [...ids, personnelId]);
  const save = () => { if (validation.isValid) onSave(draft); };

  return <Modal title={`Завести/Вивести ОС · «${crew.name}»`} subtitle="Оберіть людей та окремо вкажіть фактичний час кожної дії." onClose={onClose} className="flight-personnel-transition-modal">
    <div className="flight-personnel-transition-modal__body">
      <div className="flight-personnel-transition-grid">
        <section className="flight-personnel-transition-column is-outgoing">
          <header><UserMinus/><span><b>Вивести ОС</b><small>Зараз на позиції · вибрано {outgoingMemberIds.length}</small></span></header>
          <label className="form-field flight-personnel-transition-time"><span>Час виведення</span><input aria-label="Час виведення ОС" type="time" min={notBeforeTime} max={notAfterTime} value={outgoingTime} onChange={(event) => setOutgoingTime(event.target.value)}/></label>
          <div className="flight-personnel-transition-members">
            {outgoingMembers.map((member) => <label className={outgoingMemberIds.includes(member.personnelId) ? "is-selected" : ""} key={member.personnelId}>
              <input type="checkbox" checked={outgoingMemberIds.includes(member.personnelId)} onChange={() => toggle(outgoingMemberIds, member.personnelId, setOutgoingMemberIds)}/>
              <span><b>{member.fullName}</b><small>{member.rank} · {member.position}{member.callsign ? ` · ${member.callsign}` : ""}</small></span>
            </label>)}
            {!outgoingMembers.length && <p className="flight-personnel-transition-empty">На позиції немає ОС для виведення.</p>}
          </div>
        </section>

        <section className="flight-personnel-transition-column is-incoming">
          <header><UserPlus/><span><b>Завести ОС</b><small>Фактичний склад поза позицією · вибрано {incomingMemberIds.length}</small></span></header>
          <label className="form-field flight-personnel-transition-time"><span>Час заведення</span><input aria-label="Час заведення ОС" type="time" min={notBeforeTime} max={notAfterTime} value={incomingTime} onChange={(event) => setIncomingTime(event.target.value)}/></label>
          <div className="flight-personnel-transition-members">
            {incomingMembers.map((member) => { const selected = incomingMemberIds.includes(member.personnelId); const unavailable = !isFlightPlanMemberAvailable(member); return <label className={selected ? "is-selected" : ""} key={member.personnelId}>
              <input type="checkbox" checked={selected} disabled={unavailable && !selected} onChange={() => toggle(incomingMemberIds, member.personnelId, setIncomingMemberIds)}/>
              <span><b>{member.fullName}</b><small>{member.rank} · {member.position}{member.callsign ? ` · ${member.callsign}` : ""}</small></span>
              {unavailable && <em>{member.currentLocation || "Недоступний"}</em>}
            </label>; })}
            {!incomingMembers.length && <p className="flight-personnel-transition-empty">У фактичному складі немає ОС поза позицією.</p>}
          </div>
        </section>
      </div>
      <p className="flight-personnel-transition-window">Доступний час: від {notBeforeTime || "початку етапу"}{notAfterTime ? ` до ${notAfterTime}` : " до завершення доби"}.</p>
      {!validation.isValid && (outgoingMemberIds.length > 0 || incomingMemberIds.length > 0) && <div className="flight-personnel-transition-errors" role="status">{validation.errors.map((error) => <p key={error}>{error}</p>)}</div>}
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={!validation.isValid} onClick={save}><ArrowRightLeft/>Зберегти зміну ОС</button></footer>
  </Modal>;
}
