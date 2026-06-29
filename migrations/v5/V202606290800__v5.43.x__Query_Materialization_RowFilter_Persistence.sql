/* ============================================================================
   Query Materialization — Phase 2d: Row-Filter Persistence
   v5.43.x

   Companion plan: /plans/query-entity-materialization.md (design, section 6.4 / 9)

   Phase 1 materializes only unparameterized queries. Phase 2 classifies a query
   parameter as a "row filter" when varying its value only changes a literal at a
   clean top-level conjunctive WHERE predicate on a projected column. Such a query
   is materialized BROAD (all rows) and the filter is re-applied at read time.

   This migration adds the two columns that persistence requires:
     - RowFilterColumns : the output columns the row-filter parameters map to.
     - BroadSQL         : the broad source SELECT the refresh engine materializes
                          (the query with its row-filter predicates removed).

   Note (CodeGen handles automatically — intentionally omitted): __mj timestamp
   columns/triggers and FK indexes. EntityField metadata is regenerated from this
   schema by CodeGen.
   ============================================================================ */

ALTER TABLE ${flyway:defaultSchema}.MaterializedResult ADD
    RowFilterColumns NVARCHAR(MAX) NULL,
    BroadSQL         NVARCHAR(MAX) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of the output column names that the row-filter parameters map to. Populated when ParamMode is RowFilterBroad. The materialization holds all rows broad and these columns are filtered at read time (plan section 6.4). NULL for non-row-filter materializations.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MaterializedResult',
    @level2type = N'COLUMN', @level2name = N'RowFilterColumns';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a RowFilterBroad materialization, the broad source SELECT that the refresh engine materializes: the source query with its row-filter WHERE predicates removed, so the materialized table holds every row the query could return for any parameter value. NULL for non-parameterized materializations, which use the source query SQL directly.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MaterializedResult',
    @level2type = N'COLUMN', @level2name = N'BroadSQL';
