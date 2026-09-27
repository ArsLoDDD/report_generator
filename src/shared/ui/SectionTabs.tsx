import type { ReactNode } from "react";

export type SectionTab<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
  title?: string;
};

export function SectionTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  tabs: SectionTab<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return <nav className={`services-tabs ${className}`.trim()} aria-label={ariaLabel}>
    {tabs.map((tab) => <button
      key={tab.id}
      type="button"
      className={value === tab.id ? "active" : ""}
      onClick={() => onChange(tab.id)}
      title={tab.title}
    >
      {tab.icon}
      <b>{tab.label}</b>
    </button>)}
  </nav>;
}
