import { invoke } from "@tauri-apps/api/core";
import type { PaginatedResult, Template, TemplateInspection } from "../../../shared/types/domain";

export const templateService = {
  list: (offset: number, limit: number) => invoke<PaginatedResult<Template>>("list_templates", { offset, limit }),
  inspect: (templatePath: string) => invoke<TemplateInspection>("inspect_template", { templatePath }),
  open: (templatePath: string) => invoke<void>("open_template", { templatePath }),
  openDirectory: () => invoke<void>("open_templates_directory")
};
