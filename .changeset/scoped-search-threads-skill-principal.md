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
already is. Omit it and the principal stays null, so every existing caller behaves identically.

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

`SearchScopePermissionResolver.principalIsWieldable()` gates exactly those two fallbacks: Run on the
agent, and for a skill, membership of `GetSkillsForAgent(agent, user)` — the same call
`BaseAgent.preActivateRequestedSkills` gates real activation on, so a skill may widen a search only on
the terms it could have been activated on. Failing the check does not refuse the search; the fallback
simply does not apply and the verdict falls through to denied, which is where the user already was.

**Deliberately NOT gated at the point the id is supplied.** `AIAgentID` is attribution far more often
than it is authorization — `agent-pre-execution-rag` threads it purely so `SearchExecutionLog` can
attribute the search — and gating supply rather than grant turns an analytics field into a retrieval
outage on any install with explicit `AI Agent Permission` rows. A test pins that: a non-`'All'` agent
never reaches the check.

A stale metadata cache is reported as itself. `GetUserAgentPermissions` throws when the agent is
absent from `AIEngine.Instance.Agents` and fails closed to all-false, so an agent created after the
cache loaded would otherwise read as "not permitted" — a metadata-load problem wearing an
authorization message.

Because the policy sits in the resolver, `ExplainScope` inherits it: preview and search reach the same
verdict by running the same code rather than by two copies agreeing.

**`ExplainScope` inherits the same judgement** (`@memberjunction/search-engine`). It already loaded the skill
principal and applied its rules, so without this a preview would report `SkillUnscopedAll` as a grant
while the real search refused — the preview-vs-enforcement drift that file already carries a regression
test about. Both paths now judge both principals on identical terms, and a principal the entitlement step refused
is no longer bound into dimension resolution — `deriveServerValue` parameterises server-authored SQL
with it, which is the thing the action refuses outright rather than continuing with.

On containment, stated accurately: an expansion query is server-authored SQL, but MJ renders query
parameters through Nunjucks with `autoescape: false` and escaping is opt-in (`| sqlString`, or a
declared validation chain). So MJ does not itself guarantee that naming a skill cannot widen or
inject — the query author does, and the permission gate above is what MJ enforces. Scopes that never
reference `SkillID` are unaffected in either direction.
