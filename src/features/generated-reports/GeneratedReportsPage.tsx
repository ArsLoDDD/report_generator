import { useEffect, useMemo, useState } from "react";
import { Eye, FolderOpen, Trash2 } from "lucide-react";
import type { GeneratedReportSummary } from "../../shared/types/domain";
import { CheckBox } from "../../shared/ui/CheckBox";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { useLoadMoreOnScroll } from "../../shared/hooks/useLoadMoreOnScroll";
import { includesSearch } from "../../shared/utils/search";
import { useGeneratedReports } from "./hooks/useGeneratedReports";
import { generatedReportsService } from "./services/generatedReportsService";

type Period = "today" | "week" | "month";

function isInPeriod(report: GeneratedReportSummary, period: Period) {
  const match = report.generatedAt.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return true;
  const reportDate = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === "today") return reportDate.getTime() === today.getTime();
  const start = new Date(today);
  start.setDate(today.getDate() - (period === "week" ? 6 : 29));
  return reportDate >= start && reportDate <= today;
}

export function GeneratedReportsPage() {
  const { reports, totalCount, hasMore, isLoading, isLoadingMore, errorMessage, refresh, loadMore } = useGeneratedReports();
  const { notify } = useNotifications();
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pathsToDelete, setPathsToDelete] = useState<string[] | null>(null);
  const filteredReports = useMemo(() => reports.filter((report) => isInPeriod(report, period) && includesSearch(query, report.name, report.template, report.generatedAt)), [reports, period, query]);
  const onReportsScroll = useLoadMoreOnScroll({ hasMore, isLoading: isLoadingMore, loadMore });

  useEffect(() => { if (errorMessage) notify(errorMessage, "error"); }, [errorMessage, notify]);
  useEffect(() => { setSelectedPaths((current) => current.filter((path) => reports.some((report) => report.docxPath === path))); }, [reports]);

  const toggleReport = (path: string) => setSelectedPaths((current) => current.includes(path) ? current.filter((currentPath) => currentPath !== path) : [...current, path]);
  const toggleVisibleReports = () => setSelectedPaths((current) => filteredReports.length > 0 && filteredReports.every((report) => current.includes(report.docxPath)) ? current.filter((path) => !filteredReports.some((report) => report.docxPath === path)) : [...new Set([...current, ...filteredReports.map((report) => report.docxPath)])]);
  const openDocument = async (reportPath: string) => {
    try { await generatedReportsService.openDocument(reportPath); }
    catch { notify("Не вдалося відкрити рапорт. Перевірте, чи файл існує.", "error"); }
  };
  const openFolder = async (folderPath: string) => {
    try { await generatedReportsService.openFolder(folderPath); }
    catch { notify("Не вдалося відкрити папку з рапортом.", "error"); }
  };
  const confirmDelete = async () => {
    if (!pathsToDelete?.length) return;
    setIsDeleting(true);
    try {
      await generatedReportsService.delete(pathsToDelete);
      setSelectedPaths((current) => current.filter((path) => !pathsToDelete.includes(path)));
      setPathsToDelete(null);
      await refresh();
      notify(pathsToDelete.length === 1 ? "Рапорт видалено." : `Видалено рапортів: ${pathsToDelete.length}.`, "success");
    } catch { notify("Не вдалося видалити рапорт. Можливо, файл відкритий у Word.", "error"); }
    finally { setIsDeleting(false); }
  };

  const tools = <section className="panel generated-tools"><SearchInput placeholder="Пошук рапортів…" value={query} onChange={setQuery} /><Select ariaLabel="Період рапортів" value={period} onChange={(value) => setPeriod(value as Period)} options={[{ value: "today", label: "Сьогодні" }, { value: "week", label: "За тиждень" }, { value: "month", label: "За місяць" }]} /><button className="button danger" disabled={!selectedPaths.length} onClick={() => setPathsToDelete(selectedPaths)}><Trash2 />Видалити{selectedPaths.length ? ` (${selectedPaths.length})` : ""}</button></section>;

  return <PageFrame tools={tools} className="generated-page"><section className="panel data-table"><div className="data-table__scroll" onScroll={onReportsScroll}><table><thead><tr><th><CheckBox checked={filteredReports.length > 0 && filteredReports.every((report) => selectedPaths.includes(report.docxPath))} onChange={toggleVisibleReports} /></th><th>Назва рапорту</th><th>Шаблон</th><th>Дата генерації</th><th>Дії</th></tr></thead><tbody>{filteredReports.map((report) => <tr className={selectedPaths.includes(report.docxPath) ? "selected-row" : ""} key={report.docxPath}><td><CheckBox checked={selectedPaths.includes(report.docxPath)} onChange={() => toggleReport(report.docxPath)} /></td><td><span className="word-icon">W</span>{report.name}</td><td>{report.template}</td><td>{report.generatedAt}</td><td><button className="icon-button" aria-label={`Відкрити ${report.name}`} onClick={() => void openDocument(report.docxPath)}><Eye /></button><button className="icon-button" aria-label={`Відкрити папку ${report.name}`} onClick={() => void openFolder(report.folderPath)}><FolderOpen /></button><button className="icon-button danger" aria-label={`Видалити ${report.name}`} onClick={() => setPathsToDelete([report.docxPath])}><Trash2 /></button></td></tr>)}</tbody></table>{isLoadingMore && <div className="infinite-loading">Завантаження наступних 20 рапортів…</div>}{!isLoading && filteredReports.length === 0 && <div className="infinite-loading">За вибраний період рапортів не знайдено.</div>}</div><div className="pagination">{isLoading ? "Завантаження…" : `Показано ${filteredReports.length} із ${totalCount}`}</div></section>{pathsToDelete && <ConfirmDialog title={pathsToDelete.length === 1 ? "Видалити рапорт?" : "Видалити рапорти?"} message={pathsToDelete.length === 1 ? "DOCX-файл буде видалено без можливості відновлення." : `Буде видалено файлів: ${pathsToDelete.length}. Цю дію не можна скасувати.`} confirmLabel="Видалити" onConfirm={() => void confirmDelete()} onCancel={() => setPathsToDelete(null)} busy={isDeleting} />}</PageFrame>;
}
