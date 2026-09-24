import type { AdminUnitDraft, UnitDeploymentSeedPayload } from "./adminTypes";

const PREFIX = "SHU1";

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function newNonce() {
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16)) ?? Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Self-contained deployment capsule. The control server treats it as one opaque
 * string; it never receives unit fields or structure as separate data.
 */
export function createDeploymentSeed(unit: AdminUnitDraft, issuedAt = new Date().toISOString()) {
  const payload: UnitDeploymentSeedPayload = {
    format: "shablonizator-unit-seed",
    version: 1,
    issuedAt,
    nonce: newNonce(),
    unit,
  };
  return `${PREFIX}.${encodeBase64Url(JSON.stringify(payload))}`;
}

/** Used by the client application after a successful activation response. */
export function decodeDeploymentSeed(seed: string): UnitDeploymentSeedPayload {
  const [prefix, encoded, extra] = seed.split(".");
  if (prefix !== PREFIX || !encoded || extra) throw new Error("Непідтримуваний формат сіду підрозділу.");
  let payload: UnitDeploymentSeedPayload;
  try {
    payload = JSON.parse(decodeBase64Url(encoded)) as UnitDeploymentSeedPayload;
  } catch {
    throw new Error("Сід підрозділу пошкоджений.");
  }
  if (payload.format !== "shablonizator-unit-seed" || payload.version !== 1 || !payload.unit?.shortName || !Array.isArray(payload.unit.structure)) {
    throw new Error("Сід не містить коректної конфігурації підрозділу.");
  }
  return payload;
}
