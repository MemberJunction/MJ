---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
"@memberjunction/ng-core-entity-forms": minor
---

**A skill can bundle an action without offering it to the model as a tool.**

Bundling an action into a skill (an `MJ: AI Skill Actions` row) did two things at once: it granted
the activating agent permission to run the action, and it put the action in front of the model as a
callable tool for the rest of the run. Those are different decisions. A skill whose reply carries a
menu — buttons the application wires to an action, pressed by the person on the next turn — needs
the grant, and needs the model not to see the action, or the model calls it on its own mid-conversation
(#4226).

- `AISkillAction.ExposeToModel` (BIT, NOT NULL, default 1). `1` is today's behaviour. `0` keeps the
  action bundled — grant, attribution, SKILL.md export — but never offers it to the model; only code
  invokes it.
- `AIEngineBase.GetSkillExposedActionIDs(skillID)` returns the `ExposeToModel` subset;
  `BaseAgent.enableSkillCapabilities` now hands the model that subset. `GetSkillActionIDs` (every
  bundled action) is unchanged, and attribution still uses it, so an application-invoked action
  under an active skill is still recorded against that skill.

Migration `V202609102050__v6.1.x__Skill_Action_Expose_To_Model.sql` (additive, defaulted; existing
rows keep today's behaviour).
