import { Check, Clock3, Sparkles } from "lucide-react";
import { releaseHistory } from "../releaseNotes";
import { Modal } from "../../shared/ui/Modal";

export function ReleaseHistoryModal({ onClose }: { onClose: () => void }) {
  return <Modal title="Історія версій" subtitle="Основні зміни у встановленій та попередніх версіях." className="release-history-modal" onClose={onClose}>
    <div className="release-history-modal__body">
      {releaseHistory.map((release, index) => <section className="release-history-entry" key={release.version}>
        <header><span>{index === 0 ? <Sparkles /> : <Clock3 />}</span><div><b>Версія {release.version}</b><small>{index === 0 ? "Поточна версія" : "Попереднє оновлення"}</small></div>{index === 0 && <strong>Встановлено</strong>}</header>
        <div>{release.notes.map((note) => <p key={note}><Check />{note}</p>)}</div>
      </section>)}
    </div>
    <footer className="modal-actions"><button className="button primary" onClick={onClose}>Закрити</button></footer>
  </Modal>;
}
