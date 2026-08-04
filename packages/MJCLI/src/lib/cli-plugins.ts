import { CLIPluginRegistry } from '@memberjunction/cli-core';

/**
 * Loads all CLI plugins so their `@RegisterClass(BaseCLIPlugin, …)` decorators
 * populate the ClassFactory — the basis for the `mj usage` / `mj <domain> usage`
 * progressive-disclosure surface (plan §5).
 *
 * The metadata-sync and codegen-lib plugin entry points ship WITH the CLI, so
 * they're loaded unconditionally as built-ins (available even when no
 * `mj-cli-plugins.json` is present). Any third-party plugins listed in that file
 * are then loaded on top.
 *
 * These plugin modules are intentionally light — they static-import only
 * cli-core + oclif + global and dynamic-import their heavy engines at execution
 * time — so loading them here for usage composition is cheap.
 */
export async function loadAllCliPlugins(searchFrom: string = process.cwd()): Promise<void> {
  await import('@memberjunction/metadata-sync/plugins');
  await import('@memberjunction/codegen-lib/plugins');
  const { failed } = await CLIPluginRegistry.LoadPluginsFromConfig(searchFrom);
  // Surface (don't swallow) any third-party plugin that failed to load. stderr
  // keeps stdout clean for `--format=json` consumers.
  for (const f of failed) {
    process.stderr.write(`Warning: could not load CLI plugin "${f.specifier}": ${f.error}\n`);
  }
}
