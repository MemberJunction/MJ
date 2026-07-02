---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ng-conversations": minor
---

Surface dropped skill-activation requests instead of silently ignoring them: new 'skill-activation-refused' message type; BaseAgent injects an explanatory system note + logs a warning when requested skills fail the activation guard; conversations UI shows a warning toast at send time when the mentioned agent can't activate the requested skills.
