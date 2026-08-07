import { describe, expect, it } from "vitest";
import { morphologyService } from "./morphologyService";

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
});
