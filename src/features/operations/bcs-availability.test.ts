import { describe, expect, it } from "vitest";
import { isAvailableForFlightPlan, isAvailableForPositionWork, isOperationallyAvailable } from "./bcs-model";

describe("shared BCS availability policy", () => {
  it.each(["ВІДП", "Відкомандировані", "СЗЧ", "ПТЗ Новостав", "НАВЧ", "ВІДР", "ЛІК"])(
    "blocks %s from operational assignments",
    (location) => {
      expect(isOperationallyAvailable(location)).toBe(false);
      expect(isAvailableForFlightPlan(location)).toBe(false);
      expect(isAvailableForPositionWork(location)).toBe(false);
    },
  );

  it.each(["", "ОХ", "ЗАБ", "На позиції", "ЗБЗ", "ПБЗ", "ГШР", "Логістика на позиції"])(
    "keeps valid current state %s available for a flight-plan continuation",
    (location) => expect(isAvailableForFlightPlan(location)).toBe(true),
  );

  it("blocks current position and position-work states from a new position-work group", () => {
    for (const location of ["На позиції", "ЗБЗ", "ПБЗ", "ГШР", "Логістика на позиції", "Реко", "Облаштування", "Реко та облаштування"]) {
      expect(isAvailableForPositionWork(location)).toBe(false);
    }
    expect(isAvailableForPositionWork("ОХ")).toBe(true);
    expect(isAvailableForPositionWork("ЗАБ")).toBe(true);
  });
});
