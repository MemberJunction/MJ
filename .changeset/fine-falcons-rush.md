---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-agent-client": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/cli": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
---

Unify artifact and attachment delivery paths for AI agents. Seperate artifact storage from rendering. Every attachement now creates paired Artifact + ArtifactVersion and routing functions exist to replace hardcoded MIME allowlist. Unregistered file types are rejected at upload time unless the agent opts into AcceptUnregisteredFiles. Adds wildecard MIME resolver. `mj artifacts reclassify` for legacy rows
