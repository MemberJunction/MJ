# @memberjunction/component-registry-server

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
  - @memberjunction/core@2.103.0
  - @memberjunction/interactive-component-types@2.103.0
  - @memberjunction/sqlserver-dataprovider@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- 4bd084f: Add router mode support to ComponentRegistryAPIServer

  Enables mounting the registry as an Express Router on existing
  applications instead of running as a standalone service. The
  server can now operate in 'router' mode (returns Express Router)
  or 'standalone' mode (default, unchanged behavior).

  New `ComponentRegistryServerOptions` interface supports mode
  selection, custom base paths, and optional database setup
  skipping

- Updated dependencies [3cec75a]
  - @memberjunction/interactive-component-types@2.100.3
  - @memberjunction/core-entities@2.100.3
  - @memberjunction/sqlserver-dataprovider@2.100.3
  - @memberjunction/core@2.100.3
  - @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- 525bb13: fix: Move @types/express to dependencies in ComponentRegistry package
  - @memberjunction/interactive-component-types@2.100.2
  - @memberjunction/core@2.100.2
  - @memberjunction/core-entities@2.100.2
  - @memberjunction/global@2.100.2
  - @memberjunction/sqlserver-dataprovider@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/interactive-component-types@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1
- @memberjunction/sqlserver-dataprovider@2.100.1

## 2.100.0

### Minor Changes

- b3132ec: migration

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/interactive-component-types@2.100.0
  - @memberjunction/sqlserver-dataprovider@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Minor Changes

- d88dc62: Component Registry Server

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/sqlserver-dataprovider@2.99.0
  - @memberjunction/interactive-component-types@2.99.0
  - @memberjunction/global@2.99.0
