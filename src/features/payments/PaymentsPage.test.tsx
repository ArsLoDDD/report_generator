import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { personnelService } from "../../shared/services/personnelService";
import { PaymentsPage } from "./PaymentsPage";

vi.mock("../../shared/services/personnelService", () => ({ personnelService: { list: vi.fn() } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Виплати", () => {
  it("shows every person and one empty cell for every day of the current month", async () => {
    const now = new Date();
    const dayCount = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousDayCount = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0).getDate();
    vi.mocked(personnelService.list).mockResolvedValue({ items: [
      { id: 1, fullName: "ІВАНЕНКО Іван Іванович", rank: "солдат", position: "оператор" },
      { id: 2, fullName: "ПЕТРЕНКО Петро Петрович", rank: "сержант", position: "командир" },
    ], totalCount: 2 } as Awaited<ReturnType<typeof personnelService.list>>);

    render(<PaymentsPage />);

    const table = await screen.findByRole("table");
    expect(screen.getByRole("heading", { name: "Виплати" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Військовослужбовці" })).toBeInTheDocument();
    expect(within(table).getAllByRole("columnheader")).toHaveLength(dayCount + 1);
    expect(within(table).getByRole("rowheader", { name: /ІВАНЕНКО Іван Іванович/u })).toBeInTheDocument();
    const cell = within(table).getByRole("cell", { name: `ПЕТРЕНКО Петро Петрович, ${dayCount} число` });
    expect(cell).toBeEmptyDOMElement();
    fireEvent.mouseEnter(cell);
    expect(within(table).getByRole("columnheader", { name: String(dayCount) })).toHaveClass("is-column-highlighted");
    expect(screen.getByRole("button", { name: "Сформувати рапорт" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Наступний місяць" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Попередній місяць" }));
    expect(within(table).getAllByRole("columnheader")).toHaveLength(previousDayCount + 1);
    expect(screen.getByRole("button", { name: "Наступний місяць" })).toBeEnabled();
  });
});
