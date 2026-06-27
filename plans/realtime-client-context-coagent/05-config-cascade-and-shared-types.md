# Cross-cutting — Config cascade & shared `ai-core-plus` types

This doc is the single reference for (a) where the new app layer inserts into the existing realtime config cascade, (b) the shared types that live in `ai-core-plus`, and (c) the disclosure/persona/allowed-agent model. Moves 1–4 all reference it.

## The cascade (existing + our insertion)

The realtime effective-config cascade already exists in `packages/AI/Agents/src/realtime/realtime-coagent-config.ts` (`ResolveEffectiveRealtimeConfig` + `DeepMergeConfigs`, deep-merge, later-wins-per-key, tolerant parse, normalize-don't-throw). We **insert one layer** and **extend one section**.

**Effective config precedence (low → high):**

| # | Layer | Source | Notes |
|---|---|---|---|
| 1 | Type default | `AIAgentType.DefaultConfiguration` | base; disclosure default `'mention'` lives here |
| 2 | Co-agent / lead | `AIAgent.TypeConfiguration` (lead agent) | the agent whose voice it is |
| 3 | Target agent | active target's `AIAgent.TypeConfiguration` | **per active delegation**, not session-global (Move 4) |
| 4 | **App** | **`Application.AgentSettings.Realtime`** | **NEW** — when app context is known |
| 5 | Runtime override | `configOverridesJson` | authorization-gated (`Realtime: Advanced Session Controls`) |

Two distinct merge semantics:
- **Scalars** (persona tone/style, `disclosure` default, `modelPreference`, narration, turn-taking) → **per-key deep-merge override** (existing `DeepMergeConfigs`). App only overrides keys it sets.
- **`allowedAgents`** → **union accumulation**, *not* per-key replace (Move 4.4 `accumulateAllowedAgents`). Layers add colleagues; they don't clobber each other. Dedupe by `agentId`, last-writer-wins on per-entry fields.

### Where to wire the app layer
`ResolveEffectiveRealtimeConfig(typeDefaultJson, agentJson, overridesJson, targetAgentJson?)` gains an `appSettingsJson` parameter, merged at position 4 (between target and runtime override):

```typescript
ResolveEffectiveRealtimeConfig(
  typeDefaultJson,        // 1
  agentJson,              // 2  (lead)
  targetAgentJson,        // 3  (active target, per delegation)
  appSettingsJson,        // 4  NEW — Application.AgentSettings.Realtime serialized
  overridesJson           // 5
)
```

The two call sites that build the cascade today both pass the new layer:
- server-bridged: `BaseAgent.resolveRealtimeEffectiveConfig()` (`base-agent.ts`)
- client-direct: `RealtimeClientSessionResolver.resolveBaselineEffectiveConfig()` (`MJServer`)

Both already have `applicationId` available at session mint (or can read it from the conversation/app context) → fetch `AgentSettingsObject.Realtime` from cached app metadata, serialize, pass in. No new query.

> **Note the target-agent subtlety (Move 4):** with many possible targets, layer 3 is resolved **at delegation time** for the chosen target. The *session-level* effective config (persona/voice/model the user hears) uses layers 1,2,4,5 only — the lead's identity, app overrides, runtime. A delegation transiently folds in the chosen target's config for *that run*, but does not change the lead's voice (unless disclosure = `hand-voice`, deferred).

## Shared types in `ai-core-plus`

`ai-core-plus` (`packages/AI/CorePlus`) is the client-safe home for everything both sides need. New modules:

| Module | Exports | Used by |
|---|---|---|
| `client-tool-resolver.ts` | `ResolveClientTools`, `IClientToolSource`, `ResolveClientToolsInput`, `FormatClientToolsForPrompt` | BaseAgent (server), realtime broker, conversations-runtime |
| `client-context.ts` | `ClientContextSnapshot`, `ClientContextAgentRef`, `FormatContextNote` | `ClientContextChannel` (both halves), surfaces |
| (existing) `agent-types.ts` | `ClientToolMetadata`, `AgentClientToolInvocation`, … | everything |

**Purity invariants:**
- No imports from `@memberjunction/server`, `@memberjunction/ai-agents` server code, Angular, or any engine. Data is injected.
- The disclosure union `'silent' | 'mention' | 'hand-voice'` is declared once here as `AgentDisclosurePolicy` and imported by all `ai-core-plus` consumers. The **metadata interface file** `IAgentSettings.ts` re-declares it by value (standalone-interface-file rule) — keep in lockstep with a cross-pointing comment.

## Disclosure / persona / lead model (one place)

- **Lead identity** = app's resolved default agent (default-agent chain: `AgentSettings.DefaultAgentID` → `ApplicationSetting` legacy → Sage). Single. "Who the voice is."
- **Allowed agents** = union(type, lead, app `RelevantAgents`, dynamic-from-channel). Many. "Who the lead can call."
- **Effective default disclosure** = scalar cascade (type `'mention'` → lead → app → runtime).
- **Per-delegation disclosure** = `targetEntry.Disclosure ?? effectiveDefaultDisclosure`.
- **Persona** (tone/speakingStyle) = scalar cascade; folded into the session system prompt at mint (existing behavior, now app-overridable).

The framing prompt (`BuildRealtimeAgentFraming`) is generated from **lead identity + effective default disclosure + allowed-agent union**.

## Test anchors
- Extend `realtime-coagent-effective-config.test.ts` for the new app layer (position 4) and the union accumulation.
- `client-tool-resolver.test.ts` (precedence) and `client-context.test.ts` (formatting) are new.
- Keep every resolver/merge function pure and deterministic — no `Date.now()`/`Math.random()` in `ai-core-plus`.
