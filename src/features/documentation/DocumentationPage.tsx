import { useEffect, useMemo, useState } from "react";
import { BookOpen, Copy } from "lucide-react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { modifierRegistry, tokenFor, variableRegistry, vehicleFields, type VariableDefinition } from "../../shared/template-language/registry";
import { morphologyService, type UkrainianCase } from "../../shared/services/morphologyService";
import { personnelService } from "../../shared/services/personnelService";
import type { CustomFieldDefinition } from "../../shared/types/domain";

const textModifiers = new Set(["великими", "маленькими", "з_великої"]);
const styleModifiers = new Set(["жирним", "підкреслити"]);
const signerObjects = [
  ["основний_підписант", "Основний підписант"], ["командир", "Командир"], ["начальник_штабу", "Начальник штабу"],
  ["заступник_ппп", "Заступник командира з ППП"], ["заступник_озброєння", "Заступник командира з озброєння"],
  ["заступник_тилу", "Заступник командира з тилу"], ["начальник_пмм", "Начальник ПММ"]
] as const;
const objects = [{ id: "person", label: "Військовослужбовець" }, { id: "vehicle", label: "Автомобіль" }, ...signerObjects.map(([id, label]) => ({ id, label })), { id: "date", label: "Дата рапорту" }];

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
  return <><b className={className}>{result}</b><p className="constructor-sentence">Речення-приклад: «Прошу врахувати: <span className={className}>{result}</span>.»</p></>;
}

const toPersonnelValue = (item: CustomFieldDefinition): VariableDefinition => ({
  id: `військовий_1_${templateFieldId(item.displayName)}`, name: item.displayName, category: "Військовослужбовець", description: item.description, example: item.initialValue, kind: "text", supportsCases: false
});
const toVehicleValue = (item: CustomFieldDefinition): VariableDefinition => ({
  id: `автомобіль_${templateFieldId(item.displayName)}`, name: item.displayName, category: "Автомобіль", description: item.description, example: item.initialValue, kind: "text", supportsCases: false
});
const toPersonnelVehicleValue = (item: CustomFieldDefinition): VariableDefinition => ({
  id: `військовий_1_автомобіль_1_${templateFieldId(item.displayName)}`, name: item.displayName, category: "Автомобіль військовослужбовця", description: item.description, example: item.initialValue, kind: "text", supportsCases: false
});
const templateFieldId = (name: string) => name.toLocaleLowerCase("uk")
  .replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");

export function VariableConstructorPage() {
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"constructor" | "all">("constructor");
  const [objectId, setObjectId] = useState("person");
  const [fieldId, setFieldId] = useState("військовий_1_піб");
  const [personNumber, setPersonNumber] = useState("1");
  const [modifiers, setModifiers] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [vehicleCustomFields, setVehicleCustomFields] = useState<CustomFieldDefinition[]>([]);
  const { notify } = useNotifications();

  useEffect(() => {
    void personnelService.listCustomFields().then(setCustomFields).catch(() => undefined);
    void personnelService.listVehicleCustomFields?.().then(setVehicleCustomFields).catch(() => undefined);
  }, []);

  const isPerson = objectId === "person";
  const categoryItems = useMemo(() => {
    const matches = (item: VariableDefinition) => `${item.name} ${item.description} ${item.id}`.toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"));
    const personnelValueFields = customFields.map(toPersonnelValue);
    const vehicleValueFields = vehicleCustomFields.map(toVehicleValue);
    if (viewMode === "all") return [...variableRegistry, ...personnelValueFields, ...vehicleValueFields].filter(matches);
    if (isPerson) return [...variableRegistry.filter((item) => item.id.startsWith("військовий_1_")), ...personnelValueFields, ...vehicleCustomFields.map(toPersonnelVehicleValue)].filter(matches);
    if (objectId === "vehicle") return [...vehicleFields.map((item) => ({ id: `автомобіль_${item.id}`, name: item.name, category: "Автомобіль", description: item.description ?? item.name, example: item.example, kind: item.kind as VariableDefinition["kind"], supportsCases: item.cases })), ...vehicleValueFields].filter(matches);
    if (objectId === "date") return variableRegistry.filter((item) => item.category === "Дати та службові дані" && matches(item));
    return variableRegistry.filter((item) => item.id.startsWith(`${objectId}_`) && matches(item));
  }, [viewMode, isPerson, objectId, query, customFields, vehicleCustomFields]);

  const field = categoryItems.find((item) => item.id === fieldId) ?? categoryItems[0] ?? variableRegistry[0];
  const variableId = viewMode === "all" ? field.id : isPerson ? field.id.replace(/^військовий_1_/, `військовий_${Math.max(1, Number(personNumber) || 1)}_`) : field.id;
  const token = tokenFor(variableId, modifiers);
  const selectObject = (id: string) => { setObjectId(id); setFieldId(id === "person" ? "військовий_1_піб" : id === "vehicle" ? "автомобіль_назва" : id === "date" ? "дата_рапорту" : `${id}_піб`); setStep(1); setModifiers([]); };
  const selectField = (id: string) => { setFieldId(id); setStep(2); };
  const toggleModifier = (id: string) => setModifiers((current) => {
    const group = modifierRegistry.find((item) => item.id === id)?.group;
    if (current.includes(id)) return current.filter((item) => item !== id);
    if (group === "case" || group === "text") return [...current.filter((item) => modifierRegistry.find((candidate) => candidate.id === item)?.group !== group), id];
    return [...current, id];
  });

  return <PageFrame className="documentation-page">
    <section className="documentation-layout">
      <main className="panel documentation">
        <header className="documentation__intro"><BookOpen /><div><h1>Конструктор змінних</h1><h2>Покрокове складання</h2><p>Оберіть частину змінної, а потім поверніться до будь-якого кроку, щоб змінити її.</p></div></header>
        <div className="constructor-view-switch"><button className={viewMode === "constructor" ? "active" : ""} onClick={() => { setViewMode("constructor"); setStep(0); }}>Конструктор змінних</button><button className={viewMode === "all" ? "active" : ""} onClick={() => { setViewMode("all"); setStep(1); }}>Всі змінні</button></div>
        {viewMode === "constructor" && <div className="constructor-steps">{["Об’єкт", "Поле", "Модифікатори"].map((label, index) => <button className={step === index ? "active" : ""} key={label} onClick={() => setStep(index)}>{index + 1}. {label}</button>)}</div>}
        {step === 0 && viewMode === "constructor" && <div className="constructor-object-grid">{objects.map((item) => <button key={item.id} onClick={() => selectObject(item.id)}><b>{item.label}</b><span>Поля та доступні форми</span></button>)}</div>}
        {(step === 1 || viewMode === "all") && <section className="constructor-fields"><SearchInput placeholder="Пошук поля або змінної…" value={query} onChange={setQuery} /><div className="variable-grid">{categoryItems.map((item) => <button className={field.id === item.id ? "variable-token variable-token--selected" : "variable-token"} key={item.id} onClick={() => selectField(item.id)}><code>{`{{${item.id}}}`}</code><b>{item.name}</b><span>{item.description}</span></button>)}</div>{isPerson && viewMode === "constructor" && <label className="field">Номер військовослужбовця<input type="number" min="1" value={personNumber} onChange={(event) => setPersonNumber(event.target.value)} /></label>}</section>}
        {step === 2 && viewMode === "constructor" && <section className="constructor-modifiers"><h3>Модифікатори можна комбінувати</h3><div className="modifier-groups">{[["Відмінок", "case"], ["Регістр", "text"], ["Форматування DOCX", "style"]].map(([title, group]) => <section key={group}><h4>{title}</h4><div className="modifier-grid">{modifierRegistry.filter((item) => item.group === group).map((item) => <label key={item.id}><input type={group === "case" || group === "text" ? "radio" : "checkbox"} name={group === "case" ? "grammatical-case" : group === "text" ? "text-case" : undefined} checked={modifiers.includes(item.id)} onChange={() => toggleModifier(item.id)} />{item.name}</label>)}</div></section>)}</div><p>Відмінок і регістр можна вибрати лише по одному. Форматування DOCX комбінується окремо.</p></section>}
      </main>
      <aside className="panel variable-preview"><header className="variable-preview__header">Поточна змінна</header><h2>{field.name}</h2><p>{field.description}</p><div className="word-example"><span>Токен для Word</span><code>{token}</code></div><div className="variable-result"><span>Перекладене значення</span><Preview variable={field} modifiers={modifiers} /></div><button className="button primary" onClick={() => void navigator.clipboard.writeText(token).then(() => notify("Змінну скопійовано.", "success"))}><Copy />Скопіювати змінну</button></aside>
    </section>
  </PageFrame>;
}
