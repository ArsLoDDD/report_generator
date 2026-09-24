import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminApi } from "./adminApi";
import type { AdminUnitDraft } from "./adminTypes";
import { decodeDeploymentSeed } from "./deploymentSeed";

const draft: AdminUnitDraft = {
  type: "Рота",
  shortName: "4 РБАК",
  fullName: "4 рота безпілотних авіаційних комплексів",
  unitCode: "А0000",
  authorizedStrength: 70,
  structure: [{ id: "management", parentId: null, kind: "group", name: "Управління роти", order: 0 }],
  metadata: {},
};

describe("admin API adapter", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps a separately versioned local demo registry and issues one-time-looking codes", async () => {
    const api = createAdminApi({ baseUrl: "", adminApiKey: "" });
    const created = await api.createUnit(draft);

    expect(api.mode).toBe("local-demo");
    expect(created.unit.status).toBe("pending_activation");
    expect(created.issuedCode.kind).toBe("primary");
    expect(created.issuedCode.plainCode).toMatch(/^LOCAL-/u);
    expect((await api.listUnits())[0].shortName).toBe("4 РБАК");

    const updated = await api.updateUnit(created.unit.id, { ...draft, shortName: "5 РБАК" });
    expect(updated.configVersion).toBe(2);
    const reserve = await api.issueActivationCode(created.unit.id, "reserve", "Резерв командира");
    expect(reserve.kind).toBe("reserve");
    const revoked = await api.revokeActivationCode(created.unit.id, reserve.id);
    expect(revoked.status).toBe("revoked");
  });

  it("sends only an opaque self-contained seed and receives the server activation code", async () => {
    const issuedCode = { id: "code-1", kind: "primary" as const, label: "Основний код", status: "pending" as const, codeHint: "F4Q7K", plainCode: "UNIT-AAAAA-F4Q7K", createdAt: "2026-09-24T00:00:00.000Z" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { deploymentId: "deployment-1", seedVersion: 1, seedDigest: "digest", issuedCode } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const api = createAdminApi({ baseUrl: "https://example.supabase.co/functions/v1/admin-api/", adminApiKey: "secret" });

    const created = await api.createUnit(draft);

    expect(created.unit.deploymentId).toBe("deployment-1");
    expect(created.issuedCode.plainCode).toBe("UNIT-AAAAA-F4Q7K");
    expect(fetchMock).toHaveBeenCalledWith("https://example.supabase.co/functions/v1/admin-api/deployments", expect.objectContaining({ headers: expect.objectContaining({ "X-Admin-Key": "secret" }) }));
    expect(fetchMock.mock.calls[0][0]).not.toContain("secret");
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { seed: string; issuePrimaryCode: boolean; structure?: unknown; shortName?: unknown };
    expect(Object.keys(body).sort()).toEqual(["issuePrimaryCode", "seed"]);
    expect(body.issuePrimaryCode).toBe(true);
    expect(body.structure).toBeUndefined();
    expect(body.shortName).toBeUndefined();
    expect(decodeDeploymentSeed(body.seed).unit).toEqual(draft);
  });
});
