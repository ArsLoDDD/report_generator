import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgramGuidePage } from "./ProgramGuidePage";

describe("Довідник", () => {
  it("documents every program workspace, local data and template language", () => {
    render(<ProgramGuidePage />);

    expect(screen.getByRole("heading", { name: "Повний посібник із програми" })).toBeInTheDocument();
    ["Генерація рапортів", "Шаблони", "Особовий склад", "Імпорт і експорт Excel", "Згенеровані рапорти", "Конструктор змінних", "Налаштування", "Редактор кастомних полів"].forEach((title) => {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    });
    expect(screen.getByText("Мова шаблонів v2")).toBeInTheDocument();
    expect(screen.getByText("Типові помилки та рішення")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "CODE" && element.textContent === "{{військовий_2_посвідчення_водія}}")).toBeInTheDocument();
    expect(screen.getByText(/усі дані, шаблони, Excel-файли та рапорти працюють локально/i)).toBeInTheDocument();
  });
});
