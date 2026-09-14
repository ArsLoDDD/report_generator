import { useMemo, useState } from "react";
import { RefreshCw, UsersRound } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import { Select } from "../../shared/ui/Select";
import type { Crew, FlightPlanEntry, FlightPlanRotation } from "./types";

export function FlightRotationModal({ crew, currentEntry, rotation, onClose, onSave }: {
  crew: Crew;
  currentEntry: FlightPlanEntry;
  rotation?: FlightPlanRotation;
  onClose: () => void;
  onSave: (memberIds: number[], commanderId: number) => void;
}) {
  const members=useMemo(()=>[...crew.members,...crew.actualMembers].filter((member,index,items)=>items.findIndex((candidate)=>candidate.personnelId===member.personnelId)===index),[crew]);
  const [selectedIds,setSelectedIds]=useState<number[]>(rotation?.actualMemberIds?.length?rotation.actualMemberIds:currentEntry.actualMemberIds);
  const initiallySelected=new Set(currentEntry.actualMemberIds);
  const defaultCommander=rotation?.actualCommanderId??currentEntry.actualCommanderId;
  const [commanderId,setCommanderId]=useState<number|null>(defaultCommander&&selectedIds.includes(defaultCommander)?defaultCommander:selectedIds[0]??null);
  const selectedMembers=members.filter((member)=>selectedIds.includes(member.personnelId));
  const toggle=(personnelId:number)=>setSelectedIds((current)=>{
    const next=current.includes(personnelId)?current.filter((id)=>id!==personnelId):[...current,personnelId];
    if(commanderId===personnelId&&!next.includes(personnelId))setCommanderId(next[0]??null);
    return next;
  });
  return <Modal title={`Ротація екіпажу «${crew.name}»`} subtitle="Оберіть склад, який залишиться або заїде на позицію після ротації." onClose={onClose} className="flight-rotation-modal">
    <div className="flight-rotation-modal__body">
      <div className="flight-rotation-summary"><UsersRound/><span><b>Після ротації: {selectedIds.length}</b><small>Залишаються {selectedIds.filter((id)=>initiallySelected.has(id)).length} · заїжджають {selectedIds.filter((id)=>!initiallySelected.has(id)).length} · виїжджають {currentEntry.actualMemberIds.filter((id)=>!selectedIds.includes(id)).length}</small></span></div>
      <div className="flight-rotation-members">{members.map((member)=>{const checked=selectedIds.includes(member.personnelId);return <label className={checked?"is-selected":""} key={member.personnelId}><input type="checkbox" checked={checked} onChange={()=>toggle(member.personnelId)}/><span><b>{member.fullName}</b><small>{member.rank} · {member.position}{member.callsign?` · ${member.callsign}`:""}</small></span>{initiallySelected.has(member.personnelId)&&<em>Зараз на позиції</em>}</label>;})}</div>
      <label className="form-field"><span>Фактичний командир після ротації</span><Select ariaLabel="Фактичний командир після ротації" value={commanderId?.toString()??""} onChange={(value)=>setCommanderId(value?Number(value):null)} options={selectedMembers.map((member)=>({value:String(member.personnelId),label:`${member.fullName}${member.callsign?` · ${member.callsign}`:""}`}))}/><small>У списку доступні тільки люди з активним чекбоксом.</small></label>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" disabled={!selectedIds.length||!commanderId} onClick={()=>commanderId&&onSave(selectedIds,commanderId)}><RefreshCw/>{rotation?"Зберегти склад":"Провести ротацію"}</button></footer>
  </Modal>;
}
