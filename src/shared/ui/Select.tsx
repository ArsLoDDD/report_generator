import { ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };
type SelectProps = { ariaLabel: string; value?: string; options: SelectOption[]; onChange: (value: string) => void };

export function Select({ ariaLabel, value, options, onChange }: SelectProps) {
  return <label className="shared-select"><select aria-label={ariaLabel} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown /></label>;
}
