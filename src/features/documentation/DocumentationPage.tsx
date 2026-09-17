import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Database, FileInput, Search, Signature } from "lucide-react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { crewFields, customFieldId, equipmentFields, generationParameterFields, modifierRegistry, personFields, positionFields, signerFields, tokenFor, vehicleFields, type VariableDefinition } from "../../shared/template-language/registry";
import { morphologyService, type UkrainianCase } from "../../shared/services/morphologyService";
import { personnelService } from "../../shared/services/personnelService";
import type { CustomFieldDefinition, SignerRole } from "../../shared/types/domain";
import { settingsService } from "../settings/services/settingsService";

const textModifiers = new Set(["великими", "маленькими", "з_великої"]);
const styleModifiers = new Set(["жирним", "підкреслити"]);
const isSimpleEdition = import.meta.env.VITE_APP_EDITION === "simple";
const fallbackSignerObjects = [
  ["основний_підписант", "Основний підписант"], ["командир", "Командир"], ["начальник_штабу", "Начальник штабу"],
  ["заступник_ппп", "Заступник командира з ППП"], ["заступник_озброєння", "Заступник командира з озброєння"],
  ["заступник_тилу", "Заступник командира з тилу"], ["начальник_пмм", "Начальник ПММ"],
] as const;

type PickerSource = "all" | "accounting" | "manual" | "signers";
type PickerMode = "copy" | "apply";
type PickerVariable = VariableDefinition & {
  source: Exclude<PickerSource, "all">;
  subjectId: string;
  subjectLabel: string;
  numberedPrefix?: string;
  parameterNumberable?: boolean;
};

const sourceOptions: Array<{ id: PickerSource; label: string; hint: string; icon: typeof Database }> = [
  { id: "all", label: "Усі поля", hint: "Пошук у всіх джерелах", icon: Search },
  { id: "accounting", label: "З обліку", hint: "Особовий склад, техніка та підрозділ", icon: Database },
  { id: "manual", label: "Запитати під час створення", hint: "Значення, яке введе користувач", icon: FileInput },
  { id: "signers", label: "Підписанти", hint: "Дані з параметрів програми", icon: Signature },
];

const fromField = (
  field: { id: string; name: string; description?: string; example: string; kind: string; cases: boolean },
  options: Omit<PickerVariable, keyof VariableDefinition | "id"> & { id: string },
): PickerVariable => ({
  ...options,
  name: field.name,
  category: options.subjectLabel,
  description: field.description ?? `${field.name} із розділу «${options.subjectLabel}».`,
  example: field.example,
  kind: field.kind as VariableDefinition["kind"],
  supportsCases: field.cases,
});

const customVariable = (item: CustomFieldDefinition, subjectId: "person" | "vehicle" | "personVehicle"): PickerVariable => {
  const personVehicle = subjectId === "personVehicle";
  const vehicle = subjectId === "vehicle";
  return {
    id: personVehicle ? `військовий_1_автомобіль_1_${customFieldId(item.fieldKey)}` : vehicle ? `автомобіль_1_${customFieldId(item.fieldKey)}` : `військовий_1_${customFieldId(item.fieldKey)}`,
    name: item.displayName,
    category: personVehicle ? "Автомобіль військовослужбовця" : vehicle ? "Автомобіль" : "Військовослужбовець",
    description: item.description || "Додаткове поле з бази даних.",
    example: item.initialValue || "Приклад значення",
    kind: "text",
    supportsCases: false,
    source: "accounting",
    subjectId,
    subjectLabel: personVehicle ? "Автомобіль людини" : vehicle ? "Автомобіль" : "Військовослужбовець",
    numberedPrefix: personVehicle ? "військовий" : vehicle ? "автомобіль" : "військовий",
  };
};

function Preview({ variable, modifiers }: { variable: VariableDefinition; modifiers: string[] }) {
  const [result, setResult] = useState(variable.example);
  useEffect(() => {
    let active = true;
    void (async () => {
      let value = variable.example;
      const grammaticalCase = modifiers.find((item) => !textModifiers.has(item) && !styleModifiers.has(item)) as UkrainianCase | undefined;
      if (grammaticalCase && variable.kind === "person-name") {
        const [surname, givenName, patronymic] = value.split(/\s+/);
        value = (await morphologyService.declineName({ surname, givenName, patronymic, gender: "чоловіча" }, grammaticalCase)).value;
      } else if (grammaticalCase && variable.kind === "rank") value = morphologyService.declineRank(value, grammaticalCase);
      else if (grammaticalCase && variable.kind === "position") value = morphologyService.declinePosition(value, grammaticalCase);
      for (const modifier of modifiers.filter((item) => textModifiers.has(item))) value = morphologyService.transformText(value, modifier as "великими" | "маленькими" | "з_великої");
      if (active) setResult(value);
    })();
    return () => { active = false; };
  }, [variable, modifiers]);
  const className = `${modifiers.includes("жирним") ? "preview-bold " : ""}${modifiers.includes("підкреслити") ? "preview-underline" : ""}`;
  return <div className="autofill-preview-value"><small>У документі це виглядатиме приблизно так</small><b className={className}>{result || "Значення, введене користувачем"}</b></div>;
}

export type AutoFillFieldPickerProps = {
  embedded?: boolean;
  mode?: PickerMode;
  onApply?: (token: string) => void;
};

/** Human-language picker used while editing a template. Technical tokens stay secondary. */
export function AutoFillFieldPicker({ embedded = false, mode = "copy", onApply }: AutoFillFieldPickerProps) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<PickerSource>("all");
  const [subjectId, setSubjectId] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [itemNumber, setItemNumber] = useState(1);
  const [parameterNumber, setParameterNumber] = useState("");
  const [modifiers, setModifiers] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [vehicleCustomFields, setVehicleCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [availableSignerRoles, setAvailableSignerRoles] = useState<SignerRole[]>([]);
  const { notify } = useNotifications();

  useEffect(() => {
    void personnelService.listCustomFields().then(setCustomFields).catch(() => undefined);
    if (!isSimpleEdition) void personnelService.listVehicleCustomFields?.().then(setVehicleCustomFields).catch(() => undefined);
    void settingsService.get().then((settings) => setAvailableSignerRoles(settings.signerRoles ?? [])).catch(() => undefined);
  }, []);

  const signerObjects = useMemo(() => availableSignerRoles.length
    ? availableSignerRoles.map((role) => [role.id, role.name] as const)
    : fallbackSignerObjects, [availableSignerRoles]);

  const variables = useMemo<PickerVariable[]>(() => {
    const accounting: PickerVariable[] = [
      ...personFields.map((field) => fromField(field, { id: `військовий_1_${field.id}`, source: "accounting", subjectId: "person", subjectLabel: "Військовослужбовець", numberedPrefix: "військовий" })),
      ...customFields.map((field) => customVariable(field, "person")),
    ];
    if (!isSimpleEdition) accounting.push(
      ...vehicleFields.map((field) => fromField(field, { id: `військовий_1_автомобіль_1_${field.id}`, source: "accounting", subjectId: "personVehicle", subjectLabel: "Автомобіль людини", numberedPrefix: "військовий" })),
      ...vehicleCustomFields.map((field) => customVariable(field, "personVehicle")),
      ...vehicleFields.map((field) => fromField(field, { id: `автомобіль_1_${field.id}`, source: "accounting", subjectId: "vehicle", subjectLabel: "Автомобіль", numberedPrefix: "автомобіль" })),
      ...vehicleCustomFields.map((field) => customVariable(field, "vehicle")),
      ...crewFields.map((field) => fromField(field, { id: `екіпаж_1_${field.id}`, source: "accounting", subjectId: "crew", subjectLabel: "Екіпаж", numberedPrefix: "екіпаж" })),
      ...positionFields.map((field) => fromField(field, { id: `позиція_1_${field.id}`, source: "accounting", subjectId: "position", subjectLabel: "Позиція", numberedPrefix: "позиція" })),
      ...(["generator", "uav", "communications", "weapon_ammo"] as const).flatMap((id) => {
        const prefix = id === "generator" ? "генератор" : id === "uav" ? "бпла" : id === "communications" ? "звʼязок" : "зброя_та_бк";
        const label = id === "generator" ? "Генератор" : id === "uav" ? "БпЛА" : id === "communications" ? "Зв’язок" : "Зброя та БК";
        return equipmentFields.map((field) => fromField(field, { id: `${prefix}_1_${field.id}`, source: "accounting", subjectId: id, subjectLabel: label, numberedPrefix: prefix }));
      }),
    );
    const manual = generationParameterFields.map((field) => fromField(field, { id: field.id, source: "manual", subjectId: "document", subjectLabel: "Заповнюється перед генерацією", parameterNumberable: true }));
    const signers = signerObjects.flatMap(([id, label]) => signerFields.map((field) => fromField(field, { id: `${id}_${field.id}`, source: "signers", subjectId: id, subjectLabel: label })));
    return [...accounting, ...manual, ...signers];
  }, [customFields, vehicleCustomFields, signerObjects]);

  const subjectOptions = useMemo(() => {
    const visible = source === "all" ? variables : variables.filter((item) => item.source === source);
    return [...new Map(visible.map((item) => [item.subjectId, item.subjectLabel])).entries()];
  }, [source, variables]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("uk-UA");
    return variables.filter((item) => (source === "all" || item.source === source)
      && (subjectId === "all" || item.subjectId === subjectId)
      && (!needle || `${item.name} ${item.description} ${item.subjectLabel}`.toLocaleLowerCase("uk-UA").includes(needle)));
  }, [query, source, subjectId, variables]);
  const selected = variables.find((item) => item.id === selectedId);
  const variableId = !selected ? "" : selected.numberedPrefix
    ? selected.id.replace(`${selected.numberedPrefix}_1_`, `${selected.numberedPrefix}_${Math.max(1, itemNumber)}_`)
    : selected.parameterNumberable && Number(parameterNumber) > 0 ? `${selected.id}_${Math.floor(Number(parameterNumber))}` : selected.id;
  const token = selected ? tokenFor(variableId, modifiers) : "";

  const chooseSource = (next: PickerSource) => { setSource(next); setSubjectId("all"); };
  const chooseVariable = (id: string) => { setSelectedId(id); setModifiers([]); };
  const toggleModifier = (id: string) => setModifiers((current) => {
    const group = modifierRegistry.find((item) => item.id === id)?.group;
    if (current.includes(id)) return current.filter((item) => item !== id);
    if (group === "case" || group === "text") return [...current.filter((item) => modifierRegistry.find((candidate) => candidate.id === item)?.group !== group), id];
    return [...current, id];
  });
  const finish = async () => {
    if (!token) return;
    if (mode === "apply" && onApply) { onApply(token); return; }
    try {
      await navigator.clipboard.writeText(token);
      notify("Поле автозаповнення скопійовано.", "success");
    } catch { notify("Не вдалося скопіювати поле.", "error"); }
  };

  const content = <section className="autofill-picker">
    <main className="panel autofill-picker__catalog">
      <header className="autofill-picker__intro"><div><h2>Які дані мають бути тут?</h2><p>Знайдіть поле за звичною назвою. Технічний код програма складе сама.</p></div><span>{filtered.length} полів</span></header>
      <SearchInput placeholder="Наприклад: ПІБ, звання, дата рапорту…" value={query} onChange={setQuery} />
      <div className="autofill-sources" role="tablist" aria-label="Джерело даних">{sourceOptions.map(({ id, label, hint, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={source === id} className={source === id ? "active" : ""} onClick={() => chooseSource(id)}><Icon /><span><b>{label}</b><small>{hint}</small></span></button>)}</div>
      {subjectOptions.length > 1 && <div className="autofill-subjects" aria-label="Тип даних"><button type="button" className={subjectId === "all" ? "active" : ""} onClick={() => setSubjectId("all")}>Усе</button>{subjectOptions.map(([id, label]) => <button type="button" key={id} className={subjectId === id ? "active" : ""} onClick={() => setSubjectId(id)}>{label}</button>)}</div>}
      <div className="autofill-fields">{filtered.map((item) => <button type="button" key={item.id} aria-label={`${item.name}, ${item.subjectLabel}`} className={selectedId === item.id ? "autofill-field active" : "autofill-field"} onClick={() => chooseVariable(item.id)}><span><small>{item.subjectLabel}</small><b>{item.name}</b></span><p>{item.description}</p><ChevronRight /></button>)}{filtered.length === 0 && <div className="autofill-empty"><Search /><b>Нічого не знайдено</b><span>Спробуйте коротшу назву або оберіть інше джерело.</span></div>}</div>
    </main>
    <aside className="panel autofill-picker__settings">{selected ? <>
      <header><small>{selected.subjectLabel}</small><h3>{selected.name}</h3><p>{selected.description}</p></header>
      {selected.numberedPrefix && <label className="autofill-order">Кого або що підставити?<small>Номер відповідає порядку вибору під час генерації.</small><span><button type="button" onClick={() => setItemNumber(Math.max(1, itemNumber - 1))}>−</button><input aria-label="Номер вибраного об’єкта" type="number" min="1" value={itemNumber} onChange={(event) => setItemNumber(Math.max(1, Number(event.target.value) || 1))} /><button type="button" onClick={() => setItemNumber(itemNumber + 1)}>+</button></span></label>}
      {selected.parameterNumberable && <label className="autofill-parameter-number">Окремий номер значення <small>Залиште порожнім, якщо це поле в документі лише одне.</small><input aria-label="Номер значення параметра" type="number" min="1" value={parameterNumber} onChange={(event) => setParameterNumber(event.target.value)} placeholder="Необов’язково" /></label>}
      <section className="autofill-modifiers"><h4>Як написати значення</h4>{(["case", "text", "style"] as const).map((group) => {
        const choices = modifierRegistry.filter((item) => item.group === group);
        return <div key={group}><small>{group === "case" ? "Відмінок" : group === "text" ? "Регістр" : "Оформлення у Word"}</small><div>{choices.map((item) => { const unavailable = (group === "case" && !selected.supportsCases) || (group === "text" && selected.kind === "number"); return <label key={item.id} className={unavailable ? "disabled" : ""}><input type={group === "style" ? "checkbox" : "radio"} name={`autofill-${group}`} disabled={unavailable} checked={modifiers.includes(item.id)} onChange={() => toggleModifier(item.id)} />{item.name}</label>; })}</div></div>;
      })}</section>
      <Preview variable={selected} modifiers={modifiers} />
      <details className="autofill-advanced"><summary>Додатково: технічний код</summary><p>Потрібен лише для ручного редагування документа.</p><code>{token}</code></details>
      <button type="button" className="button primary autofill-apply" data-modal-enter-action onClick={() => void finish()}>{mode === "apply" ? <Check /> : <Copy />}{mode === "apply" ? "Замінити виділений текст" : "Скопіювати поле"}</button>
    </> : <div className="autofill-settings-empty"><Search /><h3>Оберіть потрібне поле</h3><p>Спочатку знайдіть дані ліворуч. Тут з’являться номер, форма написання та приклад.</p></div>}</aside>
  </section>;
  return embedded ? content : <PageFrame className="documentation-page">{content}</PageFrame>;
}

/** @deprecated Kept as a source-compatible wrapper for integrations and tests. */
export const VariableConstructorPage = AutoFillFieldPicker;
