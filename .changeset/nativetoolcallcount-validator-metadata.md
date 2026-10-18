---
"@memberjunction/codegen-lib": minor
---

Ship the CodeGen validator for `AIAgentRunStep.NativeToolCallCount` as data (#4647).

The migration that added the column and its CHECK constraint did not ship the `GeneratedCode` row CodeGen reads to emit the field's `Validate...` method. CodeGen only skips the LLM when a stored row's `Source` matches the live constraint definition exactly, so on a fresh database — which is what `CodeGen drift gate` builds, with AI disabled — no validator was emitted, while the committed `__mj.ts` contained one. That is a permanent drift no rerun can clear; it has been red on `next` since 2026-09-18.

This adds the row, following the same pattern every other field-level validator already uses. No schema change and no runtime behaviour change.
