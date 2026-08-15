import { describe, it, expect } from 'vitest';
import { MjGanttChartComponent } from './gantt-chart.component';

interface AngularCmpDef {
  outputs: Record<string, string>;
}

describe('MjGanttChartComponent', () => {
  it('exposes ItemDoubleClicked as a public output', () => {
    const cmp = (MjGanttChartComponent as unknown as { ɵcmp: AngularCmpDef }).ɵcmp;
    expect(cmp.outputs['ItemDoubleClicked']).toBe('ItemDoubleClicked');
  });

  it('exposes BeforeZoomChange and AfterZoomChange as public outputs', () => {
    const cmp = (MjGanttChartComponent as unknown as { ɵcmp: AngularCmpDef }).ɵcmp;
    expect(cmp.outputs['BeforeZoomChange']).toBe('BeforeZoomChange');
    expect(cmp.outputs['AfterZoomChange']).toBe('AfterZoomChange');
  });
});
