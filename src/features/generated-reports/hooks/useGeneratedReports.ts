import { useCallback, useEffect, useState } from "react";
import type { GeneratedReportSummary } from "../../../shared/types/domain";
import { generatedReportsService } from "../services/generatedReportsService";

const pageSize = 20;

export function useGeneratedReports() {
  const [reports, setReports] = useState<GeneratedReportSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const page = await generatedReportsService.list(0, pageSize);
      setReports(page.items);
      setTotalCount(page.totalCount);
    }
    catch { setReports([]); setTotalCount(0); setErrorMessage("Не вдалося завантажити список рапортів із папки Reports."); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const loadMore = useCallback(async () => {
    if (isLoadingMore || reports.length >= totalCount) return;
    setIsLoadingMore(true);
    try {
      const page = await generatedReportsService.list(reports.length, pageSize);
      setReports((current) => [...current, ...page.items.filter((report) => !current.some((existing) => existing.docxPath === report.docxPath))]);
      setTotalCount(page.totalCount);
    } finally { setIsLoadingMore(false); }
  }, [isLoadingMore, reports.length, totalCount]);
  return { reports, totalCount, hasMore: reports.length < totalCount, isLoading, isLoadingMore, errorMessage, refresh, loadMore };
}
