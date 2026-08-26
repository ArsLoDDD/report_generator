import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCheck2, FileText, Folder, FolderOpen, CheckCircle2, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import type { Person, Template } from "../../shared/types/domain";
import { getGenerationParameter, getSelectionRequirements, type GenerationParameterField, type SelectionRequirement } from "../../shared/template-language/registry";
import { CheckBox } from "../../shared/ui/CheckBox";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { includesSearch } from "../../shared/utils/search";
import { useLoadMoreOnScroll } from "../../shared/hooks/useLoadMoreOnScroll";
import { useReportGeneration } from "./hooks/useReportGeneration";

type Props = { template: Template | null; templates: Template[]; hasMoreTemplates: boolean; isLoadingMoreTemplates: boolean; onLoadMoreTemplates: () => Promise<void>; people: Person[]; hasMorePeople: boolean; isLoadingMorePeople: boolean; onLoadMorePeople: () => Promise<void>; selected: number[]; onToggle: (id: number) => void; onAll: () => void; onClear: () => void; onChoose: (template: Template) => void };
type Vehicle = { id: number; name: string; registrationNumber: string; status: string; driverName: string | null };
type Crew = { id: number; name: string; platoon: string; positionName: string; reconnaissanceArea: string; memberCount: number };
type Equipment = { id: number; category: string; name: string; inventoryNumber: string; status: string; crewName: string | null; holderName: string | null };
type Position = { id:number; name:string; positionType:string; stripName:string; locality:string; condition:string; crewName:string|null };
type ParameterToken = { token: string; field: GenerationParameterField };
const today = () => new Date().toISOString().slice(0, 10);
const defaultParameterValue = (field: GenerationParameterField) => field.inputType === "date" ? today() : field.inputType === "boolean" ? "Ні" : "";
const tokenBase = (value: string) => value.split(":")[0];

function GenerationParameterFields({ parameters, values, onChange }: { parameters: ParameterToken[]; values: Record<string, string>; onChange: (token: string, value: string) => void }) {
  return <div className="generation-parameters-fields">
    {parameters.map(({ token, field }) => {
      const name = `${field.name}${token === field.id ? "" : ` №${token.slice(field.id.length + 1)}`}`;
      const control = field.inputType === "textarea"
        ? <textarea aria-label={name} value={values[token] ?? ""} onChange={(event) => onChange(token, event.target.value)} />
        : field.inputType === "boolean"
          ? <Select ariaLabel={name} value={values[token] ?? "Ні"} onChange={(value) => onChange(token, value)} options={[{ value: "Так", label: "Так" }, { value: "Ні", label: "Ні" }]} />
          : <input aria-label={name} type={field.inputType} value={values[token] ?? ""} onChange={(event) => onChange(token, event.target.value)} />;
      return <div className={`generation-parameter generation-parameter--${field.inputType}`} key={token}><span><b>{name}</b><code>{`{{${token}}}`}</code></span>{control}</div>;
    })}
  </div>;
}

function GenerationParametersModal({ parameters, values, onChange, onClose }: { parameters: ParameterToken[]; values: Record<string, string>; onChange: (token: string, value: string) => void; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-panel generation-parameters-modal" role="dialog" aria-modal="true" aria-label="Параметри значень">
      <header className="modal-header"><div><h2>Параметри значень</h2><p>Заповніть лише значення, потрібні для цього рапорту.</p></div><button className="icon-button" aria-label="Закрити" onClick={onClose}><X /></button></header>
      <div className="generation-parameters-modal__body"><GenerationParameterFields parameters={parameters} values={values} onChange={onChange} /></div>
      <footer className="modal-actions"><button className="button primary" onClick={onClose}>Готово</button></footer>
    </section>
  </div>;
}

function SelectionTable<T extends { id: number }>({ title, items, selected, onToggle, onAll, onClear, parametersButton, columns, values }: { title: string; items: T[]; selected: number[]; onToggle: (id: number) => void; onAll: () => void; onClear: () => void; parametersButton: React.ReactNode; columns: string[]; values: (item: T) => string[] }) {
  return <div className="panel people-select"><h2>{title}</h2><div className="people-select__scroll"><table><thead><tr><th></th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id} onClick={() => onToggle(item.id)} className={selected.includes(item.id) ? "selected-row" : ""}><td onClick={(event) => event.stopPropagation()}><CheckBox checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} /></td>{values(item).map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody></table></div><div className="selection-footer">Вибрано: <b className="green">{selected.length}</b><span />{parametersButton}<button className="button" onClick={onClear} disabled={!selected.length}>Очистити вибір</button><button className="button" onClick={onAll}>Вибрати всі</button></div></div>;
}

export function ReportGenerationPage({ template, templates, hasMoreTemplates, isLoadingMoreTemplates, onLoadMoreTemplates, people, hasMorePeople, isLoadingMorePeople, onLoadMorePeople, selected, onToggle, onClear, onChoose }: Props) {
  const { error, generatedReport, inspection, isGenerating, selectTemplateFile, inspectTemplate, validation, generate, openReport, openReportFolder, resetResult } = useReportGeneration();
  const { notify } = useNotifications();
  const [templateQuery, setTemplateQuery] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [positions,setPositions]=useState<Position[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<number[]>([]);
  const [selectedCrews, setSelectedCrews] = useState<number[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<number[]>([]);
  const [selectedPositions,setSelectedPositions]=useState<number[]>([]);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [parametersOpen, setParametersOpen] = useState(false);
  const [activeRequirement, setActiveRequirement] = useState<SelectionRequirement | null>(null);
  const parameters = useMemo<ParameterToken[]>(() => {
    const unique = [...new Set((inspection?.variables ?? []).map(tokenBase))];
    return unique.flatMap((token) => { const field = getGenerationParameter(token); return field ? [{ token, field }] : []; });
  }, [inspection?.variables]);
  const requirements = useMemo(() => getSelectionRequirements(inspection?.variables ?? []), [inspection?.variables]);
  const needsSelection = requirements.length > 0;
  const selectedFor = (requirement: SelectionRequirement) => requirement.id === "personnel" ? selected : requirement.id === "vehicle" ? selectedVehicles : requirement.id === "crew" ? selectedCrews : requirement.id === "position" ? selectedPositions : selectedEquipment.filter((id) => equipment.some((item) => item.id === id && item.category === requirement.category));
  const parametersReady = parameters.every(({ token }) => (parameterValues[token] ?? "").trim());
  const singleRequirement = requirements.length === 1 ? requirements[0] : null;
  const vehicleOnly = singleRequirement?.id === "vehicle";
  const crewOnly = singleRequirement?.id === "crew";
  const positionOnly = singleRequirement?.id === "position";
  const equipmentOnly = Boolean(singleRequirement?.category);
  const equipmentCategory = singleRequirement?.category ?? null;
  const selectionsReady = requirements.every((requirement) => selectedFor(requirement).length === requirement.count);
  const canGenerate = Boolean(template?.sourcePath && selectionsReady && parametersReady);
  const filteredTemplates = templates.filter((item) => includesSearch(templateQuery, item.name, item.description));
  const filteredPeople = people.filter((person) => includesSearch(personQuery, person.fullName, person.taxId, person.position, person.rank));
  const generationContext = useMemo(() => `${template?.sourcePath ?? ""}:${selected.join(",")}:${selectedVehicles.join(",")}:${selectedCrews.join(",")}:${selectedPositions.join(",")}:${selectedEquipment.join(",")}:${JSON.stringify(parameterValues)}`, [template?.sourcePath, selected, selectedVehicles, selectedCrews, selectedPositions, selectedEquipment, parameterValues]);
  const onTemplatesScroll = useLoadMoreOnScroll({ hasMore: hasMoreTemplates, isLoading: isLoadingMoreTemplates, loadMore: onLoadMoreTemplates });
  const onPeopleScroll = useLoadMoreOnScroll({ hasMore: hasMorePeople, isLoading: isLoadingMorePeople, loadMore: onLoadMorePeople });
  useEffect(() => { resetResult(); }, [generationContext, resetResult]);
  useEffect(() => { if (template?.sourcePath) void inspectTemplate(template.sourcePath); }, [template?.sourcePath, inspectTemplate]);
  useEffect(() => { void invoke<Vehicle[]>("list_vehicles").then((items) => setVehicles(Array.isArray(items) ? items : [])).catch(() => setVehicles([])); void invoke<Crew[]>("list_crews").then((items) => setCrews(Array.isArray(items) ? items : [])).catch(() => setCrews([])); void invoke<Position[]>("list_positions").then((items)=>setPositions(Array.isArray(items)?items:[])).catch(()=>setPositions([])); }, []);
  useEffect(() => { const categories = requirements.flatMap((item) => item.category ? [item.category] : []); if (!categories.length) { setEquipment([]); return; } void Promise.all(categories.map((category) => invoke<Equipment[]>("list_equipment", { category }))).then((groups) => setEquipment(groups.flat().filter((item) => item && typeof item.id === "number"))).catch(() => setEquipment([])); }, [requirements]);
  useEffect(() => { setParameterValues((current) => Object.fromEntries(parameters.map(({ token, field }) => [token, current[token] ?? defaultParameterValue(field)]))); }, [parameters]);
  useEffect(() => { if (error) notify(error, "error"); }, [error, notify]);
  useEffect(() => { if (validation && !validation.isValid) notify(validation.errors[0] ?? "Шаблон не пройшов перевірку.", "error"); }, [validation, notify]);
  useEffect(() => { if (generatedReport) notify("Рапорт створено.", "success"); }, [generatedReport, notify]);
  const openTemplate = async () => { const sourcePath = await selectTemplateFile(); if (!sourcePath) return; onChoose({ name: sourcePath.split("/").pop()?.replace(/\.docx$/i, "") ?? "Власний шаблон", description: "Шаблон, обраний з локального файлу", changed: "Щойно обрано", status: "ready", variables: 0, sourcePath }); };
  const updateLimited = (setter: Dispatch<SetStateAction<number[]>>, id: number, limit: number, closeWhenReady = true) => setter((current) => { const next = current.includes(id) ? current.filter((value) => value !== id) : limit === 1 ? [id] : current.length < limit ? [...current, id] : current; if (closeWhenReady && next.length === limit && !current.includes(id)) queueMicrotask(() => setActiveRequirement(null)); return next; });
  const toggleRequirement = (requirement: SelectionRequirement, id: number) => {
    const current = selectedFor(requirement);
    if (requirement.id === "personnel") { if (!current.includes(id) && requirement.count === 1 && current.length) { onClear(); queueMicrotask(() => onToggle(id)); setActiveRequirement(null); return; } if (current.includes(id) || current.length < requirement.count) onToggle(id); if (!current.includes(id) && current.length + 1 === requirement.count) setActiveRequirement(null); return; }
    if (requirement.id === "vehicle") updateLimited(setSelectedVehicles, id, requirement.count);
    else if (requirement.id === "crew") updateLimited(setSelectedCrews, id, requirement.count);
    else if(requirement.id==="position") updateLimited(setSelectedPositions,id,requirement.count);
    else setSelectedEquipment((all) => { const categoryIds = new Set(equipment.filter((item) => item.category === requirement.category).map((item) => item.id)); const otherCategories = all.filter((value) => !categoryIds.has(value)); const categorySelection = all.filter((value) => categoryIds.has(value)); if (categorySelection.includes(id)) return all.filter((value) => value !== id); if (requirement.count === 1) { queueMicrotask(() => setActiveRequirement(null)); return [...otherCategories, id]; } if (categorySelection.length >= requirement.count) return all; const next = [...all, id]; if (categorySelection.length + 1 === requirement.count) queueMicrotask(() => setActiveRequirement(null)); return next; });
  };
  const toggleVehicle = (id: number) => singleRequirement && updateLimited(setSelectedVehicles, id, singleRequirement.count, false);
  const toggleCrew = (id: number) => singleRequirement && updateLimited(setSelectedCrews, id, singleRequirement.count, false);
  const toggleEquipment = (id: number) => singleRequirement && toggleRequirement(singleRequirement, id);
  const parameterFields = parameters.length > 0 && <GenerationParameterFields parameters={parameters} values={parameterValues} onChange={(token, value) => setParameterValues((current) => ({ ...current, [token]: value }))} />;
  const parametersButton = parameters.length > 0 && <button className="button" onClick={() => setParametersOpen(true)}><SlidersHorizontal />Параметри значень</button>;
  const generateReport = () => { if (!template?.sourcePath) return; const categories = new Set(requirements.flatMap((item) => item.category ? [item.category] : [])); const equipmentIds = selectedEquipment.filter((id) => equipment.some((item) => item.id === id && categories.has(item.category))); generate(template.sourcePath, requirements.some((item) => item.id === "personnel") ? selected : [], parameterValues, requirements.some((item) => item.id === "vehicle") ? selectedVehicles : [], requirements.some((item) => item.id === "crew") ? selectedCrews : [], equipmentIds, requirements.some((item)=>item.id==="position")?selectedPositions:[]); };
  const requirementItems = (requirement: SelectionRequirement): Array<{ id: number; cells: string[]; summary: string }> => {
    if (requirement.id === "personnel") return filteredPeople.map((item) => ({ id: item.id, cells: [item.rank, item.fullName, item.position], summary: item.fullName }));
    if (requirement.id === "vehicle") return vehicles.map((item) => ({ id: item.id, cells: [item.name, item.registrationNumber, item.status, item.driverName ?? "—"], summary: `${item.name} · ${item.registrationNumber}` }));
    if (requirement.id === "crew") return crews.map((item) => ({ id: item.id, cells: [item.name, item.platoon || "—", item.positionName || "—", String(item.memberCount)], summary: item.name }));
    if(requirement.id==="position")return positions.map((item)=>({id:item.id,cells:[item.name,item.positionType,item.locality||"—",item.crewName??"—"],summary:item.name}));
    return equipment.filter((item) => item.category === requirement.category).map((item) => ({ id: item.id, cells: [item.name, item.inventoryNumber || "—", item.status, item.crewName ?? item.holderName ?? "—"], summary: `${item.name}${item.inventoryNumber ? ` · ${item.inventoryNumber}` : ""}` }));
  };
  const requirementColumns = (requirement: SelectionRequirement) => requirement.id === "personnel" ? ["Звання", "ПІБ", "Посада"] : requirement.id === "vehicle" ? ["Автомобіль", "Номер", "Стан", "Водій"] : requirement.id === "crew" ? ["Екіпаж", "Взвод", "Позиція", "Склад"] : requirement.id==="position"?["Позиція","Тип","Район","Екіпаж"] : ["Назва", "Інвентарний номер", "Стан", "Закріплено за"];
  const requirementsPanel = <div className="panel people-select generation-requirements"><div><h2>Дані для рапорту</h2><p>Оберіть усі потрібні записи. Кількість визначена змінними шаблону.</p></div><div className="generation-requirements__list">{requirements.map((requirement) => { const ids = selectedFor(requirement); const items = requirementItems(requirement).filter((item) => ids.includes(item.id)); return <button key={requirement.id} className={ids.length === requirement.count ? "generation-requirement generation-requirement--ready" : "generation-requirement"} onClick={() => setActiveRequirement(requirement)}><span><b>{requirement.label}</b><small>Потрібно: {requirement.count}</small></span><em>{items.length ? items.map((item) => item.summary).join(", ") : "Не обрано"}</em><strong>{ids.length}/{requirement.count}</strong><ChevronRight /></button>; })}</div><div className="selection-footer"><span />{parametersButton}</div></div>;
  return <PageFrame className="generation-page"><div className="generation-layout">
    <section className="panel template-picker"><div className="empty-template"><FileText size={75} /><h2 title={template?.name}>{template?.name ?? "Виберіть шаблон рапорту"}</h2><p>{template?.description ?? "Оберіть шаблон зі списку або відкрийте DOCX-файл"}</p></div><div className="panel-caption"><b>Доступні шаблони</b><SearchInput placeholder="Пошук шаблонів…" value={templateQuery} onChange={setTemplateQuery} /></div><div className="template-grid template-picker__scroll" onScroll={onTemplatesScroll}>{filteredTemplates.map((item) => <button onClick={() => onChoose(item)} key={item.sourcePath ?? item.name} aria-pressed={template?.sourcePath === item.sourcePath} className={`template-card ${template?.sourcePath === item.sourcePath ? "template-selected" : ""}`}><FileText /><div><b>{item.name}</b><p>{item.description}</p><small>Оновлено: {item.changed} · DOCX</small></div>{template?.sourcePath === item.sourcePath && <CheckCircle2 className="green" />}</button>)}{isLoadingMoreTemplates && <div className="infinite-loading">Завантаження наступних 20 шаблонів…</div>}</div><button className="file-open" onClick={openTemplate}><Folder />Відкрити шаблон з файлу…<small>Підтримувані формати: .docx</small></button></section>
    <section className="selection-column">{!template?.sourcePath ? <div className="panel people-select generation-empty-state"><div className="generation-empty-state__intro"><FileText /><h2>Оберіть шаблон</h2><p>Виберіть DOCX зі списку ліворуч — тут з’являться потрібні поля та вибір даних.</p></div><ol className="generation-empty-state__steps"><li><b>1</b><span><strong>Шаблон</strong><small>Оберіть потрібний DOCX</small></span></li><li><b>2</b><span><strong>Дані</strong><small>Позначте потрібні записи</small></span></li><li><b>3</b><span><strong>Рапорт</strong><small>Заповніть параметри й створіть файл</small></span></li></ol></div> : !needsSelection ? <div className="panel people-select generation-parameters-only"><h2>Параметри значень</h2><p>{parameters.length ? "Заповніть лише значення, потрібні для цього рапорту." : "Для цього шаблону не потрібно обирати дані або заповнювати додаткові значення."}</p><div className="generation-parameters-scroll">{parameterFields}</div></div> : requirements.length > 1 || positionOnly
      ? requirementsPanel
      : vehicleOnly ? <SelectionTable title="Вибір автомобілів" items={vehicles} selected={selectedVehicles} onToggle={toggleVehicle} onAll={() => setSelectedVehicles(vehicles.slice(0, singleRequirement?.count ?? 0).map((item) => item.id))} onClear={() => setSelectedVehicles([])} parametersButton={parametersButton} columns={["Автомобіль", "Номер", "Стан", "Водій"]} values={(item) => [item.name, item.registrationNumber, item.status, item.driverName ?? "—"]} /> : crewOnly ? <SelectionTable title="Вибір екіпажів" items={crews} selected={selectedCrews} onToggle={toggleCrew} onAll={() => setSelectedCrews(crews.slice(0, singleRequirement?.count ?? 0).map((item) => item.id))} onClear={() => setSelectedCrews([])} parametersButton={parametersButton} columns={["Екіпаж", "Взвод", "Позиція", "Склад"]} values={(item) => [item.name, item.platoon || "—", item.positionName || "—", String(item.memberCount)]} /> : equipmentOnly ? <SelectionTable title="Вибір майна" items={equipment} selected={selectedEquipment} onToggle={toggleEquipment} onAll={() => setSelectedEquipment(equipment.filter((item) => item.category === equipmentCategory).slice(0, singleRequirement?.count ?? 0).map((item) => item.id))} onClear={() => setSelectedEquipment([])} parametersButton={parametersButton} columns={["Назва", "Інвентарний номер", "Стан", "Закріплено за"]} values={(item) => [item.name, item.inventoryNumber || "—", item.status, item.crewName ?? item.holderName ?? "—"]} /> : <div className="panel people-select"><h2>Вибір військовослужбовців</h2><div className="table-tools"><SearchInput placeholder="Пошук за ПІБ, ІПН, посадою…" value={personQuery} onChange={setPersonQuery} /></div><div className="people-select__scroll" onScroll={onPeopleScroll}><table><thead><tr><th><CheckBox checked={selected.length === (singleRequirement?.count ?? 0)} onChange={() => undefined} /></th><th>Звання</th><th>ПІБ</th><th>Посада</th></tr></thead><tbody>{filteredPeople.map((person) => <tr key={person.id} onClick={() => singleRequirement && toggleRequirement(singleRequirement, person.id)} className={selected.includes(person.id) ? "selected-row" : ""}><td><CheckBox checked={selected.includes(person.id)} onChange={() => singleRequirement && toggleRequirement(singleRequirement, person.id)} /></td><td>{person.rank}</td><td>{person.fullName}</td><td>{person.position}</td></tr>)}</tbody></table>{isLoadingMorePeople && <div className="infinite-loading">Завантаження наступних 20 осіб…</div>}</div><div className="selection-footer">Вибрано: <b className="green">{selected.length}</b><span />{parametersButton}<button className="button" onClick={onClear} disabled={!selected.length}>Очистити вибір</button><button className="button" onClick={() => people.slice(0, singleRequirement?.count ?? 0).filter((person) => !selected.includes(person.id)).forEach((person) => onToggle(person.id))}>Обрати потрібну кількість</button></div></div>}<button className="generate-button" disabled={!canGenerate || isGenerating} onClick={generateReport}><FileCheck2 />{isGenerating ? "Створення рапорту…" : "Згенерувати рапорт"}</button>{!canGenerate && <p className="generate-hint">Оберіть шаблон{template?.sourcePath && needsSelection ? " і потрібні записи" : ""}{template?.sourcePath && parameters.length ? " та заповніть параметри значень" : ""}.</p>}{generatedReport && <div className="generation-result"><div><button className="button primary" onClick={() => void openReport(generatedReport.docxPath)}><FileText />Відкрити DOCX</button><button className="button" onClick={() => void openReportFolder(generatedReport.folderPath)}><FolderOpen />Відкрити папку</button></div></div>}</section>
  </div>{parametersOpen && <GenerationParametersModal parameters={parameters} values={parameterValues} onChange={(token, value) => setParameterValues((current) => ({ ...current, [token]: value }))} onClose={() => setParametersOpen(false)} />}{activeRequirement && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveRequirement(null); }}><section className="modal-panel generation-selection-modal" role="dialog" aria-modal="true" aria-label={`Вибір: ${activeRequirement.label}`}><header className="modal-header"><div><h2>{activeRequirement.label}</h2><p>Оберіть рівно {activeRequirement.count}. Зайві записи обрати неможливо.</p></div><button className="icon-button" aria-label="Закрити" onClick={() => setActiveRequirement(null)}><X /></button></header><div className="generation-selection-modal__body"><table><thead><tr><th></th>{requirementColumns(activeRequirement).map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{requirementItems(activeRequirement).map((item) => { const checked = selectedFor(activeRequirement).includes(item.id); return <tr key={item.id} className={checked ? "selected-row" : ""} onClick={() => toggleRequirement(activeRequirement, item.id)}><td onClick={(event) => event.stopPropagation()}><CheckBox checked={checked} onChange={() => toggleRequirement(activeRequirement, item.id)} /></td>{item.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>; })}</tbody></table></div><footer className="modal-actions"><span>Обрано: <b className="green">{selectedFor(activeRequirement).length}/{activeRequirement.count}</b></span><button className="button primary" disabled={selectedFor(activeRequirement).length !== activeRequirement.count} onClick={() => setActiveRequirement(null)}>Готово</button></footer></section></div>}</PageFrame>;
}
