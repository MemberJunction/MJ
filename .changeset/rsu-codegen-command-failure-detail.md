---
'@memberjunction/codegen-lib': patch
'@memberjunction/schema-engine': patch
'@memberjunction/server': patch
---

Report WHY an in-process CodeGen run failed instead of only that it did

A CodeGen run's success is decided entirely by its BEFORE/AFTER command failures
(`executeCodeGenPipeline` returns `commandFailures.length === 0`), and until now the text
explaining those failures was destroyed twice on the way out:

- `runCommand` rejected a non-zero exit with `Process exited with code N` and dropped the
  command's own stdout/stderr, so `recordCommandFailures` had nothing but the exit code to
  record. A build that failed because a source tree was missing and one that failed on a real
  compile error produced the same string.
- `RunInProcess` returns a bare boolean, so even the recorded failures never reached the
  in-process caller — and that caller (RuntimeSchemaManager, running inside a live server) has
  no console for a human to read the pipeline output from. Its RunCodeGen step could only throw
  `In-process CodeGen failed`.

Now the rejection carries a bounded tail of the command's output (40 lines / 4000 chars),
`RunCodeGenBase` exposes `CommandFailures` and logs them on an in-process failure, and RSU's
`RSUError('CODEGEN', …)` names the command and its message. `IRSUCodeGenRunner.LastRunFailures`
is optional, so a runner that cannot report detail degrades to the previous message rather than
claiming a cause it does not have.
