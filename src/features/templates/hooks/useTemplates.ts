import { useCallback, useEffect, useState } from "react";
import type { Template } from "../../../shared/types/domain";
import { templateService } from "../services/templateService";

const pageSize = 20;

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const refresh = useCallback(async () => {
    const page = await templateService.list(0, pageSize);
    setTemplates(page.items);
    setTotalCount(page.totalCount);
    return page.items;
  }, []);
  useEffect(() => { void refresh().catch(() => setTemplates([])); }, [refresh]);
  const loadMore = useCallback(async () => {
    if (isLoadingMore || templates.length >= totalCount) return;
    setIsLoadingMore(true);
    try {
      const page = await templateService.list(templates.length, pageSize);
      setTemplates((current) => [...current, ...page.items.filter((template) => !current.some((existing) => existing.sourcePath === template.sourcePath))]);
      setTotalCount(page.totalCount);
    } finally { setIsLoadingMore(false); }
  }, [isLoadingMore, templates.length, totalCount]);
  return { templates, totalCount, hasMore: templates.length < totalCount, isLoadingMore, loadMore, refresh };
}
