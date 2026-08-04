import { useCallback, useEffect, useState } from "react";
import { personnelService } from "../../../shared/services/personnelService";
import type { Person, PersonnelDraft } from "../../../shared/types/domain";

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
  const createPersonnel = useCallback(async (draft: PersonnelDraft) => {
    const created = await personnelService.create(draft);
    setPersonnel((current) => [...current, created].sort((left, right) => left.id - right.id));
    return created;
  }, []);
  const updatePersonnel = useCallback(async (personnelId: number, draft: PersonnelDraft) => {
    const updated = await personnelService.update(personnelId, draft);
    setPersonnel((current) => current.map((person) => person.id === personnelId ? updated : person).sort((left, right) => left.id - right.id));
    return updated;
  }, []);
  const deletePersonnel = useCallback(async (personnelId: number) => {
    await personnelService.delete(personnelId);
    setPersonnel((current) => current.filter((person) => person.id !== personnelId));
  }, []);
  return { personnel, isLoading, errorMessage, refresh, createPersonnel, updatePersonnel, deletePersonnel };
}
