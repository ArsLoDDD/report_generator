import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { emitAppDataEvent } from "../../events/appEvents";
import { personnelService } from "../../services/personnelService";
import type { CustomFieldDefinition } from "../../types/domain";
import { Modal } from "../Modal";
import { useNotifications } from "../NotificationProvider";

export type CustomFieldsScope = "personnel" | "vehicle";

const emptyField = (): CustomFieldDefinition => ({ fieldKey: "", displayName: "", description: "", initialValue: "" });
const fieldError = (error: unknown) => error instanceof Error ? error.message : typeof error === "string" ? error : "Не вдалося зберегти поле БД.";

export function CustomFieldsManager({ scope }: { scope: CustomFieldsScope }) {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [field, setField] = useState<CustomFieldDefinition>(emptyField());
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const { notify } = useNotifications();

  const loadFields = useCallback(async () => setFields(scope === "vehicle" ? await personnelService.listVehicleCustomFields() : await personnelService.listCustomFields()), [scope]);
  useEffect(() => { void loadFields().catch(() => undefined); }, [loadFields]);

  const resetForm = () => { setFormOpen(false); setEditingFieldKey(null); setField(emptyField()); };
  const close = () => { setOpen(false); resetForm(); };
  const save = async () => {
    const key = field.fieldKey.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key)) { notify("Ключ поля має починатися з малої латинської літери та містити лише малі латинські літери, цифри й підкреслення.", "error"); return; }
    if (!field.displayName.trim()) { notify("Вкажіть українську назву поля.", "error"); return; }
    try {
      const saved = editingFieldKey
        ? scope === "vehicle" ? await personnelService.updateVehicleCustomField({ ...field, fieldKey: editingFieldKey, scope: "vehicle" }) : await personnelService.updateCustomField({ ...field, fieldKey: editingFieldKey })
        : scope === "vehicle" ? await personnelService.createVehicleCustomField({ ...field, fieldKey: key, scope: "vehicle" }) : await personnelService.createCustomField({ ...field, fieldKey: key });
      setFields((current) => current.some((item) => item.fieldKey === saved.fieldKey) ? current.map((item) => item.fieldKey === saved.fieldKey ? saved : item) : [...current, saved]);
      resetForm();
      emitAppDataEvent(scope === "vehicle" ? "vehicles-refresh" : "personnel-refresh");
      notify("Поле БД збережено.", "success");
    } catch (error) { notify(fieldError(error), "error"); }
  };
  const remove = async (fieldKey: string) => {
    try {
      if (scope === "vehicle") await personnelService.deleteVehicleCustomField(fieldKey); else await personnelService.deleteCustomField(fieldKey);
      setFields((current) => current.filter((item) => item.fieldKey !== fieldKey));
      emitAppDataEvent(scope === "vehicle" ? "vehicles-refresh" : "personnel-refresh");
      notify("Поле БД видалено.", "success");
    } catch (error) { notify(fieldError(error), "error"); }
  };

  return <>
    <button className="button" onClick={() => { void loadFields(); setOpen(true); }}><Plus />Редактор кастомних полів</button>
    {open && <Modal title="Редактор кастомних полів" onClose={close} className="custom-field-editor">
      {formOpen ? <>
        <p>Поле буде доступним у конструкторі змінних і синхронізується з custom_variables.json.</p>
        <label>Ключ поля<input disabled={Boolean(editingFieldKey)} value={field.fieldKey} onChange={(event) => setField({ ...field, fieldKey: event.target.value })} placeholder="unit_name" /></label>
        <label>Українська назва<input value={field.displayName} onChange={(event) => setField({ ...field, displayName: event.target.value })} /></label>
        <label>Опис<textarea value={field.description} onChange={(event) => setField({ ...field, description: event.target.value })} /></label>
        <label>Початкове значення<input value={field.initialValue} onChange={(event) => setField({ ...field, initialValue: event.target.value })} /></label>
        <div className="modal-actions"><button className="button" onClick={resetForm}>Назад до списку</button><button className="button primary" onClick={() => void save()}>Зберегти поле</button></div>
      </> : <>
        <header className="custom-field-editor__header"><div><p>Створюйте додаткові поля для {scope === "vehicle" ? "автомобілів" : "особового складу"}, конструктора та шаблонів.</p></div><button className="button primary" onClick={() => { setEditingFieldKey(null); setField(emptyField()); setFormOpen(true); }}><Plus />Створити поле</button></header>
        {fields.length === 0 ? <p className="custom-field-editor__empty">Кастомних полів ще немає.</p> : <div className="custom-field-list"><h3>Створені поля</h3>{fields.map((item) => <div key={item.fieldKey}><span>{item.displayName} <code>{item.fieldKey}</code></span><button className="button" onClick={() => { setEditingFieldKey(item.fieldKey); setField(item); setFormOpen(true); }}>Редагувати</button><button className="button danger" onClick={() => void remove(item.fieldKey)}>Видалити</button></div>)}</div>}
        <div className="modal-actions"><button className="button" onClick={close}>Закрити</button></div>
      </>}
    </Modal>}
  </>;
}

