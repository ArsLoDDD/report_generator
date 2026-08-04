import { useCallback, useEffect, useState } from "react";
import { personnelService } from "../../../shared/services/personnelService";
import type { Person, PersonnelDraft } from "../../../shared/types/domain";

const pageSize = 20;

export function usePersonnel() {
  const [personnel, setPersonnel] = useState<Person[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setIsLoading(true); setErrorMessage(null);
    try {
      const page = await personnelService.list(0, pageSize);
      setPersonnel(page.items);
      setTotalCount(page.totalCount);
    }
    catch { setPersonnel([]); setTotalCount(0); setErrorMessage("Не вдалося завантажити особовий склад із локальної бази даних. Спробуйте оновити сторінку."); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const loadMore = useCallback(async () => {
    if (isLoadingMore || personnel.length >= totalCount) return;
    setIsLoadingMore(true);
    try {
      const page = await personnelService.list(personnel.length, pageSize);
      setPersonnel((current) => [...current, ...page.items.filter((person) => !current.some((existing) => existing.id === person.id))]);
      setTotalCount(page.totalCount);
    } finally { setIsLoadingMore(false); }
  }, [isLoadingMore, personnel.length, totalCount]);
  const createPersonnel = useCallback(async (draft: PersonnelDraft) => {
    const created = await personnelService.create(draft);
    setPersonnel((current) => [...current, created].sort((left, right) => left.id - right.id));
    setTotalCount((current) => current + 1);
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
    setTotalCount((current) => Math.max(0, current - 1));
  }, []);
  return { personnel, totalCount, hasMore: personnel.length < totalCount, isLoading, isLoadingMore, errorMessage, refresh, loadMore, createPersonnel, updatePersonnel, deletePersonnel };
}
