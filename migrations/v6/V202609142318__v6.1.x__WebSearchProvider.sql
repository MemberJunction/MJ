-- =====================================================================================
-- Web Search Provider registry
--
-- Creates the metadata table behind @memberjunction/web-search-engine: one row per external
-- web search vendor, carrying the ClassFactory driver key, an admin on/off switch, ordering,
-- and an optional credential link.
--
-- Deliberately a near-mirror of __mj.SearchProvider so the two are learnable together. The
-- tables are separate because the engines are: SearchProvider feeds the internal search engine,
-- whose SearchResultItem requires EntityName and RecordID (the primary key of a source record).
-- A web result has a URL and neither of those.
--
-- Capability flags are NOT columns. Whether a driver can return a synthesized answer or honour
-- a domain filter is a property of the driver implementation, declared on the class — exactly
-- as SearchProvider declares SourceType. This table holds configuration only.
-- =====================================================================================

CREATE TABLE ${flyway:defaultSchema}.WebSearchProvider (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DriverClass NVARCHAR(500) NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    Priority INT NOT NULL DEFAULT 0,
    CredentialID UNIQUEIDENTIFIER NULL,
    ProviderConfig NVARCHAR(MAX) NULL,
    MaxResultsOverride INT NULL,
    AllowResultCaching BIT NOT NULL DEFAULT 0,
    DisplayName NVARCHAR(200) NULL,
    Icon NVARCHAR(200) NULL,
    Comments NVARCHAR(MAX) NULL,
    CONSTRAINT PK_WebSearchProvider PRIMARY KEY (ID),
    CONSTRAINT UQ_WebSearchProvider_Name UNIQUE (Name),
    CONSTRAINT FK_WebSearchProvider_Credential FOREIGN KEY (CredentialID)
        REFERENCES ${flyway:defaultSchema}.Credential(ID),
    CONSTRAINT CK_WebSearchProvider_Status CHECK (Status IN ('Pending', 'Active', 'Terminated')),
    CONSTRAINT CK_WebSearchProvider_Priority CHECK (Priority >= 0),
    CONSTRAINT CK_WebSearchProvider_MaxResultsOverride CHECK (MaxResultsOverride IS NULL OR MaxResultsOverride > 0)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Registry of external web search vendors available to @memberjunction/web-search-engine. Each row configures one driver: whether it is active, its position in the failover order, and where its credential lives. Provider capabilities (answer synthesis, domain filtering, freshness) are declared by the driver class, not stored here.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Administrator-facing name for this provider, e.g. "Brave" or "Tavily". Unique, and usable as the Provider value when a caller pins a search to one vendor.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What this provider searches, what it costs, and when it is the right choice.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ClassFactory key used with @RegisterClass(BaseWebSearchProvider, DriverClass) to instantiate the driver at runtime, e.g. "BraveWebSearchProvider". A value with no matching registration leaves the provider unavailable and is logged at engine startup.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'DriverClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provider lifecycle status: Pending (configured but not yet in use), Active (participates in searches), Terminated (disabled). Only Active providers are loaded. Matches the vocabulary used by SearchProvider.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Failover order: LOWER values are tried FIRST. The engine serves a search from the first available provider in this order, moving on only when one fails transiently. Must be >= 0.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Priority';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional FK to the Credential record holding this provider''s API key. When NULL the driver falls back to its documented environment variable, so a host that has not yet migrated its secrets into the Credential store keeps working.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'CredentialID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON blob of non-secret, driver-specific settings (endpoint overrides, tier flags, answer model). Schema is defined by each driver; invalid JSON is logged and ignored rather than disabling the provider.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'ProviderConfig';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional per-provider cap on results per request, for pay-per-query vendors. The effective cap is the smallest of the caller''s request, this value, and the vendor''s own hard limit. NULL means the driver''s own limit applies.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'MaxResultsOverride';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this vendor''s terms permit storing returned results. Defaults to 0 (deny), because caching rights differ sharply between vendors and violating them is silent: some sell storage rights as a plan tier, others forbid persistent caching outright. Nothing in the engine caches today; this column exists so the first caching layer reads a per-provider gate instead of inventing one.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'AllowResultCaching';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'UI display name shown in admin surfaces and result attribution. When NULL, falls back to the Name column.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'DisplayName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'CSS icon class for UI display, e.g. "fa-brands fa-brave". Supports any CSS-based icon library. When NULL a default icon is used.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Icon';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form administrator notes, e.g. contract terms, billing owner, or why this provider sits at its priority.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Comments';























































/**************************************************************************************************
 * GENERATED CODE APPENDED BELOW — DO NOT EDIT BY HAND
 *
 * Everything past this banner is the output of the MemberJunction CodeGen tool
 * (`mj codegen`) for the WebSearchProvider table created above. It contains:
 *
 *   - EntityField INSERT statements registering each column in __mj.EntityField
 *   - the vwWebSearchProviders view
 *   - spCreateWebSearchProvider / spUpdateWebSearchProvider / spDeleteWebSearchProvider
 *   - permission grants and extended properties CodeGen owns
 *
 * If the hand-written DDL above changes, DO NOT patch this section — re-run CodeGen and
 * replace the entire generated block.
 *
 * ------------------------------------------------------------------------------------------
 * !! THIS SECTION IS EMPTY IN THIS COMMIT AND MUST BE FILLED IN BEFORE MERGE !!
 *
 * It was authored in an environment with no database, so CodeGen could not be run. To
 * complete it, from a database at the current released version:
 *
 *     pnpm mj sync push --dir metadata     # metadata FIRST — remote ops generate from rows
 *     pnpm run mj:migrate                  # applies the DDL above
 *     pnpm mj codegen                      # emits CodeGen_Run_*.sql plus the entity/resolver/form tail
 *     # append the CodeGen_Run_*.sql contents below this banner, then delete that file
 *
 * Two things to verify afterwards, because both fail only on a FRESH database:
 *   1. `node .github/scripts/check-migration-entityfield-sequence.mjs` — the EntityField
 *      INSERTs must carry an apply-time MAX(Sequence)+1 expression, never a literal.
 *   2. `npm run check:codegen-tail` — the generated entity subclass, resolvers and Explorer
 *      form must be committed alongside this migration.
 *
 * The PostgreSQL counterpart is NOT authored here: conversion is build-engineer work at
 * release time (`mj migrate convert`), deliberately not a per-PR step.
 **************************************************************************************************/
