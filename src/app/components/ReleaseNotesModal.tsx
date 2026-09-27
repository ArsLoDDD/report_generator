import { Check, Sparkles } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";

export function ReleaseNotesModal({ version, notes, onClose }: { version: string; notes: string[]; onClose: () => void }) {
  return <Modal title="Що нового" subtitle={`Шаблонізатор оновлено до версії ${version}`} className="release-notes-modal" onClose={onClose}>
    <div className="release-notes-modal__body">
      <section className="release-notes-modal__hero"><span><Sparkles /></span><div><b>Оновлення встановлено</b><small>Коротко про зміни, які вже доступні у програмі.</small></div><strong>v{version}</strong></section>
      <div className="release-notes-modal__list">{notes.map((note) => <article key={note}><span><Check /></span><p>{note}</p></article>)}</div>
    </div>
    <footer className="modal-actions"><button className="button primary" onClick={onClose}>Зрозуміло</button></footer>
  </Modal>;
}
