import { useEffect, useState } from "react";
import type { StartupWarning } from "../../shared/types/domain";
import { applicationService } from "../services/applicationService";

export function useStartupWarnings() {
  const [warnings, setWarnings] = useState<StartupWarning[]>([]);
  useEffect(() => {
    void applicationService.getStartupWarnings().then(setWarnings).catch(() => setWarnings([]));
  }, []);
  return warnings;
}
