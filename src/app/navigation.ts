import { AlertTriangle, BookOpenText, FileCheck2, FileSearch, FileText, Folder, Home, MapPinned, Network, PackageOpen, PlaneTakeoff, Users, UsersRound, type LucideIcon } from "lucide-react";
import type { Screen } from "../shared/types/domain";

export type NavigationItem = readonly [Screen, string, LucideIcon];
export type NavigationGroup = { label: string; items: readonly NavigationItem[] };

const documentsNavigationGroup: NavigationGroup = { label: "Документи", items: [["generator", "Генерація рапортів", Home], ["templates", "Шаблони", FileText], ["report-analyser", "Аналізатор рапортів", FileSearch], ["generated", "Згенеровані рапорти", Folder]] };
const simpleNavigationGroups: NavigationGroup[] = [documentsNavigationGroup, { label: "Особовий склад", items: [["people", "Особовий склад", Users]] }];

const advancedNavigationGroups: NavigationGroup[] = [
  documentsNavigationGroup,
  { label: "Облік підрозділу", items: [["people", "Особовий склад", Users], ["staffing-bcs", "Штат та БЧС", Network], ["assets", "Служби", PackageOpen], ["incidents", "Інциденти", AlertTriangle], ["summary-report", "Підсумкове донесення", FileCheck2]] },
  { label: "Бойова робота", items: [["flight-planning", "План польотів", PlaneTakeoff], ["flight-journal", "Журнал польотів", BookOpenText], ["crews", "Екіпажі", UsersRound], ["positions", "Позиції", MapPinned]] },
];

export const isSimpleEdition = import.meta.env.VITE_APP_EDITION === "simple";
export const navigationGroups = isSimpleEdition ? simpleNavigationGroups : advancedNavigationGroups;
