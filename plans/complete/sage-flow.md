# Sage and Conversation System - Detailed Flow Analysis

## Overview

This document provides a comprehensive analysis of how Sage (the Conversation Manager Agent) and conversations work together, including multi-turn workflows, taskComplete handling, and conversation history management.

---

## 1. WHEN IS SAGE INVOKED? (Routing Logic)

### Flow in `message-input.component.ts` - `routeMessage()` method (lines 405-425)

Every user message follows this **three-tier priority routing system**:

```
User Message
    ↓
├─ Priority 1: @mention present?
│   └─→ handleDirectMention() - BYPASS SAGE, invoke agent directly
│
├─ Priority 2: Previous agent with continuity?
│   └─→ checkContinuityIntent()
│       ├─ YES → handleAgentContinuity() - Continue with previous agent, BYPASS SAGE
│       ├─ NO  → handleNoAgentContext() → processMessageThroughAgent() → INVOKE SAGE
│       └─ UNSURE → handleNoAgentContext() → processMessageThroughAgent() → INVOKE SAGE
│
└─ Priority 3: No context at all
    └─→ handleNoAgentContext() → processMessageThroughAgent() → INVOKE SAGE
```

### Code Example: Routing Decision

```typescript
// message-input.component.ts, lines 405-425
private async routeMessage(
  messageDetail: ConversationDetailEntity,
  mentionResult: MentionParseResult,
  isFirstMessage: boolean
): Promise<void> {
  // Priority 1: Direct @mention
  if (mentionResult.agentMention) {
    await this.handleDirectMention(messageDetail, mentionResult.agentMention, isFirstMessage);
    return;
  }

  // Priority 2: Check for previous agent with intent check
  const lastAgentId = this.findLastNonSageAgentId();
  if (lastAgentId) {
    await this.handleAgentContinuity(messageDetail, lastAgentId, mentionResult, isFirstMessage);
    return;
  }

  // Priority 3: No context - use Sage
  await this.handleNoAgentContext(messageDetail, mentionResult, isFirstMessage);
}
```

### Finding Previous Agent (Line 492-503)

```typescript
private findLastNonSageAgentId(): string | null {
  const lastAIMessage = this.conversationHistory
    .slice()
    .reverse()
    .find(msg =>
      msg.Role === 'AI' &&
      msg.AgentID &&
      msg.AgentID !== this.converationManagerAgent?.ID  // Filter OUT Sage
    );

  return lastAIMessage?.AgentID || null;
}
```

**Key Point:** Sage messages are identified by `AgentID === this.converationManagerAgent?.ID` and are EXCLUDED from continuity checks.

---

## 2. WHAT TRIGGERS TASK GRAPH EXECUTION?

### Detection Point: `processMessageThroughAgent()` (Lines 683-884)

When Sage completes execution (line 721), the result is checked for a `payload.taskGraph` property:

```typescript
// Lines 764-771
if (result.payload?.taskGraph) {
  console.log('📋 Task graph detected, starting task orchestration');
  await this.handleTaskGraphExecution(userMessage, result, this.conversationId, conversationManagerMessage);
}
```

### Exact Condition

**The check is simple:**
```typescript
if (result.payload?.taskGraph)
```

This means:
- The `payload` object (returned from Sage execution) must have a `taskGraph` property
- The `taskGraph` contains: `{ workflowName, reasoning, tasks: [...] }`

### Execution Flow Chart

```
Sage Execution Completes
    ↓
Check result.payload
    ├─ Has taskGraph? → handleTaskGraphExecution()
    │                     ├─ Single task? → handleSingleTaskExecution()
    │                     └─ Multiple tasks? → ExecuteTaskGraph mutation
    │
    ├─ Has invokeAgent? → handleSubAgentInvocation()
    │
    ├─ FinalStep === 'Chat'? → Display message directly
    │
    └─ Silent observation? → handleSilentObservation()
```

---

## 3. CONVERSATION HISTORY BUILDING & PASSING TO SAGE

### Entry Point: `onSend()` → `handleSuccessfulSend()` → `routeMessage()` → `processMessageThroughAgent()` (Line 683)

### Key Property: `conversationHistory` Input (Line 32)

```typescript
// message-input.component.ts, line 32
@Input() conversationHistory: ConversationDetailEntity[] = []; // For agent context
```

This array is **passed from the parent component** and contains all messages in the conversation up to and including the current message.

### Building Agent Messages: `buildAgentMessages()` (Lines 195-277 in conversation-agent.service.ts)

**Step 1: Get Recent History (Line 202)**
```typescript
const recentHistory = history.slice(-20); // Last 20 messages maximum
```

**Step 2: Load All Artifacts (Lines 210-255)**
```typescript
// Batch load artifact junctions for all messages in history
const artifactsByDetailId = new Map<string, string[]>(); // DetailID -> artifacts

// For each message with artifacts, load artifact versions
// Artifacts are APPENDED to message content
```

**Step 3: Build Chat Messages (Lines 258-274)**
```typescript
for (const msg of recentHistory) {
  let content = msg.Message || '';

  // If message has artifacts, append them
  const artifacts = artifactsByDetailId.get(msg.ID);
  if (artifacts && artifacts.length > 0) {
    for (const artifactJson of artifacts) {
      content += `\n\n# Artifact\n${artifactJson}\n`;
    }
  }

  messages.push({
    role: this.mapRoleToAgentRole(msg.Role), // 'user' | 'assistant'
    content: content
  });
}

return messages;
```

### Passing to Sage: `processMessage()` (Lines 105-188)

```typescript
async processMessage(
  conversationId: string,
  message: ConversationDetailEntity,  // Current user message
  conversationHistory: ConversationDetailEntity[],  // ALL messages including current
  conversationDetailId: string,
  onProgress?: AgentExecutionProgressCallback
): Promise<ExecuteAgentResult | null> {
  // Line 136: Build agent messages from history
  const conversationMessages = await this.buildAgentMessages(conversationHistory);

  // Line 157-173: Create execution params for Sage
  const params: ExecuteAgentParams = {
    agent: agent,  // Sage agent
    conversationMessages: conversationMessages,  // ← PASSED HERE
    conversationDetailId: conversationDetailId,
    data: {
      ALL_AVAILABLE_AGENTS: availAgents,  // List of agents Sage can delegate to
      conversationId: conversationId,
      latestMessageId: message.ID
    },
    onProgress: onProgress
  };

  // Line 176: Run the agent
  const result = await this._aiClient.RunAIAgent(params);
  return result;
}
```

---

## 4. MULTI-TURN WORKFLOW EXAMPLE

### Scenario: User → Sage Planning → Approval Loop → Execution

```
Step 1: User sends message
┌─────────────────────────────────────────────┐
│ User: "Research AI and write a report"      │
└─────────────────────────────────────────────┘
         ↓
    conversationHistory = [
      { ID: 'user-1', Role: 'User', Message: "Research AI and write a report" }
    ]

Step 2: Sage processes message
┌──────────────────────────────────────────────────────────────────┐
│ ConversationAgentService.processMessage() called with:           │
│ - conversationId: 'conv-123'                                     │
│ - message: { ID: 'user-1', Message: "Research AI..." }           │
│ - conversationHistory: [user-1]                                  │
│                                                                  │
│ buildAgentMessages() converts to:                                │
│ [                                                                │
│   { role: 'user', content: "Research AI and write a report" }    │
│ ]                                                                │
│                                                                  │
│ Sage receives this and decides to ask for approval               │
│ Returns: {                                                       │
│   success: true,                                                 │
│   agentRun: { FinalStep: 'Chat', Message: "Here's my plan..." }  │
│   payload: { taskGraph: null } // No task graph yet              │
│ }                                                                │
└──────────────────────────────────────────────────────────────────┘
         ↓
    Sage Message displayed to user (FinalStep: 'Chat')
    conversationHistory now = [user-1, sage-response-1]

Step 3: User sends approval
┌────────────────────────────────────────────────────────────────────┐
│ User: "yes, proceed with that plan"                                │
└────────────────────────────────────────────────────────────────────┘
         ↓
    conversationHistory = [
      { ID: 'user-1', Message: "Research AI and write a report" },
      { ID: 'sage-1', Role: 'AI', AgentID: sage-id, Message: "Here's my plan..." },
      { ID: 'user-2', Message: "yes, proceed with that plan" }
    ]

Step 4: Message routes to Sage again (Priority 2: No previous specialist agent)
┌──────────────────────────────────────────────────────────────────────────┐
│ ConversationAgentService.processMessage() called with:                   │
│ - conversationId: 'conv-123'                                             │
│ - message: { ID: 'user-2', Message: "yes, proceed..." }                  │
│ - conversationHistory: [user-1, sage-1, user-2] ← 3 MESSAGES             │
│                                                                          │
│ buildAgentMessages() converts to:                                        │
│ [                                                                        │
│   { role: 'user', content: "Research AI and write a report" },           │
│   { role: 'assistant', content: "Here's my plan..." },                   │
│   { role: 'user', content: "yes, proceed with that plan" }               │
│ ]                                                                        │
│                                                                          │
│ Sage NOW sees the approval and creates the task graph                    │
│ Returns: {                                                               │
│   success: true,                                                         │
│   agentRun: { FinalStep: 'Success' },                                    │
│   payload: {                                                             │
│     taskGraph: {                                                         │
│       workflowName: "AI Research and Report Writing",                    │
│       tasks: [                                                           │
│         { tempId: '1', name: "Research AI", agentName: "ResearchAgent" },│
│         { tempId: '2', name: "Write Report", agentName: "WriterAgent" }  │
│       ]                                                                  │
│     }                                                                    │
│   }                                                                      │
│ }                                                                        │
└──────────────────────────────────────────────────────────────────────────┘
         ↓
    Task graph detected! (line 764)
    handleTaskGraphExecution() called
```

### Key Insight

**Sage receives ALL previous messages**, including its own previous responses and the user's follow-up. This allows Sage to:
1. Understand context from earlier in the conversation
2. Make decisions based on user feedback/approval
3. Access artifacts from previous agent runs
4. Maintain conversation continuity

---

## 5. TASKCOMPLETE = FALSE vs TRUE (Loop Agent Behavior)

### Loop Agent Type Response Structure (loop-agent-response-type.ts, lines 6-73)

```typescript
interface LoopAgentResponse {
  // CRITICAL: Controls loop continuation
  taskComplete?: boolean;
  
  // Message to show user (required for 'Chat' type)
  message?: string;
  
  // Payload modifications
  payloadChangeRequest?: AgentPayloadChangeRequest;
  
  // Next action (required when taskComplete=false)
  nextStep?: {
    type: 'Actions' | 'Sub-Agent' | 'Chat';
    // ... action/sub-agent details
  };
}
```

### Determination of Next Step (loop-agent-type.ts, lines 74-176)

```typescript
public async DetermineNextStep(
  promptResult: AIPromptRunResult | null,
  params: ExecuteAgentParams,
  payload: any,
  agentTypeState: any
): Promise<BaseAgentNextStep> {
  const response = this.parseJSONResponse<LoopAgentResponse>(promptResult);

  // Line 100-111: CHECK TASK COMPLETION
  if (response.taskComplete) {
    // ✅ TERMINATE: taskComplete = true
    return this.createSuccessStep({
      message: response.message,
      reasoning: response.reasoning,
      confidence: response.confidence,
      payloadChangeRequest: response.payloadChangeRequest
    });
  }

  // If taskComplete is false, nextStep is REQUIRED
  if (!response.nextStep) {
    return this.createRetryStep('Task not complete but no next step provided');
  }

  // Lines 124-170: Handle different next step types
  switch (response.nextStep.type) {
    case 'Sub-Agent':
      // Agent delegates to sub-agent
      return {
        step: 'Sub-Agent',
        subAgent: { name, message, terminateAfter },
        terminate: false  // ← Continue loop
      };
    case 'Actions':
      // Agent executes actions
      return {
        step: 'Actions',
        actions: [...],
        terminate: false  // ← Continue loop
      };
    case 'Chat':
      // Agent needs user input
      return {
        step: 'Chat',
        message: response.message,
        terminate: true  // ← Exit loop, wait for user
      };
  }
}
```

### Execution Loop in BaseAgent (base-agent.ts, lines 507-552)

```typescript
protected async executeAgentInternal<P = any>(
  params: ExecuteAgentParams,
  config: AgentConfiguration
): Promise<{finalStep: BaseAgentNextStep<P>, stepCount: number}> {
  let continueExecution = true;
  let currentNextStep: BaseAgentNextStep<P> | null = null;
  let stepCount = 0;

  while (continueExecution) {
    // Execute current step
    const nextStep = await this.executeNextStep<P>(params, config, currentNextStep);
    stepCount++;

    // Line 527: CHECK TERMINATE FLAG
    if (nextStep.terminate) {
      continueExecution = false;
      // ✅ LOOP EXITS - return finalStep
      return { finalStep: nextStep, stepCount };
    } else {
      // taskComplete = false, continue loop
      currentNextStep = nextStep;
      // Carry forward payload
      if (!currentNextStep.newPayload && currentNextStep.previousPayload) {
        currentNextStep.newPayload = currentNextStep.previousPayload;
      }
    }
  }

  return { finalStep: currentNextStep, stepCount };
}
```

### State Machine Diagram

```
Agent Execution Loop
┌─────────────────────────────┐
│  Execute Prompt (Step N)    │
└──────────────┬──────────────┘
               ↓
    ┌──────────────────────────┐
    │ Parse Agent Response     │
    │ Check taskComplete value │
    └──────────────┬───────────┘
                   ↓
        ┌──────────────────────────┐
        │ taskComplete = ?          │
        └──────────────┬───────────┘
                       ↙   ↘
                  YES ↙     ↘ NO
                    ↙         ↘
           ┌──────────┐    ┌─────────────────────┐
           │ Terminate│    │ nextStep type?      │
           │ Loop ✅  │    │                     │
           └──────────┘    ├─ 'Sub-Agent'?      │
                           │   → Execute (loop)  │
                           ├─ 'Actions'?        │
                           │   → Execute (loop)  │
                           └─ 'Chat'?           │
                               → Show user, exit │
```

### Timeline: taskComplete FALSE → TRUE

```
Iteration 1:
  Prompt executed
  taskComplete = false
  nextStep.type = 'Sub-Agent'
  → Execute sub-agent
  → Loop continues ✅

Iteration 2:
  Prompt executed again with sub-agent results in payload
  taskComplete = false
  nextStep.type = 'Actions'
  → Execute actions
  → Loop continues ✅

Iteration 3:
  Prompt executed again with action results in payload
  taskComplete = true
  → Return success with final payload
  → Loop exits ✅
```

---

## 6. WHEN SAGE TERMINATES WITH CHAT RESPONSE

### Condition: FinalStep === 'Chat'

In the LoopAgentType, a 'Chat' response signals Sage wants user interaction:

```typescript
// loop-agent-type.ts, lines 155-164
case 'Chat':
  if (!response.message) {
    retVal.step = 'Retry';
    retVal.errorMessage = 'Chat type specified but no user message provided';
  }
  else {
    retVal.step = 'Chat';
    retVal.message = response.message;
    retVal.terminate = true;  // ← Force loop termination
  }
  break;
```

### Processing in message-input.component.ts (Lines 782-811)

```typescript
// Stage 4: Direct chat response from Sage
else if (result.agentRun.FinalStep === 'Chat' && result.agentRun.Message) {
  // Mark message as completing BEFORE setting final content
  this.markMessageComplete(conversationManagerMessage);

  // Normal chat response
  conversationManagerMessage.Message = result.agentRun.Message;
  conversationManagerMessage.Status = 'Complete';

  await conversationManagerMessage.Save();
  this.messageSent.emit(conversationManagerMessage);

  // Handle artifacts if any
  if (result.payload && Object.keys(result.payload).length > 0) {
    await this.createArtifactFromPayload(
      result.payload, 
      conversationManagerMessage, 
      result.agentRun.AgentID
    );
    this.messageSent.emit(conversationManagerMessage);
  }

  // Mark user message as complete
  userMessage.Status = 'Complete';
  await userMessage.Save();
  this.messageSent.emit(userMessage);

  // Cleanup
  if (taskId) {
    this.activeTasks.remove(taskId);
  }
  this.cleanupCompletionTimestamp(conversationManagerMessage.ID);
}
```

### What Happens Next?

After Sage returns 'Chat' response:

1. **Sage message displayed to user** with the text
2. **User can send next message** (new ConversationDetailEntity created)
3. **Next user message is routed again** through the routing system:
   - If @mention → Direct invocation
   - If previous specialist agent exists → Continuity check
   - Otherwise → Back to Sage

### Example Conversation Flow

```
[Sage → User] "I can research AI or write a report. Which would you like first?"
                               ↓
[User → Sage] "research first"
                               ↓
      [Routing Logic]
      - No @mention
      - No specialist agent yet (only Sage)
      - Route to Sage again ✅
                               ↓
[Sage → User] Creates taskGraph with research task
                               ↓
      Task execution begins
```

---

## 7. MULTI-TURN CONVERSATION WITH PAYLOADCHANGEREQUEST

### Key: Sage can update payload mid-conversation without taskComplete=true

```typescript
// loop-agent-response-type.ts, lines 18-20
interface LoopAgentResponse {
  taskComplete?: boolean;
  
  // Can exist independently of taskComplete!
  payloadChangeRequest?: AgentPayloadChangeRequest;
}
```

### Scenario: Sage Building Payload Over Multiple Turns

```
Turn 1:
┌──────────────────────────────────────────────────────────────┐
│ Sage Response:                                               │
│ {                                                            │
│   taskComplete: false,                                       │
│   message: "I found research data. Need approval?",          │
│   nextStep: { type: 'Chat' },                                │
│   payloadChangeRequest: {                                    │
│     newElements: [{key: 'researchData', value: {...}}]       │
│   }                                                          │
│ }                                                            │
└──────────────────────────────────────────────────────────────┘
    ↓
  Payload updated: { researchData: {...} }
  Message displayed to user
  Loop EXITS (Chat → terminate: true)
  Payload PERSISTED for next turn

Turn 2:
┌──────────────────────────────────────────────────────────────┐
│ User: "yes, proceed"                                         │
│                                                              │
│ Sage receives:                                               │
│ - conversationHistory: [user-1, sage-1, user-2]              │
│ - Existing payload: { researchData: {...} } ← Carried forward│
│                                                              │
│ Sage Response:                                               │
│ {                                                            │
│   taskComplete: true,                                        │
│   message: "Task complete!",                                 │
│   payloadChangeRequest: {                                    │
│     newElements: [{key: 'finalReport', value: '...'}]        │
│   }                                                          │
│ }                                                            │
└──────────────────────────────────────────────────────────────┘
    ↓
  Payload updated: { researchData: {...}, finalReport: '...' }
  Task completes with full payload
```

---

## 8. COMPLETE MESSAGE FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ User Types Message & Presses Enter                                          │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           ↓
        ┌─────────────────────────────────────────┐
        │ onSend() - Create user message           │
        │ Save to database                         │
        │ Emit messageSent event                   │
        └──────────────────┬──────────────────────┘
                           ↓
        ┌─────────────────────────────────────────┐
        │ handleSuccessfulSend()                   │
        │ Parse @mentions                         │
        │ Check if first message                  │
        └──────────────────┬──────────────────────┘
                           ↓
        ┌─────────────────────────────────────────┐
        │ routeMessage()                           │
        │ Priority 1: @mention? → invokeDirectly()│
        │ Priority 2: Prev agent? → checkIntent()│
        │ Priority 3: → processMessageThroughAgent()
        └──────────────────┬──────────────────────┘
                           ↓
        ┌──────────────────────────────────────────────────┐
        │ processMessageThroughAgent()                      │
        │ 1. Create AI message (Sage status)                │
        │ 2. Save to database                              │
        │ 3. Call ConversationAgentService.processMessage() │
        └──────────────────┬───────────────────────────────┘
                           ↓
        ┌────────────────────────────────────────────────────┐
        │ ConversationAgentService.processMessage()          │
        │ 1. buildAgentMessages(conversationHistory)         │
        │    - Limit to last 20 messages                     │
        │    - Load artifacts for each message               │
        │    - Convert to ChatMessage[]                      │
        │ 2. Filter agents by permission                     │
        │ 3. Call GraphQLAIClient.RunAIAgent(Sage)           │
        └──────────────────┬─────────────────────────────────┘
                           ↓
        ┌────────────────────────────────────────────────────────┐
        │ BaseAgent.Execute() [Sage]                              │
        │ Execution Loop (executeAgentInternal):                 │
        │                                                        │
        │ while (continueExecution) {                            │
        │   ├─ Step 1: Execute prompt                            │
        │   ├─ Step 2: Parse response → LoopAgentResponse        │
        │   ├─ Step 3: Check taskComplete                        │
        │   │   ├─ If true: Set terminate=true, exit loop        │
        │   │   └─ If false: Check nextStep.type                 │
        │   ├─ Step 4: Execute next step                         │
        │   │   ├─ Sub-Agent: Delegate                           │
        │   │   ├─ Actions: Execute                              │
        │   │   └─ Chat: Set terminate=true                      │
        │   └─ Step 5: Return to message-input                   │
        │ }                                                       │
        └──────────────────┬─────────────────────────────────────┘
                           ↓
        ┌─────────────────────────────────────────────────┐
        │ Back in message-input.component.ts              │
        │ result = { success, agentRun, payload }         │
        │                                                  │
        │ Check result.payload:                            │
        │ ├─ Has taskGraph? → handleTaskGraphExecution()  │
        │ ├─ Has invokeAgent? → handleSubAgentInvocation()│
        │ ├─ FinalStep='Chat'? → Display message ✅       │
        │ └─ Silent? → handleSilentObservation()          │
        └──────────────────┬──────────────────────────────┘
                           ↓
        ┌─────────────────────────────────────────┐
        │ Update Sage AI message in database       │
        │ Set status to 'Complete'                 │
        │ Emit messageSent event                  │
        │ User sees response                      │
        └─────────────────────────────────────────┘
```

---

## 9. CODE REFERENCES SUMMARY

| Question | File | Lines | Method |
|----------|------|-------|--------|
| When is Sage invoked? | message-input.component.ts | 405-425 | `routeMessage()` |
| Task graph detection | message-input.component.ts | 764-771 | `processMessageThroughAgent()` |
| Conversation history passed | conversation-agent.service.ts | 105-188 | `processMessage()` |
| History building | conversation-agent.service.ts | 195-277 | `buildAgentMessages()` |
| taskComplete handling | base-agent.ts | 507-552 | `executeAgentInternal()` |
| LoopAgent determination | loop-agent-type.ts | 74-176 | `DetermineNextStep()` |
| Chat response handling | message-input.component.ts | 782-811 | `processMessageThroughAgent()` |
| Continuity check | conversation-agent.service.ts | 386-466 | `checkAgentContinuityIntent()` |

---

## 10. CRITICAL INSIGHTS

1. **Sage is always an option** - If no @mention and no clear continuity, message goes to Sage
2. **Conversation history is COMPLETE** - Sage sees ALL messages (up to last 20), including previous Sage responses
3. **taskComplete controls loop** - When true, agent execution terminates; when false, continues
4. **Chat response exits immediately** - FinalStep='Chat' sets terminate=true, returning control to user
5. **Payload persists across turns** - Changes via `payloadChangeRequest` are carried forward to next iteration
6. **Multi-turn workflows possible** - User can respond to Sage's chat messages, creating approval loops
7. **Artifacts are included in context** - Previous artifacts loaded and appended to message content for LLM context
8. **Single task is optimized** - Single-task graphs use direct agent execution instead of task orchestration

