import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UnitStructureNode } from "../../../shared/types/domain";
import { UnitStructureEditor } from "./UnitStructureEditor";

const structure: UnitStructureNode[] = [
  { id: "group-1", parentId: null, kind: "group", name: "Управління", order: 0 },
  { id: "group-2", parentId: null, kind: "group", name: "Перше відділення", order: 1 },
  { id: "position-1", parentId: "group-1", kind: "position", name: "Командир", order: 0 },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UnitStructureEditor", () => {
  it("reorders sibling structure items with pointer dragging", () => {
    Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
    const onChange = vi.fn();
    render(<UnitStructureEditor value={structure} onChange={onChange} />);
    const sourceHandle = screen.getAllByTitle("Перетягнути блок")[0];
    const target = screen.getByDisplayValue("Перше відділення").closest<HTMLElement>("[data-structure-node]");
    expect(target).toBeTruthy();
    if (!target) return;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => target) });

    fireEvent.pointerDown(sourceHandle, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 80 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 80 });

    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "group-1", order: 1 }),
      expect.objectContaining({ id: "group-2", order: 0 }),
    ]));
  });

  it("selects SHPK from the complete rank list through colonel", () => {
    const onChange = vi.fn();
    render(<UnitStructureEditor value={structure} onChange={onChange} />);
    fireEvent.click(screen.getByText("Командир"));
    const shpk = screen.getByRole("combobox", { name: "ШПК посади" });

    expect(screen.getByRole("option", { name: "Рекрут" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Полковник" })).toBeInTheDocument();
    fireEvent.change(shpk, { target: { value: "полковник" } });

    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "position-1", rankRequirement: "полковник" }),
    ]));
  });
});
