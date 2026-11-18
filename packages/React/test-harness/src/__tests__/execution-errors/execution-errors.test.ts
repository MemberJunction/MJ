/**
 * Execution Error Classification
 *
 * The runner reports what it knows about a failure instead of collapsing it:
 * - each page-side error type maps to its own rule (not the catch-all 'execution-error');
 * - a call to a utility the harness was not given is a medium warning under its own rule,
 *   never a critical data error that blames the component.
 *
 * These tests drive the Node-side code with a stand-in page. The page-side code is
 * covered by execution-errors.integration.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { ComponentSpec, ComponentUtilities, SimpleExecutePromptResult } from '@memberjunction/interactive-component-types';
import { ComponentRunner, ComponentExecutionOptions, DataAccessRecord, SANDBOX_UTILITY_UNAVAILABLE_RULE } from '../../lib/component-runner';
import { BrowserManager } from '../../lib/browser-context';

type ExposedFunction = (...args: unknown[]) => Promise<unknown>;

/** Records what the runner exposes to the page and answers its one evaluate() call. */
class StandInPage {
  public readonly Exposed = new Map<string, ExposedFunction>();
  constructor(private evaluateResult: unknown = undefined) {}

  public async exposeFunction(name: string, fn: ExposedFunction): Promise<void> {
    this.Exposed.set(name, fn);
  }

  public async evaluate(): Promise<unknown> {
    return this.evaluateResult;
  }
}

function buildRunner(): ComponentRunner {
  return new ComponentRunner(new BrowserManager({ headless: true }));
}

function buildOptions(utilities: ComponentUtilities): ComponentExecutionOptions {
  const spec = { name: 'Widget', code: 'function Widget() { return null; }' } as ComponentSpec;
  return {
    componentSpec: spec,
    contextUser: new UserInfo(undefined, { ID: '00000000-0000-0000-0000-000000000001', Name: 'Test User' }),
    utilities,
  };
}

/** Utilities with no `ai` member, as a host that does not grant AI tools passes them. */
function utilitiesWithoutAI(): ComponentUtilities {
  return { md: {}, rv: {}, rq: {} } as ComponentUtilities;
}

async function exposeTo(page: StandInPage, utilities: ComponentUtilities) {
  const dataErrors: string[] = [];
  const unavailable = new Set<string>();
  const dataAccess: DataAccessRecord[] = [];
  await buildRunner()['exposeMJUtilities'](page, buildOptions(utilities), dataErrors, unavailable, dataAccess, false);
  return { dataErrors, unavailable };
}

describe('collectRuntimeErrors rule mapping', () => {
  it.each([
    ['harness-setup-error', 'harness-setup-error'],
    ['component-load-error', 'component-load-error'],
    ['registration-error', 'component-registration-error'],
    ['execution-error', 'execution-error'],
  ])('reports page error type %s under rule %s', async (type, rule) => {
    const page = new StandInPage({
      runtimeErrors: [{ message: 'boom', type, source: 'runtime-wrapper' }],
      consoleErrors: [],
      testFailed: true,
      sourceMaps: {},
    });

    const errors = await buildRunner()['collectRuntimeErrors'](page);

    expect(errors).toHaveLength(1);
    expect(errors[0].rule).toBe(rule);
  });

  it('keeps separate registration failures as separate errors', async () => {
    const page = new StandInPage({
      runtimeErrors: [
        { message: 'Component "Chart" failed during compile: Unexpected token', type: 'registration-error' },
        { message: 'Component "Table" failed during dependency: Missing library', type: 'registration-error' },
      ],
      consoleErrors: [],
      testFailed: true,
      sourceMaps: {},
    });

    const errors = await buildRunner()['collectRuntimeErrors'](page);

    expect(errors.map(e => e.message)).toEqual([
      'Component "Chart" failed during compile: Unexpected token',
      'Component "Table" failed during dependency: Missing library',
    ]);
  });
});

describe('utilities the harness was not given', () => {
  it('records ExecutePrompt as unavailable instead of as a data error', async () => {
    const page = new StandInPage();
    const { dataErrors, unavailable } = await exposeTo(page, utilitiesWithoutAI());

    const result = await page.Exposed.get('__mjExecutePrompt')!({ systemPrompt: 'hi' }) as SimpleExecutePromptResult;

    expect(result.success).toBe(false);
    expect([...unavailable]).toEqual(['utilities.ai.ExecutePrompt']);
    expect(dataErrors).toEqual([]);
  });

  it('records EmbedText as unavailable and still rejects the call', async () => {
    const page = new StandInPage();
    const { dataErrors, unavailable } = await exposeTo(page, utilitiesWithoutAI());

    await expect(page.Exposed.get('__mjEmbedText')!({ textToEmbed: 'hi' })).rejects.toThrow('not available in the test harness');
    expect([...unavailable]).toEqual(['utilities.ai.EmbedText']);
    expect(dataErrors).toEqual([]);
  });

  it('turns each unavailable utility into one medium warning under its own rule', () => {
    const warnings = ComponentRunner['buildUnavailableUtilityWarnings'](
      new Set(['utilities.ai.ExecutePrompt', 'utilities.ai.EmbedText'])
    );

    expect(warnings).toHaveLength(2);
    for (const warning of warnings) {
      expect(warning.rule).toBe(SANDBOX_UTILITY_UNAVAILABLE_RULE);
      expect(warning.severity).toBe('medium');
      expect(warning.source).toBe('test-harness');
    }
    expect(warnings[0].message).toContain('utilities.ai.ExecutePrompt is not available in the test harness');
  });
});

describe('JSX element-type errors are graded by volume', () => {
  type Collected = Awaited<ReturnType<ComponentRunner['collectRuntimeErrors']>>[number];

  function jsxError(occurrences: number): Collected {
    const baseMessage = 'Invalid JSX element type: React received an object (Object) instead of a React component function.';
    return {
      message: occurrences > 1 ? `${baseMessage} (occurred ${occurrences} times)` : baseMessage,
      baseMessage, type: 'invalid-element-type', rule: 'invalid-jsx-element', occurrences,
    };
  }

  it('collects the occurrence count as a field', async () => {
    const entry = { message: 'boom', type: 'invalid-element-type' };
    const page = new StandInPage({ runtimeErrors: [entry, entry, entry], consoleErrors: [], testFailed: false, sourceMaps: {} });

    const [error] = await buildRunner()['collectRuntimeErrors'](page);

    expect(error.occurrences).toBe(3);
    expect(error.baseMessage).toBe('boom');
    expect(error.message).toBe('boom (occurred 3 times)');
  });

  it.each([
    [1, 'low'],
    [24, 'low'],
    [25, 'high'],
    [400, 'high'],
  ])('a JSX error seen %i times is reported as %s', (occurrences, severity) => {
    const violation = ComponentRunner['buildRuntimeErrorViolation'](jsxError(occurrences), false);
    expect(violation.severity).toBe(severity);
    expect(violation.rule).toBe('invalid-jsx-element');
  });

  it('says why a high-volume JSX error fails', () => {
    const violation = ComponentRunner['buildRuntimeErrorViolation'](jsxError(30), false);
    expect(violation.message).toContain('repeated 30 times');
  });

  it('reports every other runtime error as critical', () => {
    const violation = ComponentRunner['buildRuntimeErrorViolation'](
      { message: 'boom', baseMessage: 'boom', type: 'react-render-error', rule: 'react-render-error', occurrences: 1 }, false);
    expect(violation.severity).toBe('critical');
  });

  it('replaces a JSX error seen again later instead of adding it twice, and counts it once over the threshold', () => {
    const collected = [jsxError(10)];
    const errors: string[] = []; // 10 occurrences: below the threshold, so not counted

    ComponentRunner['mergeAsyncRuntimeError'](jsxError(30), errors, collected);

    expect(collected).toHaveLength(1);
    expect(collected[0].occurrences).toBe(30);
    expect(errors).toEqual([jsxError(30).message]);
  });

  it('keeps a JSX error that stays below the threshold out of the counted errors', () => {
    const collected = [jsxError(2)];
    const errors: string[] = [];

    ComponentRunner['mergeAsyncRuntimeError'](jsxError(5), errors, collected);

    expect(collected.map(e => e.occurrences)).toEqual([5]);
    expect(errors).toEqual([]);
  });
});
