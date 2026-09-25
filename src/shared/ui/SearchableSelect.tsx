import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SelectOption } from "./Select";

type SearchableSelectProps = {
  ariaLabel: string;
  value?: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
};

export function SearchableSelect({ ariaLabel, value = "", options, onChange, placeholder = "Оберіть значення", searchPlaceholder = "Почніть вводити для пошуку…", disabled = false }: SearchableSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("uk");
    return normalized ? options.filter((option) => option.label.toLocaleLowerCase("uk").includes(normalized)) : options;
  }, [options, query]);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  };

  return <div ref={rootRef} className={`searchable-select ${open ? "is-open" : ""}`}>
    <button type="button" className="searchable-select__control" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} disabled={disabled} onClick={() => { setOpen((current) => !current); setQuery(""); }}>
      <span className={selected ? "" : "is-placeholder"}>{selected?.label || placeholder}</span><ChevronDown />
    </button>
    {open && <div className="searchable-select__popover">
      <label className="searchable-select__search"><Search /><input autoFocus aria-label={`Пошук: ${ariaLabel}`} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.nativeEvent.stopImmediatePropagation(); event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(""); } else if (event.key === "Enter" && visibleOptions.length === 1) { event.preventDefault(); choose(visibleOptions[0].value); } }} placeholder={searchPlaceholder} /></label>
      <div id={listId} role="listbox" aria-label={ariaLabel} className="searchable-select__options">
        {visibleOptions.map((option) => <button type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => choose(option.value)}><span>{option.label}</span>{option.value === value && <Check />}</button>)}
        {!visibleOptions.length && <p>Нічого не знайдено</p>}
      </div>
    </div>}
  </div>;
}
