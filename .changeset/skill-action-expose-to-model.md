---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/server": minor
---

**A skill can bundle an action without putting it into the agent's run.**

Bundling an action into a skill (an `MJ: AI Skill Actions` row) put the action into the activating
agent's run — described to the model and executable — for the rest of the run. A skill whose reply
carries a menu (buttons the application wires to an action, pressed by the person on the next turn)
wants the association without the model ever calling the action on its own mid-conversation (#4226).

- `AISkillAction.ExposeToModel` (BIT, NOT NULL, default 1). `1` is today's behaviour. `0` keeps the
  action bundled — SKILL.md export, tooling — but out of the run: not described to the model and not
  executable by the agent; application code invokes it through the Actions API.
- `AIEngineBase.GetSkillExposedActionIDs(skillID)` returns the `ExposeToModel` subset;
  `BaseAgent.enableSkillCapabilities` pushes that subset onto the run. `GetSkillActionIDs` (every
  bundled action) is unchanged.
- SKILL.md round-trips the flag: the frontmatter gains an optional `codeOnlyActions` list (names, a
  subset of `actions`), written on export for rows with the flag off and applied on import; a file
  without the key leaves surviving rows' flags as they were.

Migration `V202609111449__v6.1.x__Skill_Action_Expose_To_Model.sql` (additive, defaulted; existing
rows keep today's behaviour).
