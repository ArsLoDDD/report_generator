import { X } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  identity: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  className?: string;
};

/** Shared side panel opened by selecting a row in an entity registry. */
export function EntityDetailsPanel({ title, identity, children, actions, onClose, className = "" }: Props) {
  return <aside className={`panel person-details entity-details ${className}`}>
    <div className="entity-details__header">
      <button className="close" aria-label="Закрити деталі" onClick={onClose}><X /></button>
      <h2>{title}</h2>
      {identity}
    </div>
    <div className="entity-details__body person-details__fields">{children}</div>
    {actions && <div className="detail-buttons entity-details__actions">{actions}</div>}
  </aside>;
}
