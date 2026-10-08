import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encapsulateStyle } from '@angular/compiler';

/**
 * The shell animates the size of the stacks in its own tab layouts. A Golden Layout inside a tab's
 * content (the dashboard viewer) sizes its own stacks, so it must not get that transition: its stacks
 * would grow from zero height each time it rebuilds its layout, for example when Save leaves edit mode.
 *
 * The specs load the shell's stylesheets as the browser gets them (the shell's with Angular's emulated
 * encapsulation, the tab container's as written) and apply them to the element paths of the live shell.
 */

/** Stands in for the component id Angular generates for the shell. */
const SHELL_ID = 'shell';

/** A dashboard tab's content, down to one of the viewer's Golden Layout stacks. */
function dashboardContent(stackId: string): string {
  return `
        <mj-dashboard-resource>
          <div class="dashboard-resource-wrapper">
            <div class="dashboard-resource-container">
              <mj-dashboard-viewer>
                <div class="dashboard-viewer">
                  <div class="layout-container">
                    <div class="lm_goldenlayout lm_item lm_root">
                      <div class="lm_item lm_row">
                        <div id="${stackId}" class="lm_item lm_stack"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </mj-dashboard-viewer>
            </div>
          </div>
        </mj-dashboard-resource>`;
}

/** One of the shell's Golden Layouts, with one stack whose tab shows `content`. */
function shellLayout(stackId: string, content: string): string {
  return `
        <div class="lm_goldenlayout lm_item lm_root">
          <div class="lm_item lm_row">
            <div id="${stackId}" class="lm_item lm_stack">
              <section class="lm_items">
                <div>
                  <div class="lm_content">
                    <div class="tab-content-wrapper">${content}</div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>`;
}

/** Workspace tabs: the main region's Golden Layout, with a dashboard in its tab. */
const workspaceTabs = (): string => `<div class="gl-container">${shellLayout('main-stack', dashboardContent('tab-dashboard-stack'))}</div>`;

/** One resource without a tab bar: the dashboard sits in the main region with no shell layout around it. */
const singleResource = (): string => `<div class="direct-content-container">${dashboardContent('direct-dashboard-stack')}</div>`;

/** Renders the shell with `main` in its main region. The records region is shown when `showRecords` is true. */
function renderShell(main: string, showRecords = false): void {
  document.body.innerHTML = `
        <mj-shell _nghost-${SHELL_ID}="" class="app-body">
          <div _ngcontent-${SHELL_ID}="" class="shell-container tabs-visible">
            <mj-tab-container _ngcontent-${SHELL_ID}="">
              <div class="tab-container">
                <div class="main-region${showRecords ? ' region-hidden' : ''}">${main}</div>
                <div class="records-region${showRecords ? '' : ' region-hidden'}">
                  <div class="records-gl-container">${shellLayout('records-stack', '')}</div>
                </div>
              </div>
            </mj-tab-container>
          </div>
        </mj-shell>`;
}

/** The transition the loaded stylesheets give an element ('' when no rule gives it one). */
function transitionOf(id: string): string {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`The fixture has no #${id}`);
  }
  return getComputedStyle(element).getPropertyValue('transition').trim();
}

/** True when the element gets a transition other than none. */
function animates(id: string): boolean {
  const transition = transitionOf(id);
  return transition !== '' && !transition.startsWith('none');
}

describe('shell layout transitions', () => {
  const sheets: HTMLStyleElement[] = [];

  beforeAll(() => {
    const shellCss = readFileSync(join(__dirname, 'shell.component.css'), 'utf8');
    const tabContainerCss = readFileSync(join(__dirname, 'components', 'tabs', 'tab-container.component.css'), 'utf8');
    for (const css of [encapsulateStyle(shellCss, SHELL_ID), tabContainerCss]) {
      const sheet = document.createElement('style');
      sheet.textContent = css;
      document.head.appendChild(sheet);
      sheets.push(sheet);
    }
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  afterAll(() => {
    sheets.forEach((sheet) => sheet.remove());
  });

  it('gives the stacks of a dashboard in a workspace tab no transition', () => {
    renderShell(workspaceTabs());

    expect(transitionOf('tab-dashboard-stack')).toBe('');
  });

  it('gives the stacks of a dashboard shown without a tab bar no transition', () => {
    renderShell(singleResource());

    expect(transitionOf('direct-dashboard-stack')).toBe('');
  });

  it("still animates the stacks of the shell's own layouts in the main and records regions", () => {
    renderShell(workspaceTabs());
    expect(animates('main-stack')).toBe(true);

    renderShell(workspaceTabs(), true);
    expect(animates('records-stack')).toBe(true);
  });
});
