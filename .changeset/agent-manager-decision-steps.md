---
"@memberjunction/ai-agent-manager": minor
"@memberjunction/ai-core-plus": minor
---

Support Decision steps in Agent Manager: update architect and planning prompt templates, add example JSON output with Decision step and Choice fork paths, and support Decision step round-tripping with configuration normalization and custom prompt IDs. The Architect validates a Flow agent's steps and paths, and those of each Flow child sub-agent, by compiling and validating them with the runtime's own `CompileFlowToTaskGraph` and `ValidateTaskGraphSpec`, and checks that a Decision step's prompt is a Decision prompt. `AgentStep.Configuration` accepts an object as well as JSON text.
