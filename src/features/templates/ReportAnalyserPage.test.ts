import { describe, expect, it } from "vitest";
import type { TemplateAnalysisProposal } from "../../shared/types/domain";
import { defaultAnalysisSelection, normaliseAnalysisProposals } from "./ReportAnalyserPage";

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
});
