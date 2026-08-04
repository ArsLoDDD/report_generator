import { useCallback, useEffect, useState } from "react";
import type { Template } from "../../../shared/types/domain";
import { templateService } from "../services/templateService";

const pageSize = 20;
let cachedTemplatesPage: { items: Template[]; totalCount: number } | null = null;
let firstPageRequest: Promise<{ items: Template[]; totalCount: number }> | null = null;

async function loadFirstTemplatesPage() {
  if (!firstPageRequest) {
    firstPageRequest = templateService.list(0, pageSize).finally(() => { firstPageRequest = null; });
  }
  const page = await firstPageRequest;
  cachedTemplatesPage = page;
  return page;
}

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>(() => cachedTemplatesPage?.items ?? []);
  const [totalCount, setTotalCount] = useState(() => cachedTemplatesPage?.totalCount ?? 0);
  const [isRefreshing, setIsRefreshing] = useState(() => cachedTemplatesPage === null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const page = await loadFirstTemplatesPage();
      setTemplates(page.items);
      setTotalCount(page.totalCount);
      return page.items;
    } finally { setIsRefreshing(false); }
  }, []);
  useEffect(() => { void refresh().catch(() => setTemplates([])); }, [refresh]);
  const loadMore = useCallback(async () => {
    if (isLoadingMore || templates.length >= totalCount) return;
    setIsLoadingMore(true);
    try {
      const page = await templateService.list(templates.length, pageSize);
      setTemplates((current) => {
        const next = [...current, ...page.items.filter((template) => !current.some((existing) => existing.sourcePath === template.sourcePath))];
        cachedTemplatesPage = { items: next, totalCount: page.totalCount };
        return next;
      });
      setTotalCount(page.totalCount);
    } finally { setIsLoadingMore(false); }
  }, [isLoadingMore, templates.length, totalCount]);
  return { templates, totalCount, hasMore: templates.length < totalCount, isRefreshing, isLoadingMore, loadMore, refresh };
}
