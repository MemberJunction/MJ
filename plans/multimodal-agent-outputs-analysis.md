# Multi-Modal Agent Outputs and Image Generation Infrastructure

## PR Reference
- **PR #1748**: [Post 3.0] feat: Multi-modal agent outputs and image generation infrastructure
- **Branch**: `claude/image-generation-api-DFli7` → `next`
- **Author**: AN-BC
- **Status**: Open for review

---

## Executive Summary

This PR implements comprehensive multi-modal output capabilities for MemberJunction agents, enabling image generation and media flow through the conversation UI. The architecture is designed to be **modality-agnostic**, meaning the same patterns will work for audio and video when those capabilities are added.

### Key Capabilities Added
- `MediaOutput` interface supporting Image, Audio, and Video modalities
- `promoteMediaOutputs()` method allowing agents to explicitly surface generated media
- Automatic flow from generation to `ConversationDetailAttachment` for UI display
- `AIPromptRunMedia` and `AIAgentRunMedia` tables for audit trail and storage
- Three image generation providers: OpenAI GPT-4o Image, Google Nano Banana Pro, Black Forest Labs FLUX

---

## Architecture Overview

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GENERATION LAYER                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  OpenAI Image   │  │  Gemini/Nano    │  │  Black Forest   │              │
│  │  (GPT-4o 1.5)   │  │  Banana Pro     │  │  Labs FLUX      │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                        │
│           └────────────────────┴────────────────────┘                        │
│                                │                                             │
│                    ┌───────────▼───────────┐                                │
│                    │  BaseImageGenerator   │  (Abstract base class)         │
│                    │  - GenerateImage()    │                                │
│                    │  - EditImage()        │                                │
│                    │  - CreateVariation()  │                                │
│                    └───────────┬───────────┘                                │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                          ACTION LAYER                                        │
│                    ┌───────────▼───────────┐                                │
│                    │  GenerateImageAction  │  @RegisterClass(BaseAction,    │
│                    │  - Prompt             │   "Generate Image")            │
│                    │  - Model              │                                │
│                    │  - Size/Quality/Style │                                │
│                    └───────────┬───────────┘                                │
│                                │ Returns ImageGenerationResult              │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                          AGENT LAYER                                         │
│                    ┌───────────▼───────────┐                                │
│                    │     BaseAgent         │                                │
│                    │  _mediaOutputs: []    │  (Private accumulator)         │
│                    │  promoteMediaOutputs()│  (Explicit promotion)          │
│                    │  MediaOutputs getter  │                                │
│                    └───────────┬───────────┘                                │
│                                │                                             │
│                    ┌───────────▼───────────┐                                │
│                    │     AgentRunner       │                                │
│                    │  SaveAgentRunMedia()  │  → AIAgentRunMedia table       │
│                    │  CreateConversation-  │  → ConversationDetailAttachment│
│                    │  MediaAttachments()   │                                │
│                    └───────────┬───────────┘                                │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                        PERSISTENCE LAYER                                     │
│     ┌──────────────────────────┼──────────────────────────────────┐         │
│     │                          │                              │             │
│     ▼                          ▼                              ▼             │
│  ┌─────────────┐      ┌─────────────────┐      ┌────────────────────┐       │
│  │AIPromptRun- │      │ AIAgentRunMedia │      │ConversationDetail- │       │
│  │Media        │      │ (Promoted)      │      │Attachment (UI)     │       │
│  │(Audit Trail)│◄─────│ SourcePromptRun-│      │                    │       │
│  └─────────────┘      │ MediaID (FK)    │      └────────────────────┘       │
│                       └─────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Design Principles

1. **Explicit Promotion**: Agents deliberately choose which media to expose through `promoteMediaOutputs()`. This gives agents control over output quality and relevance—not all generated media needs to be shown to users.

2. **Reference-Based Storage**: The system avoids duplicating media data by using `SourcePromptRunMediaID` links in `AIAgentRunMedia` to reference source content from prompt execution.

3. **Modality Agnosticism**: The architecture treats images identically to planned audio and video support. The same data flow patterns work across all media types without redesign.

---

## Core Type Definitions

### MediaModality

```typescript
// packages/AI/CorePlus/src/prompt.types.ts
export type MediaModality = 'Image' | 'Audio' | 'Video';
```

This foundational type makes the system modality-agnostic. Future audio/video support requires no structural changes—just new generator implementations.

### MediaOutput Interface

```typescript
// packages/AI/CorePlus/src/agent-types.ts
export interface MediaOutput {
    // Classification
    modality: MediaModality;
    mimeType: string;  // e.g., 'image/png', 'audio/mp3', 'video/mp4'

    // Content (mutually exclusive sources)
    promptRunMediaId?: string;  // Reference to existing AIPromptRunMedia
    data?: string;              // Base64-encoded inline data
    url?: string;               // Provider-supplied URL

    // Metadata
    width?: number;
    height?: number;
    durationSeconds?: number;   // For audio/video
    label?: string;             // Agent-provided display text
    metadata?: Record<string, unknown>;  // Provider-specific info
}
```

**Two content sources supported:**
1. **Reference-based**: Points to `AIPromptRunMedia` via `promptRunMediaId` (avoids duplication)
2. **Direct data**: Contains `data` (base64) or `url` (for agents generating media outside prompt execution)

### PromptRunMediaReference

```typescript
// packages/AI/CorePlus/src/prompt.types.ts
export interface PromptRunMediaReference {
    id: string;                          // AIPromptRunMedia record ID
    modality: MediaModality;
    mimeType: string;
    fileName?: string;
    fileSizeBytes?: number;
    width?: number;
    height?: number;
    durationSeconds?: number;
    inlineData?: string;                 // Base64
    url?: string;
    thumbnailBase64?: string;
    metadata?: Record<string, unknown>;
    displayOrder: number;
}
```

This captures ALL media generated during prompt execution for the complete audit trail.

---

## Image Generation Provider Architecture

### BaseImageGenerator Abstract Class

**Location**: `packages/AI/Core/src/generic/baseImage.ts`

```typescript
abstract class BaseImageGenerator {
    // Core generation methods
    abstract GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult>;
    abstract EditImage(params: ImageEditParams): Promise<ImageGenerationResult>;
    abstract CreateVariation(params: ImageVariationParams): Promise<ImageGenerationResult>;

    // Provider metadata
    abstract GetModels(): ModelMetadata[];
    abstract GetSupportedMethods(): ('generate' | 'edit' | 'variation')[];

    // Utility methods
    protected normalizeImageInput(input: Buffer | string): string;
    protected createSuccessResult(images: GeneratedImage[]): ImageGenerationResult;
    protected createErrorResult(error: Error): ImageGenerationResult;
}
```

### ImageGenerationParams

```typescript
interface ImageGenerationParams {
    prompt: string;
    negativePrompt?: string;        // What to avoid
    n?: number;                     // Number of images (default 1)
    size?: ImageSize;               // e.g., '1024x1024', '2048x2048'
    quality?: ImageQuality;         // 'standard' | 'hd'
    style?: ImageStyle;             // 'natural' | 'vivid'
    outputFormat?: 'png' | 'jpeg' | 'webp';
    seed?: number;                  // For reproducibility
    aspectRatio?: string;           // e.g., '16:9'
    providerOptions?: Record<string, unknown>;
}
```

### ImageGenerationResult

```typescript
class ImageGenerationResult extends BaseResult {
    images: GeneratedImage[];
    revisedPrompt?: string;         // Safety-adjusted prompt
    usage?: { /* token/cost info */ };
    metadata?: Record<string, unknown>;
}

interface GeneratedImage {
    data?: Buffer;        // Raw bytes
    base64?: string;      // Base64 encoded
    url?: string;         // Provider URL
    width?: number;
    height?: number;
    format?: string;
    contentFilterResults?: { /* safety info */ };
}
```

---

## Provider Implementations

### Available Providers

| Provider | Model Name | Resolution | Price | Driver Class |
|----------|------------|------------|-------|--------------|
| OpenAI | gpt-image-1.5 | Up to 2048x2048 | $0.08/image | OpenAIImageGenerator |
| OpenAI | gpt-image-1 | Up to 1536x1024 | $0.04/image | OpenAIImageGenerator |
| Google | gemini-3-pro-image-preview (Nano Banana Pro) | Up to 4K | $0.05-$0.20/image | GeminiImageGenerator |
| Black Forest Labs | FLUX.2 Pro | Up to 2048x2048 | $0.03/image | FLUXImageGenerator |
| Black Forest Labs | FLUX 1.1 Pro | Up to 1536x1024 | $0.04/image | FLUXImageGenerator |

### OpenAI Implementation

**Location**: `packages/AI/Providers/OpenAI/src/models/openAIImage.ts`

```typescript
@RegisterClass(BaseImageGenerator, 'OpenAIImageGenerator')
class OpenAIImageGenerator extends BaseImageGenerator {
    private _openAI: OpenAI;

    async GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
        const openAIParams = this.buildGenerationParams(params);
        const response = await this._openAI.images.generate(openAIParams);
        return this.processGenerationResponse(response);
    }
}
```

### Gemini/Nano Banana Pro Implementation

**Location**: `packages/AI/Providers/Gemini/src/geminiImage.ts`

```typescript
@RegisterClass(BaseImageGenerator, 'GeminiImageGenerator')
class GeminiImageGenerator extends BaseImageGenerator {
    private _client: GoogleGenAI;

    async GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
        const model = await this._client.getGenerativeModel({
            model: 'gemini-3-pro-image-preview'
        });
        // Supports up to 4K resolution (3840x2160)
        const result = await model.generateContent(config);
        return this.extractImages(result);
    }
}
```

### Black Forest Labs FLUX Implementation

**Location**: `packages/AI/Providers/BlackForestLabs/src/index.ts`

Uses **async polling pattern** because FLUX is task-based:

```typescript
@RegisterClass(BaseImageGenerator, 'FLUXImageGenerator')
class FLUXImageGenerator extends BaseImageGenerator {
    private pollInterval = 2000;   // 2 seconds
    private maxWaitTime = 120000;  // 2 minutes

    async GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
        // 1. Submit task
        const taskId = await this.submitGenerationTask(params);

        // 2. Poll for completion
        const result = await this.pollForResult(taskId);

        // 3. Download and convert to base64
        const image = await this.downloadAndConvert(result.output_url);

        return this.createSuccessResult([image]);
    }
}
```

---

## GenerateImageAction

**Location**: `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts`

This is the action that agents use to generate images:

```typescript
@RegisterClass(BaseAction, "Generate Image")
class GenerateImageAction extends BaseAction {

    async InternalRunAction(params: ActionParams, contextUser: UserInfo): Promise<ActionResultSimple> {
        // 1. Extract parameters
        const prompt = this.getParamValue('Prompt', params);
        const modelName = this.getParamValue('Model', params);
        const size = this.getParamValue('Size', params) || '1024x1024';
        const quality = this.getParamValue('Quality', params) || 'standard';
        const n = parseInt(this.getParamValue('NumberOfImages', params) || '1');

        // 2. Prepare generator (finds active model + provider + API key)
        const { generator, model } = await this.prepareImageGenerator(modelName, contextUser);

        // 3. Build params and generate
        const genParams: ImageGenerationParams = {
            prompt,
            n,
            size,
            quality,
            style: this.getParamValue('Style', params),
            negativePrompt: this.getParamValue('NegativePrompt', params),
            outputFormat: 'png'
        };

        const result = await generator.GenerateImage(genParams);

        // 4. Format output
        return new ActionResultSimple({
            Success: result.success,
            Message: result.success ? `Generated ${result.images.length} image(s)` : result.errorMessage,
            ResultCode: result.success ? 'SUCCESS' : 'ERROR',
            Output: {
                Images: result.images.map(img => this.formatImageOutput(img)),
                ImageCount: result.images.length,
                RevisedPrompt: result.revisedPrompt,
                Model: model.Name
            }
        });
    }
}
```

**Action Parameters:**
- `Prompt` (required): Image description
- `Model` (optional): Specific model name
- `NumberOfImages` (optional): Default 1
- `Size` (optional): Default '1024x1024'
- `Quality` (optional): 'standard' or 'hd'
- `Style` (optional): 'natural' or 'vivid'
- `NegativePrompt` (optional): What to avoid
- `OutputFormat` (optional): 'png', 'jpeg', 'webp'

---

## Agent Media Promotion System

### BaseAgent Changes

**Location**: `packages/AI/Agents/src/base-agent.ts`

```typescript
class BaseAgent {
    /**
     * Accumulated media outputs that agents have explicitly promoted.
     * Collected during execution, returned in ExecuteAgentResult.mediaOutputs.
     * Stored to AIAgentRunMedia when agent completes.
     */
    private _mediaOutputs: MediaOutput[] = [];

    /**
     * Agents call this to promote media to their final outputs.
     * This is EXPLICIT - agents choose what to surface.
     */
    public promoteMediaOutputs(mediaOutputs: MediaOutput[]): void {
        if (mediaOutputs && mediaOutputs.length > 0) {
            this._mediaOutputs.push(...mediaOutputs);
            this.logStatus(`📎 Promoted ${mediaOutputs.length} media output(s)`, true);
        }
    }

    public get MediaOutputs(): MediaOutput[] {
        return [...this._mediaOutputs];  // Return copy
    }

    protected async Execute(): Promise<ExecuteAgentResult> {
        // Reset at start of each run
        this._mediaOutputs = [];

        // ... agent execution logic ...

        // After each step, check for media to promote
        if (nextStep.promoteMediaOutputs?.length > 0) {
            this.promoteMediaOutputs(nextStep.promoteMediaOutputs);
        }

        // Include in final result
        return {
            success: true,
            payload,
            agentRun: this._agentRun,
            mediaOutputs: this._mediaOutputs.length > 0 ? this._mediaOutputs : undefined
        };
    }
}
```

### Agent Usage Pattern

```typescript
// Inside a custom agent's step logic
const result = await this.executeAction('Generate Image', {
    Prompt: 'A diagram showing the system architecture',
    Model: 'Nano Banana Pro'
}, contextUser);

if (result.Success) {
    const images = result.Output.Images;

    // Promote the image to agent outputs
    this.promoteMediaOutputs([{
        modality: 'Image',
        mimeType: 'image/png',
        data: images[0].Base64,
        label: 'System Architecture Diagram',
        width: images[0].Width,
        height: images[0].Height
    }]);

    // The image will now:
    // 1. Be saved to AIAgentRunMedia
    // 2. Be copied to ConversationDetailAttachment for UI display
}
```

---

## AgentRunner Media Persistence

**Location**: `packages/AI/Agents/src/AgentRunner.ts`

### SaveAgentRunMedia Method

```typescript
private async SaveAgentRunMedia(
    agentRunId: string,
    mediaOutputs: MediaOutput[],
    contextUser: UserInfo
): Promise<string[]> {
    const savedIds: string[] = [];
    const md = new Metadata();

    for (let i = 0; i < mediaOutputs.length; i++) {
        const media = mediaOutputs[i];

        try {
            const entity = await md.GetEntityObject<AIAgentRunMediaEntity>(
                'MJ: AI Agent Run Medias',
                contextUser
            );

            // Resolve modality ID from cached AIEngine data
            const modalityId = this.getModalityId(media.modality);

            entity.AgentRunID = agentRunId;
            entity.ModalityID = modalityId;
            entity.MimeType = media.mimeType;
            entity.DisplayOrder = i + 1;

            // Optional fields
            if (media.promptRunMediaId) {
                entity.SourcePromptRunMediaID = media.promptRunMediaId;
            }
            if (media.data) {
                entity.InlineData = media.data;
                entity.FileSizeBytes = Math.round(media.data.length * 0.75);
            }
            if (media.width) entity.Width = media.width;
            if (media.height) entity.Height = media.height;
            if (media.durationSeconds) entity.DurationSeconds = media.durationSeconds;
            if (media.label) entity.Label = media.label;
            if (media.metadata) entity.Metadata = JSON.stringify(media.metadata);

            await entity.Save();
            savedIds.push(entity.ID);

        } catch (error) {
            LogError(`Failed to save media ${i + 1}: ${error.message}`);
        }
    }

    return savedIds;
}
```

### CreateConversationMediaAttachments Method

```typescript
private async CreateConversationMediaAttachments(
    conversationDetailId: string,
    mediaOutputs: MediaOutput[],
    mediaIds: string[],
    contextUser: UserInfo
): Promise<string[]> {
    const attachmentIds: string[] = [];
    const md = new Metadata();

    for (let i = 0; i < mediaOutputs.length; i++) {
        const media = mediaOutputs[i];

        try {
            const attachment = await md.GetEntityObject<ConversationDetailAttachmentEntity>(
                'Conversation Detail Attachments',
                contextUser
            );

            attachment.ConversationDetailID = conversationDetailId;
            attachment.Type = media.modality;
            attachment.MimeType = media.mimeType;

            // Generate filename
            const ext = this.getMimeTypeExtension(media.mimeType);
            attachment.Name = media.label || `${media.modality}_${i + 1}.${ext}`;

            if (media.data) {
                attachment.InlineData = media.data;
                attachment.FileSize = Math.round(media.data.length * 0.75);
            }

            if (media.width) attachment.Width = media.width;
            if (media.height) attachment.Height = media.height;

            // Link to AIAgentRunMedia
            if (mediaIds[i]) {
                attachment.SourceRecordID = mediaIds[i];
                attachment.SourceEntityName = 'MJ: AI Agent Run Medias';
            }

            await attachment.Save();
            attachmentIds.push(attachment.ID);

        } catch (error) {
            LogError(`Failed to create attachment ${i + 1}: ${error.message}`);
        }
    }

    return attachmentIds;
}
```

---

## Database Schema

### New Tables

**AIPromptRunMedia** - Audit trail for ALL media generated during prompts:

```sql
CREATE TABLE ${flyway:defaultSchema}.AIPromptRunMedia (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    PromptRunID UNIQUEIDENTIFIER NOT NULL,  -- FK to AIPromptRun
    ModalityID UNIQUEIDENTIFIER NOT NULL,   -- FK to AIModality
    MimeType NVARCHAR(100) NOT NULL,
    FileName NVARCHAR(500) NULL,
    FileSizeBytes INT NULL,
    Width INT NULL,
    Height INT NULL,
    DurationSeconds DECIMAL(10,3) NULL,     -- For audio/video
    InlineData NVARCHAR(MAX) NULL,          -- Base64 content
    FileID UNIQUEIDENTIFIER NULL,           -- FK to File table
    ThumbnailBase64 NVARCHAR(MAX) NULL,
    Metadata NVARCHAR(MAX) NULL,            -- JSON blob
    DisplayOrder INT NOT NULL DEFAULT 1,
    __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()
);
```

**AIAgentRunMedia** - Promoted media from agents:

```sql
CREATE TABLE ${flyway:defaultSchema}.AIAgentRunMedia (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    AgentRunID UNIQUEIDENTIFIER NOT NULL,           -- FK to AIAgentRun
    SourcePromptRunMediaID UNIQUEIDENTIFIER NULL,   -- FK to AIPromptRunMedia
    ModalityID UNIQUEIDENTIFIER NOT NULL,
    MimeType NVARCHAR(100) NOT NULL,
    FileName NVARCHAR(500) NULL,
    FileSizeBytes INT NULL,
    Width INT NULL,
    Height INT NULL,
    DurationSeconds DECIMAL(10,3) NULL,
    InlineData NVARCHAR(MAX) NULL,
    FileID UNIQUEIDENTIFIER NULL,
    ThumbnailBase64 NVARCHAR(MAX) NULL,
    Label NVARCHAR(500) NULL,                       -- Agent-provided display text
    Metadata NVARCHAR(MAX) NULL,
    DisplayOrder INT NOT NULL DEFAULT 1,
    __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()
);
```

### Migration File

**Location**: `migrations/v2/V202601121807__v3.1.x__Add_Image_Generation_Models.sql`

---

## Design Analysis

### Strengths

1. **Modality Agnosticism**: The `MediaModality` type and consistent interfaces mean audio/video support requires only new generator implementations—no structural changes.

2. **Explicit Promotion Pattern**: Agents consciously choose what media to expose via `promoteMediaOutputs()`. This prevents accidental leakage of intermediate/debug images.

3. **Reference-Based Storage**: Using `SourcePromptRunMediaID` to link to original content avoids data duplication between prompt-level and agent-level storage.

4. **Graceful Error Handling**: Both `SaveAgentRunMedia` and `CreateConversationMediaAttachments` continue processing if individual items fail.

5. **Provider Abstraction**: Clean separation between base class and implementations allows easy addition of new providers.

### Areas to Monitor

1. **Base64 Storage Efficiency**: Base64 is ~33% less efficient than binary. For production with many images:
   - Consider future migration path to File table storage with `FileID`
   - Add configuration option for storage strategy

2. **FLUX Polling Overhead**: The async polling pattern (2s intervals, 2min timeout) ties up server resources for long-running requests. Consider:
   - Webhook-based approach for production
   - Timeout handling in agents

3. **Sub-Agent Media Bubbling**: Currently not implemented. If AgentA calls AgentB which generates an image, it won't automatically bubble up to AgentA's outputs.

4. **ConversationDetailAttachment Coupling**: Direct creation ties this to conversation UI. For non-conversational use cases (batch processing, APIs), consider making attachment creation optional.

5. **No Size Limits**: No validation on `InlineData` size. Consider adding limits to prevent memory issues with very large images.

---

## Amith's Direction (from call 2026-01-13)

> Read the PR and think deeply about multi-modality in MJ and agents. Come back with any critique on the design and we can talk about adjustments. Test and build the PR and see if Nano Banana Pro, Chat GPT Image, and Flux all work in getting images back. Wire up Research Agent to have access to a new action to generate images so it can use Nano Banana to generate infographics and diagrams - we need to then have the agent place the base64 image output into an `<img src=...>` tag where `...` is the base64 embedded content for the generated image. Base64 is about 1/3 less efficient for persisting images but is ok for our purposes here, these won't be enormous images. Also test just general conversations in MJ with agents that can emit images and see if they work. Enable Sage to be fully multi-modal including image output - I have done this for Sage with a configuration where Sage uses Llama 4 Maverick which can take images as input tokens.

---

## Current Status (2026-01-13)

### Completed
- [x] Generate Image action created and synced to database
- [x] OpenAI Image provider fixed for GPT Image models (gpt-image-1, gpt-image-1.5)
  - Fixed API parameter mismatch: GPT Image uses `output_format` (png/jpeg/webp), DALL-E uses `response_format` (url/b64_json)
  - Fixed quality values: GPT Image uses `high/medium/low`, DALL-E uses `hd/standard`
  - Proper TypeScript types added (no `any` or `unknown` casts)
- [x] **Nano Banana Pro (Google)**: Working ✅
- [ ] **GPT-4o Image (OpenAI)**: Returns 403 - "organization must be verified" (API fix confirmed working)
- [ ] **FLUX (Black Forest Labs)**: Untested (needs API key verification)

### In Progress
- [ ] Wire Research Agent / Report Writer with Generate Image action
- [ ] Update Report Writer prompt for image generation guidance

### Blocked
- OpenAI GPT Image models require organization verification

---

## Architecture Analysis & Gaps

### Key Finding: Action → Agent Media Flow Not Automatic

The PR #1748 adds excellent **infrastructure** for multi-modal outputs, but there's a gap in **automatic promotion** of action-generated media to agent outputs.

**Current Architecture:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Generate Image Action                                                       │
│  └── Returns: { Images: [{ base64, url, format, width, height }] }          │
│                          ↓                                                   │
│                    Action Result                                             │
│                          ↓                                                   │
│                    Agent receives result in JSON                             │
│                          ↓                                                   │
│                    ??? GAP: How does agent call promoteMediaOutputs() ???   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**The Gap:**
1. `BaseAgentNextStep.promoteMediaOutputs` field exists ✅
2. `BaseAgent.promoteMediaOutputs()` method exists ✅
3. **BUT** `LoopAgentResponse` (what the LLM returns) does NOT have `promoteMediaOutputs` field ❌

**Implication:** The LLM cannot currently request media promotion through its JSON response. The infrastructure is designed for:
- Native model image outputs (like GPT-4o generating images in chat)
- Custom agent code calling `promoteMediaOutputs()` directly

**For Loop agents (Research Agent, Report Writer):** The agent can use image data in its text response (e.g., embed as `<img>` tag), but automatic persistence to `AIAgentRunMedia` → `ConversationDetailAttachment` requires either:
1. Adding `promoteMediaOutputs` to `LoopAgentResponse` schema (future enhancement)
2. Auto-extracting media from action outputs in `executeActionsStep()` (future enhancement)
3. **Current workaround**: Embed images inline as base64 `<img>` tags in agent response text

### Research Agent Hierarchy

```
Research Agent (E614D2BF-7C52-4A71-B90A-8C8DBB55BCFB)
├── Sub-Agents:
│   ├── Web Research Agent
│   ├── Database Research Agent
│   ├── File Research Agent
│   └── KB Research Agent
│
└── Nested Child Agent: Research Report Writer (B0753715-8CE2-4218-B021-6F19E5B4F6F7)
    ├── Sub-Agent: Infographic Agent (06F07CDD-5021-4737-A5CB-019204ADE8A8)
    │   └── Actions: Create SVG Chart, Diagram, Word Cloud, Network, Infographic, Sketch
    │
    └── Actions (Report Writer):
        ├── Create SVG Sketch Diagram
        ├── Create SVG Chart
        ├── Create SVG Diagram
        ├── Create SVG Network
        ├── Create SVG Word Cloud
        └── Create Mermaid Diagram
        └── [NEEDS] Generate Image  ← Add this
```

**Target for Image Generation:** Research Report Writer
- Already has visualization actions (SVG-based)
- Has Infographic Agent sub-agent for complex compositions
- Adding Generate Image action enables AI-generated raster images alongside SVG diagrams

---

## Assigned Tasks

### Task 1: Test Image Generation Providers

**Objective**: Verify all three providers work correctly

**Status:**

| Provider | Model Name | Status | Notes |
|----------|------------|--------|-------|
| Nano Banana Pro | `Nano Banana Pro` | ✅ **Working** | Google's Gemini 3 Pro Image |
| GPT-4o Image | `GPT-4o Image 1.5` / `GPT-4o Image 1.0` | ⚠️ **403 Auth** | Requires OpenAI org verification |
| FLUX | `FLUX.2 Pro` / `FLUX 1.1 Pro` | ❓ **Untested** | Async polling API |

**Remaining Test Scenarios**:
1. ~~Basic text-to-image generation with default parameters~~ ✅ (Nano)
2. Various resolutions (1024x1024, 1536x1024, 2048x2048 where supported)
3. Quality settings (standard vs HD)
4. Negative prompts
5. Error handling (invalid prompts, rate limits)

---

## Critical Issue: Context Overflow with Base64 Images

### Problem Discovery

During testing, Report Writer hit `ContextLengthExceeded` errors after multiple Generate Image calls:

```
Stopping failover: Fatal error (ContextLengthExceeded): 400
{"error":{"message":"Please reduce the length of the messages or completion.",
"type":"invalid_request_error","param":"messages"}}
```

### Root Cause Analysis

**Why base64 images are so large:**
- 1024x1024 PNG = ~500KB-1MB raw
- Base64 encoding adds ~33% overhead → ~700KB
- Each character ≈ 1 token → **~700,000 tokens per image**

**The duplication problem in `executeActionsStep()`:**

Looking at `packages/AI/Agents/src/base-agent.ts` lines 6088-6105:

```typescript
const actionSummaries = actionResults.map(result => {
    return {
        actionName: result.action.name,
        success: result.success,
        params: result.result?.Params.filter(p => p.Type === 'Both' || p.Type === 'Output'), // Base64 here in Images param
        message: result.success ? actionResult?.Message || 'Action completed' : result.error // AND base64 mentioned here too
    };
});
```

The Generate Image action returns:
1. `Message`: "Generated 1 image(s) successfully" + base64 preview
2. `params.Images`: Array with full base64 data

**Both** are sent to the LLM for context, effectively **doubling** the token count for each image.

### Amith's Direction

> "We should instruct the AI to emit the report with a placeholder where the image should go like `${image-1-url}` and then we can post process somewhere outside of inference for sure."

### Existing MJ Infrastructure Analysis

**1. Message Expiration System** (AIAgentAction metadata):
- `ResultExpirationTurns`: How many turns before result expires
- `ResultExpirationMode`: None | Remove | Compact
- `CompactMode`: Truncate | Summarize
- `CompactLength`: Target length after compaction

*Verdict*: Designed for accumulated context over time, not individual items that are inherently too large.

**2. Context Recovery** (`attemptContextRecovery()` lines 2908-3012):
- Strategy 1: Remove old action results
- Strategy 2: Compact remaining results
- Strategy 3: Trim conversation history
- Strategy 4: Truncate individual messages

*Verdict*: Reactive to overflow after it happens. Doesn't prevent 700K token items from being sent.

**3. MediaOutput System** (PR #1748):
- `_mediaOutputs: MediaOutput[]` in BaseAgent
- `promoteMediaOutputs()` for explicit promotion
- `SaveAgentRunMedia()` persists to database
- `CreateConversationMediaAttachments()` for UI display

*Verdict*: **Ideal infrastructure** for storing large binary data outside LLM context.

### Proposed Solution: Placeholder Pattern with MediaOutput Integration

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CURRENT FLOW (BROKEN)                                                       │
│                                                                              │
│  Generate Image Action                                                       │
│       ↓ Returns base64 (~700K tokens)                                        │
│  executeActionsStep()                                                        │
│       ↓ Sends full base64 in actionSummaries to LLM                          │
│  LLM Context                                                                 │
│       ↓ OVERFLOW after 1-2 images                                            │
│  ContextLengthExceeded Error ❌                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  PROPOSED FLOW                                                               │
│                                                                              │
│  Generate Image Action                                                       │
│       ↓ Returns base64 (~700K tokens)                                        │
│  executeActionsStep() [MODIFIED]                                             │
│       ↓ Detects large binary content                                         │
│       ↓ Stores in _mediaOutputs registry with reference ID                   │
│       ↓ Replaces base64 with reference: ${media:img-abc123}                  │
│  LLM Context                                                                 │
│       ↓ Only sees reference (~30 tokens)                                     │
│  Agent Response                                                              │
│       ↓ Uses placeholder: <img src="${media:img-abc123}" alt="..." />        │
│  finalizeAgentRun() [MODIFIED]                                               │
│       ↓ Resolves placeholders to data:image/png;base64,...                   │
│  Final Payload ✅                                                            │
│       ↓ Full base64 in final HTML, never seen by LLM                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation Steps:**

#### Step 1: Intercept Large Binary Content in `executeActionsStep()`

Add media interception before building actionSummaries:

```typescript
// In executeActionsStep(), before building actionSummaries
private interceptLargeBinaryContent(actionResult: ActionResultSimple): {
    sanitizedResult: ActionResultSimple;
    mediaReferences: Map<string, MediaOutput>;
} {
    const mediaReferences = new Map<string, MediaOutput>();
    const sanitizedParams = [...actionResult.Params];

    for (const param of sanitizedParams) {
        if (param.Name === 'Images' && param.Value) {
            const images = param.Value as Array<{ Base64: string; Width?: number; Height?: number }>;
            const references: string[] = [];

            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                if (img.Base64 && img.Base64.length > 10000) { // ~7.5KB threshold
                    const refId = `img-${crypto.randomUUID().slice(0, 8)}`;

                    // Store in media registry
                    mediaReferences.set(refId, {
                        modality: 'Image',
                        mimeType: 'image/png',
                        data: img.Base64,
                        width: img.Width,
                        height: img.Height,
                        label: `Generated image ${i + 1}`
                    });

                    // Replace with reference
                    references.push(`\${media:${refId}}`);
                }
            }

            // Update param to only contain references
            param.Value = { imageReferences: references, count: images.length };
        }
    }

    return { sanitizedResult: { ...actionResult, Params: sanitizedParams }, mediaReferences };
}
```

#### Step 2: Add Media Registry to BaseAgent

```typescript
// In BaseAgent class
private _pendingMediaReferences: Map<string, MediaOutput> = new Map();

protected registerMediaReference(refId: string, media: MediaOutput): void {
    this._pendingMediaReferences.set(refId, media);
}

protected getMediaReference(refId: string): MediaOutput | undefined {
    return this._pendingMediaReferences.get(refId);
}
```

#### Step 3: Update Report Writer Prompt for Placeholder Pattern

Update prompt to instruct agent to use placeholder syntax:

```markdown
**Embedding the Generated Image:**

When the Generate Image action succeeds, you'll receive image references in the format `${media:img-XXXXX}`.

Use this reference directly in your HTML:

```html
<div style="text-align: center; margin: 20px 0;">
  <img src="${media:img-abc123}"
       alt="Description of the image"
       style="max-width: 100%; height: auto; border-radius: 8px;" />
  <p style="font-size: 0.9em; color: #666; margin-top: 8px;">
    <em>Figure X: Caption describing the image</em>
  </p>
</div>
```

The placeholder will be automatically resolved to the full image data after report generation.
```

#### Step 4: Resolve Placeholders in `finalizeAgentRun()`

```typescript
// In finalizeAgentRun(), after getting final payload
private resolveMediaPlaceholders(payload: string): string {
    const placeholderRegex = /\$\{media:(img-[a-f0-9]+)\}/g;

    return payload.replace(placeholderRegex, (match, refId) => {
        const media = this._pendingMediaReferences.get(refId);
        if (media?.data) {
            // Also promote to mediaOutputs for persistence
            this.promoteMediaOutputs([media]);
            return `data:${media.mimeType};base64,${media.data}`;
        }
        return match; // Keep placeholder if not found (shouldn't happen)
    });
}
```

### Benefits of This Approach

1. **Leverages Existing Infrastructure**: Uses `_mediaOutputs`, `promoteMediaOutputs()`, and persistence flow from PR #1748
2. **Zero LLM Context Impact**: Images never enter LLM context, only ~30 character references
3. **Automatic Persistence**: Resolved images are promoted to `AIAgentRunMedia` → `ConversationDetailAttachment`
4. **Clean Separation**: Generation (LLM) vs Resolution (post-processing) vs Storage (MediaOutput system)
5. **Backward Compatible**: Agents without large binary actions continue working unchanged
6. **Configurable Threshold**: 10KB threshold catches images while allowing small inline content

### Alternative Considered: Per-Action Configuration

Could add `ResultBinaryHandling: 'Inline' | 'Reference'` to AIAgentAction metadata, but:
- Requires migration and UI changes
- Adds complexity for something that should "just work"
- The threshold-based approach handles all cases automatically

### Implementation Priority

1. **High**: Intercept in `executeActionsStep()` + media registry
2. **High**: Placeholder resolution in `finalizeAgentRun()`
3. **Medium**: Update Report Writer prompt
4. **Low**: Configurable threshold via agent settings

### Implementation Status (2026-01-14)

**COMPLETED** - Core placeholder pattern implemented with sub-agent bubbling support:

| Component | Status | Location |
|-----------|--------|----------|
| `_pendingMediaReferences` registry | ✅ Done | `base-agent.ts` Line 365-371 |
| `interceptLargeBinaryContent()` | ✅ Done | `base-agent.ts` Lines 326-413 |
| `resolveMediaPlaceholdersInString()` | ✅ Done | `base-agent.ts` Lines 425-444 |
| `resolveMediaPlaceholdersInPayload()` | ✅ Done | `base-agent.ts` Lines 457-503 |
| Integration in `executeActionsStep()` | ✅ Done | `base-agent.ts` Lines 6250-6269 |
| Integration in `finalizeAgentRun()` | ✅ Done | `base-agent.ts` Lines 7256-7263, 7310-7315 |
| `pendingMediaReferences` in `ExecuteAgentResult` | ✅ Done | `agent-types.ts` Lines 304-314 |
| Sub-agent reference bubbling (child) | ✅ Done | `base-agent.ts` Lines 5418-5425 |
| Sub-agent reference bubbling (related) | ✅ Done | `base-agent.ts` Lines 5736-5743 |
| TypeScript build verification | ✅ Done | No errors |

**How It Works:**

1. When `executeActionsStep()` processes action results, it calls `interceptLargeBinaryContent()` on output params
2. If an Images array contains base64 strings > 10KB, they're stored in `_pendingMediaReferences` with unique IDs
3. The action summary sent to LLM contains only `${media:img-xxx}` placeholders (~30 chars vs ~700K chars)
4. **Sub-agent bubbling:** When sub-agents finish, their `_pendingMediaReferences` are included in `ExecuteAgentResult`
5. **Parent collection:** Parent agents merge sub-agent references into their own `_pendingMediaReferences` map
6. **Root resolution:** Only root agents (depth === 0) resolve placeholders in `finalizeAgentRun()`
7. Root agent has ALL references from entire hierarchy and replaces placeholders with `data:image/png;base64,...` URIs
8. Resolved media is automatically promoted to `_mediaOutputs` for persistence to `AIAgentRunMedia`

**Amith Feedback (Approved):**
> "I think this makes sense... we're talking about the same approach that was already in the PR, but being more explicit about automatically placing binary outputs (could be large text outputs like HTML or large MD files too) into the media collection of the agent run too."

**Future Enhancements (per Amith):**
- Built-in actions for agents to list/prune media
- Configurable threshold per agent

### Bug Fixes During Testing (2026-01-14)

**Bug 1: Case mismatch in property names**
- **Issue:** `interceptLargeBinaryContent()` looked for `img.Base64` (PascalCase)
- **Actual:** Generate Image action outputs `img.base64` (camelCase)
- **Fix:** Updated interceptor to use lowercase: `img.base64`, `img.width`, `img.height`, `img.format`
- **File:** `packages/AI/Agents/src/base-agent.ts` lines 342-361

**Bug 2: Duplicate base64 in action Message**
- **Issue:** Generate Image action returned images in TWO places:
  1. `params.Images` output parameter (intercepted ✅)
  2. `Message` field as JSON (NOT intercepted ❌)
- **Root cause:** Action's `responseData` object included full `images` array which was JSON.stringify'd into Message
- **Fix:** Removed `images` array from `responseData` in action - Message is now a lightweight summary
- **File:** `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts` lines 173-182
- **Rationale:** Message should be human-readable summary, actual data flows through output params

**Bug 3: Sub-agent media references not bubbling to parent**
- **Issue:** When sub-agent (Report Writer) generated images, parent agent (Research Agent) couldn't resolve placeholders
- **Root cause:** Each agent has its own isolated `_pendingMediaReferences` map. Sub-agent stored references locally, but parent had no access to them. When root agent tried to resolve placeholders, it couldn't find the media data.
- **Analysis:**
  1. Sub-agent intercepts base64, stores in its `_pendingMediaReferences` with refId
  2. Sub-agent's LLM sees placeholder, generates HTML with `${media:img-xxx}`
  3. Sub-agent returns payload with placeholders (correct - we added `isRootAgent` check)
  4. Parent merges payload, but parent's `_pendingMediaReferences` is empty
  5. Root agent can't resolve placeholders - media data is in sub-agent's map!
- **Fix:** Bubble media references from sub-agents to parent through `ExecuteAgentResult`:
  1. Added `pendingMediaReferences?: Array<{refId: string; media: MediaOutput}>` to `ExecuteAgentResult` type
  2. In `finalizeAgentRun()`: Sub-agents (depth > 0) include their `_pendingMediaReferences` in return value
  3. After `ExecuteSubAgent()` in parent: Merge sub-agent's references into parent's `_pendingMediaReferences` map
  4. Root agent now has ALL references from entire hierarchy and can resolve all placeholders
- **Files changed:**
  - `packages/AI/CorePlus/src/agent-types.ts` - Added `pendingMediaReferences` to `ExecuteAgentResult`
  - `packages/AI/Agents/src/base-agent.ts`:
    - Lines 7310-7315: Include `pendingMediaReferences` in `finalizeAgentRun()` return for sub-agents
    - Lines 5418-5425: Merge sub-agent references after child sub-agent execution
    - Lines 5736-5743: Merge sub-agent references after related sub-agent execution

**Testing Status:**
- [x] Interceptor correctly extracts base64 from output params
- [x] Placeholders appear in action summaries: `${media:img-xxx}`
- [x] Message no longer contains duplicate base64
- [x] Sub-agent media references bubble up to parent
- [x] End-to-end test: placeholder resolution in final payload ✅ Working!

---

## Amith's Feedback on Commit 6d53185d7 (2026-01-14)

After reviewing the placeholder pattern implementation, Amith provided two pieces of feedback:

### Feedback 1: Unify `pendingMediaReferences` with `mediaOutputs`

**Amith's Comment:**
> "I think what we can do is update the interface and also add in addition to the refId which is a good addition we can have a flag to indicate if it should be persisted - we could call it `persist?: boolean` so that we flag this as true if the agent wants to save this. We'd have to have some method for the agent to signal to the framework that it should persist the given output."
>
> "I also think we should have a `description` field on the MediaOutput the agent can use for its own note taking to know what the thing is, but also useful for persistence and we should propagate these attributes to the entities in the DB for agent run, prompt run and convo detail so that we have a full chain storing this stuff."

**Current State:**
- `mediaOutputs`: Media explicitly promoted by agents for display/persistence
- `pendingMediaReferences`: Separate Map for intercepted binary content with placeholder refIds

**Problem with Separation:**
- Two parallel tracking systems for essentially the same thing (media)
- Requires separate bubbling logic for sub-agents

**Proposed Solution:**

Unify into single `mediaOutputs` array with enhanced `MediaOutput` interface:

```typescript
export interface MediaOutput {
    // Existing fields
    promptRunMediaId?: string;
    modality: MediaModality;
    mimeType: string;
    data?: string;
    url?: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
    label?: string;
    metadata?: Record<string, unknown>;

    // NEW: Placeholder reference ID for context-safe embedding
    refId?: string;

    // NEW: Controls persistence behavior
    persist?: boolean;  // Default: true. Set false for temporary/working media

    // NEW: Agent note-taking for what this media represents
    description?: string;
}
```

**Implementation Changes:**

1. **MediaOutput Interface** (`agent-types.ts`):
   - Add `refId?: string`
   - Add `persist?: boolean`
   - Add `description?: string`

2. **BaseAgent** (`base-agent.ts`):
   - Remove `_pendingMediaReferences: Map<string, MediaOutput>`
   - Use `_mediaOutputs` array for everything
   - `interceptLargeBinaryContent()` adds to `_mediaOutputs` with `refId` and `persist: false`
   - `resolveMediaPlaceholders()` looks up by `refId` in `_mediaOutputs`
   - When placeholder is used, set `persist: true` on that media item

3. **AgentRunner** (`AgentRunner.ts`):
   - Filter `mediaOutputs` by `persist === true` (or undefined for backward compat) before saving
   - Only persisted items go to `AIAgentRunMedia` and `ConversationDetailAttachment`

4. **Database Schema**:
   - Add `Description` column to `AIAgentRunMedia`
   - Add `Description` column to `AIPromptRunMedia`
   - Add `Description` column to `ConversationDetailAttachment`

5. **Sub-agent Bubbling**:
   - Simplifies to just passing `mediaOutputs` array (already in `ExecuteAgentResult`)
   - Remove separate `pendingMediaReferences` from `ExecuteAgentResult`

**Benefits:**
- Single unified media tracking system
- Agent controls what gets persisted via `persist` flag
- `description` provides context for both agent reasoning and UI display
- Cleaner sub-agent bubbling (just merge `mediaOutputs` arrays)

---

### Feedback 2: Generic Binary Interception via ValueType

**Amith's Comment:**
> "The concept is good, but the approach is not generic, you are hardcoding around the assumption of Images from a specific action. Not good. Think harder on this please, and think in abstract and generic terms."
>
> "I like where you're going with this in the context of ValueType. Perhaps instead of `ValueType=Media` we use `ValueType=Binary` to be more general and then we have a new col that would have the BinaryOutput format that would include the stuff you mention but it is more general than media implies?"

**Current State (Hardcoded):**
```typescript
// base-agent.ts lines 340-367
if (param.Name === 'Images' && Array.isArray(param.Value)) {
    const images = param.Value as Array<{ base64?: string; ... }>;
    // ...
}
```

**Problem:**
- Only handles param named exactly `'Images'`
- Only handles specific object structure `{ base64, width, height, format }`
- Won't work for other actions returning binary (QR codes, audio, documents)

**Proposed Solution:**

Add `Binary` to `ValueType` value list and new `BinaryOutputFormat` column:

**1. ActionParam Entity Changes:**

```sql
-- Add to ValueType value list
-- Current: 'Scalar', 'Simple Object', 'BaseEntity Sub-Class', 'Other'
-- New: 'Scalar', 'Simple Object', 'BaseEntity Sub-Class', 'Other', 'Binary'

-- Add new column for binary output details
ALTER TABLE ActionParam ADD BinaryOutputFormat NVARCHAR(50) NULL;
-- Values: 'MediaOutput', 'Base64String', 'DataURL', etc.
```

**2. Generate Image Action Metadata Update:**

```json
{
  "fields": {
    "ActionID": "@parent:ID",
    "Name": "Images",
    "Type": "Output",
    "ValueType": "Binary",           // Changed from "Simple Object"
    "BinaryOutputFormat": "MediaOutput",  // NEW
    "IsArray": true,
    "Description": "Array of generated images in MediaOutput format"
  }
}
```

**3. Generate Image Action Code Update:**

Change `formatImageOutput()` to return `MediaOutput` format:

```typescript
private formatImageOutput(img: GeneratedImage, index: number): MediaOutput {
    return {
        modality: 'Image',
        mimeType: img.format ? `image/${img.format}` : 'image/png',
        data: img.base64,
        url: img.url,
        width: img.width,
        height: img.height,
        label: `Generated image ${index + 1}`
    };
}
```

**4. Agent Interception Code Update:**

```typescript
private interceptLargeBinaryContent(
    actionParams: ActionParam[],
    actionEntity?: ActionEntityExtended
): ActionParam[] {
    for (const param of actionParams) {
        if (param.Type !== 'Output' && param.Type !== 'Both') continue;

        // Look up metadata for this param
        const paramMeta = actionEntity?.Params?.find(p => p.Name === param.Name);

        // Check if this is a binary output param
        if (paramMeta?.ValueType?.trim() === 'Binary') {
            const format = paramMeta.BinaryOutputFormat || 'MediaOutput';

            if (paramMeta.IsArray && Array.isArray(param.Value)) {
                param.Value = (param.Value as MediaOutput[]).map(media =>
                    this.interceptMediaOutput(media)
                );
            } else {
                param.Value = this.interceptMediaOutput(param.Value as MediaOutput);
            }
        }
    }
    return actionParams;
}

private interceptMediaOutput(media: MediaOutput): MediaOutput {
    if (media.data && media.data.length > BaseAgent.LARGE_BINARY_THRESHOLD) {
        const refId = `media-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;

        // Store in unified _mediaOutputs with refId and persist=false initially
        this._mediaOutputs.push({
            ...media,
            refId,
            persist: false,  // Will be set true when placeholder is actually used
            description: media.label || `Intercepted ${media.modality}`
        });

        // Return sanitized version with placeholder
        return {
            ...media,
            data: undefined,  // Remove large data
            refId,
            placeholder: `\${media:${refId}}`
        };
    }
    return media;
}
```

**Benefits:**
- Generic - works for ANY action with `ValueType=Binary`
- Metadata-driven - no hardcoded param names
- Extensible - `BinaryOutputFormat` allows different binary schemas
- MJ-pattern compliant - uses existing ValueType infrastructure

---

### Implementation Plan for Both Feedbacks

---

## Phase 1: Database Migration

**New migration file:** `V202601141XXX__v3.1.x__Binary_Output_And_Media_Description.sql`

### 1.1 Add Description columns for media entities

**Current state analysis:**
| Entity | Has Label? | Has Description? |
|--------|------------|------------------|
| AIAgentRunMedia | ✅ Yes | ❌ No |
| AIPromptRunMedia | ❌ No | ❌ No |
| ConversationDetailAttachment | ❌ No | ❌ No |

**DDL Changes:**
```sql
-- Add Description to AIAgentRunMedia (already has Label)
ALTER TABLE ${flyway:defaultSchema}.AIAgentRunMedia
ADD Description NVARCHAR(MAX) NULL;

-- Add Label and Description to AIPromptRunMedia
ALTER TABLE ${flyway:defaultSchema}.AIPromptRunMedia
ADD Label NVARCHAR(255) NULL,
    Description NVARCHAR(MAX) NULL;

-- Add Label and Description to ConversationDetailAttachment
ALTER TABLE ${flyway:defaultSchema}.ConversationDetailAttachment
ADD Label NVARCHAR(255) NULL,
    Description NVARCHAR(MAX) NULL;
```

**Why:** Amith wants agents to have a `description` field for note-taking that propagates through the entire chain (agent run → prompt run → conversation attachment).

### 1.2 Add Binary to ActionParam.ValueType

**Current ValueType values:** `'Scalar', 'Simple Object', 'BaseEntity Sub-Class', 'Other'`

**Need to add:** `'Binary'`

This requires inserting into `EntityFieldValue` table for the ValueType field.

### 1.3 Add BinaryOutputFormat column to ActionParam

```sql
ALTER TABLE ${flyway:defaultSchema}.ActionParam
ADD BinaryOutputFormat NVARCHAR(50) NULL;
```

**Why:** Amith said we need a new column to specify the binary output format (e.g., 'MediaOutput', 'Base64String', 'DataURL').

### 1.4 Extended Properties

Add `sp_addextendedproperty` calls for all new columns to document them properly.

### Post-Migration: Run CodeGen

After the migration runs, you'll need to:
1. Run CodeGen to regenerate entity classes
2. Paste the CodeGen-generated SQL into the migration or a follow-up migration

---

## Phase 2: TypeScript Interface Changes

### 2.1 Update MediaOutput interface (`agent-types.ts`)

```typescript
export interface MediaOutput {
    // Existing fields (unchanged)
    promptRunMediaId?: string;
    modality: MediaModality;
    mimeType: string;
    data?: string;
    url?: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
    label?: string;
    metadata?: Record<string, unknown>;

    // NEW: Placeholder reference ID for ${media:xxx} pattern
    refId?: string;

    // NEW: Controls persistence behavior (default: true)
    // Set to false for intercepted/working media that shouldn't be persisted
    persist?: boolean;

    // NEW: Agent notes about what this media represents
    description?: string;
}
```

### 2.2 Remove pendingMediaReferences from ExecuteAgentResult

Remove the `pendingMediaReferences` field since we're unifying into `mediaOutputs`.

---

## Phase 3: Generate Image Action Update

### 3.1 Update action code (`generate-image.action.ts`)

Change `formatImageOutput()` to return `MediaOutput` format:

```typescript
private formatImageOutput(img: GeneratedImage, index: number): MediaOutput {
    return {
        modality: 'Image',
        mimeType: img.format ? `image/${img.format}` : 'image/png',
        data: img.base64,
        url: img.url,
        width: img.width,
        height: img.height,
        label: `Generated image ${index + 1}`
    };
}
```

### 3.2 Update action metadata (`.generate-image.json`)

Change the Images output param:
```json
{
  "fields": {
    "ActionID": "@parent:ID",
    "Name": "Images",
    "Type": "Output",
    "ValueType": "Binary",
    "BinaryOutputFormat": "MediaOutput",
    "IsArray": true,
    "Description": "Array of generated images in MediaOutput format ({ modality, mimeType, data, width, height, label })"
  }
}
```

---

## Phase 4: BaseAgent Refactor

### 4.1 Remove `_pendingMediaReferences` Map

Delete the separate Map and use `_mediaOutputs` array for everything.

### 4.2 Update `interceptLargeBinaryContent()`

- Accept action entity metadata to check `ValueType === 'Binary'`
- Add intercepted media to `_mediaOutputs` with `refId` and `persist: false`
- Return sanitized params with placeholders

### 4.3 Update `resolveMediaPlaceholdersInString()`

- Look up media by `refId` in `_mediaOutputs` array (not Map)
- When placeholder is used, set `persist: true` on that media item

### 4.4 Update sub-agent bubbling

- Sub-agents return their `mediaOutputs` array (already in ExecuteAgentResult)
- Parent merges sub-agent's `mediaOutputs` into its own array
- Remove references to `pendingMediaReferences`

---

## Phase 5: AgentRunner Update

### 5.1 Filter by persist flag before saving

In `SaveAgentRunMedia()` and `CreateConversationMediaAttachments()`:
```typescript
const mediaToSave = agentResult.mediaOutputs?.filter(m => m.persist !== false) || [];
```

### 5.2 Include description in saved records

Map `media.description` to entity's `Description` column.

---

## Phase 6: Cleanup

1. Remove `pendingMediaReferences` from `ExecuteAgentResult` type
2. Remove `_pendingMediaReferences` Map from BaseAgent
3. Update all references in sub-agent merge logic

---

## Summary of Changes

| Component | Change Type | Description |
|-----------|-------------|-------------|
| **Migration** | DDL | Add Description to 3 tables, Binary to ValueType, BinaryOutputFormat column |
| **agent-types.ts** | Interface | Add refId, persist, description to MediaOutput |
| **generate-image.action.ts** | Code | Return MediaOutput format from formatImageOutput() |
| **.generate-image.json** | Metadata | Set ValueType=Binary, add BinaryOutputFormat |
| **base-agent.ts** | Refactor | Unify into _mediaOutputs, use ValueType metadata |
| **AgentRunner.ts** | Code | Filter by persist flag, include description |

---

## Migration Checklist

- [ ] Create migration file with timestamp
- [ ] Add Description columns to AIAgentRunMedia, AIPromptRunMedia, ConversationDetailAttachment
- [ ] Add Label columns to AIPromptRunMedia, ConversationDetailAttachment
- [ ] Add 'Binary' to ActionParam.ValueType value list (via EntityFieldValue)
- [ ] Add BinaryOutputFormat column to ActionParam
- [ ] Add extended properties for all new columns
- [ ] Run CodeGen after migration
- [ ] Paste CodeGen SQL into migration (views, stored procs, EntityField records)

---

### Task 2: Wire Research Agent for Image Generation

**Objective**: Enable Research Report Writer to generate AI images using Nano Banana Pro

**Target Agent**: Research Report Writer (B0753715-8CE2-4218-B021-6F19E5B4F6F7)
- Already has 6 SVG visualization actions (Create SVG Chart, Diagram, Network, Word Cloud, Sketch, Mermaid)
- Adding Generate Image enables AI-generated raster images (photos, illustrations, complex scenes)
- Follows same pattern as existing SVG actions

---

#### Step 1: Add Generate Image Action to Report Writer Metadata

**File**: `/metadata/agents/.research-agent.json`

**Location**: Find the `AI Agent Actions` array under the Research Report Writer child entity.

**Add this entry** to the existing array (after the Mermaid Diagram action):
```json
{
  "fields": {
    "AgentID": "@parent:ID",
    "ActionID": "@lookup:Actions.Name=Generate Image",
    "Status": "Active"
  }
}
```

---

#### Step 2: Update Report Writer Prompt with Image Generation Instructions

**File**: `/metadata/prompts/templates/research-agent/research-report-writer.md`

**Pattern**: Follow existing SVG action documentation pattern (see "Creating Charts with the Create SVG Chart Action" section as reference).

**Add this section** after the existing SVG action documentation (around line 200-300):

```markdown
### Generating AI Images with the "Generate Image" Action

When your research would benefit from photorealistic images, illustrations, or complex visual scenes that SVG cannot capture, use the **Generate Image** action. This calls AI image generation models (like Nano Banana Pro) to create raster images.

**Use Generate Image when you need:**
- Photorealistic imagery or illustrations
- Complex scenes with lighting, textures, shadows
- Visual metaphors or conceptual representations
- Product mockups or architectural visualizations
- Artistic interpretations of data or concepts

**Use SVG actions instead when you need:**
- Charts, graphs, or data visualizations (Create SVG Chart)
- Technical diagrams or flowcharts (Create SVG Diagram)
- Network/relationship maps (Create SVG Network)
- Word clouds from text analysis (Create SVG Word Cloud)

**Action Parameters:**
```json
{
  "Prompt": "A detailed description of the image to generate",
  "Model": "Nano Banana Pro",
  "Size": "1024x1024",
  "Quality": "standard"
}
```

**Parameter Details:**
- **Prompt** (required): Detailed description of desired image. Be specific about subject, style, lighting, composition.
- **Model** (optional): Image generation model. Default: "Nano Banana Pro". Options: "Nano Banana Pro", "FLUX.2 Pro"
- **Size** (optional): Image dimensions. Default: "1024x1024". Options: "1024x1024", "1536x1024", "1024x1536"
- **Quality** (optional): Generation quality. Default: "standard". Options: "standard", "hd"

**Example: Generating an Infographic Image**
```json
{
  "Prompt": "A professional infographic showing a circular economy diagram with recycling, reuse, and reduce concepts. Modern flat design style with blue and green color palette. Clean white background.",
  "Model": "Nano Banana Pro",
  "Size": "1024x1024"
}
```

**Embedding the Generated Image:**

The action returns a `Base64` property in the Images array. Embed it in your report using:

```html
<div style="text-align: center; margin: 20px 0;">
  <img src="data:image/png;base64,{BASE64_FROM_ACTION_RESULT}"
       alt="Description of the image"
       style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
  <p style="font-size: 0.9em; color: #666; margin-top: 8px;"><em>Figure X: Caption describing the image</em></p>
</div>
```

**Best Practices:**
1. Write detailed, specific prompts - more detail yields better results
2. Include style guidance (modern, minimalist, professional, artistic, etc.)
3. Specify color preferences when relevant to brand or theme
4. Use appropriate sizing: square (1024x1024) for general use, landscape (1536x1024) for wide scenes
5. Always provide meaningful alt text for accessibility
6. Add captions to provide context within the report
```

---

#### Step 3: Sync Metadata to Database

```bash
cd /Users/ethanlin/Projects/MJ/MJ
npx mj-sync push
```

---

#### Step 4: Test in Explorer

**Test Scenarios:**

1. **Basic Image Generation Test**
   - Prompt: "Create a research report about renewable energy trends. Include an AI-generated illustration showing solar panels and wind turbines."
   - Verify: Image appears inline in report, properly styled

2. **Mixed SVG + AI Image Test**
   - Prompt: "Generate a market analysis report with a bar chart showing market share AND an AI-generated infographic visualizing the industry ecosystem."
   - Verify: Both SVG chart and AI image render correctly

3. **Multiple Images Test**
   - Prompt: "Create a report on sustainable architecture with 2-3 AI-generated illustrations of eco-friendly building designs."
   - Verify: Multiple images render without breaking layout

**Base64 Image Tag Format:**
```html
<img src="data:image/png;base64,{BASE64_DATA}" alt="description" style="max-width: 100%;" />
```

### Task 3: Test Conversation Image Display

**Objective**: Verify end-to-end flow from generation to UI display

**Test Flow:**
1. Agent generates image via `Generate Image` action
2. Agent embeds image as base64 `<img>` tag in response text
3. Verify image renders in conversation UI

**Note:** Full `promoteMediaOutputs()` flow to `AIAgentRunMedia` → `ConversationDetailAttachment` requires future enhancement to `LoopAgentResponse` schema.

**Verification Points:**
- [ ] Image renders inline in agent response (via base64 img tag)
- [ ] Multiple images in single response work correctly
- [ ] Large images don't break UI layout
- [ ] Image alt text displays on hover

### Task 4: Enable Sage for Full Multi-Modal

**Objective**: Configure Sage agent with Llama 4 Maverick for image input/output

**Configuration Status** (per Amith):
- Sage already configured with Llama 4 Maverick which supports image input tokens

**Testing Needed:**
1. Image input processing (user sends image → Sage understands it)
2. Add "Generate Image" action to Sage for image output
3. Test Sage generating and returning images in conversation

### Task 5: Design Critique & Future Enhancements

**Objective**: Provide feedback on PR #1748 design for discussion with Amith

**Critique Summary:**

| Aspect | Assessment | Notes |
|--------|------------|-------|
| Modality Agnosticism | ✅ Excellent | Same patterns work for audio/video |
| Explicit Promotion | ✅ Good | Agents control what to surface |
| Reference Storage | ✅ Good | Avoids data duplication |
| Error Handling | ✅ Good | Graceful per-item failure handling |
| Provider Abstraction | ✅ Good | Easy to add new providers |

**Gaps Identified:**

1. **LoopAgentResponse missing `promoteMediaOutputs`**
   - LLMs can't request media promotion in their JSON response
   - Impact: Action-generated images don't auto-flow to ConversationDetailAttachment
   - Workaround: Embed as base64 `<img>` tags in response text

2. **No auto-extraction from action outputs**
   - `executeActionsStep()` doesn't scan for media in action results
   - Would enable automatic promotion without prompt changes

3. **Sub-Agent Media Bubbling**
   - If AgentA calls AgentB which generates an image, it doesn't bubble up
   - May need explicit handling for sub-agent media

**Recommendations:**
1. Add `promoteMediaOutputs?: MediaOutput[]` to `LoopAgentResponse` interface
2. Consider auto-extracting media from action outputs with specific result codes
3. Document the base64 `<img>` tag pattern as the current standard approach

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `packages/AI/CorePlus/src/prompt.types.ts` | MediaModality, PromptRunMediaReference types |
| `packages/AI/CorePlus/src/agent-types.ts` | MediaOutput interface |
| `packages/AI/Core/src/generic/baseImage.ts` | BaseImageGenerator abstract class |
| `packages/AI/Agents/src/base-agent.ts` | promoteMediaOutputs() method |
| `packages/AI/Agents/src/AgentRunner.ts` | SaveAgentRunMedia(), CreateConversationMediaAttachments() |
| `packages/AI/Providers/OpenAI/src/models/openAIImage.ts` | OpenAI implementation |
| `packages/AI/Providers/Gemini/src/geminiImage.ts` | Nano Banana Pro implementation |
| `packages/AI/Providers/BlackForestLabs/src/index.ts` | FLUX implementation |
| `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts` | GenerateImageAction |
| `migrations/v2/V202601121807__v3.1.x__Add_Image_Generation_Models.sql` | Database migration |

---

## Future Considerations

1. **Audio Generation**: Same patterns will work—just need `BaseAudioGenerator` implementations
2. **Video Generation**: Same patterns—`BaseVideoGenerator` with potentially longer async operations
3. **Storage Optimization**: Move from base64 to File table storage for production scale
4. **Sub-Agent Bubbling**: ✅ **IMPLEMENTED** - mediaOutputs now bubble from sub-agents to parent
5. **Streaming**: Consider streaming large media rather than loading entirely into memory

---

## Implementation Status: Amith's Feedback (2026-01-14)

### ✅ COMPLETED: Both Feedback Items Implemented

The implementation of both feedback items has been completed in a unified refactor:

| Task | Status | Files Modified |
|------|--------|----------------|
| Database migration for Description, BinaryOutputFormat, Binary ValueType | ✅ Done | `migrations/v2/V202601141338__v3.1.x__Binary_Output_And_Media_Description.sql` |
| Add refId, persist, description to MediaOutput interface | ✅ Done | `packages/AI/CorePlus/src/agent-types.ts` |
| Remove pendingMediaReferences from ExecuteAgentResult | ✅ Done | `packages/AI/CorePlus/src/agent-types.ts` |
| Update Generate Image to return MediaOutput format | ✅ Done | `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts` |
| Update Generate Image metadata with ValueType=Binary | ✅ Done | `metadata/actions/.generate-image.json` |
| Refactor BaseAgent to use unified _mediaOutputs array | ✅ Done | `packages/AI/Agents/src/base-agent.ts` |
| Update interceptLargeBinaryContent for generic ValueType=Binary | ✅ Done | `packages/AI/Agents/src/base-agent.ts` |
| Update resolveMediaPlaceholders to use _mediaOutputs with refId lookup | ✅ Done | `packages/AI/Agents/src/base-agent.ts` |
| Update sub-agent bubbling to merge mediaOutputs arrays | ✅ Done | `packages/AI/Agents/src/base-agent.ts` |
| Update AgentRunner to filter by persist flag | ✅ Done | `packages/AI/Agents/src/AgentRunner.ts` |
| Add description support in AgentRunner persistence | ✅ Done | `packages/AI/Agents/src/AgentRunner.ts` |
| TypeScript builds pass | ✅ Done | All affected packages |

### Key Architecture Changes

**Unified Media System:**
- `_pendingMediaReferences` Map removed
- All media (promoted + intercepted) now stored in unified `_mediaOutputs` array
- Media with `refId` is for placeholder resolution; media without is explicitly promoted
- `persist: false` = intercepted but not yet used (won't be saved to DB)
- `persist: true` (or undefined) = will be persisted to AIAgentRunMedia and ConversationDetailAttachment

**Generic Binary Interception:**
- BaseAgent's `interceptLargeBinaryContent()` now checks action metadata for `ValueType === 'Binary'`
- When `BinaryOutputFormat === 'MediaOutput'`, treats output as MediaOutput array
- Falls back to base64 pattern detection for backward compatibility

**Sub-Agent Media Flow:**
1. Sub-agent intercepts binary → stores in `_mediaOutputs` with `refId` and `persist: false`
2. Sub-agent returns `mediaOutputs` array in `ExecuteAgentResult`
3. Parent agent merges sub-agent's `mediaOutputs` into its own `_mediaOutputs`
4. Root agent resolves all placeholders, setting `persist: true` on used media
5. AgentRunner filters to `persist !== false` before saving to database

### Post-Migration Steps Required

After running the migration:
1. Run CodeGen to regenerate entity classes (adds Description, BinaryOutputFormat properties)
2. CodeGen will create EntityFieldValue for 'Binary' from CHECK constraint
3. Run `mj-sync push` to sync Generate Image metadata changes

### Build Verification

All three affected packages build successfully:
```bash
✅ @memberjunction/ai-core-plus - Built successfully
✅ @memberjunction/ai-agents - Built successfully
✅ @memberjunction/core-actions - Built successfully
```

---

*Document created: January 2026*
*PR Reference: #1748*
*Author: Analysis by Claude Code*
*Last Updated: 2026-01-14 - Added Amith's feedback implementation status*
