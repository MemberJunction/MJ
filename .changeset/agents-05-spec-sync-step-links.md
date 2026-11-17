---
'@memberjunction/ai-agent-manager': minor
---

Agent spec sync links sub-agent steps by name and creates loop-step prompts (#4914): a Sub-Agent step, or a loop whose body is a sub-agent, saved with an empty `SubAgentID` links to the spec's sub-agent of the same name, else to the one active agent of that name; zero or several matches refuse the save before anything is written. A loop whose body is a prompt written inline as `PromptText` gets its AIPrompt created and linked, as a Prompt step does. The Architect prompt template now describes this linking.
