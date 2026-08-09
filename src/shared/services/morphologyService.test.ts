import { describe, expect, it } from "vitest";
import { morphologyService, type UkrainianCase } from "./morphologyService";

describe("morphologyService", () => {
  it("declines an uppercase Ukrainian surname and preserves its presentation", async () => {
    const result = await morphologyService.declineName({ surname: "ВАСИЛЬОК", gender: "чоловіча" }, "давальний");
    expect(result.warning).toBeUndefined();
    expect(result.value).toBe("ВАСИЛЬКУ");
  });

  it("declines a full name in genitive case", async () => {
    const result = await morphologyService.declineName({ surname: "Васильок", givenName: "Іван", patronymic: "Аркадійович" }, "родовий");
    expect(result.value).toBe("Василька Івана Аркадійовича");
  });

  it("declines only the head noun of a position", () => {
    expect(morphologyService.declinePosition("оператор безпілотних літальних апаратів 1 відділення", "родовий")).toBe("оператора безпілотних літальних апаратів 1 відділення");
    expect(morphologyService.declinePosition("стрілець, військова частина А0000", "родовий")).toBe("стрільця, військова частина А0000");
  });

  it("capitalizes only the first letter of the first word", () => {
    expect(morphologyService.transformText("оператор безпілотних літальних апаратів", "з_великої")).toBe("Оператор безпілотних літальних апаратів");
  });
  it("supports all seven grammatical case names", () => {
    const cases: UkrainianCase[] = ["називний", "родовий", "давальний", "знахідний", "орудний", "місцевий", "кличний"];
    for (const grammaticalCase of cases) expect(morphologyService.declineRank("майор", grammaticalCase)).toBeTruthy();
  });
});
