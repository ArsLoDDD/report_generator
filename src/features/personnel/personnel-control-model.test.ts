import { describe, expect, it } from "vitest";
import { blocksManualPersonnelAssignment, controlPeriod, controlTabs, formatControlDateTime, MANUAL_PERSONNEL_LOCATIONS, personnelLocationRequiresEndDate, personnelLocationRequiresInstitution, personnelLocationShowsEndDate, personnelLocationShowsInstitution, plannedPersonnelConflictReason, validatePersonnelControlDraft } from "./personnel-control-model";
import type { PersonnelControlRecord } from "./types";

const record = (tab: string, locationType = tab): PersonnelControlRecord => ({
  personnelId: 1,
  fullName: "ТЕСТОВИЙ Тест Тестович",
  rank: "солдат",
  position: "оператор",
  tab,
  locationType,
  source: "automatic",
  sourceLabel: "БЧС",
  canEdit: false,
  assignmentId: null,
  institution: "",
  startDate: "",
  endDate: "",
  untilSeparateOrder: false,
  notes: "",
  trainingInUnit: false,
  crewId: null,
  crewName: "",
  positionId: null,
  positionName: "",
  workId: null,
  workType: "",
  updatedAt: "2026-09-17",
});

describe("personnel control model", () => {
  it("keeps canonical tabs first and preserves unknown BCS locations", () => {
    expect(controlTabs([record("ЛІК"), record("На позиції", "ЗБЗ"), record("Інше місце")])).toEqual(["На позиції", "ЛІК", "Інше місце"]);
  });

  it("applies the field requirements for each manual location", () => {
    const base = { personnelId: 1, institution: "", startDate: "2026-09-17", endDate: "", notes: "", trainingInUnit: false } as const;
    expect(validatePersonnelControlDraft({ ...base, locationType: "НАВЧ", institution: "Центр" })).toMatchObject({ endDate: expect.any(String) });
    expect(validatePersonnelControlDraft({ ...base, locationType: "ВІДП" })).toMatchObject({ endDate: expect.any(String) });
    expect(validatePersonnelControlDraft({ ...base, locationType: "Відкомандировані" })).toMatchObject({ institution: expect.any(String) });
    expect(validatePersonnelControlDraft({ ...base, locationType: "ВІДР", institution: "Київ" })).toEqual({});
    expect(validatePersonnelControlDraft({ ...base, locationType: "ЛІК", institution: "Шпиталь", endDate: "2026-09-16" })).toMatchObject({ endDate: expect.any(String) });
    expect(personnelLocationRequiresInstitution("ВЛК")).toBe(true);
    expect(personnelLocationShowsEndDate("ВЛК")).toBe(true);
    expect(personnelLocationShowsEndDate("ПУ")).toBe(false);
    expect(personnelLocationShowsEndDate("ОХ")).toBe(false);
    expect(personnelLocationShowsEndDate("ЗХВ")).toBe(true);
    expect(personnelLocationRequiresEndDate("НАВЧ")).toBe(true);
    expect(personnelLocationRequiresEndDate("ВІДП")).toBe(true);
    expect(personnelLocationShowsInstitution("СЗЧ")).toBe(false);
    expect(personnelLocationRequiresInstitution("Відкомандировані")).toBe(true);
    expect(MANUAL_PERSONNEL_LOCATIONS).not.toEqual(expect.arrayContaining(["ГШР", "ОХП", "Прикомандирований", "Логістика на позиції"]));
    expect(MANUAL_PERSONNEL_LOCATIONS).toContain("ОХ");
  });

  it("does not allow a manual state to overwrite absence or position ownership", () => {
    for (const location of ["ВІДП", "Відкомандировані", "СЗЧ", "ПТЗ Новостав"]) {
      expect(blocksManualPersonnelAssignment({ ...record(location), source: "bcs" })).toBe(true);
    }
    expect(blocksManualPersonnelAssignment({ ...record("ОХ"), source: "bcs" })).toBe(false);
    expect(blocksManualPersonnelAssignment({ ...record("ЗАБ"), source: "bcs" })).toBe(false);
    expect(blocksManualPersonnelAssignment({ ...record("Логістика на позиції"), source: "bcs" })).toBe(false);
    expect(blocksManualPersonnelAssignment({ ...record("", ""), source: "bcs" })).toBe(false);
  });

  it("explains an open-ended business trip in the period", () => {
    expect(controlPeriod({ ...record("ВІДР"), startDate: "2026-09-17", untilSeparateOrder: true })).toBe("з 17.09.2026 · до окремого розпорядження");
    expect(formatControlDateTime("2026-09-17 14:25:41")).toBe("17.09.2026 17:25");
  });

  it("explains why a person is unavailable during a planned period", () => {
    const plan = { ...record("ВІДП"), source: "manual" as const, startDate: "2026-10-05", endDate: "2026-10-10", institution: "За місцем проживання" };
    expect(plannedPersonnelConflictReason([plan], 1, "2026-10-04", "2026-10-04")).toBe("");
    expect(plannedPersonnelConflictReason([plan], 1, "2026-10-10", "2026-10-12")).toBe("Заплановано «ВІДП» · За місцем проживання · 05.10.2026–10.10.2026");
  });
});
