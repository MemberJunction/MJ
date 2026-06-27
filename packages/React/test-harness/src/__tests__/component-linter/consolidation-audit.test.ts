/**
 * Consolidation Audit — verifies the 3 consolidated rules produce
 * specific violations that the 10 old rules used to produce.
 *
 * This is a regression test for the rule consolidation.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter, LintResult, Violation } from '@memberjunction/react-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

const spec: ComponentSpec = {
  name: 'AuditComponent',
  properties: [],
  events: [],
  dataRequirements: {
    mode: 'hybrid',
    entities: [{ name: 'Members', type: 'view' }],
    queries: [{
      name: 'Test Query',
      categoryPath: 'Test/Path',
      parameters: [
        { name: 'StartDate', value: '', testValue: '2024-01-01' },
      ],
    }],
  },
} as ComponentSpec;

async function lint(code: string): Promise<LintResult> {
  return ComponentLinter.lintComponent(code, 'AuditComponent', spec, true);
}

function violationsFor(result: LintResult, ruleName: string): Violation[] {
  return result.violations.filter(v => v.rule === ruleName);
}

describe('Consolidation audit: runview-call-validation', () => {
  it('flags missing EntityName', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      await utilities.rv.RunView({ ExtraFilter: 'x=1' });
    }`);
    const v = violationsFor(result, 'runview-call-validation');
    expect(v.some(x => x.message.includes('EntityName'))).toBe(true);
  });

  it('flags invalid property (Parameters on RunView)', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      await utilities.rv.RunView({ EntityName: 'Members', Parameters: { x: 1 } });
    }`);
    const v = violationsFor(result, 'runview-call-validation');
    expect(v.some(x => x.message.includes('Parameters') || x.message.includes('ExtraFilter'))).toBe(true);
  });

  it('flags non-object argument (string)', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      await utilities.rv.RunView('Members');
    }`);
    const v = violationsFor(result, 'runview-call-validation');
    expect(v.some(x => x.message.includes('expects') && x.message.includes('object'))).toBe(true);
  });

  it('allows Identifier argument without error', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      const params = { EntityName: 'Members' };
      await utilities.rv.RunView(params);
    }`);
    const v = violationsFor(result, 'runview-call-validation');
    expect(v.length).toBe(0);
  });

  it('flags entity not in spec', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      await utilities.rv.RunView({ EntityName: 'NonExistentEntity' });
    }`);
    const v = violationsFor(result, 'runview-call-validation');
    expect(v.some(x => x.message.includes('not in component spec') || x.message.includes('Not found'))).toBe(true);
  });
});

describe('Consolidation audit: runquery-call-validation', () => {
  it('flags missing QueryName/QueryID', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      await utilities.rq.RunQuery({ CategoryPath: 'Test/Path' });
    }`);
    const v = violationsFor(result, 'runquery-call-validation');
    expect(v.some(x => x.message.includes('QueryID') || x.message.includes('QueryName'))).toBe(true);
  });

  it('flags SQL injection in QueryName', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      await utilities.rq.RunQuery({ QueryName: 'SELECT * FROM Users' });
    }`);
    const v = violationsFor(result, 'runquery-call-validation');
    expect(v.some(x => x.message.includes('SQL') || x.message.includes('sql'))).toBe(true);
  });

  it('flags array Parameters format', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      await utilities.rq.RunQuery({
        QueryName: 'Test Query',
        CategoryPath: 'Test/Path',
        Parameters: [{ Name: 'StartDate', Value: '2024-01-01' }]
      });
    }`);
    const v = violationsFor(result, 'runquery-call-validation');
    expect(v.some(x => x.message.includes('array') || x.message.includes('object'))).toBe(true);
  });

  it('flags invalid property (ExtraFilter on RunQuery)', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      await utilities.rq.RunQuery({ QueryName: 'Test Query', CategoryPath: 'Test/Path', ExtraFilter: 'x=1' });
    }`);
    const v = violationsFor(result, 'runquery-call-validation');
    expect(v.some(x => x.message.includes('ExtraFilter'))).toBe(true);
  });

  it('allows Identifier argument without error', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      const params = { QueryName: 'Test Query', CategoryPath: 'Test/Path' };
      await utilities.rq.RunQuery(params);
    }`);
    const v = violationsFor(result, 'runquery-call-validation');
    expect(v.length).toBe(0);
  });

  it('allows variable Parameters without false positive', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      const params = { StartDate: '2024-01-01' };
      await utilities.rq.RunQuery({
        QueryName: 'Test Query',
        CategoryPath: 'Test/Path',
        Parameters: params
      });
    }`);
    const v = violationsFor(result, 'runquery-call-validation');
    expect(v.length).toBe(0);
  });
});

describe('Consolidation audit: data-result-validation', () => {
  it('flags .data on RunView result', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      const r = await utilities.rv.RunView({ EntityName: 'Members' });
      const d = r.data;
    }`);
    const v = violationsFor(result, 'data-result-validation');
    expect(v.some(x => x.message.includes('.data') || x.message.includes('Results'))).toBe(true);
  });

  it('flags .records on RunQuery result', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      const r = await utilities.rq.RunQuery({ QueryName: 'Test Query', CategoryPath: 'Test/Path' });
      const d = r.records;
    }`);
    const v = violationsFor(result, 'data-result-validation');
    expect(v.some(x => x.message.includes('.records') || x.message.includes('Results'))).toBe(true);
  });

  it('flags direct array method on result', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      const r = await utilities.rv.RunView({ EntityName: 'Members' });
      r.map(x => x);
    }`);
    const v = violationsFor(result, 'data-result-validation');
    expect(v.some(x => x.message.includes('map') || x.message.includes('array method'))).toBe(true);
  });

  it('flags spread on result', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      const r = await utilities.rv.RunView({ EntityName: 'Members' });
      const items = [...r];
    }`);
    const v = violationsFor(result, 'data-result-validation');
    expect(v.some(x => x.message.includes('spread'))).toBe(true);
  });

  it('flags .Results without Success check (medium severity)', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      const r = await utilities.rv.RunView({ EntityName: 'Members' });
      const items = r.Results.map(x => x.Name);
    }`);
    const v = violationsFor(result, 'data-result-validation');
    expect(v.some(x => x.message.includes('Success') && x.severity === 'medium')).toBe(true);
  });

  it('does NOT flag .Results with Success guard', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      const r = await utilities.rv.RunView({ EntityName: 'Members' });
      if (r.Success) {
        const items = r.Results.map(x => x.Name);
      }
    }`);
    const v = violationsFor(result, 'data-result-validation').filter(x => x.message.includes('Success'));
    expect(v.length).toBe(0);
  });

  it('does NOT flag optional chaining on .Results', async () => {
    const result = await lint(`async function AuditComponent({ utilities }) {
      const r = await utilities.rv.RunView({ EntityName: 'Members' });
      const items = r?.Results?.map(x => x.Name) || [];
    }`);
    const v = violationsFor(result, 'data-result-validation').filter(x => x.message.includes('Success'));
    expect(v.length).toBe(0);
  });
});
