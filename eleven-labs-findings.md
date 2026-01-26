# Eleven Labs Real-Time Capabilities - Research Findings

**Date:** 2026-01-25
**Purpose:** Determine if Eleven Labs supports real-time bidirectional audio streaming and dynamic prompt configuration for Audio Sage implementation

---

## Executive Summary

✅ **Eleven Labs FULLY supports real-time bidirectional audio streaming** via WebSocket and WebRTC
✅ **Dynamic prompts are supported** via "Overrides" and "Dynamic Variables"
✅ **MJAPI can act as the middle layer** to dynamically render prompts and inject MJ context
✅ **SDK provides complete agent management** including create, update, and conversation handling

**Recommendation:** Proceed with implementation using WebSocket initially, with option to upgrade to WebRTC for better echo cancellation.

---

## 1. Real-Time Bidirectional Audio Streaming

### WebSocket API ✅

**Endpoint:**
```
wss://api.elevenlabs.io/v1/convai/conversation?agent_id={agent_id}
```

**Authentication:**
- **Public agents:** Use `agent_id` directly in URL
- **Private agents:** Obtain signed URL from server using API key

**Audio Flow:**
```
Client (MJAPI) ──► WebSocket ──► Eleven Labs Agent
      │                              │
      │◄──────── Audio Response ─────┘
      │
      └──► Send base64-encoded audio chunks
      └──► Receive agent audio response chunks
```

**Message Protocol:**
- **Client → Server:**
  - Conversation initiation
  - Audio chunks (base64 encoded)
  - Contextual updates during conversation

- **Server → Client:**
  - User transcript (what was heard)
  - Agent response (text)
  - Audio response (chunks)
  - Ping/pong for connection maintenance

**Audio Format:**
- Client sends: Base64-encoded audio chunks
- Server sends: Audio event chunks
- Recommended: Use `voice-stream` package for microphone handling

### WebRTC Support ✅ (New in 2024)

**Benefits over WebSocket:**
- Best-in-class echo cancellation
- Background noise removal
- Better latency for full-duplex audio
- Available in npm package and Swift SDK

**Note:** WebRTC is newer but offers superior audio quality for voice conversations.

---

## 2. Agent Creation & Configuration

### Programmatic Agent Creation ✅

**SDK Method:**
```typescript
const client = new ElevenLabsClient({ apiKey });

const agent = await client.conversationalAi.agents.create({
    conversationConfig: {
        // Agent configuration object
    }
});
```

**API Endpoint:**
```
POST https://api.elevenlabs.io/v1/convai/agents/create
```

**Agent Configuration Includes:**
- System prompt
- LLM model selection (GPT-4o, Claude Sonnet, Gemini, or custom)
- Voice ID
- Language
- TTS settings (stability, speed, similarity boost)
- Tools and workflows
- Knowledge base integration

**Agent Management Operations:**
```typescript
// Create agent
client.conversationalAi.agents.create(config)

// Get agent config
client.conversationalAi.agents.get(agent_id)

// Update agent
client.conversationalAi.agents.update(agent_id, updates)

// Delete agent
client.conversationalAi.agents.delete(agent_id)

// List all agents
client.conversationalAi.agents.list()

// Duplicate agent
client.conversationalAi.agents.duplicate(agent_id)
```

---

## 3. Dynamic Prompts - Two Approaches

### Approach 1: Overrides (Recommended for MJ Use Case) ✅

**What are Overrides?**
- Modify agent behavior at conversation start
- Completely replace system prompt, first message, or other settings
- Perfect for injecting real-time context from MJ

**How to Use:**
1. Enable overrides in agent security settings
2. Pass override parameters when starting conversation

**What Can Be Overridden:**
- System prompt (full replacement)
- First message
- Language
- Voice ID
- LLM model
- TTS settings (stability, speed, similarity boost)
- Text-only mode

**SDK Example:**
```typescript
// Start conversation with dynamic prompt override
await client.conversationalAi.conversations.start({
    agent_id: 'agent_xxx',
    overrides: {
        prompt: {
            prompt: renderSagePrompt(availableAgents, availableActions),
            llm: "gpt-4o"
        },
        tts: {
            voiceId: "voice_xxx"
        }
    }
});
```

**Perfect for MJ Architecture:**
```typescript
// MJAPI dynamically builds Sage prompt
function renderAudioSagePrompt(contextUser: UserInfo): string {
    const agents = await getAvailableAgents(contextUser);
    const actions = await getAvailableActions(contextUser);

    return `
# Sage - Audio Mode

You are participating in a live voice conversation.

## Available Agents
${agents.map(a => `- ${a.Name}: ${a.Description}`).join('\n')}

## Available Actions
${actions.map(a => `- ${a.Name}: ${a.Description}`).join('\n')}

## Instructions
[Sage template instructions here]
    `.trim();
}

// Then override the agent prompt when starting conversation
const prompt = renderAudioSagePrompt(contextUser);
await startConversationWithOverride(agent_id, prompt);
```

**Important Notes:**
- Overrides apply at conversation start only
- Cannot update mid-conversation (for that, use dynamic variables)
- Eleven Labs recommends using sparingly

### Approach 2: Dynamic Variables (For Runtime Values) ✅

**What are Dynamic Variables?**
- Inject runtime values into predefined prompts
- Use `{{variable_name}}` syntax in agent configuration
- Pass values when starting conversation

**Syntax:**
```
System Prompt: "Hello {{user_name}}, you have {{available_agents_count}} agents available."
```

**SDK Example:**
```typescript
await startConversation({
    agent_id: 'agent_xxx',
    dynamicVariables: {
        user_name: "Jordan",
        available_agents_count: 15
    }
});
```

**Types Supported:**
- String
- Number
- Boolean

**Special Variable Types:**
- **System variables:** Prefixed with `system__` (automatically provided)
- **Secret variables:** Prefixed with `secret__` (not sent to LLM, only used in headers/tools)

**Limitations:**
- Variables are set at conversation start (static within conversation)
- Cannot completely replace system prompt (use Overrides for that)
- Must match exact variable names

**Why This is Less Ideal for MJ:**
- Would require defining all possible agents/actions as variables
- Can't handle dynamic list structures well
- Better suited for simple key-value pairs

---

## 4. MJAPI as Middle Layer Architecture ✅

### Proposed Flow

```
User speaks (MS Teams or Web)
    ↓
Audio stream to MJAPI (Node.js WebSocket server)
    ↓
MJAPI gathers context:
  - Query available agents from MJ database
  - Query available actions from MJ database
  - Build user permissions context
  - Load conversation history
    ↓
MJAPI renders Sage prompt dynamically
    ↓
MJAPI initiates Eleven Labs conversation with Override
    ↓
WebSocket: MJAPI ↔ Eleven Labs
  - MJAPI forwards user audio → Eleven Labs
  - MJAPI receives agent audio ← Eleven Labs
    ↓
MJAPI can inject function calls via Tools
    ↓
Audio response → User
```

### Key Implementation Points

**1. Agent Creation (One-Time Setup)**
```typescript
// Create base Audio Sage agent (without specific context)
const agent = await client.conversationalAi.agents.create({
    conversationConfig: {
        agent: {
            prompt: {
                prompt: "{{system_prompt}}", // Placeholder for override
                llm: "claude-3-5-sonnet-20241022"
            },
            firstMessage: "I'm listening. How can I help?",
            language: "en",
            tts: {
                voiceId: "EXAVITQu4vr4xnSDxMaL" // Bella voice
            }
        }
    }
});
```

**2. Conversation Start with Dynamic Context**
```typescript
async function startAudioSageConversation(
    agentId: string,
    contextUser: UserInfo
): Promise<string> {
    // Gather real-time MJ context
    const agents = await loadAvailableAgents(contextUser);
    const actions = await loadAvailableActions(contextUser);

    // Render Sage prompt
    const renderedPrompt = renderSagePromptTemplate({
        agents,
        actions,
        userName: contextUser.Name
    });

    // Start conversation with override
    const conversation = await client.conversationalAi.conversations.start({
        agent_id: agentId,
        overrides: {
            prompt: {
                prompt: renderedPrompt
            }
        }
    });

    return conversation.conversation_id;
}
```

**3. WebSocket Audio Streaming**
```typescript
import WebSocket from 'ws';

async function streamAudioConversation(
    agentId: string,
    conversationId: string
): Promise<WebSocket> {
    // Get signed URL for private agent
    const signedUrl = await getSignedConversationUrl(agentId);

    // Connect to Eleven Labs WebSocket
    const ws = new WebSocket(signedUrl);

    ws.on('open', () => {
        console.log('Connected to Eleven Labs');
        // Start sending audio chunks
    });

    ws.on('message', (data) => {
        const event = JSON.parse(data);

        switch (event.type) {
            case 'audio':
                // Received audio chunk from agent
                playAudioToUser(event.audioChunk);
                break;
            case 'transcript':
                // User speech transcribed
                logUserTranscript(event.transcript);
                break;
            case 'agent_response':
                // Agent text response
                logAgentResponse(event.response);
                break;
        }
    });

    return ws;
}
```

**4. Function/Tool Calling for MJ Actions**
Eleven Labs supports "Tools" that can make webhook requests. We can expose MJ actions as tools:

```typescript
// Configure agent with MJ action tools
const agent = await client.conversationalAi.agents.create({
    conversationConfig: {
        agent: { /* ... */ },
        tools: [
            {
                name: "execute_mj_action",
                description: "Execute a MemberJunction action",
                parameters: {
                    action_name: "string",
                    params: "object"
                },
                webhookUrl: "https://your-mjapi.com/elevenlabs/execute-action"
            },
            {
                name: "create_task_graph",
                description: "Create a multi-step task graph",
                parameters: {
                    workflow_name: "string",
                    tasks: "array"
                },
                webhookUrl: "https://your-mjapi.com/elevenlabs/create-task-graph"
            }
        ]
    }
});
```

Then MJAPI receives webhook calls and executes MJ logic:
```typescript
// GraphQL resolver or REST endpoint
async function executeElevenLabsAction(request: {
    action_name: string;
    params: Record<string, any>;
}): Promise<any> {
    // Execute MJ action
    const result = await executeAction(
        request.action_name,
        request.params,
        contextUser
    );

    // Return result to Eleven Labs to include in conversation
    return {
        success: result.Success,
        message: result.Message,
        data: result.ResultCode
    };
}
```

---

## 5. Available SDK Operations (From TypeScript Types)

### Conversation Management
```typescript
// List conversations
client.conversationalAi.conversations.list({ agentId, cursor, pageSize })

// Get conversation details
client.conversationalAi.conversations.get(conversation_id)

// Get conversation audio
client.conversationalAi.conversations.audio.get(conversation_id)

// Provide feedback on conversation
client.conversationalAi.conversations.feedback.submit(conversation_id, feedback)
```

### Agent Testing & Simulation
```typescript
// Simulate conversation (test without real audio)
client.conversationalAi.agents.simulateConversation(agent_id, {
    simulationSpecification: {
        simulatedUserConfig: {
            firstMessage: "Hello",
            language: "en"
        }
    }
})

// Stream simulated conversation
client.conversationalAi.agents.simulateConversationStream(agent_id, config)

// Run predefined tests
client.conversationalAi.agents.runTests(agent_id, { tests: [...] })
```

### Knowledge Base
```typescript
// Add document to knowledge base
client.conversationalAi.addToKnowledgeBase({
    agentId: 'agent_xxx',
    file: fileStream  // or url: 'https://...'
})

// Get RAG index overview
client.conversationalAi.ragIndexOverview()
```

### Analytics & Monitoring
```typescript
// Real-time analytics
client.conversationalAi.analytics./* various analytics endpoints */

// LLM usage tracking
client.conversationalAi.llmUsage./* usage tracking */
```

---

## 6. Model Selection

**Supported LLM Models:**
- GPT-4o (OpenAI)
- Claude Sonnet (Anthropic)
- Gemini (Google)
- Custom LLM (via API integration)

**Recommended for Audio Sage:**
- **Primary:** Claude Sonnet 3.5 (Anthropic)
  - Best reasoning for complex workflows
  - Strong JSON output for structured responses
  - Excellent instruction following

- **Fallback:** GPT-4o (OpenAI)
  - Faster response times
  - Good for simpler interactions

**Voice Selection:**
Available via Eleven Labs voice library - recommend testing multiple for best "Sage" personality.

---

## 7. Comparison: Static vs. Dynamic Prompts

| Approach | When to Use | Pros | Cons |
|----------|-------------|------|------|
| **Static Agent Prompt** | Agent behavior is always the same | Simple, no runtime overhead | Can't adapt to user context |
| **Dynamic Variables** | Injecting simple runtime values (name, counts) | Structured, maintainable | Limited to key-value pairs |
| **Overrides** | Completely custom prompt per conversation | Full flexibility, perfect for MJ | Requires agent security config |

**For Audio Sage: Use Overrides**

---

## 8. Code Examples from Existing MJ Integration

### Current ATS Implementation (Batch Processing)
From `/CDP/packages/CustomAgents/src/ElevenLabsSyncAgent.ts`:

```typescript
// List completed conversations (batch mode)
const client = new ElevenLabsClient({ apiKey });
const response = await client.conversationalAi.conversations.list({
    agentId,
    cursor,
    pageSize: 100
});

// Fetch full conversation data
const fullConversation = await client.conversationalAi.conversations.get(
    conversation.conversation_id
);

// Download audio
const audioStream = await client.conversationalAi.conversations.audio.get(
    conversationId
);
```

**Key Difference for Real-Time:**
- Batch mode: Poll for completed conversations, then fetch
- Real-time mode: WebSocket connection for live audio streaming

---

## 9. Teams Integration Path (Phase 4)

**Microsoft Teams Bot Architecture:**
```
Teams Meeting Audio
    ↓
Teams Bot Framework (Azure)
    ↓
MJAPI WebSocket Server
    ↓
Eleven Labs WebSocket
    ↓
Audio Response
    ↓
Teams Bot Framework
    ↓
Teams Meeting
```

**Teams Bot Capabilities Needed:**
- Audio stream capture (requires Media Bot permissions)
- Real-time audio transmission
- Audio playback in meeting
- Meeting context access (participants, metadata)

**Complexity Level:** High
- Requires Azure Bot Service setup
- Media streaming adds significant complexity
- Latency sensitive (sub-second round-trip ideal)

---

## 10. Recommended Implementation Path

### Phase 1: Basic Audio Streaming (2 weeks)
**Goal:** Prove WebSocket bidirectional audio works

1. Create simple MJAPI WebSocket server
2. Create basic Eleven Labs agent (no MJ integration yet)
3. Test audio input → Eleven Labs → audio output
4. Validate latency and audio quality

**Deliverable:** Working audio loop with static Sage prompt

### Phase 2: Dynamic Context Injection (2 weeks)
**Goal:** MJAPI renders Sage prompt with MJ data

1. Build agent/action query service in MJAPI
2. Implement prompt template renderer
3. Use Overrides to inject dynamic prompt on conversation start
4. Test with real MJ agents/actions data

**Deliverable:** Audio Sage that knows about available MJ capabilities

### Phase 3: Action Execution via Tools (3 weeks)
**Goal:** Audio Sage can execute MJ actions and delegate to agents

1. Configure Eleven Labs Tools (webhooks)
2. Build MJAPI webhook endpoints for action execution
3. Implement task graph creation from audio conversation
4. Test end-to-end workflow (audio → action → result → audio)

**Deliverable:** Audio Sage that can execute actions and report results

### Phase 4: Teams Integration (4-6 weeks)
**Goal:** Deploy in Microsoft Teams meetings

1. Register Teams bot in Azure
2. Implement Teams audio streaming
3. Connect Teams audio to MJAPI WebSocket bridge
4. Test in live meetings
5. Optimize for latency and quality

**Deliverable:** Audio Sage as Teams meeting participant

---

## 11. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Latency too high for natural conversation | High | Use WebRTC instead of WebSocket; optimize MJAPI processing |
| Eleven Labs API costs | Medium | Monitor usage, implement conversation limits |
| Prompt too large with all agents/actions | Medium | Summarize or filter agents by permission/relevance |
| Function calling limitations | High | Test tool/webhook capabilities early; may need custom solution |
| Teams audio streaming complexity | High | Start with simpler web interface before Teams |
| Echo/background noise in multi-user calls | Medium | Use WebRTC for built-in echo cancellation |

---

## 12. Open Questions to Validate

✅ **Can we override prompts at conversation start?** YES - via Overrides
✅ **Does Eleven Labs support bidirectional audio?** YES - via WebSocket/WebRTC
✅ **Can agents call external APIs?** YES - via Tools (webhooks)
❓ **What's the actual latency for audio round-trip?** - Needs testing
❓ **Can we inject context mid-conversation?** - Likely via separate tool calls
❓ **How much context can fit in a prompt?** - LLM dependent (Claude: ~200k tokens)
❓ **Can we get raw audio format for Teams integration?** - Needs investigation

---

## 13. Next Actions

### Immediate (This Week)
- [ ] Create proof-of-concept Eleven Labs agent via web UI
- [ ] Test WebSocket connection from Node.js script
- [ ] Measure audio round-trip latency
- [ ] Validate prompt override functionality

### Short-term (Next 2 Weeks)
- [ ] Build MJAPI WebSocket server skeleton
- [ ] Implement agent/action context gathering
- [ ] Create Sage prompt template renderer
- [ ] Test dynamic prompt with override

### Medium-term (1 Month)
- [ ] Configure Tools for MJ action execution
- [ ] Build webhook endpoints in MJAPI
- [ ] Test end-to-end action execution flow
- [ ] Create demo video of Audio Sage in action

---

## Conclusion

**Eleven Labs provides EVERYTHING we need for Audio Sage:**
✅ Real-time bidirectional audio streaming
✅ Dynamic prompt injection via Overrides
✅ Programmatic agent creation and management
✅ Function calling via Tools (webhooks)
✅ Multiple LLM options (Claude, GPT, Gemini)
✅ WebRTC support for echo cancellation

**Architecture is viable:**
- MJAPI acts as middle layer
- Dynamically renders Sage prompt with MJ context
- Bridges WebSocket audio between user and Eleven Labs
- Executes MJ actions via webhook callbacks

**Recommended approach:**
1. Start with WebSocket (simpler)
2. Use Overrides for dynamic prompts
3. Build incrementally: audio → context → actions → Teams
4. Consider upgrading to WebRTC for production quality

**This project is feasible and well-aligned with Eleven Labs capabilities.**
