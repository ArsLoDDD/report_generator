import { useEffect, useState } from "react";
import { desktop } from "./lib/desktop";
import type { Person, Report } from "./lib/models";

const demoPeople: Person[] = [{ id: 1, rank: "солдат", fullName: "Іваненко Іван Іванович", position: "водій", unit: "Військова частина" }];

export default function App() {
  const [section, setSection] = useState("reports");
  const [people, setPeople] = useState<Person[]>(demoPeople);
  const [reports, setReports] = useState<Report[]>([]);
  const [notice, setNotice] = useState("Готово до роботи");
  useEffect(() => { Promise.all([desktop.listPeople(), desktop.listReports()]).then(([p, r]) => { setPeople(p); setReports(r); }).catch(() => setNotice("Веб-перегляд: база даних буде доступна у застосунку Tauri.")); }, []);
  async function createDraft() {
    try { const created = await desktop.createReport({ title: "Новий рапорт", personId: people[0]?.id ?? null, templateId: null, status: "draft" }); setReports((current) => [created, ...current]); setNotice("Чернетку рапорту створено."); }
    catch { setNotice("Щоб зберігати рапорти, відкрийте застосунок через Tauri."); }
  }
  const headings: Record<string, string> = { reports: "Рапорти", templates: "Шаблони", people: "Особовий склад", settings: "Налаштування" };
  return <div className="app-shell"><aside><div className="brand"><span>Р</span><div>Рапорти<small>генератор документів</small></div></div><nav>{Object.entries(headings).map(([id, label]) => <button className={section === id ? "active" : ""} onClick={() => setSection(id)} key={id}>{label}</button>)}</nav><div className="sidebar-footer">Локальні дані<small>SQLite · приватно на пристрої</small></div></aside><main><header><div><h1>{headings[section]}</h1><p>{notice}</p></div>{section === "reports" && <button className="primary" onClick={createDraft}>+ Створити рапорт</button>}</header>{section === "reports" && <section className="content"><div className="toolbar"><input placeholder="Пошук рапортів…" /><button>Усі статуси</button></div>{reports.length ? <div className="table">{reports.map((r) => <article key={r.id}><div><strong>{r.title}</strong><small>Створено {new Date(r.createdAt).toLocaleDateString("uk-UA")}</small></div><span className="badge">Чернетка</span></article>)}</div> : <div className="empty"><div className="empty-icon">⌑</div><h2>Рапортів ще немає</h2><p>Створіть перший рапорт, оберіть шаблон і заповніть дані.</p><button className="primary" onClick={createDraft}>Створити рапорт</button></div>}</section>}{section === "people" && <section className="content"><div className="table">{people.map((p) => <article key={p.id}><div><strong>{p.fullName}</strong><small>{p.rank} · {p.position}</small></div><span>{p.unit}</span></article>)}</div></section>}{section === "templates" && <section className="content"><div className="empty"><h2>Шаблони документів</h2><p>Імпорт DOCX-шаблонів і налаштування полів буде наступним модулем.</p></div></section>}{section === "settings" && <section className="content"><div className="empty"><h2>Налаштування</h2><p>Ваші дані зберігаються локально в SQLite.</p></div></section>}</main></div>;
}
