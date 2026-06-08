# Architectural Proposal: AI Agent Sessions & Channels

## Overview

This proposal outlines the design for adding real-time, bi-directional streaming modalities (such as voice/audio, canvas sync, and remote client control) to the MemberJunction AI agent framework. 

Rather than creating a new "Voice Agent" type or forking the existing `BaseAgent` / `LoopAgentType` / `FlowAgentType` codebases, we introduce a first-class stateful wrapper: **AI Agent Sessions** and **Channels**. 

Under this design, any existing agent can be executed within the context of a session. The session acts as the long-lived, multi-channel socket orchestrator, while individual `AIAgentRun` executions handle request/response steps.

---

## Architectural Diagram

```mermaid
graph TD
    subgraph Client [Client Application / Browser]
        V_UI["Voice UI (Audio Input/Output)"]
        C_UI["Chat UI (Text Input/Output)"]
        CC_UI["Client Controls (Navigation / Actions)"]
    end

    subgraph Sessions [AI Agent Session Layer]
        SessionHost["Session Host / Session Manager"]
        
        subgraph Channels [Active Modal Channels]
            Ch_Voice["VoiceAudio Channel<br/>(WebSockets / WebRTC)"]
            Ch_Chat["TextChat Channel<br/>(SSE / WebSockets)"]
            Ch_Control["ClientControl Channel<br/>(Bi-directional Socket)"]
        end
    end

    subgraph AgentFramework [@memberjunction/ai-agents]
        Runner["AgentRunner.ExecuteAgent()"]
        Agent["BaseAgent (Loop / Flow Agent)"]
    end

    subgraph Data [Data Layer]
        D_Session["AIAgentSession Record<br/>(+ AIAgentSessionChannel rows)"]
        D_Run["AIAgentRun Record"]
    end

    %% Client Connections
    V_UI <-->|Bi-directional Audio| Ch_Voice
    C_UI <-->|Bi-directional Text| Ch_Chat
    CC_UI <-->|Real-time Tools / Commands| Ch_Control

    %% Host Orchestration
    SessionHost --> Channels
    SessionHost --> D_Session

    %% Triggering Runs
    SessionHost -->|Executes Run with Session Context| Runner
    Runner --> Agent
    Agent --> D_Run
    D_Run -->|Links to| D_Session

    %% Real-time streaming
    Agent -->|Emit events, text, tool requests| SessionHost
    SessionHost -->|Stream tokens / tool calls| Channels
```

---

## Core Concepts

### 1. AI Agent Session (`AIAgentSession`)
An **Agent Session** represents a long-running, stateful connection and conversation lifecycle between a user and an agent. 
* **Statefulness**: It persists across multiple individual turns (Runs).
* **Connection Anchor**: It acts as the orchestrator of all active communication sockets.
* **Schema**: Stored in a new `AIAgentSession` table. Each active channel attached to the session is a row in the normalized `AIAgentSessionChannel` table (see [Proposed Database Schema Additions](#proposed-database-schema-additions) for the rationale).

### 2. Pluggable Agent Channel Registry (`AIAgentChannel`)
Channels are completely pluggable, avoiding hardcoded modalities. Developers can register new channel definitions (e.g., voice, text, canvas, video) via the `MJ: AI Agent Channels` database entity.
* **Pluggable Drivers**: Each channel definition specifies a `ServerPluginClass` and `ClientPluginClass`.
* **ClassFactory Resolution**: The Session Host and client application instantiate these plugin classes dynamically at runtime using MemberJunction's standard `ClassFactory` registry.

### 3. Pluggable Interfaces (`IAgentChannelServer` & `IAgentChannelClient`)
New channels snap into the framework by implementing standard pluggable interfaces:
* **`IAgentChannelServer`**: Defines how the server-side channel manages its WebSocket/WebRTC connections, handles inbound messages, and streams outbound data/audio chunks.
* **`IAgentChannelClient`**: Defines how the client-side channel initiates connection sockets, handles incoming audio/visual renderings, and pushes user interactions (like speech audio) up to the server.

### 4. Agent Run (`AIAgentRun`)
An **Agent Run** remains the single-turn execution unit. When a user input is received via any channel, the Session Host triggers an `AIAgentRun`.
* **Session ID Propagation**: The `ExecuteAgentParams` struct is extended to accept an `agentSessionID` (distinct from the existing transport `sessionID`).
* **Streaming Hooks**: The agent streams its output (e.g., text tokens, UI commands, or audio frames) back to the session's pluggable channels in real time.

---

## Relationship: Sessions vs. Conversations

An important question is how the proposed **Session** concept relates to the existing **Conversation** (`MJConversation`) and **ConversationDetail** (`MJConversationDetail`) entities in the MemberJunction database.

They are **not** the same concept, but they are tightly coupled. The table below outlines the core differences:

| Dimension | Conversation (`MJConversation`) | Session (`AIAgentSession`) |
|---|---|---|
| **Nature** | Persistent **Document of Record** | Temporary **Operational Connection** |
| **Lifecycle** | Long-term history (persists forever) | Transience (created at call connect, closed at disconnect) |
| **State** | Passive message/transcript log | Active socket server routing, WebRTC channels, codecs |
| **Multi-channel** | N/A (stores final text/media output) | Yes (coordinates `VoiceAudio`, `ClientControl`, `TextChat`) |
| **Multi-run mapping** | Linked to multiple individual turns/runs | Grouping wrapper; associates consecutive runs to one session |

### Integration Model

Rather than replacing Conversations with Sessions, the two systems collaborate:

1. **Mapping**: An `AIAgentSession` record contains a foreign key to an `MJConversation` record (`ConversationID`).
2. **Session Initialization**:
   * When a client initiates a real-time call (starts a session), the client can pass an existing `ConversationID`. This instructs the Session Host to load the conversation's historical messages and inject them as initial context for the LLM.
   * If no `ConversationID` is passed, the Session Host automatically creates a new `MJConversation` record and associates the session with it.
3. **Timeline Overlay mapping (`AgentSessionID` on Details)**:
   * To track which messages were sent during which active session, we add a nullable `AgentSessionID` column to the `ConversationDetail` table.
   * If a message is typed in standard text chat *outside* of any active call, its `AgentSessionID` is `NULL`.
   * If a message is spoken or typed *during* a live call session, its `AgentSessionID` is populated with the active `AIAgentSession.ID`.
4. **Conversation Timeline Overlays (Time Series)**:
   * A single `MJConversation` acts as a master chronological timeline container.
   * Over the lifespan of that conversation, the user can have **0 or more sequential active sessions** (e.g. starting a voice call, hanging up, typing some text, then starting another voice call).
   * These sessions represent specific time intervals (`CreatedAt` $\rightarrow$ `ClosedAt`) that overlay the chronological sequence of conversation details.
   * In the UI, this allows for rendering a unified, rich timeline:
     * Standard text messages are rendered sequentially.
     * Messages generated during an active session can be visually grouped, bordered, or decorated (e.g. as a "Voice Call Session" block with call duration, participant details, and a voice recording playback widget).
5. **Session Termination**:
   * When the user hangs up or the socket is closed, the `AIAgentSession` record is updated to `Status = 'Closed'`.
   * The WebSocket connection terminates, but all generated `MJConversationDetail` records and the `MJConversation` itself remain fully active and searchable. A user can easily start a new voice session on the same conversation later.

---

## Proposed Database Schema Additions

To support this model, we propose adding three new entities to the MemberJunction schema.

> [!NOTE]
> **MJ conventions applied below:**
> - `__mj_CreatedAt` / `__mj_UpdatedAt` are omitted — CodeGen adds them automatically. (`AIAgentSessionChannel` therefore gets `__mj_UpdatedAt` for free, which is why it carries no hand-rolled "last updated" column.)
> - Status-style columns use `CHECK` constraints so CodeGen emits **string-union types** (e.g. `'Active' | 'Idle' | 'Closed'`) instead of bare `string`.
> - PK defaults use `NEWSEQUENTIALID()` per the migration guide.
> - The **entity Names** (metadata) use the `MJ:` prefix — `MJ: AI Agent Channels`, `MJ: AI Agent Sessions`, `MJ: AI Agent Session Channels` — even though the **table names** do not. The persisted session FK columns are named **`AgentSessionID`**, not `SessionID`, to avoid collision with the transport `sessionID` (see [Unified Session Transport](#unified-session-transport)).
> - `AIAgentChannel` rows are **reference data** and are seeded via the metadata-file / `mj sync` path, **not** SQL `INSERT`s.

### 1. `AIAgentChannel` (Pluggable Channel Registry)
```sql
CREATE TABLE [__mj].[AIAgentChannel] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(100) NOT NULL UNIQUE, -- e.g., 'VoiceAudio', 'TextChat', 'ClientControl', 'CanvasSync'
    [Description] NVARCHAR(1000) NULL,
    [ServerPluginClass] NVARCHAR(250) NOT NULL, -- Serves as key for ClassFactory.CreateInstance() on Server
    [ClientPluginClass] NVARCHAR(250) NOT NULL, -- Serves as key for ClassFactory.CreateInstance() on Client
    -- Which transport plane this channel rides (see Unified Session Transport).
    [TransportType] NVARCHAR(20) NOT NULL DEFAULT 'PubSub',
    [ConfigSchema] NVARCHAR(MAX) NULL, -- JSON Schema to validate channel parameters
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT [CK_AIAgentChannel_TransportType]
        CHECK ([TransportType] IN ('PubSub', 'WebRTC', 'WebSocket'))
);
```

### 2. `AIAgentSession` (AI Agent Session)
The long-lived session record. Per-channel state is **normalized** into `AIAgentSessionChannel` (below) rather than an `ActiveChannels` JSON blob — see the rationale note after the schema. `Config` remains JSON because it is low-traffic, free-form session state. Uses `DATETIMEOFFSET` on `LastActiveAt` for timezone tracking.
```sql
CREATE TABLE [__mj].[AIAgentSession] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [AgentID] UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES [__mj].[AIAgent]([ID]),
    [UserID] UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES [__mj].[User]([ID]),
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [ConversationID] UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES [__mj].[Conversation]([ID]),
    -- The server node currently hosting this session's in-memory sockets (for affinity / janitor reconciliation).
    [HostInstanceID] NVARCHAR(200) NULL,
    [Config] NVARCHAR(MAX) NULL, -- JSON block for session-specific state/variables
    [LastActiveAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    [ClosedAt] DATETIMEOFFSET NULL,
    CONSTRAINT [CK_AIAgentSession_Status]
        CHECK ([Status] IN ('Active', 'Idle', 'Closed'))
);
```

### 3. `AIAgentSessionChannel` (Active Channel Instances)
One row per channel instance attached to a session — the normalized replacement for the `ActiveChannels` JSON array.
```sql
CREATE TABLE [__mj].[AIAgentSessionChannel] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [AgentSessionID] UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES [__mj].[AIAgentSession]([ID]),
    [ChannelID] UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES [__mj].[AIAgentChannel]([ID]),
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Connecting',
    [SocketUrl] NVARCHAR(500) NULL, -- NULL for PubSub channels (they ride the shared subscription)
    [Config] NVARCHAR(MAX) NULL, -- JSON, validated against AIAgentChannel.ConfigSchema
    [LastActiveAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    [DisconnectedAt] DATETIMEOFFSET NULL,
    CONSTRAINT [CK_AIAgentSessionChannel_Status]
        CHECK ([Status] IN ('Connecting', 'Connected', 'Paused', 'Disconnected')),
    -- A session attaches a given channel definition at most once at a time.
    CONSTRAINT [UQ_AIAgentSessionChannel] UNIQUE ([AgentSessionID], [ChannelID])
);
```

> [!NOTE]
> **Why normalize out of `ActiveChannels` JSON?** The session row itself is low-traffic, but its *channels* are not: each channel independently connects, heartbeats, pauses, and disconnects, and (in voice scenarios) several are live at once. Keeping them in one JSON column on the session means concurrent channel state writes all contend on — and risk clobbering — the same row (lost-update races). Separate rows give per-channel row-level writes, FK integrity to `AIAgentChannel`, and clean queries ("show all `Connected` voice channels", "find sessions with an orphaned channel"). The cost is one extra small table, which is cheap. `Config` stays JSON on both tables because it is genuinely free-form and write-rarely.

### 4. Schema Updates (Existing Tables)

We add a nullable foreign key pointing to the session on both `AIAgentRun` and `ConversationDetail` records. The column is named **`AgentSessionID`** (not `SessionID`) to stay distinct from the transport `sessionID`:

```sql
-- Link individual agent runs to their parent session
ALTER TABLE [__mj].[AIAgentRun]
ADD [AgentSessionID] UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES [__mj].[AIAgentSession]([ID]);

-- Link specific messages in a conversation to the session in which they occurred
ALTER TABLE [__mj].[ConversationDetail]
ADD [AgentSessionID] UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES [__mj].[AIAgentSession]([ID]);
```

---

## Pluggable Channel Interfaces

To allow channels (text, audio, canvas, video, etc.) to connect dynamically as plugins, the framework defines standard client and server interfaces. In accordance with MemberJunction design guidelines, all public properties and methods use **PascalCase**:

### 1. Server-Side Channel Interface (`IAgentChannelServer`)

Implemented by the server-side channel plugin. Responsible for managing the WebSockets/WebRTC session host connections and streaming data back and forth.

> [!IMPORTANT]
> The interface below is the **conceptual** contract. The [Unified Session Transport](#unified-session-transport) section that follows **refines** it: channels do **not** own the client-facing socket (`Socket`/`OnClientConnect`/`SendToClient` are removed), and the loosely-typed `any` payloads are replaced with a typed `SessionEnvelope`. A channel is handed an injected `ISessionTransport` and becomes pure routing/translation logic. Read both together — the unified version is the one we build.

```typescript
export interface IAgentChannelServer {
    /** The active Session ID */
    readonly SessionID: string;

    /** The dynamic Channel Definition ID from AIAgentChannel */
    readonly ChannelID: string;

    /** Connection status of this channel (e.g., 'Connected', 'Disconnected', 'Paused') */
    Status: string;

    /** Configuration parameters validated against the channel's ConfigSchema */
    Config: Record<string, any>;

    /**
     * Called by the Session Host when resolving and instantiating the plugin class.
     */
    Initialize(SessionID: string, ChannelID: string, Config: Record<string, any>): Promise<void>;

    /**
     * Handler invoked when the client establishes a socket connection.
     * @param Socket The server-side socket instance (WebSocket or WebRTC peer)
     */
    OnClientConnect(Socket: any): Promise<void>;

    /**
     * Handler invoked when the server socket receives an inbound message from the client.
     */
    OnClientMessage(Message: any): Promise<void>;

    /**
     * Sends a packet directly to the connected client socket.
     */
    SendToClient(Message: any): Promise<void>;

    /**
     * Closes the active socket connection and cleans up server resources.
     */
    Close(): Promise<void>;
}
```

### 2. Client-Side Channel Interface (`IAgentChannelClient`)

Implemented by the client-side channel plugin. Responsible for establishing socket tunnels from the browser/native app, capturing raw user input (like mic audio), and rendering the agent's real-time events.

```typescript
export interface IAgentChannelClient {
    /** The active Session ID */
    readonly SessionID: string;

    /** The dynamic Channel Definition ID from AIAgentChannel */
    readonly ChannelID: string;

    /** Status of the client connection */
    Status: string;

    /** Configuration parameters */
    Config: Record<string, any>;

    /**
     * Initializes the client driver with session context.
     */
    Initialize(SessionID: string, ChannelID: string, Config: Record<string, any>): Promise<void>;

    /**
     * Initiates the socket/WebRTC connection to the Session Host socket URL.
     */
    Connect(SocketUrl: string): Promise<void>;

    /**
     * Sends a payload directly up to the server socket.
     */
    SendToServer(Message: any): Promise<void>;

    /**
     * Callback handler fired when the client socket receives an event from the server.
     */
    OnServerMessage(Message: any): void;

    /**
     * Disconnects the socket connection and cleans up client-side listeners/audio buffers.
     */
    Disconnect(): Promise<void>;
}
```

> [!NOTE]
> **Angular Integration**: In the MemberJunction frontend, it is assumed that the implementor of the `IAgentChannelClient` interface will also be (or provide) an Angular component. This component will handle rendering the visual elements for that specific channel (e.g., voice wave visualizer, canvas overlays, or real-time terminal sync) and snap into the future Session UI shell. Additional metadata and registry properties to support dynamic component instantiation will be defined as part of the client UI implementation.

---

## Parallel Channel Orchestration & Tool Routing

To support both server-side LLM tool execution (like Gemini Live's native function calling) and client-side UI updates (like showing a dashboard chart), tool calling is routed dynamically depending on the channel's nature:

1. **Parallel Channel Coordination**:
   Within a single `AIAgentSession`, multiple channel plugins run concurrently. For example, a `VoiceAudio` channel handles the continuous duplex stream of raw audio, while a `ClientControl` channel handles structured JSON events.
2. **Channel-Specific Tool Translators**:
   The `IAgentChannelServer` plugin acts as the translation layer between the MemberJunction Agent's tool definition and the channel's protocol:
   * **Upstream Tool Calls (e.g., Gemini Live / OpenAI Realtime)**: The plugin registers the agent's tools with the LLM provider's WebSocket during session handshake. When the provider's API emits a `tool_call` frame, the server plugin intercepts it, executes the MJ tool, and sends the `tool_response` frame back upstream.
   * **Downstream Tool Calls (Client UI Actions)**: When the agent invokes a UI-oriented tool, the server plugin forwards a JSON execution payload downstream over the `ClientControl` channel to the client application, returning the client's response to the agent.

---

## Unified Session Transport

> [!IMPORTANT]
> This is the single most important integration decision in the proposal. MemberJunction **already** ships a real-time, bi-directional, session-scoped transport — and most of what "Channels" needs is a generalization of it, not a new parallel stack. This section defines how all socket traffic (existing and new) is unified.

### What already exists (and must be reused, not duplicated)

The current agent runtime already streams to clients and accepts mid-run callbacks over a **graphql-ws subscription + in-process PubSub** transport, scoped by a per-connection `sessionID` (the browser-generated `x-session-id` value). Today this is fragmented across **two separate subscriptions plus inbound mutations**:

| Concern | Current wire | Source |
|---|---|---|
| Progress / token streaming / completion | `subscription statusUpdates(sessionId)` | `GraphQLDataProvider.PushStatusUpdates`, `RunAIAgentResolver.PublishProgressUpdate` |
| Client tool **requests** (server → client) | `subscription ClientToolRequest(sessionID)` | `GraphQLDataProvider.ClientToolRequests`, `ClientToolRequestManager` |
| Client tool **responses** + run triggers (client → server) | `RespondToClientToolRequest`, `RunAIAgent`, `UpdateClientToolDefinitions` mutations | `MJServer` resolvers |
| Server-side fan-out bus | in-process `PubSubEngine` | `PubSubManager` |

The "ClientControl" / "TextChat" channels in this proposal are, functionally, a re-skin of the above. Voice (binary audio) is the **only** genuinely new transport need. The unification goal: collapse the fragmentation into one model and add new transport *only* for media.

### ⚠️ Two different things both named `sessionID`

There is a **naming collision** that must be resolved before implementation:

- **Transport `sessionID`** (exists today): a per-browser-connection correlation id (localStorage UUID → `x-session-id` header). Scopes PubSub delivery to one socket. **Not persisted.**
- **`AIAgentSession.ID`** (this proposal): a persisted, long-lived session record.

These are orthogonal — one connection can outlive/underlie many agent sessions, and reconnects change the transport id while the agent session persists. **Decision:** the persisted concept is referred to everywhere as **`AgentSessionID`** (param) / **`AgentSessionID`** (column), and the existing transport id keeps the name `sessionID` (or is renamed `connectionID`). They are carried side-by-side, never merged.

### Core principle: channels are logical streams; the session owns the transport; one envelope for everything

Instead of each feature owning its own wire, **a session owns one client-facing transport, and progress / tokens / tool calls / text / control / signaling are all just typed messages multiplexed over it by `ChannelID`.** A channel never touches the client-facing socket; it is handed a transport and calls `Send`.

#### Layer 1 — One envelope

The three ad-hoc JSON shapes collapse into a single discriminated-union envelope (note: no `any`, per MJ typing rules):

```typescript
/** JSON-safe value type used throughout channel payloads. */
export type JSONValue =
    | string | number | boolean | null
    | JSONValue[] | { [key: string]: JSONValue };

/** Every message on every channel, in or out, is one of these. */
export interface SessionEnvelope<TPayload extends ChannelPayload = ChannelPayload> {
    /** Persisted AIAgentSession.ID — NOT the transport/connection id. */
    AgentSessionID: string;
    /** Which logical channel (AIAgentChannel.ID). */
    ChannelID: string;
    /** Per-channel ordering / dedupe. */
    Seq: number;
    Direction: 'ToClient' | 'ToServer';
    Payload: TPayload;
}

/** Discriminated union, keyed by Type. Channels add their own variants. */
export type ChannelPayload =
    | { Type: 'progress'; Step: string; Message: string }
    | { Type: 'streaming'; Content: string; IsComplete: boolean }
    | { Type: 'tool-request'; RequestID: string; ToolName: string; Params: string }
    | { Type: 'tool-response'; RequestID: string; Success: boolean; Result?: string }
    | { Type: 'text'; Role: 'user' | 'assistant'; Content: string }
    | { Type: 'control'; Command: string; Args: Record<string, JSONValue> }
    | { Type: 'signaling'; SDP?: string; ICE?: JSONValue };  // WebRTC negotiation
```

Today's `statusUpdates.message` (a JSON string) and the `ClientToolRequest` payload both become `SessionEnvelope` variants. New channels add new `Payload` members — they do **not** add new subscriptions.

#### Layer 2 — One transport interface, swappable implementation

This is the actual "unify the sockets" move. The transport is owned by the **Session Host**, not by individual channels:

```typescript
export interface ISessionTransport {
    readonly AgentSessionID: string;
    /** Push an envelope toward the client. */
    Send(envelope: SessionEnvelope): Promise<void>;
    /** Fires when an inbound envelope arrives from the client. */
    OnMessage(handler: (envelope: SessionEnvelope) => void): void;
    Close(): Promise<void>;
}
```

The server channel interface then **loses all socket ownership** and just receives the injected transport:

```typescript
export interface IAgentChannelServer<TConfig extends Record<string, JSONValue> = Record<string, JSONValue>> {
    readonly ChannelID: string;
    Config: TConfig;
    Initialize(transport: ISessionTransport, config: TConfig): Promise<void>;
    /** Inbound payload for THIS channel, already demultiplexed by the host. */
    OnClientMessage(payload: ChannelPayload): Promise<void>;
    Close(): Promise<void>;
    // To talk to the client, the channel calls transport.Send(...). It owns no client-facing socket.
}
```

Two implementations to start:

- **`PubSubSessionTransport`** (default): wraps the *existing* `PubSubManager` + graphql-ws subscription. `Send` publishes the envelope to the session's topic; inbound arrives via a single generalized `SendSessionMessage(envelope)` mutation. This is a refactor of what `RunAIAgentResolver` and `ClientToolRequestManager` already do — the two existing subscriptions collapse into one session multiplex.
- **`WebRTCSessionTransport`**: instantiated **only** for channels that need binary/low-latency media. Its signaling rides the PubSub transport (`'signaling'` payload); only audio/video bytes go peer-to-peer.

#### Layer 3 — Three planes (this is where the realtime-LLM upstream fits)

The proposal's [Parallel Channel Orchestration & Tool Routing](#parallel-channel-orchestration--tool-routing) section introduces a **third** connection axis — the server plugin's socket to a realtime LLM provider (Gemini Live / OpenAI Realtime). It is essential to keep these planes distinct:

| Plane | Endpoints | Carries | Transport | Owner |
|---|---|---|---|---|
| **Control** | Server ↔ Client | progress, tokens, tool req/resp, text, control commands, **WebRTC signaling** | `PubSubSessionTransport` (existing graphql-ws pipe, multiplexed) | Session Host |
| **Media** | Server ↔ Client | raw audio/video frames | `WebRTCSessionTransport`, negotiated *over* the control plane | Session Host |
| **Upstream provider** | Server ↔ LLM provider | provider realtime socket, native `tool_call`/`tool_response` frames | provider SDK / WebSocket | **the Channel plugin** |

This refines the "channels don't own sockets" rule precisely: a channel does **not** own the **client-facing** socket (that is the unified `ISessionTransport`), but a realtime-voice channel **may** own an **upstream** connection to its external provider. The upstream socket is a channel-internal implementation detail and is never exposed to the client directly.

So a `VoiceAudio` channel backed by Gemini Live is really doing three things at once: holding an upstream provider socket (plane 3), pumping audio over WebRTC (plane 2), and emitting transcripts / receiving tool results over the shared control plane (plane 1).

#### Unified tool routing: one registry, three delivery edges

The tool-routing behavior described earlier becomes a single abstraction over the MJ tool registry, with the channel choosing the delivery edge per tool:

1. **Server-side tool** → normal MJ action execution inside the run (no socket).
2. **Downstream (client UI) tool** → control-plane `tool-request` / `tool-response` envelope, reusing **`ClientToolRequestManager`**'s existing promise-tracking (it keeps its in-memory `Map`; it just publishes through `ISessionTransport` instead of a hardcoded topic). This is the proposal's "Downstream Tool Calls".
3. **Upstream (provider-native) tool** → the channel translates between the MJ tool definition and the provider's frame format on its upstream socket. This is the proposal's "Upstream Tool Calls".

All three resolve to the same MJ tool definition + execution; only the edge differs.

### How existing pieces fold in

- **`ClientToolRequestManager`** keeps its role (pending-promise tracking by `RequestID`) but emits via `transport.Send({ Payload: { Type: 'tool-request', ... } })`; `RespondToClientToolRequest` becomes one `Payload.Type` on the generic inbound mutation.
- **`RunAIAgentResolver`** progress/streaming callbacks emit `progress` / `streaming` envelopes instead of bespoke JSON.
- **Client `AgentClientSession`** subscribes once and demultiplexes by `ChannelID`, replacing the two separate `PushStatusUpdates()` + `ClientToolRequests()` subscriptions. The proposal's `IAgentChannelClient` should be implemented **by / composed into** this existing client session — not stood up as a second client-session concept.

### Scaling unlock

Because everything now publishes through one `ISessionTransport` / `PubSubManager`, making the **control plane** multi-instance is a single swap: back `PubSubManager` with Redis pub/sub and every JSON channel becomes cross-node at once. The **media plane** (WebRTC) and the **upstream provider** socket are inherently node-local, so those — and only those — require session affinity (sticky routing) at the load balancer. This is now an explicit, contained constraint rather than an implicit one.

### Incremental, non-breaking rollout

1. Introduce `SessionEnvelope` + `ISessionTransport`; implement `PubSubSessionTransport` over the *current* topics/subscriptions (no wire change yet).
2. Refactor `RunAIAgentResolver` + `ClientToolRequestManager` to emit/consume envelopes through the transport. Behavior identical; the two subscriptions collapse to one multiplex.
3. Add the generic `SendSessionMessage` inbound mutation; migrate `RespondToClientToolRequest` onto it (keep the old mutation as a thin shim for one release).
4. Only then add `WebRTCSessionTransport` + the `VoiceAudio` channel and any upstream-provider channels. Voice becomes purely additive on top of a unified, already-proven control plane.

---

## Session Lifecycle, Heartbeat & Reconciliation

A session is a **long-lived record backed by in-memory, node-local resources** (open sockets, WebRTC peers, upstream provider connections, the `ClientToolRequestManager` pending-request map). The hard part of any such design is the **mismatch between durable DB state and volatile process state**: a server crash or redeploy vaporizes the sockets but leaves rows reading `Status = 'Active'` forever. This section defines how that mismatch is kept from accumulating.

### State model

```
            client activity / channel connect
   ┌──────────────────────────────────────────────┐
   ▼                                                │
[Active] ──no activity > IdleThreshold──▶ [Idle] ──┘ (reactivates on any inbound envelope)
   │                                         │
   │ explicit hang-up / Close()              │ no activity > CloseThreshold
   ▼                                         ▼
[Closed] ◀───────────── janitor / graceful shutdown ─────────────
```

- **Active** — at least one channel connected and traffic flowing.
- **Idle** — connected but quiet beyond `IdleThreshold` (e.g. 2 min). Sockets may be kept warm or torn down per channel policy; the session is cheaply resumable.
- **Closed** — terminal. `ClosedAt` set, all `AIAgentSessionChannel` rows set to `Disconnected`, in-memory resources released, `ClientToolRequestManager.ClearSession(...)` called, any in-flight `AIAgentRun` aborted via its `cancellationToken`.

### Heartbeat

- Each connected channel sends a lightweight heartbeat (or any inbound envelope counts as one). The Session Host updates `AIAgentSessionChannel.LastActiveAt` and bubbles the max up to `AIAgentSession.LastActiveAt`.
- Heartbeats use `SetSettingDebounced`-style coalescing so a chatty audio channel does not hammer the DB — at most one `LastActiveAt` write per session per few seconds.
- Missing N consecutive heartbeats on a channel → that channel row goes `Disconnected`; when the **last** channel disconnects, the session transitions `Active → Idle`.

### The janitor (orphan reconciliation)

A `BaseSingleton` **SessionJanitor** runs on each server instance on a timer (e.g. every 60s) and also once at startup. It performs two sweeps:

1. **Own-host recovery (startup):** On boot, an instance claims its identity in `HostInstanceID` (e.g. `hostname:pid:bootId`). Any `AIAgentSession` row still `Active`/`Idle` whose `HostInstanceID` equals a *previous* boot of this host (or this host with a different `bootId`) is an orphan from a crash/redeploy → force `Closed`. This is the primary defense against the "Active forever" leak.
2. **Global staleness sweep (periodic):** Regardless of host, any `Active`/`Idle` session whose `LastActiveAt` is older than `CloseThreshold` (e.g. 15 min) is force-`Closed`. This catches sessions whose owning instance died without a clean boot record (scaled-down pod, OOM kill) and never came back to run its own-host recovery.

Both sweeps use **keyset pagination** (`AfterKey`) if the backlog is large, per the MJ deep-pagination guide, and write through `BaseEntity.Save()` so Record Changes captures the transition.

### Multi-instance notes

- The janitor's global sweep is **idempotent and safe to run concurrently** on every instance — closing an already-`Closed` session is a no-op, and the `Status` CHECK + last-writer-wins on `ClosedAt` make races harmless.
- `HostInstanceID` is also what enables **session affinity** for the media/upstream planes: a reconnecting client for an existing media session should be routed back to the owning host while it is alive; if that host is gone, the client simply starts a fresh session on a new host (the Conversation history is intact, so nothing is lost — see [Relationship: Sessions vs. Conversations](#relationship-sessions-vs-conversations)).
- When `PubSubManager` is later backed by Redis, the **control plane** survives instance loss transparently; only media/upstream sockets need the affinity + janitor recovery described here.

### Graceful shutdown

On `SIGTERM`/redeploy, the instance runs the janitor's close path for its own sessions first (flush transcripts, set `Closed`, notify clients over the control plane so they can show "call ended / reconnecting"), then exits. This turns the common redeploy case into a clean close rather than an orphan the periodic sweep has to mop up later.

---

## Voice as a Model Capability

Voice is **not** hardcoded into the Session Host. MJ already has a capability-typed AI driver system — `packages/AI/Core/src/generic/` defines sibling base classes (`baseLLM`, `baseEmbeddings`, `baseAudio`, `baseImage`, `baseVideo`, `baseDiffusion`, `baseReranker`), and `AIEngine` resolves any of them uniformly through the ClassFactory by `AIModelType` + `DriverClass`:

```typescript
// AIEngine.ts — same pattern for every capability
const modelInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, apiKey);
```

The `VoiceAudio` channel resolves its speech drivers the same way an agent resolves its LLM. Provider selection, priority/fallback, API-key resolution (`GetAIAPIKey(DriverClass)`), and per-minute cost tracking (`MJ: AI Model Costs`) all come for free.

### Two voice modes

| Mode | Pipeline | Models used | Loop owner | Transport planes |
|---|---|---|---|---|
| **Pipelined** | STT → MJ agent turn (`AIAgentRun`) → TTS | three `AIModel`s (audio + LLM + audio) | MJ `BaseAgent` | control (transcripts/tokens) + media (audio) |
| **Realtime-native** | one duplex provider socket | one `BaseRealtimeVoice` model | the provider | upstream-provider + media + control |

### Decision rule: when is realtime a new method vs. a new class?

The line is **request/response vs. stateful duplex session**:

- **Streaming STT / streaming TTS** — same one-shot operation, just chunked over time — is a **new method on `BaseAudioGenerator`**, advertised via the existing `GetSupportedMethods()` capability flag (the class already ships this exact mechanism for "some audio models support X, some don't"). No new class. This is the natural upgrade of the pipelined mode.
- **Full-duplex conversational models** (Gemini Live, OpenAI Realtime) — one socket that listens, reasons, calls tools, and speaks with barge-in — get a **new sibling subclass of `BaseModel`** and a new `AIModelType`. Reasons: the contract returns a *stateful session handle*, not a `SpeechResult`; it is selected/resolved as its own capability; it is really a streaming multimodal LLM that happens to speak (modeling it as an audio generator is a category error); and it would force every TTS-only provider to stub out a session lifecycle it never implements. This is consistent with MJ's existing sibling-per-capability precedent.

### Reuse: `BaseAudioGenerator` (pipelined mode — zero new model code)

Already present in `baseAudio.ts`:

```typescript
export abstract class BaseAudioGenerator extends BaseModel {
    public abstract CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult>;   // TTS
    public abstract SpeechToText(params: SpeechToTextParams): Promise<SpeechResult>;   // STT
    public abstract GetVoices(): Promise<VoiceInfo[]>;
    public abstract GetSupportedMethods(): Promise<string[]>;
    // ...
}
```

Pipelined voice (Deepgram/Whisper for STT, ElevenLabs/OpenAI-TTS for output) needs **no new model class** — only metadata registration.

### New capability: `BaseRealtimeVoice` (realtime-native mode)

A new sibling base class added alongside the others in `packages/AI/Core/src/generic/`:

```typescript
export abstract class BaseRealtimeVoice extends BaseModel {
    /** Opens a stateful duplex session; the returned handle is the long-lived object. */
    public abstract StartSession(params: RealtimeSessionParams): Promise<IRealtimeVoiceSession>;
}

export interface IRealtimeVoiceSession {
    SendAudio(chunk: ArrayBuffer): void;                          // client mic frames in
    RegisterTools(tools: ClientToolMetadata[]): Promise<void>;   // provider-native tool registration
    OnAudio(handler: (chunk: ArrayBuffer) => void): void;        // agent speech out → media plane
    OnTranscript(handler: (t: RealtimeTranscript) => void): void;// → control plane + ConversationDetail
    OnToolCall(handler: (call: RealtimeToolCall) => void): void; // → MJ tool execution under contextUser
    OnInterruption(handler: () => void): void;                   // barge-in → cancellationToken
    Close(): Promise<void>;
}
```

The `VoiceAudio` channel, in realtime-native mode, wraps an `IRealtimeVoiceSession`: it bridges audio to the **media plane**, transcripts to the **control plane** (and into `ConversationDetail`), and `OnToolCall` into MJ tool execution under the session's `contextUser` (see [Authorization & Socket Security](#authorization--socket-security)). A single provider may register **both** an audio driver and a realtime driver (e.g. an OpenAI TTS model *and* an OpenAI Realtime model) — different model rows, different types, same vendor.

### Metadata additions (no migration — `/metadata` + `mj sync`)

These are **reference-data changes, authored as metadata files and applied with `mj sync push`** — not a SQL migration (consistent with how `metadata/ai-models/` and `metadata/ai-vendors/` are already managed).

1. **New `AIModelType`: `Realtime`.** There is currently no metadata folder for model types (they pre-date the metadata-seeding convention), so add one — `metadata/ai-model-types/` with a `.mj-sync.json` bound to entity **`MJ: AI Model Types`** — and seed the `Realtime` type there. (Per the CLAUDE.md "Seeding New Lookup/Reference Tables" rule.)

2. **Two new `MJ: AI Models`** in `metadata/ai-models/`, each typed `Realtime` and carrying an `MJ: AI Model Vendors` association whose `DriverClass` points at the realtime driver (mirroring the existing `xAILLM` / `AnthropicLLM` convention):

   ```jsonc
   {
     "fields": {
       "Name": "Gemini Live 2.5 Flash",
       "AIModelTypeID": "@lookup:MJ: AI Model Types.Name=Realtime",
       "IsActive": true,
       "InheritTypeModalities": true
     },
     "relatedEntities": {
       "MJ: AI Model Vendors": [
         {
           "fields": {
             "ModelID": "@parent:ID",
             "VendorID": "@lookup:MJ: AI Vendors.Name=Google",
             "TypeID": "@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider",
             "DriverClass": "GeminiRealtime",
             "Priority": 0,
             "Status": "Active"
           }
         }
       ]
     }
   }
   // …and a sibling record for "GPT Realtime" → DriverClass "OpenAIRealtime",
   //    VendorID @lookup MJ: AI Vendors.Name=OpenAI
   ```

   Pipelined STT/TTS models (Whisper, Deepgram, ElevenLabs) are registered the same way under existing audio model type(s) — no schema work, just metadata.

3. Apply with: `npx mj sync push --dir=metadata --include="ai-model-types,ai-models"`.

The driver classes themselves (`GeminiRealtime`, `OpenAIRealtime`, implementing `BaseRealtimeVoice`) ship as code in the respective `packages/AI/Providers/*` packages and self-register via `@RegisterClass(BaseRealtimeVoice, 'GeminiRealtime')`.

> [!IMPORTANT]
> **To verify during implementation:** the names in the snippet above are placeholders. Before authoring the real metadata files, confirm against current metadata/data:
> - the exact `MJ: AI Vendors` row names (e.g. is it `Google` / `Google AI` / `Gemini`? `OpenAI`?) used in the `@lookup:MJ: AI Vendors.Name=…` references;
> - that a `MJ: AI Vendor Type Definitions` row named `Inference Provider` exists (existing records use `Model Developer`);
> - the canonical model display names (`Gemini Live 2.5 Flash`, `GPT Realtime`) against the providers' current model IDs;
> - the final `DriverClass` naming convention (`GeminiRealtime` / `OpenAIRealtime` vs. a `*Realtime` suffix style) to match sibling drivers in `packages/AI/Providers/*`.

---

## Authorization & Socket Security

Authorization is **~90% reuse** of primitives that already exist; sessions add exactly one new piece.

### Reuse map

| Concern | Existing primitive | How sessions use it |
|---|---|---|
| Who may **open a session** for an agent | `AIAgentPermission` (`CanRun`), enforced today via `AIAgentPermissionHelper.HasPermission(agentID, user, 'run')` at `base-agent.ts:1283` | A session is a long-lived run wrapper → call the **same** `CanRun` check at session open. Denied → no session, no socket. |
| **Transport authentication** | JWT on GraphQL + graphql-ws, with `JWT_EXPIRED` detection + refresh (`graphQLDataProvider.ts:3066-3080`) | Every transport plane reuses this; no new auth scheme. |
| **Tool / action authorization** | `contextUser` + request-scoped `IMetadataProvider` (already a param on `ExecuteAgentParams`) | All tools/actions invoked mid-session execute under the session's `contextUser`, inheriting normal action/entity permission checks. |

### The one genuinely new primitive

**Short-lived, session-scoped socket tokens + an ownership check on inbound envelopes.** Each `SocketUrl` handed out in `AIAgentSessionChannel` embeds a token scoped to `{AgentSessionID, ChannelID, UserID}`, not a general bearer token. Every inbound envelope (via the `SendSessionMessage` mutation, the WebRTC data path, or a raw WS) must verify: (a) a valid JWT, (b) `AIAgentSession.UserID === contextUser.ID`, and (c) `Status = 'Active'`.

### Realtime caveat (important)

When a realtime provider drives the loop and emits a native `tool_call`, MJ must still execute that tool **under the session's `contextUser`** with the normal permission checks. The provider owning the conversation must **not** become an authorization bypass — a realtime LLM calling a tool can do exactly what the user could do, no more. Propagating the request-scoped provider (never pinning the global one) through the long-lived session keeps this both isolated and correct.

### Deferred / out of scope

- **Channel-grained permissions** (e.g. gating sensitive channels like `ClientControl` or metered `VoiceAudio` separately) are a known seam: either a future `AIAgentChannelPermission` table or a `RequiredRole`/`Scope` column on `AIAgentChannel`. **Start simple** — if you can run the agent, you can use its channels — and add grain only when a concrete need appears.
- **Multi-party sessions.** `AIAgentSession.UserID` is singular by design; the ownership check above assumes one participant. Multi-human voice would require a participant sub-table and per-participant authz — explicitly out of scope for this iteration.

---

## Detailed Execution & Streaming Flow

Here is how a real-time voice and UI interaction flows through the layered session architecture:

1. **Session Setup**:
   * The client application requests a session. The server creates an `AIAgentSession` and configures two channels: `VoiceAudio` and `ClientControl`.
   * WebSockets/WebRTC connections are established between the client and the **Session Host**.
2. **Audio Streaming & User Transcript Creation (Client $\rightarrow$ Server)**:
   * The user talks. Raw audio chunks flow over the `VoiceAudio` socket to the Session Host.
   * The Session Host runs local voice activity detection (VAD). Once the user stops speaking:
     * The audio is transcribed to text (STT).
     * The Session Host **creates a new `MJConversationDetail` record** in the database:
       * `Role = 'user'`
       * `Message = [transcribed text]`
       * `SessionID = [active Session ID]`
     * (Optional) The raw user audio clip is saved to MemberJunction file storage and linked to the conversation detail via `MJConversationDetailAttachment` to support voice playback.
3. **Execution Trigger**:
   * The Session Host calls `AgentRunner.ExecuteAgent(params)`, passing the newly created user message/transcript and the `agentSessionID` to trigger the agent's turn.
4. **Agent Execution Loop & Assistant Transcript Creation**:
   * The agent plans its steps. Suppose it decides it needs to query the database and show a chart.
   * **Client Tool Push (Mid-Run)**:
     * The agent invokes the `ShowChart` client tool.
     * Because `agentSessionID` is present, the framework dispatches a `tool-request` envelope over the session's `ClientControl` channel (see [Unified Session Transport](#unified-session-transport)): `{"Type": "tool-request", "ToolName": "ShowChart", "Params": "{...}"}`.
     * The client application receives this socket message and renders the chart immediately.
     * The client sends the success response back over the `ClientControl` socket: `{"type": "client-tool-response", "success": true}`.
     * The agent receives the response via socket, resolves the step, and continues to the next step.
   * **Multimodal / Voice Output**:
     * When generating the final response, the LLM starts streaming text tokens.
     * The Session Host routes these tokens through a Text-to-Speech (TTS) engine (or streams the raw audio tokens from a voice-native LLM) and writes the audio stream chunks directly to the `VoiceAudio` channel socket.
     * The user hears the agent speak in real-time while seeing the chart update on the screen.
     * Once the response is fully generated:
       * The Session Host **creates a new `MJConversationDetail` record** in the database:
         * `Role = 'assistant'`
         * `Message = [complete assistant response text]`
         * `SessionID = [active Session ID]`
       * (Optional) The synthesized response audio is saved to storage and linked to this conversation detail via `MJConversationDetailAttachment`.
5. **Run Finalization & Session Recording**:
   * The `AIAgentRun` finishes, saves its steps (non-blocking), and associates itself with the `AgentSessionID` for history tracking.
   * When the user hangs up or the session is closed, the Session Host can optionally upload a compiled recording of the entire call session and link it directly to the `AIAgentSession` record.

---

## Benefits of This Approach

1. **Zero Forking**: Existing Loop and Flow agents immediately gain voice, audio, and real-time canvas capabilities without rewriting their core execution engines.
2. **True Multi-Channel Coordination**: Users can speak to the agent while simultaneously typing text or interacting with canvas elements, and the agent can update the client UI mid-run.
3. **Decoupled Sockets**: The heavy lifting of socket connection maintenance, WebRTC negotiation, and Twilio/telephony integration is isolated in the Session Host layer, keeping the core AI Agent package (`@memberjunction/ai-agents`) lightweight and focused on reasoning/actions.
4. **Natural Continuation of Client Tools**: Client tools already have an asynchronous, event-driven request/response lifecycle. In standard HTTP runs, they rely on database polling/PubSub. In Session mode, they flow instantly over the established WebSocket, dropping round-trip latency to milliseconds.
