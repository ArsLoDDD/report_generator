import { useCallback, useEffect, useRef, useState } from "react";
import type { Template } from "../../../shared/types/domain";
import { templateService } from "../services/templateService";

const pageSize = 20;
let cachedTemplatesPage: { items: Template[]; totalCount: number } | null = null;

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>(() => cachedTemplatesPage?.items ?? []);
  const [totalCount, setTotalCount] = useState(() => cachedTemplatesPage?.totalCount ?? 0);
  const [isRefreshing, setIsRefreshing] = useState(() => cachedTemplatesPage === null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const refreshRequest = useRef(0);
  const loadMoreRequest = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    ++loadMoreRequest.current;
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const page = await templateService.list(0, pageSize);
      if (request !== refreshRequest.current) return cachedTemplatesPage?.items ?? [];
      cachedTemplatesPage = page;
      setTemplates(page.items);
      setTotalCount(page.totalCount);
      return page.items;
    } catch (reason) {
      if (request === refreshRequest.current) setErrorMessage(typeof reason === "string" ? reason : "Не вдалося завантажити шаблони.");
      throw reason;
    } finally { if (request === refreshRequest.current) setIsRefreshing(false); }
  }, []);
  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);
  const loadMore = useCallback(async () => {
    if (isLoadingMore || templates.length >= totalCount) return;
    const request = ++loadMoreRequest.current;
    setIsLoadingMore(true);
    setErrorMessage(null);
    try {
      const page = await templateService.list(templates.length, pageSize);
      if (request !== loadMoreRequest.current) return;
      setTemplates((current) => {
        const next = [...current, ...page.items.filter((template) => !current.some((existing) => existing.sourcePath === template.sourcePath))];
        cachedTemplatesPage = { items: next, totalCount: page.totalCount };
        return next;
      });
      setTotalCount(page.totalCount);
    } catch (reason) {
      if (request === loadMoreRequest.current) setErrorMessage(typeof reason === "string" ? reason : "Не вдалося завантажити наступні шаблони.");
    } finally { if (request === loadMoreRequest.current) setIsLoadingMore(false); }
  }, [isLoadingMore, templates.length, totalCount]);
  return { templates, totalCount, hasMore: templates.length < totalCount, isRefreshing, isLoadingMore, errorMessage, loadMore, refresh };
}
