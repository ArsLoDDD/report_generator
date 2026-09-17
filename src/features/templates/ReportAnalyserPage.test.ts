import { describe, expect, it } from "vitest";
import type { TemplateAnalysisProposal } from "../../shared/types/domain";
import { defaultAnalysisSelection, normaliseAnalysisProposals, normaliseManualReplacement, normaliseSelectedTokenText, tokenSelectedInEditor } from "./ReportAnalyserPage";

function proposal(overrides: Partial<TemplateAnalysisProposal>): TemplateAnalysisProposal {
  return {
    value: "Значення",
    token: "параметр_1",
    label: "Параметр",
    category: "Параметри документа",
    occurrences: 1,
    confidence: "high",
    autoSelect: true,
    reason: "Точний збіг.",
    alternatives: [],
    ...overrides,
  };
}

describe("report analyser confidence", () => {
  it("selects only unambiguous proposals by default", () => {
    expect(defaultAnalysisSelection([
      proposal({ value: "А", token: "точна_1" }),
      proposal({ value: "Б", token: "сумнівна_1", confidence: "medium", autoSelect: false }),
      proposal({ value: "В", token: "повтор_1", occurrences: 2, autoSelect: false }),
    ])).toEqual(["А\u0000точна_1"]);
  });

  it("never exposes the ambiguous crew parameter", () => {
    const [result] = normaliseAnalysisProposals([
      proposal({
        value: "Сокіл",
        token: "екіпаж_1",
        label: "Екіпаж у документі",
        alternatives: [{ token: "військовий_1_екіпаж", label: "Екіпаж військовослужбовця" }],
      }),
    ]);

    expect(result.token).toBe("назва_екіпажу_1");
    expect(result.label).toBe("Назва екіпажу в документі");
    expect(result.alternatives.map((item) => item.token)).toEqual([
      "екіпаж_1_назва",
      "військовий_1_екіпаж",
    ]);
  });

  it("recognises a selected variable with or without its braces for modifier editing", () => {
    expect(tokenSelectedInEditor("{{військовий_1_звання:родовий}}")).toEqual({ id: "військовий_1_звання", modifiers: ["родовий"] });
    expect(tokenSelectedInEditor("піб_військовий_1")).toEqual({ id: "піб_військовий_1", modifiers: [] });
    expect(tokenSelectedInEditor("піб_військовий_2")).toEqual({ id: "піб_військовий_2", modifiers: [] });
    expect(tokenSelectedInEditor("звичайний текст")).toBeNull();
    expect(tokenSelectedInEditor("військовий_1_звання:невідомий")).toBeNull();
  });

  it("expands a token-body selection without producing double braces", () => {
    expect(normaliseSelectedTokenText("військовий_1_піб", "Текст {{", "}} далі")).toEqual({
      value: "{{військовий_1_піб}}",
      prefix: "Текст ",
    });
    expect(normaliseSelectedTokenText("{{військовий_1_піб}}", "Текст ", " далі").value).toBe("{{військовий_1_піб}}");
  });

  it("wraps a manually entered token exactly once and validates its modifiers", () => {
    expect(normaliseManualReplacement("військовий_1_піб:родовий")).toEqual({ value: "{{військовий_1_піб:родовий}}" });
    expect(normaliseManualReplacement("{{військовий_1_піб:родовий}}")).toEqual({ value: "{{військовий_1_піб:родовий}}" });
    expect(normaliseManualReplacement("{{військовий_1_піб:невідомий}}").error).toContain("Невідомий модифікатор");
    expect(normaliseManualReplacement("звичайний текст")).toEqual({ value: "звичайний текст" });
  });
});
