/*
 * The books the bundled catalogues cite, published under /docs/books/.
 *
 * A catalogue's book lives beside it, with the same name: `photography.html`
 * next to `photography.json`, or — for a book of several pages, with its own
 * stylesheet and figures — a folder `rm/` next to `rm.yaml`. The editor
 * resolves a bundled catalogue's relative `source.url` against
 * `<docs>/books/` (see `hostedLink` in packages/editor/src/model/catalogues.ts),
 * and this is what puts the book there: copied unchanged at build, so links
 * between its pages keep working and its address never changes, and served
 * from the source folder in dev, at the same path.
 *
 * The example catalogues' books follow the editor's own switch,
 * VITE_EXAMPLE_CATALOGUES: a school's build publishes only its own books.
 */

import { cpSync, createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const CATALOGUES = fileURLToPath(new URL("../../../editor/src/catalogues/", import.meta.url));
const CATALOGUE_EXTENSIONS = [".json", ".yaml", ".yml"];

/** Book name (as published) → its file or folder on disk. */
function books(): ReadonlyMap<string, string> {
  const folders = [CATALOGUES];
  if (process.env.VITE_EXAMPLE_CATALOGUES === "on") folders.push(join(CATALOGUES, "examples"));
  const found = new Map<string, string>();
  for (const folder of folders) {
    const entries = readdirSync(folder);
    const catalogues = new Set(
      entries.filter((entry) => CATALOGUE_EXTENSIONS.includes(extname(entry))).map((entry) => entry.slice(0, -extname(entry).length)),
    );
    for (const entry of entries) {
      const path = join(folder, entry);
      if (statSync(path).isDirectory()) {
        if (catalogues.has(entry)) found.set(entry, path);
      } else if (extname(entry) === ".html" && catalogues.has(entry.slice(0, -".html".length))) {
        found.set(entry, path);
      }
    }
  }
  return found;
}

/** Copy every book into the built site's books/ folder. For VitePress's `buildEnd`. */
export function copyBooks(outDir: string): void {
  for (const [name, path] of books()) cpSync(path, join(outDir, "books", name), { recursive: true });
}

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/** Serves `<base>books/…` from the source folders while `vitepress dev` runs. */
export function serveBooks(base: string): Plugin {
  const prefix = `${base}books/`;
  return {
    name: "joveworks-books",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = decodeURIComponent((request.url ?? "").split(/[?#]/)[0] ?? "");
        if (!pathname.startsWith(prefix)) return next();
        const [name, ...rest] = pathname.slice(prefix.length).split("/");
        const root = name === undefined ? undefined : books().get(name);
        if (root === undefined) return next();
        // A file book is the whole of its name; a folder book serves what is
        // inside it, and nothing above it.
        const file = statSync(root).isDirectory() ? normalize(join(root, rest.join("/") || "index.html")) : root;
        const inside = file === root || file.startsWith(root + sep);
        if (!inside || !existsSync(file) || statSync(file).isDirectory()) return next();
        response.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
        createReadStream(file).pipe(response);
      });
    },
  };
}
