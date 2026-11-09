/**
 * Base class for DBAutoDoc plugins.
 *
 * Subclass it, register it with `@RegisterClass(BaseAutoDocPlugin, '<Name>')`, and override
 * only the hooks you need. Every hook is optional and defaults to a no-op. A hook that throws
 * is recorded in the state file and does not stop the analysis run.
 */

import { RequiresSubclass } from '@memberjunction/global';
import type {
  AutoDocExporter,
  AutoDocPluginContext,
  AutoDocPluginHook,
  AutoDocPluginStateSection
} from './types.js';

// Never hand back a hollow base instance for an unknown plugin name.
@RequiresSubclass()
export abstract class BaseAutoDocPlugin {
  /** Runs after the state is loaded, before connecting to the database. */
  public async OnPreRun(_context: AutoDocPluginContext): Promise<void> {}

  /** Runs after schema introspection and data sampling. */
  public async OnAfterIntrospection(_context: AutoDocPluginContext): Promise<void> {}

  /** Runs after primary/foreign key discovery. */
  public async OnAfterDiscovery(_context: AutoDocPluginContext): Promise<void> {}

  /** Runs after the LLM description loop. */
  public async OnAfterDescriptions(_context: AutoDocPluginContext): Promise<void> {}

  /** Runs after key pruning (also runs when pruning is not configured). */
  public async OnAfterPruning(_context: AutoDocPluginContext): Promise<void> {}

  /** Runs last, while the database connection is still open. */
  public async OnPostRun(_context: AutoDocPluginContext): Promise<void> {}

  /** Export formats this plugin contributes to `db-auto-doc export --format`. */
  public GetExporters(): AutoDocExporter[] {
    return [];
  }

  /** Dispatches a hook name to the matching method. */
  public async RunHook(context: AutoDocPluginContext): Promise<void> {
    const handlers: Record<AutoDocPluginHook, (c: AutoDocPluginContext) => Promise<void>> = {
      PreRun: (c) => this.OnPreRun(c),
      AfterIntrospection: (c) => this.OnAfterIntrospection(c),
      AfterDiscovery: (c) => this.OnAfterDiscovery(c),
      AfterDescriptions: (c) => this.OnAfterDescriptions(c),
      AfterPruning: (c) => this.OnAfterPruning(c),
      PostRun: (c) => this.OnPostRun(c)
    };
    await handlers[context.Hook](context);
  }

  /** Reads this plugin's persisted data from the state file, if any. */
  protected GetData<T extends object>(context: AutoDocPluginContext, pluginName: string): T | undefined {
    return context.State.plugins?.[pluginName]?.Data as T | undefined;
  }

  /** Writes this plugin's data into its own section of the state file. */
  protected SetData<T extends object>(context: AutoDocPluginContext, pluginName: string, data: T): void {
    const section = BaseAutoDocPlugin.EnsureSection(context, pluginName);
    section.Data = data;
  }

  /** Returns the plugin's state section, creating it when missing. */
  public static EnsureSection(context: Pick<AutoDocPluginContext, 'State'>, pluginName: string): AutoDocPluginStateSection {
    if (!context.State.plugins) {
      context.State.plugins = {};
    }
    if (!context.State.plugins[pluginName]) {
      context.State.plugins[pluginName] = { Runs: [] };
    }
    return context.State.plugins[pluginName];
  }
}
