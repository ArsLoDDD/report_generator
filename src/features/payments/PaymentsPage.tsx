import { FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { personnelService } from "../../shared/services/personnelService";
import type { Person } from "../../shared/types/domain";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { formatIsoMonth, MonthNavigator } from "../../shared/ui/MonthNavigator";

const PAGE_SIZE = 100;
const currentIsoMonth = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; };

async function loadAllPersonnel() {
  const people: Person[] = [];
  let offset = 0;
  while (true) {
    const page = await personnelService.list(offset, PAGE_SIZE);
    people.push(...page.items.filter((person) => !people.some((saved) => saved.id === person.id)));
    offset += page.items.length;
    if (!page.items.length || offset >= page.totalCount) break;
  }
  return people;
}

export function PaymentsPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(currentIsoMonth);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const month = useMemo(() => { const [year, monthNumber] = selectedMonth.split("-").map(Number); return new Date(year, monthNumber - 1, 1); }, [selectedMonth]);
  const days = useMemo(() => Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, index) => index + 1), [month]);
  const monthLabel = formatIsoMonth(selectedMonth);

  useEffect(() => {
    let active = true;
    void loadAllPersonnel().then((items) => {
      if (active) setPeople(items);
    }).catch(() => {
      if (active) setError("Не вдалося завантажити особовий склад.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return <PageFrame
    className="payments-page"
    header={<PageTitle title="Виплати" subtitle={`Таблиця за ${monthLabel}`} actions={<button type="button" className="button" disabled title="Формування рапорту буде додано після погодження правил"><FileText />Сформувати рапорт</button>} />}
    tools={<MonthNavigator value={selectedMonth} max={currentIsoMonth()} onChange={(value) => { setSelectedMonth(value); setHoveredDay(null); }} ariaLabel="Місяць виплат" />}
  >
    <section className="panel payments-table" aria-label={`Виплати за ${monthLabel}`}>
      <div className="payments-table__scroll">
        <table>
          <thead><tr><th>Військовослужбовці</th>{days.map((day) => <th key={day} className={hoveredDay === day ? "is-column-highlighted" : ""} title={`${String(day).padStart(2, "0")}.${String(month.getMonth() + 1).padStart(2, "0")}.${month.getFullYear()}`}>{day}</th>)}</tr></thead>
          <tbody>
            {people.map((person) => <tr key={person.id}><th scope="row"><b>{person.fullName}</b><span>{[person.rank, person.position].filter(Boolean).join(" · ")}</span></th>{days.map((day) => <td key={day} className={hoveredDay === day ? "is-column-highlighted" : ""} aria-label={`${person.fullName}, ${day} число`} onMouseEnter={() => setHoveredDay(day)} onMouseLeave={() => setHoveredDay(null)} />)}</tr>)}
          </tbody>
        </table>
        {loading && <div className="payments-table__state">Завантаження особового складу…</div>}
        {!loading && error && <div className="payments-table__state is-error">{error}</div>}
        {!loading && !error && people.length === 0 && <div className="payments-table__state">В особовому складі ще немає записів.</div>}
      </div>
    </section>
  </PageFrame>;
}
