# Pluggable MJ CLI with AI-Agent-Friendly Output

**Branch:** `plan/ai-agent-console-dx`  
**Status:** Plan v3 — updated 2026-06-17 with @cadam11's progressive-disclosure + runtime-expectation feedback (endorsed by @AN-BC) from [PR #2838 review](https://github.com/MemberJunction/MJ/pull/2838). v2 (2026-06-14) added the pluggable `BaseCLIPlugin` / `MJCLIRuntimeHost` architecture.  
**Author:** Pranav (with Claude), 2026-06-13  
**Related work:** `chore(codegen): quiet startup chatter + add live/total timing` (e776c117d0), `fix mj sync push always exiting with code 0` (046633616c), PR #2836 (realtime infra — merge before implementation)

---

## 1. Problem

Four related problems, all addressed by the same pluggable architecture.

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

### 1c. Discovering commands burns agent context (@cadam11)

The `mj` CLI already exposes a large surface — `sync`, `codegen`, `migrate`, `ai`, `app`, `dbdoc`, `baseline`, `test`, `querygen`, `bump`, `doctor`, and more, many with their own subcommands and flags. An agent that runs `mj --help` (or guesses) to figure out how to do one task pulls the *entire* command tree into context — thousands of tokens, almost all irrelevant to the task at hand. Worse, when an agent guesses a flag rather than checking, it produces invalid invocations.

[linearis](https://github.com/linearis-oss/linearis#usage) solves this with **two-tier progressive disclosure**: `linearis usage` returns a ~200-token domain map, then `linearis <domain> usage` returns the 300–500-token reference for just that domain. A typical agent interaction costs ~500–700 tokens of context instead of ~13k, and the docs explicitly tell the agent: *"Do NOT guess flags or subcommands — check usage first."* We want the same for `mj`.

### 1d. Agents set timeouts too aggressively (@cadam11)

Agents wrap `mj` calls in a shell with a timeout. Commands like `mj codegen` (scales with entity count) and `mj migrate` (a full migration is far slower than a small incremental upgrade) can legitimately run for tens of seconds to minutes. With no runtime signal, an agent picks a default timeout and kills a healthy long-running command midway — corrupting state or wasting the run. The CLI should *tell* the agent how long a command typically takes so it can budget the timeout correctly.

Both 1c and 1d fall out naturally from the plugin architecture: each plugin declares its own usage + runtime metadata, and the host surfaces it uniformly.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  mj binary (oclif root)                                      │
│                                                              │
│  Reads mj-cli-plugins.json → ClassFactory.Load()            │
│  Routes flags (--format, --verbose, --no-banner) globally    │
│  Composes `mj usage` / `mj <domain> usage` from plugins      │
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

  // Runtime advisory — emitted before work starts so an agent can budget its
  // timeout (§5). Text mode: a dim one-liner. JSON mode: a `{event:'start', ...}`
  // line on stderr. Suppressed entirely for fast commands.
  AnnounceRuntime(usage: PluginUsage): void;

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

  // Every plugin declares its own usage + runtime metadata. The CLI root reads
  // these off the registered classes to assemble the progressive-disclosure
  // `mj usage` / `mj <domain> usage` surface and advertise timeouts (§5).
  static Usage: PluginUsage;

  protected Host!: IMJCLIRuntimeHost;

  // oclif entry point — never override in subclasses
  async run(): Promise<void> {
    const { flags } = await this.parse(this.constructor as typeof BaseCLIPlugin);
    this.Host = new MJCLIRuntimeHost(flags.format as OutputFormat, flags.verbose);
    // Host announces runtime expectation up front (stderr in JSON mode) so an
    // agent reading the stream can budget its timeout — see §6.
    this.Host.AnnounceRuntime((this.constructor as typeof BaseCLIPlugin).Usage);
    const result = await this.Execute();
    this.Host.Emit(result);
  }

  // Subclasses implement this — pure logic, no stdio
  protected abstract Execute(): Promise<MJCLIResult>;
}
```

### `PluginUsage` and `RuntimeHint` — discovery + timeout metadata

```typescript
export interface PluginUsage {
  domain: string;          // 'sync', 'codegen', 'migrate' — groups commands in `mj usage`
  command: string;         // 'sync:push', 'codegen', 'migrate' — the invocation key
  summary: string;         // one line, shown in the `mj usage` domain map (keep it terse)
  description?: string;    // fuller prose, shown only in `mj <domain> usage`
  flags?: Array<{ name: string; type: string; description: string }>;
  examples?: string[];     // copy-pasteable invocations
  runtime: RuntimeHint;
}

export interface RuntimeHint {
  // fast: <5s · moderate: 5–60s · slow: >60s · variable: depends on scope (see note)
  class: 'fast' | 'moderate' | 'slow' | 'variable';
  typicalSeconds?: number; // best-guess midpoint an agent can use to set a timeout
  note?: string;           // e.g. 'scales with entity count', 'full migration ≫ incremental'
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

  // Drives `mj sync usage` and the timeout advisory. Co-located with the plugin
  // so it can never drift from the actual flags.
  static Usage: PluginUsage = {
    domain: 'sync',
    command: 'sync:push',
    summary: 'Push local metadata files to the database (upsert).',
    description: 'Reads entity directories under --dir and creates/updates matching records. Runs validation first unless --no-validate.',
    flags: [
      { name: '--dir', type: 'string', description: 'Entity directory to push' },
      { name: '--dry-run', type: 'boolean', description: 'Report what would change without writing' },
      { name: '--ci', type: 'boolean', description: 'No prompts; non-zero exit on error' },
    ],
    examples: ['mj sync push --dir=ai-agents', 'mj sync push --ci --format=json'],
    runtime: { class: 'variable', typicalSeconds: 20, note: 'scales with number of records in --dir' },
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

## 5. Progressive-Disclosure Usage & Runtime Advisories

This section incorporates @cadam11's PR feedback (endorsed by @AN-BC). Because every plugin already declares a `static Usage: PluginUsage` (§3), the CLI gets both an LLM-friendly discovery surface and per-command timeout guidance with no extra per-command work.

### Two-tier usage (linearis model)

The `mj` surface is large (`sync`, `codegen`, `migrate`, `ai`, `app`, `dbdoc`, `baseline`, `test`, `querygen`, `bump`, `doctor`, …). Dumping it all into an agent's context is wasteful and invites flag-guessing. Following [linearis](https://github.com/linearis-oss/linearis#usage), we expose two tiers:

| Tier | Command | Returns | Budget |
|---|---|---|---|
| 1 — domains | `mj usage` | The domain map: each domain + one-line summary + runtime class. | ~200 tokens |
| 2 — domain detail | `mj <domain> usage` | Every command in that domain: summary, flags, examples, runtime. | ~300–500 tokens |
| 3 — single command | `mj <domain> <cmd> --help` | Full oclif help for one command (existing behavior, unchanged). | — |

An agent discovers capabilities once at tier 1, drills into only the domain it needs at tier 2, then invokes — instead of pulling the whole command tree (~13k tokens) up front.

**How it's assembled:** the CLI root enumerates every registered `BaseCLIPlugin` subclass via `ClassFactory`, reads each one's `static Usage`, and groups by `Usage.domain`. No central hardcoded help file — usage is composed dynamically from whatever plugins are loaded (including third-party ones from `mj-cli-plugins.json`). Each tier is just another `MJCLIResult`, so it honors `--format=json|text|md` like everything else.

```jsonc
// mj usage --format=json  (tier 1)
{
  "success": true, "command": "usage", "durationSeconds": 0.0,
  "data": {
    "guidance": "Run `mj <domain> usage` before invoking. Do NOT guess flags or subcommands.",
    "domains": [
      { "domain": "sync",    "summary": "Push/pull metadata between files and the database.", "runtime": "variable" },
      { "domain": "codegen", "summary": "Regenerate entities, SQL, and Angular forms from schema.", "runtime": "slow" },
      { "domain": "migrate", "summary": "Author and run Flyway database migrations.", "runtime": "variable" }
    ]
  }
}
```

```jsonc
// mj sync usage --format=json  (tier 2)
{
  "success": true, "command": "sync:usage", "durationSeconds": 0.0,
  "data": {
    "domain": "sync",
    "commands": [
      {
        "command": "sync:push",
        "summary": "Push local metadata files to the database (upsert).",
        "flags": [
          { "name": "--dir", "type": "string", "description": "Entity directory to push" },
          { "name": "--ci", "type": "boolean", "description": "No prompts; non-zero exit on error" }
        ],
        "examples": ["mj sync push --dir=ai-agents", "mj sync push --ci --format=json"],
        "runtime": { "class": "variable", "typicalSeconds": 20, "note": "scales with number of records in --dir" }
      }
    ]
  }
}
```

### Runtime expectations / timeout guidance

Agents wrap `mj` calls in a timeout. To stop them killing healthy long-running commands, every plugin's `Usage.runtime` advertises how long the command typically takes, and the host surfaces it two ways:

1. **In usage output** (above) — so an agent reading `mj <domain> usage` knows the timeout to set *before* invoking.
2. **As a start advisory** — `BaseCLIPlugin.run()` calls `Host.AnnounceRuntime()` before `Execute()`. In `--format=json` mode this is a stderr line; in text mode a dim note. Suppressed for `fast` commands so it doesn't add noise.

```jsonc
// stderr, JSON mode, emitted before codegen does any work
{ "event": "start", "command": "codegen", "runtime": { "class": "slow", "typicalSeconds": 45, "note": "scales with entity count" } }
```

Indicative classes for the headline commands (final numbers set during implementation against real runs):

| Command | Class | Typical | Note |
|---|---|---|---|
| `mj codegen` | slow | ~30–90s | scales with entity count; full run far slower than a single-entity change |
| `mj migrate` | variable | seconds → minutes | a full/baseline migration is far slower than a small incremental upgrade |
| `mj sync push` / `pull` | variable | ~10–60s | scales with number of records under `--dir` |
| `mj ai agents run` | variable | depends on agent | bounded by the agent's own work, not the CLI |
| `mj doctor`, `mj app list`, `mj sync status` | fast | <5s | no advisory emitted |

**Guidance baked into tier-1 output** tells the agent to read `runtime` and set its shell timeout to a generous multiple of `typicalSeconds` (or none, for `variable`/`slow` commands).

---

## 6. JSON Output Schema

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

## 7. Confirmed Decisions

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
| D11 | **Two-tier progressive-disclosure usage (`mj usage` → `mj <domain> usage`).** Composed dynamically from each plugin's `static Usage` (linearis model). Keeps agent discovery to ~500–700 tokens instead of the full ~13k command tree, and tells the agent to check usage rather than guess flags. (@cadam11, endorsed by @AN-BC.) |
| D12 | **Every plugin advertises a `RuntimeHint`.** Surfaced both in usage output and as a pre-execution start advisory, so agents budget timeouts and don't kill healthy long-running commands like `codegen`/`migrate`. (@cadam11.) |

---

## 8. What Already Exists (Preserved from v1)

| Existing asset | Where | Notes |
|---|---|---|
| `formatValidationResultAsJson()` | `FormattingService.ts:8` | JSON path already written for validation — style to follow for the host's JSON emitter |
| `--dry-run` flag | `sync/push.ts` | Migrates into `SyncPushPlugin` as-is |
| `--ci` flag | `sync/push.ts` | Migrates into `SyncPushPlugin` as-is |
| `result` object | `sync/push.ts:212` | Already structured — easy to map into `MJCLIResult.data` |
| Non-TTY detection | `ora-classic` | `MJCLIRuntimeHost` builds on this — spinner auto-disables, host adapts |
| `@RegisterClass` / `ClassFactory` | `@memberjunction/global` | Already the MJ standard for dynamic dispatch — no new mechanism needed |

---

## 9. Phases

### Phase 1 — Core abstraction (zero behavior change)

Establish `BaseCLIPlugin`, `IMJCLIRuntimeHost`, `MJCLIRuntimeHost`, `MJCLIResult`, `PluginUsage`, and `RuntimeHint` in a new lightweight package `@memberjunction/cli-core`. Wire the oclif root to load from `mj-cli-plugins.json`. Add the `mj usage` / `mj <domain> usage` dispatcher that composes tier-1/tier-2 output from registered plugins' `static Usage`. In text mode the host delegates straight to the existing `ora`/`chalk` calls so behavior is identical.

**Files / packages:**

| Package | What's new |
|---|---|
| `packages/CLICore/` (new) | `BaseCLIPlugin`, `IMJCLIRuntimeHost`, `MJCLIRuntimeHost`, `MJCLIResult`, `OutputFormat`, `PluginUsage`, `RuntimeHint` |
| `packages/MJCLI/src/index.ts` | Load `mj-cli-plugins.json`, ClassFactory dispatch, and `mj usage` / `mj <domain> usage` composition |
| `mj-cli-plugins.json` (repo root) | Lists `@memberjunction/metadata-sync`, `@memberjunction/codegen-lib`, etc. |

**Success criterion:** `mj sync push` and `mj codegen` produce byte-for-byte identical output to today; `mj usage` lists the migrated domains.

### Phase 2 — Migrate existing commands, add `--format=json`

Migrate `sync/push.ts`, `sync/pull.ts`, `codegen/index.ts`, and the remaining MJCLI commands to extend `BaseCLIPlugin`. Each migrated command declares its `static Usage` (summary, flags, examples, `RuntimeHint`). Once migrated, `--format=json`, the timeout advisory, and tier-2 `mj <domain> usage` all light up for that command automatically via the host.

`runMemberJunctionCodeGeneration()` is updated to return `MJCLIResult` (was `void`) so `CodeGenPlugin` can forward the structured result.

**Files touched:**

| File | Change |
|---|---|
| `packages/MetadataSync/src/` | `SyncPushPlugin`, `SyncPullPlugin` replacing command classes |
| `packages/CodeGenLib/src/runCodeGen.ts` | Return `MJCLIResult` |
| `packages/CodeGenLib/src/` | `CodeGenPlugin` replacing command class |
| `packages/MJCLI/src/commands/` | Thin oclif shims that delegate to plugin, or deleted once CLI is fully dynamic |
| Tests | `MJCLIRuntimeHost` unit tests; each plugin's `Execute()` is now unit-testable in isolation |

**Success criterion:** `mj sync push --format=json | jq .errors` works. `mj sync usage --format=json | jq '.data.commands[].runtime'` returns each command's timeout hint. All existing `--format=text` output unchanged.

### Phase 3 — Third-party plugin support

Document the plugin authoring contract. Publish `@memberjunction/cli-core` so external packages can depend on it. Add a `mj plugin add <package>` convenience command that appends to `mj-cli-plugins.json`.

---

## 10. Usage Examples for AI Agents

```bash
# Discover capabilities cheaply (tier 1 → tier 2), then act
mj usage --format=json | jq '.data.domains[].domain'   # ~200 tokens
mj sync usage --format=json | jq '.data.commands[] | {command, runtime}'  # only the sync domain

# Read the runtime hint and set the shell timeout from it (don't guess)
timeout_s=$(mj codegen usage --format=json | jq '.data.commands[0].runtime.typicalSeconds')

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

## 11. Open Questions

1. **`packages/CLICore/` or inline in `packages/MJCLI/`?** A separate package lets `@memberjunction/metadata-sync` depend on `@memberjunction/cli-core` without depending on `@memberjunction/cli`. If everything stays in MJCLI, MetadataSync can't register its plugin class without a circular dep. Separate package is the right call; just confirming.

2. **oclif command shims vs full replacement.** During migration we could keep thin oclif Command shims in `packages/MJCLI/src/commands/` that just call the plugin — or we could replace oclif's static command discovery entirely with our own ClassFactory dispatch. The shim approach is safer for Phase 1; the full replacement is cleaner long-term. Decision deferred to implementation.

3. **`--no-banner` on `mj sync`.** Should be a flag on `BaseCLIPlugin` (applying globally) or sync-specific? The banner is rendered by the host, so the host reads the flag — putting it on `BaseCLIPlugin.baseFlags` gives every command banner suppression for free. Seems right.

4. **Wait for PR #2836 (realtime infra) before Phase 1 cut.** PR #2836 may introduce new commands or change the MJCLI structure in ways that inform the plugin config list. Merge that first.
