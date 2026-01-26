# Audio Sage PoC - Complete Implementation Guide

**Date:** 2026-01-25
**Purpose:** Unified guide for orchestrator and sub-agents implementing Audio Sage voice interface in MJExplorer
**Status:** Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Architecture Decision](#critical-architecture-decision)
3. [Eleven Labs Research Findings](#eleven-labs-research-findings)
4. [MemberJunction Metadata Architecture](#memberjunction-metadata-architecture)
5. [Implementation Components](#implementation-components)
6. [Orchestration Plan](#orchestration-plan)
7. [Success Criteria](#success-criteria)
8. [Configuration & Environment](#configuration--environment)

---

## Executive Summary

### Goal
Add voice input/output to MJExplorer chat, allowing users to speak to Sage agent and receive audio responses using Eleven Labs Conversational AI.

### Key Technical Decisions
1. **No new database tables** - Use existing `Conversation`, `ConversationDetail`, `AIModality`, `AIAgentModality`
2. **Metadata-driven agent** - Define Audio Sage in `/metadata/agents/`, not migrations
3. **Custom driver class** - New package `packages/AI/Agents/AudioSage/` with `AudioSageAgent` extending `BaseAgent`
4. **PoC-first approach** - Prioritize working prototype over perfect framework integration, hardcode Eleven Labs config initially
5. **Tool call adaptation** - Convert Eleven Labs tool calls to MJ's `AgentAction` format, use `BaseAgent`'s action execution methods
6. **Angular voice UI** - Web Audio API for recording, playback in MJExplorer chat

### What We're Building
```
User clicks 🎤 in chat
    ↓
Records audio (Web Audio API)
    ↓
Send to MJAPI GraphQL (base64)
    ↓
AudioSageAgent.Execute() invoked
    ↓
Overrides executeAgentInternal() to:
  - Send audio to Eleven Labs
  - Receive audio + text + tool calls
  - Adapt tool calls to MJ AgentAction format
  - Execute actions via BaseAgent methods
    ↓
Returns audio + text response
    ↓
Plays audio in browser
    ↓
Shows text in chat
```

---

## Architecture Approach

### Custom Driver Class Strategy (PoC-First Approach)

This is a **PoC implementation that prioritizes working code over perfect framework integration**. We're hacking together a working prototype by:
- Using metadata where it makes sense (agent definition, prompt templates)
- Bypassing framework components that don't fit (AIPromptRunner)
- Implementing custom logic directly in the driver class

**What We Keep from Framework:**
- Metadata-defined agent (`AIAgent`, `AIAgentModality`, `AIPrompt`)
- Agent runs and steps (`AIAgentRun`, `AIAgentRunStep`) for tracking
- Conversation tracking (`Conversation`, `ConversationDetail`)
- Action execution infrastructure (`BaseAgent.validateActionsNextStep()`)

**What We Bypass/Override:**
- **Skip AIPromptRunner** - doesn't support audio, use TemplateEngineServer directly
- **Custom executeAgentInternal()** - direct Eleven Labs SDK calls instead of LLM abstraction
- **Manual prompt rendering** - use Template Engine directly, skip prompt run tracking
- **Tool call adapter** - convert Eleven Labs format to MJ actions, then use BaseAgent methods

### Package Structure

**New Package:** `packages/AI/Agents/AudioSage/`

```
packages/AI/Agents/AudioSage/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── audio-sage-agent.ts          // Custom driver extending BaseAgent
│   ├── eleven-labs-adapter.ts       // Tool call format conversion
│   └── audio-sage-service.ts        // Singleton orchestration service
```

This keeps Audio Sage code isolated while allowing reuse of framework infrastructure.

---

## Eleven Labs Research Findings

### Real-Time Audio Capabilities ✅

**WebSocket Endpoint:**
```
wss://api.elevenlabs.io/v1/convai/conversation?agent_id={agent_id}
```

**Supported:**
- Bidirectional audio streaming (WebSocket + WebRTC)
- Dynamic prompt injection via "Overrides" feature
- Agent CRUD operations via SDK
- Function calling via Tools (webhooks)
- Multiple LLM options (Claude Sonnet, GPT-4o, Gemini)

### Dynamic Prompts - The Key Feature

**Overrides allow runtime prompt injection:**

```typescript
await client.conversationalAi.conversations.start({
    agent_id: 'agent_xxx',
    overrides: {
        prompt: {
            prompt: renderSagePrompt(availableAgents, availableActions),
            llm: "claude-3-5-sonnet-20241022"
        }
    }
});
```

**This means MJAPI can:**
1. Query available agents and actions from database
2. Render Sage prompt template with current context
3. Inject the full prompt at conversation start
4. Agent "knows" about all available MJ capabilities dynamically

### Agent Creation Example

```typescript
const client = new ElevenLabsClient({ apiKey });

const agent = await client.conversationalAi.agents.create({
    conversationConfig: {
        agent: {
            prompt: {
                prompt: "{{system_prompt}}", // Placeholder
                llm: "claude-3-5-sonnet-20241022"
            },
            firstMessage: "I'm listening. How can I help?",
            language: "en"
        },
        voice: {
            voiceId: "EXAVITQu4vr4xnSDxMaL" // Bella voice
        },
        tools: [
            {
                name: "execute_mj_action",
                description: "Execute a MemberJunction action",
                parameters: { /* ... */ },
                webhookUrl: "https://mjapi.com/elevenlabs/execute-action"
            }
        ]
    }
});
```

---

## MemberJunction Metadata Architecture

### Existing Modality System

**Audio Modality Already Exists:**
```sql
SELECT Name, Description FROM __mj.AIModality WHERE Name = 'Audio'
-- Result: "Audio files (MP3, WAV, M4A) for speech-to-text, audio understanding, and text-to-speech"
```

**Sage Agent Current Modalities:**
- Text (Input + Output)
- Image (Input + Output)

**What We Need to Add:**
- Audio (Input + Output)

### Option 1: Extend Existing Sage Agent (Recommended)

**File:** `/metadata/agents/.sage-agent.json`

Add to `relatedEntities["MJ: AI Agent Modalities"]`:

```json
{
  "fields": {
    "AgentID": "@parent:ID",
    "ModalityID": "@lookup:MJ: AI Modalities.Name=Audio",
    "Direction": "Input",
    "IsAllowed": true
  }
},
{
  "fields": {
    "AgentID": "@parent:ID",
    "ModalityID": "@lookup:MJ: AI Modalities.Name=Audio",
    "Direction": "Output",
    "IsAllowed": true
  }
}
```

**Pros:**
- Single Sage agent across all modalities
- User continuity
- Minimal changes

**Cons:**
- Mixed providers (Anthropic for text, Eleven Labs for audio)

### Option 2: Create Separate Audio Sage Agent ✅ USING THIS

**File:** `/metadata/agents/.audio-sage-agent.json`

```json
[
  {
    "fields": {
      "Name": "Audio Sage",
      "Description": "Audio-enabled Sage using Eleven Labs for voice interaction",
      "TypeID": "@lookup:MJ: AI Agent Types.Name=Loop",
      "DriverClass": "AudioSageAgent",
      "Status": "Active",
      "IconClass": "fa-microphone"
    },
    "relatedEntities": {
      "MJ: AI Agent Modalities": [
        {
          "fields": {
            "AgentID": "@parent:ID",
            "ModalityID": "@lookup:MJ: AI Modalities.Name=Audio",
            "Direction": "Input",
            "IsAllowed": true
          }
        },
        {
          "fields": {
            "AgentID": "@parent:ID",
            "ModalityID": "@lookup:MJ: AI Modalities.Name=Audio",
            "Direction": "Output",
            "IsAllowed": true
          }
        }
      ],
      "MJ: AI Agent Prompts": [
        {
          "fields": {
            "AgentID": "@parent:ID",
            "PromptID": "@lookup:AI Prompts.Name=Audio Sage System Prompt",
            "ExecutionOrder": 0,
            "Status": "Active"
          }
        }
      ]
    }
  }
]
```

**Key Changes:**
- **`DriverClass: "AudioSageAgent"`** - Tells framework to use our custom driver class
- **No `AgentTypePromptParams`** - Eleven Labs config hardcoded in driver for PoC
- Loop agent type ensures sub-agents/actions are rendered in prompts via Template Engine

**Pros:**
- Clean separation from text Sage
- Audio-optimized prompts (shorter for voice)
- Custom driver class allows audio-specific logic
- Still leverages framework infrastructure

**Cons:**
- Two separate agents (acceptable for PoC)

### Audio-Optimized Sage Prompt

**File:** `/metadata/prompts/templates/audio-sage/audio-sage.template.md`

```handlebars
# Sage - Audio Mode

## Role
You are Sage, the AI assistant within MemberJunction, participating in a live voice conversation.

## Current Context
- User: {{userName}}
- Available Agents: {{availableAgents.length}}
- Available Actions: {{availableActions.length}}

## Available Agents
{{#each availableAgents}}
- **{{this.Name}}**: {{this.Description}}
{{/each}}

## Available Actions
{{#each availableActions}}
- **{{this.Name}}** ({{this.Category}}): {{this.Description}}
{{/each}}

## Your Capabilities
1. Answer questions about MemberJunction
2. Execute actions using execute_mj_action tool
3. Delegate to specialist agents using create_task_graph tool
4. Find candidate agents using find_candidate_agents tool

## Audio-Specific Instructions
- **Keep responses concise** (1-3 sentences) - users are listening, not reading
- Ask clarifying questions when needed
- Confirm actions before executing
- Provide brief status updates for long operations

## Response Style
- Conversational and natural (speaking, not writing)
- Brief and to the point
- Friendly but professional
- Ask follow-up questions to gather details
```

---

## Implementation Components

### Component 1: AudioSage Package Setup

**Task:** Create new package with custom driver class

**Location:** `packages/AI/Agents/AudioSage/`

**Create package.json:**
```json
{
  "name": "@memberjunction/audio-sage-agent",
  "version": "2.7.0",
  "description": "Audio Sage agent with Eleven Labs integration",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch"
  },
  "dependencies": {
    "@memberjunction/ai-agents": "^2.7.0",
    "@memberjunction/core": "^2.7.0",
    "@memberjunction/core-entities": "^2.7.0",
    "@elevenlabs/elevenlabs-js": "^0.16.0"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  }
}
```

**Create tsconfig.json:**
```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Process:**
```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ
mkdir -p packages/AI/Agents/AudioSage/src

# Create package files
# Run npm install at repo root
npm install
```

**Deliverable:** Package scaffolding ready for implementation

---

### Component 2: Eleven Labs Tool Call Adapter

**Location:** `packages/AI/Agents/AudioSage/src/eleven-labs-adapter.ts`

**Purpose:** Convert Eleven Labs tool call format to MJ's `AgentAction` format

**Implementation:**

```typescript
import { BaseAgentNextStepAction } from '@memberjunction/ai-agents';
import { LogError } from '@memberjunction/core';

export interface ElevenLabsToolCall {
  toolCallId: string;
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface ElevenLabsConversationResponse {
  transcript: string;  // Text transcript from user
  audio: string;       // Base64 audio response
  conversationId: string;
  toolCalls?: ElevenLabsToolCall[];
}

/**
 * Converts Eleven Labs tool call format to MJ AgentAction format
 * that BaseAgent.validateActionsNextStep() can process
 */
export class ElevenLabsAdapter {
  /**
   * Convert Eleven Labs tool calls to MJ action format
   */
  static ConvertToolCallsToActions(
    toolCalls: ElevenLabsToolCall[]
  ): BaseAgentNextStepAction[] {
    return toolCalls.map(tc => {
      try {
        // Eleven Labs tool names should match MJ action names
        // e.g., "execute_mj_action" with { actionName: "Get Web Page Content", params: {...} }

        if (tc.toolName === 'execute_mj_action') {
          return {
            ActionName: tc.parameters.actionName as string,
            Parameters: tc.parameters.params as Record<string, unknown>
          };
        }

        // If tool name directly matches an action name, use it
        return {
          ActionName: tc.toolName,
          Parameters: tc.parameters
        };
      } catch (error: unknown) {
        LogError(`Failed to convert tool call: ${tc.toolName}`, error);
        throw error;
      }
    });
  }

  /**
   * Extract audio buffer from Eleven Labs response
   */
  static ExtractAudioBuffer(response: ElevenLabsConversationResponse): Buffer {
    return Buffer.from(response.audio, 'base64');
  }
}

```

**Deliverable:** Adapter converts Eleven Labs tool calls to MJ action format

---

### Component 3: AudioSageAgent Custom Driver Class

**Location:** `packages/AI/Agents/AudioSage/src/audio-sage-agent.ts`

**Purpose:** Custom agent extending BaseAgent with Eleven Labs integration

**Implementation:**

```typescript
import { BaseAgent, ExecuteAgentParams, BaseAgentNextStep, AgentConfiguration } from '@memberjunction/ai-agents';
import { RegisterClass, LogError, LogStatus } from '@memberjunction/core';
import { AIAgentRunEntityExtended } from '@memberjunction/core-entities';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { TemplateEngineServer } from '@memberjunction/templates';
import { AIEngine } from '@memberjunction/aiengine';
import { ElevenLabsAdapter, ElevenLabsConversationResponse } from './eleven-labs-adapter';

// PoC: Hardcoded configuration - move to database later
const ELEVEN_LABS_CONFIG = {
  AGENT_ID: 'agent_xxx', // Set after creating agent in Eleven Labs
  VOICE_ID: 'EXAVITQu4vr4xnSDxMaL', // Bella voice
  LLM_MODEL: 'claude-3-5-sonnet-20241022'
};

export interface AudioExecuteParams extends ExecuteAgentParams {
  audioBuffer: Buffer;
  mimeType: string;
}

/**
 * Custom agent driver for Audio Sage PoC
 *
 * ARCHITECTURE:
 * - Extends BaseAgent to reuse action execution infrastructure
 * - Overrides executeAgentInternal() to bypass AIPromptRunner (doesn't support audio)
 * - Uses TemplateEngineServer directly to render prompts
 * - Calls Eleven Labs SDK directly for audio I/O
 * - Adapts Eleven Labs tool calls to MJ actions, then delegates to BaseAgent
 *
 * WHY THIS APPROACH:
 * - AIPromptRunner expects BaseLLM interface (text in/out)
 * - Eleven Labs uses audio in/out via WebSocket/REST
 * - For PoC, we bypass the abstraction layer and call Eleven Labs directly
 * - Later, we can create BaseAudioLLM abstraction if needed
 */
@RegisterClass(BaseAgent, 'AudioSageAgent')
export class AudioSageAgent extends BaseAgent {
  private elevenLabsClient: ElevenLabsClient;
  private templateEngine: TemplateEngineServer;

  constructor() {
    super();

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY environment variable required');
    }

    this.elevenLabsClient = new ElevenLabsClient({ apiKey });
    this.templateEngine = TemplateEngineServer.Instance;
  }

  /**
   * Override executeAgentInternal to handle audio I/O via Eleven Labs.
   *
   * FLOW:
   * 1. Create step for prompt rendering
   * 2. Render prompt template with MJ context (available agents/actions)
   * 3. Create step for Eleven Labs API call
   * 4. Send audio + rendered prompt to Eleven Labs
   * 5. Receive audio + text transcript + tool calls
   * 6. Convert tool calls to MJ actions
   * 7. Execute actions via BaseAgent.validateActionsNextStep()
   * 8. Return result with audio response attached
   */
  protected async executeAgentInternal<P = any>(
    params: AudioExecuteParams,
    config: AgentConfiguration
  ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
    LogStatus('AudioSageAgent: Starting audio execution');

    let stepCount = 0;

    // 1. Create step for prompt rendering
    const promptRenderStep = await this.createStepEntity({
      stepType: 'Prompt',
      stepName: 'Render Audio Sage Prompt',
      contextUser: params.contextUser,
      inputData: { audioSize: params.audioBuffer.length, mimeType: params.mimeType }
    });
    stepCount++;

    try {
      // 2. Render the prompt template with MJ context
      // NOTE: We use Template Engine directly, not AIPromptRunner
      // This gives us the rendered system prompt with agents/actions injected
      const renderedPrompt = await this.renderPromptForAudio(params, config);

      // Finalize prompt render step as successful
      await this.finalizeStepEntity(promptRenderStep, true, undefined, {
        promptLength: renderedPrompt.length
      });

      // 3. Create step for Eleven Labs API call
      const elevenLabsStep = await this.createStepEntity({
        stepType: 'Actions',
        stepName: 'Send Audio to Eleven Labs',
        contextUser: params.contextUser,
        inputData: { conversationId: params.conversationID }
      });
      stepCount++;

      // 4. Send audio to Eleven Labs with prompt override
      const elevenLabsResponse = await this.sendToElevenLabs(
        params.audioBuffer,
        renderedPrompt,
        params.conversationID || undefined
      );

      // Finalize Eleven Labs step as successful
      await this.finalizeStepEntity(elevenLabsStep, true, undefined, {
        transcript: elevenLabsResponse.transcript,
        toolCallCount: elevenLabsResponse.toolCalls?.length || 0
      });

      // 5. Extract text transcript from Eleven Labs response
      const userMessage = elevenLabsResponse.transcript;
      LogStatus(`AudioSageAgent: Received transcript: "${userMessage}"`);

      // 6. Create next step with actions if tool calls present
      const nextStep: BaseAgentNextStep<P> = {
        step: 'Success', // Default to success
        terminate: true,
        message: elevenLabsResponse.transcript,
        previousPayload: params.Payload as P,
        newPayload: params.Payload as P
      };

      // 7. Convert Eleven Labs tool calls to MJ actions
      if (elevenLabsResponse.toolCalls && elevenLabsResponse.toolCalls.length > 0) {
        LogStatus(`AudioSageAgent: Processing ${elevenLabsResponse.toolCalls.length} tool calls`);

        const actions = ElevenLabsAdapter.ConvertToolCallsToActions(elevenLabsResponse.toolCalls);
        nextStep.step = 'Actions';
        nextStep.actions = actions;
        nextStep.terminate = false; // Actions need to be executed

        // 8. Use BaseAgent's validateActionsNextStep to execute actions
        // This leverages the framework's action execution, validation, and tracking
        const validatedStep = await this.validateActionsNextStep<P>(
          params,
          nextStep,
          params.Payload as P,
          stepCount
        );

        // Store audio response for GraphQL resolver to return
        (validatedStep as any).audioResponse = ElevenLabsAdapter.ExtractAudioBuffer(elevenLabsResponse);

        return { finalStep: validatedStep, stepCount: stepCount + 1 };
      }

      // No actions - just return the response
      (nextStep as any).audioResponse = ElevenLabsAdapter.ExtractAudioBuffer(elevenLabsResponse);
      return { finalStep: nextStep, stepCount };

    } catch (error: unknown) {
      // Finalize current step as failed
      const currentStep = elevenLabsStep || promptRenderStep;
      await this.finalizeStepEntity(currentStep, false, (error as Error).message);

      throw error;
    }
  }

  /**
   * Render the agent's prompt template with MJ context.
   * Uses TemplateEngineServer directly (not AIPromptRunner).
   *
   * Uses AIEngine for template lookup (cached, no DB hit).
   */
  private async renderPromptForAudio(
    params: ExecuteAgentParams,
    config: AgentConfiguration
  ): Promise<string> {
    try {
      // Initialize template engine
      await this.templateEngine.Config(false, params.contextUser);

      // Get the agent's first active prompt
      const agentPrompt = config.childPrompt;
      if (!agentPrompt || !agentPrompt.TemplateID) {
        throw new Error('Audio Sage agent has no prompt template configured');
      }

      // Use AIEngine to find template (cached, no DB hit)
      await AIEngine.Instance.Config(false, params.contextUser);
      const template = AIEngine.Instance.Templates.find(t => t.ID === agentPrompt.TemplateID);

      if (!template) {
        throw new Error(`Template ${agentPrompt.TemplateID} not found`);
      }

      // Gather MJ context (available agents and actions)
      // This uses BaseAgent's method which queries AIEngine
      const templateData = await this.gatherPromptTemplateData(
        params.agent,
        params.contextUser,
        params.data
      );

      // Render the template
      const renderResult = await this.templateEngine.RenderTemplate(
        template,
        template.GetHighestPriorityContent()!,
        templateData
      );

      if (!renderResult.Success) {
        throw new Error(`Failed to render template: ${renderResult.Message}`);
      }

      LogStatus(`AudioSageAgent: Rendered prompt template (${renderResult.Output.length} chars)`);
      return renderResult.Output;

    } catch (error: unknown) {
      LogError('AudioSageAgent: Failed to render prompt', error);
      throw error;
    }
  }

  /**
   * Send audio to Eleven Labs Conversational AI with prompt override.
   */
  private async sendToElevenLabs(
    audioBuffer: Buffer,
    systemPrompt: string,
    conversationId?: string
  ): Promise<ElevenLabsConversationResponse> {
    try {
      const audioBase64 = audioBuffer.toString('base64');

      // Call Eleven Labs Conversational API with prompt override
      // This injects our dynamically rendered MJ context into the conversation
      const response: any = await this.elevenLabsClient.conversationalAi.conversations.sendMessage({
        agentId: ELEVEN_LABS_CONFIG.AGENT_ID,
        audio: audioBase64,
        conversationId: conversationId,
        // Override the agent's prompt with our dynamically rendered one
        overrides: {
          prompt: {
            prompt: systemPrompt
          }
        }
      });

      return {
        transcript: response.transcript || '',
        audio: response.audio || '',
        conversationId: response.conversationId || conversationId || '',
        toolCalls: response.toolCalls || []
      };
    } catch (error: unknown) {
      LogError('AudioSageAgent: Eleven Labs API call failed', error);
      throw error;
    }
  }
}
```

**Key Implementation Notes:**

1. **Uses BaseAgent's `createStepEntity()` method** - Proper step tracking with hierarchy ([base-agent.ts:4391-4431](packages/AI/Agents/src/base-agent.ts#L4391-L4431))
2. **Uses AIEngine for all lookups** - Templates cached, no database hits
3. **Leverages `gatherPromptTemplateData()`** - BaseAgent method that gathers available agents/actions
4. **Proper error handling** - Finalizes steps as failed before throwing
5. **Step count tracking** - Required for BaseAgent's validateActionsNextStep

**Deliverable:** Custom driver class that extends BaseAgent, overrides audio I/O, and uses framework's action execution

---

### Component 4: Metadata Setup

**Task:** Create Audio Sage agent metadata

**Files to Create:**

**1. `/metadata/agents/.audio-sage-agent.json`**

```json
[{
  "fields": {
    "Name": "Audio Sage",
    "Description": "Audio-enabled Sage using Eleven Labs for voice interaction",
    "TypeID": "@lookup:MJ: AI Agent Types.Name=Loop",
    "DriverClass": "AudioSageAgent",
    "Status": "Active",
    "IconClass": "fa-microphone",
    "ModelSelectionMode": "Agent",
    "ArtifactCreationMode": "None",
    "ExecutionOrder": 0,
    "ExposeAsAction": false
  },
  "relatedEntities": {
    "MJ: AI Agent Modalities": [
      {
        "fields": {
          "AgentID": "@parent:ID",
          "ModalityID": "@lookup:MJ: AI Modalities.Name=Audio",
          "Direction": "Input",
          "IsAllowed": true
        }
      },
      {
        "fields": {
          "AgentID": "@parent:ID",
          "ModalityID": "@lookup:MJ: AI Modalities.Name=Audio",
          "Direction": "Output",
          "IsAllowed": true
        }
      }
    ],
    "MJ: AI Agent Prompts": [
      {
        "fields": {
          "AgentID": "@parent:ID",
          "PromptID": "@lookup:AI Prompts.Name=Audio Sage System Prompt",
          "ExecutionOrder": 0,
          "Status": "Active"
        }
      }
    ]
  }
}]
```

**2. `/metadata/prompts/.audio-sage-system-prompt.json`**

```json
[{
  "fields": {
    "Name": "Audio Sage System Prompt",
    "Description": "System prompt for Audio Sage agent with voice-optimized instructions",
    "CategoryID": "@lookup:AI Prompt Categories.Name=System",
    "TemplateID": "@lookup:Templates.Name=Audio Sage Template",
    "EffortLevel": "Default",
    "IsActive": true
  }
}]
```

**3. `/metadata/prompts/templates/audio-sage/audio-sage.template.md`**

(Voice-optimized version of Sage prompt - see [MemberJunction Metadata Architecture](#audio-optimized-sage-prompt) section above)

**Process:**
```bash
# Create metadata files (see examples above in doc)

# Sync to database (validates and pushes)
cd /Users/jordanfanapour/Documents/GitHub/MJ
npm run sync:push

# Verify agent created
# Check database: SELECT * FROM [__mj].AIAgent WHERE Name = 'Audio Sage'
```

**Deliverable:** Audio Sage agent record exists in database with `DriverClass='AudioSageAgent'` and Audio modality linked

---

### Component 5: Angular Voice Message Component

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/chat/voice-message/`

**Files to create:**

**voice-message.component.ts:**

```typescript
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { AudioSageGraphQLService, VoiceMessageResponse } from '../services/audio-sage-graphql.service';

@Component({
  selector: 'app-voice-message',
  templateUrl: './voice-message.component.html',
  styleUrls: ['./voice-message.component.scss']
})
export class VoiceMessageComponent implements OnInit, OnDestroy {
  IsRecording = false;
  IsProcessing = false;
  IsPlayingResponse = false;
  RecordingDuration = 0;
  PlaybackProgress = 0;
  ErrorMessage: string | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer: any;
  private audioElement: HTMLAudioElement | null = null;

  constructor(
    private audioSageService: AudioSageGraphQLService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.cleanup();
  }

  async StartRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        await this.sendAudioToSage(audioBlob);
      };

      this.mediaRecorder.start();
      this.IsRecording = true;

      this.RecordingDuration = 0;
      this.recordingTimer = setInterval(() => {
        this.RecordingDuration++;
        this.cdr.detectChanges();
      }, 1000);

    } catch (error) {
      this.ErrorMessage = 'Microphone access denied';
      console.error('Failed to start recording:', error);
    }
  }

  StopRecording(): void {
    if (this.mediaRecorder && this.IsRecording) {
      this.mediaRecorder.stop();
      this.IsRecording = false;
      clearInterval(this.recordingTimer);

      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  }

  CancelRecording(): void {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    this.IsRecording = false;
    this.audioChunks = [];
    clearInterval(this.recordingTimer);
  }

  private async sendAudioToSage(audioBlob: Blob): Promise<void> {
    this.IsProcessing = true;
    this.cdr.detectChanges();

    try {
      const base64Audio = await this.blobToBase64(audioBlob);

      const response = await this.audioSageService.processVoiceMessage(
        base64Audio,
        'audio/webm'
      );

      if (response.audioResponseUrl) {
        await this.playAudioResponse(response.audioResponseUrl);
      }

    } catch (error) {
      this.ErrorMessage = error instanceof Error ? error.message : 'Voice message failed';
    } finally {
      this.IsProcessing = false;
      this.cdr.detectChanges();
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async playAudioResponse(audioUrl: string): Promise<void> {
    this.IsPlayingResponse = true;

    this.audioElement = new Audio(audioUrl);

    this.audioElement.ontimeupdate = () => {
      if (this.audioElement) {
        this.PlaybackProgress = (this.audioElement.currentTime / this.audioElement.duration) * 100;
        this.cdr.detectChanges();
      }
    };

    this.audioElement.onended = () => {
      this.IsPlayingResponse = false;
      this.PlaybackProgress = 0;
      this.cdr.detectChanges();
    };

    await this.audioElement.play();
  }

  StopPlayback(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.IsPlayingResponse = false;
      this.PlaybackProgress = 0;
    }
  }

  private cleanup(): void {
    this.CancelRecording();
    this.StopPlayback();
  }
}
```

**voice-message.component.html:**

```html
<div class="voice-message-container">
  <!-- Normal State -->
  <div *ngIf="!IsRecording && !IsProcessing && !IsPlayingResponse">
    <button
      kendoButton
      icon="microphone"
      (click)="StartRecording()"
      title="Record voice message"
    >
      Voice
    </button>
  </div>

  <!-- Recording State -->
  <div *ngIf="IsRecording" class="recording-state">
    <div class="recording-indicator">
      <span class="recording-dot"></span>
      <span>Recording... ({{ RecordingDuration }}s)</span>
    </div>
    <div class="recording-actions">
      <button kendoButton (click)="StopRecording()" themeColor="primary">Stop</button>
      <button kendoButton (click)="CancelRecording()">Cancel</button>
    </div>
  </div>

  <!-- Processing State -->
  <div *ngIf="IsProcessing" class="processing-state">
    <kendo-loader type="infinite-spinner" size="small"></kendo-loader>
    <span>Processing...</span>
  </div>

  <!-- Playing Response State -->
  <div *ngIf="IsPlayingResponse" class="playback-state">
    <div class="playback-indicator">
      <span class="speaker-icon">🔊</span>
      <span>Playing response...</span>
    </div>
    <div class="playback-controls">
      <kendo-progressbar
        [value]="PlaybackProgress"
        [max]="100"
      ></kendo-progressbar>
      <button kendoButton icon="stop" (click)="StopPlayback()" size="small"></button>
    </div>
  </div>

  <!-- Error State -->
  <div *ngIf="ErrorMessage" class="error-message">
    {{ ErrorMessage }}
  </div>
</div>
```

**voice-message.component.scss:**

```scss
.voice-message-container {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
}

.recording-state,
.processing-state,
.playback-state {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: var(--mj-surface-light);
  border-radius: 8px;
}

.recording-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.recording-dot {
  width: 12px;
  height: 12px;
  background-color: red;
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 8px;

  kendo-progressbar {
    flex: 1;
    min-width: 200px;
  }
}
```

**Deliverable:** UI component for recording and playing audio

---

### Component 6: MJAPI GraphQL Resolver

**Location:** `packages/MJServer/src/resolvers/AudioSageResolver.ts`

**Purpose:** GraphQL resolver to handle voice messages via AudioSageAgent

**Implementation Pattern** (based on [RunAIAgentResolver.ts](packages/MJServer/src/resolvers/RunAIAgentResolver.ts)):

```typescript
import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIEngine } from '@memberjunction/aiengine';
import { AIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { getAttachmentService } from '@memberjunction/aiengine';
import axios from 'axios';

@ObjectType()
export class VoiceMessageResponse {
    @Field()
    success: boolean;

    @Field()
    textResponse: string; // Transcript from Eleven Labs

    @Field()
    audioResponseUrl: string; // URL for audio playback (data URL or pre-auth URL)

    @Field()
    conversationId: string;

    @Field({ nullable: true })
    userConversationDetailId?: string;

    @Field({ nullable: true })
    agentConversationDetailId?: string;

    @Field({ nullable: true })
    errorMessage?: string;
}

@Resolver()
export class AudioSageResolver extends ResolverBase {
    /**
     * Process voice message through Audio Sage agent.
     * Uses existing ConversationAttachmentService infrastructure.
     */
    @Mutation(() => VoiceMessageResponse)
    async ProcessVoiceMessage(
        @Arg('conversationDetailId') conversationDetailId: string,
        @Ctx() { userPayload, providers, dataSource }: AppContext
    ): Promise<VoiceMessageResponse> {
        const startTime = Date.now();

        try {
            LogStatus('=== PROCESSING VOICE MESSAGE ===');

            // Get current user
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                throw new Error('Unable to determine current user');
            }

            // Use AIEngine to lookup Audio Sage agent (cached, no DB hit)
            await AIEngine.Instance.Config(false, currentUser);
            const audioSageAgent = AIEngine.Instance.Agents.find(
                (a: AIAgentEntityExtended) => a.Name === 'Audio Sage'
            );

            if (!audioSageAgent) {
                throw new Error('Audio Sage agent not found');
            }

            if (audioSageAgent.Status !== 'Active') {
                throw new Error(`Audio Sage agent is not active (Status: ${audioSageAgent.Status})`);
            }

            // Load audio attachment from conversation detail
            const attachmentService = getAttachmentService();
            const attachments = await attachmentService.getAttachments(conversationDetailId, currentUser);

            if (!attachments || attachments.length === 0) {
                throw new Error('No audio attachment found for conversation detail');
            }

            // Get audio data (returns URL - either data URL or pre-auth download URL)
            const audioData = await attachmentService.getAttachmentData(attachments[0], currentUser);
            if (!audioData) {
                throw new Error('Failed to retrieve audio data');
            }

            // Load audio from URL as Buffer
            const audioBuffer = await this.fetchAudioFromUrl(audioData.contentUrl);
            LogStatus(`Voice message size: ${audioBuffer.length} bytes`);

            // Create agent runner
            const agentRunner = new AgentRunner();

            // Execute agent with audio parameters
            const result = await agentRunner.RunAgentInConversation({
                agent: audioSageAgent,
                conversationMessages: [], // Audio doesn't use text messages
                contextUser: currentUser,
                // Custom params for AudioSageAgent
                audioBuffer: audioBuffer,
                mimeType: attachments[0].MimeType
            } as any, {
                conversationDetailId: conversationDetailId, // Pass user's detail ID
                createArtifacts: false // Audio responses don't create artifacts
            });

            // Create attachment for agent's audio response
            const agentAudioBase64 = ((result.agentResult as any).audioResponse as Buffer).toString('base64');
            const responseAttachment = await attachmentService.addAttachment(
                result.agentResponseDetailId!,
                {
                    data: agentAudioBase64,
                    mimeType: 'audio/mpeg', // Eleven Labs returns MP3
                    fileName: 'sage-response.mp3',
                    durationSeconds: undefined // Could extract from Eleven Labs metadata
                },
                audioSageAgent,
                null, // model
                currentUser
            );

            if (!responseAttachment.success) {
                throw new Error(`Failed to save agent audio response: ${responseAttachment.error}`);
            }

            // Get URL for agent's audio (for Angular playback)
            const responseAudioData = await attachmentService.getAttachmentData(
                responseAttachment.attachment!,
                currentUser
            );

            const executionTime = Date.now() - startTime;
            LogStatus(`=== VOICE MESSAGE PROCESSED (${executionTime}ms) ===`);

            return {
                success: true,
                textResponse: result.agentResult.message || '',
                audioResponseUrl: responseAudioData!.contentUrl, // URL for playback
                conversationId: result.conversationId,
                userConversationDetailId: conversationDetailId,
                agentConversationDetailId: result.agentResponseDetailId
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            LogError('Voice message processing failed:', undefined, error);

            return {
                success: false,
                textResponse: '',
                audioResponseUrl: '',
                conversationId: '',
                errorMessage: (error as Error).message || 'Unknown error occurred'
            };
        }
    }

    /**
     * Helper: Fetch audio from URL (data URL or pre-auth download URL) as Buffer
     */
    private async fetchAudioFromUrl(contentUrl: string): Promise<Buffer> {
        if (contentUrl.startsWith('data:')) {
            // Data URL - extract base64 and decode
            const base64Data = contentUrl.split(',')[1];
            return Buffer.from(base64Data, 'base64');
        } else {
            // Pre-authenticated download URL - fetch via HTTP
            const response = await axios.get(contentUrl, { responseType: 'arraybuffer' });
            return Buffer.from(response.data);
        }
    }
}
```

**Key Patterns:**
1. **Use AIEngine for agent lookup** - Cached, no database hit
2. **Use ConversationAttachmentService** - Load audio from existing attachment infrastructure
3. **Fetch audio from URL** - Handle both data URLs (inline <512KB) and pre-auth download URLs (MJStorage)
4. **Use AgentRunner.RunAgentInConversation()** - Handles conversation tracking automatically
5. **Create attachment for response** - Save agent's audio response using same service
6. **Return URL, not base64** - Angular plays from URL (no GraphQL size limits)

**GraphQL Schema Registration** (`packages/MJServer/src/schema.ts`):
```typescript
import { AudioSageResolver } from './resolvers/AudioSageResolver.js';

// Add to resolvers array
const resolvers = [
    // ... existing resolvers
    AudioSageResolver
];
```

**Deliverable:** MJAPI GraphQL resolver that invokes AudioSageAgent and returns voice response

---

### Component 7: Angular GraphQL Service

**Location:** `packages/Angular/Explorer/explorer-core/src/lib/chat/services/audio-sage-graphql.service.ts`

**Implementation:**

```typescript
import { Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';

export interface VoiceMessageResponse {
  success: boolean;
  textResponse: string;
  audioResponseUrl: string;
  conversationId: string;
  conversationDetailId?: string;
  errorMessage?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AudioSageGraphQLService {
  constructor(private apollo: Apollo) {}

  /**
   * Process a voice message by creating an attachment first, then calling the GraphQL mutation.
   * Uses existing ConversationAttachmentService infrastructure.
   */
  async processVoiceMessage(
    audioBase64: string,
    mimeType: string,
    durationSeconds: number,
    conversationId?: string
  ): Promise<VoiceMessageResponse> {
    // 1. Create ConversationDetail for user's voice message
    const createDetailMutation = gql`
      mutation CreateConversationDetail($input: CreateConversationDetailInput!) {
        createConversationDetail(input: $input) {
          id
          conversationId
        }
      }
    `;

    const detailResult = await this.apollo.mutate({
      mutation: createDetailMutation,
      variables: {
        input: {
          conversationId: conversationId,
          message: '[Voice message]',
          role: 'user'
        }
      }
    }).toPromise();

    const conversationDetailId = detailResult.data.createConversationDetail.id;

    // 2. Save audio as attachment using ConversationAttachmentService
    const createAttachmentMutation = gql`
      mutation CreateAttachment($input: CreateAttachmentInput!) {
        createAttachment(input: $input) {
          success
          error
        }
      }
    `;

    const attachmentResult = await this.apollo.mutate({
      mutation: createAttachmentMutation,
      variables: {
        input: {
          conversationDetailId: conversationDetailId,
          data: audioBase64,
          mimeType: mimeType,
          fileName: 'voice-message.webm',
          durationSeconds: durationSeconds
        }
      }
    }).toPromise();

    if (!attachmentResult.data.createAttachment.success) {
      throw new Error(
        attachmentResult.data.createAttachment.error || 'Failed to save audio attachment'
      );
    }

    // 3. Process voice message (resolver loads audio from attachment)
    const mutation = gql`
      mutation ProcessVoiceMessage($conversationDetailId: String!) {
        processVoiceMessage(conversationDetailId: $conversationDetailId) {
          success
          textResponse
          audioResponseUrl
          conversationId
          userConversationDetailId
          agentConversationDetailId
          errorMessage
        }
      }
    `;

    const result = await this.apollo.mutate({
      mutation,
      variables: {
        conversationDetailId: conversationDetailId
      }
    }).toPromise();

    if (!result?.data?.processVoiceMessage.success) {
      throw new Error(
        result?.data?.processVoiceMessage.errorMessage || 'Failed to process voice message'
      );
    }

    return result.data.processVoiceMessage;
  }
}
```

**Deliverable:** Angular service for GraphQL voice message mutation

---

### Component 8: Integration & Configuration

**Task:** Wire everything together

**Files to modify:**

1. **Message Input Component** - Add voice button

`packages/Angular/Explorer/explorer-core/src/lib/chat/message-input/message-input.component.html`:

```html
<!-- Add after Send button -->
<app-voice-message></app-voice-message>
```

2. **Chat Module** - Declare components

`packages/Angular/Explorer/explorer-core/src/lib/chat/chat.module.ts`:

```typescript
import { VoiceMessageComponent } from './voice-message/voice-message.component';
import { AudioSageGraphQLService } from './services/audio-sage-graphql.service';

@NgModule({
  declarations: [
    // ... existing
    VoiceMessageComponent
  ],
  providers: [
    // ... existing
    AudioSageGraphQLService
  ],
  exports: [
    // ... existing
    VoiceMessageComponent
  ]
})
export class ChatModule { }
```

3. **MJAPI Configuration**

`packages/MJAPI/mj.config.cjs`:

```javascript
module.exports = {
  audioSage: {
    enabled: true,
    elevenLabs: {
      defaultVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella
      defaultModel: 'claude-3-5-sonnet-20241022'
    },
    tempAudioDir: process.env.AUDIO_SAGE_TEMP_DIR || '/tmp/audio-sage'
  }
};
```

4. **Environment Variables**

`.env`:

```bash
ELEVENLABS_API_KEY=your_api_key_here
AUDIO_SAGE_ENABLED=true
AUDIO_SAGE_TEMP_DIR=/tmp/audio-sage
```

**Deliverable:** All components integrated and configured

---

## Orchestration Plan

### Phase 0: Package Setup

**Task:** Create AudioSage package structure

**Sub-Agent A: Package Scaffolding**
- Create `packages/AI/Agents/AudioSage/` directory
- Create `package.json` with dependencies
- Create `tsconfig.json`
- Create `src/index.ts` barrel export
- Run `npm install` at repo root

### Phase 1: Core Implementation (Parallel Execution)

**Launch 3 sub-agents in parallel:**

**Sub-Agent B: Eleven Labs Adapter**
- Create `packages/AI/Agents/AudioSage/src/eleven-labs-adapter.ts`
- Implement `ElevenLabsAdapter.ConvertToolCallsToActions()`
- Implement `ElevenLabsAdapter.ExtractAudioBuffer()`
- Define TypeScript interfaces

**Sub-Agent C: AudioSageAgent Driver Class**
- Create `packages/AI/Agents/AudioSage/src/audio-sage-agent.ts`
- Extend `BaseAgent` and add `@RegisterClass` decorator
- Implement `executeAgentInternal()` override
- Implement `sendToElevenLabs()` method
- Hardcode Eleven Labs configuration for PoC

**Sub-Agent D: Angular Voice UI**
- Create `packages/Angular/Explorer/explorer-core/src/lib/chat/voice-message/voice-message.component.ts`
- Implement Web Audio API recording
- Implement audio playback
- Create HTML template and SCSS styles

### Phase 2: Integration Layer (Sequential after Phase 1)

**Sub-Agent E: Angular GraphQL Service**
- Depends on: None (can run in parallel with Phase 1)
- Create `packages/Angular/Explorer/explorer-core/src/lib/chat/services/audio-sage-graphql.service.ts`
- Define GraphQL mutation
- Implement `processVoiceMessage()` method

**Sub-Agent F: MJAPI GraphQL Resolver**
- Depends on: Sub-Agent C (AudioSageAgent class exists)
- Create MJAPI GraphQL resolver to invoke `AudioSageAgent.Execute()`
- Add GraphQL schema types
- Implement audio file serving endpoint

### Phase 3: Metadata & Configuration (After Phase 2)

**Sub-Agent G: Metadata Setup**
- Create `/metadata/agents/.audio-sage-agent.json` with `DriverClass: "AudioSageAgent"`
- Create `/metadata/prompts/templates/audio-sage/audio-sage.template.md`
- Create `/metadata/prompts/.audio-sage-system-prompt.json`
- Run `npx mj-sync validate && npx mj-sync push`
- Verify agent created in database

**Sub-Agent H: Eleven Labs Agent Creation**
- Use Eleven Labs SDK to create conversational agent
- Update `ELEVEN_LABS_CONFIG.AGENT_ID` in `audio-sage-agent.ts` with returned agent ID
- Configure tools for MJ action execution

**Sub-Agent I: Module Integration**
- Update chat module declarations/exports
- Add voice button to message input component
- Set environment variables
- Test end-to-end flow

---

## Success Criteria

### PoC Complete When:

**Package & Code:**
- [x] `packages/AI/Agents/AudioSage/` package created with proper structure
- [x] `AudioSageAgent` class extends `BaseAgent` with `@RegisterClass` decorator
- [x] `ElevenLabsAdapter` converts tool calls to MJ action format
- [x] Angular `VoiceMessageComponent` implements Web Audio API recording/playback
- [x] Angular `AudioSageGraphQLService` calls MJAPI mutation
- [x] MJAPI GraphQL resolver invokes `AudioSageAgent.Execute()`

**Metadata & Database:**
- [x] Audio Sage agent metadata created with `DriverClass='AudioSageAgent'`
- [x] Audio Sage agent linked to Audio modality (Input + Output)
- [x] Agent prompts defined in metadata and linked via `AIAgentPrompt`
- [x] No custom database tables created - uses existing MJ entities

**End-to-End Functionality:**
- [ ] User clicks microphone button in MJExplorer chat
- [ ] Audio recording works with visual feedback (pulsing red dot)
- [ ] Audio base64-encoded and sent to MJAPI via GraphQL
- [ ] `AudioSageAgent.executeAgentInternal()` receives audio, sends to Eleven Labs
- [ ] Eleven Labs returns audio + text transcript + tool calls
- [ ] Tool calls converted to MJ actions via `ElevenLabsAdapter`
- [ ] Actions executed via `BaseAgent.validateActionsNextStep()`
- [ ] Audio response plays in browser
- [ ] Text transcript shown in chat
- [ ] `Conversation` entity created with Eleven Labs conversation ID in `ExternalID`
- [ ] `ConversationDetail` entities track messages
- [ ] Agent runs and steps tracked in `AIAgentRun` and `AIAgentRunStep`
- [ ] Action executions tracked in `ActionExecutionLog`

**Configuration:**
- [ ] `ELEVENLABS_API_KEY` environment variable set
- [ ] Eleven Labs conversational agent created via SDK
- [ ] `ELEVEN_LABS_CONFIG.AGENT_ID` hardcoded in `audio-sage-agent.ts`

---

## Configuration & Environment

### Required Environment Variables

```bash
# Eleven Labs
ELEVENLABS_API_KEY=your_key_here

# Audio Sage
AUDIO_SAGE_ENABLED=true
AUDIO_SAGE_TEMP_DIR=/tmp/audio-sage

# MJAPI Public URL (for webhooks)
MJAPI_PUBLIC_URL=https://your-domain.com
```

### NPM Dependencies to Add

**`packages/AI/Agents/AudioSage/package.json`:**
```json
{
  "dependencies": {
    "@memberjunction/ai-agents": "^2.7.0",
    "@memberjunction/core": "^2.7.0",
    "@memberjunction/core-entities": "^2.7.0",
    "@memberjunction/templates": "^2.7.0",
    "@elevenlabs/elevenlabs-js": "^2.32.0"
  }
}
```

**Note:** Using `@elevenlabs/elevenlabs-js` version `^2.32.0` (same as existing ElevenLabs provider package at [packages/AI/Providers/ElevenLabs/package.json:24](packages/AI/Providers/ElevenLabs/package.json#L24)).

**After creating package.json, run:**
```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ
npm install
```

### Database Verification

After metadata sync, verify:

```sql
-- Audio Sage agent exists
SELECT * FROM __mj.AIAgent WHERE Name = 'Audio Sage';

-- Audio modality linked
SELECT * FROM __mj.AIAgentModality
WHERE AgentID = (SELECT ID FROM __mj.AIAgent WHERE Name = 'Audio Sage');

-- Should show 2 rows: Audio Input + Audio Output
```

---

## Reference Documents

**This document supersedes:**
- `audio-sage-implementation-plan.md` (obsolete - proposed wrong schema)
- `audio-sage-mjexplorer-plan.md` (obsolete - based on wrong schema)
- `session-plan.md` (merged into this document)

**Still relevant:**
- `eleven-labs-findings.md` - Research on Eleven Labs capabilities
- `audio-sage-architecture-assessment.md` - Why no new tables needed
- `audio-sage-final-architecture.md` - Metadata-driven approach explanation

---

## Implementation Findings & Recommendations

### Research Summary

After comprehensive review of MemberJunction source code and patterns, the following key findings inform this implementation:

#### 1. GraphQL Resolver Pattern ✅

**Source:** [RunAIAgentResolver.ts:345-491](packages/MJServer/src/resolvers/RunAIAgentResolver.ts#L345-L491)

**Pattern to follow:**
- Use `AIEngine.Instance.Config()` + `.Agents.find()` for agent lookup (cached, no DB hit)
- Use `AgentRunner.RunAgentInConversation()` for execution with conversation tracking
- Convert audio: Angular base64 string → GraphQL string → Resolver `Buffer.from()` → Agent Buffer
- Return audio as base64 string for Angular playback

**Audio-specific changes:**
- Custom `AudioExecuteParams` extends `ExecuteAgentParams` with `audioBuffer: Buffer` and `mimeType: string`
- Cast params with `as any` when calling `RunAgentInConversation()`
- Extract audio response from result: `(result.agentResult as any).audioResponse as Buffer`

#### 2. Eleven Labs SDK Version ✅

**Confirmed version:** `@elevenlabs/elevenlabs-js` version `^2.32.0`

**Source:** [packages/AI/Providers/ElevenLabs/package.json:24](packages/AI/Providers/ElevenLabs/package.json#L24)

**Note:** The SDK API for Conversational AI (`.conversationalAi.conversations.sendMessage()`) should be verified during implementation as the SDK may have different method signatures than assumed in this plan.

#### 3. Conversation Flow & Tracking ✅

**Source:** [RunAIAgentResolver.ts:802-891](packages/MJServer/src/resolvers/RunAIAgentResolver.ts#L802-L891), [AgentRunner.ts:130-200](packages/AI/Agents/src/AgentRunner.ts#L130-L200)

**MJ automatically handles:**
- `Conversation` entity creation with `ExternalID` (stores Eleven Labs conversation ID)
- `ConversationDetail` for each message (user + agent response)
- Conversation history loading for context
- Agent run and step tracking

**Implementation strategy:**
- GraphQL resolver receives `conversationId` as optional parameter
- Pass to `RunAgentInConversation({ conversationId: conversationId })`
- Framework handles the rest

#### 3a. Audio Attachment Infrastructure ✅ **CRITICAL UPDATE**

**Source:** [ConversationAttachmentService.ts](packages/AI/Engine/src/services/ConversationAttachmentService.ts), [RunAIAgentResolver.ts:800-891](packages/MJServer/src/resolvers/RunAIAgentResolver.ts#L800-L891)

**MJ ALREADY has complete audio handling infrastructure** - we don't need to pass base64 audio in GraphQL!

**Existing Infrastructure:**
- `ConversationDetailAttachment` table - stores audio/video/image metadata
- Two storage modes:
  - **Inline** (`InlineData` column) - Base64 for small files (<512KB default)
  - **MJStorage** (`FileID` column) - References `Files` table, returns pre-authenticated URLs
- `ConversationAttachmentService.addAttachment()` - Handles validation, storage decision, file upload
- `ConversationAttachmentService.getAttachmentData()` - Returns URL (data URL or pre-auth download URL)

**How it works for audio:**
```typescript
// Server-side pattern from RunAIAgentResolver.ts
const attachmentService = getAttachmentService();

// Load attachments for conversation detail
const attachments = await attachmentService.getAttachments(conversationDetailId, contextUser);

// Get attachment data (returns URL, not base64!)
const attachmentData = await attachmentService.getAttachmentData(attachments[0], contextUser);
// attachmentData.contentUrl is either:
// - "data:audio/webm;base64,..." (inline <512KB)
// - "https://storage.../conversation-attachments/123.webm" (MJStorage)
```

**Implementation Change:**
❌ **Don't do this** (original plan):
```typescript
// GraphQL mutation receives huge base64 string
ProcessVoiceMessage(audioDataBase64: string, mimeType: string)
```

✅ **Do this instead** (use existing infrastructure):
```typescript
// 1. Angular creates ConversationDetail first
const userDetail = await conversationService.createDetail({
    message: '[Voice message]',
    role: 'user'
});

// 2. Angular saves audio as attachment
const attachmentService = getAttachmentService();
await attachmentService.addAttachment(userDetail.ID, {
    data: base64Audio,
    mimeType: 'audio/webm',
    fileName: 'voice-message.webm',
    durationSeconds: duration
}, agent, model, contextUser);

// 3. GraphQL mutation just receives the ConversationDetailID
ProcessVoiceMessage(conversationDetailId: string)

// 4. Resolver loads audio from attachment
const attachments = await attachmentService.getAttachments(conversationDetailId, contextUser);
const audioData = await attachmentService.getAttachmentData(attachments[0], contextUser);
const audioBuffer = await this.fetchAudioFromUrl(audioData.contentUrl);

// 5. For response audio, create attachment (returns URL, not base64)
const responseAttachment = await attachmentService.addAttachment(
    agentDetailId,
    { data: responseAudioBase64, mimeType: 'audio/mpeg', ... },
    agent, model, contextUser
);
const responseData = await attachmentService.getAttachmentData(responseAttachment, contextUser);
return { audioResponseUrl: responseData.contentUrl }; // URL for playback
```

**Benefits:**
- No GraphQL payload size limits (uses URLs)
- Automatic storage optimization (inline vs MJStorage)
- Conversation history includes audio messages
- Batch loading for efficient playback
- File management and cleanup handled automatically
- Matches existing image/video attachment pattern

#### 4. BaseAgent Step Creation ✅

**Source:** [base-agent.ts:4391-4431](packages/AI/Agents/src/base-agent.ts#L4391-L4431)

**Use framework's `createStepEntity()` method instead of manual creation:**

```typescript
// Create step
const step = await this.createStepEntity({
    stepType: 'Prompt', // or 'Actions', 'Decision', etc.
    stepName: 'Render Audio Sage Prompt',
    contextUser: params.contextUser,
    inputData: { audioSize: buffer.length }
});

// Do work...

// Finalize step
await this.finalizeStepEntity(step, success, errorMessage, outputData);
```

**Benefits:**
- Proper step numbering and hierarchy
- Consistent logging format
- Integration with agent run tracking
- Automatic payload serialization

#### 5. AIEngine for All Lookups ✅

**Pattern used throughout codebase:**

```typescript
// Initialize AIEngine (loads all AI metadata into cache)
await AIEngine.Instance.Config(false, contextUser);

// Lookup agent (no DB hit)
const agent = AIEngine.Instance.Agents.find(a => a.Name === 'Audio Sage');

// Lookup template (no DB hit)
const template = AIEngine.Instance.Templates.find(t => t.ID === templateId);

// Lookup actions (no DB hit)
const action = AIEngine.Instance.Actions.find(a => a.Name === actionName);
```

**Apply to AudioSageAgent:**
- Use AIEngine in `renderPromptForAudio()` for template lookup
- Rely on BaseAgent's `gatherPromptTemplateData()` which uses AIEngine internally

#### 6. Prompt Template Examples ✅

**Source:** [sage.template.md](metadata/prompts/templates/sage/sage.template.md), [loop-agent-type-system-prompt.template.md](metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md)

**Key patterns for Audio Sage:**
- **Voice-optimized instructions** - "Keep responses concise (1-3 sentences)"
- **Template variables** - `{{availableAgents}}`, `{{availableActions}}`, `{{userName}}`
- **Handlebars syntax** - `{{#each availableAgents}}...{{/each}}`
- **Action calling** - Tool names match MJ action names exactly

**Voice-specific additions:**
- Shorter, conversational tone
- Confirmation before actions
- Brief status updates for long operations

#### 7. Metadata Structure ✅

**Source:** [.sage-agent.json](metadata/agents/.sage-agent.json)

**Key patterns:**
- Use `@lookup:` for foreign keys: `"TypeID": "@lookup:MJ: AI Agent Types.Name=Loop"`
- Use `@parent:ID` for parent references in related entities
- Include `sync` section (auto-populated by mj-sync)
- Use proper modality names: `@lookup:MJ: AI Modalities.Name=Audio`

### Critical Implementation Recommendations

#### 1. Use Existing Attachment Infrastructure (MOST IMPORTANT) 🎯

**MJ already has complete audio/media handling** - don't reinvent it!

❌ **Don't pass audio in GraphQL mutation:**
```typescript
ProcessVoiceMessage(audioDataBase64: string) // 10MB+ payload!
```

✅ **Use ConversationAttachmentService instead:**
```typescript
// Angular: Create attachment first
const attachmentService = getAttachmentService();
await attachmentService.addAttachment(conversationDetailId, {
    data: base64Audio,
    mimeType: 'audio/webm',
    ...
}, agent, model, contextUser);

// GraphQL: Just pass the ID
ProcessVoiceMessage(conversationDetailId: string)

// Resolver: Load from attachment
const attachments = await attachmentService.getAttachments(conversationDetailId, contextUser);
const audioData = await attachmentService.getAttachmentData(attachments[0], contextUser);
const audioBuffer = await this.fetchAudioFromUrl(audioData.contentUrl);
```

**Benefits:**
- ✅ No GraphQL size limits (uses URLs)
- ✅ Automatic storage optimization (inline vs MJStorage)
- ✅ Audio messages in conversation history
- ✅ Efficient batch loading
- ✅ Matches existing image/video pattern

**Source:** [ConversationAttachmentService.ts](packages/AI/Engine/src/services/ConversationAttachmentService.ts)

#### 2. Remove Manual Step Creation Helper

**❌ Remove from plan:**
```typescript
private async createAgentRunStep(...) {
    const md = new Metadata();
    const step = await md.GetEntityObject<AIAgentRunStepEntityExtended>(...);
    // Manual creation...
}
```

**✅ Use instead:**
```typescript
const step = await this.createStepEntity({ ... });
await this.finalizeStepEntity(step, success, errorMessage);
```

#### 2. Verify Eleven Labs SDK API

The plan assumes:
```typescript
await this.elevenLabsClient.conversationalAi.conversations.sendMessage({...})
```

**Action:** Review actual SDK documentation/examples to confirm method signature before implementation.

#### 3. Add Missing Dependencies

Add to `packages/AI/Agents/AudioSage/package.json`:
- `@memberjunction/templates` - For TemplateEngineServer
- `@memberjunction/aiengine` - For AIEngine

#### 4. Consider Conversation Continuity

**Eleven Labs conversation IDs:**
- Store in `Conversation.ExternalID`
- Pass to subsequent voice messages: `conversationId: conversationId`
- Framework handles history automatically

**Audio message storage** (future enhancement):
- Option to save audio to `ConversationDetailAttachment`
- Requires File entity integration
- Not required for PoC - can be transient

#### 5. Error Handling Best Practices

**Pattern from codebase:**
```typescript
try {
    const step = await this.createStepEntity({...});
    // Do work...
    await this.finalizeStepEntity(step, true);
    return result;
} catch (error: unknown) {
    await this.finalizeStepEntity(step, false, (error as Error).message);
    throw error;
}
```

**Benefits:**
- Steps show as "Failed" in agent run
- Error messages captured for debugging
- Proper cleanup before re-throwing

### Potential Issues & Mitigations

| Issue | Mitigation |
|-------|-----------|
| Eleven Labs SDK API differs from assumptions | Review SDK docs first, update implementation accordingly |
| ~~Audio buffer size limits in GraphQL~~ | ✅ **SOLVED** - Use ConversationAttachmentService (no GraphQL audio transfer) |
| Conversation ID not persisting | Ensure `Conversation.ExternalID` saved correctly |
| Template not found | Verify metadata sync completed, check AIEngine cache |
| Actions not executing | Ensure tool names match MJ action names exactly |
| Step tracking broken | Use BaseAgent's `createStepEntity()`, not manual creation |
| Attachment storage provider not configured | Ensure agent has `AttachmentStorageProviderID` set for files >512KB |

### Next Steps for Implementation

1. **Create package structure** - `packages/AI/Agents/AudioSage/`
2. **Implement ElevenLabsAdapter** - Tool call conversion first
3. **Implement AudioSageAgent** - Core driver class
4. **Create MJAPI resolver** - GraphQL endpoint
5. **Implement Angular UI** - Voice recording/playback
6. **Create metadata** - Agent, prompt, template files
7. **Sync metadata** - `npx mj-sync push`
8. **Test end-to-end** - Record → Process → Play response

---

**Document Status:** Ready for Implementation (All findings incorporated)
**Last Updated:** 2026-01-25
**Architecture:** Custom `AudioSageAgent` driver class extending `BaseAgent`, PoC-first approach with hardcoded config
**Research Complete:** GraphQL patterns, conversation flow, step tracking, AIEngine usage, metadata structure
