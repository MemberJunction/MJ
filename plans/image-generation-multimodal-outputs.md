# Image Generation & Multi-Modal Agent Outputs

## Overview

This plan covers the complete implementation of image generation capabilities and multi-modal output support for MemberJunction agents. The work enables agents to generate images (and eventually audio/video) and have those outputs flow through to the conversation UI.

**Branch**: `claude/image-generation-api-DFli7`
**PR**: #1748
**Target Version**: v3.1.x

## Goals

1. Enable AI agents to generate images using multiple providers (OpenAI, Google/Gemini, Black Forest Labs/FLUX)
2. Store all generated media with complete audit trail at the prompt run level
3. Allow agents to explicitly "promote" generated media to their outputs
4. Flow promoted media to conversation UI for display to users
5. Design the system to support future modalities (audio, video)

## Architecture

### Data Flow

```
[BaseImageGenerator] ──generates──> [ImageGenerationResult]
         │
         │ (prompt runner stores)
         ▼
[AIPromptRunMedia] ◄── Complete audit trail of all generated media
         │
         │ (agent promotes by reference)
         ▼
[AIAgentRunMedia] ◄── Agent's chosen outputs (references SourcePromptRunMediaID)
         │
         │ (framework copies to conversation)
         ▼
[ConversationDetailAttachment] ◄── User-facing UI display
```

### Key Design Decisions

1. **Explicit Promotion**: Agents explicitly decide which media to surface (not automatic)
2. **Reference-Based**: AIAgentRunMedia links to source via `SourcePromptRunMediaID` to avoid data duplication
3. **Modality Agnostic**: Same pattern works for images, audio, video
4. **Storage Flexibility**: Small media inline, large media in MJStorage

## Implementation Phases

### Phase 1: Database Schema (COMPLETE)
- [x] Add AIPromptRunMedia table
- [x] Add AIAgentRunMedia table
- [x] Foreign keys to AIPromptRun, AIAgentRun, AIModality, Files
- [x] Indexes for efficient queries

### Phase 2: Image Generation Infrastructure (COMPLETE)
- [x] BaseImageGenerator abstract class in @memberjunction/ai
- [x] ImageGenerationParams and ImageGenerationResult types
- [x] OpenAIImageGenerator implementation
- [x] GeminiImageGenerator implementation (Nano Banana Pro)
- [x] FLUXImageGenerator implementation (Black Forest Labs)
- [x] GenerateImageAction in CoreActions
- [x] Bundle registration for all image generators
- [x] AI Model metadata for image generation models

### Phase 3: Prompt Runner Media Storage (TODO)
- [ ] Create AIPromptRunMediaEntity in generated entities (CodeGen)
- [ ] Add media storage logic to AIPromptRunner
- [ ] Store generated images to AIPromptRunMedia after generation
- [ ] Handle both inline storage and MJStorage based on size
- [ ] Generate thumbnails for large images
- [ ] Return media references in AIPromptRunResult

### Phase 4: Agent Media Output Types (TODO)
- [ ] Define MediaOutput interface in @memberjunction/ai-core-plus
- [ ] Define MediaAccumulator interface for agent execution context
- [ ] Add mediaOutputs field to ExecuteAgentResult
- [ ] Create AIAgentRunMediaEntity in generated entities (CodeGen)

### Phase 5: Agent Type Media Promotion (TODO)
- [ ] Add media accumulator to BaseAgent execution context
- [ ] Implement media promotion in FlowAgentType
  - [ ] Support output mapping syntax: `'Images[0]': '@mediaOutput:label'`
  - [ ] Handle multiple image promotion
- [ ] Implement media promotion in LoopAgentType
  - [ ] Add promoteMediaOutputs to BaseAgentNextStep
- [ ] Test sub-agent media bubbling

### Phase 6: Agent Runner Integration (TODO)
- [ ] Update AgentRunner to initialize media accumulator
- [ ] Save promoted media to AIAgentRunMedia after agent completes
- [ ] Handle SourcePromptRunMediaID linking
- [ ] Copy metadata (label, etc.) to agent run media

### Phase 7: Conversation Integration (TODO)
- [ ] Update RunAIAgentResolver to process mediaOutputs
- [ ] Copy AIAgentRunMedia to ConversationDetailAttachment
- [ ] Use existing ConversationAttachmentService infrastructure
- [ ] Handle storage decisions (inline vs MJStorage)

### Phase 8: Testing & Validation (TODO)
- [ ] Unit tests for image generators
- [ ] Integration test: image generation -> prompt run media
- [ ] Integration test: agent promotion -> agent run media
- [ ] End-to-end test: agent -> conversation UI display
- [ ] Performance testing with large images

## New Database Tables

### AIPromptRunMedia (MJ: AI Prompt Run Media)

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier | Primary key |
| PromptRunID | uniqueidentifier | FK to AIPromptRun |
| ModalityID | uniqueidentifier | FK to AIModality |
| MimeType | nvarchar(100) | e.g., 'image/png' |
| FileName | nvarchar(255) | Original filename |
| FileSizeBytes | int | Size of the media |
| Width | int | Pixel width (images/video) |
| Height | int | Pixel height (images/video) |
| DurationSeconds | decimal(10,2) | Duration (audio/video) |
| InlineData | nvarchar(max) | Base64 data for small files |
| FileID | uniqueidentifier | FK to Files (MJStorage) |
| ThumbnailBase64 | nvarchar(max) | Thumbnail preview |
| Metadata | nvarchar(max) | JSON: seed, revisedPrompt, etc. |
| DisplayOrder | int | Order for multiple media |

### AIAgentRunMedia (MJ: AI Agent Run Media)

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier | Primary key |
| AgentRunID | uniqueidentifier | FK to AIAgentRun |
| SourcePromptRunMediaID | uniqueidentifier | FK to AIPromptRunMedia (if promoted) |
| ModalityID | uniqueidentifier | FK to AIModality |
| MimeType | nvarchar(100) | e.g., 'image/png' |
| FileName | nvarchar(255) | Original filename |
| FileSizeBytes | int | Size of the media |
| Width | int | Pixel width (images/video) |
| Height | int | Pixel height (images/video) |
| DurationSeconds | decimal(10,2) | Duration (audio/video) |
| InlineData | nvarchar(max) | Only if NOT from prompt run |
| FileID | uniqueidentifier | Only if NOT from prompt run |
| ThumbnailBase64 | nvarchar(max) | Thumbnail preview |
| Label | nvarchar(255) | Agent-provided label |
| Metadata | nvarchar(max) | JSON metadata |
| DisplayOrder | int | Order for multiple media |

## TypeScript Types

### MediaOutput (in ExecuteAgentResult)

```typescript
export interface MediaOutput {
    /** Reference to source AIPromptRunMedia (if promoted from prompt) */
    promptRunMediaId?: string;

    /** Modality type */
    modality: 'Image' | 'Audio' | 'Video';

    /** MIME type */
    mimeType: string;

    /** Base64 data (only if NOT from prompt run) */
    data?: string;

    /** URL (some providers return URLs) */
    url?: string;

    /** Dimensions */
    width?: number;
    height?: number;

    /** Duration for audio/video */
    durationSeconds?: number;

    /** Agent-provided label */
    label?: string;

    /** Provider-specific metadata */
    metadata?: Record<string, unknown>;
}
```

### Extended ExecuteAgentResult

```typescript
export type ExecuteAgentResult<P = any> = {
    success: boolean;
    payload?: P;
    agentRun: AIAgentRunEntityExtended;
    payloadArtifactTypeID?: string;
    responseForm?: AgentResponseForm;
    actionableCommands?: ActionableCommand[];
    automaticCommands?: AutomaticCommand[];
    memoryContext?: {...};

    /** Multi-modal outputs generated by the agent */
    mediaOutputs?: MediaOutput[];
}
```

## Files to Modify

### Core AI Package
- `packages/AI/Core/src/generic/baseImage.ts` - Already complete
- `packages/AI/Core/src/index.ts` - Already exports baseImage

### AI Providers
- `packages/AI/Providers/OpenAI/src/models/openAIImage.ts` - Already complete
- `packages/AI/Providers/Gemini/src/models/geminiImage.ts` - Already complete
- `packages/AI/Providers/BlackForestLabs/src/index.ts` - Already complete
- `packages/AI/Providers/Bundle/src/index.ts` - Already registers providers

### AI CorePlus (Types)
- `packages/AI/CorePlus/src/agent-types.ts` - Add mediaOutputs to ExecuteAgentResult
- `packages/AI/CorePlus/src/prompt.types.ts` - Add media references to AIPromptRunResult

### AI Prompts
- `packages/AI/Prompts/src/AIPromptRunner.ts` - Store media to AIPromptRunMedia

### AI Agents
- `packages/AI/Agents/src/base-agent.ts` - Add media accumulator
- `packages/AI/Agents/src/AgentRunner.ts` - Save to AIAgentRunMedia
- `packages/AI/Agents/src/agent-types/flow-agent-type.ts` - Media promotion
- `packages/AI/Agents/src/agent-types/loop-agent-type.ts` - Media promotion

### Server
- `packages/MJServer/src/resolvers/RunAIAgentResolver.ts` - Copy to ConversationDetailAttachment

### Actions
- `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts` - Already complete

### Migration
- `migrations/v2/V202601121807__v3.1.x__Add_Image_Generation_Models.sql` - Complete

## Image Generation Models Added

| Model | Vendor | API Name | Driver Class |
|-------|--------|----------|--------------|
| GPT-4o Image 1.5 | OpenAI | gpt-image-1.5 | OpenAIImageGenerator |
| GPT-4o Image 1.0 | OpenAI | gpt-image-1 | OpenAIImageGenerator |
| Nano Banana Pro | Google | gemini-3-pro-image-preview | GeminiImageGenerator |
| FLUX.2 Pro | Black Forest Labs | flux-2-pro | FLUXImageGenerator |
| FLUX 1.1 Pro | Black Forest Labs | flux-1.1-pro | FLUXImageGenerator |

## Success Criteria

1. Image generation works via GenerateImageAction
2. Generated images are stored in AIPromptRunMedia with full metadata
3. Agents can promote images to their outputs
4. Promoted images are stored in AIAgentRunMedia
5. Images flow to ConversationDetailAttachment and display in UI
6. Multiple images can be generated and selectively promoted
7. System handles both small (inline) and large (MJStorage) images
8. Pattern is extensible for audio/video modalities

## Notes

- CodeGen will create entity classes after migration runs
- Existing ConversationAttachmentService handles storage decisions
- AIModality table already has Image, Audio, Video modalities
- AIAgentModality supports Direction: 'Output' for agent output modalities
