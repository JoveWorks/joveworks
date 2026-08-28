# Deployment readiness — 2026-08-28

What stands between JoveWorks today and a real classroom cohort. Written
against the state of `joveworks` (editor + docs-site), `joveworks-backend`
(Hub), the private `machine-design-catalogue`, and the two live deployments,
checked rather than taken from the existing notes.

This document is for annotation. Add remarks as blockquotes so they stand out
from the findings:

> **TVR:** confirmed against the book on 2026-08-30.

Each finding records what was *verified* and how, so a remark can disagree
with the evidence rather than with an assertion. Where a remark has since been
folded into the finding itself, it is marked **Resolved by annotation** —
that prose reflects Thomas's decision, not further independent investigation,
and is distinguished from evidence in the same way a `> **TVR:**` blockquote
would be.

---

## Things already done that the notes still call open

Recorded first, because several "still open" items are not, and planning
against the notes would waste a session.

- **Hub is live.** `https://jovehub.thomasvanriel.com/healthz` returns 204;
  `/.well-known/joveworks` serves. A real course exists —
  `machine-design` / "Machine Design 2026-2027" — alongside `test-course`.
  It correctly refuses the course manifest without a course token.
- **The editor is live** at `https://joveworks.thomasvanriel.com`.
  `/p/{id}` redirects to `?hub=…&publication=…`, which the editor actually
  handles (`packages/editor/src/App.tsx:229` and `:651`).
  `packages/editor/src/viewer/CourseMaterialViewer.tsx` exists (416 lines).
- **A release was cut.** `v0.21.0` is tagged and `origin/production` points at
  `chore(release): 0.21.0`.
- `docs/next-session.md` still says the release workflow "has still never
  executed" and that "nothing is pushed, in either repo". Both are now false:
  `main` and the catalogue repo are level with their origins.
- `joveworks-backend/docs/FEATURE-REVIEW.md` still says `/p/{id}` is "still a
  redirect, not a reader page" and that editor viewer integration is missing.
  Stale on both counts.
- `pnpm build && pnpm test` passes clean (exit 0).

The plumbing is largely built. What is missing is not features.

**Resolved by annotation.** Thomas: update the docs to reflect the actual
state. That is an action, not an open question, and it is already underway —
not by this document, but by other agents working the affected files
directly. As of this pass it is genuinely in progress rather than merely
promised: `joveworks/AGENTS.md`, `joveworks/OVERVIEW.md`, `joveworks/deploy/stable-bundle/README.txt`,
`joveworks-backend/docs/HOMELAB-DEPLOYMENT.md`, and
`joveworks-backend/docs/FEATURE-REVIEW.md` and
`machine-design-catalogue/CLAUDE.md` all carry uncommitted edits toward exactly
this as of this pass. Nothing is committed yet, in any of the three
repositories. This document does not duplicate that work; it only records that
it is happening.

> **Annotation:**

---

## Blocking

Findings 4 and 5 have moved out of this section — see "Login and identity"
below, which merges them into one project that is not ship-blocking for a
pilot.

### 1. Regenerating the catalogue: now a stale instruction, not a live risk

**Verified by reproduction.** Running the extractor against its source:

```text
tools/extract/c16_belt.py  →  54 records:  7 verified, 42 unverified, 5 quarantined
committed c16-belt.json    →  54 records: 31 verified, 23 unverified, 0 quarantined
```

1127 differing lines after key-sorted normalisation. Record ids still match
1:1, so nothing was lost — but the catalogue repo's `CLAUDE.md` instructed the
next person to *regenerate rather than edit*. Following that instruction would
have re-quarantined five formulas and un-verified twenty-four, silently.

**Resolved by annotation.** Thomas: that regenerate line is not valid
anymore. The catalogue steered too far from the original extractor's format
to still rely on it, the predecessor source it reads has errors of its own,
and every chapter is now transcribed by hand. This changes the *remedy*, not
the *priority* — there is no drift left to repair, because regeneration was
never going to be the workflow again. What needed fixing was three places
that still told the next agent to do it anyway:
`machine-design-catalogue/CLAUDE.md` around lines 50-53 and 80-82, and
`joveworks/AGENTS.md`, which framed `tools/extract/` as a production path
rather than a historical bootstrap.

That edit is written but **not yet committed**. In the catalogue repo,
`CLAUDE.md` now states plainly that the scripts must not be re-run against the
catalogue and that doing so would throw away the sign-off work recorded in each
record's `status`. The matching edits to `joveworks/AGENTS.md`,
`joveworks/OVERVIEW.md` and the header comments of the three scripts in
`tools/extract/` are likewise uncommitted as of this pass, part of
the same doc-truing-up work recorded above. In both places the scripts are
kept rather than deleted, per Thomas's recommendation — they record where the
transcription originally came from — and are now labeled a historical
bootstrap instead of a path anyone should run again.

This finding stays first in the ship-blocking order even though the danger it
originally described (silent data loss) is gone: it is cheap, and clearing it
is what makes the rest of the catalogue safe to touch without a stale
instruction inviting someone to blow away the sign-off work in finding 2.

> **Annotation:**

### 2. Formula content is not signed off

| Chapter | verified | unverified | quarantined |
| --- | ---: | ---: | ---: |
| c16 belt | 31 | 23 | 0 |
| c12 press-fit | 16 | 14 | 0 |
| **c17 chain** | **0** | **28** | **6** |

All three rows independently re-verified against the committed files for this
pass: `python3` over `formulas/c16-belt.json` and `formulas/c12-pressfit.json`
gives exactly 31/23/0 and 16/14/0; `formulas/c17-chain.yaml` has no `yaml`
module available in this environment, so its 34 records were counted with
`grep -c` over the `status:` lines instead — 0 `verified`, 28 `unverified`, 6
`quarantined`. All three counts match what was already in this document.

Chapter 17 has zero verified records and is not teachable as it stands. Its
28 unverified and 6 quarantined records are the bulk of the remaining staff
work, and whether chain stays in scope this semester turns on how much of it
teaching staff can clear.

**Resolved by annotation.** Thomas: catalogs will be verified by teaching
staff, and examples will be provided too in the backend. This resolves
ownership — sign-off was never a task for Thomas alone, and this document's
earlier framing of it as such was the wrong frame. It also closes the open
question this document raised about whether 16.31's specific power, 16.34's
unit tag, and 16.36B's sum were confirmed against R&M or merely applied:
queried directly against `formulas/c16-belt.json` for this pass, all three
records (`rm.16.31`, `rm.16.34`, `rm.16.36B`) carry `"status": "unverified"`.
A verification pass reaches them through the ordinary route — nothing is
hidden behind a `verified` flag that would let them slip through unread.

One caution carries forward for whoever runs that pass: these three are not
plain transcriptions. Each refused a literal reading of the printed formula
and was resolved by applying a correction — the specific-power reading for
16.31, the corrected unit tag for 16.34, the sum instead of a product for
16.36B — rather than by copying the book's expression as printed. Verifying
them means checking the correction itself against R&M, not merely confirming
that the file matches what a naive transcription would have produced.

> **Annotation:**

### 3. Students are being served the nightly channel

`joveworks.thomasvanriel.com` and `joveworks.netlify.app` serve the
byte-identical bundle (`index-BHXOMNV2.js`), whose version badge renders
`alpha · nightly v0.21.0`. Every push to `main` therefore lands on the
student-facing origin, mid-semester.

The entire stable apparatus — the `production` branch, the release workflow's
stable-bundle zip, `deploy/stable-bundle/` — exists and is not what students
touch.

Related, and worth telling the school explicitly: nightly and stable are
different origins, so localStorage — autosave, cached catalogues, unsaved
work — does not follow a student between them.

A second, coupled change is required: the Hub's `JOVEWORKS_EDITOR_URL`
(`joveworks-backend/src/main.rs:300`, consumed by `publication_link` at
`:1343`) currently points at the nightly origin, and it is what every
`/p/{id}` short link is built from. Repointing the hosted bundle to stable
without also repointing `JOVEWORKS_EDITOR_URL` leaves every course link
still sending students to nightly — the two must be changed together.

**Resolved by annotation.** Thomas: deployment will need to use the stable
bundle, and the instructions must say so explicitly. Accepted, and the
documentation work is already in progress, not just agreed in principle: as
of this pass, `joveworks/deploy/stable-bundle/README.txt` carries a new,
uncommitted section telling whoever deploys the bundle to notify the Hub
administrator of the origin they used, and
`joveworks-backend/docs/HOMELAB-DEPLOYMENT.md` carries an uncommitted
addition spelling out that `JOVEWORKS_EDITOR_URL` must be the stable origin
specifically — including a check-your-work step ("open that origin... check
its version badge reads `stable vX.Y.Z`") aimed exactly at the coupled-change
risk described above.

> **Annotation:**

### 4. Hub operations are hand-run

- No scheduled backup. `scripts/backup-db.sh` exists but nothing invokes it;
  the database lives in a Docker volume behind a "back up before upgrading"
  note. No cron entry and no systemd timer found on this host.
- **No CI in `joveworks-backend` at all** — 8 tests, no workflow — while the
  editor repository has one.
- No readiness probe, no metrics, and no audit trail for restricted reads.

(This is finding 6 in the original numbering, kept here to preserve the
identifier used in "Suggested order" below and in Thomas's annotations.)

> **Annotation:**

---

## Login and identity — merges findings 4 and 5, not ship-blocking for a pilot

### Former finding 4: restricted content behind a shared token and open CORS

The live Hub answers `access-control-allow-origin: *`
(`joveworks-backend/src/main.rs:360`, `CorsLayer::new().allow_origin(Any)`).
Combined with a single global `JOVEWORKS_COURSE_TOKEN` shared by an entire
cohort — no per-student identity, no revocation, no rotation — a leaked token
exposes the R&M catalogue to anyone who has it.

**Resolved by annotation, and downgraded out of the blocking section.**
Thomas asked whether this should be treated as a concern at all: the school
distributes the material and holds the publisher relationship, it is not
secret data in the sense of personal information or credentials, and it is
data he does not want to publish in his own public repositories rather than
data that must never leave the Hub. He is right, and the finding is
downgraded accordingly. The exposure here is copyright, not confidentiality —
no personal data, no credentials involved — and that responsibility is
genuinely the school's to carry, not JoveWorks's to solve with access
control. The realistic failure mode is casual redistribution, and a shared token cannot
prevent that regardless of how it is implemented: a student who can compute
with the catalogue already holds it decrypted in their browser, and the
catalogue's own source material makes no DRM claim to begin with.

A technical correction belongs alongside this: **CORS is not the security
boundary here.** `allow_origin(Any)` does not by itself leak anything, because
the course token gates the read, and a browser that holds the token can
already send it from any origin it likes — restricting CORS would not change
what a holder of the token can reach. Tightening CORS would buy tidiness and
some resistance to casual scraping, not security, and should not be done for
safety reasons; doing it for those other reasons is a separate, much smaller
decision. The token's real and narrow job is keeping the catalogue off the
open internet and out of search-engine indexes, and it already does that job.

Two cheap things remain worth doing, neither of them urgent: get the school's
role as distributor stated in writing once, and document token rotation
(environment variable, container restart, students re-enter it) so that a
leak is a nuisance to clean up rather than an incident to manage.

### Former finding 5: a student can lose their work with no way to get it back

`packages/editor/src/model/workspaceAccess.ts` keeps workspace edit tokens in
localStorage only, and there are no accounts. Clearing browser data, switching
device, or using a lab machine makes the workspace unreachable — and Hub has
no way to identify the owner and restore it.

Compounding it, `docs/REVIEW-2026-08.md` item J1: autosave recovery failing is
indistinguishable from "there was nothing to recover", which is the worst
presentation a data-recovery feature can have. For a graded deliverable this
will generate incidents.

**Resolved by annotation, and merged with former finding 4.** Thomas: we need
some way to have them log in — a larger design problem for the coming weeks —
and asked whether it is standalone, noting the backbones (shared workspaces)
are already in. The answer is yes and no, and the "no" is the important half.
Standalone from the editor and kernel: yes — nothing in the `schema`, `units`,
`kernel`, or `nodes` packages changes; this is Hub-side work plus a thin auth
client in the editor, which is exactly why it can run in parallel with the
catalogue work in findings 1 and 2. Standalone from finding 4: no — they are
the same problem. Once students have identities and course memberships, the
shared course token disappears on its own, because a restricted read stops
being "does the caller hold the token" and becomes "is this user enrolled" —
there is no longer a secret to share or rotate.

Thomas's backbone read holds up: workspaces, edit tokens, shares, course pins,
and the existing migrations all survive this change; the work is additive —
add users, memberships, and roles — not a rewrite. One correction to the
mechanism, checked directly against the code rather than assumed: the
ownership check that would need to change is not inside
`validate_workspace_binding` (`joveworks-backend/src/main.rs:1159`) — that
function only validates the course slug and the pinned catalogue hashes, and
does not touch the edit token at all. The actual edit-token check is the
`edit_token_hash` comparison embedded in the SQL `WHERE` clause of
`replace_workspace` (`:1119`) and `delete_workspace` (`:1215`), each guarded
separately by `workspace_token(&headers)` and `sha256(token)`. Those are the
two places that would grow into an ownership check once a user record exists
to own against — `validate_workspace_binding` itself is unaffected.

The one thing that genuinely gates this project, and is not yet decided, is
the identity source: institutional OIDC versus LMS/LTI versus a
self-managed login. That choice determines weeks of downstream work — session
handling, how enrollment maps to course access, what the editor's auth client
looks like — and needs to be settled before implementation starts, not
discovered partway through it.

> **Annotation:**

---

## Second tier — will bite mid-semester

- **No catalogue migration path.** Documents migrate; catalogues refuse an
  unknown schema version outright.
- **No catalogue-mismatch recovery.** A version bump warns, but there is no
  "recompute against the new revision, here is what changed" path. Corrected
  formulas ship mid-semester by design, so this fires by construction.
- **The catalogue repository is still on the personal account**
  (`ThomasVanRiel/machine-design-catalogue`, confirmed via `git remote -v` for
  this pass) while the editor moved to the `JoveWorks` org. A half-migrated
  pair surfaces at the worst moment, and the catalogue is what the school's
  LMS serves.

  **Resolved by annotation.** Thomas: catalogues should be private; they are
  in his personal account for now, but the transfer is no problem. The
  transfer is agreed and unblocked — nothing is waiting on a decision here,
  only on doing it. One constraint to carry into that work: transferring the
  repository changes its URL, so anything referencing
  `ThomasVanRiel/machine-design-catalogue` (clone instructions, CI, local
  remotes, documentation) needs a sweep afterwards to pick up the new path.

- **Publication validation does not check formula references.**
  `validate_catalogue_refs` (`joveworks-backend/src/main.rs:814`) validates the
  pinned catalogue hashes only; it never verifies that the graph's formula
  references resolve against them.

> **Annotation:**

---

## Suggested order

**Ship-blocking:** 1 (extractor drift — now a one-edit documentation fix) →
2 (belt and press-fit sign-off, owned by teaching staff; c17 chain's 0/28/6
decides whether chain is in scope this semester) → 3 (point students at the
stable bundle, coupled with `JOVEWORKS_EDITOR_URL`) → 4 (Hub operations —
scheduled backup and backend CI).

**Not ship-blocking for a pilot, gated on a decision:** the merged login and
identity project (former findings 4 and 5) — *provided* students are told the
exported notebook is the real deliverable. It does not block a pilot, but it
does not start either until the identity source (institutional OIDC vs.
LMS/LTI vs. self-managed login) is decided; everything else in that project
is additive to what already exists and can proceed once that call is made.

> **Annotation:**
