# Angular 21 Module Cleanup Task

**Status**: Ready to Start
**Priority**: High
**Estimated Effort**: 2-4 hours minimum
**Created**: 2025-12-26

---

## Executive Summary

After completing Phase 5 (TypeScript 5.9.3 + Node.js v24.11.1), the MJ codebase has uncovered pre-existing Angular 21 module resolution issues that prevent MJExplorer from running cleanly. These are **NOT** Phase 5 issues but rather Angular 21 architectural problems that need separate investigation.

**Phase 5 Status**: ✅ **COMPLETE**
- TypeScript 5.9.3 compiles successfully
- Node.js v24.11.1 works perfectly
- MJAPI fully operational with 241 entities loaded
- All 68 Angular packages build successfully with `tsc`
- No DEP0180 deprecation warnings

**Angular 21 Status**: ⚠️ **NEEDS INVESTIGATION**
- ~100 NG6002 module resolution errors
- Cascading template errors (mj-form-field, mj-collapsible-panel, etc. unknown)
- Module exports not properly configured for Angular 21

---

## Problem Statement

### Root Cause: NG6002 Module Resolution Errors

When running `npm run start:explorer`, Angular 21 reports that multiple NgModule classes are not recognized:

```
Error: NG6002: 'RecordChangesModule' does not appear to be an NgModule class.
Error: NG6002: 'CodeEditorModule' does not appear to be an NgModule class.
Error: NG6002: 'MarkdownModule' does not appear to be an NgModule class.
Error: NG6002: 'JoinGridModule' does not appear to be an NgModule class.
Error: NG6002: 'QueryGridModule' does not appear to be an NgModule class.
Error: NG6002: 'ConversationsModule' does not appear to be an NgModule class.
Error: NG6002: 'DashboardsModule' does not appear to be an NgModule class.
Error: NG6002: 'BaseFormsModule' does not appear to be an NgModule class.
```

### Cascading Effect: Template Errors

Because these modules fail to load, their exported components become unavailable, causing hundreds of cascading template errors:

```
'mj-form-field' is not a known element (from BaseFormsModule)
'mj-collapsible-panel' is not a known element (from BaseFormsModule)
'mj-user-view-grid' is not a known element (from UserViewGridModule)
'mj-conversation' is not a known element (from ConversationsModule)
'mj-markdown' is not a known element (from MarkdownModule)
'mjCodeEditor' is not a known element (from CodeEditorModule)
```

**These template errors are symptoms, not the root problem.**

---

## Technical Background

### Angular 21 Module System

Angular 21 introduced changes to:
1. **Standalone components** - components can exist without NgModule
2. **Module exports** - stricter requirements on how modules expose components
3. **Ivy compilation** - more aggressive validation of module structure
4. **Public API surfaces** - tighter enforcement of `public-api.ts` exports

### MJ Codebase Context

MemberJunction's Angular packages follow a specific pattern:
- Each package has a `module.ts` file defining the NgModule
- Components are declared in `declarations` array
- Components are exported in `exports` array
- Public API is defined in `public-api.ts` (or `src/public-api.ts`)
- **Policy**: NO standalone components allowed (per CLAUDE.md)

### What Changed?

The Phase 5 upgrade to TypeScript 5.9.3 and Angular 21.0.6 exposed these issues because:
- Stricter type checking revealed module configuration problems
- Angular 21's Ivy compilation is more aggressive about validation
- Pre-existing module export issues are now fatal instead of warnings

---

## Investigation Plan

### Step 1: Verify Module Configurations (30 minutes)

For each failing module, check:

1. **Module Definition**
   ```typescript
   // Example: packages/Angular/Generic/record-changes/src/module.ts
   @NgModule({
     declarations: [ /* all components */ ],
     imports: [ /* dependencies */ ],
     exports: [ /* public components */ ]
   })
   export class RecordChangesModule { }
   ```

2. **Public API Export**
   ```typescript
   // Example: packages/Angular/Generic/record-changes/src/public-api.ts
   export * from './module';
   export * from './lib/component-name';
   ```

3. **Package Entry Point**
   ```json
   // Example: packages/Angular/Generic/record-changes/package.json
   {
     "exports": {
       ".": {
         "default": "./src/public-api.ts"
       }
     }
   }
   ```

**Files to Check**:
- [record-changes/src/module.ts](../packages/Angular/Generic/record-changes/src/module.ts)
- [code-editor/src/module.ts](../packages/Angular/Generic/code-editor/src/module.ts)
- [markdown/src/module.ts](../packages/Angular/Generic/markdown/src/module.ts)
- [join-grid/src/module.ts](../packages/Angular/Generic/join-grid/src/module.ts)
- [query-grid/src/module.ts](../packages/Angular/Generic/query-grid/src/module.ts)
- [conversations/src/module.ts](../packages/Angular/Generic/conversations/src/module.ts)
- [dashboards/src/module.ts](../packages/Angular/Explorer/dashboards/src/module.ts)
- [base-forms/src/module.ts](../packages/Angular/Explorer/base-forms/src/module.ts)

### Step 2: Check Standalone Component Migration (20 minutes)

Search for any `standalone: true` declarations that violate MJ policy:

```bash
grep -r "standalone: true" packages/Angular/
```

**Expected Result**: No matches (per CLAUDE.md prohibition)

If found, these must be converted back to module-based components:
1. Remove `standalone: true` from `@Component` decorator
2. Remove `imports: [...]` from component decorator
3. Add to parent module's `declarations` array
4. Import dependencies in parent module's `imports` array

### Step 3: Verify Build Outputs (15 minutes)

Check that each failing package has proper dist artifacts:

```bash
ls -la packages/Angular/Generic/record-changes/dist/
ls -la packages/Angular/Generic/code-editor/dist/
ls -la packages/Angular/Generic/markdown/dist/
ls -la packages/Angular/Generic/join-grid/dist/
ls -la packages/Angular/Generic/query-grid/dist/
ls -la packages/Angular/Generic/conversations/dist/
ls -la packages/Angular/Explorer/dashboards/dist/
ls -la packages/Angular/Explorer/base-forms/dist/
```

Each should contain:
- `index.d.ts` (or similar type definitions)
- `module.d.ts` with NgModule class definition
- Compiled `.js` files

### Step 4: Test Module Import Resolution (20 minutes)

Create a test file to verify Angular can resolve the modules:

```typescript
// test-module-resolution.ts
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { MarkdownModule } from '@memberjunction/ng-markdown';
import { JoinGridModule } from '@memberjunction/ng-join-grid';
import { QueryGridModule } from '@memberjunction/ng-query-grid';
import { ConversationsModule } from '@memberjunction/ng-conversations';
import { DashboardsModule } from '@memberjunction/ng-dashboards';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';

// Verify each is recognized as NgModule
console.log('Modules imported:', {
  RecordChangesModule,
  CodeEditorModule,
  MarkdownModule,
  JoinGridModule,
  QueryGridModule,
  ConversationsModule,
  DashboardsModule,
  BaseFormsModule
});
```

Run with `npx ts-node test-module-resolution.ts` to see if modules can be imported.

### Step 5: Review Angular 21 Migration Requirements (30 minutes)

Check Angular 21 migration guide for breaking changes:

1. **Module metadata changes**
   - Any new required decorators?
   - Changes to `@NgModule` decorator properties?

2. **Export requirements**
   - New constraints on what can be exported?
   - Changes to how components are exposed?

3. **Ivy compilation flags**
   - Any new compiler options needed?
   - Changes to `angularCompilerOptions` in tsconfig.json?

**Reference**: https://angular.io/guide/update-to-version-21

### Step 6: Check MJExplorer Module Imports (20 minutes)

Verify that [MJExplorer's app.module.ts](../packages/MJExplorer/src/app/app.module.ts) properly imports the failing modules:

```typescript
// Expected pattern:
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
// ... etc

@NgModule({
  imports: [
    RecordChangesModule,
    CodeEditorModule,
    // ... etc
  ]
})
export class AppModule { }
```

### Step 7: Check tsconfig Module Resolution (15 minutes)

Review [MJExplorer/tsconfig.json](../packages/MJExplorer/tsconfig.json) paths:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",  // ← May need to be "node"
    "paths": {
      "@memberjunction/ng-record-changes": [
        "../../packages/Angular/Generic/record-changes/src/public-api.ts"
      ],
      // ... etc
    }
  }
}
```

**Hypothesis**: `moduleResolution: "bundler"` may be incompatible with Angular 21's requirements.

**Test**: Try changing to `moduleResolution: "node"` and rebuilding.

---

## Reproduction Steps

To reproduce the errors:

```bash
# From repository root
cd /Users/rkihm/Documents/GitHub/rkihm-BC/MJ

# Start MJExplorer dev server
npm run start:explorer

# Observe error output
# Expected: ~100 NG6002 errors + cascading template errors
```

**Current Behavior**:
- NG6002 errors for 8+ modules
- Hundreds of "not a known element" template errors
- Dev server fails to compile

**Expected Behavior**:
- All modules recognized as NgModule classes
- No template errors
- Dev server compiles and serves application

---

## Success Criteria

1. ✅ No NG6002 module resolution errors
2. ✅ No cascading template errors about unknown elements
3. ✅ `npm run start:explorer` compiles successfully
4. ✅ MJExplorer application loads in browser
5. ✅ All Angular packages continue to build with `npm run build`
6. ✅ No regression to Phase 5 TypeScript 5.9.3 compatibility

---

## Known Constraints

1. **NO standalone components allowed** (per CLAUDE.md)
   - All components must be part of NgModule
   - Must use `declarations`, `imports`, `exports` arrays

2. **Preserve existing architecture**
   - Don't restructure package organization
   - Maintain current public API surfaces
   - Keep module boundaries as-is

3. **Maintain backwards compatibility**
   - Don't break existing form components
   - Keep MJExplorer functionality intact

---

## Related Files

### Configuration Files
- [packages/MJExplorer/tsconfig.json](../packages/MJExplorer/tsconfig.json) - TypeScript module resolution
- [packages/MJExplorer/tsconfig.app.json](../packages/MJExplorer/tsconfig.app.json) - App-specific config
- [packages/MJExplorer/angular.json](../packages/MJExplorer/angular.json) - Angular CLI config

### Module Definitions (Need Investigation)
- [packages/Angular/Generic/record-changes/src/module.ts](../packages/Angular/Generic/record-changes/src/module.ts)
- [packages/Angular/Generic/code-editor/src/module.ts](../packages/Angular/Generic/code-editor/src/module.ts)
- [packages/Angular/Generic/markdown/src/module.ts](../packages/Angular/Generic/markdown/src/module.ts)
- [packages/Angular/Generic/join-grid/src/module.ts](../packages/Angular/Generic/join-grid/src/module.ts)
- [packages/Angular/Generic/query-grid/src/module.ts](../packages/Angular/Generic/query-grid/src/module.ts)
- [packages/Angular/Generic/conversations/src/module.ts](../packages/Angular/Generic/conversations/src/module.ts)
- [packages/Angular/Explorer/dashboards/src/module.ts](../packages/Angular/Explorer/dashboards/src/module.ts)
- [packages/Angular/Explorer/base-forms/src/module.ts](../packages/Angular/Explorer/base-forms/src/module.ts)

### Public API Exports (Need Verification)
- [packages/Angular/Generic/record-changes/src/public-api.ts](../packages/Angular/Generic/record-changes/src/public-api.ts)
- [packages/Angular/Generic/code-editor/src/public-api.ts](../packages/Angular/Generic/code-editor/src/public-api.ts)
- [packages/Angular/Generic/markdown/src/public-api.ts](../packages/Angular/Generic/markdown/src/public-api.ts)
- [packages/Angular/Generic/join-grid/src/public-api.ts](../packages/Angular/Generic/join-grid/src/public-api.ts)
- [packages/Angular/Generic/query-grid/src/public-api.ts](../packages/Angular/Generic/query-grid/src/public-api.ts)
- [packages/Angular/Generic/conversations/src/public-api.ts](../packages/Angular/Generic/conversations/src/public-api.ts)
- [packages/Angular/Explorer/dashboards/src/public-api.ts](../packages/Angular/Explorer/dashboards/src/public-api.ts)
- [packages/Angular/Explorer/base-forms/src/public-api.ts](../packages/Angular/Explorer/base-forms/src/public-api.ts)

### Application Entry Point
- [packages/MJExplorer/src/app/app.module.ts](../packages/MJExplorer/src/app/app.module.ts) - Main application module

---

## Additional Context

### Phase 5 Completion Summary

Phase 5 successfully upgraded:
- ✅ TypeScript 4.9.5 → 5.9.3
- ✅ Node.js v20.12.2 → v24.11.1
- ✅ RxJS and supporting libraries
- ✅ Fixed ~70 override modifiers in custom code
- ✅ Fixed 9 index signature access errors
- ✅ Added null coalescing for backwards compatibility
- ✅ Suppressed DEP0180 warnings
- ✅ Created entities compatibility shims
- ✅ All 68 Angular packages build successfully

### What Phase 5 Did NOT Fix

Phase 5 properly excluded Angular 21 module issues because:
1. They are pre-existing architectural problems
2. They are not related to TypeScript 5.9.3 or Node.js v24.11.1
3. They require Angular-specific investigation
4. They are part of a partially-completed Angular migration

### Technical Debt Notes

From Phase 5, there is one minor technical debt item:
- **Temporarily disabled strict TypeScript settings** in MJExplorer/tsconfig.json
  - `noImplicitOverride: false` (should be `true`)
  - `noPropertyAccessFromIndexSignature: false` (should be `true`)
- These should be re-enabled after Angular 21 module cleanup is complete

---

## Risk Assessment

**Low Risk**:
- This is a configuration/export issue, not a code logic problem
- No entity logic or business rules are affected
- MJAPI (server) is completely unaffected
- All packages compile successfully with `tsc`

**Medium Risk**:
- May require changes to multiple package.json files
- Could affect how modules are consumed by other packages
- May need to update module import patterns across codebase

**High Risk** (unlikely):
- Major architectural restructuring required
- Incompatibility with Angular 21 requiring downgrade
- Breaking changes to public API surfaces

**Mitigation**:
- Start with least invasive changes (tsconfig, exports)
- Test each change incrementally
- Keep Phase 5 changes separate (already complete)
- Document all changes for easy rollback

---

## Questions to Answer

During investigation, address these questions:

1. **Module Resolution**:
   - Is `moduleResolution: "bundler"` compatible with Angular 21?
   - Should we switch to `moduleResolution: "node"`?

2. **Export Configuration**:
   - Are all failing modules properly exported from their public-api.ts?
   - Do package.json files have correct "exports" field?

3. **Angular 21 Requirements**:
   - Are there new decorator properties required for NgModule?
   - Are there compiler options we're missing?

4. **Standalone Components**:
   - Are there any standalone components in the codebase violating policy?
   - Were any components partially migrated to standalone?

5. **Build vs Runtime**:
   - Why do packages build successfully with `tsc` but fail with Angular CLI?
   - Is this an Ivy compilation issue?

---

## Timeline

**Estimated**: 2-4 hours
- Investigation: 1.5-2 hours
- Implementation: 0.5-1 hour
- Testing: 0.5-1 hour
- Documentation: 0.5 hour

**Dependencies**: None (Phase 5 complete)

**Blockers**: None known

---

## Next Steps

1. Read this document thoroughly
2. Follow Investigation Plan steps 1-7 sequentially
3. Document findings in a new section below
4. Implement fixes based on investigation results
5. Test that MJExplorer starts cleanly
6. Update this document with resolution details

---

## Resolution (To Be Updated)

_This section will be filled in once the investigation is complete and fixes are implemented._

### Root Cause Found
_TBD_

### Changes Made
_TBD_

### Verification Steps
_TBD_

### Lessons Learned
_TBD_

---

**Document Version**: 1.0
**Last Updated**: 2025-12-26
**Owner**: Development Team
**Status**: Ready for Investigation
