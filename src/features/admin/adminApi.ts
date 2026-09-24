import type {
  ActivationCodeKind,
  AdminActivationCode,
  AdminApi,
  AdminInstallation,
  AdminServerSettings,
  AdminUnit,
} from "./adminTypes";
import { createDeploymentSeed } from "./deploymentSeed";

const SETTINGS_KEY = "shablonizator.admin.server.v1";
const LOCAL_UNITS_KEY = "shablonizator.admin.units.local.v2";
const LEGACY_LOCAL_UNITS_KEY = "shablonizator.admin.units.demo.v1";

const envSettings: AdminServerSettings = {
  baseUrl: String(import.meta.env.VITE_ADMIN_API_BASE_URL ?? "").trim(),
  adminApiKey: String(import.meta.env.VITE_ADMIN_API_KEY ?? "").trim(),
};

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/u, "");
}

export function loadAdminServerSettings(): AdminServerSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<AdminServerSettings> | null;
    return {
      baseUrl: normalizeBaseUrl(saved?.baseUrl ?? envSettings.baseUrl),
      adminApiKey: String(saved?.adminApiKey ?? envSettings.adminApiKey).trim(),
    };
  } catch {
    return { ...envSettings, baseUrl: normalizeBaseUrl(envSettings.baseUrl) };
  }
}

export function saveAdminServerSettings(settings: AdminServerSettings) {
  const normalized = { baseUrl: normalizeBaseUrl(settings.baseUrl), adminApiKey: settings.adminApiKey.trim() };
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

function readLocalUnits(): AdminUnit[] {
  try {
    const stored = window.localStorage.getItem(LOCAL_UNITS_KEY) ?? window.localStorage.getItem(LEGACY_LOCAL_UNITS_KEY) ?? "[]";
    const parsed = JSON.parse(stored) as AdminUnit[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalUnits(units: AdminUnit[]) {
  window.localStorage.setItem(LOCAL_UNITS_KEY, JSON.stringify(units));
}

function localActivationCode(kind: ActivationCodeKind, label: string): AdminActivationCode {
  const body = Array.from(globalThis.crypto?.getRandomValues?.(new Uint8Array(5)) ?? [1, 2, 3, 4, 5])
    .map((value) => value.toString(36).padStart(2, "0")).join("").slice(0, 10).toUpperCase();
  const plainCode = `LOCAL-${body.match(/.{1,5}/gu)?.join("-") ?? body}`;
  return {
    id: newId(),
    kind,
    label,
    status: "pending",
    codeHint: plainCode.slice(-5),
    plainCode,
    createdAt: new Date().toISOString(),
  };
}

function createLocalApi(): AdminApi {
  const update = (id: string, mutate: (unit: AdminUnit) => AdminUnit) => {
    const units = readLocalUnits();
    const index = units.findIndex((unit) => unit.id === id);
    if (index < 0) throw new Error("Підрозділ не знайдено.");
    units[index] = mutate(units[index]);
    writeLocalUnits(units);
    return units[index];
  };
  return {
    mode: "local-demo",
    async listUnits() { return readLocalUnits(); },
    async createUnit(draft) {
      const now = new Date().toISOString();
      const issuedCode = localActivationCode("primary", "Основний код");
      const unit: AdminUnit = {
        ...draft,
        id: newId(),
        status: "pending_activation",
        configVersion: 1,
        activationCodes: [issuedCode],
        createdAt: now,
        updatedAt: now,
      };
      writeLocalUnits([...readLocalUnits(), unit]);
      return { unit, issuedCode };
    },
    async updateUnit(id, draft) {
      return update(id, (unit) => ({ ...unit, ...draft, configVersion: unit.configVersion + 1, updatedAt: new Date().toISOString() }));
    },
    async setUnitStatus(id, status) {
      return update(id, (unit) => ({ ...unit, status, updatedAt: new Date().toISOString() }));
    },
    async issueActivationCode(unitId, kind, label) {
      const code = localActivationCode(kind, label);
      update(unitId, (unit) => ({ ...unit, activationCodes: [...unit.activationCodes, code], updatedAt: new Date().toISOString() }));
      return code;
    },
    async revokeActivationCode(unitId, codeId) {
      let result: AdminActivationCode | undefined;
      update(unitId, (unit) => ({
        ...unit,
        activationCodes: unit.activationCodes.map((code) => {
          if (code.id !== codeId) return code;
          result = { ...code, status: "revoked" };
          return result;
        }),
        updatedAt: new Date().toISOString(),
      }));
      if (!result) throw new Error("Код активації не знайдено.");
      return result;
    },
    async revokeInstallation(unitId, installationId) {
      let result: AdminInstallation | undefined;
      update(unitId, (unit) => ({
        ...unit,
        activationCodes: unit.activationCodes.map((code) => {
          if (code.installation?.id !== installationId) return code;
          result = { ...code.installation, status: "revoked" };
          return { ...code, installation: result };
        }),
        updatedAt: new Date().toISOString(),
      }));
      if (!result) throw new Error("Інсталяцію не знайдено.");
      return result;
    },
  };
}

type ApiEnvelope<T> = { data: T } | T;

function unwrap<T>(response: ApiEnvelope<T>): T {
  return typeof response === "object" && response !== null && "data" in response ? response.data : response as T;
}

function createServerApi(settings: AdminServerSettings): AdminApi {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${normalizeBaseUrl(settings.baseUrl)}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(settings.adminApiKey ? { "X-Admin-Key": settings.adminApiKey } : {}),
        ...init?.headers,
      },
    });
    const payload = await response.json().catch(() => null) as { error?: string; message?: string } | ApiEnvelope<T> | null;
    if (!response.ok) {
      const message = payload && typeof payload === "object" && ("error" in payload || "message" in payload)
        ? payload.error ?? payload.message
        : undefined;
      throw new Error(message || `Сервер повернув помилку ${response.status}.`);
    }
    if (payload === null) throw new Error("Сервер повернув порожню відповідь.");
    return unwrap(payload as ApiEnvelope<T>);
  };
  type Registration = { deploymentId: string; seedVersion: number; seedDigest: string; issuedCode?: AdminActivationCode; updatedAt?: string };
  type DeploymentState = Pick<AdminUnit, "status" | "seedVersion" | "seedDigest" | "activationCodes" | "updatedAt">;
  const findLocal = (id: string) => {
    const unit = readLocalUnits().find((item) => item.id === id);
    if (!unit) throw new Error("Локальну картку підрозділу не знайдено.");
    return unit;
  };
  const saveLocal = (unit: AdminUnit) => {
    const units = readLocalUnits();
    const index = units.findIndex((item) => item.id === unit.id);
    if (index < 0) units.push(unit); else units[index] = unit;
    writeLocalUnits(units);
    return unit;
  };
  const registerSeed = (seed: string, issuePrimaryCode: boolean) => request<Registration>("/deployments", {
    method: "POST",
    body: JSON.stringify({ seed, issuePrimaryCode }),
  });
  const ensureDeployment = async (unit: AdminUnit) => {
    if (unit.deploymentId) return unit;
    const seed = createDeploymentSeed({
      parentUnitId: unit.parentUnitId,
      type: unit.type,
      shortName: unit.shortName,
      fullName: unit.fullName,
      unitCode: unit.unitCode,
      authorizedStrength: unit.authorizedStrength,
      structure: unit.structure,
      metadata: unit.metadata,
    });
    const registered = await registerSeed(seed, false);
    return saveLocal({ ...unit, deploymentId: registered.deploymentId, seedVersion: registered.seedVersion, seedDigest: registered.seedDigest, updatedAt: registered.updatedAt ?? new Date().toISOString() });
  };
  return {
    mode: "server",
    async listUnits() {
      const local = readLocalUnits();
      const synchronized = await Promise.all(local.map(async (unit) => {
        if (!unit.deploymentId) return unit;
        try {
          const state = await request<DeploymentState>(`/deployments/${encodeURIComponent(unit.deploymentId)}/status`);
          return { ...unit, ...state };
        } catch {
          return unit;
        }
      }));
      writeLocalUnits(synchronized);
      return synchronized;
    },
    async createUnit(draft) {
      const seed = createDeploymentSeed(draft);
      const registered = await registerSeed(seed, true);
      if (!registered.issuedCode) throw new Error("Сервер не повернув основний код активації.");
      const now = registered.updatedAt ?? new Date().toISOString();
      const unit: AdminUnit = {
        ...draft,
        id: newId(),
        deploymentId: registered.deploymentId,
        seedVersion: registered.seedVersion,
        seedDigest: registered.seedDigest,
        status: "pending_activation",
        configVersion: 1,
        activationCodes: [registered.issuedCode],
        createdAt: now,
        updatedAt: now,
      };
      saveLocal(unit);
      return { unit, issuedCode: registered.issuedCode };
    },
    async updateUnit(id, draft) {
      const current = findLocal(id);
      const seed = createDeploymentSeed(draft);
      let deployment = current;
      if (!deployment.deploymentId) {
        const registered = await registerSeed(seed, false);
        deployment = { ...deployment, deploymentId: registered.deploymentId, seedVersion: registered.seedVersion, seedDigest: registered.seedDigest };
      } else {
        const updated = await request<Pick<Registration, "seedVersion" | "seedDigest" | "updatedAt">>(`/deployments/${encodeURIComponent(deployment.deploymentId)}/seed`, {
          method: "PUT",
          body: JSON.stringify({ seed, expectedVersion: deployment.seedVersion ?? 1 }),
        });
        deployment = { ...deployment, seedVersion: updated.seedVersion, seedDigest: updated.seedDigest };
      }
      return saveLocal({ ...deployment, ...draft, configVersion: deployment.configVersion + 1, updatedAt: new Date().toISOString() });
    },
    async setUnitStatus(id, status) {
      const unit = await ensureDeployment(findLocal(id));
      await request(`/deployments/${encodeURIComponent(unit.deploymentId!)}/status`, { method: "POST", body: JSON.stringify({ status }) });
      return saveLocal({ ...unit, status, updatedAt: new Date().toISOString() });
    },
    async issueActivationCode(unitId, kind, label) {
      const unit = await ensureDeployment(findLocal(unitId));
      const code = await request<AdminActivationCode>(`/deployments/${encodeURIComponent(unit.deploymentId!)}/activation-codes`, { method: "POST", body: JSON.stringify({ kind, label }) });
      saveLocal({ ...unit, activationCodes: [...unit.activationCodes, code], updatedAt: new Date().toISOString() });
      return code;
    },
    async revokeActivationCode(unitId, codeId) {
      const unit = await ensureDeployment(findLocal(unitId));
      const code = await request<AdminActivationCode>(`/deployments/${encodeURIComponent(unit.deploymentId!)}/activation-codes/${encodeURIComponent(codeId)}/revoke`, { method: "POST" });
      saveLocal({ ...unit, activationCodes: unit.activationCodes.map((item) => item.id === code.id ? code : item), updatedAt: new Date().toISOString() });
      return code;
    },
    async revokeInstallation(unitId, installationId) {
      const unit = await ensureDeployment(findLocal(unitId));
      const installation = await request<AdminInstallation>(`/deployments/${encodeURIComponent(unit.deploymentId!)}/installations/${encodeURIComponent(installationId)}/revoke`, { method: "POST" });
      saveLocal({ ...unit, activationCodes: unit.activationCodes.map((code) => code.installation?.id === installation.id ? { ...code, installation } : code), updatedAt: new Date().toISOString() });
      return installation;
    },
  };
}

export function createAdminApi(settings = loadAdminServerSettings()): AdminApi {
  return normalizeBaseUrl(settings.baseUrl) ? createServerApi(settings) : createLocalApi();
}
