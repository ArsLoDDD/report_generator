import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../services/generatedReportsService", () => ({
  generatedReportsService: { list },
}));

import { invalidateGeneratedReports, useGeneratedReports } from "./useGeneratedReports";

describe("useGeneratedReports", () => {
  beforeEach(() => {
    list.mockReset();
    list.mockResolvedValue({ items: [], totalCount: 0 });
  });

  it("filters the complete catalogue on the backend and reloads after generation", async () => {
    const filters = { query: "сокіл", fromDate: "2026-09-01" };
    renderHook(() => useGeneratedReports(filters));

    await waitFor(() => expect(list).toHaveBeenCalledWith(0, 20, filters));
    const callsBeforeInvalidation = list.mock.calls.length;

    act(() => invalidateGeneratedReports());

    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(callsBeforeInvalidation));
  });
});
