---
"@memberjunction/core-actions": minor
"@memberjunction/search-engine": minor
---

**Scoped Search now carries the skill principal — and judges it.**

`ScopeDimensionResolver` binds `Principals.SkillID` into a dimension's expansion query, and
`principalsFrom()` sources that from `SearchParams.AISkillID`. `SearchParams` declares the field and
`ScopeExplanation.test.ts` asserts on it — but the `Scoped Search` action never set it. The string
"skill" did not appear in that file. So the slot existed, was typed, was tested, and no caller could
reach it: a scope whose bound depends on the active skill resolved `SkillID` as null forever.

Adds an optional `AISkillID` input, threaded onto `SearchParams.AISkillID` the way `AIAgentID`
already is. Omit it and the skill principal stays null, so no caller gains a skill it did not ask for.

**Three behaviour changes to note, none of which is the skill threading itself.** First, the
`AgentUnscopedAll` fallback is now gated on wieldability, so an install where an agent is
`SearchScopeAccess='All'` *and* the user holds no direct or role grant previously got `Allowed:
Search` and now additionally requires the agent to be in the metadata cache and runnable by that
user. This reaches `SearchKnowledge` and `StreamScopedSearch` as well as the action. Second, a
supplied skill is judged wherever it is named, not only at its `All` fallback: a skill binds into
the expansion query, whose output *is* the bound for a `restricts: true` dimension, so judging it
only where it grants would let a user holding their own grant widen with any skill they named.
The agent is deliberately NOT judged that way — `AIAgentID` is also attribution, and gating it at
the point of supply turns an analytics field into a retrieval outage. The skill check does NOT judge the agent —
`GetSkillsForAgent` filters the user's rights on the SKILL (`AISkillPermissionHelper`), never on
the agent — so the agent is judged at the fallbacks instead, where it widens. Both `'All'` arms
consult it, including the skill's: a skill widens through the agent it would activate on, so
naming a skill must not buy access to an agent the caller may not run. A stale metadata cache is
distinguished from a denial in the MESSAGE, but it does not buy access: an agent that
cannot be evaluated cannot back a widening fallback either. (An earlier revision let it through on
the reasoning that a cache blip should not refuse a user whose own grant covered the scope — which is
impossible, since a direct or role grant returns before any fallback is reached. What it actually did
was grant `Search` to users with no grant at all whenever an agent was missing from the cache.)

Third: **a skill supplied with NO agent is now refused outright**. At base, step 4b granted
`SkillUnscopedAll` with no agent at all — an agent-free skill id was a standalone grant, so
'refused' replaces an actual widening, not a no-op. A skill is judged relative to the agent it would activate on, so there is nothing to
judge it against. The `Scoped Search` action always has an agent, so this is reachable only
through `ExplainScope({ AISkillID })` with no `AIAgentID` — most likely a preview UI that lets
a skill be picked before an agent. Such a call now returns `PrincipalNotActivatable` rather
than quietly resolving on the user's own grant.

Also at the same call sites: the caller's tenant (`PrimaryScopeRecordID`) now reaches the
permission decision everywhere it is available — previously every tenant-scoped grant,
including a tenant-scoped `None` (an explicit per-tenant deny), was discarded before the
verdict. Denial messages no longer echo principal names back to the caller (ids + `Source`
only; audit rows and server logs keep the full reason). The GraphQL resolvers refuse a
supplied-but-unloadable `agentID` instead of silently proceeding with an unjudged principal,
and the `SearchScopes` listing hides scopes under the same rule (it takes no searchContext, so
no tenant applies there). The resolver's `ExtraFilter` interpolations now use `EscapeSQLString`.

**The skill is a principal, so it is also permission-checked.** `SearchScopePermissionResolver`
already had three rules that only fire when `Skill` is supplied — `SkillNone` and
`SkillAssignedNotListed` reject a scope the user's own roles allow, and `SkillUnscopedAll` grants one
they do not. The action never passed it. Threading the ID without the gate would have enabled the
widening half of a two-part mechanism and left the deciding half unwired, and would have put the
search at odds with `ExplainScope`, which does pass it — the preview/enforcement drift this code has
already been bitten by once. So the skill is resolved *before* the permission check, handed to
`ResolveEffectivePermission`, and attributed on every denial row.

A value that is not a UUID, or that will not load, is refused with `INVALID_PARAM` rather than
dropped: continuing with a null skill would bind an unjudged ID into the expansion query.

**A principal may only WIDEN if the caller may wield it — checked where it widens.**

`AgentUnscopedAll` and `SkillUnscopedAll` are the only places a principal changes an outcome: by the
time they are reached the user has no grant of their own, and `SearchScopeAccess='All'` is about to
supply one. Both permission models are open by default — no permission rows means anyone may run it —
so an id a caller merely NAMED could grant `Search` on any scope.

Two checks do this, split because they answer different questions.
`skillIsActivatable()` runs wherever a skill is NAMED (step 1e) and asks
`GetSkillsForAgent(agent, user)` — the same call `BaseAgent.preActivateRequestedSkills` gates real
activation on. `agentIsWieldable()` runs at the WIDENING fallbacks and asks for Run on the agent.
Both fallbacks consult it, the skill's included: `GetSkillsForAgent` filters SKILL permissions
(`AISkillPermissionHelper`) and never `AIAgentPermission`, so vouching for a skill says nothing about
whether the caller may run the agent it would activate on. Failing either check REFUSES, with
`PrincipalNotActivatable` — a widening fallback needs the principal positively confirmed, not merely
un-denied.

**Deliberately NOT gated at the point the id is supplied.** `AIAgentID` is attribution far more often
than it is authorization — `agent-pre-execution-rag` threads it purely so `SearchExecutionLog` can
attribute the search — and gating supply rather than grant turns an analytics field into a retrieval
outage on any install with explicit `AI Agent Permission` rows. A test pins that a non-`'All'` agent
supplied WITHOUT a skill never reaches the check — which is the RAG path's shape today. Note a
non-`'All'` agent DOES reach it when an `'All'` skill is supplied, because that skill widens through
it; if the RAG path ever starts threading `AISkillID`, this is the interaction to re-examine.

A stale metadata cache is reported as itself. `GetUserAgentPermissions` throws when the agent is
absent from `AIEngine.Instance.Agents` and fails closed to all-false, so an agent created after the
cache loaded would otherwise read as "not permitted" — a metadata-load problem wearing an
authorization message.

Because the policy sits in the resolver, `ExplainScope` inherits it: preview and search reach the same
verdict by running the same code rather than by two copies agreeing.

**`ExplainScope` inherits the same judgement** (`@memberjunction/search-engine`). It already loaded the skill
principal and applied its rules, so without this a preview would report `SkillUnscopedAll` as a grant
while the real search refused — the preview-vs-enforcement drift that file already carries a regression
test about. Both paths now judge both principals on identical terms, and on the explain path a principal refused
for a PRINCIPAL-SIDE reason — `PrincipalNotActivatable`, `AgentNone`, `AgentAssignedNotListed`,
`SkillNone`, `SkillAssignedNotListed` — is no longer bound into dimension resolution;
`deriveServerValue` parameterises server-authored SQL with it, which is the thing the action refuses
outright rather than continuing with. A refusal for a USER-side reason (no grant) still binds them,
deliberately: dropping them there drives the expansion query with nulls, which makes a required
dimension throw and the explanation announce a dimension failure that does not exist.

On containment, stated accurately: an expansion query is server-authored SQL, but MJ renders query
parameters through Nunjucks with `autoescape: false` and escaping is opt-in (`| sqlString`, or a
declared validation chain). So MJ does not itself guarantee that naming a skill cannot widen or
inject — the query author does, and the permission gate above is what MJ enforces. Scopes that never
reference `SkillID` are unaffected in either direction.
