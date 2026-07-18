---
"@memberjunction/ai-openai": minor
"@memberjunction/ai-xai": minor
---

Modernize the OpenAI Realtime driver for the GA Realtime API (gpt-realtime-2.1 era) and refactor the Grok driver to subclass it instead of cloning it.

**`@memberjunction/ai-openai`** — `OpenAIRealtime`/`OpenAIRealtimeSession` are now the shared implementation for the whole OpenAI-Realtime-protocol driver family, parameterized by a new exported `OpenAIRealtimeProfile` (provider key, input-transcription model, turn-detection builder, config-deferral flag, GA feature gates). New GA features, driven from the open session `Config` bag with MJ-idiomatic keys and translated to provider-native fields **only when the profile confirms support** (and always scrubbed so raw keys never leak to a provider):

- `reasoningEffort: 'minimal'|'low'|'medium'|'high'|'xhigh'` → session `reasoning.effort` (validated; invalid values dropped with a diag log)
- `parallelToolCalls: boolean` → session `parallel_tool_calls`
- `mcpTools: [{ type:'mcp', server_label, server_url|connector_id, ... }]` → appended to `session.tools` alongside function tools (remote MCP servers/connectors execute provider-side). No approval UX exists yet, so declare servers with `require_approval:'never'`; an `mcp_approval_request` and failed MCP calls are surfaced as recoverable session errors instead of silently stalling.

All features apply identically on the server-bridged path (`session.update`) and the client-direct path (the minted `SessionConfig`), so the browser client needs no changes. The constructor accepts an optional `baseURL` for OpenAI-compatible providers; `extractRealtimeFeatures` is exported for reuse/tests. Behavior for existing sessions is unchanged (verified by the pre-existing test suite passing untouched).

**`@memberjunction/ai-xai`** — `xAIRealtime`/`xAIRealtimeSession` now **subclass** the OpenAI driver with `XAI_REALTIME_PROFILE` instead of maintaining a ~600-line protocol clone, deleting the duplicated event loop while keeping Grok specifics (api.x.ai base URL, whisper-1 transcription, always-explicit `server_vad` + `create_response` turn detection, immediate config send). GA feature gates are OFF pending xAI documentation — feature keys in a shared co-agent config are scrubbed, never sent raw to Grok; enabling later is a one-line profile flip. Inherited improvements: `Capabilities`/`Reconfigure` (live turn-mode changes), blank-instruction-safe `RequestSpokenUpdate` (a blank value no longer overrides the session prompt with an empty string), and `disableAutoResponse` now correctly translates to `create_response:false` instead of leaking raw into the session payload.
