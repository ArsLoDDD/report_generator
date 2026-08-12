import { invoke } from "@tauri-apps/api/core";
import type { TemplateInspection } from "../../../shared/types/domain";

export type TemplateValidationResult = TemplateInspection;

export type GeneratedReport = {
  docxPath: string;
  folderPath: string;
};

type GenerateReportRequest = {
  templatePath: string;
  personnelIds: number[];
  reportDate?: string;
  vehicleIds?: number[];
  parameters?: Record<string, string>;
};

export const reportGenerationService = {
  selectTemplateFile: () => invoke<string | null>("select_template_file"),
  inspectTemplate: (templatePath: string) => invoke<TemplateValidationResult>("inspect_template", { templatePath }),
  validateTemplate: (templatePath: string, personnelIds: number[], parameters: Record<string, string> = {}, vehicleIds: number[] = []) => invoke<TemplateValidationResult>("validate_template", { templatePath, personnelIds, vehicleIds, parameters }),
  generateReport: (request: GenerateReportRequest) => invoke<GeneratedReport>("generate_report", { request }),
  openGeneratedReport: (reportPath: string) => invoke<void>("open_generated_report", { reportPath }),
  openGeneratedReportFolder: (folderPath: string) => invoke<void>("open_generated_report_folder", { folderPath })
};
