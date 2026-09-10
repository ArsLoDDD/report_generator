import { useEffect, useMemo, useState } from "react";
import { Eye, FolderOpen, Trash2 } from "lucide-react";
import type { GeneratedReportSummary } from "../../shared/types/domain";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { useLoadMoreOnScroll } from "../../shared/hooks/useLoadMoreOnScroll";
import { includesSearch } from "../../shared/utils/search";
import { useGeneratedReports } from "./hooks/useGeneratedReports";
import { generatedReportsService } from "./services/generatedReportsService";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";

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

function periodStart(period: Period) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (period === "today" ? 0 : period === "week" ? 6 : 29));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function GeneratedReportsPage() {
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  const reportFilters = useMemo(() => ({ query, fromDate: periodStart(period) }), [period, query]);
  const { reports, totalCount, hasMore, isLoading, isRefreshing, isLoadingMore, errorMessage, refresh, loadMore } = useGeneratedReports(reportFilters);
  const { notify } = useNotifications();
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
  const columns: EntityTableColumn<GeneratedReportSummary>[] = [
    { key: "name", title: "Назва рапорту", render: (report) => <><span className="word-icon">W</span>{report.name}</> },
    { key: "template", title: "Шаблон", render: (report) => report.template },
    { key: "generatedAt", title: "Дата генерації", render: (report) => report.generatedAt },
    { key: "actions", title: "Дії", sticky: "end", render: (report) => <><button className="icon-button" aria-label={`Відкрити ${report.name}`} onClick={() => void openDocument(report.docxPath)}><Eye /></button><button className="icon-button" aria-label={`Відкрити папку ${report.name}`} onClick={() => void openFolder(report.folderPath)}><FolderOpen /></button><button className="icon-button danger" aria-label={`Видалити ${report.name}`} onClick={() => setPathsToDelete([report.docxPath])}><Trash2 /></button></> },
  ];

  return <PageFrame tools={tools} className="generated-page"><section className="panel data-table"><EntityTable items={filteredReports} columns={columns} rowKey={(report) => report.docxPath} numberBy={false} selectedKeys={new Set(selectedPaths)} onToggleSelection={(report) => toggleReport(report.docxPath)} onToggleAll={toggleVisibleReports} rowClassName={(report) => selectedPaths.includes(report.docxPath) ? "selected-row" : ""} onScroll={onReportsScroll} isLoading={isLoading} loadingState={<div className="infinite-loading">Завантаження рапортів…</div>} emptyState={<div className="infinite-loading">За вибраний період рапортів не знайдено.</div>} footer={isLoadingMore && <div className="infinite-loading">Завантаження наступних 20 рапортів…</div>} /><div className="pagination">{isLoading ? "Завантаження…" : isRefreshing ? "Оновлення…" : `Показано ${filteredReports.length} із ${totalCount}`}</div></section>{pathsToDelete && <ConfirmDialog title={pathsToDelete.length === 1 ? "Видалити рапорт?" : "Видалити рапорти?"} message={pathsToDelete.length === 1 ? "DOCX-файл буде видалено без можливості відновлення." : `Буде видалено файлів: ${pathsToDelete.length}. Цю дію не можна скасувати.`} confirmLabel="Видалити" onConfirm={() => void confirmDelete()} onCancel={() => setPathsToDelete(null)} busy={isDeleting} />}</PageFrame>;
}
