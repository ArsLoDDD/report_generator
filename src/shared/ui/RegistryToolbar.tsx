import type { ReactNode } from "react";
import { SearchInput } from "./SearchInput";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  resultCount?: number;
  children?: ReactNode;
  className?: string;
};

export function RegistryToolbar({ query, onQueryChange, placeholder, resultCount, children, className = "" }: Props) {
  return <div className={`table-tools main-tools registry-toolbar ${className}`}><SearchInput placeholder={placeholder} value={query} onChange={onQueryChange} />{children}<span className="registry-toolbar__count">{typeof resultCount === "number" ? `${resultCount} записів` : ""}</span></div>;
}

