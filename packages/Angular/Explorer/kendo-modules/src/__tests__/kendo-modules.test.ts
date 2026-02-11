/**
 * Tests for kendo-modules package:
 * - MJKendoModule export verification
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  NgModule: () => (target: Function) => target,
}));

vi.mock('@progress/kendo-angular-grid', () => ({ GridModule: class {} }));
vi.mock('@progress/kendo-angular-layout', () => ({ LayoutModule: class {} }));
vi.mock('@progress/kendo-angular-icons', () => ({ IconsModule: class {} }));
vi.mock('@progress/kendo-angular-navigation', () => ({ NavigationModule: class {} }));
vi.mock('@progress/kendo-angular-inputs', () => ({ InputsModule: class {} }));
vi.mock('@progress/kendo-angular-dropdowns', () => ({ DropDownsModule: class {} }));
vi.mock('@progress/kendo-angular-label', () => ({ LabelModule: class {} }));
vi.mock('@progress/kendo-angular-buttons', () => ({ ButtonsModule: class {} }));
vi.mock('@progress/kendo-angular-dialog', () => ({ DialogsModule: class {} }));
vi.mock('@progress/kendo-angular-dateinputs', () => ({ DateInputsModule: class {} }));
vi.mock('@progress/kendo-angular-notification', () => ({ NotificationModule: class {} }));

describe('MJKendoModule', () => {
  it('should export the kendo module bundle', async () => {
    const mod = await import('../lib/kendo-modules.module');
    expect(mod.MJKendoModule).toBeDefined();
  });
});
