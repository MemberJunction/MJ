import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { renderTemplate } from '@memberjunction/ng-test-utils';
import { MJTabStripComponent } from './tab-strip.component';
import { MJTabComponent } from '../tab/tab.component';
import { MJTabBodyComponent } from '../tab-body/tab-body.component';

/**
 * DOM-level spec for <mj-tabstrip> — a *compound* component: it only does anything
 * with projected <mj-tab>/<mj-tab-body> children, and its parts are module-declared.
 *
 * We use the shared `renderTemplate` helper, which wraps the markup in a host
 * component, declares the components, and waits for the tab-strip's async refresh
 * to settle — so the spec stays focused on behavior, not test plumbing.
 */
const TABSTRIP_MARKUP = `
  <mj-tabstrip>
    <mj-tab Name="A">Tab A</mj-tab>
    <mj-tab Name="B">Tab B</mj-tab>
    <mj-tab-body>Body A</mj-tab-body>
    <mj-tab-body>Body B</mj-tab-body>
  </mj-tabstrip>`;

function renderTabStrip(): Promise<ComponentFixture<unknown>> {
  return renderTemplate(TABSTRIP_MARKUP, {
    imports: [CommonModule],
    declarations: [MJTabStripComponent, MJTabComponent, MJTabBodyComponent],
  });
}

describe('MJTabStripComponent (DOM)', () => {
  it('renders both tab headers, with the first selected by default', async () => {
    const fixture = await renderTabStrip();
    const tabs = fixture.nativeElement.querySelectorAll('.single-tab');

    expect(tabs.length).toBe(2);
    expect(tabs[0].classList.contains('single-tab-selected')).toBe(true);
    expect(tabs[1].classList.contains('single-tab-selected')).toBe(false);
  });

  it('selects the second tab and shows its body when its header is clicked', async () => {
    const fixture = await renderTabStrip();
    const tabs = fixture.nativeElement.querySelectorAll('.single-tab');

    (tabs[1] as HTMLElement).click();
    await fixture.whenStable();

    expect(tabs[1].classList.contains('single-tab-selected')).toBe(true);
    expect(tabs[0].classList.contains('single-tab-selected')).toBe(false);

    const bodies = fixture.nativeElement.querySelectorAll('.tab-body');
    expect((bodies[1] as HTMLElement).hidden).toBe(false);
    expect((bodies[0] as HTMLElement).hidden).toBe(true);
  });
});
