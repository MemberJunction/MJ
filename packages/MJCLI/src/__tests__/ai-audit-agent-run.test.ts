/**
 * Tests for how `mj ai audit agent-run` ends: its stdout is only the report, so `--format json`
 * parses even with `--verbose`, and the database pool is closed whether the audit succeeds or fails.
 *
 * The audit service is mocked — these tests are about the command, not the audit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const audit = vi.hoisted(() => ({
  getRunSummary: vi.fn(),
  closeProvider: vi.fn(async () => undefined),
}));

const lifecycle = vi.hoisted(() => ({
  endCommand: vi.fn(async () => undefined),
  closeProvider: vi.fn(async () => undefined),
  routeConsole: vi.fn(() => () => undefined),
}));

vi.mock('@memberjunction/ai-cli', () => ({
  AgentAuditService: class {
    getRunSummary = audit.getRunSummary;
    formatRunSummary(summary: object, format: string): string {
      return format === 'json' ? JSON.stringify(summary, null, 2) : `TEXT ${JSON.stringify(summary)}`;
    }
  },
  CloseMJProvider: audit.closeProvider,
}));

vi.mock('../lib/ai-command-lifecycle.js', () => ({
  EndAICommand: lifecycle.endCommand,
  CloseAIProvider: lifecycle.closeProvider,
  RouteConsoleToStderr: lifecycle.routeConsole,
}));

import AgentRun from '../commands/ai/audit/agent-run.js';

describe('mj ai audit agent-run', () => {
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
    audit.getRunSummary.mockReset();
    lifecycle.endCommand.mockClear();
    lifecycle.closeProvider.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes only the JSON summary to stdout, even with --verbose, and closes the pool', async () => {
    audit.getRunSummary.mockResolvedValue({ runId: 'run-1', status: 'Failed', errorCount: 1 });

    await AgentRun.run(['run-1', '--format', 'json', '--verbose']);

    expect(JSON.parse(stdout.join(''))).toEqual({ runId: 'run-1', status: 'Failed', errorCount: 1 });
    expect(lifecycle.routeConsole).toHaveBeenCalledTimes(1);
    expect(lifecycle.endCommand).toHaveBeenCalledWith(audit.closeProvider, 0);
  });

  it('closes the pool and keeps the verbose error details off stdout when the audit fails', async () => {
    audit.getRunSummary.mockRejectedValue(new Error('❌ Failed to connect to database server'));

    await expect(AgentRun.run(['run-1', '--format', 'json', '--verbose'])).rejects.toThrow(/Failed to connect/);

    expect(lifecycle.closeProvider).toHaveBeenCalledWith(audit.closeProvider);
    expect(stdout.join('')).toBe('');
    expect(stderr.join('')).toContain('Error Details');
  });
});
