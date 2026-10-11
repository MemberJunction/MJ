/**
 * Tests for `mj ai agents run` as a coding agent drives it: one prompt, usually `--format json`.
 *
 * The AI CLI services are mocked — these tests are about the command: which options reach the
 * service, that stdout carries only the JSON result (also when the run cannot start), that the exit
 * code follows the run, and that the database pool is closed so the process can exit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ai = vi.hoisted(() => ({
  executeAgent: vi.fn(),
  closeProvider: vi.fn(async () => undefined),
}));

const lifecycle = vi.hoisted(() => ({
  endCommand: vi.fn(async () => undefined),
  closeProvider: vi.fn(async () => undefined),
  routeConsole: vi.fn(() => () => undefined),
}));

vi.mock('@memberjunction/ai-cli', () => ({
  AgentService: class {
    ExecuteAgent = ai.executeAgent;
  },
  ConversationService: class {
    StartChat = vi.fn(async () => undefined);
  },
  OutputFormatter: class {
    constructor(private readonly format: string) {}
    FormatAgentResult(result: object): string {
      return this.format === 'json' ? JSON.stringify(result, null, 2) : `TEXT ${JSON.stringify(result)}`;
    }
  },
  CloseMJProvider: ai.closeProvider,
}));

vi.mock('../lib/ai-command-lifecycle.js', () => ({
  EndAICommand: lifecycle.endCommand,
  CloseAIProvider: lifecycle.closeProvider,
  RouteConsoleToStderr: lifecycle.routeConsole,
}));

import AgentsRun from '../commands/ai/agents/run.js';

const SUCCESS = {
  success: true,
  entityName: 'Lead Intake Flow',
  AgentRunID: 'run-1',
  AgentRunStatus: 'Completed',
  result: 'Flow completed - no more paths to follow',
  FinalPayload: { leads: 3 },
  duration: 1200,
};

describe('mj ai agents run', () => {
  let stdout: string[];

  beforeEach(() => {
    stdout = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stdout.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    ai.executeAgent.mockReset();
    lifecycle.endCommand.mockClear();
    lifecycle.closeProvider.mockClear();
    lifecycle.routeConsole.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('declares --background and a --timeout of at least a second', () => {
    expect(AgentsRun.flags.background).toBeDefined();
    expect(AgentsRun.flags.background.default).toBe(false);
    expect(AgentsRun.flags.timeout.default).toBe(300000);
  });

  it('runs a Flow agent to completion by default, writes only the JSON result to stdout, and ends cleanly', async () => {
    ai.executeAgent.mockResolvedValue(SUCCESS);

    await AgentsRun.run(['-a', 'Lead Intake Flow', '-p', 'Process the new leads', '--format', 'json']);

    expect(ai.executeAgent).toHaveBeenCalledWith('Lead Intake Flow', 'Process the new leads', {
      verbose: false,
      timeout: 300000,
      Background: false,
    });
    const parsed = JSON.parse(stdout.join(''));
    expect(parsed.AgentRunID).toBe('run-1');
    expect(parsed.AgentRunStatus).toBe('Completed');
    expect(parsed.FinalPayload).toEqual({ leads: 3 });
    expect(lifecycle.routeConsole).toHaveBeenCalledTimes(1);
    expect(lifecycle.endCommand).toHaveBeenCalledWith(ai.closeProvider, 0);
  });

  it('passes --background and --timeout through to the service', async () => {
    ai.executeAgent.mockResolvedValue({ ...SUCCESS, AgentRunStatus: 'Paused' });

    await AgentsRun.run(['-a', 'Lead Intake Flow', '-p', 'go', '--background', '--timeout', '60000', '--format', 'json']);

    expect(ai.executeAgent).toHaveBeenCalledWith('Lead Intake Flow', 'go', { verbose: false, timeout: 60000, Background: true });
  });

  it('exits 1 when the run failed or timed out, still closing the pool', async () => {
    ai.executeAgent.mockResolvedValue({
      success: false, entityName: 'Lead Intake Flow', AgentRunID: 'run-1', AgentRunStatus: 'Cancelled', TimedOut: true,
      error: 'Timed out after 1000ms (--timeout).', duration: 1000,
    });

    await AgentsRun.run(['-a', 'Lead Intake Flow', '-p', 'go', '--format', 'json']);

    expect(JSON.parse(stdout.join('')).TimedOut).toBe(true);
    expect(lifecycle.endCommand).toHaveBeenCalledWith(ai.closeProvider, 1);
  });

  // A caller asking for JSON parses stdout; an error it cannot parse looks like a crashed command.
  it('reports a run that could not start as JSON on stdout under --format json, with the exit code text mode gives it', async () => {
    ai.executeAgent.mockRejectedValue(new Error('❌ Database configuration missing'));

    await AgentsRun.run(['-a', 'Lead Intake Flow', '-p', 'go', '--format', 'json']);

    const parsed = JSON.parse(stdout.join(''));
    expect(parsed).toMatchObject({ success: false, entityName: 'Lead Intake Flow', error: '❌ Database configuration missing' });
    expect(lifecycle.closeProvider).toHaveBeenCalledWith(ai.closeProvider);
    expect(lifecycle.endCommand).toHaveBeenCalledWith(ai.closeProvider, 2);
  });

  it('fails the usual way, after closing the pool, outside --format json', async () => {
    ai.executeAgent.mockRejectedValue(new Error('❌ Agent not found: "Nope"'));

    const failure = AgentsRun.run(['-a', 'Nope', '-p', 'go', '--format', 'text']);
    await expect(failure).rejects.toThrow(/Agent not found/);
    await expect(failure).rejects.toMatchObject({ oclif: { exit: 2 } });

    expect(lifecycle.closeProvider).toHaveBeenCalledWith(ai.closeProvider);
    expect(stdout.join('')).toBe('');
  });

  // --background defaults to false; a defaulted flag must not trip its exclusivity with --chat.
  it('lets --chat through the --background exclusivity check, and refuses the two together', async () => {
    // Non-interactive, so --chat stops at its terminal check rather than starting a conversation.
    vi.stubEnv('MJ_CLI_INTERACTIVE', '0');
    try {
      await expect(AgentsRun.run(['-a', 'X', '--chat'])).rejects.toThrow(/Interactive chat mode/);
      await expect(AgentsRun.run(['-a', 'X', '--chat', '--background'])).rejects.toThrow(/cannot also be provided/);
      expect(ai.executeAgent).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('refuses a timeout under a second', async () => {
    await expect(AgentsRun.run(['-a', 'X', '-p', 'go', '--timeout', '10'])).rejects.toThrow(/1000/);
    expect(ai.executeAgent).not.toHaveBeenCalled();
  });
});
