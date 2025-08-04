---
"@memberjunction/ai-agents": patch
"@memberjunction/core-actions": patch
---

Add User Onboarding Flow Agent with role assignment improvements

- Add support for Flow Agent Type to execute flow-specific prompts
  instead of system prompts
- Fix Flow Agent payload persistence across workflow steps
- Create assign-user-roles action to support multiple role assignments
- Update validate-email-unique action with better error handling
- Enable proper role mapping from user input to database role names

This enables deterministic workflow execution for user onboarding with
dynamic role assignment.
