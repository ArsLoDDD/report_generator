import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Settings2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { CardGridSkeleton } from "../../shared/ui/entity-card/CardGridSkeleton";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { settingsService } from "../settings/services/settingsService";
import { vehiclesService } from "../vehicles/services/vehiclesService";
import type { Vehicle } from "../vehicles/types";
import { FlightPlanParametersModal } from "./FlightPlanParametersModal";
import { FlightPlanTable } from "./FlightPlanTable";
import { flightPlanPreviewRows, initialFlightEntry, initialWeather, isFlightPlanMemberAvailable, missingCrewCallsigns, validateFlightPlanSchedule } from "./flight-plan-model";
import { FLIGHT_PLAN_STORAGE_KEY } from "./flight-plan-storage";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, FlightPlanEntry, FlightPlanRequest, FlightPlanRotation, Position, WorkshopProduct } from "./types";

const displayDate=(value:Date)=>`${String(value.getDate()).padStart(2,"0")}.${String(value.getMonth()+1).padStart(2,"0")}.${value.getFullYear()}`;
export const flightPlanDateForTomorrow=(now=new Date())=>displayDate(new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));
type StoredDraft={unitName?:string;date?:string;zoom?:number;selected?:number[];entries?:Record<number,FlightPlanEntry>;rotations?:Record<number,FlightPlanRotation[]>;rolledFromPreviousDate?:boolean};
const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
const stringArray=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[];
const numberArray=(value:unknown)=>Array.isArray(value)?value.filter((item):item is number=>typeof item==="number"&&Number.isFinite(item)):[];
const normaliseEntry=(value:unknown,crewIdFallback=0):FlightPlanEntry=>{
  const raw=isRecord(value)?value:{};
  const crewId=typeof raw.crewId==="number"&&Number.isFinite(raw.crewId)?raw.crewId:crewIdFallback;
  const weather=isRecord(raw.weather)?raw.weather:{};
  const uavSelections=Array.isArray(raw.uavSelections)?raw.uavSelections.flatMap((selection)=>{
    if(!isRecord(selection)||typeof selection.equipmentId!=="number")return[];
    return[{equipmentId:selection.equipmentId,dayQuantity:typeof selection.dayQuantity==="number"?selection.dayQuantity:0,nightQuantity:typeof selection.nightQuantity==="number"?selection.nightQuantity:0}];
  }):[];
  const payloadSelection=isRecord(raw.payloadSelection)&&typeof raw.payloadSelection.sourceType==="string"&&typeof raw.payloadSelection.sourceId==="number"
    ?{sourceType:raw.payloadSelection.sourceType as "equipment"|"workshop",sourceId:raw.payloadSelection.sourceId}
    :null;
  return{
    ...(raw as Partial<FlightPlanEntry>),crewId,
    actualMemberIds:numberArray(raw.actualMemberIds),
    actualCommanderId:typeof raw.actualCommanderId==="number"?raw.actualCommanderId:null,
    actualVehicleId:typeof raw.actualVehicleId==="number"?raw.actualVehicleId:null,
    weather:{...initialWeather(),...Object.fromEntries(Object.entries(weather).filter(([,item])=>typeof item==="string"))},
    routePoints:stringArray(raw.routePoints),areaPoints:stringArray(raw.areaPoints),
    altitudeFrom:typeof raw.altitudeFrom==="string"?raw.altitudeFrom:"800",altitudeTo:typeof raw.altitudeTo==="string"?raw.altitudeTo:"1100",
    task:typeof raw.task==="string"?raw.task:"Розвідка противника та місцевості",
    startTime:typeof raw.startTime==="string"?raw.startTime:"05:00",endTime:typeof raw.endTime==="string"?raw.endTime:"21:00",
    uavSelections,payloadSelection,
    arrivesToday:raw.arrivesToday===true,departsToday:raw.departsToday===true,departureTime:typeof raw.departureTime==="string"?raw.departureTime:"",
  };
};
const normaliseStoredDraft=(value:unknown):StoredDraft=>{
  if(!isRecord(value))return{};
  const rawEntries=isRecord(value.entries)?value.entries:null;
  const entries=Object.fromEntries(Object.entries(rawEntries??{}).flatMap(([key,entry])=>{const crewId=Number(key);return Number.isFinite(crewId)?[[crewId,normaliseEntry(entry,crewId)]]:[];}));
  const rawRotations=isRecord(value.rotations)?value.rotations:null;
  const rotations=Object.fromEntries(Object.entries(rawRotations??{}).flatMap(([key,list])=>{const crewId=Number(key);if(!Number.isFinite(crewId)||!Array.isArray(list))return[];return[[crewId,list.map((entry,index)=>({...normaliseEntry(entry,crewId),rotationId:isRecord(entry)&&typeof entry.rotationId==="string"?entry.rotationId:`legacy-${crewId}-${index}`}))]];}));
  return{unitName:typeof value.unitName==="string"?value.unitName:undefined,date:typeof value.date==="string"?value.date:undefined,zoom:typeof value.zoom==="number"?value.zoom:undefined,selected:Array.isArray(value.selected)?numberArray(value.selected):undefined,entries:rawEntries?entries:undefined,rotations:rawRotations?rotations:undefined,rolledFromPreviousDate:value.rolledFromPreviousDate===true};
};
const storedDraft=():StoredDraft=>{try{return normaliseStoredDraft(JSON.parse(localStorage.getItem(FLIGHT_PLAN_STORAGE_KEY)??"{}"));}catch{return {};}};
const cloneEntry=(entry:FlightPlanEntry):FlightPlanEntry=>({...entry,actualMemberIds:[...entry.actualMemberIds],weather:{...entry.weather},routePoints:[...entry.routePoints],areaPoints:[...entry.areaPoints],uavSelections:entry.uavSelections.map((item)=>({...item})),payloadSelection:entry.payloadSelection?{...entry.payloadSelection}:null});
const entryFromRotation=(rotation:FlightPlanRotation):FlightPlanEntry=>{const copy={...cloneEntry(rotation)} as FlightPlanEntry&{rotationId?:string};delete copy.rotationId;return copy;};
const dateNumber=(value:string)=>{const parts=value.includes(".")?value.split(".").reverse():value.split("-");const [year,month,day]=parts.map(Number);return year&&month&&day?year*10000+month*100+day:0;};
const isoDate=(value:string)=>{const [day,month,year]=value.split(".");return year&&month&&day?`${year}-${month}-${day}`:value;};
const shiftIsoDate=(value:string,days:number)=>{const [year,month,day]=value.split("-").map(Number);const shifted=new Date(year,month-1,day+days);return `${shifted.getFullYear()}-${String(shifted.getMonth()+1).padStart(2,"0")}-${String(shifted.getDate()).padStart(2,"0")}`;};
export const flightPlanTransitionHasHappened=(planDate:string,time:string,now=new Date(Date.now()))=>{const minute=planMinute(time);const parts=planDate.includes(".")?planDate.split(".").reverse():planDate.split("-");const [year,month,day]=parts.map(Number);if(minute===null||!year||!month||!day)return false;return now.getTime()>=new Date(year,month-1,day,Math.floor(minute/60),minute%60).getTime();};
const parseSnapshot=(value:string|null|undefined):FlightPlanRequest|null=>{try{const parsed=value?JSON.parse(value):null;if(!isRecord(parsed))return null;return{unitName:typeof parsed.unitName==="string"?parsed.unitName:"Підрозділ",entries:Array.isArray(parsed.entries)?parsed.entries.map((entry)=>normaliseEntry(entry)):[]};}catch{return null;}};
const planMinute=(value?:string)=>{const [hours,minutes]=(value??"").split(":").map(Number);return Number.isInteger(hours)&&Number.isInteger(minutes)&&hours>=0&&hours<24&&minutes>=0&&minutes<60?hours*60+minutes:null;};
const minuteText=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;
const nextRotationTime=(source:FlightPlanEntry)=>{const end=planMinute(source.endTime);const start=planMinute(source.startTime);return end!==null&&end<23*60+59&&start!==null&&end+1>start?minuteText(end+1):"";};
const sameComposition=(left:FlightPlanEntry,right:FlightPlanEntry)=>left.actualMemberIds.length===right.actualMemberIds.length&&left.actualMemberIds.every((id)=>right.actualMemberIds.includes(id));
const uniqueCrewMembers=(crew:Crew)=>[...crew.members,...crew.actualMembers].filter((member,index,members)=>members.findIndex((candidate)=>candidate.personnelId===member.personnelId)===index);
// Never silently rewrite a saved stage when the current personnel state or crew
// composition has changed. New stages start with available people only, while a
// restored conflict stays visible until the user resolves it explicitly.
const preserveEntryMembers=(entry:FlightPlanEntry):FlightPlanEntry=>{
  const actualMemberIds=[...new Set(entry.actualMemberIds)];
  const actualCommanderId=entry.actualCommanderId!=null&&actualMemberIds.includes(entry.actualCommanderId)?entry.actualCommanderId:actualMemberIds[0]??null;
  return {...entry,actualMemberIds,actualCommanderId};
};
const currentDraft=():StoredDraft=>{
  const stored=storedDraft();
  const targetDate=flightPlanDateForTomorrow();
  if(!stored.date)return{...stored,date:targetDate};
  if(dateNumber(stored.date)===dateNumber(targetDate))return{...stored,date:targetDate};
  const previousDate=shiftIsoDate(isoDate(targetDate),-1);
  if(isoDate(stored.date)!==previousDate)return{unitName:stored.unitName,date:targetDate,zoom:stored.zoom};
  const departedCrewIds=new Set<number>();
  const entries=Object.fromEntries(Object.entries(stored.entries??{}).map(([crewId,entry])=>{
    const crewRotations=stored.rotations?.[Number(crewId)]??[];
    const validation=validateFlightPlanSchedule(entry,crewRotations);
    const safeRotations=validation.rotationError?[]:crewRotations;
    if(entry.departsToday&&validation.isValid)departedCrewIds.add(entry.crewId);
    const last=safeRotations[safeRotations.length-1];
    const next=last?entryFromRotation(last):cloneEntry(entry);
    return[crewId,{...next,arrivesToday:false,departsToday:false,departureTime:""}];
  }));
  return{...stored,date:targetDate,selected:stored.selected?.filter((crewId)=>!departedCrewIds.has(crewId)),entries,rotations:{},rolledFromPreviousDate:true};
};

export function FlightPlanningPage(){
  const {notify}=useNotifications();
  const [initial]=useState(currentDraft);
  const [crews,setCrews]=useState<Crew[]>([]);const [positions,setPositions]=useState<Position[]>([]);const [vehicles,setVehicles]=useState<Vehicle[]>([]);const [uavs,setUavs]=useState<Equipment[]>([]);const [ammunition,setAmmunition]=useState<Equipment[]>([]);const [workshopProducts,setWorkshopProducts]=useState<WorkshopProduct[]>([]);
  const [unitName,setUnitName]=useState(initial.unitName??"");const [date,setDate]=useState(initial.date??flightPlanDateForTomorrow);const [zoom,setZoom]=useState(initial.zoom??75);
  const [entries,setEntries]=useState<Record<number,FlightPlanEntry>>(initial.entries??{});const [selected,setSelected]=useState<number[]>(initial.selected??[]);
  const [rotations,setRotations]=useState<Record<number,FlightPlanRotation[]>>(initial.rotations??{});
  const [confirmedPresentCrewIds,setConfirmedPresentCrewIds]=useState<Set<number>>(()=>new Set());
  const [loaded,setLoaded]=useState(false);const [exporting,setExporting]=useState(false);
  const [parametersOpen,setParametersOpen]=useState(false);
  const rollToCurrentDate=useCallback(()=>{const next=currentDraft();if(dateNumber(next.date??"")===dateNumber(date))return;setUnitName(next.unitName??"");setDate(next.date??flightPlanDateForTomorrow());setZoom(next.zoom??75);setEntries(next.entries??{});setSelected(next.selected??[]);setRotations(next.rotations??{});},[date]);

  const load=useCallback(async()=>{try{
    const planDate=isoDate(date);
    const [allCrews,nextPositions,nextVehicles,nextUavs,nextAmmunition,nextWorkshopProducts,settings,storedSnapshot,previousStoredSnapshot]=await Promise.all([operationsService.listCrews(),Promise.resolve(operationsService.listPositions?.()??[]),vehiclesService.list(),operationsService.listEquipment("uav"),operationsService.listEquipment("weapon_ammo"),operationsService.listWorkshopProducts(),settingsService.get(),operationsService.getFlightPlanSnapshot(planDate),operationsService.getFlightPlanSnapshot(shiftIsoDate(planDate,-1))]);
    const nextCrews=allCrews.filter((crew)=>crew.status.trim().toLocaleLowerCase("uk")==="працюючий");
    const snapshot=Object.keys(initial.entries??{}).length&&!initial.rolledFromPreviousDate?null:parseSnapshot(storedSnapshot);
    const previousSnapshot=parseSnapshot(previousStoredSnapshot);
    const restoredEntries=Object.fromEntries((snapshot?.entries??[]).filter((entry,index,items)=>items.findIndex((candidate)=>candidate.crewId===entry.crewId)===index).map((entry)=>[entry.crewId,entry]));
    const restoredRotations=Object.fromEntries([...new Set((snapshot?.entries??[]).map((entry)=>entry.crewId))].map((crewId)=>[crewId,(snapshot?.entries??[]).filter((entry)=>entry.crewId===crewId).slice(1).map((entry,index)=>({...entry,rotationId:entry.rotationId||`restored-${crewId}-${index}`}))]));
    const continuingCrewIds=new Set(nextCrews.flatMap((crew)=>{const stages=previousSnapshot?.entries.filter((entry)=>entry.crewId===crew.id)??[];if(!stages.length)return[];const validation=validateFlightPlanSchedule(stages[0],stages.slice(1) as FlightPlanRotation[]);return stages[0].departsToday&&validation.isValid?[]:[crew.id];}));
    setConfirmedPresentCrewIds(continuingCrewIds);
    setCrews(nextCrews);setPositions(nextPositions);setVehicles(nextVehicles);setUavs(nextUavs);setAmmunition(nextAmmunition);setWorkshopProducts(nextWorkshopProducts);
    setUnitName((current)=>current||snapshot?.unitName||settings.unit.shortName||settings.unit.fullName||"Підрозділ");
    setEntries((current)=>Object.fromEntries(nextCrews.map((crew)=>{const defaults=initialFlightEntry(crew,nextUavs);const stored=initial.rolledFromPreviousDate&&snapshot?restoredEntries[crew.id]??current[crew.id]:current[crew.id]??restoredEntries[crew.id];const positionId=stored?.positionId??crew.positionId;const positionName=stored?.positionName||crew.positionName;const matchingPrevious=previousSnapshot?.entries.filter((previous)=>{if(previous.crewId!==crew.id)return false;const previousPositionId=previous.positionId;const previousPositionName=previous.positionName;if(positionId!=null&&previousPositionId!=null)return positionId===previousPositionId;if(positionName&&previousPositionName)return positionName===previousPositionName;return true;})??[];const previousValidation=matchingPrevious.length?validateFlightPlanSchedule(matchingPrevious[0],matchingPrevious.slice(1) as FlightPlanRotation[]):null;const wasAtPosition=matchingPrevious.length>0&&!(matchingPrevious[0].departsToday&&previousValidation?.isValid);const arrivesToday=previousSnapshot?!wasAtPosition:Boolean(stored?.arrivesToday);const entry=stored?{...defaults,...stored,actualMemberIds:stored.actualMemberIds??defaults.actualMemberIds,uavSelections:stored.uavSelections??defaults.uavSelections,weather:{...defaults.weather,...stored.weather},arrivesToday}: {...defaults,arrivesToday};return [crew.id,preserveEntryMembers(entry)];})));
    setRotations((current)=>{const source=Object.keys(current).length?current:restoredRotations;return Object.fromEntries(nextCrews.flatMap((crew)=>{const stages=(source[crew.id]??[]).map((rotation)=>preserveEntryMembers(rotation) as FlightPlanRotation);return stages.length?[[crew.id,stages]]:[];}));});
    setSelected((current)=>{const requested=initial.selected===undefined?(snapshot?[...new Set(snapshot.entries.map((entry)=>entry.crewId))]:nextCrews.map((crew)=>crew.id)):current;const available=requested.filter((id)=>nextCrews.some((crew)=>crew.id===id));return[...new Set([...available,...continuingCrewIds])];});
  }catch{notify("Не вдалося завантажити дані для плану польотів.","error");}finally{setLoaded(true);}},[date,initial.entries,initial.rolledFromPreviousDate,initial.selected,notify]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{let timer=0;const schedule=()=>{window.clearTimeout(timer);const now=new Date();const midnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime();timer=window.setTimeout(()=>{rollToCurrentDate();schedule();},Math.max(250,midnight-now.getTime()+50));};const refresh=()=>{rollToCurrentDate();schedule();};const visibility=()=>{if(document.visibilityState==="visible")refresh();};schedule();window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",visibility);return()=>{window.clearTimeout(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",visibility);};},[rollToCurrentDate]);
  useEffect(()=>{if(loaded){localStorage.setItem(FLIGHT_PLAN_STORAGE_KEY,JSON.stringify({unitName,date,zoom,selected,entries,rotations}));window.dispatchEvent(new CustomEvent("flight-plan-updated"));}},[date,entries,loaded,rotations,selected,unitName,zoom]);

  const missingCallsigns=useMemo(()=>missingCrewCallsigns(crews),[crews]);
  const selectedMissing=useMemo(()=>missingCrewCallsigns(crews.filter((crew)=>selected.includes(crew.id))),[crews,selected]);
  const scheduleValidations=useMemo(()=>Object.fromEntries(Object.entries(entries).map(([crewId,entry])=>[Number(crewId),validateFlightPlanSchedule(entry,rotations[Number(crewId)]??[])])),[entries,rotations]);
  const hasInvalidSelectedSchedule=useMemo(()=>selected.some((crewId)=>scheduleValidations[crewId]&&!scheduleValidations[crewId].isValid),[scheduleValidations,selected]);
  const invalidSelectedMemberState=useMemo(()=>selected.flatMap((crewId)=>{const crew=crews.find((item)=>item.id===crewId);if(!crew)return[];const members=new Map(uniqueCrewMembers(crew).map((member)=>[member.personnelId,member]));const stages=[entries[crewId],...(rotations[crewId]??[])].filter((stage):stage is FlightPlanEntry=>Boolean(stage));if(stages.some((stage)=>stage.actualMemberIds.length===0))return [`В екіпажі «${crew.name}» є етап без доступного складу.`];const blocked=stages.flatMap((stage)=>stage.actualMemberIds.flatMap((id)=>{const member=members.get(id);if(member&&!isFlightPlanMemberAvailable(member))return[`${member.fullName} — ${member.currentLocation}`];if(!member){const snapshot=stage.memberSnapshots?.find((item)=>item.personnelId===id);return[`${snapshot?.fullName||`учасник №${id}`} — відсутній у поточному складі екіпажу`];}return[];}));return [...new Set(blocked)].map((value)=>`Екіпаж «${crew.name}»: ${value}.`);}),[crews,entries,rotations,selected]);
  const selectedEntries=useMemo(()=>selected.flatMap((id)=>{const crew=crews.find((item)=>item.id===id);const entry=entries[id];if(!crew||!entry)return[];const position=positions.find((item)=>item.id===crew.positionId);const snapshot=(stage:FlightPlanEntry):FlightPlanEntry=>({...stage,crewName:crew.name,crewUavType:crew.uavType,positionId:position?.id??crew.positionId,positionName:position?.name||crew.positionName,positionMgrs:position?.mgrs||"",positionLocality:position?.locality||"",workStrip:position?.stripName||crew.sector,battleOrder:position?.battleOrder||crew.battleOrder,uavSnapshots:(stage.uavSelections??[]).flatMap((selection)=>{const uav=uavs.find((item)=>item.id===selection.equipmentId);return uav?[{equipmentId:uav.id,name:uav.name,serialNumber:uav.inventoryNumber}]:[]}),memberSnapshots:(stage.actualMemberIds??[]).flatMap((personnelId)=>{const member=[...(crew.members??[]),...(crew.actualMembers??[])].find((item)=>item.personnelId===personnelId);if(member)return[{personnelId,fullName:member.fullName,rank:member.rank}];const previous=stage.memberSnapshots?.find((item)=>item.personnelId===personnelId);return previous?[previous]:[];})});return[snapshot(entry),...(rotations[id]??[]).map(snapshot)];}),[crews,entries,positions,rotations,selected,uavs]);
  useEffect(()=>{if(!loaded||hasInvalidSelectedSchedule||invalidSelectedMemberState.length||!/^\d{2}\.\d{2}\.\d{4}$/u.test(date))return;const timer=window.setTimeout(()=>{void operationsService.saveFlightPlanSnapshot(isoDate(date),{unitName,entries:selectedEntries}).catch(()=>notify("Не вдалося зберегти знімок плану польотів.","error"));},350);return()=>window.clearTimeout(timer);},[date,hasInvalidSelectedSchedule,invalidSelectedMemberState.length,loaded,notify,selectedEntries,unitName]);
  const rows=useMemo(()=>flightPlanPreviewRows(unitName,selectedEntries,crews,uavs,vehicles,ammunition,workshopProducts),[ammunition,crews,selectedEntries,uavs,unitName,vehicles,workshopProducts]);
  const patchEntry=(crewId:number,patch:Partial<FlightPlanEntry>)=>setEntries((current)=>({...current,[crewId]:{...current[crewId],...patch}}));
  const patchRotation=(crewId:number,rotationId:string,patch:Partial<FlightPlanEntry>)=>setRotations((current)=>({...current,[crewId]:(current[crewId]??[]).map((rotation)=>rotation.rotationId===rotationId?{...rotation,...patch}:rotation)}));
  const saveRotation=(crewId:number,memberIds:number[],commanderId:number,rotationId?:string)=>setRotations((current)=>{const existing=current[crewId]??[];if(rotationId)return{...current,[crewId]:existing.map((rotation)=>rotation.rotationId===rotationId?{...rotation,actualMemberIds:memberIds,actualCommanderId:commanderId}:rotation)};const source=existing[existing.length-1]??entries[crewId];if(!source)return current;const next={...cloneEntry(source),rotationId:`${crewId}-${Date.now()}`,actualMemberIds:memberIds,actualCommanderId:commanderId,startTime:nextRotationTime(source),arrivesToday:false,departsToday:false,departureTime:""};return{...current,[crewId]:[...existing,next]};});
  const deleteRotation=(crewId:number,rotationId:string)=>{const existing=rotations[crewId]??[];const index=existing.findIndex((rotation)=>rotation.rotationId===rotationId);const previous=index>0?existing[index-1]:entries[crewId];const next=existing[index+1];if(previous&&next&&sameComposition(previous,next)){notify(`Не можна видалити ротацію ${index+1} екіпажу «${crews.find((crew)=>crew.id===crewId)?.name||crewId}»: сусідні етапи матимуть однаковий склад.`,"error");return;}setRotations((current)=>({...current,[crewId]:(current[crewId]??[]).filter((rotation)=>rotation.rotationId!==rotationId)}));};
  const toggleCrew=(crewId:number)=>{
    const entry=entries[crewId];
    const confirmedArrival=Boolean(entry?.arrivesToday&&flightPlanTransitionHasHappened(date,entry.startTime));
    if(selected.includes(crewId)&&(confirmedPresentCrewIds.has(crewId)||confirmedArrival)){
      const crewName=crews.find((crew)=>crew.id===crewId)?.name||String(crewId);
      const reason=confirmedPresentCrewIds.has(crewId)?"перебуває на позиції за попереднім планом":`заїхав на позицію о ${entry.startTime}`;
      notify(`Екіпаж «${crewName}» підтверджено ${reason}. Щоб вивести його, позначте «Виїжджає з позиції у день плану» та вкажіть час. Екіпаж залишиться в плані до наступного дня.`,"error");
      return;
    }
    setSelected((current)=>current.includes(crewId)?current.filter((id)=>id!==crewId):[...current,crewId]);
  };
  const exportPlan=async()=>{
    if(!selectedEntries.length){notify("Оберіть хоча б один екіпаж.","error");return;}
    if(selectedMissing.length){notify("Заповніть позивні всіх офіційних і фактичних учасників вибраних екіпажів.","error");return;}
    for(const crewId of selected){
      const crewName=crews.find((crew)=>crew.id===crewId)?.name||String(crewId);
      const validation=scheduleValidations[crewId];
      if(validation&&!validation.isValid){
        const message=entries[crewId]?.departsToday&&!entries[crewId]?.departureTime
          ? `Вкажіть плановий час виїзду екіпажу «${crewName}».`
          : `Екіпаж «${crewName}»: ${validation.departureError??validation.rotationError}`;
        notify(message,"error");return;
      }
      const stages=[entries[crewId],...(rotations[crewId]??[])].filter((entry):entry is FlightPlanEntry=>Boolean(entry));
      for(let index=1;index<stages.length;index+=1){
        if(sameComposition(stages[index-1],stages[index])){notify(`Екіпаж «${crewName}», ротація ${index}: склад має відрізнятися від попереднього етапу.`,"error");return;}
      }
    }
    if(invalidSelectedMemberState.length){notify(invalidSelectedMemberState[0],"error");return;}
    const incomplete=selectedEntries.some((entry)=>!entry.routePoints.length||!entry.areaPoints.length||!entry.altitudeFrom||!entry.altitudeTo||!entry.startTime||!entry.endTime);
    if(incomplete){notify("Заповніть маршрут, район, висоту та час роботи для кожного вибраного екіпажу.","error");return;}
    const defaultPath=`${unitName}_${date}_План_польотів.xlsx`;
    const path=await save({title:"Експорт плану польотів",defaultPath,filters:[{name:"Таблиця Excel",extensions:["xlsx"]}]});
    if(!path)return;
    setExporting(true);
    try{await operationsService.exportFlightPlan(path.endsWith(".xlsx")?path:`${path}.xlsx`,{unitName,entries:selectedEntries});notify("План польотів сформовано за наданим шаблоном.","success");}catch(error){notify(typeof error==="string"?error:"Не вдалося сформувати план польотів.","error");}finally{setExporting(false);}
  };

  return <PageFrame className="flight-planning-page" header={<PageTitle title="План польотів" subtitle="Підготовка екіпажів, маршрутів і засобів для виконання завдань" />} tools={<div className="flight-plan-toolbar"><span>Вибрано екіпажів: <b>{selected.length}</b></span><button className="button" onClick={()=>setParametersOpen(true)}><Settings2/>Параметри плану польотів</button></div>}>
    {!loaded?<CardGridSkeleton count={4}/>:<div className="flight-planning-layout"><div className="flight-planning-layout__preview"><FlightPlanTable rows={rows} zoom={zoom}/></div><div className="flight-planning-layout__settings"><FlightPlanParametersModal crews={crews} vehicles={vehicles} uavs={uavs} ammunition={ammunition} workshopProducts={workshopProducts} selected={selected} entries={entries} rotations={rotations} validations={scheduleValidations} missingCallsignCount={missingCallsigns.length} onToggle={toggleCrew} onPatch={patchEntry} onPatchRotation={patchRotation} onSaveRotation={saveRotation} onDeleteRotation={deleteRotation}/></div></div>}
    {parametersOpen&&<Modal title="Параметри плану польотів" subtitle="Зміни зберігаються автоматично та прив’язуються до кожного екіпажу." onClose={()=>setParametersOpen(false)} className="flight-plan-parameters-modal"><div className="flight-plan-general-modal"><section className="flight-plan-parameters__general"><label className="form-field"><span>Коротка назва підрозділу</span><input value={unitName} onChange={(event)=>setUnitName(event.target.value)}/></label><label className="form-field"><span>Дата виконання плану</span><input readOnly value={date}/><small>План готується сьогодні на завтра. У день виконання знімок автоматично активує БЧС.</small></label><label className="form-field"><span>Масштаб таблиці · {zoom}%</span><input type="range" min="35" max="100" step="5" value={zoom} onChange={(event)=>setZoom(Number(event.target.value))}/></label></section><footer className="modal-actions"><button data-modal-enter-action className="button" onClick={()=>setParametersOpen(false)}>Закрити</button><button className="button primary" onClick={()=>void exportPlan()} disabled={exporting||!selected.length}><Download/>{exporting?"Формування…":"Експорт плану"}</button></footer></div></Modal>}
  </PageFrame>;
}
