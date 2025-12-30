# Conversation UI Test Cases

Manual test cases for verifying conversation and agent run functionality.

---

## Streaming & Navigation Tests

### TC-01: Basic Streaming Display
1. Start a message with an agent
2. Verify streaming updates appear progressively
3. Verify message shows "In-Progress" during execution
4. Verify final response displays on completion

### TC-02: Navigate Away and Back During Streaming
1. Start a long-running agent request
2. Navigate away to another area of the app
3. Return to the conversation while agent is still running
4. **Expected:** Streaming messages continue to display correctly

### TC-03: Multi-Conversation Concurrent Agent Runs
1. Open Conversation A, start a long-running agent (e.g., Research Agent)
2. Open Conversation B, start another long-running agent
3. Switch back and forth between conversations multiple times
4. **Expected:** Each conversation shows only its own streaming messages, no cross-contamination

### TC-04: Full Browser Refresh During Agent Run
1. Start a long-running agent request
2. Perform full browser refresh (F5 / Cmd+R)
3. Navigate back to the conversation
4. **Expected:**
   - If agent still running: streaming resumes
   - If agent completed: final response is displayed correctly

### TC-05: Return After Agent Run Completion
1. Start a long-running agent request
2. Navigate away from the conversation
3. Wait for agent run to complete
4. Return to the conversation
5. **Expected:** Streaming message is gone, final artifact or agent response is displayed correctly

---

## User Notification Tests

### TC-06: Long-Running Agent Notification
1. Start an agent run that takes >30 seconds
2. Navigate away from the conversation
3. Wait for completion
4. **Expected:** User notification appears when agent run completes

### TC-07: Short Agent Run - No Notification
1. Start an agent run that completes in <30 seconds
2. **Expected:** No user notification is generated (avoid notification spam)

---