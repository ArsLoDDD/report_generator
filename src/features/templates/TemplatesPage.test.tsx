import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplatesPage } from "./TemplatesPage";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";

const { templateService, reportService } = vi.hoisted(() => ({ templateService: { inspect: vi.fn(), open: vi.fn(), openDirectory: vi.fn(), delete: vi.fn() }, reportService: { openDocument: vi.fn() } }));
vi.mock("./services/templateService", () => ({ templateService }));
vi.mock("../generated-reports/services/generatedReportsService", () => ({ generatedReportsService: reportService }));
vi.mock("../generated-reports/hooks/useGeneratedReports", () => ({ useGeneratedReports: () => ({ reports: [] }) }));

const first = { name: "Рапорт", description: "Основний", changed: "сьогодні", status: "ready" as const, variables: 2, sourcePath: "/templates/a.docx" };
const invalid = { name: "Помилковий", description: "Перевірка", changed: "вчора", status: "error" as const, variables: 1, sourcePath: "/templates/b.docx" };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Шаблони", () => {
  it("renders inspection groups and sends open, validate and delete requests", async () => {
    templateService.inspect.mockResolvedValue({ isValid: true, errors: [], variables: ["дата_рапорту", "військовий_1_піб", "основний_підписант_посада"] });
    templateService.open.mockResolvedValue(undefined); templateService.delete.mockResolvedValue(undefined);
    const onSelect = vi.fn(); const onRefresh = vi.fn().mockResolvedValue([invalid]);
    render(<NotificationProvider><TemplatesPage templates={[first, invalid]} totalCount={2} hasMore={false} isRefreshing={false} isLoadingMore={false} onLoadMore={vi.fn()} selected={first} onSelect={onSelect} onRefresh={onRefresh} /></NotificationProvider>);
    expect(await screen.findByText("Військовослужбовці")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Відкрити" }));
    await waitFor(() => expect(templateService.open).toHaveBeenCalledWith("/templates/a.docx"));
    fireEvent.click(screen.getByRole("button", { name: "Перевірити шаблон" }));
    await waitFor(() => expect(templateService.inspect).toHaveBeenCalledWith("/templates/a.docx"));
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Видалити" })[1]);
    await waitFor(() => expect(templateService.delete).toHaveBeenCalledWith("/templates/a.docx"));
  });

  it("filters by query and status", async () => {
    templateService.inspect.mockResolvedValue({ isValid: true, errors: [], variables: [] });
    render(<NotificationProvider><TemplatesPage templates={[first, invalid]} totalCount={2} hasMore={false} isRefreshing={false} isLoadingMore={false} onLoadMore={vi.fn()} selected={first} onSelect={vi.fn()} onRefresh={vi.fn()} /></NotificationProvider>);
    fireEvent.change(await screen.findByPlaceholderText("Пошук шаблонів…"), { target: { value: "Помилковий" } });
    expect(screen.getByText("Знайдено:").parentElement).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "Фільтри" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Статус шаблону" }), { target: { value: "ready" } });
    expect(screen.getByText("Знайдено:").parentElement).toHaveTextContent("0");
  });
});
