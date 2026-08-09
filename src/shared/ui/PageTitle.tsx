import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { personnelService } from "../services/personnelService";
import type { CustomFieldDefinition } from "../types/domain";
import { useNotifications } from "./NotificationProvider";

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  const [showField, setShowField] = useState(false);
  const [field, setField] = useState<CustomFieldDefinition>({ fieldKey: "custom_", displayName: "", description: "", initialValue: "" });
  const { notify } = useNotifications();
  const createField = async () => { try { await personnelService.createCustomField(field); setShowField(false); setField({ fieldKey: "custom_", displayName: "", description: "", initialValue: "" }); notify("Поле БД додано.", "success"); } catch (error) { notify(error instanceof Error ? error.message : "Не вдалося додати поле БД.", "error"); } };
  return <><div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div>{actions && <div className="header-actions">{title === "Особовий склад" && <button className="button" onClick={() => setShowField(true)}><Plus />Додати поле БД</button>}{actions}</div>}</div>{showField && <div className="modal-backdrop"><section className="modal"><h2>Нове поле БД</h2><p>Поле буде додано всім військовослужбовцям і стане доступним у конструкторі змінних.</p><label>Ключ поля<input value={field.fieldKey} onChange={(event) => setField({ ...field, fieldKey: event.target.value })} placeholder="custom_service_number" /></label><label>Українська назва<input value={field.displayName} onChange={(event) => setField({ ...field, displayName: event.target.value })} /></label><label>Опис<textarea value={field.description} onChange={(event) => setField({ ...field, description: event.target.value })} /></label><label>Початкове значення<input value={field.initialValue} onChange={(event) => setField({ ...field, initialValue: event.target.value })} /></label><div className="modal-actions"><button className="button" onClick={() => setShowField(false)}>Скасувати</button><button className="button primary" onClick={() => void createField()}>Створити поле</button></div></section></div>}</>;
}
