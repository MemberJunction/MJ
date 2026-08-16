-- =============================================================================
-- EntityField.EmbeddedRecord — declare an owner-held FK as a first-class
-- embedded record (1:1 peer that loads/validates/saves with its owner).
-- =============================================================================
--
-- WHAT THIS ENABLES. A Deal holds OrderID and wants the Order (and the Order's
-- own companions — lines, charges) to load and persist as one unit with the
-- Deal, from a single deal.Save(), on both tiers. Related-record collections
-- cannot do this: they assume the FK lives on the related row and the owner
-- saves first. An owner-held FK inverts that join and the save order.
--
--     const deal = await md.GetEntityObject('Deals');
--     deal.OrderID_Object.OrderDate = new Date('2002-01-01');
--     await deal.Save();
--
-- The column is the policy half of that declaration. RelatedEntity and the FK
-- field name are already on this row (RelatedEntityID, Name). AllowsNull on
-- this same row decides whether GetEntityObject provisions the object or the
-- caller uses {FieldName}_EnsureObject().
--
-- WHY A JSONType RATHER THAN COLUMNS. OnClear and LoadNested are a small,
-- evolving policy object. Modelling them as scalar columns would mean a
-- migration per option. A JSONType gives one typed shape the runtime and
-- CodeGen both agree on; adding an option is an interface edit plus
-- `mj sync push`.
--
-- ADDITIVE ON PURPOSE. NULL — every existing row — means "this FK is not an
-- embedded record", which is exactly today's behaviour. Nothing is generated,
-- nothing is constructed at GetEntityObject time. Opting in is per-field and
-- should be used sparingly (the construct cost is paid at GetEntityObject).
--
-- SEE ALSO. plans/embedded-records.md, packages/MJCore/docs/embedded-records.md
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[EntityField]
    ADD [EmbeddedRecord] NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON policy object that declares this foreign-key field as a first-class embedded record, so CodeGen can emit {FieldName}_Object / {FieldName}_EnsureObject() on the entity subclass. Shape is IEmbeddedRecordConfig: OnClear (''delete'' | ''orphan'' | ''refuse'', default orphan) and LoadNested (''inherit'' | ''related'', default inherit). RelatedEntity and the FK field name are NOT repeated here — they are this row''s RelatedEntityID and Name. AllowsNull on this same row decides whether the object is provisioned with GetEntityObject (required FK) or via Ensure (nullable FK). NULL means the field is an ordinary FK, which is the default and reproduces pre-feature behaviour exactly.',
    @level0type = N'SCHEMA',  @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',   @level1name = N'EntityField',
    @level2type = N'COLUMN',  @level2name = N'EmbeddedRecord';
GO
