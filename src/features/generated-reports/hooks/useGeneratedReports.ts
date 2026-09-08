import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeneratedReportSummary } from "../../../shared/types/domain";
import { generatedReportsService } from "../services/generatedReportsService";
import { emitAppDataEvent, subscribeToAppDataEvent } from "../../../shared/events/appEvents";

const pageSize = 20;
type ReportsFilter = { query?: string; fromDate?: string };
type ReportsCache = { key: string; items: GeneratedReportSummary[]; totalCount: number };
let cachedReportsPage: ReportsCache | null = null;
let firstPageRequest: { key: string; request: Promise<{ items: GeneratedReportSummary[]; totalCount: number }> } | null = null;

const filterKey = (filters: ReportsFilter) => `${filters.fromDate ?? ""}\u0000${filters.query?.trim() ?? ""}`;

async function loadFirstReportsPage(filters: ReportsFilter = {}) {
  const key = filterKey(filters);
  if (!firstPageRequest || firstPageRequest.key !== key) {
    const request = generatedReportsService.list(0, pageSize, filters);
    firstPageRequest = { key, request };
  }
  const activeRequest = firstPageRequest;
  try {
    const page = await activeRequest.request;
    if (firstPageRequest === activeRequest) cachedReportsPage = { key, ...page };
    return page;
  } finally {
    if (firstPageRequest === activeRequest) firstPageRequest = null;
  }
}

/** Starts the first reports scan without blocking navigation. */
export function prefetchGeneratedReports() { return loadFirstReportsPage(); }

export function invalidateGeneratedReports() {
  cachedReportsPage = null;
  emitAppDataEvent("generated-reports-changed");
}

export function useGeneratedReports(filters: ReportsFilter = {}) {
  const stableFilters = useMemo(() => ({ query: filters.query, fromDate: filters.fromDate }), [filters.fromDate, filters.query]);
  const key = filterKey(stableFilters);
  const cached = cachedReportsPage?.key === key ? cachedReportsPage : null;
  const [reports, setReports] = useState<GeneratedReportSummary[]>(() => cached?.items ?? []);
  const [totalCount, setTotalCount] = useState(() => cached?.totalCount ?? 0);
  const [isLoading, setIsLoading] = useState(() => cached === null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!cachedReportsPage) setIsLoading(true);
    else setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const page = await loadFirstReportsPage(stableFilters);
      setReports(page.items);
      setTotalCount(page.totalCount);
    }
    catch { setReports([]); setTotalCount(0); setErrorMessage("Не вдалося завантажити список рапортів із папки Reports."); }
    finally { setIsLoading(false); setIsRefreshing(false); }
  }, [stableFilters]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const handleChange = () => { void refresh(); };
    return subscribeToAppDataEvent("generated-reports-changed", handleChange);
  }, [refresh]);
  const loadMore = useCallback(async () => {
    if (isLoadingMore || reports.length >= totalCount) return;
    setIsLoadingMore(true);
    try {
      const page = await generatedReportsService.list(reports.length, pageSize, stableFilters);
      setReports((current) => {
        const next = [...current, ...page.items.filter((report) => !current.some((existing) => existing.docxPath === report.docxPath))];
        cachedReportsPage = { key, items: next, totalCount: page.totalCount };
        return next;
      });
      setTotalCount(page.totalCount);
    } finally { setIsLoadingMore(false); }
  }, [isLoadingMore, key, reports.length, stableFilters, totalCount]);
  return { reports, totalCount, hasMore: reports.length < totalCount, isLoading, isRefreshing, isLoadingMore, errorMessage, refresh, loadMore };
}
