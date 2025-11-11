# Testing Framework Package Setup

## Package Structure Created

```
packages/TestingFramework/
├── README.md                    # Main framework documentation
├── SETUP.md                     # This file
│
├── Engine/                      # Core testing engine
│   ├── package.json            # @memberjunction/testing-engine
│   ├── tsconfig.json           # TypeScript config (matches MJCore)
│   ├── README.md               # Engine architecture and API docs
│   └── src/
│       ├── index.ts            # Public API exports
│       ├── types.ts            # Core type definitions
│       ├── engine/             # Main orchestration
│       ├── drivers/            # Test driver implementations
│       ├── oracles/            # Oracle evaluators
│       └── utils/              # Utilities
│
├── CLI/                         # Command-line interface
│   ├── package.json            # @memberjunction/testing-cli
│   ├── tsconfig.json           # TypeScript config (matches MJCore)
│   ├── README.md               # CLI commands and usage
│   └── src/
│       ├── index.ts            # Command exports
│       ├── commands/           # Command implementations
│       └── utils/              # CLI utilities
│
└── UI/                          # Angular UI components (future)
    ├── README.md               # UI plans and component specs
    └── src/                    # (To be populated later)
```

## Configuration Files

All packages follow MJCore conventions:

### package.json
- Follows MJ naming: `@memberjunction/testing-engine`, `@memberjunction/testing-cli`
- Version synced with MJ: `2.117.0`
- Dependencies include core MJ packages
- Standard scripts: `build`, `start`, `test`

### tsconfig.json
- Matches MJCore settings exactly
- `experimentalDecorators: true` for MJ patterns
- `strict: false` for consistency
- Outputs to `dist/` directory

## Next Steps

### 1. Install Dependencies

From repository root:
```bash
npm install
```

This will install dependencies for all packages in the workspace.

### 2. Build Order

The packages must build in dependency order:

```bash
# 1. Build Engine first (no internal dependencies)
cd packages/TestingFramework/Engine
npm run build

# 2. Build CLI (depends on Engine)
cd ../CLI
npm run build
```

Or use turbo from root:
```bash
npx turbo build --filter="@memberjunction/testing-engine"
npx turbo build --filter="@memberjunction/testing-cli"
```

### 3. Implementation Roadmap

#### Phase 1: Engine Core (Current)
- [ ] Create `BaseTestDriver` abstract class
- [ ] Create `IOracle` interface
- [ ] Implement `TestEngine` orchestration class
- [ ] Create basic types and utilities

#### Phase 2: Agent Eval Driver
- [ ] Implement `AgentEvalDriver`
- [ ] Create oracle implementations:
  - [ ] `SchemaValidatorOracle`
  - [ ] `TraceValidatorOracle`
  - [ ] `LLMJudgeOracle`
  - [ ] `ExactMatchOracle`
  - [ ] `SQLValidatorOracle`
- [ ] Build scoring and cost calculation utilities

#### Phase 3: CLI Commands
- [ ] Implement `run` command
- [ ] Implement `suite` command
- [ ] Implement `list` command
- [ ] Implement `validate` command
- [ ] Create output formatters (console, JSON, markdown)

#### Phase 4: MJCLI Integration
- [ ] Add test commands to MJCLI package
- [ ] Test `mj test` command integration
- [ ] Add to MJCLI documentation

#### Phase 5: Advanced Features
- [ ] Implement `report` command
- [ ] Implement `history` command
- [ ] Implement `compare` command
- [ ] Add parallel suite execution
- [ ] Add result caching

## Development Commands

### Engine Package

```bash
cd packages/TestingFramework/Engine

# Development mode (watch for changes)
npm start

# Build
npm run build

# The built output will be in dist/
```

### CLI Package

```bash
cd packages/TestingFramework/CLI

# Development mode
npm start

# Build
npm run build
```

## Integration Points

### Engine → Database
Engine uses MJ Core Entities to interact with the database:
```typescript
import { TestEntity, TestRunEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';

const md = new Metadata();
const test = await md.GetEntityObject<TestEntity>('Tests', contextUser);
await test.Load(testId);
```

### CLI → Engine
CLI imports and uses Engine classes:
```typescript
import { TestEngine } from '@memberjunction/testing-engine';

const engine = new TestEngine();
const result = await engine.runTest(testId, contextUser, options);
```

### MJCLI → CLI
MJCLI delegates to CLI package:
```typescript
// In packages/MJCLI/src/commands/test/run.ts
import { RunCommand } from '@memberjunction/testing-cli';

export default class TestRun extends Command {
  async run() {
    const { args, flags } = await this.parse(TestRun);
    await RunCommand.execute(args, flags);
  }
}
```

## ClassFactory Registration

Test drivers are registered with MJ ClassFactory for dynamic instantiation:

```typescript
import { MJGlobal } from '@memberjunction/global';
import { BaseTestDriver, AgentEvalDriver } from '@memberjunction/testing-engine';

// Register driver
MJGlobal.Instance.ClassFactory.Register(
  BaseTestDriver,
  'AgentEvalDriver',
  AgentEvalDriver
);

// Engine uses ClassFactory to instantiate
const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseTestDriver>(
  BaseTestDriver,
  testType.DriverClass  // e.g., "AgentEvalDriver"
);
```

## Database Entities Available

CodeGen has created entities for all test tables:
- `TestTypeEntity`
- `TestEntity`
- `TestSuiteEntity`
- `TestSuiteTestEntity`
- `TestSuiteRunEntity`
- `TestRunEntity`
- `TestRunFeedbackEntity`
- `TestRubricEntity`

Plus reverse FKs added to:
- `AIAgentRunEntity.TestRunID`
- `ConversationEntity.TestRunID`
- `ConversationDetailEntity.TestRunID`
- `AIPromptRunEntity.TestRunID`

## Testing Philosophy

Remember: In a metadata-driven platform, we test **business outcomes**, not code units.

**Good test:**
> "Agent produces a pie chart with correct data and drilldown functionality"

**Bad test:**
> "Method parsePrompt() returns expected JSON structure"

The framework ensures the latter. We validate the former.

## Architecture Principles

1. **Thin CLI Layer** - Business logic in Engine, CLI handles I/O
2. **Driver Pattern** - Extensible test types via BaseTestDriver
3. **Oracle Composition** - Combine multiple evaluation methods
4. **Trace Integration** - Every test links to execution trace
5. **Cost Tracking** - Monitor and optimize LLM evaluation costs
6. **Human Feedback** - Train and improve automated evaluation

## Quick Start Guide

Once Phase 1 is complete, you'll be able to:

```typescript
// 1. Create a test type
const testType = await md.GetEntityObject<TestTypeEntity>('Test Types');
testType.Name = 'Agent Eval';
testType.DriverClass = 'AgentEvalDriver';
testType.Status = 'Active';
await testType.Save();

// 2. Create a test
const test = await md.GetEntityObject<TestEntity>('Tests');
test.TypeID = testType.ID;
test.Name = 'Active Members Count';
test.InputDefinition = JSON.stringify({
  prompt: 'How many active members do we have?'
});
test.Configuration = JSON.stringify({
  oracles: [
    { type: 'trace-no-errors' },
    { type: 'sql-validate', query: 'SELECT COUNT(*) FROM Members WHERE Status = \'Active\'' }
  ]
});
await test.Save();

// 3. Run the test
const engine = new TestEngine();
const result = await engine.runTest(test.ID, contextUser);

console.log(`Status: ${result.status}`);
console.log(`Score: ${result.score}`);
console.log(`Cost: $${result.cost}`);
```

## Documentation

- **Main README** - Overall framework architecture and philosophy
- **Engine/README.md** - Engine API, drivers, oracles, extension points
- **CLI/README.md** - Command reference, usage examples, CI/CD integration
- **UI/README.md** - Planned UI components and features

## Contributing

Follow MJ development patterns:
- Use `Metadata.GetEntityObject()` for entity creation
- Never use `any` types
- Use `RunView` for queries, not raw SQL
- Follow functional decomposition (small, focused functions)
- Add JSDoc comments to public APIs
- Update READMEs when adding features

---

**Ready to build!** Start with Phase 1: Engine Core.
