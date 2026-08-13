import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { templateService } from "./features/templates/services/templateService";

vi.mock("./shared/services/personnelService", () => ({
  personnelService: { list: vi.fn().mockResolvedValue({ items: [
    { id: 1, fullName: "ВАСИЛЬОК Іван Аркадійович", rank: "Солдат", surname: "ВАСИЛЬОК", givenName: "Іван", patronymic: "Аркадійович", position: "Стрілець, військова частина А0000", taxId: "7462389812", birthDate: "02.03.1999 року", educationLevel: "вища", educationDetails: "Академія", armedForcesServiceStartDate: "2022", positionAssignedDate: "2026", positionAssignmentOrder: "№1", militaryId: "АВ №077672", assignedVehicleName: "Great Wall", assignedVehicleRegistration: "АВ 7265" },
    { id: 2, fullName: "ПЕТРЕНКО Петро Петрович", rank: "Старший солдат", surname: "ПЕТРЕНКО", givenName: "Петро", patronymic: "Петрович", position: "Оператор БпЛА, військова частина А0000", taxId: "7462389813", birthDate: "14.05.1998 року", educationLevel: "середня спеціальна", educationDetails: "Коледж", armedForcesServiceStartDate: "2022", positionAssignedDate: "2023", positionAssignmentOrder: "№2", militaryId: "АВ №077673", assignedVehicleName: "Mitsubishi L200", assignedVehicleRegistration: "АВ 7266" }
  ], totalCount: 2 }), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listCustomFields: vi.fn().mockResolvedValue([]), listPersonnelFields: vi.fn().mockResolvedValue([]), createCustomField: vi.fn() }
}));

vi.mock("./app/services/applicationService", () => ({
  applicationService: { getStartupWarnings: vi.fn().mockResolvedValue([{ code: "templates-missing", title: "Шаблони були відсутні", message: "Стартові шаблони відновлено." }]) }
}));

vi.mock("./features/generated-reports/services/generatedReportsService", () => ({
  generatedReportsService: { list: vi.fn().mockResolvedValue({ items: [{ name: "Рапорт на відпустку", template: "Рапорт на відпустку", generatedAt: "2026-08-03 10:15:30", docxPath: "/Reports/2026-08-03/Рапорт на відпустку 2026-08-03 10-15-30/Рапорт на відпустку.docx", folderPath: "/Reports/2026-08-03/Рапорт на відпустку 2026-08-03 10-15-30" }], totalCount: 1 }), openDocument: vi.fn(), openFolder: vi.fn(), delete: vi.fn() }
}));

vi.mock("./features/settings/services/settingsService", () => ({
  settingsService: { get: vi.fn().mockResolvedValue({ mainSigner: { fullName: "Іваненко Іван Іванович", rank: "майор", position: "Заступник командира з ППП" }, commander: { fullName: "Петренко Петро Петрович", rank: "капітан", position: "Командир" }, chief: { fullName: "Сидоренко Сергій Сергійович", rank: "капітан", position: "Начальник штабу" }, deputyPpp: { fullName: "Коваленко Дмитро Сергійович", rank: "майор", position: "Заступник командира з ППП" }, deputyArmament: { fullName: "", rank: "", position: "Заступник командира з Озброєння" }, deputyRear: { fullName: "", rank: "", position: "Заступник командира з Тилу" }, fuelChief: { fullName: "", rank: "", position: "Начальник ПММ" } }), updateSigner: vi.fn(), openApplicationDirectory: vi.fn(), createDatabaseBackup: vi.fn().mockResolvedValue("/backups/Резервна копія БД 10-00-00.zip") }
}));

vi.mock("./features/report-generation/services/reportGenerationService", () => ({
  reportGenerationService: {
    selectTemplateFile: vi.fn().mockResolvedValue("/templates/Нагородний рапорт.docx"),
    inspectTemplate: vi.fn().mockResolvedValue({ isValid: true, errors: [], variables: ["військовий_1_піб", "дата_рапорту"] }),
    validateTemplate: vi.fn().mockResolvedValue({ isValid: true, errors: [], variables: [] }),
    generateReport: vi.fn().mockResolvedValue({ docxPath: "/Reports/2026-08-03/Рапорт на відпустку/Рапорт на відпустку.docx", folderPath: "/Reports/2026-08-03/Рапорт на відпустку" }),
    openGeneratedReport: vi.fn(),
    openGeneratedReportFolder: vi.fn()
  }
}));

vi.mock("./features/templates/services/templateService", () => ({
  templateService: {
    list: vi.fn().mockResolvedValue({ items: [
      { name: "Рапорт на відпустку", description: "Рапорт на надання відпустки військовослужбовцю", changed: "Локальний файл", status: "ready", variables: 7, sourcePath: "/templates/Рапорт на відпустку.docx" },
      { name: "Рапорт на матеріальну допомогу", description: "Рапорт на отримання матеріальної допомоги", changed: "Локальний файл", status: "ready", variables: 8, sourcePath: "/templates/Рапорт на матеріальну допомогу.docx" },
      { name: "Список військовослужбовців", description: "Приклад шаблону з кількома військовослужбовцями", changed: "Локальний файл", status: "ready", variables: 10, sourcePath: "/templates/Список військовослужбовців.docx" }
    ], totalCount: 3 }),
    inspect: vi.fn().mockResolvedValue({ isValid: true, errors: [], variables: ["військовий_1_піб", "основний_підписант_піб"] }),
    open: vi.fn().mockResolvedValue(undefined),
    openDirectory: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  }
}));

afterEach(cleanup);

describe("navigation and report generation", () => {
  it("opens every primary workspace from the sidebar", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Виберіть шаблон рапорту" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Шаблони" }));
    await waitFor(() => expect(screen.getByText("Використовувані змінні")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Особовий склад" }));
    expect(screen.getByRole("heading", { name: "Особовий склад" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Згенеровані рапорти" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Період рапортів" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Налаштування" }));
    expect(screen.getByRole("heading", { name: "Налаштування" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Довідник" }));
    expect(screen.getByRole("heading", { name: "Повний посібник із програми" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Конструктор змінних" }));
    expect(screen.getByRole("heading", { name: "Покрокове складання" })).toBeInTheDocument();
  });

  it("shows startup diagnostics in the sidebar", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Шаблони були відсутні")).toBeInTheDocument());
  });

  it("collapses the sidebar to icons and restores it", () => {
    window.localStorage.removeItem("shablonizator.sidebarCollapsed");
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Згорнути сайдбар" });
    fireEvent.click(toggle);
    expect(document.querySelector(".product-shell")).toHaveClass("sidebar-collapsed");
    expect(screen.getByRole("button", { name: "Розгорнути сайдбар" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Розгорнути сайдбар" }));
    expect(document.querySelector(".product-shell")).not.toHaveClass("sidebar-collapsed");
  });

  it("enables generation after selecting a DOCX template and a person", async () => {
    render(<App />);
    const generate = screen.getByRole("button", { name: "Згенерувати рапорт" });
    expect(generate).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Відкрити шаблон з файлу/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Нагородний рапорт" })).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: "Обрати" })[1]);
    expect(generate).toBeEnabled();
  });

  it("toggles templates and personnel selection from their full rows", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Рапорт на відпустку/ })).toBeInTheDocument());
    const vacationTemplate = screen.getByRole("button", { name: /Рапорт на відпустку/ });
    fireEvent.click(vacationTemplate);
    expect(vacationTemplate).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: "Параметри значень" })).toBeInTheDocument());
    fireEvent.click(screen.getByText("ВАСИЛЬОК Іван Аркадійович"));
    expect(screen.getByRole("button", { name: "Параметри значень" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("ВАСИЛЬОК Іван Аркадійович"));
    fireEvent.click(vacationTemplate);
    expect(vacationTemplate).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: "Оберіть шаблон" })).toBeInTheDocument();
    fireEvent.click(vacationTemplate);
    fireEvent.click(screen.getByText("ВАСИЛЬОК Іван Аркадійович"));
    expect(screen.getByText("Вибрано:").parentElement).toHaveTextContent("Вибрано: 1");
    expect(screen.getByRole("button", { name: "Очистити вибір" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Очистити вибір" }));
    expect(screen.getByText("Вибрано:").parentElement).toHaveTextContent("Вибрано: 0");
    expect(screen.getByRole("button", { name: "Очистити вибір" })).toBeDisabled();
  });

  it("clears a generated report result when the selection changes", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Рапорт на відпустку/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Рапорт на відпустку/ }));
    await waitFor(() => expect(screen.getByText("ВАСИЛЬОК Іван Аркадійович")).toBeInTheDocument());
    fireEvent.click(screen.getByText("ВАСИЛЬОК Іван Аркадійович"));
    fireEvent.click(screen.getByRole("button", { name: "Згенерувати рапорт" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Відкрити DOCX" })).toBeInTheDocument());
    fireEvent.click(screen.getByText("ПЕТРЕНКО Петро Петрович"));
    expect(screen.queryByRole("button", { name: "Відкрити DOCX" })).not.toBeInTheDocument();
  });

  it("filters personnel by text and rank", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Особовий склад" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Пошук за ПІБ, ІПН або посадою…" }), { target: { value: "ВАСИЛЬОК" } });
    await waitFor(() => expect(screen.getByText("Показано 1 із 2")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Додаткові фільтри" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Фільтр за званням" }), { target: { value: "Сержант" } });
    expect(screen.getByText("Показано 0 із 2")).toBeInTheDocument();
  });

  it("filters real templates by text", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Шаблони" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Пошук шаблонів…" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox", { name: "Пошук шаблонів…" }), { target: { value: "матеріальну" } });
    expect(screen.getByText("Показано 1 із 3")).toBeInTheDocument();
  });

  it("opens the selected template and refreshes the templates directory", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Шаблони" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Відкрити" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Відкрити" }));
    await waitFor(() => expect(templateService.open).toHaveBeenCalledWith("/templates/Рапорт на відпустку.docx"));

    fireEvent.click(screen.getByRole("button", { name: "Відкрити папку" }));
    await waitFor(() => expect(templateService.openDirectory).toHaveBeenCalled());

    const listCallCount = vi.mocked(templateService.list).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Оновити" }));
    await waitFor(() => expect(screen.getByText("Список шаблонів оновлено.")).toBeInTheDocument());
    expect(templateService.list).toHaveBeenCalledTimes(listCallCount + 1);
    expect(screen.queryByRole("button", { name: "Створити копію" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Видалити" })).toBeInTheDocument();
  });

  it("deletes a selected local template after confirmation", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Шаблони" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Видалити" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Видалити" })[1]);
    await waitFor(() => expect(templateService.delete).toHaveBeenCalledWith("/templates/Рапорт на відпустку.docx"));
  });

  it("loads generated reports from the reports service instead of a local list", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Згенеровані рапорти" }));
    await waitFor(() => expect(screen.getByText("Показано 1 із 1")).toBeInTheDocument());
    expect(screen.getAllByText("Рапорт на відпустку").length).toBeGreaterThan(0);
  });

  it("selects and deletes generated reports only with checkboxes", async () => {
    const { generatedReportsService } = await import("./features/generated-reports/services/generatedReportsService");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Згенеровані рапорти" }));
    await waitFor(() => expect(screen.getByText("Показано 1 із 1")).toBeInTheDocument());
    const deleteButton = screen.getByRole("button", { name: "Видалити" });
    expect(deleteButton).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Обрати" })[1]);
    expect(screen.getByRole("button", { name: "Видалити (1)" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Видалити (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    await waitFor(() => expect(generatedReportsService.delete).toHaveBeenCalledWith(["/Reports/2026-08-03/Рапорт на відпустку 2026-08-03 10-15-30/Рапорт на відпустку.docx"]));
  });

  it("shows saved signer settings without editable paths", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Налаштування" }));
    await waitFor(() => expect(screen.getByText(/Основний підписант/)).toBeInTheDocument());
    expect(screen.getAllByText(/Начальник ПММ/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Змінити" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Резервна копія БД" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Резервна копія БД" })).toBeInTheDocument());
  });

  it("shows template variables and recent reports without a templates footer", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Шаблони" }));
    await waitFor(() => expect(screen.getByText("Використовувані змінні")).toBeInTheDocument());
    expect(screen.getByText("Військовослужбовці")).toBeInTheDocument();
    expect(screen.getByText("Останні рапорти")).toBeInTheDocument();
    expect(screen.queryByText("Усього шаблонів")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Шаблони" })).not.toBeInTheDocument();
  });

  it("opens a report from the recent reports list", async () => {
    const { generatedReportsService } = await import("./features/generated-reports/services/generatedReportsService");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Шаблони" }));
    await waitFor(() => expect(screen.getByText("Останні рапорти")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Відкрити Рапорт на відпустку" }));
    await waitFor(() => expect(generatedReportsService.openDocument).toHaveBeenCalledWith("/Reports/2026-08-03/Рапорт на відпустку 2026-08-03 10-15-30/Рапорт на відпустку.docx"));
  });

  it("shows an example after selecting a template variable in documentation", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Конструктор змінних" }));
    fireEvent.click(screen.getByRole("button", { name: /Військовослужбовець/ }));
    fireEvent.click(screen.getByRole("button", { name: /\{\{військовий_1_іпн\}\}/ }));
    expect(screen.getAllByText("ІПН вибраного військовослужбовця.").length).toBeGreaterThan(0);
  });

  it("shows document parameters only for a template that uses them", async () => {
    render(<App />);
    const templateCard = await screen.findByRole("button", { name: /Рапорт на відпустку/ });
    fireEvent.click(templateCard);
    fireEvent.click(await screen.findByRole("button", { name: "Параметри значень" }));
    expect(screen.getByRole("dialog", { name: "Параметри значень" })).toBeInTheDocument();
    expect(screen.getByLabelText("Дата рапорту")).toBeInTheDocument();
    expect(screen.getByText("{{дата_рапорту}}")).toBeInTheDocument();
  });

  it("notifies after copying a template variable", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Конструктор змінних" }));
    fireEvent.click(screen.getByRole("button", { name: /Військовослужбовець/ }));
    fireEvent.click(screen.getByRole("button", { name: /\{\{військовий_1_звання\}\}/ }));
    fireEvent.click(screen.getByRole("button", { name: "Скопіювати змінну" }));
    await waitFor(() => expect(screen.getByText("Змінну скопійовано.")).toBeInTheDocument());
  });
});
