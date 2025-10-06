---
"@memberjunction/ai-agent-manager-actions": patch
---

- Implement missing AI Agent Manager action drivers including
  deactivate-agent, export-agent-bundle, set-agent-prompt, and
  validate-agent-configuration

  - Add comprehensive UUID validation with regex patterns to prevent SQL
    conversion errors
  - Enhance parameter validation and error handling across all actions
  - Implement DRY principle by consolidating validation logic in base class
  - Add transaction management infrastructure for future multi-record
    operations
  - Fix type safety issues with optional chaining for parameter handling
  - Improve agent definition interfaces for better type safety
  - Standardize error handling patterns across all action implementations

  This completes the Agent Manager action system and resolves critical
  validation errors that were preventing proper agent management
  functionality.
