---
"@memberjunction/ai-agents": minor
"@memberjunction/core-entities-server": minor
---

Phase 2 of the core AI Skill library: seven new skills (Document Builder, Communications, Data Import & Transform, File Management, Scheduling & Automation, Lists & Audiences, Code & Computation) with externalized instruction templates and bundled actions/sub-agents; the SkillSmith meta-agent (interviews, discovers bundle members, drafts guardrailed instructions, persists skills as Pending for review); and MJAISkillEntityServer, which defaults AISkill.CreatedByUserID to the context user so programmatic creation paths (Create Record action, scripts) work without knowing the acting user's ID.
