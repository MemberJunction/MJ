# Audio AI Agents Architecture

## Overview

A two-layer architecture for real-time audio AI interactions in MemberJunction:

1. **Real-Time Conversational Layer** - LLM-backed, optimized for 200-300ms latency
2. **Agent Delegation Layer** - Wraps any existing MJ agent for complex operations

**Key Insight**: Audio is an I/O modality wrapper, not a new agent type. The real-time layer uses the prompt infrastructure directly for speed, while complex queries delegate to standard agents transparently.

---

## System Architecture

```mermaid
flowchart TB
    subgraph Client["Client Layer"]
        Browser["Browser / WebRTC"]
        Phone["Phone / Twilio"]
        Mobile["Mobile App"]
    end

    subgraph Transport["Transport Layer (Driver-Specific)"]
        WS["WebSocket Transport"]
        TWILIO["Twilio Transport"]
        WebRTC["WebRTC Transport"]
    end

    subgraph Gateway["Audio Gateway Package"]
        CAE["ConversationalAudioEngine"]

        subgraph RealTime["Real-Time LLM Layer (200-300ms)"]
            STT["STT Provider"]
            LLM["Fast LLM via AIPromptRunner"]
            TTS["TTS Provider"]
            Tools["Tool Handler"]
        end

        subgraph Delegation["Agent Delegation Layer"]
            ADH["AgentDelegationHandler"]
            Cues["Audio Cue Manager"]
            Progress["Progress Handler"]
        end

        subgraph Context["Context Management"]
            Session["AudioSession"]
            PreLoad["SessionContextLoader"]
            FAQ["FAQ Vector Store"]
            Memory["Conversation Memory"]
        end
    end

    subgraph MJCore["Existing MJ Infrastructure"]
        Prompts["AIPromptRunner"]
        Agents["BaseAgent / AgentRunner"]
        Actions["ActionEngineServer"]
        Vectors["SimpleVectorService"]
        Entities["Entity System"]
    end

    Client --> Transport
    Transport --> CAE
    CAE --> RealTime
    CAE --> Delegation
    CAE --> Context

    RealTime --> Prompts
    Delegation --> Agents
    Tools --> Actions
    FAQ --> Vectors
    PreLoad --> Entities
```

---

## Real-Time Conversation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant T as Transport
    participant STT as STT Provider
    participant E as ConversationalAudioEngine
    participant LLM as Fast LLM
    participant Tool as Tool Handler
    participant TTS as TTS Provider

    Note over E: Session pre-loaded with context, model selection locked

    U->>T: Audio utterance
    T->>STT: Stream audio chunks
    STT->>E: Transcribed text (100-150ms)

    E->>LLM: Chat completion with context

    alt Simple Response
        LLM->>E: Response text (50-100ms)
        E->>TTS: Stream text
        TTS->>T: Audio chunks (50-100ms)
        T->>U: Audio response
        Note over U,T: Total: 200-350ms
    else Tool Call Needed
        LLM->>E: "Let me check..." + tool_call
        E->>TTS: Bridge phrase immediately
        TTS->>T: "Let me check that for you"
        T->>U: Audio bridge
        E->>E: Play clicking sound
        E->>Tool: Execute tool (~500ms)
        Tool->>E: Tool result
        E->>LLM: Continue with result
        LLM->>E: Complete response
        E->>TTS: Stream response
        TTS->>T: Audio chunks
        T->>U: Full response
    end
```

---

## Agent Delegation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant E as ConversationalAudioEngine
    participant LLM as Real-Time LLM
    participant ADH as AgentDelegationHandler
    participant Agent as MJ Agent (unaware of audio)
    participant TTS as TTS Provider

    U->>E: Complex request
    E->>LLM: Analyze request
    LLM->>E: delegate_to_agent(agentId, request)

    E->>ADH: DelegateToAgent()
    ADH->>TTS: "This will take a moment..."
    TTS->>U: Acknowledgment audio

    loop Background Cues
        ADH->>U: Subtle clicking/typing sounds
    end

    ADH->>Agent: ExecuteAgent (standard call)

    opt Long Operation (>10s)
        Agent->>ADH: onProgress callback
        ADH->>TTS: "Still working on that..."
        TTS->>U: Status update
    end

    Agent->>ADH: Result payload
    ADH->>ADH: Stop background cues
    ADH->>TTS: Speak result
    TTS->>U: Final response audio
```

---

## Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Initializing: InitializeSession()

    Initializing --> PreLoading: Config validated

    PreLoading --> Ready: Context loaded (~2-3s)
    note right of PreLoading
        - Load FAQ embeddings
        - Lock model selection
        - Fetch member/org data
        - Initialize prompt config
    end note

    Ready --> Processing: Audio input received

    Processing --> ToolExecution: Tool call needed
    Processing --> AgentDelegation: Complex query
    Processing --> Responding: Direct response

    ToolExecution --> Responding: Tool complete
    AgentDelegation --> Responding: Agent complete

    Responding --> Ready: Response delivered

    Ready --> Ending: EndSession()
    Processing --> Ending: Timeout/Error

    Ending --> [*]: Cleanup complete
```

---

## Data Model

```mermaid
erDiagram
    AudioSession ||--o{ AudioUtterance : contains
    AudioSession ||--|| AudioSessionConfig : has
    AudioSession }o--|| User : belongs_to
    AudioSession }o--o| Conversation : persists_to

    AudioSessionConfig ||--o| AIModel : stt_model
    AudioSessionConfig ||--o| AIModel : tts_model
    AudioSessionConfig ||--o| AIModel : llm_model
    AudioSessionConfig ||--o| AIVendor : stt_vendor
    AudioSessionConfig ||--o| AIVendor : tts_vendor
    AudioSessionConfig ||--o| Voice : uses

    AudioUtterance ||--o| ConversationDetail : persists_to
    AudioUtterance {
        string id PK
        string sessionId FK
        string role "user|assistant"
        string transcribedText
        blob audioData
        timestamp startTime
        timestamp endTime
        int durationMs
    }

    AudioSession {
        string id PK
        string userId FK
        string conversationId FK
        string configId FK
        json preloadedContext
        string status "initializing|ready|processing|ended"
        timestamp startTime
        timestamp lastActivity
    }

    AudioSessionConfig {
        string id PK
        string sttModelId FK
        string ttsModelId FK
        string llmModelId FK
        string voiceId FK
        string associationId FK
        json toolDefinitions
        int maxSessionDurationMs
    }

    Voice ||--o{ AudioSessionConfig : used_by
    Voice {
        string id PK
        string vendorVoiceId
        string name
        string description
        string gender
        string accent
        json voiceSettings
        string associationId FK
    }

    AudioFAQ ||--o| Association : scoped_to
    AudioFAQ {
        string id PK
        string question
        json questionVariants
        string answer
        string associationId FK
        string category
        int priority
        vector embedding
        boolean isActive
    }
```

---

## Package Structure

```mermaid
flowchart LR
    subgraph AudioGateway["packages/AI/AudioGateway"]
        subgraph Engine["engine/"]
            CAE["ConversationalAudioEngine.ts"]
            AS["AudioSession.ts"]
            ADH["AgentDelegationHandler.ts"]
        end

        subgraph Audio["audio/"]
            BAT["BaseAudioTransport.ts"]
            ACM["AudioCueManager.ts"]
            SC["StreamingCoordinator.ts"]
        end

        subgraph ContextMgmt["context/"]
            SCL["SessionContextLoader.ts"]
            FVS["FAQVectorStore.ts"]
            CM["ConversationMemory.ts"]
        end

        subgraph ToolsMgmt["tools/"]
            ATD["AudioToolDefinitions.ts"]
            QLT["QuickLookupTools.ts"]
            AIT["AgentInvocationTool.ts"]
        end

        subgraph Transports["transports/"]
            WST["WebSocketTransport.ts"]
            TT["TwilioTransport.ts"]
            More["..."]
        end
    end

    subgraph Providers["packages/AI/Providers"]
        Deepgram["Deepgram/"]
        ElevenLabs["ElevenLabs/"]
        Cartesia["Cartesia/"]
    end

    AudioGateway --> Providers
```

---

## Latency Budget

```mermaid
gantt
    title Real-Time Response Latency Budget (Target: 300ms)
    dateFormat X
    axisFormat %L ms

    section STT
    Streaming transcription    :stt, 0, 150

    section LLM
    Token generation (streaming) :llm, 100, 200

    section TTS
    First audio chunk          :tts, 150, 250

    section Total
    User perceives response    :done, 200, 300
```

---

## Tool Call Latency Management

```mermaid
flowchart TD
    subgraph Immediate["Immediate Response Path (<300ms)"]
        A1[User Question] --> A2{Needs Tool?}
        A2 -->|No| A3[Direct LLM Response]
        A3 --> A4[Stream TTS]
        A4 --> A5[User Hears Response]
    end

    subgraph Bridged["Tool Call Path (300ms-2s)"]
        A2 -->|Yes| B1[LLM: Bridge Phrase]
        B1 --> B2[TTS: 'Let me check...']
        B2 --> B3[User Hears Bridge]
        B3 --> B4[Play Audio Cue]
        B4 --> B5[Execute Tool]
        B5 --> B6[LLM: Complete Response]
        B6 --> B7[TTS: Full Answer]
        B7 --> B8[User Hears Answer]
    end

    subgraph Delegated["Agent Delegation Path (>2s)"]
        A2 -->|Complex| C1[LLM: Acknowledgment]
        C1 --> C2[TTS: 'This will take a moment']
        C2 --> C3[Loop: Background Cues]
        C3 --> C4[Execute Full Agent]
        C4 --> C5{Duration?}
        C5 -->|>10s| C6[TTS: Status Update]
        C6 --> C3
        C5 -->|Complete| C7[TTS: Final Response]
    end
```

---

## Knowledge Access Tiers

```mermaid
flowchart LR
    subgraph Tier1["Tier 1: Instant (Pre-loaded)"]
        FAQ["FAQ Embeddings"]
        Member["Member Profile"]
        Org["Association Info"]
        Common["Common Responses"]
    end

    subgraph Tier2["Tier 2: Quick Tool (~500ms)"]
        DB["Database Lookups"]
        Status["Member Status"]
        Schedule["Event Schedule"]
        Certs["Certifications"]
    end

    subgraph Tier3["Tier 3: Agent Delegation (seconds)"]
        Reports["Reports/Analytics"]
        Workflows["Multi-step Workflows"]
        Actions["Actions with Side Effects"]
        Research["Complex Research"]
    end

    User((User Query)) --> Router{Complexity?}
    Router -->|Simple| Tier1
    Router -->|Lookup| Tier2
    Router -->|Complex| Tier3

    Tier1 -->|Miss| Tier2
    Tier2 -->|Miss| Tier3
```

---

## Provider Integration

```mermaid
flowchart TB
    subgraph BaseAudio["BaseAudioGenerator (existing)"]
        TTS_Base["CreateSpeech()"]
        STT_Base["SpeechToText()"]
        Voices["GetVoices()"]
        Models["GetModels()"]
    end

    subgraph STT_Providers["STT Providers"]
        Deepgram["DeepgramAudioGenerator"]
        Whisper["OpenAIAudioGenerator"]
        Assembly["AssemblyAIAudioGenerator"]
    end

    subgraph TTS_Providers["TTS Providers"]
        ElevenLabs["ElevenLabsAudioGenerator ✓"]
        OpenAI_TTS["OpenAITTSGenerator"]
        Cartesia["CartesiaAudioGenerator"]
    end

    BaseAudio --> STT_Providers
    BaseAudio --> TTS_Providers

    subgraph Selection["Runtime Selection"]
        Config["AudioSessionConfig"]
        Factory["ClassFactory.CreateInstance()"]
    end

    Config --> Factory
    Factory --> STT_Providers
    Factory --> TTS_Providers
```

---

## Component Interfaces

### ConversationalAudioEngine

```typescript
class ConversationalAudioEngine {
    // Session Lifecycle
    async InitializeSession(config: AudioSessionConfig): Promise<AudioSession>
    async EndSession(sessionId: string): Promise<void>

    // Real-time Processing
    async ProcessUtterance(session: AudioSession, audioInput: AudioInput): Promise<void>

    // Internal
    private async PreloadContext(session: AudioSession): Promise<ConversationContext>
    private async HandleToolCall(session: AudioSession, tool: ToolRequest): Promise<ToolResult>
    private async DelegateToAgent(session: AudioSession, agentId: string, request: string): Promise<void>
}
```

### AudioSession

```typescript
interface AudioSession {
    id: string
    userId: string
    config: AudioSessionConfig
    status: 'initializing' | 'ready' | 'processing' | 'ended'

    // Pre-loaded at session start (immutable during session)
    context: {
        faqVectorStore: SimpleVectorService
        memberInfo: MemberContext
        associationInfo: AssociationContext
        modelSelection: AIModelSelectionInfo
        promptConfig: AIPromptEntityExtended
        toolDefinitions: ToolDefinition[]
    }

    // Mutable conversation state
    conversationHistory: ChatMessage[]

    // Audio state
    audioState: {
        currentUtterance: AudioBuffer | null
        pendingToolCalls: ToolRequest[]
        isProcessing: boolean
        isSpeaking: boolean
    }

    // Metrics
    metrics: {
        startTime: Date
        utteranceCount: number
        toolCallCount: number
        agentDelegationCount: number
        totalAudioDurationMs: number
    }
}
```

### AudioSessionConfig

```typescript
interface AudioSessionConfig {
    // Provider Selection
    sttProvider: string        // 'Deepgram' | 'OpenAI' | 'AssemblyAI'
    ttsProvider: string        // 'ElevenLabs' | 'OpenAI' | 'Cartesia'
    llmModel: string           // Model ID for real-time LLM

    // Voice Configuration
    voiceId: string
    voiceSettings?: VoiceSettings

    // Context Scope
    associationId?: string
    memberId?: string

    // Behavior
    maxSessionDurationMs: number
    idleTimeoutMs: number
    enableAgentDelegation: boolean

    // Audio Cues
    audioCueSet: 'subtle' | 'conversational' | 'none'
}
```

---

## Integration with Existing MJ Components

| Audio Gateway Component | Existing MJ Component | Integration Pattern |
|------------------------|----------------------|---------------------|
| Real-Time LLM | `AIPromptRunner` | Direct usage, pre-selected model |
| Tool Execution | `ActionEngineServer` | Invoke actions as tools |
| Agent Delegation | `AgentRunner` | Standard agent execution |
| FAQ Storage | `SimpleVectorService` | In-memory vector search |
| Conversation Persistence | `Conversation` / `ConversationDetail` | Same entities as text |
| Provider Selection | `AIModel` / `AIVendor` metadata | ClassFactory pattern |
| Context Loading | `RunView` / Entity system | Pre-load at session start |

---

## Implementation Phases

### Phase 1: Foundation
- Create `packages/AI/AudioGateway` package
- Implement `ConversationalAudioEngine` core structure
- Add streaming STT to `BaseAudioGenerator` (Deepgram)
- Basic `AudioSession` with pre-loading

### Phase 2: Real-Time Loop
- `AIPromptRunner` integration for fast LLM
- Tool definitions and execution
- Audio cue system (clicking sounds)
- Streaming TTS coordination

### Phase 3: Agent Delegation
- `AgentDelegationHandler` implementation
- Progress callback → audio feedback
- Fallback options (email/text results)

### Phase 4: Knowledge & Context
- FAQ vector store integration
- Association-scoped context loading
- Memory/learning from conversations

### Phase 5: Production Hardening
- Multiple transport drivers (WebSocket, Twilio)
- Provider failover
- Monitoring and analytics
- Voice persona system

---

## Key Files to Create/Modify

### New Package: `packages/AI/AudioGateway/`

```
packages/AI/AudioGateway/
├── src/
│   ├── index.ts
│   ├── engine/
│   │   ├── ConversationalAudioEngine.ts
│   │   ├── AudioSession.ts
│   │   └── AgentDelegationHandler.ts
│   ├── audio/
│   │   ├── BaseAudioTransport.ts
│   │   ├── AudioCueManager.ts
│   │   └── StreamingCoordinator.ts
│   ├── context/
│   │   ├── SessionContextLoader.ts
│   │   ├── FAQVectorStore.ts
│   │   └── ConversationMemory.ts
│   ├── tools/
│   │   ├── AudioToolDefinitions.ts
│   │   ├── QuickLookupTools.ts
│   │   └── AgentInvocationTool.ts
│   └── transports/
│       ├── WebSocketTransport.ts
│       └── TwilioTransport.ts
├── package.json
├── tsconfig.json
└── README.md
```

### Existing Files to Extend

| File | Changes |
|------|---------|
| `packages/AI/Core/src/generic/baseAudio.ts` | Add streaming STT interface |
| `packages/AI/Providers/Deepgram/` | New package for Deepgram STT |
| `packages/AI/Providers/Cartesia/` | New package for Cartesia TTS |
| Database migrations | Add `AudioFAQ`, `Voice`, `AudioSessionConfig` tables |

---

## Open Design Questions

1. **FAQ Storage**: New `AudioFAQ` entity or extend existing `AIAgentNote`?
2. **Voice Personas**: Per-association, per-agent, or user preference?
3. **Conversation Persistence**: Same `Conversation` entity or separate?
4. **Billing/Metering**: Track audio minutes separately?
5. **Interruption Handling**: Stop immediately, finish sentence, or queue?
