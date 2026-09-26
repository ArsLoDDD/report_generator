import { Filter } from "lucide-react";

export function FilterButton({ active, onClick, label = "Фільтри" }: { active: boolean; onClick: () => void; label?: string }) {
  return <button className={`button filter-button ${active ? "filter-button--active" : ""}`} onClick={onClick} aria-label={label} aria-pressed={active}><Filter /><span className="filter-button__label">{label}</span></button>;
}
