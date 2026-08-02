import { useCallback, useEffect, useState } from "react";
import { samplePeople } from "../../../shared/constants/mock-data";
import { personnelService } from "../../../shared/services/personnelService";
import type { Person } from "../../../shared/types/domain";

export function usePersonnel() {
  const [personnel, setPersonnel] = useState<Person[]>(samplePeople);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setIsLoading(true); setErrorMessage(null);
    try { setPersonnel(await personnelService.list()); }
    catch { setErrorMessage("Не вдалося завантажити особовий склад. Показано локальні дані для перегляду."); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { personnel, isLoading, errorMessage, refresh };
}
