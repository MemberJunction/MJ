---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
---

**An action's file output can say it is a download: `FileOutputRef.visibility`.**

MJ turns every action `FileOutput` into an artifact with `Visibility = 'Always'`, hard-coded on the
file path. For a file the user asked to download and will open elsewhere — an exported CSV, a PDF —
that produces a message card whose viewer is empty for types with no plugin, and the host has no
way to say otherwise short of rewriting the artifact after the fact.

`FileOutputRef` gains an optional `visibility` (`'Always' | 'System Only'`, parsed by
`ParseFileOutputRef`, ignored when malformed), and `AgentRunner` threads it to the artifact it
creates for the file, defaulting to `Always` as before. `System Only` is the chat's existing switch:
the artifact, its version and its download URL exist, but the message shows no card unless the host
opts in with `showSystemArtifacts`. First-adopter feedback.
