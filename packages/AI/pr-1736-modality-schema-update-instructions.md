# PR #1736 Schema Update Instructions: Normalized Modality Approach

## Overview

This document provides instructions for updating PR #1736 (Multi-Modal Chat Support) to use a **normalized modality schema** instead of flat columns on AIModel and AIAgent tables.

### Why This Change?

The original PR adds 12+ columns directly to AIModel and AIAgent tables:
- `SupportsImageInput`, `SupportsVideoInput`, `SupportsAudioInput`
- `SupportsImageOutput`, `SupportsVideoOutput`, `SupportsAudioOutput`
- `MaxImageInputSizeBytes`, `MaxVideoInputSizeBytes`, etc.

**Problem**: As AI models become increasingly multimodal and new modalities emerge (3D models, haptic feedback, structured data, etc.), this approach requires schema changes for each new modality.

**Solution**: Create a normalized structure with:
1. `AIModality` - Master list of modalities
2. `AIModelModality` - Junction table linking models to their supported modalities
3. `AIAgentModality` - Agent-level overrides/restrictions

---

## Instructions

### Step 1: Update the Migration File

Replace the contents of `migrations/v2/V202512301826__v2.130.x_Multi_Modal_Chat_Support.sql` with the schema below.

**DO NOT** add these columns to AIModel:
- ~~SupportsImageInput, SupportsVideoInput, SupportsAudioInput~~
- ~~SupportsImageOutput, SupportsVideoOutput, SupportsAudioOutput~~
- ~~MaxImageInputSizeBytes, MaxVideoInputSizeBytes, MaxAudioInputSizeBytes~~
- ~~MaxImagesPerMessage, MaxVideosPerMessage, MaxAudiosPerMessage~~

**DO NOT** add these columns to AIAgent:
- ~~AllowImageInput, AllowVideoInput, AllowAudioInput~~
- ~~AllowImageOutput, AllowVideoOutput, AllowAudioOutput~~
- ~~MaxImageInputSizeBytes, MaxVideoInputSizeBytes, MaxAudioInputSizeBytes~~
- ~~MaxImagesPerMessage, MaxVideosPerMessage, MaxAudiosPerMessage~~

**KEEP** these columns on AIAgent (storage configuration):
- `AttachmentStorageProviderID`
- `AttachmentStoragePath`
- `InlineStorageThresholdBytes`

---

### Step 2: New Schema Definition

#### Part 1: AIModality Entity

```sql
-- ============================================================================
-- PART 1: AIModality Entity - Master list of content modalities
-- ============================================================================

CREATE TABLE ${flyway:defaultSchema}.AIModality (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                    NVARCHAR(50) NOT NULL,
    Description             NVARCHAR(500) NULL,
    ContentBlockType        NVARCHAR(50) NOT NULL,
    MIMETypePattern         NVARCHAR(100) NULL,
    Category                NVARCHAR(50) NOT NULL DEFAULT 'Content',
    IsInput                 BIT NOT NULL DEFAULT 1,
    IsOutput                BIT NOT NULL DEFAULT 1,
    DefaultMaxSizeBytes     INT NULL,
    DefaultMaxCountPerMessage INT NULL,
    DisplayOrder            INT NOT NULL DEFAULT 0,
    __mj_CreatedAt          DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt          DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_AIModality PRIMARY KEY (ID),
    CONSTRAINT UQ_AIModality_Name UNIQUE (Name),
    CONSTRAINT CK_AIModality_Category CHECK (Category IN ('Content', 'Structured', 'Binary'))
);
GO
```

**Extended Properties for AIModality:**

```sql
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Master list of AI content modalities (Text, Image, Audio, Video, etc.) that models can accept as input or produce as output.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Display name of the modality (e.g., Text, Image, Audio, Video, File, Embedding).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'Name';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Maps to ChatMessageContentBlock.type values: text, image_url, video_url, audio_url, file_url, embedding.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'ContentBlockType';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'MIME type pattern for this modality (e.g., image/*, audio/*, video/*, text/*).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'MIMETypePattern';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Classification category: Content (human-readable), Structured (JSON/XML), Binary (media files).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'Category';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this modality can be used as input to AI models.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'IsInput';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this modality can be produced as output by AI models.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'IsOutput';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'System default maximum size in bytes for this modality. Can be overridden at model or agent level.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'DefaultMaxSizeBytes';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'System default maximum count per message for this modality. Can be overridden at model or agent level.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'DefaultMaxCountPerMessage';
GO
```

#### Part 2: AIModelModality Junction Table

```sql
-- ============================================================================
-- PART 2: AIModelModality Entity - Links models to their supported modalities
-- ============================================================================

CREATE TABLE ${flyway:defaultSchema}.AIModelModality (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ModelID                 UNIQUEIDENTIFIER NOT NULL,
    ModalityID              UNIQUEIDENTIFIER NOT NULL,
    Direction               NVARCHAR(10) NOT NULL,
    IsSupported             BIT NOT NULL DEFAULT 1,
    IsRequired              BIT NOT NULL DEFAULT 0,
    IsPrimary               BIT NOT NULL DEFAULT 0,
    SupportedFormats        NVARCHAR(500) NULL,
    MaxSizeBytes            INT NULL,
    MaxCountPerMessage      INT NULL,
    MaxDimension            INT NULL,
    Notes                   NVARCHAR(1000) NULL,
    __mj_CreatedAt          DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt          DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_AIModelModality PRIMARY KEY (ID),
    CONSTRAINT FK_AIModelModality_Model FOREIGN KEY (ModelID) REFERENCES ${flyway:defaultSchema}.AIModel(ID),
    CONSTRAINT FK_AIModelModality_Modality FOREIGN KEY (ModalityID) REFERENCES ${flyway:defaultSchema}.AIModality(ID),
    CONSTRAINT CK_AIModelModality_Direction CHECK (Direction IN ('Input', 'Output')),
    CONSTRAINT UQ_AIModelModality UNIQUE (ModelID, ModalityID, Direction)
);
GO
```

**Extended Properties for AIModelModality:**

```sql
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Junction table linking AI models to their supported input and output modalities with model-specific configuration.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this is an Input or Output modality for the model.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'Direction';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'For inputs: whether this modality is required (e.g., text is usually required). For outputs: not applicable.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'IsRequired';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'For outputs: whether this is the primary output modality. For inputs: not applicable.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'IsPrimary';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Comma-separated list of supported formats (e.g., png,jpg,webp,gif for images or mp3,wav,m4a for audio).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'SupportedFormats';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Model-specific maximum size in bytes. Overrides AIModality.DefaultMaxSizeBytes.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'MaxSizeBytes';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Model-specific maximum count per message. Overrides AIModality.DefaultMaxCountPerMessage.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'MaxCountPerMessage';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'For image/video modalities: maximum dimension (width or height) in pixels.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'MaxDimension';
GO
```

#### Part 3: AIAgentModality Junction Table

```sql
-- ============================================================================
-- PART 3: AIAgentModality Entity - Agent-level modality overrides
-- ============================================================================

CREATE TABLE ${flyway:defaultSchema}.AIAgentModality (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentID                 UNIQUEIDENTIFIER NOT NULL,
    ModalityID              UNIQUEIDENTIFIER NOT NULL,
    Direction               NVARCHAR(10) NOT NULL,
    IsAllowed               BIT NOT NULL DEFAULT 1,
    MaxSizeBytes            INT NULL,
    MaxCountPerMessage      INT NULL,
    AllowedFormats          NVARCHAR(500) NULL,
    __mj_CreatedAt          DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt          DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_AIAgentModality PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentModality_Agent FOREIGN KEY (AgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_AIAgentModality_Modality FOREIGN KEY (ModalityID) REFERENCES ${flyway:defaultSchema}.AIModality(ID),
    CONSTRAINT CK_AIAgentModality_Direction CHECK (Direction IN ('Input', 'Output')),
    CONSTRAINT UQ_AIAgentModality UNIQUE (AgentID, ModalityID, Direction)
);
GO
```

**Extended Properties for AIAgentModality:**

```sql
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Agent-level modality configuration. Allows agents to restrict or override model-level modality settings.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentModality';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this modality is allowed for this agent. Set to 0 to disable a modality even if the underlying model supports it.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentModality',
    @level2type = N'COLUMN', @level2name = 'IsAllowed';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Agent-specific maximum size in bytes. Overrides model and system defaults.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentModality',
    @level2type = N'COLUMN', @level2name = 'MaxSizeBytes';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Agent-specific allowed formats. If set, restricts to only these formats even if model supports more.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentModality',
    @level2type = N'COLUMN', @level2name = 'AllowedFormats';
GO
```

#### Part 4: AIAgent Storage Columns (Keep These)

```sql
-- ============================================================================
-- PART 4: AIAgent Entity - Storage configuration only
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    AttachmentStorageProviderID UNIQUEIDENTIFIER NULL,
    AttachmentStoragePath       NVARCHAR(500) NULL,
    InlineStorageThresholdBytes INT NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.AIAgent
ADD CONSTRAINT FK_AIAgent_AttachmentStorageProvider
    FOREIGN KEY (AttachmentStorageProviderID)
    REFERENCES ${flyway:defaultSchema}.FileStorageProvider(ID);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Storage provider for attachments that exceed the inline storage threshold.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AttachmentStorageProviderID';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Base path within the storage provider for this agent''s attachments.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AttachmentStoragePath';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Files <= this size (in bytes) are stored as base64 inline. Files > this size use MJStorage. NULL uses system default (1MB). Set to 0 to always use MJStorage.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'InlineStorageThresholdBytes';
GO
```

#### Part 5: ConversationDetailAttachment (Keep As-Is)

Keep the `ConversationDetailAttachment` table exactly as it was in the original PR - it stores the actual attachment data and is not affected by this modality refactoring.

#### Part 6: Seed Data for AIModality

```sql
-- ============================================================================
-- PART 6: Seed AIModality with standard modalities
-- ============================================================================

INSERT INTO ${flyway:defaultSchema}.AIModality
    (ID, Name, Description, ContentBlockType, MIMETypePattern, Category, IsInput, IsOutput, DefaultMaxSizeBytes, DefaultMaxCountPerMessage, DisplayOrder)
VALUES
    ('11111111-1111-1111-1111-000000000001', 'Text', 'Natural language text content', 'text', 'text/*', 'Content', 1, 1, NULL, NULL, 1),
    ('11111111-1111-1111-1111-000000000002', 'Image', 'Static images (PNG, JPEG, WebP, GIF)', 'image_url', 'image/*', 'Binary', 1, 1, 5242880, 10, 2),
    ('11111111-1111-1111-1111-000000000003', 'Audio', 'Audio files (MP3, WAV, M4A)', 'audio_url', 'audio/*', 'Binary', 1, 1, 26214400, 5, 3),
    ('11111111-1111-1111-1111-000000000004', 'Video', 'Video files (MP4, WebM)', 'video_url', 'video/*', 'Binary', 1, 1, 52428800, 3, 4),
    ('11111111-1111-1111-1111-000000000005', 'File', 'Generic files and documents', 'file_url', 'application/*', 'Binary', 1, 0, 10485760, 5, 5),
    ('11111111-1111-1111-1111-000000000006', 'Embedding', 'Vector embeddings for semantic search', 'embedding', 'application/json', 'Structured', 0, 1, NULL, NULL, 6);
GO
```

**Note on DefaultMaxSizeBytes values:**
- Text: NULL (no limit, token-based)
- Image: 5MB (5,242,880 bytes)
- Audio: 25MB (26,214,400 bytes)
- Video: 50MB (52,428,800 bytes)
- File: 10MB (10,485,760 bytes)
- Embedding: NULL (structured data, no size limit)

---

### Step 3: Update TypeScript Types

The `ChatMessageContentBlock` type in `packages/AI/Core/src/generic/chat.types.ts` should remain as updated in the PR. No changes needed there.

### Step 4: Update Service Layer

The `ConversationAttachmentService` and `ConversationUtility` need to be updated to:

1. **Query modality support** from the new junction tables instead of flat columns
2. **Resolve effective limits** using the hierarchy: Agent → Model → System Default

Example resolution logic:
```typescript
async getEffectiveModalityConfig(
    agentId: string,
    modelId: string,
    modalityName: string,
    direction: 'Input' | 'Output'
): Promise<ModalityConfig> {
    // 1. Check AIAgentModality for agent-specific override
    // 2. Fall back to AIModelModality for model default
    // 3. Fall back to AIModality for system default
}
```

### Step 5: Update AIEngineBase

Add methods to `AIEngineBase` for modality-based model discovery:

```typescript
// Find models that support specific input/output modalities
async FindModelsByModalities(options: {
    requiredInputs?: string[];   // e.g., ['Text', 'Image']
    requiredOutputs?: string[];  // e.g., ['Text']
    preferredVendor?: string;
}): Promise<AIModelEntityExtended[]>

// Get modalities for a specific model
GetModelModalities(modelId: string, direction?: 'Input' | 'Output'): AIModelModalityEntity[]

// Check if model supports a specific modality
ModelSupportsModality(modelId: string, modalityName: string, direction: 'Input' | 'Output'): boolean
```

### Step 6: Run CodeGen

After applying the migration, run CodeGen to generate:
- `AIModalityEntity`
- `AIModelModalityEntity`
- `AIAgentModalityEntity`

---

## Resolution Hierarchy Summary

When determining if a modality is allowed and what limits apply:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. AIAgentModality (most specific)                             │
│     - IsAllowed: Can disable modality even if model supports    │
│     - MaxSizeBytes, MaxCountPerMessage: Agent-specific limits   │
│     - AllowedFormats: Can restrict to subset of model formats   │
├─────────────────────────────────────────────────────────────────┤
│  2. AIModelModality (model default)                             │
│     - IsSupported: Whether model supports this modality         │
│     - SupportedFormats: What formats the model can handle       │
│     - MaxSizeBytes, MaxCountPerMessage: Model-specific limits   │
├─────────────────────────────────────────────────────────────────┤
│  3. AIModality (system default)                                 │
│     - DefaultMaxSizeBytes, DefaultMaxCountPerMessage            │
│     - Used when no model/agent override exists                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Benefits of This Approach

1. **Extensible**: Add new modalities (3D, haptic, etc.) with INSERT, not ALTER TABLE
2. **Format tracking**: Know which specific formats each model supports
3. **Cleaner schema**: No column bloat on AIModel/AIAgent as modalities grow
4. **Flexible queries**: Find models by capability ("give me all models that can do image → text")
5. **Future-proof**: Ready for the explosion of multimodal AI capabilities
