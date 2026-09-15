import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  FileText,
  Keyboard,
  PackageOpen,
  PlaneTakeoff,
  SearchX,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { SearchInput } from "../../shared/ui/SearchInput";
import {
  dataFlow,
  guideGroups,
  guideTopics,
  quickStartSteps,
  type GuideGroupId,
  type GuideTopic,
} from "./program-guide-content";

const groupIcons: Record<GuideGroupId, LucideIcon> = {
  start: BookOpen,
  personnel: Users,
  operations: PlaneTakeoff,
  assets: PackageOpen,
  documents: FileText,
  administration: Settings,
};

const synonymGroups = [
  ["інцидент", "інцедент"],
  ["бпла", "дрон", "борт"],
  ["бпак", "комплекс"],
  ["екіпаж", "розрахунок"],
  ["ротація", "заміна"],
  ["виїзд", "виїхав", "вихід"],
  ["заїзд", "заїхав", "вхід"],
  ["підсумкове", "пд", "донесення"],
  ["бчс", "бойовий", "чисельний"],
  ["цукерня", "крафт", "виготовлення"],
  ["рекогностування", "реко"],
  ["знімок", "snapshot", "чернетка"],
  ["excel", "ексель", "xlsx"],
  ["резервна", "backup", "копія"],
  ["тво", "тимчасове", "виконання"],
  ["позивний", "позивні", "callsign"],
] as const;

const normalized = (value: string) => value
  .toLocaleLowerCase("uk")
  .replace(/[’ʼ`]/gu, "'")
  .replace(/[^\p{L}\p{N}'.]+/gu, " ")
  .replace(/\s+/gu, " ")
  .trim();

const tokens = (value: string) => normalized(value).split(" ").filter(Boolean);
const synonymsFor = (token: string): readonly string[] => synonymGroups.find((group) => (group as readonly string[]).includes(token)) ?? [token];
const topicSearchText = (topic: GuideTopic) => normalized([
  topic.title,
  topic.summary,
  ...topic.steps,
  ...(topic.receives ?? []),
  ...(topic.sends ?? []),
  ...(topic.rules ?? []),
  ...(topic.keywords ?? []),
].join(" "));

export const matchesGuideQuery = (topic: GuideTopic, query: string) => {
  const searchText = topicSearchText(topic);
  return tokens(query).every((token) => synonymsFor(token).some((synonym) => searchText.includes(normalized(synonym))));
};

const topicIdFromHash = () => {
  const hash = decodeURIComponent(window.location.hash).replace(/^#guide-/u, "");
  return guideTopics.some((topic) => topic.id === hash) ? hash : "";
};

const scrollBehavior = (): ScrollBehavior => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

export function ProgramGuidePage() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"all" | GuideGroupId>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["first-launch", "flight-plan", "summary-report", topicIdFromHash()].filter(Boolean)));
  const search = normalized(query);
  const visibleTopics = useMemo(() => guideTopics.filter((topic) => {
    const groupMatches = group === "all" || topic.group === group;
    return groupMatches && (!search || matchesGuideQuery(topic, search));
  }), [group, search]);

  useEffect(() => {
    if (!search) return;
    setExpanded((current) => new Set([...current, ...visibleTopics.map((topic) => topic.id)]));
  }, [search, visibleTopics]);

  useEffect(() => {
    const revealHashTopic = () => {
      const id = topicIdFromHash();
      if (!id) return;
      setGroup("all");
      setExpanded((current) => new Set([...current, id]));
      window.setTimeout(() => {
        const card = document.getElementById(`guide-${id}`);
        card?.scrollIntoView?.({ behavior: scrollBehavior(), block: "start" });
        document.getElementById(`guide-toggle-${id}`)?.focus({ preventScroll: true });
      }, 0);
    };
    revealHashTopic();
    window.addEventListener("hashchange", revealHashTopic);
    return () => window.removeEventListener("hashchange", revealHashTopic);
  }, []);

  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const openTopic = (id: string) => {
    setExpanded((current) => new Set([...current, id]));
    window.history.replaceState(null, "", `#guide-${id}`);
    window.setTimeout(() => {
      const card = document.getElementById(`guide-${id}`);
      card?.scrollIntoView?.({ behavior: scrollBehavior(), block: "start" });
      document.getElementById(`guide-toggle-${id}`)?.focus({ preventScroll: true });
    }, 0);
  };

  const resetLibrary = () => {
    setQuery("");
    setGroup("all");
  };

  return <PageFrame className="program-guide-page">
    <main className="program-guide">
      <header className="panel program-guide-hero">
        <div className="program-guide-hero__mark" aria-hidden="true"><BookOpen /></div>
        <div className="program-guide-hero__copy">
          <span className="program-guide-eyebrow">Довідник користувача</span>
          <h1>Як працювати з програмою</h1>
          <p>Покрокові інструкції, зв’язки між розділами та відповіді на типові питання. Почніть зі швидкого старту або знайдіть потрібну дію.</p>
          <div className="program-guide-hero__facts">
            <span><ShieldCheck aria-hidden="true" />Дані й документи залишаються на цьому комп’ютері</span>
            <span><Keyboard aria-hidden="true" />Enter виконує основну дію, Escape закриває верхнє вікно</span>
          </div>
        </div>
        <div className="program-guide-hero__search" role="search">
          <SearchInput placeholder="Знайти відповідь у довіднику…" value={query} onChange={setQuery} />
          <small>Можна кілька слів: «ротація БЧС», «інцедент екіпаж», «резервна копія»</small>
        </div>
      </header>

      {!search && <>
        <section className="panel program-guide-onboarding" aria-labelledby="program-guide-start-title">
          <header><div><span className="program-guide-section-kicker">Перші дії</span><h2 id="program-guide-start-title">Швидкий старт</h2></div><span>6 кроків</span></header>
          <ol>{quickStartSteps.map(([number, title, text]) => <li key={number}><b aria-hidden="true">{number}</b><span><strong>{title}</strong><small>{text}</small></span></li>)}</ol>
        </section>

        <section className="panel program-guide-flow" aria-labelledby="program-guide-flow-title">
          <header><div><span className="program-guide-section-kicker">Одна система даних</span><h2 id="program-guide-flow-title">Як інформація проходить через програму</h2></div><Database aria-hidden="true" /></header>
          <div className="program-guide-flow__track">{dataFlow.map(([title, text], index) => <div className="program-guide-flow__step" key={title}><article><b aria-hidden="true">{index + 1}</b><span><strong>{title}</strong><small>{text}</small></span></article>{index < dataFlow.length - 1 && <ArrowRight aria-hidden="true" />}</div>)}</div>
          <p><b>Головне правило:</b> виправляйте дані у першоджерелі. Тоді наступні сторінки й документи отримають правильне значення.</p>
        </section>
      </>}

      <section className="program-guide-library" aria-labelledby="program-guide-library-title">
        <aside className="panel program-guide-library__index">
          <header><CircleHelp aria-hidden="true" /><div><b id="program-guide-library-title">Теми</b><small aria-live="polite">{visibleTopics.length} із {guideTopics.length}</small></div></header>
          <div className="program-guide-group-filter" role="group" aria-label="Категорії довідника">{guideGroups.map((item) => <button type="button" key={item.id} className={group === item.id ? "active" : ""} aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>{item.label}</button>)}</div>
          <nav aria-label="Знайдені теми"><ul>{visibleTopics.map((topic) => <li key={topic.id}><a href={`#guide-${topic.id}`} onClick={(event) => { event.preventDefault(); openTopic(topic.id); }}>{topic.title}</a></li>)}</ul></nav>
        </aside>

        <div className="program-guide-library__content">
          <header className="program-guide-results-header">
            <div><span className="program-guide-section-kicker">Практичні інструкції</span><h2>{search ? `Результати для «${query.trim()}»` : guideGroups.find((item) => item.id === group)?.label}</h2><span className="program-guide-results-status" role="status">Знайдено тем: {visibleTopics.length}</span></div>
            {(search || group !== "all") && <button className="button compact" type="button" onClick={resetLibrary}><SearchX aria-hidden="true" />Показати все</button>}
          </header>
          {visibleTopics.length > 0 ? <div className="program-guide-topic-list">{visibleTopics.map((topic) => {
            const Icon = groupIcons[topic.group];
            const isOpen = expanded.has(topic.id);
            const titleId = `guide-title-${topic.id}`;
            const contentId = `guide-content-${topic.id}`;
            return <article className={`panel program-guide-topic ${isOpen ? "is-open" : ""}`} id={`guide-${topic.id}`} key={topic.id} aria-labelledby={titleId}>
              <button id={`guide-toggle-${topic.id}`} className="program-guide-topic__toggle" type="button" aria-expanded={isOpen} aria-controls={contentId} onClick={() => toggle(topic.id)}>
                <span className="program-guide-topic__icon" aria-hidden="true"><Icon /></span>
                <span><h3 id={titleId}>{topic.title}</h3><small>{topic.summary}</small></span>
                <ChevronDown aria-hidden="true" />
              </button>
              {isOpen && <div className="program-guide-topic__content" id={contentId} role="region" aria-labelledby={titleId}>
                <section className="program-guide-topic__steps"><h4>Як працювати</h4><ol>{topic.steps.map((step) => <li key={step}><Check aria-hidden="true" /><span>{step}</span></li>)}</ol></section>
                {(topic.receives?.length || topic.sends?.length) && <section className="program-guide-connections" aria-label={`Зв’язки: ${topic.title}`}>
                  {topic.receives?.length ? <div><b>Бере дані з</b><ul>{topic.receives.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                  {topic.sends?.length ? <div><b>Передає дані в</b><ul>{topic.sends.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                </section>}
                {topic.rules?.length ? <section className="program-guide-topic__rules"><h4>Важливо</h4><ul>{topic.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul></section> : null}
              </div>}
            </article>;
          })}</div> : <section className="panel program-guide-empty" aria-labelledby="program-guide-empty-title"><SearchX aria-hidden="true" /><h3 id="program-guide-empty-title">Нічого не знайдено</h3><p>Спробуйте коротший запит або скиньте фільтр категорії.</p><button className="button" type="button" onClick={resetLibrary}>Показати весь довідник</button></section>}
        </div>
      </section>
    </main>
  </PageFrame>;
}
