import { describe, expect, it } from "vitest";
import { buildStaffingHierarchy } from "./StaffingBcsPage";
import type { StaffingRecord } from "./types";

const record = (personnelId: number, position: string, platoon = "1 взвод"): StaffingRecord => ({
  personnelId,
  fullName: `Військовий ${personnelId}`,
  rank: "солдат",
  position,
  crewId: personnelId,
  crewName: `Екіпаж ${personnelId}`,
  platoon,
  companyName: "Рота БпАК",
  unitType: "Екіпаж",
  crewPositionName: "СП Тест",
  battleOrder: "БР №1",
  sector: "Північ",
  officialStrength: 4,
  actualStrength: 2,
  crewStatus: "Працює",
  uavName: "Mavic 3",
  uavType: "мультироторний",
  functionalDuties: "Оператор",
  currentLocation: "район н.п. Тестове",
  bcsStatus: "Залучений",
  notes: "",
  actingPosition: "",
  recommendationCount: 0,
});

describe("Штат та БЧС", () => {
  it("групує людей по роті й взводу та ставить командира вище за водія", () => {
    const hierarchy = buildStaffingHierarchy([
      { ...record(1, "водій 1 екіпажу"), crewId: 7, crewName: "Екіпаж Альфа" },
      { ...record(2, "командир екіпажу"), crewId: 7, crewName: "Екіпаж Альфа" },
      { ...record(3, "оператор БпЛА"), crewId: 7, crewName: "Екіпаж Альфа" },
    ]);

    const crewGroup = hierarchy.find((item) => item.section === "Екіпажі")?.groups[0];
    expect(crewGroup?.people.map((person) => person.personnelId)).toEqual([2, 3, 1]);
  });

  it("відокремлює самостійний взвод від управління роти", () => {
    const hierarchy = buildStaffingHierarchy([
      { ...record(1, "командир роти", ""), crewId: null, crewName: null },
      record(2, "командир екіпажу", "Окремий взвод"),
    ]);

    expect(hierarchy.map((item) => item.section)).toEqual(["Управління роти", "Екіпажі"]);
  });
});
