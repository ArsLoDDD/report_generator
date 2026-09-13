import { Beaker, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { Select } from "../../shared/ui/Select";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import { operationsService } from "./services/operationsService";
import type { Equipment, WorkshopIngredient, WorkshopProduct } from "./types";

const productUnits = ["шт", "компл"];
const freshIngredient = (): WorkshopIngredient => ({ equipmentId: 0, equipmentName: "", quantity: 0, measurementUnit: "" });

export function WorkshopPage() {
  const { notify } = useNotifications();
  const [components, setComponents] = useState<Equipment[]>([]);
  const [products, setProducts] = useState<WorkshopProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [measurementUnit, setMeasurementUnit] = useState("шт");
  const [ingredients, setIngredients] = useState<WorkshopIngredient[]>([freshIngredient()]);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const [equipment, nextProducts] = await Promise.all([
        operationsService.listEquipment("weapon_ammo"),
        operationsService.listWorkshopProducts(),
      ]);
      setComponents(equipment.filter((item) => item.weaponKind === "component"));
      setProducts(nextProducts);
    } catch {
      notify("Не вдалося завантажити облік Цукерні.", "error");
    }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const availableById = useMemo(() => new Map(components.map((item) => [item.id, item])), [components]);
  const reset = () => { setName(""); setQuantity(1); setMeasurementUnit("шт"); setIngredients([freshIngredient()]); setNotes(""); };
  const selectIngredient = (index: number, rawId: string) => {
    const equipment = availableById.get(Number(rawId));
    setIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? {
      equipmentId: equipment?.id ?? 0,
      equipmentName: equipment?.name ?? "",
      quantity: 0,
      measurementUnit: equipment?.measurementUnit ?? "",
    } : item));
  };
  const save = async () => {
    const selected = ingredients.filter((item) => item.equipmentId && item.quantity > 0);
    if (!name.trim()) return notify("Вкажіть назву виробу.", "error");
    if (!selected.length) return notify("Додайте складові та кількість для списання.", "error");
    if (new Set(selected.map((item) => item.equipmentId)).size !== selected.length) return notify("Кожну складову можна додати лише один раз.", "error");
    try {
      await operationsService.createWorkshopProduct({ name, quantity, measurementUnit, ingredients: selected, notes });
      setOpen(false); reset(); await load(); notify("Виріб додано, складові списано з обліку.", "success");
    } catch (error) {
      notify(typeof error === "string" ? error : "Не вдалося створити виріб.", "error");
    }
  };
  const columns: EntityTableColumn<WorkshopProduct>[] = [
    { key: "id", title: "№", render: (_item, index) => index + 1 },
    { key: "name", title: "Виріб", render: (item) => <><b>{item.name}</b>{item.notes && <small>{item.notes}</small>}</> },
    { key: "quantity", title: "Виготовлено", render: (item) => `${item.quantity} ${item.measurementUnit}` },
    { key: "ingredients", title: "Списано складових", render: (item) => item.ingredients.map((part) => `${part.equipmentName}: ${part.quantity} ${part.measurementUnit}`).join(" · ") },
    { key: "created", title: "Дата обліку", render: (item) => new Date(`${item.createdAt.replace(" ", "T")}Z`).toLocaleString("uk-UA") },
  ];

  return <PageFrame className="workshop-page" header={<PageTitle title="Цукерня" subtitle="Облік виготовлених виробів і автоматичне списання складових БК" actions={<button className="button primary" onClick={() => setOpen(true)}><Plus />Додати виготовлення</button>} />}>
    <section className="panel operation-table data-table workshop-table"><EntityTable items={products} columns={columns} rowKey={(item) => item.id} emptyState={<div className="personnel-state"><Beaker /><b>Виробів ще немає</b><span>Перше виготовлення з’явиться тут після облікової операції.</span></div>} /><div className="pagination">Показано {products.length} із {products.length}</div></section>
    {open && <Modal title="Нове виготовлення" subtitle="Вкажіть тільки облікові кількості: після збереження складові будуть списані." onClose={() => { setOpen(false); reset(); }} className="operation-editor workshop-editor"><div className="operation-editor__body workshop-editor__body">
      <label className="form-field"><span>Назва виробу <b>*</b></span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="form-field"><span>Кількість виробів</span><input type="number" min="0.001" step="any" value={quantity} onChange={(event) => setQuantity(Math.max(0, Number(event.target.value) || 0))} /></label>
      <label className="form-field"><span>Одиниця виробу</span><Select ariaLabel="Одиниця виробу" value={measurementUnit} onChange={setMeasurementUnit} options={productUnits.map((value) => ({ value, label: value }))} /></label>
      <section className="workshop-ingredients form-field--wide"><header><div><b>Складові до списання</b><small>Доступні лише записи з типом «Складові БК».</small></div><button className="button" disabled={!components.length || ingredients.length >= components.length} onClick={() => setIngredients((current) => [...current, freshIngredient()])}><Plus />Додати складову</button></header>{components.length ? ingredients.map((ingredient, index) => { const source = availableById.get(ingredient.equipmentId); return <div className="workshop-ingredient" key={index}><Select ariaLabel={`Складова ${index + 1}`} value={ingredient.equipmentId ? String(ingredient.equipmentId) : ""} onChange={(value) => selectIngredient(index, value)} options={[{ value: "", label: "Оберіть складову" }, ...components.map((item) => ({ value: String(item.id), label: `${item.name} · доступно ${item.stockQuantity} ${item.measurementUnit}` }))]} /><label><input aria-label={`Кількість складової ${index + 1}`} type="number" min="0" max={source?.stockQuantity} step="any" value={ingredient.quantity || ""} onChange={(event) => setIngredients((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Math.max(0, Number(event.target.value) || 0) } : item))} /><span>{source?.measurementUnit || "од."}</span></label><button className="icon-button danger" title="Прибрати складову" onClick={() => setIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button></div>; }) : <p>Спочатку додайте у «Зброя та БК» записи типу «Складові БК».</p>}</section>
      <label className="form-field form-field--wide"><span>Примітка</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    </div><footer className="modal-actions"><button className="button" onClick={() => { setOpen(false); reset(); }}>Скасувати</button><button className="button primary" onClick={() => void save()}><Plus />Зберегти виготовлення</button></footer></Modal>}
  </PageFrame>;
}
