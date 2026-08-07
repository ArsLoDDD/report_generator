import { useEffect, useMemo, useState } from "react";
import { BookOpen, Copy, Search } from "lucide-react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import { Select } from "../../shared/ui/Select";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { modifierRegistry, tokenFor, variableRegistry, type VariableDefinition } from "../../shared/template-language/registry";
import { morphologyService, type UkrainianCase } from "../../shared/services/morphologyService";

const categories = ["Усі", ...new Set(variableRegistry.map((item) => item.category))];
const textModifiers = new Set(["великими", "маленькими", "з_великої"]);

function Preview({ variable, modifiers }: { variable: VariableDefinition; modifiers: string[] }) {
  const [result, setResult] = useState(variable.example);
  useEffect(() => { let active = true; void (async () => {
    const grammaticalCase = modifiers.find((item) => !textModifiers.has(item)) as UkrainianCase | undefined;
    let value = variable.example;
    if (grammaticalCase && variable.kind === "person-name") { const [surname, givenName, patronymic] = value.split(/\s+/); value = (await morphologyService.declineName({ surname, givenName, patronymic, gender: "чоловіча" }, grammaticalCase)).value; }
    else if (grammaticalCase && variable.kind === "rank") value = morphologyService.declineRank(value, grammaticalCase);
    else if (grammaticalCase && variable.kind === "position") value = morphologyService.declinePosition(value, grammaticalCase);
    for (const modifier of modifiers.filter((item) => textModifiers.has(item))) value = morphologyService.transformText(value, modifier as "великими" | "маленькими" | "з_великої");
    if (active) setResult(value);
  })(); return () => { active = false; }; }, [variable, modifiers]);
  return <b>{result}</b>;
}

export function DocumentationPage() {
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("Усі"); const [selected, setSelected] = useState(variableRegistry[0]);
  const [personNumber, setPersonNumber] = useState("1"); const [declension, setDeclension] = useState(""); const [textTransform, setTextTransform] = useState(""); const { notify } = useNotifications();
  const isPerson = selected.id.startsWith("військовий_"); const variableId = isPerson ? selected.id.replace(/^військовий_\d+_/, `військовий_${Math.max(1, Number(personNumber) || 1)}_`) : selected.id;
  const modifiers = useMemo(() => [declension, textTransform].filter(Boolean), [declension, textTransform]); const token = tokenFor(variableId, modifiers);
  const found = useMemo(() => variableRegistry.filter((item) => (category === "Усі" || item.category === category) && `${item.name} ${item.category} ${item.description} ${item.id}`.toLocaleLowerCase("uk").includes(query.toLocaleLowerCase("uk"))), [category, query]);
  const choose = (item: VariableDefinition) => { setSelected(item); setDeclension(""); setTextTransform(""); };
  const copy = async () => { try { await navigator.clipboard.writeText(token); notify("Змінну скопійовано.", "success"); } catch { notify("Не вдалося скопіювати змінну.", "error"); } };
  return <PageFrame className="documentation-page"><section className="documentation-layout">
    <main className="panel documentation"><header className="documentation__intro"><BookOpen /><div><h1>Довідник</h1><h2>Реєстр змінних</h2><p>Змінна — це напис у фігурних дужках, який програма замінить даними під час створення рапорту. Номер військовослужбовця починається з 1.</p></div></header>
      <div className="documentation-search"><SearchInput placeholder="Пошук змінної..." value={query} onChange={setQuery} /><Select ariaLabel="Категорія змінних" value={category} onChange={setCategory} options={categories.map((value) => ({ value, label: value }))} /></div><p className="documentation-count"><Search /> Знайдено: {found.length}</p>
      {categories.slice(1).map((group) => { const items = found.filter((item) => item.category === group); return items.length ? <section className="documentation-section" key={group}><h2>{group}</h2><div className="variable-grid">{items.map((item) => <button className={`variable-token ${selected.id === item.id ? "variable-token--selected" : ""}`} key={item.id} onClick={() => choose(item)}><code>{tokenFor(item.id)}</code><b>{item.name}</b><span>{item.description}</span></button>)}</div></section> : null; })}
    </main>
    <aside className="panel variable-preview"><header className="variable-preview__header">Конструктор змінної</header><h2>{selected.name}</h2><p>{selected.description}</p>
      {isPerson && <label className="field">Військовослужбовець<input type="number" min="1" value={personNumber} onChange={(event) => setPersonNumber(event.target.value)} /></label>}
      {selected.supportsCases && <Select ariaLabel="Відмінок" value={declension} onChange={setDeclension} options={[{ value: "", label: "Без відмінювання" }, ...modifierRegistry.filter((item) => item.group === "case").map((item) => ({ value: item.id, label: item.name }))]} />}
      {selected.kind !== "number" && <Select ariaLabel="Регістр" value={textTransform} onChange={setTextTransform} options={[{ value: "", label: "Без зміни регістру" }, ...modifierRegistry.filter((item) => item.group === "text").map((item) => ({ value: item.id, label: item.name }))]} />}
      <button className="button primary" onClick={() => void copy()}><Copy />Скопіювати змінну</button>
      <div className="word-example"><span>Вставте у Word-шаблон</span><code>{token}</code></div><div className="variable-result"><span>Приклад результату</span><Preview variable={selected} modifiers={modifiers} /></div>
      <p className="variable-help">Модифікатори виконуються зліва направо. Одночасно можна вибрати один відмінок і один спосіб написання.</p>
    </aside>
  </section></PageFrame>;
}
