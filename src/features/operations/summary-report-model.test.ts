import { describe, expect, it, vi } from "vitest";
import { canOpenNextReport, carryForwardSummary, defaultSummaryManual, initialReportDate, reportPeriod } from "./summary-report-model";

describe("підсумкове донесення", () => {
  it("keeps yesterday's report open before noon and switches at noon", () => {
    expect(initialReportDate(new Date(2026, 8, 15, 11, 59))).toBe("2026-09-14");
    expect(initialReportDate(new Date(2026, 8, 15, 12, 0))).toBe("2026-09-15");
  });

  it("offers the next report only after 18:01", () => {
    expect(canOpenNextReport("2026-09-15", new Date(2026, 8, 15, 18, 0))).toBe(false);
    expect(canOpenNextReport("2026-09-15", new Date(2026, 8, 15, 18, 1))).toBe(true);
    expect(reportPeriod("2026-09-15")).toEqual({ start: "2026-09-14T18:01", end: "2026-09-15T18:00" });
  });

  it("copies carry-forward objects without sharing their identities", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("new-id") });
    const previous = defaultSummaryManual();
    previous.nextTasks = [{ id: "old-task", text: "Продовжити роботу" }];
    const next = carryForwardSummary(previous);
    expect(next.nextTasks).toEqual([{ id: "new-id", text: "Продовжити роботу" }]);
    expect(next.nextTasks[0]).not.toBe(previous.nextTasks[0]);
    vi.unstubAllGlobals();
  });
});
