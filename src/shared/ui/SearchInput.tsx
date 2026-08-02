import { Search } from "lucide-react";

export function SearchInput({ placeholder }: { placeholder: string }) {
  return <label className="search"><Search size={18} /><input aria-label={placeholder} placeholder={placeholder} /></label>;
}
