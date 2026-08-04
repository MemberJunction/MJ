import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import { ReactHooksRulesRule } from './react-hooks-rules';

function lint(code: string, componentName = 'ForecastAccuracyTracker') {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
  const rule = new ReactHooksRulesRule();
  return rule.Test(ast, componentName);
}

describe('ReactHooksRulesRule', () => {
  describe('member-expression hook calls (React.useXxx)', () => {
    it('allows React.useEffect at the top of the component function', () => {
      const violations = lint(`
        function ForecastAccuracyTracker() {
          React.useEffect(() => {}, []);
          return null;
        }
      `);
      expect(violations).toHaveLength(0);
    });

    it('flags React.useEffect inside an object-property render callback', () => {
      const violations = lint(`
        function ForecastAccuracyTracker() {
          const summaryColumns = [
            {
              field: 'Variance',
              render: (val) => {
                React.useEffect(() => { console.log('bad'); }, []);
                return val;
              }
            }
          ];
          return null;
        }
      `);
      expect(violations.length).toBeGreaterThanOrEqual(1);
      const critical = violations.find(v => v.severity === 'critical');
      expect(critical).toBeDefined();
      expect(critical!.message).toContain('useEffect');
      expect(critical!.message).toContain('render');
    });

    it('does not match React[useEffect] computed access', () => {
      const violations = lint(`
        function ForecastAccuracyTracker() {
          const summaryColumns = [
            {
              render: (val) => {
                React['useEffect'](() => {}, []);
                return val;
              }
            }
          ];
          return null;
        }
      `);
      // Computed member expressions are intentionally not matched — accept zero violations.
      expect(violations).toHaveLength(0);
    });
  });

  describe('bare-identifier hook calls (existing behavior)', () => {
    it('still flags useEffect inside an object-property render callback', () => {
      const violations = lint(`
        function ForecastAccuracyTracker() {
          const summaryColumns = [
            {
              render: (val) => {
                useEffect(() => {}, []);
                return val;
              }
            }
          ];
          return null;
        }
      `);
      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations[0].message).toContain('useEffect');
      expect(violations[0].message).toContain('render');
    });

    it('still allows useState at the top of a component', () => {
      const violations = lint(`
        function ForecastAccuracyTracker() {
          const [x, setX] = useState(0);
          return null;
        }
      `);
      expect(violations).toHaveLength(0);
    });

    it('still allows useState at the top of a custom hook', () => {
      const violations = lint(`
        function useDateRange() {
          const [x, setX] = useState(0);
          return x;
        }
      `, 'SomeComponent');
      expect(violations).toHaveLength(0);
    });
  });
});
