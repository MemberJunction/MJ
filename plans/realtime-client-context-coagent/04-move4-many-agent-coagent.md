# Move 4 — Many-agent co-agent

**Goal:** Generalize the co-agent from "voice of one target agent" to "voice of this app," able to delegate to **any number of async agents (loop or flow), statically or dynamically linked**, with disclosure-aware narration.

**Depends on:** Move 1 (static allowed set in `AgentSettings.RelevantAgents`) + Move 3 (dynamic additions over the channel; `invoke_agent` dispatched via `ContextTool`). **Independently shippable** once those land.

## Today's single-target model

- One stable tool `invoke-target-agent` (`INVOKE_TARGET_AGENT_TOOL_NAME` in `packages/AI/Agents/src/realtime/realtime-tool-broker.ts`).
- Target lives in session `Config.targetAgentID`, resolved at runtime, exactly one.
- `RealtimeToolBroker.DelegateToTarget()` runs the target as a full `AIAgentRun` and narrates progress as context notes; loop vs flow is already transparent (it's just an agent run).

The delegation *mechanism* is reusable as-is. What changes is **how many targets** and **how the co-agent chooses + discloses**.

## Design

### 4.1 The allowed-target set (union, not single)
Replace the single `Config.targetAgentID` with an **accumulated union** of allowed targets, gathered from (low → high specificity, deduped by AgentID):
1. **Type-level** default targets (optional, in `AIAgentType.DefaultConfiguration.realtime.allowedAgents` — rare; usually empty).
2. **Co-agent / lead agent** config (`AIAgent.TypeConfiguration.realtime.allowedAgents`).
3. **App** (`Application.AgentSettings.RelevantAgents`) — the primary static source.
4. **Dynamic** (registered at runtime via `ClientContextChannel.RegisterAllowedAgent`) — "while you're on this screen you can also pull in X."

The lead identity (whose voice it is) stays single and comes from the default-agent chain (`AgentSettings.DefaultAgentID` → … → Sage). The union is **who the lead can call**, not who it is.

> Allowed-agents **accumulate** (union); they do not replace per-layer. This differs from the scalar config cascade (persona/disclosure/model), which is per-key override. Documented in [05](05-config-cascade-and-shared-types.md).

### 4.2 `invoke-target-agent` → `invoke_agent`
- Rename/generalize the tool to `invoke_agent` with parameters `{ agentId | agentName, request }`. (Exposed as an `action` through `ContextTool` per Move 3 — so it isn't even a separate provider tool; it's one of the valid actions the manifest advertises.)
- Broker validates the requested agent is in the current allowed union; if not → structured error ("I can't reach that agent here").
- Resolves the agent, runs `DelegateToTarget()` (unchanged delegation mechanics — abort signal, progress narration, paused-run resume, artifacts).
- The allowed-agent manifest (names + descriptions + kind) streams to the model over `ClientContextChannel.Capabilities.Agents` (Move 3.2), so the model knows its colleagues and when to call them.

### 4.3 Disclosure-aware narration
Effective disclosure for a delegation = `targetEntry.Disclosure ?? effectiveDefaultDisclosure` where:
- `effectiveDefaultDisclosure` comes from the scalar cascade (type `'mention'` default → agent → app → runtime).
- `targetEntry.Disclosure` is the per-target override on the `RelevantAgents` / dynamic entry.

Behavior:
- `mention` (default): the lead names the handoff — *"Let me bring in Skip for that…"* before/while delegating.
- `silent`: the lead absorbs the result and speaks it as its own; delegation is invisible.
- `hand-voice` (future): heavier handoff where the colleague takes the mic — spec the seam now, implement later.

The framing prompt (`BuildRealtimeAgentFraming` in `realtime-tool-broker.ts`) is generated from **lead identity + effective default disclosure + the allowed-agent union**, so the model is told who it is, who it can call, and how to narrate handoffs.

### 4.4 Config-shape additions
Extend `RealtimeConfigSection` (in `realtime-coagent-config.ts`) with:

```typescript
interface RealtimeConfigSection {
    // ...existing (modelPreference, voice, video, narration, turnTaking, allowUserModelOverride)...
    /** Default delegation disclosure for this co-agent. */
    disclosure?: 'silent' | 'mention' | 'hand-voice';
    /** Static allowed delegation targets (union-accumulated across layers + dynamic). */
    allowedAgents?: RealtimeAllowedAgent[];
}

interface RealtimeAllowedAgent {
    agentId: string;
    label?: string | null;
    disclosure?: 'silent' | 'mention' | 'hand-voice' | null; // per-target override
}
```

`normalizeConfig()` gains normalizers for `disclosure` (enum-validate, drop unknown) and `allowedAgents` (array of well-typed entries). The **union accumulation** of `allowedAgents` is handled *outside* `DeepMergeConfigs` (which would array-replace) — a dedicated `accumulateAllowedAgents(...layers, appSettings, dynamic)` helper that dedupes by `agentId`, last-writer-wins on per-entry fields.

### 4.5 Session config migration
Sessions currently persist `Config.targetAgentID`. Move to `Config.leadAgentID` (identity) + a resolved-at-runtime allowed union (not persisted in full — recomputed from cascade + live channel registrations on resume). Since realtime is unpublished, no data migration — just change the shape.

## Tests
- `accumulateAllowedAgents` unit: union/dedupe across type+agent+app+dynamic, per-entry override precedence.
- Disclosure resolution unit: per-target override beats default; default cascades type→agent→app→runtime.
- Broker unit: `invoke_agent` rejects out-of-union targets with a structured error; accepts in-union; delegation mechanics unchanged (mock `DelegateToTarget`).
- Framing-prompt golden test: lead identity + disclosure + N colleagues renders as expected.
- Run `AI/Agents` realtime suite (incl. `realtime-coagent-effective-config.test.ts` — extend it).

## Risks / notes
- **Persona/voice when many agents** — keep the lead's voice stable; do **not** swap voices per delegation under `mention`/`silent`. `hand-voice` (voice swap) is explicitly deferred.
- **Target-agent config layer** — the existing cascade merges a *single* target's `TypeConfiguration`. With many possible targets, that layer applies **per active delegation**, not globally; ensure effective-config resolution is computed at delegation time for the chosen target, while the *session* config uses only lead + app + runtime. Call this out in [05](05-config-cascade-and-shared-types.md).
- **Authorization** — `DelegateToTarget` already does a `CanRun` check on the target. Keep it; the allowed union is a UX/affordance filter, **not** the security boundary. Both apply.
