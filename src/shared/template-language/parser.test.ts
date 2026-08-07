import { describe, expect, it } from "vitest";
import { modifierRegistry, variableRegistry } from "./registry";
import { parseTemplateTokens, validateToken } from "./parser";

describe("Template Language v2 registry and validator", () => {
  it("validates every registered variable", () => {
    for (const variable of variableRegistry) expect(validateToken(parseTemplateTokens(`{{${variable.id}}}`)[0])).toEqual([]);
  });
  it("contains all seven cases and all signer roles", () => {
    expect(modifierRegistry.filter((item) => item.group === "case")).toHaveLength(7);
    for (const prefix of ["основний_підписант", "командир", "начальник_штабу", "заступник_ппп", "заступник_озброєння", "заступник_тилу", "начальник_пмм"])
      expect(variableRegistry.some((item) => item.id === `${prefix}_піб`)).toBe(true);
  });
  it("supports arbitrary ordered pipelines", () => expect(parseTemplateTokens("{{військовий_21_піб:родовий:великими}}")[0].modifiers).toEqual(["родовий", "великими"]));
  it("rejects duplicates, conflicting case and register modifiers", () => {
    expect(validateToken(parseTemplateTokens("{{військовий_1_піб:родовий:родовий}}")[0]).length).toBeGreaterThan(0);
    expect(validateToken(parseTemplateTokens("{{військовий_1_піб:великими:маленькими}}")[0]).length).toBeGreaterThan(0);
  });
  it("rejects v1, invalid numbers, types and misspelled modifiers", () => {
    expect(validateToken(parseTemplateTokens("{{soldier.fullName}}")[0])[0].message).toContain("Невідома змінна");
    expect(validateToken(parseTemplateTokens("{{військовий_0_піб}}")[0]).length).toBeGreaterThan(0);
    expect(validateToken(parseTemplateTokens("{{військовий_1_іпн:родовий}}")[0]).length).toBeGreaterThan(0);
    expect(validateToken(parseTemplateTokens("{{військовий_1_піб:родовийй}}")[0])[0].message).toContain("родовийй");
  });
});
