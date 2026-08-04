import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { templateService } from "./features/templates/services/templateService";

vi.mock("./shared/services/personnelService", () => ({
  personnelService: { list: vi.fn().mockResolvedValue({ items: [
    { id: 1, fullName: "ВАСИЛЬОК Іван Аркадійович", rank: "Солдат", surname: "ВАСИЛЬОК", givenName: "Іван", patronymic: "Аркадійович", position: "Стрілець, військова частина А0000", taxId: "7462389812", birthDate: "02.03.1999 року", educationLevel: "вища", educationDetails: "Академія", armedForcesServiceStartDate: "2022", positionAssignedDate: "2026", positionAssignmentOrder: "№1", militaryId: "АВ №077672", assignedVehicleName: "Great Wall", assignedVehicleRegistration: "АВ 7265" },
    { id: 2, fullName: "ПЕТРЕНКО Петро Петрович", rank: "Старший солдат", surname: "ПЕТРЕНКО", givenName: "Петро", patronymic: "Петрович", position: "Оператор БпЛА, військова частина А0000", taxId: "7462389813", birthDate: "14.05.1998 року", educationLevel: "середня спеціальна", educationDetails: "Коледж", armedForcesServiceStartDate: "2022", positionAssignedDate: "2023", positionAssignmentOrder: "№2", militaryId: "АВ №077673", assignedVehicleName: "Mitsubishi L200", assignedVehicleRegistration: "АВ 7266" }
  ], totalCount: 2 }), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
}));

vi.mock("./app/services/applicationService", () => ({
  applicationService: { getStartupWarnings: vi.fn().mockResolvedValue([{ code: "templates-missing", title: "Шаблони були відсутні", message: "Стартові шаблони відновлено." }]) }
}));

vi.mock("./features/generated-reports/services/generatedReportsService", () => ({
  generatedReportsService: { list: vi.fn().mockResolvedValue({ items: [{ name: "Рапорт на відпустку", template: "Рапорт на відпустку", generatedAt: "2026-08-03 10:15:30", docxPath: "/Reports/2026-08-03/Рапорт на відпустку 2026-08-03 10-15-30/Рапорт на відпустку.docx", folderPath: "/Reports/2026-08-03/Рапорт на відпустку 2026-08-03 10-15-30" }], totalCount: 1 }), openDocument: vi.fn(), openFolder: vi.fn(), delete: vi.fn() }
}));

vi.mock("./features/settings/services/settingsService", () => ({
  settingsService: { get: vi.fn().mockResolvedValue({ mainSigner: { fullName: "Іваненко Іван Іванович", rank: "майор", position: "Заступник командира з ППП", signatureFileName: "main.png" }, commander: { fullName: "Петренко Петро Петрович", rank: "капітан", position: "Командир" }, chief: { fullName: "Сидоренко Сергій Сергійович", rank: "капітан", position: "Начальник штабу" } }), updateSigner: vi.fn(), openApplicationDirectory: vi.fn(), createDatabaseBackup: vi.fn().mockResolvedValue("/backups/Резервна копія БД 10-00-00.zip") }
}));

vi.mock("./features/report-generation/services/reportGenerationService", () => ({
  reportGenerationService: {
    selectTemplateFile: vi.fn().mockResolvedValue("/templates/Нагородний рапорт.docx"),
    inspectTemplate: vi.fn().mockResolvedValue({ isValid: true, errors: [], variables: ["document.date"] }),
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
    inspect: vi.fn().mockResolvedValue({ isValid: true, errors: [], variables: ["soldier.fullName", "main.fullName"] }),
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
    expect(screen.getByRole("heading", { name: "Довідник" })).toBeInTheDocument();
  });

  it("shows startup diagnostics in the sidebar", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Шаблони були відсутні")).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText("Дата рапорту")).toBeInTheDocument());
    fireEvent.click(screen.getByText("ВАСИЛЬОК Іван Аркадійович"));
    expect(screen.getByText("Дата рапорту")).toBeInTheDocument();
    fireEvent.click(screen.getByText("ВАСИЛЬОК Іван Аркадійович"));
    fireEvent.click(vacationTemplate);
    expect(vacationTemplate).toHaveAttribute("aria-pressed", "false");
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
    expect(screen.getByDisplayValue("main.png")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Змінити" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Створити резервну копію БД" }));
    await waitFor(() => expect(screen.getByText("Резервну копію бази даних створено.")).toBeInTheDocument());
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
    fireEvent.click(screen.getByRole("button", { name: "Довідник" }));
    fireEvent.click(screen.getByRole("button", { name: /\{\{soldier\.taxId\}\}/ }));
    expect(screen.getByText("Десятизначний ідентифікаційний номер.")).toBeInTheDocument();
    expect(screen.getByText("ІПН: 7462389812")).toBeInTheDocument();
  });

  it("shows a date picker only for a template that uses document.date", async () => {
    render(<App />);
    const templateCard = await screen.findByRole("button", { name: /Рапорт на відпустку/ });
    fireEvent.click(templateCard);
    await waitFor(() => expect(screen.getByText("Дата рапорту")).toBeInTheDocument());
    expect(screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)).toBeInTheDocument();
  });

  it("notifies after copying a template variable", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Довідник" }));
    fireEvent.click(screen.getByRole("button", { name: /\{\{soldier\.rank\}\}/ }));
    fireEvent.click(screen.getByRole("button", { name: "Скопіювати змінну" }));
    await waitFor(() => expect(screen.getByText("Змінну скопійовано.")).toBeInTheDocument());
  });
});
