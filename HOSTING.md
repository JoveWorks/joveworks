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

| | 1. Static web server | 2. Docker container | 3. Netlify-like platform | 4. Fork in self-hosted GitLab (**recommended**) |
|---|---|---|---|---|
| **What you operate** | A folder of files on a web server you already run | A container image and whatever runs it | A Git repo connected to a hosted build service | A GitLab project, its CI runners and registry |
| **Who runs the build** | Nobody — you deploy a prebuilt zip | Your build pipeline, inside the image | The platform, on every push | Your GitLab CI |
| **Node toolchain needed** | No | Only inside the build stage; never on a host | No | Only inside CI |
| **Effort to stand up** | Lowest — unzip, one rewrite rule | Medium — write a Dockerfile once | Low — connect repo, set build command | Medium — clone, add remotes, CI config, registry |
| **Effort to update** | Download new zip, replace folder | Bump a version arg, rebuild, redeploy | `git push`, or click redeploy | Merge the new release tag, CI rebuilds |
| **Ongoing maintenance** | Essentially none | Base-image patching (nginx, Node) | None on your side | Base images, plus merging releases — conflict-free if you only add catalogue files |
| **Custom formula catalogue** | Must be built in beforehand — ask for a custom bundle | Copied in at build time; you control it | Committed to your repo; you control it | Committed to your fork; you control it |
| **Local code changes** | No | No | No | **Yes** |
| **Can contribute changes upstream** | No | No | No | **Yes** |
| **Reproducible builds** | N/A (prebuilt) | Yes — pinned upstream ref, pinned base image | Partial — depends on platform image | Yes |
| **Works air-gapped / on-prem only** | Yes | Yes | No | Yes |
| **Restricted course content stays on your infrastructure** | Yes | Yes | **No** — build and files live with a third party | Yes — contribution branches never carry it |
| **Best when** | You have a web server and want the least to maintain | You already run containers and want your own catalogue | You want zero infrastructure and content is unrestricted | You want your own catalogue, a simple update path, and the option to change or contribute to JoveWorks |

**Short version:** use option 4. A copy of JoveWorks in your own GitLab, with
the public repository as an `upstream` remote, gives you your own catalogue
(commit the files, done), updates by merging a release tag, and a direct path
for sending fixes back. The other options suit narrower cases: option 1 if you
want a folder of files on a server and nothing else, option 2 if you run
containers but would rather not keep a Git repository of JoveWorks, and
option 3 if your catalogue is unrestricted and you want no infrastructure.

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
requesting a custom bundle or moving to option 4 (or option 2).

**Subpath caveat:** the bundle's built-in documentation is built for
domain-root hosting. Under a subpath the app's "?" help buttons still resolve to
`https://your-domain/joveworks/docs/...`, but the docs pages load their assets
from `/docs/` and break. The editor and the catalogue-author tool are
unaffected. To get working docs under a subpath, build the bundle yourself with
an absolute `JOVEWORKS_BASE_PATH` for that subpath (see the table under option
2), or tell us the subpath and we'll produce a matching build.

---

## Option 2 — Docker container

Best when you already run containers and want your own formula catalogue,
without keeping a repository of JoveWorks' source. The
container is just a web server plus static files; the interesting part is the
build stage.

This option keeps no copy of JoveWorks' source. Instead, a small private repo
clones a pinned upstream release at build time and copies your catalogue in.
If you're comfortable with Git, [option 4](#option-4--fork-in-a-self-hosted-gitlab)
is usually simpler overall: the catalogue lives in your fork, and updating is
a merge. Choose option 2 when you'd rather not maintain a repository of
JoveWorks at all.

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

Five build settings are available as environment variables, so none of this
needs source changes:

| Variable | Effect |
|---|---|
| `JOVEWORKS_CHANNEL` | The text in the version badge. Distinguishes your deployment from the public nightly and stable builds. |
| `JOVEWORKS_BASE_PATH` | Where the editor is served. Defaults to `/`. For a subpath, give the absolute path (`/joveworks/`): the docs then build for `/joveworks/docs/` too. `./` makes the editor itself work at any path, but leaves the docs built for `/docs/`. |
| `JOVEWORKS_DOCS_BASE_PATH` | Overrides where the docs are built for; must be absolute. Only needed with a relative `JOVEWORKS_BASE_PATH`, e.g. `JOVEWORKS_BASE_PATH=./ JOVEWORKS_DOCS_BASE_PATH=/joveworks/docs/`. |
| `VITE_CLOUD` | Leave unset to compile out all cloud features. See below. |
| `VITE_EXAMPLE_CATALOGUES` | Set to `on` to include the example catalogues in `packages/editor/src/catalogues/examples/` (photography, running, machining, basic mechanics) and the samples built on them. Leave unset to leave them out. Your own catalogues in `src/catalogues/` are bundled either way. |

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

**This is the recommended setup.** You keep a copy of JoveWorks in your own
GitLab, with the public repository added as a second remote called
`upstream`. Updating means merging the next release from `upstream`. Your
catalogue is a set of files committed to your copy. If you later want to fix
something or contribute a change, the same repository already supports that.

Everything stays on your own infrastructure: the source, the catalogue, the
build and the served files.

### Setting it up

Create an empty project in your GitLab, then:

```bash
git clone https://github.com/joveworks/joveworks
cd joveworks
git remote rename origin upstream
git remote add origin https://gitlab.your-university.be/your-group/joveworks
git remote set-url --push upstream DISABLED   # pull from upstream, never push to it
git push origin main --tags
```

`git remote -v` should now show:

```
origin    https://gitlab.your-university.be/your-group/joveworks  (fetch)
origin    https://gitlab.your-university.be/your-group/joveworks  (push)
upstream  https://github.com/joveworks/joveworks                  (fetch)
upstream  DISABLED                                                 (push)
```

That is the whole model: **pull from `upstream`, push to `origin`.** You have
no write access to upstream anyway. Disabling the push URL makes a mistaken
push fail on your side, without anything being sent.

### Adding your catalogue

The editor bundles every `*.json`, `*.yaml` and `*.yml` file found directly in
`packages/editor/src/catalogues/` at build time. Adding a catalogue means
putting your files there and committing them:

```bash
cp ~/course/your-institution-*.yaml packages/editor/src/catalogues/
git add packages/editor/src/catalogues/your-institution-*.yaml
git commit -m "Add course catalogue"
git push origin main
```

Changing a formula works the same way: edit the file, commit, push, and CI
rebuilds. Students get the change on their next page load, because asset
filenames are content-hashed.

Give your files a distinctive prefix, like `your-institution-` above. Upstream
never edits files it didn't create, so with prefixed names your catalogue
commits cannot conflict when you merge a release.

The example catalogues upstream ships live in the `examples/` subfolder and
are left out of the build unless you set `VITE_EXAMPLE_CATALOGUES=on`. Leave
the files there even if you never use them: deleting them from your fork
would conflict on every release that touches them.

### Updating to a new release

```bash
git fetch upstream --tags
git merge v0.27.0            # the release you want
git push origin main         # CI rebuilds and deploys
```

Two rules:

- **Merge a release tag, not `upstream/main`.** Upstream's `main` is the
  development branch, which the public site serves as its nightly build.
  Release tags are the tested versions. Merging a tag also means you choose
  when an update happens: a quiet week between semesters is better than the
  week a bug needs fixing. The
  [releases page](https://github.com/joveworks/joveworks/releases) lists the
  tags and what changed in each one.
- **Merge, don't rebase.** Your `main` has already been pushed and your CI
  builds from it. Rebasing onto upstream rewrites that history, so every
  update would need a force push, and anyone else with a clone would have to
  reset theirs.

If your only changes are catalogue files, a merge never conflicts, and
updating takes the three commands above. Conflicts are possible only once you
change JoveWorks' own source. Keep those changes small and on named branches,
so a conflict shows up as one focused edit rather than a wall of unrelated
ones.

GitLab can automate the fetch with **pull mirroring**, but pull mirroring
(remote → GitLab) is a paid-tier feature. Push mirroring goes the other way
and does not help here. On the free tier, the manual `git fetch upstream`
above is enough.

### Merge requests inside your GitLab

Your merge requests are ordinary GitLab merge requests: branch from your
`main`, open a merge request into your `main`, review, merge. They stay inside
your GitLab and never reach upstream.

### Contributing changes back

Upstream is on GitHub, and a GitHub pull request can only be opened from a
branch that is itself on GitHub. Your GitLab branches cannot be offered to
upstream directly. To contribute, fork
`joveworks/joveworks` on GitHub (a personal or departmental account is fine)
and add that fork as a third remote:

```bash
git remote add github https://github.com/<your-account>/joveworks
```

Then, for each change:

1. **Branch from `upstream/main`, not from your own `main`.** Your `main`
   contains your catalogue, local changes and merge commits. A branch cut from
   it carries all of them into the pull request.

   ```bash
   git fetch upstream
   git switch -c fix-axis-labels upstream/main
   git cherry-pick <sha-of-your-fix>      # or redo the change here
   ```

2. **Check the branch against upstream before pushing.** Both commands below
   must print nothing:

   ```bash
   git log upstream/main..fix-axis-labels -- packages/editor/src/catalogues/
   git diff upstream/main...fix-axis-labels | grep -i your-institution
   ```

   Also confirm by eye that the change contains **no catalogue content**: no
   formula expressions and no fixtures taken from your textbook, not even as
   a test case. Invented formulas like `y = a*b + c` test the code just as
   well and don't bring any licence restrictions with them.

3. **Run upstream's checks:** `pnpm typecheck` and `pnpm test`. Both are
   fast.

4. **Push to your GitHub fork and open the pull request there:**

   ```bash
   git push github fix-axis-labels
   ```

   Open the pull request from `<your-account>:fix-axis-labels` into
   `joveworks:main`.

5. **After it lands**, the change reaches you again in the next release you
   merge. If upstream took it unchanged, Git usually resolves it cleanly. If
   upstream edited or squashed it, you may get a small conflict. Resolve it in
   favour of upstream's version, which drops your local copy of the patch.

Only ever push a branch that was cut from `upstream/main` to `github`, and
never `main`. Git sends only the commits reachable from the branch you push,
so a branch cut from `upstream/main` has no path back to your catalogue
commits. Pushing your own `main` would publish the entire history, catalogue
included, and a deleted branch on GitHub does not reliably undo that.

If pushing to GitHub is awkward under your policies, send a patch series
instead. The output of `git format-patch upstream/main..fix-axis-labels`,
attached to an email, works just as well and needs no GitHub account.

### Building in GitLab CI

Because the catalogue is already in the repository, the Dockerfile can build
from the checkout directly, with no clone step. Keep it under a directory
upstream won't use, for example `deploy/your-institution/Dockerfile`:

```dockerfile
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /src
COPY . .
ENV JOVEWORKS_CHANNEL=your-institution
RUN pnpm install --frozen-lockfile && pnpm build:bundle

FROM nginx:alpine
COPY --from=build /src/packages/editor/build /usr/share/nginx/html
COPY deploy/your-institution/nginx.conf /etc/nginx/conf.d/default.conf
```

`nginx.conf` is a `server { }` block that includes the SPA fallback from
`deploy/stable-bundle/nginx.conf.snippet`. The build settings in the table
under option 2 (`JOVEWORKS_CHANNEL`, `JOVEWORKS_BASE_PATH`, `VITE_CLOUD`,
`VITE_EXAMPLE_CATALOGUES`)
apply here too.

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
      --dockerfile "$CI_PROJECT_DIR/deploy/your-institution/Dockerfile"
      --destination "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA"
      --destination "$CI_REGISTRY_IMAGE:latest"
```

Keep `.gitlab-ci.yml` and anything else you add at the repository root to
files upstream doesn't have. That keeps release merges conflict-free.

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
a cloud-free deployment, build it yourself with option 4 or 2, or ask for a
bundle built without the flag.

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
