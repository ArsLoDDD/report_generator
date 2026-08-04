import { useCallback, useEffect, useState } from "react";
import type { GeneratedReportSummary } from "../../../shared/types/domain";
import { generatedReportsService } from "../services/generatedReportsService";

const pageSize = 20;
let cachedReportsPage: { items: GeneratedReportSummary[]; totalCount: number } | null = null;
let firstPageRequest: Promise<{ items: GeneratedReportSummary[]; totalCount: number }> | null = null;

async function loadFirstReportsPage() {
  if (!firstPageRequest) {
    firstPageRequest = generatedReportsService.list(0, pageSize).finally(() => { firstPageRequest = null; });
  }
  const page = await firstPageRequest;
  cachedReportsPage = page;
  return page;
}

/** Starts the first reports scan without blocking navigation. */
export function prefetchGeneratedReports() { return loadFirstReportsPage(); }

export function useGeneratedReports() {
  const [reports, setReports] = useState<GeneratedReportSummary[]>(() => cachedReportsPage?.items ?? []);
  const [totalCount, setTotalCount] = useState(() => cachedReportsPage?.totalCount ?? 0);
  const [isLoading, setIsLoading] = useState(() => cachedReportsPage === null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!cachedReportsPage) setIsLoading(true);
    else setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const page = await loadFirstReportsPage();
      setReports(page.items);
      setTotalCount(page.totalCount);
    }
    catch { setReports([]); setTotalCount(0); setErrorMessage("Не вдалося завантажити список рапортів із папки Reports."); }
    finally { setIsLoading(false); setIsRefreshing(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const loadMore = useCallback(async () => {
    if (isLoadingMore || reports.length >= totalCount) return;
    setIsLoadingMore(true);
    try {
      const page = await generatedReportsService.list(reports.length, pageSize);
      setReports((current) => {
        const next = [...current, ...page.items.filter((report) => !current.some((existing) => existing.docxPath === report.docxPath))];
        cachedReportsPage = { items: next, totalCount: page.totalCount };
        return next;
      });
      setTotalCount(page.totalCount);
    } finally { setIsLoadingMore(false); }
  }, [isLoadingMore, reports.length, totalCount]);
  return { reports, totalCount, hasMore: reports.length < totalCount, isLoading, isRefreshing, isLoadingMore, errorMessage, refresh, loadMore };
}
