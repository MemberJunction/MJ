/**
 * Real-browser checks for how the page reports failures. Skipped by default: they need
 * Playwright browsers, network access for the React CDN bundles, and a database (the
 * runner loads the component library catalog before it starts). Enable with the usual
 * DB_HOST / DB_DATABASE / DB_USERNAME / DB_PASSWORD settings and:
 *   RUN_BROWSER_INTEGRATION=1 npx vitest run src/__tests__/execution-errors/execution-errors.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { ComponentSpec, ComponentUtilities } from '@memberjunction/interactive-component-types';
import { ComponentRunner, ComponentExecutionResult, SANDBOX_UTILITY_UNAVAILABLE_RULE } from '../../lib/component-runner';
import { BrowserManager } from '../../lib/browser-context';

const RUN = !!process.env.RUN_BROWSER_INTEGRATION;

function buildSpec(name: string, code: string): ComponentSpec {
  return {
    name,
    title: name,
    description: name,
    type: 'report',
    location: 'embedded',
    code,
    functionalRequirements: name,
    technicalDesign: name,
    exampleUsage: `<${name} />`,
  };
}

/** Utilities with no `ai` member, as a host that does not grant AI tools passes them. */
function utilitiesWithoutAI(): ComponentUtilities {
  const notUsed = async (): Promise<never> => { throw new Error('not used by these components'); };
  return {
    md: { Entities: [], GetEntityObject: notUsed },
    rv: { RunView: notUsed, RunViews: notUsed },
    rq: { RunQuery: notUsed },
  } as ComponentUtilities;
}

function criticalOrHigh(result: ComponentExecutionResult) {
  return result.errors.filter(e => e.severity === 'critical' || e.severity === 'high');
}

describe.skipIf(!RUN)('page-side failure reporting (integration)', () => {
  let browser: BrowserManager;
  let runner: ComponentRunner;
  const contextUser = new UserInfo(undefined, { ID: '00000000-0000-0000-0000-000000000001', Name: 'Test User' });

  beforeAll(async () => {
    browser = new BrowserManager({ headless: true });
    await browser.initialize();
    runner = new ComponentRunner(browser);
  }, 60000);

  afterAll(async () => {
    await browser?.close();
  });

  async function run(spec: ComponentSpec): Promise<ComponentExecutionResult> {
    return runner.executeComponent({ componentSpec: spec, contextUser, utilities: utilitiesWithoutAI(), debug: false });
  }

  it('a component that calls AI the harness was not given still passes, with a warning', async () => {
    const result = await run(buildSpec('AskAI', `function AskAI({ utilities }) {
  const [answer, setAnswer] = useState('waiting');
  useEffect(() => {
    utilities.ai.ExecutePrompt({ systemPrompt: 'Summarize' }).then(r => setAnswer(r.success ? r.result : 'no answer'));
  }, []);
  return <div>{answer}</div>;
}`));

    expect(criticalOrHigh(result)).toEqual([]);
    expect(result.codeExecutionSuccess).toBe(true);
    expect(result.warnings.some(w => w.rule === SANDBOX_UTILITY_UNAVAILABLE_RULE)).toBe(true);
  }, 60000);

  it('a component that does not compile is reported by name, not as JSON', async () => {
    const result = await run(buildSpec('Broken', `function Broken() {
  return <div>{</div>;
}`));

    const registration = result.errors.find(e => e.rule === 'component-registration-error');
    expect(registration, JSON.stringify(result.errors, null, 2)).toBeDefined();
    expect(registration!.message).toContain('"Broken"');
    expect(registration!.message).not.toContain('"componentName"');
    expect(result.errors.some(e => e.rule === 'execution-error')).toBe(false);
  }, 60000);

  it('a working component reports no errors', async () => {
    const result = await run(buildSpec('Hello', `function Hello() {
  return <div>Hello</div>;
}`));

    expect(criticalOrHigh(result)).toEqual([]);
    expect(result.html).toContain('Hello');
  }, 60000);
});
