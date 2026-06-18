# @memberjunction/cli-core

Pluggable core for the MemberJunction `mj` CLI. Provides the primitives that let
commands be **machine-readable**, **discoverable**, and **pluggable** — so AI
coding agents (Claude Code, OpenCode, …) can drive `mj` reliably, and third
parties can add commands without modifying MJCLI.

## Why

`mj codegen`, `mj sync push/pull`, etc. are run constantly by humans *and* AI
agents. Humans get clean spinners and a summary box. Agents get four problems:

1. **No machine-readable output** — parsing chalk + box-drawing is fragile.
2. **Errors interleaved mid-run** — no collected error list.
3. **The banner burns context** — hundreds of captured chars before content.
4. **No runtime signal** — agents pick a timeout and kill healthy long-running
   commands (`codegen`, `migrate`) midway.

This package fixes all four with one architecture, and makes the CLI open to
third-party plugins as a side effect.

## Architecture

> **Principle:** plugins return *data* (`MJCLIResult`); the host *renders* it.
> No `ora`, `chalk`, or `console` inside a plugin's `Execute()`.

```
mj (oclif root)
 ├─ loads mj-cli-plugins.json → @RegisterClass populates ClassFactory
 ├─ composes `mj usage` / `mj <domain> usage` from each plugin's static Usage
 └─ routes a command → BaseCLIPlugin subclass
        │  injects MJCLIRuntimeHost (per --format)
        ▼
   BaseCLIPlugin                         MJCLIRuntimeHost
   - abstract Execute(): MJCLIResult     - text: ora spinner + chalk
   - this.Host.StartStep / Log / …       - json: events→stderr, result→stdout
   - declares static Usage               - md:   fenced ```json block
```

## Output formats (`--format`)

| Format | Result destination | Decorative output | Use |
|---|---|---|---|
| `text` (default) | — (plugin renders) | stdout (spinners/chalk) | humans |
| `json` | **stdout** (clean JSON) | **stderr** (`{event:…}`) | agents, `\| jq` |
| `md` | stdout (fenced block) | stderr | AI chat UIs |

`--verbose` / `--no-banner` are inherited by every plugin too.

## Progressive-disclosure usage (for agents)

```bash
mj usage --format=json | jq '.data.domains[].domain'        # tier 1 (~200 tokens)
mj sync usage --format=json | jq '.data.commands[].runtime' # tier 2 (one domain)
mj sync push --help                                         # tier 3 (full oclif help)
```

Tier 1 returns a domain map; tier 2 returns one domain's commands, flags,
examples, and **runtime hints**. The guidance string tells the agent to check
usage rather than guess flags. An agent discovers the surface in ~500–700 tokens
instead of pulling the whole ~13k command tree.

## Runtime hints / timeouts

Every plugin declares a `RuntimeHint` (`fast` <5s · `moderate` 5–60s · `slow`
>60s · `variable`). It's surfaced two ways so agents budget timeouts:

1. In usage output (read before invoking).
2. As a pre-execution advisory — `{event:'start', command, runtime}` on stderr
   (JSON mode) or a dim note (text). Suppressed for `fast` commands.

```bash
timeout_s=$(mj codegen usage --format=json | jq '.data.commands[0].runtime.typicalSeconds')
```

## Authoring a plugin

1. Create a package that depends on `@memberjunction/cli-core`.
2. Subclass `BaseCLIPlugin`, register it, declare flags + `static Usage`, and
   implement `Execute()`:

```typescript
import { Flags } from '@oclif/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseCLIPlugin, type MJCLIResult, type PluginUsage } from '@memberjunction/cli-core';

@RegisterClass(BaseCLIPlugin, 'widgets:build')
export class WidgetsBuildPlugin extends BaseCLIPlugin {
  static description = 'Build widgets';
  static flags = { dir: Flags.string({ description: 'Source directory' }) };

  static Usage: PluginUsage = {
    domain: 'widgets',
    command: 'widgets:build',
    summary: 'Compile widgets from source.',
    flags: [{ name: '--dir', type: 'string', description: 'Source directory' }],
    examples: ['mj widgets build --dir=src', 'mj widgets build --format=json'],
    runtime: { class: 'moderate', typicalSeconds: 20, note: 'scales with widget count' },
  };

  protected async Execute(): Promise<MJCLIResult> {
    const start = Date.now();
    const { flags } = await this.parse(WidgetsBuildPlugin);
    this.Host.StartStep('Building widgets');
    // … do work; collect errors instead of throwing …
    this.Host.SucceedStep('Built widgets');
    if (this.Host.Format === 'text') this.Host.Log('Done.');   // human-only rich text
    return { success: true, command: 'widgets:build', durationSeconds: (Date.now() - start) / 1000, data: { /* … */ } };
  }

  // Optional: release resources / force-exit to kill lingering handles.
  protected async Cleanup(result: MJCLIResult): Promise<void> { /* close pools */ }
}
```

3. Ship the plugin behind a **light subpath** (e.g. `@my-org/pkg/plugins`) that
   static-imports only `cli-core` + light deps and dynamic-imports any heavy
   engine inside `Execute()`. This keeps oclif manifest generation and `mj usage`
   enumeration cheap.

4. Register it so `mj` loads it:

```bash
mj plugin add @my-org/pkg/plugins
# appends to mj-cli-plugins.json — no MJCLI change needed
```

In the MemberJunction monorepo, MJCLI also keeps a one-line oclif shim under
`src/commands/` (`export { WidgetsBuildPlugin as default } from '…'`) so oclif
discovers and routes the command. The plugin's logic stays in its home package.

## Exports

- `BaseCLIPlugin` — abstract base (extends oclif `Command`).
- `MJCLIRuntimeHost` / `IMJCLIRuntimeHost` — the stdio host.
- `CLIPluginRegistry` — loads `mj-cli-plugins.json`, composes tier-1/tier-2 usage.
- Types: `MJCLIResult`, `OutputFormat`, `PluginUsage`, `RuntimeHint`, …
- `PLUGIN_CONFIG_FILENAME` — `"mj-cli-plugins.json"`.
