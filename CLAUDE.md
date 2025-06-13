# MemberJunction Development Guide

## IMPORTANT
- Before starting a new line of work always check the local branch we're on and see if it is (a) separate from the default branch in the remote repo - we always want to work in local feature branches and (b) if we aren't in such a feature branch that is named for the work being requested and empty, cut a new one but ask first and then switch to it
- **NEVER commit changes without explicit user request** - Always stage changes and show what would be committed, but wait for user approval before running git commit

## Build Commands
- Build all packages: `npm run build`
- Build specific packages: `turbo build --filter="@memberjunction/package-name"`
- **IMPORTANT**: When building individual packages for testing/compilation, always use `npm run build` in the specific package directory (NOT turbo from root)
- Watch mode: `npm run watch`
- Start API server: `npm run start:api`
- Start Explorer UI: `npm run start:explorer`

## Database Migrations
- **CRITICAL**: Migration files must use the format `VYYYYMMDDHHMM__v[VERSION].x_[DESCRIPTION].sql`
- Always use `date +"%Y%m%d%H%M"` to get the current timestamp in 24-hour format
- Example: `V202506130552__v2.49.x_Add_AIAgent_Status_And_DriverClass_Columns.sql`
- This ensures Flyway executes migrations in the correct order

## Development Workflow
- **CRITICAL**: After making code changes, always compile the affected package by running `npm run build` in that package's directory to check for TypeScript errors
- Fix all compilation errors before proceeding with additional changes
- This ensures code quality and prevents runtime issues

## Lint & Format
- Check with ESLint: `npx eslint packages/path/to/file.ts`
- Format with Prettier: `npx prettier --write packages/path/to/file.ts`

## Code Style Guide
- Use TypeScript strict mode and explicit typing
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
```

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