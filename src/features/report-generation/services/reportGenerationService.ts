import { invoke } from "@tauri-apps/api/core";

export type TemplateValidationResult = {
  isValid: boolean;
  errors: string[];
  variables: string[];
};

export type GeneratedReport = {
  docxPath: string;
  folderPath: string;
};

type GenerateReportRequest = {
  templatePath: string;
  personnelIds: number[];
};

export const reportGenerationService = {
  selectTemplateFile: () => invoke<string | null>("select_template_file"),
  validateTemplate: (templatePath: string, personnelIds: number[]) => invoke<TemplateValidationResult>("validate_template", { templatePath, personnelIds }),
  generateReport: (request: GenerateReportRequest) => invoke<GeneratedReport>("generate_report", { request }),
  openGeneratedReport: (reportPath: string) => invoke<void>("open_generated_report", { reportPath }),
  openGeneratedReportFolder: (folderPath: string) => invoke<void>("open_generated_report_folder", { folderPath })
};
