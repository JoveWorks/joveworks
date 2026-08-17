import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Nodebooks docs",
  description: "Docs for the node-editor design tool for dimensioning machine parts.",
  base: "/docs/",
  cleanUrls: true,
  head: [["link", { rel: "icon", href: "/docs/favicon.svg", type: "image/svg+xml" }]],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      {
        text: "GitHub",
        link: "https://github.com/ThomasVanRiel/machine-design-studio",
      },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "What this is", link: "/guide/getting-started" },
          { text: "Sweeps", link: "/guide/sweeps" },
          { text: "Units", link: "/guide/units" },
          { text: "Node reference", link: "/guide/node-reference" },
          { text: "Catalogue authoring", link: "/guide/catalogue-authoring" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/ThomasVanRiel/machine-design-studio" },
    ],
    search: { provider: "local" },
  },
});
