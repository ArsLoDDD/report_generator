import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalTooltip } from "./GlobalTooltip";

afterEach(cleanup);

describe("GlobalTooltip", () => {
  it("renders an icon label through document.body so clipping parents cannot hide it", () => {
    render(<div style={{ overflow: "hidden" }}><button className="icon-button" aria-label="Оновити">↻</button><GlobalTooltip /></div>);
    const button = screen.getByRole("button", { name: "Оновити" });
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ x: 40, y: 80, left: 40, right: 80, top: 80, bottom: 120, width: 40, height: 40, toJSON: () => ({}) });

    fireEvent.pointerOver(button);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Оновити");
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip.style.visibility).not.toBe("hidden");
  });

  it("supports keyboard focus and closes when focus leaves the icon control", () => {
    render(<><button className="button icon-only" aria-label="Видалити">×</button><GlobalTooltip /></>);
    const button = screen.getByRole("button", { name: "Видалити" });

    fireEvent.focusIn(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Видалити");
    fireEvent.focusOut(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
