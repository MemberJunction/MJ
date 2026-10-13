-- =============================================================================
-- Entity Action Workflow Extensions
-- =============================================================================
--
-- Turns EntityAction into the general workflow-hook substrate for MJ and every
-- OpenApp built on it. Design + rationale: plans/entity-action-workflow-extensions.md
--
-- WHAT THIS ADDS (all additive; no existing behaviour changes)
--
--   1. EntityAction.Sequence          — deterministic ordering when several entity
--                                       actions bind to the same invocation type.
--   2. EntityAction.ScopeEntityID     — optional binding to a SPECIFIC record, so a
--      EntityAction.ScopeRecordID       workflow can be attached to "this Deal Type",
--                                       "this Contract Type", "this Pipeline", "this
--                                       Company". NULL = applies to all records of
--                                       the entity (today's behaviour, unchanged).
--   3. EntityActionParam.ValueType    — adds 'Entity Object Data', which passes
--      gains a fifth option              entity.GetAll() rather than the BaseEntity
--                                       instance. See the note below; this one
--                                       prevents a silent-empty-payload bug.
--
--   PART 2 (below) — execution logging:
--   4. ActionExecutionLog gains         — EntityActionID, EntityActionInvocationTypeID,
--      entity-action provenance           TargetEntityID, TargetRecordID.
--   5. Param-value logging becomes      — ActionParam.LogValue,
--      fail-closed                        EntityActionParam.LogValue, and a HARD rule
--                                         that whole-record value types are never
--                                         written to the log.
--   6. EntityAction.LoggingMode         — volume control per binding.
--
--   PART 3 (below) — input/output separation:
--   7. ActionExecutionLog.ResultParams   — the final merged set, so that Params can
--                                          stop being overwritten and keep the
--                                          AS-CALLED inputs.
--
-- WHAT THIS DOES *NOT* DO
--   No engine changes. The columns are inert until the server-side work in the
--   plan lands (scope filtering in EntityActionEngineBase, Sequence ordering,
--   the 'Entity Object Data' branch in MapParams, routing After* through
--   QueueManager, and the redaction rules in PART 2). Shipping schema first is
--   deliberate — CodeGen has to generate the entity types before any TypeScript
--   can reference these columns.
--
--   ⚠️ UNTIL THE PART 2 ENGINE WORK LANDS, PARAM LOGGING STILL WRITES EVERY VALUE.
--   The columns exist; nothing reads them yet. Do NOT author bindings that pass
--   whole records into actions until the redaction rules ship — see the plan's
--   post-CodeGen runbook for the order.
--
-- ⚠️  CODEGEN HAS NOT BEEN RUN AGAINST THIS MIGRATION. Whoever applies it must run
--     `mj codegen` and commit the generated output before writing code against the
--     new columns.
--
-- WHY 'Entity Object Data' EXISTS
--   EntityActionParam.ValueType='Entity Object' passes the live BaseEntity instance.
--   That is right for actions that call entity methods, and WRONG for anything that
--   serializes the value — most importantly the `Data` payload of the `Execute Agent`
--   action, which is typed Record<string, unknown> and gets JSON-serialized into the
--   agent run. BaseEntity fields are getters, not enumerable own properties, so the
--   agent receives `{}` — silently, with no error anywhere. That is the same trap the
--   framework already documents for the spread operator, and the fix is the same:
--   GetAll(). A 'Script' param returning entity.GetAll() works today, but every author
--   reaches for 'Entity Object' first and gets an empty payload, so the safe option
--   needs to exist by name.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 + 2. EntityAction: Sequence and optional record scope
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[EntityAction] ADD
    [Sequence] INT NOT NULL CONSTRAINT [DF_EntityAction_Sequence] DEFAULT 0,
    [ScopeEntityID] UNIQUEIDENTIFIER NULL,
    [ScopeRecordID] NVARCHAR(450) NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[EntityAction] ADD
    CONSTRAINT [FK_EntityAction_ScopeEntity]
        FOREIGN KEY ([ScopeEntityID]) REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [CK_EntityAction_Scope]
        CHECK (([ScopeEntityID] IS NULL AND [ScopeRecordID] IS NULL)
            OR ([ScopeEntityID] IS NOT NULL AND [ScopeRecordID] IS NOT NULL));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Execution order when multiple Entity Actions are bound to the same entity and invocation type. Lower runs first; ties fall back to creation order. Defaults to 0 so existing rows are unaffected.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAction',
    @level2type = N'COLUMN', @level2name = N'Sequence';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional. Together with ScopeRecordID, narrows this Entity Action to records related to ONE specific record - for example a single Deal Type, Contract Type, Pipeline or Company - rather than every record of EntityID. NULL (the default) means the action applies to all records, which is the pre-existing behaviour. How a scope record relates to the subject record is resolved by the app that owns the scope entity; the framework only stores and filters on the pair.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAction',
    @level2type = N'COLUMN', @level2name = N'ScopeEntityID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional. The primary key of the scope record, as text, paired with ScopeEntityID. Both columns are NULL or both are set (CK_EntityAction_Scope). Lets a configuration record such as a Deal Type surface "the workflows bound to me" as a real relationship rather than something buried in filter code.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAction',
    @level2type = N'COLUMN', @level2name = N'ScopeRecordID';
GO


-- -----------------------------------------------------------------------------
-- 3. EntityActionParam.ValueType gains 'Entity Object Data'
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[EntityActionParam]
    DROP CONSTRAINT [CHK_EntityActionParam_ValueType];
GO

ALTER TABLE [${flyway:defaultSchema}].[EntityActionParam]
    ADD CONSTRAINT [CHK_EntityActionParam_ValueType]
        CHECK ([ValueType] = 'Script'
            OR [ValueType] = 'Entity Object'
            OR [ValueType] = 'Entity Object Data'
            OR [ValueType] = 'Entity Field'
            OR [ValueType] = 'Static');
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'How the parameter value is produced at invocation time. Static = the literal Value (parsed as JSON when it parses). Entity Object = the live BaseEntity instance, for actions that call entity methods. Entity Object Data = entity.GetAll(), a plain object - use this for any action that SERIALIZES the value, such as the Data payload of Execute Agent, because a BaseEntity serializes to {} (its fields are getters, not enumerable own properties). Entity Field = the named field''s value. Script = evaluated expression with the entity in scope.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityActionParam',
    @level2type = N'COLUMN', @level2name = N'ValueType';
GO


-- =============================================================================
-- PART 2 — Execution logging: provenance, and payloads that are safe to write
-- =============================================================================
--
-- Two problems, one cause.
--
-- (a) PROVENANCE. `ActionExecutionLog` records ActionID / StartedAt / EndedAt /
--     Params / ResultCode / UserID / Message. It cannot answer "which Entity
--     Action fired this, on which record, from which event" — so the moment
--     Entity Actions become the workflow substrate, a failed workflow is
--     undiagnosable. Four nullable columns fix that.
--
-- (b) PAYLOAD. `ActionEngine.StartActionLog` writes
--     `JSON.stringify(params.Params)` on EVERY run, and `EndActionLog` writes
--     the merged input+output set again. Unconditionally — there is no opt-out.
--
--     That is harmless while Entity Actions are unused, and stops being harmless
--     the instant they are the workflow substrate, because entity-action params
--     are WHOLE RECORDS: `ValueType='Entity Object'` and `'Entity Object Data'`
--     put the entire row into ActionExecutionLog.Params, twice per invocation.
--     An AfterUpdate binding on a busy entity therefore writes the full record
--     to a general-purpose log on every save.
--
--       - SPACE: the NVARCHAR(MAX) payload is the size problem, not the row.
--         A row per invocation is cheap; a record serialized twice is not.
--       - SECURITY: message bodies, Person fields, contract terms landing in a
--         log with broad read access. `RetentionPeriod` deletes it eventually,
--         which is not the same as never writing it.
--
-- THE POSTURE IS FAIL-CLOSED, matching how the family treats this elsewhere:
-- the safe behaviour is the default, and logging a value is opt-in.
--
--   1. HARD RULE, no configuration: params whose ValueType is 'Entity Object'
--      or 'Entity Object Data' are NEVER written to the log. They are whole
--      records by definition. The log records the param name, its type, and a
--      redaction marker.
--   2. ActionParam.LogValue        — the definition declares whether a param's
--                                    value is loggable at all. Default 1.
--   3. EntityActionParam.LogValue  — per-binding override (NULL = inherit).
--                                    Lets one binding redact a param that is
--                                    ordinarily fine to log.
--   4. EntityAction.LoggingMode    — volume control for high-traffic bindings.
--
-- Rule 1 is what actually closes the hole; 2-4 handle the grey area (a Static
-- param holding an API key, an Entity Field holding a national ID) and volume.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 2a. ActionExecutionLog: entity-action provenance
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[ActionExecutionLog] ADD
    [EntityActionID] UNIQUEIDENTIFIER NULL,
    [EntityActionInvocationTypeID] UNIQUEIDENTIFIER NULL,
    [TargetEntityID] UNIQUEIDENTIFIER NULL,
    [TargetRecordID] NVARCHAR(450) NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[ActionExecutionLog] ADD
    CONSTRAINT [FK_ActionExecutionLog_EntityAction]
        FOREIGN KEY ([EntityActionID]) REFERENCES [${flyway:defaultSchema}].[EntityAction]([ID]),
    CONSTRAINT [FK_ActionExecutionLog_EntityActionInvocationType]
        FOREIGN KEY ([EntityActionInvocationTypeID]) REFERENCES [${flyway:defaultSchema}].[EntityActionInvocationType]([ID]),
    CONSTRAINT [FK_ActionExecutionLog_TargetEntity]
        FOREIGN KEY ([TargetEntityID]) REFERENCES [${flyway:defaultSchema}].[Entity]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional. The Entity Action binding that caused this run. NULL when the action was invoked directly - from a resolver, a script, an agent step or a scheduled action.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ActionExecutionLog',
    @level2type = N'COLUMN', @level2name = N'EntityActionID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional. Which lifecycle event fired the binding - AfterUpdate, Validate, List and so on. Recorded separately from EntityActionID because one binding may be attached to several invocation types, and telling a Validate refusal apart from an AfterUpdate side effect is the first question anyone asks of this log.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ActionExecutionLog',
    @level2type = N'COLUMN', @level2name = N'EntityActionInvocationTypeID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional. The entity of the record this run operated on. Deliberately denormalized rather than joined through EntityActionID: it survives the binding being deleted or retargeted, and it lets the log be queried by record with no join. Kept generic because every invoker has a subject - not only Entity Actions.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ActionExecutionLog',
    @level2type = N'COLUMN', @level2name = N'TargetEntityID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional. The primary key of the record this run operated on, as text, paired with TargetEntityID. For multi-record invocation types (List, View) one log row is written per record, so this is always a single record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ActionExecutionLog',
    @level2type = N'COLUMN', @level2name = N'TargetRecordID';
GO


-- -----------------------------------------------------------------------------
-- 2b. Param-value logging control
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[ActionParam] ADD
    [LogValue] BIT NOT NULL CONSTRAINT [DF_ActionParam_LogValue] DEFAULT 1;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this parameter''s VALUE may be written to ActionExecutionLog.Params. Default 1. Set to 0 for parameters that carry records, credentials or personal data - for example the Data payload of Execute Agent. Independent of the hard rule that Entity Action params of ValueType ''Entity Object'' or ''Entity Object Data'' are never logged regardless of this flag. When logging is suppressed the log records the parameter name, its type and a redaction marker, never the value.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ActionParam',
    @level2type = N'COLUMN', @level2name = N'LogValue';
GO

ALTER TABLE [${flyway:defaultSchema}].[EntityActionParam] ADD
    [LogValue] BIT NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional per-binding override of ActionParam.LogValue. NULL (the default) inherits the parameter definition. Set to 0 when this particular binding passes something sensitive through a parameter that is ordinarily safe to log - a message body through a generic Text parameter, for instance. Cannot re-enable logging for a value type the hard rule suppresses.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityActionParam',
    @level2type = N'COLUMN', @level2name = N'LogValue';
GO


-- -----------------------------------------------------------------------------
-- 2c. Per-binding volume control
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[EntityAction] ADD
    [LoggingMode] NVARCHAR(20) NOT NULL CONSTRAINT [DF_EntityAction_LoggingMode] DEFAULT 'All';
GO

ALTER TABLE [${flyway:defaultSchema}].[EntityAction] ADD
    CONSTRAINT [CK_EntityAction_LoggingMode]
        CHECK ([LoggingMode] IN ('All', 'FailuresOnly', 'None'));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'How much of this binding''s activity reaches ActionExecutionLog. All (default) writes a row per invocation. FailuresOnly writes only runs that did not succeed - the right setting for a high-frequency binding on a busy entity, where the successful runs are noise. None disables logging for the binding entirely and should be rare, because it also removes the failure record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityAction',
    @level2type = N'COLUMN', @level2name = N'LoggingMode';
GO


-- =============================================================================
-- PART 3 — Separate the as-called inputs from the final result set
-- =============================================================================
--
-- `ActionExecutionLog.Params` is written TWICE against the same column:
--
--   StartActionLog  Params = JSON.stringify(params.Params)              -- inputs
--   EndActionLog    Params = JSON.stringify(result.Params ?? params.Params)
--                                                    -- merged inputs + outputs
--
-- The second write OVERWRITES the first. And because Custom and Generated
-- actions mutate `params.Params` in place, the end state is not merely the
-- inputs plus outputs — it is the inputs AS THE ACTION LEFT THEM. So the values
-- the action was actually CALLED with are captured at start and then destroyed
-- at end. "What was this called with" and "what did it end up holding" are
-- different questions, and only the second is currently answerable.
--
-- Splitting them costs one nullable column, and MJ already has the precedent one
-- table over: QueueTask separates Data / Options / Output rather than merging.
--
--   Params        -> the AS-CALLED inputs. Written once at start, never
--                    overwritten. Answers "what was this invoked with".
--   ResultParams  -> the final merged set at completion. Answers "what did the
--                    action produce, and what did the inputs become".
--
-- Both are subject to the redaction rules in PART 2 — a param suppressed on the
-- way in is suppressed on the way out.
--
-- ResultParams is written on FAILURE exactly as on success. Both failure paths in
-- ActionEngine.InternalRunAction already reach EndActionLog — the returned
-- Success:false case and the thrown-exception catch, which passes params.Params
-- (the mutated array) — so this needs no new control flow. A failed run's
-- partially-mutated inputs are usually the most diagnostic thing available, and
-- an audit trail that records only successes is not an audit trail.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[ActionExecutionLog] ADD
    [ResultParams] NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON-formatted FINAL parameter set captured when the action finished - the inputs as the action left them, plus any output parameters it produced. Written on FAILURE exactly as on success, under the same redaction rules: a failed run''s partially-mutated inputs are usually the most diagnostic thing available, and an audit trail that records only successes is not an audit trail. Distinct from Params, which holds the values the action was called with and is never overwritten. NULL means one thing only - the run never finished (process died, host killed) - so it is a signal rather than an absence, and must not be backfilled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ActionExecutionLog',
    @level2type = N'COLUMN', @level2name = N'ResultParams';
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'JSON-formatted input parameters AS THE ACTION WAS CALLED, captured once when execution starts and never overwritten. Custom and Generated actions mutate their parameter array in place, so this is the only durable record of the values actually passed in; the final state lives in ResultParams. Parameter values may be redacted per ActionParam.LogValue / EntityActionParam.LogValue, and whole-record value types are never written - see the parameter''s own documentation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ActionExecutionLog',
    @level2type = N'COLUMN', @level2name = N'Params';
GO

-- Pre-existing description said "JSON-formatted output data or response from the
-- action execution", which describes ResultParams rather than this column. The
-- code sets it from `result.Message` - a human-readable summary. Corrected here
-- so nobody goes looking for outputs in the wrong place.
EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable summary message returned by the action - the reason for a refusal, or a short description of what was done. Not the action''s output data: parameter values live in Params and ResultParams, and the outcome code in ResultCode.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ActionExecutionLog',
    @level2type = N'COLUMN', @level2name = N'Message';
GO


-- =============================================================================
-- PART 3 — CodeGen output for the schema above
-- =============================================================================
-- Generated by `mj codegen` against a fresh database with PARTS 1 and 2 applied
-- and nothing else, then folded in here so this migration is self-contained: the
-- 11 new EntityField rows, the regenerated views and CRUD procedures for the
-- affected entities, and the permission grants that go with them.
--
-- Kept in this file rather than shipped as a side CodeGen_Run_*.sql because the
-- schema change and the metadata that describes it are one unit of work — a
-- deployment that applied one without the other would have entity metadata that
-- disagrees with its own tables.
-- =============================================================================

/* SQL text to insert 11 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '148d5921-0a1a-4b27-9963-87dc616d32d2' OR (EntityID = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Sequence')) BEGIN
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
            '148d5921-0a1a-4b27-9963-87dc616d32d2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86caa55a-44d1-46cd-b073-1e864e1233ae' OR (EntityID = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ScopeEntityID')) BEGIN
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
            '86caa55a-44d1-46cd-b073-1e864e1233ae',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd7aaa2ed-6481-4b85-8906-7c73cb1d0fc9' OR (EntityID = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ScopeRecordID')) BEGIN
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
            'd7aaa2ed-6481-4b85-8906-7c73cb1d0fc9',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '41d8ae35-2d96-4655-bef1-b16f5860b688' OR (EntityID = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LoggingMode')) BEGIN
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
            '41d8ae35-2d96-4655-bef1-b16f5860b688',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a06bac2d-d59e-4d0e-ba24-db99a3d7f4c5' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityActionID')) BEGIN
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
            'a06bac2d-d59e-4d0e-ba24-db99a3d7f4c5',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '82f166b9-98c5-419b-8ca3-94c75f6923d0' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityActionInvocationTypeID')) BEGIN
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
            '82f166b9-98c5-419b-8ca3-94c75f6923d0',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '927cfe61-12a6-42fe-9cef-dd20f4475ba5' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TargetEntityID')) BEGIN
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
            '927cfe61-12a6-42fe-9cef-dd20f4475ba5',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa659c40-fe09-430c-b9a6-750263bfdc77' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TargetRecordID')) BEGIN
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
            'aa659c40-fe09-430c-b9a6-750263bfdc77',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1c62e051-5abe-44b2-919d-44b19ab41bc8' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ResultParams')) BEGIN
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
            '1c62e051-5abe-44b2-919d-44b19ab41bc8',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '683ab110-8380-4d0c-8110-d1aecc75671e' OR (EntityID = '3F248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LogValue')) BEGIN
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
            '683ab110-8380-4d0c-8110-d1aecc75671e',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca3b5587-44a5-4266-9ce5-edaa583daca2' OR (EntityID = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LogValue')) BEGIN
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
            'ca3b5587-44a5-4266-9ce5-edaa583daca2',
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

/* SQL text to insert entity field value with ID de132a53-55fe-480e-bec7-e7f33517c966 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('de132a53-55fe-480e-bec7-e7f33517c966', '995817F0-6F36-EF11-86D4-6045BDEE16E6', 3, 'Entity Object Data', 'Entity Object Data', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='E45B6265-0617-46E5-933D-01776851E9BC';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='D76E1A37-E252-462B-9E5C-F9B46C9909AD';

/* SQL text to insert entity field value with ID 2707f767-5b33-49e1-a077-a18d712b17f4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2707f767-5b33-49e1-a077-a18d712b17f4', '41D8AE35-2D96-4655-BEF1-B16F5860B688', 1, 'All', 'All', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f964b10c-58e2-40c2-adab-be073c6660da */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f964b10c-58e2-40c2-adab-be073c6660da', '41D8AE35-2D96-4655-BEF1-B16F5860B688', 2, 'FailuresOnly', 'FailuresOnly', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID cabd6977-363f-4e39-aa1b-f0eb940884a5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cabd6977-363f-4e39-aa1b-f0eb940884a5', '41D8AE35-2D96-4655-BEF1-B16F5860B688', 3, 'None', 'None', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 41D8AE35-2D96-4655-BEF1-B16F5860B688 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='41D8AE35-2D96-4655-BEF1-B16F5860B688';


/* Create Entity Relationship: MJ: Entities -> MJ: Action Execution Logs (One To Many via TargetEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '290ddcfd-f93e-41d1-900e-5b9c705fc1c2'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('290ddcfd-f93e-41d1-900e-5b9c705fc1c2', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'TargetEntityID', 'One To Many', 1, 1, 72, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Entity Actions (One To Many via ScopeEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd92846bf-ef9d-4ef0-9d45-92629374f217'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d92846bf-ef9d-4ef0-9d45-92629374f217', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '34248F34-2837-EF11-86D4-6045BDEE16E6', 'ScopeEntityID', 'One To Many', 1, 1, 73, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entity Actions -> MJ: Action Execution Logs (One To Many via EntityActionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4d923946-1eed-4848-b916-495f57738fce'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4d923946-1eed-4848-b916-495f57738fce', '34248F34-2837-EF11-86D4-6045BDEE16E6', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'EntityActionID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entity Action Invocation Types -> MJ: Action Execution Logs (One To Many via EntityActionInvocationTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd102c008-1a3f-45c4-9d73-8fb30ffe9b54'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d102c008-1a3f-45c4-9d73-8fb30ffe9b54', '37248F34-2837-EF11-86D4-6045BDEE16E6', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'EntityActionInvocationTypeID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID A06BAC2D-D59E-4D0E-BA24-DB99A3D7F4C5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A06BAC2D-D59E-4D0E-BA24-DB99A3D7F4C5', @RelatedEntityNameFieldMap='EntityAction';

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

/* SQL text to update entity field related entity name field map for entity field ID 82F166B9-98C5-419B-8CA3-94C75F6923D0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='82F166B9-98C5-419B-8CA3-94C75F6923D0', @RelatedEntityNameFieldMap='EntityActionInvocationType';

/* SQL text to update entity field related entity name field map for entity field ID 927CFE61-12A6-42FE-9CEF-DD20F4475BA5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='927CFE61-12A6-42FE-9CEF-DD20F4475BA5', @RelatedEntityNameFieldMap='TargetEntity';

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

/* SQL text to update entity field related entity name field map for entity field ID 86CAA55A-44D1-46CD-B073-1E864E1233AE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='86CAA55A-44D1-46CD-B073-1E864E1233AE', @RelatedEntityNameFieldMap='ScopeEntity';

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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9286e6fd-c29a-47ba-8690-0a35bdf96cc5' OR (EntityID = '34248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ScopeEntity')) BEGIN
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
            '9286e6fd-c29a-47ba-8690-0a35bdf96cc5',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '34725233-b141-483f-96f0-0e0e7c8dd870' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')) BEGIN
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
            '34725233-b141-483f-96f0-0e0e7c8dd870',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d336063-c666-47ea-b0d5-ed692e81e6e7' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityActionInvocationType')) BEGIN
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
            '9d336063-c666-47ea-b0d5-ed692e81e6e7',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '898d7496-df26-4aaf-ba4b-6be563d78184' OR (EntityID = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TargetEntity')) BEGIN
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
            '898d7496-df26-4aaf-ba4b-6be563d78184',
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

