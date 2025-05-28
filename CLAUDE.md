# MemberJunction Development Guide

## IMPORTANT
- Before starting a new line of work always check the local branch we're on and see if it is (a) separate from the default branch in the remote repo - we always want to work in local feature branches and (b) if we aren't in such a feature branch that is named for the work being requested and empty, cut a new one but ask first and then switch to it

## Build Commands
- Build all packages: `npm run build`
- Build specific packages: `turbo build --filter="@memberjunction/package-name"`
- **IMPORTANT**: When building individual packages for testing/compilation, always use `npm run build` in the specific package directory (NOT turbo from root)
- Watch mode: `npm run watch`
- Start API server: `npm run start:api`
- Start Explorer UI: `npm run start:explorer`

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