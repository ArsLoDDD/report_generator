import { useCallback, useRef, useState } from "react";
import { reportGenerationService, type GeneratedReport, type TemplateValidationResult } from "../services/reportGenerationService";
import { invalidateGeneratedReports } from "../../generated-reports/hooks/useGeneratedReports";

const messageFrom = (reason: unknown, fallback: string) =>
  typeof reason === "string" ? reason : reason instanceof Error ? reason.message : fallback;

export function useReportGeneration() {
  const [validation, setValidation] = useState<TemplateValidationResult | null>(null);
  const [inspection, setInspection] = useState<TemplateValidationResult | null>(null);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectedPath, setInspectedPath] = useState<string | null>(null);
  const inspectionRequest = useRef(0);

  const selectTemplateFile = async () => {
    setError(null);
    try {
      return await reportGenerationService.selectTemplateFile();
    } catch (reason) {
      setError(messageFrom(reason, "Не вдалося відкрити вибір шаблону."));
      return null;
    }
  };

  const inspectTemplate = useCallback(async (templatePath: string) => {
    const request = ++inspectionRequest.current;
    setError(null);
    setInspection(null);
    setInspectedPath(null);
    setIsInspecting(true);
    try {
      const result = await reportGenerationService.inspectTemplate(templatePath);
      if (request !== inspectionRequest.current) return null;
      setInspection(result);
      setInspectedPath(templatePath);
      return result;
    } catch (reason) {
      if (request === inspectionRequest.current) {
        setError(messageFrom(reason, "Не вдалося прочитати шаблон."));
      }
      return null;
    } finally {
      if (request === inspectionRequest.current) setIsInspecting(false);
    }
  }, []);

  const generate = async (templatePath: string, personnelIds: number[], parameters: Record<string, string> = {}, vehicleIds: number[] = [], crewIds: number[] = [], equipmentIds: number[] = [], positionIds: number[] = []) => {
    setError(null);
    setGeneratedReport(null);
    setIsGenerating(true);
    try {
      const result = await reportGenerationService.validateTemplate(templatePath, personnelIds, parameters, vehicleIds, crewIds, equipmentIds, positionIds);
      setValidation(result);
      if (!result.isValid) {
        return;
      }
      const generated = await reportGenerationService.generateReport({ templatePath, personnelIds, vehicleIds, crewIds, equipmentIds, positionIds, parameters });
      setGeneratedReport(generated);
      invalidateGeneratedReports();
    } catch (reason) {
      setError(messageFrom(reason, "Не вдалося створити рапорт. Спробуйте ще раз."));
    } finally {
      setIsGenerating(false);
    }
  };

  const openReport = async (reportPath: string) => {
    try { await reportGenerationService.openGeneratedReport(reportPath); }
    catch (reason) { setError(messageFrom(reason, "Не вдалося відкрити рапорт.")); }
  };

  const openReportFolder = async (folderPath: string) => {
    try { await reportGenerationService.openGeneratedReportFolder(folderPath); }
    catch (reason) { setError(messageFrom(reason, "Не вдалося відкрити папку рапорту.")); }
  };

  const resetResult = useCallback(() => {
    setGeneratedReport(null);
    setValidation(null);
    setError(null);
  }, []);

  return { error, generatedReport, inspection, inspectedPath, isGenerating, isInspecting, selectTemplateFile, inspectTemplate, validation, generate, openReport, openReportFolder, resetResult };
}
