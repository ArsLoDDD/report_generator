import { invoke } from "@tauri-apps/api/core";
import type { PaginatedResult, Template, TemplateAnalysis, TemplateAnalysisProposal, TemplateInspection } from "../../../shared/types/domain";

export const templateService = {
  list: (offset: number, limit: number) => invoke<PaginatedResult<Template>>("list_templates", { offset, limit }),
  inspect: (templatePath: string) => invoke<TemplateInspection>("inspect_template", { templatePath }),
  open: (templatePath: string) => invoke<void>("open_template", { templatePath }),
  openDirectory: () => invoke<void>("open_templates_directory"),
  delete: (templatePath: string) => invoke<void>("delete_template", { templatePath }),
  analyseReport: (reportPath: string) => invoke<TemplateAnalysis>("analyse_report_for_template", { reportPath }),
  createFromAnalysis: (reportPath: string, templateName: string, replacements: Pick<TemplateAnalysisProposal, "value" | "token">[]) => invoke<string>("create_template_from_report_analysis", { reportPath, templateName, replacements })
};
