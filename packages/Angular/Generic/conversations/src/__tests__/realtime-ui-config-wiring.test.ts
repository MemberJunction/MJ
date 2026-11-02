import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ResolveRealtimeUi, DEFAULT_REALTIME_UI_SIGNALS } from '../lib/components/realtime/realtime-ui-config';

const here = dirname(fileURLToPath(import.meta.url));
const overlayDir = resolve(here, '../lib/components/realtime');
const overlaySource =
  readFileSync(resolve(overlayDir, 'realtime-session-overlay.component.html'), 'utf8') +
  readFileSync(resolve(overlayDir, 'realtime-session-overlay.component.ts'), 'utf8');

/** `source` without HTML, block and line comments, so a key named only in a comment does not count as read. */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Whether `source` reads the resolved key as `Ui.<key>` or `_ui.<key>` in code, not only in a comment. */
function readsResolvedKey(source: string, key: string): boolean {
  const code = stripComments(source);
  return code.includes(`Ui.${key}`) || code.includes(`_ui.${key}`);
}

describe('the wiring guard itself (#6120)', () => {
  it('does not count a key that appears only in a comment', () => {
    const source = [
      '<!-- binds Ui.showHero -->',
      '/** Reads {@link Ui.showThread}. */',
      '// this._ui.showGear is the gear',
      'const x = 1;',
    ].join('\n');
    expect(readsResolvedKey(source, 'showHero')).toBe(false);
    expect(readsResolvedKey(source, 'showThread')).toBe(false);
    expect(readsResolvedKey(source, 'showGear')).toBe(false);
  });

  it('counts a key read in a binding or in code', () => {
    expect(readsResolvedKey('[DevMode]="Ui.showDevLinks"', 'showDevLinks')).toBe(true);
    expect(readsResolvedKey('return this._ui.showHero;', 'showHero')).toBe(true);
    expect(readsResolvedKey('const url = "https://x"; return this._ui.showHero;', 'showHero')).toBe(true);
  });
});

describe('every resolved UI output is read by the overlay (#6101)', () => {
  const keys = Object.keys(ResolveRealtimeUi(undefined, DEFAULT_REALTIME_UI_SIGNALS));
  it.each(keys)('%s is bound in the overlay template or component', (key) => {
    const bound = readsResolvedKey(overlaySource, key);
    expect(bound, `ResolvedRealtimeUi.${key} is computed but nothing in the overlay reads it`).toBe(true);
  });
});
