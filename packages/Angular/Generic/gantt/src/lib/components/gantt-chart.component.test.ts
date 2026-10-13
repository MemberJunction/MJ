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

interface AngularCmpInputs {
  inputs: Record<string, [string, number, unknown]>;
}

describe('MjGanttChartComponent inputs', () => {
  it('exposes EnableTooltips as a public input', () => {
    const cmp = (MjGanttChartComponent as unknown as { ɵcmp: AngularCmpInputs }).ɵcmp;
    expect(cmp.inputs['EnableTooltips'][0]).toBe('EnableTooltips');
  });
});
