# Image Generation & Multi-Modal Agent Outputs

## Overview

This plan covers the complete implementation of image generation capabilities and multi-modal output support for MemberJunction agents. The work enables agents to generate images (and eventually audio/video) and have those outputs flow through to the conversation UI.

**Branch**: `lists-additional-features` (merged from `claude/image-generation-api-DFli7`)
**PR**: #1748
**Target Version**: v3.1.x
**Status**: Core Infrastructure Complete ✅

## Goals

1. Enable AI agents to generate images using multiple providers (OpenAI, Google/Gemini, Black Forest Labs/FLUX)
2. Store all generated media with complete audit trail at the prompt run level
3. Allow agents to explicitly "promote" generated media to their outputs
4. Flow promoted media to conversation UI for display to users
5. Design the system to support future modalities (audio, video)

## Architecture

### Data Flow

```
[GenerateImageAction] ──generates──> [ImageGenerationResult]
         │
         │ (action returns to agent)
         ▼
[Agent.promoteMediaOutputs()] ◄── Agent decides what to surface
         │
         │ (framework saves on completion)
         ▼
[AIAgentRunMedia] ◄── Permanent storage of promoted media
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

## Implementation Status

### Phase 1: Database Schema ✅ COMPLETE
- [x] Add AIPromptRunMedia table
- [x] Add AIAgentRunMedia table
- [x] Foreign keys to AIPromptRun, AIAgentRun, AIModality, Files
- [x] Indexes for efficient queries
- [x] Added 'Per Image' price unit type for image generation pricing

### Phase 2: Image Generation Infrastructure ✅ COMPLETE
- [x] BaseImageGenerator abstract class in @memberjunction/ai
- [x] ImageGenerationParams and ImageGenerationResult types
- [x] OpenAIImageGenerator implementation (gpt-image-1, gpt-image-1.5)
- [x] GeminiImageGenerator implementation (Nano Banana Pro)
- [x] FLUXImageGenerator implementation (Black Forest Labs FLUX.2 Pro, FLUX 1.1 Pro)
- [x] GenerateImageAction in CoreActions
- [x] Bundle registration for all image generators
- [x] AI Model metadata for image generation models

### Phase 3: Media Type Definitions ✅ COMPLETE
- [x] MediaModality type in @memberjunction/ai-core-plus
- [x] PromptRunMediaReference interface for prompt-level tracking
- [x] MediaOutput interface for agent outputs
- [x] Extended AIPromptRunResult with `media` field
- [x] Extended ExecuteAgentResult with `mediaOutputs` field
- [x] Added `promoteMediaOutputs` field to BaseAgentNextStep

### Phase 4: Agent Media Accumulation ✅ COMPLETE
- [x] Added `_mediaOutputs` array to BaseAgent
- [x] Added `promoteMediaOutputs()` method for explicit promotion
- [x] Added `MediaOutputs` getter for accumulated media
- [x] Reset media accumulator at start of each run
- [x] Process `promoteMediaOutputs` from each step in execution loop
- [x] Include accumulated media in `finalizeAgentRun()` result

### Phase 5: Agent Runner Integration ✅ COMPLETE
- [x] Added `SaveAgentRunMedia()` method to save media to AIAgentRunMedia
- [x] Added `CreateConversationMediaAttachments()` for UI display
- [x] Updated `RunAgentInConversation()` to process media outputs
- [x] Proper modality ID lookup from AIModality table
- [x] MIME type extension mapping for file naming

### Phase 6: Testing & Validation (PENDING)
- [ ] Unit tests for image generators
- [ ] Integration test: image generation -> agent run media
- [ ] Integration test: agent promotion -> conversation attachment
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

### BaseAgent Media Methods

```typescript
// Promote media outputs to agent's final results
public promoteMediaOutputs(mediaOutputs: MediaOutput[]): void;

// Get accumulated media outputs
public get MediaOutputs(): MediaOutput[];
```

### BaseAgentNextStep Extension

```typescript
export type BaseAgentNextStep<P = any> = {
    // ... existing fields ...

    /** Media outputs to promote to the agent's final outputs */
    promoteMediaOutputs?: MediaOutput[];
}
```

## Files Modified

### Core AI Package
- `packages/AI/Core/src/generic/baseImage.ts` - Complete ✅
- `packages/AI/Core/src/index.ts` - Exports baseImage ✅

### AI Providers
- `packages/AI/Providers/OpenAI/src/models/openAIImage.ts` - Complete ✅
- `packages/AI/Providers/Gemini/src/models/geminiImage.ts` - Complete ✅
- `packages/AI/Providers/BlackForestLabs/src/index.ts` - Complete ✅
- `packages/AI/Providers/Bundle/src/index.ts` - Registers providers ✅

### AI CorePlus (Types)
- `packages/AI/CorePlus/src/prompt.types.ts` - Added MediaModality, PromptRunMediaReference, media field ✅
- `packages/AI/CorePlus/src/agent-types.ts` - Added MediaOutput, mediaOutputs, promoteMediaOutputs ✅

### AI Agents
- `packages/AI/Agents/src/base-agent.ts` - Added media accumulator and promotion methods ✅
- `packages/AI/Agents/src/AgentRunner.ts` - Added SaveAgentRunMedia and CreateConversationMediaAttachments ✅

### Actions
- `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts` - Complete ✅

### Migration
- `migrations/v2/V202601121807__v3.1.x__Add_Image_Generation_Models.sql` - Complete ✅

## Image Generation Models Added

| Model | Vendor | API Name | Driver Class |
|-------|--------|----------|--------------|
| GPT-4o Image 1.5 | OpenAI | gpt-image-1.5 | OpenAIImageGenerator |
| GPT-4o Image 1.0 | OpenAI | gpt-image-1 | OpenAIImageGenerator |
| Nano Banana Pro | Google | gemini-3-pro-image-preview | GeminiImageGenerator |
| FLUX.2 Pro | Black Forest Labs | flux-2-pro | FLUXImageGenerator |
| FLUX 1.1 Pro | Black Forest Labs | flux-1.1-pro | FLUXImageGenerator |

## Usage Example

### Agent Promoting Generated Images

```typescript
// In a custom agent or agent type
const actionResult = await this.ExecuteSingleAction(params, generateImageAction, actionEntity, contextUser);

// Check for generated images in the action result
const images = actionResult.Params.find(p => p.Name === 'Images')?.Value;
if (images && Array.isArray(images)) {
    const mediaOutputs: MediaOutput[] = images.map((img, index) => ({
        modality: 'Image',
        mimeType: `image/${img.format || 'png'}`,
        data: img.base64,
        width: img.width,
        height: img.height,
        label: `Generated Image ${index + 1}`,
        metadata: { revisedPrompt: actionResult.Params.find(p => p.Name === 'RevisedPrompt')?.Value }
    }));

    // Promote to agent outputs
    this.promoteMediaOutputs(mediaOutputs);
}
```

## Success Criteria

1. ✅ Image generation works via GenerateImageAction
2. ✅ MediaOutput interface defined and integrated
3. ✅ Agents can promote images to their outputs via `promoteMediaOutputs()`
4. ✅ Promoted images stored in AIAgentRunMedia
5. ✅ Images flow to ConversationDetailAttachment for UI display
6. ✅ Multiple images can be generated and selectively promoted
7. ⏳ System handles both small (inline) and large (MJStorage) images (inline complete, MJStorage pending)
8. ✅ Pattern is extensible for audio/video modalities

## Future Work

1. **Prompt Run Media Storage**: Store media at prompt execution level (AIPromptRunMedia) for complete audit trail
2. **MJStorage Integration**: Move large media files to cloud storage with FileID references
3. **Thumbnail Generation**: Auto-generate thumbnails for large images
4. **Flow Agent Support**: Add output mapping syntax for promoting media in Flow agents
5. **Loop Agent Support**: Add media accumulation across loop iterations
6. **Sub-Agent Media Bubbling**: Allow parent agents to access/promote child agent media

## Notes

- CodeGen has created entity classes after migration ran
- ConversationDetailAttachment entity uses ModalityID reference
- AIModality table already has Image, Audio, Video modalities
- AIAgentModality supports Direction: 'Output' for agent output modalities
