# SQL Caching Implementation in CodeGenLib

This document outlines the implementation of SQL query caching in the CodeGenLib package to improve performance during code generation runs.

## Key Queries Optimized

The following queries have been optimized with caching:

1. **Primary Key Index Name Query** in `sql_codegen.ts`
   - Retrieves primary key index information for entities
   - Cache TTL: 5 minutes (300,000ms)
   - Performance impact: Reduces repeated database calls when generating SQL for multiple entities

2. **Virtual Entity Query** in `manage-metadata.ts`
   - Retrieves all virtual entities from the database
   - Cache TTL: 5 minutes (300,000ms)
   - Performance impact: Improves performance during virtual entity processing

3. **Virtual Entity Fields Query** in `manage-metadata.ts`
   - Retrieves field definitions for virtual entities
   - Cache TTL: 5 minutes (300,000ms)
   - Performance impact: Reduces database load when generating code for virtual entities

## Caching Strategy

All of these queries use the `executeQueryWithCache` method from the `SQLUtilityBase` class with the following characteristics:

- **TTL (Time-to-Live)**: 5 minutes for schema metadata
- **Cache Key**: Based on the SQL query string and parameters
- **Cache Storage**: In-memory with the `CodeGenCache` class

## Benefits

1. **Reduced Database Load**: Fewer duplicate queries to the database during code generation
2. **Improved Performance**: Faster code generation, especially for operations that require the same metadata multiple times
3. **Selective Caching**: Only applied to read-only metadata queries that don't require real-time accuracy
4. **Cache Expiration**: TTL ensures data is eventually refreshed, preventing stale data issues

## Usage Considerations

The caching implementation ensures that:

1. Only schema metadata queries are cached, not data queries that need real-time accuracy
2. TTL is set appropriately to balance performance with data freshness
3. Cache keys are unique based on the query and parameters
4. Caching is opt-in for specific queries rather than automatically applied to all queries

## Additional Candidates for Caching

For future optimization, consider applying similar caching to:

1. Database relationship queries in entity relationship management
2. Table structure and constraint queries
3. Other schema metadata queries that don't change frequently during a code generation run