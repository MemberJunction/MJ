/**
 * Chart.js Canvas Container Lint Rule Tests
 *
 * Tests the `check-canvas-container.js` library validator which ensures that
 * the parent element of a Chart.js <canvas> has `position: 'relative'` and
 * an explicit height — both required for Chart.js to render correctly.
 *
 * Requires a database connection (for contextUser when linting with libraries).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ComponentLinter } from '../../lib/component-linter';
import { LibraryLintCache } from '../../lib/library-lint-cache';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

// ═══════════════════════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════════════════════

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_AVAILABLE = process.env.__MJ_DB_AVAILABLE === 'true';

/** Resolve the validator source from the metadata directory */
function loadValidatorSource(filename: string): string {
  const filePath = path.resolve(
    __dirname,
    '../../../../../../metadata/component-libraries/lint-rules/chart-js',
    filename,
  );
  return fs.readFileSync(filePath, 'utf-8');
}

function getContextUser(): UserInfo | undefined {
  if (!DB_AVAILABLE) return undefined;
  try {
    const user = UserCache.Instance.UserByName('System', false);
    return user || UserCache.Instance.Users?.[0] || undefined;
  } catch {
    return undefined;
  }
}

/** Base component spec with Chart.js as a library dependency */
const chartSpec: ComponentSpec = {
  name: 'ChartComponent',
  type: 'chart' as const,
  title: 'Test Chart',
  description: 'Test component for Chart.js canvas container validation',
  code: '',
  location: 'embedded' as const,
  functionalRequirements: 'Render a chart',
  technicalDesign: 'Uses Chart.js directly',
  exampleUsage: '<ChartComponent />',
  dataRequirements: {
    mode: 'queries' as const,
    queries: [
      {
        name: 'ChartData',
        categoryPath: 'Test',
        fields: [],
        entityNames: [],
      },
    ],
    entities: [],
  },
  libraries: [{ name: 'Chart.js', globalVariable: 'Chart' }],
} as ComponentSpec;

// The rule name that the linter assigns to library validator violations
const VIOLATION_RULE = 'chart.js-validator';

/** Common Chart.js useEffect boilerplate shared across test cases */
const CHART_EFFECT = `
  React.useEffect(() => {
    if (canvasRef.current) {
      const chart = new Chart(canvasRef.current, {
        type: 'bar',
        data: { labels: ['A'], datasets: [{ data: [1] }] },
      });
      return () => { chart.destroy(); };
    }
  }, []);`;

/** Build a complete component with the given JSX return block */
function makeComponent(jsxReturn: string): string {
  return `
    function ChartComponent({ utilities }) {
      const canvasRef = React.useRef(null);
      ${CHART_EFFECT}
      return (
        ${jsxReturn}
      );
    }
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Chart.js Canvas Container Lint Rule', () => {
  beforeAll(() => {
    // Load the validator JS from the file system and inject into the cache
    const validatorSource = loadValidatorSource('check-canvas-container.js');

    // Add test rules additively — do NOT clearCache() as that would wipe
    // DB-loaded rules needed by other tests running in the same process
    const cache = LibraryLintCache.getInstance();
    cache.addTestLibraryRules('Chart.js', {
      initialization: {
        constructorName: 'Chart',
        requiresNew: true,
        elementType: 'canvas',
        requiredConfig: ['type', 'data'],
      },
      lifecycle: {
        cleanupMethods: ['destroy'],
        updateMethods: ['update'],
        requiredMethods: [],
      },
      validators: {
        checkCanvasContainer: {
          description:
            'Validate canvas parent has position: relative and explicit height for Chart.js rendering',
          severity: 'high',
          validate: validatorSource,
        },
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Violation cases
  // ─────────────────────────────────────────────────────────────────────────

  it('should flag canvas container with NO style attribute', async () => {
    if (!DB_AVAILABLE) return;
    const contextUser = getContextUser();

    const code = makeComponent(`
      <div>
        <canvas ref={canvasRef} />
      </div>
    `);

    const result = await ComponentLinter.lintComponent(
      code, 'ChartComponent', chartSpec, true, contextUser,
    );

    const violations = result.violations.filter(
      v => v.rule === VIOLATION_RULE && v.message.includes('canvas container'),
    );
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].severity).toBe('high');
    expect(violations[0].message).toContain("position: 'relative'");
  });

  it('should flag canvas container missing position: relative (has height only)', async () => {
    if (!DB_AVAILABLE) return;
    const contextUser = getContextUser();

    const code = makeComponent(`
      <div style={{ width: '100%', height: '300px' }}>
        <canvas ref={canvasRef} />
      </div>
    `);

    const result = await ComponentLinter.lintComponent(
      code, 'ChartComponent', chartSpec, true, contextUser,
    );

    const violations = result.violations.filter(
      v => v.rule === VIOLATION_RULE && v.message.includes('canvas container'),
    );
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toContain("position: 'relative'");
    expect(violations[0].message).not.toContain('height');
  });

  it('should flag canvas container missing explicit height (has position only)', async () => {
    if (!DB_AVAILABLE) return;
    const contextUser = getContextUser();

    const code = makeComponent(`
      <div style={{ width: '100%', position: 'relative' }}>
        <canvas ref={canvasRef} />
      </div>
    `);

    const result = await ComponentLinter.lintComponent(
      code, 'ChartComponent', chartSpec, true, contextUser,
    );

    const violations = result.violations.filter(
      v => v.rule === VIOLATION_RULE && v.message.includes('canvas container'),
    );
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toContain('height');
    expect(violations[0].message).not.toContain("position: 'relative'");
  });

  it('should flag canvas container missing BOTH position and height', async () => {
    if (!DB_AVAILABLE) return;
    const contextUser = getContextUser();

    const code = makeComponent(`
      <div style={{ width: '100%', backgroundColor: '#fff' }}>
        <canvas ref={canvasRef} />
      </div>
    `);

    const result = await ComponentLinter.lintComponent(
      code, 'ChartComponent', chartSpec, true, contextUser,
    );

    const violations = result.violations.filter(
      v => v.rule === VIOLATION_RULE && v.message.includes('canvas container'),
    );
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].message).toContain("position: 'relative'");
    expect(violations[0].message).toContain('height');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Valid / no-violation cases
  // ─────────────────────────────────────────────────────────────────────────

  it('should NOT flag canvas container with correct position and height', async () => {
    if (!DB_AVAILABLE) return;
    const contextUser = getContextUser();

    const code = makeComponent(`
      <div style={{ width: '100%', height: '300px', position: 'relative' }}>
        <canvas ref={canvasRef} />
      </div>
    `);

    const result = await ComponentLinter.lintComponent(
      code, 'ChartComponent', chartSpec, true, contextUser,
    );

    const violations = result.violations.filter(
      v => v.rule === VIOLATION_RULE && v.message.includes('canvas container'),
    );
    expect(violations).toHaveLength(0);
  });

  it('should NOT flag canvas without a ref attribute', async () => {
    if (!DB_AVAILABLE) return;
    const contextUser = getContextUser();

    const code = makeComponent(`
      <div>
        <canvas id="myCanvas" />
      </div>
    `);

    const result = await ComponentLinter.lintComponent(
      code, 'ChartComponent', chartSpec, true, contextUser,
    );

    const violations = result.violations.filter(
      v => v.rule === VIOLATION_RULE && v.message.includes('canvas container'),
    );
    expect(violations).toHaveLength(0);
  });

  it('should accept dynamic height expression', async () => {
    if (!DB_AVAILABLE) return;
    const contextUser = getContextUser();

    const code = `
      function ChartComponent({ utilities, height = 300 }) {
        const canvasRef = React.useRef(null);
        ${CHART_EFFECT}
        return (
          <div style={{ width: '100%', height: height + 'px', position: 'relative' }}>
            <canvas ref={canvasRef} />
          </div>
        );
      }
    `;

    const result = await ComponentLinter.lintComponent(
      code, 'ChartComponent', chartSpec, true, contextUser,
    );

    const violations = result.violations.filter(
      v => v.rule === VIOLATION_RULE && v.message.includes('canvas container'),
    );
    expect(violations).toHaveLength(0);
  });
});
