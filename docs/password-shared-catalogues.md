# Plan: password-shared catalogues (roadmap #28)

Goal: a student adds a restricted catalogue to their library by typing a
password — no file download, no file picker, no server.

## Mechanism

Symmetric, password-derived encryption, not public-key. One password both
encrypts (once, by the instructor) and decrypts (every student who has it);
public-key crypto only earns its complexity when different recipients need
their own revocable keys, which isn't the case here.

- Content key derived from the password via scrypt/PBKDF2.
- Catalogue JSON encrypted with AES-GCM (the auth tag turns a wrong password
  into a clean rejection, not garbage output).
- Ciphertext ships as a bundled asset in this (public) repo, next to the
  existing unrestricted catalogues in `packages/editor/src/catalogues/`,
  loaded the same way via `import.meta.glob` (see `catalogues.ts`). No
  hosting, no network fetch, no backend.

Publishing ciphertext of restricted content in a public repo is fine as long
as the password stays secret — the risk moves entirely onto the password,
not the hosting.

## Flow

1. Instructor encrypts the catalogue JSON with the term's password (a small
   CLI script, analogous to the existing extraction tooling) and commits the
   ciphertext asset.
2. Editor's palette shows the entry as locked (name/citation visible,
   formulas not) until unlocked.
3. Student enters the password once; the editor decrypts client-side and
   calls the existing `withCatalogue` + `cacheCatalogue` path — after that it
   behaves exactly like any other cached catalogue (no re-entry on reload).

## Open decision: password rotation

Git history is public and permanent. If a term's password ever leaks, the
plaintext becomes retroactively recoverable from repo history by anyone,
forever — there's no revoking a git blob the way an LMS permission can be
revoked. Rotate the password per course offering and re-encrypt/republish
under a fresh one each term, so a leak only exposes one cohort's blob instead
of every student who's ever taken the course. This should be decided and
built in from the start, not bolted on later.

## Non-goals

- No public/private keypairs, no per-student key management or revocation.
- No server or hosted fetch endpoint — the asset ships with the app.
- Not a general "share any graph/catalogue" mechanism — scoped to the
  restricted-catalogue-to-a-known-cohort case described in roadmap #28.
