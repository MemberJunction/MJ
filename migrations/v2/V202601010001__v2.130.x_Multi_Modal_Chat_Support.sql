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
        REFERENCES ${flyway:defaultSchema}.[File](ID),
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
-- PART 13: Populate AIModelArchitecture for existing models (PRIMARY architectures)
-- ============================================================================
-- Architecture ID Reference:
--   Transformer:          418A3396-0686-4DC8-A313-48A18D724CDC
--   Diffusion:            AC35D138-5972-4593-9286-FCDE11D0BE5E
--   Mixture of Experts:   00320920-66F9-4C78-B5F8-A1E662189D1E
--   Vision Transformer:   A784791C-5379-40B7-B587-C47FA2F1252D
-- ============================================================================

-- =====================
-- LLM Models → Transformer (Rank 1)
-- =====================
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes) VALUES
('1DF2A93E-222C-4EF9-BE9B-22BBF479669D', 'D8A5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT 3.5 - Transformer architecture'), -- GPT 3.5
('DF5A1BCA-300D-4A33-97D3-714B0DF67053', 'D9A5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT 4 - Transformer architecture'), -- GPT 4
('4DBE8EA6-353B-41BB-AE79-065844748BF2', 'DAA5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'claude-v1 - Transformer architecture'), -- claude-v1
('40084A87-0069-4CDE-9DD2-335940904401', 'DFA5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Claude 3 Haiku - Transformer architecture'), -- Claude 3 - Haiku
('8EA05E5E-F264-406A-AFFD-4011E69B3C17', 'E0A5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Claude 3 Sonnet - Transformer architecture'), -- Claude 3 - Sonnet
('50D014AA-6012-4588-B3CB-3B53B49BAC3A', 'E5A5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 1.0 Ultra - Transformer architecture'), -- Gemini 1.0 Ultra
('E3C4EFF9-96D6-4D19-9190-9444654902DB', '46B2443E-F36B-1410-8DB7-00021F8B792E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Qwen 3 235B - Transformer architecture'), -- Qwen 3 235B
('63B2FD53-FD00-419B-865D-4E80314945C2', 'F126ED5B-97B3-49E7-BD3B-E796B2099231', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Llama 3.1 70b - Transformer architecture'), -- Llama 3.1 70b
('ED892D95-1202-471E-BEAB-C2F7B35D498B', '1BEC0566-9D7B-4A83-9701-DF5602A607EF', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT 4.1 Nano - Transformer architecture'), -- GPT 4.1 Nano
('7B3B02C8-0274-4FA9-9A02-291E59772857', '87C351DF-5039-4E1D-A2E9-CF5B91927E5E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT 5 - Transformer architecture'), -- GPT 5
('D35A3145-00A0-4642-BB7B-A468CF352519', '318BDCAD-FF2A-45E4-AB51-98754DF08E7A', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT 5.2 - Transformer architecture'), -- GPT 5.2
('4CCF660F-8F65-4D1F-8509-F2C53D05A292', '287E317F-BF26-F011-A770-AC1A3D21423D', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT 4.1 - Transformer architecture'), -- GPT 4.1
('6ECDF60F-89BD-4428-A0B0-40E2F29F4B61', '0221217D-2037-48F8-AED0-286F53A165DF', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT 5-nano - Transformer architecture'), -- GPT 5-nano
('5AE9C032-EE2B-4E01-85C0-616DE73B9680', '028491AF-48A3-4235-93A7-44A4E91F14C0', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT 5-mini - Transformer architecture'), -- GPT 5-mini
('52FF8265-EC95-4F48-9C5C-F87C802673B1', '0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT 4o-mini - Transformer architecture'), -- GPT 4o-mini
('4D2986D0-ADB0-4436-907C-09AC19D11D67', '9604B1A4-3A21-F011-8B3D-7C1E5249773E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT 4.1-mini - Transformer architecture'), -- GPT 4.1-mini
('883668F5-D5E2-4F73-B334-8164A6D4084F', 'E6A5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT 4o - Transformer architecture'), -- GPT 4o
('77B436DE-5F51-4456-90D4-249C41140DAC', 'E1095D3C-E821-F011-8B3D-000D3A9E3408', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'o4-mini - Transformer architecture'), -- o4-mini
('C31D1190-E720-4A85-BEC9-B2CCF18938BA', '03080654-F721-F011-8B3D-000D3A9E3408', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'o3 - Transformer architecture'), -- o3
('D1A4BF93-34DA-4548-B22F-DE6C21465FFB', 'A647667B-F721-F011-8B3D-000D3A9E3408', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'o3-mini - Transformer architecture'), -- o3-mini
('DF8EAEF5-F024-462D-B3C3-DC9482362DAF', 'D8B332B2-F721-F011-8B3D-000D3A9E3408', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'o1 - Transformer architecture'), -- o1
('17132193-A252-4C2D-936C-577BBFEDE58D', 'E54347C3-F721-F011-8B3D-000D3A9E3408', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'o1-mini - Transformer architecture'), -- o1-mini
('A736AA67-A23B-48B1-AE1A-1711A3E45F4F', '913EC3DB-F721-F011-8B3D-000D3A9E3408', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'o1-pro - Transformer architecture'), -- o1-pro
('4D53BD5A-1D85-401A-8AFB-88AA36A4ADC9', '7D7C3623-34BC-4DE5-B940-EC09367CFB3E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Claude 4.5 Sonnet - Transformer architecture'), -- Claude 4.5 Sonnet
('5495945E-77EB-44F0-AC82-043852804EAB', '5066433E-F36B-1410-8DA9-00021F8B792E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Claude 3.7 Sonnet - Transformer architecture'), -- Claude 3.7 Sonnet
('494EBA55-A78B-4D34-9BAA-AA9260BB70A5', '83C5433E-F36B-1410-8DAB-00021F8B792E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Claude 4 Opus - Transformer architecture'), -- Claude 4 Opus
('A8343C8D-96E4-44BE-8FB4-105217C1EACC', '89C5433E-F36B-1410-8DAB-00021F8B792E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Claude 4 Sonnet - Transformer architecture'), -- Claude 4 Sonnet
('A2A45862-44DC-438D-BB5E-EB641A2B54D8', 'E1A5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Claude 3 Opus - Transformer architecture'), -- Claude 3 - Opus
('7397CEC3-346B-4438-B765-790A436C0F08', '52B79053-6E59-44E9-B7D0-DA96C4EA3CF1', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Claude 4.5 Opus - Transformer architecture'), -- Claude 4.5 Opus
('8BD4D915-D936-48AD-836C-A427A26C1792', '5D218BCF-B7F6-439E-97FD-DC3A79432562', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Claude 3.5 Sonnet - Transformer architecture'), -- Claude 3.5 Sonnet
('6B1B91B2-24A1-472A-A3FF-5718205FA5B7', '4FD92457-0BA8-486F-978A-E5947154F4F4', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Claude Haiku 4.5 - Transformer architecture'), -- Claude Haiku 4.5
('70AF796A-B0B5-484F-8F6A-6895483F136A', 'EEBC4377-20B3-4114-8665-CEFD2C1AA6B5', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Codestral 2508 - Transformer architecture'), -- Codestral 2508
('882921C3-B7C7-4C20-B040-022F7394941D', '7D9762F8-5332-F011-A5F1-6045BDD9AD00', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Mistral Large - Transformer architecture'), -- Mistral Large
('6C3B94E5-9289-4366-9555-3AE105887C01', '7E9762F8-5332-F011-A5F1-6045BDD9AD00', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Mistral Medium - Transformer architecture'), -- Mistral Medium
('2DABA162-DEBC-4CD0-99D9-1D5F71515C34', 'E2A5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Mixtral 8x7B - Transformer architecture'), -- Mixtral 8x7B
('2D81BCC1-3F0F-4F92-AB1F-A5D7780BE4EF', 'E3A5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Llama 2 70B / Groq - Transformer architecture'), -- Llama 2 70B / Groq
('6FDE3F5E-FFEE-40B7-8D0E-6E73B5258474', '845D433E-F36B-1410-8DA9-00021F8B792E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Deepseek R1 Distill Llama - Transformer architecture'), -- Deepseek R1 Distill Llama 3.3 70B
('4A105FC6-30F7-4A61-8785-245D00A36703', '875D433E-F36B-1410-8DA9-00021F8B792E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Llama 4 Scout - Transformer architecture'), -- Llama 4 Scout
('DFD4FFA2-18DE-4215-9069-F5F108188B44', '8A5D433E-F36B-1410-8DA9-00021F8B792E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Llama 4 Maverick - Transformer architecture'), -- Llama 4 Maverick
('0FEF2CF6-D2B7-4149-9419-C5CEC1FBD321', 'E7A5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Llama 3 70b - Transformer architecture'), -- Llama 3 70b
('499F0D40-1D66-4D68-BDD4-4ABE24130641', '71A6513F-1757-4FE5-9E78-0069198607C0', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Kimi K2 - Transformer architecture'), -- Kimi K2
('C13A6B1C-2F33-45BC-9DD5-C6A032607229', '16AFB4A5-3343-40C7-8982-03F979A15AE0', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Llama 3.1 405b - Transformer architecture'), -- Llama 3.1 405b
('FC1D33A9-68BF-40EE-AA16-384CEBF8190F', 'F7D2EE33-2134-F011-A5F1-6045BDD9AD00', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Groq Compound - Transformer architecture'), -- Groq Compound
('45E057FB-72FC-49F0-99CF-57C8D8CC7314', 'C496B988-4EA4-4D7E-A6DD-255F56D93933', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Qwen 3 32B - Transformer architecture'), -- Qwen 3 32B
('18352B8C-6714-49B5-B21B-30223F2248A4', '853E890E-F2E3-EF11-B015-286B35C04427', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Llama 3.3 70B Versatile - Transformer architecture'), -- Llama 3.3 70B Versatile
('6037270E-5BB4-4C77-BD0F-9403EBC326FB', 'F83CBC3E-2980-4C0F-AB74-BD2C192CF01D', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT-OSS-20B - Transformer architecture'), -- GPT-OSS-20B
('F2B96DF1-81B6-411E-8997-C3F868AF9FA3', '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'GPT-OSS-120B - Transformer architecture'), -- GPT-OSS-120B
('D0972A3B-69E5-4D91-92C4-58F4FE30BEE7', '1D9493CE-1AF6-49F6-B2EA-EABCAB491571', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Llama 3.1 8b - Transformer architecture'), -- Llama 3.1 8b
('C878CABF-60C0-45D8-9739-F952DAD1B87C', '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 3 Flash - Transformer architecture'), -- Gemini 3 Flash
('F11675AB-B7C5-4EFB-9A16-B832C42909FB', '5A4DF845-F821-F011-8B3D-000D3A9E3408', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 2.0 Flash - Transformer architecture'), -- Gemini 2.0 Flash
('73C16682-E74E-407F-8B1E-71864495B8F6', '0C93395D-F821-F011-8B3D-000D3A9E3408', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 2.0 Flash-Lite - Transformer architecture'), -- Gemini 2.0 Flash-Lite
('5F42D88C-8888-49FD-8FF2-CF7354D7F884', '791C357A-F821-F011-8B3D-000D3A9E3408', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 1.5 Flash - Transformer architecture'), -- Gemini 1.5 Flash
('A4284C16-1C4E-4576-85B1-C1DB9ED65E6F', '8D5D433E-F36B-1410-8DA9-00021F8B792E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 2.5 Pro Preview - Transformer architecture'), -- Gemini 2.5 Pro Preview
('937990C9-B0A7-4468-8A98-765C6CCAD537', '905D433E-F36B-1410-8DA9-00021F8B792E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 2.5 Flash Preview - Transformer architecture'), -- Gemini 2.5 Flash Preview
('2148E718-DB59-4E65-B4FF-17103684C90A', 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 1.5 Pro - Transformer architecture'), -- Gemini 1.5 Pro
('BC2CF1B9-D0B4-4700-89EC-1110A4979536', '27C0423E-F36B-1410-8876-005D02743E8C', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Betty Bot - Transformer architecture'), -- Betty Bot
('D262E741-BB3A-411B-A8C2-FB1B7FDE40D1', '7163007F-C555-4E02-BAD6-ADAC6D818F23', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Qwen 3 14B - Transformer architecture'), -- Qwen 3 14B
('05827804-A192-4BE9-8FA6-E753820492EB', '0B32729C-6911-49ED-A8ED-B5DFE18DAB7F', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Qwen 3 8B - Transformer architecture'), -- Qwen 3 8B
('F14F96BF-CA81-4E55-8C99-854DE25021A5', '9526887D-228B-4817-97F4-3AA0C6FABA5D', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Qwen 3 1.7B - Transformer architecture'), -- Qwen 3 1.7B
('F4DD9658-BB4F-45E8-B32B-58F61581C8A8', '28E5835E-4464-495E-928B-4A6769C0EAA7', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Qwen 3 Coder 30B - Transformer architecture'), -- Qwen 3 Coder 30B
('336B434B-6A2F-49C2-BF05-DF5AE5D535D7', '26EA1B87-ECAA-4BDF-83AD-4F8C1E33CC34', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Qwen 3 4B - Transformer architecture'), -- Qwen 3 4B
('D538107E-59E1-4F24-BB5A-EED8AE11B196', '13297942-3AE2-4584-832C-551237847140', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 2.5 Flash-Lite - Transformer architecture'), -- Gemini 2.5 Flash-Lite
('20444E37-3052-402D-9471-88017B972505', 'B7267218-302B-4C09-9875-8DF06AAA1695', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 3 Pro - Transformer architecture'), -- Gemini 3 Pro
('75229E53-A623-4A99-9E62-AAA50E483807', '072969C3-7D19-43FF-83E9-051E7A2D3586', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 2.5 Flash - Transformer architecture'), -- Gemini 2.5 Flash
('E68C5B04-0CB2-4929-9252-DE5E63E160E2', 'C478D8CD-9D81-491A-9992-139F45789309', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Gemini 2.5 Pro - Transformer architecture'), -- Gemini 2.5 Pro
('AE41BA6B-983C-433A-8D37-5E8967CDCD0D', '2C5EA224-85A1-4D09-ABA6-0D52F2E6AFBB', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Claude Opus 4.1 - Transformer architecture'), -- Claude Opus 4.1
('9D15288B-FA03-4A73-9890-1D04E71318F3', '711EDB52-2013-46E9-9A1F-59F439BC9E22', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Qwen 3 Coder 480B - Transformer architecture'), -- Qwen 3 Coder 480B
('5C8684C5-E565-4284-B607-E5217DCA68F0', 'B9C597E3-3AAF-4588-8EA8-92D85875B8A0', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Grok 4 Fast (Reasoning) - Transformer architecture'), -- Grok 4 Fast (Reasoning)
('B0AC1361-74B4-47BC-A7CC-F5A39B426F41', '33FF4A6E-6162-48DF-832A-8C936DCD4AC7', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Grok 4-1 Fast Non-Reasoning - Transformer architecture'), -- Grok 4-1 Fast Non-Reasoning
('79F50643-9142-4E4B-A517-D2F81529B601', 'F4E7A821-6D3C-4B9E-A7C5-8D1B4F2A9E6C', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Grok 4 Fast (Non-Reasoning) - Transformer architecture'), -- Grok 4 Fast (Non-Reasoning)
('97F1F101-D758-4497-A584-1074804960E0', 'AF6B48C8-8E99-4472-BDDF-570BF59F7B22', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Grok Code Fast 1 - Transformer architecture'), -- Grok Code Fast 1
('98F47BB1-3FD2-44A8-AC26-8B027FC98112', 'E7B8A63A-BE53-42FD-9401-02E07901D7F1', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Grok 4-1 Fast Reasoning - Transformer architecture'), -- Grok 4-1 Fast Reasoning
('483A5A5A-A8C7-4331-B0AA-C37A8269C27B', '8B309C04-F5DC-4619-BA5E-F7A3BD55A41B', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Grok 4 - Transformer architecture'); -- Grok 4
GO

-- =====================
-- Embeddings Models → Transformer (Rank 1)
-- =====================
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes) VALUES
('33E3AD14-8FFA-4649-A015-EE023F31A144', 'DCA5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'text-embedding-3-small - Transformer architecture'), -- text-embedding-3-small
('288D62E6-190D-4B1E-A29E-B595ACABDAED', 'DDA5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'text-embedding-3-large - Transformer architecture'), -- text-embedding-3-large
('B38BA72E-610C-4AB7-B8C3-21D7C4D30DB9', 'DEA5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'text-embedding-ada-002 - Transformer architecture'), -- text-embedding-ada-002
('03F23129-5825-4EDB-8E68-A259D0AD1F3B', 'DBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'mistral-embed - Transformer architecture'), -- mistral-embed
('F7E9E25E-303D-4F0B-B29C-E6FE18A47D5A', '43536203-DA8C-4232-B1A7-2D46E525B6CD', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'gte-small (Local) - Transformer architecture'), -- gte-small (Local)
('7BAA45CF-EFF9-49C3-9634-AA56A31A7314', '113FE682-82DB-487D-B943-472D130DAC53', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'paraphrase-multilingual-MiniLM-L12-v2 - Transformer architecture'), -- paraphrase-multilingual-MiniLM-L12-v2
('6B8C0002-1594-4DCC-A86D-C674DB5B6FA3', '1D45AA65-41EC-4572-9ECD-AB2826C9B059', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'all-mpnet-base-v2 - Transformer architecture'); -- all-mpnet-base-v2
GO

-- Additional embedding models
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'E128CEF2-8E5A-4F51-9443-A44AA83C76DC', '521F4AEE-A724-4190-8728-ADB47E9F39D1', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'bge-small-en-v1.5 - Transformer architecture'
WHERE EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = '521F4AEE-A724-4190-8728-ADB47E9F39D1');
GO

INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'F873CAAC-9564-4A71-AECC-C3BE9479C604', '2E328C31-9B9D-4E78-B084-C8381BC82F2F', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'all-MiniLM-L12-v2 - Transformer architecture'
WHERE EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = '2E328C31-9B9D-4E78-B084-C8381BC82F2F');
GO

INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'EF48313B-FE35-4F6A-966C-59623AD5F829', '1302E01E-6E69-42BE-BF00-DFF764FC63FE', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'all-MiniLM-L6-v2 - Transformer architecture'
WHERE EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = '1302E01E-6E69-42BE-BF00-DFF764FC63FE');
GO

-- =====================
-- TTS/Audio Models → Transformer (Rank 1)
-- =====================
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'E99028DD-5FB5-4561-82A5-C1BC4F1C57B5', 'DAB9433E-F36B-1410-8DA0-00021F8B792E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'Eleven Labs TTS - Transformer architecture'
WHERE EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = 'DAB9433E-F36B-1410-8DA0-00021F8B792E');
GO

-- OpenAI TTS
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT '5F85A1F4-FC46-41B5-9F99-B0140ECA4184', 'F2B9433E-F36B-1410-8DA0-00021F8B792E', '418A3396-0686-4DC8-A313-48A18D724CDC', 1, 'OpenAI TTS - Transformer architecture'
WHERE EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = 'F2B9433E-F36B-1410-8DA0-00021F8B792E');
GO

-- =====================
-- Video Models → Diffusion (Rank 1)
-- =====================
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'E128CEF2-8E5A-4F51-9443-A44AA83C76DF', 'E1B9433E-F36B-1410-8DA0-00021F8B792E', 'AC35D138-5972-4593-9286-FCDE11D0BE5E', 1, 'HeyGen Video - Diffusion architecture'
WHERE EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE ID = 'E1B9433E-F36B-1410-8DA0-00021F8B792E');
GO

-- ============================================================================
-- PART 14: Add secondary architectures for hybrid/MoE models
-- ============================================================================
-- These models use multiple architectures (e.g., Transformer + MoE, Transformer + Vision)
-- The auto-population above set Transformer as Rank 1, now we add secondary architectures

-- Mixtral 8x7B - MoE architecture (Rank 2, weight ~0.5 since it's core to the model)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Weight, Notes)
SELECT 'D0AB33AD-4AF9-4CBF-81EA-7F2186E0D4B9', 'E2A5CCEC-6A37-EF11-86D4-000D3A4E707E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 0.5, 'Mixtral uses Mixture of Experts as core architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'E2A5CCEC-6A37-EF11-86D4-000D3A4E707E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- GPT-4o - Vision Transformer (Rank 2, for multimodal capabilities)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT '2FB7AC33-220C-4CCF-A009-53425C5434A5', 'E6A5CCEC-6A37-EF11-86D4-000D3A4E707E', 'A784791C-5379-40B7-B587-C47FA2F1252D', 2, 'GPT-4o has vision capabilities via Vision Transformer'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'E6A5CCEC-6A37-EF11-86D4-000D3A4E707E' AND ArchitectureID = 'A784791C-5379-40B7-B587-C47FA2F1252D');
GO

-- GPT-5 - Vision Transformer (multimodal)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT '394BD836-CF89-4DDC-9353-5FD163F6774D', '87C351DF-5039-4E1D-A2E9-CF5B91927E5E', 'A784791C-5379-40B7-B587-C47FA2F1252D', 2, 'GPT-5 has multimodal vision capabilities'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '87C351DF-5039-4E1D-A2E9-CF5B91927E5E' AND ArchitectureID = 'A784791C-5379-40B7-B587-C47FA2F1252D');
GO

-- GPT-5 - MoE (rumored/likely uses MoE given scale)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT '223CC070-DE2C-45C3-9C9A-F4EE06E49AD2', '87C351DF-5039-4E1D-A2E9-CF5B91927E5E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 3, 'GPT-5 likely uses Mixture of Experts for efficiency'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '87C351DF-5039-4E1D-A2E9-CF5B91927E5E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- GPT-5.2 - Vision Transformer and MoE
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'BFB3A758-919E-43F7-88AD-C3BDAA9E4194', '318BDCAD-FF2A-45E4-AB51-98754DF08E7A', 'A784791C-5379-40B7-B587-C47FA2F1252D', 2, 'GPT-5.2 has multimodal vision capabilities'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '318BDCAD-FF2A-45E4-AB51-98754DF08E7A' AND ArchitectureID = 'A784791C-5379-40B7-B587-C47FA2F1252D');
GO

INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'B496544A-5B97-47A8-9B7F-68C196B30DB2', '318BDCAD-FF2A-45E4-AB51-98754DF08E7A', '00320920-66F9-4C78-B5F8-A1E662189D1E', 3, 'GPT-5.2 likely uses Mixture of Experts'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '318BDCAD-FF2A-45E4-AB51-98754DF08E7A' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Gemini models - MoE architecture (Google's Gemini uses MoE)
-- Gemini 1.5 Pro
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT '97FCDE1C-5FB2-46F1-A7EA-76BFE9AAC423', 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Gemini uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'E4A5CCEC-6A37-EF11-86D4-000D3A4E707E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Gemini 2.0 Flash
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'DEF8431C-3377-48F2-B5CF-A1653EE24BA4', '5A4DF845-F821-F011-8B3D-000D3A9E3408', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Gemini uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '5A4DF845-F821-F011-8B3D-000D3A9E3408' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Gemini 2.5 Pro
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'E97DD11E-790B-4A0A-9E24-65D7CCBFAF88', 'C478D8CD-9D81-491A-9992-139F45789309', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Gemini uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'C478D8CD-9D81-491A-9992-139F45789309' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Gemini 3 Pro
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT '99A20FE4-1EC1-4D5C-AA54-0ED2F5931647', 'B7267218-302B-4C09-9875-8DF06AAA1695', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Gemini uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'B7267218-302B-4C09-9875-8DF06AAA1695' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Gemini 3 Flash
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'A47C5683-0F91-45EF-8F10-B801B6011B2C', '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Gemini uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Qwen 3 235B - MoE (large Qwen models use MoE)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'B6DBB9F6-7012-49AD-8616-54308B2F56C9', '46B2443E-F36B-1410-8DB7-00021F8B792E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Large Qwen models use Mixture of Experts'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '46B2443E-F36B-1410-8DB7-00021F8B792E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Qwen 3 Coder 480B - MoE
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT '8ABB0ABB-DE64-46E0-8591-27A59BF9BC6E', '711EDB52-2013-46E9-9A1F-59F439BC9E22', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Large Qwen Coder uses Mixture of Experts'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '711EDB52-2013-46E9-9A1F-59F439BC9E22' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Llama 4 Scout and Maverick - use MoE (Llama 4 series uses MoE)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT '15B1A0A2-014A-4BDD-BC8A-715CFAFCB50A', '875D433E-F36B-1410-8DA9-00021F8B792E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Llama 4 uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '875D433E-F36B-1410-8DA9-00021F8B792E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'FB84822E-EED6-4893-A715-B74C72C6954F', '8A5D433E-F36B-1410-8DA9-00021F8B792E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Llama 4 uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '8A5D433E-F36B-1410-8DA9-00021F8B792E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Grok 4 models - likely use MoE
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'C1823845-6612-49A9-B6FE-52B542B64F09', '8B309C04-F5DC-4619-BA5E-F7A3BD55A41B', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Grok 4 likely uses Mixture of Experts'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '8B309C04-F5DC-4619-BA5E-F7A3BD55A41B' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- Kimi K2 - MoE architecture
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT 'B84C3ADA-8D66-4015-902D-116444741F9A', '71A6513F-1757-4FE5-9E78-0069198607C0', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'Kimi K2 uses Mixture of Experts architecture'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '71A6513F-1757-4FE5-9E78-0069198607C0' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- DeepSeek R1 Distill - MoE
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Notes)
SELECT '857ABDD3-B4AF-45DE-9F61-7035CDED9A3F', '845D433E-F36B-1410-8DA9-00021F8B792E', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 'DeepSeek R1 uses Mixture of Experts'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '845D433E-F36B-1410-8DA9-00021F8B792E' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

-- GPT-OSS models use MoE (3.6B/5.1B active of larger total)
INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Weight, Notes)
SELECT '2B5A96CF-C3EF-4F38-B85F-CBEE07722C10', 'F83CBC3E-2980-4C0F-AB74-BD2C192CF01D', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 0.17, 'GPT-OSS-20B: 3.6B/21B active params indicates MoE'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = 'F83CBC3E-2980-4C0F-AB74-BD2C192CF01D' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO

INSERT INTO ${flyway:defaultSchema}.AIModelArchitecture (ID, ModelID, ArchitectureID, Rank, Weight, Notes)
SELECT 'CC34EB8A-2766-4FB1-A1B7-B4039EF1DCFA', '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', '00320920-66F9-4C78-B5F8-A1E662189D1E', 2, 0.04, 'GPT-OSS-120B: 5.1B/117B active params indicates MoE'
WHERE NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelArchitecture WHERE ModelID = '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0' AND ArchitectureID = '00320920-66F9-4C78-B5F8-A1E662189D1E');
GO





















































































































































-- Code Gen Output
/* SQL generated to create new entity MJ: AI Modalities */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '56ab1ef8-2e92-4e04-bbf5-cfeb62f1897d',
         'MJ: AI Modalities',
         'AI Modalities',
         NULL,
         NULL,
         'AIModality',
         'vwAIModalities',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: AI Modalities to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '56ab1ef8-2e92-4e04-bbf5-cfeb62f1897d', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Modalities for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('56ab1ef8-2e92-4e04-bbf5-cfeb62f1897d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Modalities for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('56ab1ef8-2e92-4e04-bbf5-cfeb62f1897d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Modalities for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('56ab1ef8-2e92-4e04-bbf5-cfeb62f1897d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Model Modalities */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'e857c741-5b84-4012-8c19-821fc0246ee7',
         'MJ: AI Model Modalities',
         'AI Model Modalities',
         NULL,
         NULL,
         'AIModelModality',
         'vwAIModelModalities',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: AI Model Modalities to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e857c741-5b84-4012-8c19-821fc0246ee7', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Model Modalities for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e857c741-5b84-4012-8c19-821fc0246ee7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Model Modalities for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e857c741-5b84-4012-8c19-821fc0246ee7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Model Modalities for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e857c741-5b84-4012-8c19-821fc0246ee7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Agent Modalities */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '72ac67c3-5fd0-4320-ab49-813697181a54',
         'MJ: AI Agent Modalities',
         'AI Agent Modalities',
         NULL,
         NULL,
         'AIAgentModality',
         'vwAIAgentModalities',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: AI Agent Modalities to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '72ac67c3-5fd0-4320-ab49-813697181a54', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Agent Modalities for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('72ac67c3-5fd0-4320-ab49-813697181a54', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Modalities for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('72ac67c3-5fd0-4320-ab49-813697181a54', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Modalities for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('72ac67c3-5fd0-4320-ab49-813697181a54', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Conversation Detail Attachments */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '4edc5656-949f-4fa4-b909-dfc61ad4e1c3',
         'MJ: Conversation Detail Attachments',
         'Conversation Detail Attachments',
         NULL,
         NULL,
         'ConversationDetailAttachment',
         'vwConversationDetailAttachments',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Conversation Detail Attachments to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4edc5656-949f-4fa4-b909-dfc61ad4e1c3', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Conversation Detail Attachments for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4edc5656-949f-4fa4-b909-dfc61ad4e1c3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Conversation Detail Attachments for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4edc5656-949f-4fa4-b909-dfc61ad4e1c3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Conversation Detail Attachments for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4edc5656-949f-4fa4-b909-dfc61ad4e1c3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Architectures */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '4f35743a-2413-47fb-9a36-b5becb038bbf',
         'MJ: AI Architectures',
         'AI Architectures',
         NULL,
         NULL,
         'AIArchitecture',
         'vwAIArchitectures',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: AI Architectures to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4f35743a-2413-47fb-9a36-b5becb038bbf', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Architectures for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4f35743a-2413-47fb-9a36-b5becb038bbf', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Architectures for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4f35743a-2413-47fb-9a36-b5becb038bbf', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Architectures for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4f35743a-2413-47fb-9a36-b5becb038bbf', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: AI Model Architectures */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '435976ad-f4ba-4ffa-a5f5-c2d901b6c15a',
         'MJ: AI Model Architectures',
         'AI Model Architectures',
         NULL,
         NULL,
         'AIModelArchitecture',
         'vwAIModelArchitectures',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: AI Model Architectures to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '435976ad-f4ba-4ffa-a5f5-c2d901b6c15a', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Model Architectures for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('435976ad-f4ba-4ffa-a5f5-c2d901b6c15a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Model Architectures for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('435976ad-f4ba-4ffa-a5f5-c2d901b6c15a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Model Architectures for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('435976ad-f4ba-4ffa-a5f5-c2d901b6c15a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentModality */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentModality] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentModality */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentModality] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIModelModality */
ALTER TABLE [${flyway:defaultSchema}].[AIModelModality] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIModelModality */
ALTER TABLE [${flyway:defaultSchema}].[AIModelModality] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIArchitecture */
ALTER TABLE [${flyway:defaultSchema}].[AIArchitecture] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIArchitecture */
ALTER TABLE [${flyway:defaultSchema}].[AIArchitecture] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIModelArchitecture */
ALTER TABLE [${flyway:defaultSchema}].[AIModelArchitecture] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIModelArchitecture */
ALTER TABLE [${flyway:defaultSchema}].[AIModelArchitecture] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIModality */
ALTER TABLE [${flyway:defaultSchema}].[AIModality] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIModality */
ALTER TABLE [${flyway:defaultSchema}].[AIModality] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ConversationDetailAttachment */
ALTER TABLE [${flyway:defaultSchema}].[ConversationDetailAttachment] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ConversationDetailAttachment */
ALTER TABLE [${flyway:defaultSchema}].[ConversationDetailAttachment] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '303b2c68-a58d-468d-9cd3-766922ef93b6'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'DefaultStorageProviderID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '303b2c68-a58d-468d-9cd3-766922ef93b6',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            100021,
            'DefaultStorageProviderID',
            'Default Storage Provider ID',
            'Default file storage provider for agent attachments. Used when an agent does not specify its own AttachmentStorageProviderID.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '28248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4aa505e8-7e1c-4ec9-8462-d70f60200cb1'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'DefaultStorageRootPath')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4aa505e8-7e1c-4ec9-8462-d70f60200cb1',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            100022,
            'DefaultStorageRootPath',
            'Default Storage Root Path',
            'Default root path within the storage provider for agent attachments. Used when an agent does not specify its own AttachmentRootPath.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4b5a24cc-1bc2-40e3-b83e-c8e164e6cfed'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'AttachmentStorageProviderID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4b5a24cc-1bc2-40e3-b83e-c8e164e6cfed',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100111,
            'AttachmentStorageProviderID',
            'Attachment Storage Provider ID',
            'File storage provider for large attachments. Overrides the default from AIConfiguration. NULL uses system default.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '28248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ba112220-b0d8-4c6f-b63a-027eb706b132'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'AttachmentRootPath')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ba112220-b0d8-4c6f-b63a-027eb706b132',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100112,
            'AttachmentRootPath',
            'Attachment Root Path',
            'Base path within the storage provider for this agent''s attachments. Agent run ID and sequence number are appended to create unique paths. Format: /folder/subfolder',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ec3d6539-faf4-49b7-9a9b-6327249c9d06'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'InlineStorageThresholdBytes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ec3d6539-faf4-49b7-9a9b-6327249c9d06',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100113,
            'InlineStorageThresholdBytes',
            'Inline Storage Threshold Bytes',
            'File size threshold for inline storage. Files <= this size are stored as base64 inline, larger files use MJStorage. NULL uses system default (1MB). Set to 0 to always use MJStorage.',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c0bae356-2818-4b55-9737-5bfa97225462'  OR 
               (EntityID = '01248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultInputModalityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c0bae356-2818-4b55-9737-5bfa97225462',
            '01248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: AI Model Types
            100011,
            'DefaultInputModalityID',
            'Default Input Modality ID',
            'Default input modality for this model type. Models of this type inherit this as their primary input modality unless overridden.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5e5f9f7f-708f-4595-9f32-5f0574f25f01'  OR 
               (EntityID = '01248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultOutputModalityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5e5f9f7f-708f-4595-9f32-5f0574f25f01',
            '01248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: AI Model Types
            100012,
            'DefaultOutputModalityID',
            'Default Output Modality ID',
            'Default output modality for this model type. Models of this type inherit this as their primary output modality unless overridden.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8e3739c2-5404-4c28-abe1-412720d055a2'  OR 
               (EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8e3739c2-5404-4c28-abe1-412720d055a2',
            '72AC67C3-5FD0-4320-AB49-813697181A54', -- Entity: MJ: AI Agent Modalities
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4ef381e2-6d7b-4228-b79f-c1b4d07a4276'  OR 
               (EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54' AND Name = 'AgentID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4ef381e2-6d7b-4228-b79f-c1b4d07a4276',
            '72AC67C3-5FD0-4320-AB49-813697181A54', -- Entity: MJ: AI Agent Modalities
            100002,
            'AgentID',
            'Agent ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '397d3a42-8ae2-43db-9997-c444c6fbd656'  OR 
               (EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54' AND Name = 'ModalityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '397d3a42-8ae2-43db-9997-c444c6fbd656',
            '72AC67C3-5FD0-4320-AB49-813697181A54', -- Entity: MJ: AI Agent Modalities
            100003,
            'ModalityID',
            'Modality ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '632482be-dde3-4453-a654-207ed2d2a77d'  OR 
               (EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54' AND Name = 'Direction')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '632482be-dde3-4453-a654-207ed2d2a77d',
            '72AC67C3-5FD0-4320-AB49-813697181A54', -- Entity: MJ: AI Agent Modalities
            100004,
            'Direction',
            'Direction',
            'Whether this is an Input or Output modality for the agent.',
            'nvarchar',
            20,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '235c396f-ad49-4d5e-b4fb-8db83715ad8d'  OR 
               (EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54' AND Name = 'IsAllowed')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '235c396f-ad49-4d5e-b4fb-8db83715ad8d',
            '72AC67C3-5FD0-4320-AB49-813697181A54', -- Entity: MJ: AI Agent Modalities
            100005,
            'IsAllowed',
            'Is Allowed',
            'Whether this modality is allowed for this agent. Set to FALSE to disable a modality even if the underlying model supports it.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '114f8969-80ab-4f7a-bed9-a2f3e35f338d'  OR 
               (EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54' AND Name = 'MaxSizeBytes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '114f8969-80ab-4f7a-bed9-a2f3e35f338d',
            '72AC67C3-5FD0-4320-AB49-813697181A54', -- Entity: MJ: AI Agent Modalities
            100006,
            'MaxSizeBytes',
            'Max Size Bytes',
            'Agent-specific maximum size in bytes. Overrides model and system defaults. Must be less than or equal to model limit.',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b0b96659-1192-4f3b-a7ca-dba2dbf84e99'  OR 
               (EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54' AND Name = 'MaxCountPerMessage')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b0b96659-1192-4f3b-a7ca-dba2dbf84e99',
            '72AC67C3-5FD0-4320-AB49-813697181A54', -- Entity: MJ: AI Agent Modalities
            100007,
            'MaxCountPerMessage',
            'Max Count Per Message',
            'Agent-specific maximum count per message. Overrides model and system defaults. Must be less than or equal to model limit.',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '30434e8f-87ac-42b6-b448-c36db46777a3'  OR 
               (EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '30434e8f-87ac-42b6-b448-c36db46777a3',
            '72AC67C3-5FD0-4320-AB49-813697181A54', -- Entity: MJ: AI Agent Modalities
            100008,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '74f4eaf9-6697-4079-88ba-4c508303dfe4'  OR 
               (EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '74f4eaf9-6697-4079-88ba-4c508303dfe4',
            '72AC67C3-5FD0-4320-AB49-813697181A54', -- Entity: MJ: AI Agent Modalities
            100009,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7ebc4186-37c5-433d-8196-4ae49dd8a42a'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7ebc4186-37c5-433d-8196-4ae49dd8a42a',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4dbe2b92-0104-4da3-814f-c592ec07cbed'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'ModelID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4dbe2b92-0104-4da3-814f-c592ec07cbed',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100002,
            'ModelID',
            'Model ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bd1dbdd9-d9d8-4b88-800c-dff9823228b8'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'ModalityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bd1dbdd9-d9d8-4b88-800c-dff9823228b8',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100003,
            'ModalityID',
            'Modality ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c35de250-cea2-41da-b8e8-f737d60da547'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'Direction')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c35de250-cea2-41da-b8e8-f737d60da547',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100004,
            'Direction',
            'Direction',
            'Whether this is an Input or Output modality for the model.',
            'nvarchar',
            20,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f436c057-41ba-4546-a2ea-bf348c28f34a'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'IsSupported')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f436c057-41ba-4546-a2ea-bf348c28f34a',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100005,
            'IsSupported',
            'Is Supported',
            'Whether this modality is supported. Can be set to FALSE to explicitly disable an inherited modality.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6685f426-e918-4449-b685-079ab4b09389'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'IsRequired')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6685f426-e918-4449-b685-079ab4b09389',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100006,
            'IsRequired',
            'Is Required',
            'For input modalities: whether this modality is required (e.g., text is usually required for LLMs). For outputs: not typically applicable.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0c8c9bb4-671d-4b92-a2d8-26988566f31a'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'SupportedFormats')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0c8c9bb4-671d-4b92-a2d8-26988566f31a',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100007,
            'SupportedFormats',
            'Supported Formats',
            'Comma-separated list of supported file formats/extensions (e.g., png,jpg,webp,gif for images or mp3,wav,m4a for audio).',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '03ab0e22-44fc-467a-b30c-bbaa80ff0c5d'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'MaxSizeBytes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '03ab0e22-44fc-467a-b30c-bbaa80ff0c5d',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100008,
            'MaxSizeBytes',
            'Max Size Bytes',
            'Model-specific maximum size in bytes. Overrides AIModality.DefaultMaxSizeBytes. NULL means use system default.',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '574ed7d9-b548-406a-bdc7-b4bdd48ff364'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'MaxCountPerMessage')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '574ed7d9-b548-406a-bdc7-b4bdd48ff364',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100009,
            'MaxCountPerMessage',
            'Max Count Per Message',
            'Model-specific maximum count per message. Overrides AIModality.DefaultMaxCountPerMessage. NULL means use system default.',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f37cfe3c-8137-44a6-871b-b9fa2d161e03'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'MaxDimension')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f37cfe3c-8137-44a6-871b-b9fa2d161e03',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100010,
            'MaxDimension',
            'Max Dimension',
            'For image/video modalities: maximum dimension (width or height) in pixels supported by this model.',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ef4ef7a8-2f95-4e57-920d-1e6dcc46ec5e'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'Comments')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ef4ef7a8-2f95-4e57-920d-1e6dcc46ec5e',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100011,
            'Comments',
            'Comments',
            'Additional notes or documentation about this model-modality configuration.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '12e86736-9896-41f5-b6f1-bdaa0bcbed87'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '12e86736-9896-41f5-b6f1-bdaa0bcbed87',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100012,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '64e54342-e690-4c25-8a20-aadf2f7ec570'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '64e54342-e690-4c25-8a20-aadf2f7ec570',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100013,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c4bca1f9-704f-4a91-ad98-2bcc03f3a759'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c4bca1f9-704f-4a91-ad98-2bcc03f3a759',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '209183bc-5b3d-4264-8268-f62e75cd1052'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '209183bc-5b3d-4264-8268-f62e75cd1052',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100002,
            'Name',
            'Name',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '84bc5aa1-628a-4ef2-91d0-05c6a5b5982c'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '84bc5aa1-628a-4ef2-91d0-05c6a5b5982c',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100003,
            'Description',
            'Description',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3470a40e-7f60-49aa-8674-d72d88e2139e'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = 'Category')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3470a40e-7f60-49aa-8674-d72d88e2139e',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100004,
            'Category',
            'Category',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6c3c2828-9d9e-4c9b-876c-b634fbf562d3'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = 'ParentArchitectureID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6c3c2828-9d9e-4c9b-876c-b634fbf562d3',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100005,
            'ParentArchitectureID',
            'Parent Architecture ID',
            'Hierarchical relationship to parent architecture. Used for variants like Sparse Transformer being a child of Transformer.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '4F35743A-2413-47FB-9A36-B5BECB038BBF',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '18d14344-ffd2-495b-8c01-2b19247dbfbc'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = 'WikipediaURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '18d14344-ffd2-495b-8c01-2b19247dbfbc',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100006,
            'WikipediaURL',
            'Wikipedia URL',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '56ff2430-05ff-41dd-942f-d5a8e51e2153'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = 'YearIntroduced')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '56ff2430-05ff-41dd-942f-d5a8e51e2153',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100007,
            'YearIntroduced',
            'Year Introduced',
            NULL,
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5040eae0-e69b-42c0-96a8-7b04a2894d5b'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = 'KeyPaper')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5040eae0-e69b-42c0-96a8-7b04a2894d5b',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100008,
            'KeyPaper',
            'Key Paper',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9a5b0da8-9043-4bb1-a250-880b38d0a269'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9a5b0da8-9043-4bb1-a250-880b38d0a269',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100009,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9941b62d-e34f-457c-9cee-8735417b9d81'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9941b62d-e34f-457c-9cee-8735417b9d81',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100010,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '78200fe4-d308-41b7-9305-3ed80a72c52b'  OR 
               (EntityID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '78200fe4-d308-41b7-9305-3ed80a72c52b',
            '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', -- Entity: MJ: AI Model Architectures
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '90aad825-ec7e-4537-b0ce-1558ad0313db'  OR 
               (EntityID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A' AND Name = 'ModelID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '90aad825-ec7e-4537-b0ce-1558ad0313db',
            '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', -- Entity: MJ: AI Model Architectures
            100002,
            'ModelID',
            'Model ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '99e524b7-2a2d-42b3-808d-498ea904ad7b'  OR 
               (EntityID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A' AND Name = 'ArchitectureID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '99e524b7-2a2d-42b3-808d-498ea904ad7b',
            '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', -- Entity: MJ: AI Model Architectures
            100003,
            'ArchitectureID',
            'Architecture ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '4F35743A-2413-47FB-9A36-B5BECB038BBF',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'cb694153-6b47-4939-9df6-21e5186f9b21'  OR 
               (EntityID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A' AND Name = 'Rank')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'cb694153-6b47-4939-9df6-21e5186f9b21',
            '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', -- Entity: MJ: AI Model Architectures
            100004,
            'Rank',
            'Rank',
            'Ranking of this architecture for the model. 1=Primary architecture, 2=Secondary, etc. Lower numbers indicate more dominant role.',
            'int',
            4,
            10,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '66dbe74e-1d77-4489-8b2f-8873662d191d'  OR 
               (EntityID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A' AND Name = 'Weight')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '66dbe74e-1d77-4489-8b2f-8873662d191d',
            '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', -- Entity: MJ: AI Model Architectures
            100005,
            'Weight',
            'Weight',
            'Optional weight (0.0-1.0) indicating the mix ratio for hybrid architectures. E.g., 0.7 for 70% contribution.',
            'decimal',
            5,
            5,
            4,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'add78423-f152-4706-89ae-44fbae35702a'  OR 
               (EntityID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'add78423-f152-4706-89ae-44fbae35702a',
            '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', -- Entity: MJ: AI Model Architectures
            100006,
            'Notes',
            'Notes',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '92f09043-e453-482b-aa52-4a99011486cc'  OR 
               (EntityID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '92f09043-e453-482b-aa52-4a99011486cc',
            '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', -- Entity: MJ: AI Model Architectures
            100007,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '149b2825-a58e-4d3a-8f31-220c6f5ae3cc'  OR 
               (EntityID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '149b2825-a58e-4d3a-8f31-220c6f5ae3cc',
            '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', -- Entity: MJ: AI Model Architectures
            100008,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '27a7c22c-cbe3-42d1-8a90-c62930ca94d9'  OR 
               (EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '27a7c22c-cbe3-42d1-8a90-c62930ca94d9',
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', -- Entity: MJ: AI Modalities
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b90d9ee5-dea3-496a-b389-750b1b982ef6'  OR 
               (EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b90d9ee5-dea3-496a-b389-750b1b982ef6',
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', -- Entity: MJ: AI Modalities
            100002,
            'Name',
            'Name',
            'Display name of the modality (e.g., Text, Image, Audio, Video, File, Embedding).',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6b77376b-30e4-41d7-8935-350d04a6dff5'  OR 
               (EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6b77376b-30e4-41d7-8935-350d04a6dff5',
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', -- Entity: MJ: AI Modalities
            100003,
            'Description',
            'Description',
            'Detailed description of this modality and its use cases.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '20a05ca6-1fa8-4028-93d4-00c05854fcef'  OR 
               (EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D' AND Name = 'ContentBlockType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '20a05ca6-1fa8-4028-93d4-00c05854fcef',
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', -- Entity: MJ: AI Modalities
            100004,
            'ContentBlockType',
            'Content Block Type',
            'Maps to ChatMessageContentBlock.type values: text, image_url, video_url, audio_url, file_url, embedding. Must match the TypeScript type definition.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4d3f2352-495e-4652-9400-56e69e8c164d'  OR 
               (EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D' AND Name = 'MIMETypePattern')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4d3f2352-495e-4652-9400-56e69e8c164d',
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', -- Entity: MJ: AI Modalities
            100005,
            'MIMETypePattern',
            'MIME Type Pattern',
            'MIME type pattern for this modality (e.g., image/*, audio/*, video/*, text/*, application/*). Used for file type validation.',
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '62288aa7-f5ef-4bb7-b185-4a83ead76dd1'  OR 
               (EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D' AND Name = 'Type')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '62288aa7-f5ef-4bb7-b185-4a83ead76dd1',
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', -- Entity: MJ: AI Modalities
            100006,
            'Type',
            'Type',
            'Classification type: Content (human-readable text), Structured (JSON/embeddings), Binary (media files like images, audio, video).',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Content',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f751910e-dd8b-4e27-a04f-373528d9a9b2'  OR 
               (EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D' AND Name = 'DefaultMaxSizeBytes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f751910e-dd8b-4e27-a04f-373528d9a9b2',
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', -- Entity: MJ: AI Modalities
            100007,
            'DefaultMaxSizeBytes',
            'Default Max Size Bytes',
            'System-wide default maximum size in bytes for this modality. Can be overridden at model or agent level. NULL means no size limit.',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a9289fe9-1547-4e64-a448-20c1340478dc'  OR 
               (EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D' AND Name = 'DefaultMaxCountPerMessage')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a9289fe9-1547-4e64-a448-20c1340478dc',
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', -- Entity: MJ: AI Modalities
            100008,
            'DefaultMaxCountPerMessage',
            'Default Max Count Per Message',
            'System-wide default maximum count per message for this modality. Can be overridden at model or agent level. NULL means no count limit.',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b205800d-88c6-4f6f-bf92-e8d4e858b274'  OR 
               (EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D' AND Name = 'DisplayOrder')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b205800d-88c6-4f6f-bf92-e8d4e858b274',
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', -- Entity: MJ: AI Modalities
            100009,
            'DisplayOrder',
            'Display Order',
            'Display order for UI presentation. Lower numbers appear first.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0cb06cf7-ca2a-455f-8a88-7e1438f4655b'  OR 
               (EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0cb06cf7-ca2a-455f-8a88-7e1438f4655b',
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', -- Entity: MJ: AI Modalities
            100010,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6460a64f-20b6-485e-8de9-bf4a09b1ee08'  OR 
               (EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6460a64f-20b6-485e-8de9-bf4a09b1ee08',
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', -- Entity: MJ: AI Modalities
            100011,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6c461de0-d8b1-4eca-8924-89322f1cdab6'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6c461de0-d8b1-4eca-8924-89322f1cdab6',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f67b3f45-a45f-4f0c-a16c-939b1ef783b2'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'ConversationDetailID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f67b3f45-a45f-4f0c-a16c-939b1ef783b2',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100002,
            'ConversationDetailID',
            'Conversation Detail ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '12248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6f304bc3-ea6b-41f3-bae0-db21b733a022'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'ModalityID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6f304bc3-ea6b-41f3-bae0-db21b733a022',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100003,
            'ModalityID',
            'Modality ID',
            'The modality type of this attachment (Image, Audio, Video, File, etc.). References the AIModality table.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4c2badf2-e72c-4497-bf1c-b624a7171bcb'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'MimeType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4c2badf2-e72c-4497-bf1c-b624a7171bcb',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100004,
            'MimeType',
            'Mime Type',
            'MIME type of the attachment (e.g., image/png, video/mp4, audio/mp3).',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b7a7e938-5000-4966-a2cc-5bb754c01c0e'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'FileName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b7a7e938-5000-4966-a2cc-5bb754c01c0e',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100005,
            'FileName',
            'File Name',
            'Original filename of the attachment. Supports long cloud storage paths up to 4000 characters.',
            'nvarchar',
            8000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '19373787-eac3-4454-beac-0e687861368a'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'FileSizeBytes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '19373787-eac3-4454-beac-0e687861368a',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100006,
            'FileSizeBytes',
            'File Size Bytes',
            'Size of the attachment in bytes.',
            'int',
            4,
            10,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '68bd96de-8ee4-44f0-b7ef-50317eea952b'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'Width')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '68bd96de-8ee4-44f0-b7ef-50317eea952b',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100007,
            'Width',
            'Width',
            'Width in pixels for images and videos.',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'aab63ca9-d634-4075-8077-e07f273cdfef'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'Height')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'aab63ca9-d634-4075-8077-e07f273cdfef',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100008,
            'Height',
            'Height',
            'Height in pixels for images and videos.',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2435ae2f-e39f-4654-8eee-363f9e3bf282'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'DurationSeconds')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2435ae2f-e39f-4654-8eee-363f9e3bf282',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100009,
            'DurationSeconds',
            'Duration Seconds',
            'Duration in seconds for audio and video files.',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1be8e682-9ee8-4b4f-8587-56786d5a25ff'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'InlineData')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1be8e682-9ee8-4b4f-8587-56786d5a25ff',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100010,
            'InlineData',
            'Inline Data',
            'Base64-encoded file data for small attachments stored inline. Mutually exclusive with FileID - exactly one must be populated.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e6fb5c5e-7e62-4ed8-bd35-00dc7078d96b'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'FileID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e6fb5c5e-7e62-4ed8-bd35-00dc7078d96b',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100011,
            'FileID',
            'File ID',
            'Reference to File entity for large attachments stored in MJStorage. Mutually exclusive with InlineData - exactly one must be populated.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '29248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5c63e41c-9d73-448e-a9d6-5bc925282823'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'DisplayOrder')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5c63e41c-9d73-448e-a9d6-5bc925282823',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100012,
            'DisplayOrder',
            'Display Order',
            'Display order for multiple attachments in a message. Lower numbers appear first.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8f7049b2-dbf7-47bb-88ee-89f8c5220297'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'ThumbnailBase64')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8f7049b2-dbf7-47bb-88ee-89f8c5220297',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100013,
            'ThumbnailBase64',
            'Thumbnail Base 64',
            'Base64-encoded thumbnail image for quick preview display. Max 200px on longest side.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e48ffa14-4b4c-42ea-8e7b-f74c0adffa40'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e48ffa14-4b4c-42ea-8e7b-f74c0adffa40',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100014,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f34c1f6f-e865-4f5c-bb3f-8e2bd0042747'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f34c1f6f-e865-4f5c-bb3f-8e2bd0042747',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100015,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert entity field value with ID 5148e86d-8451-4df7-a425-1d6daea4f857 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5148e86d-8451-4df7-a425-1d6daea4f857', '62288AA7-F5EF-4BB7-B185-4A83EAD76DD1', 1, 'Binary', 'Binary')

/* SQL text to insert entity field value with ID 9b09d501-7bd8-4c03-82dc-afb015c841df */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9b09d501-7bd8-4c03-82dc-afb015c841df', '62288AA7-F5EF-4BB7-B185-4A83EAD76DD1', 2, 'Content', 'Content')

/* SQL text to insert entity field value with ID 2562841c-7c03-42fa-bd88-642deab12ad0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2562841c-7c03-42fa-bd88-642deab12ad0', '62288AA7-F5EF-4BB7-B185-4A83EAD76DD1', 3, 'Structured', 'Structured')

/* SQL text to update ValueListType for entity field ID 62288AA7-F5EF-4BB7-B185-4A83EAD76DD1 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='62288AA7-F5EF-4BB7-B185-4A83EAD76DD1'

/* SQL text to insert entity field value with ID 351da0a6-a04e-4421-9b2c-586096d50856 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('351da0a6-a04e-4421-9b2c-586096d50856', '20A05CA6-1FA8-4028-93D4-00C05854FCEF', 1, 'audio_url', 'audio_url')

/* SQL text to insert entity field value with ID ec12d455-5b6e-4a93-b801-d38a0cdcd269 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ec12d455-5b6e-4a93-b801-d38a0cdcd269', '20A05CA6-1FA8-4028-93D4-00C05854FCEF', 2, 'embedding', 'embedding')

/* SQL text to insert entity field value with ID 1b51ed39-e27e-4f42-b7d4-8e21cad098a1 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1b51ed39-e27e-4f42-b7d4-8e21cad098a1', '20A05CA6-1FA8-4028-93D4-00C05854FCEF', 3, 'file_url', 'file_url')

/* SQL text to insert entity field value with ID f76e362f-04f3-49a5-9c29-eb1f5a773687 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f76e362f-04f3-49a5-9c29-eb1f5a773687', '20A05CA6-1FA8-4028-93D4-00C05854FCEF', 4, 'image_url', 'image_url')

/* SQL text to insert entity field value with ID 1ea282f9-dd49-4c96-a012-f78b3d9120f5 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1ea282f9-dd49-4c96-a012-f78b3d9120f5', '20A05CA6-1FA8-4028-93D4-00C05854FCEF', 5, 'text', 'text')

/* SQL text to insert entity field value with ID b4411859-f191-4106-a5e2-118a5b89c9bd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b4411859-f191-4106-a5e2-118a5b89c9bd', '20A05CA6-1FA8-4028-93D4-00C05854FCEF', 6, 'video_url', 'video_url')

/* SQL text to update ValueListType for entity field ID 20A05CA6-1FA8-4028-93D4-00C05854FCEF */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='20A05CA6-1FA8-4028-93D4-00C05854FCEF'

/* SQL text to insert entity field value with ID 575009db-9b01-4389-96d7-03f3d45fba09 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('575009db-9b01-4389-96d7-03f3d45fba09', 'C35DE250-CEA2-41DA-B8E8-F737D60DA547', 1, 'Input', 'Input')

/* SQL text to insert entity field value with ID 97cfdf78-d6cd-4f0d-969b-d9270eaaa01c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('97cfdf78-d6cd-4f0d-969b-d9270eaaa01c', 'C35DE250-CEA2-41DA-B8E8-F737D60DA547', 2, 'Output', 'Output')

/* SQL text to update ValueListType for entity field ID C35DE250-CEA2-41DA-B8E8-F737D60DA547 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C35DE250-CEA2-41DA-B8E8-F737D60DA547'

/* SQL text to insert entity field value with ID 244bf34d-3a76-4fd0-b246-ddb6bf0e8200 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('244bf34d-3a76-4fd0-b246-ddb6bf0e8200', '632482BE-DDE3-4453-A654-207ED2D2A77D', 1, 'Input', 'Input')

/* SQL text to insert entity field value with ID 6c40891e-2f73-48af-a351-7d3e3d723ce3 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6c40891e-2f73-48af-a351-7d3e3d723ce3', '632482BE-DDE3-4453-A654-207ED2D2A77D', 2, 'Output', 'Output')

/* SQL text to update ValueListType for entity field ID 632482BE-DDE3-4453-A654-207ED2D2A77D */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='632482BE-DDE3-4453-A654-207ED2D2A77D'

/* SQL text to insert entity field value with ID b1c10d50-e9cd-4dd1-ae6e-fe65cb4a6a96 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b1c10d50-e9cd-4dd1-ae6e-fe65cb4a6a96', '3470A40E-7F60-49AA-8674-D72D88E2139E', 1, 'Core', 'Core')

/* SQL text to insert entity field value with ID 5d50453a-f70a-44a6-9f6c-dc61a9b9192b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5d50453a-f70a-44a6-9f6c-dc61a9b9192b', '3470A40E-7F60-49AA-8674-D72D88E2139E', 2, 'Hybrid', 'Hybrid')

/* SQL text to insert entity field value with ID a36118f6-32eb-470d-b36e-bae7849fb2ce */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a36118f6-32eb-470d-b36e-bae7849fb2ce', '3470A40E-7F60-49AA-8674-D72D88E2139E', 3, 'Optimization', 'Optimization')

/* SQL text to insert entity field value with ID 4b280e91-171e-4ea1-bc43-3eb05413c9c0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4b280e91-171e-4ea1-bc43-3eb05413c9c0', '3470A40E-7F60-49AA-8674-D72D88E2139E', 4, 'Specialized', 'Specialized')

/* SQL text to update ValueListType for entity field ID 3470A40E-7F60-49AA-8674-D72D88E2139E */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3470A40E-7F60-49AA-8674-D72D88E2139E'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'e50b1468-83a0-46eb-805f-23ac115b8753'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('e50b1468-83a0-46eb-805f-23ac115b8753', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '72AC67C3-5FD0-4320-AB49-813697181A54', 'AgentID', 'One To Many', 1, 1, 'MJ: AI Agent Modalities', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ea822d3a-2bf1-4d52-98d8-6fc12aa1a478'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ea822d3a-2bf1-4d52-98d8-6fc12aa1a478', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'E857C741-5B84-4012-8C19-821FC0246EE7', 'ModelID', 'One To Many', 1, 1, 'MJ: AI Model Modalities', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'e9e37e42-91cb-441b-9514-c2774afc2ffa'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('e9e37e42-91cb-441b-9514-c2774afc2ffa', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', 'ModelID', 'One To Many', 1, 1, 'MJ: AI Model Architectures', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '691964a9-f5fd-4fc3-885d-69f7ee9e4139'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('691964a9-f5fd-4fc3-885d-69f7ee9e4139', '12248F34-2837-EF11-86D4-6045BDEE16E6', '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', 'ConversationDetailID', 'One To Many', 1, 1, 'MJ: Conversation Detail Attachments', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '9056ccb3-53c3-4cbe-9792-7451e6ade414'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9056ccb3-53c3-4cbe-9792-7451e6ade414', '28248F34-2837-EF11-86D4-6045BDEE16E6', '6AE1BBF0-2085-4D2F-B724-219DC4212026', 'DefaultStorageProviderID', 'One To Many', 1, 1, 'MJ: AI Configurations', 8);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c37a1ba7-9a12-41b6-9713-605a4888c36a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c37a1ba7-9a12-41b6-9713-605a4888c36a', '28248F34-2837-EF11-86D4-6045BDEE16E6', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'AttachmentStorageProviderID', 'One To Many', 1, 1, 'AI Agents', 22);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '2fe2c06c-7279-4090-9a16-d8876a87b304'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('2fe2c06c-7279-4090-9a16-d8876a87b304', '29248F34-2837-EF11-86D4-6045BDEE16E6', '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', 'FileID', 'One To Many', 1, 1, 'MJ: Conversation Detail Attachments', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c51298fc-d193-49fa-8dfc-a492bee31ad3'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c51298fc-d193-49fa-8dfc-a492bee31ad3', '4F35743A-2413-47FB-9A36-B5BECB038BBF', '4F35743A-2413-47FB-9A36-B5BECB038BBF', 'ParentArchitectureID', 'One To Many', 1, 1, 'MJ: AI Architectures', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '0bdeb543-c823-4d2e-a1d4-1587914cf021'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('0bdeb543-c823-4d2e-a1d4-1587914cf021', '4F35743A-2413-47FB-9A36-B5BECB038BBF', '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', 'ArchitectureID', 'One To Many', 1, 1, 'MJ: AI Model Architectures', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5cf9f403-0ea6-46c1-aa0c-084677ca7abc'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5cf9f403-0ea6-46c1-aa0c-084677ca7abc', '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', 'ModalityID', 'One To Many', 1, 1, 'MJ: Conversation Detail Attachments', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '86f35086-cb3d-463b-b583-5db20f384539'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('86f35086-cb3d-463b-b583-5db20f384539', '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', 'E857C741-5B84-4012-8C19-821FC0246EE7', 'ModalityID', 'One To Many', 1, 1, 'MJ: AI Model Modalities', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '3170b9c7-a6a9-4472-923d-4d3e98f1b383'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('3170b9c7-a6a9-4472-923d-4d3e98f1b383', '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', '72AC67C3-5FD0-4320-AB49-813697181A54', 'ModalityID', 'One To Many', 1, 1, 'MJ: AI Agent Modalities', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'dd6d64be-a698-4fe9-8a16-535076d45658'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('dd6d64be-a698-4fe9-8a16-535076d45658', '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', '01248F34-2837-EF11-86D4-6045BDEE16E6', 'DefaultOutputModalityID', 'One To Many', 1, 1, 'AI Model Types', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c58517cb-380f-45bd-8dd5-58798fd2d49b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c58517cb-380f-45bd-8dd5-58798fd2d49b', '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', '01248F34-2837-EF11-86D4-6045BDEE16E6', 'DefaultInputModalityID', 'One To Many', 1, 1, 'AI Model Types', 4);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID 3BE0E825-2BEF-42A3-857D-A2948A595E54 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3BE0E825-2BEF-42A3-857D-A2948A595E54',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID 125493FE-C84A-4781-B7AB-01FC60EDA17E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='125493FE-C84A-4781-B7AB-01FC60EDA17E',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 8C880A97-E353-431C-9169-C0D256449111 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8C880A97-E353-431C-9169-C0D256449111',
         @RelatedEntityNameFieldMap='GovernmentContact'

/* Index for Foreign Keys for AIAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ParentID ON [${flyway:defaultSchema}].[AIAgent] ([ParentID]);

-- Index for foreign key ContextCompressionPromptID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID ON [${flyway:defaultSchema}].[AIAgent] ([ContextCompressionPromptID]);

-- Index for foreign key TypeID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_TypeID ON [${flyway:defaultSchema}].[AIAgent] ([TypeID]);

-- Index for foreign key DefaultArtifactTypeID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID ON [${flyway:defaultSchema}].[AIAgent] ([DefaultArtifactTypeID]);

-- Index for foreign key OwnerUserID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID ON [${flyway:defaultSchema}].[AIAgent] ([OwnerUserID]);

-- Index for foreign key AttachmentStorageProviderID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID ON [${flyway:defaultSchema}].[AIAgent] ([AttachmentStorageProviderID]);

/* Root ID Function SQL for AI Agents.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: fnAIAgentParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgent].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgent]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgent] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID 4B5A24CC-1BC2-40E3-B83E-C8E164E6CFED */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4B5A24CC-1BC2-40E3-B83E-C8E164E6CFED',
         @RelatedEntityNameFieldMap='AttachmentStorageProvider'

/* Base View SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    AIAgent_ParentID.[Name] AS [Parent],
    AIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt],
    AIAgentType_TypeID.[Name] AS [Type],
    ArtifactType_DefaultArtifactTypeID.[Name] AS [DefaultArtifactType],
    User_OwnerUserID.[Name] AS [OwnerUser],
    FileStorageProvider_AttachmentStorageProviderID.[Name] AS [AttachmentStorageProvider],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[AIAgent] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_ParentID
  ON
    [a].[ParentID] = AIAgent_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ContextCompressionPromptID
  ON
    [a].[ContextCompressionPromptID] = AIPrompt_ContextCompressionPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentType] AS AIAgentType_TypeID
  ON
    [a].[TypeID] = AIAgentType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_DefaultArtifactTypeID
  ON
    [a].[DefaultArtifactTypeID] = ArtifactType_DefaultArtifactTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_OwnerUserID
  ON
    [a].[OwnerUserID] = User_OwnerUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS FileStorageProvider_AttachmentStorageProviderID
  ON
    [a].[AttachmentStorageProviderID] = FileStorageProvider_AttachmentStorageProviderID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit = NULL,
    @ExecutionOrder int = NULL,
    @ExecutionMode nvarchar(20) = NULL,
    @EnableContextCompression bit = NULL,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int,
    @TypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @DriverClass nvarchar(255),
    @IconClass nvarchar(100),
    @ModelSelectionMode nvarchar(50) = NULL,
    @PayloadDownstreamPaths nvarchar(MAX) = NULL,
    @PayloadUpstreamPaths nvarchar(MAX) = NULL,
    @PayloadSelfReadPaths nvarchar(MAX),
    @PayloadSelfWritePaths nvarchar(MAX),
    @PayloadScope nvarchar(MAX),
    @FinalPayloadValidation nvarchar(MAX),
    @FinalPayloadValidationMode nvarchar(25) = NULL,
    @FinalPayloadValidationMaxRetries int = NULL,
    @MaxCostPerRun decimal(10, 4),
    @MaxTokensPerRun int,
    @MaxIterationsPerRun int,
    @MaxTimePerRun int,
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int,
    @StartingPayloadValidation nvarchar(MAX),
    @StartingPayloadValidationMode nvarchar(25) = NULL,
    @DefaultPromptEffortLevel int,
    @ChatHandlingOption nvarchar(30),
    @DefaultArtifactTypeID uniqueidentifier,
    @OwnerUserID uniqueidentifier = NULL,
    @InvocationMode nvarchar(20) = NULL,
    @ArtifactCreationMode nvarchar(20) = NULL,
    @FunctionalRequirements nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX),
    @InjectNotes bit = NULL,
    @MaxNotesToInject int = NULL,
    @NoteInjectionStrategy nvarchar(20) = NULL,
    @InjectExamples bit = NULL,
    @MaxExamplesToInject int = NULL,
    @ExampleInjectionStrategy nvarchar(20) = NULL,
    @IsRestricted bit = NULL,
    @MessageMode nvarchar(50) = NULL,
    @MaxMessages int,
    @AttachmentStorageProviderID uniqueidentifier,
    @AttachmentRootPath nvarchar(500),
    @InlineStorageThresholdBytes int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [ID],
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages],
                [AttachmentStorageProviderID],
                [AttachmentRootPath],
                [InlineStorageThresholdBytes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @IconClass,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @StartingPayloadValidation,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                @DefaultPromptEffortLevel,
                @ChatHandlingOption,
                @DefaultArtifactTypeID,
                CASE @OwnerUserID WHEN '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                @FunctionalRequirements,
                @TechnicalDesign,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                @MaxMessages,
                @AttachmentStorageProviderID,
                @AttachmentRootPath,
                @InlineStorageThresholdBytes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages],
                [AttachmentStorageProviderID],
                [AttachmentRootPath],
                [InlineStorageThresholdBytes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @IconClass,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @StartingPayloadValidation,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                @DefaultPromptEffortLevel,
                @ChatHandlingOption,
                @DefaultArtifactTypeID,
                CASE @OwnerUserID WHEN '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                @FunctionalRequirements,
                @TechnicalDesign,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                @MaxMessages,
                @AttachmentStorageProviderID,
                @AttachmentRootPath,
                @InlineStorageThresholdBytes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit,
    @ExecutionOrder int,
    @ExecutionMode nvarchar(20),
    @EnableContextCompression bit,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int,
    @TypeID uniqueidentifier,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @IconClass nvarchar(100),
    @ModelSelectionMode nvarchar(50),
    @PayloadDownstreamPaths nvarchar(MAX),
    @PayloadUpstreamPaths nvarchar(MAX),
    @PayloadSelfReadPaths nvarchar(MAX),
    @PayloadSelfWritePaths nvarchar(MAX),
    @PayloadScope nvarchar(MAX),
    @FinalPayloadValidation nvarchar(MAX),
    @FinalPayloadValidationMode nvarchar(25),
    @FinalPayloadValidationMaxRetries int,
    @MaxCostPerRun decimal(10, 4),
    @MaxTokensPerRun int,
    @MaxIterationsPerRun int,
    @MaxTimePerRun int,
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int,
    @StartingPayloadValidation nvarchar(MAX),
    @StartingPayloadValidationMode nvarchar(25),
    @DefaultPromptEffortLevel int,
    @ChatHandlingOption nvarchar(30),
    @DefaultArtifactTypeID uniqueidentifier,
    @OwnerUserID uniqueidentifier,
    @InvocationMode nvarchar(20),
    @ArtifactCreationMode nvarchar(20),
    @FunctionalRequirements nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX),
    @InjectNotes bit,
    @MaxNotesToInject int,
    @NoteInjectionStrategy nvarchar(20),
    @InjectExamples bit,
    @MaxExamplesToInject int,
    @ExampleInjectionStrategy nvarchar(20),
    @IsRestricted bit,
    @MessageMode nvarchar(50),
    @MaxMessages int,
    @AttachmentStorageProviderID uniqueidentifier,
    @AttachmentRootPath nvarchar(500),
    @InlineStorageThresholdBytes int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [LogoURL] = @LogoURL,
        [ParentID] = @ParentID,
        [ExposeAsAction] = @ExposeAsAction,
        [ExecutionOrder] = @ExecutionOrder,
        [ExecutionMode] = @ExecutionMode,
        [EnableContextCompression] = @EnableContextCompression,
        [ContextCompressionMessageThreshold] = @ContextCompressionMessageThreshold,
        [ContextCompressionPromptID] = @ContextCompressionPromptID,
        [ContextCompressionMessageRetentionCount] = @ContextCompressionMessageRetentionCount,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [IconClass] = @IconClass,
        [ModelSelectionMode] = @ModelSelectionMode,
        [PayloadDownstreamPaths] = @PayloadDownstreamPaths,
        [PayloadUpstreamPaths] = @PayloadUpstreamPaths,
        [PayloadSelfReadPaths] = @PayloadSelfReadPaths,
        [PayloadSelfWritePaths] = @PayloadSelfWritePaths,
        [PayloadScope] = @PayloadScope,
        [FinalPayloadValidation] = @FinalPayloadValidation,
        [FinalPayloadValidationMode] = @FinalPayloadValidationMode,
        [FinalPayloadValidationMaxRetries] = @FinalPayloadValidationMaxRetries,
        [MaxCostPerRun] = @MaxCostPerRun,
        [MaxTokensPerRun] = @MaxTokensPerRun,
        [MaxIterationsPerRun] = @MaxIterationsPerRun,
        [MaxTimePerRun] = @MaxTimePerRun,
        [MinExecutionsPerRun] = @MinExecutionsPerRun,
        [MaxExecutionsPerRun] = @MaxExecutionsPerRun,
        [StartingPayloadValidation] = @StartingPayloadValidation,
        [StartingPayloadValidationMode] = @StartingPayloadValidationMode,
        [DefaultPromptEffortLevel] = @DefaultPromptEffortLevel,
        [ChatHandlingOption] = @ChatHandlingOption,
        [DefaultArtifactTypeID] = @DefaultArtifactTypeID,
        [OwnerUserID] = @OwnerUserID,
        [InvocationMode] = @InvocationMode,
        [ArtifactCreationMode] = @ArtifactCreationMode,
        [FunctionalRequirements] = @FunctionalRequirements,
        [TechnicalDesign] = @TechnicalDesign,
        [InjectNotes] = @InjectNotes,
        [MaxNotesToInject] = @MaxNotesToInject,
        [NoteInjectionStrategy] = @NoteInjectionStrategy,
        [InjectExamples] = @InjectExamples,
        [MaxExamplesToInject] = @MaxExamplesToInject,
        [ExampleInjectionStrategy] = @ExampleInjectionStrategy,
        [IsRestricted] = @IsRestricted,
        [MessageMode] = @MessageMode,
        [MaxMessages] = @MaxMessages,
        [AttachmentStorageProviderID] = @AttachmentStorageProviderID,
        [AttachmentRootPath] = @AttachmentRootPath,
        [InlineStorageThresholdBytes] = @InlineStorageThresholdBytes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgent
ON [${flyway:defaultSchema}].[AIAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]



/* Index for Foreign Keys for AIModelType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Model Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DefaultInputModalityID in table AIModelType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelType_DefaultInputModalityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelType_DefaultInputModalityID ON [${flyway:defaultSchema}].[AIModelType] ([DefaultInputModalityID]);

-- Index for foreign key DefaultOutputModalityID in table AIModelType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelType_DefaultOutputModalityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelType_DefaultOutputModalityID ON [${flyway:defaultSchema}].[AIModelType] ([DefaultOutputModalityID]);

/* SQL text to update entity field related entity name field map for entity field ID C0BAE356-2818-4B55-9737-5BFA97225462 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C0BAE356-2818-4B55-9737-5BFA97225462',
         @RelatedEntityNameFieldMap='DefaultInputModality'

/* SQL text to update entity field related entity name field map for entity field ID 5E5F9F7F-708F-4595-9F32-5F0574F25F01 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5E5F9F7F-708F-4595-9F32-5F0574F25F01',
         @RelatedEntityNameFieldMap='DefaultOutputModality'

/* Base View SQL for AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Model Types
-- Item: vwAIModelTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Model Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIModelTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIModelTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelTypes]
AS
SELECT
    a.*,
    AIModality_DefaultInputModalityID.[Name] AS [DefaultInputModality],
    AIModality_DefaultOutputModalityID.[Name] AS [DefaultOutputModality]
FROM
    [${flyway:defaultSchema}].[AIModelType] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModality] AS AIModality_DefaultInputModalityID
  ON
    [a].[DefaultInputModalityID] = AIModality_DefaultInputModalityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModality] AS AIModality_DefaultOutputModalityID
  ON
    [a].[DefaultOutputModalityID] = AIModality_DefaultOutputModalityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelTypes] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Model Types
-- Item: Permissions for vwAIModelTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelTypes] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Model Types
-- Item: spCreateAIModelType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIModelType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @DefaultInputModalityID uniqueidentifier,
    @DefaultOutputModalityID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIModelType]
            (
                [ID],
                [Name],
                [Description],
                [DefaultInputModalityID],
                [DefaultOutputModalityID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @DefaultInputModalityID,
                @DefaultOutputModalityID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIModelType]
            (
                [Name],
                [Description],
                [DefaultInputModalityID],
                [DefaultOutputModalityID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @DefaultInputModalityID,
                @DefaultOutputModalityID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelType] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for AI Model Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelType] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Model Types
-- Item: spUpdateAIModelType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIModelType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelType]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @DefaultInputModalityID uniqueidentifier,
    @DefaultOutputModalityID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DefaultInputModalityID] = @DefaultInputModalityID,
        [DefaultOutputModalityID] = @DefaultOutputModalityID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIModelTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelType] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIModelType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIModelType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelType
ON [${flyway:defaultSchema}].[AIModelType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Model Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelType] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Model Types
-- Item: spDeleteAIModelType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIModelType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelType] TO [cdp_Developer]
    

/* spDelete Permissions for AI Model Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelType] TO [cdp_Developer]



/* SQL text to update entity field related entity name field map for entity field ID 950A327F-BF84-46CB-B08E-BD5AA3083F22 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='950A327F-BF84-46CB-B08E-BD5AA3083F22',
         @RelatedEntityNameFieldMap='BoardPosition'

/* SQL text to update entity field related entity name field map for entity field ID 5B34967A-7495-4732-B5C1-B4DD91B70126 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5B34967A-7495-4732-B5C1-B4DD91B70126',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID C85CA1B9-6F15-4CC8-9907-B516590FB56E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C85CA1B9-6F15-4CC8-9907-B516590FB56E',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID B4BC900A-E743-4150-82B4-E286467FC724 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B4BC900A-E743-4150-82B4-E286467FC724',
         @RelatedEntityNameFieldMap='Enrollment'

/* SQL text to update entity field related entity name field map for entity field ID 63FD57EE-498E-4D67-B896-263689855BFB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='63FD57EE-498E-4D67-B896-263689855BFB',
         @RelatedEntityNameFieldMap='Certification'

/* SQL text to update entity field related entity name field map for entity field ID 31019FA4-41F5-496D-BDF9-D99B1D24DBEB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='31019FA4-41F5-496D-BDF9-D99B1D24DBEB',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID F12C27B4-1D2A-4AB7-A22C-F17C84B066BC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F12C27B4-1D2A-4AB7-A22C-F17C84B066BC',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 632031BF-CE87-4360-8F6B-144635CDD5EB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='632031BF-CE87-4360-8F6B-144635CDD5EB',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID E76C5F4B-3421-41EC-A12A-1009C77CDB9A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E76C5F4B-3421-41EC-A12A-1009C77CDB9A',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID E77DAF57-476E-425E-AE1A-12AD296B18DD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E77DAF57-476E-425E-AE1A-12AD296B18DD',
         @RelatedEntityNameFieldMap='ChairMember'

/* SQL text to update entity field related entity name field map for entity field ID B7BBBAD7-ACDE-494F-9588-F651B00E0026 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B7BBBAD7-ACDE-494F-9588-F651B00E0026',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID E9F7EE9A-54FA-4FF8-947A-11AD1972FCE2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E9F7EE9A-54FA-4FF8-947A-11AD1972FCE2',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID AEAA8368-A17B-4CA8-A389-38BAC2D80DE6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AEAA8368-A17B-4CA8-A389-38BAC2D80DE6',
         @RelatedEntityNameFieldMap='Certification'

/* SQL text to update entity field related entity name field map for entity field ID CC4C6002-490E-44B8-BD79-C48E6E993CBE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CC4C6002-490E-44B8-BD79-C48E6E993CBE',
         @RelatedEntityNameFieldMap='PrerequisiteCourse'

/* SQL text to update entity field related entity name field map for entity field ID 94E5D15E-8E03-46DE-A318-2B6A51FCAC01 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='94E5D15E-8E03-46DE-A318-2B6A51FCAC01',
         @RelatedEntityNameFieldMap='EmailSend'

/* SQL text to update entity field related entity name field map for entity field ID FB031A47-9B9E-411F-B5F9-07860C7AED53 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FB031A47-9B9E-411F-B5F9-07860C7AED53',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 566E2286-E1E6-46C3-85E5-2E11A011B51E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='566E2286-E1E6-46C3-85E5-2E11A011B51E',
         @RelatedEntityNameFieldMap='Course'

/* SQL text to update entity field related entity name field map for entity field ID A2D230B4-AB9A-4728-AC57-4C368A7B5A4E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A2D230B4-AB9A-4728-AC57-4C368A7B5A4E',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID D70FBAF6-9289-4786-ADDF-5BE1FE5378BF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D70FBAF6-9289-4786-ADDF-5BE1FE5378BF',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 375EE8A2-929C-4A81-B8B6-C88EE03E0B98 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='375EE8A2-929C-4A81-B8B6-C88EE03E0B98',
         @RelatedEntityNameFieldMap='LastPostAuthor'

/* SQL text to update entity field related entity name field map for entity field ID 4208AEE1-135A-46D5-A558-C3DAB99DECE5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4208AEE1-135A-46D5-A558-C3DAB99DECE5',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID 95C4B964-82DE-4362-8C25-757480F39317 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='95C4B964-82DE-4362-8C25-757480F39317',
         @RelatedEntityNameFieldMap='Thread'

/* SQL text to update entity field related entity name field map for entity field ID 113465EB-CC23-48EF-912D-7EF8E42DF783 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='113465EB-CC23-48EF-912D-7EF8E42DF783',
         @RelatedEntityNameFieldMap='ParentPost'

/* SQL text to update entity field related entity name field map for entity field ID 4B32F978-BB7B-4CF4-80F4-B33CF41F3E30 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4B32F978-BB7B-4CF4-80F4-B33CF41F3E30',
         @RelatedEntityNameFieldMap='ReportedBy'

/* SQL text to update entity field related entity name field map for entity field ID 80668598-993F-4860-8746-823440A580BC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='80668598-993F-4860-8746-823440A580BC',
         @RelatedEntityNameFieldMap='Author'

/* SQL text to update entity field related entity name field map for entity field ID 3CEF6D37-D300-4141-B9AC-C66FD0E1B506 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3CEF6D37-D300-4141-B9AC-C66FD0E1B506',
         @RelatedEntityNameFieldMap='EditedBy'

/* SQL text to update entity field related entity name field map for entity field ID BA49B170-7687-430D-8368-10862445D04C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BA49B170-7687-430D-8368-10862445D04C',
         @RelatedEntityNameFieldMap='ModeratedBy'

/* SQL text to update entity field related entity name field map for entity field ID 8AC15624-0D78-4A36-AAB3-8F84FC54B379 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8AC15624-0D78-4A36-AAB3-8F84FC54B379',
         @RelatedEntityNameFieldMap='Author'

/* SQL text to update entity field related entity name field map for entity field ID 200FB7F9-65B5-451B-8DAC-36752B24521B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='200FB7F9-65B5-451B-8DAC-36752B24521B',
         @RelatedEntityNameFieldMap='LastReplyAuthor'

/* SQL text to update entity field related entity name field map for entity field ID A494058C-C9E3-4E17-9A13-F985ABB77E6C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A494058C-C9E3-4E17-9A13-F985ABB77E6C',
         @RelatedEntityNameFieldMap='Invoice'

/* SQL text to update entity field related entity name field map for entity field ID C86D51C2-9DB0-405E-9D52-040EB6825647 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C86D51C2-9DB0-405E-9D52-040EB6825647',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 52048D88-F236-4E79-8016-10368BB5DA66 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='52048D88-F236-4E79-8016-10368BB5DA66',
         @RelatedEntityNameFieldMap='Follower'

/* SQL text to update entity field related entity name field map for entity field ID 5F7B8B34-D467-4D97-8BFE-C8ABEE855B67 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5F7B8B34-D467-4D97-8BFE-C8ABEE855B67',
         @RelatedEntityNameFieldMap='Member'

/* Index for Foreign Keys for AIAgentModality */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Modalities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentModality
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentModality_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentModality]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentModality_AgentID ON [${flyway:defaultSchema}].[AIAgentModality] ([AgentID]);

-- Index for foreign key ModalityID in table AIAgentModality
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentModality_ModalityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentModality]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentModality_ModalityID ON [${flyway:defaultSchema}].[AIAgentModality] ([ModalityID]);

/* SQL text to update entity field related entity name field map for entity field ID 4EF381E2-6D7B-4228-B79F-C1B4D07A4276 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4EF381E2-6D7B-4228-B79F-C1B4D07A4276',
         @RelatedEntityNameFieldMap='Agent'

/* SQL text to update entity field related entity name field map for entity field ID 397D3A42-8AE2-43DB-9997-C444C6FBD656 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='397D3A42-8AE2-43DB-9997-C444C6FBD656',
         @RelatedEntityNameFieldMap='Modality'

/* Base View SQL for MJ: AI Agent Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Modalities
-- Item: vwAIAgentModalities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Modalities
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentModality
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentModalities]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentModalities];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentModalities]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIModality_ModalityID.[Name] AS [Modality]
FROM
    [${flyway:defaultSchema}].[AIAgentModality] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModality] AS AIModality_ModalityID
  ON
    [a].[ModalityID] = AIModality_ModalityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentModalities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Modalities
-- Item: Permissions for vwAIAgentModalities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentModalities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Modalities
-- Item: spCreateAIAgentModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentModality
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentModality]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentModality];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentModality]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @Direction nvarchar(10),
    @IsAllowed bit = NULL,
    @MaxSizeBytes int,
    @MaxCountPerMessage int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentModality]
            (
                [ID],
                [AgentID],
                [ModalityID],
                [Direction],
                [IsAllowed],
                [MaxSizeBytes],
                [MaxCountPerMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @ModalityID,
                @Direction,
                ISNULL(@IsAllowed, 1),
                @MaxSizeBytes,
                @MaxCountPerMessage
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentModality]
            (
                [AgentID],
                [ModalityID],
                [Direction],
                [IsAllowed],
                [MaxSizeBytes],
                [MaxCountPerMessage]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @ModalityID,
                @Direction,
                ISNULL(@IsAllowed, 1),
                @MaxSizeBytes,
                @MaxCountPerMessage
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentModalities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentModality] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Modalities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentModality] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Modalities
-- Item: spUpdateAIAgentModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentModality
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentModality]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentModality];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentModality]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @Direction nvarchar(10),
    @IsAllowed bit,
    @MaxSizeBytes int,
    @MaxCountPerMessage int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentModality]
    SET
        [AgentID] = @AgentID,
        [ModalityID] = @ModalityID,
        [Direction] = @Direction,
        [IsAllowed] = @IsAllowed,
        [MaxSizeBytes] = @MaxSizeBytes,
        [MaxCountPerMessage] = @MaxCountPerMessage
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentModalities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentModalities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentModality] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentModality table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentModality]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentModality];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentModality
ON [${flyway:defaultSchema}].[AIAgentModality]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentModality]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentModality] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Modalities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentModality] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Modalities
-- Item: spDeleteAIAgentModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentModality
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentModality]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentModality];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentModality]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentModality]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentModality] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Modalities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentModality] TO [cdp_Integration]



/* Index for Foreign Keys for AIArchitecture */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentArchitectureID in table AIArchitecture
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIArchitecture_ParentArchitectureID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIArchitecture]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIArchitecture_ParentArchitectureID ON [${flyway:defaultSchema}].[AIArchitecture] ([ParentArchitectureID]);

/* Root ID Function SQL for MJ: AI Architectures.ParentArchitectureID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: fnAIArchitectureParentArchitectureID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIArchitecture].[ParentArchitectureID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIArchitectureParentArchitectureID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIArchitectureParentArchitectureID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIArchitectureParentArchitectureID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentArchitectureID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIArchitecture]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentArchitectureID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentArchitectureID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIArchitecture] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentArchitectureID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentArchitectureID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID 6C3C2828-9D9E-4C9B-876C-B634FBF562D3 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6C3C2828-9D9E-4C9B-876C-B634FBF562D3',
         @RelatedEntityNameFieldMap='ParentArchitecture'

/* Base View SQL for MJ: AI Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: vwAIArchitectures
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Architectures
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIArchitecture
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIArchitectures]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIArchitectures];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIArchitectures]
AS
SELECT
    a.*,
    AIArchitecture_ParentArchitectureID.[Name] AS [ParentArchitecture],
    root_ParentArchitectureID.RootID AS [RootParentArchitectureID]
FROM
    [${flyway:defaultSchema}].[AIArchitecture] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIArchitecture] AS AIArchitecture_ParentArchitectureID
  ON
    [a].[ParentArchitectureID] = AIArchitecture_ParentArchitectureID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIArchitectureParentArchitectureID_GetRootID]([a].[ID], [a].[ParentArchitectureID]) AS root_ParentArchitectureID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIArchitectures] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: Permissions for vwAIArchitectures
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIArchitectures] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: spCreateAIArchitecture
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIArchitecture
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIArchitecture]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIArchitecture];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIArchitecture]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Category nvarchar(50),
    @ParentArchitectureID uniqueidentifier,
    @WikipediaURL nvarchar(500),
    @YearIntroduced int,
    @KeyPaper nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIArchitecture]
            (
                [ID],
                [Name],
                [Description],
                [Category],
                [ParentArchitectureID],
                [WikipediaURL],
                [YearIntroduced],
                [KeyPaper]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @Category,
                @ParentArchitectureID,
                @WikipediaURL,
                @YearIntroduced,
                @KeyPaper
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIArchitecture]
            (
                [Name],
                [Description],
                [Category],
                [ParentArchitectureID],
                [WikipediaURL],
                [YearIntroduced],
                [KeyPaper]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @Category,
                @ParentArchitectureID,
                @WikipediaURL,
                @YearIntroduced,
                @KeyPaper
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIArchitectures] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIArchitecture] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Architectures */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIArchitecture] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: spUpdateAIArchitecture
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIArchitecture
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIArchitecture]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIArchitecture];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIArchitecture]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Category nvarchar(50),
    @ParentArchitectureID uniqueidentifier,
    @WikipediaURL nvarchar(500),
    @YearIntroduced int,
    @KeyPaper nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIArchitecture]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Category] = @Category,
        [ParentArchitectureID] = @ParentArchitectureID,
        [WikipediaURL] = @WikipediaURL,
        [YearIntroduced] = @YearIntroduced,
        [KeyPaper] = @KeyPaper
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIArchitectures] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIArchitectures]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIArchitecture] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIArchitecture table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIArchitecture]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIArchitecture];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIArchitecture
ON [${flyway:defaultSchema}].[AIArchitecture]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIArchitecture]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIArchitecture] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Architectures */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIArchitecture] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Architectures
-- Item: spDeleteAIArchitecture
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIArchitecture
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIArchitecture]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIArchitecture];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIArchitecture]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIArchitecture]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIArchitecture] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Architectures */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIArchitecture] TO [cdp_Integration]



/* Index for Foreign Keys for AIConfiguration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DefaultPromptForContextCompressionID in table AIConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextCompressionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextCompressionID ON [${flyway:defaultSchema}].[AIConfiguration] ([DefaultPromptForContextCompressionID]);

-- Index for foreign key DefaultPromptForContextSummarizationID in table AIConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextSummarizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextSummarizationID ON [${flyway:defaultSchema}].[AIConfiguration] ([DefaultPromptForContextSummarizationID]);

-- Index for foreign key DefaultStorageProviderID in table AIConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultStorageProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultStorageProviderID ON [${flyway:defaultSchema}].[AIConfiguration] ([DefaultStorageProviderID]);

/* SQL text to update entity field related entity name field map for entity field ID 303B2C68-A58D-468D-9CD3-766922EF93B6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='303B2C68-A58D-468D-9CD3-766922EF93B6',
         @RelatedEntityNameFieldMap='DefaultStorageProvider'

/* Index for Foreign Keys for AIModality */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Modalities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for AIModelArchitecture */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Architectures
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table AIModelArchitecture
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelArchitecture_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelArchitecture]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelArchitecture_ModelID ON [${flyway:defaultSchema}].[AIModelArchitecture] ([ModelID]);

-- Index for foreign key ArchitectureID in table AIModelArchitecture
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelArchitecture_ArchitectureID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelArchitecture]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelArchitecture_ArchitectureID ON [${flyway:defaultSchema}].[AIModelArchitecture] ([ArchitectureID]);

/* SQL text to update entity field related entity name field map for entity field ID 90AAD825-EC7E-4537-B0CE-1558AD0313DB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='90AAD825-EC7E-4537-B0CE-1558AD0313DB',
         @RelatedEntityNameFieldMap='Model'

/* Base View SQL for MJ: AI Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Modalities
-- Item: vwAIModalities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Modalities
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModality
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIModalities]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIModalities];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModalities]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIModality] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModalities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Modalities
-- Item: Permissions for vwAIModalities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModalities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Modalities
-- Item: spCreateAIModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModality
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIModality]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIModality];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModality]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(500),
    @ContentBlockType nvarchar(50),
    @MIMETypePattern nvarchar(100),
    @Type nvarchar(50) = NULL,
    @DefaultMaxSizeBytes int,
    @DefaultMaxCountPerMessage int,
    @DisplayOrder int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIModality]
            (
                [ID],
                [Name],
                [Description],
                [ContentBlockType],
                [MIMETypePattern],
                [Type],
                [DefaultMaxSizeBytes],
                [DefaultMaxCountPerMessage],
                [DisplayOrder]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ContentBlockType,
                @MIMETypePattern,
                ISNULL(@Type, 'Content'),
                @DefaultMaxSizeBytes,
                @DefaultMaxCountPerMessage,
                ISNULL(@DisplayOrder, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIModality]
            (
                [Name],
                [Description],
                [ContentBlockType],
                [MIMETypePattern],
                [Type],
                [DefaultMaxSizeBytes],
                [DefaultMaxCountPerMessage],
                [DisplayOrder]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ContentBlockType,
                @MIMETypePattern,
                ISNULL(@Type, 'Content'),
                @DefaultMaxSizeBytes,
                @DefaultMaxCountPerMessage,
                ISNULL(@DisplayOrder, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModalities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModality] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Modalities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModality] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Modalities
-- Item: spUpdateAIModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModality
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIModality]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModality];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModality]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(500),
    @ContentBlockType nvarchar(50),
    @MIMETypePattern nvarchar(100),
    @Type nvarchar(50),
    @DefaultMaxSizeBytes int,
    @DefaultMaxCountPerMessage int,
    @DisplayOrder int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModality]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ContentBlockType] = @ContentBlockType,
        [MIMETypePattern] = @MIMETypePattern,
        [Type] = @Type,
        [DefaultMaxSizeBytes] = @DefaultMaxSizeBytes,
        [DefaultMaxCountPerMessage] = @DefaultMaxCountPerMessage,
        [DisplayOrder] = @DisplayOrder
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIModalities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModalities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModality] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModality table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIModality]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIModality];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModality
ON [${flyway:defaultSchema}].[AIModality]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModality]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModality] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Modalities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModality] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Modalities
-- Item: spDeleteAIModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModality
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIModality]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModality];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModality]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModality]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModality] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Modalities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModality] TO [cdp_Integration]



/* Base View SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: vwAIConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Configurations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIConfigurations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIConfigurations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIConfigurations]
AS
SELECT
    a.*,
    AIPrompt_DefaultPromptForContextCompressionID.[Name] AS [DefaultPromptForContextCompression],
    AIPrompt_DefaultPromptForContextSummarizationID.[Name] AS [DefaultPromptForContextSummarization],
    FileStorageProvider_DefaultStorageProviderID.[Name] AS [DefaultStorageProvider]
FROM
    [${flyway:defaultSchema}].[AIConfiguration] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_DefaultPromptForContextCompressionID
  ON
    [a].[DefaultPromptForContextCompressionID] = AIPrompt_DefaultPromptForContextCompressionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_DefaultPromptForContextSummarizationID
  ON
    [a].[DefaultPromptForContextSummarizationID] = AIPrompt_DefaultPromptForContextSummarizationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS FileStorageProvider_DefaultStorageProviderID
  ON
    [a].[DefaultStorageProviderID] = FileStorageProvider_DefaultStorageProviderID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: Permissions for vwAIConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spCreateAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIConfiguration]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsDefault bit = NULL,
    @Status nvarchar(20) = NULL,
    @DefaultPromptForContextCompressionID uniqueidentifier,
    @DefaultPromptForContextSummarizationID uniqueidentifier,
    @DefaultStorageProviderID uniqueidentifier,
    @DefaultStorageRootPath nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIConfiguration]
            (
                [ID],
                [Name],
                [Description],
                [IsDefault],
                [Status],
                [DefaultPromptForContextCompressionID],
                [DefaultPromptForContextSummarizationID],
                [DefaultStorageProviderID],
                [DefaultStorageRootPath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@IsDefault, 0),
                ISNULL(@Status, 'Active'),
                @DefaultPromptForContextCompressionID,
                @DefaultPromptForContextSummarizationID,
                @DefaultStorageProviderID,
                @DefaultStorageRootPath
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIConfiguration]
            (
                [Name],
                [Description],
                [IsDefault],
                [Status],
                [DefaultPromptForContextCompressionID],
                [DefaultPromptForContextSummarizationID],
                [DefaultStorageProviderID],
                [DefaultStorageRootPath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@IsDefault, 0),
                ISNULL(@Status, 'Active'),
                @DefaultPromptForContextCompressionID,
                @DefaultPromptForContextSummarizationID,
                @DefaultStorageProviderID,
                @DefaultStorageRootPath
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIConfigurations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfiguration] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spUpdateAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIConfiguration]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsDefault bit,
    @Status nvarchar(20),
    @DefaultPromptForContextCompressionID uniqueidentifier,
    @DefaultPromptForContextSummarizationID uniqueidentifier,
    @DefaultStorageProviderID uniqueidentifier,
    @DefaultStorageRootPath nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfiguration]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [IsDefault] = @IsDefault,
        [Status] = @Status,
        [DefaultPromptForContextCompressionID] = @DefaultPromptForContextCompressionID,
        [DefaultPromptForContextSummarizationID] = @DefaultPromptForContextSummarizationID,
        [DefaultStorageProviderID] = @DefaultStorageProviderID,
        [DefaultStorageRootPath] = @DefaultStorageRootPath
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIConfigurations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIConfigurations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfiguration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIConfiguration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIConfiguration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIConfiguration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIConfiguration
ON [${flyway:defaultSchema}].[AIConfiguration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfiguration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIConfiguration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spDeleteAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIConfiguration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 99E524B7-2A2D-42B3-808D-498EA904AD7B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='99E524B7-2A2D-42B3-808D-498EA904AD7B',
         @RelatedEntityNameFieldMap='Architecture'

/* Base View SQL for MJ: AI Model Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Architectures
-- Item: vwAIModelArchitectures
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Architectures
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelArchitecture
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIModelArchitectures]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIModelArchitectures];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelArchitectures]
AS
SELECT
    a.*,
    AIModel_ModelID.[Name] AS [Model],
    AIArchitecture_ArchitectureID.[Name] AS [Architecture]
FROM
    [${flyway:defaultSchema}].[AIModelArchitecture] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIArchitecture] AS AIArchitecture_ArchitectureID
  ON
    [a].[ArchitectureID] = AIArchitecture_ArchitectureID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelArchitectures] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Model Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Architectures
-- Item: Permissions for vwAIModelArchitectures
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelArchitectures] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Model Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Architectures
-- Item: spCreateAIModelArchitecture
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelArchitecture
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIModelArchitecture]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelArchitecture];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelArchitecture]
    @ID uniqueidentifier = NULL,
    @ModelID uniqueidentifier,
    @ArchitectureID uniqueidentifier,
    @Rank int = NULL,
    @Weight decimal(5, 4),
    @Notes nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIModelArchitecture]
            (
                [ID],
                [ModelID],
                [ArchitectureID],
                [Rank],
                [Weight],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ModelID,
                @ArchitectureID,
                ISNULL(@Rank, 1),
                @Weight,
                @Notes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIModelArchitecture]
            (
                [ModelID],
                [ArchitectureID],
                [Rank],
                [Weight],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ModelID,
                @ArchitectureID,
                ISNULL(@Rank, 1),
                @Weight,
                @Notes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelArchitectures] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelArchitecture] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Model Architectures */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelArchitecture] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Model Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Architectures
-- Item: spUpdateAIModelArchitecture
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelArchitecture
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIModelArchitecture]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelArchitecture];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelArchitecture]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier,
    @ArchitectureID uniqueidentifier,
    @Rank int,
    @Weight decimal(5, 4),
    @Notes nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelArchitecture]
    SET
        [ModelID] = @ModelID,
        [ArchitectureID] = @ArchitectureID,
        [Rank] = @Rank,
        [Weight] = @Weight,
        [Notes] = @Notes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIModelArchitectures] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelArchitectures]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelArchitecture] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelArchitecture table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIModelArchitecture]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIModelArchitecture];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelArchitecture
ON [${flyway:defaultSchema}].[AIModelArchitecture]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelArchitecture]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelArchitecture] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Model Architectures */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelArchitecture] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Model Architectures */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Architectures
-- Item: spDeleteAIModelArchitecture
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelArchitecture
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIModelArchitecture]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelArchitecture];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelArchitecture]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelArchitecture]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelArchitecture] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Model Architectures */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelArchitecture] TO [cdp_Integration]



/* Index for Foreign Keys for AIModelModality */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Modalities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table AIModelModality
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelModality_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelModality]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelModality_ModelID ON [${flyway:defaultSchema}].[AIModelModality] ([ModelID]);

-- Index for foreign key ModalityID in table AIModelModality
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelModality_ModalityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelModality]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelModality_ModalityID ON [${flyway:defaultSchema}].[AIModelModality] ([ModalityID]);

/* SQL text to update entity field related entity name field map for entity field ID 4DBE2B92-0104-4DA3-814F-C592EC07CBED */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4DBE2B92-0104-4DA3-814F-C592EC07CBED',
         @RelatedEntityNameFieldMap='Model'

/* SQL text to update entity field related entity name field map for entity field ID BD1DBDD9-D9D8-4B88-800C-DFF9823228B8 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BD1DBDD9-D9D8-4B88-800C-DFF9823228B8',
         @RelatedEntityNameFieldMap='Modality'

/* Base View SQL for MJ: AI Model Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Modalities
-- Item: vwAIModelModalities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Modalities
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelModality
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIModelModalities]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIModelModalities];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelModalities]
AS
SELECT
    a.*,
    AIModel_ModelID.[Name] AS [Model],
    AIModality_ModalityID.[Name] AS [Modality]
FROM
    [${flyway:defaultSchema}].[AIModelModality] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModality] AS AIModality_ModalityID
  ON
    [a].[ModalityID] = AIModality_ModalityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelModalities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Model Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Modalities
-- Item: Permissions for vwAIModelModalities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelModalities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Model Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Modalities
-- Item: spCreateAIModelModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelModality
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIModelModality]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelModality];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelModality]
    @ID uniqueidentifier = NULL,
    @ModelID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @Direction nvarchar(10),
    @IsSupported bit = NULL,
    @IsRequired bit = NULL,
    @SupportedFormats nvarchar(500),
    @MaxSizeBytes int,
    @MaxCountPerMessage int,
    @MaxDimension int,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIModelModality]
            (
                [ID],
                [ModelID],
                [ModalityID],
                [Direction],
                [IsSupported],
                [IsRequired],
                [SupportedFormats],
                [MaxSizeBytes],
                [MaxCountPerMessage],
                [MaxDimension],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ModelID,
                @ModalityID,
                @Direction,
                ISNULL(@IsSupported, 1),
                ISNULL(@IsRequired, 0),
                @SupportedFormats,
                @MaxSizeBytes,
                @MaxCountPerMessage,
                @MaxDimension,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIModelModality]
            (
                [ModelID],
                [ModalityID],
                [Direction],
                [IsSupported],
                [IsRequired],
                [SupportedFormats],
                [MaxSizeBytes],
                [MaxCountPerMessage],
                [MaxDimension],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ModelID,
                @ModalityID,
                @Direction,
                ISNULL(@IsSupported, 1),
                ISNULL(@IsRequired, 0),
                @SupportedFormats,
                @MaxSizeBytes,
                @MaxCountPerMessage,
                @MaxDimension,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelModalities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelModality] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Model Modalities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelModality] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Model Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Modalities
-- Item: spUpdateAIModelModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelModality
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIModelModality]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelModality];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelModality]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @Direction nvarchar(10),
    @IsSupported bit,
    @IsRequired bit,
    @SupportedFormats nvarchar(500),
    @MaxSizeBytes int,
    @MaxCountPerMessage int,
    @MaxDimension int,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelModality]
    SET
        [ModelID] = @ModelID,
        [ModalityID] = @ModalityID,
        [Direction] = @Direction,
        [IsSupported] = @IsSupported,
        [IsRequired] = @IsRequired,
        [SupportedFormats] = @SupportedFormats,
        [MaxSizeBytes] = @MaxSizeBytes,
        [MaxCountPerMessage] = @MaxCountPerMessage,
        [MaxDimension] = @MaxDimension,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIModelModalities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelModalities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelModality] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelModality table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIModelModality]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIModelModality];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelModality
ON [${flyway:defaultSchema}].[AIModelModality]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelModality]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelModality] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Model Modalities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelModality] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Model Modalities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Modalities
-- Item: spDeleteAIModelModality
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelModality
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIModelModality]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelModality];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelModality]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelModality]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelModality] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Model Modalities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelModality] TO [cdp_Integration]



/* Index for Foreign Keys for ConversationDetailAttachment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationDetailID in table ConversationDetailAttachment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetailAttachment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_ConversationDetailID ON [${flyway:defaultSchema}].[ConversationDetailAttachment] ([ConversationDetailID]);

-- Index for foreign key ModalityID in table ConversationDetailAttachment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_ModalityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetailAttachment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_ModalityID ON [${flyway:defaultSchema}].[ConversationDetailAttachment] ([ModalityID]);

-- Index for foreign key FileID in table ConversationDetailAttachment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_FileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetailAttachment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_FileID ON [${flyway:defaultSchema}].[ConversationDetailAttachment] ([FileID]);

/* SQL text to update entity field related entity name field map for entity field ID F67B3F45-A45F-4F0C-A16C-939B1EF783B2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F67B3F45-A45F-4F0C-A16C-939B1EF783B2',
         @RelatedEntityNameFieldMap='ConversationDetail'

/* SQL text to update entity field related entity name field map for entity field ID 6F304BC3-EA6B-41F3-BAE0-DB21B733A022 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6F304BC3-EA6B-41F3-BAE0-DB21B733A022',
         @RelatedEntityNameFieldMap='Modality'

/* SQL text to update entity field related entity name field map for entity field ID E6FB5C5E-7E62-4ED8-BD35-00DC7078D96B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E6FB5C5E-7E62-4ED8-BD35-00DC7078D96B',
         @RelatedEntityNameFieldMap='File'

/* Base View SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: vwConversationDetailAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Attachments
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationDetailAttachment
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationDetailAttachments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationDetailAttachments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetailAttachments]
AS
SELECT
    c.*,
    ConversationDetail_ConversationDetailID.[Message] AS [ConversationDetail],
    AIModality_ModalityID.[Name] AS [Modality],
    File_FileID.[Name] AS [File]
FROM
    [${flyway:defaultSchema}].[ConversationDetailAttachment] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS ConversationDetail_ConversationDetailID
  ON
    [c].[ConversationDetailID] = ConversationDetail_ConversationDetailID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModality] AS AIModality_ModalityID
  ON
    [c].[ModalityID] = AIModality_ModalityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS File_FileID
  ON
    [c].[FileID] = File_FileID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetailAttachments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: Permissions for vwConversationDetailAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetailAttachments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spCreateConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationDetailAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetailAttachment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetailAttachment]
    @ID uniqueidentifier = NULL,
    @ConversationDetailID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @MimeType nvarchar(100),
    @FileName nvarchar(4000),
    @FileSizeBytes int,
    @Width int,
    @Height int,
    @DurationSeconds int,
    @InlineData nvarchar(MAX),
    @FileID uniqueidentifier,
    @DisplayOrder int = NULL,
    @ThumbnailBase64 nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetailAttachment]
            (
                [ID],
                [ConversationDetailID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [DisplayOrder],
                [ThumbnailBase64]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationDetailID,
                @ModalityID,
                @MimeType,
                @FileName,
                @FileSizeBytes,
                @Width,
                @Height,
                @DurationSeconds,
                @InlineData,
                @FileID,
                ISNULL(@DisplayOrder, 0),
                @ThumbnailBase64
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetailAttachment]
            (
                [ConversationDetailID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [DisplayOrder],
                [ThumbnailBase64]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationDetailID,
                @ModalityID,
                @MimeType,
                @FileName,
                @FileSizeBytes,
                @Width,
                @Height,
                @DurationSeconds,
                @InlineData,
                @FileID,
                ISNULL(@DisplayOrder, 0),
                @ThumbnailBase64
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetailAttachments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetailAttachment] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Conversation Detail Attachments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetailAttachment] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spUpdateConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationDetailAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment]
    @ID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @MimeType nvarchar(100),
    @FileName nvarchar(4000),
    @FileSizeBytes int,
    @Width int,
    @Height int,
    @DurationSeconds int,
    @InlineData nvarchar(MAX),
    @FileID uniqueidentifier,
    @DisplayOrder int,
    @ThumbnailBase64 nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetailAttachment]
    SET
        [ConversationDetailID] = @ConversationDetailID,
        [ModalityID] = @ModalityID,
        [MimeType] = @MimeType,
        [FileName] = @FileName,
        [FileSizeBytes] = @FileSizeBytes,
        [Width] = @Width,
        [Height] = @Height,
        [DurationSeconds] = @DurationSeconds,
        [InlineData] = @InlineData,
        [FileID] = @FileID,
        [DisplayOrder] = @DisplayOrder,
        [ThumbnailBase64] = @ThumbnailBase64
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationDetailAttachments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationDetailAttachments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetailAttachment table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationDetailAttachment]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationDetailAttachment];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationDetailAttachment
ON [${flyway:defaultSchema}].[ConversationDetailAttachment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetailAttachment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationDetailAttachment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Conversation Detail Attachments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spDeleteConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetailAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetailAttachment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Detail Attachments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID CFB181FB-03B7-4B52-A610-19557162E4DB */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CFB181FB-03B7-4B52-A610-19557162E4DB',
         @RelatedEntityNameFieldMap='Invoice'

/* SQL text to update entity field related entity name field map for entity field ID BFC05557-E016-4825-8167-66F94E8F93A9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BFC05557-E016-4825-8167-66F94E8F93A9',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID 10080C3A-D89D-4D86-B74D-06889D753625 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='10080C3A-D89D-4D86-B74D-06889D753625',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID C7A87C8D-692A-45EC-A700-E45557508420 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C7A87C8D-692A-45EC-A700-E45557508420',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID AFA24CA4-3DB1-4C24-91F8-5C52C2CB149D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AFA24CA4-3DB1-4C24-91F8-5C52C2CB149D',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID 283C40B8-5F5C-479A-A329-674154AC2DA1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='283C40B8-5F5C-479A-A329-674154AC2DA1',
         @RelatedEntityNameFieldMap='CompetitionEntry'

/* SQL text to update entity field related entity name field map for entity field ID 92A9AC9E-84AC-46E7-A9F8-651478285024 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='92A9AC9E-84AC-46E7-A9F8-651478285024',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 3CBD4A48-1FEA-4C8B-ADFA-CE8EBBCCF679 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3CBD4A48-1FEA-4C8B-ADFA-CE8EBBCCF679',
         @RelatedEntityNameFieldMap='UploadedBy'

/* SQL text to update entity field related entity name field map for entity field ID B09671D4-F08C-4771-B7D3-17ED6740F0DD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B09671D4-F08C-4771-B7D3-17ED6740F0DD',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 2D64E32A-7543-4CAF-B3E0-1DBA4B41DF5E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2D64E32A-7543-4CAF-B3E0-1DBA4B41DF5E',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID AD1AC9CB-C423-4D4E-AFDA-7C26FE14EF42 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AD1AC9CB-C423-4D4E-AFDA-7C26FE14EF42',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID C9A50ECC-5C7F-49C2-84A6-266914575ED8 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C9A50ECC-5C7F-49C2-84A6-266914575ED8',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 0F6E03C0-FA1F-411A-949E-9CB68B3E6FDC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0F6E03C0-FA1F-411A-949E-9CB68B3E6FDC',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID 803DE1DE-2706-4497-94A4-BB5C722576A2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='803DE1DE-2706-4497-94A4-BB5C722576A2',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID 23DBD43F-9AD4-4712-B283-B70FF6056BF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='23DBD43F-9AD4-4712-B283-B70FF6056BF2',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID 256F8BCF-CC87-4C10-A1E6-EA97530BF779 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='256F8BCF-CC87-4C10-A1E6-EA97530BF779',
         @RelatedEntityNameFieldMap='Author'

/* SQL text to update entity field related entity name field map for entity field ID AC72D210-D613-4394-B443-3E6B23F4783D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AC72D210-D613-4394-B443-3E6B23F4783D',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID D5ABA001-69C0-4402-95E9-57D35FB04C5C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D5ABA001-69C0-4402-95E9-57D35FB04C5C',
         @RelatedEntityNameFieldMap='CreatedBy'

/* spDelete SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @AIAgentNotesID uniqueidentifier
    DECLARE @AIAgentNotes_AgentID uniqueidentifier
    DECLARE @AIAgentNotes_AgentNoteTypeID uniqueidentifier
    DECLARE @AIAgentNotes_Note nvarchar(MAX)
    DECLARE @AIAgentNotes_UserID uniqueidentifier
    DECLARE @AIAgentNotes_Type nvarchar(20)
    DECLARE @AIAgentNotes_IsAutoGenerated bit
    DECLARE @AIAgentNotes_Comments nvarchar(MAX)
    DECLARE @AIAgentNotes_Status nvarchar(20)
    DECLARE @AIAgentNotes_SourceConversationID uniqueidentifier
    DECLARE @AIAgentNotes_SourceConversationDetailID uniqueidentifier
    DECLARE @AIAgentNotes_SourceAIAgentRunID uniqueidentifier
    DECLARE @AIAgentNotes_CompanyID uniqueidentifier
    DECLARE @AIAgentNotes_EmbeddingVector nvarchar(MAX)
    DECLARE @AIAgentNotes_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_AIAgentNotes_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationDetailID] = @ID
    
    OPEN cascade_update_AIAgentNotes_cursor
    FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @AIAgentNotes_SourceConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @AIAgentNotesID, @AgentID = @AIAgentNotes_AgentID, @AgentNoteTypeID = @AIAgentNotes_AgentNoteTypeID, @Note = @AIAgentNotes_Note, @UserID = @AIAgentNotes_UserID, @Type = @AIAgentNotes_Type, @IsAutoGenerated = @AIAgentNotes_IsAutoGenerated, @Comments = @AIAgentNotes_Comments, @Status = @AIAgentNotes_Status, @SourceConversationID = @AIAgentNotes_SourceConversationID, @SourceConversationDetailID = @AIAgentNotes_SourceConversationDetailID, @SourceAIAgentRunID = @AIAgentNotes_SourceAIAgentRunID, @CompanyID = @AIAgentNotes_CompanyID, @EmbeddingVector = @AIAgentNotes_EmbeddingVector, @EmbeddingModelID = @AIAgentNotes_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    END
    
    CLOSE cascade_update_AIAgentNotes_cursor
    DEALLOCATE cascade_update_AIAgentNotes_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE @ConversationDetails_ConversationID uniqueidentifier
    DECLARE @ConversationDetails_ExternalID nvarchar(100)
    DECLARE @ConversationDetails_Role nvarchar(20)
    DECLARE @ConversationDetails_Message nvarchar(MAX)
    DECLARE @ConversationDetails_Error nvarchar(MAX)
    DECLARE @ConversationDetails_HiddenToUser bit
    DECLARE @ConversationDetails_UserRating int
    DECLARE @ConversationDetails_UserFeedback nvarchar(MAX)
    DECLARE @ConversationDetails_ReflectionInsights nvarchar(MAX)
    DECLARE @ConversationDetails_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @ConversationDetails_UserID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactVersionID uniqueidentifier
    DECLARE @ConversationDetails_CompletionTime bigint
    DECLARE @ConversationDetails_IsPinned bit
    DECLARE @ConversationDetails_ParentID uniqueidentifier
    DECLARE @ConversationDetails_AgentID uniqueidentifier
    DECLARE @ConversationDetails_Status nvarchar(20)
    DECLARE @ConversationDetails_SuggestedResponses nvarchar(MAX)
    DECLARE @ConversationDetails_TestRunID uniqueidentifier
    DECLARE @ConversationDetails_ResponseForm nvarchar(MAX)
    DECLARE @ConversationDetails_ActionableCommands nvarchar(MAX)
    DECLARE @ConversationDetails_AutomaticCommands nvarchar(MAX)
    DECLARE @ConversationDetails_OriginalMessageChanged bit
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ParentID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses, @TestRunID = @ConversationDetails_TestRunID, @ResponseForm = @ConversationDetails_ResponseForm, @ActionableCommands = @ConversationDetails_ActionableCommands, @AutomaticCommands = @ConversationDetails_AutomaticCommands, @OriginalMessageChanged = @ConversationDetails_OriginalMessageChanged
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJ_AIAgentExamplesID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_UserID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_CompanyID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_Type nvarchar(20)
    DECLARE @MJ_AIAgentExamples_ExampleInput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_ExampleOutput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_IsAutoGenerated bit
    DECLARE @MJ_AIAgentExamples_SourceConversationID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SuccessScore decimal(5, 2)
    DECLARE @MJ_AIAgentExamples_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_Status nvarchar(20)
    DECLARE @MJ_AIAgentExamples_EmbeddingVector nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentExamples_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentExamples_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentExamples_SourceConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJ_AIAgentExamplesID, @AgentID = @MJ_AIAgentExamples_AgentID, @UserID = @MJ_AIAgentExamples_UserID, @CompanyID = @MJ_AIAgentExamples_CompanyID, @Type = @MJ_AIAgentExamples_Type, @ExampleInput = @MJ_AIAgentExamples_ExampleInput, @ExampleOutput = @MJ_AIAgentExamples_ExampleOutput, @IsAutoGenerated = @MJ_AIAgentExamples_IsAutoGenerated, @SourceConversationID = @MJ_AIAgentExamples_SourceConversationID, @SourceConversationDetailID = @MJ_AIAgentExamples_SourceConversationDetailID, @SourceAIAgentRunID = @MJ_AIAgentExamples_SourceAIAgentRunID, @SuccessScore = @MJ_AIAgentExamples_SuccessScore, @Comments = @MJ_AIAgentExamples_Comments, @Status = @MJ_AIAgentExamples_Status, @EmbeddingVector = @MJ_AIAgentExamples_EmbeddingVector, @EmbeddingModelID = @MJ_AIAgentExamples_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    END
    
    CLOSE cascade_update_MJ_AIAgentExamples_cursor
    DEALLOCATE cascade_update_MJ_AIAgentExamples_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJ_AIAgentRunsID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ParentRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Status nvarchar(50)
    DECLARE @MJ_AIAgentRuns_StartedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_CompletedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_Success bit
    DECLARE @MJ_AIAgentRuns_ErrorMessage nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ConversationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_UserID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Result nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_AgentState nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCost decimal(18, 6)
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCostRollup decimal(19, 8)
    DECLARE @MJ_AIAgentRuns_ConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ConversationDetailSequence int
    DECLARE @MJ_AIAgentRuns_CancellationReason nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalStep nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Message nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_LastRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_StartingPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalPromptIterations int
    DECLARE @MJ_AIAgentRuns_ConfigurationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideModelID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideVendorID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Data nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Verbose bit
    DECLARE @MJ_AIAgentRuns_EffortLevel int
    DECLARE @MJ_AIAgentRuns_RunName nvarchar(255)
    DECLARE @MJ_AIAgentRuns_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ScheduledJobRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_TestRunID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID, @TestRunID = @MJ_AIAgentRuns_TestRunID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJ_ConversationDetailArtifactsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailArtifacts_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailArtifacts_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJ_ConversationDetailArtifactsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    
    -- Cascade delete from ConversationDetailAttachment using cursor to call spDeleteConversationDetailAttachment
    DECLARE @MJ_ConversationDetailAttachmentsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailAttachments_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailAttachment]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailAttachments_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailAttachments_cursor INTO @MJ_ConversationDetailAttachmentsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] @ID = @MJ_ConversationDetailAttachmentsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailAttachments_cursor INTO @MJ_ConversationDetailAttachmentsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailAttachments_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailAttachments_cursor
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating
    DECLARE @MJ_ConversationDetailRatingsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailRatings_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailRating]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailRatings_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailRatings_cursor INTO @MJ_ConversationDetailRatingsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailRating] @ID = @MJ_ConversationDetailRatingsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailRatings_cursor INTO @MJ_ConversationDetailRatingsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailRatings_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailRatings_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJ_TasksID uniqueidentifier
    DECLARE @MJ_Tasks_ParentID uniqueidentifier
    DECLARE @MJ_Tasks_Name nvarchar(255)
    DECLARE @MJ_Tasks_Description nvarchar(MAX)
    DECLARE @MJ_Tasks_TypeID uniqueidentifier
    DECLARE @MJ_Tasks_EnvironmentID uniqueidentifier
    DECLARE @MJ_Tasks_ProjectID uniqueidentifier
    DECLARE @MJ_Tasks_ConversationDetailID uniqueidentifier
    DECLARE @MJ_Tasks_UserID uniqueidentifier
    DECLARE @MJ_Tasks_AgentID uniqueidentifier
    DECLARE @MJ_Tasks_Status nvarchar(50)
    DECLARE @MJ_Tasks_PercentComplete int
    DECLARE @MJ_Tasks_DueAt datetimeoffset
    DECLARE @MJ_Tasks_StartedAt datetimeoffset
    DECLARE @MJ_Tasks_CompletedAt datetimeoffset
    DECLARE cascade_update_MJ_Tasks_cursor CURSOR FOR 
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_Tasks_cursor
    FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_Tasks_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJ_TasksID, @ParentID = @MJ_Tasks_ParentID, @Name = @MJ_Tasks_Name, @Description = @MJ_Tasks_Description, @TypeID = @MJ_Tasks_TypeID, @EnvironmentID = @MJ_Tasks_EnvironmentID, @ProjectID = @MJ_Tasks_ProjectID, @ConversationDetailID = @MJ_Tasks_ConversationDetailID, @UserID = @MJ_Tasks_UserID, @AgentID = @MJ_Tasks_AgentID, @Status = @MJ_Tasks_Status, @PercentComplete = @MJ_Tasks_PercentComplete, @DueAt = @MJ_Tasks_DueAt, @StartedAt = @MJ_Tasks_StartedAt, @CompletedAt = @MJ_Tasks_CompletedAt
        
        FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    END
    
    CLOSE cascade_update_MJ_Tasks_cursor
    DEALLOCATE cascade_update_MJ_Tasks_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @ReportsID uniqueidentifier
    DECLARE @Reports_Name nvarchar(255)
    DECLARE @Reports_Description nvarchar(MAX)
    DECLARE @Reports_CategoryID uniqueidentifier
    DECLARE @Reports_UserID uniqueidentifier
    DECLARE @Reports_SharingScope nvarchar(20)
    DECLARE @Reports_ConversationID uniqueidentifier
    DECLARE @Reports_ConversationDetailID uniqueidentifier
    DECLARE @Reports_DataContextID uniqueidentifier
    DECLARE @Reports_Configuration nvarchar(MAX)
    DECLARE @Reports_OutputTriggerTypeID uniqueidentifier
    DECLARE @Reports_OutputFormatTypeID uniqueidentifier
    DECLARE @Reports_OutputDeliveryTypeID uniqueidentifier
    DECLARE @Reports_OutputFrequency nvarchar(50)
    DECLARE @Reports_OutputTargetEmail nvarchar(255)
    DECLARE @Reports_OutputWorkflowID uniqueidentifier
    DECLARE @Reports_Thumbnail nvarchar(MAX)
    DECLARE @Reports_EnvironmentID uniqueidentifier
    DECLARE cascade_update_Reports_cursor CURSOR FOR 
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_Reports_cursor
    FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @Reports_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @ReportsID, @Name = @Reports_Name, @Description = @Reports_Description, @CategoryID = @Reports_CategoryID, @UserID = @Reports_UserID, @SharingScope = @Reports_SharingScope, @ConversationID = @Reports_ConversationID, @ConversationDetailID = @Reports_ConversationDetailID, @DataContextID = @Reports_DataContextID, @Configuration = @Reports_Configuration, @OutputTriggerTypeID = @Reports_OutputTriggerTypeID, @OutputFormatTypeID = @Reports_OutputFormatTypeID, @OutputDeliveryTypeID = @Reports_OutputDeliveryTypeID, @OutputFrequency = @Reports_OutputFrequency, @OutputTargetEmail = @Reports_OutputTargetEmail, @OutputWorkflowID = @Reports_OutputWorkflowID, @Thumbnail = @Reports_Thumbnail, @EnvironmentID = @Reports_EnvironmentID
        
        FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    END
    
    CLOSE cascade_update_Reports_cursor
    DEALLOCATE cascade_update_Reports_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a338aafe-a046-42c4-8ce8-657c8b0f3887'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'DefaultStorageProvider')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a338aafe-a046-42c4-8ce8-657c8b0f3887',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            100027,
            'DefaultStorageProvider',
            'Default Storage Provider',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ca63582b-f29e-47e3-86a5-f2b4c2292085'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'AttachmentStorageProvider')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ca63582b-f29e-47e3-86a5-f2b4c2292085',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100122,
            'AttachmentStorageProvider',
            'Attachment Storage Provider',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b35c64cb-7ec6-4396-bda1-59f9f28eed58'  OR 
               (EntityID = '01248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultInputModality')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b35c64cb-7ec6-4396-bda1-59f9f28eed58',
            '01248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: AI Model Types
            100015,
            'DefaultInputModality',
            'Default Input Modality',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6d6d28b3-c88c-40bd-abe8-a30d2a81420a'  OR 
               (EntityID = '01248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DefaultOutputModality')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6d6d28b3-c88c-40bd-abe8-a30d2a81420a',
            '01248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: AI Model Types
            100016,
            'DefaultOutputModality',
            'Default Output Modality',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd49be694-7ffb-45ce-8df5-860fe7dd0e14'  OR 
               (EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54' AND Name = 'Agent')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd49be694-7ffb-45ce-8df5-860fe7dd0e14',
            '72AC67C3-5FD0-4320-AB49-813697181A54', -- Entity: MJ: AI Agent Modalities
            100019,
            'Agent',
            'Agent',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ae1836b2-502d-4f0f-9ae7-82e1fb43bc1f'  OR 
               (EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54' AND Name = 'Modality')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ae1836b2-502d-4f0f-9ae7-82e1fb43bc1f',
            '72AC67C3-5FD0-4320-AB49-813697181A54', -- Entity: MJ: AI Agent Modalities
            100020,
            'Modality',
            'Modality',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4d116a0f-0524-41e9-ab0d-99b34ddae884'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'Model')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4d116a0f-0524-41e9-ab0d-99b34ddae884',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100027,
            'Model',
            'Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f45f9eec-57af-4bfe-9d4f-5d9e28d4d70f'  OR 
               (EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7' AND Name = 'Modality')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f45f9eec-57af-4bfe-9d4f-5d9e28d4d70f',
            'E857C741-5B84-4012-8C19-821FC0246EE7', -- Entity: MJ: AI Model Modalities
            100028,
            'Modality',
            'Modality',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e11c31d2-5da2-48c7-8b8d-b99bba0a28f3'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = 'ParentArchitecture')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e11c31d2-5da2-48c7-8b8d-b99bba0a28f3',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100021,
            'ParentArchitecture',
            'Parent Architecture',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5f962862-1e91-4b97-8354-1c27396279fa'  OR 
               (EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF' AND Name = 'RootParentArchitectureID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5f962862-1e91-4b97-8354-1c27396279fa',
            '4F35743A-2413-47FB-9A36-B5BECB038BBF', -- Entity: MJ: AI Architectures
            100022,
            'RootParentArchitectureID',
            'Root Parent Architecture ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3de5da37-c80c-406a-9765-41d0ff125f54'  OR 
               (EntityID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A' AND Name = 'Model')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3de5da37-c80c-406a-9765-41d0ff125f54',
            '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', -- Entity: MJ: AI Model Architectures
            100017,
            'Model',
            'Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e880a93e-69c5-4794-8aba-aa51ec0b1b5a'  OR 
               (EntityID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A' AND Name = 'Architecture')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e880a93e-69c5-4794-8aba-aa51ec0b1b5a',
            '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', -- Entity: MJ: AI Model Architectures
            100018,
            'Architecture',
            'Architecture',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ed84fd05-9694-4816-82f5-1664e8ee0da1'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'ConversationDetail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ed84fd05-9694-4816-82f5-1664e8ee0da1',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100031,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0823cfa2-d5fb-4ff6-9f2f-bb8269fead3d'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'Modality')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0823cfa2-d5fb-4ff6-9f2f-bb8269fead3d',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100032,
            'Modality',
            'Modality',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8d926fa8-6da2-435b-8b5f-079bfd0e0fc8'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'File')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8d926fa8-6da2-435b-8b5f-079bfd0e0fc8',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100033,
            'File',
            'File',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '209183BC-5B3D-4264-8268-F62E75CD1052'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '209183BC-5B3D-4264-8268-F62E75CD1052'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3470A40E-7F60-49AA-8674-D72D88E2139E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '56FF2430-05FF-41DD-942F-D5A8E51E2153'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E11C31D2-5DA2-48C7-8B8D-B99BBA0A28F3'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '209183BC-5B3D-4264-8268-F62E75CD1052'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3470A40E-7F60-49AA-8674-D72D88E2139E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5040EAE0-E69B-42C0-96A8-7B04A2894D5B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E11C31D2-5DA2-48C7-8B8D-B99BBA0A28F3'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '044317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '044317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B35C64CB-7EC6-4396-BDA1-59F9F28EED58'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6D6D28B3-C88C-40BD-ABE8-A30D2A81420A'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '044317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B35C64CB-7EC6-4396-BDA1-59F9F28EED58'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6D6D28B3-C88C-40BD-ABE8-A30D2A81420A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '25C9E89A-F411-4205-A031-E0A8C35E63BD'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '25C9E89A-F411-4205-A031-E0A8C35E63BD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5516DAE6-EF96-411C-B7AA-9C20B9006577'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F885F179-DFA5-4B9A-BDB6-6BFB0DC90601'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '25C9E89A-F411-4205-A031-E0A8C35E63BD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D0CAF45E-4B1B-4BB6-80B7-A49631AF0F96'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F885F179-DFA5-4B9A-BDB6-6BFB0DC90601'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8261D630-2560-4C03-BE14-C8A9682ABBB4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'AE1836B2-502D-4F0F-9AE7-82E1FB43BC1F'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '632482BE-DDE3-4453-A654-207ED2D2A77D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '235C396F-AD49-4D5E-B4FB-8DB83715AD8D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '114F8969-80AB-4F7A-BED9-A2F3E35F338D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B0B96659-1192-4F3B-A7CA-DBA2DBF84E99'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D49BE694-7FFB-45CE-8DF5-860FE7DD0E14'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AE1836B2-502D-4F0F-9AE7-82E1FB43BC1F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '632482BE-DDE3-4453-A654-207ED2D2A77D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D49BE694-7FFB-45CE-8DF5-860FE7DD0E14'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AE1836B2-502D-4F0F-9AE7-82E1FB43BC1F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '034317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '585817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '595817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '044317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '054317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Default Modality',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Input Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C0BAE356-2818-4B55-9737-5BFA97225462'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Default Modality',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Output Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E5F9F7F-708F-4595-9F32-5F0574F25F01'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Default Modality',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Input Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B35C64CB-7EC6-4396-BDA1-59F9F28EED58'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Default Modality',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Output Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D6D28B3-C88C-40BD-ABE8-A30D2A81420A'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6c82f0c5-2473-40ab-895a-eca8627c8c81', '01248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Default Modality":{"icon":"fa fa-sliders-h","description":"Default input and output modalities that apply to this AI model type"},"System Metadata":{"icon":"fa fa-cog","description":""},"Model Information":{"icon":"fa fa-info-circle","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Default Modality":"fa fa-sliders-h","System Metadata":"fa fa-cog","Model Information":"fa fa-info-circle"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '01248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 12 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C4BCA1F9-704F-4A91-AD98-2BCC03F3A759'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A5B0DA8-9043-4BB1-A250-880B38D0A269'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9941B62D-E34F-457C-9CEE-8735417B9D81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Architecture',
       GeneratedFormSection = 'Category',
       DisplayName = 'Architecture Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '209183BC-5B3D-4264-8268-F62E75CD1052'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Architecture',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84BC5AA1-628A-4EF2-91D0-05C6A5B5982C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Core Architecture',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3470A40E-7F60-49AA-8674-D72D88E2139E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Architecture ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C3C2828-9D9E-4C9B-876C-B634FBF562D3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Architecture',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E11C31D2-5DA2-48C7-8B8D-B99BBA0A28F3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent Architecture ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5F962862-1E91-4B97-8354-1C27396279FA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Publication & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Wikipedia URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '18D14344-FFD2-495B-8C01-2B19247DBFBC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Publication & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Year Introduced',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '56FF2430-05FF-41DD-942F-D5A8E51E2153'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Publication & References',
       GeneratedFormSection = 'Category',
       DisplayName = 'Key Paper',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5040EAE0-E69B-42C0-96A8-7B04A2894D5B'
   AND AutoUpdateCategory = 1

/* Set categories for 14 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '88E41CB0-F013-4493-8CEF-5145918AC6D7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '25C9E89A-F411-4205-A031-E0A8C35E63BD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D0CAF45E-4B1B-4BB6-80B7-A49631AF0F96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Default',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5516DAE6-EF96-411C-B7AA-9C20B9006577'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F885F179-DFA5-4B9A-BDB6-6BFB0DC90601'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Prompt for Context Compression ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C9C04C8-4778-48D6-A1BE-D85D8381DC4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Prompt for Context Summarization ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6686738D-6185-4899-AED0-2295F02D5F75'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Prompt for Context Compression',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '335ADD17-B5D8-4702-AD59-FC2C287F119B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Prompt for Context Summarization',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6AB184FD-B925-4533-B2F9-6FF29030D036'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Storage Provider ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '303B2C68-A58D-468D-9CD3-766922EF93B6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Storage Root Path',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4AA505E8-7E1C-4EC9-8462-D70F60200CB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Storage Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A338AAFE-A046-42C4-8CE8-657C8B0F3887'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '18266A8C-DFEE-4658-99C6-9B8D49667F27'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '484D0280-C551-4A7B-A0EA-ADF3A098DFD0'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-robot */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-robot',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '4F35743A-2413-47FB-9A36-B5BECB038BBF'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('70b5deb6-2093-4f78-8f68-c46e642a3183', '4F35743A-2413-47FB-9A36-B5BECB038BBF', 'FieldCategoryInfo', '{"Core Architecture":{"icon":"fa fa-cogs","description":"Fundamental details of each AI architecture such as name, description, and overall category"},"Hierarchy":{"icon":"fa fa-sitemap","description":"Parent‑child relationships linking architectures to their variants and root families"},"Publication & References":{"icon":"fa fa-book","description":"Reference information like introduction year, key research paper, and external Wikipedia link"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields including the primary identifier and creation/modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('f1e43b0f-46ed-4b23-93f2-87c3ce887bbc', '4F35743A-2413-47FB-9A36-B5BECB038BBF', 'FieldCategoryIcons', '{"Core Architecture":"fa fa-cogs","Hierarchy":"fa fa-sitemap","Publication & References":"fa fa-book","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '4F35743A-2413-47FB-9A36-B5BECB038BBF'
         

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ec3b691b-b909-4a50-920f-4d5621b1f0e8', '6AE1BBF0-2085-4D2F-B724-219DC4212026', 'FieldCategoryInfo', '{"Basic Information":{"icon":"fa fa-id-card","description":""},"Configuration Settings":{"icon":"fa fa-sliders-h","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Basic Information":"fa fa-id-card","Configuration Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Reference',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8E3739C2-5404-4C28-ABE1-412720D055A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Reference',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4EF381E2-6D7B-4228-B79F-C1B4D07A4276'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Reference',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D49BE694-7FFB-45CE-8DF5-860FE7DD0E14'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Modality Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '397D3A42-8AE2-43DB-9997-C444C6FBD656'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Modality Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AE1836B2-502D-4F0F-9AE7-82E1FB43BC1F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Modality Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Direction',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '632482BE-DDE3-4453-A654-207ED2D2A77D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Modality Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allowed',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '235C396F-AD49-4D5E-B4FB-8DB83715AD8D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Modality Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Size (Bytes)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '114F8969-80AB-4F7A-BED9-A2F3E35F338D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Modality Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Count Per Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B0B96659-1192-4F3B-A7CA-DBA2DBF84E99'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '30434E8F-87AC-42B6-B448-C36DB46777A3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '74F4EAF9-6697-4079-88BA-4C508303DFE4'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-robot */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-robot',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '72AC67C3-5FD0-4320-AB49-813697181A54'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b42c4f09-387e-474e-ad4b-f2e44ce9047d', '72AC67C3-5FD0-4320-AB49-813697181A54', 'FieldCategoryInfo', '{"Agent Reference":{"icon":"fa fa-user","description":"Identifiers that associate a configuration record with a specific AI agent"},"Modality Configuration":{"icon":"fa fa-sliders-h","description":"Settings that define modality direction, allowance, and size/count limits for the agent"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields tracking creation and modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('16fc9e82-a02b-4e48-a993-337306b7ace5', '72AC67C3-5FD0-4320-AB49-813697181A54', 'FieldCategoryIcons', '{"Agent Reference":"fa fa-user","Modality Configuration":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '72AC67C3-5FD0-4320-AB49-813697181A54'
         

/* Set categories for 62 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA64DA98-1DA1-4525-8CC5-BC3E3E4893B6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Logo URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '77845738-5781-458B-AD3C-5DAE745373C2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '353D4710-73B2-4AF5-8A93-9DC1F47FF6E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3177830D-10A0-4003-B95D-8514974BA846'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A6F8773F-4021-45DD-B142-9BFE4F67EC87'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expose As Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF61AC7C-79A7-4058-96A1-85EBA9339D45'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Execution Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '090830CE-4073-486C-BBF2-E2105BEADD91'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Execution Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8261D630-2560-4C03-BE14-C8A9682ABBB4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Enable Context Compression',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '09AFE563-63E3-4F2B-B6F1-5945432FF07B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Message Threshold',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '451D5C8F-6749-4789-A158-658B38A74AE4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FFD209C5-48F3-45D1-9094-E76EC832EA07'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Message Retention Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73A50D68-976F-49A7-9737-12D1D26C6011'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Prompt Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD36EF69-1494-409C-A97E-FE73669DD28A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '91CA077D-3F59-48E1-A593-AF8686276115'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BB9AD9CB-40C0-41F1-B54B-750C844FD41B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E3E05E29-CDAF-4BFE-9FC8-4450EEBE05E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model Selection Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FEEBD49D-5572-45D7-9F1E-08AE762F41D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Downstream Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '85B6AA86-796D-4970-9E35-5A483498B517'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Upstream Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA784B76-66CD-434B-90BD-DEC808917E68'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Self Read Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EBF3B958-F07C-420B-82BE-2CB1E396A0F5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Self Write Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '61E51FC3-8EFA-40D9-9525-F3FAD0A95DCA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2E542986-0164-4B9E-8457-06826A4AB892'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C7959AE-F48B-4858-8383-28C3F4706314'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8931DE12-4048-4DEB-A2A3-E821354CFFB2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation Max Retries',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF62DAAB-74D4-4539-9B47-58DD4A023E4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Starting Payload Validation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B7A2371C-A22C-48EA-827E-824F8A40DA3D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Starting Payload Validation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0947203D-A5CA-4ED2-895B-17A8007323FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inject Notes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '37E075BD-CC4B-4AE1-8D12-7EC45B663F69'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Notes To Inject',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A8DA4C67-B2F7-4C1D-8522-A2B5B4BADA21'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Note Injection Strategy',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F5F6BE87-06F4-404D-A1C3-B315C562C32B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inject Examples',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C9957C7-A851-4C05-83B3-F49A5FC3FE4D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Examples To Inject',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DDEE3E91-4B0D-4264-9EF1-ACAAB8D105E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Example Injection Strategy',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '291FEE7A-1245-4C82-A470-07EEB8847F1E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Cost Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '23850C5A-311A-4271-AE53-BD36921C5AA5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Tokens Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C5F8BB50-DC10-4DFC-AC45-8613C152EE94'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Iterations Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3FA6B9F3-60BC-4631-8EB4-7ED0D04844C4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Time Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E64A4FF8-BAD5-491C-9D8D-E5E70378ED67'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Min Executions Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BCCCA2DC-8A15-4701-98E2-337FB60B463A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Executions Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F0CCA759-DEA4-4F61-B233-C632EE9317E1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Prompt Effort Level',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DCBAEEFD-C5A2-449D-A4B9-EAB1290C2F89'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Chat Handling Option',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '445C1618-EADB-4B34-B318-40C662141FE1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Messages',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F8924303-D53A-43B0-B70F-5B74FA6248D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Storage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Attachment Storage Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B5A24CC-1BC2-40E3-B83E-C8E164E6CFED'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Storage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Attachment Root Path',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BA112220-B0D8-4C6F-B63A-027EB706B132'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Storage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inline Storage Threshold (Bytes)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EC3D6539-FAF4-49B7-9A9B-6327249C9D06'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Storage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Attachment Storage Provider Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CA63582B-F29E-47E3-86A5-F2B4C2292085'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '52E74C81-D246-4B52-B7A7-91757C299671'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '644AA4B2-1044-430C-BCBA-245644294E02'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Invocation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Artifact Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F58EA638-CE95-4D2A-9095-9909149B83C7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Owner User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact Creation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4371BED0-7C4A-4D24-9E07-17E15D617607'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Functional Requirements',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F613597C-C38F-4D71-B64A-8BBCFD87D8CC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Technical Design',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CAEA2872-B089-4192-8FA8-1737FF357FFD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Restricted',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E5B17B79-282F-4F19-9656-246DE119D588'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Artifact Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C1C76DF-BBFF-4903-9BB9-3325B5ABB4B1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Owner User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('de3f14b8-0e62-4350-8da5-43b19bd79f45', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'FieldCategoryInfo', '{"Attachment Storage":{"icon":"fa fa-paperclip","description":"Configuration for handling large attachment files, including storage provider, root path, and inline size threshold."},"Agent Identity & Presentation":{"icon":"fa fa-id-card","description":""},"Hierarchy & Invocation":{"icon":"fa fa-sitemap","description":""},"Runtime Limits & Execution Settings":{"icon":"fa fa-tachometer-alt","description":""},"Payload & Data Flow":{"icon":"fa fa-exchange-alt","description":""},"Context Compression":{"icon":"fa fa-compress","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Attachment Storage":"fa fa-paperclip","Agent Identity & Presentation":"fa fa-id-card","Hierarchy & Invocation":"fa fa-sitemap","Runtime Limits & Execution Settings":"fa fa-tachometer-alt","Payload & Data Flow":"fa fa-exchange-alt","Context Compression":"fa fa-compress"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '4D116A0F-0524-41E9-AB0D-99B34DDAE884'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C35DE250-CEA2-41DA-B8E8-F737D60DA547'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F436C057-41BA-4546-A2EA-BF348C28F34A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6685F426-E918-4449-B685-079AB4B09389'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4D116A0F-0524-41E9-AB0D-99B34DDAE884'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F45F9EEC-57AF-4BFE-9D4F-5D9E28D4D70F'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C35DE250-CEA2-41DA-B8E8-F737D60DA547'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0C8C9BB4-671D-4B92-A2D8-26988566F31A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4D116A0F-0524-41E9-AB0D-99B34DDAE884'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F45F9EEC-57AF-4BFE-9D4F-5D9E28D4D70F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B90D9EE5-DEA3-496A-B389-750B1B982EF6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B90D9EE5-DEA3-496A-B389-750B1B982EF6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6B77376B-30E4-41D7-8935-350D04A6DFF5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '20A05CA6-1FA8-4028-93D4-00C05854FCEF'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '62288AA7-F5EF-4BB7-B185-4A83EAD76DD1'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B90D9EE5-DEA3-496A-B389-750B1B982EF6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6B77376B-30E4-41D7-8935-350D04A6DFF5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '20A05CA6-1FA8-4028-93D4-00C05854FCEF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4D3F2352-495E-4652-9400-56E69E8C164D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '62288AA7-F5EF-4BB7-B185-4A83EAD76DD1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3DE5DA37-C80C-406A-9765-41D0FF125F54'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CB694153-6B47-4939-9DF6-21E5186F9B21'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '66DBE74E-1D77-4489-8B2F-8873662D191D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3DE5DA37-C80C-406A-9765-41D0FF125F54'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E880A93E-69C5-4794-8ABA-AA51EC0B1B5A'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3DE5DA37-C80C-406A-9765-41D0FF125F54'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E880A93E-69C5-4794-8ABA-AA51EC0B1B5A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B7A7E938-5000-4966-A2CC-5BB754C01C0E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4C2BADF2-E72C-4497-BF1C-B624A7171BCB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B7A7E938-5000-4966-A2CC-5BB754C01C0E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '19373787-EAC3-4454-BEAC-0E687861368A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5C63E41C-9D73-448E-A9D6-5BC925282823'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0823CFA2-D5FB-4FF6-9F2F-BB8269FEAD3D'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4C2BADF2-E72C-4497-BF1C-B624A7171BCB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B7A7E938-5000-4966-A2CC-5BB754C01C0E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'ED84FD05-9694-4816-82F5-1664E8EE0DA1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0823CFA2-D5FB-4FF6-9F2F-BB8269FEAD3D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '27A7C22C-CBE3-42D1-8A90-C62930CA94D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Modality Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B90D9EE5-DEA3-496A-B389-750B1B982EF6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Modality Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6B77376B-30E4-41D7-8935-350D04A6DFF5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Modality Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Content Block Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '20A05CA6-1FA8-4028-93D4-00C05854FCEF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Modality Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '62288AA7-F5EF-4BB7-B185-4A83EAD76DD1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Modality Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Display Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B205800D-88C6-4F6F-BF92-E8D4E858B274'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Constraints',
       GeneratedFormSection = 'Category',
       DisplayName = 'MIME Type Pattern',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D3F2352-495E-4652-9400-56E69E8C164D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Constraints',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Max Size (Bytes)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F751910E-DD8B-4E27-A04F-373528D9A9B2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Constraints',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Max Count Per Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A9289FE9-1547-4E64-A448-20C1340478DC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0CB06CF7-CA2A-455F-8A88-7E1438F4655B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6460A64F-20B6-485E-8DE9-BF4A09B1EE08'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-brain */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-brain',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('5ee2269b-8e27-4d37-bc1d-eb0955815efa', '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', 'FieldCategoryInfo', '{"Modality Definition":{"icon":"fa fa-cube","description":"Core properties defining each AI modality, such as name, description, content block type, classification, and display order."},"Technical Constraints":{"icon":"fa fa-cogs","description":"Technical limits and validation rules for the modality, including MIME type patterns and size/count restrictions."},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields and record identifiers."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ba99c37c-555f-42d1-9ced-6a4d3a4403b3', '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', 'FieldCategoryIcons', '{"Modality Definition":"fa fa-cube","Technical Constraints":"fa fa-cogs","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D'
         

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7EBC4186-37C5-433D-8196-4AE49DD8A42A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model & Modality Link',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4DBE2B92-0104-4DA3-814F-C592EC07CBED'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model & Modality Link',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BD1DBDD9-D9D8-4B88-800C-DFF9823228B8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Capability Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Direction',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C35DE250-CEA2-41DA-B8E8-F737D60DA547'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Capability Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Supported',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F436C057-41BA-4546-A2EA-BF348C28F34A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Capability Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Required',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6685F426-E918-4449-B685-079AB4B09389'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Constraints',
       GeneratedFormSection = 'Category',
       DisplayName = 'Supported Formats',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0C8C9BB4-671D-4B92-A2D8-26988566F31A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Constraints',
       GeneratedFormSection = 'Category',
       DisplayName = 'Maximum Size (Bytes)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '03AB0E22-44FC-467A-B30C-BBAA80FF0C5D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Constraints',
       GeneratedFormSection = 'Category',
       DisplayName = 'Maximum Count per Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '574ED7D9-B548-406A-BDC7-B4BDD48FF364'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Constraints',
       GeneratedFormSection = 'Category',
       DisplayName = 'Maximum Dimension (px)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F37CFE3C-8137-44A6-871B-B9FA2D161E03'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Technical Constraints',
       GeneratedFormSection = 'Category',
       DisplayName = 'Comments',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EF4EF7A8-2F95-4E57-920D-1E6DCC46EC5E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '12E86736-9896-41F5-B6F1-BDAA0BCBED87'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '64E54342-E690-4C25-8A20-AADF2F7EC570'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model & Modality Link',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D116A0F-0524-41E9-AB0D-99B34DDAE884'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model & Modality Link',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F45F9EEC-57AF-4BFE-9D4F-5D9E28D4D70F'
   AND AutoUpdateCategory = 1

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '78200FE4-D308-41B7-9305-3ED80A72C52B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '92F09043-E453-482B-AA52-4A99011486CC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '149B2825-A58E-4D3A-8F31-220C6F5AE3CC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model‑Architecture Link',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '90AAD825-EC7E-4537-B0CE-1558AD0313DB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model‑Architecture Link',
       GeneratedFormSection = 'Category',
       DisplayName = 'Architecture',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '99E524B7-2A2D-42B3-808D-498EA904AD7B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model‑Architecture Link',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3DE5DA37-C80C-406A-9765-41D0FF125F54'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Model‑Architecture Link',
       GeneratedFormSection = 'Category',
       DisplayName = 'Architecture Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E880A93E-69C5-4794-8ABA-AA51EC0B1B5A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contribution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Rank',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CB694153-6B47-4939-9DF6-21E5186F9B21'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contribution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Weight',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '66DBE74E-1D77-4489-8B2F-8873662D191D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Contribution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ADD78423-F152-4706-89AE-44FBAE35702A'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-brain */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-brain',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A'
               

/* Set entity icon to fa fa-brain */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-brain',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'E857C741-5B84-4012-8C19-821FC0246EE7'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8370fc34-ee19-41da-aa58-3d411a9b390a', '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', 'FieldCategoryInfo', '{"Model‑Architecture Link":{"icon":"fa fa-link","description":"Links AI models to their underlying architectures, including identifiers and display names"},"Contribution Settings":{"icon":"fa fa-sliders-h","description":"Defines ranking, weight, and notes for each architecture''s contribution to a model"},"System Metadata":{"icon":"fa fa-cog","description":"Audit fields tracking creation and modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('eca67596-4714-4598-adec-18920d6a161b', 'E857C741-5B84-4012-8C19-821FC0246EE7', 'FieldCategoryInfo', '{"Model & Modality Link":{"icon":"fa fa-link","description":"Associates a specific AI model with a modality, including identifiers and display names"},"Capability Settings":{"icon":"fa fa-toggle-on","description":"Defines support status, direction (input/output), and requirement flag for the modality"},"Technical Constraints":{"icon":"fa fa-sliders-h","description":"Model‑specific limits such as formats, size, count, dimension, and additional notes"},"System Metadata":{"icon":"fa fa-cog","description":"Audit fields tracking creation and modification timestamps and primary identifier"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('23128af7-ac30-4aed-bd2b-90d3c19026d3', '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A', 'FieldCategoryIcons', '{"Model‑Architecture Link":"fa fa-link","Contribution Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('89f5ffc1-7b75-40cf-ad8c-bfc37f766a59', 'E857C741-5B84-4012-8C19-821FC0246EE7', 'FieldCategoryIcons', '{"Model & Modality Link":"fa fa-link","Capability Settings":"fa fa-toggle-on","Technical Constraints":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: junction, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '435976AD-F4BA-4FFA-A5F5-C2D901B6C15A'
         

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'E857C741-5B84-4012-8C19-821FC0246EE7'
         

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C461DE0-D8B1-4ECA-8924-89322F1CDAB6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E48FFA14-4B4C-42EA-8E7B-F74C0ADFFA40'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F34C1F6F-E865-4F5C-BB3F-8E2BD0042747'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F67B3F45-A45F-4F0C-A16C-939B1EF783B2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F304BC3-EA6B-41F3-BAE0-DB21B733A022'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0823CFA2-D5FB-4FF6-9F2F-BB8269FEAD3D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail Text',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ED84FD05-9694-4816-82F5-1664E8EE0DA1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'MIME Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4C2BADF2-E72C-4497-BF1C-B624A7171BCB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'File Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B7A7E938-5000-4966-A2CC-5BB754C01C0E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'File Size (bytes)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '19373787-EAC3-4454-BEAC-0E687861368A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Display Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C63E41C-9D73-448E-A9D6-5BC925282823'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Properties',
       GeneratedFormSection = 'Category',
       DisplayName = 'Width (px)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '68BD96DE-8EE4-44F0-B7EF-50317EEA952B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Properties',
       GeneratedFormSection = 'Category',
       DisplayName = 'Height (px)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AAB63CA9-D634-4075-8077-E07F273CDFEF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Properties',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (seconds)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2435AE2F-E39F-4654-8EEE-363F9E3BF282'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Properties',
       GeneratedFormSection = 'Category',
       DisplayName = 'Thumbnail (Base64)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8F7049B2-DBF7-47BB-88EE-89F8C5220297'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inline Data (Base64)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1BE8E682-9EE8-4B4F-8587-56786D5A25FF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'File',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E6FB5C5E-7E62-4ED8-BD35-00DC7078D96B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'File Reference',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8D926FA8-6DA2-435B-8B5F-079BFD0E0FC8'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-paperclip */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-paperclip',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c91921fd-5865-4439-88aa-9f39c0dd8782', '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', 'FieldCategoryInfo', '{"Attachment Metadata":{"icon":"fa fa-paperclip","description":"Core information that identifies and describes the attachment, its type, and ordering within a conversation message"},"Media Properties":{"icon":"fa fa-image","description":"Technical characteristics of visual or audio media such as dimensions, duration, and preview thumbnail"},"Storage Details":{"icon":"fa fa-database","description":"How the attachment content is stored, either inline as Base64 or via a reference to external storage"},"System Metadata":{"icon":"fa fa-cog","description":"Audit and system‑managed fields tracking creation, updates, and the internal record identifier"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('1b8e4e52-7086-4d9d-9423-c8a3b1ddff16', '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', 'FieldCategoryIcons', '{"Attachment Metadata":"fa fa-paperclip","Media Properties":"fa fa-image","Storage Details":"fa fa-database","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3'
         

/* Generated Validation Functions for MJ: AI Model Architectures */
-- CHECK constraint for MJ: AI Model Architectures: Field: Rank was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([Rank]>(0))', 'public ValidateRankGreaterThanZero(result: ValidationResult) {
	if (this.Rank <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Rank",
			"Rank must be greater than 0.",
			this.Rank,
			ValidationErrorType.Failure
		));
	}
}', 'Rank must be greater than zero, ensuring that every item has a positive ranking value.', 'ValidateRankGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'CB694153-6B47-4939-9DF6-21E5186F9B21');
  
            -- CHECK constraint for MJ: AI Model Architectures: Field: Weight was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([Weight] IS NULL OR [Weight]>=(0) AND [Weight]<=(1))', 'public ValidateWeightRange(result: ValidationResult) {
	// Ensure Weight is within the allowed range when it is provided
	if (this.Weight != null && (this.Weight < 0 || this.Weight > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"Weight",
			"Weight must be between 0 and 1.",
			this.Weight,
			ValidationErrorType.Failure
		));
	}
}', 'Weight must be between 0 and 1 when a value is provided; if no weight is entered, it may be left empty.', 'ValidateWeightRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '66DBE74E-1D77-4489-8B2F-8873662D191D');
  
            

/* Generated Validation Functions for MJ: Conversation Detail Attachments */
-- CHECK constraint for MJ: Conversation Detail Attachments @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '8E1BADD5-D593-4F9B-90D4-BF6D8AFA74A0', GETUTCDATE(), 'TypeScript','Approved', '([InlineData] IS NOT NULL OR [FileID] IS NOT NULL)', 'public ValidateInlineDataOrFileIDPresence(result: ValidationResult) {
	// Ensure that at least one source of content is supplied
	if (this.InlineData == null && this.FileID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"InlineDataOrFileID",
			"Either InlineData or FileID must be provided; both cannot be empty.",
			null,
			ValidationErrorType.Failure
		));
	}
}', 'Each record must include content either directly (InlineData) or by reference (FileID); they cannot both be empty.', 'ValidateInlineDataOrFileIDPresence', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3');
  
            

