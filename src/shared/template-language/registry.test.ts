import { describe, expect, it } from "vitest";
import { getSelectionRequirements, getVariable } from "./registry";

describe("selection requirements", () => {
  it("keeps personnel first and derives exact counts for mixed subjects", () => {
    expect(getSelectionRequirements([
      "генератор_1_назва",
      "екіпаж_1_назва",
      "військовий_2_піб",
      "військовий_1_звання",
    ])).toEqual([
      expect.objectContaining({ id: "personnel", count: 2 }),
      expect.objectContaining({ id: "crew", count: 1 }),
      expect.objectContaining({ id: "generator", count: 1 }),
    ]);
  });

  it("does not confuse a numbered document parameter with a crew selection", () => {
    expect(getSelectionRequirements(["екіпаж_1"])).toEqual([]);
    expect(getVariable("екіпаж_назва")).toBeUndefined();
  });

  it("supports numbered future selections and the personnel crew relation", () => {
    expect(getSelectionRequirements(["автомобіль_3_номер", "бпла_2_статус"])).toEqual([
      expect.objectContaining({ id: "vehicle", count: 3 }),
      expect.objectContaining({ id: "uav", count: 2 }),
    ]);
    expect(getVariable("військовий_1_екіпаж")?.name).toBe("Екіпаж");
  });

  it("applies the selection law to custom fields as well", () => {
    expect(getSelectionRequirements([
      "військовий_2_позивний",
      "автомобіль_2_тип_пального",
    ])).toEqual([
      expect.objectContaining({ id: "personnel", count: 2 }),
      expect.objectContaining({ id: "vehicle", count: 2 }),
    ]);
  });
});
