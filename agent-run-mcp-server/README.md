# Agent Run MCP Server

A lightweight Model Context Protocol (MCP) server that exposes **only 4 agent run diagnostic tools** for efficient context usage with Claude Code.

## Purpose

This server is a focused alternative to `/packages/AI/MCPServer` that dramatically reduces MCP context overhead by eliminating hundreds of entity CRUD tools. It provides only the essential tools needed for debugging and auditing AI agent runs.

## What's Included

The server exposes exactly **4 diagnostic tools**:

1. **List_Recent_Agent_Runs** - Query recent agent runs with filtering options
2. **Get_Agent_Run_Summary** - Get step-by-step summary without I/O data (fast)
3. **Get_Agent_Run_Step_Detail** - Get detailed step information with smart truncation
4. **Get_Agent_Run_Step_Full_Data** - Export complete untruncated step data to file

## What's NOT Included

- **No entity CRUD tools** (Create, Read, Update, Delete operations on 200+ entities)
- **No action execution tools**
- **No generic entity discovery tools**

This reduces the MCP context from hundreds of tools to just 4 focused diagnostic tools.

## Installation

```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/agent-run-mcp-server
npm install
npm run build
```

## Running the Server

```bash
npm start
```

The server will start on port 3100 with SSE transport at `stdin/stdout communication`.

## Configuration

The server reads database configuration from the same `.mjrc` or `mj.config.cjs` file used by other MemberJunction tools. No additional configuration is needed.

## MCP Client Configuration

The repository's `.mcp.json` is already configured to use this server:

```json
{
  "mcpServers": {
    "agent-run-diagnostics": {
      "type": "sse",
      "url": "stdin/stdout communication",
      "description": "Lightweight MCP server with only 4 agent run diagnostic tools (no entity CRUD)"
    }
  }
}
```

## Development

- Build: `npm run build`
- Start: `npm start`
- Dev mode: `npm run dev` (build + start)

## Architecture

- **Transport**: Server-Sent Events (SSE) on port 3100
- **Framework**: FastMCP for efficient tool registration
- **Database**: SQL Server via MemberJunction data provider
- **Tools**: 4 optimized agent run diagnostic tools with smart data truncation

## Performance Benefits

- **Reduced Context**: Only 4 tools vs 200+ in full MCP server
- **Faster Loading**: No entity metadata scanning or tool generation
- **Lower Memory**: Minimal tool definitions in MCP context
- **Quick Responses**: Focused tools with optimized queries

## Tool Details

### List_Recent_Agent_Runs
Fast query for recent agent runs with optional filtering by agent name, status, date range, and result limit.

### Get_Agent_Run_Summary
Comprehensive run summary with step metadata (excludes I/O data for performance). Shows duration, token usage, cost, and error summary.

### Get_Agent_Run_Step_Detail
Detailed step information with configurable data truncation (default 5000 chars). Shows input/output data with smart truncation indicators.

### Get_Agent_Run_Step_Full_Data
Exports complete untruncated step data to JSON file. Includes inline data for small payloads (<10KB), file-only for large payloads.

## Related

- Full MCP Server: `/packages/AI/MCPServer` (includes entity CRUD, actions, agents)
- AI Agents Package: `/packages/AI/Agents`
- Core Entities: `/packages/MJCoreEntities`
