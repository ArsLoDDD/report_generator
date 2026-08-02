import type { LucideIcon } from "lucide-react";

type Props = { icon: LucideIcon; label: string; hint: string; values: string[]; tone?: "default" | "collection" };

export function VariableGroup({ icon: Icon, label, hint, values, tone = "default" }: Props) {
  return <section className={`variable-group variable-group--${tone}`}><header><span className="variable-group__icon"><Icon size={16} /></span><div><b>{label}</b><small>{hint}</small></div><span className="variable-group__count">{values.length}</span></header><div className="tag-list">{values.map((value) => <code key={value}>{value}</code>)}</div></section>;
}
