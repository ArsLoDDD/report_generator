import { AlertTriangle, BookOpen, ChevronDown, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { useState } from "react";
import appIcon from "../../assets/shablonizator-header-mark.png";
import type { Screen, StartupWarning } from "../../shared/types/domain";
import { isSimpleEdition, navigationGroups } from "../navigation";

type Props = {
  screen: Screen;
  collapsed: boolean;
  warnings: StartupWarning[];
  onNavigate: (screen: Screen) => void;
  onToggleCollapsed: () => void;
};

export function AppSidebar({ screen, collapsed, warnings, onNavigate, onToggleCollapsed }: Props) {
  const [openGroups, setOpenGroups] = useState<string[]>(navigationGroups.map((group) => group.label));
  return <aside className="sidebar">
    <div className="sidebar-top"><div className="product-logo"><img src={appIcon} alt="" /><div><b>Шаблонізатор</b><span>{isSimpleEdition ? "проста версія" : "службові документи"}</span></div></div></div>
    <section className="sidebar-menu"><nav>{navigationGroups.map((group) => { const open = openGroups.includes(group.label); return <section className="nav-group" key={group.label}><button className="nav-group__title" aria-label={`${open ? "Згорнути" : "Розгорнути"} групу ${group.label}`} title={group.label} onClick={() => setOpenGroups((current) => open ? current.filter((label) => label !== group.label) : [...current, group.label])}><span>{group.label}</span><ChevronDown className={open ? "" : "nav-group__chevron--closed"} /></button>{open && <div className="nav-group__items">{group.items.map(([id, label, Icon]) => <button key={id} title={label} onClick={() => onNavigate(id)} className={screen === id ? "nav-active" : ""}><Icon size={23} /><span>{label}</span></button>)}</div>}</section>; })}</nav></section>
    <section className="sidebar-middle" />
    <footer className="sidebar-bottom">{!isSimpleEdition && <button title="Довідник" onClick={() => onNavigate("documentation")} className={screen === "documentation" ? "nav-active" : ""}><BookOpen size={23} /><span>Довідник</span></button>}{warnings.length>0&&<button title="Попередження" onClick={()=>onNavigate("warnings")} className={`sidebar-warning-link ${screen==="warnings"?"nav-active":""}`}><AlertTriangle size={23}/><span>Попередження</span><b>{warnings.length}</b></button>}<button title="Налаштування" onClick={() => onNavigate("settings")} className={screen === "settings" ? "nav-active" : ""}><Settings size={23} /><span>Налаштування</span></button></footer>
    <button className="sidebar-toggle sidebar-toggle--rail" aria-label={collapsed ? "Розгорнути сайдбар" : "Згорнути сайдбар"} title={collapsed ? "Розгорнути сайдбар" : "Згорнути сайдбар"} onClick={onToggleCollapsed}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
  </aside>;
}
