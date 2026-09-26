import {
  Activity, Archive, BatteryCharging, Boxes, Cable, ChevronLeft, ChevronRight,
  Crosshair, Edit3, Fuel, HeartPulse, History, PackageOpen, Plus, RefreshCw,
  Shield, Trash2, Truck, Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import type { Person } from "../../shared/types/domain";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { EntityDetailsPanel } from "../../shared/ui/EntityDetailsPanel";
import { Modal } from "../../shared/ui/Modal";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { EntityTable, type EntityTableColumn } from "../../shared/ui/data-table/EntityTable";
import { operationsService } from "../operations/services/operationsService";
import type { AssetCatalog, AssetCatalogDraft, AssetHistoryEvent, AssetServiceCode, Crew, ServiceAsset, ServiceAssetDraft } from "../operations/types";

type ServiceDefinition = {
  code: AssetServiceCode;
  shortName: string;
  title: string;
  description: string;
  icon: ComponentType;
  hasCondition: boolean;
  allowsReceipt?: boolean;
  fields: ServiceField[];
};
type ServiceField = { key: string; label: string; shortLabel?: string; kind?: "text" | "number" | "date" | "select"; options?: string[]; base?: "nomenclatureNumber" | "serialNumber" | "manufactureYear" | "inventoryNumber" };

const units = ["кг.", "шт.", "к-т.", "компл.", "пара", "уп."];
const statuses = ["Справний", "Обмежено справний", "Потребує ремонту", "Ремонтується", "Несправний", "Списаний"];
const serviceDefinitions: ServiceDefinition[] = [
  { code: "zbbr", shortName: "ЗББР", title: "ЗББР", description: "Зброя", icon: Shield, hasCondition: true, fields: [
    { key: "nomenclature_number", label: "Номенклатурний номер", shortLabel: "Номенкл. №", base: "nomenclatureNumber" },
    { key: "weapon_number", label: "Номер зброї", shortLabel: "№ зброї", base: "serialNumber" },
    { key: "manufacture_year", label: "Рік виготовлення", shortLabel: "Рік", base: "manufactureYear" },
  ] },
  { code: "zu", shortName: "ЗУ", title: "ЗУ", description: "Боєприпаси та боєкомплект", icon: Archive, hasCondition: false, allowsReceipt: true, fields: [] },
  { code: "gz_kb", shortName: "ГЗ та КБ", title: "ГЗ та КБ", description: "Засоби зв’язку, комп’ютерна та інша техніка", icon: Cable, hasCondition: true, fields: [
    { key: "serial_number", label: "Серійний номер", shortLabel: "Серійний №", base: "serialNumber" },
  ] },
  { code: "siiz", shortName: "СІІЗ", title: "СІІЗ", description: "Спеціальні та інженерні засоби", icon: Wrench, hasCondition: true, fields: [
    { key: "serial_number", label: "Серійний номер", shortLabel: "Серійний №", base: "serialNumber" },
  ] },
  { code: "ms", shortName: "МС", title: "МС", description: "Медичне майно", icon: HeartPulse, hasCondition: false, fields: [] },
  { code: "ets", shortName: "ЕТС", title: "ЕТС", description: "Електротехнічні засоби та генератори", icon: BatteryCharging, hasCondition: true, fields: [
    { key: "factory_number", label: "Заводський номер", shortLabel: "Заводський №", base: "serialNumber" },
    { key: "release_year", label: "Дата випуску", shortLabel: "Рік випуску", kind: "number", base: "manufactureYear" },
    { key: "fuel_type", label: "Вид палива", kind: "select", options: ["Газ", "БА", "ДП"] },
    { key: "nominal_power", label: "Номінальна потужність", shortLabel: "Номін. потужн." },
    { key: "maximum_power", label: "Максимальна потужність", shortLabel: "Макс. потужн." },
    { key: "phase_count", label: "Кількість фаз", shortLabel: "Фази", kind: "number" },
    { key: "commissioned_year", label: "Введено в експлуатацію", shortLabel: "В експл. з", kind: "number" },
    { key: "time_in_service", label: "Знаходиться в експлуатації", shortLabel: "В експлуатації" },
    { key: "resource", label: "Ресурс", kind: "text" },
    { key: "fuel_tank_volume", label: "Об’єм паливного бака", shortLabel: "Об’єм бака" },
    { key: "frequency", label: "Частота" },
  ] },
  { code: "ovtm", shortName: "ОВТМ", title: "ОВТМ", description: "Озброєння, військова техніка та майно", icon: Boxes, hasCondition: true, fields: [] },
  { code: "rs", shortName: "РС", title: "РС", description: "Речова служба", icon: PackageOpen, hasCondition: false, fields: [] },
  { code: "sa_ppo", shortName: "СА та ППО", title: "СА та ППО", description: "БпАК, БпЛА та комплектуючі", icon: Crosshair, hasCondition: true, fields: [
    { key: "serial_number", label: "Серійний номер", shortLabel: "Серійний №", base: "serialNumber" },
  ] },
  { code: "svt", shortName: "СВТ", title: "СВТ", description: "Техніка, акумуляторні батареї та шини", icon: Truck, hasCondition: true, fields: [] },
  { code: "pmm", shortName: "ПММ", title: "ПММ", description: "Пально-мастильні матеріали", icon: Fuel, hasCondition: false, allowsReceipt: true, fields: [] },
];

const svtFields: Record<string, ServiceField[]> = {
  "Техніка": [
    { key: "registration_number", label: "Автомобільний номерний знак", shortLabel: "Номерний знак" },
    { key: "vin", label: "Заводський номер (VIN-код)", shortLabel: "VIN-код" },
    { key: "manufacture_year", label: "Рік виготовлення", shortLabel: "Рік", base: "manufactureYear" },
    { key: "commissioned_date", label: "Введено в експлуатацію", shortLabel: "В експл. з", kind: "date" },
    { key: "time_in_service", label: "Знаходиться в експлуатації", shortLabel: "В експлуатації" },
    { key: "accumulated_resource", label: "Напрацьовано з початку експлуатації", shortLabel: "Напрацювання" },
  ],
  "АКБ": [
    { key: "capacity", label: "Ємність" }, { key: "voltage", label: "Напруга" },
  ],
  "Шини": [{ key: "size", label: "Розмір" }],
};

const serviceByCode = Object.fromEntries(serviceDefinitions.map((item) => [item.code, item])) as Record<AssetServiceCode, ServiceDefinition>;
const freshDraft = (serviceCode: AssetServiceCode): ServiceAssetDraft => ({
  serviceCode, catalogId: null, name: "", fullName: "", nomenclatureNumber: "", inventoryNumber: "", serialNumber: "",
  manufactureYear: "", accountingUnit: "шт.", quantity: 1, value: 0, status: "Справний", crewId: null, personnelId: null,
  parentEquipmentId: null, assetType: serviceCode === "sa_ppo" ? "БпЛА" : "", serviceData: {}, customValues: {}, notes: "",
});

const fieldValue = (draft: ServiceAssetDraft | ServiceAsset, field: ServiceField) => field.base ? String(draft[field.base] ?? "") : draft.serviceData[field.key] ?? "";
const setFieldValue = (draft: ServiceAssetDraft, field: ServiceField, value: string): ServiceAssetDraft => field.base
  ? { ...draft, [field.base]: value }
  : { ...draft, serviceData: { ...draft.serviceData, [field.key]: value } };
const shortHolder = (name: string | null) => name || "—";
const historyLabels: Record<string, string> = { created: "Створено", updated: "Оновлено", reassigned: "Перезакріплено", received: "Надходження", deleted: "Видалено" };

const transliteration: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ж: "zh", з: "z", и: "y", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "yu", я: "ya",
};
const fieldKeyFromName = (value: string) => value.toLocaleLowerCase("uk").split("").map((letter) => transliteration[letter] ?? letter).join("").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "field_");

export function ServicesPage({ people }: { people: Person[] }) {
  const { notify } = useNotifications();
  const [serviceCode, setServiceCode] = useState<AssetServiceCode>("zbbr");
  const service = serviceByCode[serviceCode];
  const ServiceIcon = service.icon;
  const [assets, setAssets] = useState<ServiceAsset[]>([]);
  const [catalogs, setCatalogs] = useState<AssetCatalog[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [activeCatalogId, setActiveCatalogId] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ServiceAsset | null>(null);
  const [editing, setEditing] = useState<ServiceAsset | "new" | null>(null);
  const [draft, setDraft] = useState<ServiceAssetDraft>(() => freshDraft("zbbr"));
  const [catalogEditor, setCatalogEditor] = useState<AssetCatalog | "new" | null>(null);
  const [catalogDraft, setCatalogDraft] = useState<AssetCatalogDraft>({ serviceCode: "zbbr", name: "", fields: [] });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<AssetHistoryEvent[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ServiceAsset | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<ServiceAsset | null>(null);
  const [receiptQuantity, setReceiptQuantity] = useState(1);
  const [receiptDetails, setReceiptDetails] = useState("");
  const [showFullName, setShowFullName] = useState(false);
  const catalogStrip = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      const [nextAssets, nextCatalogs, nextCrews] = await Promise.all([
        operationsService.listServiceAssets(serviceCode), operationsService.listAssetCatalogs(serviceCode), operationsService.listCrews(),
      ]);
      setAssets(nextAssets); setCatalogs(nextCatalogs); setCrews(nextCrews);
      setSelected((current) => current ? nextAssets.find((item) => item.id === current.id) ?? null : null);
    } catch (error) {
      notify(typeof error === "string" ? error : "Не вдалося завантажити дані служби.", "error");
    }
  }, [notify, serviceCode]);
  useEffect(() => { setActiveCatalogId("all"); setSelected(null); setQuery(""); void reload(); }, [reload]);

  const activeCatalog = catalogs.find((item) => item.id === activeCatalogId) ?? null;
  const currentFields = useMemo(() => serviceCode === "svt" ? (svtFields[activeCatalog?.name ?? ""] ?? []) : service.fields, [activeCatalog?.name, service.fields, serviceCode]);
  const filtered = useMemo(() => assets.filter((item) => (activeCatalogId === "all" || item.catalogId === activeCatalogId)
    && [item.name, item.fullName, item.nomenclatureNumber, item.serialNumber, item.holderName, item.crewName, item.catalogName, ...Object.values(item.serviceData)].join(" ").toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"))), [activeCatalogId, assets, query]);

  const openCreate = () => {
    const next = freshDraft(serviceCode);
    next.catalogId = typeof activeCatalogId === "number" ? activeCatalogId : serviceCode === "svt" ? catalogs.find((item) => item.name === "Техніка")?.id ?? null : catalogs.length === 1 ? catalogs[0].id : null;
    setDraft(next); setEditing("new");
  };
  const openEdit = (item: ServiceAsset) => { setDraft({
    serviceCode: item.serviceCode, catalogId: item.catalogId, name: item.name, fullName: item.fullName,
    nomenclatureNumber: item.nomenclatureNumber, inventoryNumber: item.inventoryNumber, serialNumber: item.serialNumber,
    manufactureYear: item.manufactureYear, accountingUnit: item.accountingUnit, quantity: item.quantity, value: item.value,
    status: item.status === "—" ? "Справний" : item.status, crewId: item.crewId, personnelId: item.personnelId,
    parentEquipmentId: item.parentEquipmentId, assetType: item.assetType, serviceData: item.serviceData, customValues: item.customValues, notes: item.notes,
  }); setEditing(item); };
  const save = async () => {
    if (!draft.name.trim()) return notify("Вкажіть коротку назву.", "error");
    try {
      if (editing === "new") await operationsService.createServiceAsset(draft);
      else if (editing) await operationsService.updateServiceAsset(editing.id, draft);
      setEditing(null); await reload(); notify(editing === "new" ? "Майно додано." : "Зміни збережено.", "success");
    } catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти майно.", "error"); }
  };
  const remove = async () => {
    if (!deleteTarget) return;
    try { await operationsService.deleteServiceAsset(deleteTarget.id); setDeleteTarget(null); setSelected(null); await reload(); notify("Запис видалено.", "success"); }
    catch (error) { notify(typeof error === "string" ? error : "Не вдалося видалити запис.", "error"); }
  };
  const openHistory = async (asset: ServiceAsset | null = null) => {
    try { setHistory(await operationsService.listAssetHistory(serviceCode, asset?.id ?? null)); setHistoryOpen(true); }
    catch { notify("Не вдалося завантажити історію.", "error"); }
  };
  const receive = async () => {
    if (!receiptTarget) return;
    try { await operationsService.addServiceAssetQuantity(receiptTarget.id, receiptQuantity, receiptDetails); setReceiptTarget(null); setReceiptQuantity(1); setReceiptDetails(""); await reload(); notify("Надходження оприбутковано.", "success"); }
    catch (error) { notify(typeof error === "string" ? error : "Не вдалося додати кількість.", "error"); }
  };

  const openCatalog = (catalog: AssetCatalog | "new") => {
    setCatalogEditor(catalog);
    setCatalogDraft(catalog === "new" ? { serviceCode, name: "", fields: [] } : { serviceCode, name: catalog.name, fields: catalog.fields.map(({ fieldKey, displayName, fieldType, initialValue, sortOrder }) => ({ fieldKey, displayName, fieldType, initialValue, sortOrder })) });
  };
  const saveCatalog = async () => {
    if (!catalogDraft.name.trim()) return notify("Вкажіть назву каталогу.", "error");
    try { const id = await operationsService.saveAssetCatalog(catalogEditor === "new" ? null : catalogEditor?.id ?? null, catalogDraft); setCatalogEditor(null); await reload(); setActiveCatalogId(id); notify("Каталог збережено.", "success"); }
    catch (error) { notify(typeof error === "string" ? error : "Не вдалося зберегти каталог.", "error"); }
  };

  const baseColumns: EntityTableColumn<ServiceAsset>[] = [
    { key: "name", title: "Назва", render: (item) => <><b>{item.name}</b>{showFullName && item.fullName !== item.name && <small>{item.fullName}</small>}</> },
    ...(activeCatalogId === "all" ? [{ key: "catalog", title: "Каталог", render: (item: ServiceAsset) => item.catalogName || "Без каталогу" } satisfies EntityTableColumn<ServiceAsset>] : []),
    ...(showFullName ? [{ key: "fullName", title: "Найменування матеріальних засобів", render: (item: ServiceAsset) => item.fullName || "—" } satisfies EntityTableColumn<ServiceAsset>] : []),
    ...(serviceCode === "sa_ppo" ? [{ key: "assetType", title: "Тип", render: (item: ServiceAsset) => item.assetType || "—" } satisfies EntityTableColumn<ServiceAsset>] : []),
    ...currentFields.map((field): EntityTableColumn<ServiceAsset> => ({ key: field.key, title: field.shortLabel ?? field.label, render: (item) => fieldValue(item, field) || "—" })),
    ...(serviceCode === "sa_ppo" ? [{ key: "parent", title: "Належить до", render: (item: ServiceAsset) => item.parentName || "—" } satisfies EntityTableColumn<ServiceAsset>] : []),
    ...(serviceCode === "svt" && activeCatalog?.name === "Техніка" ? [{ key: "batteries", title: "АКБ", render: (item: ServiceAsset) => assets.filter((child) => child.parentEquipmentId === item.id && child.catalogName === "АКБ").map((child) => child.name).join(", ") || "—" } satisfies EntityTableColumn<ServiceAsset>, { key: "tires", title: "Автомобільні шини", render: (item: ServiceAsset) => assets.filter((child) => child.parentEquipmentId === item.id && child.catalogName === "Шини").map((child) => child.name).join(", ") || "—" } satisfies EntityTableColumn<ServiceAsset>] : []),
    ...(serviceCode === "svt" && ["АКБ", "Шини"].includes(activeCatalog?.name ?? "") ? [{ key: "parent", title: "Техніка", render: (item: ServiceAsset) => item.parentName || "—" } satisfies EntityTableColumn<ServiceAsset>] : []),
    { key: "unit", title: "Од. обліку", render: (item) => item.accountingUnit },
    { key: "quantity", title: "К-ть", render: (item) => item.quantity.toLocaleString("uk-UA") },
    { key: "holder", title: "Закріплене", render: (item) => shortHolder(item.holderName) },
    ...(["gz_kb", "siiz", "ets", "ovtm", "sa_ppo", "svt"].includes(serviceCode) ? [{ key: "crew", title: "Екіпаж", render: (item: ServiceAsset) => item.crewName || "—" } satisfies EntityTableColumn<ServiceAsset>] : []),
    ...(!["zbbr", "zu"].includes(serviceCode) ? [{ key: "value", title: "Вартість", render: (item: ServiceAsset) => item.value ? `${item.value.toLocaleString("uk-UA")} грн` : "—" } satisfies EntityTableColumn<ServiceAsset>] : []),
    ...(service.hasCondition ? [{ key: "status", title: "Стан", render: (item: ServiceAsset) => <span className={`status-pill ${item.status === "Справний" ? "active" : "warning"}`}>{item.status}</span> } satisfies EntityTableColumn<ServiceAsset>] : []),
  ];

  const selectedCatalog = catalogs.find((item) => item.id === draft.catalogId) ?? null;
  const editorFields = serviceCode === "svt" ? (svtFields[selectedCatalog?.name ?? ""] ?? []) : service.fields;
  const assignmentCrew = draft.crewId ? crews.find((item) => item.id === draft.crewId) : null;
  const parentOptions = assets.filter((item) => item.id !== (editing === "new" ? -1 : editing?.id) && (serviceCode === "sa_ppo" ? item.assetType !== "Комплектуюче" : serviceCode === "svt" ? item.catalogName === "Техніка" : true));
  const selectedItemCatalog = selected ? catalogs.find((item) => item.id === selected.catalogId) ?? null : null;
  const linkedSvtItems = selected?.catalogName === "Техніка" ? assets.filter((item) => item.parentEquipmentId === selected.id) : [];
  const serviceHasCrew = ["gz_kb", "siiz", "ets", "ovtm", "sa_ppo", "svt"].includes(serviceCode);

  return <PageFrame className="services-page" header={<PageTitle title="Служби" subtitle="Єдиний облік майна за службами, каталогами та відповідальними" actions={<div className="services-page__actions"><button className="button" onClick={() => void openHistory()}><History />Історія руху</button><button className="button primary" onClick={openCreate}><Plus />Додати</button></div>} />}>
    <nav className="services-tabs" aria-label="Служби майна">{serviceDefinitions.map((definition) => { const Icon = definition.icon; return <button key={definition.code} className={serviceCode === definition.code ? "active" : ""} onClick={() => setServiceCode(definition.code)} title={definition.description}><Icon /><b>{definition.shortName}</b></button>; })}</nav>
    <section className="services-heading"><div><span>Служба</span><h2>{service.title}</h2><p>{service.description}</p></div><label className="services-full-name-toggle"><input type="checkbox" checked={showFullName} onChange={(event) => setShowFullName(event.target.checked)} /><span>Показати повне найменування</span></label></section>
    <div className="catalog-carousel-shell"><button className="icon-button" aria-label="Каталоги ліворуч" onClick={() => catalogStrip.current?.scrollBy({ left: -360, behavior: "smooth" })}><ChevronLeft /></button><div className="catalog-carousel" ref={catalogStrip}><button className={activeCatalogId === "all" ? "active" : ""} onClick={() => setActiveCatalogId("all")}><PackageOpen /><span>Усе майно</span><b>{assets.length}</b></button>{catalogs.map((catalog) => <button key={catalog.id} className={activeCatalogId === catalog.id ? "active" : ""} onClick={() => setActiveCatalogId(catalog.id)} onDoubleClick={() => openCatalog(catalog)}><Boxes /><span>{catalog.name}</span><b>{assets.filter((item) => item.catalogId === catalog.id).length}</b></button>)}<button className="catalog-carousel__add" onClick={() => openCatalog("new")}><Plus /><span>Новий каталог</span></button></div><button className="icon-button" aria-label="Каталоги праворуч" onClick={() => catalogStrip.current?.scrollBy({ left: 360, behavior: "smooth" })}><ChevronRight /></button></div>
    <div className="services-toolbar"><SearchInput value={query} onChange={setQuery} placeholder="Пошук за назвою, номером, відповідальним або екіпажем…" /><button className="button" onClick={() => void reload()}><RefreshCw />Оновити</button>{activeCatalog && <button className="button" onClick={() => openCatalog(activeCatalog)}><Edit3 />Налаштувати каталог</button>}</div>
    <div className={`people-layout ${selected ? "with-details" : ""}`}><section className="panel data-table service-assets-table"><EntityTable items={filtered} columns={baseColumns} rowKey={(item) => item.id} selectedKey={selected?.id} onSelect={setSelected} emptyState={<div className="personnel-state"><ServiceIcon /><b>У цьому розділі ще немає майна</b><span>Додайте перший запис або оберіть інший каталог.</span></div>} /><div className="pagination">Показано {filtered.length} із {assets.length}</div></section>{selected && <EntityDetailsPanel title="Картка майна" onClose={() => setSelected(null)} identity={<div className="identity"><div className="avatar"><PackageOpen /></div><div><b>{selected.name}</b><p>{selected.catalogName ?? "Без каталогу"} · {selected.accountingUnit} {selected.quantity}</p></div></div>} actions={<><button className="button" onClick={() => void openHistory(selected)}><History />Історія</button>{service.allowsReceipt && <button className="button" onClick={() => setReceiptTarget(selected)}><Plus />Додати кількість</button>}<button className="button" onClick={() => openEdit(selected)}><Edit3 />Редагувати</button><button className="button danger" onClick={() => setDeleteTarget(selected)}><Trash2 />Видалити</button></>}>
      <div className="person-detail"><span>Найменування матеріальних засобів</span><b>{selected.fullName || selected.name}</b></div><div className="person-detail"><span>Каталог</span><b>{selected.catalogName ?? "Без каталогу"}</b></div><div className="person-detail"><span>Кількість</span><b>{selected.quantity} {selected.accountingUnit}</b></div>{service.hasCondition && <div className="person-detail"><span>Стан</span><b>{selected.status}</b></div>}<div className="person-detail"><span>Закріплене</span><b>{selected.holderName || "Не закріплено"}</b></div>{serviceHasCrew && <div className="person-detail"><span>Екіпаж</span><b>{selected.crewName || "—"}</b></div>}{selected.parentName && <div className="person-detail"><span>{serviceCode === "svt" ? "Техніка" : "Належить до"}</span><b>{selected.parentName}</b></div>}{serviceCode === "sa_ppo" && <div className="person-detail"><span>Тип</span><b>{selected.assetType || "—"}</b></div>}{(serviceCode === "svt" ? (svtFields[selected.catalogName ?? ""] ?? []) : service.fields).map((field) => <div className="person-detail" key={field.key}><span>{field.label}</span><b>{fieldValue(selected, field) || "—"}</b></div>)}{selected.catalogName === "Техніка" && <><div className="person-detail"><span>АКБ</span><b>{linkedSvtItems.filter((item) => item.catalogName === "АКБ").map((item) => item.name).join(", ") || "—"}</b></div><div className="person-detail"><span>Автомобільні шини</span><b>{linkedSvtItems.filter((item) => item.catalogName === "Шини").map((item) => item.name).join(", ") || "—"}</b></div></>}{Object.entries(selected.customValues).map(([key, value]) => <div className="person-detail" key={key}><span>{selectedItemCatalog?.fields.find((field) => field.fieldKey === key)?.displayName ?? key}</span><b>{value || "—"}</b></div>)}<div className="person-detail"><span>Примітка</span><b>{selected.notes || "—"}</b></div>
    </EntityDetailsPanel>}</div>

    {editing && <Modal title={editing === "new" ? `Нове майно · ${service.title}` : `Редагування · ${editing.name}`} subtitle="Основні облікові дані, каталог і закріплення" onClose={() => setEditing(null)} className="service-asset-editor"><div className="service-asset-editor__body">
      <section><header><b>Основні дані</b><span>Коротка назва показується у таблиці, повне найменування — у картці та за потреби окремою колонкою.</span></header><div className="service-form-grid"><label className="form-field"><span>Назва <b>*</b></span><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Коротка зрозуміла назва" /></label><label className="form-field"><span>Каталог</span><Select ariaLabel="Каталог" value={draft.catalogId ? String(draft.catalogId) : ""} onChange={(value) => setDraft({ ...draft, catalogId: value ? Number(value) : null, customValues: {}, parentEquipmentId: null })} options={[...(serviceCode === "svt" ? [] : [{ value: "", label: "Без каталогу" }]), ...catalogs.map((catalog) => ({ value: String(catalog.id), label: catalog.name }))]} /></label><label className="form-field form-field--wide"><span>Найменування матеріальних засобів</span><input value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} placeholder="Повне офіційне найменування" /></label><label className="form-field"><span>Од. обліку</span><Select ariaLabel="Одиниця обліку" value={draft.accountingUnit} onChange={(accountingUnit) => setDraft({ ...draft, accountingUnit })} options={units.map((value) => ({ value, label: value }))} /></label><label className="form-field"><span>Кількість</span><input type="number" min="0" step="any" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Math.max(0, Number(event.target.value) || 0) })} /></label>{service.hasCondition && <label className="form-field"><span>Стан</span><Select ariaLabel="Стан майна" value={draft.status} onChange={(status) => setDraft({ ...draft, status })} options={statuses.map((value) => ({ value, label: value }))} /></label>}{!["zbbr", "zu"].includes(serviceCode) && <label className="form-field"><span>Вартість, грн</span><input type="number" min="0" step="0.01" value={draft.value} onChange={(event) => setDraft({ ...draft, value: Math.max(0, Number(event.target.value) || 0) })} /></label>}</div></section>
      {(serviceCode === "sa_ppo" || editorFields.length > 0) && <section><header><b>Службові характеристики</b><span>Основні поля цієї служби відображаються в таблиці; решта — у розгорнутій картці.</span></header><div className="service-form-grid">{serviceCode === "sa_ppo" && <><label className="form-field"><span>Тип</span><Select ariaLabel="Тип об’єкта" value={draft.assetType} onChange={(assetType) => setDraft({ ...draft, assetType, parentEquipmentId: assetType === "БпАК" ? null : draft.parentEquipmentId })} options={["БпАК", "БпЛА", "Комплектуюче"].map((value) => ({ value, label: value }))} /></label>{draft.assetType !== "БпАК" && <label className="form-field"><span>Належить до</span><Select ariaLabel="Належить до" value={draft.parentEquipmentId ? String(draft.parentEquipmentId) : ""} onChange={(value) => setDraft({ ...draft, parentEquipmentId: value ? Number(value) : null })} options={[{ value: "", label: "Самостійний об’єкт" }, ...parentOptions.map((item) => ({ value: String(item.id), label: `${item.name}${item.serialNumber ? ` · ${item.serialNumber}` : ""}` }))]} /></label>}</>}{editorFields.map((field) => <label className="form-field" key={field.key}><span>{field.label}</span>{field.kind === "select" ? <Select ariaLabel={field.label} value={fieldValue(draft, field)} onChange={(value) => setDraft(setFieldValue(draft, field, value))} options={[{ value: "", label: "Не вказано" }, ...(field.options ?? []).map((value) => ({ value, label: value }))]} /> : <input type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"} value={fieldValue(draft, field)} onChange={(event) => setDraft(setFieldValue(draft, field, event.target.value))} />}</label>)}</div></section>}
      {serviceCode === "svt" && ["АКБ", "Шини"].includes(selectedCatalog?.name ?? "") && <section><header><b>Закріплення за технікою</b><span>Зв’язок працює в обидві сторони: АКБ або шина показується у картці техніки, а техніка — у картці комплектуючого.</span></header><label className="form-field"><span>Техніка</span><Select ariaLabel="Закріплена техніка" value={draft.parentEquipmentId ? String(draft.parentEquipmentId) : ""} onChange={(value) => setDraft({ ...draft, parentEquipmentId: value ? Number(value) : null })} options={[{ value: "", label: "Не закріплено за технікою" }, ...parentOptions.map((item) => ({ value: String(item.id), label: `${item.name}${fieldValue(item, svtFields["Техніка"][0]) ? ` · ${fieldValue(item, svtFields["Техніка"][0])}` : ""}` }))]} /></label></section>}
      <section><header><b>Закріплення</b><span>{serviceHasCrew ? "«Закріплене» і «Екіпаж» — окремі поля. Для екіпажу відповідальним автоматично стане його офіційний командир, але його можна змінити." : "Оберіть військовослужбовця, за яким обліковується майно."}</span></header><div className="service-form-grid">{serviceHasCrew && <label className="form-field"><span>Екіпаж</span><Select ariaLabel="Екіпаж" value={draft.crewId ? String(draft.crewId) : ""} onChange={(value) => setDraft({ ...draft, crewId: value ? Number(value) : null })} options={[{ value: "", label: "Не закріплювати за екіпажем" }, ...crews.map((crew) => ({ value: String(crew.id), label: crew.name }))]} /></label>}<label className="form-field"><span>Відповідальна особа</span><Select ariaLabel="Відповідальна особа" value={draft.personnelId ? String(draft.personnelId) : ""} onChange={(value) => setDraft({ ...draft, personnelId: value ? Number(value) : null })} options={[{ value: "", label: assignmentCrew ? "Автоматично — командир екіпажу" : "Не закріплювати за людиною" }, ...people.map((person) => ({ value: String(person.id), label: person.fullName }))]} /></label></div></section>
      {selectedCatalog && selectedCatalog.fields.length > 0 && <section><header><b>Додаткові поля каталогу «{selectedCatalog.name}»</b><span>Ці поля видно в картці майна і вони доступні як змінні для рапортів.</span></header><div className="service-form-grid">{selectedCatalog.fields.map((field) => <label className="form-field" key={field.fieldKey}><span>{field.displayName}</span><input type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"} value={draft.customValues[field.fieldKey] ?? field.initialValue} onChange={(event) => setDraft({ ...draft, customValues: { ...draft.customValues, [field.fieldKey]: event.target.value } })} /></label>)}</div></section>}
      <section><header><b>Примітка</b></header><label className="form-field"><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Необов’язкове уточнення" /></label></section>
    </div><footer className="modal-actions"><button className="button" onClick={() => setEditing(null)}>Скасувати</button><button className="button primary" onClick={() => void save()}>{editing === "new" ? <Plus /> : <Edit3 />}{editing === "new" ? "Додати" : "Зберегти"}</button></footer></Modal>}

    {catalogEditor && <Modal title={catalogEditor === "new" ? "Новий каталог" : `Каталог · ${catalogEditor.name}`} subtitle="Каталог групує майно та може мати власні додаткові поля" onClose={() => setCatalogEditor(null)} className="asset-catalog-editor"><div className="asset-catalog-editor__body"><label className="form-field"><span>Назва каталогу <b>*</b></span><input autoFocus disabled={catalogEditor !== "new" && catalogEditor.isSystem} value={catalogDraft.name} onChange={(event) => setCatalogDraft({ ...catalogDraft, name: event.target.value })} placeholder="Наприклад, Ноутбуки" /></label><section><header><div><b>Додаткові поля</b><span>Ключ автоматично створюється латиницею; за потреби його можна виправити до першого використання.</span></div><button className="button" onClick={() => setCatalogDraft({ ...catalogDraft, fields: [...catalogDraft.fields, { fieldKey: "", displayName: "", fieldType: "text", initialValue: "", sortOrder: catalogDraft.fields.length }] })}><Plus />Додати поле</button></header>{catalogDraft.fields.length === 0 && <div className="catalog-fields-empty"><PackageOpen /><span>Додаткових полів немає. Основні поля служби залишаться доступними.</span></div>}<div className="catalog-fields-list">{catalogDraft.fields.map((field, index) => <article key={index}><label className="form-field"><span>Українська назва</span><input value={field.displayName} onChange={(event) => { const displayName = event.target.value; const fields = [...catalogDraft.fields]; fields[index] = { ...field, displayName, fieldKey: field.fieldKey || fieldKeyFromName(displayName) }; setCatalogDraft({ ...catalogDraft, fields }); }} placeholder="Наприклад, Процесор" /></label><label className="form-field"><span>Ключ поля</span><input value={field.fieldKey} onChange={(event) => { const fields = [...catalogDraft.fields]; fields[index] = { ...field, fieldKey: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }; setCatalogDraft({ ...catalogDraft, fields }); }} placeholder="processor" /></label><label className="form-field"><span>Тип</span><Select ariaLabel={`Тип поля ${index + 1}`} value={field.fieldType} onChange={(fieldType) => { const fields = [...catalogDraft.fields]; fields[index] = { ...field, fieldType }; setCatalogDraft({ ...catalogDraft, fields }); }} options={[{ value: "text", label: "Текст" }, { value: "number", label: "Число" }, { value: "date", label: "Дата" }]} /></label><button className="icon-button danger" aria-label={`Видалити поле ${index + 1}`} onClick={() => setCatalogDraft({ ...catalogDraft, fields: catalogDraft.fields.filter((_, fieldIndex) => fieldIndex !== index) })}><Trash2 /></button></article>)}</div></section></div><footer className="modal-actions">{catalogEditor !== "new" && !catalogEditor.isSystem && <button className="button danger asset-catalog-editor__delete" onClick={async () => { try { await operationsService.deleteAssetCatalog(catalogEditor.id); setCatalogEditor(null); setActiveCatalogId("all"); await reload(); notify("Каталог видалено; майно залишилося без каталогу.", "success"); } catch (error) { notify(typeof error === "string" ? error : "Не вдалося видалити каталог.", "error"); } }}><Trash2 />Видалити каталог</button>}<button className="button" onClick={() => setCatalogEditor(null)}>Скасувати</button><button className="button primary" onClick={() => void saveCatalog()}><Edit3 />Зберегти каталог</button></footer></Modal>}

    {historyOpen && <Modal title="Історія руху майна" subtitle={selected ? selected.name : `${service.title} · усі записи`} onClose={() => setHistoryOpen(false)} className="asset-history-modal"><div className="asset-history-list">{history.map((event) => <article key={event.id}><div className="asset-history-list__icon"><Activity /></div><div><header><b>{historyLabels[event.eventType] ?? event.eventType}</b><time>{new Date(`${event.occurredAt.replace(" ", "T")}Z`).toLocaleString("uk-UA")}</time></header><strong>{event.assetName}</strong>{(event.fromHolder || event.toHolder) && <p>{event.fromHolder || "—"} → {event.toHolder || "—"}</p>}<small>{event.details || "Без уточнення"}{event.quantityDelta ? ` · ${event.quantityDelta > 0 ? "+" : ""}${event.quantityDelta} · стало ${event.quantityAfter}` : ""}</small></div></article>)}{history.length === 0 && <div className="personnel-state"><History /><b>Історія поки порожня</b></div>}</div><footer className="modal-actions"><button className="button primary" onClick={() => setHistoryOpen(false)}>Готово</button></footer></Modal>}
    {receiptTarget && <Modal title={`Надходження · ${receiptTarget.name}`} subtitle={`Поточний залишок: ${receiptTarget.quantity} ${receiptTarget.accountingUnit}`} onClose={() => setReceiptTarget(null)} className="asset-receipt-modal"><div className="operation-editor__body"><label className="form-field"><span>Додати кількість <b>*</b></span><input type="number" min="0.001" step="any" value={receiptQuantity} onChange={(event) => setReceiptQuantity(Math.max(0, Number(event.target.value) || 0))} /></label><label className="form-field"><span>Підстава / примітка</span><textarea value={receiptDetails} onChange={(event) => setReceiptDetails(event.target.value)} placeholder="Наприклад, накладна або дата отримання" /></label></div><footer className="modal-actions"><button className="button" onClick={() => setReceiptTarget(null)}>Скасувати</button><button className="button primary" onClick={() => void receive()}><Plus />Оприбуткувати</button></footer></Modal>}
    {deleteTarget && <ConfirmDialog title="Видалити запис майна?" message={`«${deleteTarget.name}» буде видалено. Подія залишиться в історії руху.`} confirmLabel="Видалити" onConfirm={() => void remove()} onCancel={() => setDeleteTarget(null)} />}
  </PageFrame>;
}
