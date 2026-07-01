---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/aiengine": patch
"@memberjunction/global": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
---

Add permission-constrained engine loading to BaseEngine — pre-checks entity read permissions during Config() and skips all entity configs (all-or-nothing) when the user lacks access, preventing endless retry loops and console error flooding for org-scoped SaaS users. Engine getters now use GetConfigData() which throws a typed PermissionConstrainedError instead of silently returning empty arrays. Also fixes unsafe GetHighestPowerModel/GetHighestPowerLLM return types and resolves FK_AIAgentRunStep_ParentID race in fire-and-forget step saves.
