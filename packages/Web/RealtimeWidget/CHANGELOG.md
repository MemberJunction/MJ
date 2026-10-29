# @memberjunction/realtime-widget

## 6.2.0-edge.6

### Patch Changes

- 709de1a: Anonymous realtime sessions are now isolated per visitor (#4931). Before, every anonymous visitor (a web-widget guest or an anonymous magic-link invitee) authenticated as the one shared Anonymous user, and the realtime session write gates compared only that user id, so a visitor who learned another visitor's session id could relay into it, close it, heartbeat it, drive its remote browser, or restore its state into a new session.
  - `UserInfo.AnonymousVisitorID` (`@memberjunction/core`) carries the token's `mj_sid`. An anonymous token without `mj_sid` is refused at sign-in.
  - One scope identity per session (`ResolveSessionScopeIdentity`, `@memberjunction/server`): the token's resource scope (`MagicLinkScope.ResourceID`) when it carries one, else the anonymous visitor's `mj_sid`. `SessionManager` stamps it as the session conversation's `ExternalID`, and `AuthorizeSessionAccess` compares it. A widget guest's resource scope is its `mj_sid`; redemptions of one resource-scoped anonymous invite share that scope by design and keep matching the `{{ScopeResourceID}}` row filters; redemptions of an unscoped multi-use invite are told apart by `mj_sid`.
  - All five write gates (`LoadOwnedRealtimeSession`, `AgentSessionResolver`, `RemoteBrowserActionResolver`, and the `lastSessionId` restore paths in `RealtimeClientSessionResolver`) go through `AuthorizeSessionAccess`.
  - `MJ: Conversations` and `MJ: AI Agent Sessions` (`@memberjunction/core-entities-server`) refuse an anonymous visitor changing `ExternalID` / `ConversationID` on an existing row, so the ownership key cannot be rewritten through generic CRUD under a role whose row filter is by user id. That includes a transaction group's `'Use'` variable on the key or on `ID`, which sets its field after validation; the protected-`Config` check on `MJ: AI Agent Sessions` also refuses a `'Use'` variable on `Config` or `ID`.
  - A named user with a resource-scoped link may also use its own session on a conversation that carries no scope stamp (one started from the Conversations app) when it can read that conversation; a conversation stamped with another scope, or one it cannot read, is still refused. `LoadSessionConversationScope` reports whether the read succeeded.
  - `SessionManager.CreateSession` refuses an anonymous caller that supplies a conversation it cannot read or whose `ExternalID` is not its own scope identity.
  - `POST /widget/session/refresh` now requires the current guest token as `Authorization: Bearer <token>` (accepted up to 300 s after it expires) plus a `DPoP` proof signed by the key the widget registered at mint (`proofKey` in the mint body; its RFC 7638 thumbprint is the token's `cnf.jkt`). It keeps the token's `mj_sid`, so a refreshed guest keeps its session, its row filters and its session-events subscription. A guest session ends 12 h after its first mint (`mj_sid_iat`, `MAX_GUEST_SESSION_SECONDS`); no token outlives that, and refresh is refused once less than 120 s remain (`MIN_REFRESHED_TOKEN_SECONDS`), so the widget's last refresh restarts the session instead of looping into the rate limiter. The proof protocol (`CreateProofOfPossessionKey`, `CreateProofOfPossessionJwt`, `VerifyProofOfPossessionJwt`, `ComputeJwkThumbprint`) is in `@memberjunction/global`. `WidgetKeyClient` (`@memberjunction/ng-realtime-widget`) and `WidgetSessionClient` (`@memberjunction/realtime-widget`) register the key and sign each refresh. When the server refuses a refresh (401/403), the web widget mints a new session and tells the visitor; `WidgetSessionError` carries the status. Both clients sign the refresh proof on the server's clock, learned from each issued token's `iat` (the HTTP `Date` header is not readable cross-origin), and the web widget times its refresh on it too, so a visitor whose device clock is minutes off keeps one session instead of restarting it at each refresh. The key needs Web Crypto, which browsers expose only in a secure context, so both widgets now need a host page served over HTTPS (or `localhost`); on a plain `http://` page the web widget shows nothing and logs `[mj-widget] The support widget needs a secure context …` to the console (`StartEmbeddedWidget`, which the embed bundle runs, never rejects).
  - A web-widget guest's text chat shows the agent's reply again. The agent runs as the system user, but since MJ#4791 only a conversation's owner (or a grantee) may write its messages, so every reply save was refused and the widget waited forever. `AgentRunner.RunAgentInConversation` takes a `ConversationWriter` (`@memberjunction/ai-agents`); `ElevateUserPayload` records the guest as `UserPayload.ElevatedFrom`, and `RunAIAgentResolver` passes it, so the reply is written as the guest and the run's own records as the system user. The run's status events (progress, streaming, completion, the liveness pulse) are stamped with the same guest (`StatusUpdateOwnerID`), so the guest's socket receives them; before, they carried the system user's id and the `statusUpdates` filter dropped every one. For an anonymous visitor the owner key is its user id plus its scope identity (`StatusUpdateOwnerKey`), and the filter rebuilds the same key from the connection, so a visitor who sends another visitor's (client-chosen) `x-session-id` does not receive that visitor's events.
  - `@memberjunction/realtime-widget`'s `build` now also runs `bundle`, so `dist/embed/mj-widget.js` is rebuilt with the package instead of only when someone remembers the separate step.
  - When the agent's reply cannot be saved, `RunAgentInConversation` now throws with the reason instead of only logging it. It still runs the artifact and media steps first, so the run's artifacts and `AIAgentRunMedia` are kept; for a caller-supplied `conversationDetailId` (which can never take the reply) it links nothing to that row and keeps only the `AIAgentRunMedia` rows. `RunAIAgentResolver` publishes a failed completion with the reason whenever a run throws, so a fire-and-forget client (the web widget, Explorer) learns of the failure at once instead of waiting out its idle timeout and then reconciling the run as a success.

  **Deploy together:** a widget bundle older than this release cannot refresh and gets 403 at its first refresh; a self-hosted copy of `mj-widget.js` must be replaced with the one this release builds. Guest tokens issued before the deploy carry no `cnf`, so they cannot be refreshed; the updated web widget then starts a new session. An anonymous magic-link session without a resource scope that was started before the deploy is refused after it; the visitor starts a new session.

- 5931f0d: Only the server writes an agent's reply (A19, second half). In `MJ: Conversation Details`, a reply (`Role` `AI` or
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
  const aiReply = await md.GetEntityObject<MJConversationDetailEntity>(
    "MJ: Conversation Details",
  );
  aiReply.ConversationID = conversationId;
  aiReply.ParentID = userMessage.ID;
  aiReply.Role = "AI";
  aiReply.Status = "In-Progress";
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

- Updated dependencies [622f166]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [b5c11d3]
- Updated dependencies [c4645bc]
- Updated dependencies [a65dfb8]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [a610c6e]
- Updated dependencies [4c97994]
- Updated dependencies [cb1e602]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [68f5c01]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/ai-core-plus@6.2.0-edge.6
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/graphql-dataprovider@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ai-realtime-client@6.2.0-edge.6
  - @memberjunction/conversations-runtime@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [0d81c53]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [c6b4b85]
- Updated dependencies [d29b5c2]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [35ed364]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [230cdad]
- Updated dependencies [7e72c86]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [2a7a098]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [7fb8598]
- Updated dependencies [1d29837]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/ai-core-plus@6.2.0-edge.5
  - @memberjunction/conversations-runtime@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/graphql-dataprovider@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ai-realtime-client@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- 7384dd6: Conversation forks: a conversation is Main (the messages with no branch) plus forks (`MJ: Conversation Branches`). A fork starts at a message and shows as a chip under it (kind icon, up to three avatars, message count, name, last activity); it opens as a full view where the inherited history sits faded behind a dashed rail, up to a fork marker, and the fork's own messages behind a solid rail. "Fork from here" on one of your own messages opens a new fork that replaces that message at once (it starts from the message before it, the composer starts with the message's text, the fork is created on the first send and named from that message, and leaving without sending creates nothing), Edit ("Save as fork"; the original message stays) and Regenerate (the first answer stays) each start a fork. A Forks button lists every fork, nested under its parent, with All and Mine filters. Everyone who can see a conversation sees its forks and who started each one. What a person is looking at is per person and in memory; nothing about the view is stored on the conversation, and changing the view ends an active voice session.
  - New entity `MJ: Conversation Branches` with `Kind` (Fork, Edit, Regenerate; default Fork), `SourceDetailID` and `UserID`; new columns `ConversationDetail.BranchID` and `ConversationDetail.ReplacedAt` (migration, so `minor`).
  - New authorization `Conversations: Fork`, granted to the UI role. The server refuses to create a fork for a person without it; deny it to a role to turn forking off for that role's members. Each person can also switch forking off in My Profile ("Fork when I edit or regenerate"; user setting `mj.conversations.forking.v1`).
  - When forking is off for a person, Edit and Regenerate change the latest turn in place: Regenerate (latest answer) and "Save and resend" (latest user message) hide the current answer and run the agent again; earlier user messages can still be edited ("Save", shown as edited). A replaced answer keeps its row (`ReplacedAt` and `HiddenToUser` set) and is left out of the chat, export, pins, the mobile transcript, rubric subjects, the returning-visitor recap and every agent context read (`ConversationEngine.LiveRowsFilter` and `IsReplacedRow`). A turn a fork depends on is not changed in place.
  - Every writer sets `BranchID` itself (null is Main): the composer and its agent turns, `AgentRunner`, the task-graph deliverer, an agent request resumed from the Agent Requests dashboard or API (the fork of the message that started the run) and realtime transcripts (a voice session's fork is fixed when it starts). The server no longer stamps it and refuses a `BranchID` that names a fork of another conversation.
  - A fork that still has its own messages or child forks cannot be deleted on its own (its messages would move into Main); deleting the conversation deletes its forks and messages.
  - `ConversationEngine` gains `CreateFork`, `ForkPointFrom`, `EditForkPoint`, `RegenerateForkPoint`, `SourceRowsFilter`, `BuildForkSummaries`, `LoadForkSummaries`, `ForkDisplayName`, `LiveRowsFilter` and `IsReplacedRow`.
  - **Removed public Angular API** (the ParentID-based thread panel; a host app that binds any of these must drop the binding): `ConversationChatAreaComponent`'s `ThreadId` input and `ThreadOpened`/`ThreadClosed` outputs; the `ThreadPanelComponent` export; `ConversationWorkspaceComponent`'s `OpenThread`, `CloseThread` and `SelectedThreadId`; `ChatConversationsResource`'s `SelectedThreadId`, `OnThreadOpened` and `OnThreadClosed`; `MessageListComponent`'s `ReplyInThread` and `ViewThread` outputs. Their deprecated camelCase aliases (`threadId`, `threadOpened`, `threadClosed`, `openThread`, `closeThread`, `selectedThreadId`, `onThreadOpened`, `onThreadClosed`, `replyInThread`, `viewThread`) are removed with them.

  Message-anchored scope: every reader of one conversation reads one path through `ConversationScope` (`LoadScope`, `TrunkScope`, `ScopeFilter`, `ScopeSubquery`, `IsInScope`, `FilterToScope`, `ArtifactVersionScopeFilter`): the open view in the chat (window, pins, artifacts, agent polling, export, voice start), and Main for the mobile app, the realtime widget, meeting transcripts, the conversation overview, rubric subjects and the returning-visitor recap. Artifact history is path-aware: the viewer takes a `Scope` input and lists only the versions a message on the path links (any direction) or that no message links, labels a gap as `v4 · from v2`, and falls back to the newest visible version with a notice. Search results carry the fork of each hit; opening one opens that fork, or Main. Skip requests carry `conversationBranchID` from the reply's fork, so Skip Brain keeps one mirror record per path.

### Patch Changes

- 961d529: `ClientRealtimeSessionConfig` gains `Transport` (`'direct'` or `'relay'`; absent means direct) and `RelayUrl`, so a minted session says how the browser reaches its provider. The Gemini Enterprise mint returns a relay session: `Transport: 'relay'`, the relay URL as `RelayUrl` (the ticket is in its path) and an empty `EphemeralToken`. MJAPI's `StartRealtimeClientSession` returns both fields; the realtime runtime and the support widget ask for them and hand them to the client driver, and mint without them against a server that predates them. The `'gemini-enterprise'` client connects to `RelayUrl` and refuses a session that is not a relay session. Every other client driver refuses a relay session in `Connect` (`BaseRealtimeClient.AssertTransportSupported`); a driver that can open one opts in through `SupportsRelayTransport`. The relay URL is never logged.
- 0d0ba18: An app that shows no agent video now tells the mint, and the mint asks the model for no avatar. Every browser session counted as one that could show an avatar, so a video-enabled agent's call from the embeddable widget or the mobile app, which have no channel that shows the agent's video, was steered to a model that renders avatars and minted with the avatar asked for; the browser then dropped it at connect (`host`). `StartRealtimeClientSession` takes `showsAgentVideo`: with `false` the session prep (`PrepareClientSessionInput.ShowsAgentVideo`) asks the driver for no avatar, keeps the avatar persona's voice, prefers no avatar model in the default model walk, and returns `AvatarStatusJson` with the existing reason `host` ("Audio only: this app can't show the avatar"); absent or `true` behaves as before. The argument only ever turns video off. The realtime runtime works it out from the session's channels before the mint: when no channel that could be in the session shows the agent's video (an Avatar channel switched off in the registry counts as none), the launch request carries `ShowsAgentVideo: false` (`RealtimeSessionLaunchRequest.ShowsAgentVideo`) and the stock launcher sends `showsAgentVideo: false`; a host whose Avatar channel can show it sends nothing new. The embeddable support widget's guest mint always sends it. Against a server that predates the argument, both mint without it, once, and remember (the launcher's fallback pattern). Integration check RD13 also checks that an app without agent video asks for no avatar and keeps the persona's voice.
- b3db2aa: The realtime relay caps what it holds while the upstream opens at 8 MiB as well as 512 frames, and closes a tunnel whose upstream stops reading once 16 MiB is queued for it (1013 to the browser, 1001 upstream), as it already did for a browser that falls behind (#5499).

  Withdrawing agent vision (`SetLiveKitAgentVision` with `Allow: false`) no longer goes through room authorization, so a cancelled meeting or a failed lookup cannot keep an agent watching (#5500).

  The mint fallback for a server without the relay fields matches `field "RelayUrl"`, not any message that names RelayUrl.

  The agent-vision button says what the consent covers: in a room with more than one agent, every agent in the room. Its label there reads "Let agents see me" / "Hide from agents" and its name "Let agents in this room see your camera and screen"; with one agent, "Let the agent see me" / "Hide from the agent" and "Let the agent see your camera and screen". A failure says "Couldn't change what the agent sees" with one agent and "Couldn't change what agents see" with several (#5502).

- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [d17de94]
- Updated dependencies [c8409ce]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [4412e85]
- Updated dependencies [6dce70c]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [dde482c]
- Updated dependencies [a4b23b7]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [91be34f]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [318084b]
- Updated dependencies [69bf67c]
- Updated dependencies [97a85b9]
- Updated dependencies [efe4738]
- Updated dependencies [8bac4d6]
- Updated dependencies [08b3d7b]
- Updated dependencies [dbc3462]
- Updated dependencies [d9da1ad]
- Updated dependencies [c5472d2]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [ca2791b]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [7f243eb]
- Updated dependencies [a3fcce8]
- Updated dependencies [a08ed58]
- Updated dependencies [2bc4677]
- Updated dependencies [42f8016]
- Updated dependencies [6b587b3]
- Updated dependencies [891dc77]
- Updated dependencies [98dbb78]
- Updated dependencies [0a952ee]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [20d1f4a]
- Updated dependencies [f1fb411]
- Updated dependencies [f0c78c3]
- Updated dependencies [6a19f78]
- Updated dependencies [e402de5]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d0df5a1]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [44428b5]
- Updated dependencies [1b8791e]
- Updated dependencies [02bb563]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [c9e1891]
- Updated dependencies [aac148b]
- Updated dependencies [d2cb42e]
- Updated dependencies [0a3a56a]
- Updated dependencies [7a08dc1]
- Updated dependencies [cf50330]
- Updated dependencies [cbddadb]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [f00d5fc]
- Updated dependencies [6b487b8]
  - @memberjunction/ai-core-plus@6.2.0-edge.4
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/graphql-dataprovider@6.2.0-edge.4
  - @memberjunction/ai-realtime-client@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/conversations-runtime@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [5acbec6]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [72e082b]
- Updated dependencies [28c92e0]
- Updated dependencies [d0a8dbf]
- Updated dependencies [ec97ad4]
- Updated dependencies [b1b6d3d]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/graphql-dataprovider@6.2.0-edge.3
  - @memberjunction/ai-realtime-client@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/conversations-runtime@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [660ef45]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [5148534]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [ce1a5c3]
- Updated dependencies [ef43cf3]
- Updated dependencies [ea4080e]
- Updated dependencies [b44c7cf]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [7e57b48]
- Updated dependencies [705ab4e]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/graphql-dataprovider@6.2.0-edge.2
  - @memberjunction/conversations-runtime@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ai-realtime-client@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [15a4333]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [5da3ad2]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [c261eb8]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
- Updated dependencies [9845c00]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/conversations-runtime@6.2.0-edge.1
  - @memberjunction/graphql-dataprovider@6.2.0-edge.1
  - @memberjunction/ai-realtime-client@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [5df9486]
- Updated dependencies [c157749]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [3977917]
- Updated dependencies [d61b425]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [af57e8d]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ai-realtime-client@6.2.0-edge.0
  - @memberjunction/graphql-dataprovider@6.2.0-edge.0
  - @memberjunction/conversations-runtime@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- Updated dependencies [634aa8c]
- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [5ecfdb4]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [59def38]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [ada8784]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [11de1a3]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [2e2879e]
- Updated dependencies [97cbf5f]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [9a29da4]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [394d276]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [6cd337d]
- Updated dependencies [394d276]
- Updated dependencies [1c0d586]
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/graphql-dataprovider@6.1.0
  - @memberjunction/ai-realtime-client@6.1.0
  - @memberjunction/conversations-runtime@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/graphql-dataprovider@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/conversations-runtime@6.1.0-edge.7
  - @memberjunction/ai-realtime-client@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [0db6105]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/graphql-dataprovider@6.1.0-edge.6
  - @memberjunction/conversations-runtime@6.1.0-edge.6
  - @memberjunction/ai-realtime-client@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [22ec804]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/conversations-runtime@6.1.0-edge.5
  - @memberjunction/graphql-dataprovider@6.1.0-edge.5
  - @memberjunction/ai-realtime-client@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-realtime-client@6.1.0-edge.4
  - @memberjunction/conversations-runtime@6.1.0-edge.4
  - @memberjunction/graphql-dataprovider@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [199eb2b]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/ai-realtime-client@6.1.0-edge.3
  - @memberjunction/conversations-runtime@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/ai-realtime-client@6.1.0-edge.2
  - @memberjunction/conversations-runtime@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1
  - @memberjunction/conversations-runtime@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/ai-realtime-client@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/conversations-runtime@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/ai-realtime-client@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/conversations-runtime@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/ai-realtime-client@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/conversations-runtime@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/ai-realtime-client@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/conversations-runtime@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/ai-realtime-client@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [9e2278c]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/ai-realtime-client@5.49.0
  - @memberjunction/conversations-runtime@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/ai-realtime-client@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/conversations-runtime@5.48.0
  - @memberjunction/graphql-dataprovider@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/conversations-runtime@5.47.0
  - @memberjunction/graphql-dataprovider@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/ai-realtime-client@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/conversations-runtime@5.46.0
  - @memberjunction/graphql-dataprovider@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/ai-realtime-client@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/conversations-runtime@5.45.1
  - @memberjunction/graphql-dataprovider@5.45.1
  - @memberjunction/ai@5.45.1
  - @memberjunction/ai-realtime-client@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/graphql-dataprovider@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/conversations-runtime@5.45.0
  - @memberjunction/ai@5.45.0
  - @memberjunction/ai-realtime-client@5.45.0
