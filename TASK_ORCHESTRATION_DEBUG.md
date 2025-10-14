# Task Orchestration - Debug & Testing Guide

## 🐛 Issues Fixed in This Update

### 1. Added PubSub Logging
**Problem**: Couldn't tell if PubSub messages were being published

**Fix**: Added detailed logging in `TaskOrchestrator.ts`:
```typescript
LogStatus(`📡 Publishing task progress: ${taskName} - ${message} (${percentComplete}%) to session ${sessionId}`);
LogStatus(`📡 Publishing agent progress: ${taskName} → ${agentStep} to session ${sessionId}`);
```

**Also logs warnings if PubSub not available**:
```typescript
LogStatus(`⚠️ PubSub not available for progress updates (pubSub: ${!!this.pubSub}, sessionId: ${!!this.sessionId}, userPayload: ${!!this.userPayload})`);
```

### 2. Added ExecuteTaskGraph Result Logging
**Problem**: GraphQL result showing `data: undefined`, `errors: undefined`

**Fix**: Added logging before returning from `TaskResolver.ts`:
```typescript
LogStatus(`Returning ExecuteTaskGraph result: ${JSON.stringify({
    success: result.success,
    resultsCount: result.results.length,
    firstResult: result.results[0]
})}`);
```

### 3. Enhanced Client-Side Error Logging
**Problem**: "Unknown error" wasn't helpful

**Fix**: Added detailed logging in `message-input.component.ts`:
```typescript
console.log('📊 ExecuteTaskGraph result:', {
  hasData: !!result?.data,
  hasErrors: !!result?.errors,
  data: result?.data,
  errors: result?.errors
});
```

## 🔍 What to Check Next Time You Test

### Server Logs to Look For

1. **PubSub Availability Check**:
   ```
   ⚠️ PubSub not available for progress updates (pubSub: true, sessionId: true, userPayload: true)
   ```
   - If you see `false` for any of these, PubSub won't work
   - Make sure `sessionId` is being passed to `TaskOrchestrationResolver`

2. **PubSub Publishing**:
   ```
   📡 Publishing task progress: Write Blog - Starting task (0%) to session abc-123
   📡 Publishing agent progress: Write Blog → initialization to session abc-123
   ```
   - If you don't see these, PubSub isn't publishing
   - Check that pubSub, sessionId, and userPayload are all set

3. **ExecuteTaskGraph Return Value**:
   ```
   Returning ExecuteTaskGraph result: {"success":true,"resultsCount":1,"firstResult":{"taskId":"...","success":true}}
   ```
   - This shows what the resolver is actually returning
   - If this looks correct but client sees `data: undefined`, it's a GraphQL transport issue

### Client Console Logs to Look For

1. **ExecuteTaskGraph Result**:
   ```
   📊 ExecuteTaskGraph result: {
     hasData: true,
     hasErrors: false,
     data: { ExecuteTaskGraph: { success: true, results: [...] } },
     errors: undefined
   }
   ```
   - If `hasData: false` but server logs show correct return, there's a GraphQL issue
   - If `hasErrors: true`, check the `errors` array for details

2. **PubSub Subscription**:
   ```
   [Task Progress] Write Blog: Starting task (0%)
   [Agent Progress] Write Blog → initialization: Initializing Marketing Agent...
   ```
   - If you see these, PubSub is working!
   - If not, check that the component is subscribed

3. **Task Execution Message Updates**:
   - The conversation detail should update in real-time
   - Check the database to see if `Message` field is being updated

## 🧪 Testing Checklist

### Before Testing
- [ ] Rebuild MJServer: `cd packages/MJServer && npm run build`
- [ ] Rebuild conversations: `cd packages/Angular/Generic/conversations && npm run build`
- [ ] Restart API server
- [ ] Reload browser (hard refresh to clear cache)

### During Test
- [ ] Open browser console
- [ ] Open server logs
- [ ] Send a message that triggers task orchestration

### What to Observe

**Server Logs** (in order):
1. `=== EXECUTING TASK GRAPH FOR CONVERSATION: ...`
2. `Created parent workflow task: ...`
3. `Created child task: ... under parent ...`
4. `📡 Publishing task progress: ... - Starting workflow execution (0%) to session ...`
5. `📡 Publishing task progress: ... - Starting task (0%) to session ...`
6. `📡 Publishing agent progress: ... → initialization to session ...`
7. ... more progress messages ...
8. `Created artifact: ...`
9. `=== TASK GRAPH EXECUTION COMPLETE ===`
10. `Returning ExecuteTaskGraph result: ...`

**Client Console** (in order):
1. `📋 Task graph detected in Chat response, starting task orchestration`
2. `📊 ExecuteTaskGraph result: ...`
3. `[Task Progress] ...: Starting workflow execution (0%)`
4. `[Agent Progress] ... → initialization: ...`
5. ... more progress messages ...
6. `✅ Task graph execution completed successfully`

**UI** (in order):
1. User message appears
2. CM message: "👉 Delegating to **Marketing Agent**" (completes immediately)
3. Task execution message: "⏳ Starting workflow execution..."
4. Task execution message updates in real-time:
   - "⏳ **Write Blog** (0%) - Starting task"
   - "⏳ **Write Blog** (0%) - _initialization: Initializing..._"
   - "⏳ **Write Blog** (45%) - _prompt_execution: Running..._"
   - etc.
5. Task execution message: "✅ **Write Blog** completed successfully"
6. Artifact appears in conversation

## 🔧 Common Issues & Fixes

### Issue: No PubSub messages in server logs
**Symptom**: No `📡 Publishing...` messages

**Possible Causes**:
1. **PubSub not passed to TaskOrchestrator**
   - Check `TaskResolver.ts` line 81: `new TaskOrchestrator(currentUser, pubSub, sessionId, userPayload)`
   - Make sure all 4 parameters are passed

2. **SessionId not available**
   - Check that `@Arg('sessionId') sessionId: string` is in the mutation
   - Check that client is passing sessionId in variables

**Fix**: Add this logging to TaskOrchestrationResolver:
```typescript
LogStatus(`Creating orchestrator with: pubSub=${!!pubSub}, sessionId=${sessionId}, userPayload=${!!userPayload}`);
```

### Issue: PubSub messages in server logs but not reaching client
**Symptom**: See `📡 Publishing...` in server, but no `[Task Progress]` in client console

**Possible Causes**:
1. **Client not subscribed to PubSub**
   - Check that `subscribeToPushStatus()` is called in `ngOnInit()`
   - Check for errors in subscription

2. **SessionId mismatch**
   - Server publishing to session `abc-123`
   - Client subscribed to different session
   - Check `GraphQLDataProvider.Instance.sessionId`

3. **Message filter not matching**
   - Client filtering for `resolver === 'TaskOrchestrator'`
   - Server publishing with different resolver name
   - Check the JSON.parse in client

**Fix**: Add logging in client subscription:
```typescript
this.pushStatusSubscription = dataProvider.PushStatusUpdates().subscribe((status: any) => {
  console.log('🔔 PubSub message received:', status);
  // ... rest of code
});
```

### Issue: Task execution message not updating
**Symptom**: Message stays "⏳ Starting workflow execution..." forever

**Possible Causes**:
1. **Message not registered in activeTaskExecutionMessages Map**
   - Check that `this.activeTaskExecutionMessages.set(...)` is called
   - Check the Map contains the message ID

2. **Message Save() failing**
   - Check for errors in `updateTaskExecutionMessages()`
   - Database permissions issue?

3. **messageSent not emitting**
   - Check that `this.messageSent.emit(message)` is called
   - Check that parent component is listening

**Fix**: Add logging:
```typescript
private async updateTaskExecutionMessages(...) {
  console.log(`Updating ${this.activeTaskExecutionMessages.size} active messages`);
  for (const [messageId, message] of this.activeTaskExecutionMessages.entries()) {
    console.log(`Updating message ${messageId} with: ${progressMessage}`);
    // ... rest of code
  }
}
```

### Issue: GraphQL result is undefined
**Symptom**: `hasData: false`, `hasErrors: false` in client

**Possible Causes**:
1. **Mutation not awaited**
   - Check that `await GraphQLDataProvider.Instance.ExecuteGQL(...)` has await

2. **GraphQL schema mismatch**
   - Field names don't match between resolver and query
   - Check mutation definition matches resolver return type

3. **Serialization issue**
   - Returning non-serializable objects
   - Check that all fields are primitives or JSON-serializable

**Fix**: Check server logs for the return value, then compare to what client receives

## 📝 Summary

The task orchestration system should now:
1. ✅ Publish PubSub progress updates (with logging to verify)
2. ✅ Client subscribes to updates (with logging to verify)
3. ✅ Update task execution message in real-time
4. ✅ Show detailed progress with task name and percentage
5. ✅ Show agent details as sub-text
6. ✅ Complete with final success/error message
7. ✅ Create artifacts and link to conversation

**Next test should show**:
- Server logs with `📡 Publishing...` messages
- Client console with `[Task Progress]` and `[Agent Progress]` messages
- UI with real-time updating task execution message
- Final artifact appearing in conversation
