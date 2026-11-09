import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * A component may declare at most ONE `@HostListener` per event name.
 *
 * Angular's compiler collects host listeners into an object keyed by event name, so a
 * second declaration for the same event silently replaces the first — no build error,
 * no warning, the earlier handler simply never registers. A behavioural test only ever
 * sees the surviving handler, so this check reads the source.
 */

/**
 * Anchored to the start of a line (after indentation) so the decorator is matched but
 * prose about it is not — `whiteboard-host.component.ts` carries a "do NOT add a second
 * `@HostListener('document:click')`" warning in a JSDoc block.
 */
const HOST_LISTENER = /^[ \t]*@HostListener\(\s*['"]([^'"]+)['"]/gm;

/** Files whose host-listener declarations must stay unique per event. */
const GUARDED = ['../lib/whiteboard-host.component.ts'];

function eventsIn(relativePath: string): string[] {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), relativePath), 'utf8');
  return [...source.matchAll(HOST_LISTENER)].map((m) => m[1]);
}

describe('@HostListener uniqueness', () => {
  for (const file of GUARDED) {
    it(`${file} declares each host event exactly once`, () => {
      const events = eventsIn(file);
      expect(events.length).toBeGreaterThan(0); // the regex must still match something

      const duplicates = events.filter((e, i) => events.indexOf(e) !== i);
      expect(duplicates).toEqual([]);
    });
  }

  it('the whiteboard host still owns the popover-dismiss click handler', () => {
    // Guards the other direction: a merge that drops the consolidated listener
    // entirely would leave the duplicate check trivially satisfied.
    expect(eventsIn(GUARDED[0])).toContain('document:click');
  });
});
