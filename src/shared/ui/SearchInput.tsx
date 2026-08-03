import { Search } from "lucide-react";

type SearchInputProps = { placeholder: string; value: string; onChange: (value: string) => void };

export function SearchInput({ placeholder, value, onChange }: SearchInputProps) {
  return <label className="search"><Search size={18} /><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
