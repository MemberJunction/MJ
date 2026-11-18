# Migration Plan: Moving Auth Services to `packages/Angular/Generic`

## Objective
To improve code reusability and decouple core functionality from the `Explorer` application by migrating authentication and authorization services from `packages/Angular/Explorer` to `packages/Angular/Generic`.

## Motivation
Currently, critical auth-related services, guards, and components are tied to `packages/Angular/Explorer`. This makes them difficult to use in other applications built with MemberJunction tooling that do not require the full Explorer suite. Moving these to `packages/Angular/Generic` aligns with our goal of creating a robust, reusable UI/service library.

## Scope of Work
- **Identify Auth Components**:
  - Services: `auth-services`, `oauth` related services.
  - Components: Authentication form components, authorization forms.
  - Guards: `auth-guard.service.ts`.
- **Migration Strategy**:
  - Relocate code into `packages/Angular/Generic/credentials` or a new `packages/Angular/Generic/auth` directory.
  - Refactor imports to ensure they reference the new location.
  - Update `packages/Angular/Explorer` to consume these services from `packages/Angular/Generic`.
  - Maintain backward compatibility where possible by creating re-exporting modules in the old location if necessary, or update `Explorer` to point to the new location.
- **Verification**:
  - Update unit tests in `packages/Angular/Generic`.
  - Ensure `packages/Angular/Explorer` builds and passes existing tests.

## Benefits
- Improved code reuse across different apps.
- Cleaner separation of concerns.
- Simplified maintenance of core auth patterns.

## Next Steps
- Once approved, proceed with the migration in phases.
