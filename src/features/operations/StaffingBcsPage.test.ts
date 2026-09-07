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
  it("не показує екіпажі у штатці та впорядковує людей у взводі", () => {
    const hierarchy = buildStaffingHierarchy([
      { ...record(1, "водій 1 відділення"), platoon: "1 взвод", crewId: 7, crewName: "Екіпаж Альфа" },
      { ...record(2, "командир взводу 1"), platoon: "1 взвод", crewId: 7, crewName: "Екіпаж Альфа" },
      { ...record(3, "оператор БпЛА 1 відділення 1 взводу"), platoon: "1 взвод", crewId: 7, crewName: "Екіпаж Альфа" },
    ]);

    const platoon = hierarchy.find((item) => item.section === "1 взвод");
    expect(hierarchy.some((item) => item.section === "Екіпажі")).toBe(false);
    expect(platoon?.groups.flatMap((group) => group.people).map((person) => person.personnelId)).toEqual([2, 3]);
  });

  it("відокремлює самостійний взвод від управління роти", () => {
    const hierarchy = buildStaffingHierarchy([
      { ...record(1, "командир роти", ""), crewId: null, crewName: null },
      record(2, "командир екіпажу", "Окремий взвод"),
    ]);

    expect(hierarchy.map((item) => item.section)).toContain("Управління роти");
    expect(hierarchy.find((item) => item.section === "Інші")?.groups[0]?.people.map((person) => person.personnelId)).toContain(2);
  });

  it("places a vacancy inside the matching structural group", () => {
    const hierarchy = buildStaffingHierarchy([{ ...record(1, "командир роти", ""), crewId: null, crewName: null }], ["Заступник командира роти", "Командир взводу 1"]);

    expect(hierarchy.find((item) => item.section === "Управління роти")?.groups[0]?.vacancies).toContain("Заступник командира");
    expect(hierarchy.find((item) => item.section === "1 взвод")?.groups[0]?.vacancies).toContain("Командир взводу");
  });

  it("does not put a person from another platoon into the first matching department", () => {
    const hierarchy = buildStaffingHierarchy([
      { ...record(9, "оператор 1 відділення 2 взводу", "2 взвод"), crewId: null, crewName: null },
    ]);
    const secondPlatoon = hierarchy.find((item) => item.section === "2 взвод");
    expect(secondPlatoon?.groups.find((group) => group.name === "1 відділення")?.people.map((person) => person.personnelId)).toEqual([9]);
    expect(hierarchy.find((item) => item.section === "1 взвод")?.groups.find((group) => group.name === "1 відділення")?.people).toHaveLength(0);
  });

  it("never places a platoon or department position into company management", () => {
    const hierarchy = buildStaffingHierarchy([
      { ...record(11, "головний сержант — командир відділення 1 взводу", "1 взвод"), crewId: null, crewName: null },
      { ...record(12, "водій-електрик 2 відділення 2 взводу", "2 взвод"), crewId: null, crewName: null },
    ]);
    const management = hierarchy.find((item) => item.section === "Управління роти");
    expect(management?.groups.flatMap((group) => group.people).map((person) => person.personnelId)).not.toContain(11);
    expect(management?.groups.flatMap((group) => group.people).map((person) => person.personnelId)).not.toContain(12);
    expect(hierarchy.find((item) => item.section === "1 взвод")?.groups.flatMap((group) => group.people).map((person) => person.personnelId)).toContain(11);
    expect(hierarchy.find((item) => item.section === "2 взвод")?.groups.flatMap((group) => group.people).map((person) => person.personnelId)).toContain(12);
  });

  it("keeps occupied and vacant positions in the order of the unit structure", () => {
    const hierarchy = buildStaffingHierarchy([{ ...record(20, "технік роти", ""), crewId: null, crewName: null }]);
    const management = hierarchy.find((item) => item.section === "Управління роти")?.groups[0];
    expect(management?.items.slice(0, 6).map((item) => item.kind === "person" ? item.person.position : item.position)).toEqual([
      "Командир роти", "Заступник командира", "Заступник командира роти з психологічної підтримки персоналу", "Головний сержант", "Старший технік", "технік роти",
    ]);
  });
});
