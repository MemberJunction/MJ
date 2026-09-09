---
"@memberjunction/core": patch
---

Stop the CodeGen drift gate failing on its own scratch output.

The gate's diff step promised in its own comment to ignore CodeGen's run file, but only ever removed `codegen.output.log`. CodeGen writes a `CodeGen_Run_<timestamp>.sql` on every run — empty when it has nothing to emit — so that file alone made the gate unpassable even at zero real drift. Both copies of the step now remove it, as the comment always claimed. See #4323.
