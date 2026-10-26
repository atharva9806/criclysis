import { describe, expect, it } from "vitest";
import { pageNav } from "./params";

describe("pageNav", () => {
  it("pages through a list", () => {
    expect(pageNav(1, 50, 120)).toEqual({ pages: 3, pastEnd: false, prev: null, next: 2 });
    expect(pageNav(2, 50, 120)).toEqual({ pages: 3, pastEnd: false, prev: 1, next: 3 });
    expect(pageNav(3, 50, 120)).toEqual({ pages: 3, pastEnd: false, prev: 2, next: null });
  });

  it("links a page past the end back to the last page", () => {
    expect(pageNav(2, 50, 6)).toEqual({ pages: 1, pastEnd: true, prev: 1, next: null });
    expect(pageNav(9, 50, 120)).toEqual({ pages: 3, pastEnd: true, prev: 3, next: null });
  });

  it("treats an empty list as one page", () => {
    expect(pageNav(1, 50, 0)).toEqual({ pages: 1, pastEnd: false, prev: null, next: null });
  });
});
