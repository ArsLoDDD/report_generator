import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WarningsPage } from "./WarningsPage";

afterEach(cleanup);

describe("WarningsPage", () => {
  it("opens positions from an overdue position-work warning", () => {
    const onOpenPositions = vi.fn();
    render(<WarningsPage
      warnings={[{
        code: "position-work-overdue-42",
        title: "Прострочено: Облаштування",
        message: "Групу треба завершити вручну.",
      }]}
      isLoading={false}
      onRefresh={vi.fn()}
      onOpenPersonnel={vi.fn()}
      onOpenPositions={onOpenPositions}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Відкрити позиції" }));
    expect(onOpenPositions).toHaveBeenCalledTimes(1);
  });
});
