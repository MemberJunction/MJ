---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
---

Stop Explorer from showing "Unknown error" with a stuck Running timer when a Skip/sub-agent transport path fails. Pass the real error through invokeSubAgent, keep In-Progress when the agent may still be running, and persist Failed/Error on the run and conversation detail if executeAIAgent throws.
