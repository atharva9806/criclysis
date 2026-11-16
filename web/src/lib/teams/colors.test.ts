import { describe, expect, it } from "vitest";
import { FLAG_CODES, SURFACE, contrast, distance, ensureContrast, teamCode, teamIdentity, teamPair } from "./colors";

const MAIN = [
  "India",
  "Australia",
  "England",
  "Pakistan",
  "South Africa",
  "New Zealand",
  "Sri Lanka",
  "Bangladesh",
  "West Indies",
  "Afghanistan",
  "Ireland",
  "Zimbabwe",
  "Netherlands",
  "Scotland",
  "Nepal",
  "United Arab Emirates",
  "United States of America",
  "Namibia",
  "Oman",
  "Canada",
  "Hong Kong",
  "Papua New Guinea",
  "Kenya",
  "Uganda",
];

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("ensureContrast reaches the target", () => {
    expect(contrast(ensureContrast("#111111", SURFACE.dark, 3), SURFACE.dark)).toBeGreaterThanOrEqual(3);
    expect(contrast(ensureContrast("#ffc72c", SURFACE.light, 3), SURFACE.light)).toBeGreaterThanOrEqual(3);
  });
});

describe("teamIdentity", () => {
  it.each(MAIN)("%s has its own colours, AA text on them and 3:1 chart colours", (name) => {
    const t = teamIdentity(name);
    expect(t.known).toBe(true);
    expect(contrast(t.on, t.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.on, t.deep)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.lineDark, SURFACE.dark)).toBeGreaterThanOrEqual(3);
    expect(contrast(t.lineLight, SURFACE.light)).toBeGreaterThanOrEqual(3);
  });

  it("gives unknown sides the neutral palette, still with AA text", () => {
    const t = teamIdentity("Atlantis");
    expect(t.known).toBe(false);
    expect(t.flag).toBeNull();
    expect(contrast(t.on, t.primary)).toBeGreaterThanOrEqual(4.5);
    expect(t.code).toBe("ATL");
  });

  it("never shows a national flag for sides without one", () => {
    for (const name of ["West Indies", "ICC World XI", "World XI", "Asia XI", "Africa XI", "East Africa", "Ireland"]) {
      expect(teamIdentity(name).flag).toBeNull();
    }
  });

  it("uses the home nations' own flags", () => {
    expect(teamIdentity("England").flag).toBe("gb-eng");
    expect(teamIdentity("Scotland").flag).toBe("gb-sct");
    expect(teamIdentity("Wales").flag).toBe("gb-wls");
    expect(Object.values(FLAG_CODES)).not.toContain("gb");
  });

  it("finds women's sides by the same name", () => {
    expect(teamIdentity("India Women").code).toBe("IND");
    expect(teamIdentity("india").flag).toBe("in");
  });

  it("makes codes for sides without one", () => {
    expect(teamCode("Germany")).toBe("GER");
    expect(teamCode("ICC World XI")).toBe("IWX");
    expect(teamCode("Isle of Man")).toBe("IM");
  });
});

describe("teamPair", () => {
  it("keeps distinct colours as they are", () => {
    const [a, b] = teamPair("India", "Australia");
    expect(a.lineDark).toBe(teamIdentity("India").lineDark);
    expect(b.lineDark).toBe(teamIdentity("Australia").lineDark);
  });

  it.each([
    ["South Africa", "Pakistan"],
    ["Bangladesh", "South Africa"],
    ["India", "Sri Lanka"],
    ["England", "Sri Lanka"],
    ["Pakistan", "Bangladesh"],
  ])("separates %s and %s", (x, y) => {
    const [a, b] = teamPair(x, y);
    expect(distance(a.lineDark, b.lineDark)).toBeGreaterThanOrEqual(0.12);
    expect(distance(a.lineLight, b.lineLight)).toBeGreaterThanOrEqual(0.12);
    expect(contrast(b.lineDark, SURFACE.dark)).toBeGreaterThanOrEqual(3);
    expect(contrast(b.lineLight, SURFACE.light)).toBeGreaterThanOrEqual(3);
  });
});
