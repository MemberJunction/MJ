# Code Execution Implementation Plan

**Status**: In Progress
**Started**: 2025-10-19
**Goal**: Enable MemberJunction AI agents to execute sandboxed JavaScript code for data analysis and transformations

## Overview

Implement a code execution capability that allows agents to generate and run JavaScript code in a secure sandbox. This will be exposed through an "Execute Code" action, following MJ's pattern of Actions as boundaries with Services containing the logic.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Agent (via LoopAgentType JSON response)        │
│  - Decides to execute code                      │
│  - Generates JavaScript to solve problem        │
└─────────────────┬───────────────────────────────┘
                  │
         ┌────────▼────────┐
         │  Execute Code   │  ◄── Action (thin boundary)
         │     Action      │      - Parameter extraction
         │                 │      - Delegates to service
         └────────┬────────┘
                  │
         ┌────────▼────────────┐
         │ CodeExecution       │  ◄── Service (core logic)
         │    Service          │      - vm2 sandboxing
         │                     │      - Library management
         │                     │      - Security enforcement
         └─────────────────────┘
```

## Implementation Tasks

### ✅ Phase 1: Package Setup

- [x] Create package directory structure
- [ ] Create package.json with dependencies
- [ ] Create tsconfig.json
- [ ] Add to workspace packages list
- [ ] Create README.md

**Status**: Directory created, ready for files

---

### Phase 2: Core Service Implementation

- [ ] Create CodeExecutionService.ts
  - [ ] Main execute() method
  - [ ] JavaScript sandbox with vm2
  - [ ] Library allowlist management
  - [ ] Error handling and timeout management
  - [ ] Result formatting
- [ ] Create types/interfaces
  - [ ] CodeExecutionParams
  - [ ] CodeExecutionResult
  - [ ] CodeExecutionOptions
  - [ ] SandboxContext
- [ ] Create index.ts exports

**Status**: Not started

---

### Phase 3: Execute Code Action

- [ ] Create ExecuteCodeAction.ts in CoreActions
  - [ ] Parameter extraction (code, language, inputData, timeout, memoryLimit)
  - [ ] Delegate to CodeExecutionService
  - [ ] Map results to ActionResultSimple
  - [ ] Add output parameters
  - [ ] Error handling
- [ ] Register action with @RegisterClass decorator

**Status**: Not started

---

### Phase 4: Database Metadata

- [ ] Create metadata file: `/metadata/actions/execute-code.json`
  - [ ] Action definition
  - [ ] Input parameters (code, language, inputData, timeout, memoryLimit)
  - [ ] Output parameters (output, logs, executionTimeMs)
  - [ ] Category: "Code Execution"
  - [ ] Description for AI agents
- [ ] Test metadata sync with `npx mj-sync validate`
- [ ] Push metadata with `npx mj-sync push`

**Status**: Not started

---

### Phase 5: Dependencies Installation

- [ ] Install vm2 in CodeExecution package
- [ ] Install safe libraries (lodash, date-fns, mathjs, papaparse, etc.)
- [ ] Install TypeScript types
- [ ] Run `npm install` at repo root

**Status**: Not started

---

### Phase 6: Testing

- [ ] Create test agent configuration
  - [ ] Agent with "Execute Code" action enabled
  - [ ] Test prompts for code generation
- [ ] Test cases:
  - [ ] Simple calculation (sum, average)
  - [ ] Data transformation (grouping, filtering)
  - [ ] Date manipulation
  - [ ] CSV parsing
  - [ ] Error handling (syntax error, timeout, runtime error)
  - [ ] Library usage (lodash, mathjs)
- [ ] Document test results

**Status**: Not started

---

### Phase 7: Documentation

- [ ] Update CodeExecution package README
  - [ ] Usage examples
  - [ ] Supported libraries
  - [ ] Security model
  - [ ] Configuration options
- [ ] Create agent prompt template examples
- [ ] Add to main MJ documentation

**Status**: Not started

---

## Design Decisions

### Why JavaScript Only?
- ✅ Same runtime as MJ (Node.js) - no external dependencies
- ✅ npm ecosystem with vast library support
- ✅ JSON native - perfect for MJ data structures
- ✅ Mature sandboxing (vm2)
- ✅ No subprocess overhead
- ✅ Faster iteration
- ⏸️ Python can be added later for ML/data science use cases

### Security Approach
- **vm2 NodeVM**: Allows `require()` with strict allowlist
- **No filesystem access**: Mock `fs` module
- **No network access**: Block `http`, `https`, `net`, `axios`, etc.
- **Timeout protection**: 30 second default, configurable
- **Memory limits**: Via Node.js --max-old-space-size (future)
- **Library allowlist**: Only pre-approved safe packages

### Safe Libraries
- `lodash` - Data manipulation
- `date-fns` - Date utilities
- `mathjs` - Advanced math and calculations
- `papaparse` - CSV parsing
- `uuid` - ID generation
- `validator` - Input validation

### Configuration via Actions
- No new AIAgent table columns needed
- Control through `AIAgentAction.Status` (Active/Inactive)
- Resource limits via action parameter defaults
- Follows existing MJ patterns

## File Structure

```
packages/AI/CodeExecution/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts                      # Public exports
    ├── CodeExecutionService.ts       # Core service
    └── types/
        └── index.ts                  # TypeScript interfaces

packages/Actions/CoreActions/src/custom/code-execution/
└── execute-code.action.ts            # Action implementation

metadata/actions/
└── execute-code.json                 # Action metadata
```

## Agent Usage Example

Agent prompt would instruct code generation:

```markdown
When you need to perform calculations or data transformations:

1. Use the "Execute Code" action
2. Write JavaScript code that sets the `output` variable
3. Access input data via the `input` object
4. Available libraries: lodash, date-fns, mathjs, papaparse

Example:
{
  "type": "Action",
  "action": {
    "name": "Execute Code",
    "params": {
      "language": "javascript",
      "code": "const sum = input.values.reduce((a,b) => a+b, 0); output = { sum, avg: sum/input.values.length };",
      "inputData": "{\"values\": [1,2,3,4,5]}"
    }
  }
}
```

## Progress Tracking

- **Phase 1**: In Progress (directory created)
- **Phase 2**: Not Started
- **Phase 3**: Not Started
- **Phase 4**: Not Started
- **Phase 5**: Not Started
- **Phase 6**: Not Started
- **Phase 7**: Not Started

**Overall Progress**: 5% (1/7 phases)

---

## Next Steps

1. Complete package.json and tsconfig.json
2. Implement CodeExecutionService core logic
3. Create Execute Code action
4. Add metadata
5. Test end-to-end

---

## Notes

- Following MJ pattern: Actions are boundaries, Services are logic
- No database schema changes needed
- All security enforced in CodeExecutionService
- Auditing happens automatically via ActionExecutionLogs
- Can add Python/other languages later without breaking changes
