import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider } from "../../shared/ui/NotificationProvider";
import { ReportAnalyserPage } from "./ReportAnalyserPage";

const { open, renderAsync, templateService, personnelService, settingsService } = vi.hoisted(() => ({
  open: vi.fn(),
  renderAsync: vi.fn(),
  templateService: { analyseReport: vi.fn(), renderAnalysisPreview: vi.fn(), createFromAnalysis: vi.fn() },
  personnelService: { listCustomFields: vi.fn(), listVehicleCustomFields: vi.fn() },
  settingsService: { get: vi.fn() },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ onDragDropEvent: vi.fn().mockResolvedValue(vi.fn()) }) }));
vi.mock("docx-preview", () => ({ renderAsync }));
vi.mock("./services/templateService", () => ({ templateService }));
vi.mock("../../shared/services/personnelService", () => ({ personnelService }));
vi.mock("../settings/services/settingsService", () => ({ settingsService }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Аналізатор і поля автозаповнення", () => {
  it("replaces selected document text directly with a field picked in human language", async () => {
    open.mockResolvedValue("/reports/source.docx");
    templateService.analyseReport.mockResolvedValue({ sourceName: "source.docx", textPreview: "ПЕТРЕНКО", paragraphs: [], proposals: [] });
    templateService.renderAnalysisPreview.mockResolvedValue([1, 2, 3]);
    personnelService.listCustomFields.mockResolvedValue([]);
    personnelService.listVehicleCustomFields.mockResolvedValue([]);
    settingsService.get.mockResolvedValue({ signerRoles: [] });
    renderAsync.mockImplementation(async (_blob: Blob, target: HTMLElement) => { target.innerHTML = "<p>ПЕТРЕНКО</p>"; });

    render(<NotificationProvider><ReportAnalyserPage onCreated={vi.fn()} /></NotificationProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Обрати DOCX" }));
    const text = await screen.findByText("ПЕТРЕНКО");
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.mouseUp(screen.getByLabelText("Текст документа для редагування"));

    fireEvent.click(await screen.findByRole("button", { name: "Вставити поле" }));
    expect(screen.getByRole("dialog", { name: "Поля автозаповнення" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /Наприклад/ }), { target: { value: "звання" } });
    fireEvent.click(screen.getByRole("button", { name: "Звання, Військовослужбовець" }));
    fireEvent.click(screen.getByRole("button", { name: "Замінити виділений текст" }));

    await waitFor(() => expect(templateService.renderAnalysisPreview).toHaveBeenLastCalledWith("/reports/source.docx", [
      { value: "ПЕТРЕНКО", token: "", replacement: "{{військовий_1_звання}}", occurrence: 0 },
    ]));
    expect(screen.queryByRole("dialog", { name: "Поля автозаповнення" })).not.toBeInTheDocument();
  });
});
