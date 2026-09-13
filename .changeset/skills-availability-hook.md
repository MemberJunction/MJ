---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
---

**One seam for an application's skill-availability policy: `BaseAgent.filterAvailableSkills`.**

MJ decides whether a skill is available in four sites — the prompt catalog the model is offered,
the validation/execution of a model-initiated `Skill` step, and the pre-activation of a user's
explicit `/skill` request — each through MJ's own gates (AcceptsSkills, Status, agent grant, user Run
permission, the ActivationMode double gate). An application with a policy MJ has no table for — a
tenant licensing model, a per-organization entitlement — could previously hook only the requested
path (by overriding `preActivateRequestedSkills`), so a self-activating agent would be OFFERED a skill
the policy would then refuse.

`protected async filterAvailableSkills(skills, purpose, agent, contextUser)` is now called at all
four sites, after MJ's gates and before anything activates. The default is the identity. The new
`SkillAvailabilityPurpose` type (`'catalog' | 'auto-activation' | 'requested'`) says why it is being
asked. Overrides return a subset, cache their lookups (the catalog is rebuilt every prompt turn), and
fail closed. Guide §1.2b documents it. First-adopter feedback: an entitlement gate that could cover requested activation only.
