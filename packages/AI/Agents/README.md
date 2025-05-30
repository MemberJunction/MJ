# @memberjunction/ai-agents

The MemberJunction AI Agents package provides a comprehensive framework for creating, managing, and executing AI agents within the MemberJunction ecosystem. This package serves as the foundation for building sophisticated agentic AI applications with hierarchical composition, context management, and intelligent execution strategies.

## Features

- **🤖 BaseAgent Class**: Core foundation for all AI agent implementations
- **🏗️ Agent Composition**: Hierarchical agent architecture with parent-child relationships
- **🧠 Context Management**: Intelligent conversation context handling and compression
- **🔄 Execution Strategies**: Sequential and parallel agent execution modes
- **📝 Learning System**: Agent note-taking and knowledge retention capabilities
- **🎯 Action Framework**: Extensible action system for agent capabilities
- **🔧 Subclassing Support**: Easy extension and customization of agent behavior

## Installation

```bash
npm install @memberjunction/ai-agents
```

## Requirements

- Node.js 16+
- MemberJunction Core libraries
- [@memberjunction/ai-prompts](../Prompts/README.md) for advanced prompt management
- [@memberjunction/aiengine](../Engine/README.md) for AI model orchestration

## Core Architecture

### BaseAgent Class

The `BaseAgent` class is the central component of the AI Agents framework, providing:

- **Standard Interface**: Consistent API for all agent implementations
- **Lifecycle Management**: Initialization, execution, and cleanup workflows
- **Context Handling**: Automatic conversation context management
- **Error Handling**: Robust error recovery and logging
- **Extensibility**: Clean extension points for custom behavior

```typescript
import { BaseAgent } from '@memberjunction/ai-agents';

// Create a custom agent by extending BaseAgent
class CustomerSupportAgent extends BaseAgent {
    async initialize(): Promise<void> {
        // Custom initialization logic
        await super.initialize();
        this.setupCustomCapabilities();
    }

    async execute(context: AgentContext): Promise<AgentResult> {
        // Custom execution logic
        const result = await super.execute(context);
        return this.enhanceResult(result);
    }
}
```
 

## Architecture Deep Dive

For comprehensive details about the AI Agents framework architecture, data models, workflows, and implementation guidelines, see the [Agent Architecture.md](./Agent%20Architecture.md) document.

Key architectural concepts covered include:

- **Hierarchical Agent Composition**: How agents are organized and orchestrated
- **Metadata-Driven Configuration**: Database-driven agent and prompt management
- **Execution Workflows**: Detailed execution patterns and context management
- **Performance Optimization**: Caching, parallel execution, and resource management
- **Extensibility Patterns**: Guidelines for custom agent development

## API Reference

### BaseAgent Class

The foundation class for all AI agents.
 
## Dependencies

- `@memberjunction/core`: MemberJunction core library
- `@memberjunction/global`: MemberJunction global utilities
- `@memberjunction/core-entities`: MemberJunction entity definitions
- `@memberjunction/aiengine`: AI model orchestration
- `@memberjunction/ai-prompts`: Advanced prompt management

## Related Packages

- `@memberjunction/aiengine`: Core AI engine and model management
- `@memberjunction/ai-prompts`: Advanced prompt execution and management
- `@memberjunction/templates`: Template rendering for dynamic content

## Development Status

🚧 **Under Active Development** - This package is currently being built and will house all functionality for the MJ AI Agent framework. The `BaseAgent` class and core infrastructure are being implemented to provide the foundation for all agentic execution work in the MemberJunction ecosystem.

## License

ISC

---

## Contributing

When developing agents using this framework:

1. **Always extend BaseAgent** for consistency and built-in functionality
2. **Follow the lifecycle patterns** defined in the base class
3. **Use meaningful names and descriptions** for agents and actions
4. **Implement proper error handling** in custom execution logic
5. **Leverage the note system** for agent learning and improvement
6. **Test with various context scenarios** to ensure robustness

For detailed development guidelines and best practices, refer to the [Agent Architecture.md](./Agent%20Architecture.md) documentation.