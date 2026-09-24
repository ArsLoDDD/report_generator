import { describe, expect, it } from "vitest";
import { createDeploymentSeed, decodeDeploymentSeed } from "./deploymentSeed";

describe("unit deployment seed", () => {
  it("recreates the local unit skeleton without a server-side unit record", () => {
    const unit = {
      type: "Окремий взвод" as const,
      shortName: "Окремий взвод",
      fullName: "Окремий взвод безпілотних систем",
      authorizedStrength: 12,
      structure: [
        { id: "command", parentId: null, kind: "group" as const, name: "Управління взводу", order: 0 },
        { id: "commander", parentId: "command", kind: "position" as const, name: "Командир взводу", order: 0 },
      ],
      metadata: {},
    };

    const seed = createDeploymentSeed(unit, "2026-09-24T12:00:00.000Z");
    const decoded = decodeDeploymentSeed(seed);

    expect(seed).toMatch(/^SHU1\./u);
    expect(decoded.issuedAt).toBe("2026-09-24T12:00:00.000Z");
    expect(decoded.unit).toEqual(unit);
  });

  it("rejects a random activation code as a deployment seed", () => {
    expect(() => decodeDeploymentSeed("UNIT-AAAAA-BBBBB")).toThrow("Непідтримуваний формат");
  });
});
