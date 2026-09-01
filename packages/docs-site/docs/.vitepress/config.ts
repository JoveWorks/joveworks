import { defineConfig } from "vitepress";

export default defineConfig({
  title: "JoveWorks Docs",
  description: "Docs for the node-editor design tool for dimensioning machine parts.",
  // Stays an absolute path, unlike the editor and catalogue-author builds.
  // Verified experimentally: with a relative base VitePress still emits a
  // uniform `./assets/...` on every page regardless of nesting depth, so a
  // page one directory down (e.g. guide/units.html) ends up looking for
  // guide/assets/... — which doesn't exist, only docs/assets/... does. That
  // makes a relative base actively wrong here, not just unnecessary, so
  // this — and the DOCS_BASE_URL in packages/editor/src/help-links.ts that
  // has to agree with it — are the one part of the release bundle that
  // assumes domain-root hosting.
  base: "/docs/",
  cleanUrls: true,
  head: [["link", { rel: "icon", href: "/docs/favicon.svg", type: "image/svg+xml" }]],
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
