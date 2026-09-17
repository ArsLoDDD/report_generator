import { describe, expect, it } from "vitest";
import { controlPeriod, controlTabs, formatControlDateTime, validatePersonnelControlDraft } from "./personnel-control-model";
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

  it("requires an end date only for training and validates chronology", () => {
    expect(validatePersonnelControlDraft({ personnelId: 1, locationType: "НАВЧ", institution: "Центр", startDate: "2026-09-17", endDate: "", notes: "" })).toMatchObject({ endDate: expect.any(String) });
    expect(validatePersonnelControlDraft({ personnelId: 1, locationType: "ВІДР", institution: "Київ", startDate: "2026-09-17", endDate: "", notes: "" })).toEqual({});
    expect(validatePersonnelControlDraft({ personnelId: 1, locationType: "ЛІК", institution: "Шпиталь", startDate: "2026-09-17", endDate: "2026-09-16", notes: "" })).toMatchObject({ endDate: expect.any(String) });
  });

  it("explains an open-ended business trip in the period", () => {
    expect(controlPeriod({ ...record("ВІДР"), startDate: "2026-09-17", untilSeparateOrder: true })).toBe("з 17.09.2026 · до окремого розпорядження");
    expect(formatControlDateTime("2026-09-17 14:25:41")).toBe("17.09.2026 14:25");
  });
});
