---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-artifacts": patch
---

Let an agent tell the framework whether its payload is a **new** artifact or a **new version** of an existing one, instead of leaving that to be inferred at the write.

`ProcessAgentArtifacts` chose its target from continuity signals alone: an explicit `sourceArtifactId`, else the previous artifact on the conversation detail. Both signals say only "this conversation already has an artifact" — neither distinguishes a restyle of the current component from a request for a different one. So an agent that produced an unrelated deliverable mid-conversation had it saved as version N of whatever came before (Skip-Brain #529).

`BaseAgentNextStep` and `ExecuteAgentResult` now carry an optional `ArtifactDirective`: `create-new`, `version-source` (with an optional `targetArtifactId`), or `suppress`. `planArtifactTarget()` is exported from `@memberjunction/ai-agents` so the resulting precedence is testable without a database.

Precedence is deliberately narrow — the directive is advice from an agent, not a command, and is consulted only **after** the checks that already existed, so it can never widen what a caller or an agent's configuration refused:

1. `createArtifacts === false` → nothing written; a directive cannot re-enable creation.
2. `ArtifactCreationMode: 'Never'` → nothing written.
3. The directive.
4. **No directive → the historical chain, byte-for-byte unchanged.** Every existing agent is unaffected.

`suppress` covers everything the step would persist as an artifact — the payload, and the artifacts wrapping any generated files or media. The run's media audit rows are still written: suppression governs what the user is shown, not lineage.

**Every field of a directive is model output, and is treated as such.** A named `targetArtifactId` is honored only if it is a UUID-shaped string naming an artifact that exists AND that the run's user either owns or holds an explicit `CanEdit` grant on — otherwise the run falls back to the caller's `sourceArtifactId`, then to the historical chain. Without the ownership test, an agent could name any artifact id in the instance and have the run's payload appended to it, because `vwArtifacts` has no per-user predicate and a successful load proves only that a row exists. Existence and authorization resolve in one `RunViews` round trip rather than through `BaseEntity.Load`, which throws on a permission denial or a transient fault where this path needs a fallback. A directive's `name` is trimmed and clamped to its 255-character column rather than rejected, so an over-long model-written title costs a truncation instead of the entire artifact. Provenance ('did the agent name this id, or did the caller?') is carried on the plan instead of inferred by comparing values, so an agent echoing the run's own source id no longer routes a caller-supplied id through the model-output guards — nor lets a rejected id reappear through the fallback.

Ids reaching a `RunView.ExtraFilter` are now escaped **where the filter is built** rather than at one audited call site, so `GetMaxVersionForArtifact`, `CheckForDuplicateVersion` and `FindPreviousArtifactForMessage` are safe for every caller, including the `sourceArtifactId` that arrives from the GraphQL boundary. `ExtraFilter` has no parameterized form and the upstream clause validator permits `OR`, so this was a real predicate-injection surface.

An artifact directive governs the payload of the agent that issued it and never crosses the parent/child boundary. A sub-agent's directive is logged and dropped rather than inherited by the parent's terminal step, which carries a merged payload and would otherwise be written onto an artifact the child named. Conversely, the two places that rebuild an agent's OWN terminal step — the client-tools `terminateAfterExecution` branch and `executeChatStep` — now carry the directive instead of dropping it.

Two supporting changes ride along:

- **`PayloadManager` no longer leaves data-free shells in arrays.** When a sub-agent returns a *shorter* array than the parent holds, every scalar under the vacated index is deleted — and `_.unset` removes leaves while leaving the containers that held them. The result is an element that carries no data but is not key-free, which the previous `Object.keys().length === 0` cleanup could not see. Such elements are now pruned by a sweep **scoped to the indices this merge actually vacated**, so the recursive emptiness test cannot reach elements the merge never touched: a legitimate all-null record elsewhere in the payload, or one whose deletion the upstream-path guardrail refused, survives exactly as before. The global key-less-`{}` cleanup is unchanged. The scoped sweep also closes the hole `_.unset` leaves when a scalar array is shortened, and prunes a fully vacated NESTED array — a latent defect that predates this work and that the recursive test now covers. Before this, a sub-agent legitimately removing one item from a structured array left a nameless residue that downstream consumers read as a real record; for component pipelines that meant a crash at the last step, after the full generation run.

- **`ng-conversations` stops guessing which artifact to open.** The chat area snapshots artifact versions before a turn and diffs after, with *created* beating *bumped*, so a newly created artifact wins the panel over one that merely gained a version — including when the panel is already open on something else, which the previous `!showArtifactPanel` gate suppressed. Because the panel is no longer gated on being closed, the decision is applied only while the conversation it was computed for is still on screen and only while the user has not made a selection of their own in the meantime; a run that finishes during a conversation switch or a scroll-up no longer mistakes artifacts arriving in the map for artifacts the run created. A creation is also chosen by the newest version's timestamp rather than by whichever conversation detail the map happened to iterate last, and artifact ids are grouped as UUIDs wherever they are deduplicated, so the two casings the two database engines return can no longer render one artifact as two cards. Dead `targetArtifactVersionId` plumbing in the message input is left intact on this line, where the Check Sage Intent prompt populates it.

The artifact viewer no longer loads twice per open or refresh: switching artifact and version together delivered both inputs in one change-detection pass and its two independent `ngOnChanges` branches each ran a full load, the second without a cancellation token. Its refresh guard also compares artifact ids as UUIDs now, so a refresh is no longer dropped when the two sides picked the id up from differently-cased sources.
