# Migration Plan: Moving Auth Services to `packages/Angular/Generic`

## Objective
To improve code reusability and decouple core functionality from the `Explorer` application by migrating authentication and authorization services from `packages/Angular/Explorer` to `packages/Angular/Generic`.

## Motivation
Currently, critical auth-related services, guards, and components are tied to `packages/Angular/Explorer`. This makes them difficult to use in other applications built with MemberJunction tooling that do not require the full Explorer suite. Moving these to `packages/Angular/Generic` aligns with our goal of creating a robust, reusable UI/service library.

## Phased Migration Strategy

### Phase 1: Preparation & Infrastructure in `Generic`
- Create `packages/Angular/Generic/auth` directory.
- Define shared interfaces/types for Auth providers in `Generic`.
- Set up initial module structure in `Generic`.

### Phase 2: Migration of Core Services
- Relocate `packages/Angular/Explorer/auth-services` into `packages/Angular/Generic/auth`.
- Refactor imports.
- Ensure all dependencies on `@auth0`, `@azure`, etc., are correctly handled in `Generic`.

### Phase 3: Migration of Components
- Relocate auth-related form components from `Explorer` to `Generic`.
- Update Angular module declarations/imports.

### Phase 4: Refactoring Explorer to Consume Generic
- Update `packages/Angular/Explorer` to import auth services/components from `packages/Angular/Generic`.
- Ensure Explorer functionality remains intact via backward-compatibility re-exports or direct updates.

### Phase 5: Verification & Cleanup
- Migrate and update unit tests from `Explorer` to `Generic`.
- Run all `Generic` tests.
- Run `Explorer` tests to ensure no regression.
- Remove redundant code from `Explorer` if applicable.

## Verification
- Unit tests pass in both packages.
- Explorer application builds successfully and functions as expected.

## Benefits
- Improved code reuse across different apps.
- Cleaner separation of concerns.
- Simplified maintenance of core auth patterns.
