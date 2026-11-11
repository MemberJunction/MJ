---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/core-actions": patch
---

Actions run outside an agent run now carry that run's scope (#5624): realtime direct tools and delegated target-agent runs get the session's server-built scope (an unscoped run's when it has none), and Test Runtime Action passes its caller's `RunScope` and `Audience` to the action under test. A nested Scoped Search then refuses a tenant or skill the run does not carry.
