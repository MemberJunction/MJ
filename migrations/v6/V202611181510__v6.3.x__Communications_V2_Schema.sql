-- ============================================================================
-- Communications V2 — principals, senders, endpoints, preferences, suppression,
-- activity and metadata-driven compliance (regimes + jurisdictions)
-- ============================================================================
-- Design: "MJ Comms V2 — Design Plan: Principals, Preferences & Compliance"
--
-- Additive only:
--   * 20 new tables (2 generic: Jurisdiction, JurisdictionMember;
--     plus CommunicationProviderEvent and CommunicationSendingDomain)
--   * new columns on EntityCommunicationMessageType, CommunicationLog,
--     and CommunicationProvider
--   * CHECK / UNIQUE constraints, non-FK supporting indexes, descriptions
--
-- CodeGen owns: __mj_CreatedAt/__mj_UpdatedAt, FK indexes, views, procedures,
-- EntityField rows, value lists (from the CHECK constraints) and generated classes.
--
-- Shipped separately as /metadata JSON (NOT in this migration):
--   * polymorphic FK decorations (EntityIDFieldName) — see
--     metadata/entities/.polymorphic-fk-entity-fields.json additions in the plan
--   * seed rows: the default "Company" sender type over MJ: Companies, MJ: Users
--     as a built-in principal, jurisdictions (countries, EU/EEA groups), rule
--     types and starter regimes
--
-- NULL-scope uniqueness: SQL Server UNIQUE constraints treat NULLs as equal, which
-- is the intended semantics here (one "all senders" row per scope). The release
-- build's PostgreSQL conversion must emit NULLS NOT DISTINCT for those constraints.
--
-- PostgreSQL counterpart is produced by the release build.
-- ============================================================================


-- ===========================================================================
-- 1. JURISDICTIONS (generic core — usable beyond communications)
-- ===========================================================================

CREATE TABLE ${flyway:defaultSchema}.Jurisdiction (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Jurisdiction_ID DEFAULT NEWSEQUENTIALID(),
    Code NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Name NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Description NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Type NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    CountryID UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_Jurisdiction_Status DEFAULT 'Active',
    CONSTRAINT PK_Jurisdiction PRIMARY KEY (ID),
    CONSTRAINT UQ_Jurisdiction_Code UNIQUE (Code),
    CONSTRAINT FK_Jurisdiction_Country FOREIGN KEY (CountryID) REFERENCES ${flyway:defaultSchema}.Country(ID),
    CONSTRAINT CK_Jurisdiction_Type CHECK (Type IN ('Country', 'Subdivision', 'Group')),
    CONSTRAINT CK_Jurisdiction_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

CREATE TABLE ${flyway:defaultSchema}.JurisdictionMember (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_JurisdictionMember_ID DEFAULT NEWSEQUENTIALID(),
    GroupJurisdictionID UNIQUEIDENTIFIER NOT NULL,
    MemberJurisdictionID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_JurisdictionMember PRIMARY KEY (ID),
    CONSTRAINT UQ_JurisdictionMember_Pair UNIQUE (GroupJurisdictionID, MemberJurisdictionID),
    CONSTRAINT FK_JurisdictionMember_Group FOREIGN KEY (GroupJurisdictionID) REFERENCES ${flyway:defaultSchema}.Jurisdiction(ID),
    CONSTRAINT FK_JurisdictionMember_Member FOREIGN KEY (MemberJurisdictionID) REFERENCES ${flyway:defaultSchema}.Jurisdiction(ID),
    CONSTRAINT CK_JurisdictionMember_NotSelf CHECK (GroupJurisdictionID <> MemberJurisdictionID)
);
GO


-- ===========================================================================
-- 2. PRINCIPALS (who we communicate with)
-- ===========================================================================

CREATE TABLE ${flyway:defaultSchema}.CommunicationPrincipal (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationPrincipal_ID DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Description NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    DriverClass NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Configuration NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    DisplayOrder INT NOT NULL CONSTRAINT DF_CommunicationPrincipal_DisplayOrder DEFAULT 0,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationPrincipal_Status DEFAULT 'Active',
    CONSTRAINT PK_CommunicationPrincipal PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationPrincipal_EntityID UNIQUE (EntityID),
    CONSTRAINT UQ_CommunicationPrincipal_Name UNIQUE (Name),
    CONSTRAINT FK_CommunicationPrincipal_Entity FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT CK_CommunicationPrincipal_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

ALTER TABLE ${flyway:defaultSchema}.EntityCommunicationMessageType
    ADD CommunicationPrincipalID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_EntityCommunicationMessageType_CommunicationPrincipal
        FOREIGN KEY REFERENCES ${flyway:defaultSchema}.CommunicationPrincipal(ID);
GO


-- ===========================================================================
-- 3. SENDERS (who is communicating: company, brand, tenant, newsletter, ...)
-- ===========================================================================

CREATE TABLE ${flyway:defaultSchema}.CommunicationSenderType (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationSenderType_ID DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Description NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    EntityID UNIQUEIDENTIFIER NULL,
    DriverClass NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Configuration NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationSenderType_Status DEFAULT 'Active',
    CONSTRAINT PK_CommunicationSenderType PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationSenderType_Name UNIQUE (Name),
    CONSTRAINT FK_CommunicationSenderType_Entity FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT CK_CommunicationSenderType_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

CREATE TABLE ${flyway:defaultSchema}.CommunicationSender (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationSender_ID DEFAULT NEWSEQUENTIALID(),
    CommunicationSenderTypeID UNIQUEIDENTIFIER NOT NULL,
    RecordID NVARCHAR(450) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    ParentSenderID UNIQUEIDENTIFIER NULL,
    Name NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Description NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    IsDefault BIT NOT NULL CONSTRAINT DF_CommunicationSender_IsDefault DEFAULT 0,
    FromEmail NVARCHAR(320) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    FromName NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    ReplyToEmail NVARCHAR(320) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    FromPhone NVARCHAR(32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    SendingDomain NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    PostalAddress NVARCHAR(1000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    JurisdictionID UNIQUEIDENTIFIER NULL,
    CommunicationProviderID UNIQUEIDENTIFIER NULL,
    CredentialID UNIQUEIDENTIFIER NULL,
    PreferenceCenterURL NVARCHAR(1000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    TemplateContext NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Configuration NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    EnforcementMode NVARCHAR(10) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationSender_Status DEFAULT 'Active',
    CONSTRAINT PK_CommunicationSender PRIMARY KEY (ID),
    CONSTRAINT FK_CommunicationSender_SenderType FOREIGN KEY (CommunicationSenderTypeID) REFERENCES ${flyway:defaultSchema}.CommunicationSenderType(ID),
    CONSTRAINT FK_CommunicationSender_ParentSender FOREIGN KEY (ParentSenderID) REFERENCES ${flyway:defaultSchema}.CommunicationSender(ID),
    CONSTRAINT FK_CommunicationSender_Jurisdiction FOREIGN KEY (JurisdictionID) REFERENCES ${flyway:defaultSchema}.Jurisdiction(ID),
    CONSTRAINT FK_CommunicationSender_Provider FOREIGN KEY (CommunicationProviderID) REFERENCES ${flyway:defaultSchema}.CommunicationProvider(ID),
    CONSTRAINT FK_CommunicationSender_Credential FOREIGN KEY (CredentialID) REFERENCES ${flyway:defaultSchema}.Credential(ID),
    CONSTRAINT CK_CommunicationSender_NotOwnParent CHECK (ParentSenderID IS NULL OR ParentSenderID <> ID),
    CONSTRAINT CK_CommunicationSender_EnforcementMode CHECK (EnforcementMode IS NULL OR EnforcementMode IN ('Off', 'Shadow', 'Enforce')),
    CONSTRAINT CK_CommunicationSender_Status CHECK (Status IN ('Active', 'Suspended', 'Disabled'))
);
GO

-- One sender per backing record of a type. Senders with no backing record (RecordID NULL) are unrestricted.
CREATE UNIQUE NONCLUSTERED INDEX UX_CommunicationSender_TypeRecord
    ON ${flyway:defaultSchema}.CommunicationSender (CommunicationSenderTypeID, RecordID)
    WHERE RecordID IS NOT NULL;
GO

-- At most one default sender per instance (used when a send names no sender).
CREATE UNIQUE NONCLUSTERED INDEX UX_CommunicationSender_IsDefault
    ON ${flyway:defaultSchema}.CommunicationSender (IsDefault)
    WHERE IsDefault = 1;
GO

CREATE TABLE ${flyway:defaultSchema}.CommunicationSenderPermission (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationSenderPermission_ID DEFAULT NEWSEQUENTIALID(),
    CommunicationSenderID UNIQUEIDENTIFIER NOT NULL,
    RoleID UNIQUEIDENTIFIER NULL,
    UserID UNIQUEIDENTIFIER NULL,
    PermissionLevel NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    AppliesToChildSenders BIT NOT NULL CONSTRAINT DF_CommunicationSenderPermission_AppliesToChildSenders DEFAULT 1,
    CONSTRAINT PK_CommunicationSenderPermission PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationSenderPermission_Grantee UNIQUE (CommunicationSenderID, RoleID, UserID),
    CONSTRAINT FK_CommunicationSenderPermission_Sender FOREIGN KEY (CommunicationSenderID) REFERENCES ${flyway:defaultSchema}.CommunicationSender(ID),
    CONSTRAINT FK_CommunicationSenderPermission_Role FOREIGN KEY (RoleID) REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT FK_CommunicationSenderPermission_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_CommunicationSenderPermission_OneGrantee CHECK ((RoleID IS NULL AND UserID IS NOT NULL) OR (RoleID IS NOT NULL AND UserID IS NULL)),
    CONSTRAINT CK_CommunicationSenderPermission_Level CHECK (PermissionLevel IN ('View', 'Send', 'Manage'))
);
GO


-- ===========================================================================
-- 4. ENDPOINTS (where we reach a principal; shared across principals)
-- ===========================================================================

CREATE TABLE ${flyway:defaultSchema}.CommunicationEndpoint (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationEndpoint_ID DEFAULT NEWSEQUENTIALID(),
    BaseMessageTypeID UNIQUEIDENTIFIER NOT NULL,
    NormalizedValue NVARCHAR(320) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    ValueHash NVARCHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Domain NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationEndpoint_Status DEFAULT 'Active',
    SoftBounceCount INT NOT NULL CONSTRAINT DF_CommunicationEndpoint_SoftBounceCount DEFAULT 0,
    LastSentAt DATETIMEOFFSET(7) NULL,
    LastDeliveredAt DATETIMEOFFSET(7) NULL,
    LastBouncedAt DATETIMEOFFSET(7) NULL,
    LastEngagedAt DATETIMEOFFSET(7) NULL,
    CONSTRAINT PK_CommunicationEndpoint PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationEndpoint_ValueHash UNIQUE (BaseMessageTypeID, ValueHash),
    CONSTRAINT FK_CommunicationEndpoint_BaseMessageType FOREIGN KEY (BaseMessageTypeID) REFERENCES ${flyway:defaultSchema}.CommunicationBaseMessageType(ID),
    CONSTRAINT CK_CommunicationEndpoint_SoftBounceCount CHECK (SoftBounceCount >= 0),
    CONSTRAINT CK_CommunicationEndpoint_Status CHECK (Status IN ('Active', 'Soft Bouncing', 'Hard Bounced', 'Complained', 'Invalid', 'Erased')),
    CONSTRAINT CK_CommunicationEndpoint_Erased CHECK ((Status = 'Erased' AND NormalizedValue IS NULL) OR (Status <> 'Erased' AND NormalizedValue IS NOT NULL))
);
GO

-- Domain-level deliverability reporting (bounce and complaint rates by domain).
CREATE NONCLUSTERED INDEX IX_CommunicationEndpoint_Domain
    ON ${flyway:defaultSchema}.CommunicationEndpoint (Domain, Status);
GO

CREATE TABLE ${flyway:defaultSchema}.CommunicationEndpointPrincipal (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationEndpointPrincipal_ID DEFAULT NEWSEQUENTIALID(),
    CommunicationEndpointID UNIQUEIDENTIFIER NOT NULL,
    EntityID UNIQUEIDENTIFIER NOT NULL,
    RecordID NVARCHAR(450) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    FirstSeenAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_CommunicationEndpointPrincipal_FirstSeenAt DEFAULT SYSDATETIMEOFFSET(),
    LastSeenAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_CommunicationEndpointPrincipal_LastSeenAt DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_CommunicationEndpointPrincipal PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationEndpointPrincipal_Link UNIQUE (CommunicationEndpointID, EntityID, RecordID),
    CONSTRAINT FK_CommunicationEndpointPrincipal_Endpoint FOREIGN KEY (CommunicationEndpointID) REFERENCES ${flyway:defaultSchema}.CommunicationEndpoint(ID),
    CONSTRAINT FK_CommunicationEndpointPrincipal_Entity FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID)
);
GO

-- Reverse lookup: all endpoints of one principal record.
CREATE NONCLUSTERED INDEX IX_CommunicationEndpointPrincipal_Principal
    ON ${flyway:defaultSchema}.CommunicationEndpointPrincipal (EntityID, RecordID);
GO


-- ===========================================================================
-- 5. PREFERENCES
-- ===========================================================================

CREATE TABLE ${flyway:defaultSchema}.CommunicationPreference (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationPreference_ID DEFAULT NEWSEQUENTIALID(),
    CommunicationSenderID UNIQUEIDENTIFIER NULL,
    Name NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Description NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Category NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    MessageClass NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationPreference_MessageClass DEFAULT 'Marketing',
    DefaultState NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationPreference_DefaultState DEFAULT 'Opted In',
    BaseMessageTypeID UNIQUEIDENTIFIER NULL,
    IsUserVisible BIT NOT NULL CONSTRAINT DF_CommunicationPreference_IsUserVisible DEFAULT 1,
    DisplayOrder INT NOT NULL CONSTRAINT DF_CommunicationPreference_DisplayOrder DEFAULT 0,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationPreference_Status DEFAULT 'Active',
    CONSTRAINT PK_CommunicationPreference PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationPreference_SenderName UNIQUE (CommunicationSenderID, Name),
    CONSTRAINT FK_CommunicationPreference_Sender FOREIGN KEY (CommunicationSenderID) REFERENCES ${flyway:defaultSchema}.CommunicationSender(ID),
    CONSTRAINT FK_CommunicationPreference_BaseMessageType FOREIGN KEY (BaseMessageTypeID) REFERENCES ${flyway:defaultSchema}.CommunicationBaseMessageType(ID),
    CONSTRAINT CK_CommunicationPreference_MessageClass CHECK (MessageClass IN ('Transactional', 'Operational', 'Marketing')),
    CONSTRAINT CK_CommunicationPreference_DefaultState CHECK (DefaultState IN ('Opted In', 'Opted Out')),
    CONSTRAINT CK_CommunicationPreference_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

CREATE TABLE ${flyway:defaultSchema}.CommunicationPrincipalPreference (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationPrincipalPreference_ID DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    RecordID NVARCHAR(450) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    CommunicationPreferenceID UNIQUEIDENTIFIER NOT NULL,
    CommunicationSenderID UNIQUEIDENTIFIER NULL,
    State NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    OptInMethod NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    ConfirmedAt DATETIMEOFFSET(7) NULL,
    ConfirmationToken UNIQUEIDENTIFIER NULL,
    ConsentSource NVARCHAR(30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    ConsentAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_CommunicationPrincipalPreference_ConsentAt DEFAULT SYSDATETIMEOFFSET(),
    ConsentText NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    ExpiresAt DATETIMEOFFSET(7) NULL,
    CommunicationLogID UNIQUEIDENTIFIER NULL,
    IPAddress NVARCHAR(45) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    UserAgent NVARCHAR(1000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    ChangedByUserID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_CommunicationPrincipalPreference PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationPrincipalPreference_Scope UNIQUE (EntityID, RecordID, CommunicationPreferenceID, CommunicationSenderID),
    CONSTRAINT FK_CommunicationPrincipalPreference_Entity FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_CommunicationPrincipalPreference_Preference FOREIGN KEY (CommunicationPreferenceID) REFERENCES ${flyway:defaultSchema}.CommunicationPreference(ID),
    CONSTRAINT FK_CommunicationPrincipalPreference_Sender FOREIGN KEY (CommunicationSenderID) REFERENCES ${flyway:defaultSchema}.CommunicationSender(ID),
    CONSTRAINT FK_CommunicationPrincipalPreference_Log FOREIGN KEY (CommunicationLogID) REFERENCES ${flyway:defaultSchema}.CommunicationLog(ID),
    CONSTRAINT FK_CommunicationPrincipalPreference_ChangedByUser FOREIGN KEY (ChangedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_CommunicationPrincipalPreference_State CHECK (State IN ('Pending', 'Opted In', 'Opted Out')),
    CONSTRAINT CK_CommunicationPrincipalPreference_Pending CHECK (State <> 'Pending' OR (OptInMethod = 'Double' AND ConfirmedAt IS NULL)),
    CONSTRAINT CK_CommunicationPrincipalPreference_OptInMethod CHECK (OptInMethod IS NULL OR OptInMethod IN ('Single', 'Double')),
    CONSTRAINT CK_CommunicationPrincipalPreference_ConsentSource CHECK (ConsentSource IN ('One-Click Header', 'Preference Center', 'Signup Form', 'Provider Webhook', 'Admin', 'API', 'Import'))
);
GO

CREATE UNIQUE NONCLUSTERED INDEX UX_CommunicationPrincipalPreference_ConfirmationToken
    ON ${flyway:defaultSchema}.CommunicationPrincipalPreference (ConfirmationToken)
    WHERE ConfirmationToken IS NOT NULL;
GO


-- ===========================================================================
-- 6. SUPPRESSION (hard blocks; many rows per principal / endpoint)
-- ===========================================================================

CREATE TABLE ${flyway:defaultSchema}.CommunicationSuppressionPolicy (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationSuppressionPolicy_ID DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Description NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    DriverClass NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Parameters NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationSuppressionPolicy_Status DEFAULT 'Active',
    CONSTRAINT PK_CommunicationSuppressionPolicy PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationSuppressionPolicy_Name UNIQUE (Name),
    CONSTRAINT CK_CommunicationSuppressionPolicy_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

CREATE TABLE ${flyway:defaultSchema}.CommunicationSuppression (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationSuppression_ID DEFAULT NEWSEQUENTIALID(),
    CommunicationEndpointID UNIQUEIDENTIFIER NULL,
    EntityID UNIQUEIDENTIFIER NULL,
    RecordID NVARCHAR(450) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    CommunicationSenderID UNIQUEIDENTIFIER NULL,
    CommunicationPreferenceID UNIQUEIDENTIFIER NULL,
    BaseMessageTypeID UNIQUEIDENTIFIER NULL,
    Reason NVARCHAR(30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Source NVARCHAR(30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationSuppression_Status DEFAULT 'Active',
    EffectiveAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_CommunicationSuppression_EffectiveAt DEFAULT SYSDATETIMEOFFSET(),
    ExpiresAt DATETIMEOFFSET(7) NULL,
    RevokedAt DATETIMEOFFSET(7) NULL,
    RevokedByUserID UNIQUEIDENTIFIER NULL,
    CommunicationLogID UNIQUEIDENTIFIER NULL,
    CommunicationSuppressionPolicyID UNIQUEIDENTIFIER NULL,
    IPAddress NVARCHAR(45) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    UserAgent NVARCHAR(1000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Notes NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    CreatedByUserID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_CommunicationSuppression PRIMARY KEY (ID),
    CONSTRAINT FK_CommunicationSuppression_Endpoint FOREIGN KEY (CommunicationEndpointID) REFERENCES ${flyway:defaultSchema}.CommunicationEndpoint(ID),
    CONSTRAINT FK_CommunicationSuppression_Entity FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_CommunicationSuppression_Sender FOREIGN KEY (CommunicationSenderID) REFERENCES ${flyway:defaultSchema}.CommunicationSender(ID),
    CONSTRAINT FK_CommunicationSuppression_Preference FOREIGN KEY (CommunicationPreferenceID) REFERENCES ${flyway:defaultSchema}.CommunicationPreference(ID),
    CONSTRAINT FK_CommunicationSuppression_BaseMessageType FOREIGN KEY (BaseMessageTypeID) REFERENCES ${flyway:defaultSchema}.CommunicationBaseMessageType(ID),
    CONSTRAINT FK_CommunicationSuppression_RevokedByUser FOREIGN KEY (RevokedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_CommunicationSuppression_Log FOREIGN KEY (CommunicationLogID) REFERENCES ${flyway:defaultSchema}.CommunicationLog(ID),
    CONSTRAINT FK_CommunicationSuppression_Policy FOREIGN KEY (CommunicationSuppressionPolicyID) REFERENCES ${flyway:defaultSchema}.CommunicationSuppressionPolicy(ID),
    CONSTRAINT FK_CommunicationSuppression_CreatedByUser FOREIGN KEY (CreatedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_CommunicationSuppression_Target CHECK (CommunicationEndpointID IS NOT NULL OR EntityID IS NOT NULL),
    CONSTRAINT CK_CommunicationSuppression_PrincipalPair CHECK ((EntityID IS NULL AND RecordID IS NULL) OR (EntityID IS NOT NULL AND RecordID IS NOT NULL)),
    CONSTRAINT CK_CommunicationSuppression_Reason CHECK (Reason IN ('User Unsubscribe', 'Hard Bounce', 'Spam Complaint', 'Invalid Address', 'Admin Block', 'Policy')),
    CONSTRAINT CK_CommunicationSuppression_Source CHECK (Source IN ('One-Click Header', 'Preference Center', 'Provider Webhook', 'Admin', 'API', 'Policy', 'Import')),
    CONSTRAINT CK_CommunicationSuppression_Status CHECK (Status IN ('Active', 'Revoked', 'Expired')),
    CONSTRAINT CK_CommunicationSuppression_Revocation CHECK ((Status = 'Revoked' AND RevokedAt IS NOT NULL) OR (Status <> 'Revoked' AND RevokedAt IS NULL)),
    CONSTRAINT CK_CommunicationSuppression_PolicyLink CHECK ((Reason = 'Policy' AND CommunicationSuppressionPolicyID IS NOT NULL) OR (Reason <> 'Policy'))
);
GO

-- The gate's two hot lookups: by address, and by principal record.
CREATE NONCLUSTERED INDEX IX_CommunicationSuppression_EndpointGate
    ON ${flyway:defaultSchema}.CommunicationSuppression (CommunicationEndpointID, Status)
    INCLUDE (CommunicationSenderID, CommunicationPreferenceID, BaseMessageTypeID, Reason, ExpiresAt);
GO

CREATE NONCLUSTERED INDEX IX_CommunicationSuppression_PrincipalGate
    ON ${flyway:defaultSchema}.CommunicationSuppression (EntityID, RecordID, Status)
    INCLUDE (CommunicationSenderID, CommunicationPreferenceID, BaseMessageTypeID, Reason, ExpiresAt);
GO


-- ===========================================================================
-- 7. CONSENT AUDIT (append-only)
-- ===========================================================================

CREATE TABLE ${flyway:defaultSchema}.CommunicationConsentAuditLog (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationConsentAuditLog_ID DEFAULT NEWSEQUENTIALID(),
    CommunicationSuppressionID UNIQUEIDENTIFIER NULL,
    CommunicationPrincipalPreferenceID UNIQUEIDENTIFIER NULL,
    Action NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    PreviousValue NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    NewValue NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Source NVARCHAR(30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    CommunicationLogID UNIQUEIDENTIFIER NULL,
    IPAddress NVARCHAR(45) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    UserAgent NVARCHAR(1000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    ChangedByUserID UNIQUEIDENTIFIER NULL,
    ChangedAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_CommunicationConsentAuditLog_ChangedAt DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_CommunicationConsentAuditLog PRIMARY KEY (ID),
    CONSTRAINT FK_CommunicationConsentAuditLog_Suppression FOREIGN KEY (CommunicationSuppressionID) REFERENCES ${flyway:defaultSchema}.CommunicationSuppression(ID),
    CONSTRAINT FK_CommunicationConsentAuditLog_PrincipalPreference FOREIGN KEY (CommunicationPrincipalPreferenceID) REFERENCES ${flyway:defaultSchema}.CommunicationPrincipalPreference(ID),
    CONSTRAINT FK_CommunicationConsentAuditLog_Log FOREIGN KEY (CommunicationLogID) REFERENCES ${flyway:defaultSchema}.CommunicationLog(ID),
    CONSTRAINT FK_CommunicationConsentAuditLog_ChangedByUser FOREIGN KEY (ChangedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_CommunicationConsentAuditLog_OneSubject CHECK ((CommunicationSuppressionID IS NOT NULL AND CommunicationPrincipalPreferenceID IS NULL) OR (CommunicationSuppressionID IS NULL AND CommunicationPrincipalPreferenceID IS NOT NULL)),
    CONSTRAINT CK_CommunicationConsentAuditLog_Action CHECK (Action IN ('Created', 'Updated', 'Confirmed', 'Revoked', 'Expired')),
    CONSTRAINT CK_CommunicationConsentAuditLog_Source CHECK (Source IN ('One-Click Header', 'Preference Center', 'Signup Form', 'Provider Webhook', 'Admin', 'API', 'Policy', 'Import', 'System'))
);
GO


-- ===========================================================================
-- 8. COMMUNICATION LOG — new columns
-- ===========================================================================

ALTER TABLE ${flyway:defaultSchema}.CommunicationLog ADD
    EntityID UNIQUEIDENTIFIER NULL,
    RecordID NVARCHAR(450) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    CommunicationEndpointID UNIQUEIDENTIFIER NULL,
    RecipientAddress NVARCHAR(320) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    CommunicationSenderID UNIQUEIDENTIFIER NULL,
    CommunicationPreferenceID UNIQUEIDENTIFIER NULL,
    MessageClass NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    ScheduledAt DATETIMEOFFSET(7) NULL,
    ProviderMessageID NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    UnsubscribeToken UNIQUEIDENTIFIER NULL CONSTRAINT DF_CommunicationLog_UnsubscribeToken DEFAULT NEWID(),
    TrackingToken UNIQUEIDENTIFIER NULL CONSTRAINT DF_CommunicationLog_TrackingToken DEFAULT NEWID(),
    CorrelationData NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    ComplianceDecision NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL;
GO

-- Non-enumerable capability token for one-click unsubscribe and preference center URLs.
CREATE UNIQUE NONCLUSTERED INDEX UX_CommunicationLog_UnsubscribeToken
    ON ${flyway:defaultSchema}.CommunicationLog (UnsubscribeToken)
    WHERE UnsubscribeToken IS NOT NULL;
GO

-- Separate capability token for open-tracking pixels so image-proxy logs never hold unsubscribe capability.
CREATE UNIQUE NONCLUSTERED INDEX UX_CommunicationLog_TrackingToken
    ON ${flyway:defaultSchema}.CommunicationLog (TrackingToken)
    WHERE TrackingToken IS NOT NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.CommunicationLog ADD
    CONSTRAINT FK_CommunicationLog_Entity FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_CommunicationLog_Endpoint FOREIGN KEY (CommunicationEndpointID) REFERENCES ${flyway:defaultSchema}.CommunicationEndpoint(ID),
    CONSTRAINT FK_CommunicationLog_Sender FOREIGN KEY (CommunicationSenderID) REFERENCES ${flyway:defaultSchema}.CommunicationSender(ID),
    CONSTRAINT FK_CommunicationLog_Preference FOREIGN KEY (CommunicationPreferenceID) REFERENCES ${flyway:defaultSchema}.CommunicationPreference(ID),
    CONSTRAINT CK_CommunicationLog_MessageClass CHECK (MessageClass IS NULL OR MessageClass IN ('Transactional', 'Operational', 'Marketing')),
    CONSTRAINT CK_CommunicationLog_PrincipalPair CHECK ((EntityID IS NULL AND RecordID IS NULL) OR (EntityID IS NOT NULL AND RecordID IS NOT NULL));
GO

-- Webhook correlation fallback when custom args are missing.
CREATE NONCLUSTERED INDEX IX_CommunicationLog_ProviderMessageID
    ON ${flyway:defaultSchema}.CommunicationLog (CommunicationProviderID, ProviderMessageID)
    WHERE ProviderMessageID IS NOT NULL;
GO

-- Message history for one principal record.
CREATE NONCLUSTERED INDEX IX_CommunicationLog_Principal
    ON ${flyway:defaultSchema}.CommunicationLog (EntityID, RecordID, MessageDate);
GO


-- ===========================================================================
-- 9. ACTIVITY (normalized delivery and engagement events)
-- ===========================================================================

CREATE TABLE ${flyway:defaultSchema}.CommunicationActivity (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationActivity_ID DEFAULT NEWSEQUENTIALID(),
    CommunicationLogID UNIQUEIDENTIFIER NULL,
    CommunicationEndpointID UNIQUEIDENTIFIER NULL,
    CommunicationSenderID UNIQUEIDENTIFIER NULL,
    CommunicationProviderID UNIQUEIDENTIFIER NOT NULL,
    EventType NVARCHAR(30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    OccurredAt DATETIMEOFFSET(7) NOT NULL,
    ReceivedAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_CommunicationActivity_ReceivedAt DEFAULT SYSDATETIMEOFFSET(),
    ProviderEventID NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    ProviderMessageID NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    TargetURL NVARCHAR(2000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    BounceCode NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    BounceReason NVARCHAR(1000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    IsMachineEvent BIT NOT NULL CONSTRAINT DF_CommunicationActivity_IsMachineEvent DEFAULT 0,
    IPAddress NVARCHAR(45) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    UserAgent NVARCHAR(1000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    CorrelationData NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    RawPayload NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    CONSTRAINT PK_CommunicationActivity PRIMARY KEY (ID),
    CONSTRAINT FK_CommunicationActivity_Log FOREIGN KEY (CommunicationLogID) REFERENCES ${flyway:defaultSchema}.CommunicationLog(ID),
    CONSTRAINT FK_CommunicationActivity_Endpoint FOREIGN KEY (CommunicationEndpointID) REFERENCES ${flyway:defaultSchema}.CommunicationEndpoint(ID),
    CONSTRAINT FK_CommunicationActivity_Sender FOREIGN KEY (CommunicationSenderID) REFERENCES ${flyway:defaultSchema}.CommunicationSender(ID),
    CONSTRAINT FK_CommunicationActivity_Provider FOREIGN KEY (CommunicationProviderID) REFERENCES ${flyway:defaultSchema}.CommunicationProvider(ID),
    CONSTRAINT CK_CommunicationActivity_EventType CHECK (EventType IN ('Queued', 'Sent', 'Delivered', 'Deferred', 'Dropped', 'Soft Bounce', 'Hard Bounce', 'Opened', 'Clicked', 'Unsubscribed', 'Spam Complaint'))
);
GO

-- At-least-once webhooks: one row per provider event.
CREATE UNIQUE NONCLUSTERED INDEX UX_CommunicationActivity_ProviderEvent
    ON ${flyway:defaultSchema}.CommunicationActivity (CommunicationProviderID, ProviderEventID)
    WHERE ProviderEventID IS NOT NULL;
GO

-- Engagement and deliverability reporting per sender over time.
CREATE NONCLUSTERED INDEX IX_CommunicationActivity_SenderTime
    ON ${flyway:defaultSchema}.CommunicationActivity (CommunicationSenderID, EventType, OccurredAt);
GO

-- Retention purge of RawPayload / IP / user agent.
CREATE NONCLUSTERED INDEX IX_CommunicationActivity_ReceivedAt
    ON ${flyway:defaultSchema}.CommunicationActivity (ReceivedAt);
GO


-- ===========================================================================
-- 10. COMPLIANCE REGIMES
-- ===========================================================================

CREATE TABLE ${flyway:defaultSchema}.CommunicationComplianceRegime (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationComplianceRegime_ID DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Description NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    AppliesBy NVARCHAR(30) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationComplianceRegime_AppliesBy DEFAULT 'Recipient',
    AppliesWhenJurisdictionUnknown BIT NOT NULL CONSTRAINT DF_CommunicationComplianceRegime_AppliesWhenJurisdictionUnknown DEFAULT 1,
    ReferenceURL NVARCHAR(1000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationComplianceRegime_Status DEFAULT 'Disabled',
    CONSTRAINT PK_CommunicationComplianceRegime PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationComplianceRegime_Name UNIQUE (Name),
    CONSTRAINT CK_CommunicationComplianceRegime_AppliesBy CHECK (AppliesBy IN ('Recipient', 'Sender', 'Recipient or Sender')),
    CONSTRAINT CK_CommunicationComplianceRegime_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

CREATE TABLE ${flyway:defaultSchema}.CommunicationComplianceRuleType (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationComplianceRuleType_ID DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    Description NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    DriverClass NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    ParameterSchema NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationComplianceRuleType_Status DEFAULT 'Active',
    CONSTRAINT PK_CommunicationComplianceRuleType PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationComplianceRuleType_Name UNIQUE (Name),
    CONSTRAINT CK_CommunicationComplianceRuleType_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

CREATE TABLE ${flyway:defaultSchema}.CommunicationComplianceRegimeRule (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationComplianceRegimeRule_ID DEFAULT NEWSEQUENTIALID(),
    CommunicationComplianceRegimeID UNIQUEIDENTIFIER NOT NULL,
    CommunicationComplianceRuleTypeID UNIQUEIDENTIFIER NOT NULL,
    BaseMessageTypeID UNIQUEIDENTIFIER NULL,
    MessageClass NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Parameters NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Notes NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationComplianceRegimeRule_Status DEFAULT 'Active',
    CONSTRAINT PK_CommunicationComplianceRegimeRule PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationComplianceRegimeRule_Scope UNIQUE (CommunicationComplianceRegimeID, CommunicationComplianceRuleTypeID, BaseMessageTypeID, MessageClass),
    CONSTRAINT FK_CommunicationComplianceRegimeRule_Regime FOREIGN KEY (CommunicationComplianceRegimeID) REFERENCES ${flyway:defaultSchema}.CommunicationComplianceRegime(ID),
    CONSTRAINT FK_CommunicationComplianceRegimeRule_RuleType FOREIGN KEY (CommunicationComplianceRuleTypeID) REFERENCES ${flyway:defaultSchema}.CommunicationComplianceRuleType(ID),
    CONSTRAINT FK_CommunicationComplianceRegimeRule_BaseMessageType FOREIGN KEY (BaseMessageTypeID) REFERENCES ${flyway:defaultSchema}.CommunicationBaseMessageType(ID),
    CONSTRAINT CK_CommunicationComplianceRegimeRule_MessageClass CHECK (MessageClass IS NULL OR MessageClass IN ('Transactional', 'Operational', 'Marketing')),
    CONSTRAINT CK_CommunicationComplianceRegimeRule_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

CREATE TABLE ${flyway:defaultSchema}.CommunicationComplianceRegimeJurisdiction (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationComplianceRegimeJurisdiction_ID DEFAULT NEWSEQUENTIALID(),
    CommunicationComplianceRegimeID UNIQUEIDENTIFIER NOT NULL,
    JurisdictionID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_CommunicationComplianceRegimeJurisdiction PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationComplianceRegimeJurisdiction_Pair UNIQUE (CommunicationComplianceRegimeID, JurisdictionID),
    CONSTRAINT FK_CommunicationComplianceRegimeJurisdiction_Regime FOREIGN KEY (CommunicationComplianceRegimeID) REFERENCES ${flyway:defaultSchema}.CommunicationComplianceRegime(ID),
    CONSTRAINT FK_CommunicationComplianceRegimeJurisdiction_Jurisdiction FOREIGN KEY (JurisdictionID) REFERENCES ${flyway:defaultSchema}.Jurisdiction(ID)
);
GO


-- ===========================================================================
-- 11. WEBHOOK DEDUPLICATION & SENDING DOMAIN AUTHENTICATION
-- ===========================================================================

CREATE TABLE ${flyway:defaultSchema}.CommunicationProviderEvent (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationProviderEvent_ID DEFAULT NEWSEQUENTIALID(),
    CommunicationProviderID UNIQUEIDENTIFIER NOT NULL,
    ProviderEventID NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    ReceivedAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_CommunicationProviderEvent_ReceivedAt DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_CommunicationProviderEvent PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationProviderEvent_Event UNIQUE (CommunicationProviderID, ProviderEventID),
    CONSTRAINT FK_CommunicationProviderEvent_Provider FOREIGN KEY (CommunicationProviderID) REFERENCES ${flyway:defaultSchema}.CommunicationProvider(ID)
);
GO

CREATE NONCLUSTERED INDEX IX_CommunicationProviderEvent_ReceivedAt
    ON ${flyway:defaultSchema}.CommunicationProviderEvent (ReceivedAt);
GO

ALTER TABLE ${flyway:defaultSchema}.CommunicationProvider
    ADD RequireVerifiedDomain BIT NOT NULL CONSTRAINT DF_CommunicationProvider_RequireVerifiedDomain DEFAULT 0;
GO

CREATE TABLE ${flyway:defaultSchema}.CommunicationSendingDomain (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_CommunicationSendingDomain_ID DEFAULT NEWSEQUENTIALID(),
    CommunicationProviderID UNIQUEIDENTIFIER NOT NULL,
    CredentialID UNIQUEIDENTIFIER NULL,
    Domain NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    ProviderDomainID NVARCHAR(200) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    Status NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT DF_CommunicationSendingDomain_Status DEFAULT 'Pending',
    DNSRecords NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    LastVerifiedAt DATETIMEOFFSET(7) NULL,
    VerifiedAt DATETIMEOFFSET(7) NULL,
    CONSTRAINT PK_CommunicationSendingDomain PRIMARY KEY (ID),
    CONSTRAINT UQ_CommunicationSendingDomain_Scope UNIQUE (CommunicationProviderID, CredentialID, Domain),
    CONSTRAINT FK_CommunicationSendingDomain_Provider FOREIGN KEY (CommunicationProviderID) REFERENCES ${flyway:defaultSchema}.CommunicationProvider(ID),
    CONSTRAINT FK_CommunicationSendingDomain_Credential FOREIGN KEY (CredentialID) REFERENCES ${flyway:defaultSchema}.Credential(ID),
    CONSTRAINT CK_CommunicationSendingDomain_Status CHECK (Status IN ('Pending', 'Verified', 'Failed', 'Revoked'))
);
GO


-- ===========================================================================
-- 12. DESCRIPTIONS (MS_Description extended properties)
-- ===========================================================================

-- Jurisdiction
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A legal jurisdiction: a country (ISO 3166-1), a subdivision (ISO 3166-2, for example US-CA or CA-QC) or a named group such as EU or EEA. Generic core table; communications compliance is the first consumer.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Jurisdiction';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique code: ISO 3166-1 alpha-2 for countries (US, FR), ISO 3166-2 for subdivisions (US-CA), or a short group code (EU, EEA).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Jurisdiction', @level2type=N'COLUMN', @level2name=N'Code';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name, for example France, California or European Union.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Jurisdiction', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Notes on the jurisdiction and what it covers.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Jurisdiction', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Country, Subdivision or Group. Groups contain other jurisdictions through Jurisdiction Members.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Jurisdiction', @level2type=N'COLUMN', @level2name=N'Type';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'For Country and Subdivision jurisdictions, the matching row in MJ: Countries.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Jurisdiction', @level2type=N'COLUMN', @level2name=N'CountryID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active jurisdictions are used in resolution; Disabled ones are ignored.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'Jurisdiction', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- JurisdictionMember
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Containment between jurisdictions: EU contains FR, US contains US-CA. Groups can nest. Resolution expands a code to every jurisdiction that contains it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'JurisdictionMember';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The containing jurisdiction, for example EU or US.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'JurisdictionMember', @level2type=N'COLUMN', @level2name=N'GroupJurisdictionID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The contained jurisdiction, for example FR or US-CA.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'JurisdictionMember', @level2type=N'COLUMN', @level2name=N'MemberJurisdictionID';
GO

-- CommunicationPrincipal
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Registers an entity whose records can receive communication (People, Organizations, Horseman, MJ Users). Nothing can be sent to a record of an entity that is not registered here, except transactional sends to a bare address.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipal';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The entity registered as a principal. One registration per entity.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipal', @level2type=N'COLUMN', @level2name=N'EntityID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name shown in the principal selector, for example People or Organizations. The selector is hidden when only one principal is active.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipal', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this principal represents and which app registered it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipal', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ClassFactory key of a BaseCommunicationPrincipal subclass. NULL uses the metadata-only base class.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipal', @level2type=N'COLUMN', @level2name=N'DriverClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON slot mapping, for example {"Slots":{"FullName":"FullName","Jurisdiction":"Addresses.CountryISO2","Timezone":"Timezone","PreferredLanguage":"Language"}}. Slots may traverse relationships. Address slots live in Entity Communication Fields.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipal', @level2type=N'COLUMN', @level2name=N'Configuration';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Order of principals in pickers.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipal', @level2type=N'COLUMN', @level2name=N'DisplayOrder';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active principals can be sent to; Disabled principals are refused by the engine.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipal', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The principal this channel mapping belongs to. NULL for rows created before Communications V2; the engine falls back to matching EntityID.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'EntityCommunicationMessageType', @level2type=N'COLUMN', @level2name=N'CommunicationPrincipalID';
GO

-- CommunicationSenderType
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Registers a kind of sender, usually backed by an entity, the way Communication Principal registers recipients. Default: Company over MJ: Companies. BCSaaS can register tenants, Rasa newsletters, and so on.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique name, for example Company, Brand, Tenant or Newsletter.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderType', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this sender type represents.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderType', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Entity whose records back senders of this type, for example MJ: Companies. NULL for senders defined only in Communication Senders (for example a brand with no source record).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderType', @level2type=N'COLUMN', @level2name=N'EntityID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ClassFactory key of a BaseCommunicationSender subclass for custom resolution, templating context or permission checks. NULL uses the metadata-only base class.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderType', @level2type=N'COLUMN', @level2name=N'DriverClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON slot mapping from the backing entity, for example {"Slots":{"Name":"Name","SendingDomain":"Domain","LogoURL":"LogoURL","Website":"Website"}}. Values set on a Communication Sender row override mapped values.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderType', @level2type=N'COLUMN', @level2name=N'Configuration';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active or Disabled.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderType', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- CommunicationSender
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A concrete sender: a company, brand, tenant or newsletter that communications go out on behalf of. Scopes suppression, preferences, permissions, templating and sending identity. Senders form a hierarchy through ParentSenderID; a block on a sender covers its descendants.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The sender type this sender belongs to.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'CommunicationSenderTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key of the backing record in the sender type''s entity (for example an MJ: Companies ID). NULL when the sender has no backing record.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'RecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Parent sender, for example the company a brand or newsletter belongs to. Suppressions, preferences and permissions on a parent apply to its descendants.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'ParentSenderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name used in the preference center and reports.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this sender is and who manages it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, this sender is used for sends that name no sender. At most one default sender per instance.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'IsDefault';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default From address for email sent by this sender.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'FromEmail';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default From display name.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'FromName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default Reply-To address.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'ReplyToEmail';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default sending phone number or short code for SMS, in E.164 form.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'FromPhone';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Authenticated sending domain (SPF/DKIM/DMARC). Also a rate-limiting key for the send queue.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'SendingDomain';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Physical postal address injected into footers when a regime''s SenderIdentification rule requires it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'PostalAddress';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Where the sender is established. Regimes whose AppliesBy includes Sender apply based on this jurisdiction.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'JurisdictionID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default provider for this sender''s sends, overriding the instance default.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'CommunicationProviderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider credential for this sender (for example a per-tenant SendGrid subuser key). Secrets live only in MJ: Credentials.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'CredentialID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Public preference center URL for this sender. Used as the redirect after one-click unsubscribe and in footers.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'PreferenceCenterURL';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON brand variables exposed to templates and callers as Sender.*, for example {"LogoURL":"...","PrimaryColor":"#0B5394","FooterText":"..."}. Merged down the sender hierarchy: a child''s values override its parent''s.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'TemplateContext';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Driver-specific JSON settings for this sender.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'Configuration';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Per-sender override of the instance compliance enforcement mode (Off, Shadow or Enforce). NULL uses the instance setting.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'EnforcementMode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active senders can send; Suspended senders are paused (for example a reputation problem); Disabled senders are retired.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSender', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- CommunicationSenderPermission
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Who may view, send as, or manage a sender. Grants to a role or a single user, optionally inherited by child senders. Lets one instance host several companies or brands with separate teams.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderPermission';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The sender the grant applies to.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderPermission', @level2type=N'COLUMN', @level2name=N'CommunicationSenderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Role granted the permission. Exactly one of RoleID and UserID is set.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderPermission', @level2type=N'COLUMN', @level2name=N'RoleID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'User granted the permission. Exactly one of RoleID and UserID is set.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderPermission', @level2type=N'COLUMN', @level2name=N'UserID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'View: see activity and reports. Send: send as this sender. Manage: also edit the sender, its preferences and its suppressions. Each level includes the ones before it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderPermission', @level2type=N'COLUMN', @level2name=N'PermissionLevel';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, the grant also applies to every descendant sender.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSenderPermission', @level2type=N'COLUMN', @level2name=N'AppliesToChildSenders';
GO

-- CommunicationEndpoint
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One canonical address per channel (an email address, a phone number), shared by every principal that uses it. Holds deliverability health so a bounce protects every record sharing the address.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpoint';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Channel of the address: the communication base message type (Email, SMS, ...).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpoint', @level2type=N'COLUMN', @level2name=N'BaseMessageTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Normalized address: email lowercased and trimmed (dots and plus-tags kept); phone in E.164. NULL when Status is Erased.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpoint', @level2type=N'COLUMN', @level2name=N'NormalizedValue';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'SHA-256 hex digest of the normalized value. Preserved on erasure so re-imported addresses resolve to the same suppressed endpoint.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpoint', @level2type=N'COLUMN', @level2name=N'ValueHash';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Email domain, for domain-level deliverability reporting. NULL for non-email channels.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpoint', @level2type=N'COLUMN', @level2name=N'Domain';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Health summary maintained from activity. Suppression rows remain the authority for blocking.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpoint', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Consecutive soft bounces since the last delivery. A configurable threshold converts repeated soft bounces into a suppression.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpoint', @level2type=N'COLUMN', @level2name=N'SoftBounceCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Last time any message was handed to a provider for this address.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpoint', @level2type=N'COLUMN', @level2name=N'LastSentAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Last confirmed delivery.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpoint', @level2type=N'COLUMN', @level2name=N'LastDeliveredAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Last bounce of any kind.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpoint', @level2type=N'COLUMN', @level2name=N'LastBouncedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Last human open or click (machine events excluded).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpoint', @level2type=N'COLUMN', @level2name=N'LastEngagedAt';
GO

-- CommunicationEndpointPrincipal
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Which principal records have used which endpoint, maintained by the engine at send time. Lets an address-only signal (bounce, one-click unsubscribe) find every record it affects.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpointPrincipal';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The endpoint.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpointPrincipal', @level2type=N'COLUMN', @level2name=N'CommunicationEndpointID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Entity of the principal record.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpointPrincipal', @level2type=N'COLUMN', @level2name=N'EntityID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key of the principal record (polymorphic, paired with EntityID).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpointPrincipal', @level2type=N'COLUMN', @level2name=N'RecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the engine first resolved this record to this endpoint.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpointPrincipal', @level2type=N'COLUMN', @level2name=N'FirstSeenAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the engine last resolved this record to this endpoint.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationEndpointPrincipal', @level2type=N'COLUMN', @level2name=N'LastSeenAt';
GO

-- CommunicationPreference
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A preference people can opt into or out of, such as Weekly Newsletter or Event Reminders. Also the scope an unsubscribe writes. Can be shared across senders or owned by one.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPreference';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Owning sender. NULL means the preference is shared across senders; non-NULL means the preference is owned by that specific sender.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPreference', @level2type=N'COLUMN', @level2name=N'CommunicationSenderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Name shown in the preference center. Unique per sender.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPreference', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Explanation shown in the preference center.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPreference', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional grouping heading in the preference center.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPreference', @level2type=N'COLUMN', @level2name=N'Category';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Transactional, Operational or Marketing. Decides which suppression reasons and regime rules apply to messages sent under this preference.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPreference', @level2type=N'COLUMN', @level2name=N'MessageClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'State assumed when a principal has no Principal Preference row. An applicable opt-in regime overrides Opted In for Marketing: explicit consent is then required.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPreference', @level2type=N'COLUMN', @level2name=N'DefaultState';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Channel this preference applies to. NULL means all channels.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPreference', @level2type=N'COLUMN', @level2name=N'BaseMessageTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 0, the preference is internal and hidden from the preference center.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPreference', @level2type=N'COLUMN', @level2name=N'IsUserVisible';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Order in the preference center.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPreference', @level2type=N'COLUMN', @level2name=N'DisplayOrder';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active or Disabled. Sends naming a disabled preference are refused.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPreference', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- CommunicationPrincipalPreference
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One principal record''s choice for one preference, with consent evidence. Each preference is either shared or owned by one sender; absence of a row means no explicit permission or denial.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Entity of the principal record.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'EntityID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key of the principal record (polymorphic, paired with EntityID).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'RecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The preference this choice is for.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'CommunicationPreferenceID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sender this choice applies to (and its descendants). NULL means every sender.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'CommunicationSenderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pending (awaiting double opt-in confirmation), Opted In or Opted Out.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'State';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether consent was captured via Single or Double opt-in. Preserved after Pending transitions to Opted In.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'OptInMethod';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When double opt-in confirmation was completed. NULL for single opt-in or while still Pending.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'ConfirmedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Random UUIDv4 token used in double opt-in confirmation links, separate from UnsubscribeToken.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'ConfirmationToken';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Where the choice was captured.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'ConsentSource';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the choice was made.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'ConsentAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The exact wording the person agreed to, kept as consent evidence where a regime requires it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'ConsentText';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When implied consent lapses (for example under a ConsentExpiry rule). NULL means no expiry.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'ExpiresAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Message whose link or header produced this choice, when applicable.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'CommunicationLogID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'IP address of the request that made the choice.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'IPAddress';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'User agent of the request that made the choice.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'UserAgent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJ user who made the change on the person''s behalf (admin or API). NULL for self-service.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationPrincipalPreference', @level2type=N'COLUMN', @level2name=N'ChangedByUserID';
GO

-- CommunicationSuppressionPolicy
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Automatic suppression rules evaluated on activity, for example three spam complaints across any senders within 90 days becomes a global block. Protects shared sending reputation in multi-tenant use.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppressionPolicy';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique policy name.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppressionPolicy', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What the policy protects against.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppressionPolicy', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ClassFactory key of a BaseCommunicationSuppressionPolicy subclass.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppressionPolicy', @level2type=N'COLUMN', @level2name=N'DriverClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Driver parameters as JSON, for example {"Signal":"Spam Complaint","Threshold":3,"WindowDays":90,"Scope":"Global"}.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppressionPolicy', @level2type=N'COLUMN', @level2name=N'Parameters';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active or Disabled.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppressionPolicy', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- CommunicationSuppression
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Hard blocks on sending. Many rows per endpoint or principal accumulate over time, one per scope. Scope = sender (NULL = every sender) x preference (NULL = all) x channel (NULL = all). Rows are never deleted; they are revoked or expire.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Blocked address. Address-level rows protect every principal that shares the address. At least one of endpoint or principal is set.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'CommunicationEndpointID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Entity of the blocked principal record, when the block is principal-level.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'EntityID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key of the blocked principal record (polymorphic, paired with EntityID).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'RecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sender the block applies to, including its descendants. NULL = global: every sender. Hard bounces and invalid addresses are always global.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'CommunicationSenderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Preference the block applies to. NULL = all preferences of the classes the reason covers.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'CommunicationPreferenceID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Channel the block applies to. NULL = all channels.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'BaseMessageTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Why the block exists. Hard Bounce and Invalid Address block every class; Spam Complaint and Admin Block block Operational and Marketing; User Unsubscribe and Policy block Marketing, or only the named preference when one is set.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'Reason';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Where the signal came from.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'Source';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active rows block. Revoked rows were lifted (for example the person resubscribed). Expired rows passed ExpiresAt.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the block took effect.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'EffectiveAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional automatic end, for example a cooling-off block after soft bounces. NULL = until revoked.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'ExpiresAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the block was lifted. Set exactly when Status is Revoked.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'RevokedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJ user who lifted the block, when it was not the person themselves.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'RevokedByUserID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The message that triggered the block (one-click unsubscribe, bounce, complaint). Also identifies the sender for sender-scoped blocks.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'CommunicationLogID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Suppression policy that created the block. Required when Reason is Policy.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'CommunicationSuppressionPolicyID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'IP address of the request that created the block.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'IPAddress';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'User agent of the request that created the block.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'UserAgent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Free-text notes, for example why an admin added the block.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'Notes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJ user who created the block (admin or API). NULL for provider- or recipient-originated blocks.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSuppression', @level2type=N'COLUMN', @level2name=N'CreatedByUserID';
GO

-- CommunicationConsentAuditLog
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Append-only history of every change to a suppression or principal preference. Never updated or deleted.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Suppression that changed. Exactly one of this and CommunicationPrincipalPreferenceID is set.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog', @level2type=N'COLUMN', @level2name=N'CommunicationSuppressionID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Principal preference that changed. Exactly one of this and CommunicationSuppressionID is set.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog', @level2type=N'COLUMN', @level2name=N'CommunicationPrincipalPreferenceID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Created, Updated, Revoked or Expired.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog', @level2type=N'COLUMN', @level2name=N'Action';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON snapshot of the row before the change. NULL on Created.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog', @level2type=N'COLUMN', @level2name=N'PreviousValue';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON snapshot of the row after the change.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog', @level2type=N'COLUMN', @level2name=N'NewValue';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Where the change came from.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog', @level2type=N'COLUMN', @level2name=N'Source';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Message whose link or event caused the change, when applicable.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog', @level2type=N'COLUMN', @level2name=N'CommunicationLogID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'IP address of the request that made the change.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog', @level2type=N'COLUMN', @level2name=N'IPAddress';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'User agent of the request that made the change.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog', @level2type=N'COLUMN', @level2name=N'UserAgent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJ user who made the change, when not the person themselves.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog', @level2type=N'COLUMN', @level2name=N'ChangedByUserID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the change happened.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationConsentAuditLog', @level2type=N'COLUMN', @level2name=N'ChangedAt';
GO

-- CommunicationLog (new columns)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Entity of the principal record the message was sent to.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'EntityID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Primary key of the principal record (polymorphic, paired with EntityID). NULL for transactional sends to a bare address.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'RecordID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Endpoint the message was sent to.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'CommunicationEndpointID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Address as sent, kept even if the endpoint row later changes.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'RecipientAddress';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sender the message went out on behalf of. Scopes any unsubscribe or complaint the message triggers.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'CommunicationSenderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Preference the message was sent under. Scopes a one-click unsubscribe.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'CommunicationPreferenceID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Transactional, Operational or Marketing. NULL for messages logged before Communications V2.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'MessageClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Requested send time (SendAt), or the deferral time the compliance gate set (for example after quiet hours).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'ScheduledAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The provider''s ID for the message (for example SendGrid X-Message-Id). Set once handed off; the send handler skips logs that already have one.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'ProviderMessageID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Non-enumerable random UUIDv4 capability token used in one-click unsubscribe and preference center links.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'UnsubscribeToken';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Separate random UUIDv4 token for open-tracking pixels so image-proxy logs never hold unsubscribe capability.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'TrackingToken';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Caller-supplied JSON echoed into provider tracking metadata and back on every activity event (for example a campaign or sequence step ID).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'CorrelationData';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON record of the gate''s decision: applicable regimes and jurisdictions, resolved rules, obligations injected. Evidence of why the message was allowed.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationLog', @level2type=N'COLUMN', @level2name=N'ComplianceDecision';
GO

-- CommunicationActivity
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Normalized delivery and engagement events from providers and the one-click unsubscribe endpoint. One row per provider event.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Message the event belongs to. NULL when the event could not be matched.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'CommunicationLogID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Endpoint the event concerns.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'CommunicationEndpointID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sender of the message, copied from the log for reporting without a join.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'CommunicationSenderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider that reported the event.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'CommunicationProviderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Normalized event type.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'EventType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the event happened, per the provider.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'OccurredAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When MJ received the event.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'ReceivedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider''s unique event ID (for example SendGrid sg_event_id). Unique per provider; duplicates are dropped.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'ProviderEventID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider''s message ID, used to match the event when tracking metadata is missing.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'ProviderMessageID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Clicked URL, for Clicked events.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'TargetURL';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'SMTP or provider bounce code, for bounce events.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'BounceCode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider bounce or drop explanation.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'BounceReason';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'1 when the open or click is judged automated (mail privacy proxies, link scanners). Excluded from engagement.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'IsMachineEvent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'IP address reported with the event. Subject to the retention policy.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'IPAddress';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'User agent reported with the event. Subject to the retention policy.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'UserAgent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Caller CorrelationData echoed back by the provider.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'CorrelationData';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Original provider payload for troubleshooting. Purged under the retention policy.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationActivity', @level2type=N'COLUMN', @level2name=N'RawPayload';
GO

-- CommunicationComplianceRegime
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A legal regime admins can turn on, such as CAN-SPAM, GDPR, CASL or TCPA. A set of rules attached to jurisdictions. When several apply, each rule type resolves to its strictest value.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegime';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique regime name.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegime', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Summary of the regime and its scope.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegime', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whose jurisdiction triggers the regime: the recipient''s, the sender''s, or either.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegime', @level2type=N'COLUMN', @level2name=N'AppliesBy';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, the regime applies to recipients whose jurisdiction cannot be resolved. Default 1, so unknown recipients get the strictest combination of enabled regimes.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegime', @level2type=N'COLUMN', @level2name=N'AppliesWhenJurisdictionUnknown';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Link to the authoritative text or the legal review behind the rule parameters.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegime', @level2type=N'COLUMN', @level2name=N'ReferenceURL';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active regimes are enforced. Defaults to Disabled: an admin turns each regime on.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegime', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- CommunicationComplianceRuleType
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A kind of compliance rule (ConsentModel, UnsubscribeMechanism, QuietHours, ...). Its driver evaluates the rule for a recipient and combines parameters from several regimes into the strictest result.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRuleType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique rule type name.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRuleType', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What the rule controls and how the strictest value is chosen.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRuleType', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ClassFactory key of a BaseComplianceRule subclass implementing Evaluate and Combine.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRuleType', @level2type=N'COLUMN', @level2name=N'DriverClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON schema that regime rule Parameters must satisfy.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRuleType', @level2type=N'COLUMN', @level2name=N'ParameterSchema';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active or Disabled.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRuleType', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- CommunicationComplianceRegimeRule
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One rule in one regime, optionally narrowed to a channel and message class. Parameter values come from legal review, not engineering.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegimeRule';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The regime this rule belongs to.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegimeRule', @level2type=N'COLUMN', @level2name=N'CommunicationComplianceRegimeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The kind of rule.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegimeRule', @level2type=N'COLUMN', @level2name=N'CommunicationComplianceRuleTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Channel the rule applies to. NULL = all channels.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegimeRule', @level2type=N'COLUMN', @level2name=N'BaseMessageTypeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Message class the rule applies to. NULL = all classes.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegimeRule', @level2type=N'COLUMN', @level2name=N'MessageClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Rule parameters as JSON, validated against the rule type''s ParameterSchema, for example {"Model":"Opt-In"} or {"StartHour":21,"EndHour":8}.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegimeRule', @level2type=N'COLUMN', @level2name=N'Parameters';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Citation or reviewer notes for the parameter values.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegimeRule', @level2type=N'COLUMN', @level2name=N'Notes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active or Disabled.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegimeRule', @level2type=N'COLUMN', @level2name=N'Status';
GO

-- CommunicationComplianceRegimeJurisdiction
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Where a regime applies. Attach a regime to a group (EU) to cover all its members.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegimeJurisdiction';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The regime.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegimeJurisdiction', @level2type=N'COLUMN', @level2name=N'CommunicationComplianceRegimeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The jurisdiction (country, subdivision or group) where it applies.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationComplianceRegimeJurisdiction', @level2type=N'COLUMN', @level2name=N'JurisdictionID';
GO

-- CommunicationProviderEvent
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Deduplication ledger for inbound provider webhook events, active regardless of whether CommunicationActivity storage is enabled. Rows older than 7 days are purged.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationProviderEvent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider that delivered the webhook event.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationProviderEvent', @level2type=N'COLUMN', @level2name=N'CommunicationProviderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider''s unique event ID (for example SendGrid sg_event_id).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationProviderEvent', @level2type=N'COLUMN', @level2name=N'ProviderEventID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When MJ processed the event, used by the 7-day retention purge.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationProviderEvent', @level2type=N'COLUMN', @level2name=N'ReceivedAt';
GO

-- CommunicationProvider (RequireVerifiedDomain) & CommunicationSendingDomain
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, sends through this provider require a Verified Communication Sending Domain matching the sender''s domain and credential.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationProvider', @level2type=N'COLUMN', @level2name=N'RequireVerifiedDomain';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Authenticated sending domains (SPF, DKIM, DMARC) per provider and credential. Multiple senders sharing a domain and credential share one record.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSendingDomain';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider that authenticates the domain (for example SendGrid).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSendingDomain', @level2type=N'COLUMN', @level2name=N'CommunicationProviderID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJ: Credential (account or subuser) owning this domain authentication. NULL uses default environment credentials.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSendingDomain', @level2type=N'COLUMN', @level2name=N'CredentialID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Authenticated sending domain (for example mail.example.org).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSendingDomain', @level2type=N'COLUMN', @level2name=N'Domain';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider''s domain-authentication record ID (for example SendGrid whitelabel domain ID).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSendingDomain', @level2type=N'COLUMN', @level2name=N'ProviderDomainID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pending, Verified, Failed or Revoked.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSendingDomain', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON array of required DNS records (Type, Purpose, Host, Value, Validated, LastError) returned by the provider.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSendingDomain', @level2type=N'COLUMN', @level2name=N'DNSRecords';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When DNS validation was last checked.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSendingDomain', @level2type=N'COLUMN', @level2name=N'LastVerifiedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the domain first reached Verified status.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CommunicationSendingDomain', @level2type=N'COLUMN', @level2name=N'VerifiedAt';
GO