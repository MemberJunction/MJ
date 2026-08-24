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

**Loading a skill is not permission to wield it.** The ID arrives as an action parameter, and in an
agent flow the model authors action parameters. `SkillUnscopedAll` GRANTS `Search` on any scope when
`SearchScopeAccess='All'`, and AISkill permissions are open by default (no permission rows -> everyone
may View and Run), so an unchecked skill id would be a scope grant for the asking on a fresh install.
The action therefore intersects the skill against `GetSkillsForAgent(agent, user)` before it acts as a
principal, and denies with `ACCESS_DENIED`, attributed to the skill in the Forbidden log. That call —
not a bare "can this user Run it" check — is deliberate: it is what `BaseAgent.preActivateRequestedSkills`
gates real activation on, so a skill may steer a search on exactly the terms it could have been
activated on (the agent accepts skills, this agent is granted this one, the skill is Active, and the
user may Run it). The deny arms would have been safe unchecked; the grant arm is not, and both read
the same field.

**The agent is judged on the same terms.** `resolveAgentID` takes the `agentid` ACTION PARAMETER
ahead of the server-stamped `params.Context.AgentID`, and `AgentUnscopedAll` grants `Search` on any
scope as a fallback "when the user has no per-scope grant" — with agent permissions also open by
default. Naming a trusted agent therefore converted "no grant" into "Search". The action now requires
Run on the agent (`AIAgentPermissionHelper`) before it acts as a principal. This was pre-existing
rather than introduced here, but shipping a skill gate while leaving the agent ungated would have been
an odd place to stop. Blast radius is scope-level, not row-level — results still pass
`filterByPermissions` and RLS — but a scope IS the content bound.

**The veto is enforced structurally, not only through the resolver.** `enforceUserPermission` returns
early when no scope resolved, and `resolveScopeAll` yields `GlobalScope?.ID` — `undefined` on any
installation with no `IsGlobal` scope row. On that path the per-scope gate never ran while
`AISkillID` was still threaded into `SearchParams`, so a skill documented as a veto would have
permitted an unbounded search. `SearchScopeAccess='None'` is now checked where the skill is resolved,
exactly as `resolveScope` already does for the agent, and a skill that cannot be judged at all
(no scope resolved) is refused rather than allowed to ride an unscoped search. Callers passing no
skill are unaffected, which is every caller that existed before this input.

**`SearchScopePermissionSource` gains `'PrincipalNotActivatable'`** — hence `minor` rather than
`patch` on `search-engine`. `'NoGrant'` documents itself as "no applicable row found", so reporting a
principal REJECTION with it left `ScopeDecisionJSON` and audit readers unable to tell the two apart.
Additive; nothing switches exhaustively on the type.

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
