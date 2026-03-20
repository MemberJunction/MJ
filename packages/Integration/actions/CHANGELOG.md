# @memberjunction/integration-actions

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/integration-engine@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/actions@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/actions@5.13.0
  - @memberjunction/integration-engine@5.13.0

## 5.12.0

### Minor Changes

- 6f9350c: migration
- 257512b: feat: Integration scheduled job type, YM/HubSpot connector improvements, CodeGen custom view refresh
  - Add ScheduledJobRunID FK to CompanyIntegrationRun and ScheduledJobID FK to CompanyIntegration (migration v5.12.x)
  - Add Integration Sync scheduled job type metadata
  - Pass contextUser through HubSpot credential loading for proper server-side data isolation
  - Make YM connector performance defaults (retries, timeouts, batch size, throttle) overrideable per Configuration JSON
  - CodeGen now auto-emits sp_refreshview for custom base views (BaseViewGenerated=false) so devs don't need to add it manually to migrations
  - BaseIntegrationPointAction scaffold for future write-back actions

### Patch Changes

- Updated dependencies [6f9350c]
- Updated dependencies [05f19ff]
- Updated dependencies [257512b]
- Updated dependencies [d92502e]
  - @memberjunction/integration-engine@5.12.0
  - @memberjunction/core@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/actions@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/actions@5.11.0
  - @memberjunction/integration-engine@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/actions-base@5.10.1
- @memberjunction/actions@5.10.1
- @memberjunction/integration-engine@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/actions@5.10.0
  - @memberjunction/integration-engine@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 89b6abe: migration

### Patch Changes

- Updated dependencies [89b6abe]
- Updated dependencies [194ddf2]
  - @memberjunction/integration-engine@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/actions@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/actions@5.8.0
  - @memberjunction/integration-engine@5.8.0
  - @memberjunction/global@5.8.0
