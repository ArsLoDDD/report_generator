import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { service, invalidateGeneratedReports } = vi.hoisted(() => ({
  service: {
    selectTemplateFile: vi.fn(),
    inspectTemplate: vi.fn(),
    validateTemplate: vi.fn(),
    generateReport: vi.fn(),
    openGeneratedReport: vi.fn(),
    openGeneratedReportFolder: vi.fn(),
  },
  invalidateGeneratedReports: vi.fn(),
}));

vi.mock("../services/reportGenerationService", () => ({ reportGenerationService: service }));
vi.mock("../../generated-reports/hooks/useGeneratedReports", () => ({ invalidateGeneratedReports }));

import { useReportGeneration } from "./useReportGeneration";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe("useReportGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.selectTemplateFile.mockResolvedValue(null);
    service.openGeneratedReport.mockResolvedValue(undefined);
    service.openGeneratedReportFolder.mockResolvedValue(undefined);
  });

  it("ignores a late inspection result from the previously selected template", async () => {
    const first = deferred<{ isValid: boolean; errors: string[]; variables: string[] }>();
    const second = deferred<{ isValid: boolean; errors: string[]; variables: string[] }>();
    service.inspectTemplate
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useReportGeneration());

    let firstRequest!: Promise<unknown>;
    let secondRequest!: Promise<unknown>;
    act(() => {
      firstRequest = result.current.inspectTemplate("/templates/old.docx");
      secondRequest = result.current.inspectTemplate("/templates/current.docx");
    });
    await act(async () => {
      second.resolve({ isValid: true, errors: [], variables: ["дата_рапорту"] });
      await secondRequest;
    });
    await act(async () => {
      first.resolve({ isValid: false, errors: ["Старий результат"], variables: [] });
      await firstRequest;
    });

    expect(result.current.inspectedPath).toBe("/templates/current.docx");
    expect(result.current.inspection).toEqual({ isValid: true, errors: [], variables: ["дата_рапорту"] });
    expect(result.current.isInspecting).toBe(false);
  });

  it("preserves the concrete backend error shown to the user", async () => {
    service.inspectTemplate.mockRejectedValue("DOCX має пошкоджену ZIP-структуру.");
    const { result } = renderHook(() => useReportGeneration());

    await act(async () => {
      await result.current.inspectTemplate("/templates/broken.docx");
    });

    expect(result.current.error).toBe("DOCX має пошкоджену ZIP-структуру.");
    expect(result.current.inspectedPath).toBeNull();
  });

  it("generates only after validation and invalidates report history", async () => {
    service.validateTemplate.mockResolvedValue({ isValid: true, errors: [], variables: [] });
    service.generateReport.mockResolvedValue({ docxPath: "/reports/result.docx", folderPath: "/reports" });
    const { result } = renderHook(() => useReportGeneration());

    await act(async () => {
      await result.current.generate("/templates/report.docx", [7], { тема_рапорту: "Тест" });
    });

    expect(service.validateTemplate).toHaveBeenCalledOnce();
    expect(service.generateReport).toHaveBeenCalledOnce();
    expect(result.current.generatedReport).toEqual({ docxPath: "/reports/result.docx", folderPath: "/reports" });
    expect(invalidateGeneratedReports).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.isGenerating).toBe(false));
  });
});
