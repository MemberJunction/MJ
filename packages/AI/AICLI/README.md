# @memberjunction/ai-cli

MemberJunction AI agent and action execution CLI

[![Status](https://img.shields.io/badge/status-deprecated-orange)](https://github.com/MemberJunction/MJ)
[![Version](https://img.shields.io/badge/version-2.53.0-blue)](https://github.com/MemberJunction/MJ)

> ⚠️ **DEPRECATION NOTICE**: The standalone `mj-ai` CLI is now deprecated. All AI functionality has been integrated into the main MemberJunction CLI. Please use `mj ai` commands instead. See the [Migration Guide](#migration-guide) below.

## Overview

A fully functional command-line interface for executing MemberJunction AI agents, actions, and direct prompts. The CLI provides seamless integration with the MJ infrastructure, supporting both interactive and programmatic execution of AI workflows.

**Current Status: ✅ Production Ready**
- ✅ Database integration and metadata loading
- ✅ 20+ AI agents available for execution
- ✅ 30+ actions with parameter validation
- ✅ Direct prompt execution with any AI model
- ✅ Interactive chat mode with agents
- ✅ Comprehensive error handling and logging
- ✅ Multiple output formats (compact, table, JSON, markdown)
- ✅ Real-time progress tracking with visual indicators
- ✅ Advanced text formatting for improved readability
- ✅ Full conversation context in chat mode
- ✅ Agent run auditing and debugging tools

## Installation

This package is part of the MemberJunction workspace. Install dependencies from the repository root:

```bash
npm install
```

## Usage

The CLI provides commands for executing AI agents, actions, and direct prompts:

### Agent Commands

Execute AI agents with natural language prompts:

```bash
# List available agents (20+ agents ready)
./packages/AI/AICLI/bin/run agents:list --output=compact

# Execute an agent with a prompt
./packages/AI/AICLI/bin/run agents:run -a "Skip: Requirements Expert" -p "Create a dashboard for sales metrics"

# Start interactive chat with an agent
./packages/AI/AICLI/bin/run agents:run -a "Child Component Generator Sub-agent" --chat

# Execute with verbose output and custom timeout
./packages/AI/AICLI/bin/run agents:run -a "Skip: Technical Design Expert" -p "Build a React component" --verbose --timeout=600000
```

### Action Commands

Execute individual actions with parameters:

```bash
# List available actions (30+ actions ready)
./packages/AI/AICLI/bin/run actions:list --output=table

# Execute weather lookup
./packages/AI/AICLI/bin/run actions:run -n "Get Weather" --param "Location=Boston"

# Get stock price information
./packages/AI/AICLI/bin/run actions:run -n "Get Stock Price" --param "Ticker=AAPL"

# Execute with multiple parameters
./packages/AI/AICLI/bin/run actions:run -n "Send Single Message" \
  --param "To=user@example.com" \
  --param "Subject=Test Message" \
  --param "Body=Hello from MJ CLI" \
  --param "MessageType=Email" \
  --param "Provider=SendGrid"

# Validate action without executing
./packages/AI/AICLI/bin/run actions:run -n "Calculate Expression" --param "Expression=2+2*3" --dry-run
```

### Prompt Commands

Execute direct prompts with any available AI model:

```bash
# List available AI models
./packages/AI/AICLI/bin/run prompts:list

# Execute a direct prompt
./packages/AI/AICLI/bin/run prompts:run -p "Explain machine learning in simple terms"

# Use a specific model
./packages/AI/AICLI/bin/run prompts:run -p "Write a Python function" --model "gpt-4"

# Use system prompt and parameters
./packages/AI/AICLI/bin/run prompts:run -p "Generate a haiku" \
  --system "You are a poet" \
  --temperature 0.3 \
  --max-tokens 100
```

### Output Formats

All commands support multiple output formats:

```bash
# Compact output (default) - clean, formatted text with colors
./packages/AI/AICLI/bin/run agents:list --output=compact

# Table output - structured tabular format
./packages/AI/AICLI/bin/run agents:list --output=table

# JSON output - machine-readable format
./packages/AI/AICLI/bin/run agents:list --output=json
```

### Global Options

- `--verbose, -v`: Show detailed execution information including timing and IDs
- `--timeout <ms>`: Override default timeout (default: 300000ms / 5 minutes)
- `--dry-run`: Validate configuration and parameters without executing
- `--output <format>`: Output format (compact, json, table)
- `--help`: Show command-specific help and examples

## Features

### Progress Tracking

The CLI provides real-time progress updates during agent execution:

**Non-verbose mode**: Compact progress indicators on a single line
```
🚀 [  0%] initialization: Initializing agent...
✓ [ 10%] validation: Validating agent configuration
💭 [ 30%] prompt execution: Running agent's initial prompt...
🧠 [ 70%] decision processing: Analyzing response
✨ [ 95%] finalization: Finalizing agent execution
```

**Verbose mode**: Detailed progress with metadata
```
  🚀 [  0%] initialization - Initializing Demo Loop Agent agent and preparing execution environment
     {"agentRun":null}
  
  ✓ [ 10%] validation - Validating agent configuration and loading prompts
```

### Text Formatting

Long agent responses are automatically formatted for better readability:
- **Word wrapping** at console width (default 80 characters)
- **Paragraph preservation** maintains original structure
- **List formatting** with proper indentation for bullets and numbered lists
- **Code highlighting** in gray for code blocks
- **JSON formatting** with syntax highlighting for structured data

### Interactive Chat Mode

The chat mode maintains full conversation context:
- Previous messages are sent with each new prompt
- Agent maintains context across the entire conversation
- Supports natural back-and-forth dialogue
- Exit with "exit", "quit", or Ctrl+C

### Agent Run Auditing

The AgentAuditService provides comprehensive debugging and performance analysis tools for AI agent executions. This service is exposed through the MJCLI `mj ai audit agent-run` command.

**Key Features:**
- **List Recent Runs**: Filter by agent name, status, and date range
- **Run Summaries**: High-level overview with step list and identifiable IDs
- **Step Detail Analysis**: Deep dive into specific step inputs/outputs with smart truncation
- **Error Analysis**: Automatic error pattern detection with suggested fixes
- **Multiple Output Formats**: Compact, JSON, table, markdown
- **Token Management**: Smart truncation prevents overwhelming large payloads (configurable with `--max-tokens`)
- **Export Capabilities**: Full data export to JSON files for offline analysis

**Smart Truncation:**
The audit system automatically truncates large input/output payloads to prevent token overflow, showing the first 70% and last 30% of content with a truncation indicator. This is especially useful for Skip-Brain agents that generate large component payloads.

**Performance Optimization:**
All audit queries use `ResultType: 'simple'` for optimal read-only performance, avoiding unnecessary entity object instantiation overhead.

## Architecture

The CLI follows the MetadataSync pattern with:

- **Service Layer**: AgentService, ActionService, ValidationService, AgentAuditService
- **Infrastructure**: MJ Provider with database integration
- **Logging**: Comprehensive execution tracking with file output
- **Error Handling**: User-friendly error messages with next steps
- **Configuration**: Automatic mj.config.cjs detection and loading
- **Text Formatting**: Advanced console output formatting with TextFormatter
- **Progress Tracking**: Real-time execution status with visual indicators
- **Audit & Analysis**: AgentAuditService for debugging and performance analysis

### Design Decisions

**Why No oclif Init Hooks:**
The CLI intentionally does not use oclif init hooks for database initialization. Init hooks have significant limitations:
- Don't run during help/version commands
- Early database failures would break even `--help`
- More restrictive error handling
- Commands are imported before hooks run

Instead, we use **service-based initialization** which provides:
- Better error isolation and debugging
- Lazy initialization (only when needed)
- Reliable help/version commands
- Comprehensive error messages with actionable steps

**Future Enhancement Option:**
A Base Command Pattern could reduce code duplication while maintaining current benefits:
```typescript
export abstract class BaseCommand extends Command {
  protected async initMJ(): Promise<void> {
    // Shared initialization logic
  }
}
```
This would be a better alternative than init hooks for shared functionality.

## Configuration

The CLI uses the standard MemberJunction configuration from `mj.config.cjs` in the repository root.

**✅ Currently Working With:**
- SQL Server database connection
- User authentication and context
- AI model and provider settings
- Metadata caching and performance optimization

**Required Configuration in mj.config.cjs:**
- Database connection settings (host, port, database, user, password)
- AI model configuration for agent execution
- User authentication setup

## Development

### Building the Package

```bash
cd packages/AI/AICLI
npm run build
```

### Running in Development

```bash
# From repository root (recommended)
./packages/AI/AICLI/bin/run agents:list

# Or from package directory
cd packages/AI/AICLI
./bin/run agents:list
```

### Testing Commands

```bash
# Test help system
./packages/AI/AICLI/bin/run --help
./packages/AI/AICLI/bin/run agents:run --help

# Test basic connectivity
./packages/AI/AICLI/bin/run agents:list --output=json | jq length

# Test validation without execution
./packages/AI/AICLI/bin/run actions:run -n "Calculate Expression" --param "Expression=1+1" --dry-run
```

## Performance

Current performance benchmarks:
- **Metadata Loading**: ~700ms (includes full entity and relationship mapping)
- **Agent Listing**: Instant after metadata load
- **Action Discovery**: Instant after metadata load
- **Database Connection**: <100ms on subsequent calls

## Logging

Execution logs are stored in `.mj-ai/logs/` directory with comprehensive tracking:

**What's Logged:**
- Execution steps and timing
- Agent/action responses and parameters
- Error details and stack traces
- Performance metrics and database query times
- User context and configuration details

**Log Files Created:**
- `{timestamp}_{execution-id}_execution.log`: Detailed step-by-step logs
- Performance metrics and execution summary

**Example Log Location:**
```
.mj-ai/logs/2025-06-21_18-36-13_ftwxjeywx_execution.log
```

## Troubleshooting

### Common Issues

**1. "No mj.config.cjs configuration found"**
- Ensure you're running from the MJ repository root
- Verify mj.config.cjs exists and has database settings

**2. Database Connection Errors**
- Check database server is running
- Verify credentials in mj.config.cjs
- Ensure network connectivity to database

**3. Permission Errors**
- Verify user has execute permissions on ./bin/run
- Check database user permissions for metadata access

### Getting Help

```bash
# Command-specific help
./packages/AI/AICLI/bin/run agents:run --help
./packages/AI/AICLI/bin/run actions:run --help

# Global help
./packages/AI/AICLI/bin/run --help
```

## Migration Guide

The AI CLI functionality has been integrated into the main MemberJunction CLI. To migrate:

### Command Changes

| Old Command (mj-ai) | New Command (mj) |
|---------------------|------------------|
| `mj-ai agents:list` | `mj ai agents list` |
| `mj-ai agents:run` | `mj ai agents run` |
| `mj-ai actions:list` | `mj ai actions list` |
| `mj-ai actions:run` | `mj ai actions run` |
| `mj-ai prompts:list` | `mj ai prompts list` |
| `mj-ai prompts:run` | `mj ai prompts run` |

### Examples

```bash
# Old way
mj-ai agents:run -a "Skip: Requirements Expert" -p "Create a dashboard"

# New way
mj ai agents run -a "Skip: Requirements Expert" -p "Create a dashboard"

# Old way
mj-ai actions:run -n "Get Weather" --param "Location=Boston"

# New way
mj ai actions run -n "Get Weather" --param "Location=Boston"
```

### Installation

Instead of using this package directly, install the main MJ CLI:

```bash
npm install -g @memberjunction/cli
```

### Configuration

No changes needed - both CLIs use the same `mj.config.cjs` file.

### Support Timeline

- **Now**: Both `mj-ai` and `mj ai` commands work
- **3 months**: `mj-ai` will show deprecation warnings
- **6 months**: `mj-ai` package will be archived

For the latest documentation, see the [MJ CLI README](https://github.com/MemberJunction/MJ/tree/main/packages/MJCLI).
