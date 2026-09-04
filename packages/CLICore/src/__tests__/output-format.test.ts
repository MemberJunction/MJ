import { describe, it, expect } from 'vitest';
import { ResolveOutputFormat, NormalizeFormatAlias, ShouldSuppressChrome, FORMAT_ENV } from '../output-format';

describe('NormalizeFormatAlias', () => {
  it('maps every family spelling onto the three canonical formats', () => {
    // The plugin family.
    expect(NormalizeFormatAlias('text')).toBe('text');
    expect(NormalizeFormatAlias('json')).toBe('json');
    expect(NormalizeFormatAlias('md')).toBe('md');
    // The `mj test *` family.
    expect(NormalizeFormatAlias('console')).toBe('text');
    expect(NormalizeFormatAlias('markdown')).toBe('md');
    // The `mj ai *` family.
    expect(NormalizeFormatAlias('compact')).toBe('text');
    expect(NormalizeFormatAlias('table')).toBe('text');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(NormalizeFormatAlias('  JSON ')).toBe('json');
    expect(NormalizeFormatAlias('Markdown')).toBe('md');
  });

  it('returns undefined for an unknown value so the caller can fall through', () => {
    expect(NormalizeFormatAlias('yaml')).toBeUndefined();
    expect(NormalizeFormatAlias('')).toBeUndefined();
    expect(NormalizeFormatAlias(undefined)).toBeUndefined();
  });
});

describe('ResolveOutputFormat', () => {
  it('defaults to text for a human at a terminal', () => {
    expect(ResolveOutputFormat({ env: {}, stdoutIsTTY: true })).toEqual({ format: 'text', reason: 'tty-default' });
  });

  it('switches to json when stdout is piped, with no flag required', () => {
    expect(ResolveOutputFormat({ env: {}, stdoutIsTTY: false })).toEqual({ format: 'json', reason: 'piped' });
  });

  it('lets an explicit --format beat the pipe in both directions', () => {
    // Piped but the caller wants human text anyway.
    expect(ResolveOutputFormat({ formatFlag: 'text', env: {}, stdoutIsTTY: false })).toEqual({
      format: 'text',
      reason: 'format-flag',
    });
    // On a TTY but the caller wants machine output.
    expect(ResolveOutputFormat({ formatFlag: 'json', env: {}, stdoutIsTTY: true })).toEqual({
      format: 'json',
      reason: 'format-flag',
    });
  });

  it('accepts a legacy alias on --format', () => {
    expect(ResolveOutputFormat({ formatFlag: 'markdown', env: {}, stdoutIsTTY: true }).format).toBe('md');
    expect(ResolveOutputFormat({ formatFlag: 'console', env: {}, stdoutIsTTY: false }).format).toBe('text');
  });

  it('honors the legacy --json boolean below --format', () => {
    expect(ResolveOutputFormat({ jsonFlag: true, env: {}, stdoutIsTTY: true })).toEqual({
      format: 'json',
      reason: 'json-flag',
    });
    // --format still wins over --json.
    expect(ResolveOutputFormat({ formatFlag: 'md', jsonFlag: true, env: {}, stdoutIsTTY: true }).format).toBe('md');
  });

  it('reads the env var below the flags and above TTY detection', () => {
    expect(ResolveOutputFormat({ env: { [FORMAT_ENV]: 'md' }, stdoutIsTTY: true })).toEqual({
      format: 'md',
      reason: 'env',
    });
    // The env var overrides the pipe default...
    expect(ResolveOutputFormat({ env: { [FORMAT_ENV]: 'text' }, stdoutIsTTY: false }).format).toBe('text');
    // ...but loses to an explicit flag.
    expect(ResolveOutputFormat({ formatFlag: 'json', env: { [FORMAT_ENV]: 'text' }, stdoutIsTTY: true }).format).toBe('json');
  });

  it('ignores an unparseable env value rather than failing the command', () => {
    expect(ResolveOutputFormat({ env: { [FORMAT_ENV]: 'yaml' }, stdoutIsTTY: true }).format).toBe('text');
  });
});

describe('ShouldSuppressChrome', () => {
  it('suppresses for any machine format regardless of TTY', () => {
    expect(ShouldSuppressChrome('json', true)).toBe(true);
    expect(ShouldSuppressChrome('md', true)).toBe(true);
  });

  it('allows chrome only for text on a real terminal', () => {
    expect(ShouldSuppressChrome('text', true)).toBe(false);
    // `--format=text > file.txt` must not write spinner escape codes into the file.
    expect(ShouldSuppressChrome('text', false)).toBe(true);
  });
});
