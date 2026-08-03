import { useCallback, useEffect, useState } from "react";
import type { GeneratedReportSummary } from "../../../shared/types/domain";
import { generatedReportsService } from "../services/generatedReportsService";

export function useGeneratedReports() {
  const [reports, setReports] = useState<GeneratedReportSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try { setReports(await generatedReportsService.list()); }
    catch { setReports([]); setErrorMessage("Не вдалося завантажити список рапортів із папки Reports."); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { reports, isLoading, errorMessage, refresh };
}
