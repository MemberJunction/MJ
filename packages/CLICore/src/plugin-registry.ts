import { existsSync, readFileSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';
import { pathToFileURL } from 'url';
import { MJGlobal } from '@memberjunction/global';
import { BaseCLIPlugin } from './base-cli-plugin';
import type { MJCLIResult, PluginUsage, RuntimeHint } from './types';

/** Filename enumerating active plugin entry points (plan §4 / D8). */
export const PLUGIN_CONFIG_FILENAME = 'mj-cli-plugins.json';

interface PluginConfigFile {
  plugins?: string[];
}

/** Outcome of {@link CLIPluginRegistry.LoadPluginsFromConfig}. */
export interface PluginLoadResult {
  /** Specifiers that imported successfully. */
  loaded: string[];
  /** Specifiers that failed to import, with the error, so callers can log them. */
  failed: Array<{ specifier: string; error: string }>;
}

/** Tier-1 domain map entry. */
export interface UsageDomainSummary {
  domain: string;
  summary: string;
  runtime: RuntimeHint['class'];
}

/** Tier-1 result payload. */
export interface UsageDomainMap {
  guidance: string;
  domains: UsageDomainSummary[];
}

/** Tier-2 result payload (one domain's commands). */
export interface UsageDomainDetail {
  domain: string;
  commands: PluginUsage[];
}

const GUIDANCE = 'Run `mj <domain> usage` before invoking. Do NOT guess flags or subcommands.';

/**
 * Loads CLI plugin packages and composes the progressive-disclosure usage surface
 * (`mj usage` → `mj <domain> usage`) dynamically from each registered plugin's
 * `static Usage` (plan §5, the linearis model). There is no central hardcoded
 * help file — usage is whatever plugins are loaded, including third-party ones.
 */
export class CLIPluginRegistry {
  /**
   * Walks up from {@link startDir} looking for `mj-cli-plugins.json`, then
   * dynamic-imports each listed entry point so its `@RegisterClass(BaseCLIPlugin, …)`
   * decorators populate the ClassFactory. Safe to call repeatedly — imports are
   * cached by the module loader. Returns the list of specifiers it loaded.
   */
  static async LoadPluginsFromConfig(startDir: string = process.cwd()): Promise<PluginLoadResult> {
    const result: PluginLoadResult = { loaded: [], failed: [] };

    const configPath = this.findConfig(startDir);
    if (!configPath) return result;

    let parsed: PluginConfigFile;
    try {
      parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as PluginConfigFile;
    } catch (e) {
      result.failed.push({ specifier: configPath, error: `Invalid ${PLUGIN_CONFIG_FILENAME}: ${e instanceof Error ? e.message : String(e)}` });
      return result;
    }

    const specifiers = Array.isArray(parsed.plugins) ? parsed.plugins : [];
    const configDir = dirname(configPath);

    for (const specifier of specifiers) {
      try {
        await this.importSpecifier(specifier, configDir);
        result.loaded.push(specifier);
      } catch (e) {
        // A broken/optional plugin must not take down the whole CLI; record the
        // failure so the caller can surface it under --verbose rather than
        // swallowing it silently.
        result.failed.push({ specifier, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return result;
  }

  /**
   * Resolves a plugin entry point. Package specifiers (`@scope/pkg`,
   * `@scope/pkg/plugins`) import as-is; relative paths resolve against the config
   * file's directory and convert to a file URL for ESM import.
   */
  private static async importSpecifier(specifier: string, configDir: string): Promise<void> {
    if (specifier.startsWith('.') || isAbsolute(specifier)) {
      const abs = isAbsolute(specifier) ? specifier : resolve(configDir, specifier);
      await import(pathToFileURL(abs).href);
    } else {
      await import(specifier);
    }
  }

  /** First `mj-cli-plugins.json` found walking up from {@link startDir}. */
  private static findConfig(startDir: string): string | null {
    let dir = resolve(startDir);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const candidate = resolve(dir, PLUGIN_CONFIG_FILENAME);
      if (existsSync(candidate)) return candidate;
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  /** Every registered plugin's usage metadata, de-duplicated by command key. */
  static GetAllUsage(): PluginUsage[] {
    const regs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseCLIPlugin);
    const byCommand = new Map<string, PluginUsage>();
    for (const reg of regs) {
      const usage = (reg.SubClass as typeof BaseCLIPlugin | undefined)?.Usage;
      if (usage?.domain && usage?.command && !byCommand.has(usage.command)) {
        byCommand.set(usage.command, usage);
      }
    }
    return [...byCommand.values()];
  }

  /** Tier-1: the domain map — each domain + one-line summary + runtime class. */
  static BuildDomainMap(): UsageDomainMap {
    const usages = this.GetAllUsage();
    const byDomain = new Map<string, PluginUsage[]>();
    for (const u of usages) {
      const list = byDomain.get(u.domain) ?? [];
      list.push(u);
      byDomain.set(u.domain, list);
    }

    const domains: UsageDomainSummary[] = [...byDomain.entries()]
      .map(([domain, cmds]) => ({
        domain,
        summary: this.domainSummary(domain, cmds),
        runtime: this.domainRuntimeClass(cmds),
      }))
      .sort((a, b) => a.domain.localeCompare(b.domain));

    return { guidance: GUIDANCE, domains };
  }

  /** Tier-2: every command in {@link domain} with summary, flags, examples, runtime. */
  static BuildDomainDetail(domain: string): UsageDomainDetail {
    const target = domain.trim().toLowerCase();
    const commands = this.GetAllUsage()
      .filter((u) => u.domain.toLowerCase() === target)
      .sort((a, b) => a.command.localeCompare(b.command));
    return { domain, commands };
  }

  /** Wraps a tier payload in the universal {@link MJCLIResult} shape. */
  static AsResult(command: string, data: Record<string, unknown>): MJCLIResult {
    return { success: true, command, durationSeconds: 0, data };
  }

  /**
   * A domain summary: if a single command's summary best represents the domain
   * use it; otherwise join the command summaries compactly.
   */
  private static domainSummary(domain: string, cmds: PluginUsage[]): string {
    if (cmds.length === 1) return cmds[0].summary;
    // Prefer a command whose key equals the domain (e.g. 'codegen').
    const headline = cmds.find((c) => c.command === domain);
    if (headline) return headline.summary;
    // Avoid a run-on line for 3+ commands: lead with the first summary + a count.
    if (cmds.length >= 3) return `${cmds[0].summary} (+${cmds.length - 1} more commands)`;
    return cmds.map((c) => c.summary).join(' ');
  }

  /**
   * The "loosest" runtime class across a domain's commands, so an agent setting a
   * single domain-wide timeout errs on the generous side.
   * Ordering: variable > slow > moderate > fast.
   */
  private static domainRuntimeClass(cmds: PluginUsage[]): RuntimeHint['class'] {
    const order: RuntimeHint['class'][] = ['fast', 'moderate', 'slow', 'variable'];
    let worst: RuntimeHint['class'] = 'fast';
    for (const c of cmds) {
      if (order.indexOf(c.runtime.class) > order.indexOf(worst)) worst = c.runtime.class;
    }
    return worst;
  }
}
