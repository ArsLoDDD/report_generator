import { Filter } from "lucide-react";

export function FilterButton({ active, onClick, label = "Фільтри" }: { active: boolean; onClick: () => void; label?: string }) {
  return <button className={`button filter-button ${active ? "filter-button--active" : ""}`} onClick={onClick} aria-pressed={active}><Filter />{label}</button>;
}
