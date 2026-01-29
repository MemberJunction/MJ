# Implementation Plan: MCP Server OAuth - Hierarchical Scope Matching (Incremental)

**Branch**: `601-mcp-oauth` | **Date**: 2026-01-28 | **Spec**: [spec.md](./spec.md)
**Input**: Staged changes to spec.md adding hierarchical scope matching (FR-029a)

**Note**: This is an **incremental plan** based on staged changes to the feature spec. The core OAuth implementation is substantially complete.

## Summary

This incremental update adds **hierarchical scope matching** to the MCP Server OAuth implementation. When a user grants a parent scope (e.g., `entity`), tools should accept that as authorization for any child scope (e.g., `entity:read`, `entity:update`). This enables future sub-scopes to work automatically without re-issuing tokens.

## Staged Spec Changes Analysis

### New Q&A (Clarification)
- **Q**: How should scope hierarchy be evaluated?
- **A**: Store parent scope only in JWT, tools match by prefix. If user grants `entity`, JWT stores `entity`. Tools check if granted scopes include the required scope OR any parent prefix.

### Terminology Update
- Changed `entity:write` → `entity:update` for consistency throughout the spec

### New Functional Requirement (FR-029a)
Tools MUST implement hierarchical scope matching: a scope check for `entity:read` succeeds if the token contains `entity:read` OR `entity` (parent scope).

### Updated API Scope Definition
Added canonical base scopes table:

| Parent | Sub-scopes |
|--------|------------|
| `action` | `action:execute` |
| `agent` | `agent:execute` |
| `entity` | `entity:create`, `entity:delete`, `entity:read`, `entity:update` |
| `prompt` | `prompt:execute` |
| `query` | `query:run` |
| `view` | `view:run` |

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 18+
**Primary Dependencies**: `@memberjunction/server` (auth providers), `@modelcontextprotocol/sdk`, `express`, `jsonwebtoken`
**Storage**: In-memory for OAuth proxy state; SQL Server for APIScope entities
**Testing**: Manual integration testing with Claude Code
**Target Platform**: Node.js server (MCP Server)
**Project Type**: Monorepo package (packages/AI/MCPServer)

## Constitution Check

*All gates PASS - no violations*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Metadata-Driven | ✅ PASS | Scopes stored in database entity, no hardcoding |
| II. Type Safety | ✅ PASS | ScopeEvaluator interface properly typed |
| III. Actions as Boundaries | ✅ PASS | ScopeEvaluator is internal helper, not Action |
| IV. Functional Decomposition | ✅ PASS | Scope matching is single-purpose function |
| V. Angular NgModules | N/A | No Angular components in this change |
| VI. Entity Access Pattern | ✅ PASS | Scopes loaded via RunView with proper typing |
| VII. Query Optimization | ✅ PASS | Scopes loaded once at startup/consent |
| VIII. Batch Operations | ✅ PASS | All scopes loaded in single query |
| IX. Naming Conventions | ✅ PASS | PascalCase for public methods |
| X. CodeGen Workflow | ✅ PASS | No generated files modified |

## Artifacts Updated

### 1. data-model.md
**Changes**:
- Updated `ScopeEvaluator` interface with hierarchical matching documentation
- Added `hasParentScope()` method to interface
- Added detailed JSDoc explaining prefix matching behavior
- Added "Canonical Base Scopes" table with hierarchy definition

### 2. tasks.md
**Changes**:
- Updated T137 to include parent scopes and use `entity:update` instead of `entity:write`
- Added new tasks T079a-T079d for hierarchical scope implementation:
  - T079a: Implement prefix matching in ScopeEvaluator
  - T079b: Add hasParentScope() method
  - T079c: Add unit tests for hierarchical behavior
  - T079d: Update JSDoc documentation
- Updated Phase 6 status to "In Progress"
- Updated task counts (144 → 148 total, 19 → 23 remaining)

### 3. contracts/oauth-proxy-api.yaml
**Status**: No changes needed
- Hierarchical scope matching is tool-side behavior
- API contract (scope names as strings) unchanged

## New Tasks Summary

| Task ID | Description | Priority |
|---------|-------------|----------|
| T079a | Implement hierarchical prefix matching in ScopeEvaluator | P2 |
| T079b | Add hasParentScope() method | P2 |
| T079c | Add unit tests for hierarchical behavior | P2 |
| T079d | Update JSDoc documentation | P2 |

## Implementation Notes

### Hierarchical Matching Algorithm

```typescript
hasScope(requiredScope: string): boolean {
  // 1. Check exact match
  if (this.scopes.includes(requiredScope)) {
    return true;
  }

  // 2. Check parent scope match
  // e.g., 'entity:read' → check if 'entity' is granted
  const parts = requiredScope.split(':');
  if (parts.length > 1) {
    const parentScope = parts[0]; // 'entity' from 'entity:read'
    return this.scopes.includes(parentScope);
  }

  return false;
}
```

### Seed Data Update

The default scopes migration should include both parent and child scopes:

**Parent Scopes** (grant all children):
- `entity`, `action`, `agent`, `prompt`, `query`, `view`

**Child Scopes** (specific permissions):
- `entity:create`, `entity:delete`, `entity:read`, `entity:update`
- `action:execute`, `agent:execute`, `prompt:execute`
- `query:run`, `view:run`

## Execution Order

1. **T079a**: Implement prefix matching (blocking for other scope tasks)
2. **T079b-d**: Can run in parallel after T079a
3. **T137**: Update seed data migration (independent)

## Branch and Path Summary

- **Branch**: `601-mcp-oauth`
- **Plan Path**: `/specs/601-mcp-oauth/plan.md`
- **Generated Artifacts**:
  - Updated: `data-model.md` (ScopeEvaluator interface)
  - Updated: `tasks.md` (new tasks T079a-d, updated T137)
  - Unchanged: `contracts/oauth-proxy-api.yaml`
  - Unchanged: `research.md`, `quickstart.md`
