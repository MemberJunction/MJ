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
