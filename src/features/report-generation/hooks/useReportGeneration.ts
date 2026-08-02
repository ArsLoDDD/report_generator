import { useState } from "react";
import { reportGenerationService, type GeneratedReport, type TemplateValidationResult } from "../services/reportGenerationService";

export function useReportGeneration() {
  const [validation, setValidation] = useState<TemplateValidationResult | null>(null);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectTemplateFile = async () => {
    setError(null);
    return reportGenerationService.selectTemplateFile();
  };

  const generate = async (templatePath: string, personnelIds: number[]) => {
    setError(null);
    setGeneratedReport(null);
    setIsGenerating(true);
    try {
      const result = await reportGenerationService.validateTemplate(templatePath, personnelIds);
      setValidation(result);
      if (!result.isValid) {
        return;
      }
      setGeneratedReport(await reportGenerationService.generateReport({ templatePath, personnelIds }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не вдалося створити рапорт. Спробуйте ще раз.");
    } finally {
      setIsGenerating(false);
    }
  };

  const openReport = async (reportPath: string) => {
    try { await reportGenerationService.openGeneratedReport(reportPath); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося відкрити рапорт."); }
  };

  const openReportFolder = async (folderPath: string) => {
    try { await reportGenerationService.openGeneratedReportFolder(folderPath); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не вдалося відкрити папку рапорту."); }
  };

  return { error, generatedReport, isGenerating, selectTemplateFile, validation, generate, openReport, openReportFolder };
}
