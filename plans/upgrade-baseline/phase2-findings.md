# Phase 2: Node.js & Core Dependencies - Findings

**Date**: December 20, 2025
**Status**: ⚠️ BLOCKED - Dependency Ordering Issue Discovered

## Issue Summary

Attempted to upgrade Node.js types and build tools in Phase 2, but discovered a **critical dependency chain** that blocks these upgrades until Angular 21 is installed.

```
Current State:
- @types/node: 20.14.2 (Node.js 20.x types)
- Angular: 18.0.2 (packages specify this)
- npm resolution: Angular 21.0.6 (actual installed version with --legacy-peer-deps)

Attempted Upgrade:
- @types/node: 24.10.4 (Node.js 24.x types)
- This requires newer Angular peer dependencies
- npm resolves to Angular 21.0.6 regardless of overrides

Problem:
- Angular 21 is incompatible with TypeScript 5.4.5
- Angular 21 requires TypeScript 5.9+
- Cannot upgrade TypeScript until Angular 21 is stable (Phase 3.5)
```

## Root Cause

### npm Dependency Resolution with --legacy-peer-deps

When using `--legacy-peer-deps` flag (required due to peer dependency conflicts):
1. All packages specify Angular 18.0.2 in package.json
2. Kendo UI packages allow Angular "15 - 18" range
3. npm ignores peer dependency specifications and resolves to highest available version
4. Angular 21.0.6 gets installed instead of 18.0.2

### npm overrides Don't Work

Added Angular version overrides to root package.json:
```json
"overrides": {
  "@types/node": "20.14.2",
  "typescript": "5.4.5",
  "@angular/animations": "18.0.2",
  "@angular/common": "18.0.2",
  "@angular/compiler": "18.0.2",
  ...
}
```

**Result**: Overrides are ignored when using `--legacy-peer-deps`

### Without --legacy-peer-deps

Attempting `npm install` without the flag:
```
error ERESOLVE unable to resolve dependency tree
error Could not resolve dependency:
error peer @angular/core@"18.2.14" from @angular/animations@18.2.14
error   vs required @angular/core@"18.0.2"
```

npm cannot resolve the peer dependency conflicts, making installation impossible.

## Attempted Upgrades

### Phase 2 Target Versions

| Package | Phase 1 | Phase 2 Target | Status |
|---------|---------|---------------|--------|
| @types/node | 20.14.2 | 24.10.4 | ❌ Blocked |
| ESLint | 8.56.0 | 9.39.2 | ❌ Blocked |
| @typescript-eslint/* | 7.12.0 | 8.50.0 | ❌ Blocked |
| Prettier | 3.3.1 | 3.7.4 | ⚠️ May work |
| Turbo | 2.3.3 | 2.7.1 | ⚠️ May work |
| typedoc | 0.25.12 | 0.28.15 | ❌ Blocked |
| typedoc-plugin-missing-exports | 2.2.0 | 4.1.2 | ✅ Compatible |

### Why Blocked

- **@types/node 24.x**: Requires Node.js 24.x API types, which may have different peer dependencies that pull Angular 21
- **ESLint 9.x**: Major version upgrade with potential peer dependency changes
- **@typescript-eslint 8.x**: Tied to ESLint 9.x and TypeScript version
- **typedoc 0.28.x**: May have changed peer dependencies

## Impact on Build

### Phase 1 Build Results (Baseline)
- **26 out of 32 tasks successful** (81%)
- Angular packages had pre-existing issues
- Core (non-Angular) packages: 100% success

### Phase 2 Build Attempt Results
- **105 out of 143 packages successful** (73.4%)
- New D3 type errors in ng-dashboards
- New @angular/common/http missing errors
- More widespread Angular compatibility issues

**Conclusion**: Phase 2 updates make the situation worse, not better.

## Dependency Chain Discovery

The upgrade process has a strict ordering requirement:

```
Phase 1: TypeScript 5.4.5 (consolidation) ✅ COMPLETE
   ↓
Phase 3: Angular 18 → 21 ⚠️ MUST BE NEXT
   ↓
Phase 2: Node.js types & build tools (requires Angular 21 peer deps)
   ↓
Phase 3.5: TypeScript 5.4.5 → 5.9.3 (requires Angular 21)
   ↓
Phase 4: Kendo UI 16 → 21 (requires Angular 21)
```

**Original Order** (INCORRECT):
1. Phase 1: TypeScript
2. **Phase 2: Node.js types** ← Blocked by Angular
3. Phase 3: Angular
4. Phase 4: Kendo

**Corrected Order** (CORRECT):
1. Phase 1: TypeScript ✅
2. **Phase 3: Angular** ← Must come next
3. **Phase 2: Node.js types** ← Can proceed after Angular 21
4. Phase 3.5: TypeScript 5.9.3
5. Phase 4: Kendo UI

## Recommendations

### 1. Skip Phase 2 for Now
- Revert Phase 2 changes to package.json
- Keep Phase 1 dependencies (@types/node 20.14.2, ESLint 8.56.0, etc.)
- Accept technical debt of older build tool versions temporarily

### 2. Proceed Directly to Phase 3
- Upgrade Angular 18.0.2 → 21.0.6 next
- This is the critical blocker for all subsequent phases
- Will resolve the npm dependency resolution issues

### 3. Revisit Phase 2 After Angular 21
- Once Angular 21 is stable, retry Phase 2 upgrades
- @types/node 24.10.4 should work with Angular 21
- ESLint 9.x and TypeScript ESLint 8.x should be compatible

### 4. Update Main Plan Document
- Reflect the corrected phase ordering
- Move Phase 2 to after Phase 3 in the timeline
- Add warning about dependency chain requirements

## Lessons Learned

### 1. Framework Upgrades Must Come First
Major framework upgrades (Angular, React, etc.) should always precede tooling upgrades, as frameworks have strict peer dependency requirements that cascade through the entire dependency tree.

### 2. npm --legacy-peer-deps Has Limitations
The `--legacy-peer-deps` flag bypasses peer dependency checking but doesn't respect version overrides, leading to unexpected version resolution.

### 3. Dependency Chains Require Analysis
Always analyze the full dependency chain before planning upgrade order. A package's peer dependencies can create hidden ordering requirements.

### 4. Test Incrementally
Each phase should be tested thoroughly before proceeding. We discovered the Angular 21 resolution issue that was present in Phase 1 only when attempting Phase 2.

## Technical Details

### Angular Version Check
```bash
$ npm ls @angular/common
`-- @angular/common@21.0.6 invalid: "18.0.2" from [143 packages]
```

All 143 packages specify Angular 18.0.2, but npm resolves to 21.0.6.

### Peer Dependency Conflict
```
Kendo UI: "15 - 18" (allows 15.x through 18.x)
npm resolution: 18.2.14 (latest in range)
with --legacy-peer-deps: 21.0.6 (ignores constraints entirely)
```

### TypeScript Compatibility Matrix
| Angular Version | Required TypeScript | Current TypeScript |
|----------------|-------------------|-------------------|
| 18.0.2 | >= 5.4.0 < 5.5.0 | 5.4.5 ✅ |
| 21.0.6 | >= 5.9.0 | 5.4.5 ❌ |

Cannot use Angular 21 until TypeScript is upgraded (Phase 3.5), but cannot upgrade TypeScript until Angular 21 is stable.

## Next Steps

1. ✅ Document Phase 2 findings (this document)
2. ✅ Revert Phase 2 changes to package.json
3. ⏳ Update main plan document with corrected phase ordering
4. ⏳ Commit Phase 2 findings
5. ⏳ Begin Phase 3: Angular 18 → 21 upgrade

---

**Phase 2 Status**: ⚠️ BLOCKED - Skip and proceed to Phase 3
**Blocker**: Angular version must be upgraded first
**Resolution**: Revisit Phase 2 after Phase 3 completion
