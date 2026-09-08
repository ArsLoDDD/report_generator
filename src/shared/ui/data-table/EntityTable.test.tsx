import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntityTable } from "./EntityTable";

const columns = [{ key: "name", title: "Назва", render: (item: { id: number; name: string }) => item.name }];

afterEach(cleanup);

describe("EntityTable", () => {
  it("sorts numeric identifiers naturally and selects a whole row", () => {
    const onSelect = vi.fn();
    render(<EntityTable items={[{ id: 10, name: "Десять" }, { id: 2, name: "Два" }]} columns={columns} rowKey={(item) => item.id} selectedKey={2} onSelect={onSelect} />);

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Два");
    expect(screen.getAllByRole("row")[1]).toHaveClass("selected", "selected-row");
    fireEvent.click(screen.getByText("Десять"));
    expect(onSelect).toHaveBeenCalledWith({ id: 10, name: "Десять" });
  });

  it("preserves service order when sorting is disabled and renders auxiliary content", () => {
    render(<EntityTable items={[{ id: 10, name: "Новий" }, { id: 2, name: "Старий" }]} columns={columns} rowKey={(item) => item.id} numberBy={false} footer={<span>Ще завантажується</span>} />);

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Новий");
    expect(screen.getByText("Ще завантажується")).toBeInTheDocument();
  });
});

