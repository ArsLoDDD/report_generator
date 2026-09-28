import { Modal } from "../../shared/ui/Modal";
import type { FlightJournalEntry } from "./types";

const displayDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
};

export function visibleFlightNotes(value: string) {
  return value
    .replace(/^\[DEV-SEED:flight-journal-v1\]\s*/u, "")
    .replace(/^Демонстраційний запис — не є підтвердженим фактом польоту\.?\s*/u, "")
    .trim();
}

function Detail({ label, value, wide = false }: { label: string; value?: string | null; wide?: boolean }) {
  return <div className={`flight-card__detail ${wide ? "flight-card__detail--wide" : ""}`}><dt>{label}</dt><dd>{value?.trim() || "Не вказано"}</dd></div>;
}

export function FlightJournalCard({ entry, onClose }: { entry: FlightJournalEntry; onClose: () => void }) {
  const notes = visibleFlightNotes(entry.notes);
  return <Modal title={`Політ №${entry.id}`} subtitle={`${displayDate(entry.flightDate)} · ${entry.crewName || "Екіпаж не вказано"}`} onClose={onClose} className="flight-card">
    <div className="flight-card__body">
      <div className="flight-card__summary"><div><span>Небо</span><b>{entry.skyTime || "—"}</b></div><div><span>Земля</span><b>{entry.groundTime || "—"}</b></div><div><span>Екіпаж</span><b>{entry.crewName || "Не вказано"}</b></div><div><span>Позиція</span><b>{entry.positionName || "Не вказано"}</b></div></div>
      <dl className="flight-card__register"><Detail label="БпЛА" value={entry.uavName} /><Detail label="Тип БпЛА" value={entry.uavType} /><Detail label="Серійний номер БпЛА" value={entry.uavSerialNumber} /><Detail label="Бойове розпорядження" value={entry.battleOrder} /><Detail label="Смуга роботи" value={entry.workStrip} /><Detail label="Мета польоту" value={entry.mission} wide /><Detail label="БК / спорядження" value={entry.payloadType} /><Detail label="Серійний номер БК" value={entry.payloadSerialNumber} /></dl>
      {notes && <section className="flight-card__notes"><h3>Нотатки</h3><p>{notes}</p></section>}
    </div>
  </Modal>;
}
