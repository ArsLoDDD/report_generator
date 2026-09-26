import { describe, expect, it } from "vitest";
import { expandSerialRange, splitSerialNumbers } from "./service-asset-serials";

describe("серійні номери майна СА та ППО", () => {
  it("розбирає список із рядків, ком і крапок з комою без дублікатів", () => {
    expect(splitSerialNumbers("FPV-001-A\nFPV-002-A, FPV-001-A;FPV-003-A")).toEqual([
      "FPV-001-A", "FPV-002-A", "FPV-003-A",
    ]);
  });

  it("розгортає числову частину всередині серійного номера", () => {
    expect(expandSerialRange("FPV-009-A", "FPV-012-A")).toEqual([
      "FPV-009-A", "FPV-010-A", "FPV-011-A", "FPV-012-A",
    ]);
  });

  it("не приймає діапазони з різними сталими частинами", () => {
    expect(() => expandSerialRange("FPV-001-A", "UAV-003-B")).toThrow(/числова частина/u);
  });
});
