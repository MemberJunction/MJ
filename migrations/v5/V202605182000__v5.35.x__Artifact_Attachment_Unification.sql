-- Artifact / Attachment Unification
--
-- Schema for unifying the two parallel file-delivery paths in MJ's AI agent
-- runtime (ConversationDetailAttachment inline embedding vs.
-- ConversationArtifactVersion + tool dispatch). See
-- plans/artifact-attachment-unification.md for the design.
--
-- All additions are additive (defaults preserve existing behavior):
--
-- ArtifactType:
--   Priority             — deterministic tiebreaker for MIME pattern resolution
--   DefaultDeliveryMode  — Inline vs ToolsOnly delivery policy per type
--   SystemSupplied       — distinguishes shipped defaults from org customizations
--
-- ArtifactVersion:
--   ForceToolsOnly       — one-way per-instance opt-out of inline delivery
--                          (lives on ArtifactVersion alongside MimeType/FileID/
--                          ContentSizeBytes, where the resolver routes from)
--
-- AIAgent:
--   AcceptUnregisteredFiles — per-agent opt-in to a Generic Binary fallback for
--                             MIME types outside the registered Artifact Type set
--
-- ConversationDetailAttachment:
--   ArtifactVersionID    — FK to the ArtifactVersion created alongside this
--                          attachment by the storage-unification path. Set when
--                          attachments are written through the unified service;
--                          NULL for pre-unification rows. Lets the resolver
--                          skip attachments that already have an artifact path.
--
-- Seed data (new system Artifact Type rows: Image, Audio, Video, XML, CSV,
-- Generic Text, Generic Binary; plus DefaultDeliveryMode/SystemSupplied values
-- for existing rows) lives in /metadata/artifact-types/ and is applied via
-- `mj sync push`, not this migration.

ALTER TABLE ${flyway:defaultSchema}.ArtifactType
    ADD Priority INT NOT NULL CONSTRAINT DF_ArtifactType_Priority DEFAULT 0,
        DefaultDeliveryMode NVARCHAR(20) NOT NULL CONSTRAINT DF_ArtifactType_DefaultDeliveryMode DEFAULT 'ToolsOnly'
            CONSTRAINT CK_ArtifactType_DefaultDeliveryMode CHECK (DefaultDeliveryMode IN ('Inline', 'ToolsOnly')),
        SystemSupplied BIT NOT NULL CONSTRAINT DF_ArtifactType_SystemSupplied DEFAULT 0;
GO

ALTER TABLE ${flyway:defaultSchema}.ArtifactVersion
    ADD ForceToolsOnly BIT NOT NULL CONSTRAINT DF_ArtifactVersion_ForceToolsOnly DEFAULT 0;
GO

ALTER TABLE ${flyway:defaultSchema}.AIAgent
    ADD AcceptUnregisteredFiles BIT NOT NULL CONSTRAINT DF_AIAgent_AcceptUnregisteredFiles DEFAULT 0;
GO

ALTER TABLE ${flyway:defaultSchema}.ConversationDetailAttachment
    ADD ArtifactVersionID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_ConversationDetailAttachment_ArtifactVersion
            REFERENCES ${flyway:defaultSchema}.ArtifactVersion(ID);
GO

-- Extended properties

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Deterministic tiebreaker when multiple Artifact Types match the same MIME pattern. Higher values win. Within a specificity tier (exact > subtype-wildcard), the resolver sorts by Priority desc, then SystemSupplied = false beats SystemSupplied = true, then lowest ID wins.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactType',
    @level2type = N'COLUMN', @level2name = N'Priority';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How artifacts of this type are delivered to the LLM by default. Inline: emitted as an inline content block (image_url, audio_url, small text, etc.) when the model supports the modality and the size is under the inline cap. ToolsOnly: never inlined; the agent reaches the bytes only through tool calls (get_full, library-specific tools). Per-instance override is one-way via ConversationArtifactVersion.ForceToolsOnly — an instance can opt out of inline but never opt in when the type default is ToolsOnly.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactType',
    @level2type = N'COLUMN', @level2name = N'DefaultDeliveryMode';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'True for Artifact Types shipped as part of the MemberJunction default registry (JSON, PDF, Office variants, Image/Audio/Video, Generic Text, Generic Binary). False for user/org-supplied customizations. Used as a tiebreaker in MIME pattern resolution: user customizations win over shipped defaults at equal Priority.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactType',
    @level2type = N'COLUMN', @level2name = N'SystemSupplied';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'One-way override that forces this artifact version to be delivered via tools regardless of the Artifact Type''s DefaultDeliveryMode. When true, the resolver never emits an inline content block for this version. There is no inverse override — an instance cannot be widened from ToolsOnly to Inline. Default false.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactVersion',
    @level2type = N'COLUMN', @level2name = N'ForceToolsOnly';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-agent opt-in to a Generic Binary fallback for file uploads whose MIME type does not match any registered Artifact Type. When false (default), unrecognized uploads are rejected at upload time with an actionable error. When true, unrecognized uploads resolve to the Generic Binary artifact type, exposing only get_full and get_metadata tools. Scoped per agent — there is no system-wide global flag.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'AcceptUnregisteredFiles';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the ArtifactVersion created alongside this attachment by the storage-unification path. When set, the agent resolver routes via the artifact path (manifest + tool dispatch) and skips inline embedding of the attachment to avoid double-processing. NULL for pre-v5.35 attachment rows authored before storage unification.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = N'ArtifactVersionID';
GO

