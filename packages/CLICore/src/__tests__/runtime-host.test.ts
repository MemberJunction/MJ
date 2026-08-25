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

  describe('TTY-aware rendering', () => {
    it('emits a compact single line when stdout is piped', () => {
      const host = new MJCLIRuntimeHost('json', false, false, { stdoutIsTTY: false });
      host.Emit(sampleResult);
      const out = stdout.join('').trimEnd();
      expect(out).not.toContain('\n');
      expect(JSON.parse(out).command).toBe('sync:push');
    });

    it('pretty-prints when stdout is a real terminal', () => {
      const host = new MJCLIRuntimeHost('json', false, false, { stdoutIsTTY: true });
      host.Emit(sampleResult);
      const out = stdout.join('');
      expect(out).toContain('  "command": "sync:push"');
    });

    it('still logs on stdout in piped text mode instead of going silent', () => {
      const host = new MJCLIRuntimeHost('text', false, false, { stdoutIsTTY: false });
      host.Log('a note');
      host.SucceedStep('loaded', '3 files');
      expect(stdout.join('')).toContain('a note');
      expect(stdout.join('')).toContain('loaded 3 files');
    });

    it('routes piped-text failures to stderr so a pipeline sees them', () => {
      const host = new MJCLIRuntimeHost('text', false, false, { stdoutIsTTY: false });
      host.Log('bad news', 'error');
      host.FailStep('push failed', 'timeout');
      expect(stderr.join('')).toContain('bad news');
      expect(stderr.join('')).toContain('push failed timeout');
      expect(stdout.join('')).toBe('');
    });

    it('still announces runtime in piped text mode — an agent needs the timeout budget', () => {
      const host = new MJCLIRuntimeHost('text', false, false, { stdoutIsTTY: false });
      host.AnnounceRuntime(slowUsage);
      expect(stderr.join('')).toContain('typically ~45s');
    });
  });

  describe('Interactive', () => {
    it('defaults to non-interactive — the agent-first inversion', () => {
      expect(new MJCLIRuntimeHost('text').Interactive).toBe(false);
    });

    it('reports interactive when the plugin resolved --human-friendly', () => {
      expect(new MJCLIRuntimeHost('text', false, false, { interactive: true }).Interactive).toBe(true);
    });
  });
});
