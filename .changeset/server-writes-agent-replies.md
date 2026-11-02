---
"@memberjunction/core-entities": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/task-graph": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ai-agent-client": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/realtime-widget": patch
"@memberjunction/mobile-app": patch
"@memberjunction/integration-test-suite": patch
---

Only the server writes an agent's reply (A19, second half). In `MJ: Conversation Details`, a reply (`Role` `AI` or
`Error`, compared trimmed and in any case) is created, and what it says changed (`Message`, `Status`, `Error`, the
response form and commands, `AgentID`, attachments and the other authored fields), only on an entity instance server
code has marked with `MJConversationDetailEntityExtended.MarkServerAuthoredReply()`. The marker is not a field, so no
GraphQL input, `OldValues___` or transaction variable can set it; a person's save of a reply is refused, and so is an
unmarked save as the system user. A marked write still needs its user to own the conversation or hold a grant on it.
The owner's rating, pinning, hiding and other bookkeeping keep the conversation-level rules.

**Breaking API changes:**
- `RunAIAgentFromConversationDetail` takes `userMessageId` (the person's saved message) in place of
  `conversationDetailId` (a reply row the caller created). The server creates the reply row (`ParentID` the user's
  message) before the run and names it in the fire-and-forget acknowledgement, `result` =
  `{ accepted, fireAndForget, conversationDetailId, createdAt }`; every progress, streaming and partial-result message
  now carries `conversationDetailId` too. Three optional arguments say where the reply sits: `replyParentId` (a message
  of the same conversation the caller can read; checked by the server), `announcedByAgentId` (an active agent whose
  fixed line "Continuing with **{agent}** for refinement..." the server posts first; the ack then names it as
  `announcementDetailId`), and `replyBranchId` (a fork of the conversation whose path contains the user's message, used
  when Regenerate or a forked turn runs on a newly created branch while the user's message remains on its original
  branch). `GraphQLAIClient.RunAIAgentFromConversationDetail` takes `userMessageId`, `onAccepted`, and optional
  `replyParentId` / `announcedByAgentId` / `replyBranchId`; `AgentClientSession.RunAgentFromConversationDetail` takes
  `UserMessageId`, `OnAccepted`, and optional `ReplyParentId` / `AnnouncedByAgentId` / `ReplyBranchId`
  (`RunAgentParams.ConversationDetailId` is now `UserMessageId`); `ConversationAgentRunner.ProcessMessage` drops
  `conversationDetailId` for `onReplyAccepted` and optional `ReplyBranchID`. `AgentRunner.CreateAgentReplyDetail()`
  creates a reply row and `RunAgentInConversation` takes it as `agentResponseDetail`. `FireAndForgetHelper` gains an
  opt-in `deferMessagesUntilAck`.
- `RunAIAgent` and `RunAIAgentSystemUser` with a caller-supplied `conversationDetailId` no longer write progress or
  results into that row: `AgentRunner` only marks reply rows it creates itself, so a write into a caller-named detail ID
  is refused by the gate with `"Only the server writes an agent's reply."` Callers that want a server-written
  conversation reply must use `RunAIAgentFromConversationDetail` with `userMessageId` (or, in server code, pass a
  server-created row via `AgentRunner.CreateAgentReplyDetail()` / `agentResponseDetail`).
- `TaskContinuationParams.SubmittedByUserID` (`string | null`) in `@memberjunction/task-graph` is now a **required**
  member on `TaskContinuationParams`, carrying the user who submitted the task graph so continuation delivery writes as
  the submitter rather than the conversation's owner.

MJ's chat no longer creates or saves reply rows: it shows an unsaved "Starting…" placeholder until the
acknowledgement, keys the turn's task and completion by the acknowledged ID, starts the reply's timer at the row's
server creation time, and reloads the reply the server wrote. A delegate's reply still threads under the manager's
reply, and the manager's "Continuing with X for refinement..." line still shows, both now written by the server; a
failed reply is shown with the chat's usual `❌ **{agent}** failed` header, formatted when it renders. A delegate's
failed first attempt is hidden when its retry takes over. `TaskGraph.Submit` takes an optional `postStatusMessage`:
the server then writes the workflow's status bubble under the given reply (only facts it knows: the task count and
whether the submission was accepted, never the spec's name or reasoning), binds the graph to it, and returns its ID as
`statusConversationDetailID`; MJ's chat uses it in place of its own status row. The realtime
session's transcript, tool and anchor rows, the task-graph outcome (now written as the **submitter**, `SubmittedByUserID`,
because `TaskGraph.Submit` accepts any conversation detail ID and writing as the conversation owner would let an Edit
grantee or non-owner post as the owner; a graph with no resolvable submitter is refused by the conversation gate and
logged), the orphaned-reply reconciler, bridge transcripts and realtime agent transcripts all write as marked server
code. The web widget and the mobile app stop creating reply rows.

### Migration Guide

1. **Client conversation turns (`RunAIAgentFromConversationDetail` / `RunAgentFromConversationDetail`):** Stop
   pre-creating `Role = 'AI'` / `'Error'` `MJ: Conversation Details` rows (which `Validate()` now refuses unless
   authored on the server with `MarkServerAuthoredReply()`) and pass the saved `Role = 'User'` message ID instead:

```ts
// Before
const aiReply = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details');
aiReply.ConversationID = conversationId;
aiReply.ParentID = userMessage.ID;
aiReply.Role = 'AI';
aiReply.Status = 'In-Progress';
await aiReply.Save();

const result = await session.RunAgentFromConversationDetail({
    ConversationDetailId: aiReply.ID,
    AgentId: agentId,
});

// After
const result = await session.RunAgentFromConversationDetail({
    UserMessageId: userMessage.ID,
    AgentId: agentId,
    OnAccepted: ({ ConversationDetailId, CreatedAt }) => {
        // Key streaming progress and completion tracking by ConversationDetailId
    },
});
```

2. **`RunAIAgent` / `RunAIAgentSystemUser` callers passing `conversationDetailId`:** Passing a caller-supplied
   `conversationDetailId` to `RunAIAgent` or `RunAIAgentSystemUser` no longer writes progress or results into that row
   (refused with `"Only the server writes an agent's reply."`). Use `RunAIAgentFromConversationDetail` with
   `userMessageId` for client-initiated conversation replies, or in server-side code create the reply with
   `AgentRunner.CreateAgentReplyDetail()` and pass it as `agentResponseDetail` to `RunAgentInConversation`.

3. **Custom `ITaskContinuationDeliverer` / `TaskContinuationParams` callers (`@memberjunction/task-graph`):** Include the
   required `SubmittedByUserID: string | null` field when constructing `TaskContinuationParams`:

```ts
const continuationParams: TaskContinuationParams = {
    // ...existing fields
    SubmittedByUserID: currentUser.ID,
};
```
