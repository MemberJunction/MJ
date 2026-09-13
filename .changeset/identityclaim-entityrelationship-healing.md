---
"@memberjunction/core": patch
---

Unbreak the CodeGen drift gate — two independent CI defects, neither of which any branch could work around.

**The gate failed on its own scratch output.** Its diff step promised in a comment to ignore CodeGen's run file but only ever removed `codegen.output.log`. CodeGen writes a `CodeGen_Run_<timestamp>.sql` on every run — empty when it has nothing to emit — so that file alone made the gate unpassable at zero real drift. Both copies of the step now remove it.

**The idempotency check corrupted the first changed file's path.** `getGitStatusPorcelain` returned `stdout.trim().split('\n')`, and porcelain lines are `' M path'` with a 3-character prefix that callers strip with `substring(3)`. Trimming the whole buffer removes the leading space of the *first* line only, so that one path loses its first character — `packages/…` became `ackages/…` — which then matches no allow-list entry. That is the `Stage single-column failed: changed files outside allow-list` failure on `next`, reporting `ackages/Angular/...`. Only the first line was ever affected, which is why it surfaced intermittently. See #4323.
