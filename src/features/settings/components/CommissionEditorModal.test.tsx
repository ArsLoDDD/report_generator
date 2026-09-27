import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommissionEditorModal } from "./CommissionEditorModal";

afterEach(cleanup);

describe("CommissionEditorModal", () => {
  it("creates numbered member variables without commission roles", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CommissionEditorModal
      initial="new"
      signerRoles={[{ id: "командир", name: "Командир", signer: { fullName: "ІВАНЕНКО Іван Іванович", rank: "майор", position: "командир" } }]}
      onClose={vi.fn()}
      onSave={onSave}
      busy={false}
    />);

    expect(screen.queryByText("Роль у комісії")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Назва комісії"), { target: { value: "Комісія зі списання" } });
    fireEvent.change(screen.getByPlaceholderText("комісія_списання"), { target: { value: "Списання майна" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Учасник комісії №1" }), { target: { value: "командир" } });

    expect(screen.getByText("{{комісія_списання_майна_1_піб}}")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Зберегти комісію" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: "Комісія зі списання",
      variable: "комісія_списання_майна",
      members: [expect.objectContaining({ signerRoleId: "командир", order: 0 })],
    }));
  });
});
