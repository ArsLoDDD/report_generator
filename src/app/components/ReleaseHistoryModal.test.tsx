import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentRelease } from "../releaseNotes";
import { ReleaseHistoryModal } from "./ReleaseHistoryModal";

afterEach(cleanup);

describe("ReleaseHistoryModal", () => {
  it("renders every release description in its own keyboard-scrollable region", () => {
    render(<ReleaseHistoryModal onClose={vi.fn()} />);
    const notes = screen.getByRole("region", { name: `Опис змін версії ${currentRelease.version}` });
    expect(notes).toHaveClass("release-history-entry__notes");
    expect(notes).toHaveAttribute("tabindex", "0");
    expect(notes.querySelectorAll("p")).toHaveLength(currentRelease.notes.length);
  });
});
