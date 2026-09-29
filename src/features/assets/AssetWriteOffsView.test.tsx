import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { AssetWriteOffsView } from "./AssetWriteOffsView";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Списання майна", () => {
  it("показує компактний порожній стан без зайвого підсумкового блока і таблиці", async () => {
    invoke.mockResolvedValueOnce([]);
    render(<NotificationProvider><AssetWriteOffsView /></NotificationProvider>);

    expect(await screen.findByText("Списання відсутні")).toBeInTheDocument();
    expect(screen.getByText("Немає майна, переданого на списання.")).toBeInTheDocument();
    expect(document.querySelector(".asset-write-offs__summary")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
  });
});
