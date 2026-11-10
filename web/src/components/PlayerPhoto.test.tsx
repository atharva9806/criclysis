import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlayerPhoto as Photo } from "@/lib/contract/pipeline";
import { PlayerPhoto, initials } from "./PlayerPhoto";

const photo: Photo = {
  thumbUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Virat_Kohli.jpg/480px-Virat_Kohli.jpg",
  pageUrl: "https://commons.wikimedia.org/wiki/File:Virat_Kohli.jpg",
  author: "Jane Doe",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
};
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("PlayerPhoto", () => {
  it("falls back to a neutral initials avatar without a photo", () => {
    for (const p of [undefined, null]) {
      const html = renderToStaticMarkup(<PlayerPhoto photo={p} name="V Kohli" team="India" size="lg" />);
      expect(html).not.toContain("<img");
      expect(html).not.toContain("Photo:");
      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="V Kohli, India: no photo available"');
      expect(text(html)).toBe("VK");
    }
  });

  it("names the avatar without a team when there is none", () => {
    const html = renderToStaticMarkup(<PlayerPhoto name="Sikandar" />);
    expect(html).toContain('aria-label="Sikandar: no photo available"');
    expect(text(html)).toBe("S");
  });

  it("renders the Commons thumbnail lazily with the player's name as alt", () => {
    const html = renderToStaticMarkup(<PlayerPhoto photo={photo} name="V Kohli" team="India" />);
    expect(html).toContain(`src="${photo.thumbUrl}"`);
    expect(html).toContain('alt="V Kohli"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("aspect-[4/5]");
    expect(html).toContain("object-cover");
  });

  it("shows the credit, linked to the file page and the licence", () => {
    const html = renderToStaticMarkup(<PlayerPhoto photo={photo} name="V Kohli" />);
    expect(html).toContain("<figcaption");
    expect(text(html)).toBe("Photo: Jane Doe, CC BY-SA 4.0");
    expect(html).toContain(`href="${photo.pageUrl}"`);
    expect(html).toContain(`href="${photo.licenseUrl}"`);
  });

  it("shows a licence without a licence page as plain text", () => {
    const html = renderToStaticMarkup(<PlayerPhoto photo={{ ...photo, license: "Public domain", licenseUrl: null }} name="V Kohli" />);
    expect(text(html)).toBe("Photo: Jane Doe, Public domain");
    expect(html.match(/<a /g)).toHaveLength(1);
  });
});

describe("initials", () => {
  it("takes the first and last words", () => {
    expect(initials("V Kohli")).toBe("VK");
    expect(initials("Shakib Al Hasan")).toBe("SH");
    expect(initials("  rashid   khan ")).toBe("RK");
    expect(initials("Sikandar")).toBe("S");
    expect(initials("")).toBe("?");
  });
});
