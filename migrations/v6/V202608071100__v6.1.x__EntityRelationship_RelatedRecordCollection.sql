-- =============================================================================
-- EntityRelationship.RelatedRecordCollection — declare a relationship as a
-- first-class, code-generated related-record collection.
-- =============================================================================
--
-- WHAT THIS ENABLES. MemberJunction 6.2 adds composite entity graphs: a parent
-- record and its related rows that load, validate and persist as one unit, on
-- both tiers, from a single `entity.Save()`. Today a developer opts in by hand,
-- on a shared (client + server) entity subclass:
--
--     public readonly Lines = this.DeclareRelatedRecords<OrderLineEntity>({
--         Name: 'Lines',
--         RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
--         RelatedEntityJoinField: 'OrderHeaderID',
--         OrderBy: 'LineNumber ASC',
--         Load: 'explicit',
--         OnRemove: 'delete',
--         Sequence: { Field: 'LineNumber', From: 1 },
--     });
--
-- Two of those properties — `RelatedEntity` and `RelatedEntityJoinField` — are
-- already columns on this table. The rest are behavioural policy that has
-- nowhere to live. This column is that home, so CodeGen can emit the whole
-- declaration onto the generated entity subclass instead of every application
-- hand-writing it.
--
-- WHY A JSONType RATHER THAN COLUMNS. The declaration is a small, evolving
-- policy object, not a set of independent facts to query or index. `Sequence` is
-- itself a nested object; `Load` and `OnRemove` are closed value lists that will
-- grow. Modelling it as six-plus nullable scalar columns would mean a migration
-- for every new option and a table where most columns are NULL on most rows —
-- while giving up the one thing that actually matters here, which is a single
-- typed shape that the runtime option type and the generated code both agree on.
--
-- A JSONType gives that: `EntityField.JSONTypeDefinition` holds the TypeScript
-- interface, CodeGen emits a strongly-typed `RelatedRecordCollectionObject`
-- accessor, and adding an option is an interface edit plus `mj sync push` — no
-- schema change at all. This mirrors how `UserView.GridState`, `FilterState` and
-- `CardState` are already modelled.
--
-- ADDITIVE ON PURPOSE. NULL — every existing row — means "this relationship is
-- not a declared collection", which is exactly today's behaviour. Nothing is
-- generated, nothing is loaded eagerly, and no existing consumer changes. Opting
-- in is a per-relationship decision.
--
-- NOT ENFORCED HERE. This migration only adds the column and its type
-- definition. CodeGen emission of `DeclareRelatedRecords(...)` from these rows is
-- the follow-up; until then the column is read by nothing and hand-written
-- declarations remain the only path. Shipping the schema first keeps the
-- generator change reviewable on its own.
--
-- SEE ALSO. guides/TRANSACTIONS_AND_BATCHING_GUIDE.md — when to use a related
-- record collection versus a provider transaction versus a TransactionGroup.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[EntityRelationship]
    ADD [RelatedRecordCollection] NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON policy object that declares this relationship as a first-class related-record collection, so CodeGen can emit a typed DeclareRelatedRecords(...) declaration on the entity subclass. Shape is IRelatedRecordCollectionConfig: Name (the generated property name, e.g. "Lines"), Load (''explicit'' | ''eager'' | ''never''), OnRemove (''delete'' | ''orphan'' | ''refuse''), OrderBy, Sequence ({ Field, From }), and ClearAfterSave. RelatedEntity and RelatedEntityJoinField are NOT repeated here — they are read from this row''s own columns. NULL means the relationship is not a declared collection, which is the default and reproduces pre-6.2 behaviour exactly.',
    @level0type = N'SCHEMA',  @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',   @level1name = N'EntityRelationship',
    @level2type = N'COLUMN',  @level2name = N'RelatedRecordCollection';
GO
