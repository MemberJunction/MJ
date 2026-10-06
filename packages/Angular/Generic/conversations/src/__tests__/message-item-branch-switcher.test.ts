// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MessageItemComponent } from '../lib/components/message/message-item.component';
import type { BranchSwitchRequest } from '../lib/utils/conversation-branching';

/**
 * The branch switcher steps to the previous or next alternative, wrapping at either end, and does
 * nothing while a reply is processing. Its step buttons are disabled meanwhile; the position text
 * stays visible.
 *
 * Built via `Object.create(prototype)` so the real handler runs against stubbed collaborators,
 * matching `message-item-regenerate.test.ts`.
 */

interface Harness {
  component: MessageItemComponent;
  emitted: BranchSwitchRequest[];
}

function createHarness(opts: { processing?: boolean } = {}): Harness {
  const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
  const open = component as unknown as Record<string, unknown>;
  const emitted: BranchSwitchRequest[] = [];

  open.message = { ID: 'ROW-5' };
  open.BranchSwitchRequested = { emit: (request: BranchSwitchRequest) => emitted.push(request) };
  component.BranchSwitcher = {
    CurrentIndex: 0,
    Alternatives: [
      { BranchID: 'BRANCH-A', Name: null },
      { BranchID: 'BRANCH-B', Name: null },
      { BranchID: 'BRANCH-C', Name: null },
    ],
  };
  component.IsProcessing = opts.processing ?? false;

  return { component, emitted };
}

describe('MessageItemComponent branch switcher', () => {
  it('requests the next alternative', () => {
    const h = createHarness();

    h.component.OnBranchStep(1);

    expect(h.emitted).toEqual([{ DetailID: 'ROW-5', BranchID: 'BRANCH-B' }]);
  });

  it('wraps from the first alternative to the last', () => {
    const h = createHarness();

    h.component.OnBranchStep(-1);

    expect(h.emitted).toEqual([{ DetailID: 'ROW-5', BranchID: 'BRANCH-C' }]);
  });

  it('requests nothing while a reply is processing', () => {
    const h = createHarness({ processing: true });

    h.component.OnBranchStep(1);
    h.component.OnBranchStep(-1);

    expect(h.emitted).toHaveLength(0);
  });
});

describe('message item branch switcher template', () => {
  const html = readFileSync(resolve(__dirname, '../lib/components/message/message-item.component.html'), 'utf8');
  const start = html.indexOf('<span class="message-branch-switcher"');
  const switcher = html.slice(start, html.indexOf('</span>\n      }', start));

  it('disables both step buttons while processing', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    const buttons = switcher.match(/<button[^>]*class="branch-step"[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toContain('[disabled]="IsProcessing"');
    }
  });

  it('keeps the position text unconditional', () => {
    expect(switcher).toContain('<span class="branch-position">');
    expect(switcher).not.toMatch(/@if \(\s*!?IsProcessing/);
  });
});
