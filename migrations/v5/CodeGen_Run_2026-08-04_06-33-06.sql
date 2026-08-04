/* SQL text to insert 11 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd45516c5-21d1-479f-bf44-8c442bd73bf8' OR (EntityID = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Sequence')) BEGIN
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
            'd45516c5-21d1-479f-bf44-8c442bd73bf8',
            '34248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Actions
            100019,
            'Sequence',
            'Sequence',
            'Execution order when multiple Entity Actions are bound to the same entity and invocation type. Lower runs first; ties fall back to creation order. Defaults to 0 so existing rows are unaffected.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e05de35-8989-4d13-95e1-c3d110843894' OR (EntityID = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ScopeEntityID')) BEGIN
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
            '4e05de35-8989-4d13-95e1-c3d110843894',
            '34248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Actions
            100020,
            'ScopeEntityID',
            'Scope Entity ID',
            'Optional. Together with ScopeRecordID, narrows this Entity Action to records related to ONE specific record - for example a single Deal Type, Contract Type, Pipeline or Company - rather than every record of EntityID. NULL (the default) means the action applies to all records, which is the pre-existing behaviour. How a scope record relates to the subject record is resolved by the app that owns the scope entity; the framework only stores and filters on the pair.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e90503b0-d8e7-4176-9533-ef45670ed832' OR (EntityID = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ScopeRecordID')) BEGIN
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
            'e90503b0-d8e7-4176-9533-ef45670ed832',
            '34248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Actions
            100021,
            'ScopeRecordID',
            'Scope Record ID',
            'Optional. The primary key of the scope record, as text, paired with ScopeEntityID. Both columns are NULL or both are set (CK_EntityAction_Scope). Lets a configuration record such as a Deal Type surface "the workflows bound to me" as a real relationship rather than something buried in filter code.',
            'nvarchar',
            900,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15a69c0b-020c-4a77-979c-2a4b0e574294' OR (EntityID = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LoggingMode')) BEGIN
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
            '15a69c0b-020c-4a77-979c-2a4b0e574294',
            '34248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Actions
            100022,
            'LoggingMode',
            'Logging Mode',
            'How much of this binding''s activity reaches ActionExecutionLog. All (default) writes a row per invocation. FailuresOnly writes only runs that did not succeed - the right setting for a high-frequency binding on a busy entity, where the successful runs are noise. None disables logging for the binding entirely and should be rare, because it also removes the failure record.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'All',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4a85c84c-d0a9-4634-9a5e-5f6349034c92' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityActionID')) BEGIN
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
            '4a85c84c-d0a9-4634-9a5e-5f6349034c92',
            '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Execution Logs
            100030,
            'EntityActionID',
            'Entity Action ID',
            'Optional. The Entity Action binding that caused this run. NULL when the action was invoked directly - from a resolver, a script, an agent step or a scheduled action.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '34248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94a781ce-d962-450b-9a53-0966695e1bc7' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityActionInvocationTypeID')) BEGIN
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
            '94a781ce-d962-450b-9a53-0966695e1bc7',
            '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Execution Logs
            100031,
            'EntityActionInvocationTypeID',
            'Entity Action Invocation Type ID',
            'Optional. Which lifecycle event fired the binding - AfterUpdate, Validate, List and so on. Recorded separately from EntityActionID because one binding may be attached to several invocation types, and telling a Validate refusal apart from an AfterUpdate side effect is the first question anyone asks of this log.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '37248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c428b13-53db-4e26-a4b8-9b7a72cc3d93' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TargetEntityID')) BEGIN
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
            '7c428b13-53db-4e26-a4b8-9b7a72cc3d93',
            '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Execution Logs
            100032,
            'TargetEntityID',
            'Target Entity ID',
            'Optional. The entity of the record this run operated on. Deliberately denormalized rather than joined through EntityActionID: it survives the binding being deleted or retargeted, and it lets the log be queried by record with no join. Kept generic because every invoker has a subject - not only Entity Actions.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ff9f78ba-8206-45e1-b591-c59b1d4b3a35' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TargetRecordID')) BEGIN
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
            'ff9f78ba-8206-45e1-b591-c59b1d4b3a35',
            '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Execution Logs
            100033,
            'TargetRecordID',
            'Target Record ID',
            'Optional. The primary key of the record this run operated on, as text, paired with TargetEntityID. For multi-record invocation types (List, View) one log row is written per record, so this is always a single record.',
            'nvarchar',
            900,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '11b201fe-952a-4018-bb57-9e659902d892' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ResultParams')) BEGIN
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
            '11b201fe-952a-4018-bb57-9e659902d892',
            '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Execution Logs
            100034,
            'ResultParams',
            'Result Params',
            'JSON-formatted FINAL parameter set captured when the action finished - the inputs as the action left them, plus any output parameters it produced. Written on FAILURE exactly as on success, under the same redaction rules: a failed run''s partially-mutated inputs are usually the most diagnostic thing available, and an audit trail that records only successes is not an audit trail. Distinct from Params, which holds the values the action was called with and is never overwritten. NULL means one thing only - the run never finished (process died, host killed) - so it is a signal rather than an absence, and must not be backfilled.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d5df2a1-5cce-47e4-9210-9fa4e395e0ed' OR (EntityID = '3F248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LogValue')) BEGIN
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
            '6d5df2a1-5cce-47e4-9210-9fa4e395e0ed',
            '3F248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Params
            100027,
            'LogValue',
            'Log Value',
            'Whether this parameter''s VALUE may be written to ActionExecutionLog.Params. Default 1. Set to 0 for parameters that carry records, credentials or personal data - for example the Data payload of Execute Agent. Independent of the hard rule that Entity Action params of ValueType ''Entity Object'' or ''Entity Object Data'' are never logged regardless of this flag. When logging is suppressed the log records the parameter name, its type and a redaction marker, never the value.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '65fcd270-02b5-43d0-ab6f-324bddaa7b39' OR (EntityID = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LogValue')) BEGIN
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
            '65fcd270-02b5-43d0-ab6f-324bddaa7b39',
            '56248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Action Params
            100020,
            'LogValue',
            'Log Value',
            'Optional per-binding override of ActionParam.LogValue. NULL (the default) inherits the parameter definition. Set to 0 when this particular binding passes something sensitive through a parameter that is ordinarily safe to log - a message body through a generic Text parameter, for instance. Cannot re-enable logging for a value type the hard rule suppresses.',
            'bit',
            1,
            1,
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

/* SQL text to insert entity field value with ID bb4e824d-2070-42d3-b237-df57ea1ef7e1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bb4e824d-2070-42d3-b237-df57ea1ef7e1', '995817F0-6F36-EF11-86D4-6045BDEE16E6', 3, 'Entity Object Data', 'Entity Object Data', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='E45B6265-0617-46E5-933D-01776851E9BC';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='D76E1A37-E252-462B-9E5C-F9B46C9909AD';

/* SQL text to insert entity field value with ID 22eb0c14-62a5-490a-8e8e-c50ed5f487f6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('22eb0c14-62a5-490a-8e8e-c50ed5f487f6', '15A69C0B-020C-4A77-979C-2A4B0E574294', 1, 'All', 'All', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 25051e80-13c2-4e9b-9d37-527a61bcb597 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('25051e80-13c2-4e9b-9d37-527a61bcb597', '15A69C0B-020C-4A77-979C-2A4B0E574294', 2, 'FailuresOnly', 'FailuresOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 58f913f3-7b13-49a5-9517-334c2a3ecb04 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('58f913f3-7b13-49a5-9517-334c2a3ecb04', '15A69C0B-020C-4A77-979C-2A4B0E574294', 3, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 15A69C0B-020C-4A77-979C-2A4B0E574294 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='15A69C0B-020C-4A77-979C-2A4B0E574294';


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Actions (One To Many via ScopeEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dd4f3e64-2367-4e5c-b152-c6c6f7be838b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dd4f3e64-2367-4e5c-b152-c6c6f7be838b', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '34248F34-2837-EF11-86D4-6045BDEE16E6', 'ScopeEntityID', 'One To Many', 1, 1, 72, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Action Execution Logs (One To Many via TargetEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'acaffabc-600b-463a-aa13-8a128803bbc3'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('acaffabc-600b-463a-aa13-8a128803bbc3', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'TargetEntityID', 'One To Many', 1, 1, 73, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entity Actions -> MJ: Action Execution Logs (One To Many via EntityActionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8a3646a8-f79d-4fc6-8ea1-8a1ba465583b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8a3646a8-f79d-4fc6-8ea1-8a1ba465583b', '34248F34-2837-EF11-86D4-6045BDEE16E6', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'EntityActionID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entity Action Invocation Types -> MJ: Action Execution Logs (One To Many via EntityActionInvocationTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '53fdba93-4768-4033-87c6-d44f0bf2b6c2'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('53fdba93-4768-4033-87c6-d44f0bf2b6c2', '37248F34-2837-EF11-86D4-6045BDEE16E6', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'EntityActionInvocationTypeID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ActionExecutionLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ActionID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_ActionID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([ActionID]);

-- Index for foreign key UserID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_UserID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([UserID]);

-- Index for foreign key EntityActionID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([EntityActionID]);

-- Index for foreign key EntityActionInvocationTypeID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionInvocationTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionInvocationTypeID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([EntityActionInvocationTypeID]);

-- Index for foreign key TargetEntityID in table ActionExecutionLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionExecutionLog_TargetEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionExecutionLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionExecutionLog_TargetEntityID ON [${flyway:defaultSchema}].[ActionExecutionLog] ([TargetEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 4A85C84C-D0A9-4634-9A5E-5F6349034C92 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4A85C84C-D0A9-4634-9A5E-5F6349034C92', @RelatedEntityNameFieldMap='EntityAction';

/* Index for Foreign Keys for ActionParam */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Params
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ActionID in table ActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionParam_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionParam_ActionID ON [${flyway:defaultSchema}].[ActionParam] ([ActionID]);

/* Base View SQL for MJ: Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Params
-- Item: vwActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Action Params
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ActionParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwActionParams]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwActionParams];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActionParams]
AS
SELECT
    a.*,
    MJAction_ActionID.[Name] AS [Action]
FROM
    [${flyway:defaultSchema}].[ActionParam] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Action] AS MJAction_ActionID
  ON
    [a].[ActionID] = MJAction_ActionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwActionParams] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* Base View Permissions SQL for MJ: Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Params
-- Item: Permissions for vwActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwActionParams] TO [cdp_Integration], [cdp_UI], [cdp_Developer];

/* spCreate SQL for MJ: Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Params
-- Item: spCreateActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateActionParam]
    @ID uniqueidentifier = NULL,
    @ActionID uniqueidentifier,
    @Name nvarchar(255),
    @DefaultValue_Clear bit = 0,
    @DefaultValue nvarchar(MAX) = NULL,
    @Type nchar(10),
    @ValueType nvarchar(30),
    @IsArray bit = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsRequired bit = NULL,
    @MediaModality_Clear bit = 0,
    @MediaModality nvarchar(20) = NULL,
    @LogValue bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ActionParam]
            (
                [ID],
                [ActionID],
                [Name],
                [DefaultValue],
                [Type],
                [ValueType],
                [IsArray],
                [Description],
                [IsRequired],
                [MediaModality],
                [LogValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ActionID,
                @Name,
                CASE WHEN @DefaultValue_Clear = 1 THEN NULL ELSE ISNULL(@DefaultValue, NULL) END,
                @Type,
                @ValueType,
                ISNULL(@IsArray, 0),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsRequired, 1),
                CASE WHEN @MediaModality_Clear = 1 THEN NULL ELSE ISNULL(@MediaModality, NULL) END,
                ISNULL(@LogValue, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ActionParam]
            (
                [ActionID],
                [Name],
                [DefaultValue],
                [Type],
                [ValueType],
                [IsArray],
                [Description],
                [IsRequired],
                [MediaModality],
                [LogValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ActionID,
                @Name,
                CASE WHEN @DefaultValue_Clear = 1 THEN NULL ELSE ISNULL(@DefaultValue, NULL) END,
                @Type,
                @ValueType,
                ISNULL(@IsArray, 0),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsRequired, 1),
                CASE WHEN @MediaModality_Clear = 1 THEN NULL ELSE ISNULL(@MediaModality, NULL) END,
                ISNULL(@LogValue, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActionParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionParam] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionParam] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Params
-- Item: spUpdateActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateActionParam]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @DefaultValue_Clear bit = 0,
    @DefaultValue nvarchar(MAX) = NULL,
    @Type nchar(10) = NULL,
    @ValueType nvarchar(30) = NULL,
    @IsArray bit = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsRequired bit = NULL,
    @MediaModality_Clear bit = 0,
    @MediaModality nvarchar(20) = NULL,
    @LogValue bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionParam]
    SET
        [ActionID] = ISNULL(@ActionID, [ActionID]),
        [Name] = ISNULL(@Name, [Name]),
        [DefaultValue] = CASE WHEN @DefaultValue_Clear = 1 THEN NULL ELSE ISNULL(@DefaultValue, [DefaultValue]) END,
        [Type] = ISNULL(@Type, [Type]),
        [ValueType] = ISNULL(@ValueType, [ValueType]),
        [IsArray] = ISNULL(@IsArray, [IsArray]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsRequired] = ISNULL(@IsRequired, [IsRequired]),
        [MediaModality] = CASE WHEN @MediaModality_Clear = 1 THEN NULL ELSE ISNULL(@MediaModality, [MediaModality]) END,
        [LogValue] = ISNULL(@LogValue, [LogValue])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwActionParams] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActionParams]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionParam] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionParam table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateActionParam]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateActionParam];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateActionParam
ON [${flyway:defaultSchema}].[ActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ActionParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionParam] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Params
-- Item: spDeleteActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteActionParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ActionParam]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionParam] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionParam] TO [cdp_Integration], [cdp_Developer];

/* SQL text to update entity field related entity name field map for entity field ID 94A781CE-D962-450B-9A53-0966695E1BC7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='94A781CE-D962-450B-9A53-0966695E1BC7', @RelatedEntityNameFieldMap='EntityActionInvocationType';

/* SQL text to update entity field related entity name field map for entity field ID 7C428B13-53DB-4E26-A4B8-9B7A72CC3D93 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7C428B13-53DB-4E26-A4B8-9B7A72CC3D93', @RelatedEntityNameFieldMap='TargetEntity';

/* Base View SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: vwActionExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Action Execution Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ActionExecutionLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwActionExecutionLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwActionExecutionLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActionExecutionLogs]
AS
SELECT
    a.*,
    MJAction_ActionID.[Name] AS [Action],
    MJUser_UserID.[Name] AS [User],
    MJEntityAction_EntityActionID.[Action] AS [EntityAction],
    MJEntityActionInvocationType_EntityActionInvocationTypeID.[Name] AS [EntityActionInvocationType],
    MJEntity_TargetEntityID.[Name] AS [TargetEntity]
FROM
    [${flyway:defaultSchema}].[ActionExecutionLog] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Action] AS MJAction_ActionID
  ON
    [a].[ActionID] = MJAction_ActionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwEntityActions] AS MJEntityAction_EntityActionID
  ON
    [a].[EntityActionID] = MJEntityAction_EntityActionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityActionInvocationType] AS MJEntityActionInvocationType_EntityActionInvocationTypeID
  ON
    [a].[EntityActionInvocationTypeID] = MJEntityActionInvocationType_EntityActionInvocationTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_TargetEntityID
  ON
    [a].[TargetEntityID] = MJEntity_TargetEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] TO [cdp_UI], [cdp_Integration], [cdp_Developer];

/* Base View Permissions SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: Permissions for vwActionExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwActionExecutionLogs] TO [cdp_UI], [cdp_Integration], [cdp_Developer];

/* spCreate SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spCreateActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateActionExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateActionExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateActionExecutionLog]
    @ID uniqueidentifier = NULL,
    @ActionID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Params_Clear bit = 0,
    @Params nvarchar(MAX) = NULL,
    @ResultCode_Clear bit = 0,
    @ResultCode nvarchar(255) = NULL,
    @UserID uniqueidentifier,
    @RetentionPeriod_Clear bit = 0,
    @RetentionPeriod int = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @EntityActionID_Clear bit = 0,
    @EntityActionID uniqueidentifier = NULL,
    @EntityActionInvocationTypeID_Clear bit = 0,
    @EntityActionInvocationTypeID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(450) = NULL,
    @ResultParams_Clear bit = 0,
    @ResultParams nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ActionExecutionLog]
            (
                [ID],
                [ActionID],
                [StartedAt],
                [EndedAt],
                [Params],
                [ResultCode],
                [UserID],
                [RetentionPeriod],
                [Message],
                [EntityActionID],
                [EntityActionInvocationTypeID],
                [TargetEntityID],
                [TargetRecordID],
                [ResultParams]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ActionID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, NULL) END,
                CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, NULL) END,
                @UserID,
                CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, NULL) END,
                CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ActionExecutionLog]
            (
                [ActionID],
                [StartedAt],
                [EndedAt],
                [Params],
                [ResultCode],
                [UserID],
                [RetentionPeriod],
                [Message],
                [EntityActionID],
                [EntityActionInvocationTypeID],
                [TargetEntityID],
                [TargetRecordID],
                [ResultParams]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ActionID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, NULL) END,
                CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, NULL) END,
                @UserID,
                CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, NULL) END,
                CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActionExecutionLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Action Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spUpdateActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateActionExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateActionExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateActionExecutionLog]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Params_Clear bit = 0,
    @Params nvarchar(MAX) = NULL,
    @ResultCode_Clear bit = 0,
    @ResultCode nvarchar(255) = NULL,
    @UserID uniqueidentifier = NULL,
    @RetentionPeriod_Clear bit = 0,
    @RetentionPeriod int = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @EntityActionID_Clear bit = 0,
    @EntityActionID uniqueidentifier = NULL,
    @EntityActionInvocationTypeID_Clear bit = 0,
    @EntityActionInvocationTypeID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(450) = NULL,
    @ResultParams_Clear bit = 0,
    @ResultParams nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionExecutionLog]
    SET
        [ActionID] = ISNULL(@ActionID, [ActionID]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Params] = CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, [Params]) END,
        [ResultCode] = CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, [ResultCode]) END,
        [UserID] = ISNULL(@UserID, [UserID]),
        [RetentionPeriod] = CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, [RetentionPeriod]) END,
        [Message] = CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, [Message]) END,
        [EntityActionID] = CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, [EntityActionID]) END,
        [EntityActionInvocationTypeID] = CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, [EntityActionInvocationTypeID]) END,
        [TargetEntityID] = CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, [TargetEntityID]) END,
        [TargetRecordID] = CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, [TargetRecordID]) END,
        [ResultParams] = CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, [ResultParams]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwActionExecutionLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActionExecutionLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionExecutionLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateActionExecutionLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateActionExecutionLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateActionExecutionLog
ON [${flyway:defaultSchema}].[ActionExecutionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionExecutionLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ActionExecutionLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Action Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spDeleteActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteActionExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteActionExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteActionExecutionLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ActionExecutionLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionExecutionLog] TO [cdp_Integration];

/* spDelete Permissions for MJ: Action Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionExecutionLog] TO [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 96841354-26BF-4919-91A3-B3170EA58F68 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='96841354-26BF-4919-91A3-B3170EA58F68', @RelatedEntityNameFieldMap='ParentChunk';

/* Root ID Function SQL for MJ: Content Item Chunks.ParentChunkID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: fnContentItemChunkParentChunkID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ContentItemChunk].[ParentChunkID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentChunkID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentChunkID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentChunkID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentChunkID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: vwContentItemChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Chunks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentItemChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentItemChunks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentItemChunks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItemChunks]
AS
SELECT
    c.*,
    MJContentItem_ContentItemID.[Name] AS [ContentItem],
    MJContentItemChunk_ParentChunkID.[SegmentTitle] AS [ParentChunk],
    root_ParentChunkID.RootID AS [RootParentChunkID]
FROM
    [${flyway:defaultSchema}].[ContentItemChunk] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS MJContentItem_ContentItemID
  ON
    [c].[ContentItemID] = MJContentItem_ContentItemID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ContentItemChunk] AS MJContentItemChunk_ParentChunkID
  ON
    [c].[ParentChunkID] = MJContentItemChunk_ParentChunkID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]([c].[ID], [c].[ParentChunkID]) AS root_ParentChunkID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: Permissions for vwContentItemChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spCreateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemChunk]
    @ID uniqueidentifier = NULL,
    @ContentItemID uniqueidentifier,
    @Sequence int,
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @LastDeletedAt_Clear bit = 0,
    @LastDeletedAt datetimeoffset = NULL,
    @Modality nvarchar(20) = NULL,
    @StartOffset_Clear bit = 0,
    @StartOffset int = NULL,
    @EndOffset_Clear bit = 0,
    @EndOffset int = NULL,
    @StartMs_Clear bit = 0,
    @StartMs int = NULL,
    @EndMs_Clear bit = 0,
    @EndMs int = NULL,
    @PageNumber_Clear bit = 0,
    @PageNumber int = NULL,
    @SegmentTitle_Clear bit = 0,
    @SegmentTitle nvarchar(500) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Transcript_Clear bit = 0,
    @Transcript nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @ParentChunkID_Clear bit = 0,
    @ParentChunkID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentItemChunk]
            (
                [ID],
                [ContentItemID],
                [Sequence],
                [Text],
                [VectorRecordID],
                [EmbeddingStatus],
                [TaggingStatus],
                [DeleteStatus],
                [LastEmbeddedAt],
                [LastTaggedAt],
                [LastDeletedAt],
                [Modality],
                [StartOffset],
                [EndOffset],
                [StartMs],
                [EndMs],
                [PageNumber],
                [SegmentTitle],
                [Description],
                [Transcript],
                [SegmenterKey],
                [ParentChunkID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentItemID,
                @Sequence,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, NULL) END,
                ISNULL(@Modality, 'text'),
                CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, NULL) END,
                CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, NULL) END,
                CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, NULL) END,
                CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, NULL) END,
                CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, NULL) END,
                CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentItemChunk]
            (
                [ContentItemID],
                [Sequence],
                [Text],
                [VectorRecordID],
                [EmbeddingStatus],
                [TaggingStatus],
                [DeleteStatus],
                [LastEmbeddedAt],
                [LastTaggedAt],
                [LastDeletedAt],
                [Modality],
                [StartOffset],
                [EndOffset],
                [StartMs],
                [EndMs],
                [PageNumber],
                [SegmentTitle],
                [Description],
                [Transcript],
                [SegmenterKey],
                [ParentChunkID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentItemID,
                @Sequence,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, NULL) END,
                ISNULL(@Modality, 'text'),
                CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, NULL) END,
                CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, NULL) END,
                CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, NULL) END,
                CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, NULL) END,
                CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, NULL) END,
                CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItemChunks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spUpdateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemChunk]
    @ID uniqueidentifier,
    @ContentItemID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @LastDeletedAt_Clear bit = 0,
    @LastDeletedAt datetimeoffset = NULL,
    @Modality nvarchar(20) = NULL,
    @StartOffset_Clear bit = 0,
    @StartOffset int = NULL,
    @EndOffset_Clear bit = 0,
    @EndOffset int = NULL,
    @StartMs_Clear bit = 0,
    @StartMs int = NULL,
    @EndMs_Clear bit = 0,
    @EndMs int = NULL,
    @PageNumber_Clear bit = 0,
    @PageNumber int = NULL,
    @SegmentTitle_Clear bit = 0,
    @SegmentTitle nvarchar(500) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Transcript_Clear bit = 0,
    @Transcript nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @ParentChunkID_Clear bit = 0,
    @ParentChunkID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemChunk]
    SET
        [ContentItemID] = ISNULL(@ContentItemID, [ContentItemID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Text] = CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, [Text]) END,
        [VectorRecordID] = CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, [VectorRecordID]) END,
        [EmbeddingStatus] = ISNULL(@EmbeddingStatus, [EmbeddingStatus]),
        [TaggingStatus] = ISNULL(@TaggingStatus, [TaggingStatus]),
        [DeleteStatus] = CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, [DeleteStatus]) END,
        [LastEmbeddedAt] = CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, [LastEmbeddedAt]) END,
        [LastTaggedAt] = CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, [LastTaggedAt]) END,
        [LastDeletedAt] = CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, [LastDeletedAt]) END,
        [Modality] = ISNULL(@Modality, [Modality]),
        [StartOffset] = CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, [StartOffset]) END,
        [EndOffset] = CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, [EndOffset]) END,
        [StartMs] = CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, [StartMs]) END,
        [EndMs] = CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, [EndMs]) END,
        [PageNumber] = CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, [PageNumber]) END,
        [SegmentTitle] = CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, [SegmentTitle]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Transcript] = CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, [Transcript]) END,
        [SegmenterKey] = CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, [SegmenterKey]) END,
        [ParentChunkID] = CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, [ParentChunkID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentItemChunks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItemChunks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemChunk table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentItemChunk]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentItemChunk];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItemChunk
ON [${flyway:defaultSchema}].[ContentItemChunk]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemChunk]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItemChunk] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spDeleteContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemChunk]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItemChunk]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for EntityActionParam */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityActionID in table EntityActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionParam_EntityActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionParam_EntityActionID ON [${flyway:defaultSchema}].[EntityActionParam] ([EntityActionID]);

-- Index for foreign key ActionParamID in table EntityActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityActionParam_ActionParamID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityActionParam_ActionParamID ON [${flyway:defaultSchema}].[EntityActionParam] ([ActionParamID]);

/* Index for Foreign Keys for EntityAction */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Actions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityAction_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityAction_EntityID ON [${flyway:defaultSchema}].[EntityAction] ([EntityID]);

-- Index for foreign key ActionID in table EntityAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityAction_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityAction_ActionID ON [${flyway:defaultSchema}].[EntityAction] ([ActionID]);

-- Index for foreign key ScopeEntityID in table EntityAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityAction_ScopeEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityAction_ScopeEntityID ON [${flyway:defaultSchema}].[EntityAction] ([ScopeEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 4E05DE35-8989-4D13-95E1-C3D110843894 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4E05DE35-8989-4D13-95E1-C3D110843894', @RelatedEntityNameFieldMap='ScopeEntity';

/* Base View SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: vwEntityActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Params
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityActionParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityActionParams]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityActionParams];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityActionParams]
AS
SELECT
    e.*,
    MJEntityAction_EntityActionID.[Action] AS [EntityAction],
    MJActionParam_ActionParamID.[Name] AS [ActionParam]
FROM
    [${flyway:defaultSchema}].[EntityActionParam] AS e
INNER JOIN
    [${flyway:defaultSchema}].[vwEntityActions] AS MJEntityAction_EntityActionID
  ON
    [e].[EntityActionID] = MJEntityAction_EntityActionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ActionParam] AS MJActionParam_ActionParamID
  ON
    [e].[ActionParamID] = MJActionParam_ActionParamID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* Base View Permissions SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: Permissions for vwEntityActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActionParams] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* spCreate SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spCreateEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityActionParam]
    @ID uniqueidentifier = NULL,
    @EntityActionID uniqueidentifier,
    @ActionParamID uniqueidentifier,
    @ValueType nvarchar(20),
    @Value_Clear bit = 0,
    @Value nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @LogValue_Clear bit = 0,
    @LogValue bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityActionParam]
            (
                [ID],
                [EntityActionID],
                [ActionParamID],
                [ValueType],
                [Value],
                [Comments],
                [LogValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityActionID,
                @ActionParamID,
                @ValueType,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @LogValue_Clear = 1 THEN NULL ELSE ISNULL(@LogValue, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityActionParam]
            (
                [EntityActionID],
                [ActionParamID],
                [ValueType],
                [Value],
                [Comments],
                [LogValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityActionID,
                @ActionParamID,
                @ValueType,
                CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @LogValue_Clear = 1 THEN NULL ELSE ISNULL(@LogValue, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityActionParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Entity Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spUpdateEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityActionParam]
    @ID uniqueidentifier,
    @EntityActionID uniqueidentifier = NULL,
    @ActionParamID uniqueidentifier = NULL,
    @ValueType nvarchar(20) = NULL,
    @Value_Clear bit = 0,
    @Value nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @LogValue_Clear bit = 0,
    @LogValue bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionParam]
    SET
        [EntityActionID] = ISNULL(@EntityActionID, [EntityActionID]),
        [ActionParamID] = ISNULL(@ActionParamID, [ActionParamID]),
        [ValueType] = ISNULL(@ValueType, [ValueType]),
        [Value] = CASE WHEN @Value_Clear = 1 THEN NULL ELSE ISNULL(@Value, [Value]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [LogValue] = CASE WHEN @LogValue_Clear = 1 THEN NULL ELSE ISNULL(@LogValue, [LogValue]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityActionParams] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityActionParams]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionParam] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityActionParam table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityActionParam]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityActionParam];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityActionParam
ON [${flyway:defaultSchema}].[EntityActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityActionParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityActionParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spDeleteEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityActionParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityActionParam]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Entity Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityActionParam] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Entity Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Actions
-- Item: vwEntityActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Actions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityAction
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntityActions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntityActions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityActions]
AS
SELECT
    e.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJAction_ActionID.[Name] AS [Action],
    MJEntity_ScopeEntityID.[Name] AS [ScopeEntity]
FROM
    [${flyway:defaultSchema}].[EntityAction] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [e].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Action] AS MJAction_ActionID
  ON
    [e].[ActionID] = MJAction_ActionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_ScopeEntityID
  ON
    [e].[ScopeEntityID] = MJEntity_ScopeEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer];

/* Base View Permissions SQL for MJ: Entity Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Actions
-- Item: Permissions for vwEntityActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityActions] TO [cdp_UI], [cdp_Integration], [cdp_Developer];

/* spCreate SQL for MJ: Entity Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Actions
-- Item: spCreateEntityAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityAction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityAction]
    @EntityID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @ID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @ScopeEntityID_Clear bit = 0,
    @ScopeEntityID uniqueidentifier = NULL,
    @ScopeRecordID_Clear bit = 0,
    @ScopeRecordID nvarchar(450) = NULL,
    @LoggingMode nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityAction]
            (
                [ID],
                [EntityID],
                [ActionID],
                [Status],
                [Sequence],
                [ScopeEntityID],
                [ScopeRecordID],
                [LoggingMode]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @ActionID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Sequence, 0),
                CASE WHEN @ScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeEntityID, NULL) END,
                CASE WHEN @ScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeRecordID, NULL) END,
                ISNULL(@LoggingMode, 'All')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityAction]
            (
                [EntityID],
                [ActionID],
                [Status],
                [Sequence],
                [ScopeEntityID],
                [ScopeRecordID],
                [LoggingMode]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @ActionID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Sequence, 0),
                CASE WHEN @ScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeEntityID, NULL) END,
                CASE WHEN @ScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeRecordID, NULL) END,
                ISNULL(@LoggingMode, 'All')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityAction] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Entity Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityAction] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Entity Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Actions
-- Item: spUpdateEntityAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityAction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityAction]
    @EntityID uniqueidentifier = NULL,
    @ActionID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ID uniqueidentifier,
    @Sequence int = NULL,
    @ScopeEntityID_Clear bit = 0,
    @ScopeEntityID uniqueidentifier = NULL,
    @ScopeRecordID_Clear bit = 0,
    @ScopeRecordID nvarchar(450) = NULL,
    @LoggingMode nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityAction]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [ActionID] = ISNULL(@ActionID, [ActionID]),
        [Status] = ISNULL(@Status, [Status]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [ScopeEntityID] = CASE WHEN @ScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeEntityID, [ScopeEntityID]) END,
        [ScopeRecordID] = CASE WHEN @ScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@ScopeRecordID, [ScopeRecordID]) END,
        [LoggingMode] = ISNULL(@LoggingMode, [LoggingMode])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityActions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityActions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityAction] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityAction table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityAction]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityAction];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityAction
ON [${flyway:defaultSchema}].[EntityAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityAction]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityAction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityAction] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Entity Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Actions
-- Item: spDeleteEntityAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityAction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityAction]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityAction] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityAction] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Actions
-- Item: spDeleteAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Action
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ActionAuthorization using cursor to call spDeleteActionAuthorization
    DECLARE @MJActionAuthorizations_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionAuthorizations_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionAuthorization]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionAuthorizations_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionAuthorizations_ActionID_cursor INTO @MJActionAuthorizations_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionAuthorization] @ID = @MJActionAuthorizations_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionAuthorizations_ActionID_cursor INTO @MJActionAuthorizations_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionAuthorizations_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionAuthorizations_ActionID_cursor
    
    -- Cascade delete from ActionContext using cursor to call spDeleteActionContext
    DECLARE @MJActionContexts_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionContexts_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionContext]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionContexts_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionContexts_ActionID_cursor INTO @MJActionContexts_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionContext] @ID = @MJActionContexts_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionContexts_ActionID_cursor INTO @MJActionContexts_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionContexts_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionContexts_ActionID_cursor
    
    -- Cascade delete from ActionExecutionLog using cursor to call spDeleteActionExecutionLog
    DECLARE @MJActionExecutionLogs_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionExecutionLogs_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionExecutionLog]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionExecutionLogs_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionExecutionLogs_ActionID_cursor INTO @MJActionExecutionLogs_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionExecutionLog] @ID = @MJActionExecutionLogs_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionExecutionLogs_ActionID_cursor INTO @MJActionExecutionLogs_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionExecutionLogs_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionExecutionLogs_ActionID_cursor
    
    -- Cascade delete from ActionLibrary using cursor to call spDeleteActionLibrary
    DECLARE @MJActionLibraries_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionLibraries_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionLibrary]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionLibraries_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionLibraries_ActionID_cursor INTO @MJActionLibraries_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionLibrary] @ID = @MJActionLibraries_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionLibraries_ActionID_cursor INTO @MJActionLibraries_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionLibraries_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionLibraries_ActionID_cursor
    
    -- Cascade delete from ActionParam using cursor to call spDeleteActionParam
    DECLARE @MJActionParams_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionParams_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionParam]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionParams_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionParams_ActionID_cursor INTO @MJActionParams_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionParam] @ID = @MJActionParams_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionParams_ActionID_cursor INTO @MJActionParams_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionParams_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionParams_ActionID_cursor
    
    -- Cascade delete from ActionResultCode using cursor to call spDeleteActionResultCode
    DECLARE @MJActionResultCodes_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJActionResultCodes_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ActionResultCode]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJActionResultCodes_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJActionResultCodes_ActionID_cursor INTO @MJActionResultCodes_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteActionResultCode] @ID = @MJActionResultCodes_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJActionResultCodes_ActionID_cursor INTO @MJActionResultCodes_ActionIDID
    END
    
    CLOSE cascade_delete_MJActionResultCodes_ActionID_cursor
    DEALLOCATE cascade_delete_MJActionResultCodes_ActionID_cursor
    
    -- Cascade delete from Action using cursor to call spDeleteAction
    DECLARE @MJActions_ParentIDID uniqueidentifier
    DECLARE cascade_delete_MJActions_ParentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [ParentID] = @ID
    
    OPEN cascade_delete_MJActions_ParentID_cursor
    FETCH NEXT FROM cascade_delete_MJActions_ParentID_cursor INTO @MJActions_ParentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAction] @ID = @MJActions_ParentIDID
        
        FETCH NEXT FROM cascade_delete_MJActions_ParentID_cursor INTO @MJActions_ParentIDID
    END
    
    CLOSE cascade_delete_MJActions_ParentID_cursor
    DEALLOCATE cascade_delete_MJActions_ParentID_cursor
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_ActionIDID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_ActionID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_ActionID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_ActionID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_ActionID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_ActionID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_ActionID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_ActionID_CompactLength int
    DECLARE @MJAIAgentActions_ActionID_CompactPromptID uniqueidentifier
    DECLARE cascade_update_MJAIAgentActions_ActionID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJAIAgentActions_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_ActionID_cursor INTO @MJAIAgentActions_ActionIDID, @MJAIAgentActions_ActionID_AgentID, @MJAIAgentActions_ActionID_ActionID, @MJAIAgentActions_ActionID_Status, @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @MJAIAgentActions_ActionID_ResultExpirationTurns, @MJAIAgentActions_ActionID_ResultExpirationMode, @MJAIAgentActions_ActionID_CompactMode, @MJAIAgentActions_ActionID_CompactLength, @MJAIAgentActions_ActionID_CompactPromptID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_ActionIDID, @AgentID = @MJAIAgentActions_ActionID_AgentID, @ActionID_Clear = 1, @ActionID = @MJAIAgentActions_ActionID_ActionID, @Status = @MJAIAgentActions_ActionID_Status, @MinExecutionsPerRun = @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_ActionID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_ActionID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_ActionID_CompactMode, @CompactLength = @MJAIAgentActions_ActionID_CompactLength, @CompactPromptID = @MJAIAgentActions_ActionID_CompactPromptID

        FETCH NEXT FROM cascade_update_MJAIAgentActions_ActionID_cursor INTO @MJAIAgentActions_ActionIDID, @MJAIAgentActions_ActionID_AgentID, @MJAIAgentActions_ActionID_ActionID, @MJAIAgentActions_ActionID_Status, @MJAIAgentActions_ActionID_MinExecutionsPerRun, @MJAIAgentActions_ActionID_MaxExecutionsPerRun, @MJAIAgentActions_ActionID_ResultExpirationTurns, @MJAIAgentActions_ActionID_ResultExpirationMode, @MJAIAgentActions_ActionID_CompactMode, @MJAIAgentActions_ActionID_CompactLength, @MJAIAgentActions_ActionID_CompactPromptID
    END

    CLOSE cascade_update_MJAIAgentActions_ActionID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_ActionID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_ActionIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_ActionID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_StartingStep bit
    DECLARE @MJAIAgentSteps_ActionID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_ActionID_RetryCount int
    DECLARE @MJAIAgentSteps_ActionID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_ActionID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_PositionX int
    DECLARE @MJAIAgentSteps_ActionID_PositionY int
    DECLARE @MJAIAgentSteps_ActionID_Width int
    DECLARE @MJAIAgentSteps_ActionID_Height int
    DECLARE @MJAIAgentSteps_ActionID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_ActionID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_ActionID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_ActionID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_ActionID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJAIAgentSteps_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_ActionID_cursor INTO @MJAIAgentSteps_ActionIDID, @MJAIAgentSteps_ActionID_AgentID, @MJAIAgentSteps_ActionID_Name, @MJAIAgentSteps_ActionID_Description, @MJAIAgentSteps_ActionID_StepType, @MJAIAgentSteps_ActionID_StartingStep, @MJAIAgentSteps_ActionID_TimeoutSeconds, @MJAIAgentSteps_ActionID_RetryCount, @MJAIAgentSteps_ActionID_OnErrorBehavior, @MJAIAgentSteps_ActionID_ActionID, @MJAIAgentSteps_ActionID_SubAgentID, @MJAIAgentSteps_ActionID_PromptID, @MJAIAgentSteps_ActionID_ActionOutputMapping, @MJAIAgentSteps_ActionID_PositionX, @MJAIAgentSteps_ActionID_PositionY, @MJAIAgentSteps_ActionID_Width, @MJAIAgentSteps_ActionID_Height, @MJAIAgentSteps_ActionID_Status, @MJAIAgentSteps_ActionID_ActionInputMapping, @MJAIAgentSteps_ActionID_LoopBodyType, @MJAIAgentSteps_ActionID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_ActionIDID, @AgentID = @MJAIAgentSteps_ActionID_AgentID, @Name = @MJAIAgentSteps_ActionID_Name, @Description = @MJAIAgentSteps_ActionID_Description, @StepType = @MJAIAgentSteps_ActionID_StepType, @StartingStep = @MJAIAgentSteps_ActionID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_ActionID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_ActionID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_ActionID_OnErrorBehavior, @ActionID_Clear = 1, @ActionID = @MJAIAgentSteps_ActionID_ActionID, @SubAgentID = @MJAIAgentSteps_ActionID_SubAgentID, @PromptID = @MJAIAgentSteps_ActionID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_ActionID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_ActionID_PositionX, @PositionY = @MJAIAgentSteps_ActionID_PositionY, @Width = @MJAIAgentSteps_ActionID_Width, @Height = @MJAIAgentSteps_ActionID_Height, @Status = @MJAIAgentSteps_ActionID_Status, @ActionInputMapping = @MJAIAgentSteps_ActionID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_ActionID_LoopBodyType, @Configuration = @MJAIAgentSteps_ActionID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_ActionID_cursor INTO @MJAIAgentSteps_ActionIDID, @MJAIAgentSteps_ActionID_AgentID, @MJAIAgentSteps_ActionID_Name, @MJAIAgentSteps_ActionID_Description, @MJAIAgentSteps_ActionID_StepType, @MJAIAgentSteps_ActionID_StartingStep, @MJAIAgentSteps_ActionID_TimeoutSeconds, @MJAIAgentSteps_ActionID_RetryCount, @MJAIAgentSteps_ActionID_OnErrorBehavior, @MJAIAgentSteps_ActionID_ActionID, @MJAIAgentSteps_ActionID_SubAgentID, @MJAIAgentSteps_ActionID_PromptID, @MJAIAgentSteps_ActionID_ActionOutputMapping, @MJAIAgentSteps_ActionID_PositionX, @MJAIAgentSteps_ActionID_PositionY, @MJAIAgentSteps_ActionID_Width, @MJAIAgentSteps_ActionID_Height, @MJAIAgentSteps_ActionID_Status, @MJAIAgentSteps_ActionID_ActionInputMapping, @MJAIAgentSteps_ActionID_LoopBodyType, @MJAIAgentSteps_ActionID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_ActionID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_ActionID_cursor
    
    -- Cascade delete from AISkillAction using cursor to call spDeleteAISkillAction
    DECLARE @MJAISkillActions_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJAISkillActions_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AISkillAction]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJAISkillActions_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJAISkillActions_ActionID_cursor INTO @MJAISkillActions_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAISkillAction] @ID = @MJAISkillActions_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJAISkillActions_ActionID_cursor INTO @MJAISkillActions_ActionIDID
    END
    
    CLOSE cascade_delete_MJAISkillActions_ActionID_cursor
    DEALLOCATE cascade_delete_MJAISkillActions_ActionID_cursor
    
    -- Cascade delete from EntityAction using cursor to call spDeleteEntityAction
    DECLARE @MJEntityActions_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJEntityActions_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[EntityAction]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJEntityActions_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJEntityActions_ActionID_cursor INTO @MJEntityActions_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteEntityAction] @ID = @MJEntityActions_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJEntityActions_ActionID_cursor INTO @MJEntityActions_ActionIDID
    END
    
    CLOSE cascade_delete_MJEntityActions_ActionID_cursor
    DEALLOCATE cascade_delete_MJEntityActions_ActionID_cursor
    
    -- Cascade update on MCPServerTool using cursor to call spUpdateMCPServerTool
    DECLARE @MJMCPServerTools_GeneratedActionIDID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_MCPServerID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolName nvarchar(255)
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolTitle nvarchar(255)
    DECLARE @MJMCPServerTools_GeneratedActionID_ToolDescription nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_InputSchema nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_OutputSchema nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_Annotations nvarchar(MAX)
    DECLARE @MJMCPServerTools_GeneratedActionID_Status nvarchar(50)
    DECLARE @MJMCPServerTools_GeneratedActionID_DiscoveredAt datetimeoffset
    DECLARE @MJMCPServerTools_GeneratedActionID_LastSeenAt datetimeoffset
    DECLARE @MJMCPServerTools_GeneratedActionID_GeneratedActionID uniqueidentifier
    DECLARE @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID uniqueidentifier
    DECLARE cascade_update_MJMCPServerTools_GeneratedActionID_cursor CURSOR FOR
        SELECT [ID], [MCPServerID], [ToolName], [ToolTitle], [ToolDescription], [InputSchema], [OutputSchema], [Annotations], [Status], [DiscoveredAt], [LastSeenAt], [GeneratedActionID], [GeneratedActionCategoryID]
        FROM [${flyway:defaultSchema}].[MCPServerTool]
        WHERE [GeneratedActionID] = @ID

    OPEN cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    FETCH NEXT FROM cascade_update_MJMCPServerTools_GeneratedActionID_cursor INTO @MJMCPServerTools_GeneratedActionIDID, @MJMCPServerTools_GeneratedActionID_MCPServerID, @MJMCPServerTools_GeneratedActionID_ToolName, @MJMCPServerTools_GeneratedActionID_ToolTitle, @MJMCPServerTools_GeneratedActionID_ToolDescription, @MJMCPServerTools_GeneratedActionID_InputSchema, @MJMCPServerTools_GeneratedActionID_OutputSchema, @MJMCPServerTools_GeneratedActionID_Annotations, @MJMCPServerTools_GeneratedActionID_Status, @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @MJMCPServerTools_GeneratedActionID_LastSeenAt, @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJMCPServerTools_GeneratedActionID_GeneratedActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateMCPServerTool] @ID = @MJMCPServerTools_GeneratedActionIDID, @MCPServerID = @MJMCPServerTools_GeneratedActionID_MCPServerID, @ToolName = @MJMCPServerTools_GeneratedActionID_ToolName, @ToolTitle = @MJMCPServerTools_GeneratedActionID_ToolTitle, @ToolDescription = @MJMCPServerTools_GeneratedActionID_ToolDescription, @InputSchema = @MJMCPServerTools_GeneratedActionID_InputSchema, @OutputSchema = @MJMCPServerTools_GeneratedActionID_OutputSchema, @Annotations = @MJMCPServerTools_GeneratedActionID_Annotations, @Status = @MJMCPServerTools_GeneratedActionID_Status, @DiscoveredAt = @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @LastSeenAt = @MJMCPServerTools_GeneratedActionID_LastSeenAt, @GeneratedActionID_Clear = 1, @GeneratedActionID = @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @GeneratedActionCategoryID = @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID

        FETCH NEXT FROM cascade_update_MJMCPServerTools_GeneratedActionID_cursor INTO @MJMCPServerTools_GeneratedActionIDID, @MJMCPServerTools_GeneratedActionID_MCPServerID, @MJMCPServerTools_GeneratedActionID_ToolName, @MJMCPServerTools_GeneratedActionID_ToolTitle, @MJMCPServerTools_GeneratedActionID_ToolDescription, @MJMCPServerTools_GeneratedActionID_InputSchema, @MJMCPServerTools_GeneratedActionID_OutputSchema, @MJMCPServerTools_GeneratedActionID_Annotations, @MJMCPServerTools_GeneratedActionID_Status, @MJMCPServerTools_GeneratedActionID_DiscoveredAt, @MJMCPServerTools_GeneratedActionID_LastSeenAt, @MJMCPServerTools_GeneratedActionID_GeneratedActionID, @MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID
    END

    CLOSE cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    DEALLOCATE cascade_update_MJMCPServerTools_GeneratedActionID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_ActionIDID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_ActionID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_ActionID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_ActionID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_ActionID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_ActionID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_ActionID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_ActionID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_ActionID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_ActionID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_ActionID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_ActionID_BatchSize int
    DECLARE @MJRecordProcesses_ActionID_MaxConcurrency int
    DECLARE @MJRecordProcesses_ActionID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_ActionID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [ActionID] = @ID

    OPEN cascade_update_MJRecordProcesses_ActionID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_ActionID_cursor INTO @MJRecordProcesses_ActionIDID, @MJRecordProcesses_ActionID_Name, @MJRecordProcesses_ActionID_Description, @MJRecordProcesses_ActionID_CategoryID, @MJRecordProcesses_ActionID_EntityID, @MJRecordProcesses_ActionID_Status, @MJRecordProcesses_ActionID_WorkType, @MJRecordProcesses_ActionID_ActionID, @MJRecordProcesses_ActionID_AgentID, @MJRecordProcesses_ActionID_PromptID, @MJRecordProcesses_ActionID_ScopeType, @MJRecordProcesses_ActionID_ScopeViewID, @MJRecordProcesses_ActionID_ScopeListID, @MJRecordProcesses_ActionID_ScopeFilter, @MJRecordProcesses_ActionID_OnChangeEnabled, @MJRecordProcesses_ActionID_OnChangeInvocationType, @MJRecordProcesses_ActionID_OnChangeFilter, @MJRecordProcesses_ActionID_ScheduleEnabled, @MJRecordProcesses_ActionID_CronExpression, @MJRecordProcesses_ActionID_Timezone, @MJRecordProcesses_ActionID_OnDemandEnabled, @MJRecordProcesses_ActionID_InputMapping, @MJRecordProcesses_ActionID_OutputMapping, @MJRecordProcesses_ActionID_SkipUnchanged, @MJRecordProcesses_ActionID_WatermarkStrategy, @MJRecordProcesses_ActionID_BatchSize, @MJRecordProcesses_ActionID_MaxConcurrency, @MJRecordProcesses_ActionID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_ActionID_ActionID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_ActionIDID, @Name = @MJRecordProcesses_ActionID_Name, @Description = @MJRecordProcesses_ActionID_Description, @CategoryID = @MJRecordProcesses_ActionID_CategoryID, @EntityID = @MJRecordProcesses_ActionID_EntityID, @Status = @MJRecordProcesses_ActionID_Status, @WorkType = @MJRecordProcesses_ActionID_WorkType, @ActionID_Clear = 1, @ActionID = @MJRecordProcesses_ActionID_ActionID, @AgentID = @MJRecordProcesses_ActionID_AgentID, @PromptID = @MJRecordProcesses_ActionID_PromptID, @ScopeType = @MJRecordProcesses_ActionID_ScopeType, @ScopeViewID = @MJRecordProcesses_ActionID_ScopeViewID, @ScopeListID = @MJRecordProcesses_ActionID_ScopeListID, @ScopeFilter = @MJRecordProcesses_ActionID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_ActionID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_ActionID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_ActionID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_ActionID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_ActionID_CronExpression, @Timezone = @MJRecordProcesses_ActionID_Timezone, @OnDemandEnabled = @MJRecordProcesses_ActionID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_ActionID_InputMapping, @OutputMapping = @MJRecordProcesses_ActionID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_ActionID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_ActionID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_ActionID_BatchSize, @MaxConcurrency = @MJRecordProcesses_ActionID_MaxConcurrency, @Configuration = @MJRecordProcesses_ActionID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_ActionID_cursor INTO @MJRecordProcesses_ActionIDID, @MJRecordProcesses_ActionID_Name, @MJRecordProcesses_ActionID_Description, @MJRecordProcesses_ActionID_CategoryID, @MJRecordProcesses_ActionID_EntityID, @MJRecordProcesses_ActionID_Status, @MJRecordProcesses_ActionID_WorkType, @MJRecordProcesses_ActionID_ActionID, @MJRecordProcesses_ActionID_AgentID, @MJRecordProcesses_ActionID_PromptID, @MJRecordProcesses_ActionID_ScopeType, @MJRecordProcesses_ActionID_ScopeViewID, @MJRecordProcesses_ActionID_ScopeListID, @MJRecordProcesses_ActionID_ScopeFilter, @MJRecordProcesses_ActionID_OnChangeEnabled, @MJRecordProcesses_ActionID_OnChangeInvocationType, @MJRecordProcesses_ActionID_OnChangeFilter, @MJRecordProcesses_ActionID_ScheduleEnabled, @MJRecordProcesses_ActionID_CronExpression, @MJRecordProcesses_ActionID_Timezone, @MJRecordProcesses_ActionID_OnDemandEnabled, @MJRecordProcesses_ActionID_InputMapping, @MJRecordProcesses_ActionID_OutputMapping, @MJRecordProcesses_ActionID_SkipUnchanged, @MJRecordProcesses_ActionID_WatermarkStrategy, @MJRecordProcesses_ActionID_BatchSize, @MJRecordProcesses_ActionID_MaxConcurrency, @MJRecordProcesses_ActionID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_ActionID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_ActionID_cursor
    
    -- Cascade delete from ScheduledAction using cursor to call spDeleteScheduledAction
    DECLARE @MJScheduledActions_ActionIDID uniqueidentifier
    DECLARE cascade_delete_MJScheduledActions_ActionID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ScheduledAction]
        WHERE [ActionID] = @ID
    
    OPEN cascade_delete_MJScheduledActions_ActionID_cursor
    FETCH NEXT FROM cascade_delete_MJScheduledActions_ActionID_cursor INTO @MJScheduledActions_ActionIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteScheduledAction] @ID = @MJScheduledActions_ActionIDID
        
        FETCH NEXT FROM cascade_delete_MJScheduledActions_ActionID_cursor INTO @MJScheduledActions_ActionIDID
    END
    
    CLOSE cascade_delete_MJScheduledActions_ActionID_cursor
    DEALLOCATE cascade_delete_MJScheduledActions_ActionID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Action]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAction] TO [cdp_Integration], [cdp_Developer];

/* SQL text to insert 4 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20164ef5-5f7f-449a-9fdf-604b67895f80' OR (EntityID = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ScopeEntity')) BEGIN
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
            '20164ef5-5f7f-449a-9fdf-604b67895f80',
            '34248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Actions
            100025,
            'ScopeEntity',
            'Scope Entity',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc7c87c6-e1ff-4e55-a636-196c68e0c4bd' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')) BEGIN
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
            'bc7c87c6-e1ff-4e55-a636-196c68e0c4bd',
            '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Execution Logs
            100037,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c708f66c-ef61-4cb4-aba1-22a612df765f' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityActionInvocationType')) BEGIN
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
            'c708f66c-ef61-4cb4-aba1-22a612df765f',
            '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Execution Logs
            100038,
            'EntityActionInvocationType',
            'Entity Action Invocation Type',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94ca4c3e-a2aa-41f6-abf4-ab66201d526e' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TargetEntity')) BEGIN
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
            '94ca4c3e-a2aa-41f6-abf4-ab66201d526e',
            '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Action Execution Logs
            100039,
            'TargetEntity',
            'Target Entity',
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

