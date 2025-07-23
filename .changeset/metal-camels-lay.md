---
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/ng-core-entity-forms": patch
---

feat: Add AI Agent Run cost calculation with high-performance templated
queries

- Add AIAgentRunCostService with intelligent caching and single-query
  performance optimization
- Implement CalculateAIAgentRunCost templated query using recursive CTE for
  hierarchical cost calculation
- Fix GraphQL scalar type error (JSON → JSONObject) in RunQuery operations
- Update AI Agent Run components to display consistent cost metrics in both
  top banner and analytics tab
- Fix analytics component data loading to use proper entity relationships
  via AI Agent Run Steps
- Add comprehensive metadata structure for AI queries with
  cross-environment schema compatibility
- Remove debugging console statements for clean production output

This enhancement provides accurate, performant cost tracking for AI Agent
Runs including all nested sub-agent hierarchies up to 20 levels deep,
replacing inefficient multiple database calls with a single optimized
query.
