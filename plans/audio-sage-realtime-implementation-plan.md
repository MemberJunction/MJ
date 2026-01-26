# Audio Sage Real-Time Implementation Plan

**Status**: Planning
**Priority**: High
**Start Date**: TBD
**Target Completion**: TBD
**Owner**: TBD

---

## Executive Summary

This document outlines the implementation plan for evolving Audio Sage from the current proof-of-concept (synchronous STT+TTS pipeline) to a production-ready real-time conversational AI system using Eleven Labs' WebSocket-based Conversational AI platform.

### Current State (Phase 1 - PoC Complete)
- ✅ Audio recording and upload in Angular UI
- ✅ GraphQL mutation for voice message processing (`ProcessVoiceMessage`)
- ✅ Eleven Labs STT for transcription
- ✅ Eleven Labs TTS for audio response generation
- ✅ Conversation detail and attachment storage
- ✅ Inline audio player with duration display in message UI
- ✅ Audio response cache pattern for binary data passing
- ⚠️ **Limitation**: Current PoC uses STT + echo + TTS pipeline (no intelligence layer)

### Phase 1 - Key Learnings from PoC Implementation

**What Worked Well:**
1. **Audio Response Cache Pattern**: Using `Map<string, Buffer>` to temporarily store audio responses works effectively for passing binary data from AudioSageAgent to AudioSageResolver. The cache is keyed by `conversationDetailId` and cleared after retrieval.
   - Implementation: `audioResponseCache` in [audio-sage-agent.ts](../packages/AI/AgentManager/core/src/agents/audio-sage-agent.ts)
   - Export: `getAudioResponse()` function for resolver access

2. **Inline Audio Player UI**: HTML5 `<audio>` element with metadata display provides good UX for voice messages.
   - Component: [message-item.component.html](../packages/Angular/Generic/conversations/src/lib/components/message/message-item.component.html)
   - Features: Duration display, playback controls, file name, MIME type support

3. **Attachment System**: Extended `ConversationAttachment` entity with `durationSeconds` field works well for audio metadata.
   - Service: [conversation-attachment.service.ts](../packages/Angular/Generic/conversations/src/lib/services/conversation-attachment.service.ts)

4. **Message Flow**: Emitting both user and agent messages from `message-input.component.ts` ensures proper display in conversation thread.

**Critical Configuration Notes:**
1. **Eleven Labs Zero Retention Mode (ZRM)**:
   - **Requires enterprise/trial tier** - not available on standard accounts
   - Setting `enableLogging: false` triggers 403 error on standard accounts
   - For production, either upgrade to enterprise tier OR remove the parameter (logs retained per Eleven Labs policy)
   - Fixed by removing `enableLogging: false` from line 196 in audio-sage-agent.ts

**Architecture Limitation Identified:**
- **PoC does NOT provide intelligent responses**: The current architecture is STT → Text Echo → TTS pipeline
- User expectation: Intelligent voice responses based on Audio Sage prompt
- Solution: Real-time Conversational AI implementation (this plan) is REQUIRED
- **Confirmed**: Moving to Phase 2+ is the correct path forward

### Target State (Phase 5 - Production)
- 🎯 Real-time bidirectional audio streaming
- 🎯 WebSocket-based conversation management
- 🎯 Natural conversation flow with interruptions
- 🎯 Real-time MJ Action execution during conversation
- 🎯 Streaming audio playback with low latency
- 🎯 Agent prompt override with MJ prompts
- 🎯 Intelligent responses powered by Eleven Labs Conversational AI

---

## Architecture Overview

### Current Architecture (Phase 1)
```
┌──────────────┐
│   Angular    │
│     UI       │  ✅ Inline audio player with duration (REUSABLE)
└──────┬───────┘
       │ Upload audio (GraphQL Mutation: ProcessVoiceMessage)
       ↓
┌──────────────┐
│   MJServer   │
│   GraphQL    │  ✅ AudioSageResolver working
└──────┬───────┘
       │ Pass audio buffer
       ↓
┌──────────────┐
│  AudioSage   │
│    Agent     │  ✅ Audio cache pattern working (REUSABLE)
└──────┬───────┘
       │
       ├─→ STT (Eleven Labs)
       │   └─→ Transcribe audio ✅
       │
       ├─→ Process text
       │   └─→ Echo response (PoC) ⚠️ NO INTELLIGENCE
       │
       └─→ TTS (Eleven Labs)
           └─→ Generate audio ✅

       ↓ Return complete audio

┌──────────────┐
│   Store in   │
│   Database   │  ✅ Attachment system with durationSeconds (REUSABLE)
└──────────────┘
```

**Key Takeaway**: While this architecture successfully demonstrates audio I/O and storage, it does NOT provide intelligent responses. Real-time Conversational AI (Phase 2+) is required for intelligent voice interaction.

### Target Architecture (Phase 5)
```
┌──────────────────────────────────────────────────────┐
│                    Angular UI                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │   Record   │  │  WebSocket │  │   Stream   │    │
│  │   Audio    │─→│  Connection│←─│   Audio    │    │
│  │   Stream   │  │            │  │  Playback  │    │
│  └────────────┘  └──────┬─────┘  └────────────┘    │
└─────────────────────────┼────────────────────────────┘
                          │
                    WebSocket (ws://)
                          │
┌─────────────────────────┼────────────────────────────┐
│                   MJServer / Express                  │
│  ┌──────────────────────┴─────────────────────────┐ │
│  │      WebSocket Handler                         │ │
│  │  - Manage in-memory conversation sessions     │ │
│  │  - Route events to/from AudioSageAgent        │ │
│  │  - Handle tool call results                   │ │
│  └──────────┬───────────────────────────────────┘ │
└─────────────┼──────────────────────────────────────┘
              │
              ↓
    ┌─────────────────┐
    │  AudioSageAgent │
    │                 │
    │  Manages:       │
    │  - Conversation │
    │  - Tool Mapping │
    │  - MJ Actions   │
    └────────┬────────┘
             │
             ↓ WebSocket to Eleven Labs
    ┌────────────────────────────┐
    │   Eleven Labs Platform     │
    │                            │
    │  ┌──────────────────────┐ │
    │  │  Conversational AI   │ │
    │  │  Agent (WebSocket)   │ │
    │  │                      │ │
    │  │  - Prompt override   │ │
    │  │  - Real-time STT     │ │
    │  │  - LLM processing    │ │
    │  │  - Tool calls        │ │
    │  │  - Real-time TTS     │ │
    │  └──────────────────────┘ │
    └────────────────────────────┘
```

---

## Implementation Phases

## Phase 2: WebSocket Infrastructure

**Duration**: 1-2 weeks
**Goal**: Establish WebSocket communication between frontend and backend with in-memory session management

### 2.1 Backend WebSocket Setup

**File**: `/packages/MJServer/src/websocket/VoiceConversationHandler.ts` (NEW)

```typescript
import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { AudioSageAgent } from '@memberjunction/ai-agent-manager';

export interface ConversationSession {
  id: string;
  conversationId: string;
  userId: string;
  ws: WebSocket;
  agent: AudioSageAgent;
  startedAt: Date;
}

export class VoiceConversationHandler {
  private wss: WebSocketServer;
  private activeSessions = new Map<string, ConversationSession>();

  constructor(server: any) {
    this.wss = new WebSocketServer({
      server,
      path: '/voice-conversation'
    });

    this.wss.on('connection', this.handleConnection.bind(this));
  }

  private async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    // Extract conversation detail ID from query params
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const conversationDetailId = url.searchParams.get('conversationDetailId');

    if (!conversationDetailId) {
      ws.close(4000, 'Missing conversationDetailId');
      return;
    }

    try {
      // Validate user and create session
      const session = await this.createSession(conversationDetailId, ws);
      this.activeSessions.set(session.id, session);

      // Handle incoming messages
      ws.on('message', (data) => this.handleMessage(session, data));
      ws.on('close', () => this.handleClose(session));
      ws.on('error', (error) => this.handleError(session, error));

      // Send ready event
      this.sendEvent(ws, 'ready', { sessionId: session.id });

    } catch (error) {
      ws.close(4001, `Session creation failed: ${error.message}`);
    }
  }

  private async createSession(
    conversationDetailId: string,
    ws: WebSocket
  ): Promise<ConversationSession> {
    // Load conversation detail, validate user, etc.
    // Initialize AudioSageAgent
    // Store session in memory only (no database persistence)
    // Return session object
  }

  private handleMessage(session: ConversationSession, data: any): void {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'audio':
          // Forward audio chunk to Eleven Labs
          session.agent.sendAudioChunk(Buffer.from(message.data, 'base64'));
          break;
        case 'text':
          // Send text message
          session.agent.sendText(message.text);
          break;
        case 'interrupt':
          // User interrupted agent - signal to stop current response
          session.agent.interrupt();
          break;
        case 'end':
          // End conversation gracefully
          this.endSession(session);
          break;
      }
    } catch (error) {
      this.sendEvent(session.ws, 'error', {
        message: error.message
      });
    }
  }

  private sendEvent(ws: WebSocket, type: string, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data, timestamp: Date.now() }));
    }
  }

  private handleClose(session: ConversationSession): void {
    this.endSession(session);
    this.activeSessions.delete(session.id);
  }

  private handleError(session: ConversationSession, error: Error): void {
    console.error('WebSocket error:', error);
    this.sendEvent(session.ws, 'error', { message: error.message });
  }

  private async endSession(session: ConversationSession): Promise<void> {
    await session.agent.endConversation();
    // Session ends - removed from in-memory map
  }
}
```

**File**: `/packages/MJServer/src/index.ts` (UPDATE)

```typescript
import { VoiceConversationHandler } from './websocket/VoiceConversationHandler';

// After creating HTTP server
const voiceHandler = new VoiceConversationHandler(server);
```

### 2.2 Frontend WebSocket Client

**File**: `/packages/Angular/Generic/conversations/src/lib/services/voice-conversation.service.ts` (NEW)

```typescript
import { Injectable } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';

export interface VoiceStreamEvent {
  type: 'ready' | 'audio_chunk' | 'transcript' | 'agent_response' | 'tool_call' | 'error' | 'complete';
  data: any;
  timestamp: number;
}

export interface ConversationSessionInfo {
  sessionId: string;
  conversationDetailId: string;
  status: 'connecting' | 'active' | 'ended' | 'error';
}

@Injectable({
  providedIn: 'root'
})
export class VoiceConversationService {
  private ws?: WebSocket;
  private events$ = new Subject<VoiceStreamEvent>();
  private sessionInfo$ = new BehaviorSubject<ConversationSessionInfo | null>(null);

  /**
   * Start a real-time voice conversation session.
   */
  startSession(conversationDetailId: string): Observable<VoiceStreamEvent> {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      throw new Error('Session already active');
    }

    // Update session status
    this.sessionInfo$.next({
      sessionId: '',
      conversationDetailId,
      status: 'connecting'
    });

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/voice-conversation?conversationDetailId=${conversationDetailId}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Voice conversation WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      const message: VoiceStreamEvent = JSON.parse(event.data);

      // Handle ready event
      if (message.type === 'ready') {
        this.sessionInfo$.next({
          sessionId: message.data.sessionId,
          conversationDetailId,
          status: 'active'
        });
      }

      this.events$.next(message);
    };

    this.ws.onerror = (error) => {
      console.error('Voice conversation WebSocket error:', error);
      this.sessionInfo$.next({
        ...this.sessionInfo$.value!,
        status: 'error'
      });
      this.events$.next({
        type: 'error',
        data: { message: 'WebSocket connection error' },
        timestamp: Date.now()
      });
    };

    this.ws.onclose = () => {
      console.log('Voice conversation WebSocket closed');
      this.sessionInfo$.next({
        ...this.sessionInfo$.value!,
        status: 'ended'
      });
      this.events$.complete();
      this.ws = undefined;
    };

    return this.events$.asObservable();
  }

  /**
   * Send audio chunk to the server.
   */
  sendAudio(audioData: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('No active WebSocket connection');
    }

    // Convert to base64
    const base64 = this.arrayBufferToBase64(audioData);

    this.ws.send(JSON.stringify({
      type: 'audio',
      data: base64
    }));
  }

  /**
   * Send text message to the conversation.
   */
  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('No active WebSocket connection');
    }

    this.ws.send(JSON.stringify({
      type: 'text',
      text: text
    }));
  }

  /**
   * Interrupt the agent's current response.
   */
  interrupt(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'interrupt'
    }));
  }

  /**
   * End the conversation session.
   */
  endSession(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'end'
      }));
      this.ws.close();
    }
    this.ws = undefined;
  }

  /**
   * Get current session info as observable.
   */
  getSessionInfo(): Observable<ConversationSessionInfo | null> {
    return this.sessionInfo$.asObservable();
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
```

### 2.3 Testing Phase 2

**Test Cases**:
1. ✅ WebSocket connection establishes successfully
2. ✅ In-memory session created with correct user/conversation IDs
3. ✅ Frontend receives 'ready' event with session ID
4. ✅ Audio data sent from frontend reaches backend handler
5. ✅ Multiple concurrent sessions work independently
6. ✅ Session cleanup on disconnect (removed from memory)
7. ✅ Error handling for invalid conversation IDs
8. ✅ Reconnection handling

---

## Phase 3: Eleven Labs Conversation Integration

**Duration**: 2-3 weeks
**Goal**: Integrate Eleven Labs WebSocket Conversation API

### 3.1 Update AudioSageAgent for Real-Time

**File**: `/packages/AI/AgentManager/core/src/agents/audio-sage-agent.ts` (UPDATE)

```typescript
import { Conversation } from '@elevenlabs/elevenlabs-js';
import { EventEmitter } from 'events';

export interface ConversationCallbacks {
  onUserTranscript: (text: string) => Promise<void>;
  onAgentResponse: (text: string) => Promise<void>;
  onAudioChunk: (audioBuffer: Buffer) => Promise<void>;
  onToolCall: (toolName: string, params: Record<string, unknown>) => Promise<string>;
  onError: (error: Error) => Promise<void>;
  onComplete: () => Promise<void>;
}

@RegisterClass(BaseAgent, 'AudioSageAgent')
export class AudioSageAgent extends BaseAgent {
  private elevenLabsClient: ElevenLabsClient;
  private activeConversations = new Map<string, Conversation>();
  private conversationEmitters = new Map<string, EventEmitter>();

  /**
   * Start a real-time conversation with Eleven Labs agent.
   */
  async startConversation(
    sessionId: string,
    systemPrompt: string,
    callbacks: ConversationCallbacks
  ): Promise<void> {
    try {
      LogStatus(`AudioSageAgent: Starting conversation session ${sessionId}`);

      // Create custom audio interface for bidirectional streaming
      const audioInterface = this.createAudioInterface(sessionId, callbacks);

      // Get tool definitions from MJ Actions
      const toolDefinitions = await this.getToolDefinitions();

      // Create Eleven Labs conversation
      const conversation = new Conversation({
        client: this.elevenLabsClient,
        agentId: ELEVEN_LABS_CONFIG.AGENT_ID,
        requiresAuth: true,
        audioInterface: audioInterface,
        config: {
          // Override agent's prompt with MJ prompt
          overrides: {
            prompt: {
              prompt: systemPrompt
            }
          }
        },
        clientTools: {
          tools: toolDefinitions,
          executeClientTool: async (toolName: string, parameters: Record<string, unknown>) => {
            return await this.executeToolCall(sessionId, toolName, parameters, callbacks);
          }
        },
        callbackUserTranscript: async (transcript: string) => {
          LogStatus(`AudioSageAgent [${sessionId}]: User said: "${transcript}"`);
          await callbacks.onUserTranscript(transcript);
        },
        callbackAgentResponse: async (response: string) => {
          LogStatus(`AudioSageAgent [${sessionId}]: Agent response: "${response}"`);
          await callbacks.onAgentResponse(response);
        }
      });

      // Store conversation
      this.activeConversations.set(sessionId, conversation);

      // Start WebSocket session with Eleven Labs
      await conversation.startSession();

      LogStatus(`AudioSageAgent: Session ${sessionId} started successfully`);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`AudioSageAgent: Failed to start session ${sessionId} - ${errorMessage}`);
      await callbacks.onError(error instanceof Error ? error : new Error(errorMessage));
      throw error;
    }
  }

  /**
   * Send audio chunk to active conversation.
   */
  async sendAudioChunk(sessionId: string, audioBuffer: Buffer): Promise<void> {
    const conversation = this.activeConversations.get(sessionId);
    if (!conversation) {
      throw new Error(`No active conversation for session: ${sessionId}`);
    }

    // Audio is sent through the custom AudioInterface
    const emitter = this.conversationEmitters.get(sessionId);
    if (emitter) {
      emitter.emit('audio-input', audioBuffer);
    }
  }

  /**
   * Send text message to conversation.
   */
  async sendText(sessionId: string, text: string): Promise<void> {
    const conversation = this.activeConversations.get(sessionId);
    if (!conversation) {
      throw new Error(`No active conversation for session: ${sessionId}`);
    }

    conversation.sendUserMessage(text);
  }

  /**
   * Interrupt agent's current response.
   */
  async interrupt(sessionId: string): Promise<void> {
    const conversation = this.activeConversations.get(sessionId);
    if (!conversation) {
      throw new Error(`No active conversation for session: ${sessionId}`);
    }

    // Send interrupt signal (implementation depends on Eleven Labs API)
    // conversation.interrupt(); // If supported
  }

  /**
   * End conversation session.
   */
  async endConversation(sessionId: string): Promise<void> {
    const conversation = this.activeConversations.get(sessionId);
    if (conversation) {
      conversation.endSession();
      this.activeConversations.delete(sessionId);
      this.conversationEmitters.delete(sessionId);
      LogStatus(`AudioSageAgent: Session ${sessionId} ended`);
    }
  }

  /**
   * Create custom audio interface for bidirectional streaming.
   */
  private createAudioInterface(sessionId: string, callbacks: ConversationCallbacks): any {
    const emitter = new EventEmitter();
    this.conversationEmitters.set(sessionId, emitter);

    return {
      // Input: Stream audio from user
      startRecording: () => {
        LogStatus(`AudioSageAgent [${sessionId}]: Start recording`);
      },
      stopRecording: () => {
        LogStatus(`AudioSageAgent [${sessionId}]: Stop recording`);
      },
      getAudioStream: () => {
        // Return a stream that emits audio chunks
        return emitter;
      },

      // Output: Stream audio to user
      playAudio: async (audioBuffer: Buffer) => {
        LogStatus(`AudioSageAgent [${sessionId}]: Streaming ${audioBuffer.length} bytes`);
        await callbacks.onAudioChunk(audioBuffer);
      },
      stopAudio: () => {
        LogStatus(`AudioSageAgent [${sessionId}]: Stop audio playback`);
      }
    };
  }

  /**
   * Get MJ Actions as Eleven Labs tool definitions.
   */
  private async getToolDefinitions(): Promise<any[]> {
    // Load actions configured for Audio Sage agent
    const agentConfig = await this.getAgentConfiguration();
    if (!agentConfig || !agentConfig.actions || agentConfig.actions.length === 0) {
      return [];
    }

    const tools = [];
    for (const actionId of agentConfig.actions) {
      const action = await this.loadAction(actionId);
      if (action) {
        tools.push({
          type: 'function',
          function: {
            name: action.Name,
            description: action.Description || `Execute ${action.Name} action`,
            parameters: {
              type: 'object',
              properties: await this.convertParamsToJsonSchema(action),
              required: await this.getRequiredParams(action)
            }
          }
        });
      }
    }

    return tools;
  }

  /**
   * Convert MJ Action parameters to JSON Schema.
   */
  private async convertParamsToJsonSchema(action: any): Promise<Record<string, unknown>> {
    const schema: Record<string, unknown> = {};

    // Load action params
    const params = await this.loadActionParams(action.ID);

    for (const param of params) {
      schema[param.Name] = {
        type: this.mapTypeToJsonSchema(param.Type),
        description: param.Description || param.Name
      };
    }

    return schema;
  }

  private mapTypeToJsonSchema(mjType: string): string {
    const typeMap: Record<string, string> = {
      'String': 'string',
      'Int': 'integer',
      'Float': 'number',
      'Boolean': 'boolean',
      'JSON': 'object',
      'Date': 'string'
    };
    return typeMap[mjType] || 'string';
  }

  /**
   * Execute tool call from Eleven Labs agent.
   */
  private async executeToolCall(
    sessionId: string,
    toolName: string,
    parameters: Record<string, unknown>,
    callbacks: ConversationCallbacks
  ): Promise<string> {
    try {
      LogStatus(`AudioSageAgent [${sessionId}]: Executing tool ${toolName}`);

      // Notify callback about tool call
      await callbacks.onToolCall(toolName, parameters);

      // Load action by name
      const action = await this.loadActionByName(toolName);
      if (!action) {
        throw new Error(`Action not found: ${toolName}`);
      }

      // Execute action using BaseAgent's action execution infrastructure
      const result = await this.executeAction(action, parameters);

      LogStatus(`AudioSageAgent [${sessionId}]: Tool ${toolName} completed`);

      // Return result to Eleven Labs agent
      return JSON.stringify(result);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogError(`AudioSageAgent [${sessionId}]: Tool execution failed - ${errorMessage}`);
      throw error;
    }
  }

  // Helper methods for loading actions/params
  private async loadAction(actionId: string): Promise<any> { /* ... */ }
  private async loadActionByName(actionName: string): Promise<any> { /* ... */ }
  private async loadActionParams(actionId: string): Promise<any[]> { /* ... */ }
  private async getRequiredParams(action: any): Promise<string[]> { /* ... */ }
  private async getAgentConfiguration(): Promise<any> { /* ... */ }
}
```

### 3.2 Configuration Management

**File**: `/metadata/agents/.audio-sage-agent.json` (UPDATE)

Add Eleven Labs configuration fields:

```json
{
  "fields": {
    "Name": "Audio Sage",
    "AIModelID": "@lookup:AI Models.Name=Claude Sonnet 3.5",
    "Status": "Active",
    "Visibility": "Internal",
    "Configuration": "@file:config/audio-sage-config.json"
  }
}
```

**File**: `/metadata/agents/config/audio-sage-config.json` (NEW)

```json
{
  "elevenLabs": {
    "agentId": "${ELEVENLABS_AGENT_ID}",
    "voiceId": "EXAVITQu4vr4xnSDxMaL",
    "modelId": "eleven_multilingual_v2"
  },
  "llmConfig": {
    "modelName": "claude-3-5-sonnet-20241022",
    "temperature": 0.7,
    "maxTokens": 2048
  },
  "actions": [
    "@lookup:Actions.Name=Search Data",
    "@lookup:Actions.Name=Get Entity Records",
    "@lookup:Actions.Name=Update Record"
  ]
}
```

### 3.3 Testing Phase 3

**Test Cases**:
1. ✅ Eleven Labs Conversation establishes WebSocket connection
2. ✅ Audio input from user reaches Eleven Labs
3. ✅ Transcription events received and stored
4. ✅ Agent response audio streams back to user
5. ✅ Tool calls triggered by agent's LLM
6. ✅ MJ Actions executed successfully during conversation
7. ✅ Tool results returned to Eleven Labs agent
8. ✅ Conversation continues after tool execution
9. ✅ Prompt override works correctly
10. ✅ Conversation cleanup on end

---

## Phase 4: Streaming Audio UI

**Duration**: 1-2 weeks
**Goal**: Implement real-time audio recording and playback in Angular

**Note**: The inline audio player pattern from Phase 1 PoC ([message-item.component.html](../packages/Angular/Generic/conversations/src/lib/components/message/message-item.component.html)) can be adapted for displaying completed streaming sessions.

### 4.1 Audio Streaming Component

**File**: `/packages/Angular/Generic/conversations/src/lib/components/message/voice/voice-streaming.component.ts` (NEW)

```typescript
import { Component, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { VoiceConversationService, VoiceStreamEvent } from '../../../services/voice-conversation.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'mj-voice-streaming',
  templateUrl: './voice-streaming.component.html',
  styleUrls: ['./voice-streaming.component.scss']
})
export class VoiceStreamingComponent implements OnDestroy {
  @Input() conversationDetailId!: string;
  @Output() sessionEnded = new EventEmitter<void>();

  isRecording = false;
  isAgentSpeaking = false;
  userTranscript = '';
  agentResponse = '';

  private destroy$ = new Subject<void>();
  private mediaRecorder?: MediaRecorder;
  private audioContext?: AudioContext;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;

  constructor(
    private voiceService: VoiceConversationService
  ) {}

  async startConversation(): Promise<void> {
    try {
      // Start session
      const events$ = this.voiceService.startSession(this.conversationDetailId);

      // Subscribe to events
      events$.pipe(takeUntil(this.destroy$)).subscribe(event => {
        this.handleStreamEvent(event);
      });

      // Start recording user audio
      await this.startAudioRecording();

    } catch (error) {
      console.error('Failed to start conversation:', error);
    }
  }

  private async startAudioRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000
      }
    });

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0) {
        // Convert to array buffer and send
        const arrayBuffer = await event.data.arrayBuffer();
        this.voiceService.sendAudio(arrayBuffer);
      }
    };

    // Stream in small chunks for low latency
    this.mediaRecorder.start(100); // 100ms chunks
    this.isRecording = true;
  }

  private handleStreamEvent(event: VoiceStreamEvent): void {
    switch (event.type) {
      case 'ready':
        console.log('Conversation ready:', event.data.sessionId);
        break;

      case 'transcript':
        this.userTranscript = event.data.text;
        break;

      case 'agent_response':
        this.agentResponse = event.data.text;
        break;

      case 'audio_chunk':
        this.queueAudioChunk(event.data.audioBase64);
        break;

      case 'tool_call':
        console.log('Agent calling tool:', event.data.toolName);
        break;

      case 'error':
        console.error('Conversation error:', event.data.message);
        break;

      case 'complete':
        this.endConversation();
        break;
    }
  }

  private async queueAudioChunk(base64Audio: string): Promise<void> {
    try {
      // Initialize audio context if needed
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // Decode base64 to audio buffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);

      // Add to queue
      this.audioQueue.push(audioBuffer);

      // Start playback if not already playing
      if (!this.isPlaying) {
        this.playNextChunk();
      }

    } catch (error) {
      console.error('Failed to decode audio chunk:', error);
    }
  }

  private playNextChunk(): void {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      this.isAgentSpeaking = false;
      return;
    }

    this.isPlaying = true;
    this.isAgentSpeaking = true;

    const audioBuffer = this.audioQueue.shift()!;
    const source = this.audioContext!.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext!.destination);

    source.onended = () => {
      // Play next chunk
      this.playNextChunk();
    };

    source.start();
  }

  interrupt(): void {
    // Stop current audio playback
    if (this.audioContext) {
      this.audioContext.suspend();
      this.audioQueue = [];
      this.isPlaying = false;
      this.isAgentSpeaking = false;
    }

    // Signal interrupt to server
    this.voiceService.interrupt();
  }

  endConversation(): void {
    // Stop recording
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    // Stop playback
    if (this.audioContext) {
      this.audioContext.close();
    }

    // Close WebSocket
    this.voiceService.endSession();

    this.isRecording = false;
    this.sessionEnded.emit();
  }

  ngOnDestroy(): void {
    this.endConversation();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

**File**: `/packages/Angular/Generic/conversations/src/lib/components/message/voice/voice-streaming.component.html` (NEW)

```html
<div class="voice-streaming-container">
  <!-- Waveform visualization -->
  <div class="waveform-display">
    <canvas #waveformCanvas></canvas>
  </div>

  <!-- Transcript display -->
  <div class="transcript-container">
    <div class="user-transcript" *ngIf="userTranscript">
      <i class="fas fa-user"></i>
      <span>{{ userTranscript }}</span>
    </div>
    <div class="agent-response" *ngIf="agentResponse">
      <i class="fas fa-robot"></i>
      <span>{{ agentResponse }}</span>
    </div>
  </div>

  <!-- Controls -->
  <div class="controls">
    <button
      class="btn-interrupt"
      *ngIf="isAgentSpeaking"
      (click)="interrupt()">
      <i class="fas fa-hand"></i>
      Interrupt
    </button>

    <button
      class="btn-end"
      (click)="endConversation()">
      <i class="fas fa-stop-circle"></i>
      End Conversation
    </button>
  </div>

  <!-- Status indicators -->
  <div class="status-indicators">
    <div class="indicator" [class.active]="isRecording">
      <i class="fas fa-microphone"></i>
      Recording
    </div>
    <div class="indicator" [class.active]="isAgentSpeaking">
      <i class="fas fa-volume-up"></i>
      Agent Speaking
    </div>
  </div>
</div>
```

### 4.2 Update Message Input Component

**File**: `/packages/Angular/Generic/conversations/src/lib/components/message/message-input.component.ts` (UPDATE)

Add method to start streaming conversation:

```typescript
async onStartStreamingConversation(): Promise<void> {
  if (this.emptyStateMode || !this.conversationId) {
    this.toastService.info('Please start a conversation first');
    return;
  }

  // Create conversation detail for streaming session
  const userDetail = await this.dataCache.createConversationDetail(this.currentUser);
  userDetail.ConversationID = this.conversationId;
  userDetail.Message = '[Real-time voice conversation]';
  userDetail.Role = 'User';

  const saved = await userDetail.Save();
  if (!saved) {
    this.toastService.error('Failed to create conversation detail');
    return;
  }

  // Open streaming modal
  this.showStreamingModal(userDetail.ID);
}

private showStreamingModal(conversationDetailId: string): void {
  // Open modal with voice-streaming component
  // Modal handles the entire streaming session
}
```

### 4.3 Testing Phase 4

**Test Cases**:
1. ✅ Audio recording starts and streams to server
2. ✅ Audio chunks received and queued for playback
3. ✅ Streaming playback works smoothly
4. ✅ User transcript displays in real-time
5. ✅ Agent response displays in real-time
6. ✅ Interrupt button stops agent mid-response
7. ✅ Waveform visualization shows audio levels
8. ✅ Session cleanup releases microphone
9. ✅ UI handles network disconnections gracefully

---

## Phase 5: Production Readiness

**Duration**: 1-2 weeks
**Goal**: Polish, testing, monitoring, and deployment

### 5.1 Error Handling & Recovery

**Features**:
- Automatic reconnection on WebSocket disconnect
- Graceful degradation when network is poor
- Session state recovery after disconnect
- User-friendly error messages

**File**: `/packages/MJServer/src/websocket/VoiceConversationHandler.ts` (UPDATE)

Add reconnection logic:
```typescript
private handleReconnection(session: ConversationSession, newWs: WebSocket): void {
  // Restore session state from memory
  // Resume Eleven Labs conversation if possible
  // Note: No event replay - sessions are ephemeral
}
```

### 5.2 Monitoring & Observability

**Metrics to Track**:
- Active session count
- Average session duration
- Audio chunk latency (recording → playback)
- Tool call success rate
- Error rates by type
- User interruption frequency

**File**: `/packages/MJServer/src/monitoring/ConversationMetrics.ts` (NEW)

```typescript
export class ConversationMetrics {
  recordSessionStart(sessionId: string): void;
  recordSessionEnd(sessionId: string, duration: number): void;
  recordAudioLatency(latencyMs: number): void;
  recordToolCall(toolName: string, success: boolean, duration: number): void;
  recordError(errorType: string): void;
}
```

### 5.3 Configuration & Feature Flags

**Environment Variables**:
```bash
# Eleven Labs Configuration
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_AGENT_ID=agent_...

# IMPORTANT: Zero Retention Mode (enableLogging: false) requires enterprise/trial tier
# For standard accounts, omit this parameter or set to true
ELEVENLABS_ENABLE_LOGGING=true

# Feature Flags
AUDIO_SAGE_REALTIME_ENABLED=true
AUDIO_SAGE_MAX_CONCURRENT_SESSIONS=50
AUDIO_SAGE_SESSION_TIMEOUT_MINUTES=30

# Audio Configuration
AUDIO_CHUNK_SIZE_MS=100
AUDIO_SAMPLE_RATE=16000
AUDIO_ENABLE_ECHO_CANCELLATION=true
```

### 5.4 Documentation

**Create User Guide**:
- How to start a voice conversation
- How to interrupt the agent
- Available voice commands
- Privacy and data retention policies

**Create Developer Guide**:
- Architecture overview
- Adding new tools/actions for voice agent
- Debugging voice conversations
- Performance tuning guidelines

### 5.5 Load Testing

**Test Scenarios**:
1. Single user, long conversation (30+ minutes)
2. 10 concurrent users
3. 50 concurrent users (max capacity)
4. Network disruption and recovery
5. Rapid connect/disconnect cycles

**Tools**:
- k6 or Artillery for WebSocket load testing
- Custom test script simulating audio streaming

### 5.6 Security Audit

**Review**:
- [ ] Audio data encryption in transit (WSS)
- [ ] Audio data retention policies
- [ ] User authentication for WebSocket connections
- [ ] Rate limiting on WebSocket connections
- [ ] Input validation on tool parameters
- [ ] XSS protection in transcript display
- [ ] CORS configuration for WebSocket

### 5.7 Deployment Checklist

**Pre-Deployment**:
- [ ] All tests passing (unit, integration, E2E)
- [ ] Load testing completed
- [ ] Security audit completed
- [ ] Documentation updated
- [ ] Feature flag configured for gradual rollout
- [ ] Monitoring dashboards created
- [ ] Rollback plan documented

**Deployment Steps**:
1. Deploy backend with feature flag OFF
2. Verify backend health
3. Deploy frontend
4. Enable feature flag for internal users
5. Monitor metrics for 24 hours
6. Gradual rollout to all users (10%, 25%, 50%, 100%)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Eleven Labs API changes breaking integration | Medium | High | Version pin SDK, monitor changelogs, have fallback to STT+TTS |
| WebSocket connection instability | Medium | High | Implement reconnection logic, session state recovery |
| High latency degrading UX | Medium | Medium | Audio buffering, network quality detection, graceful degradation |
| Tool execution errors during conversation | High | Medium | Robust error handling, return errors to agent context |
| Concurrent session limits | Low | Medium | Implement queue system, clear session timeout policies |
| Audio processing browser compatibility | Low | Medium | Feature detection, fallback UI, browser requirements documentation |

---

## Success Metrics

### Phase 2 Success Criteria
- [x] WebSocket infrastructure implemented (handler + service)
- [x] Backend VoiceConversationHandler created with in-memory session management
- [x] Frontend VoiceConversationService created with RxJS observables
- [ ] WebSocket connections stable for >5 minutes (testing pending)
- [ ] <100ms latency for message round-trip (testing pending)
- [ ] 0 memory leaks with 10 concurrent sessions (testing pending)

### Phase 3 Success Criteria
- [x] AudioSageAgent refactored with real-time conversation methods
- [x] ConversationCallbacks interface implemented
- [x] Custom AudioInterface for bidirectional streaming
- [x] Tool definition conversion infrastructure (placeholders for Phase 5)
- [x] Hardcoded Eleven Labs configuration (AGENT_ID, VOICE_ID, LLM_MODEL)
- [ ] Eleven Labs conversation connects successfully (testing pending - requires agent creation)
- [ ] Audio transcription accuracy >90% (testing pending)
- [ ] Tool calls execute within 2 seconds (implementation in Phase 5)
- [ ] Session cleanup: 0 orphaned conversations (testing pending)

### Phase 4 Success Criteria
- [x] VoiceStreamingComponent created with MediaRecorder and Web Audio API
- [x] Real-time audio recording with 100ms chunks
- [x] Audio playback queue for smooth streaming
- [x] Interrupt functionality implemented
- [x] Status indicators (recording, speaking) working
- [x] Message input integration with streaming button
- [x] Modal/dialog integration prepared (Kendo DialogService)
- [ ] Audio playback starts within 500ms of first chunk (testing pending)
- [ ] Smooth playback with <5% stuttering (testing pending)
- [ ] Interrupt latency <200ms (testing pending)
- [ ] UI responsive throughout session (testing pending)

### Phase 5 Success Criteria
- [ ] 99.5% uptime for production
- [ ] <2% error rate across all sessions
- [ ] 50 concurrent sessions supported
- [ ] Average session quality rating >4/5

---

## Dependencies

### External Services
- **Eleven Labs API**: Conversational AI, STT, TTS
  - Account setup required (standard tier sufficient for real-time conversations)
  - Agent configuration in Eleven Labs dashboard
  - API key with sufficient quota
  - **Note**: Zero Retention Mode (ZRM) requires enterprise/trial tier - not needed for this implementation

### Internal Systems
- **MemberJunction Core**: Entity system, metadata, actions
- **MJServer**: GraphQL, authentication, WebSocket support
- **Database**: SQL Server with conversation schema
- **Angular UI**: Conversations module, audio services

### Development Tools
- **TypeScript**: 5.0+
- **Node.js**: 18+
- **WebSocket libraries**: `ws` (backend), native WebSocket (frontend)
- **Eleven Labs SDK**: `@elevenlabs/elevenlabs-js` v2.32.0+

---

## Timeline Summary

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 (Complete) | - | STT+TTS PoC working |
| Phase 2 | 1-2 weeks | WebSocket infrastructure |
| Phase 3 | 2-3 weeks | Eleven Labs integration |
| Phase 4 | 1-2 weeks | Streaming audio UI |
| Phase 5 | 1-2 weeks | Production readiness |
| **Total** | **5-9 weeks** | Production deployment |

---

## Open Questions

1. **Eleven Labs Agent Configuration**: Do we create the agent in their dashboard with tools pre-configured, or configure everything via API?

2. **Audio Format**: What audio format should we standardize on for the entire pipeline? (WebM Opus, MP3, WAV?)

3. **Session Timeout**: How long should we keep inactive in-memory sessions alive before automatic cleanup?

4. **Concurrent Limits**: What's the maximum concurrent sessions we need to support?

5. **Mobile Support**: Is mobile browser support required, or desktop-only initially?

6. **Conversation History**: Should the agent have access to prior conversation messages, or only the current session?

7. **Multi-Agent**: Will users want to switch between different AI agents during a conversation?

---

## Next Steps

1. **Review this plan** with stakeholders and technical team
2. **Create Eleven Labs account** and configure conversational AI agent
3. **Set up development environment** with WebSocket support
4. **Begin Phase 2 implementation** with WebSocket infrastructure

---

## Appendix A: Configuration Reference

### ELEVEN_LABS_CONFIG (Current)
```typescript
const ELEVEN_LABS_CONFIG = {
  AGENT_ID: 'agent_xxx', // Set after creating agent in Eleven Labs
  VOICE_ID: 'EXAVITQu4vr4xnSDxMaL', // Bella voice
  LLM_MODEL: 'claude-3-5-sonnet-20241022'
};
```

### Future: Database-Driven Configuration
```typescript
// Load from AIAgent.Configuration field
const config = await this.loadAgentConfiguration('Audio Sage');
const elevenLabsConfig = config.elevenLabs;
```

---

## Appendix B: Eleven Labs SDK Resources

- **SDK Documentation**: https://elevenlabs.io/docs/api-reference
- **Conversational AI Guide**: https://elevenlabs.io/docs/conversational-ai
- **WebSocket Protocol**: Check SDK source for `Conversation` class
- **Tool Calling Format**: Compatible with OpenAI function calling format

---

## Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-XX | - | Initial plan created |
| 1.1 | 2026-01-25 | Claude Sonnet 4.5 | Added Phase 1 PoC learnings section with key findings: audio cache pattern, inline player UI, Zero Retention Mode requirements, and architecture limitation confirmation |

---

**End of Implementation Plan**
