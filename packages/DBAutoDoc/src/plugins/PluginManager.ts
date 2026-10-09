/**
 * Loads, orders and runs DBAutoDoc plugins.
 *
 * Plugins come from two places:
 *  - built-ins shipped with this package (registered by importing `./builtins.js`), and
 *  - external modules named in the config file's `plugins[].Module`, loaded at runtime.
 *
 * Each plugin is created through MJ's ClassFactory by its registration key, so anyone can
 * ship a plugin as an npm package or a local file without changing DBAutoDoc.
 */

import * as path from 'path';
import { pathToFileURL } from 'node:url';
import { MJGlobal } from '@memberjunction/global';
import { BaseAutoDocPlugin } from './BaseAutoDocPlugin.js';
import { BUILT_IN_PLUGINS } from './builtins.js';
import type {
  AutoDocExporter,
  AutoDocPluginConfigEntry,
  AutoDocPluginContext,
  AutoDocPluginHook
} from './types.js';

const DEFAULT_PRIORITY = 100;

/** A plugin that resolved and is enabled for this run. */
export interface LoadedAutoDocPlugin {
  Entry: AutoDocPluginConfigEntry;
  Instance: BaseAutoDocPlugin;
}

/** The parts of a hook context the caller supplies; the manager adds the rest per plugin. */
export type AutoDocPluginRunContext = Omit<AutoDocPluginContext, 'Options' | 'Hook'>;

export class PluginManager {
  private loaded: LoadedAutoDocPlugin[] = [];

  /** Enabled plugins in execution order. Empty until {@link Load} runs. */
  public get Plugins(): LoadedAutoDocPlugin[] {
    return this.loaded;
  }

  /**
   * Resolves the effective plugin list (built-ins plus config entries), loads external
   * modules, and creates an instance of every enabled plugin.
   * Throws when an enabled plugin's name is not registered, so typos fail loudly.
   */
  public async Load(entries: AutoDocPluginConfigEntry[] | undefined): Promise<void> {
    const effective = PluginManager.MergeWithBuiltIns(entries ?? []);
    await PluginManager.LoadModules(effective);
    this.loaded = effective
      .filter((e) => e.Enabled !== false)
      .sort((a, b) => (a.Priority ?? DEFAULT_PRIORITY) - (b.Priority ?? DEFAULT_PRIORITY))
      .map((entry) => ({ Entry: entry, Instance: PluginManager.CreatePlugin(entry.Name) }));
  }

  /**
   * Runs one hook on every enabled plugin, in priority order. A failing plugin is logged and
   * recorded in its state section; the remaining plugins and the analysis run continue.
   */
  public async RunHook(hook: AutoDocPluginHook, context: AutoDocPluginRunContext): Promise<void> {
    for (const plugin of this.loaded) {
      await this.runOne(plugin, hook, context);
    }
  }

  /** Every exporter contributed by the loaded plugins. */
  public GetExporters(): AutoDocExporter[] {
    return this.loaded.flatMap((p) => p.Instance.GetExporters());
  }

  private async runOne(plugin: LoadedAutoDocPlugin, hook: AutoDocPluginHook, context: AutoDocPluginRunContext): Promise<void> {
    const startedAt = new Date().toISOString();
    const fullContext: AutoDocPluginContext = { ...context, Hook: hook, Options: plugin.Entry.Options ?? {} };
    let errorMessage: string | undefined;
    try {
      await plugin.Instance.RunHook(fullContext);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      context.Log(`Plugin '${plugin.Entry.Name}' failed in ${hook} (continuing): ${errorMessage}`);
    }
    BaseAutoDocPlugin.EnsureSection(context, plugin.Entry.Name).Runs.push({
      Hook: hook,
      StartedAt: startedAt,
      CompletedAt: new Date().toISOString(),
      Success: errorMessage === undefined,
      ErrorMessage: errorMessage
    });
  }

  /**
   * Adds every built-in plugin the config doesn't mention, using its default enabled state.
   * A config entry for a built-in (e.g. `{ "Name": "IndexAdvisor", "Enabled": false }`) wins.
   */
  public static MergeWithBuiltIns(entries: AutoDocPluginConfigEntry[]): AutoDocPluginConfigEntry[] {
    const named = new Set(entries.map((e) => e.Name.toLowerCase()));
    const missingBuiltIns = BUILT_IN_PLUGINS
      .filter((b) => !named.has(b.Name.toLowerCase()))
      .map((b) => ({ Name: b.Name, Enabled: b.EnabledByDefault }));
    return [...entries, ...missingBuiltIns];
  }

  /**
   * Imports every external plugin module named in the entries, so its `@RegisterClass`
   * decorators run. Relative paths resolve from the current working directory.
   */
  public static async LoadModules(entries: AutoDocPluginConfigEntry[]): Promise<void> {
    for (const entry of entries) {
      if (entry.Module && entry.Enabled !== false) {
        await PluginManager.importModule(entry.Module);
      }
    }
  }

  /** Creates one plugin by registration key, failing clearly when it isn't registered. */
  public static CreatePlugin(name: string): BaseAutoDocPlugin {
    const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseAutoDocPlugin>(BaseAutoDocPlugin, name);
    if (!result.Resolved || !result.Instance) {
      const known = PluginManager.RegisteredNames().join(', ') || '(none)';
      throw new Error(`DBAutoDoc plugin '${name}' is not registered. Registered plugins: ${known}`);
    }
    return result.Instance;
  }

  /** Registration keys of every plugin currently registered with the ClassFactory. */
  public static RegisteredNames(): string[] {
    return MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseAutoDocPlugin)
      .map((r) => r.Key)
      .filter((k): k is string => !!k);
  }

  private static async importModule(specifier: string): Promise<void> {
    const isPath = specifier.startsWith('.') || path.isAbsolute(specifier);
    const target = isPath ? pathToFileURL(path.resolve(specifier)).href : specifier;
    // Dynamic import is intentional: runtime plugin discovery from config (the module path is
    // only known at run time). DBAutoDoc runs outside the MJ runtime, where this is permitted.
    await import(target);
  }
}
