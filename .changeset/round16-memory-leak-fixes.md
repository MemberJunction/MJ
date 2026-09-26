---
"@memberjunction/ai-agents": patch
"@memberjunction/actions": patch
"@memberjunction/ai-agent-harness": patch
"@memberjunction/code-execution": patch
---

Round 16 memory-leak audit fixes: bound three previously-unbounded caches and fix a dead process-kill escalation.

- `RealtimeClientSessionService`'s `sessionWireActionMaps`/`targetWireActionMaps`/`sessionDirectConfigs` and `bridge-room-transcript-sink.ts`'s `roomToConversation`/`writeChains` were plain `Map`s on process-lifetime objects with no session/room-ended hook to evict on — every realtime voice session or meeting room ever handled left a permanent entry. Converted to `MJLruCache` (bounded, TTL'd), mirroring the same file's existing `promptRunWriteChains` pattern.
- `EntityActionEngineServer.RunEntityAction()` constructed a fresh `EntityActionInvocationBase` on every single dispatch instead of reusing one per invocation type, silently discarding the Script invocation type's own `_scriptCache` before a second lookup could ever hit it. Added an instance cache keyed by `InvocationType.Name`.
- `ChildProcessExecutor`'s `Kill()` sent only `SIGTERM` with no `SIGKILL` follow-up, on the hot path of every AI-agent CLI turn. Added a `SIGTERM`→5s grace→`SIGKILL` escalation.
- While testing that escalation, found `WorkerPool.Shutdown()`'s own `SIGTERM`→`SIGKILL` escalation — believed correct since this audit's Round 10 — was dead code: `ChildProcess.killed` is set `true` synchronously once `kill()` sends a signal, not once the process exits, so the old `if (!worker.process.killed)` guard never actually fired `SIGKILL`. Fixed to key off the process's `exit` event instead.

No behavior changes on any success path; all four packages' full test suites pass with new coverage for each fix.
