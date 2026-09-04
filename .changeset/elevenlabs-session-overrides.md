---
"@memberjunction/ai-elevenlabs": patch
---

ElevenLabs realtime: per-session `llm`, agent-body `temperature`, and drift that actually re-PATCHes.

Both settings were authored, accepted and normalized, then dropped at the driver. The fix is deliberately **asymmetric**, because the platform decided the shapes:

- **`llm` is genuinely per-session.** `PromptAgentApiModelOverrideConfig.llm` exists, so it is enabled, required and sent. `BuildSessionOverrides` includes `agent.prompt.llm` when the config bag carries one and omits it entirely otherwise, so an unconfigured session's initiation frame is byte-for-byte unchanged.
- **`temperature` is agent-body state.** The override config has no enablement flag for it, so sending it per-session would be transmitted and silently discarded — the exact defect this closes. It is written into the agent body at ensure instead.

Agent-body state then needs drift handling, which is the substance of the change. `ModelSettingsSatisfied` re-PATCHes when the remote body's `llm`/`temperature` differ from the desired settings, and **an unconfigured desire matches anything** — half the point of a managed agent is that a deployment may hand-tune it, so a bag that says nothing must not stampede a PATCH war against a tuned value. The ensure cache also keys on the desired settings, without which a config change inside one process lifetime is served from cache and never reaches the drift check at all — the same never-re-PATCHed defect one layer earlier.

The five fixture agents in the ensure-flow round-trip tests gained `llm: true` because an agent this driver provisions now carries it; that is the round-trip contract holding, not fixture drift.
