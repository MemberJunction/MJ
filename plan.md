# Flow Agent Testing Plan - User Onboarding

## Overview
You are tasked with testing the new User Onboarding Flow Agent implementation in MemberJunction. This agent uses the new "Flow Agent" type which provides deterministic, graph-based workflow execution.

**CRITICAL**: We are testing two interdependent components:
1. **Flow Agent Type** (Architecture) - The untested graph-based workflow engine
2. **User Onboarding Agent** (Application) - The specific implementation using Flow Agent

Issues must be carefully diagnosed to determine if they stem from the Flow Agent framework or the User Onboarding configuration.

## Test Objective
Successfully create a new user "Jordan Fanapour" (jjfanapour@gmail.com) with UI role using the User Onboarding Flow Agent.

## Key Files to Review
1. **Flow Agent Implementation**: `/packages/AI/Agents/src/agent-types/flow-agent-type.ts`
2. **Agent Metadata**: `/metadata/agents/.user-onboarding-agent.json`
3. **Prompt Templates**: `/metadata/prompts/templates/user-onboarding/`
4. **Action Drivers**: `/packages/Actions/CoreActions/src/custom/user-management/`

## Testing Steps

### [ ] 1. Initial Setup
- [ ] Ensure database is running (localhost:1433)
- [ ] Verify metadata is synced: `npx mj sync push --dir="metadata"`
- [ ] Build the monorepo: `npm run build` (from project root)

### [ ] 2. Execute Agent Test

#### Single Prompt Execution (Limited to one iteration):
```bash
npx mj ai agents run -a "User Onboarding Flow Agent" -p "Can you add a new user with the name \"Jordan Fanapour\" with the email address \"jjfanapour@gmail.com\". Assign them a UI role only." -v
```

#### Interactive Chat Mode (Supports multi-turn conversation):
```bash
npx mj ai agents run -a "User Onboarding Flow Agent" --chat -v
```

Note: Use `-v` flag for verbose output to see debugging logs.

### [ ] 3. Validate Results
Check database for successful creation:
```bash
sqlcmd -S localhost -U MJ_CodeGen -P 'YourStrong@Passw0rd789' -d test -Q "SELECT * FROM [__mj].[vwUsers] WHERE Email = 'jjfanapour@gmail.com'"
sqlcmd -S localhost -U MJ_CodeGen -P 'YourStrong@Passw0rd789' -d test -Q "SELECT * FROM [__mj].[vwUserRoles] ur INNER JOIN [__mj].[vwUsers] u ON ur.UserID = u.ID WHERE u.Email = 'jjfanapour@gmail.com'"
```

## Expected Flow Execution
1. **Collect User Information** → AI prompts for user details
2. **Validate User Data** → Checks email uniqueness
3. **Create User Record** → Creates user in database
4. **Assign User Roles** → Assigns UI role
5. **Send Welcome Email** → Sends notification

## Common Issues & Debugging

### Issue Categories
- **User Onboarding Issues**: Problems with metadata, prompts, or action configuration
  - Fix: Update metadata files and run `npx mj sync push --dir="metadata"`
- **Flow Agent Framework Issues**: Problems with flow execution, state management, or path evaluation
  - Fix: Update code in flow-agent-type.ts and rebuild

### Debugging Tips
1. Look for console logs marked with `//FLOW AGENT DEBUGGING`
2. Check agent run logs in database: `[__mj].[vwAIAgentRuns]`
3. Verify action execution: `[__mj].[vwActionExecutionLogs]`

## Error Resolution Decision Tree

```
Error Occurs
    ├─ Is it a metadata/configuration issue?
    │   ├─ Yes → Update metadata → Push changes → Retest
    │   └─ No → Continue
    │
    └─ Is it a Flow Agent framework issue?
        ├─ Minor (logic errors, exceptions, mapping)
        │   └─ Fix code → Rebuild → Retest
        │
        └─ Major (architectural changes)
            └─ Consult supervisor before proceeding
```

## Notes Section
_Use this section to document findings, errors, and solutions_

### Previous Testing Session Warnings
**IMPORTANT**: The following issues were encountered in previous testing and have been reverted:

1. **JSON Response Format Issues**
   - Flow Agent requires pure JSON responses from all prompts
   - AI models may return mixed text/JSON despite explicit instructions
   - The parseJSONResponse method will fail if response isn't valid JSON
   - Solution: Enforce strict JSON-only output in prompt templates

2. **Flow Agent System Prompt Confusion**
   - The system prompt was trying to make routing decisions (WRONG)
   - Flow Agents should NOT analyze requests or decide steps
   - System prompt should only facilitate conversation, not control flow
   - The "Collect User Information" step handles all user input parsing

3. **CLI Testing Limitations**
   - Single prompt mode (`-p`) only executes one iteration
   - Use `--chat` mode for multi-step Flow Agent testing
   - Always use `-v` flag to see debugging logs

### Test Run 1:
- Date/Time: 
- Result: 
- Issues Found:
- Root Cause:
- Actions Taken:

## User Onboarding Flow Agent Design

### Overview
The User Onboarding agent was designed as a **Flow Agent** - a deterministic, graph-based workflow that executes steps in a predefined sequence based on conditional paths. This is fundamentally different from Loop Agents which use AI to decide next actions.

### Flow Agent Architecture

#### Key Concepts
1. **Deterministic Execution**: Steps follow a graph structure with boolean conditions
2. **No AI Decision-Making**: The flow follows paths based on payload data, not AI reasoning
3. **Graph Traversal**: Each step has outgoing paths with conditions that determine the next step
4. **Starting Steps**: Flow begins with designated starting steps (marked with `StartingStep: true`)

#### Flow Execution Process
1. **Initial Step**: Flow starts with "Collect User Information" (a Prompt step)
2. **Path Evaluation**: After each step, the Flow Agent evaluates path conditions against the payload
3. **Next Step Selection**: The highest priority path with a true condition determines the next step
4. **Completion**: Flow ends when no valid paths remain

### User Onboarding Flow Design

#### Flow Graph Structure
```
[Collect User Information] 
    ↓ (if userData.confirmed == true)
[Validate User Data]
    ↓ (if emailIsUnique == true && isEmployee == true)
[Create Employee Record] → [Create User Record]
    ↓ (if emailIsUnique == true && isEmployee != true)
[Create User Record]
    ↓ (if emailIsUnique == false)
[Email Already Exists - Error]
    ↓ (if createdUserID != null)
[Assign User Roles]
    ↓ (if lastAssignedUserRoleID != null)
[Send Welcome Email]
```

#### Step Types and Behavior
1. **Prompt Steps** (e.g., "Collect User Information")
   - Should parse user input and update the payload
   - Return JSON with extracted data, NOT flow control decisions
   - Example: Extract name, email, roles from natural language

2. **Action Steps** (e.g., "Create User", "Send Email")
   - Execute specific actions with input/output mapping
   - Input mapping: Maps payload values to action parameters
   - Output mapping: Maps action results back to payload

3. **Path Conditions**
   - Boolean expressions evaluated against current payload
   - Example: `payload.emailIsUnique == true`
   - Use SafeExpressionEvaluator for secure evaluation

### Critical Design Points

#### 1. System Prompt (INCORRECT in current implementation)
The system prompt for a Flow Agent should NOT:
- Analyze the user's request
- Decide which step to execute
- Return flow control information

Instead, it should ONLY:
- Maintain conversation context
- Help with data extraction when needed
- NOT make routing decisions

#### 2. Prompt Steps (NEED FIXING)
Current "Collect User Information" prompt tries to control flow. It should:
- Focus ONLY on extracting user data from the conversation
- Return structured data to update the payload
- Let the Flow Agent handle routing based on paths

#### 3. Action Input/Output Mapping
- Input: `{"Email": "payload.userData.email"}` maps payload to action params
- Output: `{"UserID": "payload.createdUserID"}` maps results back
- Supports nested paths and static values

## Implementation Fixes Required

To restore proper Flow Agent behavior:

1. **Update System Prompt** (`user-onboarding-flow-agent.template.md`)
   - Remove ALL flow control logic
   - Make it a simple conversation facilitator
   - No decision-making about steps

2. **Fix Prompt Steps** (`collect-user-info-prompt.template.md`)
   - Focus on data extraction only
   - Return user data structure
   - Remove any step selection logic

3. **Verify Path Conditions**
   - Ensure all conditions use proper payload references
   - Test with SafeExpressionEvaluator
   - Check priority ordering

4. **Test Flow Execution**
   - Should start at "Collect User Information"
   - Automatically follow paths based on conditions
   - No AI decisions about routing

## Current Issue Analysis

### Root Cause Identified
The User Onboarding agent is configured as a **Flow Agent** but is using prompts designed for a **Loop Agent**. 

**Current Configuration Issues**:
1. The Flow Agent system prompt is trying to analyze the user's request and make decisions
2. It's returning a status that prevents flow progression
3. The "Collect User Information" step is never reached

### Solution Required

**Fix Flow Agent Configuration**
- The User Onboarding agent MUST remain a Flow Agent (not Loop)
- System prompt needs to be simplified to NOT make routing decisions
- The "Collect User Information" step should handle all input parsing
- Flow Agent will handle graph traversal based on path conditions

## Testing Experience Summary (Previous Session)

### Key Learnings

1. **Flow Agent Architecture Understanding**
   - Flow Agents are deterministic graph-based workflows, NOT iterative AI agents
   - System prompts should NOT make routing decisions or analyze requests
   - Path traversal is based on boolean conditions evaluated against payload
   - The first Prompt step ("Collect User Information") should handle all input parsing

2. **Debugging Challenges**
   - Console logs from Flow Agent Type were not visible in CLI output
   - Need to use `-v` flag for verbose output
   - Multi-turn testing requires `--chat` flag, not single prompt execution

3. **JSON Response Format Issues**
   - AI models (Claude) initially returned mixed text/JSON despite explicit instructions
   - Required multiple iterations to enforce pure JSON responses
   - Critical for Flow Agent's parseJSONResponse method

4. **CLI Limitations Discovered**
   - Single prompt mode (`-p`) only executes one agent iteration
   - Interactive chat mode (`--chat`) needed for full workflow testing
   - Verbose flag (`-v`) required to see debugging output

### Diagnosis Framework Used

When issues arose, systematically determined:
1. Is the prompt being executed? (Check AIPromptRuns table)
2. Is the response format correct? (Check JSON parsing errors)
3. Are actions being triggered? (Check ActionExecutionLogs table)
4. Is the flow progressing? (Check agent state and step transitions)

### Critical Instructions for Testing

1. **Flow Agent Type Testing Priority**
   - We are testing the untested Flow Agent Type implementation
   - User Onboarding MUST remain a Flow Agent to validate the architecture
   - DO NOT convert to Loop Agent - that defeats the testing purpose

2. **Required Testing Commands**
   - Always use `-v` flag for verbose debugging output
   - Use `--chat` mode for multi-step flow testing
   - Check console logs for "FLOW AGENT DEBUGGING" messages

3. **Flow Agent Expected Behavior**
   - Should start at "Collect User Information" step automatically
   - System prompt should NOT make routing decisions
   - Paths are followed based on boolean conditions, not AI reasoning
   - Each step updates the payload, Flow Agent evaluates paths

## Debugging Log Locations

The following debugging logs have been added to `/packages/AI/Agents/src/agent-types/flow-agent-type.ts`:

1. **DetermineInitialStep** (line ~882): Logs when flow starts
2. **DetermineNextStep** (line ~157): Logs each step transition with current state
3. **getValidPaths** (line ~217): Logs path evaluation from current step
4. **Path condition evaluation** (line ~372): Logs each condition being evaluated
5. **Condition result** (line ~381): Logs evaluation success/failure
6. **createStepForFlowNode** (line ~473): Logs when creating a step
7. **Action input mapping** (line ~710): Logs parameter mapping from payload
8. **Action output mapping** (line ~432): Logs result mapping back to payload

## Rollback Strategy

### When to Use Rollback
Execute rollback if the User Onboarding flow partially completes but fails validation:
- User record created but role assignment failed
- User and role created but email sending failed
- Any partial state where full flow didn't complete successfully

### Rollback Steps

1. **Check for existing test user**:
```bash
sqlcmd -S localhost -U MJ_CodeGen -P 'YourStrong@Passw0rd789' -d test -Q "SELECT ID FROM [__mj].[vwUsers] WHERE Email = 'jjfanapour@gmail.com'"
```

2. **If user exists, delete UserRole records first** (due to foreign key constraints):
```bash
# Get the User ID first
sqlcmd -S localhost -U MJ_CodeGen -P 'YourStrong@Passw0rd789' -d test -Q "DECLARE @UserID NVARCHAR(255); SELECT @UserID = ID FROM [__mj].[User] WHERE Email = 'jjfanapour@gmail.com'; DELETE FROM [__mj].[UserRole] WHERE UserID = @UserID"
```

3. **Delete the User record**:
```bash
sqlcmd -S localhost -U MJ_CodeGen -P 'YourStrong@Passw0rd789' -d test -Q "DELETE FROM [__mj].[User] WHERE Email = 'jjfanapour@gmail.com'"
```

4. **Verify cleanup**:
```bash
sqlcmd -S localhost -U MJ_CodeGen -P 'YourStrong@Passw0rd789' -d test -Q "SELECT * FROM [__mj].[vwUsers] WHERE Email = 'jjfanapour@gmail.com'"
sqlcmd -S localhost -U MJ_CodeGen -P 'YourStrong@Passw0rd789' -d test -Q "SELECT * FROM [__mj].[vwUserRoles] WHERE UserID IN (SELECT ID FROM [__mj].[vwUsers] WHERE Email = 'jjfanapour@gmail.com')"
```

### Rollback Checklist
- [ ] Check if test user exists in database
- [ ] Delete UserRole records (if any)
- [ ] Delete User record
- [ ] Verify both tables are clean
- [ ] Document what stage the flow failed at

## Cleanup Tasks
- [ ] Remove all `//FLOW AGENT DEBUGGING` console.log statements
- [ ] Document any permanent fixes made
- [ ] Update this plan with lessons learned
- [ ] Execute rollback strategy if needed between test runs

---

## Supervisor Contact
If you need to make major architectural changes to the Flow Agent system, describe the proposed changes here before implementation:

**Proposed Change:**

**Justification:**

**Impact Analysis:**