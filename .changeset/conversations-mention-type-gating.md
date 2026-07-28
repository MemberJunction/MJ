---
"@memberjunction/ng-conversations": minor
---

Per-type mention gating on the chat area. `allowAgentMentions`, `allowEntityMentions`, and `allowSkillCommands` (all default `true`, all under the pre-existing `allowMentions` master) forward host-level caps to `mj-ai-composer`'s existing `EnableAgentMentions` / `EnableEntityMentions` / `EnableSkillCommands` toggles, through every composer consumer — the empty state and both message inputs. No composer or trigger-provider logic changes; the composer already treated `@` agents, `#` entities, and `/` skills as three independent plugins, and only the forwarding was missing.

This lets a surface offer `/` skill commands while dropping `@` agent mentions. That matters because an `@` outranks the entire default-agent resolution chain, so a host pinned to one agent via `[defaultAgentId]` has not really pinned it while `@` is available. Disabling a type removes its trigger provider rather than hiding UI, and `allowMentions=false` still disables all three regardless of the per-type flags.
