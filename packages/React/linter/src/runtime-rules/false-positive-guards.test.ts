/**
 * False-positive guards.
 *
 * Each case below is LEGAL, idiomatic Skip component code that must NOT be flagged.
 * A false positive here triggers an expensive LLM fixer cycle on already-correct code,
 * so these lock in that valid patterns (esp. optional chaining `?.`, the brittleness
 * that made `form-edit-lifecycle` miss `callbacks?.NotifyEvent?.(...)`) stay clean.
 *
 * A FAILING test = a real false positive in that rule.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import type { File } from '@babel/types';
import type { Violation } from '../component-linter';

import { CallbackEventValidationRule } from './callback-event-validation';
import { ComponentPropsValidationRule } from './component-props-validation';
import { ComponentUsageWithoutDestructuringRule } from './component-usage-without-destructuring';
import { UnsafeArrayOperationsRule } from './unsafe-array-operations';
import { RunViewCallValidationRule } from './runview-call-validation';
import { RunQueryCallValidationRule } from './runquery-call-validation';

function ast(code: string): File {
  return parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
}
/** Only critical/high block generation and cost fixer cycles. */
function blocking(violations: Violation[]): Violation[] {
  return (violations || []).filter(v => v.severity === 'critical' || v.severity === 'high');
}
function msgs(violations: Violation[]): string {
  return blocking(violations).map(v => `[${v.severity}] ${v.rule}: ${v.message}`).join('\n');
}

describe('false-positive guards: optional chaining + idiomatic patterns', () => {
  describe('callback-event-validation', () => {
    const rule = new CallbackEventValidationRule();

    it('does not flag optional-chained calls to the allowed callback methods', () => {
      const code = `
        function MyComponent({ callbacks }) {
          const onOpen = (id) => callbacks?.OpenEntityRecord?.('Accounts', { ID: id });
          const notify = () => callbacks?.CreateSimpleNotification?.('Saved', 'success', 3000);
          return null;
        }
      `;
      const v = rule.Test(ast(code), 'MyComponent');
      expect(msgs(v)).toBe('');
    });

    it('does not flag the optional-chained form lifecycle (RegisterMethod / NotifyEvent)', () => {
      const code = `
        function MemberForm({ callbacks, record }) {
          React.useEffect(() => {
            callbacks?.RegisterMethod?.('RequestSave', () => true);
            callbacks?.RegisterMethod?.('RequestCancel', () => true);
            callbacks?.NotifyEvent?.('BeforeSave', { dirtyFields: {}, cancel: false, timestamp: new Date() });
          }, []);
          return null;
        }
      `;
      const v = rule.Test(ast(code), 'MemberForm');
      expect(msgs(v)).toBe('');
    });

    it('does not flag non-optional or destructured NotifyEvent (exercises the ALLOWED_CALLBACK_METHODS entry)', () => {
      // Unlike the optional-chained cases above, these two forms are visited by
      // checkCallbackMethodUsage (non-optional member access) and
      // checkCallbacksDestructuring — both consult ALLOWED_CALLBACK_METHODS.
      // Without 'NotifyEvent' in that set, each would flag a critical violation,
      // so this case actually locks in the allow-list addition.
      const code = `
        function MemberForm({ callbacks }) {
          callbacks.NotifyEvent('BeforeSave', { dirtyFields: {}, cancel: false });
          const { NotifyEvent } = callbacks;
          return null;
        }
      `;
      const v = rule.Test(ast(code), 'MemberForm');
      expect(msgs(v)).toBe('');
    });
  });

  describe('component-props-validation (form-role host props)', () => {
    const rule = new ComponentPropsValidationRule();

    it('does not flag the FormHostProps on a form-role component (regression guard for the form-role fix)', () => {
      const code = `
        function MemberForm({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings,
                              record, primaryKey, mode, entityName, entityMetadata, canEdit, canDelete, canCreate }) {
          return null;
        }
      `;
      const spec = { name: 'MemberForm', type: 'form', properties: [], events: [] } as any;
      const v = rule.Test(ast(code), 'MemberForm', spec);
      expect(msgs(v)).toBe('');
    });

    it('does not flag a plain component using only standard props', () => {
      const code = `
        function Dashboard({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
          return null;
        }
      `;
      const spec = { name: 'Dashboard', type: 'dashboard', properties: [], events: [] } as any;
      const v = rule.Test(ast(code), 'Dashboard', spec);
      expect(msgs(v)).toBe('');
    });
  });

  describe('component-usage-without-destructuring', () => {
    const rule = new ComponentUsageWithoutDestructuringRule();

    it('does not flag member-expression usage of a declared child component (<components.X />)', () => {
      const code = `
        function Parent({ components }) {
          return <components.DataGrid rows={[]} />;
        }
      `;
      const spec = { name: 'Parent', dependencies: [{ name: 'DataGrid' }] } as any;
      const v = rule.Test(ast(code), 'Parent', spec);
      expect(msgs(v)).toBe('');
    });
  });

  describe('unsafe-array-operations', () => {
    const rule = new UnsafeArrayOperationsRule();

    it('does not flag guarded / optional-chained / defaulted array ops', () => {
      const code = `
        function MyComponent({ utilities }) {
          const [rows, setRows] = React.useState([]);
          const names = (rows ?? []).map(r => r.Name);
          const firstId = rows?.[0]?.ID;
          const filtered = rows?.filter(r => r.Active) || [];
          return null;
        }
      `;
      const v = rule.Test(ast(code), 'MyComponent');
      expect(msgs(v)).toBe('');
    });
  });

  describe('runview-call-validation', () => {
    const rule = new RunViewCallValidationRule();

    it('does not flag a valid RunView (plain and optional-chained)', () => {
      const code = `
        async function MyComponent({ utilities }) {
          const a = await utilities.rv.RunView({ EntityName: 'Accounts', Fields: ['ID', 'Name'] });
          const b = await utilities?.rv?.RunView({ EntityName: 'Accounts', Fields: ['ID'] });
          return null;
        }
      `;
      const v = rule.Test(ast(code), 'MyComponent');
      expect(msgs(v)).toBe('');
    });
  });

  describe('runquery-call-validation', () => {
    const rule = new RunQueryCallValidationRule();

    it('does not flag a valid RunQuery (plain and optional-chained)', () => {
      const code = `
        async function MyComponent({ utilities }) {
          const a = await utilities.rq.RunQuery({ QueryName: 'MembershipSummary' });
          const b = await utilities?.rq?.RunQuery({ QueryName: 'MembershipSummary' });
          return null;
        }
      `;
      const v = rule.Test(ast(code), 'MyComponent');
      expect(msgs(v)).toBe('');
    });
  });
});
