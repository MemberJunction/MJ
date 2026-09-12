-- =====================================================================================
-- AI Personas Schema Foundation
-- =====================================================================================
-- Introduces core presentation identity modeling for MemberJunction AI:
-- 1. AIPersona: Abstract, provider-agnostic presentational identity (voice / avatar)
-- 2. AIPersonaVendor: Concrete vendor and modality bindings with wire APIName & settings
-- 3. AIModelPersona: Per-model persona availability overrides & sequence priority
-- 4. AIAgentPersona: Agent-to-persona assignments, preferences, and style overrides
--
-- Design plan: plans/ai-model-identity.md (Part B)
-- =====================================================================================

CREATE TABLE [${flyway:defaultSchema}].[AIPersona] (
    [ID]                   UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AIPersona_ID] DEFAULT (newsequentialid()),
    [Name]                 NVARCHAR(100)    NOT NULL,
    [Description]          NVARCHAR(MAX)    NULL,
    [PerceivedGender]      NVARCHAR(50)     NULL,
    [Locale]               NVARCHAR(20)     NULL,
    [PerceivedAgeRangeMin] INT              NULL,
    [PerceivedAgeRangeMax] INT              NULL,
    [Tone]                 NVARCHAR(255)    NULL,
    [SpeakingStyle]        NVARCHAR(255)    NULL,
    [StyleDescriptors]     NVARCHAR(MAX)    NULL,
    [PreviewAudioURL]      NVARCHAR(1000)   NULL,
    [PreviewImageURL]      NVARCHAR(1000)   NULL,
    [PreviewVideoURL]      NVARCHAR(1000)   NULL,
    [Source]               NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AIPersona_Source] DEFAULT (N'BuiltIn'),
    [IsActive]             BIT              NOT NULL CONSTRAINT [DF_AIPersona_IsActive] DEFAULT (1),

    CONSTRAINT [PK_AIPersona] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_AIPersona_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_AIPersona_Source] CHECK ([Source] IN (N'BuiltIn', N'Custom', N'Cloned'))
);
GO

CREATE TABLE [${flyway:defaultSchema}].[AIPersonaVendor] (
    [ID]             UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AIPersonaVendor_ID] DEFAULT (newsequentialid()),
    [PersonaID]      UNIQUEIDENTIFIER NOT NULL,
    [VendorID]       UNIQUEIDENTIFIER NOT NULL,
    [ModalityID]     UNIQUEIDENTIFIER NOT NULL,
    [APIName]        NVARCHAR(255)    NOT NULL,
    [Status]         NVARCHAR(20)     NOT NULL CONSTRAINT [DF_AIPersonaVendor_Status] DEFAULT (N'Active'),
    [Priority]       INT              NOT NULL CONSTRAINT [DF_AIPersonaVendor_Priority] DEFAULT (0),
    [VendorSettings] NVARCHAR(MAX)    NULL,

    CONSTRAINT [PK_AIPersonaVendor] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AIPersonaVendor_Persona] FOREIGN KEY ([PersonaID])
        REFERENCES [${flyway:defaultSchema}].[AIPersona]([ID]),
    CONSTRAINT [FK_AIPersonaVendor_Vendor] FOREIGN KEY ([VendorID])
        REFERENCES [${flyway:defaultSchema}].[AIVendor]([ID]),
    CONSTRAINT [FK_AIPersonaVendor_Modality] FOREIGN KEY ([ModalityID])
        REFERENCES [${flyway:defaultSchema}].[AIModality]([ID]),
    CONSTRAINT [UQ_AIPersonaVendor_Persona_Vendor_Modality] UNIQUE ([PersonaID], [VendorID], [ModalityID]),
    CONSTRAINT [CK_AIPersonaVendor_Status] CHECK ([Status] IN (N'Active', N'Inactive', N'Deprecated', N'Preview'))
);
GO

CREATE TABLE [${flyway:defaultSchema}].[AIModelPersona] (
    [ID]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AIModelPersona_ID] DEFAULT (newsequentialid()),
    [ModelID]     UNIQUEIDENTIFIER NOT NULL,
    [PersonaID]   UNIQUEIDENTIFIER NOT NULL,
    [Sequence]    INT              NOT NULL CONSTRAINT [DF_AIModelPersona_Sequence] DEFAULT (0),
    [IsSupported] BIT              NOT NULL CONSTRAINT [DF_AIModelPersona_IsSupported] DEFAULT (1),

    CONSTRAINT [PK_AIModelPersona] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AIModelPersona_Model] FOREIGN KEY ([ModelID])
        REFERENCES [${flyway:defaultSchema}].[AIModel]([ID]),
    CONSTRAINT [FK_AIModelPersona_Persona] FOREIGN KEY ([PersonaID])
        REFERENCES [${flyway:defaultSchema}].[AIPersona]([ID]),
    CONSTRAINT [UQ_AIModelPersona_Model_Persona] UNIQUE ([ModelID], [PersonaID])
);
GO

CREATE TABLE [${flyway:defaultSchema}].[AIAgentPersona] (
    [ID]            UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AIAgentPersona_ID] DEFAULT (newsequentialid()),
    [AgentID]       UNIQUEIDENTIFIER NOT NULL,
    [PersonaID]     UNIQUEIDENTIFIER NOT NULL,
    [IsDefault]     BIT              NOT NULL CONSTRAINT [DF_AIAgentPersona_IsDefault] DEFAULT (0),
    [Sequence]      INT              NOT NULL CONSTRAINT [DF_AIAgentPersona_Sequence] DEFAULT (0),
    [IsAllowed]     BIT              NOT NULL CONSTRAINT [DF_AIAgentPersona_IsAllowed] DEFAULT (1),
    [StyleOverride] NVARCHAR(MAX)    NULL,

    CONSTRAINT [PK_AIAgentPersona] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_AIAgentPersona_Agent] FOREIGN KEY ([AgentID])
        REFERENCES [${flyway:defaultSchema}].[AIAgent]([ID]),
    CONSTRAINT [FK_AIAgentPersona_Persona] FOREIGN KEY ([PersonaID])
        REFERENCES [${flyway:defaultSchema}].[AIPersona]([ID]),
    CONSTRAINT [UQ_AIAgentPersona_Agent_Persona] UNIQUE ([AgentID], [PersonaID])
);
GO

SET QUOTED_IDENTIFIER ON;
GO

CREATE UNIQUE INDEX [UQ_AIAgentPersona_OneDefaultPerAgent]
    ON [${flyway:defaultSchema}].[AIAgentPersona] ([AgentID])
    WHERE [IsDefault] = 1;
GO

-- -------------------------------------------------------------------------------------
-- Extended Properties / Descriptions: AIPersona
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Abstract, provider-agnostic presentational identity (voice and/or visual appearance) that AI agents can assume when interacting with users.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique display name identifying this persona (e.g., Alloy, Aria, Sage). Globally unique across all sources to maintain deterministic cross-modality catalog curation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional description of the persona, its characteristics, and intended personality.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The perceived gender presentation of this persona (e.g., Male, Female, Neutral, Non-Binary).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'PerceivedGender';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'BCP 47 language and locale tag primarily associated with this persona (e.g., en-US, es-ES).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'Locale';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Approximate minimum perceived age for this persona, enabling numerical filtering.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'PerceivedAgeRangeMin';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Approximate maximum perceived age for this persona, enabling numerical filtering.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'PerceivedAgeRangeMax';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Core tonal quality for this persona (e.g., Warm, Authoritative, Enthusiastic, Calm). Injected into prompt context for conversational delivery.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'Tone';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stylistic manner of speaking (e.g., Casual and conversational, Direct and concise, Academic).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'SpeakingStyle';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Additional descriptive keywords or JSON metadata capturing nuanced personality and presentation traits.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'StyleDescriptors';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to a sample audio file demonstrating this persona''s voice.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'PreviewAudioURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to a preview avatar image for this persona.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'PreviewImageURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'URL to a preview video demonstrating this persona''s visual animation or avatar.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'PreviewVideoURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Origin of this persona: BuiltIn (provided by system/catalog), Custom (user-defined), or Cloned (derived/voice-cloned).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'Source';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this persona is currently active and available for selection.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersona',
    @level2type = N'COLUMN', @level2name = N'IsActive';

-- -------------------------------------------------------------------------------------
-- Extended Properties / Descriptions: AIPersonaVendor
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Concrete vendor and modality binding for a persona, mapping the abstract persona to a provider-specific wire asset identifier (voice ID or avatar ID).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersonaVendor';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Vendor-specific asset name or identifier passed over the wire (e.g., alloy, sage, an ElevenLabs voice_id, or a HeyGen avatar_id).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersonaVendor',
    @level2type = N'COLUMN', @level2name = N'APIName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current operational status of this vendor persona binding.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersonaVendor',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Selection priority when multiple vendor bindings qualify for a given persona and modality. Higher numbers indicate higher priority.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersonaVendor',
    @level2type = N'COLUMN', @level2name = N'Priority';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provider-specific configuration JSON (e.g., ElevenLabs stability, similarityBoost, style, useSpeakerBoost).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIPersonaVendor',
    @level2type = N'COLUMN', @level2name = N'VendorSettings';

-- -------------------------------------------------------------------------------------
-- Extended Properties / Descriptions: AIModelPersona
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Specifies per-model persona availability overrides where a model''s supported personas differ from its vendor''s default catalog.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIModelPersona';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Deterministic ordering sequence for persona priority at the model level.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIModelPersona',
    @level2type = N'COLUMN', @level2name = N'Sequence';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this persona is supported by the specific model. Set to 0 to explicitly disable an inherited vendor persona for this model.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIModelPersona',
    @level2type = N'COLUMN', @level2name = N'IsSupported';

-- -------------------------------------------------------------------------------------
-- Extended Properties / Descriptions: AIAgentPersona
-- -------------------------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Configures which personas an AI agent is permitted to wear, their preference order, and which persona serves as the agent''s default identity.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentPersona';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this persona is the default presentation for the agent when none is explicitly requested.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentPersona',
    @level2type = N'COLUMN', @level2name = N'IsDefault';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Ordering sequence for displaying available personas in user interfaces.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentPersona',
    @level2type = N'COLUMN', @level2name = N'Sequence';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the agent is allowed to use this persona. Set to 0 to explicitly disable or veto a persona.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentPersona',
    @level2type = N'COLUMN', @level2name = N'IsAllowed';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON payload overriding or refining persona presentation specifically for this agent (e.g. Tone or SpeakingStyle adjustments).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentPersona',
    @level2type = N'COLUMN', @level2name = N'StyleOverride';


















































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- =============================================================================
-- Everything below this block was produced by MemberJunction CodeGen after
-- the hand-written DDL above. It contains:
--   * Entity records for AIPersona, AIPersonaVendor, AIModelPersona, AIAgentPersona
--   * ApplicationEntity & EntityPermission grants
--   * EntityField records (apply-time dynamic Sequence)
--   * Auto-generated foreign key indexes
--   * Generated CRUD stored procedures (spCreate/spUpdate/spDelete) and update triggers
--   * Base views (vwAIPersonas, vwAIPersonaVendors, vwAIModelPersonas, vwAIAgentPersonas)
-- =============================================================================

/* SQL generated to create new entity MJ: AI Personas */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '99f3e501-8443-4c39-9d4c-77f712b1aca1',
         'MJ: AI Personas',
         'AI Personas',
         'Abstract, provider-agnostic presentational identity (voice and/or visual appearance) that AI agents can assume when interacting with users.',
         NULL,
         'AIPersona',
         'vwAIPersonas',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: AI Personas to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '99f3e501-8443-4c39-9d4c-77f712b1aca1', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Personas for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('99f3e501-8443-4c39-9d4c-77f712b1aca1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Personas for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('99f3e501-8443-4c39-9d4c-77f712b1aca1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Personas for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('99f3e501-8443-4c39-9d4c-77f712b1aca1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: AI Persona Vendors */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '635c7c9a-7bbb-4836-aa19-3e54963e2821',
         'MJ: AI Persona Vendors',
         'AI Persona Vendors',
         'Concrete vendor and modality binding for a persona, mapping the abstract persona to a provider-specific wire asset identifier (voice ID or avatar ID).',
         NULL,
         'AIPersonaVendor',
         'vwAIPersonaVendors',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: AI Persona Vendors to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '635c7c9a-7bbb-4836-aa19-3e54963e2821', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Persona Vendors for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('635c7c9a-7bbb-4836-aa19-3e54963e2821', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Persona Vendors for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('635c7c9a-7bbb-4836-aa19-3e54963e2821', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Persona Vendors for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('635c7c9a-7bbb-4836-aa19-3e54963e2821', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: AI Model Personas */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'd5493024-2f38-47a5-a6f2-b468a64640ad',
         'MJ: AI Model Personas',
         'AI Model Personas',
         'Specifies per-model persona availability overrides where a model''s supported personas differ from its vendor''s default catalog.',
         NULL,
         'AIModelPersona',
         'vwAIModelPersonas',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: AI Model Personas to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd5493024-2f38-47a5-a6f2-b468a64640ad', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Model Personas for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d5493024-2f38-47a5-a6f2-b468a64640ad', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Model Personas for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d5493024-2f38-47a5-a6f2-b468a64640ad', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Model Personas for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d5493024-2f38-47a5-a6f2-b468a64640ad', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ: AI Agent Personas */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '90c6b2d1-9ad8-40a8-9c2c-4df9433d58c2',
         'MJ: AI Agent Personas',
         'AI Agent Personas',
         'Configures which personas an AI agent is permitted to wear, their preference order, and which persona serves as the agent''s default identity.',
         NULL,
         'AIAgentPersona',
         'vwAIAgentPersonas',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: AI Agent Personas to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '90c6b2d1-9ad8-40a8-9c2c-4df9433d58c2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Personas for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('90c6b2d1-9ad8-40a8-9c2c-4df9433d58c2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Personas for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('90c6b2d1-9ad8-40a8-9c2c-4df9433d58c2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Personas for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('90c6b2d1-9ad8-40a8-9c2c-4df9433d58c2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIPersonaVendor */
ALTER TABLE [${flyway:defaultSchema}].[AIPersonaVendor] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIPersonaVendor */
UPDATE [${flyway:defaultSchema}].[AIPersonaVendor] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIPersonaVendor */
ALTER TABLE [${flyway:defaultSchema}].[AIPersonaVendor] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIPersonaVendor */
ALTER TABLE [${flyway:defaultSchema}].[AIPersonaVendor] ADD CONSTRAINT [DF___mj_AIPersonaVendor___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIPersonaVendor */
ALTER TABLE [${flyway:defaultSchema}].[AIPersonaVendor] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIPersonaVendor */
UPDATE [${flyway:defaultSchema}].[AIPersonaVendor] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIPersonaVendor */
ALTER TABLE [${flyway:defaultSchema}].[AIPersonaVendor] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIPersonaVendor */
ALTER TABLE [${flyway:defaultSchema}].[AIPersonaVendor] ADD CONSTRAINT [DF___mj_AIPersonaVendor___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentPersona] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentPersona */
UPDATE [${flyway:defaultSchema}].[AIAgentPersona] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentPersona] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentPersona] ADD CONSTRAINT [DF___mj_AIAgentPersona___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentPersona] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentPersona */
UPDATE [${flyway:defaultSchema}].[AIAgentPersona] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentPersona] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentPersona] ADD CONSTRAINT [DF___mj_AIAgentPersona___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIPersona] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIPersona */
UPDATE [${flyway:defaultSchema}].[AIPersona] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIPersona] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIPersona] ADD CONSTRAINT [DF___mj_AIPersona___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIPersona] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIPersona */
UPDATE [${flyway:defaultSchema}].[AIPersona] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIPersona] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIPersona] ADD CONSTRAINT [DF___mj_AIPersona___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIModelPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIModelPersona] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIModelPersona */
UPDATE [${flyway:defaultSchema}].[AIModelPersona] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIModelPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIModelPersona] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIModelPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIModelPersona] ADD CONSTRAINT [DF___mj_AIModelPersona___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIModelPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIModelPersona] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIModelPersona */
UPDATE [${flyway:defaultSchema}].[AIModelPersona] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIModelPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIModelPersona] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIModelPersona */
ALTER TABLE [${flyway:defaultSchema}].[AIModelPersona] ADD CONSTRAINT [DF___mj_AIModelPersona___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 43 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3dab4e55-20f4-4823-84e8-ae33b10ee7fd' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3dab4e55-20f4-4823-84e8-ae33b10ee7fd',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d59bac0-bec8-486a-8aa0-b6d879717d54' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = 'PersonaID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1d59bac0-bec8-486a-8aa0-b6d879717d54',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
            'PersonaID',
            'Persona ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1dfaa00b-8728-433f-b340-ca39aa30d994' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = 'VendorID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1dfaa00b-8728-433f-b340-ca39aa30d994',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
            'VendorID',
            'Vendor ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'D95A17EE-5750-4218-86AD-10F06E4DFBCA',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0382f312-1a8b-471a-bcf6-85c15564adb6' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = 'ModalityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0382f312-1a8b-471a-bcf6-85c15564adb6',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
            'ModalityID',
            'Modality ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5ef1f517-3851-4288-8b76-f87d58aabd80' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = 'APIName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5ef1f517-3851-4288-8b76-f87d58aabd80',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
            'APIName',
            'API Name',
            'Vendor-specific asset name or identifier passed over the wire (e.g., alloy, sage, an ElevenLabs voice_id, or a HeyGen avatar_id).',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '762bbca5-5130-416a-b9a6-9114f5afe49a' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '762bbca5-5130-416a-b9a6-9114f5afe49a',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
            'Status',
            'Status',
            'Current operational status of this vendor persona binding.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '00a1881d-e905-4b3d-924d-3d00fa5b3831' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = 'Priority')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '00a1881d-e905-4b3d-924d-3d00fa5b3831',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
            'Priority',
            'Priority',
            'Selection priority when multiple vendor bindings qualify for a given persona and modality. Higher numbers indicate higher priority.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae34c006-1518-432b-bf79-cfafa804eae1' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = 'VendorSettings')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ae34c006-1518-432b-bf79-cfafa804eae1',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
            'VendorSettings',
            'Vendor Settings',
            'Provider-specific configuration JSON (e.g., ElevenLabs stability, similarityBoost, style, useSpeakerBoost).',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32f04d06-81b1-47a6-9e9a-29f045b84df3' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '32f04d06-81b1-47a6-9e9a-29f045b84df3',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd2408d59-789f-4fbb-b058-a91ac6089946' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd2408d59-789f-4fbb-b058-a91ac6089946',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9470aa6c-d0df-4f82-ad02-3827035eb4bf' OR (EntityID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9470aa6c-d0df-4f82-ad02-3827035eb4bf',
            '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', -- Entity: MJ: AI Agent Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3b6bb30e-8167-4b25-98d4-fb848bce3b0a' OR (EntityID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND Name = 'AgentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3b6bb30e-8167-4b25-98d4-fb848bce3b0a',
            '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', -- Entity: MJ: AI Agent Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'),
            'AgentID',
            'Agent ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '895cf419-bfb2-4757-99be-7b7cd0ac10d0' OR (EntityID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND Name = 'PersonaID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '895cf419-bfb2-4757-99be-7b7cd0ac10d0',
            '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', -- Entity: MJ: AI Agent Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'),
            'PersonaID',
            'Persona ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '739b9c0b-af35-4583-a6bd-b73dd3e968ee' OR (EntityID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND Name = 'IsDefault')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '739b9c0b-af35-4583-a6bd-b73dd3e968ee',
            '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', -- Entity: MJ: AI Agent Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'),
            'IsDefault',
            'Is Default',
            'Indicates whether this persona is the default presentation for the agent when none is explicitly requested.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '77034075-2726-428e-90e7-28a053770477' OR (EntityID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '77034075-2726-428e-90e7-28a053770477',
            '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', -- Entity: MJ: AI Agent Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'),
            'Sequence',
            'Sequence',
            'Ordering sequence for displaying available personas in user interfaces.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bea85bd4-8a56-4a36-9f9c-cbfc3dda74cb' OR (EntityID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND Name = 'IsAllowed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bea85bd4-8a56-4a36-9f9c-cbfc3dda74cb',
            '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', -- Entity: MJ: AI Agent Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'),
            'IsAllowed',
            'Is Allowed',
            'Whether the agent is allowed to use this persona. Set to 0 to explicitly disable or veto a persona.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bd1b121a-8fb8-4eba-b267-b96ed660d771' OR (EntityID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND Name = 'StyleOverride')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bd1b121a-8fb8-4eba-b267-b96ed660d771',
            '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', -- Entity: MJ: AI Agent Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'),
            'StyleOverride',
            'Style Override',
            'Optional JSON payload overriding or refining persona presentation specifically for this agent (e.g. Tone or SpeakingStyle adjustments).',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '657584e2-f6d8-4c03-9fec-608669b6c8dd' OR (EntityID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '657584e2-f6d8-4c03-9fec-608669b6c8dd',
            '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', -- Entity: MJ: AI Agent Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f4f81067-8d83-4ae7-b660-b5bffab1f563' OR (EntityID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f4f81067-8d83-4ae7-b660-b5bffab1f563',
            '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', -- Entity: MJ: AI Agent Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7b0c681-1b1c-46c4-9f05-988a5ef1bcc0' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f7b0c681-1b1c-46c4-9f05-988a5ef1bcc0',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23d2b51a-bbbf-475d-b8c4-c76c8aee8eac' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '23d2b51a-bbbf-475d-b8c4-c76c8aee8eac',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'Name',
            'Persona Name',
            'Unique display name identifying this persona (e.g., Alloy, Aria, Sage). Globally unique across all sources to maintain deterministic cross-modality catalog curation.',
            'nvarchar',
            100,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80a40f20-7dc7-497e-b051-5021f7e9c044' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '80a40f20-7dc7-497e-b051-5021f7e9c044',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'Description',
            'Description',
            'Optional description of the persona, its characteristics, and intended personality.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22de81fb-395d-41b3-8503-879fb54f2250' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'PerceivedGender')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '22de81fb-395d-41b3-8503-879fb54f2250',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'PerceivedGender',
            'Perceived Gender',
            'The perceived gender presentation of this persona (e.g., Male, Female, Neutral, Non-Binary).',
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ccf7e6ba-fdc0-4bc9-bf41-22858d76176b' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'Locale')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ccf7e6ba-fdc0-4bc9-bf41-22858d76176b',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'Locale',
            'Locale',
            'BCP 47 language and locale tag primarily associated with this persona (e.g., en-US, es-ES).',
            'nvarchar',
            40,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ee48035-7f69-48f7-9d34-4f966a8c291e' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'PerceivedAgeRangeMin')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6ee48035-7f69-48f7-9d34-4f966a8c291e',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'PerceivedAgeRangeMin',
            'Perceived Age Range Min',
            'Approximate minimum perceived age for this persona, enabling numerical filtering.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a205792-cb2b-4f16-917a-25512384715d' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'PerceivedAgeRangeMax')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3a205792-cb2b-4f16-917a-25512384715d',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'PerceivedAgeRangeMax',
            'Perceived Age Range Max',
            'Approximate maximum perceived age for this persona, enabling numerical filtering.',
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6f741722-013e-4551-a5e8-506d9d8a309a' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'Tone')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6f741722-013e-4551-a5e8-506d9d8a309a',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'Tone',
            'Tone',
            'Core tonal quality for this persona (e.g., Warm, Authoritative, Enthusiastic, Calm). Injected into prompt context for conversational delivery.',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8f16cc5-7de8-4309-8244-ccd391e53ea2' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'SpeakingStyle')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b8f16cc5-7de8-4309-8244-ccd391e53ea2',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'SpeakingStyle',
            'Speaking Style',
            'Stylistic manner of speaking (e.g., Casual and conversational, Direct and concise, Academic).',
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4fff00f3-0924-43a7-ad80-45e76eaa8ec0' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'StyleDescriptors')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4fff00f3-0924-43a7-ad80-45e76eaa8ec0',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'StyleDescriptors',
            'Style Descriptors',
            'Additional descriptive keywords or JSON metadata capturing nuanced personality and presentation traits.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23d1b05b-677d-4ac2-bd72-1c555f165308' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'PreviewAudioURL')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '23d1b05b-677d-4ac2-bd72-1c555f165308',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'PreviewAudioURL',
            'Preview Audio URL',
            'URL to a sample audio file demonstrating this persona''s voice.',
            'nvarchar',
            2000,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aeeefc0f-4143-48fb-a96c-b6a82521571e' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'PreviewImageURL')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aeeefc0f-4143-48fb-a96c-b6a82521571e',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'PreviewImageURL',
            'Preview Image URL',
            'URL to a preview avatar image for this persona.',
            'nvarchar',
            2000,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c76c1148-a756-45d3-bb19-8d7e0e15ba7f' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'PreviewVideoURL')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c76c1148-a756-45d3-bb19-8d7e0e15ba7f',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'PreviewVideoURL',
            'Preview Video URL',
            'URL to a preview video demonstrating this persona''s visual animation or avatar.',
            'nvarchar',
            2000,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5d53f8d-75f7-4eab-882b-44261d365850' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'Source')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c5d53f8d-75f7-4eab-882b-44261d365850',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'Source',
            'Source',
            'Origin of this persona: BuiltIn (provided by system/catalog), Custom (user-defined), or Cloned (derived/voice-cloned).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'BuiltIn',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a410ed1-d8b0-44c6-9f5d-eaa389892281' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4a410ed1-d8b0-44c6-9f5d-eaa389892281',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
            'IsActive',
            'Is Active',
            'Whether this persona is currently active and available for selection.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c307133b-1fc8-4bbb-bb4c-a54821f2f062' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c307133b-1fc8-4bbb-bb4c-a54821f2f062',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f0ad789-724f-401e-b602-8dcff106bda2' OR (EntityID = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4f0ad789-724f-401e-b602-8dcff106bda2',
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1', -- Entity: MJ: AI Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37e96e38-b373-451b-8487-d73681f580d7' OR (EntityID = 'D5493024-2F38-47A5-A6F2-B468A64640AD' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '37e96e38-b373-451b-8487-d73681f580d7',
            'D5493024-2F38-47A5-A6F2-B468A64640AD', -- Entity: MJ: AI Model Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0fcaa21-4659-4115-bc14-8b5e30a6ce47' OR (EntityID = 'D5493024-2F38-47A5-A6F2-B468A64640AD' AND Name = 'ModelID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f0fcaa21-4659-4115-bc14-8b5e30a6ce47',
            'D5493024-2F38-47A5-A6F2-B468A64640AD', -- Entity: MJ: AI Model Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD'),
            'ModelID',
            'Model ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'FD238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3f9b2c22-2608-43a1-bfdc-f8e22dda7607' OR (EntityID = 'D5493024-2F38-47A5-A6F2-B468A64640AD' AND Name = 'PersonaID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3f9b2c22-2608-43a1-bfdc-f8e22dda7607',
            'D5493024-2F38-47A5-A6F2-B468A64640AD', -- Entity: MJ: AI Model Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD'),
            'PersonaID',
            'Persona ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '99F3E501-8443-4C39-9D4C-77F712B1ACA1',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '805ff8db-a380-40d8-8393-c06a5919bea2' OR (EntityID = 'D5493024-2F38-47A5-A6F2-B468A64640AD' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '805ff8db-a380-40d8-8393-c06a5919bea2',
            'D5493024-2F38-47A5-A6F2-B468A64640AD', -- Entity: MJ: AI Model Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD'),
            'Sequence',
            'Sequence',
            'Deterministic ordering sequence for persona priority at the model level.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a99f042-412c-44ca-ac2e-44a3782d5c04' OR (EntityID = 'D5493024-2F38-47A5-A6F2-B468A64640AD' AND Name = 'IsSupported')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9a99f042-412c-44ca-ac2e-44a3782d5c04',
            'D5493024-2F38-47A5-A6F2-B468A64640AD', -- Entity: MJ: AI Model Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD'),
            'IsSupported',
            'Is Supported',
            'Whether this persona is supported by the specific model. Set to 0 to explicitly disable an inherited vendor persona for this model.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca7cc6fd-fe5c-44b0-a0ea-a60615e6f272' OR (EntityID = 'D5493024-2F38-47A5-A6F2-B468A64640AD' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca7cc6fd-fe5c-44b0-a0ea-a60615e6f272',
            'D5493024-2F38-47A5-A6F2-B468A64640AD', -- Entity: MJ: AI Model Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7bb6aea4-e2cf-4c18-a3f6-d50bd1b516ee' OR (EntityID = 'D5493024-2F38-47A5-A6F2-B468A64640AD' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7bb6aea4-e2cf-4c18-a3f6-d50bd1b516ee',
            'D5493024-2F38-47A5-A6F2-B468A64640AD', -- Entity: MJ: AI Model Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD'),
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
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID fe73e888-09c5-4359-87c0-92705be48e27 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fe73e888-09c5-4359-87c0-92705be48e27', 'C5D53F8D-75F7-4EAB-882B-44261D365850', 1, 'BuiltIn', 'BuiltIn', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7eaee4b7-2d67-43e2-b4b5-709bbbbc91b4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7eaee4b7-2d67-43e2-b4b5-709bbbbc91b4', 'C5D53F8D-75F7-4EAB-882B-44261D365850', 2, 'Cloned', 'Cloned', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0a71ad96-c7e2-4c2c-a875-875a47e38e36 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0a71ad96-c7e2-4c2c-a875-875a47e38e36', 'C5D53F8D-75F7-4EAB-882B-44261D365850', 3, 'Custom', 'Custom', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C5D53F8D-75F7-4EAB-882B-44261D365850 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C5D53F8D-75F7-4EAB-882B-44261D365850';

/* SQL text to insert entity field value with ID a0ca500f-428d-4c2c-b194-a80ede975088 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a0ca500f-428d-4c2c-b194-a80ede975088', '762BBCA5-5130-416A-B9A6-9114F5AFE49A', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bce0791a-6ecd-4df6-8eaa-a352c6b10f7f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bce0791a-6ecd-4df6-8eaa-a352c6b10f7f', '762BBCA5-5130-416A-B9A6-9114F5AFE49A', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fba5462c-1daf-47c0-9dfe-d96da3439f50 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fba5462c-1daf-47c0-9dfe-d96da3439f50', '762BBCA5-5130-416A-B9A6-9114F5AFE49A', 3, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 83a12fd7-cb94-4441-8690-9c0d2a6ef881 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('83a12fd7-cb94-4441-8690-9c0d2a6ef881', '762BBCA5-5130-416A-B9A6-9114F5AFE49A', 4, 'Preview', 'Preview', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 762BBCA5-5130-416A-B9A6-9114F5AFE49A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='762BBCA5-5130-416A-B9A6-9114F5AFE49A';


/* Create Entity Relationship: MJ: AI Vendors -> MJ: AI Persona Vendors (One To Many via VendorID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1794bb8d-e45a-46ab-bba1-4ed4454ef3a9'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1794bb8d-e45a-46ab-bba1-4ed4454ef3a9', 'D95A17EE-5750-4218-86AD-10F06E4DFBCA', '635C7C9A-7BBB-4836-AA19-3E54963E2821', 'VendorID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Agents -> MJ: AI Agent Personas (One To Many via AgentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5f4e8096-5800-4664-abb3-46b5b639c2e8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5f4e8096-5800-4664-abb3-46b5b639c2e8', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', 'AgentID', 'One To Many', 1, 1, 40, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Models -> MJ: AI Model Personas (One To Many via ModelID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '17c171f2-8d42-4b80-a2aa-39df45409139'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('17c171f2-8d42-4b80-a2aa-39df45409139', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', 'D5493024-2F38-47A5-A6F2-B468A64640AD', 'ModelID', 'One To Many', 1, 1, 28, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Personas -> MJ: AI Persona Vendors (One To Many via PersonaID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '787460ad-c8dd-409d-b109-44a782565024'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('787460ad-c8dd-409d-b109-44a782565024', '99F3E501-8443-4C39-9D4C-77F712B1ACA1', '635C7C9A-7BBB-4836-AA19-3E54963E2821', 'PersonaID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: AI Personas -> MJ: AI Agent Personas (One To Many via PersonaID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1ca08081-979c-4811-9bd5-337e5bff5891'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1ca08081-979c-4811-9bd5-337e5bff5891', '99F3E501-8443-4C39-9D4C-77F712B1ACA1', '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', 'PersonaID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: AI Personas -> MJ: AI Model Personas (One To Many via PersonaID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1458a526-bee2-4e93-b08f-8c59ad21c84a'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1458a526-bee2-4e93-b08f-8c59ad21c84a', '99F3E501-8443-4C39-9D4C-77F712B1ACA1', 'D5493024-2F38-47A5-A6F2-B468A64640AD', 'PersonaID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: AI Modalities -> MJ: AI Persona Vendors (One To Many via ModalityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd363c59e-4c22-4faa-aa43-2feac8deebfb'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d363c59e-4c22-4faa-aa43-2feac8deebfb', '56AB1EF8-2E92-4E04-BBF5-CFEB62F1897D', '635C7C9A-7BBB-4836-AA19-3E54963E2821', 'ModalityID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for AIAgentPersona */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Personas
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentPersona
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentPersona_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentPersona]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentPersona_AgentID ON [${flyway:defaultSchema}].[AIAgentPersona] ([AgentID]);

-- Index for foreign key PersonaID in table AIAgentPersona
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentPersona_PersonaID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentPersona]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentPersona_PersonaID ON [${flyway:defaultSchema}].[AIAgentPersona] ([PersonaID]);

/* SQL text to update entity field related entity name field map for entity field ID 3B6BB30E-8167-4B25-98D4-FB848BCE3B0A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3B6BB30E-8167-4B25-98D4-FB848BCE3B0A', @RelatedEntityNameFieldMap='Agent';

/* SQL text to update entity field related entity name field map for entity field ID 895CF419-BFB2-4757-99BE-7B7CD0AC10D0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='895CF419-BFB2-4757-99BE-7B7CD0AC10D0', @RelatedEntityNameFieldMap='Persona';

/* Base View SQL for MJ: AI Agent Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Personas
-- Item: vwAIAgentPersonas
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Personas
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentPersona
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentPersonas]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentPersonas];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentPersonas]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIPersona_PersonaID.[Name] AS [Persona]
FROM
    [${flyway:defaultSchema}].[AIAgentPersona] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPersona] AS MJAIPersona_PersonaID
  ON
    [a].[PersonaID] = MJAIPersona_PersonaID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentPersonas] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Personas
-- Item: Permissions for vwAIAgentPersonas
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentPersonas] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Personas
-- Item: spCreateAIAgentPersona
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentPersona
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentPersona]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentPersona];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentPersona]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @PersonaID uniqueidentifier,
    @IsDefault bit = NULL,
    @Sequence int = NULL,
    @IsAllowed bit = NULL,
    @StyleOverride_Clear bit = 0,
    @StyleOverride nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentPersona]
            (
                [ID],
                [AgentID],
                [PersonaID],
                [IsDefault],
                [Sequence],
                [IsAllowed],
                [StyleOverride]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @PersonaID,
                ISNULL(@IsDefault, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@IsAllowed, 1),
                CASE WHEN @StyleOverride_Clear = 1 THEN NULL ELSE ISNULL(@StyleOverride, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentPersona]
            (
                [AgentID],
                [PersonaID],
                [IsDefault],
                [Sequence],
                [IsAllowed],
                [StyleOverride]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @PersonaID,
                ISNULL(@IsDefault, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@IsAllowed, 1),
                CASE WHEN @StyleOverride_Clear = 1 THEN NULL ELSE ISNULL(@StyleOverride, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentPersonas] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentPersona] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Personas */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentPersona] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Personas
-- Item: spUpdateAIAgentPersona
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentPersona
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentPersona]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentPersona];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentPersona]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @PersonaID uniqueidentifier = NULL,
    @IsDefault bit = NULL,
    @Sequence int = NULL,
    @IsAllowed bit = NULL,
    @StyleOverride_Clear bit = 0,
    @StyleOverride nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentPersona]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [PersonaID] = ISNULL(@PersonaID, [PersonaID]),
        [IsDefault] = ISNULL(@IsDefault, [IsDefault]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [IsAllowed] = ISNULL(@IsAllowed, [IsAllowed]),
        [StyleOverride] = CASE WHEN @StyleOverride_Clear = 1 THEN NULL ELSE ISNULL(@StyleOverride, [StyleOverride]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentPersonas] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentPersonas]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentPersona] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentPersona table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentPersona]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentPersona];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentPersona
ON [${flyway:defaultSchema}].[AIAgentPersona]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentPersona]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentPersona] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Personas */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentPersona] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Personas
-- Item: spDeleteAIAgentPersona
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentPersona
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentPersona]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentPersona];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentPersona]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentPersona]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentPersona] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Personas */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentPersona] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for AIModelPersona */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Personas
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ModelID in table AIModelPersona
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelPersona_ModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelPersona]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelPersona_ModelID ON [${flyway:defaultSchema}].[AIModelPersona] ([ModelID]);

-- Index for foreign key PersonaID in table AIModelPersona
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelPersona_PersonaID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIModelPersona]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIModelPersona_PersonaID ON [${flyway:defaultSchema}].[AIModelPersona] ([PersonaID]);

/* SQL text to update entity field related entity name field map for entity field ID F0FCAA21-4659-4115-BC14-8B5E30A6CE47 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F0FCAA21-4659-4115-BC14-8B5E30A6CE47', @RelatedEntityNameFieldMap='Model';

/* Index for Foreign Keys for AIPersonaVendor */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Persona Vendors
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PersonaID in table AIPersonaVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPersonaVendor_PersonaID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPersonaVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPersonaVendor_PersonaID ON [${flyway:defaultSchema}].[AIPersonaVendor] ([PersonaID]);

-- Index for foreign key VendorID in table AIPersonaVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPersonaVendor_VendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPersonaVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPersonaVendor_VendorID ON [${flyway:defaultSchema}].[AIPersonaVendor] ([VendorID]);

-- Index for foreign key ModalityID in table AIPersonaVendor
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPersonaVendor_ModalityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPersonaVendor]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPersonaVendor_ModalityID ON [${flyway:defaultSchema}].[AIPersonaVendor] ([ModalityID]);

/* SQL text to update entity field related entity name field map for entity field ID 1D59BAC0-BEC8-486A-8AA0-B6D879717D54 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1D59BAC0-BEC8-486A-8AA0-B6D879717D54', @RelatedEntityNameFieldMap='Persona';

/* Index for Foreign Keys for AIPersona */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Personas
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: AI Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Personas
-- Item: vwAIPersonas
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Personas
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPersona
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIPersonas]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIPersonas];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPersonas]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIPersona] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPersonas] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Personas
-- Item: Permissions for vwAIPersonas
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPersonas] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Personas
-- Item: spCreateAIPersona
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPersona
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPersona]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPersona];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPersona]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @PerceivedGender_Clear bit = 0,
    @PerceivedGender nvarchar(50) = NULL,
    @Locale_Clear bit = 0,
    @Locale nvarchar(20) = NULL,
    @PerceivedAgeRangeMin_Clear bit = 0,
    @PerceivedAgeRangeMin int = NULL,
    @PerceivedAgeRangeMax_Clear bit = 0,
    @PerceivedAgeRangeMax int = NULL,
    @Tone_Clear bit = 0,
    @Tone nvarchar(255) = NULL,
    @SpeakingStyle_Clear bit = 0,
    @SpeakingStyle nvarchar(255) = NULL,
    @StyleDescriptors_Clear bit = 0,
    @StyleDescriptors nvarchar(MAX) = NULL,
    @PreviewAudioURL_Clear bit = 0,
    @PreviewAudioURL nvarchar(1000) = NULL,
    @PreviewImageURL_Clear bit = 0,
    @PreviewImageURL nvarchar(1000) = NULL,
    @PreviewVideoURL_Clear bit = 0,
    @PreviewVideoURL nvarchar(1000) = NULL,
    @Source nvarchar(20) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIPersona]
            (
                [ID],
                [Name],
                [Description],
                [PerceivedGender],
                [Locale],
                [PerceivedAgeRangeMin],
                [PerceivedAgeRangeMax],
                [Tone],
                [SpeakingStyle],
                [StyleDescriptors],
                [PreviewAudioURL],
                [PreviewImageURL],
                [PreviewVideoURL],
                [Source],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @PerceivedGender_Clear = 1 THEN NULL ELSE ISNULL(@PerceivedGender, NULL) END,
                CASE WHEN @Locale_Clear = 1 THEN NULL ELSE ISNULL(@Locale, NULL) END,
                CASE WHEN @PerceivedAgeRangeMin_Clear = 1 THEN NULL ELSE ISNULL(@PerceivedAgeRangeMin, NULL) END,
                CASE WHEN @PerceivedAgeRangeMax_Clear = 1 THEN NULL ELSE ISNULL(@PerceivedAgeRangeMax, NULL) END,
                CASE WHEN @Tone_Clear = 1 THEN NULL ELSE ISNULL(@Tone, NULL) END,
                CASE WHEN @SpeakingStyle_Clear = 1 THEN NULL ELSE ISNULL(@SpeakingStyle, NULL) END,
                CASE WHEN @StyleDescriptors_Clear = 1 THEN NULL ELSE ISNULL(@StyleDescriptors, NULL) END,
                CASE WHEN @PreviewAudioURL_Clear = 1 THEN NULL ELSE ISNULL(@PreviewAudioURL, NULL) END,
                CASE WHEN @PreviewImageURL_Clear = 1 THEN NULL ELSE ISNULL(@PreviewImageURL, NULL) END,
                CASE WHEN @PreviewVideoURL_Clear = 1 THEN NULL ELSE ISNULL(@PreviewVideoURL, NULL) END,
                ISNULL(@Source, 'BuiltIn'),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPersona]
            (
                [Name],
                [Description],
                [PerceivedGender],
                [Locale],
                [PerceivedAgeRangeMin],
                [PerceivedAgeRangeMax],
                [Tone],
                [SpeakingStyle],
                [StyleDescriptors],
                [PreviewAudioURL],
                [PreviewImageURL],
                [PreviewVideoURL],
                [Source],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @PerceivedGender_Clear = 1 THEN NULL ELSE ISNULL(@PerceivedGender, NULL) END,
                CASE WHEN @Locale_Clear = 1 THEN NULL ELSE ISNULL(@Locale, NULL) END,
                CASE WHEN @PerceivedAgeRangeMin_Clear = 1 THEN NULL ELSE ISNULL(@PerceivedAgeRangeMin, NULL) END,
                CASE WHEN @PerceivedAgeRangeMax_Clear = 1 THEN NULL ELSE ISNULL(@PerceivedAgeRangeMax, NULL) END,
                CASE WHEN @Tone_Clear = 1 THEN NULL ELSE ISNULL(@Tone, NULL) END,
                CASE WHEN @SpeakingStyle_Clear = 1 THEN NULL ELSE ISNULL(@SpeakingStyle, NULL) END,
                CASE WHEN @StyleDescriptors_Clear = 1 THEN NULL ELSE ISNULL(@StyleDescriptors, NULL) END,
                CASE WHEN @PreviewAudioURL_Clear = 1 THEN NULL ELSE ISNULL(@PreviewAudioURL, NULL) END,
                CASE WHEN @PreviewImageURL_Clear = 1 THEN NULL ELSE ISNULL(@PreviewImageURL, NULL) END,
                CASE WHEN @PreviewVideoURL_Clear = 1 THEN NULL ELSE ISNULL(@PreviewVideoURL, NULL) END,
                ISNULL(@Source, 'BuiltIn'),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPersonas] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPersona] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Personas */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPersona] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Personas
-- Item: spUpdateAIPersona
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPersona
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPersona]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPersona];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPersona]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @PerceivedGender_Clear bit = 0,
    @PerceivedGender nvarchar(50) = NULL,
    @Locale_Clear bit = 0,
    @Locale nvarchar(20) = NULL,
    @PerceivedAgeRangeMin_Clear bit = 0,
    @PerceivedAgeRangeMin int = NULL,
    @PerceivedAgeRangeMax_Clear bit = 0,
    @PerceivedAgeRangeMax int = NULL,
    @Tone_Clear bit = 0,
    @Tone nvarchar(255) = NULL,
    @SpeakingStyle_Clear bit = 0,
    @SpeakingStyle nvarchar(255) = NULL,
    @StyleDescriptors_Clear bit = 0,
    @StyleDescriptors nvarchar(MAX) = NULL,
    @PreviewAudioURL_Clear bit = 0,
    @PreviewAudioURL nvarchar(1000) = NULL,
    @PreviewImageURL_Clear bit = 0,
    @PreviewImageURL nvarchar(1000) = NULL,
    @PreviewVideoURL_Clear bit = 0,
    @PreviewVideoURL nvarchar(1000) = NULL,
    @Source nvarchar(20) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPersona]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [PerceivedGender] = CASE WHEN @PerceivedGender_Clear = 1 THEN NULL ELSE ISNULL(@PerceivedGender, [PerceivedGender]) END,
        [Locale] = CASE WHEN @Locale_Clear = 1 THEN NULL ELSE ISNULL(@Locale, [Locale]) END,
        [PerceivedAgeRangeMin] = CASE WHEN @PerceivedAgeRangeMin_Clear = 1 THEN NULL ELSE ISNULL(@PerceivedAgeRangeMin, [PerceivedAgeRangeMin]) END,
        [PerceivedAgeRangeMax] = CASE WHEN @PerceivedAgeRangeMax_Clear = 1 THEN NULL ELSE ISNULL(@PerceivedAgeRangeMax, [PerceivedAgeRangeMax]) END,
        [Tone] = CASE WHEN @Tone_Clear = 1 THEN NULL ELSE ISNULL(@Tone, [Tone]) END,
        [SpeakingStyle] = CASE WHEN @SpeakingStyle_Clear = 1 THEN NULL ELSE ISNULL(@SpeakingStyle, [SpeakingStyle]) END,
        [StyleDescriptors] = CASE WHEN @StyleDescriptors_Clear = 1 THEN NULL ELSE ISNULL(@StyleDescriptors, [StyleDescriptors]) END,
        [PreviewAudioURL] = CASE WHEN @PreviewAudioURL_Clear = 1 THEN NULL ELSE ISNULL(@PreviewAudioURL, [PreviewAudioURL]) END,
        [PreviewImageURL] = CASE WHEN @PreviewImageURL_Clear = 1 THEN NULL ELSE ISNULL(@PreviewImageURL, [PreviewImageURL]) END,
        [PreviewVideoURL] = CASE WHEN @PreviewVideoURL_Clear = 1 THEN NULL ELSE ISNULL(@PreviewVideoURL, [PreviewVideoURL]) END,
        [Source] = ISNULL(@Source, [Source]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIPersonas] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPersonas]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPersona] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPersona table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPersona]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPersona];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPersona
ON [${flyway:defaultSchema}].[AIPersona]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPersona]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPersona] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Personas */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPersona] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Personas
-- Item: spDeleteAIPersona
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPersona
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPersona]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPersona];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPersona]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPersona]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPersona] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Personas */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPersona] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 3F9B2C22-2608-43A1-BFDC-F8E22DDA7607 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3F9B2C22-2608-43A1-BFDC-F8E22DDA7607', @RelatedEntityNameFieldMap='Persona';

/* SQL text to update entity field related entity name field map for entity field ID 1DFAA00B-8728-433F-B340-CA39AA30D994 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1DFAA00B-8728-433F-B340-CA39AA30D994', @RelatedEntityNameFieldMap='Vendor';

/* Base View SQL for MJ: AI Model Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Personas
-- Item: vwAIModelPersonas
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Personas
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelPersona
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIModelPersonas]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIModelPersonas];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIModelPersonas]
AS
SELECT
    a.*,
    MJAIModel_ModelID.[Name] AS [Model],
    MJAIPersona_PersonaID.[Name] AS [Persona]
FROM
    [${flyway:defaultSchema}].[AIModelPersona] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_ModelID
  ON
    [a].[ModelID] = MJAIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPersona] AS MJAIPersona_PersonaID
  ON
    [a].[PersonaID] = MJAIPersona_PersonaID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelPersonas] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Model Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Personas
-- Item: Permissions for vwAIModelPersonas
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIModelPersonas] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Model Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Personas
-- Item: spCreateAIModelPersona
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelPersona
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIModelPersona]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelPersona];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIModelPersona]
    @ID uniqueidentifier = NULL,
    @ModelID uniqueidentifier,
    @PersonaID uniqueidentifier,
    @Sequence int = NULL,
    @IsSupported bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIModelPersona]
            (
                [ID],
                [ModelID],
                [PersonaID],
                [Sequence],
                [IsSupported]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ModelID,
                @PersonaID,
                ISNULL(@Sequence, 0),
                ISNULL(@IsSupported, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIModelPersona]
            (
                [ModelID],
                [PersonaID],
                [Sequence],
                [IsSupported]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ModelID,
                @PersonaID,
                ISNULL(@Sequence, 0),
                ISNULL(@IsSupported, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIModelPersonas] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelPersona] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Model Personas */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIModelPersona] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Model Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Personas
-- Item: spUpdateAIModelPersona
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelPersona
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIModelPersona]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelPersona];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIModelPersona]
    @ID uniqueidentifier,
    @ModelID uniqueidentifier = NULL,
    @PersonaID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @IsSupported bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelPersona]
    SET
        [ModelID] = ISNULL(@ModelID, [ModelID]),
        [PersonaID] = ISNULL(@PersonaID, [PersonaID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [IsSupported] = ISNULL(@IsSupported, [IsSupported])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIModelPersonas] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIModelPersonas]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelPersona] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelPersona table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIModelPersona]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIModelPersona];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIModelPersona
ON [${flyway:defaultSchema}].[AIModelPersona]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIModelPersona]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIModelPersona] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Model Personas */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIModelPersona] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Model Personas */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Personas
-- Item: spDeleteAIModelPersona
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelPersona
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIModelPersona]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelPersona];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIModelPersona]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIModelPersona]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelPersona] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Model Personas */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIModelPersona] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 0382F312-1A8B-471A-BCF6-85C15564ADB6 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0382F312-1A8B-471A-BCF6-85C15564ADB6', @RelatedEntityNameFieldMap='Modality';

/* Base View SQL for MJ: AI Persona Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Persona Vendors
-- Item: vwAIPersonaVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Persona Vendors
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPersonaVendor
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIPersonaVendors]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIPersonaVendors];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPersonaVendors]
AS
SELECT
    a.*,
    MJAIPersona_PersonaID.[Name] AS [Persona],
    MJAIVendor_VendorID.[Name] AS [Vendor],
    MJAIModality_ModalityID.[Name] AS [Modality]
FROM
    [${flyway:defaultSchema}].[AIPersonaVendor] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPersona] AS MJAIPersona_PersonaID
  ON
    [a].[PersonaID] = MJAIPersona_PersonaID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS MJAIVendor_VendorID
  ON
    [a].[VendorID] = MJAIVendor_VendorID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModality] AS MJAIModality_ModalityID
  ON
    [a].[ModalityID] = MJAIModality_ModalityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPersonaVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Persona Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Persona Vendors
-- Item: Permissions for vwAIPersonaVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPersonaVendors] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Persona Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Persona Vendors
-- Item: spCreateAIPersonaVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPersonaVendor
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPersonaVendor]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPersonaVendor];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPersonaVendor]
    @ID uniqueidentifier = NULL,
    @PersonaID uniqueidentifier,
    @VendorID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @APIName nvarchar(255),
    @Status nvarchar(20) = NULL,
    @Priority int = NULL,
    @VendorSettings_Clear bit = 0,
    @VendorSettings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIPersonaVendor]
            (
                [ID],
                [PersonaID],
                [VendorID],
                [ModalityID],
                [APIName],
                [Status],
                [Priority],
                [VendorSettings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PersonaID,
                @VendorID,
                @ModalityID,
                @APIName,
                ISNULL(@Status, 'Active'),
                ISNULL(@Priority, 0),
                CASE WHEN @VendorSettings_Clear = 1 THEN NULL ELSE ISNULL(@VendorSettings, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPersonaVendor]
            (
                [PersonaID],
                [VendorID],
                [ModalityID],
                [APIName],
                [Status],
                [Priority],
                [VendorSettings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PersonaID,
                @VendorID,
                @ModalityID,
                @APIName,
                ISNULL(@Status, 'Active'),
                ISNULL(@Priority, 0),
                CASE WHEN @VendorSettings_Clear = 1 THEN NULL ELSE ISNULL(@VendorSettings, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPersonaVendors] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPersonaVendor] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Persona Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPersonaVendor] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Persona Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Persona Vendors
-- Item: spUpdateAIPersonaVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPersonaVendor
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPersonaVendor]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPersonaVendor];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPersonaVendor]
    @ID uniqueidentifier,
    @PersonaID uniqueidentifier = NULL,
    @VendorID uniqueidentifier = NULL,
    @ModalityID uniqueidentifier = NULL,
    @APIName nvarchar(255) = NULL,
    @Status nvarchar(20) = NULL,
    @Priority int = NULL,
    @VendorSettings_Clear bit = 0,
    @VendorSettings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPersonaVendor]
    SET
        [PersonaID] = ISNULL(@PersonaID, [PersonaID]),
        [VendorID] = ISNULL(@VendorID, [VendorID]),
        [ModalityID] = ISNULL(@ModalityID, [ModalityID]),
        [APIName] = ISNULL(@APIName, [APIName]),
        [Status] = ISNULL(@Status, [Status]),
        [Priority] = ISNULL(@Priority, [Priority]),
        [VendorSettings] = CASE WHEN @VendorSettings_Clear = 1 THEN NULL ELSE ISNULL(@VendorSettings, [VendorSettings]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIPersonaVendors] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPersonaVendors]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPersonaVendor] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPersonaVendor table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPersonaVendor]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPersonaVendor];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPersonaVendor
ON [${flyway:defaultSchema}].[AIPersonaVendor]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPersonaVendor]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPersonaVendor] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Persona Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPersonaVendor] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Persona Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Persona Vendors
-- Item: spDeleteAIPersonaVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPersonaVendor
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPersonaVendor]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPersonaVendor];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPersonaVendor]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPersonaVendor]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPersonaVendor] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Persona Vendors */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPersonaVendor] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
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
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_AgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactLength int
    DECLARE @MJAIAgentActions_AgentID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentActions_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentActions_AgentID_AgentID, @ActionID = @MJAIAgentActions_AgentID_ActionID, @Status = @MJAIAgentActions_AgentID_Status, @MinExecutionsPerRun = @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_AgentID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_AgentID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_AgentID_CompactMode, @CompactLength = @MJAIAgentActions_AgentID_CompactLength, @CompactPromptID = @MJAIAgentActions_AgentID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_AgentID_cursor
    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType
    DECLARE @MJAIAgentArtifactTypes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentArtifactType]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType] @ID = @MJAIAgentArtifactTypes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    
    -- Cascade delete from AIAgentClientTool using cursor to call spDeleteAIAgentClientTool
    DECLARE @MJAIAgentClientTools_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentClientTools_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentClientTool]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentClientTools_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentClientTool] @ID = @MJAIAgentClientTools_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    
    -- Cascade delete from AIAgentCoAgent using cursor to call spDeleteAIAgentCoAgent
    DECLARE @MJAIAgentCoAgents_CoAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentCoAgent]
        WHERE [CoAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor INTO @MJAIAgentCoAgents_CoAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentCoAgent] @ID = @MJAIAgentCoAgents_CoAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor INTO @MJAIAgentCoAgents_CoAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    
    -- Cascade update on AIAgentCoAgent using cursor to call spUpdateAIAgentCoAgent
    DECLARE @MJAIAgentCoAgents_TargetAgentIDID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_CoAgentID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_TargetAgentID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Type nvarchar(30)
    DECLARE @MJAIAgentCoAgents_TargetAgentID_IsDefault bit
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Sequence int
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor CURSOR FOR
        SELECT [ID], [CoAgentID], [TargetAgentID], [TargetAgentTypeID], [Type], [IsDefault], [Sequence], [Status], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentCoAgent]
        WHERE [TargetAgentID] = @ID

    OPEN cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor INTO @MJAIAgentCoAgents_TargetAgentIDID, @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @MJAIAgentCoAgents_TargetAgentID_Type, @MJAIAgentCoAgents_TargetAgentID_IsDefault, @MJAIAgentCoAgents_TargetAgentID_Sequence, @MJAIAgentCoAgents_TargetAgentID_Status, @MJAIAgentCoAgents_TargetAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentCoAgents_TargetAgentID_TargetAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentCoAgent] @ID = @MJAIAgentCoAgents_TargetAgentIDID, @CoAgentID = @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @TargetAgentID_Clear = 1, @TargetAgentID = @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @TargetAgentTypeID = @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @Type = @MJAIAgentCoAgents_TargetAgentID_Type, @IsDefault = @MJAIAgentCoAgents_TargetAgentID_IsDefault, @Sequence = @MJAIAgentCoAgents_TargetAgentID_Sequence, @Status = @MJAIAgentCoAgents_TargetAgentID_Status, @Configuration = @MJAIAgentCoAgents_TargetAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor INTO @MJAIAgentCoAgents_TargetAgentIDID, @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @MJAIAgentCoAgents_TargetAgentID_Type, @MJAIAgentCoAgents_TargetAgentID_IsDefault, @MJAIAgentCoAgents_TargetAgentID_Sequence, @MJAIAgentCoAgents_TargetAgentID_Status, @MJAIAgentCoAgents_TargetAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration
    DECLARE @MJAIAgentConfigurations_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentConfigurations_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentConfiguration]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration] @ID = @MJAIAgentConfigurations_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    
    -- Cascade delete from AIAgentCredential using cursor to call spDeleteAIAgentCredential
    DECLARE @MJAIAgentCredentials_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentCredentials_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentCredential]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentCredentials_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentCredentials_AgentID_cursor INTO @MJAIAgentCredentials_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentCredential] @ID = @MJAIAgentCredentials_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentCredentials_AgentID_cursor INTO @MJAIAgentCredentials_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentCredentials_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentCredentials_AgentID_cursor
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource
    DECLARE @MJAIAgentDataSources_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentDataSources_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentDataSource]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentDataSources_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentDataSource] @ID = @MJAIAgentDataSources_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample
    DECLARE @MJAIAgentExamples_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentExamples_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentExamples_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentExample] @ID = @MJAIAgentExamples_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentExamples_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentExamples_AgentID_cursor
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle
    DECLARE @MJAIAgentLearningCycles_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentLearningCycle]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle] @ID = @MJAIAgentLearningCycles_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality
    DECLARE @MJAIAgentModalities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentModalities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentModality]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentModalities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentModality] @ID = @MJAIAgentModalities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentModalities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentModalities_AgentID_cursor
    
    -- Cascade update on AIAgentModel using cursor to call spUpdateAIAgentModel
    DECLARE @MJAIAgentModels_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_Active bit
    DECLARE @MJAIAgentModels_AgentID_Priority int
    DECLARE cascade_update_MJAIAgentModels_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ModelID], [Active], [Priority]
        FROM [${flyway:defaultSchema}].[AIAgentModel]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentModels_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentModels_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentModel] @ID = @MJAIAgentModels_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentModels_AgentID_AgentID, @ModelID = @MJAIAgentModels_AgentID_ModelID, @Active = @MJAIAgentModels_AgentID_Active, @Priority = @MJAIAgentModels_AgentID_Priority

        FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority
    END

    CLOSE cascade_update_MJAIAgentModels_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentModels_AgentID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_AgentID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_AccessCount int
    DECLARE @MJAIAgentNotes_AgentID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_AgentID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_AgentID_AuthorType nvarchar(20)
    DECLARE cascade_update_MJAIAgentNotes_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentNotes_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore, @MJAIAgentNotes_AgentID_AuthorType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentNotes_AgentID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_AgentID_AgentNoteTypeID, @Note = @MJAIAgentNotes_AgentID_Note, @UserID = @MJAIAgentNotes_AgentID_UserID, @Type = @MJAIAgentNotes_AgentID_Type, @IsAutoGenerated = @MJAIAgentNotes_AgentID_IsAutoGenerated, @Comments = @MJAIAgentNotes_AgentID_Comments, @Status = @MJAIAgentNotes_AgentID_Status, @SourceConversationID = @MJAIAgentNotes_AgentID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_AgentID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_AgentID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_AgentID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_AgentID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_AgentID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_AgentID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_AgentID_AccessCount, @ExpiresAt = @MJAIAgentNotes_AgentID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_AgentID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_AgentID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_AgentID_ImportanceScore, @AuthorType = @MJAIAgentNotes_AgentID_AuthorType

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore, @MJAIAgentNotes_AgentID_AuthorType
    END

    CLOSE cascade_update_MJAIAgentNotes_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_AgentID_cursor
    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission
    DECLARE @MJAIAgentPermissions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPermissions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPermission]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPermissions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPermission] @ID = @MJAIAgentPermissions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    
    -- Cascade delete from AIAgentPersona using cursor to call spDeleteAIAgentPersona
    DECLARE @MJAIAgentPersonas_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPersonas_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPersona]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPersonas_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPersonas_AgentID_cursor INTO @MJAIAgentPersonas_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPersona] @ID = @MJAIAgentPersonas_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPersonas_AgentID_cursor INTO @MJAIAgentPersonas_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPersonas_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPersonas_AgentID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest
    DECLARE @MJAIAgentRequests_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRequests_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRequests_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRequest] @ID = @MJAIAgentRequests_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRequests_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRequests_AgentID_cursor
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun
    DECLARE @MJAIAgentRuns_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRuns_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRuns_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRun] @ID = @MJAIAgentRuns_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRuns_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRuns_AgentID_cursor
    
    -- Cascade delete from AIAgentSearchScope using cursor to call spDeleteAIAgentSearchScope
    DECLARE @MJAIAgentSearchScopes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSearchScope]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSearchScope] @ID = @MJAIAgentSearchScopes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    
    -- Cascade delete from AIAgentSession using cursor to call spDeleteAIAgentSession
    DECLARE @MJAIAgentSessions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSessions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSessions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSessions_AgentID_cursor INTO @MJAIAgentSessions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSession] @ID = @MJAIAgentSessions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSessions_AgentID_cursor INTO @MJAIAgentSessions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSessions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSessions_AgentID_cursor
    
    -- Cascade delete from AIAgentSkill using cursor to call spDeleteAIAgentSkill
    DECLARE @MJAIAgentSkills_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSkills_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSkill]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSkills_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSkill] @ID = @MJAIAgentSkills_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSkills_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSkills_AgentID_cursor
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep
    DECLARE @MJAIAgentSteps_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSteps_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSteps_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentStep] @ID = @MJAIAgentSteps_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSteps_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSteps_AgentID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_SubAgentIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_SubAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_StartingStep bit
    DECLARE @MJAIAgentSteps_SubAgentID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_SubAgentID_RetryCount int
    DECLARE @MJAIAgentSteps_SubAgentID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_PositionX int
    DECLARE @MJAIAgentSteps_SubAgentID_PositionY int
    DECLARE @MJAIAgentSteps_SubAgentID_Width int
    DECLARE @MJAIAgentSteps_SubAgentID_Height int
    DECLARE @MJAIAgentSteps_SubAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_SubAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_SubAgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [SubAgentID] = @ID

    OPEN cascade_update_MJAIAgentSteps_SubAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_SubAgentID_SubAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_SubAgentIDID, @AgentID = @MJAIAgentSteps_SubAgentID_AgentID, @Name = @MJAIAgentSteps_SubAgentID_Name, @Description = @MJAIAgentSteps_SubAgentID_Description, @StepType = @MJAIAgentSteps_SubAgentID_StepType, @StartingStep = @MJAIAgentSteps_SubAgentID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_SubAgentID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_SubAgentID_ActionID, @SubAgentID_Clear = 1, @SubAgentID = @MJAIAgentSteps_SubAgentID_SubAgentID, @PromptID = @MJAIAgentSteps_SubAgentID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_SubAgentID_PositionX, @PositionY = @MJAIAgentSteps_SubAgentID_PositionY, @Width = @MJAIAgentSteps_SubAgentID_Width, @Height = @MJAIAgentSteps_SubAgentID_Height, @Status = @MJAIAgentSteps_SubAgentID_Status, @ActionInputMapping = @MJAIAgentSteps_SubAgentID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_SubAgentID_LoopBodyType, @Configuration = @MJAIAgentSteps_SubAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ParentIDID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Name nvarchar(255)
    DECLARE @MJAIAgents_ParentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ExposeAsAction bit
    DECLARE @MJAIAgents_ParentID_ExecutionOrder int
    DECLARE @MJAIAgents_ParentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_EnableContextCompression bit
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ParentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ParentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Status nvarchar(20)
    DECLARE @MJAIAgents_ParentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ParentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ParentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ParentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ParentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ParentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxTimePerRun int
    DECLARE @MJAIAgents_ParentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ParentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ParentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_InjectNotes bit
    DECLARE @MJAIAgents_ParentID_MaxNotesToInject int
    DECLARE @MJAIAgents_ParentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_InjectExamples bit
    DECLARE @MJAIAgents_ParentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ParentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_IsRestricted bit
    DECLARE @MJAIAgents_ParentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_MaxMessages int
    DECLARE @MJAIAgents_ParentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ParentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ParentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_NoteRetentionDays int
    DECLARE @MJAIAgents_ParentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ParentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ParentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ParentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ParentID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ParentID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ParentID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ParentID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ParentID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ParentID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_RequirePlanMode bit
    DECLARE @MJAIAgents_ParentID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ParentID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ParentID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ParentID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ParentID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ParentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ParentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ParentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ParentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ParentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ParentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ParentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ParentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ParentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ParentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ParentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ParentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ParentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ParentID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgents_ParentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ParentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_DefaultCoAgentIDID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_Name nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_ExposeAsAction bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ExecutionOrder int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_EnableContextCompression bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_DefaultCoAgentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_Status nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_DefaultCoAgentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxTimePerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_DefaultCoAgentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_InjectNotes bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxNotesToInject int
    DECLARE @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_InjectExamples bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_IsRestricted bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxMessages int
    DECLARE @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_NoteRetentionDays int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_DefaultCoAgentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_DefaultCoAgentID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_DefaultCoAgentID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_RequirePlanMode bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent int
    DECLARE @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgents_DefaultCoAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [DefaultCoAgentID] = @ID

    OPEN cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_DefaultCoAgentIDID, @Name = @MJAIAgents_DefaultCoAgentID_Name, @Description = @MJAIAgents_DefaultCoAgentID_Description, @LogoURL = @MJAIAgents_DefaultCoAgentID_LogoURL, @ParentID = @MJAIAgents_DefaultCoAgentID_ParentID, @ExposeAsAction = @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_DefaultCoAgentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_DefaultCoAgentID_TypeID, @Status = @MJAIAgents_DefaultCoAgentID_Status, @DriverClass = @MJAIAgents_DefaultCoAgentID_DriverClass, @IconClass = @MJAIAgents_DefaultCoAgentID_IconClass, @ModelSelectionMode = @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_DefaultCoAgentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_DefaultCoAgentID_OwnerUserID, @InvocationMode = @MJAIAgents_DefaultCoAgentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @InjectNotes = @MJAIAgents_DefaultCoAgentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_DefaultCoAgentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_DefaultCoAgentID_IsRestricted, @MessageMode = @MJAIAgents_DefaultCoAgentID_MessageMode, @MaxMessages = @MJAIAgents_DefaultCoAgentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_DefaultCoAgentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @CategoryID = @MJAIAgents_DefaultCoAgentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @DefaultCoAgentID_Clear = 1, @DefaultCoAgentID = @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_DefaultCoAgentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID

        FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID
    END

    CLOSE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    
    -- Cascade delete from AIBridgeAgentIdentity using cursor to call spDeleteAIBridgeAgentIdentity
    DECLARE @MJAIBridgeAgentIdentities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIBridgeAgentIdentity]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor INTO @MJAIBridgeAgentIdentities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity] @ID = @MJAIBridgeAgentIdentities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor INTO @MJAIBridgeAgentIdentities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_Success bit
    DECLARE @MJAIPromptRuns_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopK int
    DECLARE @MJAIPromptRuns_AgentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_Seed int
    DECLARE @MJAIPromptRuns_AgentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWriteRollup int
    DECLARE @MJAIPromptRuns_AgentID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_UsageTypeID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_AgentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @MJAIPromptRuns_AgentID_InputUnitsUsed, @MJAIPromptRuns_AgentID_OutputUnitsUsed, @MJAIPromptRuns_AgentID_UsageTypeID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentIDID, @PromptID = @MJAIPromptRuns_AgentID_PromptID, @ModelID = @MJAIPromptRuns_AgentID_ModelID, @VendorID = @MJAIPromptRuns_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIPromptRuns_AgentID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentID_Messages, @Result = @MJAIPromptRuns_AgentID_Result, @TokensUsed = @MJAIPromptRuns_AgentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentID_TotalCost, @Success = @MJAIPromptRuns_AgentID_Success, @ErrorMessage = @MJAIPromptRuns_AgentID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentID_ParentID, @RunType = @MJAIPromptRuns_AgentID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentID_ExecutionOrder, @Cost = @MJAIPromptRuns_AgentID_Cost, @CostCurrency = @MJAIPromptRuns_AgentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentID_Temperature, @TopP = @MJAIPromptRuns_AgentID_TopP, @TopK = @MJAIPromptRuns_AgentID_TopK, @MinP = @MJAIPromptRuns_AgentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentID_Seed, @StopSequences = @MJAIPromptRuns_AgentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentID_ModelSelection, @Status = @MJAIPromptRuns_AgentID_Status, @Cancelled = @MJAIPromptRuns_AgentID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentID_EffortLevel, @RunName = @MJAIPromptRuns_AgentID_RunName, @Comments = @MJAIPromptRuns_AgentID_Comments, @TestRunID = @MJAIPromptRuns_AgentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_AgentID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_AgentID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_AgentID_UsageTypeID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @MJAIPromptRuns_AgentID_InputUnitsUsed, @MJAIPromptRuns_AgentID_OutputUnitsUsed, @MJAIPromptRuns_AgentID_UsageTypeID
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_AgentIDID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_AgentID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_Status nvarchar(50)
    DECLARE @MJAIResultCache_AgentID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_AgentID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_AgentID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIResultCache_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_AgentIDID, @AIPromptID = @MJAIResultCache_AgentID_AIPromptID, @AIModelID = @MJAIResultCache_AgentID_AIModelID, @RunAt = @MJAIResultCache_AgentID_RunAt, @PromptText = @MJAIResultCache_AgentID_PromptText, @ResultText = @MJAIResultCache_AgentID_ResultText, @Status = @MJAIResultCache_AgentID_Status, @ExpiredOn = @MJAIResultCache_AgentID_ExpiredOn, @VendorID = @MJAIResultCache_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIResultCache_AgentID_AgentID, @ConfigurationID = @MJAIResultCache_AgentID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_AgentID_PromptEmbedding, @PromptRunID = @MJAIResultCache_AgentID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_AgentID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_AgentID_cursor
    
    -- Cascade delete from AISkillSubAgent using cursor to call spDeleteAISkillSubAgent
    DECLARE @MJAISkillSubAgents_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AISkillSubAgent]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAISkillSubAgent] @ID = @MJAISkillSubAgents_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_CreatedByAgentIDID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CategoryID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Name nvarchar(425)
    DECLARE @MJActions_CreatedByAgentID_Description nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Type nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_UserComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Code nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_CreatedByAgentID_CodeLocked bit
    DECLARE @MJActions_CreatedByAgentID_ForceCodeGeneration bit
    DECLARE @MJActions_CreatedByAgentID_RetentionPeriod int
    DECLARE @MJActions_CreatedByAgentID_Status nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_DriverClass nvarchar(255)
    DECLARE @MJActions_CreatedByAgentID_ParentID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_IconClass nvarchar(100)
    DECLARE @MJActions_CreatedByAgentID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Config nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_MaxExecutionTimeMS int
    DECLARE @MJActions_CreatedByAgentID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_CreatedByAgentID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [CreatedByAgentID] = @ID

    OPEN cascade_update_MJActions_CreatedByAgentID_cursor
    FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_CreatedByAgentID_CreatedByAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_CreatedByAgentIDID, @CategoryID = @MJActions_CreatedByAgentID_CategoryID, @Name = @MJActions_CreatedByAgentID_Name, @Description = @MJActions_CreatedByAgentID_Description, @Type = @MJActions_CreatedByAgentID_Type, @UserPrompt = @MJActions_CreatedByAgentID_UserPrompt, @UserComments = @MJActions_CreatedByAgentID_UserComments, @Code = @MJActions_CreatedByAgentID_Code, @CodeComments = @MJActions_CreatedByAgentID_CodeComments, @CodeApprovalStatus = @MJActions_CreatedByAgentID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_CreatedByAgentID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_CreatedByAgentID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_CreatedByAgentID_CodeApprovedAt, @CodeLocked = @MJActions_CreatedByAgentID_CodeLocked, @ForceCodeGeneration = @MJActions_CreatedByAgentID_ForceCodeGeneration, @RetentionPeriod = @MJActions_CreatedByAgentID_RetentionPeriod, @Status = @MJActions_CreatedByAgentID_Status, @DriverClass = @MJActions_CreatedByAgentID_DriverClass, @ParentID = @MJActions_CreatedByAgentID_ParentID, @IconClass = @MJActions_CreatedByAgentID_IconClass, @DefaultCompactPromptID = @MJActions_CreatedByAgentID_DefaultCompactPromptID, @Config = @MJActions_CreatedByAgentID_Config, @RuntimeActionConfiguration = @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @CreatedByAgentID_Clear = 1, @CreatedByAgentID = @MJActions_CreatedByAgentID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_CreatedByAgentID_cursor
    DEALLOCATE cascade_update_MJActions_CreatedByAgentID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_AgentIDID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_AgentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_HiddenToUser bit
    DECLARE @MJConversationDetails_AgentID_UserRating int
    DECLARE @MJConversationDetails_AgentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_CompletionTime bigint
    DECLARE @MJConversationDetails_AgentID_IsPinned bit
    DECLARE @MJConversationDetails_AgentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_AgentID_AgentSessionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_TurnEndedAt datetimeoffset
    DECLARE @MJConversationDetails_AgentID_UtteranceStartMs int
    DECLARE @MJConversationDetails_AgentID_UtteranceEndMs int
    DECLARE @MJConversationDetails_AgentID_MediaType nvarchar(20)
    DECLARE cascade_update_MJConversationDetails_AgentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID], [TurnEndedAt], [UtteranceStartMs], [UtteranceEndMs], [MediaType]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJConversationDetails_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID, @MJConversationDetails_AgentID_TurnEndedAt, @MJConversationDetails_AgentID_UtteranceStartMs, @MJConversationDetails_AgentID_UtteranceEndMs, @MJConversationDetails_AgentID_MediaType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_AgentIDID, @ConversationID = @MJConversationDetails_AgentID_ConversationID, @ExternalID = @MJConversationDetails_AgentID_ExternalID, @Role = @MJConversationDetails_AgentID_Role, @Message = @MJConversationDetails_AgentID_Message, @Error = @MJConversationDetails_AgentID_Error, @HiddenToUser = @MJConversationDetails_AgentID_HiddenToUser, @UserRating = @MJConversationDetails_AgentID_UserRating, @UserFeedback = @MJConversationDetails_AgentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_AgentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_AgentID_UserID, @ArtifactID = @MJConversationDetails_AgentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_AgentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_AgentID_CompletionTime, @IsPinned = @MJConversationDetails_AgentID_IsPinned, @ParentID = @MJConversationDetails_AgentID_ParentID, @AgentID_Clear = 1, @AgentID = @MJConversationDetails_AgentID_AgentID, @Status = @MJConversationDetails_AgentID_Status, @SuggestedResponses = @MJConversationDetails_AgentID_SuggestedResponses, @TestRunID = @MJConversationDetails_AgentID_TestRunID, @ResponseForm = @MJConversationDetails_AgentID_ResponseForm, @ActionableCommands = @MJConversationDetails_AgentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_AgentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_AgentID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_AgentID_AgentSessionID, @TurnEndedAt = @MJConversationDetails_AgentID_TurnEndedAt, @UtteranceStartMs = @MJConversationDetails_AgentID_UtteranceStartMs, @UtteranceEndMs = @MJConversationDetails_AgentID_UtteranceEndMs, @MediaType = @MJConversationDetails_AgentID_MediaType

        FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID, @MJConversationDetails_AgentID_TurnEndedAt, @MJConversationDetails_AgentID_UtteranceStartMs, @MJConversationDetails_AgentID_UtteranceEndMs, @MJConversationDetails_AgentID_MediaType
    END

    CLOSE cascade_update_MJConversationDetails_AgentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_AgentID_cursor
    
    -- Cascade delete from ConversationWidgetInstance using cursor to call spDeleteConversationWidgetInstance
    DECLARE @MJConversationWidgetInstances_PinnedAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationWidgetInstance]
        WHERE [PinnedAgentID] = @ID
    
    OPEN cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor INTO @MJConversationWidgetInstances_PinnedAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationWidgetInstance] @ID = @MJConversationWidgetInstances_PinnedAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor INTO @MJConversationWidgetInstances_PinnedAgentIDID
    END
    
    CLOSE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    DEALLOCATE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_DefaultAgentIDID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_UserID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ExternalID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_Name nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_Description nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_Type nvarchar(50)
    DECLARE @MJConversations_DefaultAgentID_IsArchived bit
    DECLARE @MJConversations_DefaultAgentID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_DataContextID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_Status nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ProjectID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_IsPinned bit
    DECLARE @MJConversations_DefaultAgentID_TestRunID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_EgressID nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_VisitorKey nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_LastConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_DefaultAgentID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [DefaultAgentID] = @ID

    OPEN cascade_update_MJConversations_DefaultAgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_DefaultAgentID_DefaultAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_DefaultAgentIDID, @UserID = @MJConversations_DefaultAgentID_UserID, @ExternalID = @MJConversations_DefaultAgentID_ExternalID, @Name = @MJConversations_DefaultAgentID_Name, @Description = @MJConversations_DefaultAgentID_Description, @Type = @MJConversations_DefaultAgentID_Type, @IsArchived = @MJConversations_DefaultAgentID_IsArchived, @LinkedEntityID = @MJConversations_DefaultAgentID_LinkedEntityID, @LinkedRecordID = @MJConversations_DefaultAgentID_LinkedRecordID, @DataContextID = @MJConversations_DefaultAgentID_DataContextID, @Status = @MJConversations_DefaultAgentID_Status, @EnvironmentID = @MJConversations_DefaultAgentID_EnvironmentID, @ProjectID = @MJConversations_DefaultAgentID_ProjectID, @IsPinned = @MJConversations_DefaultAgentID_IsPinned, @TestRunID = @MJConversations_DefaultAgentID_TestRunID, @ApplicationScope = @MJConversations_DefaultAgentID_ApplicationScope, @ApplicationID = @MJConversations_DefaultAgentID_ApplicationID, @DefaultAgentID_Clear = 1, @DefaultAgentID = @MJConversations_DefaultAgentID_DefaultAgentID, @AdditionalData = @MJConversations_DefaultAgentID_AdditionalData, @RecordingFileID = @MJConversations_DefaultAgentID_RecordingFileID, @EgressID = @MJConversations_DefaultAgentID_EgressID, @VisitorKey = @MJConversations_DefaultAgentID_VisitorKey, @LastConversationID = @MJConversations_DefaultAgentID_LastConversationID

        FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID
    END

    CLOSE cascade_update_MJConversations_DefaultAgentID_cursor
    DEALLOCATE cascade_update_MJConversations_DefaultAgentID_cursor
    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument
    DECLARE @MJEntityDocuments_ReasoningAgentIDID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Name nvarchar(250)
    DECLARE @MJEntityDocuments_ReasoningAgentID_TypeID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_EntityID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Status nvarchar(15)
    DECLARE @MJEntityDocuments_ReasoningAgentID_TemplateID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_AIModelID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_VectorIndexID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Configuration nvarchar(MAX)
    DECLARE @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning bit
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningMode nvarchar(20)
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_AutomationLevel nvarchar(30)
    DECLARE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [TypeID], [EntityID], [VectorDatabaseID], [Status], [TemplateID], [AIModelID], [PotentialMatchThreshold], [AbsoluteMatchThreshold], [VectorIndexID], [Configuration], [EnableLLMReasoning], [ReasoningMode], [ReasoningThreshold], [ReasoningPromptID], [ReasoningAgentID], [AutomationLevel]
        FROM [${flyway:defaultSchema}].[EntityDocument]
        WHERE [ReasoningAgentID] = @ID

    OPEN cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningAgentID_cursor INTO @MJEntityDocuments_ReasoningAgentIDID, @MJEntityDocuments_ReasoningAgentID_Name, @MJEntityDocuments_ReasoningAgentID_TypeID, @MJEntityDocuments_ReasoningAgentID_EntityID, @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @MJEntityDocuments_ReasoningAgentID_Status, @MJEntityDocuments_ReasoningAgentID_TemplateID, @MJEntityDocuments_ReasoningAgentID_AIModelID, @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @MJEntityDocuments_ReasoningAgentID_Configuration, @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @MJEntityDocuments_ReasoningAgentID_AutomationLevel

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateEntityDocument] @ID = @MJEntityDocuments_ReasoningAgentIDID, @Name = @MJEntityDocuments_ReasoningAgentID_Name, @TypeID = @MJEntityDocuments_ReasoningAgentID_TypeID, @EntityID = @MJEntityDocuments_ReasoningAgentID_EntityID, @VectorDatabaseID = @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @Status = @MJEntityDocuments_ReasoningAgentID_Status, @TemplateID = @MJEntityDocuments_ReasoningAgentID_TemplateID, @AIModelID = @MJEntityDocuments_ReasoningAgentID_AIModelID, @PotentialMatchThreshold = @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @AbsoluteMatchThreshold = @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @VectorIndexID = @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @Configuration = @MJEntityDocuments_ReasoningAgentID_Configuration, @EnableLLMReasoning = @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @ReasoningMode = @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @ReasoningThreshold = @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @ReasoningPromptID = @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @ReasoningAgentID_Clear = 1, @ReasoningAgentID = @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @AutomationLevel = @MJEntityDocuments_ReasoningAgentID_AutomationLevel

        FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningAgentID_cursor INTO @MJEntityDocuments_ReasoningAgentIDID, @MJEntityDocuments_ReasoningAgentID_Name, @MJEntityDocuments_ReasoningAgentID_TypeID, @MJEntityDocuments_ReasoningAgentID_EntityID, @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @MJEntityDocuments_ReasoningAgentID_Status, @MJEntityDocuments_ReasoningAgentID_TemplateID, @MJEntityDocuments_ReasoningAgentID_AIModelID, @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @MJEntityDocuments_ReasoningAgentID_Configuration, @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @MJEntityDocuments_ReasoningAgentID_AutomationLevel
    END

    CLOSE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    DEALLOCATE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_AgentIDID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_AgentID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_AgentID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_AgentID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_AgentID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_AgentID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_AgentID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_AgentID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_AgentID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_BatchSize int
    DECLARE @MJRecordProcesses_AgentID_MaxConcurrency int
    DECLARE @MJRecordProcesses_AgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_AgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJRecordProcesses_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_AgentID_cursor INTO @MJRecordProcesses_AgentIDID, @MJRecordProcesses_AgentID_Name, @MJRecordProcesses_AgentID_Description, @MJRecordProcesses_AgentID_CategoryID, @MJRecordProcesses_AgentID_EntityID, @MJRecordProcesses_AgentID_Status, @MJRecordProcesses_AgentID_WorkType, @MJRecordProcesses_AgentID_ActionID, @MJRecordProcesses_AgentID_AgentID, @MJRecordProcesses_AgentID_PromptID, @MJRecordProcesses_AgentID_ScopeType, @MJRecordProcesses_AgentID_ScopeViewID, @MJRecordProcesses_AgentID_ScopeListID, @MJRecordProcesses_AgentID_ScopeFilter, @MJRecordProcesses_AgentID_OnChangeEnabled, @MJRecordProcesses_AgentID_OnChangeInvocationType, @MJRecordProcesses_AgentID_OnChangeFilter, @MJRecordProcesses_AgentID_ScheduleEnabled, @MJRecordProcesses_AgentID_CronExpression, @MJRecordProcesses_AgentID_Timezone, @MJRecordProcesses_AgentID_OnDemandEnabled, @MJRecordProcesses_AgentID_InputMapping, @MJRecordProcesses_AgentID_OutputMapping, @MJRecordProcesses_AgentID_SkipUnchanged, @MJRecordProcesses_AgentID_WatermarkStrategy, @MJRecordProcesses_AgentID_BatchSize, @MJRecordProcesses_AgentID_MaxConcurrency, @MJRecordProcesses_AgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_AgentIDID, @Name = @MJRecordProcesses_AgentID_Name, @Description = @MJRecordProcesses_AgentID_Description, @CategoryID = @MJRecordProcesses_AgentID_CategoryID, @EntityID = @MJRecordProcesses_AgentID_EntityID, @Status = @MJRecordProcesses_AgentID_Status, @WorkType = @MJRecordProcesses_AgentID_WorkType, @ActionID = @MJRecordProcesses_AgentID_ActionID, @AgentID_Clear = 1, @AgentID = @MJRecordProcesses_AgentID_AgentID, @PromptID = @MJRecordProcesses_AgentID_PromptID, @ScopeType = @MJRecordProcesses_AgentID_ScopeType, @ScopeViewID = @MJRecordProcesses_AgentID_ScopeViewID, @ScopeListID = @MJRecordProcesses_AgentID_ScopeListID, @ScopeFilter = @MJRecordProcesses_AgentID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_AgentID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_AgentID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_AgentID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_AgentID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_AgentID_CronExpression, @Timezone = @MJRecordProcesses_AgentID_Timezone, @OnDemandEnabled = @MJRecordProcesses_AgentID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_AgentID_InputMapping, @OutputMapping = @MJRecordProcesses_AgentID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_AgentID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_AgentID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_AgentID_BatchSize, @MaxConcurrency = @MJRecordProcesses_AgentID_MaxConcurrency, @Configuration = @MJRecordProcesses_AgentID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_AgentID_cursor INTO @MJRecordProcesses_AgentIDID, @MJRecordProcesses_AgentID_Name, @MJRecordProcesses_AgentID_Description, @MJRecordProcesses_AgentID_CategoryID, @MJRecordProcesses_AgentID_EntityID, @MJRecordProcesses_AgentID_Status, @MJRecordProcesses_AgentID_WorkType, @MJRecordProcesses_AgentID_ActionID, @MJRecordProcesses_AgentID_AgentID, @MJRecordProcesses_AgentID_PromptID, @MJRecordProcesses_AgentID_ScopeType, @MJRecordProcesses_AgentID_ScopeViewID, @MJRecordProcesses_AgentID_ScopeListID, @MJRecordProcesses_AgentID_ScopeFilter, @MJRecordProcesses_AgentID_OnChangeEnabled, @MJRecordProcesses_AgentID_OnChangeInvocationType, @MJRecordProcesses_AgentID_OnChangeFilter, @MJRecordProcesses_AgentID_ScheduleEnabled, @MJRecordProcesses_AgentID_CronExpression, @MJRecordProcesses_AgentID_Timezone, @MJRecordProcesses_AgentID_OnDemandEnabled, @MJRecordProcesses_AgentID_InputMapping, @MJRecordProcesses_AgentID_OutputMapping, @MJRecordProcesses_AgentID_SkipUnchanged, @MJRecordProcesses_AgentID_WatermarkStrategy, @MJRecordProcesses_AgentID_BatchSize, @MJRecordProcesses_AgentID_MaxConcurrency, @MJRecordProcesses_AgentID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_AgentID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_AgentID_cursor
    
    -- Cascade update on SearchExecutionLog using cursor to call spUpdateSearchExecutionLog
    DECLARE @MJSearchExecutionLogs_AIAgentIDID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_SearchScopeID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_UserID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_AIAgentID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_Query nvarchar(MAX)
    DECLARE @MJSearchExecutionLogs_AIAgentID_TotalDurationMs int
    DECLARE @MJSearchExecutionLogs_AIAgentID_ResultCount int
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerName nvarchar(100)
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerCostCents decimal(10, 4)
    DECLARE @MJSearchExecutionLogs_AIAgentID_Status nvarchar(20)
    DECLARE @MJSearchExecutionLogs_AIAgentID_FailureReason nvarchar(500)
    DECLARE @MJSearchExecutionLogs_AIAgentID_ProvidersJSON nvarchar(MAX)
    DECLARE @MJSearchExecutionLogs_AIAgentID_AISkillID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON nvarchar(MAX)
    DECLARE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor CURSOR FOR
        SELECT [ID], [SearchScopeID], [UserID], [AIAgentID], [Query], [TotalDurationMs], [ResultCount], [RerankerName], [RerankerCostCents], [Status], [FailureReason], [ProvidersJSON], [AISkillID], [PrimaryScopeRecordID], [ScopeDecisionJSON]
        FROM [${flyway:defaultSchema}].[SearchExecutionLog]
        WHERE [AIAgentID] = @ID

    OPEN cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @MJSearchExecutionLogs_AIAgentID_AISkillID, @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJSearchExecutionLogs_AIAgentID_AIAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] @ID = @MJSearchExecutionLogs_AIAgentIDID, @SearchScopeID = @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @UserID = @MJSearchExecutionLogs_AIAgentID_UserID, @AIAgentID_Clear = 1, @AIAgentID = @MJSearchExecutionLogs_AIAgentID_AIAgentID, @Query = @MJSearchExecutionLogs_AIAgentID_Query, @TotalDurationMs = @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @ResultCount = @MJSearchExecutionLogs_AIAgentID_ResultCount, @RerankerName = @MJSearchExecutionLogs_AIAgentID_RerankerName, @RerankerCostCents = @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @Status = @MJSearchExecutionLogs_AIAgentID_Status, @FailureReason = @MJSearchExecutionLogs_AIAgentID_FailureReason, @ProvidersJSON = @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @AISkillID = @MJSearchExecutionLogs_AIAgentID_AISkillID, @PrimaryScopeRecordID = @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @ScopeDecisionJSON = @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON

        FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @MJSearchExecutionLogs_AIAgentID_AISkillID, @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON
    END

    CLOSE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    DEALLOCATE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_AgentIDID uniqueidentifier
    DECLARE @MJTasks_AgentID_ParentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Name nvarchar(255)
    DECLARE @MJTasks_AgentID_Description nvarchar(MAX)
    DECLARE @MJTasks_AgentID_TypeID uniqueidentifier
    DECLARE @MJTasks_AgentID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_AgentID_ProjectID uniqueidentifier
    DECLARE @MJTasks_AgentID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_AgentID_UserID uniqueidentifier
    DECLARE @MJTasks_AgentID_AgentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Status nvarchar(50)
    DECLARE @MJTasks_AgentID_PercentComplete int
    DECLARE @MJTasks_AgentID_DueAt datetimeoffset
    DECLARE @MJTasks_AgentID_StartedAt datetimeoffset
    DECLARE @MJTasks_AgentID_CompletedAt datetimeoffset
    DECLARE @MJTasks_AgentID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_AgentID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_AgentID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_AgentID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_AgentID_ActionID uniqueidentifier
    DECLARE @MJTasks_AgentID_StepType nvarchar(20)
    DECLARE @MJTasks_AgentID_PromptID uniqueidentifier
    DECLARE @MJTasks_AgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_AgentID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJTasks_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt, @MJTasks_AgentID_InputPayload, @MJTasks_AgentID_OutputPayload, @MJTasks_AgentID_ErrorMessage, @MJTasks_AgentID_AgentRunID, @MJTasks_AgentID_ClaimedBy, @MJTasks_AgentID_ClaimExpiresAt, @MJTasks_AgentID_ActionID, @MJTasks_AgentID_StepType, @MJTasks_AgentID_PromptID, @MJTasks_AgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentIDID, @ParentID = @MJTasks_AgentID_ParentID, @Name = @MJTasks_AgentID_Name, @Description = @MJTasks_AgentID_Description, @TypeID = @MJTasks_AgentID_TypeID, @EnvironmentID = @MJTasks_AgentID_EnvironmentID, @ProjectID = @MJTasks_AgentID_ProjectID, @ConversationDetailID = @MJTasks_AgentID_ConversationDetailID, @UserID = @MJTasks_AgentID_UserID, @AgentID_Clear = 1, @AgentID = @MJTasks_AgentID_AgentID, @Status = @MJTasks_AgentID_Status, @PercentComplete = @MJTasks_AgentID_PercentComplete, @DueAt = @MJTasks_AgentID_DueAt, @StartedAt = @MJTasks_AgentID_StartedAt, @CompletedAt = @MJTasks_AgentID_CompletedAt, @InputPayload = @MJTasks_AgentID_InputPayload, @OutputPayload = @MJTasks_AgentID_OutputPayload, @ErrorMessage = @MJTasks_AgentID_ErrorMessage, @AgentRunID = @MJTasks_AgentID_AgentRunID, @ClaimedBy = @MJTasks_AgentID_ClaimedBy, @ClaimExpiresAt = @MJTasks_AgentID_ClaimExpiresAt, @ActionID = @MJTasks_AgentID_ActionID, @StepType = @MJTasks_AgentID_StepType, @PromptID = @MJTasks_AgentID_PromptID, @Configuration = @MJTasks_AgentID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt, @MJTasks_AgentID_InputPayload, @MJTasks_AgentID_OutputPayload, @MJTasks_AgentID_ErrorMessage, @MJTasks_AgentID_AgentRunID, @MJTasks_AgentID_ClaimedBy, @MJTasks_AgentID_ClaimExpiresAt, @MJTasks_AgentID_ActionID, @MJTasks_AgentID_StepType, @MJTasks_AgentID_PromptID, @MJTasks_AgentID_Configuration
    END

    CLOSE cascade_update_MJTasks_AgentID_cursor
    DEALLOCATE cascade_update_MJTasks_AgentID_cursor
    

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 7 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6fa02f03-b048-4d11-9a4a-d1adb9b7fd9b' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = 'Persona')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6fa02f03-b048-4d11-9a4a-d1adb9b7fd9b',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
            'Persona',
            'Persona',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f262e151-8f52-4941-8edd-0d2580ecf7b5' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = 'Vendor')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f262e151-8f52-4941-8edd-0d2580ecf7b5',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
            'Vendor',
            'Vendor',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a26d8752-44e8-47c3-8421-e78e9c6d42b9' OR (EntityID = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND Name = 'Modality')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a26d8752-44e8-47c3-8421-e78e9c6d42b9',
            '635C7C9A-7BBB-4836-AA19-3E54963E2821', -- Entity: MJ: AI Persona Vendors
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821'),
            'Modality',
            'Modality',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd63951f5-6b12-40ed-9d2b-1c68588eb4d2' OR (EntityID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND Name = 'Agent')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd63951f5-6b12-40ed-9d2b-1c68588eb4d2',
            '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', -- Entity: MJ: AI Agent Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'),
            'Agent',
            'Agent',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '000ca8cc-8b73-434b-80ea-526bff10e961' OR (EntityID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND Name = 'Persona')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '000ca8cc-8b73-434b-80ea-526bff10e961',
            '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', -- Entity: MJ: AI Agent Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'),
            'Persona',
            'Persona',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'adc1e670-a51c-460c-9dcc-a24c4d2351a8' OR (EntityID = 'D5493024-2F38-47A5-A6F2-B468A64640AD' AND Name = 'Model')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'adc1e670-a51c-460c-9dcc-a24c4d2351a8',
            'D5493024-2F38-47A5-A6F2-B468A64640AD', -- Entity: MJ: AI Model Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD'),
            'Model',
            'Model',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'daa56b48-5ce8-4bb3-95ef-f580f40acb98' OR (EntityID = 'D5493024-2F38-47A5-A6F2-B468A64640AD' AND Name = 'Persona')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'daa56b48-5ce8-4bb3-95ef-f580f40acb98',
            'D5493024-2F38-47A5-A6F2-B468A64640AD', -- Entity: MJ: AI Model Personas
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD'),
            'Persona',
            'Persona',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'ADC1E670-A51C-460C-9DCC-A24C4D2351A8'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DAA56B48-5CE8-4BB3-95EF-F580F40ACB98'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'D5493024-2F38-47A5-A6F2-B468A64640AD'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6F741722-013E-4551-A5E8-506D9D8A309A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C5D53F8D-75F7-4EAB-882B-44261D365850'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4A410ED1-D8B0-44C6-9F5D-EAA389892281'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '23D2B51A-BBBF-475D-B8C4-C76C8AEE8EAC'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BEA85BD4-8A56-4A36-9F9C-CBFC3DDA74CB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D63951F5-6B12-40ED-9D2B-1C68588EB4D2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '000CA8CC-8B73-434B-80EA-526BFF10E961'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '762BBCA5-5130-416A-B9A6-9114F5AFE49A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '00A1881D-E905-4B3D-924D-3D00FA5B3831'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6FA02F03-B048-4D11-9A4A-D1ADB9B7FD9B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F262E151-8F52-4941-8EDD-0D2580ECF7B5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A26D8752-44E8-47C3-8421-E78E9C6D42B9'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '635C7C9A-7BBB-4836-AA19-3E54963E2821'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: AI Model Personas.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '37E96E38-B373-451B-8487-D73681F580D7';

-- UPDATE Entity Field Category Info MJ: AI Model Personas.ModelID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F0FCAA21-4659-4115-BC14-8B5E30A6CE47';

-- UPDATE Entity Field Category Info MJ: AI Model Personas.PersonaID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3F9B2C22-2608-43A1-BFDC-F8E22DDA7607';

-- UPDATE Entity Field Category Info MJ: AI Model Personas.Model 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ADC1E670-A51C-460C-9DCC-A24C4D2351A8';

-- UPDATE Entity Field Category Info MJ: AI Model Personas.Persona 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Model Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DAA56B48-5CE8-4BB3-95EF-F580F40ACB98';

-- UPDATE Entity Field Category Info MJ: AI Model Personas.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '805FF8DB-A380-40D8-8393-C06A5919BEA2';

-- UPDATE Entity Field Category Info MJ: AI Model Personas.IsSupported 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9A99F042-412C-44CA-AC2E-44A3782D5C04';

-- UPDATE Entity Field Category Info MJ: AI Model Personas.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CA7CC6FD-FE5C-44B0-A0EA-A60615E6F272';

-- UPDATE Entity Field Category Info MJ: AI Model Personas.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7BB6AEA4-E2CF-4C18-A3F6-D50BD1B516EE';

/* Set entity icon to fa fa-robot */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-robot', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('394cf139-0cf5-5af3-a324-ea17f1416b53', 'D5493024-2F38-47A5-A6F2-B468A64640AD', 'FieldCategoryInfo', '{
  "Model Configuration": {
    "description": "Core configuration linking models and personas",
    "icon": "fa fa-cogs"
  },
  "Persona Settings": {
    "description": "Behavioral overrides and sequence settings for personas",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "Audit and system tracking information",
    "icon": "fa fa-database"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('db1d249e-38d7-5a0a-b780-5b93e8a754d7', 'D5493024-2F38-47A5-A6F2-B468A64640AD', 'FieldCategoryIcons', '{
  "Model Configuration": "fa fa-cogs",
  "Persona Settings": "fa fa-sliders-h",
  "System Metadata": "fa fa-database"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D5493024-2F38-47A5-A6F2-B468A64640AD';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Personas.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9470AA6C-D0DF-4F82-AD02-3827035EB4BF';

-- UPDATE Entity Field Category Info MJ: AI Agent Personas.AgentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Agent Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent'
WHERE 
   ID = '3B6BB30E-8167-4B25-98D4-FB848BCE3B0A';

-- UPDATE Entity Field Category Info MJ: AI Agent Personas.Agent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Agent Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Name'
WHERE 
   ID = 'D63951F5-6B12-40ED-9D2B-1C68588EB4D2';

-- UPDATE Entity Field Category Info MJ: AI Agent Personas.PersonaID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Persona'
WHERE 
   ID = '895CF419-BFB2-4757-99BE-7B7CD0AC10D0';

-- UPDATE Entity Field Category Info MJ: AI Agent Personas.Persona 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Persona Name'
WHERE 
   ID = '000CA8CC-8B73-434B-80EA-526BFF10E961';

-- UPDATE Entity Field Category Info MJ: AI Agent Personas.IsDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Is Default Persona'
WHERE 
   ID = '739B9C0B-AF35-4583-A6BD-B73DD3E968EE';

-- UPDATE Entity Field Category Info MJ: AI Agent Personas.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Display Sequence'
WHERE 
   ID = '77034075-2726-428E-90E7-28A053770477';

-- UPDATE Entity Field Category Info MJ: AI Agent Personas.IsAllowed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BEA85BD4-8A56-4A36-9F9C-CBFC3DDA74CB';

-- UPDATE Entity Field Category Info MJ: AI Agent Personas.StyleOverride 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'BD1B121A-8FB8-4EBA-B267-B96ED660D771';

-- UPDATE Entity Field Category Info MJ: AI Agent Personas.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '657584E2-F6D8-4C03-9FEC-608669B6C8DD';

-- UPDATE Entity Field Category Info MJ: AI Agent Personas.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F4F81067-8D83-4AE7-B660-B5BFFAB1F563';

/* Set entity icon to fa fa-robot */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-robot', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('088216a4-05c9-52a4-924c-53c9091d37f1', '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', 'FieldCategoryInfo', '{
  "Agent Assignment": {
    "description": "Links persona configurations to specific AI agents",
    "icon": "fa fa-user-cog"
  },
  "Persona Configuration": {
    "description": "Settings defining which personas are allowed, their order, and default status",
    "icon": "fa fa-mask"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('92d4ed3a-5b4d-5881-8f18-00a905c9862b', '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2', 'FieldCategoryIcons', '{
  "Agent Assignment": "fa fa-user-cog",
  "Persona Configuration": "fa fa-mask",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '90C6B2D1-9AD8-40A8-9C2C-4DF9433D58C2';

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3DAB4E55-20F4-4823-84E8-AE33B10EE7FD';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.PersonaID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Persona'
WHERE 
   ID = '1D59BAC0-BEC8-486A-8AA0-B6D879717D54';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.VendorID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Vendor'
WHERE 
   ID = '1DFAA00B-8728-433F-B340-CA39AA30D994';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.ModalityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Modality'
WHERE 
   ID = '0382F312-1A8B-471A-BCF6-85C15564ADB6';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.Persona 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Persona Name'
WHERE 
   ID = '6FA02F03-B048-4D11-9A4A-D1ADB9B7FD9B';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.Vendor 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Vendor Name'
WHERE 
   ID = 'F262E151-8F52-4941-8EDD-0D2580ECF7B5';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.Modality 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Binding Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Modality Name'
WHERE 
   ID = 'A26D8752-44E8-47C3-8421-E78E9C6D42B9';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.APIName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'API Asset Name'
WHERE 
   ID = '5EF1F517-3851-4288-8B76-F87D58AABD80';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '762BBCA5-5130-416A-B9A6-9114F5AFE49A';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '00A1881D-E905-4B3D-924D-3D00FA5B3831';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.VendorSettings 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'AE34C006-1518-432B-BF79-CFAFA804EAE1';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '32F04D06-81B1-47A6-9E9A-29F045B84DF3';

-- UPDATE Entity Field Category Info MJ: AI Persona Vendors.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D2408D59-789F-4FBB-B058-A91AC6089946';

/* Set entity icon to fa fa-robot */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-robot', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('632d9cc5-c198-52e4-8fbb-86c5987c5427', '635C7C9A-7BBB-4836-AA19-3E54963E2821', 'FieldCategoryInfo', '{
  "Binding Details": {
    "description": "Associations between personas, vendors, and modalities",
    "icon": "fa fa-link"
  },
  "Configuration": {
    "description": "Operational settings, API identifiers, and vendor-specific configurations",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b79d5379-7dfb-59cc-9ff0-d2c750bb8209', '635C7C9A-7BBB-4836-AA19-3E54963E2821', 'FieldCategoryIcons', '{
  "Binding Details": "fa fa-link",
  "Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '635C7C9A-7BBB-4836-AA19-3E54963E2821';

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: AI Personas.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F7B0C681-1B1C-46C4-9F05-988A5EF1BCC0';

-- UPDATE Entity Field Category Info MJ: AI Personas.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '23D2B51A-BBBF-475D-B8C4-C76C8AEE8EAC';

-- UPDATE Entity Field Category Info MJ: AI Personas.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '80A40F20-7DC7-497E-B051-5021F7E9C044';

-- UPDATE Entity Field Category Info MJ: AI Personas.PerceivedGender 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '22DE81FB-395D-41B3-8503-879FB54F2250';

-- UPDATE Entity Field Category Info MJ: AI Personas.Locale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CCF7E6BA-FDC0-4BC9-BF41-22858D76176B';

-- UPDATE Entity Field Category Info MJ: AI Personas.PerceivedAgeRangeMin 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6EE48035-7F69-48F7-9D34-4F966A8C291E';

-- UPDATE Entity Field Category Info MJ: AI Personas.PerceivedAgeRangeMax 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Persona Identity',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3A205792-CB2B-4F16-917A-25512384715D';

-- UPDATE Entity Field Category Info MJ: AI Personas.Tone 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavioral Traits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6F741722-013E-4551-A5E8-506D9D8A309A';

-- UPDATE Entity Field Category Info MJ: AI Personas.SpeakingStyle 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavioral Traits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B8F16CC5-7DE8-4309-8244-CCD391E53EA2';

-- UPDATE Entity Field Category Info MJ: AI Personas.StyleDescriptors 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavioral Traits',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '4FFF00F3-0924-43A7-AD80-45E76EAA8EC0';

-- UPDATE Entity Field Category Info MJ: AI Personas.PreviewAudioURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Media Assets',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL'
WHERE 
   ID = '23D1B05B-677D-4AC2-BD72-1C555F165308';

-- UPDATE Entity Field Category Info MJ: AI Personas.PreviewImageURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Media Assets',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Image'
WHERE 
   ID = 'AEEEFC0F-4143-48FB-A96C-B6A82521571E';

-- UPDATE Entity Field Category Info MJ: AI Personas.PreviewVideoURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Media Assets',
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL'
WHERE 
   ID = 'C76C1148-A756-45D3-BB19-8D7E0E15BA7F';

-- UPDATE Entity Field Category Info MJ: AI Personas.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C5D53F8D-75F7-4EAB-882B-44261D365850';

-- UPDATE Entity Field Category Info MJ: AI Personas.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4A410ED1-D8B0-44C6-9F5D-EAA389892281';

-- UPDATE Entity Field Category Info MJ: AI Personas.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C307133B-1FC8-4BBB-BB4C-A54821F2F062';

-- UPDATE Entity Field Category Info MJ: AI Personas.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4F0AD789-724F-401E-B602-8DCFF106BDA2';

/* Set entity icon to fa fa-user-circle */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-user-circle', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0fe01aa5-11eb-5bf5-b68c-3bec36ec4212', '99F3E501-8443-4C39-9D4C-77F712B1ACA1', 'FieldCategoryInfo', '{
  "Behavioral Traits": {
    "description": "Parameters defining the persona''s conversational tone and speaking style",
    "icon": "fa fa-comment-dots"
  },
  "Configuration": {
    "description": "Operational settings and source provenance for the persona",
    "icon": "fa fa-sliders-h"
  },
  "Media Assets": {
    "description": "Visual and auditory files used for persona previews",
    "icon": "fa fa-photo-video"
  },
  "Persona Identity": {
    "description": "Core identifying characteristics and demographic traits of the persona",
    "icon": "fa fa-id-card"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('d2f41b60-c9eb-51e3-87f8-65e826dfdf0b', '99F3E501-8443-4C39-9D4C-77F712B1ACA1', 'FieldCategoryIcons', '{
  "Behavioral Traits": "fa fa-comment-dots",
  "Configuration": "fa fa-sliders-h",
  "Media Assets": "fa fa-photo-video",
  "Persona Identity": "fa fa-id-card",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '99F3E501-8443-4C39-9D4C-77F712B1ACA1';

/* Generated Validation Functions for MJ: AI Model Price Unit Types */
-- CHECK constraint for MJ: AI Model Price Unit Types: Field: UnitsPerBillingUnit was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '3673CBAF-ED88-4821-AD64-8B1DEFAEC033'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('68b7ce7a-73b3-48a4-94d7-4a11bad9d468', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([UnitsPerBillingUnit]>(0))', 'public ValidateUnitsPerBillingUnitGreaterThanZero(result: ValidationResult) {
	if (this.UnitsPerBillingUnit != null && this.UnitsPerBillingUnit <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"UnitsPerBillingUnit",
			"Units per billing unit must be greater than zero.",
			this.UnitsPerBillingUnit,
			ValidationErrorType.Failure
		));
	}
}', 'Units per billing unit must be greater than zero to ensure valid billing calculations.', 'ValidateUnitsPerBillingUnitGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '3673CBAF-ED88-4821-AD64-8B1DEFAEC033')
   END;

/* Generated Validation Functions for MJ: AI Prompt Runs */
-- CHECK constraint for MJ: AI Prompt Runs: Field: InputUnitsUsed was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '80751109-3D30-4FA2-AFB5-670CCC940D5F'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('bdb37b56-e8d1-4385-bdc0-c818c8f60e63', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([InputUnitsUsed]>=(0))', 'public ValidateInputUnitsUsedGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.InputUnitsUsed != null && this.InputUnitsUsed < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"InputUnitsUsed",
			"Input units used must be greater than or equal to zero.",
			this.InputUnitsUsed,
			ValidationErrorType.Failure
		));
	}
}', 'Input units used must be greater than or equal to zero to ensure usage is not recorded as a negative value.', 'ValidateInputUnitsUsedGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '80751109-3D30-4FA2-AFB5-670CCC940D5F')
   END;

-- CHECK constraint for MJ: AI Prompt Runs: Field: OutputUnitsUsed was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '403E5F99-370B-4D05-AB5A-E35DEDF41E27'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('cf715bd1-e453-4b18-916d-dad016c7ba36', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([OutputUnitsUsed]>=(0))', 'public ValidateOutputUnitsUsedGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.OutputUnitsUsed != null && this.OutputUnitsUsed < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"OutputUnitsUsed",
			"Output units used must be greater than or equal to 0.",
			this.OutputUnitsUsed,
			ValidationErrorType.Failure
		));
	}
}', 'The number of output units used cannot be negative, ensuring accurate tracking of resource usage.', 'ValidateOutputUnitsUsedGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '403E5F99-370B-4D05-AB5A-E35DEDF41E27')
   END;

/* Generated Validation Functions for MJ: Form Chrome Rules */
-- CHECK constraint for MJ: Form Chrome Rules @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '53695C5D-E659-4025-825A-23C5FA873B6A'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('34e5025c-d07d-43e2-b74b-f438ce8e2db1', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([TargetKind]=''Relationship'' AND [RelatedEntityID] IS NOT NULL AND [ContributionKey] IS NULL OR [TargetKind]=''Contribution'' AND [ContributionKey] IS NOT NULL AND [RelatedEntityID] IS NULL)', 'public ValidateTargetKindDependencies(result: ValidationResult) {
	if (this.TargetKind === "Relationship") {
		if (this.RelatedEntityID == null || this.ContributionKey != null) {
			result.Errors.push(new ValidationErrorInfo(
				"TargetKind",
				"When Target Kind is ''Relationship'', Related Entity ID must be provided and Contribution Key must be empty.",
				this.TargetKind,
				ValidationErrorType.Failure
			));
		}
	} else if (this.TargetKind === "Contribution") {
		if (this.ContributionKey == null || this.RelatedEntityID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"TargetKind",
				"When Target Kind is ''Contribution'', Contribution Key must be provided and Related Entity ID must be empty.",
				this.TargetKind,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Ensures that if the target kind is ''Relationship'', a related entity is specified and the contribution key is left empty. Conversely, if the target kind is ''Contribution'', a contribution key must be provided and the related entity must be left empty.', 'ValidateTargetKindDependencies', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '53695C5D-E659-4025-825A-23C5FA873B6A')
   END;
