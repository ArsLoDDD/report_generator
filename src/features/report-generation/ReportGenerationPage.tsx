import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCheck2, FileText, Folder, FolderOpen, CheckCircle2, SlidersHorizontal, X } from "lucide-react";
import type { Person, Template } from "../../shared/types/domain";
import { getGenerationParameter, type GenerationParameterField } from "../../shared/template-language/registry";
import { CheckBox } from "../../shared/ui/CheckBox";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { includesSearch } from "../../shared/utils/search";
import { useLoadMoreOnScroll } from "../../shared/hooks/useLoadMoreOnScroll";
import { useReportGeneration } from "./hooks/useReportGeneration";

type Props = { template: Template | null; templates: Template[]; hasMoreTemplates: boolean; isLoadingMoreTemplates: boolean; onLoadMoreTemplates: () => Promise<void>; people: Person[]; hasMorePeople: boolean; isLoadingMorePeople: boolean; onLoadMorePeople: () => Promise<void>; selected: number[]; onToggle: (id: number) => void; onAll: () => void; onClear: () => void; onChoose: (template: Template) => void };
type Vehicle = { id: number; name: string; registrationNumber: string; status: string; driverName: string | null };
type ParameterToken = { token: string; field: GenerationParameterField };
const today = () => new Date().toISOString().slice(0, 10);
const defaultParameterValue = (field: GenerationParameterField) => field.inputType === "date" ? today() : field.inputType === "boolean" ? "Ні" : "";
const tokenBase = (value: string) => value.split(":")[0];

function GenerationParametersModal({ parameters, values, onChange, onClose }: { parameters: ParameterToken[]; values: Record<string, string>; onChange: (token: string, value: string) => void; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal generation-parameters-modal" role="dialog" aria-modal="true" aria-label="Параметри значень">
      <header className="generation-parameters-modal__header"><div><h2>Параметри значень</h2><p>Заповніть лише значення, потрібні для цього рапорту. Номер після назви означає окреме значення.</p></div><button className="close" aria-label="Закрити" onClick={onClose}><X /></button></header>
      <div className="generation-parameters-modal__body">{parameters.map(({ token, field }) => <label className={`generation-parameter generation-parameter--${field.inputType}`} key={token}><span><b>{field.name}{token === field.id ? "" : ` №${token.slice(field.id.length + 1)}`}</b><code>{`{{${token}}}`}</code></span>{field.inputType === "textarea" ? <textarea value={values[token] ?? ""} placeholder={field.example} onChange={(event) => onChange(token, event.target.value)} /> : field.inputType === "boolean" ? <select value={values[token] ?? "Ні"} onChange={(event) => onChange(token, event.target.value)}><option value="Так">Так</option><option value="Ні">Ні</option></select> : <input type={field.inputType} value={values[token] ?? ""} placeholder={field.example} onChange={(event) => onChange(token, event.target.value)} />}</label>)}</div>
      <footer className="modal-actions"><button className="button primary" onClick={onClose}>Готово</button></footer>
    </section>
  </div>;
}

export function ReportGenerationPage({ template, templates, hasMoreTemplates, isLoadingMoreTemplates, onLoadMoreTemplates, people, hasMorePeople, isLoadingMorePeople, onLoadMorePeople, selected, onToggle, onAll, onClear, onChoose }: Props) {
  const { error, generatedReport, inspection, isGenerating, selectTemplateFile, inspectTemplate, validation, generate, openReport, openReportFolder, resetResult } = useReportGeneration();
  const { notify } = useNotifications();
  const [templateQuery, setTemplateQuery] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<number[]>([]);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [parametersOpen, setParametersOpen] = useState(false);
  const parameters = useMemo<ParameterToken[]>(() => {
    const unique = [...new Set((inspection?.variables ?? []).map(tokenBase))];
    return unique.flatMap((token) => { const field = getGenerationParameter(token); return field ? [{ token, field }] : []; });
  }, [inspection?.variables]);
  const needsSelection = Boolean(inspection?.variables.some((value) => { const base = tokenBase(value); return base.startsWith("військовий_") || base.startsWith("автомобіль_"); }));
  const vehicleOnly = Boolean(inspection?.variables.some((value) => tokenBase(value).startsWith("автомобіль_")) && inspection?.variables.every((value) => { const base = tokenBase(value); return base.startsWith("автомобіль_") || Boolean(getGenerationParameter(base)); }));
  const selection = vehicleOnly ? selectedVehicles : selected;
  const parametersReady = parameters.every(({ token }) => (parameterValues[token] ?? "").trim());
  const canGenerate = Boolean(template?.sourcePath && (!needsSelection || selection.length) && parametersReady);
  const filteredTemplates = templates.filter((item) => includesSearch(templateQuery, item.name, item.description));
  const filteredPeople = people.filter((person) => includesSearch(personQuery, person.fullName, person.taxId, person.position, person.rank));
  const generationContext = useMemo(() => `${template?.sourcePath ?? ""}:${selected.join(",")}:${selectedVehicles.join(",")}:${JSON.stringify(parameterValues)}`, [template?.sourcePath, selected, selectedVehicles, parameterValues]);
  const onTemplatesScroll = useLoadMoreOnScroll({ hasMore: hasMoreTemplates, isLoading: isLoadingMoreTemplates, loadMore: onLoadMoreTemplates });
  const onPeopleScroll = useLoadMoreOnScroll({ hasMore: hasMorePeople, isLoading: isLoadingMorePeople, loadMore: onLoadMorePeople });
  useEffect(() => { resetResult(); }, [generationContext, resetResult]);
  useEffect(() => { if (template?.sourcePath) void inspectTemplate(template.sourcePath); }, [template?.sourcePath, inspectTemplate]);
  useEffect(() => { void invoke<Vehicle[]>("list_vehicles").then(setVehicles).catch(() => setVehicles([])); }, []);
  useEffect(() => { setParameterValues((current) => Object.fromEntries(parameters.map(({ token, field }) => [token, current[token] ?? defaultParameterValue(field)]))); }, [parameters]);
  useEffect(() => { if (error) notify(error, "error"); }, [error, notify]);
  useEffect(() => { if (validation && !validation.isValid) notify(validation.errors[0] ?? "Шаблон не пройшов перевірку.", "error"); }, [validation, notify]);
  useEffect(() => { if (generatedReport) notify("Рапорт створено.", "success"); }, [generatedReport, notify]);
  const openTemplate = async () => { const sourcePath = await selectTemplateFile(); if (!sourcePath) return; onChoose({ name: sourcePath.split("/").pop()?.replace(/\.docx$/i, "") ?? "Власний шаблон", description: "Шаблон, обраний з локального файлу", changed: "Щойно обрано", status: "ready", variables: 0, sourcePath }); };
  const toggleVehicle = (id: number) => setSelectedVehicles((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const parametersButton = parameters.length > 0 && <button className="button" onClick={() => setParametersOpen(true)}><SlidersHorizontal />Параметри значень</button>;
  const generateReport = () => { if (!template?.sourcePath) return; generate(template.sourcePath, vehicleOnly ? [] : selected, parameterValues, vehicleOnly ? selectedVehicles : []); };
  return <PageFrame className="generation-page"><div className="generation-layout">
    <section className="panel template-picker"><div className="empty-template"><FileText size={75} /><h2>{template?.name ?? "Виберіть шаблон рапорту"}</h2><p>{template?.description ?? "Оберіть шаблон зі списку або відкрийте DOCX-файл"}</p></div><div className="panel-caption"><b>Доступні шаблони</b><SearchInput placeholder="Пошук шаблонів…" value={templateQuery} onChange={setTemplateQuery} /></div><div className="template-grid template-picker__scroll" onScroll={onTemplatesScroll}>{filteredTemplates.map((item) => <button onClick={() => onChoose(item)} key={item.sourcePath ?? item.name} aria-pressed={template?.sourcePath === item.sourcePath} className={`template-card ${template?.sourcePath === item.sourcePath ? "template-selected" : ""}`}><FileText /><div><b>{item.name}</b><p>{item.description}</p><small>Оновлено: {item.changed} · DOCX</small></div>{template?.sourcePath === item.sourcePath && <CheckCircle2 className="green" />}</button>)}{isLoadingMoreTemplates && <div className="infinite-loading">Завантаження наступних 20 шаблонів…</div>}</div><button className="file-open" onClick={openTemplate}><Folder />Відкрити шаблон з файлу…<small>Підтримувані формати: .docx</small></button></section>
    <section className="selection-column">{vehicleOnly ? <div className="panel people-select"><h2>Вибір автомобілів</h2><div className="people-select__scroll"><table><thead><tr><th></th><th>Автомобіль</th><th>Номер</th><th>Стан</th><th>Водій</th></tr></thead><tbody>{vehicles.map((vehicle) => <tr key={vehicle.id} onClick={() => toggleVehicle(vehicle.id)} className={selectedVehicles.includes(vehicle.id) ? "selected-row" : ""}><td><CheckBox checked={selectedVehicles.includes(vehicle.id)} onChange={() => toggleVehicle(vehicle.id)} /></td><td>{vehicle.name}</td><td>{vehicle.registrationNumber}</td><td>{vehicle.status}</td><td>{vehicle.driverName ?? "—"}</td></tr>)}</tbody></table></div><div className="selection-footer">Вибрано: <b className="green">{selectedVehicles.length}</b><span />{parametersButton}<button className="button" onClick={() => setSelectedVehicles([])} disabled={!selectedVehicles.length}>Очистити вибір</button><button className="button" onClick={() => setSelectedVehicles(vehicles.map((vehicle) => vehicle.id))}>Вибрати всі</button></div></div> : <div className="panel people-select"><h2>Вибір військовослужбовців</h2><div className="table-tools"><SearchInput placeholder="Пошук за ПІБ, ІПН, посадою…" value={personQuery} onChange={setPersonQuery} /></div><div className="people-select__scroll" onScroll={onPeopleScroll}><table><thead><tr><th><CheckBox checked={selected.length === people.length} onChange={onAll} /></th><th>Звання</th><th>ПІБ</th><th>Посада</th></tr></thead><tbody>{filteredPeople.map((person) => <tr key={person.id} onClick={() => onToggle(person.id)} className={selected.includes(person.id) ? "selected-row" : ""}><td><CheckBox checked={selected.includes(person.id)} onChange={() => onToggle(person.id)} /></td><td>{person.rank}</td><td>{person.fullName}</td><td>{person.position}</td></tr>)}</tbody></table>{isLoadingMorePeople && <div className="infinite-loading">Завантаження наступних 20 осіб…</div>}</div><div className="selection-footer">Вибрано: <b className="green">{selected.length}</b><span />{parametersButton}<button className="button" onClick={onClear} disabled={!selected.length}>Очистити вибір</button><button className="button" onClick={onAll}>Вибрати всіх</button></div></div>}<button className="generate-button" disabled={!canGenerate || isGenerating} onClick={generateReport}><FileCheck2 />{isGenerating ? "Створення рапорту…" : "Згенерувати рапорт"}</button>{!canGenerate && <p className="generate-hint">Оберіть шаблон{needsSelection ? ` та ${vehicleOnly ? "автомобіль" : "військовослужбовців"}` : ""}{parameters.length ? " і заповніть параметри значень" : ""}.</p>}{generatedReport && <div className="generation-result"><div><button className="button primary" onClick={() => void openReport(generatedReport.docxPath)}><FileText />Відкрити DOCX</button><button className="button" onClick={() => void openReportFolder(generatedReport.folderPath)}><FolderOpen />Відкрити папку</button></div></div>}</section>
  </div>{parametersOpen && <GenerationParametersModal parameters={parameters} values={parameterValues} onChange={(token, value) => setParameterValues((current) => ({ ...current, [token]: value }))} onClose={() => setParametersOpen(false)} />}</PageFrame>;
}
