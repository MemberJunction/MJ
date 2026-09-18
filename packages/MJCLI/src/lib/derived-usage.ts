/**
 * Derives `mj usage` entries for the commands that are still plain oclif
 * `Command`s, straight from oclif's own manifest.
 *
 * Why derive rather than hand-write: `mj usage` tier 1 tells an agent
 * *"Run `mj <domain> usage` before invoking. Do NOT guess flags."* — so a domain
 * absent from that map reads as "this domain does not exist". Before this, only the
 * handful of `BaseCLIPlugin` domains were registered, and the map confidently
 * advertised a fraction of the CLI. A map that lies by omission is worse than no map,
 * because an agent has no way to tell the difference.
 *
 * Hand-writing 80-odd `PluginUsage` literals would have fixed it once and rotted
 * immediately. oclif already holds every command's description, flags, and examples
 * and cannot fall out of sync with itself, so the only thing left to hand-maintain
 * is what oclif genuinely doesn't know: the runtime budget (see `domain-profiles.ts`).
 *
 * Registration is additive and never overwrites: `CLIPluginRegistry.RegisterUsage`
 * keeps the first entry per command key, and plugin-declared `static Usage` is read
 * first, so a migrated command always keeps its richer, curated metadata.
 */
import { CLIPluginRegistry, type PluginUsage, type PluginUsageFlag } from '@memberjunction/cli-core';
import { getDomainProfile } from './domain-profiles.js';

/**
 * The slice of oclif's `Command.Loadable` this module reads.
 *
 * Declared structurally rather than imported so the derivation can be unit-tested
 * with plain literals, and so a future oclif shape change surfaces here rather than
 * in every caller.
 */
export interface OclifCommandShape {
  id: string;
  description?: string;
  summary?: string;
  hidden?: boolean;
  flags?: Record<string, OclifFlagShape | undefined>;
  examples?: ReadonlyArray<string | { command?: string; description?: string }>;
}

/** The slice of an oclif flag definition this module reads. */
export interface OclifFlagShape {
  type?: string;
  description?: string;
  char?: string;
  options?: readonly string[];
  required?: boolean;
}

/**
 * oclif's own built-in plugin commands. They are real commands, but they are not part
 * of MJ's surface — advertising `help` and `version` as top-level *domains* in the
 * tier-1 map would push two non-domains ahead of real ones for no benefit.
 */
const BUILT_IN_COMMANDS: ReadonlySet<string> = new Set(['help', 'version']);

/** oclif ids are colon-separated internally but render with the configured separator. */
function normalizeCommandKey(id: string): string {
  return id.trim().replace(/[\s:]+/g, ':');
}

/** The domain is the first segment: `sync:push` → `sync`, `codegen` → `codegen`. */
export function domainOf(commandId: string): string {
  return normalizeCommandKey(commandId).split(':')[0] ?? commandId;
}

/**
 * First sentence (or first line) of a description, for the one-line summary.
 * oclif descriptions are frequently multi-paragraph; the tier-1 map has room for one line.
 */
function firstLine(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  if (!line) return undefined;
  const sentence = /^(.*?[.!?])(\s|$)/.exec(line);
  return (sentence?.[1] ?? line).trim();
}

/** oclif accepts examples as strings or `{command, description}` objects. */
function normalizeExamples(examples: OclifCommandShape['examples']): string[] | undefined {
  if (!examples?.length) return undefined;
  const out = examples
    .map((e) => (typeof e === 'string' ? e : e.command))
    .filter((e): e is string => typeof e === 'string' && e.length > 0);
  return out.length > 0 ? out : undefined;
}

/** Converts oclif's flag record to the usage surface's flag list, options included. */
function normalizeFlags(flags: OclifCommandShape['flags']): PluginUsageFlag[] | undefined {
  if (!flags) return undefined;
  const out: PluginUsageFlag[] = [];
  for (const [name, def] of Object.entries(flags)) {
    if (!def) continue;
    const type = def.options?.length ? def.options.join('|') : (def.type ?? 'string');
    const parts = [def.description ?? ''];
    if (def.char) parts.push(`(-${def.char})`);
    if (def.required) parts.push('(required)');
    out.push({ name: `--${name}`, type, description: parts.filter(Boolean).join(' ').trim() });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Synthesizes a {@link PluginUsage} from one oclif command definition.
 *
 * Exported for testing — the registration path below is what production calls.
 */
export function deriveUsage(command: OclifCommandShape): PluginUsage {
  const key = normalizeCommandKey(command.id);
  const domain = domainOf(key);
  const profile = getDomainProfile(domain);
  const description = command.description ?? command.summary;

  return {
    domain,
    command: key,
    summary: command.summary ?? firstLine(description) ?? `mj ${key.replace(/:/g, ' ')}`,
    description,
    flags: normalizeFlags(command.flags),
    examples: normalizeExamples(command.examples),
    runtime: profile.runtime,
  };
}

/**
 * Registers derived usage for every visible oclif command.
 *
 * Hidden commands and oclif's own built-ins (`help`, `version`) are skipped — the
 * former are hidden from humans, so advertising them to an agent would be a strictly
 * worse kind of surprise; the latter are not MJ domains. Already-registered commands
 * (plugins, and the `dev` domain's explicit registrations) are left alone by
 * `RegisterUsage`'s first-wins rule.
 *
 * Returns the keys it registered, so a caller or test can assert coverage.
 */
export function registerDerivedUsage(commands: readonly OclifCommandShape[]): string[] {
  const registered: string[] = [];
  for (const command of commands) {
    if (!command?.id || command.hidden) continue;
    if (BUILT_IN_COMMANDS.has(normalizeCommandKey(command.id))) continue;
    const usage = deriveUsage(command);
    CLIPluginRegistry.RegisterUsage(usage);
    registered.push(usage.command);
  }
  return registered;
}
