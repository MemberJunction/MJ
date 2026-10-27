---
"@memberjunction/ai-agents": patch
"@memberjunction/core-actions": patch
"@memberjunction/actions": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-anthropic": patch
---

Always-On Agent Harness plan, wave 1 (Lessons 6, 4 and the small Lesson 1 fixes):

- Action failures keep their own result code and `AIDirectives` instead of a bare `ERROR` (the execution log keeps it too), and a refusal by the user's agent policy gets a policy directive rather than "adjust your parameters and retry", even when the call is repeated.
- `Create Record` / `Update Record` refuse an unknown field with `VALIDATION_ERROR` (listing the entity's writable fields) before reading or writing anything, instead of dropping it and reporting success; wrong-case field names resolve to the entity's spelling.
- `Run Ad-hoc Query` and `Run Stored Query` no longer repeat the rows in `Message`, and render `FormattedResults` only when a `DataFormat` / `OutputFormat` is asked for; with no format the rows travel once, in `Results`.
- Every action result is tagged `messageType: 'action-result'`, so context recovery and post-run compaction can see it.
- `_HAS_CONVERSATION_CONTEXT` and `_CONVERSATION_LENGTH` count as volatile child-prompt placeholders; native tool declarations, their parameters and sub-agent tools are emitted in a fixed name order.
- OpenAI streaming requests ask for the trailing usage chunk (`stream_options.include_usage`), so streamed calls record prompt tokens, cache reads and cost.
- Anthropic requests place a cache breakpoint on the last tool declaration when one of the four breakpoints is spare.
