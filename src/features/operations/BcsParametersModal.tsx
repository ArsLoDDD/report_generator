import { FileSpreadsheet, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "../../shared/ui/Modal";
import type { TemporaryPerson } from "./types";

export function BcsParametersModal({ unitName, fileName, date, zoom, people, onUnitName, onFileName, onDate, onZoom, onAdd, onEdit, onDelete, onExport, onClose }: {
  unitName: string;
  fileName: string;
  date: string;
  zoom: number;
  people: TemporaryPerson[];
  onUnitName: (value: string) => void;
  onFileName: (value: string) => void;
  onDate: (value: string) => void;
  onZoom: (value: number) => void;
  onAdd: (category: TemporaryPerson["category"]) => void;
  onEdit: (person: TemporaryPerson) => void;
  onDelete: (person: TemporaryPerson) => void;
  onExport: () => void;
  onClose: () => void;
}) {
  return <Modal title="Параметри БЧС" onClose={onClose} className="bcs-parameters-modal">
    <div className="bcs-parameters">
      <section className="bcs-parameters__general">
        <label className="form-field form-field--wide"><span>Назва підрозділу в шапці БЧС</span><input value={unitName} onChange={(event) => onUnitName(event.target.value)} placeholder="Назва підрозділу" /></label>
        <label className="form-field form-field--wide"><span>Назва файлу БЧС</span><input value={fileName} onChange={(event) => onFileName(event.target.value)} placeholder="РБАК 07.09.2026" /><small>Розширення .xlsx додасться автоматично.</small></label>
        <label className="form-field"><span>Дата БЧС · станом на 08:00</span><input inputMode="numeric" maxLength={10} placeholder="дд.мм.рррр" value={date} onChange={(event) => onDate(event.target.value.replace(/[^\d.]/g, "").slice(0,10))} /></label>
        <label className="form-field"><span>Масштаб таблиці · {zoom}%</span><input type="range" min="45" max="110" step="5" value={zoom} onChange={(event) => onZoom(Number(event.target.value))} /></label>
      </section>
      <section className="bcs-parameters__people">
        <header><div><h3>Додані до БЧС</h3><p>Ці записи не займають штатних посад.</p></div><div><button className="button" onClick={() => onAdd("Прикомандировані")}><Plus />Прикомандирований</button><button className="button" onClick={() => onAdd("Тимчасово прибулі")}><Plus />Тимчасово прибулий</button><button className="button" onClick={() => onAdd("Інша підгрупа")}><Plus />Підгрупа</button></div></header>
        <div className="bcs-parameters__list">{people.map((person) => <article key={person.id}><div><b>{person.fullName}</b><span>{person.category === "Інша підгрупа" ? person.groupName : person.category}{person.rank ? ` · ${person.rank}` : ""}{person.position ? ` · ${person.position}` : ""}{person.actingPosition ? ` · ТВО: ${person.actingPosition}` : ""}</span></div><button className="icon-button" title="Редагувати" onClick={() => onEdit(person)}><Pencil /></button><button className="icon-button danger" title="Видалити з БЧС" onClick={() => onDelete(person)}><Trash2 /></button></article>)}{!people.length && <p className="bcs-parameters__empty">Окремих записів ще немає.</p>}</div>
      </section>
    </div>
    <footer className="modal-actions"><button className="button" onClick={onClose}>Закрити</button><button className="button primary" onClick={onExport}><FileSpreadsheet />Експорт БЧС</button></footer>
  </Modal>;
}
