import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJCLIRuntimeHost } from '../runtime-host';
import type { MJCLIResult, PluginUsage } from '../types';

const sampleResult: MJCLIResult = {
  success: false,
  command: 'sync:push',
  durationSeconds: 1.2,
  data: { created: 3, updated: 1 },
  errors: [{ context: 'foo', message: 'bar' }],
  warnings: [],
};

const slowUsage: PluginUsage = {
  domain: 'codegen',
  command: 'codegen',
  summary: 'Regenerate code.',
  runtime: { class: 'slow', typicalSeconds: 45, note: 'scales with entity count' },
};

const fastUsage: PluginUsage = {
  domain: 'doctor',
  command: 'doctor',
  summary: 'Diagnostics.',
  runtime: { class: 'fast' },
};

describe('MJCLIRuntimeHost', () => {
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdout.push(chunk.toString());
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderr.push(chunk.toString());
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Emit', () => {
    it('writes JSON result to stdout in json mode', () => {
      const host = new MJCLIRuntimeHost('json');
      host.Emit(sampleResult);
      const out = JSON.parse(stdout.join(''));
      expect(out.command).toBe('sync:push');
      expect(out.errors).toHaveLength(1);
      expect(stderr.join('')).toBe('');
    });

    it('writes a fenced json block to stdout in md mode', () => {
      const host = new MJCLIRuntimeHost('md');
      host.Emit(sampleResult);
      const out = stdout.join('');
      expect(out.startsWith('```json')).toBe(true);
      expect(out.trimEnd().endsWith('```')).toBe(true);
    });

    it('writes nothing to stdout in text mode (plugin owns human output)', () => {
      const host = new MJCLIRuntimeHost('text');
      host.Emit(sampleResult);
      expect(stdout.join('')).toBe('');
    });
  });

  describe('progress in json mode → stderr only', () => {
    it('routes steps and logs to stderr, keeping stdout clean', () => {
      const host = new MJCLIRuntimeHost('json');
      host.StartStep('loading');
      host.SucceedStep('loaded');
      host.Log('a note');
      host.Emit({ ...sampleResult, success: true });

      expect(stderr.join('')).toContain('"event":"step"');
      expect(stderr.join('')).toContain('"event":"step-done"');
      expect(stderr.join('')).toContain('a note');
      // stdout has exactly the result JSON
      expect(JSON.parse(stdout.join('')).command).toBe('sync:push');
    });
  });

  describe('AnnounceRuntime', () => {
    it('emits a json start event on stderr for non-fast commands', () => {
      const host = new MJCLIRuntimeHost('json');
      host.AnnounceRuntime(slowUsage);
      const evt = JSON.parse(stderr.join(''));
      expect(evt.event).toBe('start');
      expect(evt.runtime.class).toBe('slow');
    });

    it('suppresses the advisory for fast commands', () => {
      const host = new MJCLIRuntimeHost('json');
      host.AnnounceRuntime(fastUsage);
      expect(stderr.join('')).toBe('');
    });

    it('suppresses the advisory when no-banner is set', () => {
      const host = new MJCLIRuntimeHost('json', false, true);
      host.AnnounceRuntime(slowUsage);
      expect(stderr.join('')).toBe('');
    });
  });
});
