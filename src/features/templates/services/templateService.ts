import { invoke } from "@tauri-apps/api/core";
import type { Template, TemplateInspection } from "../../../shared/types/domain";

export const templateService = {
  list: () => invoke<Template[]>("list_templates"),
  inspect: (templatePath: string) => invoke<TemplateInspection>("inspect_template", { templatePath })
};
