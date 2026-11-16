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
  return { md: { Entities: [] }, rv: {}, rq: {} } as ComponentUtilities;
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
    return runner.ExecuteComponent({ componentSpec: spec, contextUser, utilities: utilitiesWithoutAI(), debug: false });
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

  it.each([
    ['forwardRef', 'React.forwardRef((props, ref) => <span ref={ref}>{props.label}</span>)'],
    ['memo', 'React.memo(props => <span>{props.label}</span>)'],
  ])('a %s component rendered in a list is not an invalid element type', async (_kind, definition) => {
    const result = await run(buildSpec('Listed', `function Listed() {
  const Item = ${definition};
  const items = Array.from({ length: 30 }, (_, i) => i);
  return <div>{items.map(i => <Item key={i} label={'Row ' + i} />)}</div>;
}`));

    expect(result.errors.filter(e => e.rule === 'invalid-jsx-element')).toEqual([]);
    expect(criticalOrHigh(result)).toEqual([]);
  }, 60000);

  it('an invalid element type created many times fails the run even when nothing crashes', async () => {
    // The elements are built but never rendered, so React itself never complains.
    const result = await run(buildSpec('Unrendered', `function Unrendered() {
  const NotAComponent = { label: 'oops' };
  const unused = Array.from({ length: 30 }, (_, i) => React.createElement(NotAComponent, { key: i }));
  return <div>{unused.length} built</div>;
}`));

    const jsx = result.errors.filter(e => e.rule === 'invalid-jsx-element');
    expect(jsx.map(e => e.severity)).toEqual(['high']);
    expect(result.codeExecutionSuccess).toBe(false);
  }, 60000);

  it('a single invalid element type is reported but does not fail the run', async () => {
    const result = await run(buildSpec('Once', `function Once() {
  const NotAComponent = { label: 'oops' };
  const unused = React.createElement(NotAComponent);
  return <div>{unused ? 'built' : ''}</div>;
}`));

    const jsx = result.errors.filter(e => e.rule === 'invalid-jsx-element');
    expect(jsx.map(e => e.severity)).toEqual(['low']);
    expect(result.codeExecutionSuccess).toBe(true);
  }, 60000);

  it('a working component reports no errors', async () => {
    const result = await run(buildSpec('Hello', `function Hello() {
  return <div>Hello</div>;
}`));

    expect(criticalOrHigh(result)).toEqual([]);
    expect(result.html).toContain('Hello');
  }, 60000);
});
