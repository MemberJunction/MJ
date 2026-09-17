-- =============================================================================
-- Migration: Exclude Taxonomy Entities from Direct User Search & Register TagSearchProvider
-- Version: v6.1.x
-- Description:
--   1. Disables AllowUserSearchAPI on administrative taxonomy entities
--      (MJ: Tags, MJ: Tagged Items, MJ: Tag Synonyms, MJ: Tag Scopes,
--      MJ: Tag Co-Occurrences) so tag definition records never pollute global
--      user search results.
--   2. Registers TagSearchProvider in __mj.SearchProvider so records tagged
--      with matched terms are retrieved and weighted by item tag percentage.
-- =============================================================================

-- 1. Disable AllowUserSearchAPI and AutoUpdateAllowUserSearchAPI on taxonomy/tag entities
UPDATE e
SET e.AllowUserSearchAPI = 0,
    e.AutoUpdateAllowUserSearchAPI = 0
FROM [${flyway:defaultSchema}].[Entity] e
WHERE e.SchemaName = N'${flyway:defaultSchema}'
  AND e.Name IN (
      N'MJ: Tags',
      N'MJ: Tagged Items',
      N'MJ: Tag Synonyms',
      N'MJ: Tag Scopes',
      N'MJ: Tag Co-Occurrences'
  );

-- 2. Register TagSearchProvider in SearchProvider table if not already present
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[SearchProvider] WHERE [DriverClass] = N'TagSearchProvider')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[SearchProvider] (
        [ID], [Name], [Description], [DriverClass], [Status], [Priority], [SupportsPreview],
        [MaxResultsOverride], [ProviderConfig], [CredentialID], [DisplayName], [Icon], [Comments]
    ) VALUES (
        'E89F43A1-7023-4158-9A7B-4B6CD7E19F12',
        N'Tags',
        N'Searches records associated with matching tags in the knowledge graph. Computes relevance by multiplying tag match confidence with item-level tag weight.',
        N'TagSearchProvider',
        N'Active',
        3,
        1,
        NULL,
        NULL,
        NULL,
        N'Tags',
        N'fa-solid fa-tags',
        N'Built-in provider. Finds records tagged with terms matching the search query.'
    );
END
GO
