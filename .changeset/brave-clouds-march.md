---
"@memberjunction/ai": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-conversations": patch
---

Fix agent infinite retry loop and OOM crash when API credentials are missing by adding NoCredentials error classification, max consecutive failure safety net, and descriptive error propagation to the UI. Fix artifact collection removal UI update, artifact pane width reset on conversation switch, and component spec caching to survive render errors.
