import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Modal keyboard contract", () => {
  it("invokes the affirmative action with Enter", () => {
    const save = vi.fn();
    render(<Modal title="Редактор" onClose={vi.fn()}>
      <input aria-label="Назва" />
      <footer className="modal-actions">
        <button className="button">Скасувати</button>
        <button className="button primary" onClick={save}>Зберегти</button>
      </footer>
    </Modal>);

    fireEvent.keyDown(screen.getByLabelText("Назва"), { key: "Enter" });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps Enter available for multiline, select and custom keyboard controls", () => {
    const save = vi.fn();
    const toggle = vi.fn();
    render(<Modal title="Редактор" onClose={vi.fn()}>
      <textarea aria-label="Нотатки" />
      <select aria-label="Статус"><option>Новий</option></select>
      <div role="button" tabIndex={0} onKeyDown={toggle}>Розгорнути екіпаж</div>
      <footer className="modal-actions"><button className="button primary" onClick={save}>Зберегти</button></footer>
    </Modal>);

    fireEvent.keyDown(screen.getByLabelText("Нотатки"), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Статус"), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Розгорнути екіпаж" }), { key: "Enter" });

    expect(toggle).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it("does not bypass disabled validation", () => {
    const save = vi.fn();
    render(<Modal title="Редактор" onClose={vi.fn()}>
      <input aria-label="Назва" />
      <footer className="modal-actions"><button className="button primary" disabled onClick={save}>Зберегти</button></footer>
    </Modal>);

    fireEvent.keyDown(screen.getByLabelText("Назва"), { key: "Enter" });

    expect(save).not.toHaveBeenCalled();
  });

  it("confirms a dialog whose affirmative action is destructive", () => {
    const confirm = vi.fn();
    render(<Modal title="Підтвердження" onClose={vi.fn()}>
      <input aria-label="Контрольне поле" />
      <footer className="modal-actions">
        <button className="button">Скасувати</button>
        <button className="button danger" onClick={confirm}>Підтвердити</button>
      </footer>
    </Modal>);

    fireEvent.keyDown(screen.getByLabelText("Контрольне поле"), { key: "Enter" });

    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("lets an explicit nested confirmation override a disabled footer", () => {
    const resolve = vi.fn();
    const save = vi.fn();
    render(<Modal title="Переміщення" onClose={vi.fn()}>
      <input aria-label="Пошук" />
      <button data-modal-submit className="button primary" onClick={resolve}>Підтвердити проміжний вибір</button>
      <footer className="modal-actions"><button className="button primary" disabled onClick={save}>Зберегти</button></footer>
    </Modal>);

    fireEvent.keyDown(screen.getByLabelText("Пошук"), { key: "Enter" });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it("lets an explicit Enter action override a different primary operation", () => {
    const close = vi.fn();
    const exportFile = vi.fn();
    render(<Modal title="Параметри" onClose={close}>
      <input aria-label="Назва" />
      <footer className="modal-actions">
        <button data-modal-enter-action className="button" onClick={close}>Закрити</button>
        <button className="button primary" onClick={exportFile}>Експортувати</button>
      </footer>
    </Modal>);

    fireEvent.keyDown(screen.getByLabelText("Назва"), { key: "Enter" });

    expect(close).toHaveBeenCalledTimes(1);
    expect(exportFile).not.toHaveBeenCalled();
  });

  it("uses native form validation before submitting with Enter", () => {
    const save = vi.fn((event: FormEvent) => event.preventDefault());
    render(<Modal title="Форма" onClose={vi.fn()}>
      <form onSubmit={save}>
        <input aria-label="Обов'язкова назва" required />
        <footer className="modal-actions"><button className="button primary" type="submit">Зберегти</button></footer>
      </form>
    </Modal>);
    const input = screen.getByLabelText("Обов'язкова назва");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(save).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "Заповнено" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("closes only the uppermost nested modal with Escape", async () => {
    function NestedDialogs() {
      const [parentOpen, setParentOpen] = useState(true);
      const [childOpen, setChildOpen] = useState(true);
      return parentOpen ? <Modal title="Батьківська" onClose={() => setParentOpen(false)}>
        <p>Вміст</p>
        {childOpen && <Modal title="Вкладена" onClose={() => setChildOpen(false)}><p>Вміст</p></Modal>}
      </Modal> : null;
    }
    render(<NestedDialogs />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Вкладена" })).not.toBeInTheDocument();
    const parent = screen.getByRole("dialog", { name: "Батьківська" });
    expect(parent).toBeInTheDocument();
    await waitFor(() => expect(parent).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Батьківська" })).not.toBeInTheDocument();
  });

  it("submits only the uppermost nested modal with Enter", () => {
    const parentSave = vi.fn();
    const childSave = vi.fn();
    render(<Modal title="Батьківська" onClose={vi.fn()}>
      <footer className="modal-actions"><button className="button primary" onClick={parentSave}>Зберегти</button></footer>
      <Modal title="Вкладена" onClose={vi.fn()}><input aria-label="Поле вкладеної" /><footer className="modal-actions"><button className="button primary" onClick={childSave}>Зберегти</button></footer></Modal>
    </Modal>);

    expect(screen.getByRole("dialog", { name: "Вкладена" })).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(screen.getByLabelText("Поле вкладеної"), { key: "Enter" });

    expect(childSave).toHaveBeenCalledTimes(1);
    expect(parentSave).not.toHaveBeenCalled();
  });
});
