import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Settings2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import { PageFrame } from "../../shared/ui/PageFrame";
import { CardGridSkeleton } from "../../shared/ui/entity-card/CardGridSkeleton";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { settingsService } from "../settings/services/settingsService";
import { vehiclesService } from "../vehicles/services/vehiclesService";
import type { Vehicle } from "../vehicles/types";
import { FlightPlanParametersModal } from "./FlightPlanParametersModal";
import { FlightPlanTable } from "./FlightPlanTable";
import { flightPlanPreviewRows, initialFlightEntry, missingCrewCallsigns } from "./flight-plan-model";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, FlightPlanEntry } from "./types";

const STORAGE_KEY="flight-plan-draft-v2";
const today=()=>{const value=new Date();return `${String(value.getDate()).padStart(2,"0")}.${String(value.getMonth()+1).padStart(2,"0")}.${value.getFullYear()}`;};
type StoredDraft={unitName?:string;date?:string;zoom?:number;selected?:number[];entries?:Record<number,FlightPlanEntry>};
const storedDraft=():StoredDraft=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)??"{}");}catch{return {};}};

export function FlightPlanningPage(){
  const {notify}=useNotifications();
  const [initial]=useState(storedDraft);
  const [crews,setCrews]=useState<Crew[]>([]);const [vehicles,setVehicles]=useState<Vehicle[]>([]);const [uavs,setUavs]=useState<Equipment[]>([]);
  const [unitName,setUnitName]=useState(initial.unitName??"");const [date,setDate]=useState(initial.date??today);const [zoom,setZoom]=useState(initial.zoom??75);
  const [entries,setEntries]=useState<Record<number,FlightPlanEntry>>(initial.entries??{});const [selected,setSelected]=useState<number[]>(initial.selected??[]);
  const [loaded,setLoaded]=useState(false);const [exporting,setExporting]=useState(false);
  const [parametersOpen,setParametersOpen]=useState(false);

  const load=useCallback(async()=>{try{const [allCrews,nextVehicles,nextUavs,settings]=await Promise.all([operationsService.listCrews(),vehiclesService.list(),operationsService.listEquipment("uav"),settingsService.get()]);const nextCrews=allCrews.filter((crew)=>crew.status.trim().toLocaleLowerCase("uk")==="працюючий");setCrews(nextCrews);setVehicles(nextVehicles);setUavs(nextUavs);setUnitName((current)=>current||settings.unit.shortName||settings.unit.fullName||"Підрозділ");setEntries((current)=>Object.fromEntries(nextCrews.map((crew)=>{const defaults=initialFlightEntry(crew,nextUavs);const stored=current[crew.id];return [crew.id,stored?{...defaults,...stored,uavSelections:stored.uavSelections??defaults.uavSelections,weather:{...defaults.weather,...stored.weather}}:defaults];})));setSelected((current)=>initial.selected===undefined?nextCrews.map((crew)=>crew.id):current.filter((id)=>nextCrews.some((crew)=>crew.id===id)));}catch{notify("Не вдалося завантажити дані для плану польотів.","error");}finally{setLoaded(true);}},[initial.selected,notify]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(loaded)localStorage.setItem(STORAGE_KEY,JSON.stringify({unitName,date,zoom,selected,entries}));},[date,entries,loaded,selected,unitName,zoom]);

  const missingCallsigns=useMemo(()=>missingCrewCallsigns(crews),[crews]);
  const selectedMissing=useMemo(()=>missingCrewCallsigns(crews.filter((crew)=>selected.includes(crew.id))),[crews,selected]);
  const selectedEntries=selected.map((id)=>entries[id]).filter((entry):entry is FlightPlanEntry=>Boolean(entry));
  const rows=useMemo(()=>flightPlanPreviewRows(unitName,selected,entries,crews,uavs,vehicles),[crews,entries,selected,uavs,unitName,vehicles]);
  const patchEntry=(crewId:number,patch:Partial<FlightPlanEntry>)=>setEntries((current)=>({...current,[crewId]:{...current[crewId],...patch}}));
  const toggleCrew=(crewId:number)=>setSelected((current)=>current.includes(crewId)?current.filter((id)=>id!==crewId):[...current,crewId]);
  const exportPlan=async()=>{if(!selectedEntries.length){notify("Оберіть хоча б один екіпаж.","error");return;}if(selectedMissing.length){notify("Заповніть позивні всіх офіційних і фактичних учасників вибраних екіпажів.","error");return;}const incomplete=selectedEntries.some((entry)=>!entry.routePoints.length||!entry.areaPoints.length||!entry.altitudeFrom||!entry.altitudeTo||!entry.startTime||!entry.endTime);if(incomplete){notify("Заповніть маршрут, район, висоту та час для кожного вибраного екіпажу.","error");return;}const defaultPath=`${unitName}_${date}_План_польотів.xlsx`;const path=await save({title:"Експорт плану польотів",defaultPath,filters:[{name:"Таблиця Excel",extensions:["xlsx"]}]});if(!path)return;setExporting(true);try{await operationsService.exportFlightPlan(path.endsWith(".xlsx")?path:`${path}.xlsx`,{unitName,entries:selectedEntries});notify("План польотів сформовано за наданим шаблоном.","success");}catch(error){notify(typeof error==="string"?error:"Не вдалося сформувати план польотів.","error");}finally{setExporting(false);}};

  return <PageFrame className="flight-planning-page" tools={<div className="flight-plan-toolbar"><span>Вибрано екіпажів: <b>{selected.length}</b></span><button className="button" onClick={()=>setParametersOpen(true)}><Settings2/>Параметри плану польотів</button></div>}>
    {!loaded?<CardGridSkeleton count={4}/>:<div className="flight-planning-layout"><div className="flight-planning-layout__preview"><FlightPlanTable rows={rows} zoom={zoom}/></div><div className="flight-planning-layout__settings"><FlightPlanParametersModal crews={crews} vehicles={vehicles} uavs={uavs} selected={selected} entries={entries} missingCallsignCount={missingCallsigns.length} onToggle={toggleCrew} onPatch={patchEntry}/></div></div>}
    {parametersOpen&&<Modal title="Параметри плану польотів" subtitle="Зміни зберігаються автоматично та прив’язуються до кожного екіпажу." onClose={()=>setParametersOpen(false)} className="flight-plan-parameters-modal"><div className="flight-plan-general-modal"><section className="flight-plan-parameters__general"><label className="form-field"><span>Коротка назва підрозділу</span><input value={unitName} onChange={(event)=>setUnitName(event.target.value)}/></label><label className="form-field"><span>Дата</span><input inputMode="numeric" maxLength={10} value={date} placeholder="дд.мм.рррр" onChange={(event)=>setDate(event.target.value.replace(/[^\d.]/gu,"").slice(0,10))}/></label><label className="form-field"><span>Масштаб таблиці · {zoom}%</span><input type="range" min="35" max="100" step="5" value={zoom} onChange={(event)=>setZoom(Number(event.target.value))}/></label></section><footer className="modal-actions"><button className="button" onClick={()=>setParametersOpen(false)}>Закрити</button><button className="button primary" onClick={()=>void exportPlan()} disabled={exporting||!selected.length}><Download/>{exporting?"Формування…":"Експорт плану"}</button></footer></div></Modal>}
  </PageFrame>;
}
