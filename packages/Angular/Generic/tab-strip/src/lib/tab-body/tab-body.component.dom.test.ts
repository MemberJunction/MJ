import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { renderTemplate } from '@memberjunction/ng-test-utils';
import { MJTabStripComponent } from '../tab-strip/tab-strip.component';
import { MJTabComponent } from '../tab/tab.component';
import { MJTabBodyComponent } from './tab-body.component';

/**
 * DOM coverage for <mj-tab-body> — the content pane paired to each <mj-tab> (~9×). Module-declared,
 * takes its parent MJTabStripComponent via @Host, so it renders inside a <mj-tabstrip>. The tab strip
 * drives each body's TabVisible (only the selected index is visible), and the template binds that to
 * `[hidden]`. These verify the body renders + projects, that only the selected body is shown, and that
 * changing the selected tab moves visibility to the matching body.
 */
const MARKUP = `
  <mj-tabstrip>
    <mj-tab Name="A">Alpha</mj-tab>
    <mj-tab Name="B">Beta</mj-tab>
    <mj-tab-body>Body A</mj-tab-body>
    <mj-tab-body>Body B</mj-tab-body>
  </mj-tabstrip>`;

const renderStrip = (): Promise<ComponentFixture<unknown>> =>
  renderTemplate(MARKUP, {
    imports: [CommonModule],
    declarations: [MJTabStripComponent, MJTabComponent, MJTabBodyComponent],
  });

const bodies = (f: ComponentFixture<unknown>) => f.nativeElement.querySelectorAll('.tab-body') as NodeListOf<HTMLElement>;
const headers = (f: ComponentFixture<unknown>) => f.nativeElement.querySelectorAll('.single-tab') as NodeListOf<HTMLElement>;

describe('MJTabBodyComponent (DOM)', () => {
  it('renders one body pane per tab body and projects content', async () => {
    const f = await renderStrip();
    const b = bodies(f);
    expect(b.length).toBe(2);
    expect(b[0].textContent?.trim()).toContain('Body A');
    expect(b[1].textContent?.trim()).toContain('Body B');
  });

  it('shows the body matching the selected tab (only one visible at a time)', async () => {
    const f = await renderStrip();
    // The strip pushes TabVisible onto bodies on a selection *change*, so drive a real selection to
    // tab 0 (via tab 1 and back) to exercise the body-follows-selection contract deterministically.
    headers(f)[1].click();
    await f.whenStable();
    headers(f)[0].click();
    await f.whenStable();
    const b = bodies(f);
    expect(b[0].hidden).toBe(false);
    expect(b[1].hidden).toBe(true);
  });

  it('moves visibility to the matching body when another tab is selected', async () => {
    const f = await renderStrip();
    headers(f)[1].click();
    await f.whenStable();
    const b = bodies(f);
    expect(b[0].hidden).toBe(true);
    expect(b[1].hidden).toBe(false);
  });
});
