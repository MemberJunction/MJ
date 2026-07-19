-- Add a SupportsStructuredOutput capability flag to AIModelVendor.
--
-- Marks a specific model x inference-provider pairing as supporting native, provider-enforced
-- structured output (constrained/grammar-guided JSON decoding against a schema). This is the
-- data-driven source of truth read by AIPromptRunner during model selection and threaded into
-- ChatParams so that drivers which implement constrained decoding can honor a JSON response
-- format via the provider's structured-output mechanism. Drivers that do not implement it simply
-- ignore the signal, so enabling this flag never breaks portability across the ~30 providers.
--
-- Mirrors the existing vendor-level capability columns (SupportsEffortLevel, SupportsStreaming).
ALTER TABLE [${flyway:defaultSchema}].[AIModelVendor] ADD SupportsStructuredOutput BIT NOT NULL DEFAULT 0
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Specifies if this model-vendor implementation supports native, provider-enforced structured output (constrained JSON decoding against a schema). When enabled, AIPromptRunner signals drivers to honor JSON response formats via the provider''s structured-output mechanism; drivers that do not implement it ignore the signal, preserving portability.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIModelVendor',
    @level2type = N'COLUMN', @level2name = N'SupportsStructuredOutput';
GO
