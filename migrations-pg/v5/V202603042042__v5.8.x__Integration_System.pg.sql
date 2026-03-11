-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER -> BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER->bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

-- Migration: Integration System tables
-- Creates IntegrationSourceType, CompanyIntegrationEntityMap, CompanyIntegrationFieldMap,
-- CompanyIntegrationSyncWatermark, and adds SourceTypeID/Configuration to CompanyIntegration.

----------------------------------------------------------------------
-- 1. IntegrationSourceType
----------------------------------------------------------------------
CREATE TABLE __mj."IntegrationSourceType" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "Name" VARCHAR(200) NOT NULL,
 "Description" TEXT NULL,
 "DriverClass" VARCHAR(500) NOT NULL,
 "IconClass" VARCHAR(200) NULL,
 "Status" VARCHAR(50) NOT NULL DEFAULT 'Active',
 CONSTRAINT PK_IntegrationSourceType PRIMARY KEY ("ID"),
 CONSTRAINT UQ_IntegrationSourceType_Name UNIQUE ("Name"),
 CONSTRAINT UQ_IntegrationSourceType_DriverClass UNIQUE ("DriverClass"),
 CONSTRAINT CK_IntegrationSourceType_Status CHECK ("Status" IN ('Active', 'Inactive'))
);

----------------------------------------------------------------------
-- 2. CompanyIntegrationEntityMap
----------------------------------------------------------------------
CREATE TABLE __mj."CompanyIntegrationEntityMap" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "CompanyIntegrationID" UUID NOT NULL,
 "ExternalObjectName" VARCHAR(500) NOT NULL,
 "ExternalObjectLabel" VARCHAR(500) NULL,
 "EntityID" UUID NOT NULL,
 "SyncDirection" VARCHAR(50) NOT NULL DEFAULT 'Pull',
 "SyncEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
 "MatchStrategy" TEXT NULL,
 "ConflictResolution" VARCHAR(50) NOT NULL DEFAULT 'SourceWins',
 "Priority" INTEGER NOT NULL DEFAULT 0,
 "DeleteBehavior" VARCHAR(50) NOT NULL DEFAULT 'SoftDelete',
 "Status" VARCHAR(50) NOT NULL DEFAULT 'Active',
 "Configuration" TEXT NULL,
 CONSTRAINT PK_CompanyIntegrationEntityMap PRIMARY KEY ("ID"),
 CONSTRAINT FK_CompanyIntegrationEntityMap_CompanyIntegration FOREIGN KEY ("CompanyIntegrationID") REFERENCES __mj."CompanyIntegration"("ID"),
 CONSTRAINT FK_CompanyIntegrationEntityMap_Entity FOREIGN KEY ("EntityID") REFERENCES __mj."Entity"("ID"),
 CONSTRAINT CK_CompanyIntegrationEntityMap_SyncDirection CHECK ("SyncDirection" IN ('Pull', 'Push', 'Bidirectional')),
 CONSTRAINT CK_CompanyIntegrationEntityMap_ConflictResolution CHECK ("ConflictResolution" IN ('SourceWins', 'DestWins', 'MostRecent', 'Manual')),
 CONSTRAINT CK_CompanyIntegrationEntityMap_DeleteBehavior CHECK ("DeleteBehavior" IN ('SoftDelete', 'DoNothing', 'HardDelete')),
 CONSTRAINT CK_CompanyIntegrationEntityMap_Status CHECK ("Status" IN ('Active', 'Inactive'))
);

----------------------------------------------------------------------
-- 3. CompanyIntegrationFieldMap
----------------------------------------------------------------------
CREATE TABLE __mj."CompanyIntegrationFieldMap" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EntityMapID" UUID NOT NULL,
 "SourceFieldName" VARCHAR(500) NOT NULL,
 "SourceFieldLabel" VARCHAR(500) NULL,
 "DestinationFieldName" VARCHAR(500) NOT NULL,
 "DestinationFieldLabel" VARCHAR(500) NULL,
 "Direction" VARCHAR(50) NOT NULL DEFAULT 'SourceToDest',
 "TransformPipeline" TEXT NULL,
 "IsKeyField" BOOLEAN NOT NULL DEFAULT FALSE,
 "IsRequired" BOOLEAN NOT NULL DEFAULT FALSE,
 "DefaultValue" TEXT NULL,
 "Priority" INTEGER NOT NULL DEFAULT 0,
 "Status" VARCHAR(50) NOT NULL DEFAULT 'Active',
 CONSTRAINT PK_CompanyIntegrationFieldMap PRIMARY KEY ("ID"),
 CONSTRAINT FK_CompanyIntegrationFieldMap_EntityMap FOREIGN KEY ("EntityMapID") REFERENCES __mj."CompanyIntegrationEntityMap"("ID"),
 CONSTRAINT CK_CompanyIntegrationFieldMap_Direction CHECK ("Direction" IN ('SourceToDest', 'DestToSource', 'Both')),
 CONSTRAINT CK_CompanyIntegrationFieldMap_Status CHECK ("Status" IN ('Active', 'Inactive'))
);

----------------------------------------------------------------------
-- 4. CompanyIntegrationSyncWatermark
----------------------------------------------------------------------
CREATE TABLE __mj."CompanyIntegrationSyncWatermark" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EntityMapID" UUID NOT NULL,
 "Direction" VARCHAR(50) NOT NULL DEFAULT 'Pull',
 "WatermarkType" VARCHAR(50) NOT NULL DEFAULT 'Timestamp',
 "WatermarkValue" TEXT NULL,
 "LastSyncAt" TIMESTAMPTZ NULL,
 "RecordsSynced" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT PK_CompanyIntegrationSyncWatermark PRIMARY KEY ("ID"),
 CONSTRAINT FK_CompanyIntegrationSyncWatermark_EntityMap FOREIGN KEY ("EntityMapID") REFERENCES __mj."CompanyIntegrationEntityMap"("ID"),
 CONSTRAINT CK_CompanyIntegrationSyncWatermark_Direction CHECK ("Direction" IN ('Pull', 'Push')),
 CONSTRAINT CK_CompanyIntegrationSyncWatermark_WatermarkType CHECK ("WatermarkType" IN ('Timestamp', 'Cursor', 'ChangeToken', 'Version')),
 CONSTRAINT UQ_CompanyIntegrationSyncWatermark_EntityMap_Direction UNIQUE ("EntityMapID", "Direction")
);

----------------------------------------------------------------------
-- 5. Add columns to CompanyIntegration
----------------------------------------------------------------------
ALTER TABLE __mj."CompanyIntegration"
 ADD SourceTypeID UUID NULL,
 Configuration TEXT NULL;

ALTER TABLE __mj."CompanyIntegration"
 ADD CONSTRAINT FK_CompanyIntegration_IntegrationSourceType
 FOREIGN KEY ("SourceTypeID") REFERENCES __mj."IntegrationSourceType"("ID");

----------------------------------------------------------------------
-- 6. Extended Properties — Table Descriptions
----------------------------------------------------------------------
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description',
 @value = 'Defines categories of integration sources such as SaaS API, Relational Database, or File Feed.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'IntegrationSourceType';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description',
 @value = 'Maps an external object from a company integration to a MemberJunction entity, controlling sync direction, matching, and conflict resolution.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationEntityMap';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description',
 @value = 'Maps individual fields between an external source object and a MemberJunction entity, with optional transform pipeline.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description',
 @value = 'Tracks incremental sync progress per entity map and direction using watermarks (timestamp, cursor, change token, or version).',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationSyncWatermark';

----------------------------------------------------------------------
-- 7. Extended Properties — IntegrationSourceType Columns
----------------------------------------------------------------------
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Display name for this source type (e.g. SaaS API, Relational Database, File Feed).',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'IntegrationSourceType',
 @level2type = 'COLUMN', @level2name = 'Name';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Optional longer description of this source type.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'IntegrationSourceType',
 @level2type = 'COLUMN', @level2name = 'Description';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Fully-qualified class name registered via @RegisterClass that implements BaseIntegrationConnector for this source type.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'IntegrationSourceType',
 @level2type = 'COLUMN', @level2name = 'DriverClass';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Font Awesome icon class for UI display.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'IntegrationSourceType',
 @level2type = 'COLUMN', @level2name = 'IconClass';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Whether this source type is available for use. Active or Inactive.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'IntegrationSourceType',
 @level2type = 'COLUMN', @level2name = 'Status';

----------------------------------------------------------------------
-- 8. Extended Properties — CompanyIntegrationEntityMap Columns
----------------------------------------------------------------------
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'The name of the object in the external system (e.g. table name, API resource name).',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationEntityMap',
 @level2type = 'COLUMN', @level2name = 'ExternalObjectName';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Optional human-friendly label for the external object.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationEntityMap',
 @level2type = 'COLUMN', @level2name = 'ExternalObjectLabel';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Whether data flows from external to MJ (Pull), MJ to external (Push), or both.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationEntityMap',
 @level2type = 'COLUMN', @level2name = 'SyncDirection';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'When true, this entity map is included in sync runs.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationEntityMap',
 @level2type = 'COLUMN', @level2name = 'SyncEnabled';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'JSON configuration for the match engine describing how to identify existing records (key fields, fuzzy thresholds, etc.).',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationEntityMap',
 @level2type = 'COLUMN', @level2name = 'MatchStrategy';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'How to handle conflicts when both source and destination have been modified. SourceWins, DestWins, MostRecent, or Manual.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationEntityMap',
 @level2type = 'COLUMN', @level2name = 'ConflictResolution';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Processing order when multiple entity maps exist. Lower numbers are processed first.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationEntityMap',
 @level2type = 'COLUMN', @level2name = 'Priority';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'How to handle records that no longer exist in the source. SoftDelete, DoNothing, or HardDelete.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationEntityMap',
 @level2type = 'COLUMN', @level2name = 'DeleteBehavior';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Whether this entity map is Active or Inactive.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationEntityMap',
 @level2type = 'COLUMN', @level2name = 'Status';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Optional JSON configuration specific to this entity mapping.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationEntityMap',
 @level2type = 'COLUMN', @level2name = 'Configuration';

----------------------------------------------------------------------
-- 9. Extended Properties — CompanyIntegrationFieldMap Columns
----------------------------------------------------------------------
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'The field/column name in the external source system.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap',
 @level2type = 'COLUMN', @level2name = 'SourceFieldName';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Optional human-friendly label for the source field.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap',
 @level2type = 'COLUMN', @level2name = 'SourceFieldLabel';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'The MJ entity field name this source field maps to.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap',
 @level2type = 'COLUMN', @level2name = 'DestinationFieldName';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Optional human-friendly label for the destination field.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap',
 @level2type = 'COLUMN', @level2name = 'DestinationFieldLabel';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Direction of field mapping: SourceToDest, DestToSource, or Both.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap',
 @level2type = 'COLUMN', @level2name = 'Direction';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'JSON array of transform names to apply in order (e.g. ["trim", "uppercase"]). See FieldMappingEngine for available transforms.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap',
 @level2type = 'COLUMN', @level2name = 'TransformPipeline';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'When true, this field is used by the MatchEngine to find existing records during sync.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap',
 @level2type = 'COLUMN', @level2name = 'IsKeyField';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'When true, a sync record is rejected if this field has no value.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap',
 @level2type = 'COLUMN', @level2name = 'IsRequired';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Default value to use when the source field is null or missing.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap',
 @level2type = 'COLUMN', @level2name = 'DefaultValue';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Processing order for this field mapping within the entity map.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap',
 @level2type = 'COLUMN', @level2name = 'Priority';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Whether this field mapping is Active or Inactive.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationFieldMap',
 @level2type = 'COLUMN', @level2name = 'Status';

----------------------------------------------------------------------
-- 10. Extended Properties — CompanyIntegrationSyncWatermark Columns
----------------------------------------------------------------------
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Sync direction this watermark tracks: Pull or Push.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationSyncWatermark',
 @level2type = 'COLUMN', @level2name = 'Direction';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'The type of watermark: Timestamp, Cursor, ChangeToken, or Version.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationSyncWatermark',
 @level2type = 'COLUMN', @level2name = 'WatermarkType';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'The serialized watermark value used to resume incremental sync.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationSyncWatermark',
 @level2type = 'COLUMN', @level2name = 'WatermarkValue';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Timestamp of the last successful sync for this watermark.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationSyncWatermark',
 @level2type = 'COLUMN', @level2name = 'LastSyncAt';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Cumulative count of records synced through this watermark.',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegrationSyncWatermark',
 @level2type = 'COLUMN', @level2name = 'RecordsSynced';

----------------------------------------------------------------------
-- 11. Extended Properties — New CompanyIntegration Columns
----------------------------------------------------------------------
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'Links this integration to its source type (SaaS API, Database, File Feed, etc.).',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegration',
 @level2type = 'COLUMN', @level2name = 'SourceTypeID';
-- SKIPPED EXEC (not supported in PG)
 @name = 'MS_Description', @value = 'JSON configuration for the integration connection (server, database, credentials reference, etc.).',
 @level0type = 'SCHEMA', @level0name = '__mj',
 @level1type = 'TABLE', @level1name = 'CompanyIntegration',
 @level2type = 'COLUMN', @level2name = 'Configuration';


-- CODE GEN RUN
/* SQL generated to create new entity MJ: Integration Source Types */

 INSERT INTO __mj."Entity" (
 "ID",
 "Name",
 "DisplayName",
 "Description",
 "NameSuffix",
 "BaseTable",
 "BaseView",
 "SchemaName",
 "IncludeInAPI",
 "AllowUserSearchAPI"
 , "TrackRecordChanges"
 , "AuditRecordAccess"
 , "AuditViewRuns"
 , "AllowAllRowsAPI"
 , "AllowCreateAPI"
 , "AllowUpdateAPI"
 , "AllowDeleteAPI"
 , "UserViewMaxRows"
 , "__mj_CreatedAt"
 , "__mj_UpdatedAt"
 )
 VALUES (
 '57801845-6620-4cbd-993f-e4aa2d464a04',
 'MJ: Integration Source Types',
 'Integration Source Types',
 'Defines categories of integration sources such as SaaS API, Relational Database, or File Feed.',
 NULL,
 'IntegrationSourceType',
 'vwIntegrationSourceTypes',
 '__mj',
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
 , GETUTCDATE()
 , GETUTCDATE()
 )
 

/* SQL generated to add new entity MJ: Integration Source Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity"
 ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '57801845-6620-4cbd-993f-e4aa2d464a04', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Source Types for role UI */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('57801845-6620-4cbd-993f-e4aa2d464a04', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Source Types for role Developer */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('57801845-6620-4cbd-993f-e4aa2d464a04', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Integration Source Types for role Integration */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('57801845-6620-4cbd-993f-e4aa2d464a04', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Company Integration Entity Maps */

 INSERT INTO __mj."Entity" (
 "ID",
 "Name",
 "DisplayName",
 "Description",
 "NameSuffix",
 "BaseTable",
 "BaseView",
 "SchemaName",
 "IncludeInAPI",
 "AllowUserSearchAPI"
 , "TrackRecordChanges"
 , "AuditRecordAccess"
 , "AuditViewRuns"
 , "AllowAllRowsAPI"
 , "AllowCreateAPI"
 , "AllowUpdateAPI"
 , "AllowDeleteAPI"
 , "UserViewMaxRows"
 , "__mj_CreatedAt"
 , "__mj_UpdatedAt"
 )
 VALUES (
 '41579cac-5ddc-48b4-8703-31292be0a414',
 'MJ: Company Integration Entity Maps',
 'Company Integration Entity Maps',
 'Maps an external object from a company integration to a MemberJunction entity, controlling sync direction, matching, and conflict resolution.',
 NULL,
 'CompanyIntegrationEntityMap',
 'vwCompanyIntegrationEntityMaps',
 '__mj',
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
 , GETUTCDATE()
 , GETUTCDATE()
 )
 

/* SQL generated to add new entity MJ: Company Integration Entity Maps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity"
 ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '41579cac-5ddc-48b4-8703-31292be0a414', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role UI */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('41579cac-5ddc-48b4-8703-31292be0a414', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role Developer */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('41579cac-5ddc-48b4-8703-31292be0a414', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Entity Maps for role Integration */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('41579cac-5ddc-48b4-8703-31292be0a414', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Company Integration Field Maps */

 INSERT INTO __mj."Entity" (
 "ID",
 "Name",
 "DisplayName",
 "Description",
 "NameSuffix",
 "BaseTable",
 "BaseView",
 "SchemaName",
 "IncludeInAPI",
 "AllowUserSearchAPI"
 , "TrackRecordChanges"
 , "AuditRecordAccess"
 , "AuditViewRuns"
 , "AllowAllRowsAPI"
 , "AllowCreateAPI"
 , "AllowUpdateAPI"
 , "AllowDeleteAPI"
 , "UserViewMaxRows"
 , "__mj_CreatedAt"
 , "__mj_UpdatedAt"
 )
 VALUES (
 'feca4edd-74f9-4a1c-a284-e586e76b23fe',
 'MJ: Company Integration Field Maps',
 'Company Integration Field Maps',
 'Maps individual fields between an external source object and a MemberJunction entity, with optional transform pipeline.',
 NULL,
 'CompanyIntegrationFieldMap',
 'vwCompanyIntegrationFieldMaps',
 '__mj',
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
 , GETUTCDATE()
 , GETUTCDATE()
 )
 

/* SQL generated to add new entity MJ: Company Integration Field Maps to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity"
 ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'feca4edd-74f9-4a1c-a284-e586e76b23fe', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role UI */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('feca4edd-74f9-4a1c-a284-e586e76b23fe', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role Developer */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('feca4edd-74f9-4a1c-a284-e586e76b23fe', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Field Maps for role Integration */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('feca4edd-74f9-4a1c-a284-e586e76b23fe', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Company Integration Sync Watermarks */

 INSERT INTO __mj."Entity" (
 "ID",
 "Name",
 "DisplayName",
 "Description",
 "NameSuffix",
 "BaseTable",
 "BaseView",
 "SchemaName",
 "IncludeInAPI",
 "AllowUserSearchAPI"
 , "TrackRecordChanges"
 , "AuditRecordAccess"
 , "AuditViewRuns"
 , "AllowAllRowsAPI"
 , "AllowCreateAPI"
 , "AllowUpdateAPI"
 , "AllowDeleteAPI"
 , "UserViewMaxRows"
 , "__mj_CreatedAt"
 , "__mj_UpdatedAt"
 )
 VALUES (
 'd5c4fef3-21d0-4a41-893b-34f9527195f0',
 'MJ: Company Integration Sync Watermarks',
 'Company Integration Sync Watermarks',
 'Tracks incremental sync progress per entity map and direction using watermarks (timestamp, cursor, change token, or version).',
 NULL,
 'CompanyIntegrationSyncWatermark',
 'vwCompanyIntegrationSyncWatermarks',
 '__mj',
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
 , GETUTCDATE()
 , GETUTCDATE()
 )
 

/* SQL generated to add new entity MJ: Company Integration Sync Watermarks to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity"
 ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd5c4fef3-21d0-4a41-893b-34f9527195f0', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role UI */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('d5c4fef3-21d0-4a41-893b-34f9527195f0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role Developer */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('d5c4fef3-21d0-4a41-893b-34f9527195f0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Company Integration Sync Watermarks for role Integration */
INSERT INTO __mj."EntityPermission"
 ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
 ('d5c4fef3-21d0-4a41-893b-34f9527195f0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity __mj."CompanyIntegrationEntityMap" */
ALTER TABLE __mj."CompanyIntegrationEntityMap" ADD __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()/* SQL text to add special date field __mj_UpdatedAt to entity __mj."CompanyIntegrationEntityMap" */
ALTER TABLE __mj."CompanyIntegrationEntityMap" ADD __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()/* SQL text to add special date field __mj_CreatedAt to entity __mj."CompanyIntegrationSyncWatermark" */
ALTER TABLE __mj."CompanyIntegrationSyncWatermark" ADD __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()/* SQL text to add special date field __mj_UpdatedAt to entity __mj."CompanyIntegrationSyncWatermark" */
ALTER TABLE __mj."CompanyIntegrationSyncWatermark" ADD __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()/* SQL text to add special date field __mj_CreatedAt to entity __mj."IntegrationSourceType" */
ALTER TABLE __mj."IntegrationSourceType" ADD __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()/* SQL text to add special date field __mj_UpdatedAt to entity __mj."IntegrationSourceType" */
ALTER TABLE __mj."IntegrationSourceType" ADD __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()/* SQL text to add special date field __mj_CreatedAt to entity __mj."CompanyIntegrationFieldMap" */
ALTER TABLE __mj."CompanyIntegrationFieldMap" ADD __mj_CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()/* SQL text to add special date field __mj_UpdatedAt to entity __mj."CompanyIntegrationFieldMap" */
ALTER TABLE __mj."CompanyIntegrationFieldMap" ADD __mj_UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()/* SQL text to insert new entity field */

 CREATE INDEX IF NOT EXISTS IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_CompanyIntegrationID ON __mj."CompanyIntegrationEntityMap" ("CompanyIntegrationID");

-- Index for foreign key EntityID in table CompanyIntegrationEntityMap
CREATE INDEX IF NOT EXISTS IDX_AUTO_MJ_FKEY_CompanyIntegrationEntityMap_EntityID ON __mj."CompanyIntegrationEntityMap" ("EntityID");

/* SQL text to update entity field related entity name field map for entity field ID CA111FE4-61FE-49D0-9106-A75DE3035FB1 */
-- SKIPPED EXEC (not supported in PG)

/* Index for Foreign Keys for CompanyIntegrationFieldMap */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityMapID in table CompanyIntegrationFieldMap
CREATE INDEX IF NOT EXISTS IDX_AUTO_MJ_FKEY_CompanyIntegrationFieldMap_EntityMapID ON __mj."CompanyIntegrationFieldMap" ("EntityMapID");

/* Base View SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: vwCompanyIntegrationFieldMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY: MJ: Company Integration Field Maps
----- SCHEMA: __mj
----- BASE TABLE: CompanyIntegrationFieldMap
----- PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS __mj."vwCompanyIntegrationFieldMaps";;CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegrationSyncWatermark_EntityMapID" ON __mj."CompanyIntegrationSyncWatermark" ("EntityMapID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID" ON __mj."CompanyIntegration" ("CompanyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID" ON __mj."CompanyIntegration" ("IntegrationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_SourceTypeID" ON __mj."CompanyIntegration" ("SourceTypeID");


-- ===================== Views =====================

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationFieldMaps"
AS SELECT
    c.*
FROM
    __mj."CompanyIntegrationFieldMap" AS c$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwCompanyIntegrationFieldMaps" CASCADE;
  EXECUTE vsql;
END;
$do$;

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationEntityMaps"
AS SELECT
    c.*,
    "MJCompanyIntegration_CompanyIntegrationID"."Name" AS "CompanyIntegration",
    "MJEntity_EntityID"."Name" AS "Entity"
FROM
    __mj."CompanyIntegrationEntityMap" AS c
INNER JOIN
    __mj."CompanyIntegration" AS "MJCompanyIntegration_CompanyIntegrationID"
  ON
    c."CompanyIntegrationID" = "MJCompanyIntegration_CompanyIntegrationID"."ID"
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    c."EntityID" = "MJEntity_EntityID"."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwCompanyIntegrationEntityMaps" CASCADE;
  EXECUTE vsql;
END;
$do$;

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationSyncWatermarks"
AS SELECT
    c.*
FROM
    __mj."CompanyIntegrationSyncWatermark" AS c$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwCompanyIntegrationSyncWatermarks" CASCADE;
  EXECUTE vsql;
END;
$do$;

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwIntegrationSourceTypes"
AS SELECT
    i.*
FROM
    __mj."IntegrationSourceType" AS i$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwIntegrationSourceTypes" CASCADE;
  EXECUTE vsql;
END;
$do$;

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationFieldMaps"
AS SELECT
    c.*,
    "MJCompanyIntegrationEntityMap_EntityMapID"."ExternalObjectName" AS "EntityMap"
FROM
    __mj."CompanyIntegrationFieldMap" AS c
INNER JOIN
    __mj."CompanyIntegrationEntityMap" AS "MJCompanyIntegrationEntityMap_EntityMapID"
  ON
    c."EntityMapID" = "MJCompanyIntegrationEntityMap_EntityMapID"."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwCompanyIntegrationFieldMaps" CASCADE;
  EXECUTE vsql;
END;
$do$;

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationSyncWatermarks"
AS SELECT
    c.*,
    "MJCompanyIntegrationEntityMap_EntityMapID"."ExternalObjectName" AS "EntityMap"
FROM
    __mj."CompanyIntegrationSyncWatermark" AS c
INNER JOIN
    __mj."CompanyIntegrationEntityMap" AS "MJCompanyIntegrationEntityMap_EntityMapID"
  ON
    c."EntityMapID" = "MJCompanyIntegrationEntityMap_EntityMapID"."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwCompanyIntegrationSyncWatermarks" CASCADE;
  EXECUTE vsql;
END;
$do$;

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationFieldMaps"
AS SELECT
    c.*,
    "MJCompanyIntegrationEntityMap_EntityMapID"."ExternalObjectName" AS "EntityMap"
FROM
    __mj."CompanyIntegrationFieldMap" AS c
INNER JOIN
    __mj."CompanyIntegrationEntityMap" AS "MJCompanyIntegrationEntityMap_EntityMapID"
  ON
    c."EntityMapID" = "MJCompanyIntegrationEntityMap_EntityMapID"."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwCompanyIntegrationFieldMaps" CASCADE;
  EXECUTE vsql;
END;
$do$;

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationSyncWatermarks"
AS SELECT
    c.*,
    "MJCompanyIntegrationEntityMap_EntityMapID"."ExternalObjectName" AS "EntityMap"
FROM
    __mj."CompanyIntegrationSyncWatermark" AS c
INNER JOIN
    __mj."CompanyIntegrationEntityMap" AS "MJCompanyIntegrationEntityMap_EntityMapID"
  ON
    c."EntityMapID" = "MJCompanyIntegrationEntityMap_EntityMapID"."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwCompanyIntegrationSyncWatermarks" CASCADE;
  EXECUTE vsql;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationFieldMap"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_SourceFieldName VARCHAR(500) DEFAULT NULL,
    IN p_SourceFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldName VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_TransformPipeline TEXT DEFAULT NULL,
    IN p_IsKeyField BOOLEAN DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_DefaultValue TEXT DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "ID",
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationFieldMap"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_SourceFieldName VARCHAR(500),
    IN p_SourceFieldLabel VARCHAR(500),
    IN p_DestinationFieldName VARCHAR(500),
    IN p_DestinationFieldLabel VARCHAR(500),
    IN p_Direction VARCHAR(50),
    IN p_TransformPipeline TEXT,
    IN p_IsKeyField BOOLEAN,
    IN p_IsRequired BOOLEAN,
    IN p_DefaultValue TEXT,
    IN p_Priority INTEGER,
    IN p_Status VARCHAR(50)
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationFieldMap"
    SET
        "EntityMapID" = p_EntityMapID,
        "SourceFieldName" = p_SourceFieldName,
        "SourceFieldLabel" = p_SourceFieldLabel,
        "DestinationFieldName" = p_DestinationFieldName,
        "DestinationFieldLabel" = p_DestinationFieldLabel,
        "Direction" = p_Direction,
        "TransformPipeline" = p_TransformPipeline,
        "IsKeyField" = p_IsKeyField,
        "IsRequired" = p_IsRequired,
        "DefaultValue" = p_DefaultValue,
        "Priority" = p_Priority,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationFieldMap"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationFieldMap"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationEntityMap"(
    IN p_ID UUID DEFAULT NULL,
    IN p_CompanyIntegrationID UUID DEFAULT NULL,
    IN p_ExternalObjectName VARCHAR(500) DEFAULT NULL,
    IN p_ExternalObjectLabel VARCHAR(500) DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_SyncDirection VARCHAR(50) DEFAULT NULL,
    IN p_SyncEnabled BOOLEAN DEFAULT NULL,
    IN p_MatchStrategy TEXT DEFAULT NULL,
    IN p_ConflictResolution VARCHAR(50) DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_DeleteBehavior VARCHAR(50) DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationEntityMaps" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationEntityMap"
            (
                "ID",
                "CompanyIntegrationID",
                "ExternalObjectName",
                "ExternalObjectLabel",
                "EntityID",
                "SyncDirection",
                "SyncEnabled",
                "MatchStrategy",
                "ConflictResolution",
                "Priority",
                "DeleteBehavior",
                "Status",
                "Configuration"
            )
        VALUES
            (
                p_ID,
                p_CompanyIntegrationID,
                p_ExternalObjectName,
                p_ExternalObjectLabel,
                p_EntityID,
                COALESCE(p_SyncDirection, 'Pull'),
                COALESCE(p_SyncEnabled, TRUE),
                p_MatchStrategy,
                COALESCE(p_ConflictResolution, 'SourceWins'),
                COALESCE(p_Priority, 0),
                COALESCE(p_DeleteBehavior, 'SoftDelete'),
                COALESCE(p_Status, 'Active'),
                p_Configuration
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationEntityMap"
            (
                "CompanyIntegrationID",
                "ExternalObjectName",
                "ExternalObjectLabel",
                "EntityID",
                "SyncDirection",
                "SyncEnabled",
                "MatchStrategy",
                "ConflictResolution",
                "Priority",
                "DeleteBehavior",
                "Status",
                "Configuration"
            )
        VALUES
            (
                p_CompanyIntegrationID,
                p_ExternalObjectName,
                p_ExternalObjectLabel,
                p_EntityID,
                COALESCE(p_SyncDirection, 'Pull'),
                COALESCE(p_SyncEnabled, TRUE),
                p_MatchStrategy,
                COALESCE(p_ConflictResolution, 'SourceWins'),
                COALESCE(p_Priority, 0),
                COALESCE(p_DeleteBehavior, 'SoftDelete'),
                COALESCE(p_Status, 'Active'),
                p_Configuration
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationEntityMaps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationEntityMap"(
    IN p_ID UUID,
    IN p_CompanyIntegrationID UUID,
    IN p_ExternalObjectName VARCHAR(500),
    IN p_ExternalObjectLabel VARCHAR(500),
    IN p_EntityID UUID,
    IN p_SyncDirection VARCHAR(50),
    IN p_SyncEnabled BOOLEAN,
    IN p_MatchStrategy TEXT,
    IN p_ConflictResolution VARCHAR(50),
    IN p_Priority INTEGER,
    IN p_DeleteBehavior VARCHAR(50),
    IN p_Status VARCHAR(50),
    IN p_Configuration TEXT
)
RETURNS SETOF __mj."vwCompanyIntegrationEntityMaps" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationEntityMap"
    SET
        "CompanyIntegrationID" = p_CompanyIntegrationID,
        "ExternalObjectName" = p_ExternalObjectName,
        "ExternalObjectLabel" = p_ExternalObjectLabel,
        "EntityID" = p_EntityID,
        "SyncDirection" = p_SyncDirection,
        "SyncEnabled" = p_SyncEnabled,
        "MatchStrategy" = p_MatchStrategy,
        "ConflictResolution" = p_ConflictResolution,
        "Priority" = p_Priority,
        "DeleteBehavior" = p_DeleteBehavior,
        "Status" = p_Status,
        "Configuration" = p_Configuration
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationEntityMaps" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationEntityMaps" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationEntityMap"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationEntityMap"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

-- SKIPPED: References view "vwCompanyIntegrations" not created in this file (CodeGen will recreate)

-- SKIPPED: References view "vwCompanyIntegrations" not created in this file (CodeGen will recreate)

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegration"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkType VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkValue TEXT DEFAULT NULL,
    IN p_LastSyncAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RecordsSynced INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "ID",
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_Direction VARCHAR(50),
    IN p_WatermarkType VARCHAR(50),
    IN p_WatermarkValue TEXT,
    IN p_LastSyncAt TIMESTAMPTZ,
    IN p_RecordsSynced INTEGER
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationSyncWatermark"
    SET
        "EntityMapID" = p_EntityMapID,
        "Direction" = p_Direction,
        "WatermarkType" = p_WatermarkType,
        "WatermarkValue" = p_WatermarkValue,
        "LastSyncAt" = p_LastSyncAt,
        "RecordsSynced" = p_RecordsSynced
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationSyncWatermark"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateIntegrationSourceType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DriverClass VARCHAR(500) DEFAULT NULL,
    IN p_IconClass VARCHAR(200) DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL
)
RETURNS SETOF __mj."vwIntegrationSourceTypes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."IntegrationSourceType"
            (
                "ID",
                "Name",
                "Description",
                "DriverClass",
                "IconClass",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_DriverClass,
                p_IconClass,
                COALESCE(p_Status, 'Active')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."IntegrationSourceType"
            (
                "Name",
                "Description",
                "DriverClass",
                "IconClass",
                "Status"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_DriverClass,
                p_IconClass,
                COALESCE(p_Status, 'Active')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwIntegrationSourceTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateIntegrationSourceType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(200),
    IN p_Description TEXT,
    IN p_DriverClass VARCHAR(500),
    IN p_IconClass VARCHAR(200),
    IN p_Status VARCHAR(50)
)
RETURNS SETOF __mj."vwIntegrationSourceTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."IntegrationSourceType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DriverClass" = p_DriverClass,
        "IconClass" = p_IconClass,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwIntegrationSourceTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwIntegrationSourceTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteIntegrationSourceType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."IntegrationSourceType"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationFieldMap"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_SourceFieldName VARCHAR(500) DEFAULT NULL,
    IN p_SourceFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldName VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_TransformPipeline TEXT DEFAULT NULL,
    IN p_IsKeyField BOOLEAN DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_DefaultValue TEXT DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "ID",
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationFieldMap"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_SourceFieldName VARCHAR(500),
    IN p_SourceFieldLabel VARCHAR(500),
    IN p_DestinationFieldName VARCHAR(500),
    IN p_DestinationFieldLabel VARCHAR(500),
    IN p_Direction VARCHAR(50),
    IN p_TransformPipeline TEXT,
    IN p_IsKeyField BOOLEAN,
    IN p_IsRequired BOOLEAN,
    IN p_DefaultValue TEXT,
    IN p_Priority INTEGER,
    IN p_Status VARCHAR(50)
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationFieldMap"
    SET
        "EntityMapID" = p_EntityMapID,
        "SourceFieldName" = p_SourceFieldName,
        "SourceFieldLabel" = p_SourceFieldLabel,
        "DestinationFieldName" = p_DestinationFieldName,
        "DestinationFieldLabel" = p_DestinationFieldLabel,
        "Direction" = p_Direction,
        "TransformPipeline" = p_TransformPipeline,
        "IsKeyField" = p_IsKeyField,
        "IsRequired" = p_IsRequired,
        "DefaultValue" = p_DefaultValue,
        "Priority" = p_Priority,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationFieldMap"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationFieldMap"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkType VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkValue TEXT DEFAULT NULL,
    IN p_LastSyncAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RecordsSynced INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "ID",
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_Direction VARCHAR(50),
    IN p_WatermarkType VARCHAR(50),
    IN p_WatermarkValue TEXT,
    IN p_LastSyncAt TIMESTAMPTZ,
    IN p_RecordsSynced INTEGER
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationSyncWatermark"
    SET
        "EntityMapID" = p_EntityMapID,
        "Direction" = p_Direction,
        "WatermarkType" = p_WatermarkType,
        "WatermarkValue" = p_WatermarkValue,
        "LastSyncAt" = p_LastSyncAt,
        "RecordsSynced" = p_RecordsSynced
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationSyncWatermark"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationFieldMap"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_SourceFieldName VARCHAR(500) DEFAULT NULL,
    IN p_SourceFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldName VARCHAR(500) DEFAULT NULL,
    IN p_DestinationFieldLabel VARCHAR(500) DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_TransformPipeline TEXT DEFAULT NULL,
    IN p_IsKeyField BOOLEAN DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_DefaultValue TEXT DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "ID",
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationFieldMap"
            (
                "EntityMapID",
                "SourceFieldName",
                "SourceFieldLabel",
                "DestinationFieldName",
                "DestinationFieldLabel",
                "Direction",
                "TransformPipeline",
                "IsKeyField",
                "IsRequired",
                "DefaultValue",
                "Priority",
                "Status"
            )
        VALUES
            (
                p_EntityMapID,
                p_SourceFieldName,
                p_SourceFieldLabel,
                p_DestinationFieldName,
                p_DestinationFieldLabel,
                COALESCE(p_Direction, 'SourceToDest'),
                p_TransformPipeline,
                COALESCE(p_IsKeyField, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_DefaultValue,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationFieldMap"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_SourceFieldName VARCHAR(500),
    IN p_SourceFieldLabel VARCHAR(500),
    IN p_DestinationFieldName VARCHAR(500),
    IN p_DestinationFieldLabel VARCHAR(500),
    IN p_Direction VARCHAR(50),
    IN p_TransformPipeline TEXT,
    IN p_IsKeyField BOOLEAN,
    IN p_IsRequired BOOLEAN,
    IN p_DefaultValue TEXT,
    IN p_Priority INTEGER,
    IN p_Status VARCHAR(50)
)
RETURNS SETOF __mj."vwCompanyIntegrationFieldMaps" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationFieldMap"
    SET
        "EntityMapID" = p_EntityMapID,
        "SourceFieldName" = p_SourceFieldName,
        "SourceFieldLabel" = p_SourceFieldLabel,
        "DestinationFieldName" = p_DestinationFieldName,
        "DestinationFieldLabel" = p_DestinationFieldLabel,
        "Direction" = p_Direction,
        "TransformPipeline" = p_TransformPipeline,
        "IsKeyField" = p_IsKeyField,
        "IsRequired" = p_IsRequired,
        "DefaultValue" = p_DefaultValue,
        "Priority" = p_Priority,
        "Status" = p_Status
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationFieldMaps" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationFieldMap"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationFieldMap"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityMapID UUID DEFAULT NULL,
    IN p_Direction VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkType VARCHAR(50) DEFAULT NULL,
    IN p_WatermarkValue TEXT DEFAULT NULL,
    IN p_LastSyncAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RecordsSynced INTEGER DEFAULT NULL
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "ID",
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_ID,
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."CompanyIntegrationSyncWatermark"
            (
                "EntityMapID",
                "Direction",
                "WatermarkType",
                "WatermarkValue",
                "LastSyncAt",
                "RecordsSynced"
            )
        VALUES
            (
                p_EntityMapID,
                COALESCE(p_Direction, 'Pull'),
                COALESCE(p_WatermarkType, 'Timestamp'),
                p_WatermarkValue,
                p_LastSyncAt,
                COALESCE(p_RecordsSynced, 0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark"(
    IN p_ID UUID,
    IN p_EntityMapID UUID,
    IN p_Direction VARCHAR(50),
    IN p_WatermarkType VARCHAR(50),
    IN p_WatermarkValue TEXT,
    IN p_LastSyncAt TIMESTAMPTZ,
    IN p_RecordsSynced INTEGER
)
RETURNS SETOF __mj."vwCompanyIntegrationSyncWatermarks" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."CompanyIntegrationSyncWatermark"
    SET
        "EntityMapID" = p_EntityMapID,
        "Direction" = p_Direction,
        "WatermarkType" = p_WatermarkType,
        "WatermarkValue" = p_WatermarkValue,
        "LastSyncAt" = p_LastSyncAt,
        "RecordsSynced" = p_RecordsSynced
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwCompanyIntegrationSyncWatermarks" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegrationSyncWatermark"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ===================== Triggers =====================

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationFieldMap" ON __mj."CompanyIntegrationFieldMap";
CREATE TRIGGER "trgUpdateCompanyIntegrationFieldMap"
    BEFORE UPDATE ON __mj."CompanyIntegrationFieldMap"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationEntityMap_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationEntityMap" ON __mj."CompanyIntegrationEntityMap";
CREATE TRIGGER "trgUpdateCompanyIntegrationEntityMap"
    BEFORE UPDATE ON __mj."CompanyIntegrationEntityMap"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationEntityMap_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegration_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegration" ON __mj."CompanyIntegration";
CREATE TRIGGER "trgUpdateCompanyIntegration"
    BEFORE UPDATE ON __mj."CompanyIntegration"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegration_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationSyncWatermark" ON __mj."CompanyIntegrationSyncWatermark";
CREATE TRIGGER "trgUpdateCompanyIntegrationSyncWatermark"
    BEFORE UPDATE ON __mj."CompanyIntegrationSyncWatermark"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateIntegrationSourceType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateIntegrationSourceType" ON __mj."IntegrationSourceType";
CREATE TRIGGER "trgUpdateIntegrationSourceType"
    BEFORE UPDATE ON __mj."IntegrationSourceType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateIntegrationSourceType_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationFieldMap" ON __mj."CompanyIntegrationFieldMap";
CREATE TRIGGER "trgUpdateCompanyIntegrationFieldMap"
    BEFORE UPDATE ON __mj."CompanyIntegrationFieldMap"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationSyncWatermark" ON __mj."CompanyIntegrationSyncWatermark";
CREATE TRIGGER "trgUpdateCompanyIntegrationSyncWatermark"
    BEFORE UPDATE ON __mj."CompanyIntegrationSyncWatermark"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationFieldMap" ON __mj."CompanyIntegrationFieldMap";
CREATE TRIGGER "trgUpdateCompanyIntegrationFieldMap"
    BEFORE UPDATE ON __mj."CompanyIntegrationFieldMap"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationFieldMap_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegrationSyncWatermark" ON __mj."CompanyIntegrationSyncWatermark";
CREATE TRIGGER "trgUpdateCompanyIntegrationSyncWatermark"
    BEFORE UPDATE ON __mj."CompanyIntegrationSyncWatermark"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegrationSyncWatermark_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- TODO: Review conditional DDL
-- IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE ID = '8a0e85e8-8610-4949-981f-19b0c6df658f' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'CompanyIntegration')) BEGIN
--          INSERT INTO __mj."EntityField"
--          (
--             "ID",
--             "EntityID",
--             "Sequence",
--             "Name",
--             "DisplayName",
--             "Description",
--             "Type",
--             "Length",
--             "Precision",
--             "Scale",
--             "AllowsNull",
--             "DefaultValue",
--             "AutoIncrement",
--             "AllowUpdateAPI",
--             "IsVirtual",
--             "RelatedEntityID",
--             "RelatedEntityFieldName",
--             "IsNameField",
--             "IncludeInUserSearchAPI",
--             "IncludeRelatedEntityNameFieldInBaseView",
--             "DefaultInView",
--             "IsPrimaryKey",
--             "IsUnique",
--             "RelatedEntityDisplayType",
--             "__mj_CreatedAt",
--             "__mj_UpdatedAt"
--          )
--          VALUES
--          (
--             '8a0e85e8-8610-4949-981f-19b0c6df658f',
--             '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
--             100031,
--             'CompanyIntegration',
--             'Company Integration',
--             NULL,
--             'TEXT',
--             510,
--             0,
--             0,
--             0,
--             NULL,
--             0,
--             0,
--             1,
--             NULL,
--             NULL,
--             0,
--             0,
--             0,
--             0,
--             0,
--             0,
--             'Search',
--             GETUTCDATE(),
--             GETUTCDATE()
--          )
--       END
-- 
-- /* SQL text to insert new entity field */


-- TODO: Review conditional DDL
-- IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE ID = '63f97d2f-bd4d-4a08-b83f-cd6891788b76' OR (EntityID = '41579CAC-5DDC-48B4-8703-31292BE0A414' AND Name = 'Entity')) BEGIN
--          INSERT INTO __mj."EntityField"
--          (
--             "ID",
--             "EntityID",
--             "Sequence",
--             "Name",
--             "DisplayName",
--             "Description",
--             "Type",
--             "Length",
--             "Precision",
--             "Scale",
--             "AllowsNull",
--             "DefaultValue",
--             "AutoIncrement",
--             "AllowUpdateAPI",
--             "IsVirtual",
--             "RelatedEntityID",
--             "RelatedEntityFieldName",
--             "IsNameField",
--             "IncludeInUserSearchAPI",
--             "IncludeRelatedEntityNameFieldInBaseView",
--             "DefaultInView",
--             "IsPrimaryKey",
--             "IsUnique",
--             "RelatedEntityDisplayType",
--             "__mj_CreatedAt",
--             "__mj_UpdatedAt"
--          )
--          VALUES
--          (
--             '63f97d2f-bd4d-4a08-b83f-cd6891788b76',
--             '41579CAC-5DDC-48B4-8703-31292BE0A414', -- Entity: MJ: Company Integration Entity Maps
--             100032,
--             'Entity',
--             'Entity',
--             NULL,
--             'TEXT',
--             510,
--             0,
--             0,
--             0,
--             NULL,
--             0,
--             0,
--             1,
--             NULL,
--             NULL,
--             0,
--             0,
--             0,
--             0,
--             0,
--             0,
--             'Search',
--             GETUTCDATE(),
--             GETUTCDATE()
--          )
--       END
-- 
-- /* Set field properties for entity */


UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '3C5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '185817F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'B34217F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set field properties for entity */

UPDATE __mj."EntityField"
            SET "IsNameField" = 1
            WHERE "ID" = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512'
            AND "AutoUpdateIsNameField" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '4886F7D9-06EF-4979-9346-B689AFCF5CB9'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'BB6B2FC1-8530-4229-A524-85437510B1B0'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '93E74709-A312-49E1-8C80-EA2909A6B5BF'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '2F978BF2-EEA0-46E7-86C7-62D09DA17B96'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'CD36A432-32E7-4B66-B59C-DFAEC7001A76'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '4886F7D9-06EF-4979-9346-B689AFCF5CB9'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '4D8315D9-AED2-4E67-8743-6233F9F1C312'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '16A801A3-E1EF-4F41-ADBD-9AF7747ADE78'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '6B1FF62D-F04E-42B4-85F9-02CE12E23381'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '16A801A3-E1EF-4F41-ADBD-9AF7747ADE78'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set field properties for entity */

UPDATE __mj."EntityField"
            SET "IsNameField" = 1
            WHERE "ID" = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A'
            AND "AutoUpdateIsNameField" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'B060FD28-BE54-42CF-BEF5-FE27359E5A72'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'A104BF94-1F56-4B4A-A243-BD8A2A3F3EF7'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '028D4EE7-1A23-4C6A-9E42-1527BA110C70'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'E4B0F49E-B21C-4358-8E46-EC4BA66A3A22'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'B060FD28-BE54-42CF-BEF5-FE27359E5A72'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'A104BF94-1F56-4B4A-A243-BD8A2A3F3EF7'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set field properties for entity */

UPDATE __mj."EntityField"
            SET "IsNameField" = 1
            WHERE "ID" = '41D1DC11-6093-4473-ABF6-1B578B9A26BD'
            AND "AutoUpdateIsNameField" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '41D1DC11-6093-4473-ABF6-1B578B9A26BD'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'E29E9ABA-528D-4A3D-AEB7-B9625AB4362D'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'E6E720DD-FEFD-4C82-B694-DEA4FC4D308A'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '8A0E85E8-8610-4949-981F-19B0C6DF658F'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '63F97D2F-BD4D-4A08-B83F-CD6891788B76'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '41D1DC11-6093-4473-ABF6-1B578B9A26BD'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '77802508-D414-4972-932D-C84439DE5DB4'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '8A0E85E8-8610-4949-981F-19B0C6DF658F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '63F97D2F-BD4D-4A08-B83F-CD6891788B76'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set categories for 9 fields */
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '95EB5E41-3D51-4AF7-93B5-FD0466702686' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."EntityMapID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Map',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '846D8888-AF62-4D4B-AE06-A52C284377A7' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."Direction"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B060FD28-BE54-42CF-BEF5-FE27359E5A72' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."WatermarkType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."WatermarkValue"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Progress',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A104BF94-1F56-4B4A-A243-BD8A2A3F3EF7' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."LastSyncAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Progress',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '028D4EE7-1A23-4C6A-9E42-1527BA110C70' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."RecordsSynced"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Progress',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E4B0F49E-B21C-4358-8E46-EC4BA66A3A22' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."__mj_CreatedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2D349D6A-E5E1-4037-B1BE-104E1BD8009E' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."__mj_UpdatedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E87F3F8F-FB10-46C6-B42A-D41C0AF3AAE3' AND "AutoUpdateCategory" = 1;
/* Set entity icon to fa fa-sync-alt */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-sync-alt', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('aef59a99-d889-4e3d-88e1-c0678b8646bd', 'D5C4FEF3-21D0-4A41-893B-34F9527195F0', 'FieldCategoryInfo', '{"Sync Configuration":{"icon":"fa fa-sliders-h","description":"Settings that define the scope, direction, and methodology of the synchronization"},"Sync Progress":{"icon":"fa fa-history","description":"Real-time tracking of sync values, timestamps, and record counts"},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('62d50040-224f-4252-96c7-3773483bb8c4', 'D5C4FEF3-21D0-4A41-893B-34F9527195F0', 'FieldCategoryIcons', '{"Sync Configuration":"fa fa-sliders-h","Sync Progress":"fa fa-history","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = 0, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0';
/* Set categories for 15 fields */
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3DFB579F-2F81-4B1F-A357-09C7EA664AD0' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."EntityMapID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Map',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6BEFB401-01DD-454A-BB34-D300E78AB97D' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."SourceFieldName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."SourceFieldLabel"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CD36A432-32E7-4B66-B59C-DFAEC7001A76' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DestinationFieldName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4886F7D9-06EF-4979-9346-B689AFCF5CB9' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DestinationFieldLabel"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D8315D9-AED2-4E67-8743-6233F9F1C312' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Direction"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."TransformPipeline"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '9BE66DC5-E20A-4FEE-ACAD-68BD018F0B86' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."IsKeyField"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Key Field',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB6B2FC1-8530-4229-A524-85437510B1B0' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."IsRequired"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Required',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '923B68D4-6B26-4B39-8324-F115221E6733' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DefaultValue"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5F47D2DA-B34D-436F-8177-5E1BA9435288' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Priority"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93E74709-A312-49E1-8C80-EA2909A6B5BF' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Logic and Validation',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F978BF2-EEA0-46E7-86C7-62D09DA17B96' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."__mj_CreatedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93F28803-D909-4BCB-9742-08455F48AB78' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."__mj_UpdatedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B4AD87BA-FB93-4118-B671-A023BD200FE3' AND "AutoUpdateCategory" = 1;
/* Set entity icon to fa fa-exchange-alt */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-exchange-alt', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('83429c79-083b-4902-9e13-bbf5ac0c2692', 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', 'FieldCategoryInfo', '{"Mapping Definition":{"icon":"fa fa-columns","description":"Fields and directions defining how data moves between the external source and destination"},"Sync Logic and Validation":{"icon":"fa fa-vial","description":"Rules for data transformation, matching, prioritization, and field-level validation"},"System Metadata":{"icon":"fa fa-cog","description":"Internal identifiers and system-managed audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('f3513d84-b5fe-4e79-90dc-1c6a84470d18', 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', 'FieldCategoryIcons', '{"Mapping Definition":"fa fa-columns","Sync Logic and Validation":"fa fa-vial","System Metadata":"fa fa-cog"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = 0, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE';
/* Set categories for 25 fields */
-- UPDATE Entity Field Category Info MJ: Company Integrations."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '115817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."CompanyID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '125817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IntegrationID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '135817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '64799DD4-A537-4B9C-897F-EC2AFE9A28D0' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IsActive"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '145817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IsExternalSystemReadOnly"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B24217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Company"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Company Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '365817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Integration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Integration Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '375817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."SourceTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Linking & Core Info',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Source Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F647023E-D909-4ECB-B59D-EE477C274827' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."AccessToken"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '155817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."RefreshToken"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '165817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."TokenExpirationDate"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '175817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."APIKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '185817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ClientID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B34217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ClientSecret"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B44217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ExternalSystemID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '425817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."CustomAttribute1"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C44217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."DriverClassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '385817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."DriverImportPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '395817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'External System Mapping',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '987EAF20-227F-4043-BD87-06C9E01598F4' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunStartedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunEndedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."__mj_CreatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0D5917F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."__mj_UpdatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E85817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
/* Set categories for 17 fields */
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."CompanyIntegrationID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Company Integration',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CA111FE4-61FE-49D0-9106-A75DE3035FB1' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."CompanyIntegration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Company Integration Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8A0E85E8-8610-4949-981F-19B0C6DF658F' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."EntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '749758C4-A7B3-413A-A434-4844771C7F84' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."Entity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '63F97D2F-BD4D-4A08-B83F-CD6891788B76' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."ExternalObjectName"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '41D1DC11-6093-4473-ABF6-1B578B9A26BD' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."ExternalObjectLabel"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Mapping',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '77802508-D414-4972-932D-C84439DE5DB4' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."SyncDirection"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CD5A1D3C-F54B-41FF-9879-B3BCD73A231F' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."SyncEnabled"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E29E9ABA-528D-4A3D-AEB7-B9625AB4362D' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."Priority"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F1EB6C90-5CAF-4A45-88B8-2CA52A3D7D83' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E6E720DD-FEFD-4C82-B694-DEA4FC4D308A' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."DeleteBehavior"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Control',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '81628273-7743-4DCA-A036-82B8595BB2AA' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."MatchStrategy"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Engine Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '1EF5FAAF-4128-459F-978F-BC14223FD131' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."ConflictResolution"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Engine Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '350740C9-5552-45B2-A222-889BB91F6E3B' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Engine Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '3428AA14-3FCD-463A-8B90-29E08070C300' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C91EF1AE-5036-440D-8492-121518A3D36E' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."__mj_CreatedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8A83F1A0-06F9-43D2-9151-53A5178EECE2' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Entity Maps."__mj_UpdatedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '88CA33DB-38D1-406A-BB78-5809AC6F86EB' AND "AutoUpdateCategory" = 1;
/* Set entity icon to fa fa-exchange-alt */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-exchange-alt', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '41579CAC-5DDC-48B4-8703-31292BE0A414';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('796b0a50-e0a2-47e2-9c53-9a79a23453df', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'FieldCategoryInfo', '{"Object Mapping":{"icon":"fa fa-link","description":"Defines the relationship between external system objects and internal MemberJunction entities."},"Sync Control":{"icon":"fa fa-sync","description":"Operational settings that control how and when data synchronization occurs."},"Engine Configuration":{"icon":"fa fa-cogs","description":"Advanced logic for record matching, conflict handling, and custom mapping behavior."},"System Metadata":{"icon":"fa fa-database","description":"Internal record identifiers and audit tracking information."}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('b4adec7a-a565-40aa-bc6e-062eeb6bc4d4', '41579CAC-5DDC-48B4-8703-31292BE0A414', 'FieldCategoryIcons', '{"Object Mapping":"fa fa-link","Sync Control":"fa fa-sync","Engine Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = 0, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '41579CAC-5DDC-48B4-8703-31292BE0A414';
/* Set categories for 8 fields */
-- UPDATE Entity Field Category Info MJ: Integration Source Types."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Type Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '76CF6A33-6556-46CA-AA57-4050AA9AD647' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Type Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E7691951-EEF3-47EE-B375-0421DE28AE7A' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Source Type Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6B1FF62D-F04E-42B4-85F9-02CE12E23381' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."DriverClass"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Technical Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '16A801A3-E1EF-4F41-ADBD-9AF7747ADE78' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."IconClass"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Technical Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '254C0B4E-CC02-46BC-92E3-8A46463198CB' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F2882887-8D20-41CB-A1BE-91E3E270D3E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."__mj_CreatedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8D083AA3-60CB-41DC-82D0-26DD3E9C5ADE' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integration Source Types."__mj_UpdatedAt"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '10DDEDFE-56D3-4938-BFE4-0FD79DA1D6DA' AND "AutoUpdateCategory" = 1;
/* Set entity icon to fa fa-plug */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-plug', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = '57801845-6620-4CBD-993F-E4AA2D464A04';
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('efccb55c-768d-4daf-8aba-65b635e4718a', '57801845-6620-4CBD-993F-E4AA2D464A04', 'FieldCategoryInfo', '{"Source Type Definition":{"icon":"fa fa-info-circle","description":"Basic identification and availability status for this integration source type"},"Technical Configuration":{"icon":"fa fa-cogs","description":"Technical implementation details including the driver class and UI representation"},"System Metadata":{"icon":"fa fa-database","description":"System-generated identifiers and audit timestamps"}}', NOW(), NOW());
/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('45f1e5cc-d371-4d52-9576-2c18810ac742', '57801845-6620-4CBD-993F-E4AA2D464A04', 'FieldCategoryIcons', '{"Source Type Definition":"fa fa-info-circle","Technical Configuration":"fa fa-cogs","System Metadata":"fa fa-database"}', NOW(), NOW());
/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = 0, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = '57801845-6620-4CBD-993F-E4AA2D464A04';
/* Remove stale One-To-Many EntityRelationships */

/* Remove stale EntityRelationship: undefined -> undefined (FK field 'CompanyName' no longer exists) */

DELETE FROM __mj."EntityRelationship" WHERE "ID" = '5C8442AB-9E0E-40BE-A70B-4FA0FE279992';

/* Remove stale EntityRelationship: undefined -> undefined (FK field 'ArtifactID' no longer exists) */

DELETE FROM __mj."EntityRelationship" WHERE "ID" = '947E8026-7845-4E01-BBD4-F2ED84A47E09';


--- CODE GEN RUN TO FIX ISSUES RE ORDERING

/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: AI Agent Runs (One To Many via LastRunID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '77bfb3b9-ff99-4af6-92fe-5e979365052d'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('77bfb3b9-ff99-4af6-92fe-5e979365052d', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'LastRunID', 'One To Many', 1, 1, 7, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4014c078-e011-4711-9a96-101a80d62ed4'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('4014c078-e011-4711-9a96-101a80d62ed4', '73AD0238-8B56-EF11-991A-6045BDEBA539', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'ChildPromptID', 'One To Many', 1, 1, 4, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '818abb60-291e-4760-8a86-8da541300728'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('818abb60-291e-4760-8a86-8da541300728', '73AD0238-8B56-EF11-991A-6045BDEBA539', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'JudgeID', 'One To Many', 1, 1, 5, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bac649b1-bbde-42b6-b8ac-64ab30e49ab3'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('bac649b1-bbde-42b6-b8ac-64ab30e49ab3', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '00248F34-2837-EF11-86D4-6045BDEE16E6', 'OutputEntityID', 'One To Many', 1, 1, 1, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '76e32992-eb0e-4a64-a0b5-6355b746c628'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('76e32992-eb0e-4a64-a0b5-6355b746c628', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E2238F34-2837-EF11-86D4-6045BDEE16E6', 'RelatedEntityID', 'One To Many', 1, 1, 1, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a97c9ca4-5b00-4526-9680-f2336b43e07f'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('a97c9ca4-5b00-4526-9680-f2336b43e07f', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0B248F34-2837-EF11-86D4-6045BDEE16E6', 'CategoryEntityID', 'One To Many', 1, 1, 5, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '4d1a0628-a697-4463-95aa-69b5c5daaf7a'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('4d1a0628-a697-4463-95aa-69b5c5daaf7a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'RelatedEntityID', 'One To Many', 1, 1, 2, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e3d3e66f-4358-45e4-b1c4-34df4282d6ca'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('e3d3e66f-4358-45e4-b1c4-34df4282d6ca', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '30248F34-2837-EF11-86D4-6045BDEE16E6', 'ApprovedByUserID', 'One To Many', 1, 1, 2, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd58e8135-9e85-48f8-927d-e34cae087e55'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('d58e8135-9e85-48f8-927d-e34cae087e55', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '17248F34-2837-EF11-86D4-6045BDEE16E6', 'ApprovedByUserID', 'One To Many', 1, 1, 3, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '186a5e2e-6d78-41ba-9184-c3ab9772d926'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('186a5e2e-6d78-41ba-9184-c3ab9772d926', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'EA238F34-2837-EF11-86D4-6045BDEE16E6', 'ReadRLSFilterID', 'One To Many', 1, 1, 1, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7ed2faec-6136-449a-a6e5-aae4b049785d'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('7ed2faec-6136-449a-a6e5-aae4b049785d', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'EA238F34-2837-EF11-86D4-6045BDEE16E6', 'CreateRLSFilterID', 'One To Many', 1, 1, 2, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd69ece92-a003-4731-b3e7-d6fe6760466e'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('d69ece92-a003-4731-b3e7-d6fe6760466e', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'EA238F34-2837-EF11-86D4-6045BDEE16E6', 'DeleteRLSFilterID', 'One To Many', 1, 1, 3, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '98a4a8dd-cc85-4425-aef7-bbd762b5b0f9'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('98a4a8dd-cc85-4425-aef7-bbd762b5b0f9', 'FD238F34-2837-EF11-86D4-6045BDEE16E6', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'OriginalModelID', 'One To Many', 1, 1, 6, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '98e22ea6-9c8e-43b2-b087-d9b6a5e3f1f8'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('98e22ea6-9c8e-43b2-b087-d9b6a5e3f1f8', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', 'RerunFromPromptRunID', 'One To Many', 1, 1, 7, "GETUTCDATE"(), "GETUTCDATE"());
    END IF;
END $$;

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ParentRunID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '5841FDE4-13D8-4C69-B8FF-A3D2539EB0DE';


/* Update EntityRelationship join field from 'JudgeID' to 'PromptID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'PromptID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'B83EC5E5-FA9A-4F1F-8EB2-98B0550805BB';


/* Update EntityRelationship join field from 'OutputEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'BAC649B1-BBDE-42B6-B8AC-64AB30E49AB3';


/* Update EntityRelationship join field from 'RelatedEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '86ED5122-2FEA-48A1-8B75-B58519890413';


/* Update EntityRelationship join field from 'CategoryEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '53806B32-1416-44E4-BD9E-FBABD9F24806';


/* Update EntityRelationship join field from 'RelatedEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '0A19F94D-6030-42B2-8E65-DDFBC95248FA';


/* Update EntityRelationship join field from 'ApprovedByUserID' to 'StartedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'StartedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'C2E9FE80-1C30-4D71-8755-D705D22A214E';


/* Update EntityRelationship join field from 'ApprovedByUserID' to 'InitiatedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'InitiatedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'D58E8135-9E85-48F8-927D-E34CAE087E55';


/* Update EntityRelationship join field from 'DeleteRLSFilterID' to 'UpdateRLSFilterID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'UpdateRLSFilterID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'D69ECE92-A003-4731-B3E7-D6FE6760466E';


/* Update EntityRelationship join field from 'OriginalModelID' to 'ModelID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ModelID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '98A4A8DD-CC85-4425-AEF7-BBD762B5B0F9';


/* Update EntityRelationship join field from 'RerunFromPromptRunID' to 'ParentID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ParentID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '98E22EA6-9C8E-43B2-B087-D9B6A5E3F1F8';


/* SQL text to update entity field related entity name field map for entity field ID 6BEFB401-01DD-454A-BB34-D300E78AB97D */

-- TODO: Review conditional DDL
-- IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE ID = 'c233a240-755e-4148-b635-fb22f47ecf5d' OR (EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND Name = 'EntityMap')) BEGIN
--          INSERT INTO __mj."EntityField"
--          (
--             "ID",
--             "EntityID",
--             "Sequence",
--             "Name",
--             "DisplayName",
--             "Description",
--             "Type",
--             "Length",
--             "Precision",
--             "Scale",
--             "AllowsNull",
--             "DefaultValue",
--             "AutoIncrement",
--             "AllowUpdateAPI",
--             "IsVirtual",
--             "RelatedEntityID",
--             "RelatedEntityFieldName",
--             "IsNameField",
--             "IncludeInUserSearchAPI",
--             "IncludeRelatedEntityNameFieldInBaseView",
--             "DefaultInView",
--             "IsPrimaryKey",
--             "IsUnique",
--             "RelatedEntityDisplayType",
--             "__mj_CreatedAt",
--             "__mj_UpdatedAt"
--          )
--          VALUES
--          (
--             'c233a240-755e-4148-b635-fb22f47ecf5d',
--             'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- Entity: MJ: Company Integration Sync Watermarks
--             100019,
--             'EntityMap',
--             'Entity Map',
--             NULL,
--             'TEXT',
--             1000,
--             0,
--             0,
--             0,
--             NULL,
--             0,
--             0,
--             1,
--             NULL,
--             NULL,
--             0,
--             0,
--             0,
--             0,
--             0,
--             0,
--             'Search',
--             GETUTCDATE(),
--             GETUTCDATE()
--          )
--       END
-- 
-- /* SQL text to insert new entity field */


-- TODO: Review conditional DDL
-- IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE ID = '0aebc08d-8462-4897-85bf-cc4dd6b7935a' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'EntityMap')) BEGIN
--          INSERT INTO __mj."EntityField"
--          (
--             "ID",
--             "EntityID",
--             "Sequence",
--             "Name",
--             "DisplayName",
--             "Description",
--             "Type",
--             "Length",
--             "Precision",
--             "Scale",
--             "AllowsNull",
--             "DefaultValue",
--             "AutoIncrement",
--             "AllowUpdateAPI",
--             "IsVirtual",
--             "RelatedEntityID",
--             "RelatedEntityFieldName",
--             "IsNameField",
--             "IncludeInUserSearchAPI",
--             "IncludeRelatedEntityNameFieldInBaseView",
--             "DefaultInView",
--             "IsPrimaryKey",
--             "IsUnique",
--             "RelatedEntityDisplayType",
--             "__mj_CreatedAt",
--             "__mj_UpdatedAt"
--          )
--          VALUES
--          (
--             '0aebc08d-8462-4897-85bf-cc4dd6b7935a',
--             'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
--             100031,
--             'EntityMap',
--             'Entity Map',
--             NULL,
--             'TEXT',
--             1000,
--             0,
--             0,
--             0,
--             NULL,
--             0,
--             0,
--             1,
--             NULL,
--             NULL,
--             0,
--             0,
--             0,
--             0,
--             0,
--             0,
--             'Search',
--             GETUTCDATE(),
--             GETUTCDATE()
--          )
--       END
-- 
-- /* Set field properties for entity */


UPDATE __mj."EntityField"
            SET "IsNameField" = 1
            WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
            AND "AutoUpdateIsNameField" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '0AEBC08D-8462-4897-85BF-CC4DD6B7935A'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '0AEBC08D-8462-4897-85BF-CC4DD6B7935A'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set categories for 16 fields */
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3DFB579F-2F81-4B1F-A357-09C7EA664AD0' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."EntityMapID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Map ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6BEFB401-01DD-454A-BB34-D300E78AB97D' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."__mj_CreatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93F28803-D909-4BCB-9742-08455F48AB78' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."__mj_UpdatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B4AD87BA-FB93-4118-B671-A023BD200FE3' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."EntityMap"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Mapping Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0AEBC08D-8462-4897-85BF-CC4DD6B7935A' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."SourceFieldName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8A8D8A6-7F09-4A3F-ADE8-24D5AD46C512' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."SourceFieldLabel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CD36A432-32E7-4B66-B59C-DFAEC7001A76' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DestinationFieldName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4886F7D9-06EF-4979-9346-B689AFCF5CB9' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DestinationFieldLabel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D8315D9-AED2-4E67-8743-6233F9F1C312' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Direction"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E6D1F636-074A-44C4-9908-2F05AC0D8CEA' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."TransformPipeline"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '9BE66DC5-E20A-4FEE-ACAD-68BD018F0B86' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."IsKeyField"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Key Field',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB6B2FC1-8530-4229-A524-85437510B1B0' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."IsRequired"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Required',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '923B68D4-6B26-4B39-8324-F115221E6733' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."DefaultValue"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5F47D2DA-B34D-436F-8177-5E1BA9435288' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Priority"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93E74709-A312-49E1-8C80-EA2909A6B5BF' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Field Maps."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F978BF2-EEA0-46E7-86C7-62D09DA17B96' AND "AutoUpdateCategory" = 1;
/* Set categories for 10 fields */
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '95EB5E41-3D51-4AF7-93B5-FD0466702686' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."EntityMapID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '846D8888-AF62-4D4B-AE06-A52C284377A7' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."EntityMap"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Sync Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Map Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."Direction"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B060FD28-BE54-42CF-BEF5-FE27359E5A72' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."WatermarkType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1647D6D5-B2B7-4702-ACF4-FAEFFF2D091A' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."WatermarkValue"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A104BF94-1F56-4B4A-A243-BD8A2A3F3EF7' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."LastSyncAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '028D4EE7-1A23-4C6A-9E42-1527BA110C70' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."RecordsSynced"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E4B0F49E-B21C-4358-8E46-EC4BA66A3A22' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."__mj_CreatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2D349D6A-E5E1-4037-B1BE-104E1BD8009E' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integration Sync Watermarks."__mj_UpdatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E87F3F8F-FB10-46C6-B42A-D41C0AF3AAE3' AND "AutoUpdateCategory" = 1;
/* Update EntityRelationship join field from 'LastRunID' to 'ParentRunID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ParentRunID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '5841FDE4-13D8-4C69-B8FF-A3D2539EB0DE';


/* Update EntityRelationship join field from 'JudgeID' to 'PromptID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'PromptID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'B83EC5E5-FA9A-4F1F-8EB2-98B0550805BB';


/* Update EntityRelationship join field from 'OutputEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'BAC649B1-BBDE-42B6-B8AC-64AB30E49AB3';


/* Update EntityRelationship join field from 'RelatedEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '86ED5122-2FEA-48A1-8B75-B58519890413';


/* Update EntityRelationship join field from 'CategoryEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '53806B32-1416-44E4-BD9E-FBABD9F24806';


/* Update EntityRelationship join field from 'RelatedEntityID' to 'EntityID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'EntityID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '0A19F94D-6030-42B2-8E65-DDFBC95248FA';


/* Update EntityRelationship join field from 'ApprovedByUserID' to 'StartedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'StartedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'C2E9FE80-1C30-4D71-8755-D705D22A214E';


/* Update EntityRelationship join field from 'ApprovedByUserID' to 'InitiatedByUserID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'InitiatedByUserID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'D58E8135-9E85-48F8-927D-E34CAE087E55';


/* Update EntityRelationship join field from 'DeleteRLSFilterID' to 'UpdateRLSFilterID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'UpdateRLSFilterID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = 'D69ECE92-A003-4731-B3E7-D6FE6760466E';


/* Update EntityRelationship join field from 'OriginalModelID' to 'ModelID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ModelID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '98A4A8DD-CC85-4425-AEF7-BBD762B5B0F9';


/* Update EntityRelationship join field from 'RerunFromPromptRunID' to 'ParentID' */

UPDATE __mj."EntityRelationship"
      SET "RelatedEntityJoinField" = 'ParentID',
          "__mj_UpdatedAt" = NOW()
      WHERE "ID" = '98E22EA6-9C8E-43B2-B087-D9B6A5E3F1F8';


/* SQL text to update entity field related entity name field map for entity field ID 6BEFB401-01DD-454A-BB34-D300E78AB97D */

-- TODO: Review conditional DDL
-- IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE ID = 'c233a240-755e-4148-b635-fb22f47ecf5d' OR (EntityID = 'D5C4FEF3-21D0-4A41-893B-34F9527195F0' AND Name = 'EntityMap')) BEGIN
--          INSERT INTO __mj."EntityField"
--          (
--             "ID",
--             "EntityID",
--             "Sequence",
--             "Name",
--             "DisplayName",
--             "Description",
--             "Type",
--             "Length",
--             "Precision",
--             "Scale",
--             "AllowsNull",
--             "DefaultValue",
--             "AutoIncrement",
--             "AllowUpdateAPI",
--             "IsVirtual",
--             "RelatedEntityID",
--             "RelatedEntityFieldName",
--             "IsNameField",
--             "IncludeInUserSearchAPI",
--             "IncludeRelatedEntityNameFieldInBaseView",
--             "DefaultInView",
--             "IsPrimaryKey",
--             "IsUnique",
--             "RelatedEntityDisplayType",
--             "__mj_CreatedAt",
--             "__mj_UpdatedAt"
--          )
--          VALUES
--          (
--             'c233a240-755e-4148-b635-fb22f47ecf5d',
--             'D5C4FEF3-21D0-4A41-893B-34F9527195F0', -- Entity: MJ: Company Integration Sync Watermarks
--             100019,
--             'EntityMap',
--             'Entity Map',
--             NULL,
--             'TEXT',
--             1000,
--             0,
--             0,
--             0,
--             NULL,
--             0,
--             0,
--             1,
--             NULL,
--             NULL,
--             0,
--             0,
--             0,
--             0,
--             0,
--             0,
--             'Search',
--             GETUTCDATE(),
--             GETUTCDATE()
--          )
--       END
-- 
-- /* SQL text to insert new entity field */


-- TODO: Review conditional DDL
-- IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE ID = '0aebc08d-8462-4897-85bf-cc4dd6b7935a' OR (EntityID = 'FECA4EDD-74F9-4A1C-A284-E586E76B23FE' AND Name = 'EntityMap')) BEGIN
--          INSERT INTO __mj."EntityField"
--          (
--             "ID",
--             "EntityID",
--             "Sequence",
--             "Name",
--             "DisplayName",
--             "Description",
--             "Type",
--             "Length",
--             "Precision",
--             "Scale",
--             "AllowsNull",
--             "DefaultValue",
--             "AutoIncrement",
--             "AllowUpdateAPI",
--             "IsVirtual",
--             "RelatedEntityID",
--             "RelatedEntityFieldName",
--             "IsNameField",
--             "IncludeInUserSearchAPI",
--             "IncludeRelatedEntityNameFieldInBaseView",
--             "DefaultInView",
--             "IsPrimaryKey",
--             "IsUnique",
--             "RelatedEntityDisplayType",
--             "__mj_CreatedAt",
--             "__mj_UpdatedAt"
--          )
--          VALUES
--          (
--             '0aebc08d-8462-4897-85bf-cc4dd6b7935a',
--             'FECA4EDD-74F9-4A1C-A284-E586E76B23FE', -- Entity: MJ: Company Integration Field Maps
--             100031,
--             'EntityMap',
--             'Entity Map',
--             NULL,
--             'TEXT',
--             1000,
--             0,
--             0,
--             0,
--             NULL,
--             0,
--             0,
--             1,
--             NULL,
--             NULL,
--             0,
--             0,
--             0,
--             0,
--             0,
--             0,
--             'Search',
--             GETUTCDATE(),
--             GETUTCDATE()
--          )
--       END
-- 
-- /* Set field properties for entity */


UPDATE __mj."EntityField"
            SET "IsNameField" = 1
            WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
            AND "AutoUpdateIsNameField" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'C233A240-755E-4148-B635-FB22F47ECF5D'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '0AEBC08D-8462-4897-85BF-CC4DD6B7935A'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '0AEBC08D-8462-4897-85BF-CC4DD6B7935A'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;


-- ===================== Grants =====================

GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* Base View Permissions SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: Permissions for vwCompanyIntegrationFieldMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spCreateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Field Maps */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spUpdateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spDeleteCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Field Maps */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 749758C4-A7B3-413A-A434-4844771C7F84 */;

GRANT SELECT ON __mj."vwCompanyIntegrationEntityMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* Base View Permissions SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: Permissions for vwCompanyIntegrationEntityMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwCompanyIntegrationEntityMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spCreateCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationEntityMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Entity Maps */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationEntityMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spUpdateCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationEntityMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationEntityMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Entity Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Entity Maps
-- Item: spDeleteCompanyIntegrationEntityMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationEntityMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationEntityMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Entity Maps */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationEntityMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for CompanyIntegrationSyncWatermark */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityMapID in table CompanyIntegrationSyncWatermark;

-- SKIPPED (view not created): GRANT SELECT ON __mj."vwCompanyIntegrations" TO "cdp_UI", "cdp_Integration", "cdp_Developer"

/* spCreate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spCreateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"
    

/* spCreate Permissions for MJ: Company Integrations */

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"


/* spUpdate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spUpdateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"


/* spDelete SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spDeleteCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integrations */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Sync Watermarks
-----               SCHEMA:      __mj
-----               BASE TABLE:  CompanyIntegrationSyncWatermark
-----               PRIMARY KEY: ID
------------------------------------------------------------;

GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* Base View Permissions SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Permissions for vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spCreateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Sync Watermarks */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spUpdateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spDeleteCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Sync Watermarks */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for IntegrationSourceType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: vwIntegrationSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Source Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  IntegrationSourceType
-----               PRIMARY KEY: ID
------------------------------------------------------------;

GRANT SELECT ON __mj."vwIntegrationSourceTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* Base View Permissions SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: Permissions for vwIntegrationSourceTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwIntegrationSourceTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spCreateIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Integration Source Types */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spUpdateIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationSourceType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Integration Source Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Source Types
-- Item: spDeleteIntegrationSourceType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationSourceType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationSourceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Integration Source Types */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationSourceType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */;

GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* Base View Permissions SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: Permissions for vwCompanyIntegrationFieldMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spCreateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Field Maps */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spUpdateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spDeleteCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Field Maps */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 846D8888-AF62-4D4B-AE06-A52C284377A7 */;

GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* Base View Permissions SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Permissions for vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spCreateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Sync Watermarks */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spUpdateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spDeleteCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Sync Watermarks */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */;

GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* Base View Permissions SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: Permissions for vwCompanyIntegrationFieldMaps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwCompanyIntegrationFieldMaps" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spCreateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Field Maps */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spUpdateCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationFieldMap" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Field Maps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Field Maps
-- Item: spDeleteCompanyIntegrationFieldMap
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationFieldMap
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Field Maps */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationFieldMap" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to update entity field related entity name field map for entity field ID 846D8888-AF62-4D4B-AE06-A52C284377A7 */;

GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* Base View Permissions SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: Permissions for vwCompanyIntegrationSyncWatermarks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwCompanyIntegrationSyncWatermarks" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spCreateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Company Integration Sync Watermarks */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spUpdateCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateCompanyIntegrationSyncWatermark" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Company Integration Sync Watermarks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Sync Watermarks
-- Item: spDeleteCompanyIntegrationSyncWatermark
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationSyncWatermark
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integration Sync Watermarks */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegrationSyncWatermark" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */;


-- ===================== Other =====================

/* spUpdate Permissions for MJ: Company Integration Field Maps */

/* spUpdate Permissions for MJ: Company Integration Entity Maps */

/* spUpdate Permissions for MJ: Company Integrations */

/* spUpdate Permissions for MJ: Company Integration Sync Watermarks */

/* spUpdate Permissions for MJ: Integration Source Types */

/* spUpdate Permissions for MJ: Company Integration Field Maps */

/* spUpdate Permissions for MJ: Company Integration Sync Watermarks */

/* spUpdate Permissions for MJ: Company Integration Field Maps */

/* spUpdate Permissions for MJ: Company Integration Sync Watermarks */
