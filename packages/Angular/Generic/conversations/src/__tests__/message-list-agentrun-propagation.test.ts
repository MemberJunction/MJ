// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import type { SimpleChanges } from '@angular/core';
import { MessageListComponent } from '../lib/components/message/message-list.component';

/**
 * A run refreshed mid-flight must reach the bubble that is displaying it (MJ #4222).
 *
 * `agentRun` is stamped onto each message item as static config when the item is created or
 * updated, so replacing the map alone never reaches an item already on screen — it keeps the
 * object it was handed. `ngOnChanges` already re-rendered for `messages`, `artifactMap`,
 * `attachmentsMap` and `sessionMetaMap`; `agentRunMap` was missing from that list.
 *
 * Harmless until per-message liveness existed, because nothing read run fields mid-flight. Now
 * reconciliation re-reads the run over HTTP exactly when the socket is dead, and a fresh
 * `LastHeartbeatAt` that cannot reach the bubble leaves the pill degraded while the client is in
 * fact being told the run is healthy. Observed in the browser: the pill held 'checking…' for a
 * full minute across reconciles that were succeeding.
 */
function harness() {
  const component = Object.create(MessageListComponent.prototype) as MessageListComponent;
  const open = component as unknown as Record<string, unknown>;
  const rendered: string[] = [];

  open.messages = [{ ID: 'MSG-1' }];
  open.messageContainerRef = {};
  open.updateMessages = vi.fn(() => { rendered.push('render'); });
  open.updateDateFilterVisibility = vi.fn();
  open.resolveScrollParent = vi.fn(() => null);

  return { component, open, rendered };
}

const change = (key: string): SimpleChanges =>
  ({ [key]: { currentValue: new Map(), previousValue: new Map(), firstChange: false, isFirstChange: () => false } }) as SimpleChanges;

describe('MessageListComponent agent-run propagation', () => {
  it('re-renders when the agent-run map is replaced', () => {
    const h = harness();
    h.component.ngOnChanges(change('agentRunMap'));
    expect(h.rendered).toEqual(['render']);
  });

  it('still re-renders for the maps that already worked', () => {
    for (const key of ['artifactMap', 'attachmentsMap', 'sessionMetaMap']) {
      const h = harness();
      h.component.ngOnChanges(change(key));
      expect(h.rendered, `${key} should re-render`).toEqual(['render']);
    }
  });

  it('does not re-render for an unrelated input', () => {
    const h = harness();
    h.component.ngOnChanges(change('userAvatarMap'));
    expect(h.rendered).toEqual([]);
  });

  it('does nothing before the container exists', () => {
    const h = harness();
    h.open.messageContainerRef = undefined;
    h.component.ngOnChanges(change('agentRunMap'));
    expect(h.rendered).toEqual([]);
  });
});
