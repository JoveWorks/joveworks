import { defineConfig } from "vitepress";

export default defineConfig({
  title: "JoveWorks Docs",
  description: "Docs for the node-editor design tool for dimensioning machine parts.",
  base: "/docs/",
  cleanUrls: true,
  head: [["link", { rel: "icon", href: "/docs/favicon.svg", type: "image/svg+xml" }]],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      {
        text: "GitHub",
        link: "https://github.com/ThomasVanRiel/joveworks",
      },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "What this is", link: "/guide/getting-started" },
          { text: "Sweeps", link: "/guide/sweeps" },
          { text: "Reliability studies", link: "/guide/reliability" },
          { text: "Units", link: "/guide/units" },
          { text: "Tips and tricks", link: "/guide/tips-and-tricks" },
          { text: "Node reference", link: "/guide/node-reference" },
          { text: "Catalogue authoring", link: "/guide/catalogue-authoring" },
        ],
      },
      {
        text: "Examples",
        items: [
          { text: "Choosing an aperture", link: "/examples/choosing-an-aperture" },
          { text: "Pocket milling — power envelope", link: "/examples/milling-power-envelope" },
          { text: "Load against strength", link: "/examples/load-against-strength" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/ThomasVanRiel/joveworks" },
    ],
    search: { provider: "local" },
  },
});
