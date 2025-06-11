---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
---

Implement agent architecture separation of concerns

- **NEW**: Add BaseAgent class for domain-specific prompt execution
- **NEW**: Add ConductorAgent for autonomous orchestration decisions and action planning
- **NEW**: Add AgentRunner class to coordinate BaseAgent + ConductorAgent interactions
- **NEW**: Add AgentFactory with `GetConductorAgent()` and `GetAgentRunner()` methods using MJGlobal
  class factory
- **NEW**: Add comprehensive execution tracking with AIAgentRun and AIAgentRunStep entities
- **NEW**: Support parallel and sequential action execution with proper ordering
- **NEW**: Structured JSON response format for deterministic decision parsing
- **NEW**: Database persistence for execution history and step tracking
- **NEW**: Cancellation and progress monitoring support
- **NEW**: Context compression for long conversations
- **NEW**: Template rendering with data context

This implements clean separation of concerns:

- BaseAgent: Domain-specific execution only (~500 lines)
- ConductorAgent: Orchestration decisions with structured responses
- AgentRunner: Coordination layer providing unified user interface

Includes comprehensive TypeScript typing and MemberJunction framework integration.
