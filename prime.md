# MemberJunction React Runtime Testing & Development

## 🚨 CRITICAL: Git Commit Rules 🚨

**NEVER commit without explicit user approval**
- Each commit requires ONE-TIME explicit approval from the user
- Never ask to commit - wait for the user to request it
- When committing, ONLY include what the user has staged
- Never modify or add to staged changes
- Never commit work-in-progress that isn't staged

## Overview
This document describes the React runtime architecture and the iterative testing workflow for improving component generation, validation, and execution in the MemberJunction ecosystem.

## Architecture Components

### 1. React Runtime (`packages/React/runtime`)
**Purpose**: Platform-agnostic React component compiler and execution environment

**Key Classes**:
- **ComponentCompiler**: 
  - Transpiles JSX to JavaScript using Babel
  - Handles library loading with dependency resolution
  - Wraps components with error boundaries and method registration
  - Manages both core libraries (React, ReactDOM) and third-party libraries

- **ComponentRegistry**: 
  - Stores compiled components with namespace and version support
  - Provides LRU cache management
  - Enables component lookup and retrieval

- **ComponentHierarchyRegistrar**: 
  - Registers entire component trees with dependencies
  - Resolves inter-component references
  - Handles library injection into component closures

- **Resource Management**:
  - ReactRootManager: Manages React root lifecycle
  - ResourceManager: Tracks timeouts, intervals, and subscriptions
  - Automatic cleanup on component unmount

**Distribution**: 
- Node.js module for server/build-time use
- UMD bundle (`dist/runtime.umd.js`) for browser execution

### 2. React Test Harness (`packages/React/test-harness`)
**Purpose**: Browser-based testing and validation of React components using Playwright

**Important Runtime Context**:
- React hooks (useState, useEffect, useRef, useMemo, useCallback, etc.) are destructured and available globally
- Components can use hooks without the `React.` prefix (e.g., `useState` instead of `React.useState`)
- This is handled by the runtime environment which provides these functions in the component's execution context

**Key Features**:
- **ComponentRunner**: 
  - Executes components in real Chrome browser via Playwright
  - Injects MJ utilities (RunView, RunQuery, AI tools) into browser context
  - Captures errors, warnings, and console output
  - Detects render loops and infinite recursion

- **ComponentLinter**: 
  - 20+ validation rules for component code quality
  - Detects common React anti-patterns
  - Validates data access patterns (RunView/RunQuery usage)
  - Checks library and component dependencies
  - Provides fix suggestions for violations

- **Library Loading**:
  - Loads libraries from CDN URLs specified in metadata
  - Handles transitive dependencies (e.g., dayjs for antd)
  - Validates library availability in browser context

### 3. Angular/React Bridge (`packages/Angular/Generic/react`)
**Purpose**: Host React components within Angular applications

**Key Component - MJReactComponent**:
- **Lifecycle Management**:
  - Bootstraps React on first use
  - Creates/destroys React roots properly
  - Handles Angular OnPush change detection

- **Auto-initialization**:
  - Utilities (RunView, RunQuery, AI tools) created if not provided
  - Styles generated using SetupStyles() if not provided
  - Ensures components always have required dependencies

- **State Management**:
  - Implements SavedUserSettings pattern for persistence
  - Emits events for state changes and user actions
  - Supports two-way data binding with Angular

- **Method System**:
  - Exposes component methods for runtime introspection
  - Standard methods: getCurrentDataState(), validate(), isDirty(), reset()
  - Custom method invocation via invokeMethod()

## Testing Workflow

### Process
1. **Generation**: Skip agent generates component specifications (JSON)
2. **Testing**: Component spec is executed in test harness
3. **Analysis**: Identify failure patterns and root causes
4. **Improvement**: Enhance linter rules, generator logic, or runtime robustness

### Improvement Areas

#### A. Linter Enhancements
When to improve: Catching patterns that cause runtime failures
- Add new validation rules
- Enhance existing rule accuracy
- Improve error messages and fix suggestions
- Add pattern detection for common mistakes

#### B. Generator Improvements (Skip)
When to improve: Systematic generation issues
- Update generation templates
- Add missing pattern implementations
- Fix incorrect API usage
- Improve data access patterns

#### C. Runtime Enhancements
When to improve: Execution failures or poor developer experience
- Better error recovery
- Clearer error messages
- Additional safety checks
- Performance optimizations
- Missing functionality

### Common Issue Patterns

#### Data Access Issues
- Missing data requirements in spec
- Incorrect RunView/RunQuery parameters
- Undefined utilities or missing context
- Synchronous access to async data

#### Component Structure Issues
- Invalid JSX syntax
- Missing return statements
- Incorrect hook usage
- Component naming conflicts

#### Library/Dependency Issues
- Missing library declarations
- Incorrect global variable names
- Circular dependencies
- Version conflicts

#### State Management Issues
- Direct state mutations
- Missing useState declarations
- Incorrect savedUserSettings usage
- Event handler binding problems

## Debug Strategies

### For "No Data Available" Issues
1. Check if utilities are properly passed to component
2. Verify RunView/RunQuery calls have correct parameters
3. Ensure data requirements match actual data access
4. Check for loading state management
5. Verify error handling doesn't swallow data

### For Rendering Issues
1. Check for infinite loops in useEffect
2. Verify conditional rendering logic
3. Ensure proper JSX structure
4. Check for missing return statements
5. Validate prop types and availability

### For Library Issues
1. Verify library is declared in spec
2. Check CDN URLs are valid
3. Ensure global variables match
4. Check for dependency conflicts
5. Validate library usage patterns

## Recent Improvements

### Linter Rules Added
- `no-import-statements`: Prevents ES6 imports in components
- `no-export-statements`: Prevents exports from components  
- `no-require-statements`: Prevents require/dynamic imports
- `component-not-in-dependencies`: Detects missing component dependencies
- `validate-component-references`: Ensures referenced components exist

### Runtime Improvements
- Prevention of component self-destructuring in dependencies
- Better library dependency resolution
- Enhanced error messages for data access failures
- Render loop detection with configurable thresholds
- Improved memory cleanup with resource tracking

### Generator Patterns (for Skip team)
- Always declare utilities in component parameters
- Include all referenced components in dependencies
- Specify library requirements with correct global names
- Implement proper loading states
- Use error boundaries for resilience