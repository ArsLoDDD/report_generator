import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEntityCollection } from "./useEntityCollection";

describe("useEntityCollection", () => {
  it("loads immediately and exposes a deterministic reload", async () => {
    const load = vi.fn().mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ id: 2 }]);
    const { result } = renderHook(() => useEntityCollection({ load }));

    await waitFor(() => expect(result.current.items).toEqual([{ id: 1 }]));
    await act(async () => { await result.current.reload(); });
    expect(result.current.items).toEqual([{ id: 2 }]);
    expect(result.current.isLoading).toBe(false);
  });

  it("keeps an empty collection and reports a load failure", async () => {
    const failure = new Error("offline");
    const onError = vi.fn();
    const load = vi.fn().mockRejectedValue(failure);
    const { result } = renderHook(() => useEntityCollection({ load, onError }));

    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current.items).toEqual([]);
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
