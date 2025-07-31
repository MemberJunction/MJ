---
"@memberjunction/ai-cli": patch
---

feat: add comprehensive AI CLI package with agent and action execution

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