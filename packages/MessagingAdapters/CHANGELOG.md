# @memberjunction/messaging-adapters

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-agents@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/sqlserver-dataprovider@5.32.0
  - @memberjunction/server-extensions-core@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 28beaa4: Slack/Teams server extensions now skip silently when enabled but unconfigured (placeholder ContextUserEmail or missing tokens) instead of throwing and logging failed to initialize on every MJAPI startup. Adds optional Skipped?: boolean to ExtensionInitResult for extensions to opt into the quiet path; loader emits LogStatus instead of LogError when set. Genuine misconfig (real credentials but unknown email) still throws and logs as an error.
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [28beaa4]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ai-agents@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/sqlserver-dataprovider@5.31.0
  - @memberjunction/server-extensions-core@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-agents@5.30.1
- @memberjunction/ai@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/sqlserver-dataprovider@5.30.1
- @memberjunction/server-extensions-core@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/ai-agents@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/sqlserver-dataprovider@5.30.0
  - @memberjunction/server-extensions-core@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-agents@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/sqlserver-dataprovider@5.29.0
  - @memberjunction/server-extensions-core@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ai-agents@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/sqlserver-dataprovider@5.28.0
  - @memberjunction/server-extensions-core@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai-agents@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/sqlserver-dataprovider@5.27.1
  - @memberjunction/server-extensions-core@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@5.27.0
- @memberjunction/ai-agents@5.27.0
- @memberjunction/ai@5.27.0
- @memberjunction/ai-core-plus@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/server-extensions-core@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/ai-agents@5.26.0
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/sqlserver-dataprovider@5.26.0
  - @memberjunction/server-extensions-core@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [62af878]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/ai-agents@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/sqlserver-dataprovider@5.25.0
  - @memberjunction/server-extensions-core@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-agents@5.24.0
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/sqlserver-dataprovider@5.24.0
  - @memberjunction/server-extensions-core@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/ai-agents@5.23.0
  - @memberjunction/sqlserver-dataprovider@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/server-extensions-core@5.23.0
  - @memberjunction/ai@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [21e0b69]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/ai-agents@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/sqlserver-dataprovider@5.22.0
  - @memberjunction/server-extensions-core@5.22.0
  - @memberjunction/ai@5.22.0

## 5.21.0

### Patch Changes

- 1bf67de: Default messaging extensions to Enabled: false and improve initialization error message
- Updated dependencies [c7dfb20]
- Updated dependencies [b29716c]
- Updated dependencies [76cd2bc]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-agents@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/sqlserver-dataprovider@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/server-extensions-core@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [7ab01a8]
- Updated dependencies [2298f8a]
  - @memberjunction/ai-agents@5.20.0
  - @memberjunction/core@5.20.0
  - @memberjunction/sqlserver-dataprovider@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/server-extensions-core@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- Updated dependencies [f9001de]
  - @memberjunction/ai-agents@5.19.0
  - @memberjunction/ai@5.19.0
  - @memberjunction/ai-core-plus@5.19.0
  - @memberjunction/core@5.19.0
  - @memberjunction/core-entities@5.19.0
  - @memberjunction/global@5.19.0
  - @memberjunction/sqlserver-dataprovider@5.19.0
  - @memberjunction/server-extensions-core@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
- Updated dependencies [5f91957]
- Updated dependencies [ee4bf94]
  - @memberjunction/ai-agents@5.18.0
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/sqlserver-dataprovider@5.18.0
  - @memberjunction/ai@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0
  - @memberjunction/server-extensions-core@5.18.0

## 5.17.0

### Patch Changes

- ecf8b77: Add Slack and Teams messaging adapters for MJ AI agents with server extension framework
- Updated dependencies [ecf8b77]
- Updated dependencies [9881045]
  - @memberjunction/server-extensions-core@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/sqlserver-dataprovider@5.17.0
  - @memberjunction/ai-agents@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/global@5.17.0
