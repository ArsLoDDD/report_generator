import { Children, Fragment, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Archive, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  CircleAlert, Copy, Database, Download, Eye, FileCheck2, FileText, Filter, Folder,
  FolderOpen, Home, Import, MoreVertical, Pencil, Plus, RefreshCw, Search, Settings,
  ShieldCheck, Trash2, Upload, UserPlus, Users, X
} from "lucide-react";
import { desktop } from "./lib/desktop";
import type { Person } from "./lib/models";

type Screen = "generator" | "templates" | "people" | "generated" | "settings";
type Template = { name: string; description: string; changed: string; status: "ready" | "warning" | "error"; variables: number };

const templates: Template[] = [
  { name: "Нагородний рапорт", description: "Рапорт на відзначення державними та відомчими нагородами", changed: "24.07.2026 · 12:45", status: "ready", variables: 18 },
  { name: "Рапорт на відпустку", description: "Рапорт на надання відпустки військовослужбовцю", changed: "22.07.2026 · 09:30", status: "ready", variables: 12 },
  { name: "Рапорт на відрядження", description: "Рапорт на відрядження у службових справах", changed: "20.07.2026 · 16:10", status: "warning", variables: 10 },
  { name: "Рапорт на матеріальну допомогу", description: "Рапорт на отримання матеріальної допомоги", changed: "18.07.2026 · 11:05", status: "ready", variables: 9 },
  { name: "Рапорт на зміну місця служби", description: "Рапорт на зміну місця проходження служби", changed: "16.07.2026 · 14:20", status: "error", variables: 8 },
  { name: "Рапорт на звільнення", description: "Рапорт на звільнення з військової служби", changed: "16.07.2026 · 13:10", status: "error", variables: 7 }
];

const samplePeople: Person[] = [
  { id: 1, fullName: "Іваненко Іван Іванович", rank: "Солдат", position: "Стрілець", unit: "1 взвод" },
  { id: 2, fullName: "Петренко Петро Петрович", rank: "Старший солдат", position: "Оператор БпЛА", unit: "1 взвод" },
  { id: 3, fullName: "Сидоренко Сидір Сидорович", rank: "Сержант", position: "Командир відділення", unit: "2 взвод" },
  { id: 4, fullName: "Коваленко Дмитро Сергійович", rank: "Молодший сержант", position: "Стрілець", unit: "2 взвод" },
  { id: 5, fullName: "Бондаренко Андрій Олексійович", rank: "Солдат", position: "Помічник оператора", unit: "1 взвод" },
  { id: 6, fullName: "Ткаченко Олексій Миколайович", rank: "Старший солдат", position: "Механік-водій", unit: "3 взвод" },
  { id: 7, fullName: "Шевченко Тарас Григорович", rank: "Сержант", position: "Командир відділення", unit: "2 взвод" },
  { id: 8, fullName: "Мельник Віталій Васильович", rank: "Солдат", position: "Стрілець", unit: "3 взвод" },
  { id: 9, fullName: "Гнатюк Роман Ігорович", rank: "Солдат", position: "Стрілець", unit: "1 взвод" },
  { id: 10, fullName: "Кравчук Олег Петрович", rank: "Молодший сержант", position: "Оператор БпЛА", unit: "2 взвод" }
];

const generated = [
  ["Рапорт на відпустку – Іваненко І.І.", "Рапорт на відпустку", "1", "27.07.2026 12:45"],
  ["Рапорт на матеріальну допомогу – 3 особи", "Рапорт на матеріальну допомогу", "3", "27.07.2026 11:20"],
  ["Рапорт на зміну місця служби – Шевченко Т.Г.", "Рапорт на зміну місця служби", "1", "27.07.2026 10:05"],
  ["Рапорт на відрядження – 2 особи", "Рапорт на відрядження", "2", "26.07.2026 18:30"],
  ["Рапорт на звільнення – Кравчук О.П.", "Рапорт на звільнення", "1", "26.07.2026 16:12"],
  ["Рапорт на відпустку – Петренко П.П.", "Рапорт на відпустку", "1", "26.07.2026 09:47"]
];

function Stat({ icon: Icon, label, value, tone = "" }: { icon: typeof Users; label: string; value: string | number; tone?: string }) {
  return <div className="stat"><Icon size={27} /><div><span>{label}</span><strong className={tone}>{value}</strong></div></div>;
}

function SearchBox({ placeholder }: { placeholder: string }) { return <label className="search"><Search size={18} /><input aria-label={placeholder} placeholder={placeholder} /></label>; }
function CheckBox({ checked, onChange }: { checked?: boolean; onChange?: () => void }) { return <button aria-label="Обрати" onClick={onChange} className={`check ${checked ? "checked" : ""}`}>{checked && <Check size={14} />}</button>; }

export default function App() {
  const [screen, setScreen] = useState<Screen>("generator");
  const [people, setPeople] = useState(samplePeople);
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedTemplateInfo, setSelectedTemplateInfo] = useState(templates[0]);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [settingsTab, setSettingsTab] = useState<"paths" | "signers">("paths");

  useEffect(() => { desktop.listPeople().then((saved) => saved.length && setPeople(saved)).catch(() => undefined); }, []);
  const chosen = useMemo(() => people.filter((person) => selectedPeople.includes(person.id)), [people, selectedPeople]);
  const togglePerson = (id: number) => setSelectedPeople((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const selectAll = () => setSelectedPeople(selectedPeople.length === people.length ? [] : people.map((person) => person.id));
  const chooseTemplate = (template: Template) => setSelectedTemplate(template);

  const nav = [
    ["generator", "Генерація рапортів", Home], ["templates", "Шаблони", FileText], ["people", "Особовий склад", Users],
    ["generated", "Згенеровані рапорти", Folder], ["settings", "Налаштування", Settings]
  ] as const;

  return <div className="product-shell">
    <aside className="sidebar">
      <div className="product-logo"><FileCheck2 /><div><b>Генератор рапортів</b><span>по шаблону</span></div></div>
      <nav>{nav.map(([id, label, Icon]) => <button key={id} onClick={() => setScreen(id)} className={screen === id ? "nav-active" : ""}><Icon size={23} />{label}</button>)}</nav>
      <div className="version">Версія 1.0.0</div>
    </aside>
    <main className="workspace">
      <div className="window-buttons"><span>−</span><span>□</span><span>×</span></div>
      {screen === "generator" && <ScreenFrame noHeader>{Generator({ template: selectedTemplate, people, selected: selectedPeople, onToggle: togglePerson, onAll: selectAll, onChoose: chooseTemplate })}</ScreenFrame>}
      {screen === "templates" && <ScreenFrame hasFooter>{Templates({ selected: selectedTemplateInfo, onSelect: setSelectedTemplateInfo })}</ScreenFrame>}
      {screen === "people" && <ScreenFrame hasFooter>{People({ people, detailsOpen, onDetails: () => setDetailsOpen(!detailsOpen) })}</ScreenFrame>}
      {screen === "generated" && <ScreenFrame hasFooter>{Generated()}</ScreenFrame>}
      {screen === "settings" && <ScreenFrame>{SettingsPage({ active: settingsTab, onChange: setSettingsTab })}</ScreenFrame>}
    </main>
  </div>;
}

function PageTitle({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) { return <header className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="header-actions">{children}</div></header>; }

function flattenScreenNodes(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((node) => isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment ? flattenScreenNodes(node.props.children) : [node]);
}

function ScreenFrame({ children, hasFooter = false, noHeader = false }: { children: ReactNode; hasFooter?: boolean; noHeader?: boolean }) {
  const nodes = flattenScreenNodes(children);
  const header = noHeader ? null : nodes.shift();
  const footer = hasFooter ? nodes.pop() : null;
  return <section className="screen-frame"><div className="screen-header">{header}</div><div className="screen-body">{nodes}</div>{footer && <div className="screen-footer">{footer}</div>}</section>;
}

function Generator({ template, people, selected, onToggle, onAll, onChoose }: { template: Template | null; people: Person[]; selected: number[]; onToggle: (id: number) => void; onAll: () => void; onChoose: (template: Template) => void }) {
  return <div className="generation-layout"><section className="panel template-picker"><div className="empty-template"><FileText size={75} /><h2>{template ? template.name : "Виберіть шаблон рапорту"}</h2><p>{template ? template.description : "Оберіть шаблон зі списку, щоб перейти до вибору військовослужбовців"}</p></div><div className="panel-caption"><b>Доступні шаблони</b><SearchBox placeholder="Пошук шаблонів…" /></div><div className="template-grid">{templates.map((item) => <button onClick={() => onChoose(item)} key={item.name} className={`template-card ${template?.name === item.name ? "template-selected" : ""}`}><FileText /><div><b>{item.name}</b><p>{item.description}</p><small>Оновлено: {item.changed} · DOCX</small></div>{template?.name === item.name && <CheckCircle2 className="green" />}</button>)}</div><button className="file-open"><Folder />Відкрити шаблон з файлу…<small>Підтримувані формати: .docx</small></button></section>
      <section className="selection-column"><div className="panel people-select"><h2>Вибір військовослужбовців <span className="info">i</span></h2><div className="tip">ⓘ Виберіть одного або кількох військовослужбовців.<br />Якщо обрано кількох — рапорт буде створено для кожного.</div><div className="table-tools"><SearchBox placeholder="Пошук за ПІБ, позивним, посадою…" /><button className="button"><Filter size={17} />Фільтри</button></div><table><thead><tr><th><CheckBox checked={selected.length === people.length} onChange={onAll} /></th><th>Звання</th><th>ПІБ</th><th>Посада</th><th>Підрозділ</th></tr></thead><tbody>{people.map((person) => <tr key={person.id}><td><CheckBox checked={selected.includes(person.id)} onChange={() => onToggle(person.id)} /></td><td>{person.rank}</td><td>{person.fullName}</td><td>{person.position}</td><td>{person.unit}</td></tr>)}</tbody></table><div className="selection-footer">Вибрано: <b className="green">{selected.length}</b><span /><button className="button muted">Очистити вибір</button><button className="button" onClick={onAll}>Вибрати всіх</button></div></div><button className="generate-button" disabled={!template || !selected.length}><FileCheck2 />Згенерувати рапорт</button><p className="generate-hint">{!template || !selected.length ? "Спочатку виберіть шаблон та військовослужбовців" : `Буде створено рапортів: ${selected.length}`}</p></section></div>;
}

function Templates({ selected, onSelect }: { selected: Template; onSelect: (template: Template) => void }) { const status = selected.status === "ready"; return <><PageTitle title="Шаблони" subtitle="Керування шаблонами рапортів та їх перевірка"><button className="button primary"><Plus />Створити шаблон <ChevronDown /></button><button className="button"><Import />Імпортувати</button></PageTitle><div className="templates-layout"><section className="panel template-list"><div className="table-tools"><SearchBox placeholder="Пошук шаблонів…" /><button className="button"><Filter />Фільтри</button></div><div className="list-sort"><button className="button">Всі шаблони <ChevronDown /></button><span>Сортування: <b>Назва (А-Я)</b></span></div>{templates.map((item) => <button key={item.name} onClick={() => onSelect(item)} className={`template-row ${selected.name === item.name ? "template-selected" : ""}`}><FileText /><div><b>{item.name}</b><span className={`status-pill ${item.status}`}>{item.status === "ready" ? "Готовий" : item.status === "warning" ? "Є попередження" : "Є помилки"}</span><p>{item.description}</p><small>Останнє редагування: {item.changed}</small></div><MoreVertical /></button>)}<div className="pagination">Показано 1–6 з 12 шаблонів <span>‹　<b>1</b>　2　›</span></div></section><section className="panel template-details"><h2>{selected.name}</h2><p>{selected.description}</p><div className="document-meta">▣ DOCX　 ·　 Розмір: 42.3 KB　 ·　 Останнє редагування: {selected.changed}</div><div className="actions-line"><button className="button success"><FolderOpen />Відкрити</button><button className="button success"><CheckCircle2 />Перевірити шаблон</button><button className="button"><Copy />Створити копію</button><button className="button danger"><Trash2 />Видалити</button></div><div className="validation"><h3>Результати перевірки</h3><div className={status ? "validation-good" : "validation-bad"}>{status ? <CheckCircle2 /> : <CircleAlert />}<div><b>{status ? "Помилок не виявлено" : "Потрібна увага"}</b><p>{status ? "Шаблон готовий до використання" : "Перевірте змінні шаблону"}</p></div><button className="button"><RefreshCw />Перевірити знову</button></div></div><div className="detail-cards"><article><h3>Використовувані змінні <span className="status-pill ready">{selected.variables} змінних</span></h3><b>⌄　Звичайні змінні (9)</b><div className="tag-list">{["date", "unit.name", "unit.commander", "unit.position", "document.number", "reason", "basis", "signature.name", "signature.position"].map((tag) => <span key={tag}>{tag}</span>)}</div><hr /><b>⌄　Колекція військовослужбовців: soldiers (9)</b><div className="tag-list green-tags">{["soldiers[index].ПІБ", "soldiers[index].Звання", "soldiers[index].Посада", "soldiers[index].Підрозділ", "soldiers[index].ДатаНародження"].map((tag) => <span key={tag}>{tag}</span>)}</div></article><article><h3>Деталі шаблону</h3><dl><dt>Тип файлу:</dt><dd>DOCX</dd><dt>Створено:</dt><dd>10.07.2026　10:15</dd><dt>Останнє редагування:</dt><dd>{selected.changed}</dd><dt>Автор:</dt><dd>Користувач</dd><dt>Кількість змін:</dt><dd>{selected.variables}</dd></dl><hr /><h3>Примітка</h3><p>Шаблон використовується для підготовки рапортів відповідно до даних військовослужбовців.</p></article></div></section></div><div className="statbar"><Stat icon={FileText} label="Усього шаблонів" value="12" /><Stat icon={CheckCircle2} label="Готові" value="8" tone="green" /><Stat icon={CircleAlert} label="З попередженнями" value="2" tone="yellow" /><Stat icon={X} label="З помилками" value="2" tone="red" /></div></>;
}

function People({ people, detailsOpen, onDetails }: { people: Person[]; detailsOpen: boolean; onDetails: () => void }) { return <><PageTitle title="Особовий склад" subtitle="Облік та керування даними військовослужбовців"><button className="button primary"><UserPlus />Додати військовослужбовця <ChevronDown /></button><button className="button"><Upload />Імпорт</button><button className="button"><Download />Експорт</button></PageTitle><div className="table-tools main-tools"><SearchBox placeholder="Пошук за ПІБ, позивним або табельним номером…" /><button className="button"><Filter />Додаткові фільтри <ChevronDown /></button></div><div className="filter-bar"><button>Усі <b>128</b></button><button>З незаповненими полями <b className="yellow">17</b></button><span>Підрозділ　 <button className="select">Усі <ChevronDown /></button></span><span>Посада　 <button className="select">Усі <ChevronDown /></button></span><span>Звання　 <button className="select">Усі <ChevronDown /></button></span><button className="reset" aria-label="Скинути фільтри" title="Скинути фільтри"><RefreshCw />Скинути фільтри</button></div><div className={`people-layout ${detailsOpen ? "with-details" : ""}`}><section className="panel data-table"><table><thead><tr><th><CheckBox /></th><th>ПІБ</th><th>Позивний</th><th>Звання</th><th>Посада</th><th>Підрозділ</th><th>Статус даних</th><th>Дії</th></tr></thead><tbody>{people.map((person, index) => { const incomplete = index === 3 || index === 5 || index === 9; return <tr className={incomplete ? "incomplete" : ""} key={person.id}><td><CheckBox /></td><td>{person.fullName}</td><td>{["Хижак", "Барс", "Скіф", "Фенікс", "Тихий", "Малюк", "Шева", "Джміль", "Рись", "Док"][index]}</td><td>{person.rank}</td><td>{person.position}</td><td>{person.unit}</td><td><span className={incomplete ? "status-incomplete" : "status-complete"}>{incomplete ? <CircleAlert /> : <CheckCircle2 />}{incomplete ? "Неповні дані" : "Повні дані"}</span></td><td><button className="icon-button" onClick={onDetails}><Pencil /></button><button className="icon-button danger"><Trash2 /></button></td></tr>; })}</tbody></table><div className="pagination">Показано 1–10 із 128 <span>‹　<b>1</b>　2　3　…　13　›　　<button className="button">10 / сторінка <ChevronDown /></button></span></div></section>{detailsOpen && <aside className="panel person-details"><button className="close" onClick={onDetails}><X /></button><h2>Деталі військовослужбовця</h2><div className="identity"><div className="avatar">ІІ</div><div><b>Іваненко Іван Іванович</b><p>Позивний: Хижак</p><span className="status-complete"><CheckCircle2 />Повні дані</span></div></div><div className="tabs"><button className="tab-active">Основні дані</button><button>Додаткові дані</button></div>{[["ПІБ *", "Іваненко Іван Іванович"], ["Позивний", "Хижак"], ["Звання", "Солдат"], ["Посада", "Стрілець"], ["Підрозділ", "1 взвод, Рота ударних безпілотних комплексів"], ["Дата народження", "14.05.1998"], ["Табельний номер", "A-123456"]].map(([label, value]) => <label className="field" key={label}>{label}<input value={value} readOnly /></label>)}<label className="field">Примітки<textarea placeholder="Додаткова інформація…" /></label><div className="detail-buttons"><button className="button">Скасувати</button><button className="button primary">Зберегти зміни</button></div></aside>}</div><div className="statbar"><Stat icon={Users} label="Усього військовослужбовців" value="128" /><Stat icon={CheckCircle2} label="Повні дані" value="111" tone="green" /><Stat icon={CircleAlert} label="Неповні дані" value="17" tone="yellow" /><Stat icon={CalendarDays} label="Оновлено сьогодні" value="5" /><Stat icon={Upload} label="Імпортовано записів" value="0" /><Stat icon={Download} label="Експортовано записів" value="12" /></div></>;
}

function Generated() { return <><PageTitle title="Згенеровані рапорти" subtitle="Список усіх згенерованих рапортів"><button className="button"><RefreshCw />Оновити</button><button className="button"><Download />Експорт списку</button><button className="button primary"><FolderOpen />Відкрити папку з рапортами</button></PageTitle><section className="panel generated-filters"><SearchBox placeholder="Пошук рапортів…" /><button className="button"><Filter />Фільтри <ChevronDown /></button><label>Період<input value="01.07.2026 – 27.07.2026" readOnly /></label><label>Шаблон<button className="select">Усі шаблони <ChevronDown /></button></label><label>Сортування<button className="select">Дата: нові спочатку <ChevronDown /></button></label><div className="quick-filter"><button>Усі <b>48</b></button><button>Сьогодні <b className="yellow">5</b></button><button>Вчора <b className="yellow">8</b></button><button>За тиждень <b className="yellow">27</b></button><button>За місяць <b>48</b></button></div></section><div className="generated-layout"><section className="panel data-table"><table><thead><tr><th><CheckBox /></th><th>Назва рапорту</th><th>Шаблон</th><th>Кількість осіб</th><th>Дата генерації ↓</th><th>Дії</th></tr></thead><tbody>{generated.map(([name, temp, count, date], index) => <tr className={index === 0 ? "selected-row" : ""} key={name}><td><CheckBox /></td><td><span className="word-icon">W</span>{name}</td><td>{temp}</td><td>{count}</td><td>{date}</td><td><button className="icon-button"><Eye /></button><button className="icon-button"><FolderOpen /></button><button className="icon-button"><MoreVertical /></button></td></tr>)}</tbody></table><div className="pagination">Показано 1–10 із 48 <span>‹　<b>1</b>　2　3　4　5　…　›　<button className="button">10 / сторінка <ChevronDown /></button></span></div></section><aside className="panel report-details"><button className="close"><X /></button><h2>Рапорт на відпустку – Іваненко І.І.</h2><p><span className="word-icon">W</span> DOCX　·　42.1 KB</p><small>Шлях:<br />C:\Reports\2026\07\27\Рапорт_відпустка_Іваненко_20260727_1245.docx</small><div className="actions-line"><button className="button primary"><Eye />Відкрити</button><button className="button"><FolderOpen />Відкрити папку</button></div><h3>Інформація</h3><dl><dt>Шаблон:</dt><dd>Рапорт на відпустку</dd><dt>Кількість осіб:</dt><dd>1</dd><dt>Дата генерації:</dt><dd>27.07.2026　12:45</dd><dt>Згенеровано користувачем:</dt><dd>Користувач</dd></dl><h3>Військовослужбовець (-ці)</h3><article className="selected-person">1.　<b>Іваненко Іван Іванович</b><small>Солдат, Стрілець, 1 взвод</small></article><h3>Дії з рапортом</h3><button className="button danger"><Trash2 />Видалити</button></aside></div><div className="statbar"><Stat icon={Archive} label="Усього рапортів" value="48" /><Stat icon={CalendarDays} label="Згенеровано сьогодні" value="5" /><Stat icon={CalendarDays} label="За тиждень" value="27" /><Stat icon={CalendarDays} label="За місяць" value="48" /><Stat icon={Database} label="Обсяг файлів" value="18.7 MB" /></div></>;
}

function SettingsPage({ active, onChange }: { active: "paths" | "signers"; onChange: (tab: "paths" | "signers") => void }) { const paths = [["Папка шаблонів", "Документи шаблонів рапортів (.docx)", "C:\\ReportsGenerator\\templates", Folder], ["Папка згенерованих рапортів", "Тут зберігаються створені рапорти", "C:\\ReportsGenerator\\reports", Folder], ["Папка підписів", "PNG файли підписів", "C:\\ReportsGenerator\\signatures", Pencil], ["Файл бази даних (SQLite)", "Локальна база даних програми", "C:\\ReportsGenerator\\data\\database.db", Database]] as const; return <><PageTitle title="Налаштування" subtitle="Керування шляхами та даними програми" /><div className="settings-tabs"><button className={active === "paths" ? "tab-active" : ""} onClick={() => onChange("paths")}><Folder />Шляхи</button><button className={active === "signers" ? "tab-active" : ""} onClick={() => onChange("signers")}><Users />Підписанти</button></div>{active === "paths" ? <section className="panel settings-panel"><h2>Шляхи до файлів та папок</h2><p>Вкажіть розташування основних файлів і папок програми.</p>{paths.map(([title, description, path, Icon]) => <article className="path-row" key={title}><Icon className="green" /><div><b>{title}</b><p>{description}</p><input value={path} readOnly /></div><div><button className="button"><FolderOpen />Відкрити</button><button className="button"><Pencil />Змінити</button></div></article>)}<div className="settings-tip">ⓘ　Після зміни шляхів перезапуск програми не потрібен.<br />　 Нові налаштування застосовуються автоматично.</div></section> : <section className="panel settings-panel signers"><h2>Дані підписантів</h2><p>Ці дані використовуються в усіх шаблонах рапортів.</p>{[["Основний підписант", "Іваненко Іван Іванович", "майор", "Заступник командира з ППП"], ["Командир", "Петренко Петро Петрович", "капітан", "Командир"], ["Начальник штабу", "Сидоренко Сергій Сергійович", "капітан", "Начальник штабу"]].map(([role, name, rank, position], index) => <article className="signer-card" key={role}><b>{index + 1}. {role}</b><button className="button"><Pencil />Редагувати</button><div className="signature-mark">{index === 0 ? "✍" : "♜"}</div><dl><dt>ПІБ</dt><dd>{name}</dd><dt>Звання</dt><dd>{rank}</dd><dt>Посада</dt><dd>{position}</dd></dl></article>)}</section>}</>;
}
