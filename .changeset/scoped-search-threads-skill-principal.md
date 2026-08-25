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

**Loading a principal is not permission to wield it — and that judgement lives on the ENGINE.**

`principalsFrom()` is where an id becomes a principal that can change what a search may reach:
`AgentUnscopedAll` and `SkillUnscopedAll` GRANT `Search` on any scope, and both permission models are
open by default. Those ids arrive from callers — a GraphQL argument, an action parameter the model
authored — so "was this supplied" and "may this caller wield it" are different questions.

`SearchEngine.validatePrincipals()` answers the second, once, in `searchInternal` before scopes or the
cache. It requires Run on the agent, requires the skill to be in `GetSkillsForAgent(agent, user)` —
the same call `BaseAgent.preActivateRequestedSkills` gates real activation on, so a skill may steer a
search only on the terms it could have been activated on — and refuses a supplied id that will not
load rather than silently downgrading to "no principal".

It is on the engine rather than in the action because `Search()` has SEVEN callers: three GraphQL
resolvers, two actions, the pre-execution RAG path and the test harness. A gate in one of them is a
gate the other six route around — and two of those resolvers already pass a client-supplied `agentID`
straight through with no Run check. `ExplainScope` needing its own copy of the same policy was the
tell; it now calls the same method, so a preview cannot promise what a search would refuse.

**`ExplainScope` mirrors both gates** (`@memberjunction/search-engine`). It already loaded the skill
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
