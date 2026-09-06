/*
  Saved query enrichment.

  `RunQuery` already accepts a runtime `Enrichment` directive — the enricher resolves off the
  ClassFactory, the GraphQL resolver marshals it, and the provider applies it. The capability is
  complete and unreachable: a caller has to know to pass one, so a report author cannot declare
  "this query should also return renewal risk" and an agent has no way to discover the option
  exists.

  This column lets a query CARRY its enrichment. The provider falls back to it when the caller
  supplies none; an explicit runtime directive still wins, so nothing existing changes behaviour.

  Stored as JSON matching `RunQueryEnrichment` — `{ "EnricherKey": "...", "Config": { ... } }` —
  rather than as typed columns, because the Config shape is owned by whichever enricher is named
  and MJCore deliberately knows nothing about it.

  PostgreSQL counterpart: deferred to the release build per migrations/CLAUDE.md (the build
  engineer converts the whole release's DDL in one pass).
*/

ALTER TABLE ${flyway:defaultSchema}.[Query]
    ADD [DefaultEnrichment] NVARCHAR(MAX) NULL;
GO

-- Reject anything that is not a JSON object up front. A malformed directive would otherwise be
-- discovered per-request, at which point the provider's own resilience swallows it and the query
-- silently returns un-enriched rows — the failure mode hardest to notice.
ALTER TABLE ${flyway:defaultSchema}.[Query]
    ADD CONSTRAINT [CK_Query_DefaultEnrichment_JSON]
    CHECK ([DefaultEnrichment] IS NULL OR ISJSON([DefaultEnrichment]) = 1);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Enrichment applied to this query''s results when the caller supplies none, as JSON matching RunQueryEnrichment: { "EnricherKey": "<ClassFactory key>", "Config": { ... } }. A runtime Enrichment argument takes precedence. Lets a saved query return model predictions as extra columns without the caller knowing an enricher exists.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Query',
    @level2type = N'COLUMN', @level2name = N'DefaultEnrichment';
GO
