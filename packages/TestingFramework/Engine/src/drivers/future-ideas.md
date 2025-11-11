# Future Ideas for Test Framework Drivers

## Multi-Turn Agent Evaluation

**Status:** Proposed
**Driver:** AgentEvalDriver
**Proposed By:** Team discussion
**Date:** 2025-01-10

### Overview

Currently, the AgentEval test type only supports single-turn agent interactions (one user message → one agent response). Extend this to support multi-turn conversations for more realistic agent testing scenarios.

### Use Cases

- **Sequential task completion**: "Book a flight" → "Change the date" → "Confirm booking"
- **Information gathering**: Agent asks clarifying questions across multiple turns
- **Error recovery**: Test how agent handles and recovers from mistakes
- **Context retention**: Verify agent maintains context across conversation
- **Complex workflows**: Multi-step processes that require back-and-forth interaction

### Proposed Implementation Phases

#### Phase 1: Simple Array Support (MVP)
**Minimal changes, maximum value**

```typescript
// AgentEvalInput enhancement
{
  userMessage: string | string[];  // Accept array of messages
  // ... existing fields
}
```

**Behavior:**
- Run each message sequentially in same conversation
- Abort on any agent failure
- Run oracles only after final turn
- Single TestRun for entire conversation
- All artifacts linked to same test

**Changes Required:**
- Update `AgentEvalInput.userMessage` type definition
- Update `AgentEvalDriver.executeAgent()` to loop through messages
- Track conversation ID across turns
- Update result aggregation to include all turns

**Estimated Effort:** ~50-100 lines of code

#### Phase 2: Structured Turn-Based Evaluation (Advanced)
**Full control over multi-turn scenarios**

```typescript
{
  userMessage?: string;  // Backward compatible

  // New structured turns
  conversationTurns?: Array<{
    userMessage: string;

    // Optional: Validate this turn before proceeding
    turnOracles?: Array<{
      type: string;  // e.g., "ExactMatch", "SchemaValidator"
      config: any;
    }>;

    // Should we continue if this turn fails oracles?
    continueOnFailure?: boolean;  // default: false

    // Expected agent behavior for this turn
    expectSuccess?: boolean;  // default: true
  }>;
}
```

**Benefits:**
- Per-turn validation (early abort if agent goes off-track)
- Test negative cases (agent should refuse certain requests)
- Better error reporting (which turn failed and why)
- Conditional flow (continue even if turn fails)

**Changes Required:**
- New `ConversationTurn` interface
- Per-turn oracle execution in `runOracles()`
- Enhanced result tracking (turn-by-turn breakdown)
- Updated error handling and reporting
- Documentation and examples

**Estimated Effort:** ~200-300 lines of code + tests

#### Phase 3: Advanced Features (Future)
**Power user capabilities**

- **Branching conversations**: Different paths based on agent responses
- **Dynamic turn generation**: Generate next message based on previous response
- **Parallel turn testing**: Test same conversation with different models/configs
- **Turn timing controls**: Delays between turns, timeouts per turn
- **Rich media turns**: Images, files, structured data in messages

### Technical Considerations

#### 1. Conversation State Management
```typescript
// Track conversation across turns
let conversationId: string | null = null;

for (const turn of userMessages) {
    const result = await runner.RunAgentInConversation(params, {
        userMessage: turn,
        conversationId: conversationId,  // Continue existing conversation
        // ... other options
    });

    conversationId = result.conversationId;

    // Check for failures and decide whether to continue
}
```

#### 2. Oracle Execution Strategy
- **Option A (Current):** Run all oracles after final turn only
- **Option B (Phase 2):** Run turn-specific oracles after each turn + final oracles at end
- **Option C (Hybrid):** Configurable per test

#### 3. Result Recording
**Single TestRun approach (recommended):**
- One TestRun entity for entire conversation
- Store turn-by-turn details in `ResultDetails` JSON field
- Link all agent runs to same TestRun
- Aggregate scores across all turns

```typescript
{
  testRunId: "...",
  status: "Passed" | "Failed",
  overallScore: 0.85,
  turns: [
    { turnNumber: 1, userMessage: "...", agentResponse: "...", score: 0.9 },
    { turnNumber: 2, userMessage: "...", agentResponse: "...", score: 0.8 }
  ],
  // ... existing fields
}
```

#### 4. Backward Compatibility
All changes must maintain backward compatibility:
- Existing single-turn tests continue to work
- `userMessage: string` is still valid
- No breaking changes to AgentEvalConfig or expected outcomes

### Alternative Approaches Considered

#### Array-only (Simpler but less flexible)
```typescript
userMessages: string[];  // New field, breaking change
```
❌ Not backward compatible
❌ Can't mix single/multi-turn easily

#### Separate test type (More isolated but duplicative)
```typescript
// New "AgentConversationEval" test type
```
❌ Code duplication
❌ Fragmenting test types unnecessarily
✅ Cleaner separation of concerns

### Migration Path for Existing Tests

**No changes required** - all existing tests continue to work:

```typescript
// Existing single-turn test (no changes needed)
{
  userMessage: "Book a flight to NYC"
}

// New multi-turn test
{
  userMessage: ["Book a flight to NYC", "Change to next Tuesday", "Confirm"]
}
```

### Examples

#### Simple Multi-Turn (Phase 1)
```json
{
  "userMessage": [
    "Show me a complete member activity timeline for Sarah Johnson",
    "Focus on just the last 6 months",
    "Export this to PDF"
  ],
  "expectedOutcomes": {
    "outputType": "Component",
    "component": {
      "type": "ActivityTimeline",
      "hasExportButton": true,
      "dateRange": "6 months"
    }
  }
}
```

#### Structured Turns (Phase 2)
```json
{
  "conversationTurns": [
    {
      "userMessage": "Create a new member profile",
      "expectSuccess": true,
      "turnOracles": [
        {
          "type": "SchemaValidator",
          "config": { "requiresFields": ["firstName", "lastName"] }
        }
      ]
    },
    {
      "userMessage": "Use a fake email address",
      "expectSuccess": false,
      "continueOnFailure": false
    }
  ]
}
```

### Open Questions

1. **How to handle agent runs?**
   - Create one AgentRun per turn, or one for entire conversation?
   - Current thinking: One per turn (matches UI/tracing expectations)

2. **Timeout behavior:**
   - Per-turn timeout, or overall conversation timeout, or both?
   - Current thinking: Both, with per-turn as part of overall

3. **Artifact handling:**
   - Can each turn create artifacts? How to track which turn created what?
   - Current thinking: Yes, artifacts track conversation detail (turn)

4. **Cost tracking:**
   - Aggregate costs across all turns? Report per-turn costs?
   - Current thinking: Both - aggregate in TestRun, detail in turn breakdown

### Related Work

- **LangChain Evaluation**: Multi-turn evaluation patterns
- **ChatGPT Eval Framework**: Turn-based testing
- **MemberJunction Agent Framework**: Already supports multi-turn via conversation context

### References

- AgentEvalDriver.ts - Current single-turn implementation
- AgentRunner.ts - Supports conversation context via conversationMessages
- Conversation entity model - Already tracks turn-by-turn details

---

**Next Steps:**
1. Gather team feedback on approach
2. Prioritize against other testing framework work
3. Create detailed implementation plan for Phase 1
4. Consider proof-of-concept implementation
