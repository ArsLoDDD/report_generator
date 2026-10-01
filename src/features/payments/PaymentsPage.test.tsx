import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personnelService } from "../../shared/services/personnelService";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { settingsService } from "../settings/services/settingsService";
import { PaymentsPage } from "./PaymentsPage";
import { paymentsService } from "./paymentsService";

const saveDialog = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: (...args: unknown[]) => saveDialog(...args) }));
vi.mock("../../shared/services/personnelService", () => ({ personnelService: { list: vi.fn() } }));
vi.mock("../settings/services/settingsService", () => ({ settingsService: { get: vi.fn() } }));
vi.mock("./paymentsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./paymentsService")>();
  return { ...actual, paymentsService: { list: vi.fn(), save: vi.fn(), exportReport: vi.fn() } };
});

beforeEach(() => {
  vi.mocked(settingsService.get).mockResolvedValue({ unit: { kind: "Рота", shortName: "РБАК", authorizedStrength: 0 } } as Awaited<ReturnType<typeof settingsService.get>>);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const renderPage = () => render(<NotificationProvider><PaymentsPage /></NotificationProvider>);
const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
};
const domRect = (left: number, top: number, width: number, height: number) => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) }) as DOMRect;
const calculated = (personnelId: number, statusDate: string, manualOverride: "БР" | "БР30" | "30Б" | "30" | "ПУСТО" | null = null) => ({
  personnelId,
  statusDate,
  status: manualOverride === "ПУСТО" ? "" : manualOverride === "БР30" ? "БР" : manualOverride ?? "БР",
  reportCode: manualOverride === "ПУСТО" ? "" : manualOverride === "30Б" ? "30У" : manualOverride === "30" || manualOverride === "БР30" ? "30" : "100",
  tone: manualOverride === "ПУСТО" ? "empty" as const : manualOverride === "БР30" ? "yellow" as const : manualOverride === "30Б" ? "blue" as const : manualOverride === "30" ? "white" as const : "green" as const,
  actualLocation: "Позиція СОКІЛ",
  sourceDetails: "Польотів за день: 2.\nЕкіпаж «БАРС», позиція «СОКІЛ»: час «Небо» 09:20, 11:40.",
  manualOverride,
});

describe("Виплати", () => {
  it("shows calculated cells and edits only the selected cell in a compact popover", async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const dayCount = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousDayCount = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0).getDate();
    vi.mocked(personnelService.list).mockResolvedValue({ items: [
      { id: 1, fullName: "ІВАНЕНКО Іван Іванович", rank: "солдат", position: "оператор" },
      { id: 2, fullName: "ПЕТРЕНКО Петро Петрович", rank: "сержант", position: "командир" },
    ], totalCount: 2 } as Awaited<ReturnType<typeof personnelService.list>>);
    let manualOverride: "БР" | "БР30" | "30Б" | "30" | "ПУСТО" | null = null;
    vi.mocked(paymentsService.list).mockImplementation(async (selectedMonth) => selectedMonth === month ? [calculated(2, `${month}-01`, manualOverride)] : []);
    vi.mocked(paymentsService.save).mockResolvedValue();

    renderPage();

    const table = await screen.findByRole("table");
    await waitFor(() => expect(screen.getByRole("button", { name: "Сформувати рапорт" })).toBeEnabled());
    expect(screen.getByRole("heading", { name: "Виплати" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Військовослужбовці" })).toBeInTheDocument();
    expect(within(table).getAllByRole("columnheader")).toHaveLength(dayCount + 1);
    expect(within(table).getByRole("rowheader", { name: /ІВАНЕНКО Іван Іванович/u })).toBeInTheDocument();
    const cell = within(table).getByRole("button", { name: "ПЕТРЕНКО Петро Петрович, 1 число: БР" });
    expect(cell).not.toHaveAttribute("title");
    expect(within(table).getByRole("columnheader", { name: "1" })).toHaveAttribute("title");
    expect(within(table).queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.pointerOver(cell);
    expect(within(table).getByRole("columnheader", { name: "1" })).toHaveClass("is-column-highlighted");
    fireEvent.pointerLeave(table);
    expect(within(table).getByRole("columnheader", { name: "1" })).not.toHaveClass("is-column-highlighted");
    cell.focus();
    fireEvent.click(cell);
    const popover = screen.getByRole("dialog", { name: `Облік за ${month}-01` });
    expect(popover).toHaveTextContent("Польотів за день: 2.");
    expect(popover).toHaveTextContent("Екіпаж «БАРС», позиція «СОКІЛ»: час «Небо» 09:20, 11:40.");
    const manualGroup = within(popover).getByRole("group", { name: "Встановити статус вручну" });
    const hundredButton = within(manualGroup).getByRole("button", { name: /^БР база 100 тис\.$/u });
    await waitFor(() => expect(hundredButton).toHaveFocus());
    expect(hundredButton).toHaveAttribute("aria-pressed", "false");
    manualOverride = "30";
    fireEvent.click(screen.getByRole("button", { name: /^30 база 30 тис\.$/u }));
    await waitFor(() => expect(paymentsService.save).toHaveBeenCalledWith(2, `${month}-01`, "30"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: `Облік за ${month}-01` })).toHaveTextContent("Вручну встановлено: 30"));
    expect(screen.getByRole("button", { name: /^30 база 30 тис\.$/u })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^БР база 100 тис\.$/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^БР база 30 тис\.$/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^30Б база 10 тис\.$/u })).toBeInTheDocument();
    manualOverride = "ПУСТО";
    fireEvent.click(screen.getByRole("button", { name: "Залишити клітинку порожньою" }));
    await waitFor(() => expect(paymentsService.save).toHaveBeenCalledWith(2, `${month}-01`, "ПУСТО"));
    const blankCell = await within(table).findByRole("button", { name: "ПЕТРЕНКО Петро Петрович, 1 число: порожньо" });
    expect(blankCell).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Залишити клітинку порожньою" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: `Облік за ${month}-01` })).not.toBeInTheDocument());
    expect(blankCell).toHaveFocus();
    expect(screen.getByRole("button", { name: "Наступний місяць" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Попередній місяць" }));
    await waitFor(() => expect(within(table).getAllByRole("columnheader")).toHaveLength(previousDayCount + 1));
    expect(screen.getByRole("button", { name: "Наступний місяць" })).toBeEnabled();
  });

  it("offers both report templates and exports the selected one", async () => {
    vi.mocked(personnelService.list).mockResolvedValue({ items: [{ id: 1, fullName: "ІВАНЕНКО Іван", rank: "солдат", position: "оператор" }], totalCount: 1 } as Awaited<ReturnType<typeof personnelService.list>>);
    vi.mocked(paymentsService.list).mockResolvedValue([]);
    vi.mocked(paymentsService.exportReport).mockResolvedValue();
    saveDialog.mockResolvedValueOnce("/tmp/duty-report").mockResolvedValueOnce("/tmp/ten-k-report.xlsx");
    renderPage();

    const button = screen.getByRole("button", { name: "Сформувати рапорт" });
    await waitFor(() => expect(button).toBeEnabled());
    button.focus();
    fireEvent.click(button);
    const chooser = screen.getByRole("dialog", { name: "Сформувати рапорт" });
    expect(within(chooser).getByRole("button", { name: /Рапорт на ДВ/u })).toBeInTheDocument();
    expect(within(chooser).getByRole("button", { name: /Рапорт 10к/u })).toBeInTheDocument();
    fireEvent.click(within(chooser).getByRole("button", { name: /Рапорт на ДВ/u }));
    await waitFor(() => expect(saveDialog).toHaveBeenNthCalledWith(1, expect.objectContaining({ defaultPath: expect.stringMatching(/^Рапорт на ДВ РБАК /u) })));
    await waitFor(() => expect(paymentsService.exportReport).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/u), "/tmp/duty-report.xlsx", "duty"));
    expect(await screen.findByText("Рапорт на ДВ сформовано.")).toBeInTheDocument();

    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Сформувати рапорт" })).getByRole("button", { name: /Рапорт 10к/u }));
    await waitFor(() => expect(saveDialog).toHaveBeenNthCalledWith(2, expect.objectContaining({ defaultPath: expect.stringMatching(/^Рапорт 10к .+ РБАК\.xlsx$/u) })));
    await waitFor(() => expect(paymentsService.exportReport).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/u), "/tmp/ten-k-report.xlsx", "tenK"));
    expect(await screen.findByText("Рапорт 10к сформовано.")).toBeInTheDocument();
  });

  it("reports a native save-dialog failure and does not invoke export", async () => {
    vi.mocked(personnelService.list).mockResolvedValue({ items: [{ id: 1, fullName: "ІВАНЕНКО Іван", rank: "солдат", position: "оператор" }], totalCount: 1 } as Awaited<ReturnType<typeof personnelService.list>>);
    vi.mocked(paymentsService.list).mockResolvedValue([]);
    saveDialog.mockRejectedValueOnce(new Error("Діалог збереження недоступний."));
    renderPage();

    const button = screen.getByRole("button", { name: "Сформувати рапорт" });
    await waitFor(() => expect(button).toBeEnabled());
    button.focus();
    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Сформувати рапорт" })).getByRole("button", { name: /Рапорт на ДВ/u }));

    expect(await screen.findByText("Діалог збереження недоступний.")).toBeInTheDocument();
    expect(paymentsService.exportReport).not.toHaveBeenCalled();
    await waitFor(() => expect(button).toBeEnabled());
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("keeps the selected month status map when an older cell save finishes late", async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
    const saveGate = deferred<void>();
    vi.mocked(personnelService.list).mockResolvedValue({ items: [{ id: 1, fullName: "ІВАНЕНКО Іван", rank: "солдат", position: "оператор" }], totalCount: 1 } as Awaited<ReturnType<typeof personnelService.list>>);
    vi.mocked(paymentsService.list).mockImplementation(async (requestedMonth) => [calculated(1, `${requestedMonth}-01`, requestedMonth === previousMonth ? "30Б" : null)]);
    vi.mocked(paymentsService.save).mockReturnValue(saveGate.promise);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "ІВАНЕНКО Іван, 1 число: БР" }));
    fireEvent.click(screen.getByRole("button", { name: /^30 база 30 тис\.$/u }));
    await waitFor(() => expect(paymentsService.save).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Попередній місяць" }));
    const currentCell = await screen.findByRole("button", { name: "ІВАНЕНКО Іван, 1 число: 30Б" });

    await act(async () => { saveGate.resolve(undefined); await saveGate.promise; });
    await waitFor(() => expect(screen.getByRole("button", { name: "Сформувати рапорт" })).toBeEnabled());
    expect(currentCell).toBeEnabled();
    expect(vi.mocked(paymentsService.list).mock.calls.filter(([requestedMonth]) => requestedMonth === month)).toHaveLength(1);
    expect(vi.mocked(paymentsService.list).mock.calls.filter(([requestedMonth]) => requestedMonth === previousMonth)).toHaveLength(1);
  });

  it("keeps cells blank and actions disabled after a calculation failure, then recovers", async () => {
    const now = new Date();
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
    vi.mocked(personnelService.list).mockResolvedValue({ items: [{ id: 1, fullName: "ІВАНЕНКО Іван", rank: "солдат", position: "оператор" }], totalCount: 1 } as Awaited<ReturnType<typeof personnelService.list>>);
    vi.mocked(paymentsService.list).mockRejectedValueOnce(new Error("boom")).mockImplementation(async (requestedMonth) => [calculated(1, `${requestedMonth}-01`)]);
    renderPage();

    expect(await screen.findByText("Не вдалося розрахувати виплати.")).toBeInTheDocument();
    const unavailableCell = screen.getByRole("button", { name: "ІВАНЕНКО Іван, 1 число: дані недоступні" });
    expect(unavailableCell).toBeDisabled();
    expect(unavailableCell).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Сформувати рапорт" })).toBeDisabled();
    fireEvent.click(unavailableCell);
    expect(screen.queryByRole("dialog", { name: /Облік за/u })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Попередній місяць" }));
    expect(await screen.findByRole("button", { name: "ІВАНЕНКО Іван, 1 число: БР" })).toBeEnabled();
    expect(screen.queryByText("Не вдалося розрахувати виплати.")).not.toBeInTheDocument();
    expect(vi.mocked(paymentsService.list)).toHaveBeenLastCalledWith(previousMonth);
    expect(screen.getByRole("button", { name: "Сформувати рапорт" })).toBeEnabled();
  });

  it("does not clear a personnel-load error when the month changes", async () => {
    vi.mocked(personnelService.list).mockRejectedValue(new Error("boom"));
    vi.mocked(paymentsService.list).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("Не вдалося завантажити особовий склад.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Попередній місяць" }));
    await waitFor(() => expect(paymentsService.list).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Не вдалося завантажити особовий склад.")).toBeInTheDocument();
    expect(screen.queryByText("В особовому складі ще немає записів.")).not.toBeInTheDocument();
  });

  it("repositions the compact popover inside a resized viewport", async () => {
    let viewportWidth = 900;
    let viewportHeight = 700;
    const widthSpy = vi.spyOn(window, "innerWidth", "get").mockImplementation(() => viewportWidth);
    const heightSpy = vi.spyOn(window, "innerHeight", "get").mockImplementation(() => viewportHeight);
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("payment-cell-popover")) return domRect(0, 0, Math.min(460, viewportWidth - 24), Math.min(360, viewportHeight - 24));
      if (this.dataset.paymentKey) return domRect(viewportWidth - 58, viewportHeight - 58, 46, 48);
      return domRect(0, 0, 0, 0);
    });
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      vi.mocked(personnelService.list).mockResolvedValue({ items: [{ id: 1, fullName: "ІВАНЕНКО Іван", rank: "солдат", position: "оператор" }], totalCount: 1 } as Awaited<ReturnType<typeof personnelService.list>>);
      vi.mocked(paymentsService.list).mockResolvedValue([calculated(1, `${month}-01`)]);
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: "ІВАНЕНКО Іван, 1 число: БР" }));
      const popover = screen.getByRole("dialog", { name: `Облік за ${month}-01` });

      viewportWidth = 360;
      viewportHeight = 240;
      fireEvent(window, new Event("resize"));
      await waitFor(() => {
        expect(popover).toHaveStyle({ left: "12px", top: "12px" });
      });
    } finally {
      rectSpy.mockRestore();
      heightSpy.mockRestore();
      widthSpy.mockRestore();
    }
  });

  it("does not show the removed calculation legend", async () => {
    vi.mocked(personnelService.list).mockResolvedValue({ items: [], totalCount: 0 } as Awaited<ReturnType<typeof personnelService.list>>);
    vi.mocked(paymentsService.list).mockResolvedValue([]);
    renderPage();
    await screen.findByText("В особовому складі ще немає записів.");
    expect(screen.queryByRole("region", { name: "Правила автоматичного розрахунку" })).not.toBeInTheDocument();
  });

  it("can return a manual correction to the automatic calculation", async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    vi.mocked(personnelService.list).mockResolvedValue({ items: [{ id: 1, fullName: "ІВАНЕНКО Іван", rank: "солдат", position: "оператор" }], totalCount: 1 } as Awaited<ReturnType<typeof personnelService.list>>);
    let manualOverride: "30" | null = "30";
    vi.mocked(paymentsService.list).mockImplementation(async () => [calculated(1, `${month}-01`, manualOverride)]);
    vi.mocked(paymentsService.save).mockImplementation(async (_id, _date, status) => { manualOverride = status === "30" ? "30" : null; });
    renderPage();
    const cell = await screen.findByRole("button", { name: "ІВАНЕНКО Іван, 1 число: 30" });
    fireEvent.click(cell);
    fireEvent.click(screen.getByRole("button", { name: "Автоматичний розрахунок" }));
    await waitFor(() => expect(paymentsService.save).toHaveBeenCalledWith(1, `${month}-01`, ""));
    await waitFor(() => expect(screen.getByRole("dialog", { name: `Облік за ${month}-01` })).not.toHaveTextContent("Вручну встановлено"));
  });
});
