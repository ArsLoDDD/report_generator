import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  KeyRound,
  Laptop2,
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Unplug,
} from "lucide-react";
import { NotificationProvider, useNotifications } from "../../shared/ui/NotificationProvider";
import { GlobalTooltip } from "../../shared/ui/GlobalTooltip";
import { createAdminApi, loadAdminServerSettings, saveAdminServerSettings } from "./adminApi";
import { IssuedCodeDialog, AdminServerDialog } from "./AdminDialogs";
import { AdminUnitEditor } from "./AdminUnitEditor";
import type { ActivationCodeKind, AdminActivationCode, AdminApi, AdminServerSettings, AdminUnit, AdminUnitDraft, AdminUnitStatus } from "./adminTypes";
import "../../styles/features/admin-edition.css";

const unitStatus: Record<AdminUnitStatus, { label: string; tone: string }> = {
  draft: { label: "Чернетка", tone: "muted" },
  pending_activation: { label: "Очікує активації", tone: "warning" },
  active: { label: "Підключено", tone: "success" },
  suspended: { label: "Призупинено", tone: "danger" },
  archived: { label: "В архіві", tone: "muted" },
};

const codeStatus = {
  pending: "Не використано",
  used: "Активовано",
  revoked: "Відкликано",
  expired: "Термін минув",
} as const;

function dateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function connectionCount(unit: AdminUnit) {
  return unit.activationCodes.filter((code) => code.installation?.status === "active").length;
}

function latestConnection(unit: AdminUnit) {
  const values = unit.activationCodes.map((code) => code.installation?.lastSeenAt ?? code.installation?.activatedAt).filter(Boolean).sort();
  return values[values.length - 1];
}

function AdminEdition() {
  const { notify } = useNotifications();
  const [settings, setSettings] = useState<AdminServerSettings>(() => loadAdminServerSettings());
  const [api, setApi] = useState<AdminApi>(() => createAdminApi(settings));
  const [units, setUnits] = useState<AdminUnit[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("Усі");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ unit?: AdminUnit }>();
  const [issuedCode, setIssuedCode] = useState<AdminActivationCode>();
  const [showServer, setShowServer] = useState(false);

  const loadUnits = useCallback(async (targetApi = api) => {
    setLoading(true);
    try {
      const loaded = await targetApi.listUnits();
      setUnits(loaded);
      setSelectedId((current) => current && loaded.some((unit) => unit.id === current) ? current : loaded[0]?.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не вдалося отримати підрозділи.", "error");
    } finally {
      setLoading(false);
    }
  }, [api, notify]);

  useEffect(() => { void loadUnits(); }, [loadUnits]);

  const filteredUnits = useMemo(() => units.filter((unit) => {
    const matchesType = typeFilter === "Усі" || unit.type === typeFilter;
    const searchText = `${unit.shortName} ${unit.fullName} ${unit.unitCode ?? ""}`.toLocaleLowerCase("uk");
    return matchesType && searchText.includes(query.trim().toLocaleLowerCase("uk"));
  }), [query, typeFilter, units]);
  const unitTypes = useMemo(() => ["Усі", ...new Set(units.map((unit) => unit.type))], [units]);
  const selected = units.find((unit) => unit.id === selectedId);
  const stats = useMemo(() => ({
    all: units.filter((unit) => unit.status !== "archived").length,
    active: units.filter((unit) => unit.status === "active").length,
    pending: units.filter((unit) => unit.status === "pending_activation").length,
    installations: units.reduce((sum, unit) => sum + connectionCount(unit), 0),
  }), [units]);

  const saveUnit = async (draft: AdminUnitDraft) => {
    setBusy(true);
    try {
      if (editor?.unit) {
        const updated = await api.updateUnit(editor.unit.id, draft);
        setUnits((current) => current.map((unit) => unit.id === updated.id ? updated : unit));
        notify("Параметри й скелет підрозділу збережено.", "success");
      } else {
        const created = await api.createUnit(draft);
        setUnits((current) => [...current, created.unit]);
        setSelectedId(created.unit.id);
        setIssuedCode(created.issuedCode);
        notify("Підрозділ створено. Основний код готовий.", "success");
      }
      setEditor(undefined);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не вдалося зберегти підрозділ.", "error");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (unit: AdminUnit, status: AdminUnitStatus) => {
    const action = status === "archived" ? "перенести підрозділ в архів" : status === "suspended" ? "призупинити підключення" : "відновити підключення";
    if (!window.confirm(`Дійсно ${action}? Історія та коди не видаляються.`)) return;
    setBusy(true);
    try {
      const updated = await api.setUnitStatus(unit.id, status);
      setUnits((current) => current.map((item) => item.id === updated.id ? updated : item));
      notify("Статус підрозділу оновлено.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не вдалося змінити статус.", "error");
    } finally { setBusy(false); }
  };

  const issueCode = async (unit: AdminUnit, kind: ActivationCodeKind) => {
    const defaultLabel = kind === "primary" ? "Основний код" : `Резервний код ${unit.activationCodes.filter((code) => code.kind === "reserve").length + 1}`;
    const label = window.prompt("Назва коду — наприклад, прізвище відповідального користувача", defaultLabel)?.trim();
    if (!label) return;
    setBusy(true);
    try {
      const code = await api.issueActivationCode(unit.id, kind, label);
      setUnits((current) => current.map((item) => item.id === unit.id ? { ...item, activationCodes: [...item.activationCodes, code], updatedAt: new Date().toISOString() } : item));
      setIssuedCode(code);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не вдалося створити код.", "error");
    } finally { setBusy(false); }
  };

  const revokeCode = async (unit: AdminUnit, code: AdminActivationCode) => {
    if (!window.confirm(`Відкликати «${code.label}»? Цей код більше не можна буде використати.`)) return;
    setBusy(true);
    try {
      const revoked = await api.revokeActivationCode(unit.id, code.id);
      setUnits((current) => current.map((item) => item.id === unit.id ? { ...item, activationCodes: item.activationCodes.map((existing) => existing.id === revoked.id ? revoked : existing) } : item));
      notify("Код відкликано.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не вдалося відкликати код.", "error");
    } finally { setBusy(false); }
  };

  const revokeInstallation = async (unit: AdminUnit, code: AdminActivationCode) => {
    if (!code.installation || !window.confirm("Відключити цю інсталяцію? Для повторного підключення знадобиться новий код.")) return;
    setBusy(true);
    try {
      const installation = await api.revokeInstallation(unit.id, code.installation.id);
      setUnits((current) => current.map((item) => item.id === unit.id ? { ...item, activationCodes: item.activationCodes.map((existing) => existing.id === code.id ? { ...existing, installation } : existing) } : item));
      notify("Інсталяцію відключено.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не вдалося відключити інсталяцію.", "error");
    } finally { setBusy(false); }
  };

  const saveServer = (nextSettings: AdminServerSettings) => {
    const saved = saveAdminServerSettings(nextSettings);
    const nextApi = createAdminApi(saved);
    setSettings(saved);
    setApi(nextApi);
    setShowServer(false);
    setSelectedId(undefined);
    void loadUnits(nextApi);
    notify(saved.baseUrl ? "Параметри сервера збережено." : "Увімкнено локальний демонстраційний режим.", "success");
  };

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><span><ShieldCheck /></span><div><b>Центр керування</b><small>Адмінська редакція</small></div></div>
      <nav><button className="is-active"><Building2 />Підрозділи <b>{stats.all}</b></button><button onClick={() => setShowServer(true)}><Server />Підключення</button></nav>
      <div className={`admin-server-state ${api.mode === "server" ? "is-online" : "is-local"}`}>
        {api.mode === "server" ? <Server /> : <Unplug />}
        <div><b>{api.mode === "server" ? "Сервер налаштовано" : "Локальний макет"}</b><small>{api.mode === "server" ? settings.baseUrl.replace(/^https?:\/\//u, "") : "Коди не активують клієнт"}</small></div>
      </div>
      <button className="admin-settings-button" onClick={() => setShowServer(true)}><Settings2 />Налаштування API</button>
      <small className="admin-version">Шаблонізатор · Admin 0.1.0</small>
    </aside>

    <main className="admin-workspace">
      <header className="admin-page-header"><div><span className="admin-eyebrow">Керування розгортанням</span><h1>Підрозділи</h1><p>Створення структури, видача ключів і контроль підключених інсталяцій.</p></div><div className="admin-page-actions"><button className="button" disabled={loading} onClick={() => void loadUnits()}><RefreshCw className={loading ? "admin-is-spinning" : ""} />Оновити</button><button className="button primary" onClick={() => setEditor({})}><Plus />Створити підрозділ</button></div></header>

      {api.mode === "local-demo" && <div className="admin-mode-banner"><Unplug /><div><b>Сервер ще не підключено</b><span>Можна спроєктувати картки й скелети локально. Перед реальною видачею кодів укажіть URL Edge Function.</span></div><button className="button" onClick={() => setShowServer(true)}>Підключити</button></div>}

      <section className="admin-stats">
        <article><Building2 /><div><span>Підрозділів</span><strong>{stats.all}</strong></div></article>
        <article><CheckCircle2 /><div><span>Активовано</span><strong>{stats.active}</strong></div></article>
        <article><CircleDashed /><div><span>Очікують код</span><strong>{stats.pending}</strong></div></article>
        <article><Laptop2 /><div><span>Активних інсталяцій</span><strong>{stats.installations}</strong></div></article>
      </section>

      <section className={`admin-content ${selected ? "has-details" : ""}`}>
        <div className="admin-list-panel">
          <div className="admin-list-tools"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Назва, тип або номер частини" /></label><div>{unitTypes.map((type) => <button key={type} className={typeFilter === type ? "is-active" : ""} onClick={() => setTypeFilter(type)}>{type}</button>)}</div></div>
          <div className="admin-unit-list">
            {loading && !units.length && <div className="admin-empty"><RefreshCw className="admin-is-spinning" /><b>Завантажуємо підрозділи…</b></div>}
            {!loading && !filteredUnits.length && <div className="admin-empty"><Network /><b>{units.length ? "Нічого не знайдено" : "Підрозділів ще немає"}</b><span>{units.length ? "Змініть пошук або фільтр." : "Створіть перший підрозділ і отримайте основний код."}</span>{!units.length && <button className="button primary" onClick={() => setEditor({})}><Plus />Створити</button>}</div>}
            {filteredUnits.map((unit) => {
              const groups = unit.structure.filter((node) => node.kind === "group").length;
              const positions = unit.structure.filter((node) => node.kind === "position").length;
              const status = unitStatus[unit.status];
              return <button key={unit.id} className={`admin-unit-card ${selectedId === unit.id ? "is-selected" : ""}`} onClick={() => setSelectedId(unit.id)}>
                <span className="admin-unit-card__icon"><Building2 /></span>
                <span className="admin-unit-card__main"><span className="admin-unit-card__top"><b>{unit.shortName}</b><em className={`admin-status admin-status--${status.tone}`}>{status.label}</em></span><small>{unit.fullName}</small><span className="admin-unit-card__meta"><i>{unit.type}</i><i><Network />{groups} блоків · {positions} посад</i><i><Laptop2 />{connectionCount(unit)} підключень</i></span></span>
                <ChevronRight />
              </button>;
            })}
          </div>
        </div>

        {selected && <aside className="admin-unit-details">
          <header><div className="admin-unit-details__identity"><span><Building2 /></span><div><small>{selected.type}</small><h2>{selected.shortName}</h2><p>{selected.fullName}</p></div></div><em className={`admin-status admin-status--${unitStatus[selected.status].tone}`}>{unitStatus[selected.status].label}</em></header>
          <div className="admin-unit-details__facts"><span><small>Версія сіду</small><b>v{selected.seedVersion ?? selected.configVersion}</b></span><span><small>Локальний скелет</small><b>{selected.structure.filter((node) => node.kind === "position").length} посад</b></span><span><small>Останній зв'язок</small><b>{dateTime(latestConnection(selected))}</b></span></div>
          <div className="admin-unit-details__actions"><button className="button primary" onClick={() => setEditor({ unit: selected })}><Settings2 />Назва і скелет</button>{selected.status === "suspended" ? <button className="button" disabled={busy} onClick={() => void changeStatus(selected, "active")}><ShieldCheck />Відновити</button> : <button className="button" disabled={busy} onClick={() => void changeStatus(selected, "suspended")}><ShieldOff />Призупинити</button>}<button className="button danger" disabled={busy || selected.status === "archived"} onClick={() => void changeStatus(selected, "archived")}><Archive />В архів</button></div>

          <section className="admin-code-section"><header><div><h3>Коди та інсталяції</h3><p>Повний код показується лише під час створення. На сервері зберігається тільки його хеш.</p></div><button className="button" disabled={busy} onClick={() => void issueCode(selected, "reserve")}><Plus />Резервний код</button></header>
            <div className="admin-code-list">
              {selected.activationCodes.map((code) => <article key={code.id} className={`admin-code-card is-${code.status}`}>
                <div className="admin-code-card__head"><span><KeyRound /></span><div><b>{code.label}</b><small>{code.kind === "primary" ? "Основний" : "Резервний"} · •••••-{code.codeHint}</small></div><em>{codeStatus[code.status]}</em></div>
                <dl><div><dt>Створено</dt><dd>{dateTime(code.createdAt)}</dd></div><div><dt>Активовано</dt><dd>{dateTime(code.redeemedAt)}</dd></div></dl>
                {code.installation && <div className={`admin-installation ${code.installation.status === "revoked" ? "is-revoked" : ""}`}><Laptop2 /><div><b>{code.installation.label || "Робочий комп'ютер"}</b><small>{code.installation.appVersion ? `Версія ${code.installation.appVersion} · ` : ""}останній зв'язок {dateTime(code.installation.lastSeenAt)}</small></div>{code.installation.status === "active" && <button className="button danger" disabled={busy} onClick={() => void revokeInstallation(selected, code)}>Відключити</button>}</div>}
                {code.status === "pending" && <button className="admin-text-action" disabled={busy} onClick={() => void revokeCode(selected, code)}>Відкликати невикористаний код</button>}
              </article>)}
              {!selected.activationCodes.some((code) => code.kind === "primary" && code.status !== "revoked") && <button className="admin-new-primary" onClick={() => void issueCode(selected, "primary")}><KeyRound /><span><b>Створити новий основний код</b><small>Потрібно, якщо попередній відкликано або втрачено.</small></span></button>}
            </div>
          </section>
        </aside>}
      </section>
    </main>

    {editor && <AdminUnitEditor unit={editor.unit} units={units} busy={busy} onClose={() => setEditor(undefined)} onSave={saveUnit} />}
    {issuedCode && <IssuedCodeDialog code={issuedCode} mode={api.mode} onClose={() => setIssuedCode(undefined)} />}
    {showServer && <AdminServerDialog initial={settings} onClose={() => setShowServer(false)} onSave={saveServer} />}
  </div>;
}

export function AdminApp() {
  return <NotificationProvider><GlobalTooltip /><AdminEdition /></NotificationProvider>;
}

export default AdminApp;
