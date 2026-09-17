import { describe, expect, it } from "vitest";
import { customFieldId, getGenerationParameter, getSelectionRequirements, getVariable } from "./registry";

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

  it("derives only the explicitly selected subject for relational report fields", () => {
    expect(getSelectionRequirements([
      "військовий_1_піб",
      "військовий_1_екіпаж",
      "військовий_1_екіпаж_позиція",
      "військовий_1_фактичний_екіпаж",
      "військовий_1_автомобіль_1_водій_піб",
    ])).toEqual([expect.objectContaining({ id: "personnel", count: 1 })]);

    expect(getSelectionRequirements([
      "екіпаж_1_офіційний_склад",
      "екіпаж_1_бпла",
      "екіпаж_1_командир_піб",
    ])).toEqual([expect.objectContaining({ id: "crew", count: 1 })]);

    expect(getSelectionRequirements([
      "автомобіль_1_водій_піб",
      "автомобіль_1_екіпаж",
    ])).toEqual([expect.objectContaining({ id: "vehicle", count: 1 })]);
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

  it("uses a manually created Ukrainian token as a document parameter", () => {
    expect(getGenerationParameter("умови_передачі")?.name).toBe("Умови Передачі");
    expect(getGenerationParameter("адреса_лікарні")?.name).toBe("Адреса Лікарні");
    expect(getVariable("умови_передачі")?.category).toBe("Параметри документа");
    expect(getSelectionRequirements(["умови_передачі"])).toEqual([]);
    expect(getGenerationParameter("soldier_name")).toBeUndefined();
  });

  it("uses immutable keys for custom fields and recognises their selection subjects", () => {
    expect(customFieldId("unit_code")).toBe("custom_unit_code");
    expect(getVariable("військовий_1_custom_unit_code")?.category).toBe("Військовослужбовець");
    expect(getVariable("автомобіль_1_custom_fuel_type")?.category).toBe("Автомобіль");
    expect(getSelectionRequirements(["військовий_2_custom_unit_code", "автомобіль_3_custom_fuel_type"])).toEqual([
      expect.objectContaining({ id: "personnel", count: 2 }),
      expect.objectContaining({ id: "vehicle", count: 3 }),
    ]);
  });

  it("does not classify runtime signer values or obvious known-token typos as manual parameters", () => {
    expect(getGenerationParameter("черговий_частини_піб")).toBeUndefined();
    expect(getGenerationParameter("черговий_частини_посада")).toBeUndefined();
    expect(getVariable("черговий_частини_піб")?.category).toBe("Підписант із налаштувань");
    expect(getGenerationParameter("дата_рапортуа")).toBeUndefined();
    expect(getGenerationParameter("параметр_особливі_умови")).toBeDefined();
  });

  it("derives selections for legacy v1 templates without exposing aliases in the constructor", () => {
    expect(getVariable("soldier.fullName")?.category).toContain("Застаріла сумісність");
    expect(getVariable("soldiers[2].rank")?.name).toBe("Звання");
    expect(getVariable("mainName")?.category).toContain("Підписант");
    expect(getSelectionRequirements(["soldiers[0].fullName", "soldiers[2].rank"])).toEqual([
      expect.objectContaining({ id: "personnel", count: 3 }),
    ]);
  });
});
