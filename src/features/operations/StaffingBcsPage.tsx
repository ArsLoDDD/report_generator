import { ChevronDown, ChevronRight, ClipboardList, FileText, Network, Route, Settings2, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { settingsService } from "../settings/services/settingsService";
import type { UnitSettings } from "../../shared/types/domain";
import { structureWithUnmappedPositions, usableUnitStructure } from "../../shared/unit-structure";
import { operationsService } from "./services/operationsService";
import type { Crew, StaffingRecord, TemporaryPerson, VacancyRecommendation } from "./types";
import { buildStaffSlots, actingForSlot, type StaffSlot, type SlotTransfer, type ActingChange } from "./staffing-slots";
import { StaffTransferModal } from "./StaffTransferModal";
import { BcsTable } from "./BcsTable";
import { TemporaryArrivalEditor } from "./TemporaryArrivalEditor";
import { BcsParametersModal } from "./BcsParametersModal";
import { bcsExportRows, bcsSection, specializedStructuralGroup, temporaryStaffingRecord } from "./bcs-model";

export { BCS_LOCATIONS } from "./bcs-model";

function bcsPositionName(slot: StaffSlot | undefined, fallback: string) {
  if (!slot) return fallback;
  if (!/^командир$/iu.test(slot.name.trim())) return slot.name;
  const context = `${slot.group} ${slot.section}`;
  if (/відділен/iu.test(context)) return "Командир відділення";
  if (/взвод/iu.test(context)) return "Командир взводу";
  if (/рот/iu.test(context)) return "Командир роти";
  return slot.name;
}

export function buildStaffingHierarchy(records: StaffingRecord[], _vacancies: string[] = [], unitKind: UnitSettings["kind"] = "Рота", structure = usableUnitStructure({ kind: unitKind, shortName: "", authorizedStrength: 0 }), unitContext?: UnitSettings) {
  const slots = buildStaffSlots(records, { kind: unitKind, shortName: "", authorizedStrength: 0, ...unitContext, structure });
  type Item = { kind: "person"; person: StaffingRecord; slot: StaffSlot } | { kind: "vacancy"; position: string; slot: StaffSlot };
  const sections = new Map<string, Map<string, Item[]>>();
  const add = (section: string, group: string, item: Item) => { const groups = sections.get(section) ?? new Map<string, Item[]>(); groups.set(group, [...(groups.get(group) ?? []), item]); sections.set(section, groups); };
  for (const slot of slots) {
    if (slot.occupants.length) slot.occupants.forEach((person) => add(slot.section, slot.group, { kind: "person", person, slot }));
    else add(slot.section, slot.group, { kind: "vacancy", position: slot.name, slot });
  }
  const matched = new Set(slots.flatMap((slot) => slot.occupants.map((person) => person.personnelId)));
  for (const person of new Map(records.map((person) => [person.personnelId, person])).values()) {
    if (!matched.has(person.personnelId)) add("Інші", "Посади поза структурою", { kind: "person", person, slot: { id: `unmapped-${person.personnelId}`, name: person.position, position: person.position, path: "Інші", section: "Інші", group: "Інші", occupants: [person] } });
  }
  return [...sections].map(([section, groups]) => ({ section, groups: [...groups].map(([name, items]) => ({ name, items, people: items.flatMap((item) => item.kind === "person" ? [item.person] : []), vacancies: items.flatMap((item) => item.kind === "vacancy" ? [item.position] : []) })) }));
}

function PersonCard({ person, onCopy }: { person: StaffingRecord; onCopy: (person: StaffingRecord) => void }) {
  return <article className="staff-person-card" role="button" tabIndex={0} title="Скопіювати звання, ПІБ та посаду" onClick={() => onCopy(person)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onCopy(person); } }}><div className="staff-person-card__head"><span>{person.rank || "без звання"}</span></div><b className="staff-person-card__name">{person.fullName}</b><p className="staff-person-card__position">{person.position}</p>{person.actingPosition && <div className="staff-person-card__acting"><span>Тимчасове виконання</span><b>{person.actingPosition}</b></div>}</article>;
}

function VacancyCard({ position, recommendation, actingPerson, onRecommendation }: { position: string; recommendation?: VacancyRecommendation; actingPerson?: StaffingRecord; onRecommendation: () => void }) {
  return <article className="staff-vacancy-card"><div className="staff-vacancy-card__position"><span>Вільна посада</span><b>{position}</b>{recommendation && <small>Рек. лист: {recommendation.fullName} · {recommendation.issuedAt}</small>}</div><div className="staff-vacancy-card__status"><span>Тимчасове виконання</span><b className={actingPerson ? "staff-vacancy-card__acting" : ""}>{actingPerson ? actingPerson.fullName : "ТВО відсутній"}</b>{actingPerson && <small>{actingPerson.rank || "Без звання"}</small>}</div><button className="button" onClick={onRecommendation}><FileText />Рек. лист</button></article>;
}

function StaffGroupRows({ group, records, slots, recommendations, onRecommendation, onCopy }: { group: ReturnType<typeof buildStaffingHierarchy>[number]["groups"][number]; records: StaffingRecord[]; slots: StaffSlot[]; recommendations: VacancyRecommendation[]; onRecommendation: (slot: StaffSlot) => void; onCopy: (person: StaffingRecord) => void }) {
  return <div className="staff-people">{group.items.map((item) => item.kind === "person" ? <PersonCard key={item.person.personnelId} person={item.person} onCopy={onCopy} /> : <VacancyCard key={item.slot.id} position={item.position} actingPerson={actingForSlot(item.slot, records, slots)[0]} recommendation={recommendations.find((recommendation) => recommendation.slotId === item.slot.id)} onRecommendation={() => onRecommendation(item.slot)} />)}</div>;
}

function StaffingLoadingSkeleton({ bcs = false }: { bcs?: boolean }) {
  if (bcs) return <section className="bcs-loading-skeleton" aria-label="Завантаження БЧС"><div className="skeleton-line skeleton-line--title" /><div className="skeleton-line skeleton-line--wide" />{Array.from({ length: 9 }, (_, index) => <div className="bcs-loading-skeleton__row" key={index}>{Array.from({ length: 8 }, (__, cell) => <i className="skeleton-line" key={cell} />)}</div>)}</section>;
  return <section className="staff-loading-skeleton" aria-label="Завантаження штатки">{Array.from({ length: 3 }, (_, section) => <article key={section}><div className="skeleton-line skeleton-line--heading" /><div className="skeleton-line skeleton-line--short" />{Array.from({ length: section === 0 ? 4 : 3 }, (__, row) => <div className="staff-loading-skeleton__row" key={row}><i className="skeleton-line skeleton-line--rank" /><i className="skeleton-line skeleton-line--name" /><i className="skeleton-line skeleton-line--position" /></div>)}</article>)}</section>;
}

function VacancyRecommendationEditor({ positionName, onClose, onSaved }: { positionName: string; onClose: () => void; onSaved: (data: { positionName: string; fullName: string; phone: string; rank: string; birthDate: string; issuedAt: string; notes: string }) => Promise<void> }) {
  const [data, setData] = useState({ positionName, fullName: "", phone: "", rank: "", birthDate: "", issuedAt: new Date().toISOString().slice(0, 10), notes: "" });
  const set = (key: keyof typeof data, value: string) => setData((current) => ({ ...current, [key]: value }));
  return <Modal title={`Рекомендаційний лист · ${positionName}`} onClose={onClose} className="vacancy-recommendation-modal"><div className="operation-editor__body"><div className="vacancy-callout"><b>Вільна посада</b><span>{positionName}</span></div><label className="form-field"><span>ПІБ кандидата</span><input autoFocus value={data.fullName} onChange={(event) => set("fullName", event.target.value)} /></label><label className="form-field"><span>Телефон</span><input value={data.phone} onChange={(event) => set("phone", event.target.value)} /></label><label className="form-field"><span>Звання</span><input value={data.rank} onChange={(event) => set("rank", event.target.value)} /></label><label className="form-field"><span>Дата народження</span><input type="date" value={data.birthDate} onChange={(event) => set("birthDate", event.target.value)} /></label><label className="form-field"><span>Дата видачі</span><input type="date" value={data.issuedAt} onChange={(event) => set("issuedAt", event.target.value)} /></label><label className="form-field form-field--wide"><span>Примітка</span><textarea value={data.notes} onChange={(event) => set("notes", event.target.value)} /></label></div><footer className="modal-actions"><button className="button" onClick={onClose}>Скасувати</button><button className="button primary" onClick={() => void onSaved(data)}>Зберегти лист</button></footer></Modal>;
}

export function StaffingBcsPage() {
  const { notify } = useNotifications();
  const [temporaryPeople, setTemporaryPeople] = useState<TemporaryPerson[]>([]);
  const [externalDraft, setExternalDraft] = useState<Partial<TemporaryPerson> | null>(null);
  const [parametersOpen, setParametersOpen] = useState(false);
  const [bcsZoom, setBcsZoom] = useState(() => Number(localStorage.getItem("bcs-table-zoom")) || 70);
  const [records, setRecords] = useState<StaffingRecord[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [unit, setUnit] = useState<UnitSettings>({ kind: "Рота", shortName: "", authorizedStrength: 0 });
  const [vacancyRecommendations, setVacancyRecommendations] = useState<VacancyRecommendation[]>([]);
  const [bcsDate, setBcsDate] = useState(() => localStorage.getItem("bcs-date") || (() => { const date = new Date(); return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`; })());
  const [bcsUnitName, setBcsUnitName] = useState(() => localStorage.getItem("bcs-unit-name") || "");
  const [bcsFileName, setBcsFileName] = useState(() => localStorage.getItem("bcs-file-name") || "");
  const [tab, setTab] = useState<"staff" | "bcs">("staff");
  const [transferOpen, setTransferOpen] = useState(false);
  const [staffParametersOpen, setStaffParametersOpen] = useState(false);
  const [vacancyFor, setVacancyFor] = useState<StaffSlot | null>(null);
  const [collapseAllStaff, setCollapseAllStaff] = useState(() => localStorage.getItem("staffing-collapse-all") !== "false");
  const [collapsedStaffBlocks, setCollapsedStaffBlocks] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const reload = useCallback(async () => { setIsLoading(true); try { const [nextRecords, nextSettings, recommendations, externals, nextCrews] = await Promise.all([operationsService.listStaffingRecords(), settingsService.get(), operationsService.listVacancyRecommendations(), operationsService.listTemporaryPersonnel(), operationsService.listCrews()]); const nextUnit=nextSettings.unit ?? { kind: "Рота" as const, shortName: "", authorizedStrength: 0 }; const defaultName = nextUnit.shortName || nextUnit.fullName || "Підрозділ"; setRecords(nextRecords); setUnit(nextUnit); setBcsUnitName((current)=>current||defaultName); setBcsFileName((current)=>current||`${defaultName} ${bcsDate}`); setVacancyRecommendations(recommendations); setTemporaryPeople(externals); setCrews(nextCrews); } catch { notify("Не вдалося завантажити штат та БЧС.", "error"); } finally { setIsLoading(false); } }, [bcsDate, notify]);
  useEffect(() => { void reload(); }, [reload]);
  const structure = useMemo(() => structureWithUnmappedPositions(unit, records.map((person) => ({ position: person.position, slotId: person.staffSlotId }))), [unit, records]);
  const slots = useMemo(() => buildStaffSlots(records, { ...unit, structure }), [records, unit, structure]);
  const hierarchy = useMemo(() => buildStaffingHierarchy(records, [], unit.kind, structure, unit), [records, structure, unit]);
  const staffBlockIds = useMemo(() => hierarchy.flatMap((section) => [`section:${section.section}`, ...section.groups.map((group) => `group:${section.section}:${group.name}`)]), [hierarchy]);
  const isStaffBlockCollapsed = (id: string) => collapseAllStaff || collapsedStaffBlocks.includes(id);
  const setAllStaffCollapsed = (collapsed: boolean) => { setCollapseAllStaff(collapsed); setCollapsedStaffBlocks(collapsed ? staffBlockIds : []); localStorage.setItem("staffing-collapse-all", String(collapsed)); };
  const toggleStaffBlock = (id: string) => {
    if (collapseAllStaff) {
      const parentSectionId = id.startsWith("group:") ? `section:${id.split(":")[1]}` : id;
      setCollapseAllStaff(false);
      localStorage.setItem("staffing-collapse-all", "false");
      setCollapsedStaffBlocks(staffBlockIds.filter((item) => item !== id && item !== parentSectionId));
      return;
    }
    setCollapsedStaffBlocks((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const copyStaffPerson = async (person: StaffingRecord) => { const [surname = "", ...names] = person.fullName.trim().split(/\s+/u); const text = [person.rank, `${surname.toLocaleUpperCase("uk")} ${names.join(" ")}`.trim(), person.position].filter(Boolean).join(" "); try { await navigator.clipboard.writeText(text); notify("Дані військовослужбовця скопійовано.", "success"); } catch { notify("Не вдалося скопіювати дані.", "error"); } };
  const bcsRecords = useMemo(() => { const people=records.map((person) => { const slot=slots.find((item)=>item.id===person.staffSlotId)||slots.find((item)=>item.occupants.some((occupant)=>occupant.personnelId===person.personnelId)); const special=slot?specializedStructuralGroup(slot.section,slot.group):undefined; const bcsStructureKind=slot?(slot.section==="Управління роти"?"company":special?"special":"ordinary"):undefined; return {...person,position:bcsPositionName(slot,person.position),bcsGroupName:special,bcsStructureKind,bcsOrder:slot?slots.indexOf(slot):Number.MAX_SAFE_INTEGER}; }); const shown=new Set(people.flatMap((person)=>person.crewId&&bcsSection(person)==="Екіпаж"?[person.crewId]:[])); const placeholders:StaffingRecord[]=crews.filter((crew)=>!shown.has(crew.id)).map((crew)=>({isCrewPlaceholder:true,personnelId:-1_000_000-crew.id,fullName:"",rank:"",position:"",crewId:crew.id,crewName:crew.name,platoon:crew.platoon,companyName:crew.companyName,unitType:"Екіпаж",crewPositionName:crew.positionName,battleOrder:crew.battleOrder,sector:crew.sector,officialStrength:crew.members.length,actualStrength:crew.members.length,workingStrength:crew.actualMembers.length,crewStatus:crew.status,uavName:crew.uavName,uavType:crew.uavType,functionalDuties:"",currentLocation:"",bcsStatus:"",notes:"",actingPosition:"",recommendationCount:0})); return [...people,...placeholders,...temporaryPeople.map(temporaryStaffingRecord)]; }, [records, slots, temporaryPeople, crews]);
  const saveBcsPerson = async (person: StaffingRecord, patch: { currentLocation?: string; notes?: string; functionalDuties?: string }) => { try { if (person.isExternal) { const external = temporaryPeople.find((item) => item.id === -person.personnelId); if (!external) return; await operationsService.saveTemporaryPersonnel({ ...external, currentLocation: patch.currentLocation ?? external.currentLocation, notes: patch.notes ?? external.notes, duties: patch.functionalDuties ?? external.duties }); } else { const original = records.find((item) => item.personnelId === person.personnelId) ?? person; await operationsService.updateStaffingPersonnel({ personnelId: person.personnelId, position: original.position, actingPosition: person.actingPosition, currentLocation: patch.currentLocation ?? person.currentLocation, functionalDuties: patch.functionalDuties ?? person.functionalDuties, notes: patch.notes ?? person.notes }); } await reload(); } catch { notify("Не вдалося зберегти дані БЧС.", "error"); } };
  const saveChain = async (assignments: SlotTransfer[], actingChanges: ActingChange[]) => { try { await operationsService.transferStaffingChain(assignments, actingChanges); setTransferOpen(false); await reload(); notify("Переміщення застосовано.", "success"); } catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); } };
  const saveVacancyRecommendation = async (data: { positionName: string; fullName: string; phone: string; rank: string; birthDate: string; issuedAt: string; notes: string }) => { try { await operationsService.createVacancyRecommendation({ ...data, slotId: vacancyFor?.id }); setVacancyFor(null); await reload(); notify("Рекомендаційний лист для вільної посади додано.", "success"); } catch (error) { notify(error instanceof Error ? error.message : "Не вдалося зберегти лист.", "error"); } };
  const setSavedBcsUnitName = (value: string) => { setBcsUnitName(value); localStorage.setItem("bcs-unit-name", value); };
  const setSavedBcsFileName = (value: string) => { setBcsFileName(value); localStorage.setItem("bcs-file-name", value); };
  const setSavedBcsDate = (value: string) => { setBcsDate(value); localStorage.setItem("bcs-date", value); };
  const exportBcs = async () => { try { const baseName = bcsFileName.trim() || `${unit.shortName || unit.fullName || "Підрозділ"} ${bcsDate}`; const path = await save({ title: "Експорт БЧС", defaultPath: `${baseName.replace(/\.xlsx$/iu, "")}.xlsx`, filters: [{ name: "Таблиця Excel", extensions: ["xlsx"] }] }); if (!path) return; await operationsService.exportBcs(path.endsWith(".xlsx") ? path : `${path}.xlsx`, bcsUnitName, bcsDate, bcsExportRows(bcsRecords)); notify("БЧС експортовано.", "success"); } catch (error) { notify(error instanceof Error ? error.message : "Не вдалося експортувати БЧС.", "error"); } };
  const setZoom = (value: number) => { setBcsZoom(value); localStorage.setItem("bcs-table-zoom", String(value)); };
  const deleteExternal = async (person: TemporaryPerson) => { try { await operationsService.deleteTemporaryPersonnel(person.id); await reload(); notify("Запис видалено з БЧС.", "success"); } catch (error) { notify(String(error), "error"); } };
  return <PageFrame className={`staffing-page ${tab === "bcs" ? "staffing-page--bcs" : ""}`} header={tab === "staff" ? <PageTitle title="Штат та БЧС" subtitle="Штат формується з посад, а БЧС — лише з актуальних даних програми" actions={<div className="staffing-actions"><button className="button" onClick={() => setStaffParametersOpen(true)}><Settings2 />Параметри штатки</button><button className="button primary" onClick={() => setTransferOpen(true)} disabled={!records.length}><Route />Переміщення</button></div>} /> : undefined} tools={<div className="staffing-tools"><div className="staffing-tabs"><button className={tab === "staff" ? "active" : ""} onClick={() => setTab("staff")}><UsersRound />Штат</button><button className={tab === "bcs" ? "active" : ""} onClick={() => setTab("bcs")}><ClipboardList />БЧС</button></div>{tab === "bcs" && <button className="button bcs-parameters-button" onClick={() => setParametersOpen(true)}><Settings2 />Параметри БЧС</button>}</div>}>
    {isLoading && <div className="operations-loading-overlay"><StaffingLoadingSkeleton bcs={tab === "bcs"} /></div>}
    {tab === "staff" ? <div className="staff-tree"><section className="panel staff-overview"><Network /><div><b>{unit.shortName || "Підрозділ"}</b><span>{unit.kind} · за штатом {unit.authorizedStrength || "не вказано"} · за списком {records.length}</span></div><strong>{records.length}/{unit.authorizedStrength || "—"}</strong></section><section className="staff-structure" aria-label="Структура штатних посад">{hierarchy.map((section) => { const sectionId = `section:${section.section}`; const sectionCollapsed = isStaffBlockCollapsed(sectionId); return <section className="staff-company" key={section.section}><header><button type="button" className="staff-block-toggle" aria-expanded={!sectionCollapsed} onClick={() => toggleStaffBlock(sectionId)}>{sectionCollapsed ? <ChevronRight /> : <ChevronDown />}<div><h2>{section.section}</h2><span>{section.groups.reduce((sum, group) => sum + group.people.length, 0)} осіб · {section.groups.reduce((sum, group) => sum + group.vacancies.length, 0)} вільних</span></div></button></header>{!sectionCollapsed && <div className="staff-platoons">{section.groups.map((group) => { const directGroup = group.name === section.section; const groupId = `group:${section.section}:${group.name}`; const groupCollapsed = !directGroup && isStaffBlockCollapsed(groupId); return <article className={directGroup ? "staff-group staff-group--direct" : "staff-group"} key={group.name}>{!directGroup && <h3><button type="button" className="staff-block-toggle" aria-expanded={!groupCollapsed} onClick={() => toggleStaffBlock(groupId)}>{groupCollapsed ? <ChevronRight /> : <ChevronDown />}<span>{group.name}</span></button></h3>}{!groupCollapsed && <StaffGroupRows group={group} records={records} slots={slots} recommendations={vacancyRecommendations} onRecommendation={setVacancyFor} onCopy={(person) => void copyStaffPerson(person)} />}</article>; })}</div>}</section>; })}</section><section className="panel recommendation-history"><header><FileText /><div><h2>Рекомендаційні листи</h2><p>Видано кандидатам на вільні штатні посади.</p></div></header>{vacancyRecommendations.length ? <div>{vacancyRecommendations.map((item) => <article key={`vacancy-${item.id}`}><b>{item.fullName}</b><span>Вільна посада · {item.positionName}</span><time>{item.issuedAt}</time><small>{[item.rank, item.phone].filter(Boolean).join(" · ") || "Дані не вказані"}</small></article>)}</div> : <p>Рекомендаційних листів ще немає.</p>}</section></div> : <div className="bcs-board"><BcsTable records={bcsRecords} authorized={unit.authorizedStrength} zoom={bcsZoom} onSave={saveBcsPerson} /></div>}
    {staffParametersOpen && <Modal title="Параметри штатки" onClose={() => setStaffParametersOpen(false)} className="staff-parameters-modal"><div className="staff-parameters-modal__body"><label className="staff-settings-toggle"><input type="checkbox" checked={collapseAllStaff} onChange={(event) => setAllStaffCollapsed(event.target.checked)} /><span className="staff-settings-toggle__switch" aria-hidden="true" /><span><b>Згорнути всі блоки</b><small>Коли увімкнено, штатка відкривається зі згорнутими розділами.</small></span></label></div><footer className="modal-actions"><button className="button primary" onClick={() => setStaffParametersOpen(false)}>Готово</button></footer></Modal>}
    {externalDraft && <TemporaryArrivalEditor initial={externalDraft} actingPositions={slots.filter((slot) => !slot.occupants.length && (!temporaryPeople.some((person) => person.id !== externalDraft.id && person.actingSlotId === slot.id) || externalDraft.actingSlotId === slot.id)).map((slot) => ({ id: slot.id, name: slot.position, label: `${slot.position} · ${slot.path}` }))} onClose={() => setExternalDraft(null)} onSave={async (person) => { try { await operationsService.saveTemporaryPersonnel(person); setExternalDraft(null); await reload(); notify("Запис БЧС збережено.", "success"); } catch (error) { notify(String(error), "error"); } }} />}
    {parametersOpen && <BcsParametersModal unitName={bcsUnitName} fileName={bcsFileName} date={bcsDate} zoom={bcsZoom} people={temporaryPeople} onUnitName={setSavedBcsUnitName} onFileName={setSavedBcsFileName} onDate={setSavedBcsDate} onZoom={setZoom} onAdd={(category) => { setParametersOpen(false); setExternalDraft({ category }); }} onEdit={(person) => { setParametersOpen(false); setExternalDraft(person); }} onDelete={deleteExternal} onExport={() => void exportBcs()} onClose={() => setParametersOpen(false)} />}
    {transferOpen && <StaffTransferModal records={records} slots={slots} onClose={() => setTransferOpen(false)} onSave={saveChain} />}
    {vacancyFor && <VacancyRecommendationEditor positionName={vacancyFor.position} onClose={() => setVacancyFor(null)} onSaved={saveVacancyRecommendation} />}
  </PageFrame>;
}
