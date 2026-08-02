import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./shared/services/personnelService", () => ({
  personnelService: { list: vi.fn().mockRejectedValue(new Error("desktop unavailable")), create: vi.fn(), update: vi.fn() }
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

  it("enables generation after selecting a template and a person", () => {
    render(<App />);
    const generate = screen.getByRole("button", { name: "Згенерувати рапорт" });
    expect(generate).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Нагородний рапорт/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Обрати" })[1]);
    expect(generate).toBeEnabled();
  });

  it("toggles templates and personnel selection from their full rows", () => {
    render(<App />);
    const vacationTemplate = screen.getByRole("button", { name: /Рапорт на відпустку/ });
    fireEvent.click(vacationTemplate);
    expect(vacationTemplate).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(vacationTemplate);
    expect(vacationTemplate).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByText("ВАСИЛЬОК Іван Аркадійович"));
    expect(screen.getByText("Вибрано:").parentElement).toHaveTextContent("Вибрано: 1");
    fireEvent.click(screen.getByRole("button", { name: "Очистити вибір" }));
    expect(screen.getByText("Вибрано:").parentElement).toHaveTextContent("Вибрано: 0");
  });

  it("switches settings to signer details", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Налаштування" }));
    fireEvent.click(screen.getByRole("button", { name: "Підписанти" }));
    expect(screen.getByText("Дані підписантів")).toBeInTheDocument();
    expect(screen.getByText(/Основний підписант/)).toBeInTheDocument();
  });

  it("shows template variables and recent reports without a templates footer", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Шаблони" }));
    expect(screen.getByText("Поля документа")).toBeInTheDocument();
    expect(screen.getByText("Військовослужбовці")).toBeInTheDocument();
    expect(screen.getByText("Останні рапорти")).toBeInTheDocument();
    expect(screen.queryByText("Усього шаблонів")).not.toBeInTheDocument();
  });
});
