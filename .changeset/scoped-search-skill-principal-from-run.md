---
"@memberjunction/ai-agents": patch
"@memberjunction/core-actions": patch
---

**The skill principal of a Scoped Search is bound to the agent run, not to a model-authored parameter.**

`BaseAgent.ExecuteSingleAction` now stamps `Context.ActiveSkillIDs` — the skills the run has actually
activated so far — onto every action call, alongside the existing `AgentID`. An empty array means
"inside an agent run, with no skill active", which is a different fact from having no agent context.

`Scoped Search` reads it. Inside a run, a named `AISkillID` that the run never activated is refused with
`INVALID_PARAM`, and when exactly one skill is active and none is named, that skill becomes the
principal. Outside a run the explicit input is unchanged. The reason is the one the BC-SaaS
capability resolver already states for the active skill: it "must be server-derived, never
caller-supplied — a model naming a skill would let it widen its own reach". Since a skill's
`SearchScopeAccess` and its scope grants can widen a bound, and inside a Loop agent the `AISkillID`
input is filled by the model, the run has to be the authority. With several skills active and none
named, no default is picked and the search proceeds with no skill principal (logged as verbose).

Also: `_activatedSkillIDs` and `_skillInvocations` on `BaseAgent` are now `protected` (with a
read-only `ActivatedSkillIDs` getter), so a subclass that layers its own activation policy — a
tenant licensing check, an entitlement model — can see what actually activated without intercepting
`enableSkillCapabilities`. First-adopter feedback from Betty, where the search sub-agent's principal
was being set by hand from a re-derived copy of this state.
