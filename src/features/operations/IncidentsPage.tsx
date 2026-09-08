import { AlertTriangle, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Select } from "../../shared/ui/Select";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import { operationsService } from "./services/operationsService";
import type { Crew, Equipment, Incident } from "./types";

const incidentColumns: EntityTableColumn<Incident>[] = [
  { key: "id", title: "№", render: (item) => item.id },
  { key: "event", title: "Подія", render: (item) => <><b>{item.incidentType}</b><small>{item.description}</small></> },
  { key: "occurredAt", title: "Дата й час", render: (item) => item.occurredAt || "—" },
  { key: "crew", title: "Екіпаж", render: (item) => <>{item.crewName ?? "—"}<small>{item.crewSnapshot}</small></> },
  { key: "equipment", title: "БпЛА / майно", render: (item) => <>{item.equipmentName ?? "—"}<small>{item.vehicleName}</small></> },
  { key: "position", title: "Позиція", render: (item) => item.positionName || "—" },
  { key: "area", title: "Район", render: (item) => item.reconnaissanceArea || "—" },
];

export function IncidentsPage() {
  const [items, setItems] = useState<Incident[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [uavs, setUavs] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const { notify } = useNotifications();
  const [draft, setDraft] = useState({ incidentType: "Втрата БпЛА", occurredAt: new Date().toISOString().slice(0, 16), crewId: "", equipmentId: "", positionName: "", reconnaissanceArea: "", description: "" });

  const reload = useCallback(() => {
    void operationsService.listIncidents().then(setItems).catch(() => notify("Не вдалося завантажити інциденти.", "error"));
    void operationsService.listCrews().then(setCrews).catch(() => setCrews([]));
    void operationsService.listEquipment("uav").then(setUavs).catch(() => setUavs([]));
  }, [notify]);

  useEffect(() => { reload(); }, [reload]);

  const chooseCrew = (crewId: string) => {
    const crew = crews.find((item) => item.id === Number(crewId));
    setDraft((current) => ({ ...current, crewId, positionName: crew?.positionName ?? "", reconnaissanceArea: crew?.reconnaissanceArea ?? "" }));
  };

  const save = async () => {
    try {
      await operationsService.createIncident({ ...draft, crewId: draft.crewId ? Number(draft.crewId) : null, equipmentId: draft.equipmentId ? Number(draft.equipmentId) : null });
      setOpen(false);
      reload();
      notify("Інцидент збережено.", "success");
    } catch (error) {
      notify(typeof error === "string" ? error : "Не вдалося зберегти інцидент.", "error");
    }
  };

  return <PageFrame className="incidents-page" header={<PageTitle title="Інциденти" subtitle="Події з автоматичним збереженням пов’язаного екіпажу та майна" actions={<button className="button primary" onClick={() => setOpen(true)}><Plus />Додати інцидент</button>} />}>
    <section className="panel operation-table">
      <EntityTable className="operation-table__table" items={items} columns={incidentColumns} rowKey={(item) => item.id} emptyState={<div className="personnel-state"><AlertTriangle /><b>Інцидентів поки немає</b><span>Зафіксуйте першу подію.</span></div>} />
    </section>
    {open && <Modal title="Новий інцидент" onClose={() => setOpen(false)} className="incident-editor">
      <div className="operation-editor__body">
        <label className="form-field"><span>Тип інциденту</span><Select ariaLabel="Тип інциденту" value={draft.incidentType} onChange={(incidentType) => setDraft({ ...draft, incidentType })} options={[{ value: "Втрата БпЛА", label: "Втрата БпЛА" }, { value: "Пошкодження БпЛА", label: "Пошкодження БпЛА" }, { value: "Інший інцидент", label: "Інший інцидент" }]} /></label>
        <label className="form-field"><span>Дата і час</span><input type="datetime-local" value={draft.occurredAt} onChange={(event) => setDraft({ ...draft, occurredAt: event.target.value })} /></label>
        <label className="form-field"><span>Екіпаж</span><Select ariaLabel="Екіпаж інциденту" value={draft.crewId} onChange={chooseCrew} options={[{ value: "", label: "Не обирати екіпаж" }, ...crews.map((crew) => ({ value: String(crew.id), label: crew.name }))]} /></label>
        <label className="form-field"><span>БпЛА</span><Select ariaLabel="БпЛА інциденту" value={draft.equipmentId} onChange={(equipmentId) => setDraft({ ...draft, equipmentId })} options={[{ value: "", label: "Не обирати БпЛА" }, ...uavs.map((uav) => ({ value: String(uav.id), label: `${uav.name}${uav.inventoryNumber ? ` · ${uav.inventoryNumber}` : ""}` }))]} /></label>
        <label className="form-field"><span>Позиція</span><input value={draft.positionName} onChange={(event) => setDraft({ ...draft, positionName: event.target.value })} /></label>
        <label className="form-field"><span>Район розвідки</span><input value={draft.reconnaissanceArea} onChange={(event) => setDraft({ ...draft, reconnaissanceArea: event.target.value })} /></label>
        <label className="form-field form-field--wide"><span>Опис</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      </div>
      <footer className="modal-actions"><button className="button" onClick={() => setOpen(false)}>Скасувати</button><button className="button primary" onClick={() => void save()}>Зберегти інцидент</button></footer>
    </Modal>}
  </PageFrame>;
}

