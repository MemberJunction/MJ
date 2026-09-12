---
"@memberjunction/ai-cerebras": patch
"@memberjunction/communication-ms-graph": patch
---

Correct two comments that state things the code does not do.

`cerebras.ts` claimed `ChatCompletion` is not a union at the pinned SDK version and framed the narrowing as fixing a latent break that arrives with a future lockfile refresh. It is a union at 1.64.1 — the version the lockfile pins — and always has been; the original code coped by casting at each of the three reads, and the change replaced those with one narrowing at the declaration. The comment now says that, and explains why the reads collapse to `unknown` on the bare union (`ErrorChunkResponse` declares only `error` and `status_code`, and every member carries an index signature). The retained `usage` cast is removed with them: it was kept on the stated grounds that `usage` is nullable on the narrowed member, which is not true at 1.64.1 where it is required.

`MSGraphProvider.ts` said Reply reads `ContextData.Email` "as eleven sibling operations already read it". Nine do.

No behaviour change: the removed cast was a no-op on the pinned SDK, and the rest is comment text.
