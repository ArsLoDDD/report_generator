import { useCallback, useEffect, useState } from "react";
import type { Template } from "../../../shared/types/domain";
import { templateService } from "../services/templateService";

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const refresh = useCallback(async () => {
    const items = await templateService.list();
    setTemplates(items);
    return items;
  }, []);
  useEffect(() => { void refresh().catch(() => setTemplates([])); }, [refresh]);
  return { templates, refresh };
}
