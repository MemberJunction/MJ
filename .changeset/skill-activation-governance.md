---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
---

Skill activation governance & observability (v5.45): double activation gate (AISkill.ActivationMode × AIAgent.SkillActivationMode, both defaulting to RequestedOnly — self-activation requires Auto×Auto; /skill user requests unaffected) via new GetAutoActivatableSkillsForAgent; AIAgent.RequirePlanMode forces plan mode on every root run; AIAgentRun.PlanMode stamps plan-mode runs; plan-mode runs block skill activations after approval (re-plan required); AIAgentRunStep.Skills JSON records per-step AgentSkillInvocation provenance (activation type, gate values, agent-stated reason) on Skill/Prompt/Actions/Sub-Agent steps with native-grant precedence; agent-run UX gains a Plan Mode header chip, Skill/Plan step icons, per-step skill chips, and a Skills drill-in tab with provenance cards.
