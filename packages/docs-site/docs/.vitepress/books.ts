/*
 * The books the bundled catalogues cite, published under /docs/books/.
 *
 * A catalogue's book lives in its domain's `books/` folder
 * (`domains/<name>/books/`, ROADMAP item 19): an `.html` file —
 * `photography.html` for `photography.json` — or, for a book of several
 * pages with its own stylesheet and figures, a folder with an `index.html`. Each is published under its own name, so several catalogue
 * files can share one book: the chapters of a textbook all citing `rm/`.
 * The editor resolves a bundled catalogue's relative `source.url` against
 * `<docs>/books/` (see `hostedLink` in packages/editor/src/model/catalogues.ts),
 * and this is what puts the book there: copied unchanged at build, so links
 * between its pages keep working and its address never changes, and served
 * from the source folder in dev, at the same path.
 *
 * The examples domain's books follow the editor's own switch,
 * VITE_EXAMPLE_CATALOGUES: a school's build publishes only its own books.
 */

import { cpSync, createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const DOMAINS = fileURLToPath(new URL("../../../../domains/", import.meta.url));

/** Book name (as published) → its file or folder on disk. */
function books(): ReadonlyMap<string, string> {
  const domains = readdirSync(DOMAINS)
    .filter((domain) => domain !== "examples" || process.env.VITE_EXAMPLE_CATALOGUES === "on")
    .filter((domain) => existsSync(join(DOMAINS, domain, "books")));
  const found = new Map<string, string>();
  const owner = new Map<string, string>();
  for (const domain of domains) {
    const folder = join(DOMAINS, domain, "books");
    for (const entry of readdirSync(folder)) {
      const path = join(folder, entry);
      const book = statSync(path).isDirectory() ? existsSync(join(path, "index.html")) : extname(entry) === ".html";
      if (!book) continue;
      // Every domain's books are published side by side, so two of one name
      // would have one silently replace the other.
      const other = owner.get(entry);
      if (other !== undefined) {
        throw new Error(`the book '${entry}' is in both the '${other}' and the '${domain}' domains — rename one of them`);
      }
      owner.set(entry, domain);
      found.set(entry, path);
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
