# Locking a catalogue with a password

How to turn a plaintext catalogue into a password-shared one a student
unlocks in the editor — the mechanism `docs/password-shared-catalogues.md`
plans and `packages/schema/src/lockedCatalogue.ts` implements. This is the
"instructor" half; for how the resulting file is loaded in the app, see
`packages/editor/src/catalogues/locked/README.md`.

**This usually runs from the private catalogue repository, not this one** —
that is normally where the plaintext R&M content actually lives. Only the
locked (ciphertext) output belongs here, next to the unrestricted bundled
catalogues.

## 1. Have a valid catalogue file

Any file `loadCatalogue` accepts — see `docs/authoring-catalogues.md` or a
`tools/extract/*.py` script's output. Validate it first the normal way
(`JOVEWORKS_CATALOGUE=/path/to/file.yaml pnpm test`) — encrypting a broken
catalogue just produces a broken catalogue nobody can read the error from.

## 2. Pick a password for this course offering

One password per encryption, shared with the whole cohort — not a
per-student secret. **Rotate it every offering.** Git history is public and
permanent: a leaked password makes everything ever encrypted under it
retroactively recoverable from history, forever. A fresh password per term
means a leak exposes only that term's file, not every student who has ever
taken the course. Give each offering's locked file a distinct `id` too
(e.g. `rm-2026-fall`), so an old one doesn't silently overwrite a new one in
the palette.

## 3. Encrypt it

```sh
pnpm build   # packages/schema/dist must exist — the CLI imports the built package
JOVEWORKS_CATALOGUE_PASSWORD='…' pnpm encrypt-catalogue path/to/catalogue.yaml out/rm-2026-fall.json
```

The password comes from the `JOVEWORKS_CATALOGUE_PASSWORD` environment
variable, never a command-line argument — arguments end up in shell history
and process listings. The CLI (`tools/encrypt-catalogue/encrypt-catalogue.mjs`)
is a thin wrapper over `encryptCatalogue` (AES-GCM, keyed by PBKDF2-SHA256
over the password, 600,000 iterations by default): it derives a fresh key
under a random salt, encrypts the catalogue's own saved text, and writes out
a JSON file whose only readable fields are `id` and `name` — everything
else, including every formula, is ciphertext.

## 4. Ship it

Copy the output into `packages/editor/src/catalogues/locked/` in this
repository and commit it there. It is loaded the same way the unrestricted
bundled catalogues are (`import.meta.glob`,
`packages/editor/src/model/catalogues.ts`), so no other wiring is needed —
it just shows up in the palette, locked, the next time the app is built.

Publishing the ciphertext in this public repo is fine as long as the
password stays secret: the risk moves entirely onto the password, not the
hosting.

## 5. Hand out the password

Through the LMS, not through this repository or its commit history — a
commit message or PR description is exactly the kind of permanent,
searchable record step 2 is trying to keep the password out of.

## Unlocking, from a student's side

**File > Unlock catalogue…**, or the locked entry inline in the palette:
either opens the same password prompt. A correct password decrypts
client-side and loads the catalogue exactly like a file dropped through the
LMS — nothing ever leaves the browser, and after unlocking there is no
difference between the two paths. A wrong password fails cleanly (AES-GCM's
authentication tag rejects it outright) and can be retried.
