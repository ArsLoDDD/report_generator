import { AlertTriangle, ChevronDown, MapPin, Plane, RefreshCw, Trash2, Users } from "lucide-react";
import { useState } from "react";
import type { Vehicle } from "../vehicles/types";
import { FlightPlanEntryFields } from "./FlightPlanEntryFields";
import { FlightRotationModal } from "./FlightRotationModal";
import type { Crew, Equipment, FlightPlanEntry, FlightPlanRotation, WorkshopProduct } from "./types";

export function FlightPlanParametersModal({ crews, vehicles, uavs, ammunition, workshopProducts, selected, entries, rotations, missingCallsignCount, onToggle, onPatch, onPatchRotation, onSaveRotation, onDeleteRotation }: {
  crews:Crew[];
  vehicles:Vehicle[];
  uavs:Equipment[];
  ammunition:Equipment[];
  workshopProducts:WorkshopProduct[];
  selected:number[];
  entries:Record<number,FlightPlanEntry>;
  rotations:Record<number,FlightPlanRotation[]>;
  missingCallsignCount:number;
  onToggle:(crewId:number)=>void;
  onPatch:(crewId:number,patch:Partial<FlightPlanEntry>)=>void;
  onPatchRotation:(crewId:number,rotationId:string,patch:Partial<FlightPlanEntry>)=>void;
  onSaveRotation:(crewId:number,memberIds:number[],commanderId:number,rotationId?:string)=>void;
  onDeleteRotation:(crewId:number,rotationId:string)=>void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [rotationCrewId,setRotationCrewId]=useState<number|null>(null);
  const toggleExpanded = (key:string) => setExpanded((current) => { const next=new Set(current); if(next.has(key))next.delete(key);else next.add(key); return next; });
  const rotationCrew=crews.find((crew)=>crew.id===rotationCrewId);
  const currentRotation=rotationCrewId===null?undefined:rotations[rotationCrewId]?.[0];
  return <section className="panel flight-plan-parameters-panel"><div className="flight-plan-parameters">
    {missingCallsignCount>0&&<div className="flight-plan-modal-warning"><AlertTriangle/><span>У складі екіпажів немає позивних у {missingCallsignCount} людей. Для вибраних екіпажів експорт буде недоступний, доки позивні не заповнені.</span></div>}
    <section className="flight-plan-parameters__crews" aria-label={`Працюючі екіпажі: вибрано ${selected.length} з ${crews.length}`}>
      {crews.map((crew)=>{const checked=selected.includes(crew.id);const baseKey=`crew-${crew.id}`;const open=expanded.has(baseKey);const entry=entries[crew.id];if(!entry)return null;const crewRotations=rotations[crew.id]??[];return <div className="flight-plan-crew-group" key={crew.id}>
        <article className={`flight-plan-editor ${checked?"is-selected":""}`}>
          <div className="flight-plan-editor__header" role="button" tabIndex={0} onClick={()=>toggleExpanded(baseKey)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" ")toggleExpanded(baseKey);}}><label className="flight-plan-editor__select" onClick={(event)=>event.stopPropagation()}><input type="checkbox" checked={checked} onChange={()=>onToggle(crew.id)}/><span><b>{crew.name}</b><small>{crew.positionName||"Позицію не визначено"}</small></span></label><div className="flight-plan-editor__facts"><span><MapPin/>{crew.battleOrder||"БРО не вказано"}</span><span><Plane/>{crew.uavName||"БпАК не вказано"}</span><span><Users/>{entry.actualMemberIds.length} на позиції</span><em>{crew.status}</em></div><button type="button" className={`flight-plan-editor__expand ${open?"is-open":""}`} aria-label={`${open?"Згорнути":"Розгорнути"} ${crew.name}`} onClick={(event)=>{event.stopPropagation();toggleExpanded(baseKey);}}><ChevronDown/></button></div>
          {open&&<><FlightPlanEntryFields crew={crew} entry={entry} vehicles={vehicles} uavs={uavs} ammunition={ammunition} workshopProducts={workshopProducts} onPatch={(patch)=>onPatch(crew.id,patch)}/><div className="flight-plan-rotation-action"><button className="button" type="button" onClick={()=>setRotationCrewId(crew.id)}><RefreshCw/>{crewRotations.length?"Змінити склад ротації":"Провести ротацію"}</button></div></>}
        </article>
        {crewRotations.map((rotation,index)=>{const key=`rotation-${rotation.rotationId}`;const rotationOpen=expanded.has(key);return <article className={`flight-plan-editor flight-plan-editor--rotation ${checked?"is-selected":""}`} key={rotation.rotationId}>
          <div className="flight-plan-editor__header" role="button" tabIndex={0} onClick={()=>toggleExpanded(key)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" ")toggleExpanded(key);}}><div className="flight-plan-editor__rotation-title"><RefreshCw/><span><b>{crew.name} · після ротації {index+1}</b><small>{rotation.actualMemberIds.length} людей · {rotation.startTime}–{rotation.endTime}</small></span></div><div className="flight-plan-editor__facts"><span><Users/>{rotation.actualMemberIds.length} на позиції</span><span><Plane/>{crew.uavName||"БпАК не вказано"}</span></div><div className="flight-plan-editor__rotation-actions"><button type="button" className="icon-button danger" aria-label={`Видалити ротацію ${crew.name}`} onClick={(event)=>{event.stopPropagation();onDeleteRotation(crew.id,rotation.rotationId);}}><Trash2/></button><button type="button" className={`flight-plan-editor__expand ${rotationOpen?"is-open":""}`} aria-label={`${rotationOpen?"Згорнути":"Розгорнути"} ротацію ${crew.name}`} onClick={(event)=>{event.stopPropagation();toggleExpanded(key);}}><ChevronDown/></button></div></div>
          {rotationOpen&&<FlightPlanEntryFields crew={crew} entry={rotation} vehicles={vehicles} uavs={uavs} ammunition={ammunition} workshopProducts={workshopProducts} onPatch={(patch)=>onPatchRotation(crew.id,rotation.rotationId,patch)}/>}
        </article>})}
      </div>;})}
    </section>
    {rotationCrew&&<FlightRotationModal crew={rotationCrew} currentEntry={entries[rotationCrew.id]} rotation={currentRotation} onClose={()=>setRotationCrewId(null)} onSave={(memberIds,commanderId)=>{onSaveRotation(rotationCrew.id,memberIds,commanderId,currentRotation?.rotationId);setRotationCrewId(null);}}/>}
  </div></section>;
}
