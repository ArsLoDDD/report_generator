import { useEffect, useMemo, useState } from "react";
import { FileCheck2, FileText, Folder, FolderOpen, CheckCircle2 } from "lucide-react";
import type { Person, Template } from "../../shared/types/domain";
import { CheckBox } from "../../shared/ui/CheckBox";
import { FilterButton } from "../../shared/ui/FilterButton";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { includesSearch } from "../../shared/utils/search";
import { useReportGeneration } from "./hooks/useReportGeneration";

type Props = { template: Template | null; templates: Template[]; people: Person[]; selected: number[]; onToggle: (id: number) => void; onAll: () => void; onClear: () => void; onChoose: (template: Template) => void };

function currentLocalDateForInput() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function ReportGenerationPage({ template, templates, people, selected, onToggle, onAll, onClear, onChoose }: Props) {
  const { error, generatedReport, inspection, isGenerating, selectTemplateFile, inspectTemplate, validation, generate, openReport, openReportFolder, resetResult } = useReportGeneration();
  const { notify } = useNotifications();
  const [templateQuery, setTemplateQuery] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rank, setRank] = useState("all");
  const [reportDate, setReportDate] = useState(currentLocalDateForInput);
  const generationContext = useMemo(() => `${template?.sourcePath ?? ""}:${selected.join(",")}`, [template?.sourcePath, selected]);
  const requiresDate = inspection?.variables.includes("document.date") ?? false;
  const canGenerate = Boolean(template?.sourcePath && selected.length && (!requiresDate || reportDate));
  const ranks = useMemo(() => [...new Set(people.map((person) => person.rank))], [people]);
  const filteredTemplates = templates.filter((item) => includesSearch(templateQuery, item.name, item.description));
  const filteredPeople = people.filter((person) => (rank === "all" || person.rank === rank) && includesSearch(personQuery, person.fullName, person.taxId, person.position, person.rank));

  useEffect(() => { resetResult(); }, [generationContext, resetResult]);
  useEffect(() => { if (template?.sourcePath) void inspectTemplate(template.sourcePath); }, [template?.sourcePath, inspectTemplate]);
  useEffect(() => { if (error) notify(error, "error"); }, [error, notify]);
  useEffect(() => { if (validation && !validation.isValid) notify(validation.errors[0] ?? "Шаблон не пройшов перевірку.", "error"); }, [validation, notify]);
  useEffect(() => { if (generatedReport) notify("Рапорт створено.", "success"); }, [generatedReport, notify]);

  const openTemplate = async () => {
    const sourcePath = await selectTemplateFile();
    if (!sourcePath) return;
    const fileName = sourcePath.split("/").pop()?.replace(/\.docx$/i, "") ?? "Власний шаблон";
    onChoose({ name: fileName, description: "Шаблон, обраний з локального файлу", changed: "Щойно обрано", status: "ready", variables: 0, sourcePath });
  };

  return <PageFrame className="generation-page"><div className="generation-layout"><section className="panel template-picker"><div className="empty-template"><FileText size={75} /><h2>{template?.name ?? "Виберіть шаблон рапорту"}</h2><p>{template?.description ?? "Оберіть шаблон зі списку або відкрийте DOCX-файл"}</p></div><div className="panel-caption"><b>Доступні шаблони</b><SearchInput placeholder="Пошук шаблонів…" value={templateQuery} onChange={setTemplateQuery} /></div><div className="template-grid template-picker__scroll">{filteredTemplates.map((item) => <button onClick={() => onChoose(item)} key={item.sourcePath ?? item.name} aria-pressed={template?.sourcePath === item.sourcePath} className={`template-card ${template?.sourcePath === item.sourcePath ? "template-selected" : ""}`}><FileText /><div><b>{item.name}</b><p>{item.description}</p><small>Оновлено: {item.changed} · DOCX</small></div>{template?.sourcePath === item.sourcePath && <CheckCircle2 className="green" />}</button>)}</div><button className="file-open" onClick={openTemplate}><Folder />Відкрити шаблон з файлу…<small>Підтримувані формати: .docx</small></button></section><section className="selection-column"><div className="panel people-select"><h2>Вибір військовослужбовців <span className="info">i</span></h2><div className="table-tools"><SearchInput placeholder="Пошук за ПІБ, ІПН, посадою…" value={personQuery} onChange={setPersonQuery} /><FilterButton active={filtersOpen} onClick={() => setFiltersOpen((current) => !current)} /></div>{filtersOpen && <div className="inline-filters"><Select ariaLabel="Фільтр за званням" value={rank} onChange={setRank} options={[{ value: "all", label: "Усі звання" }, ...ranks.map((item) => ({ value: item, label: item }))]} /><button className="button" onClick={() => { setRank("all"); setPersonQuery(""); }}>Скинути</button></div>}<div className="people-select__scroll"><table><thead><tr><th><CheckBox checked={selected.length === people.length} onChange={onAll} /></th><th>Звання</th><th>ПІБ</th><th>Посада</th></tr></thead><tbody>{filteredPeople.map((person) => <tr key={person.id} onClick={() => onToggle(person.id)} className={selected.includes(person.id) ? "selected-row" : ""} aria-selected={selected.includes(person.id)}><td><CheckBox checked={selected.includes(person.id)} onChange={() => onToggle(person.id)} /></td><td>{person.rank}</td><td>{person.fullName}</td><td>{person.position}</td></tr>)}</tbody></table></div><div className="selection-footer">Вибрано: <b className="green">{selected.length}</b><span /><button className="button" onClick={onClear} disabled={!selected.length}>Очистити вибір</button><button className="button" onClick={onAll}>Вибрати всіх</button></div></div>{requiresDate && <label className="panel report-date-picker"><span>Дата рапорту</span><input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label>}<button className="generate-button" disabled={!canGenerate || isGenerating} onClick={() => template?.sourcePath && generate(template.sourcePath, selected, requiresDate ? reportDate : undefined)}><FileCheck2 />{isGenerating ? "Створення рапорту…" : "Згенерувати рапорт"}</button>{!canGenerate && <p className="generate-hint">Оберіть DOCX-шаблон та військовослужбовців</p>}{generatedReport && <div className="generation-result"><div><button className="button primary" onClick={() => void openReport(generatedReport.docxPath)}><FileText />Відкрити DOCX</button><button className="button" onClick={() => void openReportFolder(generatedReport.folderPath)}><FolderOpen />Відкрити папку</button></div></div>}</section></div></PageFrame>;
}
