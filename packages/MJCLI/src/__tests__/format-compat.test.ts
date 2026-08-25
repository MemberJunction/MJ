import { describe, it, expect } from 'vitest';
import { FORMAT_ENV } from '@memberjunction/cli-core';
import {
  resolveLegacyFormat,
  CANONICAL_FORMAT_FLAG,
  TEST_FORMAT_MAP,
  AI_FORMAT_MAP,
} from '../lib/format-compat';

/** `mj test *`: the family flag IS `--format`, spelled console|json|markdown. */
function testFamily(format: string | undefined, opts: { stdoutIsTTY?: boolean; env?: NodeJS.ProcessEnv } = {}) {
  return resolveLegacyFormat({
    format,
    legacy: 'console' as const,
    legacyDefault: 'console' as const,
    map: TEST_FORMAT_MAP,
    stdoutIsTTY: opts.stdoutIsTTY ?? true,
    env: opts.env ?? {},
  });
}

/** `mj ai *`: the family flag is `--output`, spelled compact|json|table. */
function aiFamily(
  format: string | undefined,
  legacy: 'compact' | 'json' | 'table',
  opts: { stdoutIsTTY?: boolean; env?: NodeJS.ProcessEnv } = {}
) {
  return resolveLegacyFormat({
    format,
    legacy,
    legacyDefault: 'compact' as const,
    map: AI_FORMAT_MAP,
    stdoutIsTTY: opts.stdoutIsTTY ?? true,
    env: opts.env ?? {},
  });
}

describe('CANONICAL_FORMAT_FLAG', () => {
  it('accepts every family spelling so one --format works CLI-wide', () => {
    const options = CANONICAL_FORMAT_FLAG.options ?? [];
    for (const value of ['text', 'json', 'md', 'console', 'markdown', 'compact', 'table']) {
      expect(options).toContain(value);
    }
  });

  it('declares no default — the absence of a value is what enables TTY detection', () => {
    expect(CANONICAL_FORMAT_FLAG.default).toBeUndefined();
  });

  it('claims no short char, so it cannot deepen the existing -o/-f collision', () => {
    expect(CANONICAL_FORMAT_FLAG.char).toBeUndefined();
  });
});

describe('resolveLegacyFormat — canonical --format', () => {
  it('translates canonical values into each family vocabulary', () => {
    expect(testFamily('text')).toBe('console');
    expect(testFamily('json')).toBe('json');
    expect(testFamily('md')).toBe('markdown');

    expect(aiFamily('text', 'compact')).toBe('compact');
    expect(aiFamily('json', 'compact')).toBe('json');
  });

  it('accepts a family spelling on --format and maps it home', () => {
    // Someone types the `mj ai` word at a `mj test` command — it still works.
    expect(testFamily('compact')).toBe('console');
    expect(testFamily('markdown')).toBe('markdown');
    expect(aiFamily('markdown', 'compact')).toBe('json'); // no md renderer in this family
  });

  it('falls back to json for a family with no markdown renderer', () => {
    expect(AI_FORMAT_MAP.md).toBe('json');
  });
});

describe('resolveLegacyFormat — backwards compatibility', () => {
  it('honors an explicit legacy value over any inference', () => {
    // The existing `mj ai agents list -o table` keeps doing exactly what it did.
    expect(aiFamily(undefined, 'table')).toBe('table');
    expect(aiFamily(undefined, 'json')).toBe('json');
  });

  it('keeps an explicit legacy value even when stdout is piped', () => {
    expect(aiFamily(undefined, 'table', { stdoutIsTTY: false })).toBe('table');
  });

  it('lets an explicit --format beat an explicit legacy value', () => {
    // Both given: the canonical spelling is the one we are steering callers toward.
    expect(aiFamily('json', 'table')).toBe('json');
  });
});

describe('resolveLegacyFormat — pipe detection', () => {
  it('switches to the family json value when stdout is piped and nothing was specified', () => {
    expect(testFamily(undefined, { stdoutIsTTY: false })).toBe('json');
    expect(aiFamily(undefined, 'compact', { stdoutIsTTY: false })).toBe('json');
  });

  it('keeps the family default on a terminal', () => {
    expect(testFamily(undefined, { stdoutIsTTY: true })).toBe('console');
    expect(aiFamily(undefined, 'compact', { stdoutIsTTY: true })).toBe('compact');
  });

  it('honors MJ_CLI_FORMAT between the flags and the pipe', () => {
    expect(testFamily(undefined, { env: { [FORMAT_ENV]: 'markdown' } })).toBe('markdown');
    // env overrides the pipe default...
    expect(testFamily(undefined, { stdoutIsTTY: false, env: { [FORMAT_ENV]: 'text' } })).toBe('console');
    // ...but loses to an explicit flag.
    expect(testFamily('json', { env: { [FORMAT_ENV]: 'text' } })).toBe('json');
  });

  it('never flattens a family default to a generic text value on a terminal', () => {
    // 'compact' and 'table' are distinct human renderings; TTY detection must not
    // collapse them into whatever map.text happens to be.
    expect(aiFamily(undefined, 'compact', { stdoutIsTTY: true })).toBe('compact');
  });
});
