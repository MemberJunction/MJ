/**
 * Tests for overflow-hidden-on-layout-container rule.
 *
 * Validates that the rule flags overflow: 'hidden' on flex content containers
 * (flex: 1) while allowing it on viewport roots (height: 100vh),
 * small/fixed elements, and text truncation patterns.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter } from '../../lib/component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

const RULE_NAME = 'overflow-hidden-on-layout-container';

const baseSpec = {
  name: 'TestComponent',
  type: 'chart' as const,
  title: 'Test Component',
  description: 'Test component for overflow rule validation',
  code: '',
  location: 'embedded' as const,
  functionalRequirements: 'Test requirements',
  technicalDesign: 'Test design',
  exampleUsage: '<TestComponent />',
  dataRequirements: {
    mode: 'queries' as const,
    queries: [{ name: 'TestQuery', categoryPath: 'Test', fields: [], entityNames: [] }],
    entities: [],
  },
} as ComponentSpec;

async function getViolations(code: string) {
  const result = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);
  return result.violations.filter((v) => v.rule === RULE_NAME);
}

describe('overflow-hidden-on-layout-container', () => {
  // ── Should flag ────────────────────────────────────────────────────────

  it('should flag overflow hidden with flex: 1 on inline style', async () => {
    const code = `
      function TestComponent({ utilities }) {
        return React.createElement('div',
          { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
          React.createElement('div', { style: { flex: 1, overflow: 'hidden' } },
            React.createElement('div', null, 'Content')
          )
        );
      }
    `;
    const violations = await getViolations(code);
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe('medium');
    expect(violations[0].message).toContain('overflow');
    expect(violations[0].message).toContain('flex');
  });

  it('should flag the classic Skip two-level clipping pattern on flex content wrappers', async () => {
    const code = `
      function TestComponent({ utilities }) {
        return React.createElement('div',
          { style: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' } },
          React.createElement('div', { style: { flex: 1, overflow: 'hidden' } },
            React.createElement('div', { style: { flex: 1, minHeight: 0 } },
              React.createElement('div', null, 'DataGrid here')
            )
          )
        );
      }
    `;
    const violations = await getViolations(code);
    // Should catch only the flex: 1 content wrapper, NOT the height: 100vh root
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain('flex: 1');
  });

  it('should flag overflow hidden in a variable-assigned style object', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const containerStyle = { flex: 1, overflow: 'hidden', display: 'flex' };
        return React.createElement('div', { style: containerStyle },
          React.createElement('div', null, 'Content')
        );
      }
    `;
    const violations = await getViolations(code);
    expect(violations).toHaveLength(1);
  });

  it('should include a suggestion with example', async () => {
    const code = `
      function TestComponent({ utilities }) {
        return React.createElement('div',
          { style: { flex: 1, overflow: 'hidden' } },
          React.createElement('div', null, 'Content')
        );
      }
    `;
    const violations = await getViolations(code);
    expect(violations).toHaveLength(1);
    expect(violations[0].suggestion).toBeDefined();
    expect(violations[0].suggestion?.text).toContain("overflow: 'auto'");
    expect(violations[0].suggestion?.example).toBeDefined();
  });

  // ── Should NOT flag ────────────────────────────────────────────────────

  it('should NOT flag overflow hidden on viewport root (height: 100vh)', async () => {
    const code = `
      function TestComponent({ utilities }) {
        return React.createElement('div',
          { style: { height: '100vh', overflow: 'hidden', display: 'flex' } },
          React.createElement('div', null, 'Content')
        );
      }
    `;
    const violations = await getViolations(code);
    expect(violations).toHaveLength(0);
  });

  it('should NOT flag overflow hidden on height: 100% container without flex: 1', async () => {
    const code = `
      function TestComponent({ utilities }) {
        return React.createElement('div',
          { style: { height: '100%', overflow: 'hidden', display: 'flex' } },
          React.createElement('div', null, 'Content')
        );
      }
    `;
    const violations = await getViolations(code);
    expect(violations).toHaveLength(0);
  });

  it('should NOT flag overflow hidden without flex/height indicators', async () => {
    const code = `
      function TestComponent({ utilities }) {
        return React.createElement('div',
          { style: { width: '200px', height: '50px', overflow: 'hidden', borderRadius: '8px' } },
          React.createElement('img', { src: 'photo.jpg' })
        );
      }
    `;
    const violations = await getViolations(code);
    expect(violations).toHaveLength(0);
  });

  it('should NOT flag text truncation (overflow hidden + textOverflow ellipsis)', async () => {
    const code = `
      function TestComponent({ utilities }) {
        return React.createElement('div',
          { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          'Some long text that should be truncated'
        );
      }
    `;
    const violations = await getViolations(code);
    expect(violations).toHaveLength(0);
  });

  it('should NOT flag overflow auto on a flex container', async () => {
    const code = `
      function TestComponent({ utilities }) {
        return React.createElement('div',
          { style: { flex: 1, overflow: 'auto' } },
          React.createElement('div', null, 'Scrollable content')
        );
      }
    `;
    const violations = await getViolations(code);
    expect(violations).toHaveLength(0);
  });

  it('should NOT flag a style object without overflow property', async () => {
    const code = `
      function TestComponent({ utilities }) {
        return React.createElement('div',
          { style: { flex: 1, display: 'flex', flexDirection: 'column' } },
          React.createElement('div', null, 'Content')
        );
      }
    `;
    const violations = await getViolations(code);
    expect(violations).toHaveLength(0);
  });

  it('should NOT flag overflow hidden on non-style objects', async () => {
    const code = `
      function TestComponent({ utilities }) {
        const config = { overflow: 'hidden', flex: 1 };
        return React.createElement('div', null, JSON.stringify(config));
      }
    `;
    const violations = await getViolations(code);
    expect(violations).toHaveLength(0);
  });
});
