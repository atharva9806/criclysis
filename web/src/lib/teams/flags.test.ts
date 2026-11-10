import { describe, expect, it } from "vitest";
import { FLAG_CODES } from "./colors";
import { flagSrc, teamMark } from "./flags";

// Next serves a hashed .svg file; Vite (in tests) may inline small ones as a data URI.
const SVG = /\.svg|^data:image\/svg/;

describe("flags", () => {
  it("has an image for every flag code a side can map to", () => {
    for (const code of new Set(Object.values(FLAG_CODES))) expect(flagSrc(code), code).toMatch(SVG);
  });

  it("draws a badge, not a flag, for sides without one", () => {
    expect(teamMark("West Indies").flagSrc).toBeNull();
    expect(teamMark("India").flagSrc).toMatch(SVG);
  });
});
