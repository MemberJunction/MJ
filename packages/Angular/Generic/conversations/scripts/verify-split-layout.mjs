#!/usr/bin/env node
/**
 * REAL-BROWSER check of the realtime surface panel's `Layout="split"` geometry.
 *
 * The unit specs fake Golden Layout, because jsdom has no layout engine and a fake is the only
 * honest thing to assert against there. That leaves exactly one claim unproven — and it is the
 * claim two lost debugging sessions were spent on (issue #3535): that Golden Layout, given a
 * measured container, really does report side-by-side rects for a headerless row, that this
 * driver really does land the panes on them, and that it really does re-rect when the panel is
 * resized. A zero-height container makes GL lay its whole tree into nothing while reporting no
 * error, so "it compiled" and "the tests passed" are not evidence.
 *
 * Deliberately runs WITHOUT `goldenlayout-base.css`: the structural rules the driver injects
 * itself are what must be sufficient, so a host that never imported GL's stylesheet still gets a
 * split rather than two silently stacked surfaces.
 *
 * Usage: node scripts/verify-split-layout.mjs [--headed]
 */
import { chromium } from '@playwright/test';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const driverPath = resolve(here, '../src/lib/components/realtime/realtime-surface-split-layout.ts');

/** The panel's own layout rules, reduced to the parts that decide the split's geometry. */
const HARNESS_CSS = `
  body { margin: 0; }
  .surface {
    position: relative; display: flex; flex-direction: column;
    width: 900px; height: 600px; border-left: 1px solid #ccc;
  }
  .surface-tabs { flex-shrink: 0; height: 40px; background: #eee; }
  .s-pane { display: none; flex: 1; min-height: 0; flex-direction: column; overflow: hidden; position: relative; }
  .s-pane--active { display: flex; }
  .surface--split .s-pane { display: none; }
  .surface__split { flex: 1; min-height: 0; position: relative; }
`;

const HARNESS_HTML = `
  <aside class="surface surface--split">
    <div class="surface-tabs">tabs</div>
    <div class="s-pane s-pane--active" data-channel="Site A"><div class="body">A</div></div>
    <div class="s-pane" data-channel="Site B"><div class="body">B</div></div>
    <div class="surface__split"></div>
  </aside>
`;

const failures = [];
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    console.log(`  FAIL  ${label}${detail === undefined ? '' : ` — ${detail}`}`);
    failures.push(label);
  }
};

/** Bundle the driver for the browser, with MJ's logger stubbed to the console. */
async function bundleDriver() {
  const stubDir = mkdtempSync(join(tmpdir(), 'mj-split-verify-'));
  const stubPath = join(stubDir, 'mj-core-stub.js');
  writeFileSync(stubPath, 'export function LogError(message) { console.error(message); }\n');
  const result = await esbuild.build({
    entryPoints: [driverPath],
    bundle: true,
    format: 'iife',
    globalName: 'MJSplitLayout',
    write: false,
    platform: 'browser',
    alias: { '@memberjunction/core': stubPath },
  });
  return result.outputFiles[0].text;
}

const run = async () => {
  const driverBundle = await bundleDriver();
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('console', message => {
      if (message.type() === 'error') {
        console.log(`  [page error] ${message.text()}`);
      }
    });
    await page.setContent(`<!doctype html><html><head><style>${HARNESS_CSS}</style></head><body>${HARNESS_HTML}</body></html>`);
    await page.addScriptTag({ content: driverBundle });

    console.log('Golden Layout split, in Chromium, without goldenlayout-base.css:');

    const attached = await page.evaluate(() => {
      const surface = document.querySelector('.surface');
      const host = document.querySelector('.surface__split');
      const paneOf = key => document.querySelector(`.s-pane[data-channel="${key}"]`);
      const panes = ['Site A', 'Site B'].map(key => ({ Key: key, Title: key, Element: paneOf(key) }));
      window.__panes = panes;
      window.__layout = new window.MJSplitLayout.RealtimeSurfaceSplitLayout();
      const ok = window.__layout.Attach(host, panes);
      const rect = element => {
        const r = element.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      };
      return {
        ok,
        host: rect(host),
        surface: rect(surface),
        panes: panes.map(p => ({ Key: p.Key, Rect: rect(p.Element), Parent: p.Element.parentElement.className })),
      };
    });

    check('Attach reports success', attached.ok === true);
    const [a, b] = attached.panes.map(p => p.Rect);
    check('both surfaces have real area', a.width > 100 && a.height > 100 && b.width > 100 && b.height > 100,
      `A ${a.width}×${a.height}, B ${b.width}×${b.height}`);
    check('the surfaces sit SIDE BY SIDE, not stacked', a.left < b.left && a.right <= b.left + 1,
      `A.right=${a.right} B.left=${b.left}`);
    check('they share a top edge and height (a row, not a cascade)',
      Math.abs(a.top - b.top) < 1 && Math.abs(a.height - b.height) < 1,
      `A.top=${a.top} B.top=${b.top}`);
    check('they cover the layout host', Math.abs(a.left - attached.host.left) < 2 && Math.abs(b.right - attached.host.right) < 2,
      `host ${attached.host.left}..${attached.host.right}, panes ${a.left}..${b.right}`);
    check('they sit below the tab strip, inside the panel', a.top >= attached.surface.top + 40 - 1);
    check('no pane was re-parented', attached.panes.every(p => p.Parent.includes('surface')));

    // Resize: the panel's width is owned by the shell, so the arrangement has to follow it.
    const resized = await page.evaluate(async () => {
      document.querySelector('.surface').style.width = '600px';
      await new Promise(r => setTimeout(r, 500));
      return window.__panes.map(p => {
        const r = p.Element.getBoundingClientRect();
        return { left: r.left, width: r.width, right: r.right };
      });
    });
    check('the split follows a panel resize', resized[0].width < a.width && resized[1].width < b.width,
      `A ${a.width}→${resized[0].width}, B ${b.width}→${resized[1].width}`);
    check('it still fills the resized panel', Math.abs(resized[1].right - 600) < 3, `right edge ${resized[1].right}`);

    // Teardown: the panes go back to the tabs layout with nothing left on them.
    const destroyed = await page.evaluate(() => {
      window.__layout.Destroy();
      return {
        styles: window.__panes.map(p => p.Element.getAttribute('style') ?? ''),
        goldenLayoutDom: document.querySelectorAll('.surface__split .lm_root, .surface__split .lm_goldenlayout').length,
        activePaneVisible: getComputedStyle(window.__panes[0].Element).display,
      };
    });
    check('every pane is handed back with no inline geometry', destroyed.styles.every(s => s === ''), JSON.stringify(destroyed.styles));
    check('Golden Layout took its DOM with it', destroyed.goldenLayoutDom === 0, `${destroyed.goldenLayoutDom} left`);
    // .surface--split is still on the harness element, so panes stay hidden — that class is the
    // panel's to remove; what matters is that nothing inline is pinning them anymore.
    check('pane visibility is back under the stylesheet', destroyed.activePaneVisible === 'none', destroyed.activePaneVisible);

    // The trap itself: a host with no height must FAIL the attach, not lay the tree into nothing.
    const collapsed = await page.evaluate(() => {
      document.querySelector('.surface').style.height = '0px';
      const host = document.querySelector('.surface__split');
      const layout = new window.MJSplitLayout.RealtimeSurfaceSplitLayout();
      const ok = layout.Attach(host, window.__panes);
      const styles = window.__panes.map(p => p.Element.getAttribute('style') ?? '');
      layout.Destroy();
      return { ok, styles, hostHeight: host.getBoundingClientRect().height };
    });
    check('a zero-height host FAILS the attach instead of collapsing silently',
      collapsed.ok === false, `host height ${collapsed.hostHeight}, Attach returned ${collapsed.ok}`);
    check('a failed attach leaves the panes untouched', collapsed.styles.every(s => s === ''), JSON.stringify(collapsed.styles));
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) FAILED: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('\nAll split-layout geometry checks passed.');
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});
