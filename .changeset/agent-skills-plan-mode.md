---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-agent-client": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/aiengine": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/conversations-runtime": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
---

Agent Skills, Plan Mode, and realtime widget UX.

**Agent Skills** — portable `SKILL.md` import/export, a first-class Skill step wired into the Loop agent runtime, Skills engine caching + agent-gating resolution, the `AI Skills` resource type with "Can Share Skills" authorization, and the AI Skill sharing panel in the entity forms. Includes the skill-markdown converter/operations and the generated entity + resolver surface for the new Skill entities.

**Plan Mode** — a human-in-the-loop plan-approval gate for the Loop agent (server + client), threaded through the agent client session/types, the GraphQL AI client, and the conversations composer/message-input UI so a run can pause for plan review before executing.

**Realtime voice widget UX** — fixes and consolidation in `@memberjunction/ng-conversations`:
- Fixed `NG0100 ExpressionChangedAfterItHasBeenCheckedError` when opening the Details panel (defer the `ResizeObserver` seed + callback to a microtask).
- The surface/Details panel is now an independent right-hand peek gated on available width (not console chrome / text-reveal), so opening Details keeps the glowing orb and toggling captions off no longer removes the panel; the orb also returns immediately on captions-off.
- Type-to-compose: any printable keystroke opens the composer and seeds itself as the first character (removed the dedicated "T" hotkey + hint).
- Control consolidation: the banner is now state + window-chrome only (removed duplicate Captions/End controls, folded "pure audio" into the gear's Density = Simple); Captions is promoted to a first-class control in the compact lean dock.

**Remote Browser** — `RemoteBrowserSnapshot` now honors its documented best-effort contract: it returns an empty snapshot instead of throwing when the underlying browser adapter has been torn down, so the client's periodic live-view poll never surfaces a recurring GraphQL error (with unit coverage).
