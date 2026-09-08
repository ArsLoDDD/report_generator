import type { ReactNode, UIEventHandler } from "react";
import { sortedByNumber } from "../../utils/naturalSort";

export type EntityTableColumn<T> = {
  key: string;
  title: ReactNode;
  render: (item: T) => ReactNode;
  className?: string;
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
}: EntityTableProps<T>) {
  const rows = numberBy === false ? [...items] : sortedByNumber(items, numberBy ?? rowKey);

  return <div className="data-table__scroll" onScroll={onScroll}>
    <table className={className}>
      <thead><tr>{columns.map((column) => <th className={column.className} key={column.key}>{column.title}</th>)}</tr></thead>
      <tbody>{rows.map((item) => {
        const key = rowKey(item);
        return <tr
          key={key}
          className={[selectedKey === key ? "selected selected-row" : "", rowClassName?.(item) ?? ""].filter(Boolean).join(" ")}
          onClick={onSelect ? () => onSelect(item) : undefined}
        >
          {columns.map((column) => <td className={column.className} key={column.key}>{column.render(item)}</td>)}
        </tr>;
      })}</tbody>
    </table>
    {!rows.length && emptyState}
    {footer}
  </div>;
}
