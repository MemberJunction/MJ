/**
 * The short-flag surface of `--format`, pinned at the command level.
 *
 * Reviewing this branch, cadam11 caught that widening `--format` to the canonical
 * vocabulary had silently dropped the `-f` shorthand every `mj test` command shipped
 * with — a breaking change to any script using it, made invisible by the fact that the
 * long form kept working. `format-compat.test.ts` covers the flag definitions; this
 * file covers what a caller actually types, so a future refactor that swaps a command
 * back to the char-less flag fails here rather than in someone's pipeline.
 */
import { describe, it, expect } from 'vitest';

import TestRun from '../commands/test/run.js';
import TestList from '../commands/test/list.js';
import TestHistory from '../commands/test/history.js';
import TestCompare from '../commands/test/compare.js';
import TestValidate from '../commands/test/validate.js';
import TestSuite from '../commands/test/suite.js';
import TestRegressionCompare from '../commands/test/regression/compare.js';

import AiAgentsRun from '../commands/ai/agents/run.js';
import AiAgentsList from '../commands/ai/agents/list.js';
import AiActionsRun from '../commands/ai/actions/run.js';
import AiActionsList from '../commands/ai/actions/list.js';
import AiAuditAgentRun from '../commands/ai/audit/agent-run.js';
import AiPromptsRun from '../commands/ai/prompts/run.js';

/** The shape we read off a command's static flags — just the bits this file asserts on. */
interface FlagSurface {
  char?: string;
  options?: string[];
}

function flagsOf(command: { flags: Record<string, FlagSurface> }): Record<string, FlagSurface> {
  return command.flags;
}

const TEST_FAMILY: Array<[string, { flags: Record<string, FlagSurface> }]> = [
  ['mj test run', TestRun],
  ['mj test list', TestList],
  ['mj test history', TestHistory],
  ['mj test compare', TestCompare],
  ['mj test validate', TestValidate],
  ['mj test suite', TestSuite],
  ['mj test regression compare', TestRegressionCompare],
];

const AI_FAMILY: Array<[string, { flags: Record<string, FlagSurface> }]> = [
  ['mj ai agents run', AiAgentsRun],
  ['mj ai agents list', AiAgentsList],
  ['mj ai actions run', AiActionsRun],
  ['mj ai actions list', AiActionsList],
  ['mj ai audit agent-run', AiAuditAgentRun],
  ['mj ai prompts run', AiPromptsRun],
];

describe('-f shorthand on the mj test family', () => {
  it.each(TEST_FAMILY)('%s keeps -f as the shorthand for --format', (_name, command) => {
    expect(flagsOf(command).format?.char).toBe('f');
  });

  it.each(TEST_FAMILY)('%s still accepts its historical spellings on -f', (_name, command) => {
    const options = flagsOf(command).format?.options ?? [];
    // What the flag accepted before this branch — a script passing any of these must
    // keep working, whether it spells the flag --format or -f.
    for (const legacy of ['console', 'json', 'markdown']) {
      expect(options).toContain(legacy);
    }
  });

  it.each(TEST_FAMILY)('%s leaves -f unclaimed by any other flag', (_name, command) => {
    const claimants = Object.entries(flagsOf(command))
      .filter(([name, flag]) => flag.char === 'f' && name !== 'format')
      .map(([name]) => name);
    expect(claimants).toEqual([]);
  });
});

describe('-f is NOT bound on the mj ai family', () => {
  // `--format` is brand new for `mj ai` (its historical flag is --output/-o), so there
  // is no shorthand to restore — and `mj ai audit agent-run` already spends -f on
  // --file, an output FILE path. Binding it to a format there would repeat the very
  // -o ambiguity this branch declined to deepen.
  it.each(AI_FAMILY)('%s does not give --format a -f shorthand', (_name, command) => {
    expect(flagsOf(command).format?.char).toBeUndefined();
  });

  it('leaves mj ai audit agent-run\'s own -f (--file) intact', () => {
    expect(flagsOf(AiAuditAgentRun).file?.char).toBe('f');
  });
});
