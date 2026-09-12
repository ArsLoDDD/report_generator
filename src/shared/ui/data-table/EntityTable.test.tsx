import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntityTable } from "./EntityTable";

const columns = [{ key: "name", title: "Назва", render: (item: { id: number; name: string }) => item.name }];

afterEach(cleanup);

describe("EntityTable", () => {
  it("sorts numeric identifiers naturally and selects a whole row", () => {
    const onSelect = vi.fn();
    const numberedColumns = [{ key: "number", title: "№", render: (_item: { id: number; name: string }, rowIndex: number) => rowIndex + 1 }, ...columns];
    render(<EntityTable items={[{ id: 10, name: "Десять" }, { id: 2, name: "Два" }]} columns={numberedColumns} rowKey={(item) => item.id} selectedKey={2} onSelect={onSelect} />);

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Два");
    expect(screen.getAllByRole("row")[1].querySelector("td")).toHaveTextContent("1");
    expect(screen.getAllByRole("row")[1]).toHaveClass("entity-table__row--interactive", "selected", "selected-row");
    fireEvent.click(screen.getByText("Десять"));
    expect(onSelect).toHaveBeenCalledWith({ id: 10, name: "Десять" });
  });

  it("preserves service order when sorting is disabled and renders auxiliary content", () => {
    render(<EntityTable items={[{ id: 10, name: "Новий" }, { id: 2, name: "Старий" }]} columns={columns} rowKey={(item) => item.id} numberBy={false} footer={<span>Ще завантажується</span>} />);

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Новий");
    expect(screen.getAllByRole("row")[1]).not.toHaveClass("entity-table__row--interactive");
    expect(screen.getByText("Ще завантажується")).toBeInTheDocument();
  });

  it("supports shared checkbox selection and a loading state", () => {
    const onToggleSelection = vi.fn();
    const onToggleAll = vi.fn();
    const { rerender } = render(<EntityTable items={[{ id: 1, name: "Перший" }]} columns={columns} rowKey={(item) => item.id} selectedKeys={new Set([1])} onToggleSelection={onToggleSelection} onToggleAll={onToggleAll} />);

    const checks = screen.getAllByRole("button");
    fireEvent.click(checks[0]);
    fireEvent.click(checks[1]);
    expect(onToggleAll).toHaveBeenCalledOnce();
    expect(onToggleSelection).toHaveBeenCalledWith({ id: 1, name: "Перший" });

    rerender(<EntityTable items={[]} columns={columns} rowKey={(item) => item.id} isLoading loadingState={<span>Завантаження даних</span>} />);
    expect(screen.getByText("Завантаження даних")).toBeInTheDocument();
  });
});
