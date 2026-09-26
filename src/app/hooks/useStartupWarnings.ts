import { useCallback, useEffect, useState } from "react";
import type { StartupWarning } from "../../shared/types/domain";
import { applicationService } from "../services/applicationService";

export function useStartupWarnings() {
  const [warnings, setWarnings] = useState<StartupWarning[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try { setWarnings(await applicationService.getStartupWarnings()); }
    catch { setWarnings([]); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const refreshWarnings = () => { void refresh(); };
    window.addEventListener("operational-data-updated", refreshWarnings);
    window.addEventListener("focus", refreshWarnings);
    const timer = window.setInterval(refreshWarnings, 60_000);
    return () => {
      window.removeEventListener("operational-data-updated", refreshWarnings);
      window.removeEventListener("focus", refreshWarnings);
      window.clearInterval(timer);
    };
  }, [refresh]);
  return { warnings, isLoading, refresh };
}
