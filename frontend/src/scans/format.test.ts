import { describe, expect, it } from "vitest";

import { formatBytes, formatElapsed, formatPercent } from "./format";

describe("scan formatters", () => {
  it("formats decimal storage without overstating precision", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1500)).toBe("1.5 kB");
    expect(formatBytes(12_500_000)).toBe("12.5 MB");
  });

  it("formats honest elapsed time", () => {
    expect(formatElapsed(65_900)).toBe("1:05");
    expect(formatElapsed(3_661_000)).toBe("1:01:01");
  });

  it("formats proportions and handles empty roots", () => {
    expect(formatPercent(1, 4)).toBe("25%");
    expect(formatPercent(0, 0)).toBe("0%");
  });
});
