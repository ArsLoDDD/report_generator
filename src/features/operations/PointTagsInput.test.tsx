import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PointTagsInput } from "./PointTagsInput";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PointTagsInput", () => {
  it("swaps two settlements when one tag is dropped on the other", () => {
    Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
    const onChange = vi.fn();
    const { container } = render(<PointTagsInput label="Маршрут" value={["КИЇВ", "ЛЬВІВ", "ОДЕСА"]} onChange={onChange} />);
    const source = screen.getByText("КИЇВ").closest<HTMLElement>("[data-flight-point-index]");
    const target = screen.getByText("ОДЕСА").closest<HTMLElement>("[data-flight-point-index]");
    expect(source).toBeTruthy();
    expect(target).toBeTruthy();
    if (!source || !target) return;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => target) });

    fireEvent.pointerDown(source, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 10 });
    expect(container.querySelector(".is-drop-target")).toBe(target);
    fireEvent.pointerUp(window, { clientX: 80, clientY: 10 });

    expect(onChange).toHaveBeenCalledWith(["ОДЕСА", "ЛЬВІВ", "КИЇВ"]);
  });
});
