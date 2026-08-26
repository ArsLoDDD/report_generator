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
    expect(getSelectionRequirements(["назва_екіпажу_1"])).toEqual([]);
    expect(getVariable("екіпаж_1")).toBeUndefined();
    expect(getVariable("екіпаж_назва")).toBeUndefined();
    expect(getVariable("назва_екіпажу_1")?.name).toBe("Назва екіпажу");
  });

  it("keeps the comprehensive document parameter set in the shared registry", () => {
    for (const token of [
      "тип_інциденту_1",
      "номер_бойового_розпорядження_1",
      "район_розвідки_1",
      "дата_передачі_2",
      "кількість_вильотів_1",
      "матеріально_відповідальна_особа_1",
    ]) expect(getVariable(token)).toBeDefined();
  });

  it("supports numbered future selections and the personnel crew relation", () => {
    expect(getSelectionRequirements(["автомобіль_3_номер", "бпла_2_статус", "позиція_2_mgrs"])).toEqual([
      expect.objectContaining({ id: "vehicle", count: 3 }),
      expect.objectContaining({ id: "position", count: 2 }),
      expect.objectContaining({ id: "uav", count: 2 }),
    ]);
    expect(getVariable("військовий_1_екіпаж")?.name).toBe("Екіпаж");
    expect(getVariable("позиція_1_населений_пункт")?.name).toBe("Район населеного пункту");
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
