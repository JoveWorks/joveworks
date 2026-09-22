# Hosting JoveWorks

This document is for whoever will run JoveWorks at a university or school. It
describes four ways to host it and what each one costs to operate.

Upstream lives at <https://github.com/joveworks/joveworks>.

**JoveWorks is a static client-side app.** There is no server-side code, no
database, no session store, and no backend to run. The browser loads
`index.html` and everything happens there. Any web server that can serve files
can serve JoveWorks; the differences between the options below are about who
runs the build and how updates reach students, not about what the app needs.

> One optional component is **not** covered by that statement: JoveWorks Hub, a
> separate service that turns short course links into editor links and stores
> student workspaces. Everything in this document assumes Hub is *not* in play
> — the editor is fully functional without it, and a build can be produced with
> every cloud feature compiled out. See [Cloud features](#cloud-features).

---

## Comparison

| | 1. Static web server | 2. Docker container | 3. Netlify-like platform | 4. Fork in self-hosted GitLab |
|---|---|---|---|---|
| **What you operate** | A folder of files on a web server you already run | A container image and whatever runs it | A Git repo connected to a hosted build service | A GitLab project, its CI runners and registry |
| **Who runs the build** | Nobody — you deploy a prebuilt zip | Your build pipeline, inside the image | The platform, on every push | Your GitLab CI |
| **Node toolchain needed** | No | Only inside the build stage; never on a host | No | Only inside CI |
| **Effort to stand up** | Lowest — unzip, one rewrite rule | Medium — write a Dockerfile once | Low — connect repo, set build command | Highest — fork, CI config, registry, deploy target |
| **Effort to update** | Download new zip, replace folder | Bump a version arg, rebuild, redeploy | `git push`, or click redeploy | Merge upstream, CI rebuilds |
| **Ongoing maintenance** | Essentially none | Base-image patching (nginx, Node) | None on your side | Base images **and** keeping the fork merged |
| **Custom formula catalogue** | Must be built in beforehand — ask for a custom bundle | Copied in at build time; you control it | Committed to your repo; you control it | Copied in at build time; you control it |
| **Local code changes** | No | No | No | **Yes** |
| **Can contribute changes upstream** | No | No | No | **Yes** |
| **Reproducible builds** | N/A (prebuilt) | Yes — pinned upstream ref, pinned base image | Partial — depends on platform image | Yes |
| **Works air-gapped / on-prem only** | Yes | Yes | No | Yes |
| **Restricted course content stays on your infrastructure** | Yes | Yes | **No** — build and files live with a third party | Yes, if the catalogue stays out of the fork |
| **Best when** | You have a web server and want the least to maintain | You already run containers and want your own catalogue | You want zero infrastructure and content is unrestricted | You intend to modify JoveWorks itself |

**Short version:** if your course catalogue is unrestricted and you want no
infrastructure, use option 3. If you need your own formula catalogue built in,
use option 2. If you just want it online with the least possible maintenance,
use option 1. Choose option 4 only if you intend to change JoveWorks' own
source — it is the only option that carries a permanent merge burden, and
you do not need it merely to add your own catalogue.

---

## Option 1 — Static web server

The simplest deployment. Each JoveWorks release publishes a **stable bundle**
zip on its [releases page](https://github.com/joveworks/joveworks/releases): a
complete, self-contained build.

1. **Unzip it.** You get `index.html`, `assets/`, `docs/`, `author/`, and the
   server-config files described below.
2. **Point a web server at the unzipped folder.** It works unmodified at a
   domain root (`https://your-domain/`) or under a subpath
   (`https://your-domain/joveworks/`) with no rebuild — the app routes only
   with a `?example=` query parameter, never with URL paths.
3. **Add the single-page-app fallback rule.** The browser loads one
   `index.html` and handles navigation itself, so the server must serve
   `index.html` for any path that isn't a real file rather than returning 404.
   The bundle ships both common forms:
   - `nginx.conf.snippet` — paste into your site's `server { }` block.
   - `.htaccess` — drop next to `index.html` on Apache with `mod_rewrite`.

   On another host, look for "SPA fallback", "rewrite all routes to
   index.html", or "custom 404 = index.html" — the same rule under a different
   name.
4. **Verify.** The editor should load with the palette on the left, canvas in
   the middle, NodeBook on the right. The version badge in the top menu bar
   should read `stable vX.Y.Z` — if it says `nightly`, you deployed the wrong
   build. Navigate within the app and reload: if you get your server's 404
   page, the fallback rule from step 3 isn't active.

**Updating:** download the new zip and replace the folder. Asset filenames are
content-hashed, so browsers pick up a new build on the next load without cache
clearing.

**Limitation:** you get the catalogue that ships in the bundle. If your course
needs its own formula catalogue — particularly one that can't be published
publicly — a stable bundle has to be built with it included, which means either
requesting a custom bundle or moving to option 2.

**Subpath caveat:** the built-in documentation assumes domain-root hosting. The
app's "?" help buttons resolve to `https://your-domain/docs/...` regardless of
subpath, and will 404 if JoveWorks lives under one. The editor and the
catalogue-author tool are unaffected. If you need the docs working under a
subpath, tell us the subpath and we'll produce a matching docs build.

---

## Option 2 — Docker container

Best when you maintain your own formula catalogue, especially one that is
licensed to your institution and must not leave your infrastructure. The
container is just a web server plus static files; the interesting part is the
build stage.

**Do not fork JoveWorks for this.** A fork means every upstream update is a
merge, and merges conflict eventually — reliably at the worst point in a
semester. You only need that burden if you intend to change JoveWorks' own
source, which is [option 4](#option-4--fork-in-a-self-hosted-gitlab). To add a
catalogue, keep a small private repo that *composes* instead:

```
your-joveworks/
  Dockerfile
  nginx.conf          # from deploy/stable-bundle/nginx.conf.snippet
  catalogue/*.yaml    # your formula catalogue (a submodule works well)
```

```dockerfile
FROM node:22-alpine AS build
ARG JOVEWORKS_REF=v0.26.11
RUN corepack enable && apk add --no-cache git
RUN git clone --depth 1 --branch $JOVEWORKS_REF \
    https://github.com/joveworks/joveworks /src
WORKDIR /src

# The editor globs src/catalogues/ at build time, so copying files in is the
# entire integration — no patching of JoveWorks source is required.
COPY catalogue/*.yaml packages/editor/src/catalogues/

ENV JOVEWORKS_CHANNEL=your-institution
RUN pnpm install --frozen-lockfile && pnpm build:bundle

FROM nginx:alpine
COPY --from=build /src/packages/editor/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

**Updating JoveWorks:** bump `JOVEWORKS_REF` to the new tag and rebuild. No
merge, ever.

**Updating a formula:** edit the YAML in `catalogue/` and rebuild. Students get
it on their next page load, because asset filenames are content-hashed.

Three build settings are available as environment variables, so none of this
needs source changes:

| Variable | Effect |
|---|---|
| `JOVEWORKS_CHANNEL` | The text in the version badge. Distinguishes your deployment from the public nightly and stable builds. |
| `JOVEWORKS_BASE_PATH` | Set to `./` for subpath hosting, or an absolute path if you prefer one. Defaults to `/`. |
| `VITE_CLOUD` | Leave unset to compile out all cloud features. See below. |

**The cost to weigh:** you now own a container image, which means patching its
base images on your usual schedule. That is strictly more ongoing work than a
folder of static files. What it buys is a reproducible build with your own
catalogue, and no Node toolchain on any host.

---

## Option 3 — Netlify-like platform

Netlify, Vercel, Cloudflare Pages, GitHub Pages and similar services build from
a Git repo and serve the result. JoveWorks already ships a `netlify.toml`:

```toml
[build]
  command = "pnpm install && pnpm build:bundle"
  publish = "packages/editor/build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

The redirect is the same SPA-fallback rule as option 1's nginx and Apache
configs. On another platform, set the build command and publish directory to
match and add the equivalent rewrite.

This is the least infrastructure of the three: no server, no image, no
patching. Updating is a `git push`.

**The decisive question is content.** On this option your repository and your
built site live on a third party's systems. If your formula catalogue is
licensed to your institution and may not be redistributed, that is very likely
disqualifying — the build service reads your private repo and serves the
resulting files from its own infrastructure. Check with whoever owns the
licence before choosing this. If your catalogue is unrestricted, none of this
applies and option 3 is the easiest path available.

---

## Option 4 — Fork in a self-hosted GitLab

Choose this when you intend to **change JoveWorks itself** — fix something,
add a node type, adapt the interface — and to send those changes back
upstream. It is the only option that gives you that. It is also the only one
with a permanent cost: a fork must be kept merged with upstream, forever.

You do **not** need a fork to add your own formula catalogue. That is option 2
and it requires no source changes at all. If a catalogue is the only reason
you were considering a fork, use option 2 instead.

### Two repositories, not one

This is the important structural point, and the rest of the section depends
on it.

```
joveworks/            ← fork of upstream. Source changes only.
                        NEVER contains your catalogue.
joveworks-deploy/     ← Dockerfile, nginx.conf, CI config,
                        catalogue as a submodule.
```

Keep the catalogue out of the fork. The fork is the repository whose branches
you will push to a public upstream when you open a merge request, and a
licensed catalogue committed there — even on a branch, even deleted later —
is in the history and is effectively published. Separating the two makes that
mistake structurally impossible rather than a matter of care: there is simply
nothing in the fork to leak.

This mirrors how the upstream project handles the same problem — the
restricted catalogue lives in its own repository for exactly this reason, not
behind a `.gitignore`, because one `git add -A` defeats a `.gitignore` and a
repository boundary cannot be defeated that way.

The deployment repo then composes the two, as in option 2:

```dockerfile
FROM node:22-alpine AS build
ARG JOVEWORKS_REF=main
RUN corepack enable && apk add --no-cache git
RUN git clone --depth 1 --branch $JOVEWORKS_REF \
    https://gitlab.your-university.be/your-group/joveworks /src
WORKDIR /src
COPY catalogue/*.yaml packages/editor/src/catalogues/
ENV JOVEWORKS_CHANNEL=your-institution
RUN pnpm install --frozen-lockfile && pnpm build:bundle

FROM nginx:alpine
COPY --from=build /src/packages/editor/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

The only change from option 2 is that the clone now points at your fork
instead of upstream.

### Tracking upstream

Add upstream as a second remote in your fork and merge from it:

```bash
git remote add upstream https://github.com/joveworks/joveworks
git fetch upstream
git merge upstream/main        # or: git rebase upstream/main
```

Merge on a schedule you choose — a quiet week between semesters is better
than the week a bug needs fixing. The longer between merges, the larger the
conflicts.

GitLab can automate the fetch half with **pull mirroring**, but note that
pull mirroring (remote → GitLab) is a paid-tier feature; push mirroring in
the opposite direction is not the same thing and will not help here. On the
free tier, the manual `git fetch upstream` above is the whole workflow and is
perfectly adequate.

Keep your own changes on top of upstream rather than interleaved with it —
small, focused commits, ideally on named branches — so a merge conflict is
legible instead of a wall of unrelated edits.

### Contributing changes back

Merge requests inside your GitLab stay inside your GitLab; they do not reach
upstream. To send a change up:

1. Make the change on a branch in your fork, against current upstream.
2. Confirm it contains **no catalogue content** — no formula expressions, no
   fixtures derived from your textbook, not even as a test case. Invented
   formulas like `y = a*b + c` exercise the code just as well and carry no
   licence with them.
3. Push that branch to a fork of the upstream repository on the platform
   upstream uses, and open the merge/pull request there.
4. Once it lands upstream, drop your local version on the next merge so you
   are not carrying a patch that is now redundant.

If pushing to an external platform is awkward under your policies, send a
patch series instead — `git format-patch` output attached to an email works
fine and needs no account anywhere.

### Building in GitLab CI

A container build with Kaniko, which needs no privileged runner:

```yaml
build:
  stage: build
  image:
    name: gcr.io/kaniko-project/executor:debug
    entrypoint: [""]
  script:
    - /kaniko/executor
      --context "$CI_PROJECT_DIR"
      --dockerfile "$CI_PROJECT_DIR/Dockerfile"
      --destination "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"
      --destination "$CI_REGISTRY_IMAGE:latest"
```

If the catalogue is a submodule, set `GIT_SUBMODULE_STRATEGY: recursive` and
give the job credentials that can read that project.

Run upstream's checks before you propose anything back — `pnpm typecheck` and
`pnpm test` are the two that matter, and they are fast.

---

## Cloud features

JoveWorks can connect to a **JoveWorks Hub** — an optional service providing
short course links, published course material, and cloud-saved student
workspaces. It is a separate deployment with its own requirements and is not
covered here.

If you are not running a Hub, build with `VITE_CLOUD` unset. The Cloud menu,
the connect dialog, the workspace dialogs and the cloud-material viewer are
then absent from the interface entirely, and a Hub course link pasted into the
app is inert rather than failing with a network error. Nothing else changes:
the editor, local save and load, the NodeBook, PDF export and the
catalogue-author tool all work exactly as they do otherwise.

To be precise for a security review that inspects the JavaScript: this removes
the cloud *interface*, not the cloud *code*. Strings like "Save to Cloud" are
still present in the bundle, unreachable. What matters operationally is that
nothing calls them, so no Hub request is ever made.

Note that the prebuilt stable bundle of option 1 is built **with**
`VITE_CLOUD=hub`, because some schools do link to it through a Hub. If you want
a cloud-free deployment, that is option 2 — or ask for a bundle built without
the flag.

This also means the app makes **no outbound network requests** beyond loading
its own assets from your server — worth stating plainly if your security review
asks. (One other opt-in exists: aggregate, cookieless usage analytics, enabled
only when `VITE_ANALYTICS` is set at build time. Leave it unset and no tracker
is loaded and no analytics request is sent. See `docs/analytics.md`.)

---

## What students' files depend on

Worth knowing before you choose, because it affects support questions.

A saved graph file records each formula by identifier, version and content
hash — **never the formula expression itself**. A graph therefore needs its
catalogue present in order to open. This is deliberate: graph files circulate
by email and in hand-ins, and an embedded expression would carry course content
wherever the file went.

The practical consequences:

- A student's graph opens fine on your deployment, because the catalogue is
  built into it.
- The same graph will **not** open on a stock public build of JoveWorks, which
  doesn't have your catalogue.
- If you change a formula, graphs referring to the old version say so rather
  than silently recomputing. That is intended behaviour, not an error.

Browsers also keep saved work separate per address. If you move JoveWorks to a
different hostname or path, students' locally saved work does not follow them.
Decide the address before you announce it.

---

## Questions

thomas.van.riel@gmail.com
