import { BatteryCharging, Car, Crosshair, Radio, Shield } from "lucide-react";
import { useState } from "react";
import type { Person } from "../../shared/types/domain";
import { EquipmentPage } from "../operations/EquipmentPage";
import type { EquipmentCategory } from "../operations/types";
import { VehiclesPage } from "../vehicles/VehiclesPage";

type AssetSection = "vehicles" | EquipmentCategory;

const sections = [
  ["vehicles", "Автомобілі", Car],
  ["uav", "БпЛА та БпАК", Crosshair],
  ["generator", "Генератори", BatteryCharging],
  ["communications", "Зв’язок", Radio],
  ["weapon_ammo", "Зброя та БК", Shield],
] as const;

export function AssetsPage({ people }: { people: Person[] }) {
  const [section, setSection] = useState<AssetSection>("vehicles");

  return <section className="assets-hub">
    <nav className="assets-hub__tabs" aria-label="Служби майна">
      {sections.map(([id, label, Icon]) => <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}><Icon /><span>{label}</span></button>)}
    </nav>
    <div className="assets-hub__content">
      {section === "vehicles" ? <VehiclesPage people={people} /> : <EquipmentPage category={section} people={people} />}
    </div>
  </section>;
}
