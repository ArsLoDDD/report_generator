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
  return { warnings, isLoading, refresh };
}
