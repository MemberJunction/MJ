# @memberjunction/ai-agent-manager-actions

## 2.109.0

### Patch Changes

- Updated dependencies [6e45c17]
- Updated dependencies [a38989b]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/ai-agent-manager@2.109.0
  - @memberjunction/actions-base@2.109.0
  - @memberjunction/actions@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Minor Changes

- d205a6c: migration

### Patch Changes

- Updated dependencies [d205a6c]
- Updated dependencies [656d86c]
  - @memberjunction/ai-agent-manager@2.108.0
  - @memberjunction/actions-base@2.108.0
  - @memberjunction/actions@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai-agent-manager@2.107.0
- @memberjunction/actions-base@2.107.0
- @memberjunction/actions@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai-agent-manager@2.106.0
- @memberjunction/actions-base@2.106.0
- @memberjunction/actions@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Patch Changes

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/actions@2.105.0
  - @memberjunction/actions-base@2.105.0
  - @memberjunction/ai-agent-manager@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- 49171c3: - Implement missing AI Agent Manager action drivers including
  deactivate-agent, export-agent-bundle, set-agent-prompt, and
  validate-agent-configuration

  - Add comprehensive UUID validation with regex patterns to prevent SQL
    conversion errors
  - Enhance parameter validation and error handling across all actions
  - Implement DRY principle by consolidating validation logic in base class
  - Add transaction management infrastructure for future multi-record
    operations
  - Fix type safety issues with optional chaining for parameter handling
  - Improve agent definition interfaces for better type safety
  - Standardize error handling patterns across all action implementations

  This completes the Agent Manager action system and resolves critical
  validation errors that were preventing proper agent management
  functionality.

- 7980171: entity name corrections

  ### Features

  - **Resizable & Draggable Dialogs**: Converted all AI Agent dialog
    types from DialogService to WindowService
    - Added corner resizing and drag-and-drop movement capabilities for
      all 7 dialog types
    - Fixed z-index layering issues to render above MJExplorer banner
    - Improved dialog styling with enhanced CSS and layout fixes
  - **Enhanced AI Agent Form**: Major improvements to
    ai-agent-form.component with expanded HTML layout and comprehensive
    styling

  ### Bug Fixes

  - **Critical Entity Name Corrections**: Fixed entity references to use
    proper "MJ: " prefix for newer core entities
    - Fixed 'AI Agent Prompts' → 'MJ: AI Agent Prompts' (3 occurrences)
    - Fixed 'AI Agent Runs' → 'MJ: AI Agent Runs' (4 occurrences)
    - Ensures all entity references work correctly with the
      MemberJunction framework and prevents runtime errors

  ### Documentation

  - Updated CLAUDE.md with comprehensive entity naming guidelines
  - Added complete list of all 23 core entities requiring "MJ: " prefix
  - Added warning section with code examples to prevent future entity
    naming issues

  ### Impact

  - **Enhanced User Experience**: All AI Agent dialogs now provide
    modern, resizable, and draggable interfaces
  - **Database Compatibility**: Ensures proper entity schema compliance
    across all AI services
  - **Developer Guidance**: Comprehensive documentation prevents future
    entity naming conflicts

- Updated dependencies [2ff5428]
- Updated dependencies [9ad6353]
  - @memberjunction/global@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/actions@2.104.0
  - @memberjunction/actions-base@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/ai-agent-manager@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
  - @memberjunction/core@2.103.0
  - @memberjunction/ai-agent-manager@2.103.0
  - @memberjunction/actions@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/actions-base@2.103.0
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/core-entities@2.100.3
- @memberjunction/actions-base@2.100.3
- @memberjunction/actions@2.100.3
- @memberjunction/ai-agent-manager@2.100.3
- @memberjunction/core@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai-agent-manager@2.100.2
- @memberjunction/actions-base@2.100.2
- @memberjunction/actions@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai-agent-manager@2.100.1
- @memberjunction/actions-base@2.100.1
- @memberjunction/actions@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/actions-base@2.100.0
  - @memberjunction/actions@2.100.0
  - @memberjunction/ai-agent-manager@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/actions-base@2.99.0
  - @memberjunction/actions@2.99.0
  - @memberjunction/ai-agent-manager@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai-agent-manager@2.98.0
- @memberjunction/actions-base@2.98.0
- @memberjunction/actions@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/core-entities@2.97.0
- @memberjunction/actions-base@2.97.0
- @memberjunction/actions@2.97.0
- @memberjunction/ai-agent-manager@2.97.0
- @memberjunction/core@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/actions-base@2.96.0
  - @memberjunction/actions@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/ai-agent-manager@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/actions-base@2.95.0
  - @memberjunction/actions@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/ai-agent-manager@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/actions-base@2.94.0
- @memberjunction/actions@2.94.0
- @memberjunction/ai-agent-manager@2.94.0
- @memberjunction/core@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- Updated dependencies [f8757aa]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
  - @memberjunction/core@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/actions-base@2.93.0
  - @memberjunction/actions@2.93.0
  - @memberjunction/ai-agent-manager@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/core@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/actions-base@2.92.0
  - @memberjunction/actions@2.92.0
  - @memberjunction/ai-agent-manager@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
  - @memberjunction/core@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/actions-base@2.91.0
  - @memberjunction/actions@2.91.0
  - @memberjunction/ai-agent-manager@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- Updated dependencies [146ebcc]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/actions@2.90.0
  - @memberjunction/actions-base@2.90.0
  - @memberjunction/ai-agent-manager@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [d1911ed]
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/actions@2.89.0
  - @memberjunction/actions-base@2.89.0
  - @memberjunction/ai-agent-manager@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [df4031f]
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/actions-base@2.88.0
  - @memberjunction/actions@2.88.0
  - @memberjunction/ai-agent-manager@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/actions-base@2.87.0
  - @memberjunction/actions@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/ai-agent-manager@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7dd2409]
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/actions-base@2.86.0
  - @memberjunction/actions@2.86.0
  - @memberjunction/ai-agent-manager@2.86.0
  - @memberjunction/core@2.86.0
  - @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [747455a]
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/actions@2.85.0
  - @memberjunction/actions-base@2.85.0
  - @memberjunction/ai-agent-manager@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/actions-base@2.84.0
  - @memberjunction/actions@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/ai-agent-manager@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
  - @memberjunction/core@2.83.0
  - @memberjunction/actions-base@2.83.0
  - @memberjunction/actions@2.83.0
  - @memberjunction/core-entities@2.83.0
  - @memberjunction/ai-agent-manager@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- Updated dependencies [2186d7b]
- Updated dependencies [975e8d1]
  - @memberjunction/core-entities@2.82.0
  - @memberjunction/actions-base@2.82.0
  - @memberjunction/actions@2.82.0
  - @memberjunction/ai-agent-manager@2.82.0
  - @memberjunction/core@2.82.0
  - @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- Updated dependencies [6d2d478]
- Updated dependencies [e623f99]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/core-entities@2.81.0
  - @memberjunction/actions-base@2.81.0
  - @memberjunction/actions@2.81.0
  - @memberjunction/ai-agent-manager@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai-agent-manager@2.80.1
- @memberjunction/actions-base@2.80.1
- @memberjunction/actions@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
- Updated dependencies [d03dfae]
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/actions-base@2.80.0
  - @memberjunction/actions@2.80.0
  - @memberjunction/ai-agent-manager@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/actions@2.79.0
  - @memberjunction/actions-base@2.79.0
  - @memberjunction/core@2.79.0
  - @memberjunction/ai-agent-manager@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [06088e5]
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/actions@2.78.0
  - @memberjunction/actions-base@2.78.0
  - @memberjunction/ai-agent-manager@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/actions-base@2.77.0
  - @memberjunction/actions@2.77.0
  - @memberjunction/ai-agent-manager@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/actions-base@2.76.0
  - @memberjunction/actions@2.76.0
  - @memberjunction/ai-agent-manager@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/actions@2.75.0
- @memberjunction/ai-agent-manager@2.75.0
- @memberjunction/actions-base@2.75.0
- @memberjunction/core@2.75.0
- @memberjunction/core-entities@2.75.0
- @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/actions-base@2.74.0
  - @memberjunction/actions@2.74.0
  - @memberjunction/ai-agent-manager@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [e99336f]
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/actions@2.73.0
  - @memberjunction/actions-base@2.73.0
  - @memberjunction/ai-agent-manager@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/actions-base@2.72.0
  - @memberjunction/actions@2.72.0
  - @memberjunction/ai-agent-manager@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai-agent-manager@2.71.0
  - @memberjunction/actions-base@2.71.0
  - @memberjunction/actions@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/actions-base@2.70.0
  - @memberjunction/actions@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/ai-agent-manager@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/actions-base@2.69.1
  - @memberjunction/actions@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/ai-agent-manager@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/actions@2.69.0
  - @memberjunction/actions-base@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/ai-agent-manager@2.69.0

## 2.68.0

### Patch Changes

- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/actions@2.68.0
  - @memberjunction/actions-base@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/ai-agent-manager@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/ai-agent-manager@2.67.0
- @memberjunction/actions-base@2.67.0
- @memberjunction/actions@2.67.0
- @memberjunction/core@2.67.0
- @memberjunction/core-entities@2.67.0
- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- Updated dependencies [7e22e3e]
  - @memberjunction/actions-base@2.66.0
  - @memberjunction/actions@2.66.0
  - @memberjunction/ai-agent-manager@2.66.0
  - @memberjunction/core@2.66.0
  - @memberjunction/core-entities@2.66.0
  - @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/actions@2.65.0
  - @memberjunction/actions-base@2.65.0
  - @memberjunction/core@2.65.0
  - @memberjunction/ai-agent-manager@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/actions-base@2.64.0
  - @memberjunction/actions@2.64.0
  - @memberjunction/ai-agent-manager@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/actions-base@2.63.1
  - @memberjunction/actions@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/ai-agent-manager@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/actions@2.63.0
  - @memberjunction/actions-base@2.63.0
  - @memberjunction/ai-agent-manager@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/actions@2.62.0
  - @memberjunction/actions-base@2.62.0
  - @memberjunction/ai-agent-manager@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- Updated dependencies [51b2b47]
  - @memberjunction/actions@2.61.0
  - @memberjunction/ai-agent-manager@2.61.0
  - @memberjunction/actions-base@2.61.0
  - @memberjunction/core@2.61.0
  - @memberjunction/core-entities@2.61.0
  - @memberjunction/global@2.61.0

## 2.60.0

### Patch Changes

- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/actions@2.60.0
  - @memberjunction/actions-base@2.60.0
  - @memberjunction/ai-agent-manager@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai-agent-manager@2.59.0
- @memberjunction/actions-base@2.59.0
- @memberjunction/actions@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
  - @memberjunction/core@2.58.0
  - @memberjunction/actions-base@2.58.0
  - @memberjunction/actions@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/ai-agent-manager@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/actions-base@2.57.0
  - @memberjunction/actions@2.57.0
  - @memberjunction/ai-agent-manager@2.57.0

## 2.56.0

### Minor Changes

- bf24cae: Various

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/ai-agent-manager@2.56.0
  - @memberjunction/actions@2.56.0
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/actions-base@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- c3a49ff: Agent Manager + SQL Server fix + fix deps in core-entity-forms

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai-agent-manager@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/actions@2.55.0
  - @memberjunction/actions-base@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0
