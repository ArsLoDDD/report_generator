import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { personnelService } from "../services/personnelService";
import type { CustomFieldDefinition } from "../types/domain";
import { useNotifications } from "./NotificationProvider";

const emptyField = (): CustomFieldDefinition => ({ fieldKey: "", displayName: "", description: "", initialValue: "" });
const fieldError = (error: unknown) => error instanceof Error ? error.message : typeof error === "string" ? error : "Не вдалося зберегти поле БД.";

export function PageTitle({ title, subtitle, actions, customFieldsScope }: { title: string; subtitle: string; actions?: ReactNode; customFieldsScope?: "personnel" | "vehicle" }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [field, setField] = useState<CustomFieldDefinition>(emptyField());
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const { notify } = useNotifications();

  const loadFields = useCallback(async () => setFields(customFieldsScope === "vehicle" ? await personnelService.listVehicleCustomFields() : await personnelService.listCustomFields()), [customFieldsScope]);
  useEffect(() => { if (customFieldsScope || title === "Особовий склад") void loadFields().catch(() => undefined); }, [customFieldsScope, title, loadFields]);

  const closeEditor = () => { setEditorOpen(false); setFormOpen(false); setEditingFieldKey(null); setField(emptyField()); };
  const startCreate = () => { setEditingFieldKey(null); setField(emptyField()); setFormOpen(true); };
  const startEdit = (item: CustomFieldDefinition) => { setEditingFieldKey(item.fieldKey); setField(item); setFormOpen(true); };
  const saveField = async () => {
    const key = field.fieldKey.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      notify("Ключ поля має починатися з малої латинської літери та містити лише малі латинські літери, цифри й підкреслення.", "error");
      return;
    }
    if (!field.displayName.trim()) {
      notify("Вкажіть українську назву поля.", "error");
      return;
    }
    try {
      const saved = editingFieldKey
        ? customFieldsScope === "vehicle" ? await personnelService.updateVehicleCustomField({ ...field, fieldKey: editingFieldKey, scope: "vehicle" }) : await personnelService.updateCustomField({ ...field, fieldKey: editingFieldKey })
        : customFieldsScope === "vehicle" ? await personnelService.createVehicleCustomField({ ...field, fieldKey: key, scope: "vehicle" }) : await personnelService.createCustomField({ ...field, fieldKey: key });
      setFields((current) => current.some((item) => item.fieldKey === saved.fieldKey)
        ? current.map((item) => item.fieldKey === saved.fieldKey ? saved : item)
        : [...current, saved]);
      setFormOpen(false);
      setEditingFieldKey(null);
      setField(emptyField());
      window.dispatchEvent(new Event(customFieldsScope === "vehicle" ? "vehicles-refresh" : "personnel-refresh"));
      notify("Поле БД збережено.", "success");
    } catch (error) {
      notify(fieldError(error), "error");
    }
  };
  const removeField = async (fieldKey: string) => {
    try {
      if (customFieldsScope === "vehicle") await personnelService.deleteVehicleCustomField(fieldKey); else await personnelService.deleteCustomField(fieldKey);
      setFields((current) => current.filter((item) => item.fieldKey !== fieldKey));
      window.dispatchEvent(new Event(customFieldsScope === "vehicle" ? "vehicles-refresh" : "personnel-refresh"));
      notify("Поле БД видалено.", "success");
    } catch (error) {
      notify(fieldError(error), "error");
    }
  };

  return <>
    <div className="page-title">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {actions && <div className="header-actions">
        {(customFieldsScope || title === "Особовий склад") && <button className="button" onClick={() => { void loadFields(); setEditorOpen(true); }}><Plus />Редактор кастомних полів</button>}
        {actions}
      </div>}
    </div>
    {editorOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
      <section className="modal custom-field-editor" role="dialog" aria-modal="true" aria-label="Редактор кастомних полів">
        {formOpen ? <>
          <h2>{editingFieldKey ? "Редагування кастомного поля" : "Нове кастомне поле"}</h2>
          <p>Поле буде доступним у конструкторі змінних і синхронізується з custom_variables.json.</p>
          <label>Ключ поля<input disabled={Boolean(editingFieldKey)} value={field.fieldKey} onChange={(event) => setField({ ...field, fieldKey: event.target.value })} placeholder="unit_name" /></label>
          <label>Українська назва<input value={field.displayName} onChange={(event) => setField({ ...field, displayName: event.target.value })} /></label>
          <label>Опис<textarea value={field.description} onChange={(event) => setField({ ...field, description: event.target.value })} /></label>
          <label>Початкове значення<input value={field.initialValue} onChange={(event) => setField({ ...field, initialValue: event.target.value })} /></label>
          <div className="modal-actions"><button className="button" onClick={() => { setFormOpen(false); setEditingFieldKey(null); setField(emptyField()); }}>Назад до списку</button><button className="button primary" onClick={() => void saveField()}>Зберегти поле</button></div>
        </> : <>
          <header className="custom-field-editor__header"><div><h2>Редактор кастомних полів</h2><p>Створюйте додаткові поля для {customFieldsScope === "vehicle" ? "автомобілів" : "особового складу"}, конструктора та шаблонів.</p></div><button className="button primary" onClick={startCreate}><Plus />Створити поле</button></header>
          {fields.length === 0 ? <p className="custom-field-editor__empty">Кастомних полів ще немає.</p> : <div className="custom-field-list"><h3>Створені поля</h3>{fields.map((item) => <div key={item.fieldKey}><span>{item.displayName} <code>{item.fieldKey}</code></span><button className="button" onClick={() => startEdit(item)}>Редагувати</button><button className="button danger" onClick={() => void removeField(item.fieldKey)}>Видалити</button></div>)}</div>}
          <div className="modal-actions"><button className="button" onClick={closeEditor}>Закрити</button></div>
        </>}
      </section>
    </div>}
  </>;
}
