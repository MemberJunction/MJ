# @memberjunction/ai-cli

## 2.79.0

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [db0e5ed]
- Updated dependencies [bad1a60]
  - @memberjunction/ai-agents@2.79.0
  - @memberjunction/ai-prompts@2.79.0
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/core-entities-server@2.79.0
  - @memberjunction/ai@2.79.0
  - @memberjunction/ai-anthropic@2.79.0
  - @memberjunction/ai-groq@2.79.0
  - @memberjunction/ai-mistral@2.79.0
  - @memberjunction/ai-openai@2.79.0
  - @memberjunction/actions@2.79.0
  - @memberjunction/core-actions@2.79.0
  - @memberjunction/sqlserver-dataprovider@2.79.0
  - @memberjunction/ai-betty-bot@2.79.0
  - @memberjunction/ai-cerebras@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Minor Changes

- ef7c014: migration file

### Patch Changes

- 4652675: feat: add comprehensive AI CLI package with agent and action execution

  - Add @memberjunction/ai-cli package with oclif framework
  - Implement agents:list and agents:run commands for AI agent execution
  - Implement actions:list and actions:run commands for action execution
  - Add interactive chat mode for ongoing agent conversations
  - Support multiple output formats (compact, table, JSON)
  - Include comprehensive error handling and validation
  - Add service-based architecture with AgentService, ActionService, ValidationService
  - Integrate with MJ Provider for database connectivity and connection pooling
  - Add execution logging to .mj-ai/logs/ directory
  - Support dry-run validation and verbose output modes
  - Include comprehensive documentation and usage examples

  This CLI provides production-ready command-line access to 20+ AI agents and 30+ actions with full
  parameter validation and error handling.

  This changeset message follows conventional commit format with:

  - Type: feat (new feature)
  - Scope: Comprehensive description of the major addition
  - Details: Bullet points covering all the key functionality added
  - Impact: Clear statement about production readiness and capabilities

- Updated dependencies [ef7c014]
- Updated dependencies [06088e5]
  - @memberjunction/ai-agents@2.78.0
  - @memberjunction/ai@2.78.0
  - @memberjunction/ai-prompts@2.78.0
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/ai-anthropic@2.78.0
  - @memberjunction/ai-betty-bot@2.78.0
  - @memberjunction/ai-cerebras@2.78.0
  - @memberjunction/ai-groq@2.78.0
  - @memberjunction/ai-mistral@2.78.0
  - @memberjunction/ai-openai@2.78.0
  - @memberjunction/actions@2.78.0
  - @memberjunction/sqlserver-dataprovider@2.78.0
  - @memberjunction/core-entities-server@2.78.0
  - @memberjunction/core-actions@2.78.0
  - @memberjunction/core@2.78.0
