import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../services/templateService", () => ({
  templateService: { list },
}));

import { useTemplates } from "./useTemplates";

describe("useTemplates", () => {
  beforeEach(() => {
    list.mockReset();
  });

  it("rescans the template directory when the user refreshes", async () => {
    list
      .mockResolvedValueOnce({
        items: [{ name: "Видалений шаблон", sourcePath: "/templates/deleted.docx" }],
        totalCount: 1,
      })
      .mockResolvedValueOnce({ items: [], totalCount: 0 });

    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.templates).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenLastCalledWith(0, 20);
    expect(result.current.templates).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });
});
