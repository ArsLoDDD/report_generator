import { AlertTriangle, BatteryCharging, Car, Crosshair, FileSearch, FileText, Folder, Home, MapPinned, Network, PlaneTakeoff, Radio, Shield, Users, UsersRound, WandSparkles, type LucideIcon } from "lucide-react";
import type { Screen } from "../shared/types/domain";

export type NavigationItem = readonly [Screen, string, LucideIcon];
export type NavigationGroup = { label: string; items: readonly NavigationItem[] };

const basicNavigationGroups: NavigationGroup[] = [
  { label: "Документи", items: [["generator", "Генерація рапортів", Home], ["templates", "Шаблони", FileText], ["report-analyser", "Аналізатор рапортів", FileSearch], ["generated", "Згенеровані рапорти", Folder], ["variable-constructor", "Конструктор змінних", WandSparkles]] },
  { label: "Особовий склад", items: [["people", "Особовий склад", Users]] },
];

const advancedNavigationGroups: NavigationGroup[] = [
  { label: "Особовий склад — розширено", items: [["staffing-bcs", "Штат та БЧС", Network], ["flight-planning", "Планування польотів", PlaneTakeoff], ["crews", "Екіпажі", UsersRound]] },
  { label: "Бойова робота", items: [["positions", "Позиції", MapPinned], ["incidents", "Інциденти", AlertTriangle]] },
  { label: "Техніка та майно", items: [["vehicles", "Автомобілі", Car], ["generators", "Генератори", BatteryCharging], ["uavs", "БпЛА", Crosshair], ["communications", "Зв’язок", Radio], ["weapons", "Зброя та БК", Shield]] },
];

export const isSimpleEdition = import.meta.env.VITE_APP_EDITION === "simple";
export const navigationGroups = isSimpleEdition ? basicNavigationGroups : [...basicNavigationGroups, ...advancedNavigationGroups];
