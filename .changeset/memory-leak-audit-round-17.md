---
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/testing-engine": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/code-execution": patch
---

Memory-leak audit round 17 fixes.

- **Core entity forms:** twelve custom form components (Lists, Tests, Entities, Templates, AI Agent Runs, Search Scopes, AI Agents, AI Prompt Runs, Queries) overrode `ngOnDestroy` without calling `super.ngOnDestroy()`, so every opened form stayed subscribed to the root-singleton form-state stream. They now call `super`.
- **Testing engine:** the per-suite rubric version pins and labels grew on every run on a process-lifetime driver. They are now bounded LRU caches with a TTL.
- **CodeGen:** `RunCommand` now clears its timeout timer when the command finishes first, so it no longer kills a recycled PID later or holds the event loop open.
- **Code execution:** a sandbox worker that fails to start is now killed instead of orphaned, and `Shutdown()` decides whether a worker has exited from `exitCode`/`signalCode` rather than `killed`.
