<!--
SYNC IMPACT REPORT
==================
Version Change: 1.0.0 → 1.1.0 (MINOR - new guidance added)
Modified Principles: N/A
Added Sections:
  - Task Progress Tracking (NON-NEGOTIABLE) under Development Workflow
Removed Sections: N/A
Templates Requiring Updates:
  - .specify/templates/tasks-template.md - Consider adding reminder about checkbox updates
Follow-up TODOs: None

Previous Version (1.0.0):
- Initial ratification with 10 Core Principles
-->

# MemberJunction Constitution

## Core Principles

### I. Metadata-Driven Development

MemberJunction is a metadata-driven platform where you describe schema once and CodeGen
generates entity classes, APIs, forms, and SQL automatically.

- Developers MUST define data structures in the database schema and metadata tables
- CodeGen MUST be run after any schema changes to regenerate TypeScript classes, GraphQL
  schemas, Angular forms, and SQL stored procedures
- Developers MUST NOT manually edit files in `/generated/` directories
- All entity field validations, relationships, and UI hints MUST be defined in metadata
- The metadata system serves as the single source of truth for data structure

**Rationale**: Centralizing definitions in metadata eliminates inconsistencies between
database, API, and UI layers while dramatically reducing development time.

### II. Type Safety (NON-NEGOTIABLE)

Never use `any` types—the framework provides proper types for everything.

- Developers MUST NOT use `any` type annotations, assertions, or generic arguments
- Developers MUST NOT use `unknown` as a lazy alternative to proper typing
- All RunView and GetEntityObject calls MUST use generic type parameters
- All function parameters and return types MUST be explicitly typed
- When type information seems unavailable, developers MUST consult the framework
  documentation or ask for guidance rather than defaulting to `any`

**Rationale**: MemberJunction's strong typing throughout the codebase enables compile-time
error detection, superior IDE support, and self-documenting code.

### III. Actions as Boundaries

Actions are boundaries for external consumers (AI agents, workflows) but internal code
MUST use direct imports to services and packages.

- Actions MUST only be used at system edges for AI agents, workflow engines, low-code
  builders, and external API consumers
- Internal code-to-code communication MUST use direct class imports and method calls
- Developers MUST NOT call Actions from within other Actions or internal services
- Actions MUST remain thin wrappers that delegate to service classes
- Service classes MUST be imported directly for all internal operations

**Rationale**: Direct imports preserve type safety, improve debugging with meaningful
stack traces, and avoid unnecessary metadata lookup overhead.

### IV. Functional Decomposition

Keep functions small (30-40 lines max) with single responsibility.

- Functions MUST NOT exceed 40 lines of code (excluding comments)
- Each function MUST have a single, clearly defined purpose
- Complex operations MUST be decomposed into smaller, well-named helper functions
- If a section requires a comment explaining what it does, it SHOULD be a separate function
- Nested loops or conditions beyond 2 levels MUST be refactored
- Function names MUST accurately describe behavior without requiring "and"

**Rationale**: Small, focused functions improve readability, testability, maintainability,
and enable meaningful debugging with clear stack traces.

### V. Angular NgModules (NON-NEGOTIABLE)

Angular components MUST use NgModules, never standalone.

- All components MUST be declared in NgModule `declarations` arrays
- Components MUST NOT use `standalone: true` in their `@Component` decorator
- Components MUST NOT use `imports: [...]` in their `@Component` decorator
- CommonModule and other dependencies MUST be imported in the module's `imports` array
- Components intended for external use MUST be exported in the module's `exports` array
- Every new component MUST be added to or create an NgModule

**Rationale**: Standalone components cause style encapsulation issues, prevent `::ng-deep`
from working properly, and bypass Angular's module system.

### VI. Entity Access Pattern

Always use `Metadata.GetEntityObject<T>()` and `RunView<T>()` with generics, never
instantiate entities directly.

- Developers MUST use `md.GetEntityObject<EntityType>('Entity Name')` to create entities
- Developers MUST NOT use `new EntityClass()` directly
- All RunView calls MUST include the generic type parameter for proper typing
- Server-side code MUST always pass `contextUser` to GetEntityObject and RunView
- Client-side code may omit `contextUser` as context is already established
- RunView results MUST be checked via `result.Success` property (it does not throw)

**Rationale**: The Metadata system ensures proper class registration, enables subclass
overrides, and maintains proper security context for multi-user environments.

### VII. Query Optimization

Use `entity_object` ResultType when mutating records, `simple` with Fields array for
read-only operations.

- When records need Save(), Delete(), or Validate(), use `ResultType: 'entity_object'`
- When records are read-only, use `ResultType: 'simple'` for better performance
- Read-only queries MUST specify a `Fields` array to minimize data transfer
- Developers MUST NOT use `Fields` with `entity_object` (it is automatically ignored)
- View denormalized fields SHOULD be used instead of separate lookup queries

**Rationale**: Entity objects carry significant overhead (getters/setters, dirty tracking,
validation). Simple objects are much faster for read-only operations.

### VIII. Batch Operations

Batch queries with `RunViews` (plural) instead of loops.

- Independent queries MUST be batched using `RunViews()` instead of multiple `RunView()` calls
- Per-item queries inside loops are PROHIBITED
- All necessary data MUST be loaded upfront, then processed client-side
- Related data lookups SHOULD use view denormalized fields when available
- Aggregation and filtering SHOULD be performed in memory after batch loading

**Rationale**: Batching reduces database round trips dramatically, improving performance
from O(n) queries to O(1) queries for common patterns.

### IX. Naming Conventions

PascalCase for public class members, camelCase for private.

- Public properties and methods MUST use PascalCase (e.g., `LoadData()`, `SelectedRows`)
- Private and protected members MUST use camelCase (e.g., `_internalState`, `buildColumnDefs()`)
- Angular `@Input()` and `@Output()` decorators MUST use PascalCase
- Local variables and function parameters MUST use camelCase
- Class names and interfaces MUST use PascalCase
- HTML template bindings MUST match the PascalCase property names

**Rationale**: Consistent naming provides clear visual distinction between public API
and internal implementation, matching MJ's generated entity classes.

### X. CodeGen Workflow

Never edit generated files—run CodeGen after schema changes. Database migrations use
CodeGen for views, stored procedures, and indexes automatically.

- Developers MUST NOT modify files in `/generated/` directories
- After any database schema change, developers MUST run CodeGen
- Migration files MUST NOT include `__mj_CreatedAt` or `__mj_UpdatedAt` columns
- Migration files MUST NOT include foreign key indexes (CodeGen creates these)
- CodeGen generates: entity classes, Zod schemas, stored procedures, views, and forms
- Generated migration SQL files follow pattern `CodeGen_Run_YYYY-MM-DD_HH-MM-SS.sql`

**Rationale**: CodeGen ensures perfect synchronization between database schema, TypeScript
types, and UI components, eliminating manual maintenance and inconsistencies.

## Technology Stack

MemberJunction requires the following technology stack:

- **Runtime**: Node.js 18+ (20+ recommended), npm 9+
- **Database**: SQL Server 2019+ or Azure SQL Database
- **Backend**: TypeScript strict mode, GraphQL API
- **Frontend**: Angular 18+ with NgModules, Kendo UI components
- **AI Integration**: 15+ supported providers (OpenAI, Anthropic, Google, etc.)
- **Build System**: Turbo monorepo with 100+ npm packages

Package dependencies MUST be added to individual package.json files, with `npm install`
run at the repository root (never within individual package directories).

## Development Workflow

### Before Starting Work

- Verify the current git branch is a feature branch (not `main` or `next`)
- Feature branches MUST track same-named remote branches, never permanent branches
- Run `git branch -vv` to verify tracking before any push

### During Development

- After making changes, compile affected packages with `npm run build` in the package directory
- Fix all TypeScript compilation errors before proceeding
- Use the Task tool for parallel work when tasks are independent
- Write small, focused commits that address single concerns

### Task Progress Tracking (NON-NEGOTIABLE)

- When working from a tasks.md file, task checkboxes MUST be updated immediately upon completion
- Each task MUST be marked `[x]` as soon as its implementation is finished, not in batch
- This ensures work can resume at the correct point after any interruption (context loss, session end)
- Before starting work, review tasks.md to identify completed vs remaining tasks
- If resuming interrupted work, verify task completion status matches actual code state

### Code Quality Gates

- All code MUST compile without TypeScript errors
- All public APIs MUST have explicit types (no implicit `any`)
- Functions exceeding 40 lines MUST be refactored before merge
- Generated files MUST NOT be committed with manual modifications

## Governance

### Amendment Process

1. Proposed changes MUST be documented with rationale
2. Amendments require explicit approval from project maintainers
3. Version number MUST be incremented according to semantic versioning:
   - MAJOR: Backward-incompatible principle changes or removals
   - MINOR: New principles added or existing principles expanded
   - PATCH: Clarifications, wording improvements, typo fixes

### Compliance

- All pull requests MUST verify compliance with these principles
- Code reviews MUST check for principle violations
- Complexity beyond these guidelines MUST be explicitly justified
- The CLAUDE.md file provides detailed runtime development guidance

### Hierarchy

This constitution establishes non-negotiable principles for MemberJunction development.
When conflicts arise:

1. This Constitution takes precedence
2. CLAUDE.md provides detailed implementation guidance
3. Package-specific READMEs provide context for individual packages

**Version**: 1.1.0 | **Ratified**: 2026-01-27 | **Last Amended**: 2026-01-27
