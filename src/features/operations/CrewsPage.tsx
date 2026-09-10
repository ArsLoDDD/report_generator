import { Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Person } from "../../shared/types/domain";
import { Modal } from "../../shared/ui/Modal";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Select } from "../../shared/ui/Select";
import { RegistryToolbar } from "../../shared/ui/RegistryToolbar";
import { CardGridSkeleton } from "../../shared/ui/entity-card/CardGridSkeleton";
import { EntityCard, EntityCardGrid } from "../../shared/ui/entity-card/EntityCard";
import { RecordPickerModal } from "../../shared/ui/record-picker/RecordPickerModal";
import { personnelService } from "../../shared/services/personnelService";
import { operationsService } from "./services/operationsService";
import type { Crew, CrewDraft, Equipment, Position } from "./types";

const emptyDraft = (): CrewDraft => ({ name:"",platoon:"",positionName:"",reconnaissanceArea:"",unitType:"Екіпаж",companyName:"",battleOrder:"",sector:"",officialStrength:0,workingStrength:0,positionId:null,status:"Формується",uavName:"",uavType:"",functionalDuties:"",currentLocation:"",notes:"",memberIds:[],actualMemberIds:[] });
const statuses = ["Працюючий", "Формується", "Не активний"];
const uavTypes = ["Літаковий Ударний", "Літаковий Розвідувальний", "Коптер", "Бомбер", "ФПВ", "НРК", "ФПВ Перехоплювач"];
const includes = (query:string,...values:(string|null|undefined)[]) => values.join(" ").toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"));
async function allPersonnel(){const result:Person[]=[];let offset=0;while(true){const page=await personnelService.list(offset,500);result.push(...page.items);offset=result.length;if(offset>=page.totalCount||!page.items.length)return result;}}

export function CrewsPage({ people }: { people: Person[] }) {
  const [items,setItems]=useState<Crew[]>([]); const [positions,setPositions]=useState<Position[]>([]); const [query,setQuery]=useState(""); const [isLoading,setIsLoading]=useState(true);
  const [editing,setEditing]=useState<Crew|null>(null); const [draft,setDraft]=useState<CrewDraft>(emptyDraft); const [open,setOpen]=useState(false); const [memberTab,setMemberTab]=useState<"official"|"actual">("official");
  const [availablePeople,setAvailablePeople]=useState<Person[]>(people); const [pickerOpen,setPickerOpen]=useState(false);
  const [deleting,setDeleting]=useState<Crew|null>(null); const [deletingBusy,setDeletingBusy]=useState(false);
  const [uavs,setUavs]=useState<Equipment[]>([]);const [uavPickerOpen,setUavPickerOpen]=useState(false);const [pendingUav,setPendingUav]=useState<Equipment|null>(null);
  const {notify}=useNotifications();
  const reload=useCallback(()=>{setIsLoading(true);void Promise.all([operationsService.listCrews(),operationsService.listPositions(),allPersonnel(),operationsService.listEquipment("uav")]).then(([crews,nextPositions,nextPeople,nextUavs])=>{setItems(crews);setPositions(nextPositions);setAvailablePeople(nextPeople);setUavs(nextUavs);}).catch(()=>notify("Не вдалося завантажити екіпажі.","error")).finally(()=>setIsLoading(false));},[notify]);
  useEffect(reload,[reload]);
  const filtered=useMemo(()=>items.filter((crew)=>includes(query,crew.name,crew.status,crew.sector,crew.uavName,crew.uavType,crew.positionName)),[items,query]);
  const close=()=>{setOpen(false);setEditing(null);setDraft(emptyDraft());setMemberTab("official");setPickerOpen(false);};
  const edit=(crew?:Crew)=>{setEditing(crew??null);setDraft(crew?{...crew,memberIds:crew.members.map((m)=>m.personnelId),actualMemberIds:crew.actualMembers.map((m)=>m.personnelId)}:emptyDraft());setOpen(true);};
  const save=async()=>{try{const payload={...draft,officialStrength:draft.memberIds.length,workingStrength:draft.actualMemberIds.length};if(editing)await operationsService.updateCrew(editing.id,payload);else await operationsService.createCrew(payload);close();reload();notify("Екіпаж збережено.","success");}catch(error){notify(typeof error==="string"?error:"Не вдалося зберегти екіпаж.","error");}};
  const remove=async()=>{if(!deleting)return;setDeletingBusy(true);try{await operationsService.deleteCrew(deleting.id);setDeleting(null);reload();notify("Екіпаж видалено.","success");}catch{notify("Не вдалося видалити екіпаж.","error");}finally{setDeletingBusy(false);}};
  const assignUav=async(uav:Equipment,crewId:number|null)=>{try{await operationsService.assignEquipment(uav.id,crewId);setPendingUav(null);setUavPickerOpen(false);reload();notify(crewId?"БпЛА закріплено за екіпажем.":"БпЛА знято з екіпажу.","success");}catch{notify("Не вдалося змінити прив’язку БпЛА.","error");}};
  const memberIds=memberTab==="official"?draft.memberIds:draft.actualMemberIds;
  const selectedPeople=memberIds.map((id)=>availablePeople.find((person)=>person.id===id)).filter((person):person is Person=>!!person);
  const assignment=(personId:number)=>items.find((crew)=>crew.id!==editing?.id&&(memberTab==="official"?crew.members:crew.actualMembers).some((member)=>member.personnelId===personId));
  const toggle=(id:number)=>setDraft((current)=>{
    if(memberTab==="actual") return {...current,actualMemberIds:current.actualMemberIds.includes(id)?current.actualMemberIds.filter((value)=>value!==id):[...current.actualMemberIds,id]};
    if(current.memberIds.includes(id)) return {...current,memberIds:current.memberIds.filter((value)=>value!==id)};
    return {...current,memberIds:[...current.memberIds,id],actualMemberIds:current.actualMemberIds.includes(id)?current.actualMemberIds:[...current.actualMemberIds,id]};
  });
  return <PageFrame className="crews-page" header={<PageTitle title="Екіпажі" subtitle="Єдиний облік екіпажів, позицій та складу для БЧС" actions={<button className="button primary" onClick={()=>edit()}><Plus/>Створити екіпаж</button>}/>} tools={<RegistryToolbar placeholder="Пошук за назвою, статусом, сектором, БпАК або позицією…" query={query} onQueryChange={setQuery} resultCount={filtered.length}/>}>
    <EntityCardGrid className="crews-grid">{filtered.map((crew)=><EntityCard className={`crew-card crew-card--${crew.status==="Працюючий"?"working":crew.status==="Формується"?"forming":"inactive"}`} key={crew.id}>
      <header><div><span className="crew-card__status">{crew.status}</span><h2>{crew.name}</h2></div><strong title="Фактичний / офіційний склад">{crew.actualMembers.length}/{crew.members.length}</strong></header>
      <div className="crew-card__facts"><div><small>Сектор роботи</small><b>{crew.sector||"Не вказано"}</b></div><div><small>Позиція</small><b>{crew.positionName||"Не обрана"}</b></div><div><small>БпАК</small><b>{crew.uavName||"Не вказано"}</b></div><div><small>Тип БпАК</small><b>{crew.uavType||"Не вказано"}</b></div></div>
      <div className="crew-card__members"><div><span>Офіційний склад</span><b>{crew.members.length}</b></div><div><span>Фактичний склад</span><b>{crew.actualMembers.length}</b></div></div>
      <footer><button className="button" onClick={()=>edit(crew)}><Pencil/>Редагувати</button><button className="icon-button danger" title="Видалити екіпаж" onClick={()=>setDeleting(crew)}><Trash2/></button></footer>
    </EntityCard>)}{!filtered.length&&<section className="panel personnel-state"><UsersRound/><b>Екіпажів поки немає</b><span>Створіть екіпаж і сформуйте його склад.</span></section>}</EntityCardGrid>
    {isLoading&&<div className="operations-loading-overlay"><CardGridSkeleton/></div>}
    {open&&<Modal title={editing?"Редагування екіпажу":"Новий екіпаж"} onClose={close} className="crew-editor"><div className="crew-editor__body"><div className="operation-editor__body">
      <label className="form-field"><span>Назва <b>*</b></span><input autoFocus value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})}/></label>
      <label className="form-field"><span>Статус</span><Select ariaLabel="Статус екіпажу" value={draft.status} onChange={(status)=>setDraft({...draft,status})} options={statuses.map((value)=>({value,label:value}))}/></label>
      <label className="form-field"><span>Сектор роботи</span><input value={draft.sector} onChange={(e)=>setDraft({...draft,sector:e.target.value})}/></label>
      <label className="form-field"><span>Позиція</span><Select ariaLabel="Позиція екіпажу" value={draft.positionId?.toString()??""} onChange={(value)=>setDraft({...draft,positionId:value?Number(value):null})} options={[{value:"",label:"Не обрана"},...positions.map((position)=>({value:String(position.id),label:`${position.name} · ${position.positionType}`}))]}/><small>Одну позицію можуть використовувати декілька екіпажів.</small></label>
      <label className="form-field"><span>Назва БпАК</span><input value={draft.uavName} onChange={(e)=>setDraft({...draft,uavName:e.target.value})}/></label>
      <label className="form-field"><span>Тип БпАК</span><Select ariaLabel="Тип БпАК" value={draft.uavType} onChange={(uavType)=>setDraft({...draft,uavType})} options={[{value:"",label:"Не вказано"},...uavTypes.map((value)=>({value,label:value}))]}/></label>
      <label className="form-field form-field--wide"><span>Коментар</span><textarea value={draft.notes} onChange={(e)=>setDraft({...draft,notes:e.target.value})}/></label>
    </div>{editing&&<section className="crew-editor__uavs"><div className="crew-members-heading"><p><b>Закріплені БпЛА</b><br/>Один екіпаж може мати декілька типів і бортів.</p><button className="button" onClick={()=>setUavPickerOpen(true)}><Plus/>Додати БпЛА</button></div><div className="crew-selected-members">{uavs.filter((uav)=>uav.crewId===editing.id).map((uav)=><article key={uav.id}><div><b>{uav.name}</b><small>{uav.inventoryNumber||"Без номера"} · {uav.totalQuantity} шт (денні {uav.dayQuantity}, нічні {uav.nightQuantity})</small></div><button className="icon-button danger" title="Зняти з екіпажу" onClick={()=>void assignUav(uav,null)}><Trash2/></button></article>)}{!uavs.some((uav)=>uav.crewId===editing.id)&&<span>БпЛА ще не закріплені.</span>}</div></section>}<section className="crew-editor__members"><div className="crew-member-tabs"><button className={memberTab==="official"?"active":""} onClick={()=>setMemberTab("official")}>Офіційний склад <b>{draft.memberIds.length}</b></button><button className={memberTab==="actual"?"active":""} onClick={()=>setMemberTab("actual")}>Фактичний склад <b>{draft.actualMemberIds.length}</b></button></div><div className="crew-members-heading"><p>{memberTab==="official"?"Люди, офіційно закріплені за екіпажем.":"Люди, які зараз фактично виконують завдання у цьому екіпажі."}</p><button className="button" onClick={()=>setPickerOpen(true)}><Plus/>Додати людей</button></div><div className="crew-selected-members">{selectedPeople.map((person)=><article key={person.id}><div><b>{person.fullName}</b><small>{person.rank} · {person.position}</small></div><button className="icon-button danger" title="Прибрати зі складу" onClick={()=>toggle(person.id)}><Trash2/></button></article>)}{!selectedPeople.length&&<span>Склад ще не заповнений.</span>}</div></section></div><footer className="modal-actions"><button className="button" onClick={close}>Скасувати</button><button className="button primary" onClick={()=>void save()}>Зберегти екіпаж</button></footer></Modal>}
    {pickerOpen&&<RecordPickerModal title={memberTab==="official"?"Додати до офіційного складу":"Додати до фактичного складу"} items={availablePeople.map((person)=>{const current=assignment(person.id);return{id:person.id,title:person.fullName,subtitle:`${person.rank} · ${person.position}`,owner:current?`Зараз у «${current.name}» — буде переміщено`:undefined};})} selectedIds={memberIds} onToggle={toggle} onClose={()=>setPickerOpen(false)}/>}
    {uavPickerOpen&&editing&&<Modal title={`Додати БпЛА до «${editing.name}»`} onClose={()=>setUavPickerOpen(false)} className="crew-member-picker"><div className="crew-member-picker__body"><div className="crew-member-picker__list">{[...uavs].sort((a,b)=>Number(!!a.crewId)-Number(!!b.crewId)||a.name.localeCompare(b.name,"uk")).map((uav)=><button className={uav.crewId===editing.id?"selected":""} key={uav.id} onClick={()=>{if(uav.crewId&&uav.crewId!==editing.id)setPendingUav(uav);else void assignUav(uav,editing.id);}}><span><b>{uav.name}</b><small>{uav.inventoryNumber||"Без номера"} · {uav.totalQuantity} шт</small>{uav.crewId&&<em>{uav.crewId===editing.id?"Вже у цьому екіпажі":`Видано: ${uav.crewName}`}</em>}</span></button>)}</div></div></Modal>}
    {pendingUav&&editing&&<ConfirmDialog title="Перепризначити БпЛА?" message={`«${pendingUav.name}» зараз закріплено за екіпажем «${pendingUav.crewName}». Після підтвердження попередню прив’язку буде знято.`} confirmLabel="Перепризначити" onConfirm={()=>void assignUav(pendingUav,editing.id)} onCancel={()=>setPendingUav(null)}/>}
    {deleting&&<ConfirmDialog title="Видалити екіпаж?" message={`Екіпаж «${deleting.name}» буде видалено. Прив’язки його офіційного та фактичного складу буде знято.`} confirmLabel="Видалити" onConfirm={()=>void remove()} onCancel={()=>setDeleting(null)} busy={deletingBusy}/>}  </PageFrame>;
}
