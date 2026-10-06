import { describe, it, expect } from 'vitest';
import { SerializeResult } from '../serialize';
import { MJ_CLI_RESULT_VERSION, MJCLIErrorCodes, type MJCLIResult } from '../types';

const result: MJCLIResult = {
  success: false,
  command: 'sync:push',
  durationSeconds: 1.2,
  data: { created: 3 },
  errors: [
    {
      context: 'metadata/entities',
      message: 'No mj.config.cjs found.',
      code: MJCLIErrorCodes.NoConfig,
      suggestion: 'Run `mj sync init` in this directory first.',
    },
  ],
};

describe('SerializeResult', () => {
  it('stamps the contract version so an agent can detect envelope drift', () => {
    const parsed = JSON.parse(SerializeResult(result, 'json'));
    expect(parsed.version).toBe(MJ_CLI_RESULT_VERSION);
  });

  it('leads the envelope with version rather than burying it', () => {
    expect(Object.keys(JSON.parse(SerializeResult(result, 'json')))[0]).toBe('version');
  });

  it('does not overwrite a version the caller set deliberately', () => {
    const parsed = JSON.parse(SerializeResult({ ...result, version: '99' }, 'json'));
    expect(parsed.version).toBe('99');
  });

  it('backfills the default when the caller passed version: undefined explicitly', () => {
    const parsed = JSON.parse(SerializeResult({ ...result, version: undefined }, 'json'));
    expect(parsed.version).toBe(MJ_CLI_RESULT_VERSION);
  });

  it('round-trips the machine-actionable error fields', () => {
    const parsed = JSON.parse(SerializeResult(result, 'json'));
    expect(parsed.errors[0]).toMatchObject({
      code: 'E_NO_CONFIG',
      suggestion: 'Run `mj sync init` in this directory first.',
    });
  });

  it('emits one compact line by default — cheap to pipe, cheap to hold in context', () => {
    const out = SerializeResult(result, 'json');
    expect(out).not.toContain('\n');
    expect(JSON.parse(out).command).toBe('sync:push');
  });

  it('pretty-prints when the caller says a human is watching', () => {
    const out = SerializeResult(result, 'json', { pretty: true });
    expect(out).toContain('\n');
    expect(out).toContain('  "command": "sync:push"');
    expect(JSON.parse(out).command).toBe('sync:push');
  });

  it('always pretty-prints md, which is read by a human in a chat UI', () => {
    const out = SerializeResult(result, 'md');
    expect(out.startsWith('```json\n')).toBe(true);
    expect(out.endsWith('\n```')).toBe(true);
    const body = out.slice('```json\n'.length, -'\n```'.length);
    expect(body).toContain('\n');
    expect(JSON.parse(body).version).toBe(MJ_CLI_RESULT_VERSION);
  });

  it('returns the empty string for text — the plugin renders its own human output', () => {
    expect(SerializeResult(result, 'text')).toBe('');
    expect(SerializeResult(result, 'text', { pretty: true })).toBe('');
  });

  it('does not mutate the caller’s result object', () => {
    const input: MJCLIResult = { success: true, command: 'codegen', durationSeconds: 0 };
    SerializeResult(input, 'json');
    expect(input.version).toBeUndefined();
  });
});
