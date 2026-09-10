import type { ReactNode } from "react";

export function EntityCard({ className = "", children }: { className?: string; children: ReactNode }) {
  return <article className={`panel entity-card ${className}`}>{children}</article>;
}

export function EntityCardGrid({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`entity-card-grid ${className}`}>{children}</div>;
}

