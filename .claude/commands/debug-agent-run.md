---
agentRunId: Agent Run ID (GUID)
context: Optional additional context or specific questions about the run
---

# Debug AI Agent Run

You are debugging a MemberJunction AI Agent Run that has failed or has issues. Your goal is to analyze the execution logs, identify root causes, and provide actionable solutions.

**Agent Run ID**: {{agentRunId}}
{{#if context}}
**Additional Context**: {{context}}
{{/if}}

## Context and Architecture

### MemberJunction AI Agent System Overview

**Agent Architecture**:
- All agents inherit from `BaseAgent` class ([packages/AI/Agents/src/base-agent.ts](../packages/AI/Agents/src/base-agent.ts))
- Agents execute prompts using `AIPromptRunner` ([packages/AI/AICore/src/AIPromptRunner.ts](../packages/AI/AICore/src/AIPromptRunner.ts))
- Agent metadata (prompts, settings, actions) is stored in `./metadata/agents/` directory
- Agent runs create steps that log all operations with Input/Output data

**Key Concepts**:
- **Agent Run**: A single execution of an agent with a unique ID
- **Agent Run Steps**: Individual operations within a run (prompts, actions, sub-agents)
- **Input Data**: JSON passed into each step (context, parameters, previous outputs)
- **Output Data**: JSON returned from each step (results, generated content, errors)
- **Error Message**: Captured exceptions and failure reasons

### Agent Metadata Location

**IMPORTANT**: Agent metadata is in the repository, NOT just the database:
- **Agent Definitions**: `./metadata/agents/<AgentName>/agent.json`
- **Prompts**: `./metadata/agents/<AgentName>/prompts/*.prompt.md`
- **Actions**: `./metadata/actions/*.json`
- **Settings**: Agent configuration in agent.json files

You should read metadata from these files rather than querying the database.

## Debugging Workflow

### Phase 1: High-Level Overview (START HERE)

1. **Get Agent Run Summary** using MCP tool `Get_Agent_Run_Summary`:
   - Provides comprehensive overview (~500-1K tokens)
   - Shows all steps executed, status, duration, tokens used
   - Identifies which sub-agents, prompts, and actions were invoked
   - Highlights failed steps and error messages

**Example Usage**:
```
Use Get_Agent_Run_Summary tool with:
{
  "runId": "<AGENT_RUN_ID>"
}
```

2. **Analyze the Summary**:
   - What was the agent trying to accomplish? (Look at initial input)
   - How many steps executed successfully before failure?
   - Which step failed? What was the error message?
   - What sub-agents or prompts were involved?
   - Were there token usage anomalies or timeouts?

### Phase 2: Drill Down to Failed Steps

1. **Get Step Details** using `Get_Agent_Run_Step_Detail`:
   - Default truncation is 5000 characters (70% from start, 30% from end)
   - If you need more context, increase `maxChars` or use `maxChars: 0` for no truncation
   - Focus on the **failed step** and the **step immediately before it**

**Example Usage**:
```
Use Get_Agent_Run_Step_Detail tool with:
{
  "runId": "<AGENT_RUN_ID>",
  "stepNumber": <FAILED_STEP_NUMBER>,
  "maxChars": 5000
}
```

2. **Analyze Step Details**:
   - What was the step trying to do? (Look at step name and type)
   - What input data was provided? Was it complete and valid?
   - What output was produced (or expected)?
   - What was the exact error message and stack trace?

### Phase 3: Inspect Agent Metadata

1. **Read Agent Configuration**:
   - Navigate to `./metadata/agents/<AgentName>/`
   - Read `agent.json` for agent settings, sub-agents, prompts
   - Read prompt files (`.prompt.md`) for the prompts used in failed steps
   - Check action metadata if actions were invoked

2. **Look for Issues**:
   - **Prompt Quality**: Is the prompt clear, complete, and well-structured?
   - **Missing Variables**: Are template variables in prompts properly defined?
   - **Invalid Settings**: Are model settings (temperature, maxTokens) reasonable?
   - **Incorrect References**: Are prompt IDs, action IDs, or sub-agent IDs valid?
   - **Logic Errors**: Does the agent's flow make sense for the intended use case?

### Phase 4: Identify Root Cause and Solutions

**Common Issue Categories**:

1. **Prompt Issues** (Most Common):
   - Poorly worded instructions
   - Missing or incorrect template variables
   - Insufficient context provided to LLM
   - Output format not clearly specified
   - **Solution**: Update prompt markdown files in `./metadata/agents/<AgentName>/prompts/`

2. **Configuration Issues**:
   - Incorrect model selection (wrong capabilities)
   - Token limits too low for task complexity
   - Temperature/top_p values causing poor results
   - **Solution**: Update agent settings in `agent.json`

3. **Data Flow Issues**:
   - Previous step didn't provide expected output structure
   - Missing or malformed input data
   - Incorrect data mapping between steps
   - **Solution**: Fix agent logic in BaseAgent subclass or adjust data transformations

4. **Code/Architecture Issues**:
   - Bugs in agent implementation
   - Missing error handling
   - Incorrect API calls or data access
   - **Solution**: Fix code in agent class files or core libraries

5. **Action/Integration Issues**:
   - Action parameters incorrectly configured
   - External service failures or timeouts
   - Missing permissions or credentials
   - **Solution**: Update action metadata or fix action implementation

## MCP Tools Reference

### Available Tools (agent-run-diagnostics MCP Server)

1. **List_Recent_Agent_Runs**
   - Parameters: `agentName` (optional), `status` (optional), `days` (default: 7), `limit` (default: 10)
   - Returns: List of recent runs with basic info (ID, status, duration, cost)
   - **Use when**: Finding the run ID or browsing recent agent executions

2. **Get_Agent_Run_Summary** ⭐ (START HERE)
   - Parameters: `runId` (required)
   - Returns: Comprehensive run overview with all steps (no I/O data - fast and lightweight)
   - Shows: agent name, status, duration, tokens, cost, step count, error summary, step metadata
   - **Use when**: Getting high-level overview of what happened in the run

3. **Get_Agent_Run_Step_Detail** ⭐
   - Parameters: `runId` (required), `stepNumber` (required), `maxChars` (default: 5000)
   - Returns: Detailed step info with input/output data (smart truncation at 70%/30%)
   - Shows: step metadata, truncated I/O data, error details, timing info
   - **Use when**: Need to see actual data that went through a specific step

4. **Get_Agent_Run_Step_Full_Data** ⚠️ (Use when truncated data insufficient)
   - Parameters: `runId` (required), `stepNumber` (required), `outputFile` (optional)
   - Returns: Complete untruncated step data
   - **Always writes to file** - returns file path and summary
   - **File location**: If `outputFile` not specified, writes to `./agent-run-{runId}-step-{stepNumber}.json`
   - **Inline data**: If <10KB, includes full data inline plus file path
   - **Large data**: If >10KB, returns only file path - you can then Read the file
   - **Use when**: Step_Detail truncation hides critical information

### CLI Commands (Alternative to MCP)

If MCP tools are unavailable, use these CLI commands:

```bash
# Get agent run summary
mj ai audit agent-run <AGENT_RUN_ID>

# Get specific step details
mj ai audit agent-run <AGENT_RUN_ID> --step=<STEP_NUMBER>
```

These commands are in [packages/AI/AICLI/](../packages/AI/AICLI/) and use the `AgentAuditService`.

## Output Format

After completing your analysis, provide:

1. **Summary**: What was the agent trying to do? What went wrong?
2. **Root Cause**: The specific issue that caused the failure
3. **Failed Step Analysis**: Detailed breakdown of the problematic step(s)
4. **Recommended Fixes**: Specific, actionable solutions with:
   - What file(s) to modify
   - What changes to make
   - Why this will fix the issue
5. **Additional Recommendations**: Preventive measures or improvements

## Important Notes

- **Start with high-level overview** (Get_Agent_Run_Summary) before drilling down
- **Read metadata from ./metadata/ directory** - don't query database for prompts/settings
- **Look at the step BEFORE the failed step** - it may have caused the issue
- **Check token usage** - truncated outputs or token limits can cause failures
- **Review prompt quality** - most issues are due to poorly structured prompts
- **Consider the full context** - agent runs have dependencies between steps
- **Use Get_Agent_Run_Step_Full_Data for large data** - it writes to file and you can Read it
- **Smart truncation** - Step_Detail shows 70% from start and 30% from end when truncating
- **File exports** - Full_Data tool writes to `./agent-run-{runId}-step-{stepNumber}.json` by default

## Architecture References

When debugging agent code issues, refer to:
- [packages/AI/Agents/src/base-agent.ts](../packages/AI/Agents/src/base-agent.ts) - Base agent implementation
- [packages/AI/AICore/src/AIPromptRunner.ts](../packages/AI/AICore/src/AIPromptRunner.ts) - Prompt execution engine
- [packages/AI/Agents/README.md](../packages/AI/Agents/README.md) - Agent system documentation
- [packages/AI/AICore/README.md](../packages/AI/AICore/README.md) - AI Core documentation
- [packages/Actions/README.md](../packages/Actions/README.md) - Action system documentation

---

**Ready to debug!** Start by using `Get_Agent_Run_Summary` with agent run ID `{{agentRunId}}` to get an overview of what happened.
