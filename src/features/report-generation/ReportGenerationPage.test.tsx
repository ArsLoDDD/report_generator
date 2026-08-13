import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportGenerationPage } from "./ReportGenerationPage";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";

const { generation } = vi.hoisted(() => ({ generation: {
  error: null as string | null, generatedReport: null, inspection: { isValid: true, errors: [], variables: ["дата_рапорту"] }, isGenerating: false,
  selectTemplateFile: vi.fn(), inspectTemplate: vi.fn(), validation: null, generate: vi.fn(), openReport: vi.fn(), openReportFolder: vi.fn(), resetResult: vi.fn()
} }));
vi.mock("./hooks/useReportGeneration", () => ({ useReportGeneration: () => generation }));

const template = { name: "Рапорт", description: "Тест", changed: "сьогодні", status: "ready" as const, variables: 1, sourcePath: "/templates/report.docx" };
const person = { id: 1, fullName: "ІВАНЕНКО Іван Іванович", rank: "майор", surname: "ІВАНЕНКО", givenName: "Іван", patronymic: "Іванович", position: "командир", taxId: "1234567890", birthDate: "", educationLevel: "", educationDetails: "", armedForcesServiceStartDate: "", positionAssignedDate: "", positionAssignmentOrder: "", militaryId: "", assignedVehicleName: "", assignedVehicleRegistration: "" };

afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => { generation.inspection = { isValid: true, errors: [], variables: ["військовий_1_піб", "дата_рапорту"] }; });

describe("Генерація рапорту", () => {
  it("shows document parameters directly and sends their values with selected people", () => {
    const onToggle = vi.fn();
    render(<NotificationProvider><ReportGenerationPage template={template} templates={[template]} hasMoreTemplates={false} isLoadingMoreTemplates={false} onLoadMoreTemplates={vi.fn()} people={[person]} hasMorePeople={false} isLoadingMorePeople={false} onLoadMorePeople={vi.fn()} selected={[1]} onToggle={onToggle} onAll={vi.fn()} onClear={vi.fn()} onChoose={vi.fn()} /></NotificationProvider>);
    expect(screen.getByLabelText("Дата рапорту")).toBeInTheDocument();
    expect(screen.getByText("{{дата_рапорту}}")).toBeInTheDocument();
    fireEvent.click(screen.getByText(person.fullName));
    expect(onToggle).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Згенерувати рапорт" }));
    expect(generation.generate).toHaveBeenCalledWith("/templates/report.docx", [1], { дата_рапорту: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }, []);
  });

  it("does not show parameter controls when the token is absent", () => {
    generation.inspection = { isValid: true, errors: [], variables: [] };
    render(<NotificationProvider><ReportGenerationPage template={template} templates={[template]} hasMoreTemplates={false} isLoadingMoreTemplates={false} onLoadMoreTemplates={vi.fn()} people={[person]} hasMorePeople={false} isLoadingMorePeople={false} onLoadMorePeople={vi.fn()} selected={[]} onToggle={vi.fn()} onAll={vi.fn()} onClear={vi.fn()} onChoose={vi.fn()} /></NotificationProvider>);
    expect(screen.getByText("Для цього шаблону не потрібно обирати дані або заповнювати додаткові значення.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Згенерувати рапорт" })).not.toBeDisabled();
  });

  it("does not require personnel when a template contains only document parameters", () => {
    generation.inspection = { isValid: true, errors: [], variables: ["дата_рапорту", "військова_частина_1"] };
    render(<NotificationProvider><ReportGenerationPage template={template} templates={[template]} hasMoreTemplates={false} isLoadingMoreTemplates={false} onLoadMoreTemplates={vi.fn()} people={[person]} hasMorePeople={false} isLoadingMorePeople={false} onLoadMorePeople={vi.fn()} selected={[]} onToggle={vi.fn()} onAll={vi.fn()} onClear={vi.fn()} onChoose={vi.fn()} /></NotificationProvider>);
    expect(screen.queryByText("Вибір військовослужбовців")).not.toBeInTheDocument();
    expect(screen.getByText(/Заповніть лише значення, потрібні для цього рапорту/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Згенерувати рапорт" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Інша військова частина №1" }), { target: { value: "А1111" } });
    expect(screen.getByRole("button", { name: "Згенерувати рапорт" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Згенерувати рапорт" }));
    expect(generation.generate).toHaveBeenCalledWith("/templates/report.docx", [], { дата_рапорту: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), військова_частина_1: "А1111" }, []);
  });
});
