-- =============================================
-- Soft Primary Key and Foreign Key Support
-- Enables CodeGen to work with databases lacking PK/FK constraints
-- =============================================

-- Extend EntityField for soft PKs and FKs (minimal set)
ALTER TABLE [${flyway:defaultSchema}].[EntityField] ADD
    [IsSoftPrimaryKey] BIT NOT NULL DEFAULT 0,
    [SoftFKRelatedEntityID] UNIQUEIDENTIFIER NULL,
    [SoftFKRelatedEntityFieldName] NVARCHAR(255) NULL;
GO

-- Add descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates this field is a soft primary key (metadata-defined, not a database constraint). Can be set manually or by automated tools.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'IsSoftPrimaryKey';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Entity ID that this soft foreign key points to. If set, this field is treated as a foreign key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'SoftFKRelatedEntityID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Field name in the related entity that this soft foreign key points to. Defaults to the primary key of the related entity if not specified.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'SoftFKRelatedEntityFieldName';
GO

-- Recreate vwEntityFields to use COALESCE for transparent soft FK support
-- This ensures existing code that checks RelatedEntityID works for both constraint-based AND soft FKs
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwEntityFields];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityFields]
AS
SELECT
    ef.ID,
    ef.EntityID,
    ef.Sequence,
    ef.Name,
    ef.DisplayName,
    ef.Description,
    ef.AutoUpdateDescription,
    -- Use OR so soft PKs appear as regular PKs to existing code (just like COALESCE for FKs)
    CASE WHEN ef.IsPrimaryKey = 1 OR ef.IsSoftPrimaryKey = 1 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS IsPrimaryKey,
    ef.IsUnique,
    ef.Category,
    ef.Type,
    ef.Length,
    ef.Precision,
    ef.Scale,
    ef.AllowsNull,
    ef.DefaultValue,
    ef.AutoIncrement,
    ef.ValueListType,
    ef.ExtendedType,
    ef.CodeType,
    ef.DefaultInView,
    ef.ViewCellTemplate,
    ef.DefaultColumnWidth,
    ef.AllowUpdateAPI,
    ef.AllowUpdateInView,
    ef.IncludeInUserSearchAPI,
    ef.FullTextSearchEnabled,
    ef.UserSearchParamFormatAPI,
    ef.IncludeInGeneratedForm,
    ef.GeneratedFormSection,
    ef.IsVirtual,
    ef.IsNameField,
    -- Use COALESCE so soft FKs appear as regular FKs to existing code
    COALESCE(ef.RelatedEntityID, ef.SoftFKRelatedEntityID) AS RelatedEntityID,
    COALESCE(ef.RelatedEntityFieldName, ef.SoftFKRelatedEntityFieldName) AS RelatedEntityFieldName,
    ef.IncludeRelatedEntityNameFieldInBaseView,
    ef.RelatedEntityNameFieldMap,
    ef.RelatedEntityDisplayType,
    ef.EntityIDFieldName,
    ef.__mj_CreatedAt,
    ef.__mj_UpdatedAt,
    ef.ScopeDefault,
    ef.AutoUpdateRelatedEntityInfo,
    ef.ValuesToPackWithSchema,
    ef.Status,
    ef.AutoUpdateIsNameField,
    ef.AutoUpdateDefaultInView,
    ef.AutoUpdateCategory,
    ef.AutoUpdateDisplayName,
    ef.AutoUpdateIncludeInUserSearchAPI,
    ef.Encrypt,
    ef.EncryptionKeyID,
    ef.AllowDecryptInAPI,
    ef.SendEncryptedValue,
    -- Computed field
    [${flyway:defaultSchema}].GetProgrammaticName(REPLACE(ef.Name,' ','')) AS FieldCodeName,
    -- Entity info
    e.Name Entity,
    e.SchemaName,
    e.BaseTable,
    e.BaseView,
    e.CodeName EntityCodeName,
    e.ClassName EntityClassName,
    -- Related entity info (uses COALESCE so soft FKs get populated too)
    re.Name RelatedEntity,
    re.SchemaName RelatedEntitySchemaName,
    re.BaseTable RelatedEntityBaseTable,
    re.BaseView RelatedEntityBaseView,
    re.CodeName RelatedEntityCodeName,
    re.ClassName RelatedEntityClassName,
    -- Soft PK/FK columns (at end to preserve existing sequence numbers)
    ef.IsSoftPrimaryKey,
    ef.SoftFKRelatedEntityID,
    ef.SoftFKRelatedEntityFieldName
FROM
    [${flyway:defaultSchema}].EntityField ef
INNER JOIN
    [${flyway:defaultSchema}].vwEntities e ON ef.EntityID = e.ID
LEFT OUTER JOIN
    [${flyway:defaultSchema}].vwEntities re ON COALESCE(ef.RelatedEntityID, ef.SoftFKRelatedEntityID) = re.ID;
GO
