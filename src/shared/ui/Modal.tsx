import { X } from "lucide-react";
import type { ReactNode } from "react";

type ModalProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
};

export function Modal({ title, children, onClose, className = "" }: ModalProps) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal-panel ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Закрити" onClick={onClose}><X /></button></header>
      {children}
    </section>
  </div>;
}
