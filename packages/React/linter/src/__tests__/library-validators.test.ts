/**
 * Library lint validators (ComponentLibrary.LintRules) run once per AST node.
 *
 * ApexCharts' `checkChartRefManagement` threw "callPath.stop is not a function" on every
 * node of any component that exported a chart, because its once-per-lint export check
 * reset its cached `false` with `|| null` and re-ran a walk that called `stop()` on a
 * fake path. Skip's eval logs showed "Validator checkChartRefManagement failed: {}"
 * 25,742 times in one suite: the error object itself was logged, which JSON log
 * pipelines print as `{}`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import type { File } from '@babel/types';
import { ComponentLinter } from '../component-linter';
import { CompiledValidator, LibraryLintCache } from '../library-lint-cache';

const APEX_RULES = fileURLToPath(new URL('../../../../../metadata/component-libraries/lint-rules/apexcharts/', import.meta.url));

function ast(code: string): File {
  return parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
}

/** Compiles a validator file exactly as the cache compiles `LintRules` from the database. */
function compileValidator(libraryName: string, file: string): Record<string, CompiledValidator> {
  const validate = readFileSync(`${APEX_RULES}${file}`, 'utf8');
  LibraryLintCache.Instance.AddTestLibraryRules(libraryName, { validators: { check: { validate, description: file } } });
  return LibraryLintCache.Instance.GetLibraryRules(libraryName)?.validators ?? {};
}

function runValidators(code: string, validators: Record<string, CompiledValidator>) {
  return ComponentLinter['executeCompiledValidators'](ast(code), 'ApexCharts', 'ApexCharts', validators, false);
}

const CHART_WITH_EXPORT = `function RevenueChart({ utilities }) {
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  useEffect(() => {
    const chart = new ApexCharts(containerRef.current, { chart: { type: 'bar' }, series: [] });
    chart.render();
    chartRef.current = chart;
    return () => chart.destroy();
  }, []);
  const exportPng = async () => { const { imgURI } = await chartRef.current.dataURI(); return imgURI; };
  return <div ref={containerRef} onClick={exportPng} />;
}`;

afterEach(() => {
  LibraryLintCache.Instance.ClearCache();
});

describe('apexcharts checkChartRefManagement', () => {
  it('runs on a component that exports a chart without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const violations = runValidators(CHART_WITH_EXPORT, compileValidator('ApexChartsRefOk', 'check-chart-ref-management.js'));
    expect(warn).not.toHaveBeenCalled();
    expect(violations).toEqual([]);
  });

  it('still reports a chart that is not stored in a ref when the component exports', () => {
    const code = CHART_WITH_EXPORT.replace('    chartRef.current = chart;\n', '');
    const violations = runValidators(code, compileValidator('ApexChartsRefMissing', 'check-chart-ref-management.js'));
    expect(violations.map((v) => v.message)).toContain(
      "ApexCharts instance 'chart' should be attached to a ref for export functionality",
    );
  });

  it('does not report a missing ref when nothing exports the chart', () => {
    const code = CHART_WITH_EXPORT.replace('    chartRef.current = chart;\n', '').replace('chartRef.current.dataURI()', 'Promise.resolve({})');
    expect(runValidators(code, compileValidator('ApexChartsNoExport', 'check-chart-ref-management.js'))).toEqual([]);
  });
});

describe('validator failure logging', () => {
  it('logs one line with the error message and node count for a validator that throws on every node', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const throwing: CompiledValidator = {
      description: 'always throws',
      severity: 'low',
      validateFn: () => {
        throw new TypeError('callPath.stop is not a function');
      },
    };
    runValidators(CHART_WITH_EXPORT, { checkBroken: throwing });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(
      /^Validator ApexCharts\/checkBroken failed on \d+ AST node\(s\): callPath\.stop is not a function$/,
    );
  });
});
