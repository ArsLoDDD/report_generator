import { describe, expect, it } from "vitest";
import { sortedByNumber } from "./naturalSort";

describe("sortedByNumber", () => {
  it("sorts numeric identifiers numerically rather than lexicographically", () => {
    const rows = [{ number: "10" }, { number: "2" }, { number: "1" }];
    expect(sortedByNumber(rows, (row) => row.number)).toEqual([
      { number: "1" },
      { number: "2" },
      { number: "10" },
    ]);
    expect(rows[0].number).toBe("10");
  });
});
