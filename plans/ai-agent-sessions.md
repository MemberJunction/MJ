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
        D_Session["AIAgentSession Record<br/>(with ActiveChannels JSON)"]
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
* **Schema**: Stored in a new `AIAgentSession` table. Active channels are tracked dynamically in an `ActiveChannels` JSON field, removing the need for a normalized sub-table.

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
* **Session ID Propagation**: The `ExecuteAgentParams` struct is extended to accept a `SessionID`.
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
3. **Timeline Overlay mapping (`SessionID` on Details)**:
   * To track which messages were sent during which active session, we add a nullable `SessionID` column to the `MJConversationDetail` table.
   * If a message is typed in standard text chat *outside* of any active call, its `SessionID` is `NULL`.
   * If a message is spoken or typed *during* a live call session, its `SessionID` is populated with the active `AIAgentSession.ID`.
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

To support this model, we propose adding two new entities to the MemberJunction schema. (Note that `CreatedAt` and `UpdatedAt` are omitted as they are handled automatically by MemberJunction metadata):

### 1. `AIAgentChannel` (Pluggable Channel Registry)
```sql
CREATE TABLE [__mj].[AIAgentChannel] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL UNIQUE, -- e.g., 'VoiceAudio', 'TextChat', 'ClientControl', 'CanvasSync'
    [Description] NVARCHAR(1000) NULL,
    [ServerPluginClass] NVARCHAR(250) NOT NULL, -- Serves as key for ClassFactory.CreateInstance() on Server
    [ClientPluginClass] NVARCHAR(250) NOT NULL, -- Serves as key for ClassFactory.CreateInstance() on Client
    [ConfigSchema] NVARCHAR(MAX) NULL -- JSON Schema to validate channel parameters
);
```

### 2. `AIAgentSession` (AI Agent Session)
Tracks active channels dynamically in an `ActiveChannels` JSON field, mapping them directly to the plugin definitions. Uses `DATETIMEOFFSET` on `LastActiveAt` for timezone tracking.
```sql
CREATE TABLE [__mj].[AIAgentSession] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [AgentID] UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES [__mj].[AIAgent]([ID]),
    [UserID] UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES [__mj].[User]([ID]),
    [Status] VARCHAR(50) NOT NULL, -- 'Active', 'Idle', 'Closed'
    [ConversationID] UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES [__mj].[Conversation]([ID]),
    [Config] NVARCHAR(MAX) NULL, -- JSON block for session-specific state/variables
    [ActiveChannels] NVARCHAR(MAX) NULL, -- JSON array of active channels: [{ channelId, socketUrl, status, config }]
    [LastActiveAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
```

### 3. Schema Updates (Existing Tables)

We add a nullable foreign key pointing to the session on both `AIAgentRun` and `MJConversationDetail` records:

```sql
-- Link individual agent runs to their parent session
ALTER TABLE [__mj].[AIAgentRun] 
ADD [SessionID] UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES [__mj].[AIAgentSession]([ID]);

-- Link specific messages in a conversation to the session in which they occurred
ALTER TABLE [__mj].[ConversationDetail] 
ADD [SessionID] UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES [__mj].[AIAgentSession]([ID]);
```

---

## Pluggable Channel Interfaces

To allow channels (text, audio, canvas, video, etc.) to connect dynamically as plugins, the framework defines standard client and server interfaces. In accordance with MemberJunction design guidelines, all public properties and methods use **PascalCase**:

### 1. Server-Side Channel Interface (`IAgentChannelServer`)

Implemented by the server-side channel plugin. Responsible for managing the WebSockets/WebRTC session host connections and streaming data back and forth.

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
   * The Session Host calls `AgentRunner.ExecuteAgent(params)`, passing the newly created user message/transcript and the `SessionID` to trigger the agent's turn.
4. **Agent Execution Loop & Assistant Transcript Creation**:
   * The agent plans its steps. Suppose it decides it needs to query the database and show a chart.
   * **Client Tool Push (Mid-Run)**:
     * The agent invokes the `ShowChart` client tool.
     * Because `SessionID` is present, the framework dispatches a message over the session's `ClientControl` socket channel: `{"type": "client-tool-request", "tool": "ShowChart", "params": {...}}`.
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
   * The `AIAgentRun` finishes, saves its steps (non-blocking), and associates itself with the `SessionID` for history tracking.
   * When the user hangs up or the session is closed, the Session Host can optionally upload a compiled recording of the entire call session and link it directly to the `AIAgentSession` record.

---

## Benefits of This Approach

1. **Zero Forking**: Existing Loop and Flow agents immediately gain voice, audio, and real-time canvas capabilities without rewriting their core execution engines.
2. **True Multi-Channel Coordination**: Users can speak to the agent while simultaneously typing text or interacting with canvas elements, and the agent can update the client UI mid-run.
3. **Decoupled Sockets**: The heavy lifting of socket connection maintenance, WebRTC negotiation, and Twilio/telephony integration is isolated in the Session Host layer, keeping the core AI Agent package (`@memberjunction/ai-agents`) lightweight and focused on reasoning/actions.
4. **Natural Continuation of Client Tools**: Client tools already have an asynchronous, event-driven request/response lifecycle. In standard HTTP runs, they rely on database polling/PubSub. In Session mode, they flow instantly over the established WebSocket, dropping round-trip latency to milliseconds.
