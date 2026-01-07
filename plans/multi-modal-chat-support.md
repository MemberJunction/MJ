# Multi-Modal Chat Support Implementation Plan

## Overview

This plan describes the implementation of multi-modal content support (images, video, audio) in MemberJunction conversations. The design provides:

1. **Normalized Modality System** - Extensible modality metadata without schema changes
2. **Cascading Configuration** - Agent -> Model -> ModelType -> System defaults
3. **Scalable storage** - Small files inline (base64), large files in MJStorage
4. **Provider flexibility** - Configurable storage providers (S3, Azure, etc.)
5. **Backward compatibility** - Existing text messages remain unchanged
6. **Central utility** - ConversationUtility as single source of truth

---

## Phase 1: Database Schema (REVISED - Normalized Modality Approach)

### Design Philosophy

Instead of flat columns on AIModel/AIAgent tables for each modality (which requires ALTER TABLE for new modalities), we use a normalized schema with junction tables:

- **AIModality** - Master list of content types (Text, Image, Audio, Video, File, Embedding)
- **AIModelType** - Default modalities for each model type (LLM, TTS, STT, etc.)
- **AIModelModality** - Per-model capability overrides (extends/restricts type defaults)
- **AIAgentModality** - Per-agent capability overrides (extends/restricts model defaults)

### 1.1 AIModality Entity (NEW)

Master table for all content modalities:

```sql
CREATE TABLE AIModality (
    ID                          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                        NVARCHAR(50) NOT NULL,       -- 'Text', 'Image', 'Audio', etc.
    Description                 NVARCHAR(500) NULL,
    ContentBlockType            NVARCHAR(50) NOT NULL,       -- Maps to chat.types.ts
    MIMETypePattern             NVARCHAR(100) NULL,          -- 'image/*', 'audio/*', etc.
    Type                        NVARCHAR(50) NOT NULL,       -- 'Content', 'Structured', 'Binary'
    DefaultMaxSizeBytes         INT NULL,                     -- System-wide default
    DefaultMaxCountPerMessage   INT NULL,                     -- System-wide default
    DisplayOrder                INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_AIModality PRIMARY KEY (ID),
    CONSTRAINT UQ_AIModality_Name UNIQUE (Name),
    CONSTRAINT CK_AIModality_Type CHECK (Type IN ('Content', 'Structured', 'Binary')),
    CONSTRAINT CK_AIModality_ContentBlockType CHECK (ContentBlockType IN ('text', 'image_url', 'video_url', 'audio_url', 'file_url', 'embedding'))
);
```

**ContentBlockType Mapping** (to `ChatMessageContentBlock.type` in chat.types.ts):
- `text` - Plain text content
- `image_url` - Images (base64 data URL or external URL)
- `audio_url` - Audio files
- `video_url` - Video files
- `file_url` - Generic files (PDFs, documents)
- `embedding` - Vector embeddings (JSON format)

**Type Classification**:
- `Content` - Human-readable text
- `Structured` - JSON/embeddings
- `Binary` - Media files (images, audio, video)

**Seed Data** (with fixed UUIDs for referential integrity):
| ID | Name | ContentBlockType | Type | DefaultMaxSizeBytes |
|----|------|------------------|------|---------------------|
| EA43F4CF-EC26-41D7-B2AC-CF928AF63E46 | Text | text | Content | NULL |
| AAD386E4-D6ED-4E6E-8960-B56AC1D2783B | Image | image_url | Binary | 5,242,880 (5MB) |
| FC3CAE20-6FA8-4ABF-B02E-62CEA920313E | Audio | audio_url | Binary | 26,214,400 (25MB) |
| 9AAD272B-A1C8-4498-ACFC-0C6D50D82B96 | Video | video_url | Binary | 52,428,800 (50MB) |
| 3E930454-29AE-48B9-8888-10FD74BC67B9 | File | file_url | Binary | 10,485,760 (10MB) |
| BB0C8564-E79C-4AF9-82B0-26D6EAB4BC01 | Embedding | embedding | Structured | NULL |

### 1.2 AIModelType Updates

Add default modality fields to AIModelType for inheritance:

```sql
ALTER TABLE AIModelType ADD
    DefaultInputModalityID      UNIQUEIDENTIFIER NULL,   -- FK to AIModality
    DefaultOutputModalityID     UNIQUEIDENTIFIER NULL;   -- FK to AIModality
```

**Model Type Defaults**:
| Type | Default Input | Default Output |
|------|--------------|----------------|
| LLM | Text | Text |
| TTS (Text-to-Speech) | Text | Audio |
| STT (Speech-to-Text) | Audio | Text |
| Embeddings | Text | Embedding |
| Image Generator | Text | Image |
| Video | Text | Video |

**Note**: The former "Audio" model type has been renamed to "TTS" for clarity. A new "STT" model type has been added for speech-to-text models like Whisper.

### 1.3 AIModel Updates

Add inheritance flag and version lineage:

```sql
ALTER TABLE AIModel ADD
    InheritTypeModalities       BIT NOT NULL DEFAULT 1,  -- Inherit+extend from type
    PriorVersionID              UNIQUEIDENTIFIER NULL;   -- FK to AIModel for version history
```

**Inheritance Semantics**:
- `InheritTypeModalities = 1` (default): Model inherits default modalities from AIModelType, plus any additional modalities in AIModelModality
- `InheritTypeModalities = 0`: Model uses ONLY modalities in AIModelModality (complete override)

### 1.4 AIModelModality Junction Table (NEW)

Per-model modality overrides:

```sql
CREATE TABLE AIModelModality (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AIModelID               UNIQUEIDENTIFIER NOT NULL,      -- FK to AIModel
    ModalityID              UNIQUEIDENTIFIER NOT NULL,      -- FK to AIModality
    Direction               NVARCHAR(10) NOT NULL,          -- 'Input' or 'Output'
    IsSupported             BIT NOT NULL DEFAULT 1,         -- Can disable inherited modality
    IsRequired              BIT NOT NULL DEFAULT 0,         -- Required for this model
    MaxSizeBytes            INT NULL,                        -- Override system default
    MaxCountPerMessage      INT NULL,                        -- Override system default
    CONSTRAINT PK_AIModelModality PRIMARY KEY (ID),
    CONSTRAINT UQ_AIModelModality_ModelModalityDir UNIQUE (AIModelID, ModalityID, Direction),
    CONSTRAINT CK_AIModelModality_Direction CHECK (Direction IN ('Input', 'Output'))
);
```

### 1.5 AIAgentModality Junction Table (NEW)

Per-agent modality overrides:

```sql
CREATE TABLE AIAgentModality (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AIAgentID               UNIQUEIDENTIFIER NOT NULL,      -- FK to AIAgent
    ModalityID              UNIQUEIDENTIFIER NOT NULL,      -- FK to AIModality
    Direction               NVARCHAR(10) NOT NULL,          -- 'Input' or 'Output'
    IsAllowed               BIT NOT NULL DEFAULT 1,         -- Can restrict model capability
    MaxSizeBytes            INT NULL,                        -- Override model/system default
    MaxCountPerMessage      INT NULL,                        -- Override model/system default
    CONSTRAINT PK_AIAgentModality PRIMARY KEY (ID),
    CONSTRAINT UQ_AIAgentModality_AgentModalityDir UNIQUE (AIAgentID, ModalityID, Direction),
    CONSTRAINT CK_AIAgentModality_Direction CHECK (Direction IN ('Input', 'Output'))
);
```

**Agent Default Behavior**: If NO AIAgentModality records exist for an agent:
- Default to Text input/output only
- This is safe default since all agents support text
- Helper method in AIEngineBase resolves this

### 1.6 AIAgent Storage Configuration

Add storage config to AIAgent:

```sql
ALTER TABLE AIAgent ADD
    AttachmentStorageProviderID     UNIQUEIDENTIFIER NULL,  -- FK to File Storage Providers
    AttachmentRootPath              NVARCHAR(500) NULL,     -- Root path (agent run ID appended)
    InlineStorageThresholdBytes     INT NULL;               -- NULL = use system default
```

### 1.7 AIConfiguration Storage Defaults

Add system-wide storage defaults:

```sql
ALTER TABLE AIConfiguration ADD
    DefaultStorageProviderID        UNIQUEIDENTIFIER NULL,  -- FK to File Storage Providers
    DefaultStorageRootPath          NVARCHAR(500) NULL;     -- System-wide default path
```

### 1.8 ConversationDetailAttachment Entity (NEW)

Store message attachments:

```sql
CREATE TABLE ConversationDetailAttachment (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ConversationDetailID    UNIQUEIDENTIFIER NOT NULL,      -- FK to ConversationDetail
    ModalityID              UNIQUEIDENTIFIER NOT NULL,      -- FK to AIModality
    MimeType                NVARCHAR(100) NOT NULL,         -- 'image/png', 'audio/mp3', etc.
    FileName                NVARCHAR(4000) NULL,            -- Original filename
    FileSizeBytes           INT NOT NULL,
    Width                   INT NULL,                        -- pixels (image/video)
    Height                  INT NULL,                        -- pixels (image/video)
    DurationSeconds         INT NULL,                        -- audio/video duration
    InlineData              NVARCHAR(MAX) NULL,             -- base64 for small files
    FileID                  UNIQUEIDENTIFIER NULL,          -- FK to Files (MJStorage)
    DisplayOrder            INT NOT NULL DEFAULT 0,
    ThumbnailBase64         NVARCHAR(MAX) NULL,             -- Small preview
    CONSTRAINT PK_ConvDetailAttachment PRIMARY KEY (ID),
    CONSTRAINT CK_CDA_StorageType CHECK (InlineData IS NOT NULL OR FileID IS NOT NULL)
);
```

---

## Phase 2: Modality Resolution Logic

### 2.1 Cascade Resolution

When determining what modalities a model/agent supports:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Resolve Supported Modalities                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Agent has records?    │
                    └───────────────────────┘
                      Yes │           │ No
                          ▼           ▼
            ┌─────────────────┐   ┌───────────────────────┐
            │ Use Agent       │   │ Default to Text       │
            │ Modalities      │   │ in/out only           │
            └─────────────────┘   └───────────────────────┘
                          │
                          ▼
            ┌─────────────────────────────────────────────┐
            │ For each agent modality:                    │
            │  1. Check model supports it                 │
            │  2. Check agent IsAllowed = 1               │
            │  3. Intersection = effective capabilities   │
            └─────────────────────────────────────────────┘
```

### 2.2 Model Modality Resolution

```
┌─────────────────────────────────────────────────────────────────┐
│                    Get Model Modalities                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ InheritTypeModalities │
                    │ = 1?                  │
                    └───────────────────────┘
                      Yes │           │ No
                          ▼           ▼
            ┌─────────────────┐   ┌─────────────────────┐
            │ Start with Type │   │ Use ONLY            │
            │ defaults        │   │ AIModelModality     │
            │ + Add model     │   │ records             │
            │ extensions      │   └─────────────────────┘
            └─────────────────┘
                          │
                          ▼
            ┌─────────────────────────────────────────────┐
            │ Apply IsSupported = 0 to remove inherited   │
            └─────────────────────────────────────────────┘
```

### 2.3 Limit Resolution Cascade

```
GetEffectiveLimit(limitName, agent, model, modality, systemDefaults):
    1. Check agent's AIAgentModality override -> if set, return it
    2. Check model's AIModelModality override -> if set, return it
    3. Check modality's default -> if set, return it
    4. Return system default from config
```

---

## Phase 3: Core Types and Utilities

### 3.1 TypeScript Types (Already Done)

`chat.types.ts` already defines:

```typescript
export type ChatMessageContentBlock = {
    type: 'text' | 'image_url' | 'video_url' | 'audio_url' | 'file_url';
    content: string;        // URL or base64 data URL
    mimeType?: string;      // Required for raw base64
    fileName?: string;
    fileSize?: number;
    width?: number;
    height?: number;
}

export type ChatMessageContent = string | ChatMessageContentBlock[];
```

### 3.2 Serialization Utilities (Already Done)

```typescript
// Prefix marker for serialized content blocks
export const CONTENT_BLOCKS_PREFIX = '$$CONTENT_BLOCKS$$';

// Serialize content for database storage
export function serializeMessageContent(content: ChatMessageContent): string;

// Deserialize from database
export function deserializeMessageContent(message: string): ChatMessageContent;

// Helper functions
export function hasImageContent(content: ChatMessageContent): boolean;
export function getTextFromContent(content: ChatMessageContent): string;
export function parseBase64DataUrl(dataUrl: string): { mediaType: string; data: string } | null;
export function createBase64DataUrl(base64Data: string, mimeType: string): string;
```

### 3.3 ConversationUtility Extensions

Add methods to `conversation-utility.ts`:

```typescript
/**
 * Build ChatMessageContent from ConversationDetail + Attachments
 */
public static async BuildChatMessageContent(
    messageText: string,
    attachments: ConversationDetailAttachmentEntity[],
    storageProvider?: FileStorageProviderEntity
): Promise<ChatMessageContent>;

/**
 * Validate attachment against effective limits
 */
public static ValidateAttachment(
    attachment: { modalityId: string; sizeBytes: number },
    currentCounts: Map<string, number>,
    agentModalities: AIAgentModalityEntity[],
    modelModalities: AIModelModalityEntity[],
    modality: AIModalityEntity,
    systemDefaults: AttachmentDefaults
): { allowed: boolean; reason?: string };

/**
 * Determine if attachment should be stored inline
 */
public static ShouldStoreInline(
    sizeBytes: number,
    agent: AIAgentEntity,
    systemDefaults: AttachmentDefaults
): boolean;
```

---

## Phase 4: Attachment Service

Create `packages/AI/CorePlus/src/attachment-service.ts`:

```typescript
export class ConversationAttachmentService {
    /**
     * Process and store an attachment
     */
    async addAttachment(
        conversationDetailId: string,
        file: { data: Buffer | string; mimeType: string; fileName?: string },
        agent: AIAgentEntity,
        model: AIModelEntity,
        contextUser: UserInfo
    ): Promise<ConversationDetailAttachmentEntity>;

    /**
     * Get attachment data (resolves from inline or MJStorage)
     */
    async getAttachmentData(
        attachment: ConversationDetailAttachmentEntity,
        contextUser: UserInfo
    ): Promise<{ data: string; mimeType: string }>;

    /**
     * Delete attachment (and underlying file if in MJStorage)
     */
    async deleteAttachment(
        attachmentId: string,
        contextUser: UserInfo
    ): Promise<boolean>;

    /**
     * Load all attachments for a conversation detail
     */
    async getAttachments(
        conversationDetailId: string,
        contextUser: UserInfo
    ): Promise<ConversationDetailAttachmentEntity[]>;
}
```

---

## Phase 5: UI Components

### 5.1 MentionEditorComponent Updates

- Image paste from clipboard (Ctrl+V)
- Drag & drop support
- File picker button
- Inline thumbnail display with remove button
- Click thumbnail to expand

### 5.2 ImageViewerComponent (NEW)

- Full-screen modal overlay
- Zoom controls (scroll wheel, buttons)
- Pan support for zoomed images
- Download button
- Close on Escape or click outside

### 5.3 MessageItemComponent Updates

- Display attachment thumbnails in message
- Grid layout for multiple images
- Click to expand (opens ImageViewerComponent)
- Video/audio player for those types

---

## Phase 6: AI Provider Integration

### 6.1 Message Building for AI

```typescript
// In agent execution
const attachments = await attachmentService.getAttachments(detail.ID, contextUser);
const content = await ConversationUtility.BuildChatMessageContent(
    detail.Message,
    attachments,
    storageProvider
);

const chatMessage: ChatMessage = {
    role: detail.Role === 'User' ? 'user' : 'assistant',
    content: content
};
```

### 6.2 Provider Compatibility

Existing provider implementations handle ChatMessageContentBlock arrays:
- **OpenAI**: Handles `image_url` blocks
- **Anthropic**: Updated to handle vision content
- **Gemini**: Maps to `inlineData` format
- **Mistral**: Native `image_url` support
- **Others**: Fall back to text extraction for non-vision models

---

## Implementation Checklist

### Phase 1: Database (Migration Created)
- [x] Create AIModality table with seed data
- [x] Add DefaultInputModalityID/DefaultOutputModalityID to AIModelType
- [x] Add InheritTypeModalities and PriorVersionID to AIModel
- [x] Create AIModelModality junction table
- [x] Create AIAgentModality junction table
- [x] Add storage config to AIAgent
- [x] Add storage defaults to AIConfiguration
- [x] Create ConversationDetailAttachment table
- [x] Rename "Diffusion" to "Image Generator" model type
- [x] Rename "Audio" to "TTS" model type
- [x] Add new "STT" model type

### Phase 2: Run Migration & CodeGen
- [x] Run Flyway migration
- [x] Run CodeGen to generate entity classes
- [x] Verify generated TypeScript types

### Phase 2.5: AIArchitecture Catalog (ADDED)
- [x] Create AIArchitecture table with 10 architecture types
- [x] Create AIModelArchitecture junction table with Rank/Weight
- [x] Map 73+ LLM models to Transformer architecture
- [x] Map 10 embedding models to Transformer architecture
- [x] Map 2 TTS models to Transformer architecture
- [x] Map 1 video model to Diffusion architecture
- [x] Add secondary MoE mappings for Mixtral/Gemini/Qwen/GPT-5/Llama4/Grok4/DeepSeek
- [x] Add secondary Vision Transformer mappings for multimodal models

### Phase 3: Core Types (COMPLETED)
- [x] ChatMessageContentBlock type extended
- [x] Serialization utilities added
- [x] ConversationUtility extensions (GetAttachmentTypeFromMime, CreateAttachmentReference, etc.)
- [x] AttachmentContent and AttachmentType types defined

### Phase 4: Attachment Service (COMPLETED)
- [x] Create ConversationAttachmentService class (`ng-conversations` package)
- [x] Implement loadAttachmentsForMessages with batch loading
- [x] Implement saveAttachments with modality ID resolution
- [x] Implement createAttachmentReferences for message text tokens
- [x] Implement processFile for PendingAttachment creation
- [x] Implement createThumbnail with configurable max size
- [x] Implement getImageDimensions for dimension capture

### Phase 5: UI Components (COMPLETED)
- [x] Update MentionEditorComponent for image paste (already existed)
- [x] Drag & drop support (already existed in MentionEditorComponent)
- [x] File picker button (already existed in MentionEditorComponent)
- [x] ImageViewerComponent (already existed)
- [x] MessageItemComponent attachment display (already had template support)
- [x] Wire up attachmentsMap from conversation-chat-area to message-list to message-item
- [x] Wire up attachment saving in message-input with pending attachment tracking
- [x] Add attachmentClicked output events through component hierarchy

### Phase 6: Integration (In Progress)
- [x] Message input saves attachments after message save
- [x] Attachment references appended to message text
- [x] Attachments loaded in batch during peripheral data load
- [ ] Update agent execution to use BuildChatMessageContent
- [ ] Test with vision-capable models (Claude, GPT-4V, Gemini)
- [ ] Test storage provider integration for large files

---

## Storage Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Adds Attachment                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Validate Against Limits                      │
│  1. Resolve effective modalities (agent → model → type)         │
│  2. Check IsAllowed/IsSupported for modality+direction          │
│  3. Check size against cascaded limit                           │
│  4. Check count against cascaded limit                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            Size ≤ Threshold        Size > Threshold
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐    ┌───────────────────┐
        │  Store as Base64  │    │  Upload to        │
        │  in InlineData    │    │  MJStorage        │
        │  field            │    │  Store FileID     │
        └───────────────────┘    └───────────────────┘
                    │                       │
                    └───────────┬───────────┘
                                │
                                ▼
        ┌─────────────────────────────────────────────┐
        │  Generate Thumbnail (max 200px)              │
        │  Store in ThumbnailBase64                   │
        └─────────────────────────────────────────────┘
                                │
                                ▼
        ┌─────────────────────────────────────────────┐
        │  Create ConversationDetailAttachment        │
        │  record with ModalityID reference           │
        └─────────────────────────────────────────────┘
```

---

## Future Considerations

1. ~~**AIArchitecture as M2M**~~ - ✅ **IMPLEMENTED** in this migration: AIArchitecture and AIModelArchitecture tables with Rank/Weight fields for hybrid architectures. 80+ models mapped with primary and secondary architectures.
2. **Video thumbnails** - Generate frame captures for video previews
3. **Audio waveforms** - Visual representation of audio files
4. **Attachment search** - Search within conversation attachments
5. **Deduplication** - Detect and reuse identical files
6. **Compression** - Auto-compress images before storage
7. **CDN integration** - Serve attachments via CDN for performance

---

## Migration File

The database migration implementing this schema is located at:
`migrations/v2/V202601010001__v2.130.x_Multi_Modal_Chat_Support.sql`

This migration creates all tables, seed data, and relationships described above.
