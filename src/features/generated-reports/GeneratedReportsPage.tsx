import { useEffect, useMemo, useState } from "react";
import { Archive, CalendarDays, Download, Eye, FileText, FolderOpen, MoreVertical, RefreshCw, X } from "lucide-react";
import type { GeneratedReportSummary } from "../../shared/types/domain";
import { CheckBox } from "../../shared/ui/CheckBox";
import { FilterButton } from "../../shared/ui/FilterButton";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { Stat } from "../../shared/ui/Stat";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { includesSearch } from "../../shared/utils/search";
import { useGeneratedReports } from "./hooks/useGeneratedReports";
import { generatedReportsService } from "./services/generatedReportsService";

export function GeneratedReportsPage() {
  const { reports, isLoading, errorMessage, refresh } = useGeneratedReports();
  const { notify } = useNotifications();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [template, setTemplate] = useState("all");
  const [sort, setSort] = useState("new");
  const [selectedReport, setSelectedReport] = useState<GeneratedReportSummary | null>(null);
  const templates = useMemo(() => [...new Set(reports.map((report) => report.template))], [reports]);
  const filteredReports = reports
    .filter((report) => (template === "all" || report.template === template) && includesSearch(query, report.name, report.template, report.generatedAt))
    .sort((left, right) => sort === "new" ? right.generatedAt.localeCompare(left.generatedAt) : left.generatedAt.localeCompare(right.generatedAt));
  const details = selectedReport ?? filteredReports[0] ?? null;
  const resetFilters = () => { setQuery(""); setTemplate("all"); setSort("new"); };
  useEffect(() => { if (errorMessage) notify(errorMessage, "error"); }, [errorMessage, notify]);
  const openDocument = async (reportPath: string) => {
    try { await generatedReportsService.openDocument(reportPath); }
    catch { notify("Не вдалося відкрити рапорт. Перевірте, чи файл існує.", "error"); }
  };
  const openFolder = async (folderPath: string) => {
    try { await generatedReportsService.openFolder(folderPath); }
    catch { notify("Не вдалося відкрити папку з рапортом.", "error"); }
  };
  const tools = <section className="panel generated-filters"><SearchInput placeholder="Пошук рапортів…" value={query} onChange={setQuery} /><FilterButton active={filtersOpen} onClick={() => setFiltersOpen((current) => !current)} />{filtersOpen && <><Select ariaLabel="Фільтр за шаблоном" value={template} onChange={setTemplate} options={[{ value: "all", label: "Усі шаблони" }, ...templates.map((item) => ({ value: item, label: item }))]} /><Select ariaLabel="Сортування рапортів" value={sort} onChange={setSort} options={[{ value: "new", label: "Дата: нові спочатку" }, { value: "old", label: "Дата: старі спочатку" }]} /><button className="button" onClick={resetFilters}>Скинути</button></>}<div className="quick-filter"><button>Усі <b>{filteredReports.length}</b></button></div></section>;
  return <PageFrame header={<PageTitle title="Згенеровані рапорти" subtitle="Файли, створені у папці Reports" actions={<><button className="button" onClick={() => void refresh()}><RefreshCw />Оновити</button><button className="button"><Download />Експорт списку</button><button className="button primary" onClick={() => details && void openFolder(details.folderPath)} disabled={!details}><FolderOpen />Відкрити папку з рапортом</button></>} />} tools={tools} footer={<div className="statbar"><Stat icon={Archive} label="Усього рапортів" value={reports.length} /><Stat icon={CalendarDays} label="За результатами пошуку" value={filteredReports.length} /><Stat icon={FileText} label="Джерело" value="Reports" /></div>} className="generated-page"><div className="generated-layout"><section className="panel data-table"><div className="data-table__scroll"><table><thead><tr><th><CheckBox /></th><th>Назва рапорту</th><th>Шаблон</th><th>Дата генерації</th><th>Дії</th></tr></thead><tbody>{filteredReports.map((report) => <tr className={details?.folderPath === report.folderPath ? "selected-row" : ""} key={report.folderPath} onClick={() => setSelectedReport(report)}><td><CheckBox checked={details?.folderPath === report.folderPath} onChange={() => setSelectedReport(report)} /></td><td><span className="word-icon">W</span>{report.name}</td><td>{report.template}</td><td>{report.generatedAt}</td><td><button className="icon-button" aria-label={`Відкрити ${report.name}`} onClick={(event) => { event.stopPropagation(); void openDocument(report.docxPath); }}><Eye /></button><button className="icon-button" aria-label={`Відкрити папку ${report.name}`} onClick={(event) => { event.stopPropagation(); void openFolder(report.folderPath); }}><FolderOpen /></button><button className="icon-button"><MoreVertical /></button></td></tr>)}</tbody></table></div><div className="pagination">{isLoading ? "Завантаження…" : `Показано ${filteredReports.length} із ${reports.length}`}</div></section><aside className="panel report-details">{details && <button className="close" onClick={() => setSelectedReport(null)}><X /></button>}<h2>{details?.name ?? "Рапортів не знайдено"}</h2>{details ? <><p><span className="word-icon">W</span> DOCX · {details.generatedAt}</p><div className="actions-line"><button className="button primary" onClick={() => void openDocument(details.docxPath)}><Eye />Відкрити</button><button className="button" onClick={() => void openFolder(details.folderPath)}><FolderOpen />Відкрити папку</button></div></> : <p>Після створення рапорти з’являться тут автоматично.</p>}</aside></div></PageFrame>;
}
