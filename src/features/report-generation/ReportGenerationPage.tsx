import { FileCheck2, FileText, Filter, Folder, FolderOpen, CheckCircle2 } from "lucide-react";
import type { Person, Template } from "../../shared/types/domain";
import { CheckBox } from "../../shared/ui/CheckBox";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import { useReportGeneration } from "./hooks/useReportGeneration";

type Props = {
  template: Template | null;
  templates: Template[];
  people: Person[];
  selected: number[];
  onToggle: (id: number) => void;
  onAll: () => void;
  onClear: () => void;
  onChoose: (template: Template) => void;
};

export function ReportGenerationPage({ template, templates, people, selected, onToggle, onAll, onClear, onChoose }: Props) {
  const { error, generatedReport, isGenerating, selectTemplateFile, validation, generate, openReport, openReportFolder } = useReportGeneration();
  const canGenerate = Boolean(template?.sourcePath && selected.length);

  const openTemplate = async () => {
    const sourcePath = await selectTemplateFile();
    if (!sourcePath) return;
    const fileName = sourcePath.split("/").pop()?.replace(/\.docx$/i, "") ?? "Власний шаблон";
    onChoose({ name: fileName, description: "Шаблон, обраний з локального файлу", changed: "Щойно обрано", status: "ready", variables: 0, sourcePath });
  };

  return <PageFrame className="generation-page"><div className="generation-layout"><section className="panel template-picker"><div className="empty-template"><FileText size={75} /><h2>{template?.name ?? "Виберіть шаблон рапорту"}</h2><p>{template?.description ?? "Оберіть шаблон зі списку або відкрийте DOCX-файл"}</p></div><div className="panel-caption"><b>Доступні шаблони</b><SearchInput placeholder="Пошук шаблонів…" /></div><div className="template-grid template-picker__scroll">{templates.map((item) => <button onClick={() => onChoose(item)} key={item.name} aria-pressed={template?.name === item.name} className={`template-card ${template?.name === item.name ? "template-selected" : ""}`}><FileText /><div><b>{item.name}</b><p>{item.description}</p><small>Оновлено: {item.changed} · DOCX</small></div>{template?.name === item.name && <CheckCircle2 className="green" />}</button>)}</div><button className="file-open" onClick={openTemplate}><Folder />Відкрити шаблон з файлу…<small>Підтримувані формати: .docx</small></button></section><section className="selection-column"><div className="panel people-select"><h2>Вибір військовослужбовців <span className="info">i</span></h2><div className="table-tools"><SearchInput placeholder="Пошук за ПІБ, ІПН, посадою…" /><button className="button"><Filter size={17} />Фільтри</button></div><div className="people-select__scroll"><table><thead><tr><th><CheckBox checked={selected.length === people.length} onChange={onAll} /></th><th>Звання</th><th>ПІБ</th><th>Посада</th></tr></thead><tbody>{people.map((person) => <tr key={person.id} onClick={() => onToggle(person.id)} className={selected.includes(person.id) ? "selected-row" : ""} aria-selected={selected.includes(person.id)}><td><CheckBox checked={selected.includes(person.id)} onChange={() => onToggle(person.id)} /></td><td>{person.rank}</td><td>{person.fullName}</td><td>{person.position}</td></tr>)}</tbody></table></div><div className="selection-footer">Вибрано: <b className="green">{selected.length}</b><span /><button className="button" onClick={onClear} disabled={!selected.length}>Очистити вибір</button><button className="button" onClick={onAll}>Вибрати всіх</button></div></div><button className="generate-button" disabled={!canGenerate || isGenerating} onClick={() => template?.sourcePath && generate(template.sourcePath, selected)}><FileCheck2 />{isGenerating ? "Створення рапорту…" : "Згенерувати рапорт"}</button>{!canGenerate && <p className="generate-hint">Оберіть DOCX-шаблон та військовослужбовців</p>}{validation && !validation.isValid && <p className="generation-message error">{validation.errors[0]}</p>}{error && <p className="generation-message error">{error}</p>}{generatedReport && <div className="generation-result"><p className="generation-message success">Рапорт створено</p><div><button className="button primary" onClick={() => void openReport(generatedReport.docxPath)}><FileText />Відкрити DOCX</button><button className="button" onClick={() => void openReportFolder(generatedReport.folderPath)}><FolderOpen />Відкрити папку</button></div></div>}</section></div></PageFrame>;
}
