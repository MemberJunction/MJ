/* ============================================================================
   MJ: Form Chrome Rules — additive Title

   Site admin can rename a rail / accordion section without depending on the
   OpenApp's DisplayName. Keyed by RelatedEntityID or ContributionKey, so an
   upgrade that changes "Payments" → "Payment-o" does not overwrite "Pmts".

   Nullable. Empty / omitted Title keeps the L1 DisplayName (or humanized
   entity name). CodeGen owns EntityField metadata after this column exists.
   ============================================================================ */

ALTER TABLE ${flyway:defaultSchema}.FormChromeRule ADD
    Title NVARCHAR(100) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional admin display title for this section. Null keeps the relationship DisplayName or contribution name. Survives OpenApp upgrades because the row is keyed by RelatedEntityID / ContributionKey, not by the previous label.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FormChromeRule',
    @level2type = N'COLUMN', @level2name = N'Title';
