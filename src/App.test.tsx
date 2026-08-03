import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./shared/services/personnelService", () => ({
  personnelService: { list: vi.fn().mockResolvedValue([
    { id: 1, fullName: "ВАСИЛЬОК Іван Аркадійович", rank: "Солдат", surname: "ВАСИЛЬОК", givenName: "Іван", patronymic: "Аркадійович", position: "Стрілець, військова частина А0000", taxId: "7462389812", birthDate: "02.03.1999 року", educationLevel: "вища", educationDetails: "Академія", armedForcesServiceStartDate: "2022", positionAssignedDate: "2026", positionAssignmentOrder: "№1", militaryId: "АВ №077672", assignedVehicleName: "Great Wall", assignedVehicleRegistration: "АВ 7265" },
    { id: 2, fullName: "ПЕТРЕНКО Петро Петрович", rank: "Старший солдат", surname: "ПЕТРЕНКО", givenName: "Петро", patronymic: "Петрович", position: "Оператор БпЛА, військова частина А0000", taxId: "7462389813", birthDate: "14.05.1998 року", educationLevel: "середня спеціальна", educationDetails: "Коледж", armedForcesServiceStartDate: "2022", positionAssignedDate: "2023", positionAssignmentOrder: "№2", militaryId: "АВ №077673", assignedVehicleName: "Mitsubishi L200", assignedVehicleRegistration: "АВ 7266" }
  ]), create: vi.fn(), update: vi.fn() }
}));

vi.mock("./features/generated-reports/services/generatedReportsService", () => ({
  generatedReportsService: { list: vi.fn().mockResolvedValue([{ name: "Рапорт на відпустку", template: "Рапорт на відпустку", generatedAt: "2026-08-03 10:15:30", docxPath: "/Reports/2026-08-03/Рапорт на відпустку 2026-08-03 10-15-30/Рапорт на відпустку.docx", folderPath: "/Reports/2026-08-03/Рапорт на відпустку 2026-08-03 10-15-30" }]), openDocument: vi.fn(), openFolder: vi.fn() }
}));

vi.mock("./features/settings/services/settingsService", () => ({
  settingsService: { get: vi.fn().mockResolvedValue({ mainSigner: { fullName: "Іваненко Іван Іванович", rank: "майор", position: "Заступник командира з ППП", signatureFileName: "main.png" }, commander: { fullName: "Петренко Петро Петрович", rank: "капітан", position: "Командир" }, chief: { fullName: "Сидоренко Сергій Сергійович", rank: "капітан", position: "Начальник штабу" } }), updateSigner: vi.fn() }
}));

vi.mock("./features/report-generation/services/reportGenerationService", () => ({
  reportGenerationService: {
    selectTemplateFile: vi.fn().mockResolvedValue("/templates/Нагородний рапорт.docx"),
    validateTemplate: vi.fn().mockResolvedValue({ isValid: true, errors: [], variables: [] }),
    generateReport: vi.fn().mockResolvedValue({ docxPath: "/Reports/2026-08-03/Рапорт на відпустку/Рапорт на відпустку.docx", folderPath: "/Reports/2026-08-03/Рапорт на відпустку" }),
    openGeneratedReport: vi.fn(),
    openGeneratedReportFolder: vi.fn()
  }
}));

vi.mock("./features/templates/services/templateService", () => ({
  templateService: {
    list: vi.fn().mockResolvedValue([
      { name: "Рапорт на відпустку", description: "Рапорт на надання відпустки військовослужбовцю", changed: "Локальний файл", status: "ready", variables: 7, sourcePath: "/templates/Рапорт на відпустку.docx" },
      { name: "Рапорт на матеріальну допомогу", description: "Рапорт на отримання матеріальної допомоги", changed: "Локальний файл", status: "ready", variables: 8, sourcePath: "/templates/Рапорт на матеріальну допомогу.docx" },
      { name: "Список військовослужбовців", description: "Приклад шаблону з кількома військовослужбовцями", changed: "Локальний файл", status: "ready", variables: 10, sourcePath: "/templates/Список військовослужбовців.docx" }
    ])
  }
}));

afterEach(cleanup);

describe("navigation and report generation", () => {
  it("opens every primary workspace from the sidebar", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Виберіть шаблон рапорту" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Шаблони" }));
    expect(screen.getByRole("heading", { name: "Шаблони" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Особовий склад" }));
    expect(screen.getByRole("heading", { name: "Особовий склад" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Згенеровані рапорти" }));
    expect(screen.getByRole("heading", { name: "Згенеровані рапорти" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Налаштування" }));
    expect(screen.getByRole("heading", { name: "Налаштування" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Довідник" }));
    expect(screen.getByRole("heading", { name: "Довідник" })).toBeInTheDocument();
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

  it("loads generated reports from the reports service instead of a local list", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Згенеровані рапорти" }));
    await waitFor(() => expect(screen.getByText("Показано 1 із 1")).toBeInTheDocument());
    expect(screen.getAllByText("Рапорт на відпустку").length).toBeGreaterThan(0);
  });

  it("shows saved signer settings without editable paths", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Налаштування" }));
    await waitFor(() => expect(screen.getByText(/Основний підписант/)).toBeInTheDocument());
    expect(screen.getByDisplayValue("main.png")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Змінити" })).not.toBeInTheDocument();
  });

  it("shows template variables and recent reports without a templates footer", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Шаблони" }));
    await waitFor(() => expect(screen.getByText("Поля документа")).toBeInTheDocument());
    expect(screen.getByText("Військовослужбовці")).toBeInTheDocument();
    expect(screen.getByText("Останні рапорти")).toBeInTheDocument();
    expect(screen.queryByText("Усього шаблонів")).not.toBeInTheDocument();
  });

  it("shows an example after selecting a template variable in documentation", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Довідник" }));
    fireEvent.click(screen.getByRole("button", { name: /\{\{soldier\.taxId\}\}/ }));
    expect(screen.getByText("Десятизначний ідентифікаційний номер.")).toBeInTheDocument();
    expect(screen.getByText("ІПН: 7462389812")).toBeInTheDocument();
  });
});
