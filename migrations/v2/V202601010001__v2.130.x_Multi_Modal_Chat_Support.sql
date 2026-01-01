-- ============================================================================
-- Multi-Modal Chat Support Schema Changes - Normalized Modality Approach
-- Version: 2.130.x
-- Description: Adds support for image, video, and audio attachments in
--              conversations using a normalized modality system that is
--              extensible without schema changes.
-- ============================================================================

-- ============================================================================
-- PART 1: AIModality Entity - Master list of content modalities
-- ============================================================================

CREATE TABLE ${flyway:defaultSchema}.AIModality (
    ID                          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                        NVARCHAR(50) NOT NULL,
    Description                 NVARCHAR(500) NULL,
    ContentBlockType            NVARCHAR(50) NOT NULL,
    MIMETypePattern             NVARCHAR(100) NULL,
    Type                        NVARCHAR(50) NOT NULL DEFAULT 'Content',
    DefaultMaxSizeBytes         INT NULL,
    DefaultMaxCountPerMessage   INT NULL,
    DisplayOrder                INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_AIModality PRIMARY KEY (ID),
    CONSTRAINT UQ_AIModality_Name UNIQUE (Name),
    CONSTRAINT CK_AIModality_Type CHECK (Type IN ('Content', 'Structured', 'Binary')),
    CONSTRAINT CK_AIModality_ContentBlockType CHECK (ContentBlockType IN ('text', 'image_url', 'video_url', 'audio_url', 'file_url', 'embedding'))
);
GO

-- Extended properties for AIModality table
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Master list of AI content modalities (Text, Image, Audio, Video, etc.) that models can accept as input or produce as output. New modalities can be added via INSERT without schema changes.',
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
    @value = N'Detailed description of this modality and its use cases.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'Description';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Maps to ChatMessageContentBlock.type values: text, image_url, video_url, audio_url, file_url, embedding. Must match the TypeScript type definition.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'ContentBlockType';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'MIME type pattern for this modality (e.g., image/*, audio/*, video/*, text/*, application/*). Used for file type validation.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'MIMETypePattern';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Classification type: Content (human-readable text), Structured (JSON/embeddings), Binary (media files like images, audio, video).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'Type';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'System-wide default maximum size in bytes for this modality. Can be overridden at model or agent level. NULL means no size limit.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'DefaultMaxSizeBytes';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'System-wide default maximum count per message for this modality. Can be overridden at model or agent level. NULL means no count limit.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'DefaultMaxCountPerMessage';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Display order for UI presentation. Lower numbers appear first.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModality',
    @level2type = N'COLUMN', @level2name = 'DisplayOrder';
GO

-- ============================================================================
-- PART 2: Seed AIModality with standard modalities
-- ============================================================================

INSERT INTO ${flyway:defaultSchema}.AIModality
    (ID, Name, Description, ContentBlockType, MIMETypePattern, Type, DefaultMaxSizeBytes, DefaultMaxCountPerMessage, DisplayOrder)
VALUES
    ('EA43F4CF-EC26-41D7-B2AC-CF928AF63E46', 'Text', 'Natural language text content for conversation messages and prompts.', 'text', 'text/*', 'Content', NULL, NULL, 1),
    ('AAD386E4-D6ED-4E6E-8960-B56AC1D2783B', 'Image', 'Static images (PNG, JPEG, WebP, GIF) for vision capabilities and image generation.', 'image_url', 'image/*', 'Binary', 5242880, 10, 2),
    ('FC3CAE20-6FA8-4ABF-B02E-62CEA920313E', 'Audio', 'Audio files (MP3, WAV, M4A) for speech-to-text, audio understanding, and text-to-speech.', 'audio_url', 'audio/*', 'Binary', 26214400, 5, 3),
    ('9AAD272B-A1C8-4498-ACFC-0C6D50D82B96', 'Video', 'Video files (MP4, WebM) for video understanding and generation.', 'video_url', 'video/*', 'Binary', 52428800, 3, 4),
    ('3E930454-29AE-48B9-8888-10FD74BC67B9', 'File', 'Generic files and documents (PDF, DOC, etc.) for document processing.', 'file_url', 'application/*', 'Binary', 10485760, 5, 5),
    ('BB0C8564-E79C-4AF9-82B0-26D6EAB4BC01', 'Embedding', 'Vector embeddings for semantic search and similarity operations.', 'embedding', 'application/json', 'Structured', NULL, NULL, 6);
GO

-- ============================================================================
-- PART 3: AIModelType - Add default modality columns (nullable first)
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.AIModelType ADD
    DefaultInputModalityID      UNIQUEIDENTIFIER NULL,
    DefaultOutputModalityID     UNIQUEIDENTIFIER NULL;
GO

-- Add foreign key constraints
ALTER TABLE ${flyway:defaultSchema}.AIModelType
ADD CONSTRAINT FK_AIModelType_DefaultInputModality
    FOREIGN KEY (DefaultInputModalityID)
    REFERENCES ${flyway:defaultSchema}.AIModality(ID);
GO

ALTER TABLE ${flyway:defaultSchema}.AIModelType
ADD CONSTRAINT FK_AIModelType_DefaultOutputModality
    FOREIGN KEY (DefaultOutputModalityID)
    REFERENCES ${flyway:defaultSchema}.AIModality(ID);
GO

-- Extended properties for new AIModelType columns
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Default input modality for this model type. Models of this type inherit this as their primary input modality unless overridden.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelType',
    @level2type = N'COLUMN', @level2name = 'DefaultInputModalityID';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Default output modality for this model type. Models of this type inherit this as their primary output modality unless overridden.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelType',
    @level2type = N'COLUMN', @level2name = 'DefaultOutputModalityID';
GO

-- Rename Diffusion to Image Generator (Diffusion is an architecture, not a model purpose/type)
-- Note: Description already has correct value 'Model for Image Generation', no update needed
UPDATE ${flyway:defaultSchema}.AIModelType
SET Name = 'Image Generator'
WHERE ID = 'E9A5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Was: Diffusion
GO

-- Update existing model types with default modalities using UUIDs for safety
-- LLM: Text in, Text out
UPDATE ${flyway:defaultSchema}.AIModelType
SET DefaultInputModalityID = 'EA43F4CF-EC26-41D7-B2AC-CF928AF63E46',  -- Text
    DefaultOutputModalityID = 'EA43F4CF-EC26-41D7-B2AC-CF928AF63E46'  -- Text
WHERE ID = 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- LLM
GO

-- Rename Audio model type to TTS (Text-to-Speech) since that's what it actually is
-- (Models like ElevenLabs are TTS; STT like Whisper is a separate type)
UPDATE ${flyway:defaultSchema}.AIModelType
SET Name = 'TTS',
    Description = 'Text-to-Speech model for generating audio from text'
WHERE ID = '5F75433E-F36B-1410-8D99-00021F8B792E'; -- Was: Audio
GO

-- TTS: Text in (prompt), Audio out
UPDATE ${flyway:defaultSchema}.AIModelType
SET DefaultInputModalityID = 'EA43F4CF-EC26-41D7-B2AC-CF928AF63E46',  -- Text
    DefaultOutputModalityID = 'FC3CAE20-6FA8-4ABF-B02E-62CEA920313E'  -- Audio
WHERE ID = '5F75433E-F36B-1410-8D99-00021F8B792E'; -- TTS (formerly Audio)
GO

-- Add new STT (Speech-to-Text) model type for transcription models like Whisper
INSERT INTO ${flyway:defaultSchema}.AIModelType (ID, Name, Description)
VALUES ('5E527CEF-46EC-421F-9AAC-C69E22426402', 'STT', 'Speech-to-Text model for transcribing audio to text');
GO

-- STT: Audio in, Text out
UPDATE ${flyway:defaultSchema}.AIModelType
SET DefaultInputModalityID = 'FC3CAE20-6FA8-4ABF-B02E-62CEA920313E',  -- Audio
    DefaultOutputModalityID = 'EA43F4CF-EC26-41D7-B2AC-CF928AF63E46'  -- Text
WHERE ID = '5E527CEF-46EC-421F-9AAC-C69E22426402'; -- STT
GO

-- Video: Text in (prompt), Video out
UPDATE ${flyway:defaultSchema}.AIModelType
SET DefaultInputModalityID = 'EA43F4CF-EC26-41D7-B2AC-CF928AF63E46',  -- Text
    DefaultOutputModalityID = '9AAD272B-A1C8-4498-ACFC-0C6D50D82B96'  -- Video
WHERE ID = '6175433E-F36B-1410-8D99-00021F8B792E'; -- Video
GO

-- Embeddings: Text in, Embedding out
UPDATE ${flyway:defaultSchema}.AIModelType
SET DefaultInputModalityID = 'EA43F4CF-EC26-41D7-B2AC-CF928AF63E46',  -- Text
    DefaultOutputModalityID = 'BB0C8564-E79C-4AF9-82B0-26D6EAB4BC01'  -- Embedding
WHERE ID = 'EAA5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Embeddings
GO

-- Image Generator: Text in (prompt), Image out
UPDATE ${flyway:defaultSchema}.AIModelType
SET DefaultInputModalityID = 'EA43F4CF-EC26-41D7-B2AC-CF928AF63E46',  -- Text
    DefaultOutputModalityID = 'AAD386E4-D6ED-4E6E-8960-B56AC1D2783B'  -- Image
WHERE ID = 'E9A5CCEC-6A37-EF11-86D4-000D3A4E707E'; -- Image Generator (formerly Diffusion)
GO

-- Now make the columns required since all existing types have been updated
ALTER TABLE ${flyway:defaultSchema}.AIModelType
ALTER COLUMN DefaultInputModalityID UNIQUEIDENTIFIER NOT NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.AIModelType
ALTER COLUMN DefaultOutputModalityID UNIQUEIDENTIFIER NOT NULL;
GO

-- ============================================================================
-- PART 4: AIModel - Add inheritance flag and version lineage
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.AIModel ADD
    InheritTypeModalities       BIT NOT NULL DEFAULT 1,
    PriorVersionID              UNIQUEIDENTIFIER NULL;
GO

-- Add foreign key for version lineage
ALTER TABLE ${flyway:defaultSchema}.AIModel
ADD CONSTRAINT FK_AIModel_PriorVersion
    FOREIGN KEY (PriorVersionID)
    REFERENCES ${flyway:defaultSchema}.AIModel(ID);
GO

-- Extended properties for new AIModel columns
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When TRUE (default), the model inherits default input/output modalities from its AIModelType AND can extend with additional modalities via AIModelModality records. When FALSE, only modalities explicitly defined in AIModelModality are used.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'InheritTypeModalities';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Reference to the previous version of this model, creating a version lineage chain. For example, GPT-4 Turbo might reference GPT-4 as its prior version.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModel',
    @level2type = N'COLUMN', @level2name = 'PriorVersionID';
GO

-- ============================================================================
-- PART 5: AIModelModality - Junction table for model capabilities
-- ============================================================================

CREATE TABLE ${flyway:defaultSchema}.AIModelModality (
    ID                          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ModelID                     UNIQUEIDENTIFIER NOT NULL,
    ModalityID                  UNIQUEIDENTIFIER NOT NULL,
    Direction                   NVARCHAR(10) NOT NULL,
    IsSupported                 BIT NOT NULL DEFAULT 1,
    IsRequired                  BIT NOT NULL DEFAULT 0,
    SupportedFormats            NVARCHAR(500) NULL,
    MaxSizeBytes                INT NULL,
    MaxCountPerMessage          INT NULL,
    MaxDimension                INT NULL,
    Comments                    NVARCHAR(MAX) NULL,
    CONSTRAINT PK_AIModelModality PRIMARY KEY (ID),
    CONSTRAINT FK_AIModelModality_Model FOREIGN KEY (ModelID) REFERENCES ${flyway:defaultSchema}.AIModel(ID),
    CONSTRAINT FK_AIModelModality_Modality FOREIGN KEY (ModalityID) REFERENCES ${flyway:defaultSchema}.AIModality(ID),
    CONSTRAINT CK_AIModelModality_Direction CHECK (Direction IN ('Input', 'Output')),
    CONSTRAINT UQ_AIModelModality UNIQUE (ModelID, ModalityID, Direction)
);
GO

-- Extended properties for AIModelModality table
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Junction table linking AI models to their supported input and output modalities with model-specific configuration. Used to extend beyond the default modalities inherited from AIModelType.',
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
    @value = N'Whether this modality is supported. Can be set to FALSE to explicitly disable an inherited modality.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'IsSupported';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'For input modalities: whether this modality is required (e.g., text is usually required for LLMs). For outputs: not typically applicable.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'IsRequired';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Comma-separated list of supported file formats/extensions (e.g., png,jpg,webp,gif for images or mp3,wav,m4a for audio).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'SupportedFormats';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Model-specific maximum size in bytes. Overrides AIModality.DefaultMaxSizeBytes. NULL means use system default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'MaxSizeBytes';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Model-specific maximum count per message. Overrides AIModality.DefaultMaxCountPerMessage. NULL means use system default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'MaxCountPerMessage';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'For image/video modalities: maximum dimension (width or height) in pixels supported by this model.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'MaxDimension';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Additional notes or documentation about this model-modality configuration.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelModality',
    @level2type = N'COLUMN', @level2name = 'Comments';
GO

-- ============================================================================
-- PART 6: AIAgentModality - Junction table for agent overrides
-- ============================================================================

CREATE TABLE ${flyway:defaultSchema}.AIAgentModality (
    ID                          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AgentID                     UNIQUEIDENTIFIER NOT NULL,
    ModalityID                  UNIQUEIDENTIFIER NOT NULL,
    Direction                   NVARCHAR(10) NOT NULL,
    IsAllowed                   BIT NOT NULL DEFAULT 1,
    MaxSizeBytes                INT NULL,
    MaxCountPerMessage          INT NULL,
    CONSTRAINT PK_AIAgentModality PRIMARY KEY (ID),
    CONSTRAINT FK_AIAgentModality_Agent FOREIGN KEY (AgentID) REFERENCES ${flyway:defaultSchema}.AIAgent(ID),
    CONSTRAINT FK_AIAgentModality_Modality FOREIGN KEY (ModalityID) REFERENCES ${flyway:defaultSchema}.AIModality(ID),
    CONSTRAINT CK_AIAgentModality_Direction CHECK (Direction IN ('Input', 'Output')),
    CONSTRAINT UQ_AIAgentModality UNIQUE (AgentID, ModalityID, Direction)
);
GO

-- Extended properties for AIAgentModality table
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Agent-level modality configuration. Allows agents to restrict or customize modality settings beyond what the model supports. Absence of a record means the agent uses model defaults (Text in/out assumed if no records exist).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentModality';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this is an Input or Output modality for the agent.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentModality',
    @level2type = N'COLUMN', @level2name = 'Direction';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether this modality is allowed for this agent. Set to FALSE to disable a modality even if the underlying model supports it.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentModality',
    @level2type = N'COLUMN', @level2name = 'IsAllowed';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Agent-specific maximum size in bytes. Overrides model and system defaults. Must be less than or equal to model limit.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentModality',
    @level2type = N'COLUMN', @level2name = 'MaxSizeBytes';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Agent-specific maximum count per message. Overrides model and system defaults. Must be less than or equal to model limit.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentModality',
    @level2type = N'COLUMN', @level2name = 'MaxCountPerMessage';
GO

-- ============================================================================
-- PART 7: AIAgent - Add storage configuration
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.AIAgent ADD
    AttachmentStorageProviderID UNIQUEIDENTIFIER NULL,
    AttachmentRootPath          NVARCHAR(500) NULL,
    InlineStorageThresholdBytes INT NULL;
GO

-- Add foreign key constraint for AttachmentStorageProviderID
ALTER TABLE ${flyway:defaultSchema}.AIAgent
ADD CONSTRAINT FK_AIAgent_AttachmentStorageProvider
    FOREIGN KEY (AttachmentStorageProviderID)
    REFERENCES ${flyway:defaultSchema}.FileStorageProvider(ID);
GO

-- Extended properties for new AIAgent columns
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'File storage provider for large attachments. Overrides the default from AIConfiguration. NULL uses system default.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AttachmentStorageProviderID';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Base path within the storage provider for this agent''s attachments. Agent run ID and sequence number are appended to create unique paths. Format: /folder/subfolder',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AttachmentRootPath';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'File size threshold for inline storage. Files <= this size are stored as base64 inline, larger files use MJStorage. NULL uses system default (1MB). Set to 0 to always use MJStorage.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'InlineStorageThresholdBytes';
GO

-- ============================================================================
-- PART 8: AIConfiguration - Add default storage configuration
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.AIConfiguration ADD
    DefaultStorageProviderID    UNIQUEIDENTIFIER NULL,
    DefaultStorageRootPath      NVARCHAR(500) NULL;
GO

-- Add foreign key constraint
ALTER TABLE ${flyway:defaultSchema}.AIConfiguration
ADD CONSTRAINT FK_AIConfiguration_DefaultStorageProvider
    FOREIGN KEY (DefaultStorageProviderID)
    REFERENCES ${flyway:defaultSchema}.FileStorageProvider(ID);
GO

-- Extended properties for new AIConfiguration columns
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Default file storage provider for agent attachments. Used when an agent does not specify its own AttachmentStorageProviderID.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIConfiguration',
    @level2type = N'COLUMN', @level2name = 'DefaultStorageProviderID';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Default root path within the storage provider for agent attachments. Used when an agent does not specify its own AttachmentRootPath.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIConfiguration',
    @level2type = N'COLUMN', @level2name = 'DefaultStorageRootPath';
GO

-- ============================================================================
-- PART 9: ConversationDetailAttachment Entity - Storage for attachments
-- ============================================================================

CREATE TABLE ${flyway:defaultSchema}.ConversationDetailAttachment (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ConversationDetailID    UNIQUEIDENTIFIER NOT NULL,
    ModalityID              UNIQUEIDENTIFIER NOT NULL,
    MimeType                NVARCHAR(100) NOT NULL,
    FileName                NVARCHAR(4000) NULL,
    FileSizeBytes           INT NOT NULL,
    Width                   INT NULL,
    Height                  INT NULL,
    DurationSeconds         INT NULL,
    InlineData              NVARCHAR(MAX) NULL,
    FileID                  UNIQUEIDENTIFIER NULL,
    DisplayOrder            INT NOT NULL DEFAULT 0,
    ThumbnailBase64         NVARCHAR(MAX) NULL,
    CONSTRAINT PK_ConversationDetailAttachment PRIMARY KEY (ID),
    CONSTRAINT FK_ConversationDetailAttachment_ConversationDetail
        FOREIGN KEY (ConversationDetailID)
        REFERENCES ${flyway:defaultSchema}.ConversationDetail(ID),
    CONSTRAINT FK_ConversationDetailAttachment_Modality
        FOREIGN KEY (ModalityID)
        REFERENCES ${flyway:defaultSchema}.AIModality(ID),
    CONSTRAINT FK_ConversationDetailAttachment_File
        FOREIGN KEY (FileID)
        REFERENCES ${flyway:defaultSchema}.File(ID),
    CONSTRAINT CK_ConversationDetailAttachment_StorageType
        CHECK (InlineData IS NOT NULL OR FileID IS NOT NULL)
);
GO

-- Extended properties for ConversationDetailAttachment table
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Stores attachments (images, videos, audio, documents) for conversation messages. Supports both inline base64 storage for small files and reference to MJStorage for large files.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The modality type of this attachment (Image, Audio, Video, File, etc.). References the AIModality table.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'ModalityID';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'MIME type of the attachment (e.g., image/png, video/mp4, audio/mp3).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'MimeType';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Original filename of the attachment. Supports long cloud storage paths up to 4000 characters.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'FileName';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Size of the attachment in bytes.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'FileSizeBytes';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Width in pixels for images and videos.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'Width';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Height in pixels for images and videos.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'Height';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Duration in seconds for audio and video files.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'DurationSeconds';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Base64-encoded file data for small attachments stored inline. Mutually exclusive with FileID - exactly one must be populated.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'InlineData';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Reference to File entity for large attachments stored in MJStorage. Mutually exclusive with InlineData - exactly one must be populated.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'FileID';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Display order for multiple attachments in a message. Lower numbers appear first.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'DisplayOrder';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Base64-encoded thumbnail image for quick preview display. Max 200px on longest side.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'ThumbnailBase64';
GO

-- ============================================================================
-- PART 10: Indexes
-- ============================================================================
-- NOTE: Most FK indexes are auto-created by MJ CodeGen, so we only add special
-- indexes here that CodeGen wouldn't create (filtered indexes, composite indexes, etc.)

-- Filtered index for non-null FileID lookups (CodeGen won't create filtered indexes)
CREATE INDEX IX_ConversationDetailAttachment_FileID ON ${flyway:defaultSchema}.ConversationDetailAttachment(FileID) WHERE FileID IS NOT NULL;
GO

-- Filtered index for model version chain lookups
CREATE INDEX IX_AIModel_PriorVersionID ON ${flyway:defaultSchema}.AIModel(PriorVersionID) WHERE PriorVersionID IS NOT NULL;
GO

-- ============================================================================
-- PART 11: AIArchitecture and AIModelArchitecture tables
-- ============================================================================
-- AI Architecture provides metadata about the underlying technical architecture
-- used by AI models. This is valuable for:
-- 1. Eval reporting - comparing performance across architectural approaches
-- 2. Model catalog enrichment - understanding model capabilities
-- 3. Research insights - tracking which architectures perform best for tasks
--
-- Note: Models can use multiple architectures (e.g., GPT-4V uses Transformer + Vision)
-- This is modeled as M2M with optional Rank/Weight for hybrid architectures.
-- ============================================================================

CREATE TABLE ${flyway:defaultSchema}.AIArchitecture (
    ID                          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name                        NVARCHAR(100) NOT NULL,
    Description                 NVARCHAR(MAX) NULL,
    Category                    NVARCHAR(50) NOT NULL,          -- 'Core', 'Optimization', 'Hybrid', 'Specialized'
    ParentArchitectureID        UNIQUEIDENTIFIER NULL,          -- For hierarchical relationships (e.g., Sparse Transformer → Transformer)
    WikipediaURL                NVARCHAR(500) NULL,             -- Reference link
    YearIntroduced              INT NULL,                       -- Year the architecture was first published
    KeyPaper                    NVARCHAR(500) NULL,             -- Seminal paper title/reference
    CONSTRAINT PK_AIArchitecture PRIMARY KEY (ID),
    CONSTRAINT UQ_AIArchitecture_Name UNIQUE (Name),
    CONSTRAINT FK_AIArchitecture_Parent FOREIGN KEY (ParentArchitectureID) REFERENCES ${flyway:defaultSchema}.AIArchitecture(ID),
    CONSTRAINT CK_AIArchitecture_Category CHECK (Category IN ('Core', 'Optimization', 'Hybrid', 'Specialized'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Master table of AI model architectures (Transformer, Diffusion, MoE, etc.) for model catalog enrichment and eval reporting.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIArchitecture';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Hierarchical relationship to parent architecture. Used for variants like Sparse Transformer being a child of Transformer.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIArchitecture',
    @level2type = N'COLUMN', @level2name = 'ParentArchitectureID';
GO

-- Junction table for M2M relationship between AIModel and AIArchitecture
-- Supports hybrid architectures with optional ranking/weighting
CREATE TABLE ${flyway:defaultSchema}.AIModelArchitecture (
    ID                          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ModelID                     UNIQUEIDENTIFIER NOT NULL,
    ArchitectureID              UNIQUEIDENTIFIER NOT NULL,
    Rank                        INT NOT NULL DEFAULT 1,         -- Primary=1, Secondary=2, etc. Lower = more dominant
    Weight                      DECIMAL(5,4) NULL,              -- Optional: 0.0000-1.0000 for hybrid mix ratios
    Notes                       NVARCHAR(500) NULL,             -- Optional notes about how this architecture is used
    CONSTRAINT PK_AIModelArchitecture PRIMARY KEY (ID),
    CONSTRAINT FK_AIModelArchitecture_Model FOREIGN KEY (ModelID) REFERENCES ${flyway:defaultSchema}.AIModel(ID),
    CONSTRAINT FK_AIModelArchitecture_Architecture FOREIGN KEY (ArchitectureID) REFERENCES ${flyway:defaultSchema}.AIArchitecture(ID),
    CONSTRAINT UQ_AIModelArchitecture UNIQUE (ModelID, ArchitectureID),
    CONSTRAINT CK_AIModelArchitecture_Rank CHECK (Rank > 0),
    CONSTRAINT CK_AIModelArchitecture_Weight CHECK (Weight IS NULL OR (Weight >= 0 AND Weight <= 1))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Junction table linking AI models to their underlying architectures. Supports multiple architectures per model with ranking.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelArchitecture';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Ranking of this architecture for the model. 1=Primary architecture, 2=Secondary, etc. Lower numbers indicate more dominant role.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelArchitecture',
    @level2type = N'COLUMN', @level2name = 'Rank';
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional weight (0.0-1.0) indicating the mix ratio for hybrid architectures. E.g., 0.7 for 70% contribution.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIModelArchitecture',
    @level2type = N'COLUMN', @level2name = 'Weight';
GO

-- NOTE: FK indexes for AIModelArchitecture are auto-created by MJ CodeGen

-- ============================================================================
-- PART 12: Seed AIArchitecture with common AI model architectures
-- ============================================================================

-- Core architectures (foundational approaches)
INSERT INTO ${flyway:defaultSchema}.AIArchitecture
    (ID, Name, Description, Category, ParentArchitectureID, WikipediaURL, YearIntroduced, KeyPaper)
VALUES
    ('418A3396-0686-4DC8-A313-48A18D724CDC', 'Transformer',
     'Self-attention based architecture that processes sequences in parallel. Foundation for most modern LLMs including GPT, Claude, Gemini, and LLaMA.',
     'Core', NULL, 'https://en.wikipedia.org/wiki/Transformer_(machine_learning_model)', 2017,
     'Attention Is All You Need (Vaswani et al., 2017)'),

    ('AC35D138-5972-4593-9286-FCDE11D0BE5E', 'Diffusion',
     'Iterative denoising process that generates content by gradually removing noise. Used for image generation models like DALL-E, Stable Diffusion, Midjourney.',
     'Core', NULL, 'https://en.wikipedia.org/wiki/Diffusion_model', 2015,
     'Deep Unsupervised Learning using Nonequilibrium Thermodynamics (Sohl-Dickstein et al., 2015)'),

    ('7300F09A-DA96-47AD-8950-D001D6D1E4B4', 'Recurrent Neural Network',
     'Sequential architecture that maintains hidden state across time steps. Predecessor to Transformers, still used in some audio/time-series applications.',
     'Core', NULL, 'https://en.wikipedia.org/wiki/Recurrent_neural_network', 1986, NULL),

    ('ECD0A7FF-F48A-4921-AB26-BB36E91EA02A', 'Convolutional Neural Network',
     'Grid-based architecture with local connectivity patterns. Foundation for image recognition and still used in vision components.',
     'Core', NULL, 'https://en.wikipedia.org/wiki/Convolutional_neural_network', 1989, NULL),

    ('6716DC23-24B6-4A51-9441-4F4621FCE56F', 'State Space Model',
     'Linear state-space equations for sequence modeling. Efficient alternative to Transformers for long sequences. Includes Mamba architecture.',
     'Core', NULL, 'https://en.wikipedia.org/wiki/State-space_representation', 2021,
     'Efficiently Modeling Long Sequences with Structured State Spaces (Gu et al., 2021)');
GO

-- Optimization/enhancement architectures (improvements to core architectures)
INSERT INTO ${flyway:defaultSchema}.AIArchitecture
    (ID, Name, Description, Category, ParentArchitectureID, WikipediaURL, YearIntroduced, KeyPaper)
VALUES
    ('00320920-66F9-4C78-B5F8-A1E662189D1E', 'Mixture of Experts',
     'Sparse activation pattern where only subset of parameters are used per input. Enables massive model scaling with efficient inference. Used in Mixtral, GPT-4.',
     'Optimization', '418A3396-0686-4DC8-A313-48A18D724CDC', 'https://en.wikipedia.org/wiki/Mixture_of_experts', 1991,
     'Adaptive Mixtures of Local Experts (Jacobs et al., 1991)'),

    ('68043286-19D5-4C5A-9FB3-FF52C6D2D0B6', 'Sparse Transformer',
     'Transformer variant with sparse attention patterns for efficiency. Reduces O(n²) attention to O(n log n) or O(n).',
     'Optimization', '418A3396-0686-4DC8-A313-48A18D724CDC', NULL, 2019,
     'Generating Long Sequences with Sparse Transformers (Child et al., 2019)'),

    ('AA79277C-54D8-445D-9A97-0BA87C8A2A09', 'Flash Attention',
     'Memory-efficient attention implementation that tiles computation to avoid materializing full attention matrix. Standard in modern LLMs.',
     'Optimization', '418A3396-0686-4DC8-A313-48A18D724CDC', NULL, 2022,
     'FlashAttention: Fast and Memory-Efficient Exact Attention (Dao et al., 2022)');
GO

-- Specialized architectures (domain-specific approaches)
INSERT INTO ${flyway:defaultSchema}.AIArchitecture
    (ID, Name, Description, Category, ParentArchitectureID, WikipediaURL, YearIntroduced, KeyPaper)
VALUES
    ('A784791C-5379-40B7-B587-C47FA2F1252D', 'Vision Transformer',
     'Transformer adapted for image processing by treating image patches as tokens. Powers vision capabilities in GPT-4V, Claude Vision, Gemini.',
     'Specialized', '418A3396-0686-4DC8-A313-48A18D724CDC', 'https://en.wikipedia.org/wiki/Vision_transformer', 2020,
     'An Image is Worth 16x16 Words (Dosovitskiy et al., 2020)'),

    ('F0BC0FB2-1857-4518-B20B-CED836C03FF3', 'Mamba',
     'Selective state space model that achieves linear scaling with sequence length while maintaining strong performance. Alternative to Transformers.',
     'Specialized', '6716DC23-24B6-4A51-9441-4F4621FCE56F', NULL, 2023,
     'Mamba: Linear-Time Sequence Modeling with Selective State Spaces (Gu & Dao, 2023)');
GO

-- ============================================================================
-- PART 13: Populate AIModelArchitecture for existing models
-- ============================================================================
-- NOTE: This section maps existing AI models to their architectures.
-- After running this migration and CodeGen, a follow-up data population script
-- should be created to link all models to their architectures using their actual IDs.
--
-- Architecture ID Reference:
--   Transformer:          418A3396-0686-4DC8-A313-48A18D724CDC
--   Diffusion:            AC35D138-5972-4593-9286-FCDE11D0BE5E
--   RNN:                  7300F09A-DA96-47AD-8950-D001D6D1E4B4
--   CNN:                  ECD0A7FF-F48A-4921-AB26-BB36E91EA02A
--   State Space Model:    6716DC23-24B6-4A51-9441-4F4621FCE56F
--   Mixture of Experts:   00320920-66F9-4C78-B5F8-A1E662189D1E
--   Sparse Transformer:   68043286-19D5-4C5A-9FB3-FF52C6D2D0B6
--   Flash Attention:      AA79277C-54D8-445D-9A97-0BA87C8A2A09
--   Vision Transformer:   A784791C-5379-40B7-B587-C47FA2F1252D
--   Mamba:                F0BC0FB2-1857-4518-B20B-CED836C03FF3
--
-- Common mappings to apply post-migration:
--   GPT-4, GPT-4o, GPT-4 Turbo     → Transformer (Rank 1), MoE (Rank 2)
--   GPT-4V, GPT-4o                 → Transformer (Rank 1), Vision Transformer (Rank 2)
--   Claude 3/3.5/Opus/Sonnet       → Transformer (Rank 1)
--   Gemini models                  → Transformer (Rank 1), MoE (Rank 2)
--   Mixtral models                 → Transformer (Rank 1), MoE (Rank 1, Weight 0.5)
--   LLaMA/LLaMA-2/LLaMA-3          → Transformer (Rank 1)
--   Mistral models                 → Transformer (Rank 1)
--   DALL-E 2/3                     → Diffusion (Rank 1)
--   Stable Diffusion               → Diffusion (Rank 1)
--   ElevenLabs                     → Transformer (Rank 1) - TTS uses transformer variants
--   Whisper                        → Transformer (Rank 1)
--   text-embedding-ada-002/3       → Transformer (Rank 1)
-- ============================================================================

-- Example: Map all LLM-type models to Transformer architecture by default
-- This is a catch-all that can be refined later with specific model mappings
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT
    NEWID(),
    m.ID,
    '418A3396-0686-4DC8-A313-48A18D724CDC', -- Transformer
    1,
    'Auto-populated: Most LLMs use Transformer architecture'
FROM ${flyway:defaultSchema}.AIModel m
INNER JOIN ${flyway:defaultSchema}.AIModelType mt ON m.AIModelTypeID = mt.ID
WHERE mt.Name = 'LLM'
  AND NOT EXISTS (
      SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture ma
      WHERE ma.ModelID = m.ID AND ma.ArchitectureID = '418A3396-0686-4DC8-A313-48A18D724CDC'
  );
GO

-- Map Embeddings models to Transformer (most use BERT-style architectures)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT
    NEWID(),
    m.ID,
    '418A3396-0686-4DC8-A313-48A18D724CDC', -- Transformer
    1,
    'Auto-populated: Most embedding models use Transformer variants'
FROM ${flyway:defaultSchema}.AIModel m
INNER JOIN ${flyway:defaultSchema}.AIModelType mt ON m.AIModelTypeID = mt.ID
WHERE mt.Name = 'Embeddings'
  AND NOT EXISTS (
      SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture ma
      WHERE ma.ModelID = m.ID AND ma.ArchitectureID = '418A3396-0686-4DC8-A313-48A18D724CDC'
  );
GO

-- Map Image Generator models to Diffusion
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT
    NEWID(),
    m.ID,
    'AC35D138-5972-4593-9286-FCDE11D0BE5E', -- Diffusion
    1,
    'Auto-populated: Most image generators use Diffusion architecture'
FROM ${flyway:defaultSchema}.AIModel m
INNER JOIN ${flyway:defaultSchema}.AIModelType mt ON m.AIModelTypeID = mt.ID
WHERE mt.Name = 'Image Generator'
  AND NOT EXISTS (
      SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture ma
      WHERE ma.ModelID = m.ID AND ma.ArchitectureID = 'AC35D138-5972-4593-9286-FCDE11D0BE5E'
  );
GO

-- Map TTS models to Transformer (modern TTS like ElevenLabs use Transformer variants)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT
    NEWID(),
    m.ID,
    '418A3396-0686-4DC8-A313-48A18D724CDC', -- Transformer
    1,
    'Auto-populated: Modern TTS systems typically use Transformer variants'
FROM ${flyway:defaultSchema}.AIModel m
INNER JOIN ${flyway:defaultSchema}.AIModelType mt ON m.AIModelTypeID = mt.ID
WHERE mt.Name = 'TTS'
  AND NOT EXISTS (
      SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture ma
      WHERE ma.ModelID = m.ID AND ma.ArchitectureID = '418A3396-0686-4DC8-A313-48A18D724CDC'
  );
GO

-- Map STT models to Transformer (Whisper-style architecture)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT
    NEWID(),
    m.ID,
    '418A3396-0686-4DC8-A313-48A18D724CDC', -- Transformer
    1,
    'Auto-populated: Modern STT systems like Whisper use Transformer architecture'
FROM ${flyway:defaultSchema}.AIModel m
INNER JOIN ${flyway:defaultSchema}.AIModelType mt ON m.AIModelTypeID = mt.ID
WHERE mt.Name = 'STT'
  AND NOT EXISTS (
      SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture ma
      WHERE ma.ModelID = m.ID AND ma.ArchitectureID = '418A3396-0686-4DC8-A313-48A18D724CDC'
  );
GO

-- Map Video models to Diffusion (most video generation uses diffusion-based approaches)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT
    NEWID(),
    m.ID,
    'AC35D138-5972-4593-9286-FCDE11D0BE5E', -- Diffusion
    1,
    'Auto-populated: Most video generation models use Diffusion architecture'
FROM ${flyway:defaultSchema}.AIModel m
INNER JOIN ${flyway:defaultSchema}.AIModelType mt ON m.AIModelTypeID = mt.ID
WHERE mt.Name = 'Video'
  AND NOT EXISTS (
      SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture ma
      WHERE ma.ModelID = m.ID AND ma.ArchitectureID = 'AC35D138-5972-4593-9286-FCDE11D0BE5E'
  );
GO

-- ============================================================================
-- PART 14: Add secondary architectures for hybrid/MoE models
-- ============================================================================
-- These models use multiple architectures (e.g., Transformer + MoE, Transformer + Vision)
-- The auto-population above set Transformer as Rank 1, now we add secondary architectures

-- Mixtral 8x7B - MoE architecture (Rank 2, weight ~0.5 since it's core to the model)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Weight, Notes)
SELECT NEWID(), 'E2A5CCEC-6A37-EF11-86D4-000D3A4E707E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 0.5, 'Mixtral uses Mixture of Experts as core architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'E2A5CCEC-6A37-EF11-86D4-000D3A4E707E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- GPT-4o - Vision Transformer (Rank 2, for multimodal capabilities)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), 'E6A5CCEC-6A37-EF11-86D4-000D3A4E707E', 'A784791C-5379-40B7-B587-C47FA2F1252D', 2, 'GPT-4o has vision capabilities via Vision Transformer'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'E6A5CCEC-6A37-EF11-86D4-000D3A4E707E' AND ArchitectureID = 'A784791C-5379-40B7-B587-C47FA2F1252D');
GO

-- GPT-5 - Vision Transformer (multimodal)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '87C351DF-5039-4E1D-A2E9-CF5B91927E5E', 'A784791C-5379-40B7-B587-C47FA2F1252D', 2, 'GPT-5 has multimodal vision capabilities'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '87C351DF-5039-4E1D-A2E9-CF5B91927E5E' AND ArchitectureID = 'A784791C-5379-40B7-B587-C47FA2F1252D');
GO

-- GPT-5 - MoE (rumored/likely uses MoE given scale)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '87C351DF-5039-4E1D-A2E9-CF5B91927E5E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 3, 'GPT-5 likely uses Mixture of Experts for efficiency'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '87C351DF-5039-4E1D-A2E9-CF5B91927E5E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- GPT-5.2 - Vision Transformer and MoE
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '318BDCAD-FF2A-45E4-AB51-98754DF08E7A', 'A784791C-5379-40B7-B587-C47FA2F1252D', 2, 'GPT-5.2 has multimodal vision capabilities'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '318BDCAD-FF2A-45E4-AB51-98754DF08E7A' AND ArchitectureID = 'A784791C-5379-40B7-B587-C47FA2F1252D');
GO

INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '318BDCAD-FF2A-45E4-AB51-98754DF08E7A', '00320920-66F9-4C78-B5F8-A1E662189D1E', 3, 'GPT-5.2 likely uses Mixture of Experts'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '318BDCAD-FF2A-45E4-AB51-98754DF08E7A' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Gemini models - MoE architecture (Google's Gemini uses MoE)
-- Gemini 1.5 Pro
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Gemini uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Gemini 2.0 Flash
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '5A4DF845-F821-F011-8B3D-000D3A9E3408', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Gemini uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '5A4DF845-F821-F011-8B3D-000D3A9E3408' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Gemini 2.5 Pro
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), 'C478D8CD-9D81-491A-9992-139F45789309', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Gemini uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'C478D8CD-9D81-491A-9992-139F45789309' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Gemini 3 Pro
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), 'B7267218-302B-4C09-9875-8DF06AAA1695', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Gemini uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'B7267218-302B-4C09-9875-8DF06AAA1695' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Gemini 3 Flash
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Gemini uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Qwen 3 235B - MoE (large Qwen models use MoE)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '46B2443E-F36B-1410-8DB7-00021F8B792E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Large Qwen models use Mixture of Experts'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '46B2443E-F36B-1410-8DB7-00021F8B792E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Qwen 3 Coder 480B - MoE
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '711EDB52-2013-46E9-9A1F-59F439BC9E22', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Large Qwen Coder uses Mixture of Experts'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '711EDB52-2013-46E9-9A1F-59F439BC9E22' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Llama 4 Scout and Maverick - use MoE (Llama 4 series uses MoE)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '875D433E-F36B-1410-8DA9-00021F8B792E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Llama 4 uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '875D433E-F36B-1410-8DA9-00021F8B792E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '8A5D433E-F36B-1410-8DA9-00021F8B792E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Llama 4 uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '8A5D433E-F36B-1410-8DA9-00021F8B792E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Grok 4 models - likely use MoE
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '8B309C04-F5DC-4619-BA5E-F7A3BD55A41B', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Grok 4 likely uses Mixture of Experts'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '8B309C04-F5DC-4619-BA5E-F7A3BD55A41B' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Kimi K2 - MoE architecture
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '71A6513F-1757-4FE5-9E78-0069198607C0', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Kimi K2 uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '71A6513F-1757-4FE5-9E78-0069198607C0' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- DeepSeek R1 Distill - MoE
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT NEWID(), '845D433E-F36B-1410-8DA9-00021F8B792E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'DeepSeek R1 uses Mixture of Experts'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '845D433E-F36B-1410-8DA9-00021F8B792E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- GPT-OSS models use MoE (3.6B/5.1B active of larger total)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Weight, Notes)
SELECT NEWID(), 'F83CBC3E-2980-4C0F-AB74-BD2C192CF01D', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 0.17, 'GPT-OSS-20B: 3.6B/21B active params indicates MoE'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'F83CBC3E-2980-4C0F-AB74-BD2C192CF01D' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Weight, Notes)
SELECT NEWID(), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 0.04, 'GPT-OSS-120B: 5.1B/117B active params indicates MoE'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO
