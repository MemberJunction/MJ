import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { By } from '@angular/platform-browser';
import { ComponentFixture } from '@angular/core/testing';
import { renderTemplate, capture } from '@memberjunction/ng-test-utils';
import { MJTabStripComponent, TabCancelableEvent, TabContextMenuEvent } from '../tab-strip/tab-strip.component';
import { MJTabComponent } from './tab.component';
import { MJTabBodyComponent } from '../tab-body/tab-body.component';

/**
 * DOM coverage for <mj-tab> — the header chip of a tab strip (~48×). It's module-declared and takes
 * its parent MJTabStripComponent via @Host, so it can only render inside a <mj-tabstrip>. These render
 * a small strip and verify the tab's own DOM surface: projected label, the TabCloseable-gated close
 * button, click-to-select, close-button stopPropagation (emits BeforeTabClosed without selecting), and
 * the context-menu → TabContextMenu path with preventDefault.
 *
 * Note: CloseTab, when not cancelled, emits TabClosed and awaits the container's done() callback — so
 * the close-button spec cancels in the BeforeTabClosed handler (mirrors a container vetoing a close),
 * which is also exactly what exercises the cancel branch.
 */
const MARKUP = `
  <mj-tabstrip>
    <mj-tab Name="A">Alpha</mj-tab>
    <mj-tab Name="B" [TabCloseable]="true">Beta</mj-tab>
    <mj-tab-body>Body A</mj-tab-body>
    <mj-tab-body>Body B</mj-tab-body>
  </mj-tabstrip>`;

const renderStrip = (): Promise<ComponentFixture<unknown>> =>
  renderTemplate(MARKUP, {
    imports: [CommonModule],
    declarations: [MJTabStripComponent, MJTabComponent, MJTabBodyComponent],
  });

const strip = (f: ComponentFixture<unknown>) =>
  f.debugElement.query(By.directive(MJTabStripComponent)).componentInstance as MJTabStripComponent;
const tabHeaders = (f: ComponentFixture<unknown>) => f.nativeElement.querySelectorAll('.single-tab') as NodeListOf<HTMLElement>;

describe('MJTabComponent (DOM)', () => {
  it('projects its label into the tab header', async () => {
    const f = await renderStrip();
    expect(tabHeaders(f)[0].textContent?.trim()).toContain('Alpha');
  });

  it('renders the close button only for TabCloseable tabs', async () => {
    const f = await renderStrip();
    const tabs = tabHeaders(f);
    expect(tabs[0].querySelector('.tab-close-button')).toBeNull();
    expect(tabs[1].querySelector('.tab-close-button')).not.toBeNull();
  });

  it('selects the tab when its header is clicked', async () => {
    const f = await renderStrip();
    const tabs = tabHeaders(f);
    tabs[1].click();
    await f.whenStable();
    expect(tabs[1].classList.contains('single-tab-selected')).toBe(true);
    expect(tabs[0].classList.contains('single-tab-selected')).toBe(false);
  });

  it('close-button click emits BeforeTabClosed for that tab without selecting it', async () => {
    const f = await renderStrip();
    const closed = capture(strip(f).BeforeTabClosed);
    // veto the close so CloseTab does not proceed to await the container's done() callback
    strip(f).BeforeTabClosed.subscribe((e: TabCancelableEvent) => (e.cancel = true));
    const tabs = tabHeaders(f);
    (tabs[1].querySelector('.tab-close-button') as HTMLElement).click();
    await f.whenStable();
    expect(closed.map((e) => e.index)).toEqual([1]);
    // stopPropagation means the tab was not selected by the close click
    expect(tabs[1].classList.contains('single-tab-selected')).toBe(false);
  });

  it('right-click emits TabContextMenu and suppresses the native menu', async () => {
    const f = await renderStrip();
    const menu = capture(strip(f).TabContextMenu);
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    tabHeaders(f)[1].dispatchEvent(evt);
    await f.whenStable();
    expect(menu.map((e: TabContextMenuEvent) => e.index)).toEqual([1]);
    expect(evt.defaultPrevented).toBe(true);
  });
});
