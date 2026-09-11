import type { HTMLAttributes, ReactNode } from "react";

export function EntityCard({ className = "", children, ...props }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return <article className={`panel entity-card ${className}`} {...props}>{children}</article>;
}

export function EntityCardGrid({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`entity-card-grid ${className}`}>{children}</div>;
}
