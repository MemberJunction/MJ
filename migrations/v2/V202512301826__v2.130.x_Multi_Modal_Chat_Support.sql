-- ============================================================================
-- Multi-Modal Chat Support Schema Changes
-- Version: 2.130.x
-- Description: Adds support for image, video, and audio attachments in
--              conversations with configurable limits at model and agent levels.
-- ============================================================================

-- ============================================================================
-- PART 1: AI Model Entity - Add multi-modal capability and limit fields
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.AIModel ADD
    -- Input capabilities
    SupportsImageInput          BIT NOT NULL DEFAULT 0,
    SupportsVideoInput          BIT NOT NULL DEFAULT 0,
    SupportsAudioInput          BIT NOT NULL DEFAULT 0,
    -- Output capabilities (for generative models)
    SupportsImageOutput         BIT NOT NULL DEFAULT 0,
    SupportsVideoOutput         BIT NOT NULL DEFAULT 0,
    SupportsAudioOutput         BIT NOT NULL DEFAULT 0,
    -- Input size limits in bytes (NULL = use system default)
    MaxImageInputSizeBytes      INT NULL,
    MaxVideoInputSizeBytes      INT NULL,
    MaxAudioInputSizeBytes      INT NULL,
    -- Count limits per message (NULL = use system default)
    MaxImagesPerMessage         INT NULL,
    MaxVideosPerMessage         INT NULL,
    MaxAudiosPerMessage         INT NULL;
GO

-- ============================================================================
-- PART 2: AI Agent Entity - Add multi-modal input/output toggles and limits
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    -- Input toggles (agent can disable even if model supports)
    AllowImageInput             BIT NOT NULL DEFAULT 1,
    AllowVideoInput             BIT NOT NULL DEFAULT 0,
    AllowAudioInput             BIT NOT NULL DEFAULT 0,
    -- Output toggles
    AllowImageOutput            BIT NOT NULL DEFAULT 1,
    AllowVideoOutput            BIT NOT NULL DEFAULT 0,
    AllowAudioOutput            BIT NOT NULL DEFAULT 0,
    -- Override limits (NULL = use model's limit, then system default)
    MaxImageInputSizeBytes      INT NULL,
    MaxVideoInputSizeBytes      INT NULL,
    MaxAudioInputSizeBytes      INT NULL,
    MaxImagesPerMessage         INT NULL,
    MaxVideosPerMessage         INT NULL,
    MaxAudiosPerMessage         INT NULL,
    -- Storage configuration
    AttachmentStorageProviderID UNIQUEIDENTIFIER NULL,
    AttachmentStoragePath       NVARCHAR(500) NULL,
    -- Inline storage threshold (NULL = use system default of 1MB)
    -- Files <= this size stored as base64 inline
    -- Files > this size stored in MJStorage
    -- Set to 0 to always use MJStorage
    InlineStorageThresholdBytes INT NULL;
GO

-- Add foreign key constraint for AttachmentStorageProviderID
ALTER TABLE ${flyway:defaultSchema}.AIAgent
ADD CONSTRAINT FK_AIAgent_AttachmentStorageProvider
    FOREIGN KEY (AttachmentStorageProviderID)
    REFERENCES ${flyway:defaultSchema}.FileStorageProvider(ID);
GO

-- ============================================================================
-- PART 3: ConversationDetailAttachment Entity - New table for attachments
-- ============================================================================

CREATE TABLE ${flyway:defaultSchema}.ConversationDetailAttachment (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ConversationDetailID    UNIQUEIDENTIFIER NOT NULL,
    -- Content classification
    AttachmentType          NVARCHAR(20) NOT NULL,
    MimeType                NVARCHAR(100) NOT NULL,
    -- File metadata
    FileName                NVARCHAR(4000) NULL,
    FileSizeBytes           INT NOT NULL,
    Width                   INT NULL,
    Height                  INT NULL,
    DurationSeconds         INT NULL,
    -- Storage: ONE of these will be populated
    InlineData              NVARCHAR(MAX) NULL,
    FileID                  UNIQUEIDENTIFIER NULL,
    -- Display optimization
    DisplayOrder            INT NOT NULL DEFAULT 0,
    ThumbnailBase64         NVARCHAR(MAX) NULL,
    -- Primary key
    CONSTRAINT PK_ConversationDetailAttachment PRIMARY KEY (ID),
    -- Foreign keys
    CONSTRAINT FK_ConversationDetailAttachment_ConversationDetail
        FOREIGN KEY (ConversationDetailID)
        REFERENCES ${flyway:defaultSchema}.ConversationDetail(ID),
    CONSTRAINT FK_ConversationDetailAttachment_File
        FOREIGN KEY (FileID)
        REFERENCES ${flyway:defaultSchema}.File(ID),
    -- Check constraints
    CONSTRAINT CK_ConversationDetailAttachment_AttachmentType
        CHECK (AttachmentType IN ('Image', 'Video', 'Audio', 'Document')),
    CONSTRAINT CK_ConversationDetailAttachment_StorageType
        CHECK (InlineData IS NOT NULL OR FileID IS NOT NULL)
);
GO

-- ============================================================================
-- Extended Properties for AI Model fields
-- ============================================================================

-- Input capabilities
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this model supports image input for vision capabilities.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'SupportsImageInput';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this model supports video input.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'SupportsVideoInput';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this model supports audio input.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'SupportsAudioInput';
GO

-- Output capabilities
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this model can generate image output.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'SupportsImageOutput';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this model can generate video output.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'SupportsVideoOutput';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this model can generate audio output (text-to-speech).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'SupportsAudioOutput';
GO

-- Size limits
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum image input size in bytes. NULL uses system default (5MB).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'MaxImageInputSizeBytes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum video input size in bytes. NULL uses system default (50MB).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'MaxVideoInputSizeBytes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum audio input size in bytes. NULL uses system default (25MB).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'MaxAudioInputSizeBytes';
GO

-- Count limits
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum number of images per message. NULL uses system default (10).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'MaxImagesPerMessage';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum number of videos per message. NULL uses system default (3).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'MaxVideosPerMessage';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum number of audio files per message. NULL uses system default (5).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'MaxAudiosPerMessage';
GO

-- ============================================================================
-- Extended Properties for AI Agent fields
-- ============================================================================

-- Input toggles
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this agent accepts image input from users. Can be disabled even if model supports it.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AllowImageInput';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this agent accepts video input from users.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AllowVideoInput';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this agent accepts audio input from users.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AllowAudioInput';
GO

-- Output toggles
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this agent can generate image output.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AllowImageOutput';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this agent can generate video output.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AllowVideoOutput';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this agent can generate audio output.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AllowAudioOutput';
GO

-- Size limits
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Override for maximum image input size in bytes. NULL uses model setting, then system default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'MaxImageInputSizeBytes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Override for maximum video input size in bytes. NULL uses model setting, then system default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'MaxVideoInputSizeBytes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Override for maximum audio input size in bytes. NULL uses model setting, then system default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'MaxAudioInputSizeBytes';
GO

-- Count limits
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Override for maximum images per message. NULL uses model setting, then system default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'MaxImagesPerMessage';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Override for maximum videos per message. NULL uses model setting, then system default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'MaxVideosPerMessage';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Override for maximum audio files per message. NULL uses model setting, then system default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'MaxAudiosPerMessage';
GO

-- Storage configuration
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional file storage provider for large attachments. NULL uses system default provider.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AttachmentStorageProviderID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Root path in storage provider for this agent''s attachments. Format: /folder/subfolder',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AttachmentStoragePath';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'File size threshold for inline storage. Files <= this size stored as base64, larger files use MJStorage. NULL uses system default (1MB). Set to 0 to always use MJStorage.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'InlineStorageThresholdBytes';
GO

-- ============================================================================
-- Extended Properties for ConversationDetailAttachment table
-- ============================================================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores attachments (images, videos, audio, documents) for conversation messages.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the attachment.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the conversation message this attachment belongs to.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'ConversationDetailID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of attachment: Image, Video, Audio, or Document.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'AttachmentType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'MIME type of the attachment (e.g., image/png, video/mp4, audio/mp3).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'MimeType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Original filename of the attachment. Supports long cloud storage paths up to 4000 characters.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'FileName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Size of the attachment in bytes.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'FileSizeBytes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Width in pixels for images and videos.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'Width';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Height in pixels for images and videos.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'Height';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Duration in seconds for audio and video files.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'DurationSeconds';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Base64-encoded file data for small attachments stored inline. Mutually exclusive with FileID.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'InlineData';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to File entity for large attachments stored in MJStorage. Mutually exclusive with InlineData.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'FileID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display order for multiple attachments in a message. Lower numbers appear first.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'DisplayOrder';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Base64-encoded thumbnail image for quick preview display. Max 200px on longest side.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'ThumbnailBase64';
GO
