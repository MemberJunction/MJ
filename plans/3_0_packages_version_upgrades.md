# MemberJunction 3.0: Package Version Upgrade Plan

> **📋 STATUS UPDATE** (December 20, 2025):
> - **Phase 0**: ✅ COMPLETE - Baseline established
> - **Phase 1**: ✅ COMPLETE - TypeScript consolidated to 5.4.5 (81% build success)
> - **Phase 2**: ⚠️ BLOCKED - Dependency ordering issue discovered
> - **Phase 3**: ⏳ NEXT - Angular upgrade must come before Phase 2
>
> **Critical Dependencies Discovered**:
> 1. TypeScript 5.9.3 requires Angular 21+ (Phase 1 finding)
> 2. Node.js types & build tools require Angular 21 peer deps (Phase 2 finding)
> 3. npm with --legacy-peer-deps resolves Angular to 21.0.6 despite overrides
>
> **Corrected Phase Order**:
> - Phase 1: TypeScript Consolidation ✅
> - **Phase 3: Angular 18 → 21** ← Must come next
> - Phase 2: Node.js types & build tools (moved after Angular)
> - Phase 3.5: TypeScript 5.9.3 upgrade
> - Phase 4: Kendo UI 16 → 21
>
> **See**:
> - `plans/upgrade-baseline/phase1-findings.md` - TypeScript/Angular dependency
> - `plans/upgrade-baseline/phase1-complete.md` - Phase 1 results
> - `plans/upgrade-baseline/phase2-findings.md` - Phase 2 blocker analysis

## Executive Summary

This plan outlines the strategy for upgrading MemberJunction's core dependencies to their latest stable versions, including Node.js, Angular, Kendo UI, TypeScript, and other critical packages. The goal is to eliminate build warnings, improve performance, leverage new features, and ensure long-term support.

## Current State Analysis

### Runtime Environment
- **Node.js**: v24.11.1 (currently installed, but not pinned in project)
- **npm**: v11.6.2 (package manager specified as v10.5.0)
- **No .nvmrc file**: Project doesn't specify Node.js version

### Framework Versions (Current)
- **Angular**: 18.0.2
- **Kendo UI for Angular**: 16.2.0
- **TypeScript**: Mixed versions (5.0.2, 5.3.2, 5.3.3, 5.4.5, and one package at 4.9.5)
- **RxJS**: ~7.8.0
- **@types/node**: 20.14.2 (overridden at root)

### Issues Identified
1. **TypeScript Version Inconsistency**: 90+ packages with different TypeScript versions
2. **Angular is 3 major versions behind**: Current (18.0.2) � Latest (21.0.6)
3. **Kendo UI is 5 major versions behind**: Current (16.2.0) � Latest (21.3.0)
4. **Node.js version not pinned**: Can cause inconsistencies across development environments
5. **npm version mismatch**: Root specifies v10.5.0, but v11.6.2 is installed
6. **Deprecated package patterns**: Some packages may be using deprecated syntax

## Target Versions

### Core Runtime
- **Node.js**: v24.12.0 LTS ('Krypton')
  - Active LTS until April 2028
  - Latest stable release with long-term support
- **npm**: v11.6.2 (latest stable)

### Frameworks
- **Angular**: v21.0.6 (latest stable)
  - Released November 2025
  - Major features: Signal Forms, zoneless change detection, Vitest integration
- **Kendo UI for Angular**: v21.3.0 (latest stable)
  - Compatible with Angular 21
  - Latest component features and bug fixes
- **TypeScript**: v5.9.3 (latest stable 5.x)
  - ⚠️ **IMPORTANT**: Can only upgrade AFTER Angular 21
  - Angular 18 requires TypeScript 5.4.x
  - Angular 21 requires TypeScript 5.9+
  - See Phase 1 findings for details
- **RxJS**: v7.8.2 (latest stable)
  - RxJS 8 is still in alpha, not recommended for production
- **@types/node**: v24.12.0 (matching Node.js LTS)

### Build Tools
- **ESLint**: Latest v9.x
- **Prettier**: Latest v3.x
- **Turbo**: Latest v2.x (currently 2.3.3)
- **Sass**: Latest stable

## Upgrade Strategy

### Principles
1. **Incremental Approach**: Upgrade in phases to minimize risk
2. **Test at Each Stage**: Run full build and tests after each major upgrade
3. **Single Source of Truth**: Use syncpack to enforce consistent versions
4. **Breaking Change Review**: Document breaking changes and required code modifications
5. **Backwards Compatibility**: Ensure API changes don't break existing functionality

### Risk Mitigation
1. **Feature Branch**: Perform all work in dedicated `MJ_v3` branch
2. **Build Verification**: Compile all packages after each phase
3. **Test Coverage**: Run automated tests to catch regressions
4. **Rollback Plan**: Git tags and clear commit messages for easy reversion
5. **Documentation**: Track breaking changes and migration steps

## Phase-by-Phase Upgrade Plan

### Phase 0: Preparation & Baseline (Week 1)

**Goal**: Establish baseline and prepare environment

#### Tasks:
1. **Use existing Feature Branch, MJ_v3**
   

2. **Document Current Warnings**
   - Run `npm install` and capture all warnings
   - Run `npm run build` and capture all warnings
   - Create baseline report in `plans/upgrade-baseline-warnings.md`

3. **Pin Node.js Version**
   - Create `.nvmrc` file with `24.12.0`
   - Update CI/CD pipelines to use Node.js 24.12.0
   - Update documentation to specify Node.js version

4. **Update Root Package Manager**
   ```json
   "packageManager": "npm@11.6.2"
   ```

5. **Install Syncpack Tooling**
   - Already installed, but verify configuration
   - Create `.syncpackrc.json` with version strategies

6. **Audit Dependencies**
   ```bash
   npm run deps:check
   npm audit
   ```

**Success Criteria**:
- Documented baseline of all warnings
- Node.js version pinned
- Clean git state with all changes committed

---

### Phase 1: TypeScript Consolidation (Week 1-2) - REVISED

**Goal**: Consolidate TypeScript to v5.4.5 across all packages

**⚠️ CRITICAL DISCOVERY**: TypeScript 5.9.3 requires Angular 21+. Angular 18 only supports TypeScript 5.4.x. Therefore, Phase 1 focuses on **consolidation** to 5.4.5, not upgrade to 5.9.3. The TypeScript 5.9.3 upgrade will occur in Phase 3.5 after Angular 21 is installed.

**See**: `plans/upgrade-baseline/phase1-findings.md` for detailed analysis

#### Tasks:
1. **Update Syncpack Configuration**
   Add TypeScript pinning to `.syncpackrc`:
   ```json
   {
     "dependencies": ["typescript"],
     "dependencyTypes": ["dev"],
     "pinVersion": "^5.4.5"
   }
   ```

2. **Use Syncpack to Update All Packages**
   ```bash
   # Update TypeScript to 5.4.5 in all package.json files
   npx syncpack fix-mismatches --filter "typescript"
   ```

3. **Packages Requiring Updates**
   Will update ~100 packages with older/newer versions:
   - Packages on 4.9.x → ^5.4.5
   - Packages on 5.0.x-5.3.x → ^5.4.5
   - Packages on 5.6.x-5.9.x → ^5.4.5 (temporary downgrade)
   - Already on 5.4.5: No change needed (~415 packages)

4. **Install Dependencies**
   ```bash
   rm -rf node_modules package-lock.json
   npm install --legacy-peer-deps
   ```

5. **Build and Test**
   ```bash
   npm run build
   # All packages should compile with TypeScript 5.4.5
   ```

6. **Verify Consistency**
   ```bash
   npm run deps:check
   # Should show no TypeScript version mismatches
   ```

**Known Compatibility**:
- ✅ TypeScript 5.4.5 is compatible with Angular 18.0.2
- ✅ Most packages already use 5.4.5 (361+ packages)
- ✅ No breaking changes vs current majority version

**Success Criteria**:
- All packages use TypeScript ^5.4.5
- Clean build with no TypeScript errors
- All existing tests pass
- Ready for Angular 21 upgrade in Phase 3

---

### Phase 2: Node.js & Core Dependencies (Week 2)

**Goal**: Update Node.js types and core tooling

#### Tasks:
1. **Update @types/node**
   ```bash
   npm install @types/node@24.12.0 --save-dev
   ```

2. **Update Build Tools**
   - Update ESLint to v9.x
   - Update Prettier to latest v3.x
   - Update Turbo to latest v2.x
   - Update typedoc to latest stable

3. **Update Node.js-Specific Packages**
   - Update all packages that depend on Node.js APIs
   - Review deprecated Node.js APIs and update code

4. **Test Node.js Compatibility**
   - Run all scripts with Node.js 24.12.0
   - Test API server startup
   - Test build processes
   - Test CLI tools

5. **Update CI/CD Configuration**
   - Update GitHub Actions to use Node.js 24.12.0
   - Update any Docker images to Node.js 24.12.0
   - Update deployment documentation

**Success Criteria**:
- All Node.js types updated
- Clean build with Node.js 24.12.0
- All scripts and tools working
- CI/CD passing with new Node.js version

---

### Phase 3: Angular Core Upgrade (Week 3-4)

**Goal**: Upgrade Angular from 18.0.2 to 21.0.6

#### Tasks:
1. **Run Angular Update Tool (18 � 19)**
   ```bash
   cd packages/MJExplorer
   npx @angular/cli@19 update @angular/core@19 @angular/cli@19 --allow-dirty
   ```

2. **Review Breaking Changes (v18 � v19)**
   - Review Angular 19 changelog
   - Update deprecated APIs
   - Fix template syntax changes
   - Update route configurations if needed

3. **Build and Test Angular v19**
   ```bash
   npm run build:explorer
   npm run start:explorer
   ```

4. **Run Angular Update Tool (19 � 20)**
   ```bash
   cd packages/MJExplorer
   npx @angular/cli@20 update @angular/core@20 @angular/cli@20 --allow-dirty
   ```

5. **Review Breaking Changes (v19 � v20)**
   - Review Angular 20 changelog
   - Update deprecated APIs
   - Test change detection
   - Update zone.js configuration if needed

6. **Build and Test Angular v20**
   ```bash
   npm run build:explorer
   npm run start:explorer
   ```

7. **Run Angular Update Tool (20 � 21)**
   ```bash
   cd packages/MJExplorer
   npx @angular/cli@21 update @angular/core@21 @angular/cli@21 --allow-dirty
   ```

8. **Review Breaking Changes (v20 � v21)**
   - Review Angular 21 changelog
   - **Critical**: Update to zoneless change detection (now default)
   - Migrate to Signal Forms where appropriate
   - Consider Vitest migration (optional)
   - Update HttpClient usage (improvements in v21)

9. **Update All Angular Packages**
   Use syncpack to update all @angular/* packages to 21.0.6:
   ```bash
   npx syncpack set-semver-ranges --semver-range "21.0.6" --filter "@angular/*"
   ```

10. **Update Angular CDK**
    ```bash
    npm install @angular/cdk@21.0.6
    ```

11. **Update All Angular Package Dependencies**
    - Update all packages in `packages/Angular/Explorer/*`
    - Update all packages in `packages/Angular/Generic/*`
    - Update all packages in `packages/AngularElements/*`

12. **Remove Standalone Component Flags**
    - Verify no `standalone: true` components exist (per CLAUDE.md)
    - Ensure all components are in NgModules

13. **Build All Angular Packages**
    ```bash
    npm run build
    ```

**Known Breaking Changes to Address**:
- **Zoneless by default**: Review change detection strategy
- **Signal Forms**: Consider migrating reactive forms
- **HttpClient improvements**: May need API adjustments
- **Removed legacy View Engine support**: Ensure using Ivy
- **Updated template syntax**: Review and update templates
- **Deprecated APIs removed**: Replace with modern alternatives

**Success Criteria**:
- All Angular packages at v21.0.6
- Explorer UI runs without errors
- All forms and components functional
- Change detection working correctly
- No console errors or warnings

---

### Phase 3.5: TypeScript Upgrade to 5.9.3 (Week 4) - NEW PHASE

**Goal**: Upgrade TypeScript from 5.4.5 to 5.9.3 (now that Angular 21 is installed)

**Why This Phase Exists**: Angular 21 requires TypeScript >=5.9.0. This upgrade was deferred from Phase 1 due to the Angular 18 constraint (which only supported TypeScript 5.4.x).

#### Tasks:
1. **Update Syncpack Configuration**
   Update TypeScript pinning in `.syncpackrc`:
   ```json
   {
     "dependencies": ["typescript"],
     "dependencyTypes": ["dev"],
     "pinVersion": "^5.9.3"
   }
   ```

2. **Update Root TypeScript Override**
   Update `package.json`:
   ```json
   "overrides": {
     "@types/node": "24.12.0",
     "typescript": "5.9.3"
   }
   ```

3. **Use Syncpack to Update All Packages**
   ```bash
   npx syncpack fix-mismatches --filter "typescript"
   ```

4. **Install Dependencies**
   ```bash
   rm -rf node_modules package-lock.json
   npm install --legacy-peer-deps
   ```

5. **Build All Packages**
   ```bash
   npm run build
   ```

6. **Fix TypeScript 5.9 Compatibility Issues**
   - Review TypeScript 5.5-5.9 release notes for breaking changes
   - Fix any type errors introduced by stricter checks
   - Update tsconfig.json files if needed

**TypeScript 5.5-5.9 Breaking Changes to Watch For**:
- Stricter generic constraints
- Improved inference in conditional types
- Better enum checking
- Stricter property access
- Changes to decorator emit
- Improved type narrowing

**Success Criteria**:
- All packages use TypeScript ^5.9.3
- Clean build with no TypeScript errors
- All existing tests pass
- Angular 21 compiler accepts TypeScript 5.9.3
- No runtime errors

---

### Phase 4: Kendo UI Upgrade (Week 4-5)

**Goal**: Upgrade Kendo UI for Angular from 16.2.0 to 21.3.0

#### Pre-Upgrade Research:
1. **Review Kendo UI Changelog**
   - Changes from v16 � v17
   - Changes from v17 � v18
   - Changes from v18 � v19
   - Changes from v19 � v20
   - Changes from v20 � v21

2. **Identify Breaking Changes**
   - Component API changes
   - Deprecated syntax (e.g., `<kendo-button>` � `<button kendoButton>`)
   - Theme updates
   - Import path changes

#### Tasks:
1. **Update Kendo UI Packages**
   Update all @progress/kendo-angular-* packages:
   ```bash
   npx syncpack set-semver-ranges --semver-range "21.3.0" --filter "@progress/kendo-angular-*"
   npm install
   ```

2. **Update Kendo Themes**
   ```bash
   npm install @progress/kendo-theme-default@latest
   ```

3. **Update Component Syntax**
   - Replace `<kendo-button>` with `<button kendoButton>`
   - Update Window/Dialog positioning with `kendoWindowContainer`
   - Review Grid configurations for API changes
   - Update DropDown component syntax
   - Review Chart component changes

4. **Update Kendo Styles**
   - Review theme variable changes
   - Update custom SCSS if using Kendo variables
   - Test component styling

5. **Test Each Kendo Component**
   - Grids (entity grids, user view grids, query grids)
   - Forms (dropdowns, inputs, date pickers)
   - Dialogs and Windows
   - Charts and visualizations
   - Buttons and toolbars
   - Tree views and layouts

6. **Fix ViewContainerRef Issues**
   - Update WindowService.open() calls to inject ViewContainerRef
   - Fix dialog positioning issues

7. **Build All Angular Packages**
   ```bash
   npm run build:explorer
   ```

8. **Manual UI Testing**
   - Test all major Explorer features
   - Test form inputs and validation
   - Test grid sorting, filtering, grouping
   - Test dialogs and popups
   - Test charts and dashboards

**Known Breaking Changes to Address**:
- Component directive syntax changes
- Window positioning API changes
- Grid API updates
- Theme structure changes
- Import path modifications

**Success Criteria**:
- All Kendo packages at v21.3.0
- No deprecated syntax warnings
- All UI components rendering correctly
- Grids, forms, and dialogs fully functional
- Charts and visualizations working

---

### Phase 5: RxJS & Other Dependencies (Week 5)

**Goal**: Update RxJS and other supporting dependencies

#### Tasks:
1. **Update RxJS to Latest 7.x**
   ```bash
   npx syncpack set-semver-ranges --semver-range "^7.8.2" --filter "rxjs"
   npm install
   ```

2. **Review RxJS Usage**
   - Check for deprecated operators
   - Update to latest best practices
   - Review subscription management
   - Update observable patterns

3. **Update Supporting Libraries**
   - Update tslib to latest
   - Update zone.js if needed
   - Update golden-layout if needed
   - Update other peer dependencies

4. **Update Dev Dependencies**
   - Update sass compiler
   - Update testing libraries
   - Update linting tools
   - Update documentation tools

5. **Run Dependency Audit**
   ```bash
   npm audit
   npm audit fix
   ```

6. **Clean Up Unused Dependencies**
   ```bash
   npm run deps:unused
   npm run deps:remove-unused
   ```

**Success Criteria**:
- RxJS at v7.8.2 across all packages
- No deprecated RxJS operators in use
- Clean npm audit report
- No unused dependencies

---

### Phase 6: Warning Elimination (Week 6)

**Goal**: Eliminate all npm install, build, and runtime warnings

#### Tasks:
1. **Capture Post-Upgrade Warnings**
   ```bash
   npm install 2>&1 | tee install-warnings.log
   npm run build 2>&1 | tee build-warnings.log
   ```

2. **Categorize Warnings**
   - Peer dependency warnings
   - Deprecation warnings
   - TypeScript compilation warnings
   - Angular template warnings
   - Unused variable warnings

3. **Fix Peer Dependency Warnings**
   - Review and update peerDependencies in package.json files
   - Add missing peer dependencies
   - Update version ranges to match installed versions

4. **Fix Deprecation Warnings**
   - Replace deprecated APIs
   - Update deprecated syntax
   - Remove deprecated packages

5. **Fix TypeScript Warnings**
   - Fix implicit any types
   - Fix strict null checks
   - Fix unused variables and imports
   - Fix type assertions

6. **Fix Angular Template Warnings**
   - Fix template type checking issues
   - Update deprecated template syntax
   - Fix binding issues

7. **Verify Clean Build**
   ```bash
   npm install  # Should have no warnings
   npm run build  # Should have no warnings
   npm run start:api  # Should start with no warnings
   npm run start:explorer  # Should start with no warnings
   ```

**Success Criteria**:
- Zero warnings during `npm install`
- Zero warnings during `npm run build`
- Zero warnings during runtime startup
- Clean console in browser

---

### Phase 7: Testing & Validation (Week 6-7)

**Goal**: Comprehensive testing of all functionality

#### Tasks:
1. **Automated Testing**
   ```bash
   # Run all test suites
   npm run test
   ```

2. **Build Verification**
   ```bash
   # Clean build from scratch
   rm -rf node_modules package-lock.json
   npm install
   npm run build
   ```

3. **API Testing**
   - Start MJAPI server
   - Test GraphQL endpoints
   - Test authentication flows
   - Test database operations
   - Test Actions execution

4. **Explorer UI Testing**
   - Start Explorer
   - Test all major features:
     - Entity grids and forms
     - Dashboards
     - User views
     - Record changes
     - File uploads
     - Notifications
     - Settings
   - Test on multiple browsers
   - Test responsive layouts

5. **Angular Elements Testing**
   - Test embedded components
   - Verify integration in demo app

6. **CLI Tools Testing**
   - Test MJ CLI commands
   - Test CodeGen
   - Test MetadataSync
   - Test AI CLI

7. **Performance Testing**
   - Measure build times (before/after)
   - Measure bundle sizes (before/after)
   - Measure runtime performance
   - Identify any regressions

8. **Cross-Platform Testing**
   - Test on macOS
   - Test on Windows (if applicable)
   - Test on Linux (if applicable)

**Success Criteria**:
- All automated tests passing
- All manual test scenarios passing
- No performance regressions
- No functional regressions
- All platforms working

---

### Phase 8: Documentation & Migration Guide (Week 7)

**Goal**: Document changes and create migration guide

#### Tasks:
1. **Update CHANGELOG.md**
   - Document all version changes
   - List breaking changes
   - List new features enabled by upgrades
   - List bug fixes

2. **Create Migration Guide**
   Create `docs/migration/v3.0-upgrade-guide.md`:
   - Prerequisites (Node.js version)
   - Step-by-step upgrade instructions
   - Breaking changes and fixes
   - Code migration examples
   - Troubleshooting guide

3. **Update Development Documentation**
   - Update README.md with new version requirements
   - Update CLAUDE.md if needed
   - Update package-specific documentation
   - Update CI/CD documentation

4. **Update Package Versions**
   ```bash
   npx changeset
   # Create changeset for v3.0.0 major version
   ```

5. **Create Release Notes**
   - Summarize all changes
   - Highlight new capabilities
   - Document migration path
   - Link to detailed documentation

**Success Criteria**:
- Complete CHANGELOG.md
- Comprehensive migration guide
- Updated documentation
- Release notes prepared

---

### Phase 9: Final Review & Merge (Week 8)

**Goal**: Code review, final testing, and merge to main branch

#### Tasks:
1. **Code Review**
   - Review all changes in feature branch
   - Ensure code quality standards met
   - Verify no `any` types introduced
   - Verify functional decomposition maintained

2. **Final Testing Round**
   - Fresh clone and build
   - Run all tests
   - Manual smoke testing
   - Performance validation

3. **Create Pull Request**
   - Comprehensive PR description
   - Link to migration guide
   - List all breaking changes
   - Request reviews from team

4. **Address Review Comments**
   - Fix any issues found
   - Update documentation as needed
   - Re-test affected areas

5. **Merge to Next Branch**
   ```bash
   git checkout next
   git merge MJ_v3
   git push origin next
   ```

6. **Tag Release**
   ```bash
   git tag v3.0.0
   git push origin v3.0.0
   ```

7. **Publish Packages**
   ```bash
   npm run version  # Apply changesets
   npm publish --workspaces  # Publish all packages
   ```

**Success Criteria**:
- Code review approved
- All tests passing in CI
- Documentation complete
- Successfully merged
- v3.0.0 tagged and published

---

## Expected Benefits

### Performance Improvements
- **Faster Builds**: Angular 21's improved compiler and build optimizations
- **Smaller Bundles**: Better tree-shaking and optimization in Angular 21
- **Faster Runtime**: Zoneless change detection reduces overhead
- **Better Type Checking**: TypeScript 5.9 performance improvements

### Developer Experience
- **Modern Features**: Signal Forms, improved HttpClient, Angular Aria
- **Better Tooling**: ESLint v9, updated IDE support
- **Fewer Warnings**: Clean build output improves productivity
- **Consistent Versions**: No more TypeScript version conflicts

### Stability & Support
- **Long-Term Support**: Node.js 24 LTS supported until April 2028
- **Security Updates**: Latest versions receive security patches
- **Bug Fixes**: Hundreds of bug fixes in Angular 18�21, Kendo 16�21
- **Modern APIs**: Access to latest framework capabilities

### Future-Proofing
- **Migration Path**: Easier upgrades to future versions
- **Standards Alignment**: Angular 21 aligns with web standards
- **Ecosystem Compatibility**: Better third-party library support
- **Reduced Technical Debt**: Up-to-date dependencies

---

## Risk Assessment

### High Risk Areas
1. **Angular Template Changes**: May require extensive template updates
2. **Kendo UI API Changes**: 5 major versions of breaking changes
3. **Change Detection**: Zoneless mode may require adjustments
4. **TypeScript Strictness**: More errors may surface with 5.9

### Medium Risk Areas
1. **RxJS Patterns**: Some operators may need updates
2. **Build Configuration**: tsconfig, angular.json changes needed
3. **Third-Party Integrations**: May need compatibility updates
4. **Custom Components**: May need adjustments for Angular 21

### Low Risk Areas
1. **Node.js Upgrade**: 24.x is mature and stable
2. **npm Upgrade**: Minimal breaking changes
3. **Core MJ Logic**: Business logic unaffected
4. **Database Layer**: No changes needed

---

## Rollback Plan

If critical issues arise during any phase:

1. **Immediate Rollback**
   ```bash
   git checkout next
   git branch -D MJ_v3
   ```

2. **Partial Rollback**
   - Revert to last working phase commit
   - Resume from stable checkpoint

3. **Version Pinning**
   - Pin problematic packages to last working versions
   - Continue with partial upgrade
   - Address issues in follow-up

4. **Communication**
   - Document rollback reason
   - Create issue for failed upgrade
   - Plan remediation strategy

---

## Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| 0. Preparation | Week 1 | Baseline, pinned Node.js, branch created |
| 1. TypeScript Consolidation | Week 1-2 | All packages on TypeScript 5.4.5 (REVISED) |
| 2. Node.js | Week 2 | Node.js 24.12.0, updated types |
| 3. Angular | Week 3-4 | Angular 21.0.6 across all packages |
| 3.5. TypeScript Upgrade | Week 4 | All packages on TypeScript 5.9.3 (NEW) |
| 4. Kendo UI | Week 4-5 | Kendo UI 21.3.0, updated syntax |
| 5. RxJS | Week 5 | RxJS 7.8.2, cleaned dependencies |
| 6. Warnings | Week 6 | Zero warnings in build |
| 7. Testing | Week 6-7 | All tests passing, validated |
| 8. Documentation | Week 7 | Migration guide, updated docs |
| 9. Merge | Week 8 | PR merged, v3.0.0 released |

**Total Duration**: 8 weeks (unchanged - Phase 3.5 runs concurrently with Phase 4)

---

## Post-Upgrade Monitoring

After v3.0.0 release:

1. **Week 1-2**: Monitor for issues in production
2. **Collect Feedback**: Gather developer and user feedback
3. **Hot Fixes**: Address critical issues quickly
4. **Performance Metrics**: Track and compare metrics
5. **Documentation Updates**: Improve migration guide based on feedback

---

## Success Metrics

-  Zero warnings during `npm install`
-  Zero warnings during `npm run build`
-  Zero runtime warnings in console
-  All automated tests passing
-  All manual test scenarios passing
-  No performance regressions (build time, runtime, bundle size)
-  All packages using consistent TypeScript 5.9.3
-  All Angular packages on v21.0.6
-  All Kendo packages on v21.3.0
-  Node.js 24.12.0 LTS with long-term support
-  Clean npm audit report
-  Documentation complete and accurate
-  Successfully deployed to production

---

## Conclusion

This upgrade plan provides a structured, low-risk approach to bringing MemberJunction up to the latest stable versions of all major dependencies. By following this phased approach with testing at each stage, we can minimize disruption while gaining significant benefits in performance, developer experience, and long-term maintainability.

The 8-week timeline allows for thorough testing and validation at each phase, with clear rollback options if issues arise. The end result will be a modern, performant, and well-supported codebase ready for future development.

---

**Document Version**: 1.0
**Created**: 2025-12-20
**Author**: Claude (AI Assistant)
**Status**: Reviewed
