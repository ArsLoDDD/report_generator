import type { UnitStructureNode } from "../../shared/types/domain";

export type AdminUnitType = "Батальйон" | "Рота" | "Окремий взвод" | "Взвод" | "Служба" | "Інше";
export type AdminUnitStatus = "draft" | "pending_activation" | "active" | "suspended" | "archived";
export type ActivationCodeKind = "primary" | "reserve";
export type ActivationCodeStatus = "pending" | "used" | "revoked" | "expired";
export type InstallationStatus = "active" | "revoked";

export type AdminInstallation = {
  id: string;
  label?: string;
  status: InstallationStatus;
  appVersion?: string;
  activatedAt: string;
  lastSeenAt?: string;
};

export type AdminActivationCode = {
  id: string;
  kind: ActivationCodeKind;
  label: string;
  status: ActivationCodeStatus;
  codeHint: string;
  /** Plain text exists only in the response that issued the code. */
  plainCode?: string;
  createdAt: string;
  expiresAt?: string;
  redeemedAt?: string;
  installation?: AdminInstallation;
};

export type AdminUnit = {
  id: string;
  /** Server identifier of the opaque seed record. Unit data itself remains local. */
  deploymentId?: string;
  seedVersion?: number;
  seedDigest?: string;
  parentUnitId?: string;
  type: AdminUnitType;
  shortName: string;
  fullName: string;
  unitCode?: string;
  authorizedStrength: number;
  structure: UnitStructureNode[];
  metadata: Record<string, string>;
  status: AdminUnitStatus;
  configVersion: number;
  activationCodes: AdminActivationCode[];
  createdAt: string;
  updatedAt: string;
};

export type AdminUnitDraft = Pick<AdminUnit, "parentUnitId" | "type" | "shortName" | "fullName" | "unitCode" | "authorizedStrength" | "structure" | "metadata">;

export type AdminServerSettings = {
  baseUrl: string;
  adminApiKey: string;
};

export type AdminApiMode = "server" | "local-demo";

export type AdminApi = {
  mode: AdminApiMode;
  listUnits(): Promise<AdminUnit[]>;
  createUnit(draft: AdminUnitDraft): Promise<{ unit: AdminUnit; issuedCode: AdminActivationCode }>;
  updateUnit(id: string, draft: AdminUnitDraft): Promise<AdminUnit>;
  setUnitStatus(id: string, status: AdminUnitStatus): Promise<AdminUnit>;
  issueActivationCode(unitId: string, kind: ActivationCodeKind, label: string): Promise<AdminActivationCode>;
  revokeActivationCode(unitId: string, codeId: string): Promise<AdminActivationCode>;
  revokeInstallation(unitId: string, installationId: string): Promise<AdminInstallation>;
};

export type UnitDeploymentSeedPayload = {
  format: "shablonizator-unit-seed";
  version: 1;
  issuedAt: string;
  nonce: string;
  unit: AdminUnitDraft;
};
