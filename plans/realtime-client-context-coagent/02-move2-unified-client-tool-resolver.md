# Move 2 — Unified client-tool resolver

**Goal:** One tier-agnostic, side-agnostic resolver — the single source of truth for "what client tools does this agent have, here, right now." Runs client-side (resolve + execute with **no server round-trip**) or server-side (same function). Delete the two parallel resolution paths.

**Independently shippable:** Yes. It refactors existing behavior behind one function; the async path keeps working, realtime adopts it in Move 3.

## The three resolution paths today (to be unified)

1. **Async / server** — `BaseAgent.buildClientToolPromptSection()` in `packages/AI/Agents/src/base-agent.ts` does the three-tier, first-match-wins merge (static junction via `BaseAIEngine.GetClientToolsForAgent` → session-enriched tools from `ClientToolRequestManager.GetSessionTools` → `extraData.clientTools`).
2. **Conversations-runtime** — `ConversationsRuntime.Instance.Tools` (`ClientToolRegistry`) maintains its own client-side registry/execute.
3. **Realtime** — `RealtimeToolBroker` assembles its own tool set at session start, disjoint from both.

We collapse the *resolution* logic (which tools, in what precedence) into one pure function; each surface keeps only its own *data sources* and *execution*.

## Design

### 2.1 The shared resolver in `ai-core-plus`
New module `packages/AI/CorePlus/src/client-tool-resolver.ts`. Pure, no server imports, no Angular.

```typescript
import { ClientToolMetadata } from './agent-types';

/** A source of statically-declared tools (metadata tier). Injected so the resolver stays engine-free. */
export interface IClientToolSource {
    /** Static metadata tools for an agent (from the AI Agent Client Tools junction), already loaded. */
    GetStaticTools(agentId: string): ClientToolMetadata[];
}

export interface ResolveClientToolsInput {
    agentId: string;
    /** Static tier — pass a source OR the pre-resolved array (whichever the caller has). */
    source?: IClientToolSource;
    staticTools?: ClientToolMetadata[];
    /** Dynamic tier — tools registered at runtime for the current session/surface. */
    sessionTools?: ClientToolMetadata[];
    /** Override tier — per-invocation tools (highest precedence among the three). */
    overrideTools?: ClientToolMetadata[];
    /** App-scoped tools from Application.AgentSettings.ClientTools, already resolved to metadata. */
    appTools?: ClientToolMetadata[];
}

/**
 * First-match-wins by tool Name across tiers, in precedence order:
 *   override → session(dynamic) → app → static(metadata)
 * Returns a deduped, ordered ClientToolMetadata[]. Pure; deterministic; no I/O.
 */
export function ResolveClientTools(input: ResolveClientToolsInput): ClientToolMetadata[] {
    const map = new Map<string, ClientToolMetadata>(); // first writer wins
    const add = (tools?: ClientToolMetadata[]) => {
        for (const t of tools ?? []) if (!map.has(t.Name)) map.set(t.Name, t);
    };
    add(input.overrideTools);
    add(input.sessionTools);
    add(input.appTools);
    add(input.staticTools ?? input.source?.GetStaticTools(input.agentId));
    return Array.from(map.values());
}
```

> Precedence note: this preserves today's async first-match-wins ordering and **inserts the app tier** (Move 1) between dynamic and static — app tools are more specific than the agent's global static set but less specific than what a live surface registers. Confirm this ordering during review; it's the one new semantic.

### 2.2 Optional shared prompt-section formatter
The markdown the LLM reads ("here are your tools…") is currently inline in `buildClientToolPromptSection`. Extract a pure `FormatClientToolsForPrompt(tools: ClientToolMetadata[]): string` next to the resolver so async **and** realtime emit identical tool descriptions. Keeps one wording, one schema rendering.

### 2.3 Rewire the async path
`BaseAgent.buildClientToolPromptSection()` becomes a thin adapter:
- Gather the four tiers from its existing sources (engine static tools, `ClientToolRequestManager.GetSessionTools`, `extraData.clientTools`, **new:** app tools from the run's `applicationId` → `AgentSettingsObject.ClientTools` resolved against the catalog).
- Call `ResolveClientTools(...)` then `FormatClientToolsForPrompt(...)`.
- Delete the inline three-tier loop.

### 2.4 Rewire the conversations-runtime registry
`ConversationsRuntime.Instance.Tools` keeps being the **client-side registration + execution** surface (the `Handler` map lives here — the resolver is metadata-only and has no handlers). Its *resolution* (what to advertise) delegates to `ResolveClientTools`. No behavior change for existing consumers; one code path now.

### 2.5 Delete the realtime broker's separate resolution
`RealtimeToolBroker` stops assembling its own tool list. In Move 3 it will call `ResolveClientTools` with the realtime session's tiers (app + dynamic-from-channel + agent static). Here in Move 2 we only ensure the broker *can* consume the shared resolver; the channel wiring is Move 3.

### 2.6 Client-side execution without a server hop
Key property the user asked for: in **client-direct realtime**, the browser owns the provider socket, so a `ContextTool` call is resolved (via `ResolveClientTools`, all data already local) and the handler executed **locally** — no PubSub/GraphQL round-trip. The async (server-bridged) path keeps its existing PubSub-request → Promise-pause → GraphQL-respond round-trip, because there the agent runs on the server. **Same resolver, two execution topologies** — the resolver is pure and identical; only the execution adapter differs.

## Tests
- New unit suite `client-tool-resolver.test.ts` in `ai-core-plus`: precedence (override > dynamic > app > static), dedupe by Name, empty tiers, missing source.
- Regression: async `buildClientToolPromptSection` produces the same prompt section as before for the no-app-tools case (golden test).
- Run `ai-core-plus`, `AI/Agents`, and `ConversationsRuntime` suites.

## Risks / notes
- **App-tier precedence** is the only new semantic — get review sign-off (2.1 note).
- `ai-core-plus` must stay dependency-light. The resolver imports only `agent-types.ts`. Static-tier data is injected; no `BaseAIEngine` import. Verify no accidental server/Angular pull-in (check the package's existing deps).
- The conversations-runtime registry retains handlers; the resolver is intentionally handler-free (metadata only) so it's usable where no handlers exist (server prompt building).
