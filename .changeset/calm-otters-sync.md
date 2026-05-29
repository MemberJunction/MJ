---
"@memberjunction/core": minor
---

Fix non-idempotent metadata sync for `.your-membership.json`: three Integration Object Field records each shared a `primaryKey.ID` with another field in the same file, causing `mj sync push` to route both records to the same DB row and ping-pong their checksums on every run. Stripped the auto-managed `primaryKey`/`sync` blocks from the duplicate (`IsPrimaryKey:false`) record in each pair so it re-inserts as its own row, leaving the file idempotent.
