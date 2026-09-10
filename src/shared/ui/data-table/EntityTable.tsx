import type { ReactNode, UIEventHandler } from "react";
import { sortedByNumber } from "../../utils/naturalSort";
import { CheckBox } from "../CheckBox";

export type EntityTableColumn<T> = {
  key: string;
  title: ReactNode;
  render: (item: T, rowIndex: number) => ReactNode;
  className?: string;
  sticky?: "start" | "end";
};

type EntityTableProps<T> = {
  items: readonly T[];
  columns: readonly EntityTableColumn<T>[];
  rowKey: (item: T) => string | number;
  numberBy?: ((item: T) => string | number) | false;
  selectedKey?: string | number | null;
  onSelect?: (item: T) => void;
  rowClassName?: (item: T) => string;
  onScroll?: UIEventHandler<HTMLDivElement>;
  className?: string;
  emptyState?: ReactNode;
  footer?: ReactNode;
  isLoading?: boolean;
  loadingState?: ReactNode;
  errorState?: ReactNode;
  selectedKeys?: ReadonlySet<string | number>;
  onToggleSelection?: (item: T) => void;
  onToggleAll?: () => void;
};

/**
 * Shared table shell for registries (vehicles, UAVs, generators, weapons, etc.).
 * Rows are copied before sorting, so service state remains immutable.
 */
export function EntityTable<T>({
  items,
  columns,
  rowKey,
  numberBy = rowKey,
  selectedKey,
  onSelect,
  rowClassName,
  onScroll,
  className = "",
  emptyState,
  footer,
  isLoading = false,
  loadingState,
  errorState,
  selectedKeys,
  onToggleSelection,
  onToggleAll,
}: EntityTableProps<T>) {
  const rows = numberBy === false ? [...items] : sortedByNumber(items, numberBy ?? rowKey);
  const selectable = Boolean(selectedKeys && onToggleSelection);
  const columnClass = (column: EntityTableColumn<T>) => [column.className ?? "", column.sticky ? `entity-table__sticky--${column.sticky}` : ""].filter(Boolean).join(" ");

  return <div className="data-table__scroll" onScroll={onScroll}>
    <table className={className}>
      <thead><tr>{selectable && <th className="entity-table__selection"><CheckBox checked={rows.length > 0 && rows.every((item) => selectedKeys?.has(rowKey(item)))} onChange={() => onToggleAll?.()} /></th>}{columns.map((column) => <th className={columnClass(column)} key={column.key}>{column.title}</th>)}</tr></thead>
      <tbody>{rows.map((item, rowIndex) => {
        const key = rowKey(item);
        return <tr
          key={key}
          className={[selectedKey === key ? "selected selected-row" : "", rowClassName?.(item) ?? ""].filter(Boolean).join(" ")}
          onClick={onSelect ? () => onSelect(item) : undefined}
        >
          {selectable && <td className="entity-table__selection" onClick={(event) => event.stopPropagation()}><CheckBox checked={selectedKeys?.has(key) ?? false} onChange={() => onToggleSelection?.(item)} /></td>}
          {columns.map((column) => <td className={columnClass(column)} key={column.key}>{column.render(item, rowIndex)}</td>)}
        </tr>;
      })}</tbody>
    </table>
    {isLoading ? loadingState : errorState || (!rows.length && emptyState)}
    {footer}
  </div>;
}
