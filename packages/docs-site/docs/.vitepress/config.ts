import { defineConfig } from "vitepress";

// Must stay an absolute path, unlike the editor and catalogue-author builds.
// Verified experimentally: with a relative base VitePress still emits a
// uniform `./assets/...` on every page regardless of nesting depth, so a
// page one directory down (e.g. guide/units.html) ends up looking for
// guide/assets/... — which doesn't exist, only docs/assets/... does. That
// makes a relative base actively wrong here, not just unnecessary.
//
// The bundle copies this site into docs/ next to the editor, so by default
// it follows an absolute JOVEWORKS_BASE_PATH (`/joveworks/` gives
// `/joveworks/docs/`). A relative editor base (the stable bundle's `./`) says
// nothing about where the bundle will live, so that falls back to `/docs/`;
// set JOVEWORKS_DOCS_BASE_PATH to build the docs for a known subpath. The
// editor's help links (DOCS_BASE_URL in packages/editor/src/help-links.ts)
// resolve docs/ next to the editor on their own.
function docsBasePath(): string {
  const editorBase = process.env.JOVEWORKS_BASE_PATH ?? "/";
  const base =
    process.env.JOVEWORKS_DOCS_BASE_PATH ??
    (editorBase.startsWith("/") ? `${editorBase.replace(/\/?$/, "/")}docs/` : "/docs/");
  if (!base.startsWith("/")) {
    throw new Error(`JOVEWORKS_DOCS_BASE_PATH must be an absolute path, got "${base}"`);
  }
  return base.replace(/\/?$/, "/");
}

const docsBase = docsBasePath();

export default defineConfig({
  title: "JoveWorks Docs",
  description: "Docs for the node-editor design tool for dimensioning machine parts.",
  base: docsBase,
  cleanUrls: true,
  head: [["link", { rel: "icon", href: docsBase + "favicon.svg", type: "image/svg+xml" }]],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Catalogues", link: "/guide/catalogues" },
      { text: "Analysis", link: "/guide/analysis" },
      { text: "Node reference", link: "/guide/node-reference" },
      {
        text: "GitHub",
        link: "https://github.com/JoveWorks/joveworks",
      },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "What this is", link: "/guide/getting-started" },
          { text: "Using catalogues", link: "/guide/catalogues" },
          { text: "Sweeps", link: "/guide/sweeps" },
          { text: "Creating a NodeBook", link: "/guide/nodebooks" },
          { text: "Units", link: "/guide/units" },
          { text: "Tips and tricks", link: "/guide/tips-and-tricks" },
        ],
      },
      {
        text: "Advanced usage",
        items: [
          { text: "Analysis", link: "/guide/analysis" },
          { text: "Candidates and marks", link: "/guide/candidates" },
          { text: "Reliability studies", link: "/guide/reliability" },
          { text: "Node reference", link: "/guide/node-reference" },
          { text: "Catalogue authoring", link: "/guide/catalogue-authoring" },
        ],
      },
      {
        text: "Examples",
        items: [
          { text: "Choosing an aperture", link: "/examples/choosing-an-aperture" },
          { text: "Pocket milling — power envelope", link: "/examples/milling-power-envelope" },
          { text: "Lighter or stiffer — a cantilever", link: "/examples/lighter-or-stiffer" },
          { text: "Load against strength", link: "/examples/load-against-strength" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/JoveWorks/joveworks" },
    ],
    search: { provider: "local" },
  },
});
