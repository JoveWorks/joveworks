# Locked catalogues

Password-shared restricted catalogues (`docs/password-shared-catalogues.md`)
live here as ciphertext, loaded the same way as the unrestricted catalogues
one directory up — `import.meta.glob`, see `../../model/catalogues.ts`.

Publishing ciphertext in this public repo is fine as long as the password
stays secret; the risk moves onto the password, not the hosting. Only the
catalogue's `id` and `name` are readable without it, so the palette can list
a locked entry before it is unlocked.

## Adding one

Produce the file with the encryption CLI (`packages/schema/src/lockedCatalogue.ts`
is the format and the crypto; the CLI is a thin wrapper over it):

```sh
pnpm build   # so packages/schema/dist exists
JOVEWORKS_CATALOGUE_PASSWORD='…' pnpm encrypt-catalogue path/to/catalogue.json packages/editor/src/catalogues/locked/<id>.json
```

This usually runs from the private catalogue repository, since that is
where the plaintext R&M content lives — copy the resulting locked JSON file
here and commit it.

## Rotating a password

Git history is public and permanent, so a leaked password makes every
catalogue ever encrypted under it retroactively recoverable. Rotate the
password per course offering: re-encrypt under a fresh password and give the
new file a fresh `id`, so an old cohort's password leaking only exposes that
cohort's file, not every student who has ever taken the course.
