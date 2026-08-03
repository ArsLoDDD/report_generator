import { useCallback, useState } from "react";
import { reportGenerationService, type GeneratedReport, type TemplateValidationResult } from "../services/reportGenerationService";

export function useReportGeneration() {
  const [validation, setValidation] = useState<TemplateValidationResult | null>(null);
  const [inspection, setInspection] = useState<TemplateValidationResult | null>(null);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectTemplateFile = async () => {
    setError(null);
    return reportGenerationService.selectTemplateFile();
  };

  const inspectTemplate = useCallback(async (templatePath: string) => {
    setError(null);
    try {
      const result = await reportGenerationService.inspectTemplate(templatePath);
      setInspection(result);
      return result;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Не вдалося прочитати шаблон.";
      setError(message);
      return null;
    }
  }, []);

  const generate = async (templatePath: string, personnelIds: number[], reportDate?: string) => {
    setError(null);
    setGeneratedReport(null);
    setIsGenerating(true);
    try {
      const result = await reportGenerationService.validateTemplate(templatePath, personnelIds, reportDate);
      setValidation(result);
      if (!result.isValid) {
        return;
      }
      setGeneratedReport(await reportGenerationService.generateReport({ templatePath, personnelIds, reportDate }));
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

  const resetResult = useCallback(() => {
    setGeneratedReport(null);
    setValidation(null);
    setInspection(null);
    setError(null);
  }, []);

  return { error, generatedReport, inspection, isGenerating, selectTemplateFile, inspectTemplate, validation, generate, openReport, openReportFolder, resetResult };
}
