import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServiceIcon, type ServiceIconName } from "./ServiceIcon";

describe("ServiceIcon", () => {
  it("embeds every service SVG instead of depending on an external asset URL", () => {
    const names: ServiceIconName[] = ["zbbr", "zu", "gz_kb", "siiz", "ovtm", "rs", "sa_ppo", "workshop", "settings-unit", "settings-signers"];

    for (const name of names) {
      const { container, unmount } = render(<ServiceIcon name={name} />);
      const icon = container.querySelector(`.service-icon--${name}`);
      expect(icon?.querySelector("svg")).not.toBeNull();
      expect(icon?.getAttribute("style")).toBeNull();
      unmount();
    }
  });
});
