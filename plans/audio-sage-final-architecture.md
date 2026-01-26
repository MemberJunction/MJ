# Audio Sage - Final Metadata-Driven Architecture

**Date:** 2026-01-25
**Status:** Architecture Finalized - Aligned with MJ Metadata Philosophy

## Executive Summary

After reviewing the existing MemberJunction architecture, **NO new database tables are needed**. The Audio Sage PoC will:

1. **Use existing `AIModality` system** - Audio modality already exists
2. **Use existing `Conversation`/`ConversationDetail` tables** - Store transcripts and link to Eleven Labs via `ExternalID`
3. **Create metadata-based agent configuration** - New agent definition in `/metadata/agents/`
4. **Extend existing Eleven Labs provider** - Add conversational AI support alongside existing TTS

## Why This Approach is Correct

### MJ Already Has Everything We Need

1. **✅ AIModality Table** - "Audio" modality already defined with description: "Audio files (MP3, WAV, M4A) for speech-to-text, audio understanding, and text-to-speech"

2. **✅ AIAgentModality Table** - Links agents to supported modalities with `Direction` (Input/Output) and `IsAllowed` flag

3. **✅ Conversation/ConversationDetail** - Full conversation tracking with:
   - `ExternalID` for Eleven Labs conversation ID
   - `AgentID` for linking to Audio Sage agent
   - `Role`, `Message`, `Status` fields
   - Relationship to Users, Projects, Data Contexts

4. **✅ AI Vendor System** - Eleven Labs already registered as AI Vendor

5. **✅ Agent Metadata System** - Sage agent defined in `/metadata/agents/.sage-agent.json` with modality configuration

## Current Sage Modality Configuration

From reviewing `.sage-agent.json`:
```json
"MJ: AI Agent Modalities": [
  {
    "ModalityID": "@lookup:MJ: AI Modalities.Name=Text",
    "Direction": "Input",
    "IsAllowed": true
  },
  {
    "ModalityID": "@lookup:MJ: AI Modalities.Name=Text",
    "Direction": "Output",
    "IsAllowed": true
  },
  {
    "ModalityID": "@lookup:MJ: AI Modalities.Name=Image",
    "Direction": "Input",
    "IsAllowed": true
  },
  {
    "ModalityID": "@lookup:MJ: AI Modalities.Name=Image",
    "Direction": "Output",
    "IsAllowed": true
  }
]
```

Sage already supports **Text** (bidirectional) and **Image** (bidirectional).

## What We Actually Need to Build

### Option 1: Extend Sage Agent (Recommended for PoC)

Add Audio modality to existing Sage agent via metadata:

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
- Single Sage agent with multiple modalities (text, image, audio)
- User continuity - same agent across all interfaces
- Minimal metadata changes

**Cons:**
- Mixed provider complexity (Anthropic for text, Eleven Labs for audio)

### Option 2: Create Separate "Audio Sage" Agent

Create new agent metadata file with Audio-only modality.

**File:** `/metadata/agents/.audio-sage-agent.json`

```json
[
  {
    "fields": {
      "Name": "Audio Sage",
      "Description": "Audio-enabled variant of Sage using Eleven Labs for voice interaction",
      "TypeID": "@lookup:MJ: AI Agent Types.Name=Loop",
      "Status": "Active",
      "IconClass": "fa-microphone",
      "AgentTypePromptParams": {
        "ElevenLabsAgentID": "to-be-filled-after-creation",
        "VoiceID": "default-voice-id",
        "LLMModel": "gpt-4o-mini"
      }
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
            "PromptID": "@lookup:AI Prompts.Name=Audio Sage - System Prompt",
            "ExecutionOrder": 0,
            "Status": "Active"
          }
        }
      ]
    }
  }
]
```

**Pros:**
- Clean separation of modalities
- Dedicated Eleven Labs integration
- Can have audio-optimized prompts (shorter responses)

**Cons:**
- Two separate agents for users to understand
- Duplicate functionality in different modalities

## Implementation Components (Revised)

### Component 1: Metadata Files (NO DATABASE MIGRATION)

**Required:**
- `/metadata/agents/.audio-sage-agent.json` (if Option 2)
- `/metadata/prompts/templates/audio-sage/audio-sage.template.md` (audio-optimized version of Sage prompt)
- Run `npx mj-sync push` to sync to database

**Optional:**
- Update `/metadata/agents/.sage-agent.json` (if Option 1)

### Component 2: Angular Voice UI Component

**Files:**
- `packages/Angular/Explorer/explorer-core/src/lib/chat/voice-message/voice-message.component.ts`
- `packages/Angular/Explorer/explorer-core/src/lib/chat/voice-message/voice-message.component.html`
- `packages/Angular/Explorer/explorer-core/src/lib/chat/voice-message/voice-message.component.scss`

**Purpose:** Web Audio API recording/playback UI

### Component 3: Eleven Labs Conversational Provider

**File:** `packages/AI/Providers/ElevenLabs/src/ConversationalAgent.ts`

**Purpose:** Extend existing provider with bidirectional audio support

**Key Methods:**
```typescript
class ElevenLabsConversationalAgent {
  async ProcessAudioMessage(
    agentId: string,
    audioBuffer: Buffer,
    options: { DynamicPromptOverride?: string }
  ): Promise<AudioMessageResponse>

  async GetOrCreateAgent(config: {
    Name: string;
    VoiceId: string;
    LLMModel: string;
    SystemPrompt: string;
  }): Promise<string>
}
```

### Component 4: MJAPI Audio Sage Service

**File:** `packages/MJAPI/src/services/AudioSageService.ts`

**Purpose:** Orchestrate conversation flow using existing MJ entities

**Responsibilities:**
- Load/create Audio Sage agent record via `Metadata.GetEntityObject<AIAgentEntity>('AI Agents')`
- Create `ConversationEntity` with `ExternalID` = Eleven Labs conversation ID
- Create `ConversationDetailEntity` records for each message
- Gather MJ context (available agents/actions) from database
- Render dynamic Sage prompt using Handlebars
- Call `ElevenLabsConversationalAgent.ProcessAudioMessage()` with prompt override

### Component 5: GraphQL Resolver

**File:** `packages/MJAPI/src/resolvers/AudioSageResolver.ts`

**Mutation:**
```graphql
type Mutation {
  processVoiceMessage(input: ProcessVoiceMessageInput!): ProcessVoiceMessageResult!
}

input ProcessVoiceMessageInput {
  audioData: String!  # Base64 encoded audio
  mimeType: String!
  conversationId: String
}

type ProcessVoiceMessageResult {
  success: Boolean!
  textResponse: String
  audioResponseUrl: String
  conversationId: String
  conversationDetailId: String
  errorMessage: String
}
```

**Behavior:**
- Decode base64 audio
- Call `AudioSageService.processVoiceMessage()`
- Save audio response to temp file
- Return file URL + text transcript
- All conversation tracking via existing `Conversation`/`ConversationDetail` entities

### Component 6: Angular GraphQL Service

**File:** `packages/Angular/Explorer/explorer-core/src/lib/chat/services/audio-sage-graphql.service.ts`

**Purpose:** Apollo client wrapper for `processVoiceMessage` mutation

## Database Schema Impact: ZERO

**No migrations needed.** The existing schema supports this use case:

1. **Audio Modality** - Already exists
2. **AIAgentModality** - Links agent to Audio modality via metadata
3. **Conversation/ConversationDetail** - Stores transcripts with `ExternalID` for Eleven Labs conversation ID
4. **AIAgent** - Agent record created via metadata sync
5. **ActionExecutionLog** - Already tracks tool executions

## Configuration Storage

**Where to store Eleven Labs agent ID?**

Since `AIAgent` table doesn't have a generic `Configuration` column, use one of these existing fields:

1. **AgentTypePromptParams** (NVARCHAR(MAX)) - JSON field for agent type-specific params
   - **This is the right field** - it's designed for exactly this use case
   - Store: `{ "ElevenLabsAgentID": "abc123", "VoiceID": "xyz", "LLMModel": "gpt-4o-mini" }`

2. **PayloadScope** or other JSON fields - Could work but semantically wrong

**Decision: Use `AgentTypePromptParams`** - it's designed for storing agent configuration that differs from type defaults.

## Deployment Sequence

1. **Metadata Creation**
   - Create `/metadata/prompts/templates/audio-sage/audio-sage.template.md`
   - Create `/metadata/agents/.audio-sage-agent.json` (or update `.sage-agent.json`)
   - Run `npx mj-sync validate` to check
   - Run `npx mj-sync push` to sync to database

2. **Code Implementation**
   - Build Eleven Labs conversational provider
   - Build MJAPI service layer
   - Build Angular voice UI
   - Build GraphQL resolver
   - Build Angular GraphQL service

3. **Integration**
   - Register resolver in MJAPI
   - Add voice UI to chat component
   - Test end-to-end flow

## Summary of Corrections

**What I got wrong initially:**
- ❌ Proposed custom `AudioSageAgent`, `AudioSageConversation`, `AudioSageToolExecution` tables
- ❌ Violated MJ's metadata-driven philosophy
- ❌ Duplicated functionality already in `Conversation`/`ConversationDetail`
- ❌ Ignored existing `AIModality` and `AIAgentModality` system

**What the correct approach is:**
- ✅ Use existing `AIModality` table - Audio modality already exists
- ✅ Use existing `AIAgentModality` to link agent to Audio modality
- ✅ Use existing `Conversation`/`ConversationDetail` for all conversation tracking
- ✅ Store Eleven Labs conversation ID in `ConversationDetail.ExternalID`
- ✅ Store Eleven Labs agent config in `AIAgent.AgentTypePromptParams`
- ✅ Define agent in `/metadata/agents/` and sync to database
- ✅ Zero schema changes - pure metadata-driven approach

This is **exactly what MemberJunction's metadata system was designed for**.
