-- ============================================================================
-- Knowledge Hub / Classify: Tag Synonym approval status
-- ----------------------------------------------------------------------------
-- The classifier can propose synonyms (Source='LLM') and synonyms can be
-- imported in bulk (Source='Imported'). Today every synonym is live the moment
-- it exists, with no review step. Adding a Status lets the Classify "Synonyms"
-- panel hold machine-proposed synonyms in a Pending state until a human
-- approves them, while manually-added synonyms remain Active by default.
--
-- Additive, backward-compatible: existing rows default to 'Active', preserving
-- current behavior (every existing synonym keeps resolving).
-- ============================================================================

ALTER TABLE ${flyway:defaultSchema}.TagSynonym ADD
    Status NVARCHAR(20) NOT NULL
        CONSTRAINT DF_TagSynonym_Status DEFAULT 'Active'
        CONSTRAINT CK_TagSynonym_Status CHECK (Status IN ('Active','Pending','Rejected'));

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Approval state of the synonym. Active = resolves to its tag during classification. Pending = proposed (e.g. by the LLM or a bulk import) and awaiting human review; does not resolve until approved. Rejected = reviewed and declined; retained for audit and to suppress re-proposal.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'TagSynonym',
    @level2type = N'COLUMN', @level2name = N'Status';
