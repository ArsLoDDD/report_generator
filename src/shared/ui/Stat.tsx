import type { LucideIcon } from "lucide-react";

export function Stat({ icon: Icon, label, value, tone = "" }: { icon: LucideIcon; label: string; value: string | number; tone?: string }) {
  return <div className="stat"><Icon size={27} /><div><span>{label}</span><strong className={tone}>{value}</strong></div></div>;
}
