# Optional Dynamic Imports in MJAPI

**Date**: 2026-01-14
**Status**: Planning
**Priority**: Medium
**Affected Packages**: `@memberjunction/global`, `@memberjunction/server-bootstrap`, `@memberjunction/server`, `MJAPI`

## Overview

Replace static commented-out imports in MJAPI with a configuration-driven dynamic import system. This allows optional packages (communication providers, custom logic, etc.) to be loaded via `mj.config.cjs` instead of requiring manual code changes.

## Problem Statement

Currently, optional imports are handled via commented-out static imports in `packages/MJAPI/src/index.ts`:

```typescript
// Optional: Import communication providers if needed
// import '@memberjunction/communication-sendgrid';
// import '@memberjunction/communication-teams';

// Optional: Import custom auth/user creation logic
// import './custom/customUserCreation';
```

This requires:
- Manual editing of TypeScript source files
- Recompilation when toggling features
- No initialization function support
- Poor discoverability of available options

## Proposed Solution

Add an `additionalImports` configuration array to `mj.config.cjs` with the following structure:

```javascript
const mjServerConfig = {
  additionalImports: [
    {
      name: "SendGrid Provider",
      package: "@memberjunction/communication-sendgrid"
    },
    {
      name: "Custom User Logic",
      package: "./custom/customUserCreation",
      initFunction: "initialize" // Optional
    }
  ]
};
```

### Configuration Schema

Each import configuration object:
- **`name`** (required, string): Friendly identifier for logging
- **`package`** (required, string): Package name or relative path
- **`initFunction`** (optional, string): Function name to execute after import

## Architecture Analysis

### Current State

**Entry Point**: `packages/MJAPI/src/index.ts`
```typescript
import { createMJServer } from '@memberjunction/server-bootstrap';
import 'mj_generatedentities';
import 'mj_generatedactions';

createMJServer({ resolverPaths }).catch(console.error);
```

**Bootstrap Logic**: `packages/ServerBootstrap/src/index.ts`
- Loads configuration via cosmiconfig
- Auto-discovers generated packages
- Builds resolver paths
- Starts server via `@memberjunction/server`

**Configuration**: `packages/MJAPI/mj.config.cjs`
- Loaded via cosmiconfig (searches for `mj.config.cjs`, `.mjrc`, etc.)
- Contains `codegenConfig`, `mjServerConfig`, `mcpServerConfig`, `a2aServerConfig`
- Merged into single config object

**Config Schema**: `packages/MJServer/src/config.ts`
- Defines `ConfigInfo` type with Zod validation
- Exported as `configInfoSchema`

## Implementation Plan

### Phase 1: Configuration Schema Definition

**File**: `packages/MJServer/src/config.ts`

Add Zod schemas for the new configuration:

```typescript
// Add after line 146, before configInfoSchema
const additionalImportSchema = z.object({
  name: z.string().describe('Friendly name/identifier for the import'),
  package: z.string().describe('Package name or relative path to import'),
  initFunction: z.string().optional().describe('Optional function name to execute after import')
});

const additionalImportsSchema = z.array(additionalImportSchema).optional().default([]);
```

Update `configInfoSchema` to include the new field:

```typescript
const configInfoSchema = z.object({
  // ... existing fields ...
  telemetry: telemetrySchema.optional().default({}),
  additionalImports: additionalImportsSchema, // ADD THIS
  apiKey: z.string().optional(),
  // ... rest of fields ...
});
```

Export new types:

```typescript
export type AdditionalImportConfig = z.infer<typeof additionalImportSchema>;
export type AdditionalImportsConfig = z.infer<typeof additionalImportsSchema>;
```

### Phase 2: Dynamic Import Loader Implementation in MJGlobal

**File**: `packages/MJGlobal/src/Global.ts`

Add dynamic import methods to the `MJGlobal` class with comprehensive validation, error handling, and logging:

```typescript
// Add these methods to the MJGlobal class

/**
 * Dynamically imports a single module/package and optionally executes an initialization function.
 *
 * @param config - Import configuration { name, package, initFunction? }
 * @returns Promise<ImportResult> with success status and module reference
 *
 * @example
 * const result = await MJGlobal.Instance.dynamicImport({
 *   name: "SendGrid Provider",
 *   package: "@memberjunction/communication-sendgrid",
 *   initFunction: "initialize"
 * });
 */
public async dynamicImport(config: MJ.DynamicImportConfig): Promise<MJ.ImportResult> {
  return this.loadSingleImport(config);
}

/**
 * Dynamically imports multiple modules/packages sequentially.
 *
 * @param configs - Array of import configurations
 * @returns Promise<ImportResult[]> with results for each import
 *
 * @example
 * const results = await MJGlobal.Instance.dynamicImports([
 *   { name: "SendGrid", package: "@memberjunction/communication-sendgrid" },
 *   { name: "Teams", package: "@memberjunction/communication-teams" }
 * ]);
 */
public async dynamicImports(configs: MJ.DynamicImportConfig[]): Promise<MJ.ImportResult[]> {
  if (!configs || configs.length === 0) {
    return [];
  }

  console.log(`\n📦 Loading ${configs.length} additional import(s)...\n`);

  const results: MJ.ImportResult[] = [];

  // Load imports sequentially to preserve order and make logs readable
  for (const config of configs) {
    const result = await this.loadSingleImport(config);
    results.push(result);
  }

  this.logImportSummary(results);

  return results;
}

/**
 * Validates import configurations before attempting to load them.
 *
 * @param imports - Array of import configurations to validate
 * @returns Validation result with success flag and error messages
 */
public validateImportConfigs(imports: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(imports)) {
    errors.push('additionalImports must be an array');
    return { valid: false, errors };
  }

  imports.forEach((imp, index) => {
    this.validateSingleImportConfig(imp, index, errors);
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

// Private helper methods

private async loadSingleImport(config: MJ.DynamicImportConfig): Promise<MJ.ImportResult> {
  const { name, package: packagePath, initFunction } = config;

  try {
    console.log(`  ⏳ Loading: ${name} (${packagePath})...`);

    // Dynamic import - works for both ESM and CJS
    const module = await import(packagePath);

    // Execute init function if specified
    if (initFunction) {
      await this.executeInitFunction(module, initFunction, packagePath);
    }

    console.log(`  ✓ Successfully loaded: ${name}`);
    return { name, success: true, module };

  } catch (error: any) {
    return this.handleImportError(name, packagePath, error);
  }
}

private async executeInitFunction(
  module: any,
  initFunction: string,
  packagePath: string
): Promise<void> {
  const initFn = module[initFunction];

  if (typeof initFn !== 'function') {
    throw new Error(
      `Init function '${initFunction}' not found or not a function in module '${packagePath}'. ` +
      `Available exports: ${Object.keys(module).join(', ')}`
    );
  }

  console.log(`    🔧 Executing init function: ${initFunction}()`);

  // Handle both sync and async init functions
  const result = initFn();
  if (result instanceof Promise) {
    await result;
  }
}

private handleImportError(
  name: string,
  packagePath: string,
  error: any
): MJ.ImportResult {
  const errorMessage = error.message || String(error);

  // Check if it's a module not found error
  if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
    console.warn(`  ⚠ Module not found: ${name} (${packagePath})`);
    console.warn(`    This may be expected if the package is optional and not installed.`);
  } else {
    console.error(`  ✗ Failed to load: ${name}`);
    console.error(`    Error: ${errorMessage}`);
    if (error.stack) {
      console.error(`    Stack: ${error.stack}`);
    }
  }

  return { name, success: false, error: errorMessage };
}

private logImportSummary(results: MJ.ImportResult[]): void {
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n📊 Import Summary: ${successful} successful, ${failed} failed\n`);
}

private validateSingleImportConfig(imp: any, index: number, errors: string[]): void {
  if (!imp.name || typeof imp.name !== 'string') {
    errors.push(`Import at index ${index}: 'name' is required and must be a string`);
  }

  if (!imp.package || typeof imp.package !== 'string') {
    errors.push(`Import at index ${index}: 'package' is required and must be a string`);
  }

  if (imp.initFunction && typeof imp.initFunction !== 'string') {
    errors.push(`Import at index ${index}: 'initFunction' must be a string if provided`);
  }
}
```

**File**: `packages/MJGlobal/src/interface.ts`

Add the interface definitions:

```typescript
/**
 * Configuration for dynamically importing a module/package
 */
export interface DynamicImportConfig {
  /** Friendly name/identifier for logging */
  name: string;
  /** Package name or relative path to import */
  package: string;
  /** Optional function name to execute after import */
  initFunction?: string;
}

/**
 * Result of a dynamic import operation
 */
export interface ImportResult {
  /** Name of the import from config */
  name: string;
  /** Whether the import succeeded */
  success: boolean;
  /** Error message if import failed */
  error?: string;
  /** The imported module (if successful) */
  module?: any;
}
```

### Phase 3: Integration into Server Bootstrap

**File**: `packages/ServerBootstrap/src/index.ts`

Add import at top of file (after line 15):

```typescript
import { MJGlobal } from '@memberjunction/global';
```

Add new step after `discoverAndLoadGeneratedPackages` (after line 147):

```typescript
  // Discover and load generated packages automatically
  console.log('Loading generated packages...');
  await discoverAndLoadGeneratedPackages(config);
  console.log('');

  // Load additional imports from configuration
  const additionalImports = config.config?.additionalImports;
  if (additionalImports && additionalImports.length > 0) {
    // Validate configurations before attempting imports
    const validation = MJGlobal.Instance.validateImportConfigs(additionalImports);

    if (!validation.valid) {
      console.error('❌ Invalid additionalImports configuration:');
      validation.errors.forEach(err => console.error(`   - ${err}`));
      throw new Error('Invalid additionalImports configuration. Please check mj.config.cjs');
    }

    // Load all configured dynamic imports
    await MJGlobal.Instance.dynamicImports(additionalImports);
  }

  // Build resolver paths - auto-discover standard locations if not provided
```

### Phase 4: Configuration File Updates

**File**: `packages/MJAPI/mj.config.cjs`

Add new section in `mjServerConfig` object (after line 368):

```javascript
/** @type {MJServerConfig} */
const mjServerConfig = {
  // ... existing config ...

  /**
   * Optional dynamic imports that will be loaded during server startup.
   * Each import can optionally execute an initialization function.
   *
   * @example
   * additionalImports: [
   *   {
   *     name: "SendGrid Email Provider",
   *     package: "@memberjunction/communication-sendgrid",
   *     // initFunction: "initializeSendGrid" // optional
   *   },
   *   {
   *     name: "Custom User Creation Logic",
   *     package: "./custom/customUserCreation",
   *     initFunction: "setupCustomUserHandling"
   *   }
   * ]
   */
  additionalImports: [
    // Uncomment and configure as needed:
    // {
    //   name: "SendGrid Email Provider",
    //   package: "@memberjunction/communication-sendgrid"
    // },
    // {
    //   name: "Microsoft Teams Provider",
    //   package: "@memberjunction/communication-teams"
    // },
    // {
    //   name: "Custom User Creation",
    //   package: "./custom/customUserCreation"
    // }
  ],

  authProviders: [
    // ... existing auth providers ...
```

### Phase 5: Documentation Updates

#### Update MJAPI README

**File**: `packages/MJAPI/README.md`

Add new section (around line 540):

```markdown
### Dynamic Imports Configuration

MJAPI supports optional dynamic imports configured via `mj.config.cjs`. This eliminates the need to manually uncomment import statements in `src/index.ts`.

#### Configuration

Add imports to the `additionalImports` array in your `mj.config.cjs`:

```javascript
const mjServerConfig = {
  additionalImports: [
    {
      name: "SendGrid Email Provider",
      package: "@memberjunction/communication-sendgrid"
    },
    {
      name: "Custom Initialization",
      package: "./custom/myCustomSetup",
      initFunction: "initialize" // Optional: function to call after import
    }
  ]
};
```

#### Import Execution Flow

1. **Discovery**: Server reads `additionalImports` from config during startup
2. **Validation**: Checks that all required fields are present
3. **Loading**: Dynamically imports each module sequentially
4. **Initialization**: If `initFunction` is specified, executes it after import
5. **Error Handling**: Continues even if optional imports fail (with warnings)

#### Use Cases

**Communication Providers**:
```javascript
{
  name: "SendGrid",
  package: "@memberjunction/communication-sendgrid"
}
```

**Custom Logic**:
```javascript
{
  name: "Custom User Creation",
  package: "./custom/customUserCreation",
  initFunction: "setupUserHandling"
}
```

**Third-Party Integrations**:
```javascript
{
  name: "Monitoring Service",
  package: "@mycompany/monitoring",
  initFunction: "initMonitoring"
}
```

#### Error Handling

- **Module Not Found**: Warning logged, server continues
- **Init Function Not Found**: Error logged, server stops
- **Init Function Throws**: Error logged, server stops
- **Invalid Config**: Validation error, server stops

#### Migration from Static Imports

**Before** (in `src/index.ts`):
```typescript
import '@memberjunction/communication-sendgrid';
import './custom/customUserCreation';
```

**After** (in `mj.config.cjs`):
```javascript
additionalImports: [
  { name: "SendGrid", package: "@memberjunction/communication-sendgrid" },
  { name: "Custom User", package: "./custom/customUserCreation" }
]
```
```

#### Update ServerBootstrap README

**File**: `packages/ServerBootstrap/README.md`

Add section documenting the dynamic import feature and its integration with `createMJServer`.

### Phase 6: Code Cleanup

**File**: `packages/MJAPI/src/index.ts`

Replace commented imports (lines 13-19) with deprecation notice:

```typescript
/**
 * DEPRECATED: Static imports are no longer needed
 *
 * Use the `additionalImports` configuration in mj.config.cjs instead.
 * See: packages/MJAPI/README.md#dynamic-imports-configuration
 *
 * Example configuration:
 * additionalImports: [
 *   { name: "SendGrid", package: "@memberjunction/communication-sendgrid" },
 *   { name: "Custom User Logic", package: "./custom/customUserCreation" }
 * ]
 */
```

## Key Design Decisions

### 1. Sequential vs Parallel Loading

**Decision**: Load imports **sequentially**

**Rationale**:
- Clearer console logs (no interleaved output)
- Predictable initialization order
- Easier debugging
- Performance impact negligible (typically 1-3 imports)

### 2. Error Handling Philosophy

**Decision**: Warn on missing modules, error on invalid config/init functions

**Rationale**:
- Missing optional packages shouldn't crash the server
- Invalid configuration indicates a mistake that should be fixed
- Failed init functions may leave system in inconsistent state

### 3. Init Function Signature

**Decision**: No parameters passed to init functions

**Rationale**:
- Keeps API simple
- Modules can access config via imports if needed
- Matches existing patterns in codebase

### 4. Validation Timing

**Decision**: Validate all configs before loading any imports

**Rationale**:
- Fail fast on configuration errors
- Don't partially execute if config is invalid
- Better developer experience

### 5. Import Path Resolution

**Decision**: Use native Node.js resolution

**Rationale**:
- Works with both npm packages and relative paths
- No custom resolution logic needed
- Supports all standard Node.js import patterns

## Implementation Checklist

### Core Implementation
- [ ] Add interface definitions to `MJGlobal/src/interface.ts`
- [ ] Add dynamic import methods to `MJGlobal/src/Global.ts`
- [ ] Add Zod schemas to `MJServer/src/config.ts`
- [ ] Update `ServerBootstrap/src/index.ts` to use MJGlobal methods
- [ ] Add `additionalImports` to `MJAPI/mj.config.cjs`

### Documentation
- [ ] Update `MJAPI/README.md` with dynamic imports section
- [ ] Update `ServerBootstrap/README.md` with feature docs
- [ ] Add JSDoc comments to all new functions
- [ ] Update TypeScript JSDoc `@import` comments if needed
- [ ] Update deprecation notice in `MJAPI/src/index.ts`

### Testing & Validation
- [ ] Test with empty array (no-op case)
- [ ] Test with valid NPM package import
- [ ] Test with relative path import
- [ ] Test with init function execution
- [ ] Test error handling (module not found)
- [ ] Test error handling (invalid init function)
- [ ] Test validation errors (missing fields)
- [ ] Test async init functions
- [ ] Verify console logging is clear and helpful

### Code Quality
- [ ] Follow functional decomposition guidelines (small functions)
- [ ] Use proper TypeScript types (no `any` types)
- [ ] Add comprehensive error messages
- [ ] Ensure proper async/await handling
- [ ] Add validation before execution

### Build & Compilation
- [ ] Compile MJGlobal package: `cd packages/MJGlobal && npm run build`
- [ ] Compile MJServer package: `cd packages/MJServer && npm run build`
- [ ] Compile ServerBootstrap package: `cd packages/ServerBootstrap && npm run build`
- [ ] Test MJAPI startup: `cd packages/MJAPI && npm run start`
- [ ] Fix any TypeScript errors
- [ ] Run linting: `npx eslint packages/MJGlobal/src/Global.ts packages/MJServer/src/config.ts`

## Testing Strategy

### Test Scenarios

1. **Empty Array**: No imports configured → No work done, no console output
2. **Valid NPM Package**: Import `@memberjunction/communication-sendgrid` → Success message
3. **Valid Relative Path**: Import `./custom/customUserCreation` → Success message
4. **With Init Function**: Import with valid `initFunction` → Function executes
5. **Invalid Init Function**: Import with non-existent function → Error logged, server stops
6. **Module Not Found**: Import non-existent package → Warning logged, server continues
7. **Invalid Config**: Missing `name` or `package` → Validation error, server stops
8. **Async Init Function**: Init function returns Promise → Properly awaited
9. **Init Function Throws**: Init function throws error → Caught and logged, server stops

### Manual Testing Steps

1. **Baseline Test**
   ```javascript
   additionalImports: []
   ```
   - Start MJAPI: `npm run start:api`
   - Verify no console output about additional imports
   - Verify server starts normally

2. **Communication Provider Test**
   ```javascript
   additionalImports: [
     { name: "SendGrid", package: "@memberjunction/communication-sendgrid" }
   ]
   ```
   - Start MJAPI
   - Verify success message in console
   - Verify server starts normally

3. **Custom Module with Init Function**
   - Create test file: `packages/MJAPI/src/custom/testInit.ts`
     ```typescript
     export function testInitialize() {
       console.log('✓ Test initialization function executed!');
     }
     ```
   - Configure:
     ```javascript
     additionalImports: [
       {
         name: "Test Init",
         package: "./custom/testInit",
         initFunction: "testInitialize"
       }
     ]
     ```
   - Verify init function executes

4. **Missing Module Test**
   ```javascript
   additionalImports: [
     { name: "Missing", package: "@does-not-exist/package" }
   ]
   ```
   - Verify warning (not error)
   - Verify server continues to start

5. **Invalid Init Function Test**
   ```javascript
   additionalImports: [
     {
       name: "Bad Init",
       package: "./custom/testInit",
       initFunction: "doesNotExist"
     }
   ]
   ```
   - Verify error message
   - Verify server stops with helpful error

6. **Validation Error Test**
   ```javascript
   additionalImports: [
     { name: "Missing Path" } // No package
   ]
   ```
   - Verify validation error before any imports attempted
   - Verify server stops immediately

## Security Considerations

### Arbitrary Code Execution
- **Risk**: Feature allows executing arbitrary code via imports
- **Mitigation**: Only loads from configuration file (not user input)
- **Note**: Config file is already trusted (runs in same security context as manual imports)

### Path Traversal
- **Risk**: Relative paths could potentially access sensitive files
- **Mitigation**: Standard Node.js import restrictions apply
- **Note**: No different from manual imports in index.ts

### Dependency Confusion
- **Risk**: Malicious packages could be installed
- **Mitigation**: Standard npm security practices (lock files, audits)
- **Note**: No different from regular dependencies

## Migration Path for Existing Projects

### Current Approach (Manual Editing)
```typescript
// packages/MJAPI/src/index.ts
// import '@memberjunction/communication-sendgrid';
// import './custom/customUserCreation';
```

### New Approach (Configuration-Driven)
```javascript
// packages/MJAPI/mj.config.cjs
const mjServerConfig = {
  additionalImports: [
    { name: "SendGrid", package: "@memberjunction/communication-sendgrid" },
    { name: "Custom User", package: "./custom/customUserCreation" }
  ]
};
```

### Benefits of Migration
- ✅ No code changes in TypeScript files
- ✅ No recompilation needed to toggle features
- ✅ Configuration-driven (easier to manage across environments)
- ✅ Better logging and error handling
- ✅ Supports initialization functions
- ✅ Validates before execution
- ✅ Self-documenting via config file

## Future Enhancements (Out of Scope)

1. **Conditional Imports**: Load based on environment variables
   ```javascript
   {
     name: "Dev Tools",
     package: "./dev-tools",
     condition: process.env.NODE_ENV === 'development'
   }
   ```

2. **Import Groups**: Define groups that can be enabled/disabled together
   ```javascript
   importGroups: {
     communication: ['sendgrid', 'teams', 'slack'],
     monitoring: ['datadog', 'sentry']
   },
   enabledGroups: ['communication']
   ```

3. **Retry Logic**: Retry failed imports with exponential backoff

4. **Hot Reload**: Watch config file and reload imports on change

5. **Import Order Dependencies**: Specify dependencies between imports
   ```javascript
   {
     name: "Feature B",
     package: "./feature-b",
     dependsOn: ["Feature A"]
   }
   ```

6. **Performance Metrics**: Track and report import loading times

## Success Criteria

### Implementation Complete When:
- ✅ All code files created and compiled without errors
- ✅ Configuration schema validates correctly
- ✅ All test scenarios pass
- ✅ Documentation updated in README files
- ✅ Deprecation notice added to index.ts
- ✅ Server starts successfully with empty array
- ✅ Server loads imports from config successfully

### Feature Working When:
- ✅ User can add imports via config file
- ✅ Server loads imports during startup
- ✅ Init functions execute when specified
- ✅ Errors are handled gracefully
- ✅ Console output is clear and helpful
- ✅ Validation prevents invalid configurations

## References

### Related Files
- MJGlobal class: [packages/MJGlobal/src/Global.ts](packages/MJGlobal/src/Global.ts)
- MJGlobal interfaces: [packages/MJGlobal/src/interface.ts](packages/MJGlobal/src/interface.ts)
- Configuration schema: [packages/MJServer/src/config.ts](packages/MJServer/src/config.ts)
- Server bootstrap: [packages/ServerBootstrap/src/index.ts](packages/ServerBootstrap/src/index.ts)
- MJAPI entry point: [packages/MJAPI/src/index.ts](packages/MJAPI/src/index.ts)
- Config file: [packages/MJAPI/mj.config.cjs](packages/MJAPI/mj.config.cjs)

### Documentation
- MemberJunction Developer Guide: [CLAUDE.md](CLAUDE.md)
- Server Bootstrap README: [packages/ServerBootstrap/README.md](packages/ServerBootstrap/README.md)
- MJAPI README: [packages/MJAPI/README.md](packages/MJAPI/README.md)

---

## Architecture Benefits

### Why MJGlobal?

Moving the dynamic import functionality to `MJGlobal` instead of `ServerBootstrap` provides several advantages:

1. **Reusability**: Any package can use `MJGlobal.Instance.dynamicImport()` or `dynamicImports()`, not just server bootstrap code
2. **Consistency**: Follows MJ pattern of global utilities in MJGlobal (ClassFactory, ObjectCache, etc.)
3. **Testability**: Easier to test in isolation via the singleton instance
4. **Flexibility**: Can be used in CLI tools, worker processes, or any Node.js context
5. **Discoverability**: Centralized location for all global utilities

### API Design

**Singular vs Plural Methods**:
- `dynamicImport(config)` - For loading a single module programmatically
- `dynamicImports(configs)` - For loading multiple modules (used by ServerBootstrap)

This pattern provides flexibility:
```typescript
// Load single module
await MJGlobal.Instance.dynamicImport({
  name: "SendGrid",
  package: "@memberjunction/communication-sendgrid"
});

// Load multiple modules
await MJGlobal.Instance.dynamicImports([
  { name: "SendGrid", package: "@memberjunction/communication-sendgrid" },
  { name: "Teams", package: "@memberjunction/communication-teams" }
]);
```

---

**Plan Status**: Ready for implementation
**Estimated Effort**: 4-6 hours
**Risk Level**: Low (backward compatible, well-isolated changes)
