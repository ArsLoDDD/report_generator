import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnitEditorModal } from "./UnitEditorModal";

afterEach(cleanup);

describe("UnitEditorModal", () => {
  it("редагує реквізити КСП і зберігає ознаку входження у БРО", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<UnitEditorModal
      initial={{ kind: "Рота", shortName: "РБАК", authorizedStrength: 40, kspName: "ОРІОН", kspLocality: "КАЛИНІВКА", kspMgrs: "36U UV 40000 47000", kspInBro: false }}
      onClose={vi.fn()}
      onSave={onSave}
      busy={false}
    />);

    expect(screen.getByLabelText("Назва КСП")).toHaveValue("ОРІОН");
    expect(screen.getByLabelText("Населений пункт КСП")).toHaveValue("КАЛИНІВКА");
    expect(screen.getByLabelText("Координати КСП")).toHaveValue("36U UV 40000 47000");
    fireEvent.click(screen.getByRole("checkbox", { name: "КСП входить в БРО" }));
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      kspName: "ОРІОН",
      kspLocality: "КАЛИНІВКА",
      kspMgrs: "36U UV 40000 47000",
      kspInBro: true,
    }));
  });
});
