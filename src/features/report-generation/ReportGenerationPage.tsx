import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCheck2, FileText, Folder, FolderOpen, CheckCircle2 } from "lucide-react";
import type { Person, Template } from "../../shared/types/domain";
import { CheckBox } from "../../shared/ui/CheckBox";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { includesSearch } from "../../shared/utils/search";
import { useLoadMoreOnScroll } from "../../shared/hooks/useLoadMoreOnScroll";
import { useReportGeneration } from "./hooks/useReportGeneration";

type Props = { template: Template | null; templates: Template[]; hasMoreTemplates: boolean; isLoadingMoreTemplates: boolean; onLoadMoreTemplates: () => Promise<void>; people: Person[]; hasMorePeople: boolean; isLoadingMorePeople: boolean; onLoadMorePeople: () => Promise<void>; selected: number[]; onToggle: (id: number) => void; onAll: () => void; onClear: () => void; onChoose: (template: Template) => void };
type Vehicle = { id: number; name: string; registrationNumber: string; status: string; driverName: string | null };
const currentLocalDateForInput = () => new Date().toISOString().slice(0, 10);

export function ReportGenerationPage({ template, templates, hasMoreTemplates, isLoadingMoreTemplates, onLoadMoreTemplates, people, hasMorePeople, isLoadingMorePeople, onLoadMorePeople, selected, onToggle, onAll, onClear, onChoose }: Props) {
  const { error, generatedReport, inspection, isGenerating, selectTemplateFile, inspectTemplate, validation, generate, openReport, openReportFolder, resetResult } = useReportGeneration();
  const { notify } = useNotifications();
  const [templateQuery, setTemplateQuery] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [reportDate, setReportDate] = useState(currentLocalDateForInput);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<number[]>([]);
  const requiresDate = inspection?.variables.some((value) => value.split(":")[0] === "дата_рапорту") ?? false;
  const vehicleOnly = Boolean(inspection?.variables.some((value) => value.split(":")[0].startsWith("автомобіль_")) && inspection?.variables.every((value) => { const base = value.split(":")[0]; return base.startsWith("автомобіль_") || base === "дата_рапорту"; }));
  const selection = vehicleOnly ? selectedVehicles : selected;
  const canGenerate = Boolean(template?.sourcePath && selection.length && (!requiresDate || reportDate));
  const filteredTemplates = templates.filter((item) => includesSearch(templateQuery, item.name, item.description));
  const filteredPeople = people.filter((person) => includesSearch(personQuery, person.fullName, person.taxId, person.position, person.rank));
  const generationContext = useMemo(() => `${template?.sourcePath ?? ""}:${selected.join(",")}:${selectedVehicles.join(",")}`, [template?.sourcePath, selected, selectedVehicles]);
  const onTemplatesScroll = useLoadMoreOnScroll({ hasMore: hasMoreTemplates, isLoading: isLoadingMoreTemplates, loadMore: onLoadMoreTemplates });
  const onPeopleScroll = useLoadMoreOnScroll({ hasMore: hasMorePeople, isLoading: isLoadingMorePeople, loadMore: onLoadMorePeople });
  useEffect(() => { resetResult(); }, [generationContext, resetResult]);
  useEffect(() => { if (template?.sourcePath) void inspectTemplate(template.sourcePath); }, [template?.sourcePath, inspectTemplate]);
  useEffect(() => { void invoke<Vehicle[]>("list_vehicles").then(setVehicles).catch(() => setVehicles([])); }, []);
  useEffect(() => { if (error) notify(error, "error"); }, [error, notify]);
  useEffect(() => { if (validation && !validation.isValid) notify(validation.errors[0] ?? "Шаблон не пройшов перевірку.", "error"); }, [validation, notify]);
  useEffect(() => { if (generatedReport) notify("Рапорт створено.", "success"); }, [generatedReport, notify]);
  const openTemplate = async () => { const sourcePath = await selectTemplateFile(); if (!sourcePath) return; onChoose({ name: sourcePath.split("/").pop()?.replace(/\.docx$/i, "") ?? "Власний шаблон", description: "Шаблон, обраний з локального файлу", changed: "Щойно обрано", status: "ready", variables: 0, sourcePath }); };
  const toggleVehicle = (id: number) => setSelectedVehicles((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  return <PageFrame className="generation-page"><div className="generation-layout">
    <section className="panel template-picker"><div className="empty-template"><FileText size={75} /><h2>{template?.name ?? "Виберіть шаблон рапорту"}</h2><p>{template?.description ?? "Оберіть шаблон зі списку або відкрийте DOCX-файл"}</p></div><div className="panel-caption"><b>Доступні шаблони</b><SearchInput placeholder="Пошук шаблонів…" value={templateQuery} onChange={setTemplateQuery} /></div><div className="template-grid template-picker__scroll" onScroll={onTemplatesScroll}>{filteredTemplates.map((item) => <button onClick={() => onChoose(item)} key={item.sourcePath ?? item.name} aria-pressed={template?.sourcePath === item.sourcePath} className={`template-card ${template?.sourcePath === item.sourcePath ? "template-selected" : ""}`}><FileText /><div><b>{item.name}</b><p>{item.description}</p><small>Оновлено: {item.changed} · DOCX</small></div>{template?.sourcePath === item.sourcePath && <CheckCircle2 className="green" />}</button>)}{isLoadingMoreTemplates && <div className="infinite-loading">Завантаження наступних 20 шаблонів…</div>}</div><button className="file-open" onClick={openTemplate}><Folder />Відкрити шаблон з файлу…<small>Підтримувані формати: .docx</small></button></section>
    <section className="selection-column">{vehicleOnly ? <div className="panel people-select"><h2>Вибір автомобілів</h2><div className="people-select__scroll"><table><thead><tr><th></th><th>Автомобіль</th><th>Номер</th><th>Стан</th><th>Водій</th></tr></thead><tbody>{vehicles.map((vehicle) => <tr key={vehicle.id} onClick={() => toggleVehicle(vehicle.id)} className={selectedVehicles.includes(vehicle.id) ? "selected-row" : ""}><td><CheckBox checked={selectedVehicles.includes(vehicle.id)} onChange={() => toggleVehicle(vehicle.id)} /></td><td>{vehicle.name}</td><td>{vehicle.registrationNumber}</td><td>{vehicle.status}</td><td>{vehicle.driverName ?? "—"}</td></tr>)}</tbody></table></div><div className="selection-footer">Вибрано: <b className="green">{selectedVehicles.length}</b><span /><button className="button" onClick={() => setSelectedVehicles([])} disabled={!selectedVehicles.length}>Очистити вибір</button><button className="button" onClick={() => setSelectedVehicles(vehicles.map((vehicle) => vehicle.id))}>Вибрати всі</button></div></div> : <div className="panel people-select"><h2>Вибір військовослужбовців</h2><div className="table-tools"><SearchInput placeholder="Пошук за ПІБ, ІПН, посадою…" value={personQuery} onChange={setPersonQuery} /></div><div className="people-select__scroll" onScroll={onPeopleScroll}><table><thead><tr><th><CheckBox checked={selected.length === people.length} onChange={onAll} /></th><th>Звання</th><th>ПІБ</th><th>Посада</th></tr></thead><tbody>{filteredPeople.map((person) => <tr key={person.id} onClick={() => onToggle(person.id)} className={selected.includes(person.id) ? "selected-row" : ""}><td><CheckBox checked={selected.includes(person.id)} onChange={() => onToggle(person.id)} /></td><td>{person.rank}</td><td>{person.fullName}</td><td>{person.position}</td></tr>)}</tbody></table>{isLoadingMorePeople && <div className="infinite-loading">Завантаження наступних 20 осіб…</div>}</div><div className="selection-footer">Вибрано: <b className="green">{selected.length}</b><span /><button className="button" onClick={onClear} disabled={!selected.length}>Очистити вибір</button><button className="button" onClick={onAll}>Вибрати всіх</button></div></div>}{requiresDate && <label className="panel report-date-picker"><span>Дата рапорту</span><input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label>}<button className="generate-button" disabled={!canGenerate || isGenerating} onClick={() => template?.sourcePath && (vehicleOnly ? generate(template.sourcePath, [], requiresDate ? reportDate : undefined, selectedVehicles) : generate(template.sourcePath, selected, requiresDate ? reportDate : undefined))}><FileCheck2 />{isGenerating ? "Створення рапорту…" : "Згенерувати рапорт"}</button>{!canGenerate && <p className="generate-hint">Оберіть DOCX-шаблон та {vehicleOnly ? "автомобіль" : "військовослужбовців"}</p>}{generatedReport && <div className="generation-result"><div><button className="button primary" onClick={() => void openReport(generatedReport.docxPath)}><FileText />Відкрити DOCX</button><button className="button" onClick={() => void openReportFolder(generatedReport.folderPath)}><FolderOpen />Відкрити папку</button></div></div>}</section>
  </div></PageFrame>;
}
