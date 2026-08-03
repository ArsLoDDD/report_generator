import { useCallback, useEffect, useState } from "react";
import { personnelService } from "../../../shared/services/personnelService";
import type { Person } from "../../../shared/types/domain";

export function usePersonnel() {
  const [personnel, setPersonnel] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setIsLoading(true); setErrorMessage(null);
    try { setPersonnel(await personnelService.list()); }
    catch { setPersonnel([]); setErrorMessage("Не вдалося завантажити особовий склад із локальної бази даних. Спробуйте оновити сторінку."); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { personnel, isLoading, errorMessage, refresh };
}
