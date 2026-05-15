---
"@memberjunction/ai-agents": minor
---

Add missing `Memory Manager - Detect Contradictions` prompt metadata record so the agent's contradiction-detection phase actually runs instead of silently no-opping. Existing installs must run `mj sync push --dir=metadata --include="prompts"` (or the migration on next release) to seed the new prompt + prompt-model bindings; without it the phase remains disabled.
