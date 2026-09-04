---
"@memberjunction/ng-conversations": patch
---

**The `/` skill picker offers only what the target agent accepts.**

The composer's '/' trigger listed every skill the *user* could run, including ones the agent the
message goes to would refuse (`AcceptsSkills='Limited'` without a grant, or `'None'`). The refusal
only surfaced after send, as a system note. `mj-ai-composer` now takes `TargetAgentId`;
`mj-message-input` binds it to an explicit `@agent` chip in the draft, else the agent it resolves for
the message (continuity, pinned, embedder default), and the picker narrows to
`AIEngineBase.GetSkillsForAgent(agent)` ∩ the user's runnable set (`IntersectAcceptedSkills`).
Intersection only — it never adds a skill the user could not run; an unknown agent means no
narrowing, as before. First-adopter feedback.
