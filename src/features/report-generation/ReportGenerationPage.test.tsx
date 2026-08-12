import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("Генерація рапорту", () => {
  it("collects document parameters in a modal and sends their values with selected people", () => {
    const onToggle = vi.fn();
    render(<NotificationProvider><ReportGenerationPage template={template} templates={[template]} hasMoreTemplates={false} isLoadingMoreTemplates={false} onLoadMoreTemplates={vi.fn()} people={[person]} hasMorePeople={false} isLoadingMorePeople={false} onLoadMorePeople={vi.fn()} selected={[1]} onToggle={onToggle} onAll={vi.fn()} onClear={vi.fn()} onChoose={vi.fn()} /></NotificationProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Параметри значень" }));
    expect(screen.getByRole("dialog", { name: "Параметри значень" })).toBeInTheDocument();
    expect(screen.getByText("{{дата_рапорту}}")).toBeInTheDocument();
    fireEvent.click(screen.getByText(person.fullName));
    expect(onToggle).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Згенерувати рапорт" }));
    expect(generation.generate).toHaveBeenCalledWith("/templates/report.docx", [1], { дата_рапорту: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }, []);
  });

  it("does not show parameter controls when the token is absent", () => {
    generation.inspection = { isValid: true, errors: [], variables: [] };
    render(<NotificationProvider><ReportGenerationPage template={template} templates={[template]} hasMoreTemplates={false} isLoadingMoreTemplates={false} onLoadMoreTemplates={vi.fn()} people={[person]} hasMorePeople={false} isLoadingMorePeople={false} onLoadMorePeople={vi.fn()} selected={[]} onToggle={vi.fn()} onAll={vi.fn()} onClear={vi.fn()} onChoose={vi.fn()} /></NotificationProvider>);
    expect(screen.queryByRole("button", { name: "Параметри значень" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Згенерувати рапорт" })).not.toBeDisabled();
  });
});
