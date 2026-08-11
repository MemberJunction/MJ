---
"@memberjunction/schema-engine": patch
"@memberjunction/server": patch
---

Make the RSU post-restart hand-off durable, so a large Apply All cannot silently finish with tables built and no entity maps.

Apply All builds the tables, writes a pending-work file describing what still has to be done, restarts MJAPI, and expects the returning process to create the entity maps that make those tables usable. `ReadAndClearPendingWork` deleted that file the moment it parsed it — before a single map was created — and the consumer runs its work inside a `catch` that swallows. So anything that went wrong part way (a throw on object 200 of 354, an OOM, a second restart) left the workspace looking healthy and idle, with every table built, not one entity map created, and no instruction anywhere to finish them. Nothing retried, because nothing was left to retry from, and nothing reported it: a connector in that state reads as connected and syncs nothing. The odds of hitting it scale with the number of objects selected, which is exactly backwards.

- `RuntimeSchemaManager` splits reading from clearing: `ReadPendingWork()` returns each item with its file path and leaves the file alone; `ClearPendingWork(path)` deletes one once its work has actually completed; `RewritePendingWork(path, data)` replaces a file with what is still outstanding, via write-temp-then-rename so a crash mid-write cannot leave a half-written instruction. `ReadAndClearPendingWork()` is kept, delegating to these, and marked deprecated.
- `RSUPendingWork` gains an optional `Attempts` counter.
- The server's post-restart consumer now records which objects it mapped, clears the file only when the whole item ran, and otherwise writes back the remainder with `Attempts` incremented — so the next boot resumes at object 200 rather than starting over or giving up. The accounting lives in a `finally`, which also covers the guard clauses' `continue` paths (no system user yet, connection not found), since those skip the work just as surely as a throw. After 3 attempts the file is dropped rather than retried forever, but loudly, naming the objects that were never mapped.

No behaviour change on the happy path: an item that completes is cleared exactly as before.
