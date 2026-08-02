import { useEffect, useState } from "react";
import type { Template } from "../../../shared/types/domain";
import { templateService } from "../services/templateService";

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  useEffect(() => { void templateService.list().then(setTemplates).catch(() => setTemplates([])); }, []);
  return { templates };
}
