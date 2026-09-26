import { Beaker, Boxes } from "lucide-react";
import { useState } from "react";
import type { Person } from "../../shared/types/domain";
import { WorkshopPage } from "../operations/WorkshopPage";
import { ServicesPage } from "./ServicesPage";

export function AssetsPage({ people }: { people: Person[] }) {
  const [section, setSection] = useState<"services" | "workshop">("services");
  return <section className="assets-hub">
    <nav className="assets-hub__tabs" aria-label="Розділи обліку служб">
      <button className={section === "services" ? "active" : ""} onClick={() => setSection("services")}><Boxes /><span>Служби</span></button>
      <button className={section === "workshop" ? "active" : ""} onClick={() => setSection("workshop")}><Beaker /><span>Цукерня</span></button>
    </nav>
    <div className="assets-hub__content">{section === "services" ? <ServicesPage people={people} /> : <WorkshopPage />}</div>
  </section>;
}
