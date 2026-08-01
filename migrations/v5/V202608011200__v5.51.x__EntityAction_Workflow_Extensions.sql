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
-- WHAT THIS DOES *NOT* DO
--   No engine changes. The columns are inert until the server-side work in the
--   plan lands (scope filtering in EntityActionEngineBase, Sequence ordering,
--   the 'Entity Object Data' branch in MapParams, and routing After* through
--   QueueManager). Shipping schema first is deliberate — CodeGen has to generate
--   the entity types before any TypeScript can reference these columns.
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

-- Composite lookup index for "which entity actions are scoped to THIS record".
-- Not a foreign-key index (CodeGen owns those) - this serves the reverse lookup
-- from a scope record, which is the query the configuration UI runs on every load.
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_EntityAction_Scope'
                 AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityAction]'))
BEGIN
    CREATE INDEX [IX_EntityAction_Scope]
        ON [${flyway:defaultSchema}].[EntityAction] ([ScopeEntityID], [ScopeRecordID])
        INCLUDE ([EntityID], [ActionID], [Status], [Sequence]);
END
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
