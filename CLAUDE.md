# GENERAL RULE
Don't say "You're absolutely right" each time I correct you. Mix it up, that's so boring!

# MemberJunction Development Guide

## 🚨 CRITICAL RULES - VIOLATIONS ARE UNACCEPTABLE 🚨

### 1. NO COMMITS WITHOUT EXPLICIT APPROVAL
- **NEVER run `git commit` without the user explicitly asking you to**
- **Each commit requires ONE-TIME explicit approval** - don't assume ongoing permission
- **NEVER ask to commit** - wait for the user to request it
- **ONLY commit what is staged** - never modify or add to staged changes
- **NEVER commit work-in-progress** that isn't staged by the user
 
### 2. NO `any` TYPES - EVER
- **NEVER use `any` types in TypeScript code**
- **ALWAYS ask the user** if you think you need to use `any`
- The user will provide a proper typing solution in most cases
- This includes:
  - No `as any` type assertions
  - No `: any` type annotations
  - No `<any>` generic type arguments
  - No `unknown` as a lazy alternative
- **Why**: MemberJunction has strong typing throughout - there's always a proper type available

### 3. NO MODIFICATIONS TO MERGED PRs
- **NEVER update title/description of merged PRs** without explicit approval each time
- Always ask before modifying any historical git data

### 4. NO STANDALONE COMPONENTS - EVER
- **NEVER create standalone Angular components** - ALL components MUST be part of NgModules
- **ALWAYS** use `@NgModule` with `declarations`, `imports`, and `exports`
- **Why**: Standalone components cause style encapsulation issues, ::ng-deep doesn't work properly, and they bypass Angular's module system
- When creating new components:
  - Create or add to an NgModule
  - Declare component in the module's `declarations` array
  - Import `CommonModule` and other required modules in the module's `imports` array
  - Export the component in the module's `exports` array if it needs to be used outside the module
- **Remove** `standalone: true` and `imports: [...]` from ALL `@Component` decorators
- This is **non-negotiable** - standalone components are strictly forbidden

### 5. NO RE-EXPORTS BETWEEN PACKAGES
- **NEVER re-export types, classes, or interfaces from other packages**
- **ALWAYS** import directly from the source package that defines them
- **Why**: Re-exports create confusing dependency chains, obscure the true source of types, and can cause issues with tree-shaking and bundle sizes
- Each package's `public-api.ts` or `index.ts` should only export:
  - Code defined within that package
  - Angular module, services, and components it provides
- Example:
  ```typescript
  // ❌ BAD - Re-exporting from another package
  export { ExportFormat, ExportOptions } from '@memberjunction/export-engine';

  // ✅ GOOD - Only export what this package defines
  export * from './lib/module';
  export * from './lib/export.service';
  export * from './lib/export-dialog.component';
  // NOTE: For export types, import directly from @memberjunction/export-engine
  ```
- Consumers should import types from their original source package
- Add comments directing users to the correct import location when helpful

---

**VERY IMPORTANT** We want you to be a high performance agent. Therefore whenever you need to spin up tasks - if they do not require interaction with the user and if they are not interdependent in an way, ALWAYS spin up multiple parallel tasks to work together for faster responses. **NEVER** process tasks sequentially if they are candidates for parallelization

## IMPORTANT
- Before starting a new line of work always check the local branch we're on and see if it is (a) separate from the default branch in the remote repo - we always want to work in local feature branches and (b) if we aren't in such a feature branch that is named for the work being requested and empty, cut a new one but ask first and then switch to it

## 🚨 CRITICAL: Git Branch Tracking Rules 🚨

### Feature Branches MUST Track Same-Named Remote Branches
When creating or working with feature branches, **ALWAYS** ensure the local branch tracks a remote branch **with the same name**. Never track `next`, `main`, or other permanent branches.

**Why this matters**: If a feature branch tracks `origin/next` instead of `origin/feature-branch`, pushes will accidentally go to `next` directly, bypassing PR review and potentially breaking the main branch.

### Creating New Feature Branches
```bash
# ✅ CORRECT - Create branch and push with upstream tracking to same-named remote
git checkout -b my-feature-branch
git push -u origin my-feature-branch

# ❌ WRONG - Branch created from next will track origin/next by default!
git checkout next
git checkout -b my-feature-branch
# Now my-feature-branch tracks origin/next - DANGEROUS!
```

### Verify Branch Tracking
**ALWAYS check tracking before pushing:**
```bash
# Check what remote branch your local branch tracks
git branch -vv

# Example output:
# * my-feature [origin/my-feature] Good - tracks same name  ✅
# * my-feature [origin/next] BAD - tracks next!            ❌
```

### Fix Incorrect Tracking
If a branch is tracking the wrong remote:
```bash
# Fix tracking to point to same-named remote branch
git branch --set-upstream-to=origin/my-feature-branch my-feature-branch

# Verify the fix
git branch -vv
```

### Before Every Push
1. Run `git branch -vv` to verify tracking
2. Ensure your branch tracks `origin/<same-branch-name>`
3. If tracking is wrong, fix it before pushing

### The Danger of Wrong Tracking
If `my-feature` tracks `origin/next`:
- `git push` sends commits directly to `next`
- Bypasses pull request review process
- Can break the main branch for everyone
- Requires reverts and cleanup to fix

**This is a non-negotiable safety requirement.**

## Build Commands
- Build all packages: `npm run build` - from repo root
- Build specific packages: `cd packagedirectory && npm run build`
- **IMPORTANT**: When building individual packages for testing/compilation, always use `npm run build` in the specific package directory (NOT turbo from root)
- Watch mode: `npm run watch`
- Start API server: `npm run start:api`
- Start Explorer UI: `npm run start:explorer`

## Database Migrations
- See `/migrations/CLAUDE.md` for comprehensive migration guidelines
- Key points:
  - Use format `VYYYYMMDDHHMM__v[VERSION].x_[DESCRIPTION].sql`
  - Always use hardcoded UUIDs (not NEWID())
  - Never insert __mj timestamp columns
  - Use `${flyway:defaultSchema}` placeholder

### 🚨 CRITICAL: CodeGen Handles These Automatically
**NEVER include the following in migration CREATE TABLE statements - CodeGen generates them:**

1. **Timestamp Columns**: Do NOT add `__mj_CreatedAt` or `__mj_UpdatedAt` columns
   - CodeGen automatically adds these with proper defaults and triggers
   - Including them manually will cause conflicts

2. **Foreign Key Indexes**: Do NOT create indexes for foreign key columns
   - CodeGen creates these with the naming pattern `IDX_AUTO_MJ_FKEY_<table>_<column>`
   - Manual FK indexes will duplicate CodeGen's work

**Example - What to include vs exclude:**
```sql
-- ✅ CORRECT - Only include business columns and constraints
CREATE TABLE ${flyway:defaultSchema}.DashboardPermission (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    DashboardID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    CanRead BIT NOT NULL DEFAULT 1,
    CanEdit BIT NOT NULL DEFAULT 0,
    SharedByUserID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_DashboardPermission PRIMARY KEY (ID),
    CONSTRAINT FK_DashboardPermission_Dashboard FOREIGN KEY (DashboardID) REFERENCES ${flyway:defaultSchema}.Dashboard(ID),
    CONSTRAINT FK_DashboardPermission_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.User(ID),
    CONSTRAINT UQ_DashboardPermission UNIQUE (DashboardID, UserID)
);

-- ❌ WRONG - Don't include these (CodeGen handles them)
-- __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
-- __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
-- CREATE INDEX IDX_DashboardPermission_DashboardID ON DashboardPermission(DashboardID);
-- CREATE INDEX IDX_DashboardPermission_UserID ON DashboardPermission(UserID);
```

## Entity Version Control
- MemberJunction includes built-in version control called "Record Changes" for all entities
- This feature tracks all changes to entity records unless explicitly disabled
- No need to implement custom versioning - it's handled automatically by the framework
- Access historical versions through the Record Changes entities

## Development Workflow
- **CRITICAL**: After making code changes, always compile the affected package by running `npm run build` in that package's directory to check for TypeScript errors
- Fix all compilation errors before proceeding with additional changes
- This ensures code quality and prevents runtime issues
- **Package-Specific Builds**: When building individual packages for testing/compilation, always use `npm run build` in the specific package directory (NOT turbo from root)
- **Tasks** whenever you need to spin up tasks - if they do not require interaction with the user and if they are not interdependent in an way, ALWAYS spin up multiple parallel tasks to work together for faster responses. **NEVER** process tasks sequentially if they are candidates for parallelization

## Actions Design Philosophy

### What Are Actions?
Actions are a **metadata-driven abstraction layer** for exposing functionality in workflow systems, agents, and low-code environments. They serve as a pluggable interface that allows non-technical users and AI systems to discover and invoke functionality through a consistent, declarative API.

### When to Use Actions (Code → Workflow)
Actions are designed for **integration points** where code needs to be exposed to:
- **AI Agents**: LLMs discovering and executing business logic
- **Workflow Engines**: Orchestration systems chaining operations
- **Low-Code Builders**: Visual designers assembling processes
- **External Systems**: API consumers needing standardized interfaces

Examples of appropriate Action usage:
- "Send Email" - Wraps email service for agent/workflow use
- "Create Invoice" - Business process exposed to orchestration
- "Get Web Page Content" - Utility function for AI agents
- "Validate Data" - Reusable validation step in workflows

### When NOT to Use Actions (Code → Code)
**NEVER use Actions for internal code-to-code communication.** This creates unnecessary abstraction layers and loses type safety.

Instead of calling Actions from within other Actions or code:
- **Use the underlying classes directly** (e.g., `AIPromptRunner`, `EmailService`)
- **Import and call functions/methods** with proper TypeScript types
- **Share code via packages** in the monorepo
- **Create base classes** for common functionality

#### Anti-Pattern Example
```typescript
// ❌ BAD - Action calling another Action
class SummarizeContentAction extends BaseAction {
    async generateSummary() {
        // Loses type safety, adds overhead, obscures logic
        const result = await this.executeAction("Execute AI Prompt", params, user);
    }
}
```

#### Correct Pattern
```typescript
// ✅ GOOD - Direct use of AI Prompts package
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';

class SummarizeContentAction extends BaseAction {
    async generateSummary() {
        const promptParams = new AIPromptParams();
        promptParams.prompt = this.getPrompt('Summarize Content');
        promptParams.data = { content, sourceUrl };

        const runner = new AIPromptRunner();
        const result = await runner.ExecutePrompt(promptParams);
        return result;
    }
}
```

### Benefits of Proper Separation
- **Type Safety**: TypeScript enforces contracts between code components
- **Performance**: No metadata lookup or serialization overhead
- **Clarity**: Code is explicit about dependencies and flow
- **Debugging**: Stack traces show actual execution path
- **Maintainability**: Refactoring tools work correctly with direct imports

### Action Best Practices
1. **Actions are Boundaries**: Use them at system edges, not internally
2. **Keep Actions Thin**: Minimal logic, delegate to service classes
3. **Direct Imports for Code**: Use packages and classes for internal calls
4. **Metadata for Discovery**: Actions expose capabilities, don't implement them
5. **Type Safety First**: Preserve TypeScript types throughout your code

See [packages/Actions/CLAUDE.md](packages/Actions/CLAUDE.md) for detailed implementation guidance.

## Debugging Build Failures

When packages fail to build during `npm install`, use this systematic debugging process:

### 1. Verify Dependencies Exist
```bash
npm ls @memberjunction/package-name
```

### 2. Check Turbo Detection
```bash
npx turbo build --dry-run --filter="@memberjunction/package-name"
```
This shows if Turbo can detect the package and its dependency graph.

### 3. Run Isolated Build with Verbose Logging
```bash
npx turbo build --log-order=stream --filter="@memberjunction/package-name"
```
This reveals the exact TypeScript compilation errors.

### 4. Check for Circular Dependencies
Look for packages that depend on each other:
- Package A imports from Package B
- Package B depends on Package A in package.json
- This creates a circular dependency that prevents building

### 5. Verify Build Order
- Turbo uses `"dependsOn": ["^build"]` in turbo.json
- Dependencies should build before dependents
- Check that all dependencies have `dist/` folders (indicating successful builds)

### Common Issues
- **Missing imports**: Package tries to import from unbuilt dependency
- **Circular dependencies**: Two packages depend on each other
- **Workspace detection**: Package not properly included in workspaces array
- **Build order**: Dependencies not built in correct sequence

**Note**: The `build.order.json` file is only used by legacy PowerShell scripts, not by Turbo builds.

## Lint & Format
- Check with ESLint: `npx eslint packages/path/to/file.ts`
- Format with Prettier: `npx prettier --write packages/path/to/file.ts`

## Code Style Guide
- Use TypeScript strict mode and explicit typing
- Always use MemberJunction generated `BaseEntity` sub-classes for all data work for strong typing
- Study the data model in /packages/MJCoreEntities to understand the schema and use properties/fields defined there
- No explicit `any` types - see CRITICAL RULES section above
- Prefer union types over enums for better package exports (e.g., `type Status = 'active' | 'inactive'` instead of `enum Status`)
- Prefer object shorthand syntax
- Follow existing naming conventions:
  - PascalCase for classes and interfaces
  - **PascalCase for public class members** (properties, methods, `@Input()`, `@Output()`)
  - **camelCase for private/protected class members**
  - camelCase for local variables and function parameters
  - Use descriptive names and avoid abbreviations
- Imports: group imports by type (external, internal, relative)
- Error handling: use try/catch blocks and provide meaningful error messages
- Document public APIs with TSDoc comments
- Follow single responsibility principle
- Keep functions focused and concise - avoid overly long functions
  - Functions should have a clear, single purpose
  - Break complex operations into smaller, well-named helper functions
  - Aim for functions that fit on a single screen when possible

### Class Member Naming Convention (IMPORTANT)

MemberJunction uses **PascalCase for all public class members** and **camelCase for private/protected members**. This applies to:

```typescript
// ✅ CORRECT - MemberJunction naming convention
export class MyComponent {
    // Public properties - PascalCase
    @Input() QueryId: string | null = null;
    @Input() AutoRun: boolean = false;
    @Output() EntityLinkClick = new EventEmitter<EntityLinkEvent>();

    public IsLoading: boolean = false;
    public SelectedRows: Record<string, unknown>[] = [];

    // Private/protected properties - camelCase
    private destroy$ = new Subject<void>();
    private _internalState: string = '';
    protected cdr: ChangeDetectorRef;

    // Public methods - PascalCase
    public LoadData(): void { }
    public OnGridReady(event: GridReadyEvent): void { }
    public GetSelectedRows(): Record<string, unknown>[] { }

    // Private/protected methods - camelCase
    private buildColumnDefs(): void { }
    protected applyVisualConfig(): void { }
}

// ❌ WRONG - Standard TypeScript convention (not used in MJ)
export class MyComponent {
    @Input() queryId: string | null = null;  // Should be PascalCase
    public isLoading: boolean = false;        // Should be PascalCase
    public loadData(): void { }               // Should be PascalCase
}
```

**Why this matters:**
- Consistency across the entire MemberJunction codebase
- Clear visual distinction between public API and internal implementation
- Matches the naming style used in MJ's generated entity classes
- HTML template bindings must match the PascalCase property names

## 🚨 IMPORTANT: FUNCTIONAL DECOMPOSITION IS MANDATORY 🚨

### Small, Focused Functions Are Required
- **NEVER** write long, monolithic functions that do multiple things
- **ALWAYS** decompose complex operations into smaller, well-named helper functions
- **MAXIMUM** function length should be ~30-40 lines (excluding comments)
- If a function is getting long, STOP and refactor it immediately

### Benefits We Expect
- **Readability**: Each function has a clear, single purpose
- **Testability**: Small functions are easier to unit test
- **Maintainability**: Bugs are easier to locate and fix
- **Reusability**: Small functions can be composed and reused
- **Debugging**: Stack traces are more meaningful with well-named functions

### Example of Good Decomposition
```typescript
// BAD: One long function doing everything
protected generateCascadeDeletes(entity: EntityInfo): string {
    // 200+ lines of nested loops and complex logic...
}

// GOOD: Decomposed into focused functions
protected generateCascadeDeletes(entity: EntityInfo): string {
    const operations = this.findRelatedEntities(entity);
    return operations.map(op => this.generateSingleOperation(op)).join('\n');
}

protected findRelatedEntities(entity: EntityInfo): Operation[] {
    // Just finds the related entities
}

protected generateSingleOperation(operation: Operation): string {
    // Handles one operation type
}
```

### When to Decompose
- Function exceeds 30-40 lines
- You need to write a comment explaining what a section does
- You have nested loops or conditions beyond 2 levels
- You're repeating similar logic patterns
- The function name would need "And" to be accurate

## Object-Oriented Design Principles

### Code Reuse and DRY (Don't Repeat Yourself)
- **ALWAYS** look for repeated code patterns and refactor them into base classes or shared utilities
- When you notice similar code in multiple places (e.g., parameter validation, error handling, common operations):
  - Create abstract base classes for shared functionality
  - Extract common methods into utility functions
  - Use inheritance and composition to reduce duplication
- Example patterns to watch for:
  - Multiple actions with similar parameter extraction logic → Create base action class
  - Repeated error handling code → Create shared error analysis methods
  - Common entity operations → Create entity helper utilities
- Benefits of proper OOD:
  - Easier maintenance (fix bugs in one place)
  - Better consistency across the codebase
  - Improved testability
  - Clearer separation of concerns

### When to Create Base Classes
- 3+ classes with similar structure/behavior
- Shared validation or processing logic
- Common error handling patterns
- Repeated boilerplate code
- Clear "is-a" relationships between classes

## Entity Metadata Best Practices (CRITICAL)

### Finding Entity Names
- **ALWAYS** use `/packages/MJCoreEntities/src/generated/entity_subclasses.ts` to find correct entity names
- Entity names are in the `@RegisterClass` decorator JSDoc comments
- Examples:
  - `AIPromptEntity` → `"AI Prompts"`
  - `AIAgentEntity` → `"AI Agents"`
  - `AIModelEntity` → `"AI Models"`
  - `AIPromptRunEntity` → `"MJ: AI Prompt Runs"` (newer entities use "MJ: " prefix)
  - `AIAgentRunEntity` → `"MJ: AI Agent Runs"`

### Using Metadata Class
- Create a single instance: `const md = new Metadata()`
- Use for entity object creation: `const entity = await md.GetEntityObject<EntityType>('Entity Name')`
- **NEVER** directly instantiate entity classes with `new EntityClass()`
- **NEVER** look up entity names at runtime - they are fixed in the schema

### 🚨 CRITICAL: Entity Naming Convention Warning

**ALWAYS** use the correct entity names with the "MJ: " prefix where required. To prevent naming collisions on client systems, all new core entities use the "MJ: " prefix, while older entities do not.

#### Core Entities with "MJ: " Prefix (MUST use full name):
- **AI Entities**: `MJ: AI Agent Prompts`, `MJ: AI Agent Run Steps`, `MJ: AI Agent Runs`, `MJ: AI Agent Types`, `MJ: AI Configuration Params`, `MJ: AI Configurations`, `MJ: AI Model Costs`, `MJ: AI Model Price Types`, `MJ: AI Model Price Unit Types`, `MJ: AI Model Vendors`, `MJ: AI Prompt Models`, `MJ: AI Prompt Runs`, `MJ: AI Vendor Type Definitions`, `MJ: AI Vendor Types`, `MJ: AI Vendors`
- **Artifact Entities**: `MJ: Artifact Types`, `MJ: Conversation Artifact Permissions`, `MJ: Conversation Artifact Versions`, `MJ: Conversation Artifacts`
- **Dashboard Entities**: `MJ: Dashboard User Preferences`, `MJ: Dashboard User States`
- **Report Entities**: `MJ: Report User States`, `MJ: Report Versions`

#### Common Mistakes to Avoid:
```typescript
// ❌ WRONG - Missing "MJ: " prefix
const agentRun = await md.GetEntityObject<AIAgentRunEntity>('AI Agent Runs', contextUser);
const agentPrompt = await md.GetEntityObject<AIAgentPromptEntity>('AI Agent Prompts', contextUser);

// ✅ CORRECT - Full entity name with "MJ: " prefix
const agentRun = await md.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs', contextUser);
const agentPrompt = await md.GetEntityObject<AIAgentPromptEntity>('MJ: AI Agent Prompts', contextUser);
```

**Always verify entity names** by checking `/packages/MJCoreEntities/src/generated/entity_subclasses.ts` or the `@RegisterClass` decorator JSDoc comments.

## Performance Best Practices

### Batch Database Operations
- Use `RunViews` (plural) instead of multiple `RunView` calls
- Group related queries together in a single batch operation
- Example: Load all dashboard data in 2-3 calls instead of 30+

### Client-Side Data Aggregation
- Load raw data once, aggregate in memory
- More efficient than multiple filtered queries
- Reduces database round trips significantly

### Observable Patterns
- Use shareReplay(1) for caching data streams
- Implement proper loading states with BehaviorSubject
- Ensure streams are reactive to parameter changes

### RunView ResultType and Fields Optimization

Understanding when to use `ResultType: 'entity_object'` vs `ResultType: 'simple'` is critical for performance:

#### When to Use `entity_object` (Full BaseEntity Objects)
- When you need to **mutate and save** the records
- When you need access to BaseEntity methods (`Save()`, `Delete()`, `Validate()`, etc.)
- When the records will be stored and used across multiple operations
- **DO NOT** use `Fields` parameter with `entity_object` - it is **automatically ignored**
  - `ProviderBase.PreRunView()` ([providerBase.ts:470-477](packages/MJCore/src/generic/providerBase.ts#L470-L477)) overrides `Fields` with ALL entity fields
  - This is by design: entity objects need all fields to be valid for mutation/validation

```typescript
// ✅ GOOD - Need to modify and save records
const rv = new RunView();
const result = await rv.RunView<UserEntity>({
    EntityName: 'Users',
    ExtraFilter: `Status='Active'`,
    ResultType: 'entity_object'  // Full BaseEntity objects for mutation
});
for (const user of result.Results) {
    user.LastLoginAt = new Date();
    await user.Save();  // Can save because it's a real entity object
}
```

#### When to Use `simple` (Plain JavaScript Objects)
- When you only need to **read/display** data (no mutation)
- When doing lookups or validation checks
- When the results are temporary and won't be stored
- **USE `Fields` parameter** to narrow the query scope and improve performance

```typescript
// ✅ GOOD - Read-only lookup, narrow field scope
const rv = new RunView();
const result = await rv.RunView<{ID: string; Name: string; Status: string}>({
    EntityName: 'MJ: AI Agent Runs',
    Fields: ['ID', 'Name', 'Status', 'ConversationID'],  // Only fields we need
    ExtraFilter: `Status='Running' AND UserID='${userId}'`,
    ResultType: 'simple'  // Plain objects, no BaseEntity overhead
});
// result.Results is plain objects, cannot call .Save()
```

#### Performance Impact
- **`entity_object`**: Creates full BaseEntity subclass instances with getters/setters, validation, dirty tracking
- **`simple`**: Returns plain JavaScript objects with just the data - much faster for read-only operations
- **`Fields` parameter**: Reduces data transfer by excluding large columns (JSON blobs, text fields)

#### Anti-Patterns
```typescript
// ❌ BAD - Using entity_object when only reading
const result = await rv.RunView<SomeEntity>({
    EntityName: 'Some Entity',
    ResultType: 'entity_object'  // Unnecessary overhead
});
const ids = result.Results.map(r => r.ID);  // Only needed IDs!

// ❌ BAD - Using Fields with entity_object (Fields IS IGNORED - ProviderBase overrides it)
const result = await rv.RunView<SomeEntity>({
    EntityName: 'Some Entity',
    Fields: ['ID', 'Name'],  // IGNORED! ProviderBase.PreRunView() overrides with ALL fields
    ResultType: 'entity_object'
});

// ✅ GOOD - Simple type for read-only with narrow fields
const result = await rv.RunView<{ID: string}>({
    EntityName: 'Some Entity',
    Fields: ['ID'],
    ResultType: 'simple'
});
const ids = result.Results.map(r => r.ID);
```

### Efficient Data Loading with RunViews

#### Batch Multiple Independent Queries
- **ALWAYS** use `RunViews` (plural) when loading multiple independent entities
- This dramatically reduces database round trips and improves performance
- Example - **DO THIS**:
  ```typescript
  const rv = new RunView();
  const [actions, categories, executions] = await rv.RunViews([
    {
      EntityName: 'Actions',
      ExtraFilter: '',
      OrderBy: 'UpdatedAt DESC',
      MaxRows: 1000,
      ResultType: 'entity_object'
    },
    {
      EntityName: 'Action Categories',
      ExtraFilter: '',
      OrderBy: 'Name',
      MaxRows: 1000,
      ResultType: 'entity_object'
    },
    {
      EntityName: 'Action Execution Logs',
      ExtraFilter: '',
      OrderBy: 'StartedAt DESC',
      MaxRows: 1000,
      ResultType: 'entity_object'
    }
  ]);
  ```
- **DON'T DO THIS** (inefficient):
  ```typescript
  // Multiple separate calls - AVOID!
  const [actions, categories, executions] = await Promise.all([
    new RunView().RunView({ EntityName: 'Actions', ... }),
    new RunView().RunView({ EntityName: 'Action Categories', ... }),
    new RunView().RunView({ EntityName: 'Action Execution Logs', ... })
  ]);
  ```

#### Use View Fields Instead of Lookups
- Most MJ views include denormalized fields from related entities
- Example: `AIPromptRunEntity` has both `ModelID` and `Model` (name) fields
- **DO THIS**: Use `run.Model` directly
- **DON'T DO THIS**: Look up model name with a separate query using `ModelID`

#### Avoid Per-Item Queries in Loops
- **NEVER** make RunView calls inside loops
- Load all data once, then process client-side
- Example - **DO THIS**:
  ```typescript
  // Load all data for time range once
  const [promptRuns, agentRuns] = await rv.RunViews([
    { EntityName: 'MJ: AI Prompt Runs', ExtraFilter: dateRangeFilter, ... },
    { EntityName: 'MJ: AI Agent Runs', ExtraFilter: dateRangeFilter, ... }
  ]);
  
  // Then aggregate into buckets client-side
  for (const bucket of timeBuckets) {
    const bucketData = allRuns.filter(run => isInBucket(run, bucket));
    // Process bucket data
  }
  ```
- **DON'T DO THIS**:
  ```typescript
  // Making queries per bucket - AVOID!
  for (const bucket of timeBuckets) {
    const data = await rv.RunView({ 
      ExtraFilter: `Date >= '${bucket.start}' AND Date < '${bucket.end}'` 
    });
  }
  ```

## Icon Libraries
- **Primary**: Font Awesome (already included) - Use for all icons throughout the application
- Font Awesome classes: `fa-solid`, `fa-regular`, `fa-light`, `fa-brands` etc.
- Use semantic icon names that clearly represent their function
- For model types in AI dashboard: use appropriate technology icons (fa-microchip, fa-robot, fa-brain, etc.)

## Monorepo Structure
- Packages organized under /packages directory by function
- Each package has its own tsconfig.json and package.json
- Use package.json and turbo.json for build dependencies

## NPM Workspace Management
- This is an NPM workspace monorepo
- **IMPORTANT**: To add dependencies to a specific package:
  - Define dependencies in the individual package's package.json
  - Run `npm install` at the repository root (NOT within the package directory)
  - Never run `npm install` inside individual package directories
  - The workspace manager will handle installing all dependencies across packages
- To update dependencies:
  - Edit the package.json file for the relevant package
  - Run `npm install` at the repo root
- When creating new packages:
  - Create the package structure with its own package.json
  - Add dependencies to the package.json
  - Run `npm install` at the repo root to update the workspace

## SQL Server Connection Pooling

MemberJunction supports configurable connection pooling for optimal database performance. Configure via `mj.config.cjs` at the repository root:

```javascript
module.exports = {
  databaseSettings: {
    connectionPool: {
      max: 50,              // Maximum connections (default: 50)
      min: 5,               // Minimum connections (default: 5) 
      idleTimeoutMillis: 30000,    // Idle timeout in ms (default: 30000)
      acquireTimeoutMillis: 30000  // Acquire timeout in ms (default: 30000)
    }
  }
};
```

### Recommended Settings:
- **Development**: max: 10, min: 2
- **Production Standard**: max: 50, min: 5 
- **Production High Load**: max: 100, min: 10

Monitor SQL Server wait types (RESOURCE_SEMAPHORE, THREADPOOL) to tune pool size. The pool is created once at server startup and reused throughout the application lifecycle.

## MJAPI Public URL Configuration

When MJAPI needs to communicate with remote services (like Skip API), it sends a callback URL so the remote service can make requests back to MJAPI. By default, this URL is constructed from `baseUrl`, `graphqlPort`, and `graphqlRootPath` (e.g., `http://localhost:4000/`).

For development scenarios where MJAPI is running locally but needs to communicate with remote services, you can configure a public URL that remote services can reach:

### Configuration Methods

#### 1. Environment Variable (Recommended for Development)
```bash
# Using ngrok
ngrok http 4000
# Output: Forwarding https://abc123.ngrok.io -> http://localhost:4000

# Set the environment variable (include the full path if graphqlRootPath is not '/')
export MJAPI_PUBLIC_URL=https://abc123.ngrok.io
# OR if graphqlRootPath is '/graphql'
export MJAPI_PUBLIC_URL=https://abc123.ngrok.io/graphql

# Start MJAPI
npm run start:api
```

#### 2. Configuration File
Add to your `mj.config.cjs` or `.mjrc` file:
```javascript
module.exports = {
  publicUrl: 'https://your-public-url.com',  // Include full path if needed
  // ... other configuration
};
```

### How It Works
- When `publicUrl` is configured, MJAPI will use it as the `callingServerURL` when communicating with remote services
- If `publicUrl` is not set, MJAPI constructs the URL as: `${baseUrl}:${graphqlPort}${graphqlRootPath}`
- The `publicUrl` should include the complete path including any root path (e.g., `/graphql` if that's your GraphQL endpoint)
- This ensures backward compatibility while enabling hybrid development scenarios

### Use Cases
- **Local Development with Remote Services**: Test local MJAPI changes against production Skip API
- **Webhook Testing**: Receive callbacks from remote services during development
- **Hybrid Deployments**: Mix local and cloud services during development/testing

## MetadataSync Package

### Validation System
The MetadataSync package includes a comprehensive validation system that runs automatically before push operations:

- **Smart Field Detection**: Recognizes virtual properties (getter/setter methods) on BaseEntity subclasses
- **Intelligent Required Field Checking**: Skips fields with defaults, computed fields, and virtual relationships
- **Reference Validation**: Validates @file, @lookup, @template, @parent, and @root references
- **Dependency Analysis**: Uses topological sorting to ensure correct processing order

### Key Commands
```bash
# Validate metadata
npx mj-sync validate --dir=./metadata

# Push with validation (default)
npx mj-sync push

# Skip validation (use with caution)
npx mj-sync push --no-validate

# Generate markdown report
npx mj-sync validate --save-report
```

### Virtual Properties in Validation
Some entities have virtual properties that manage complex relationships:
- `TemplateText` on Templates entity manages Template and TemplateContent records
- These properties exist as getters/setters on the entity class but not in database metadata
- The validation system automatically detects these by creating entity instances

## MemberJunction Entity and Data Access Patterns

### Entity Object Creation
**Never directly instantiate BaseEntity subclasses** - always use the Metadata system to ensure proper class registration and potential subclassing:

```typescript
// ❌ Wrong - bypasses MJ class system
const entity = new TemplateContentEntity();

// ✅ Correct - uses MJ metadata system
const md = new Metadata();
const entity = await md.GetEntityObject<TemplateContentEntity>('Template Contents');
```

### BaseEntity Spread Operator Limitation
**CRITICAL**: Never use the spread operator (`...`) directly on BaseEntity-derived classes. BaseEntity properties are implemented as getters/setters, not plain JavaScript properties, so they won't be captured by the spread operator.

```typescript
// ❌ Wrong - spread operator doesn't capture getter properties
const promptData = {
  ...promptEntity,  // This will NOT include ID, Name, etc.
  extraField: 'value'
};

// ✅ Correct - use GetAll() to get plain object with all properties
const promptData = {
  ...promptEntity.GetAll(),  // Returns { ID: '...', Name: '...', etc. }
  extraField: 'value'
};
```

**Why this matters:**
- BaseEntity uses getter/setter methods for all entity fields
- JavaScript spread operator only copies enumerable own properties
- Getters are not enumerable properties, so they're skipped
- `GetAll()` returns a plain object with all field values

### Server-Side Context User Requirements
When working on server-side code, **ALWAYS** pass `contextUser` to `GetEntityObject` and `RunView` methods:

```typescript
// ❌ Wrong - missing contextUser on server
const entity = await md.GetEntityObject<SomeEntity>('Entity Name');
const results = await rv.RunView({ EntityName: 'Entity Name' });

// ✅ Correct - includes contextUser for server-side operations
const entity = await md.GetEntityObject<SomeEntity>('Entity Name', contextUser);
const results = await rv.RunView({ EntityName: 'Entity Name' }, contextUser);
```

**Important:** 
- **Server-side code** serves multiple users concurrently and MUST include `contextUser` parameter
- **Client-side code** (Angular components) can omit `contextUser` as the context is already established
- This ensures proper data isolation, security, and audit tracking in multi-user environments

### Loading Multiple Records with RunView
For loading collections of records, use the RunView class with proper generic typing and ResultType parameter:

```typescript
// ✅ Optimal pattern for loading entity collections
const rv = new RunView();
const results = await rv.RunView<TemplateContentEntity>({
    EntityName: 'Template Contents',
    ExtraFilter: `TemplateID='${recordId}'`,
    OrderBy: 'Priority ASC, __mj_CreatedAt ASC',
    ResultType: 'entity_object'  // Returns actual entity objects, not raw data
});

// results.Results is now properly typed as TemplateContentEntity[]
const entities = results.Results; // No casting needed!
```

### RunView Error Handling
**Important**: RunView does NOT throw exceptions when it fails. Instead, it returns a result object with `Success` and `ErrorMessage` properties:

```typescript
const result = await rv.RunView<ActionParamEntity>({
    EntityName: 'Action Params',
    ExtraFilter: `ActionID='${actionId}'`,
    OrderBy: 'Name',
    ResultType: 'entity_object'
});

// ✅ Always check the Success property
if (result.Success) {
    const params = result.Results || [];
    console.log(`Loaded ${params.length} parameters`);
} else {
    console.error('Failed to load params:', result.ErrorMessage);
    // Handle the error appropriately
}

// ❌ Don't assume success - this won't catch failures
try {
    const result = await rv.RunView({...});
    // RunView won't throw, so this catch block won't be reached
} catch (error) {
    // This won't catch RunView failures!
}
```

### Key Benefits of This Pattern
- **Type Safety**: Generic method provides full TypeScript typing
- **Performance**: `ResultType: 'entity_object'` eliminates manual conversion loops
- **Class System Compliance**: Respects MJ's entity registration and potential subclassing
- **Clean Code**: No type casting or manual data loading required

### What to Avoid
```typescript
// ❌ Manual conversion approach (inefficient)
const results = await rv.RunView({...});
for (const result of results.Results) {
    const entity = await md.GetEntityObject<SomeEntity>('EntityName');
    entity.LoadFromData(result);
    entities.push(entity);
}

// ❌ Type casting approach (unnecessary with proper generics)
const entities = results.Results as SomeEntity[];

// ❌ Using any or unknown types
const results: any = await rv.RunView({...});
const data = results.Results as unknown as SomeEntity[];
```

## Type Safety Guidelines

### NEVER Use `any` or `unknown` Types
MemberJunction provides strong typing throughout the framework. Always use proper generic types instead of `any` or `unknown`:

```typescript
// ❌ Wrong - loses all type safety
const results: any = await rv.RunView({...});
const entity: any = await md.GetEntityObject('EntityName');

// ✅ Correct - full type safety with generics
const results = await rv.RunView<AIModelEntity>({
    EntityName: 'AI Models',
    ResultType: 'entity_object'
});
const entity = await md.GetEntityObject<AIModelEntity>('AI Models');
```

### Always Use Generics with Data Loading Methods
- `RunView<T>()` - for loading collections
- `GetEntityObject<T>()` - for creating new entity instances
- `Load<T>()` - for loading single records

This ensures TypeScript provides proper IntelliSense, compile-time checking, and prevents runtime errors.

## MemberJunction CodeGen System

MemberJunction includes a powerful code generation system that automatically creates TypeScript classes, SQL objects, and Angular UI components based on database schema and metadata. Understanding CodeGen is crucial for MJ development.

### What CodeGen Does

**CodeGen automatically generates and maintains:**

1. **Entity Classes** (`packages/MJCoreEntities/src/generated/entity_subclasses.ts`)
   - TypeScript classes for all database entities
   - Zod schema definitions with validation rules
   - Strongly-typed getters/setters for all fields
   - Foreign key relationships and computed fields
   - Value list enums from database constraints

2. **Database Objects** (`migrations/v2/CodeGen_Run_*.sql`)
   - Stored procedures (spCreate, spUpdate, spDelete) 
   - Database views with proper joins and computed fields
   - Foreign key indexes for performance
   - Database permissions and security grants
   - Entity field metadata synchronization

3. **Angular UI Components** (`packages/Angular/Explorer/core-entity-forms/src/lib/generated/`)
   - Complete CRUD forms for each entity
   - Form field components with proper types
   - Dropdown lists populated from foreign key relationships
   - Validation based on database constraints

### When CodeGen Runs

CodeGen runs automatically when:
- Database schema changes are detected (new tables, columns, constraints)
- Entity metadata is updated in the MJ metadata tables
- Field descriptions or validation rules change
- Foreign key relationships are added/modified

### CodeGen Triggers

Common actions that trigger CodeGen:
- Adding new columns with `ALTER TABLE` statements
- Adding CHECK constraints or foreign keys
- Updating `sp_addextendedproperty` descriptions
- Modifying value lists in EntityFieldValue table
- Adding new entities to the EntityField metadata

### Example: Adding New Fields

When you add fields like `PromptRole` and `PromptPosition`:

1. **Database Migration** creates the columns with constraints
2. **CodeGen Detects** the schema changes automatically  
3. **Generated Code** includes:
   ```typescript
   // In entity_subclasses.ts
   PromptRole: z.union([z.literal('System'), z.literal('User'), z.literal('Assistant'), z.literal('SystemOrUser')])
   
   // Getter/setter methods
   get PromptRole(): 'System' | 'User' | 'Assistant' | 'SystemOrUser'
   set PromptRole(value: 'System' | 'User' | 'Assistant' | 'SystemOrUser')
   ```
   
   ```sql
   -- In CodeGen migration file
   INSERT INTO EntityField (Name, Type, Description, ...)
   INSERT INTO EntityFieldValue (Value, Code, ...)  -- For dropdown options
   ```
   
   ```html
   <!-- In Angular form component -->
   <mj-form-field FieldName="PromptRole" Type="dropdownlist" />
   ```

### Key CodeGen Files

- **Entity Classes**: `packages/MJCoreEntities/src/generated/entity_subclasses.ts`
- **Server APIs**: `packages/MJServer/src/generated/generated.ts` 
- **Angular Forms**: `packages/Angular/Explorer/core-entity-forms/src/lib/generated/`
- **Migration SQL**: `migrations/v2/CodeGen_Run_YYYY-MM-DD_HH-MM-SS.sql`

## AI Model and Vendor Configuration

When adding new AI models and vendors:

### Model Setup Guidelines
- **Token Limits**: Use actual provider limits, not theoretical model capabilities
  - Verify MaxInputTokens and MaxOutputTokens with provider documentation
  - Example: Groq's implementation may differ from model's theoretical limits

### Vendor Relationships
- **Model Developer**: Company that created/trained the model
- **Inference Provider**: Service offering API access to run the model
- These are separate entities with different TypeIDs in AIVendorType

### Configuration Fields
- **Priority**: Lower number = higher priority (0 is highest)
- **SupportedResponseFormats**: Comma-delimited list (e.g., "Any", "Any, JSON")
- **DriverClass**: Follow naming convention (e.g., "OpenAILLM", "GroqLLM", not "APIService")
- **SupportsEffortLevel**: Set based on provider capabilities
- **SupportsStreaming**: Check provider documentation

### Working with CodeGen

**✅ Best Practices:**
- Never manually edit generated files (they'll be overwritten)
- Always run CodeGen after schema changes
- Review generated migration files before applying
- Use entity field descriptions for automatic documentation

**❌ Don't:**
- Modify files in `/generated/` directories
- Skip CodeGen after database changes  
- Assume TypeScript types are up-to-date without running CodeGen
- Manually create CRUD operations (let CodeGen handle it)

CodeGen ensures that your database schema, TypeScript types, and UI components stay perfectly synchronized, eliminating many common development errors and maintaining consistency across the entire stack.

## Angular Development Best Practices

> **See [packages/Angular/CLAUDE.md](packages/Angular/CLAUDE.md) for comprehensive Angular-specific guidelines** including component patterns, state management, and change detection strategies.

### Change Detection and ExpressionChangedAfterItHasBeenCheckedError
When encountering `ExpressionChangedAfterItHasBeenCheckedError` in Angular components:
- Add `ChangeDetectorRef` to the component constructor
- Use `cdr.detectChanges()` after programmatic changes that affect the view
- Replace `setTimeout` with `Promise.resolve().then()` for microtask timing
- Common scenarios: clearing inputs, focus management, dynamic content updates

### Kendo UI Component Usage
- **Deprecated Syntax**: Replace `<kendo-button>` with `<button kendoButton>`
- **Window/Dialog Positioning**: 
  - Use `kendoWindowContainer` directive on parent containers
  - For dynamic windows, inject `ViewContainerRef` in WindowService.open()
  - Set explicit `top` and `left` values for center positioning

### GraphQL Parameter Types
- **Numeric Types**: Pay attention to GraphQL scalar types
  - Use `Int` for integer parameters (topK, seed)
  - Use `Float` for decimal parameters (temperature, topP)
  - Match the GraphQL schema exactly to avoid type mismatch errors

### Null Checking Patterns
- Use `!= null` (not `!== null`) to check for both null and undefined
- This is especially important for optional parameters that could be either
- Example: `if (temperature != null)` handles both null and undefined

### Component Organization
- Group related components in dedicated directories
- Export shared components (like dialogs) for reuse
- Maintain clear separation between container and presentational components

### Dialog Button Placement
- **Confirm/Submit buttons go on the LEFT**, Cancel buttons on the RIGHT
- This is the opposite of Windows convention but matches MemberJunction's design system
- Example: `[Save] [Update] [Cancel]` or `[Submit] [Cancel]`
- Apply this to all dialogs, modals, and action button groups

### Input Properties - Use Getter/Setters
- **ALWAYS** use getter/setter pattern for `@Input()` properties that need reactive behavior
- **NEVER** rely solely on `ngOnChanges` - it's less precise and harder to debug
- Getter/setters provide exact control over when values change and enable immediate reactions
- Example:
  ```typescript
  // ✅ GOOD - Precise control with getter/setter
  private _myInput: string | null = null;

  @Input()
  set myInput(value: string | null) {
    const previousValue = this._myInput;
    this._myInput = value;
    if (value && value !== previousValue) {
      this.onMyInputChanged(value);
    }
  }
  get myInput(): string | null {
    return this._myInput;
  }

  // ❌ BAD - Direct property with ngOnChanges
  @Input() myInput: string | null = null;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['myInput']) {
      // Less precise, timing issues possible
    }
  }
  ```

### Loading Indicators
- **ALWAYS** use the `<mj-loading>` component from `@memberjunction/ng-shared-generic` for all loading states
- **NEVER** create custom spinners or loading indicators - use the standard MJ loading component
- Import `SharedGenericModule` in your module to access `mj-loading`
- Example usage:
  ```html
  <!-- Basic usage -->
  <mj-loading></mj-loading>

  <!-- With custom text -->
  <mj-loading text="Loading records..."></mj-loading>

  <!-- With size preset -->
  <mj-loading text="Please wait..." size="medium"></mj-loading>

  <!-- No text, just the animated logo -->
  <mj-loading [showText]="false"></mj-loading>
  ```
- Size presets: `'small'` (40x22px), `'medium'` (80x45px), `'large'` (120x67px), `'auto'` (fills container)
- The component displays the animated MJ logo with optional text below

### Creating Custom Entity Forms

MemberJunction uses `@RegisterClass` to allow custom forms to override generated forms. **To ensure your custom form takes priority, you MUST extend the generated form class** (not `BaseFormComponent` directly).

```typescript
// CORRECT: Extend the generated form to ensure priority
import { EntityFormComponent } from '../../generated/Entities/Entity/entity.form.component';

@RegisterClass(BaseFormComponent, 'Entities')
@Component({...})
export class EntityFormComponentExtended extends EntityFormComponent {
    // Custom implementation
}
```

**Why this works**: The `@RegisterClass` system uses registration order for priority. Since your custom form imports and extends the generated form, it creates a dependency that ensures it compiles AFTER the generated form, giving it higher priority.

**See [packages/Angular/CLAUDE.md](packages/Angular/CLAUDE.md)** for complete custom form documentation including:
- Full checklist for creating custom forms
- Module registration requirements
- Tree-shaking prevention patterns
- Examples of existing custom forms

## Metadata Files and mj-sync

### Metadata File Organization
The `/metadata/` directory contains declarative JSON files used by mj-sync to manage database records. Follow these conventions:

### File Format Preferences
- **Complex JSON values** (schemas, templates, etc.) should be stored in separate files and referenced using `@file:` syntax
- This improves readability and maintainability over escaped JSON strings
- Example:
  ```json
  // ❌ BAD - Escaped JSON in main file is hard to read
  {
    "fields": {
      "Name": "API Key",
      "FieldSchema": "{\"$schema\":\"http://json-schema.org/draft-07/schema#\",\"type\":\"object\",\"properties\":{\"apiKey\":{\"type\":\"string\"}}}"
    }
  }

  // ✅ GOOD - Reference external file
  {
    "fields": {
      "Name": "API Key",
      "FieldSchema": "@file:schemas/api-key.schema.json"
    }
  }
  ```

### Directory Structure for Schemas/Templates
When metadata records contain JSON blobs (schemas, templates, etc.):
1. Create a subdirectory named for the content type (e.g., `schemas/`, `templates/`)
2. Name files descriptively with appropriate extension (e.g., `api-key.schema.json`)
3. Use the `@file:relative/path.json` syntax in the main metadata file

### Application Metadata
When creating new applications with custom dashboards:
1. Create `.{app-name}-application.json` in `/metadata/applications/`
2. Set `DefaultForNewUser: false` unless it should appear for all users
3. Define `DefaultNavItems` array with:
   - `Label`: Display name for the nav item
   - `Icon`: Font Awesome icon class
   - `ResourceType`: Usually `"Custom"` for dashboard resources
   - `DriverClass`: Class name registered with `@RegisterClass(BaseResourceComponent, 'ClassName')`
   - `isDefault`: Set to `true` for the default tab (only one per app)
4. For new apps, omit `primaryKey` and `sync` sections - they're populated by mj-sync
5. Include `"relatedEntities": { "Application Entities": [] }` for the sync structure

### Resource Components for Custom Dashboards
Each nav item with `ResourceType: "Custom"` requires a corresponding component:
1. Create component extending `BaseResourceComponent`
2. Add `@RegisterClass(BaseResourceComponent, 'YourDriverClassName')` decorator
3. Add a tree-shaking prevention function: `export function LoadYourResource() {}`
4. Call the load function from the module's `public-api.ts`
5. Register the component in the module's declarations and exports

## Active Technologies
- TypeScript 5.x, Node.js 18+ + `@memberjunction/server` (auth providers), `express`, `jsonwebtoken`, `@modelcontextprotocol/sdk` (601-mcp-oauth)
- N/A (token validation only, no new persistent state) (601-mcp-oauth)
- TypeScript 5.x, Node.js 18+ + `@memberjunction/server` (auth providers), `@modelcontextprotocol/sdk`, `express`, `jsonwebtoken`, `jwks-rsa` (601-mcp-oauth)
- SQL Server (MemberJunction database) for `APIScope`, `APIKeyScope` entities; In-memory for OAuth proxy state (601-mcp-oauth)

## Recent Changes
- 601-mcp-oauth: Added TypeScript 5.x, Node.js 18+ + `@memberjunction/server` (auth providers), `express`, `jsonwebtoken`, `@modelcontextprotocol/sdk`
