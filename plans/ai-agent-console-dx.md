# Pluggable MJ CLI with AI-Agent-Friendly Output

**Branch:** `plan/ai-agent-console-dx`  
**Status:** Plan v2 — updated 2026-06-14 with broader architecture from [PR #2838 review](https://github.com/MemberJunction/MJ/pull/2838)  
**Author:** Pranav (with Claude), 2026-06-13  
**Related work:** `chore(codegen): quiet startup chatter + add live/total timing` (e776c117d0), `fix mj sync push always exiting with code 0` (046633616c), PR #2836 (realtime infra — merge before implementation)

---

## 1. Problem

Two separate but related problems, addressed together.

### 1a. AI agents can't read `mj` output

`mj codegen` and `mj sync push/pull` are run constantly — by humans and by AI coding agents (Claude Code, OpenCode, etc.) alike. Amith's recent DX pass made these commands dramatically better for humans: clean spinners, live timers, quiet startup noise, a visible final summary. That work is great and this builds on it.

But AI agents hit a different set of friction points:

1. **No machine-readable output.** The summary is human-readable text with chalk colors and spinner control sequences. When an agent captures `mj sync push` output via a shell call, it gets something like:

   ```
   [2K[1G[36m⠴[39m Loading configuration (0.3s)[2K✔ Configuration and metadata loaded
   ...
   ┌─ Push Summary ─────────────────────────┐
   │  ✔ Created:   3                        │
   │  ✗ Errors:    1                        │
   └────────────────────────────────────────┘
   ```

   To check whether the push succeeded and which entities failed, the agent has to parse human-oriented box-drawing and color codes — fragile and error-prone.

2. **Errors are interleaved mid-run.** Failure messages appear inline between spinner lines. An agent has to scan the whole output rather than read a collected error list.

3. **The figlet banner burns context.** The ANSI-art banner at the start of `mj sync` takes hundreds of captured characters before any useful content. On `mj codegen` it's suppressible via `--quiet`; on `mj sync` it isn't.

4. **`--ci` is halfway there.** It suppresses prompts and sets a non-zero exit code — right building blocks, but still produces human-readable text.

### 1b. `mj` commands aren't pluggable

Today every command in `packages/MJCLI/src/commands/` is hardcoded. There is no way to add a new `mj` command without modifying MJCLI itself. There is also no shared abstraction that enforces where stdio concerns live — each command calls `ora`, `chalk`, `this.log()` directly, so the formatting code is scattered and inconsistent across commands.

The right fix is the same fix: a `BaseCLIPlugin` class and a `MJCLIRuntimeHost` that separates the concerns cleanly. Commands stop doing stdio; the host handles it. This simultaneously makes `--format=json` trivial to add uniformly and makes the CLI open to third-party plugins.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  mj binary (oclif root)                                      │
│                                                              │
│  Reads mj-cli-plugins.json → ClassFactory.Load()            │
│  Routes flags (--format, --verbose, --no-banner) globally    │
│  Creates MJCLIRuntimeHost with resolved settings            │
│  Finds matching BaseCLIPlugin subclass → plugin.Run(host)   │
└──────────────────────────┬──────────────────────────────────┘
                           │ MJCLIRuntimeHost (injected)
          ┌────────────────┴────────────────────┐
          │                                     │
   ┌──────▼──────────────────┐    ┌─────────────▼───────────────┐
   │  BaseCLIPlugin           │    │  MJCLIRuntimeHost            │
   │  (abstract)              │    │                              │
   │  - abstract Execute()    │    │  Text mode:                  │
   │  - calls host.StartStep  │    │    ora spinner               │
   │  - calls host.Log        │    │    chalk colors              │
   │  - returns MJCLIResult   │    │    figlet banner             │
   │                          │    │                              │
   │  Subclasses:             │    │  JSON mode (--format=json):  │
   │  @RegisterClass(         │    │    spinner → stderr only     │
   │    BaseCLIPlugin,        │    │    result JSON → stdout      │
   │    'sync:push')          │    │    no banner, no chalk       │
   │  SyncPushPlugin          │    │                              │
   │                          │    │  MD mode (--format=md):      │
   │  @RegisterClass(         │    │    fenced-code result block  │
   │    BaseCLIPlugin,        │    │    useful for AI chat UI     │
   │    'codegen')            │    │                              │
   │  CodeGenPlugin           │    └─────────────────────────────┘
   └──────────────────────────┘
```

**Key principle:** plugins return data, the host renders it. No `ora`, `chalk`, or `console` calls inside plugin logic.

---

## 3. Core Interfaces

### `MJCLIRuntimeHost`

```typescript
export interface IMJCLIRuntimeHost {
  // Progress — host decides whether to show a spinner, JSON line, or nothing
  StartStep(label: string): void;
  UpdateStep(label: string): void;
  SucceedStep(label: string, detail?: string): void;
  FailStep(label: string, detail?: string): void;

  // Logging — host decides format/verbosity
  Log(message: string, level?: 'info' | 'warn' | 'error'): void;

  // Final result — host serializes per --format setting
  Emit(result: MJCLIResult): void;
}

export class MJCLIRuntimeHost implements IMJCLIRuntimeHost {
  constructor(private readonly format: OutputFormat, private readonly verbose: boolean) {}
  // Text mode uses ora + chalk; JSON mode redirects spinner to stderr, emits JSON to stdout
}

export type OutputFormat = 'text' | 'json' | 'md';
```

### `BaseCLIPlugin`

```typescript
export abstract class BaseCLIPlugin extends Command {
  // Declared here so all subclasses inherit them automatically
  static baseFlags = {
    format:   Flags.string({ options: ['text', 'json', 'md'], default: 'text' }),
    verbose:  Flags.boolean({ char: 'v', default: false }),
    'no-banner': Flags.boolean({ default: false }),
  };

  protected Host!: IMJCLIRuntimeHost;

  // oclif entry point — never override in subclasses
  async run(): Promise<void> {
    const { flags } = await this.parse(this.constructor as typeof BaseCLIPlugin);
    this.Host = new MJCLIRuntimeHost(flags.format as OutputFormat, flags.verbose);
    const result = await this.Execute();
    this.Host.Emit(result);
  }

  // Subclasses implement this — pure logic, no stdio
  protected abstract Execute(): Promise<MJCLIResult>;
}
```

### `MJCLIResult` — universal result shape

```typescript
export interface MJCLIResult {
  success: boolean;
  command: string;       // 'sync:push', 'codegen', 'migrate', etc.
  durationSeconds: number;
  data?: Record<string, unknown>;  // command-specific payload
  errors?: Array<{
    context?: string;    // entity name, file path, phase — whatever is relevant
    message: string;
  }>;
  warnings?: string[];
}
```

### Plugin registration

```typescript
// In @memberjunction/metadata-sync
@RegisterClass(BaseCLIPlugin, 'sync:push')
export class SyncPushPlugin extends BaseCLIPlugin {
  static flags = {
    ...BaseCLIPlugin.baseFlags,
    dir:       Flags.string({ description: 'Entity directory to push' }),
    'dry-run': Flags.boolean(),
    ci:        Flags.boolean(),
    // ... rest of sync:push flags
  };

  protected async Execute(): Promise<MJCLIResult> {
    const startTime = Date.now();
    this.Host.StartStep('Loading configuration');
    const config = await loadMJConfig();
    this.Host.SucceedStep('Configuration loaded');

    // ... business logic, calling this.Host.StartStep/SucceedStep/FailStep

    return {
      success: result.errors === 0,
      command: 'sync:push',
      durationSeconds: (Date.now() - startTime) / 1000,
      data: {
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        errors: result.errors,
      },
      errors: result.errorDetails,
      warnings: result.warnings,
    };
  }
}
```

---

## 4. Plugin Discovery and Config

A lightweight JSON config file enumerates which plugins are active. This is what makes the CLI truly dynamic:

```json
// mj-cli-plugins.json (in repo root or ~/.mj/)
{
  "plugins": [
    "@memberjunction/metadata-sync",
    "@memberjunction/codegen-lib",
    "@memberjunction/mj-migrate",
    "./local-plugins/my-custom-tool"
  ]
}
```

The CLI root loads all listed packages at startup, which triggers `@RegisterClass` decorators, which populates `ClassFactory`. The CLI then resolves the active command (`sync:push`, `codegen`, etc.) via `ClassFactory.GetInstance<BaseCLIPlugin>(BaseCLIPlugin, commandKey)`.

**Third-party plugins** work by: (1) creating a package with a `BaseCLIPlugin` subclass, (2) adding it to `mj-cli-plugins.json`. No MJCLI changes needed.

---

## 5. JSON Output Schema

The universal `MJCLIResult` serialized per command:

### `mj sync push --format=json`

```json
{
  "success": false,
  "command": "sync:push",
  "durationSeconds": 14.2,
  "data": {
    "created": 3, "updated": 8, "unchanged": 42,
    "deleted": 0, "skipped": 2, "deferred": 0
  },
  "errors": [
    {
      "context": "ai-agent-prompts/.ai-agent-prompts.json [MJ: AI Agent Prompts]",
      "message": "FK constraint failed: referenced AgentID does not exist"
    }
  ],
  "warnings": []
}
```

### `mj codegen --format=json`

```json
{
  "success": true,
  "command": "codegen",
  "durationSeconds": 38.7,
  "data": {
    "entityCount": 247,
    "skippedDb": false,
    "skippedFiles": false
  },
  "errors": [],
  "warnings": []
}
```

---

## 6. Confirmed Decisions

| # | Decision |
|---|---|
| D1 | **`BaseCLIPlugin` extends oclif `Command`.** oclif handles flag parsing, help generation, and command routing. We wrap the execution layer, not the framework. |
| D2 | **Plugins return data; `MJCLIRuntimeHost` renders it.** No `ora`, `chalk`, or `console` calls inside any plugin's `Execute()`. All stdio is the host's concern. |
| D3 | **`--format`, `--verbose`, `--no-banner` are declared on `BaseCLIPlugin.baseFlags`** and inherited by every subclass for free. No per-command flag duplication. |
| D4 | **JSON to stdout, decorative output to stderr when `--format=json`.** Unix convention: `mj sync push --format=json \| jq .errors` works cleanly. |
| D5 | **`--format=text` is the default.** Existing human-readable output is unchanged. This adds a parallel machine-readable path, not a replacement. |
| D6 | **`MJCLIResult` is the universal return type.** Command-specific detail goes in the typed `data` field. Errors always go in the `errors` array (full detail, not just a count). |
| D7 | **`--ci` keeps its current semantics (no-prompts, fail-on-error).** It does NOT auto-imply `--format=json` — CI users who already parse text output aren't broken. They can add `--format=json` explicitly when ready. |
| D8 | **Plugin registration via `mj-cli-plugins.json` in the root.** Lightweight, no new tooling. The CLI loads listed packages at startup; `@RegisterClass` does the rest. |
| D9 | **Third-party plugins work without touching MJCLI.** Add a package, register it in `mj-cli-plugins.json`. |
| D10 | **`--format=md` is a forward-looking slot** for AI chat UIs that want Markdown-fenced output. Implement when there's a consumer; the slot costs nothing to reserve now. |

---

## 7. What Already Exists (Preserved from v1)

| Existing asset | Where | Notes |
|---|---|---|
| `formatValidationResultAsJson()` | `FormattingService.ts:8` | JSON path already written for validation — style to follow for the host's JSON emitter |
| `--dry-run` flag | `sync/push.ts` | Migrates into `SyncPushPlugin` as-is |
| `--ci` flag | `sync/push.ts` | Migrates into `SyncPushPlugin` as-is |
| `result` object | `sync/push.ts:212` | Already structured — easy to map into `MJCLIResult.data` |
| Non-TTY detection | `ora-classic` | `MJCLIRuntimeHost` builds on this — spinner auto-disables, host adapts |
| `@RegisterClass` / `ClassFactory` | `@memberjunction/global` | Already the MJ standard for dynamic dispatch — no new mechanism needed |

---

## 8. Phases

### Phase 1 — Core abstraction (zero behavior change)

Establish `BaseCLIPlugin`, `IMJCLIRuntimeHost`, `MJCLIRuntimeHost`, `MJCLIResult` in a new lightweight package `@memberjunction/cli-core`. Wire the oclif root to load from `mj-cli-plugins.json`. In text mode the host delegates straight to the existing `ora`/`chalk` calls so behavior is identical.

**Files / packages:**

| Package | What's new |
|---|---|
| `packages/CLICore/` (new) | `BaseCLIPlugin`, `IMJCLIRuntimeHost`, `MJCLIRuntimeHost`, `MJCLIResult`, `OutputFormat` |
| `packages/MJCLI/src/index.ts` | Load `mj-cli-plugins.json`, use ClassFactory to dispatch |
| `mj-cli-plugins.json` (repo root) | Lists `@memberjunction/metadata-sync`, `@memberjunction/codegen-lib`, etc. |

**Success criterion:** `mj sync push` and `mj codegen` produce byte-for-byte identical output to today.

### Phase 2 — Migrate existing commands, add `--format=json`

Migrate `sync/push.ts`, `sync/pull.ts`, `codegen/index.ts`, and the remaining MJCLI commands to extend `BaseCLIPlugin`. Once migrated, `--format=json` works for all of them automatically via the host.

`runMemberJunctionCodeGeneration()` is updated to return `MJCLIResult` (was `void`) so `CodeGenPlugin` can forward the structured result.

**Files touched:**

| File | Change |
|---|---|
| `packages/MetadataSync/src/` | `SyncPushPlugin`, `SyncPullPlugin` replacing command classes |
| `packages/CodeGenLib/src/runCodeGen.ts` | Return `MJCLIResult` |
| `packages/CodeGenLib/src/` | `CodeGenPlugin` replacing command class |
| `packages/MJCLI/src/commands/` | Thin oclif shims that delegate to plugin, or deleted once CLI is fully dynamic |
| Tests | `MJCLIRuntimeHost` unit tests; each plugin's `Execute()` is now unit-testable in isolation |

**Success criterion:** `mj sync push --format=json | jq .errors` works. All existing `--format=text` output unchanged.

### Phase 3 — Third-party plugin support

Document the plugin authoring contract. Publish `@memberjunction/cli-core` so external packages can depend on it. Add a `mj plugin add <package>` convenience command that appends to `mj-cli-plugins.json`.

---

## 9. Usage Examples for AI Agents

```bash
# Check sync result programmatically
result=$(mj sync push --format=json --dir=ai-agents)
errors=$(echo "$result" | jq '.errors | length')
if [ "$errors" -gt 0 ]; then
  echo "$result" | jq '.errors[]'
fi

# Run codegen and extract entity count
mj codegen --format=json | jq '.data.entityCount'

# CI pipeline — structured log for downstream consumers
mj sync push --ci --format=json 2>/dev/null | tee sync-result.json
jq -e '.success' sync-result.json   # exit 1 if success=false
```

---

## 10. Open Questions

1. **`packages/CLICore/` or inline in `packages/MJCLI/`?** A separate package lets `@memberjunction/metadata-sync` depend on `@memberjunction/cli-core` without depending on `@memberjunction/cli`. If everything stays in MJCLI, MetadataSync can't register its plugin class without a circular dep. Separate package is the right call; just confirming.

2. **oclif command shims vs full replacement.** During migration we could keep thin oclif Command shims in `packages/MJCLI/src/commands/` that just call the plugin — or we could replace oclif's static command discovery entirely with our own ClassFactory dispatch. The shim approach is safer for Phase 1; the full replacement is cleaner long-term. Decision deferred to implementation.

3. **`--no-banner` on `mj sync`.** Should be a flag on `BaseCLIPlugin` (applying globally) or sync-specific? The banner is rendered by the host, so the host reads the flag — putting it on `BaseCLIPlugin.baseFlags` gives every command banner suppression for free. Seems right.

4. **Wait for PR #2836 (realtime infra) before Phase 1 cut.** PR #2836 may introduce new commands or change the MJCLI structure in ways that inform the plugin config list. Merge that first.
