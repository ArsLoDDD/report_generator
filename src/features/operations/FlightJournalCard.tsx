import { useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import { Select } from "../../shared/ui/Select";
import type { FlightJournalEntry } from "./types";
import { currentTime, isFpvUavType, isStrikeUavType } from "./flight-journal-rules";

type FlightProgressEvent = "Небо" | "Земля" | "Втрата" | "Відпрацювання";

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

export function FlightJournalCard({ entry, onProgress, onClose }: { entry: FlightJournalEntry; onProgress: (eventType: FlightProgressEvent, eventTime: string, completionDetail: string) => Promise<void>; onClose: () => void }) {
  const notes = visibleFlightNotes(entry.notes);
  const [eventTime, setEventTime] = useState("");
  const [completionType, setCompletionType] = useState<Exclude<FlightProgressEvent, "Небо"> | "">("");
  const [completionDetail, setCompletionDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const progress = async (eventType: FlightProgressEvent) => {
    setSaving(true);
    try { await onProgress(eventType, eventTime || currentTime(), eventType === "Небо" || eventType === "Земля" ? "" : completionDetail); }
    finally { setSaving(false); }
  };
  const selectCompletion = (value: string) => { setCompletionType(value as typeof completionType); setCompletionDetail(""); };
  const requiresDetail = completionType === "Втрата" || completionType === "Відпрацювання";
  const detailOptions = completionType === "Втрата"
    ? ["Подавлення", "Збиття", ...isFpvUavType(entry.uavType) ? ["Обрив"] : []]
    : completionType === "Відпрацювання" ? ["Уражено", "Не уражено"] : [];
  const completionLabel = entry.completionType
    ? `${entry.completionType}${entry.completionDetail ? ` · ${entry.completionDetail}` : ""} · ${entry.completionTime || entry.groundTime || "час не вказано"}`
    : "Політ не завершено";
  return <Modal title={`Політ №${entry.id}`} subtitle={`${displayDate(entry.flightDate)} · ${entry.crewName || "Екіпаж не вказано"}`} onClose={onClose} className="flight-card">
    <div className="flight-card__body">
      <div className="flight-card__summary"><div><span>Небо</span><b>{entry.skyTime || "—"}</b></div><div><span>Завершення</span><b>{completionLabel}</b></div><div><span>Екіпаж</span><b>{entry.crewName || "Не вказано"}</b></div><div><span>Позиція</span><b>{entry.positionName || "Не вказано"}</b></div></div>
      {!entry.completionType && <section className="flight-card__progress"><label className="form-field"><span>Фактичний час</span><input aria-label="Фактичний час події польоту" type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /><small>Залиште порожнім, щоб використати поточний час.</small></label>{!entry.skyTime ? <button className="button primary" disabled={saving} onClick={() => void progress("Небо")}>Небо</button> : <><label className="form-field"><span>Завершення польоту</span><Select ariaLabel="Завершення польоту" value={completionType} onChange={selectCompletion} options={[{ value: "", label: "Оберіть завершення" }, { value: "Земля", label: "Земля" }, { value: "Втрата", label: "Втрата" }, ...isStrikeUavType(entry.uavType) ? [{ value: "Відпрацювання", label: "Відпрацювання" }] : []]} /></label>{requiresDetail && <label className="form-field"><span>{completionType === "Втрата" ? "Причина втрати" : "Результат відпрацювання"}</span><Select ariaLabel={completionType === "Втрата" ? "Причина втрати" : "Результат відпрацювання"} value={completionDetail} onChange={setCompletionDetail} options={[{ value: "", label: "Оберіть значення" }, ...detailOptions.map((value) => ({ value, label: value }))]} /></label>}<button className="button primary" disabled={saving || !completionType || (requiresDetail && !completionDetail)} onClick={() => void progress(completionType || "Земля")}>Завершити політ</button></>}</section>}
      <dl className="flight-card__register"><Detail label="БпЛА" value={entry.uavName} /><Detail label="Тип БпЛА" value={entry.uavType} /><Detail label="Серійний номер БпЛА" value={entry.uavSerialNumber} /><Detail label="Бойове розпорядження" value={entry.battleOrder} /><Detail label="Смуга роботи" value={entry.workStrip} /><Detail label="Мета польоту" value={entry.mission} wide /><Detail label="БК / спорядження" value={entry.payloadType} /><Detail label="Серійний номер БК" value={entry.payloadSerialNumber} /></dl>
      {notes && <section className="flight-card__notes"><h3>Нотатки</h3><p>{notes}</p></section>}
    </div>
  </Modal>;
}
