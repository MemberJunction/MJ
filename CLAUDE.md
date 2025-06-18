# MemberJunction Development Guide

**VERY IMPORTANT** We want you to be a high performance agent. Therefore whenever you need to spin up tasks - if they do not require interaction with the user and if they are not interdependent in an way, ALWAYS spin up multiple parallel tasks to work together for faster responses. **NEVER** process tasks sequentially if they are candidates for parallelization

## IMPORTANT
- Before starting a new line of work always check the local branch we're on and see if it is (a) separate from the default branch in the remote repo - we always want to work in local feature branches and (b) if we aren't in such a feature branch that is named for the work being requested and empty, cut a new one but ask first and then switch to it
- **NEVER commit changes without explicit user request** - Always stage changes and show what would be committed, but wait for user approval before running git commit

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

## Development Workflow
- **CRITICAL**: After making code changes, always compile the affected package by running `npm run build` in that package's directory to check for TypeScript errors
- Fix all compilation errors before proceeding with additional changes
- This ensures code quality and prevents runtime issues
- **Package-Specific Builds**: When building individual packages for testing/compilation, always use `npm run build` in the specific package directory (NOT turbo from root)
- **Tasks** whenever you need to spin up tasks - if they do not require interaction with the user and if they are not interdependent in an way, ALWAYS spin up multiple parallel tasks to work together for faster responses. **NEVER** process tasks sequentially if they are candidates for parallelization

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
- Always use MemberJunction generated `BaseEntity` sub-classes for all data work for strong typing, never use `any`
- Study the data model in /packages/MJCoreEntities to understand the schema and use properties/fields defined there
- No explicit `any` types (enforced by ESLint)
- Prefer object shorthand syntax
- Follow existing naming conventions:
  - PascalCase for classes and interfaces
  - camelCase for variables, functions, methods
  - Use descriptive names and avoid abbreviations
- Imports: group imports by type (external, internal, relative)
- Error handling: use try/catch blocks and provide meaningful error messages
- Document public APIs with TSDoc comments
- Follow single responsibility principle

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