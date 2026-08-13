import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCheck2, FileText, Folder, FolderOpen, CheckCircle2, SlidersHorizontal, X } from "lucide-react";
import type { Person, Template } from "../../shared/types/domain";
import { getGenerationParameter, type GenerationParameterField } from "../../shared/template-language/registry";
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
  return <div className="panel people-select"><h2>{title}</h2><div className="people-select__scroll"><table><thead><tr><th></th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id} onClick={() => onToggle(item.id)} className={selected.includes(item.id) ? "selected-row" : ""}><td><CheckBox checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} /></td>{values(item).map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody></table></div><div className="selection-footer">Вибрано: <b className="green">{selected.length}</b><span />{parametersButton}<button className="button" onClick={onClear} disabled={!selected.length}>Очистити вибір</button><button className="button" onClick={onAll}>Вибрати всі</button></div></div>;
}

export function ReportGenerationPage({ template, templates, hasMoreTemplates, isLoadingMoreTemplates, onLoadMoreTemplates, people, hasMorePeople, isLoadingMorePeople, onLoadMorePeople, selected, onToggle, onAll, onClear, onChoose }: Props) {
  const { error, generatedReport, inspection, isGenerating, selectTemplateFile, inspectTemplate, validation, generate, openReport, openReportFolder, resetResult } = useReportGeneration();
  const { notify } = useNotifications();
  const [templateQuery, setTemplateQuery] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<number[]>([]);
  const [selectedCrews, setSelectedCrews] = useState<number[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<number[]>([]);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [parametersOpen, setParametersOpen] = useState(false);
  const parameters = useMemo<ParameterToken[]>(() => {
    const unique = [...new Set((inspection?.variables ?? []).map(tokenBase))];
    return unique.flatMap((token) => { const field = getGenerationParameter(token); return field ? [{ token, field }] : []; });
  }, [inspection?.variables]);
  const needsSelection = Boolean(inspection?.variables.some((value) => { const base = tokenBase(value); return base.startsWith("військовий_") || base.startsWith("автомобіль_") || base.startsWith("екіпаж_") || /^(генератор|бпла|звʼязок|зброя_та_бк)_/.test(base); }));
  const vehicleOnly = Boolean(inspection?.variables.some((value) => tokenBase(value).startsWith("автомобіль_")) && inspection?.variables.every((value) => { const base = tokenBase(value); return base.startsWith("автомобіль_") || Boolean(getGenerationParameter(base)); }));
  const crewOnly = Boolean(inspection?.variables.some((value) => tokenBase(value).startsWith("екіпаж_")) && inspection?.variables.every((value) => { const base = tokenBase(value); return base.startsWith("екіпаж_") || Boolean(getGenerationParameter(base)); }));
  const equipmentCategory = useMemo(() => { const token = (inspection?.variables ?? []).map(tokenBase).find((base) => /^(генератор|бпла|звʼязок|зброя_та_бк)_/.test(base)); return token?.startsWith("зброя_та_бк_") ? "weapon_ammo" : token?.startsWith("генератор_") ? "generator" : token?.startsWith("бпла_") ? "uav" : token?.startsWith("звʼязок_") ? "communications" : null; }, [inspection?.variables]);
  const equipmentOnly = Boolean(equipmentCategory) && inspection?.variables.every((value) => { const base = tokenBase(value); return /^(генератор|бпла|звʼязок|зброя_та_бк)_/.test(base) || Boolean(getGenerationParameter(base)); });
  const selection = vehicleOnly ? selectedVehicles : crewOnly ? selectedCrews : equipmentOnly ? selectedEquipment : selected;
  const parametersReady = parameters.every(({ token }) => (parameterValues[token] ?? "").trim());
  const canGenerate = Boolean(template?.sourcePath && (!needsSelection || selection.length) && parametersReady);
  const filteredTemplates = templates.filter((item) => includesSearch(templateQuery, item.name, item.description));
  const filteredPeople = people.filter((person) => includesSearch(personQuery, person.fullName, person.taxId, person.position, person.rank));
  const generationContext = useMemo(() => `${template?.sourcePath ?? ""}:${selected.join(",")}:${selectedVehicles.join(",")}:${selectedCrews.join(",")}:${selectedEquipment.join(",")}:${JSON.stringify(parameterValues)}`, [template?.sourcePath, selected, selectedVehicles, selectedCrews, selectedEquipment, parameterValues]);
  const onTemplatesScroll = useLoadMoreOnScroll({ hasMore: hasMoreTemplates, isLoading: isLoadingMoreTemplates, loadMore: onLoadMoreTemplates });
  const onPeopleScroll = useLoadMoreOnScroll({ hasMore: hasMorePeople, isLoading: isLoadingMorePeople, loadMore: onLoadMorePeople });
  useEffect(() => { resetResult(); }, [generationContext, resetResult]);
  useEffect(() => { if (template?.sourcePath) void inspectTemplate(template.sourcePath); }, [template?.sourcePath, inspectTemplate]);
  useEffect(() => { void invoke<Vehicle[]>("list_vehicles").then((items) => setVehicles(Array.isArray(items) ? items : [])).catch(() => setVehicles([])); void invoke<Crew[]>("list_crews").then((items) => setCrews(Array.isArray(items) ? items : [])).catch(() => setCrews([])); }, []);
  useEffect(() => { if (!equipmentCategory) { setEquipment([]); return; } void invoke<Equipment[]>("list_equipment", { category: equipmentCategory }).then((items) => setEquipment(Array.isArray(items) ? items : [])).catch(() => setEquipment([])); }, [equipmentCategory]);
  useEffect(() => { setParameterValues((current) => Object.fromEntries(parameters.map(({ token, field }) => [token, current[token] ?? defaultParameterValue(field)]))); }, [parameters]);
  useEffect(() => { if (error) notify(error, "error"); }, [error, notify]);
  useEffect(() => { if (validation && !validation.isValid) notify(validation.errors[0] ?? "Шаблон не пройшов перевірку.", "error"); }, [validation, notify]);
  useEffect(() => { if (generatedReport) notify("Рапорт створено.", "success"); }, [generatedReport, notify]);
  const openTemplate = async () => { const sourcePath = await selectTemplateFile(); if (!sourcePath) return; onChoose({ name: sourcePath.split("/").pop()?.replace(/\.docx$/i, "") ?? "Власний шаблон", description: "Шаблон, обраний з локального файлу", changed: "Щойно обрано", status: "ready", variables: 0, sourcePath }); };
  const toggleVehicle = (id: number) => setSelectedVehicles((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleCrew = (id: number) => setSelectedCrews((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleEquipment = (id: number) => setSelectedEquipment((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const parameterFields = parameters.length > 0 && <GenerationParameterFields parameters={parameters} values={parameterValues} onChange={(token, value) => setParameterValues((current) => ({ ...current, [token]: value }))} />;
  const parametersButton = parameters.length > 0 && <button className="button" onClick={() => setParametersOpen(true)}><SlidersHorizontal />Параметри значень</button>;
  const generateReport = () => { if (!template?.sourcePath) return; generate(template.sourcePath, vehicleOnly || crewOnly || equipmentOnly ? [] : selected, parameterValues, vehicleOnly ? selectedVehicles : [], crewOnly ? selectedCrews : [], equipmentOnly ? selectedEquipment : []); };
  return <PageFrame className="generation-page"><div className="generation-layout">
    <section className="panel template-picker"><div className="empty-template"><FileText size={75} /><h2 title={template?.name}>{template?.name ?? "Виберіть шаблон рапорту"}</h2><p>{template?.description ?? "Оберіть шаблон зі списку або відкрийте DOCX-файл"}</p></div><div className="panel-caption"><b>Доступні шаблони</b><SearchInput placeholder="Пошук шаблонів…" value={templateQuery} onChange={setTemplateQuery} /></div><div className="template-grid template-picker__scroll" onScroll={onTemplatesScroll}>{filteredTemplates.map((item) => <button onClick={() => onChoose(item)} key={item.sourcePath ?? item.name} aria-pressed={template?.sourcePath === item.sourcePath} className={`template-card ${template?.sourcePath === item.sourcePath ? "template-selected" : ""}`}><FileText /><div><b>{item.name}</b><p>{item.description}</p><small>Оновлено: {item.changed} · DOCX</small></div>{template?.sourcePath === item.sourcePath && <CheckCircle2 className="green" />}</button>)}{isLoadingMoreTemplates && <div className="infinite-loading">Завантаження наступних 20 шаблонів…</div>}</div><button className="file-open" onClick={openTemplate}><Folder />Відкрити шаблон з файлу…<small>Підтримувані формати: .docx</small></button></section>
    <section className="selection-column">{!template?.sourcePath ? <div className="panel people-select generation-empty-state"><div className="generation-empty-state__intro"><FileText /><h2>Оберіть шаблон</h2><p>Виберіть DOCX зі списку ліворуч — тут з’являться потрібні поля та вибір даних.</p></div><ol className="generation-empty-state__steps"><li><b>1</b><span><strong>Шаблон</strong><small>Оберіть потрібний DOCX</small></span></li><li><b>2</b><span><strong>Дані</strong><small>Позначте потрібні записи</small></span></li><li><b>3</b><span><strong>Рапорт</strong><small>Заповніть параметри й створіть файл</small></span></li></ol></div> : !needsSelection ? <div className="panel people-select generation-parameters-only"><h2>Параметри значень</h2><p>{parameters.length ? "Заповніть лише значення, потрібні для цього рапорту." : "Для цього шаблону не потрібно обирати дані або заповнювати додаткові значення."}</p><div className="generation-parameters-scroll">{parameterFields}</div></div> : vehicleOnly ? <SelectionTable title="Вибір автомобілів" items={vehicles} selected={selectedVehicles} onToggle={toggleVehicle} onAll={() => setSelectedVehicles(vehicles.map((item) => item.id))} onClear={() => setSelectedVehicles([])} parametersButton={parametersButton} columns={["Автомобіль", "Номер", "Стан", "Водій"]} values={(item) => [item.name, item.registrationNumber, item.status, item.driverName ?? "—"]} /> : crewOnly ? <SelectionTable title="Вибір екіпажів" items={crews} selected={selectedCrews} onToggle={toggleCrew} onAll={() => setSelectedCrews(crews.map((item) => item.id))} onClear={() => setSelectedCrews([])} parametersButton={parametersButton} columns={["Екіпаж", "Взвод", "Позиція", "Склад"]} values={(item) => [item.name, item.platoon || "—", item.positionName || "—", String(item.memberCount)]} /> : equipmentOnly ? <SelectionTable title="Вибір майна" items={equipment} selected={selectedEquipment} onToggle={toggleEquipment} onAll={() => setSelectedEquipment(equipment.map((item) => item.id))} onClear={() => setSelectedEquipment([])} parametersButton={parametersButton} columns={["Назва", "Інвентарний номер", "Стан", "Закріплено за"]} values={(item) => [item.name, item.inventoryNumber || "—", item.status, item.crewName ?? item.holderName ?? "—"]} /> : <div className="panel people-select"><h2>Вибір військовослужбовців</h2><div className="table-tools"><SearchInput placeholder="Пошук за ПІБ, ІПН, посадою…" value={personQuery} onChange={setPersonQuery} /></div><div className="people-select__scroll" onScroll={onPeopleScroll}><table><thead><tr><th><CheckBox checked={selected.length === people.length} onChange={onAll} /></th><th>Звання</th><th>ПІБ</th><th>Посада</th></tr></thead><tbody>{filteredPeople.map((person) => <tr key={person.id} onClick={() => onToggle(person.id)} className={selected.includes(person.id) ? "selected-row" : ""}><td><CheckBox checked={selected.includes(person.id)} onChange={() => onToggle(person.id)} /></td><td>{person.rank}</td><td>{person.fullName}</td><td>{person.position}</td></tr>)}</tbody></table>{isLoadingMorePeople && <div className="infinite-loading">Завантаження наступних 20 осіб…</div>}</div><div className="selection-footer">Вибрано: <b className="green">{selected.length}</b><span />{parametersButton}<button className="button" onClick={onClear} disabled={!selected.length}>Очистити вибір</button><button className="button" onClick={onAll}>Вибрати всіх</button></div></div>}<button className="generate-button" disabled={!canGenerate || isGenerating} onClick={generateReport}><FileCheck2 />{isGenerating ? "Створення рапорту…" : "Згенерувати рапорт"}</button>{!canGenerate && <p className="generate-hint">Оберіть шаблон{template?.sourcePath && needsSelection ? " і потрібні записи" : ""}{template?.sourcePath && parameters.length ? " та заповніть параметри значень" : ""}.</p>}{generatedReport && <div className="generation-result"><div><button className="button primary" onClick={() => void openReport(generatedReport.docxPath)}><FileText />Відкрити DOCX</button><button className="button" onClick={() => void openReportFolder(generatedReport.folderPath)}><FolderOpen />Відкрити папку</button></div></div>}</section>
  </div>{parametersOpen && <GenerationParametersModal parameters={parameters} values={parameterValues} onChange={(token, value) => setParameterValues((current) => ({ ...current, [token]: value }))} onClose={() => setParametersOpen(false)} />}</PageFrame>;
}
