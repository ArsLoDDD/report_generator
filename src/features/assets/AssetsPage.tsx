import type { Person } from "../../shared/types/domain";
import { ServicesPage } from "./ServicesPage";

export function AssetsPage({ people }: { people: Person[] }) {
  return <ServicesPage people={people} />;
}
