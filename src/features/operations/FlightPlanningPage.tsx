import { CalendarClock, PlaneTakeoff } from "lucide-react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";

export function FlightPlanningPage() {
  return <PageFrame
    className="flight-planning-page"
    header={<PageTitle title="Планування польотів" subtitle="Підготовлено місце для подальшого планування роботи екіпажів і БпАК" />}
  >
    <section className="panel empty-state-card">
      <PlaneTakeoff />
      <h2>Планування польотів</h2>
      <p>Функціонал буде додано пізніше. Сторінка вже доступна в розділі розширеного обліку особового складу.</p>
      <span><CalendarClock /> Модуль у підготовці</span>
    </section>
  </PageFrame>;
}
