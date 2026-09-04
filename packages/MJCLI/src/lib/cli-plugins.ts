import { CLIPluginRegistry } from '@memberjunction/cli-core';
import { RegisterDevWorkspaceUsage } from './dev-workspace/usage.js';
import { registerDerivedUsage, type OclifCommandShape } from './derived-usage.js';
import { DOMAIN_PROFILES } from './domain-profiles.js';

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
 *
 * Finally, when the caller passes oclif's own command list, every command that no
 * plugin declared gets a usage entry derived from oclif's manifest. Registration
 * order is load-bearing: plugin metadata is read first and `RegisterUsage` is
 * first-wins, so a migrated command keeps its curated entry and only the rest fall
 * back to derivation.
 */
export async function loadAllCliPlugins(
  searchFrom: string = process.cwd(),
  oclifCommands?: readonly OclifCommandShape[]
): Promise<void> {
  await import('@memberjunction/metadata-sync/plugins');
  await import('@memberjunction/codegen-lib/plugins');
  // The `dev` domain ships inside this CLI as plain oclif commands (they must stay
  // bootstrap-free), so it declares its usage through CLIPluginRegistry.RegisterUsage
  // on import rather than through a plugin's `static Usage`.
  RegisterDevWorkspaceUsage();
  const { failed } = await CLIPluginRegistry.LoadPluginsFromConfig(searchFrom);
  // Surface (don't swallow) any third-party plugin that failed to load. stderr
  // keeps stdout clean for `--format=json` consumers.
  for (const f of failed) {
    process.stderr.write(`Warning: could not load CLI plugin "${f.specifier}": ${f.error}\n`);
  }

  // Tier-1 domain summaries: a hand-written line beats one synthesized from N command
  // summaries. Registered for every profiled domain, including plugin-backed ones —
  // first-wins means a plugin that already declared one keeps it.
  for (const [domain, profile] of Object.entries(DOMAIN_PROFILES)) {
    CLIPluginRegistry.RegisterDomainSummary(domain, profile.summary);
  }

  if (oclifCommands?.length) registerDerivedUsage(oclifCommands);
}
