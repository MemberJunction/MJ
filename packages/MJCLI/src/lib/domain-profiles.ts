import type { RuntimeHint } from '@memberjunction/cli-core';

/**
 * Per-domain runtime + summary for the commands that are still plain oclif
 * `Command`s rather than `BaseCLIPlugin` subclasses.
 *
 * This table is deliberately the ONLY hand-maintained part of the usage surface.
 * Everything else about an unmigrated command — its description, flags, and
 * examples — is derived from oclif's own manifest at runtime (see
 * `derived-usage.ts`), so it cannot drift from the actual command.
 *
 * What lives here is exactly what oclif does not know: how long a command tends to
 * run (so an agent can budget a timeout) and a one-line domain summary for the
 * tier-1 map. A domain missing from this table still appears — it just falls back
 * to {@link DEFAULT_DOMAIN_PROFILE}, so adding a command can never make `mj usage`
 * lie by omission.
 */
export interface DomainProfile {
  /** One line for the tier-1 `mj usage` map. */
  Summary: string;
  /** Timeout budget for the slowest command in the domain. */
  Runtime: RuntimeHint;
}

/**
 * Applied to any domain not listed below. `variable` is the honest answer for an
 * undocumented command — it tells an agent "I don't know, don't set a tight timeout"
 * rather than implying a fast run.
 */
export const DEFAULT_DOMAIN_PROFILE: DomainProfile = {
  Summary: 'See `mj <domain> usage` for this domain’s commands.',
  Runtime: { class: 'variable', note: 'no runtime profile declared for this domain' },
};

/**
 * Per-domain profiles.
 *
 * Domains whose commands ship as `BaseCLIPlugin` plugins (`sync`, `codegen`) still
 * appear here: a plugin declares usage per COMMAND, and the tier-1 map needs a line
 * for the DOMAIN. Without one, a multi-command domain renders as one command's
 * summary plus "(+7 more commands)", which tells an agent nothing about what the
 * domain is for. The per-command metadata those plugins declare is untouched —
 * `RegisterUsage` is first-wins and reads plugin metadata first.
 */
export const DOMAIN_PROFILES: Readonly<Record<string, DomainProfile>> = {
  codegen: {
    Summary: 'Regenerate entities, SQL, and Angular forms from the database schema.',
    Runtime: { class: 'slow', typicalSeconds: 120, note: 'scales with entity count; a full run ≫ a single-entity change' },
  },
  sync: {
    Summary: 'Move metadata between local files and the database — push, pull, validate, watch.',
    Runtime: { class: 'variable', note: 'a status check is instant; a full push scales with record count' },
  },
  dev: {
    Summary: 'Local development tooling, including the cross-repo pnpm workspace generator.',
    Runtime: { class: 'variable', note: 'generation is fast; a workspace install is not' },
  },
  ai: {
    Summary: 'Run and inspect AI agents, prompts, and actions from the terminal.',
    Runtime: { class: 'variable', note: 'a listing is instant; an agent run is bounded only by the agent itself' },
  },
  app: {
    Summary: 'Install, upgrade, enable, and remove Open Apps.',
    Runtime: { class: 'slow', typicalSeconds: 180, note: 'installs run migrations and package installs' },
  },
  artifacts: {
    Summary: 'Maintenance operations over stored conversation artifacts.',
    Runtime: { class: 'moderate', typicalSeconds: 30, note: 'scales with artifact count' },
  },
  baseline: {
    Summary: 'Build and compare database baselines for clean-room verification.',
    Runtime: { class: 'slow', typicalSeconds: 120, note: 'full schema introspection; scales with table count' },
  },
  bump: {
    Summary: 'Bump the version across workspace package.json files.',
    Runtime: { class: 'fast' },
  },
  bundle: {
    Summary: 'Bundle interactive component source for distribution.',
    Runtime: { class: 'moderate', typicalSeconds: 20 },
  },
  clean: {
    Summary: 'Remove build artifacts and generated output.',
    Runtime: { class: 'fast' },
  },
  dbdoc: {
    Summary: 'Generate and export AI-authored database documentation.',
    Runtime: { class: 'slow', typicalSeconds: 300, note: 'LLM-driven; scales with table and column count' },
  },
  doctor: {
    Summary: 'Diagnose the local MJ environment and report what is misconfigured.',
    Runtime: { class: 'moderate', typicalSeconds: 15 },
  },
  install: {
    Summary: 'Install MemberJunction, or seed the Claude Code pack into a repo.',
    Runtime: { class: 'slow', typicalSeconds: 300, note: 'downloads a release, installs packages, runs migrations' },
  },
  migrate: {
    Summary: 'Create, run, and convert Flyway migrations.',
    Runtime: { class: 'slow', typicalSeconds: 90, note: 'scales with the number of pending migrations' },
  },
  plugin: {
    Summary: 'Register third-party CLI plugins in mj-cli-plugins.json.',
    Runtime: { class: 'fast' },
  },
  querygen: {
    Summary: 'Generate, validate, and export stored queries.',
    Runtime: { class: 'slow', typicalSeconds: 120, note: 'LLM-driven generation; validation alone is fast' },
  },
  'sql-audit': {
    Summary: 'Audit SQL objects for drift against the metadata.',
    Runtime: { class: 'moderate', typicalSeconds: 45, note: 'scales with object count' },
  },
  'sql-convert': {
    Summary: 'Convert T-SQL to PostgreSQL via the SQLConverter toolchain.',
    Runtime: { class: 'moderate', typicalSeconds: 30 },
  },
  standards: {
    Summary: 'List, adopt, and check the repo’s adopted MJ standards.',
    Runtime: { class: 'moderate', typicalSeconds: 20, note: 'a check scans changed files; --all scans the repo' },
  },
  test: {
    Summary: 'Run, list, compare, and validate MJ test suites.',
    Runtime: { class: 'variable', note: 'a single test is seconds; a full suite can run for many minutes' },
  },
  'translate-sql': {
    Summary: 'Translate SQL between dialects.',
    Runtime: { class: 'moderate', typicalSeconds: 15 },
  },
  update: {
    Summary: 'Update installed MJ tooling, including the Claude Code pack.',
    Runtime: { class: 'moderate', typicalSeconds: 30, note: 'fetches from GitHub unless --from is given' },
  },
  usage: {
    Summary: 'This progressive-disclosure surface: domains, then per-domain detail.',
    Runtime: { class: 'fast' },
  },
};

/** The profile for a domain, falling back to {@link DEFAULT_DOMAIN_PROFILE}. */
export function GetDomainProfile(domain: string): DomainProfile {
  return DOMAIN_PROFILES[domain] ?? DEFAULT_DOMAIN_PROFILE;
}

/** @deprecated Use {@link GetDomainProfile}. */
export function getDomainProfile(domain: string): DomainProfile {
  return GetDomainProfile(domain);
}
