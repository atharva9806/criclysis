// Static imports of flag-icons' SVGs (lib/teams/flags.ts). Next's own
// next-env.d.ts declares *.svg too, but only exists after a build, and CI
// type-checks first. The longer pattern wins where both apply.
declare module "flag-icons/flags/4x3/*.svg" {
  // Turbopack resolves an SVG import to its URL; webpack to StaticImageData.
  const content: string | import("next/image").StaticImageData;
  export default content;
}
