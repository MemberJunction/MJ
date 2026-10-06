// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MessageItemComponent } from '../lib/components/message/message-item.component';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

/**
 * The Regenerate button shows on a finished AI reply that is not being edited, and a click hands
 * the reply to the host, which regenerates it on a new branch.
 *
 * Built via `Object.create(prototype)` so the real getter and handlers run against stubbed
 * collaborators, matching `message-item-edit-resend.test.ts`.
 */

interface Harness {
  component: MessageItemComponent;
  message: { ID: string; Role: string; Status: 'Complete' | 'In-Progress' | 'Error' };
  emitted: MJConversationDetailEntity[];
}

function createHarness(opts: { role?: string; status?: 'Complete' | 'In-Progress' | 'Error'; processing?: boolean; editing?: boolean } = {}): Harness {
  const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
  const open = component as unknown as Record<string, unknown>;
  const emitted: MJConversationDetailEntity[] = [];
  const message = { ID: 'MSG-1', Role: opts.role ?? 'AI', Status: opts.status ?? 'Complete' };

  open.message = message;
  open.RegenerateRequested = { emit: (m: MJConversationDetailEntity) => emitted.push(m) };
  component.IsProcessing = opts.processing ?? false;
  component.IsEditing = opts.editing ?? false;

  return { component, message, emitted };
}

describe('MessageItemComponent regenerate', () => {
  it('allows a finished or failed AI reply', () => {
    expect(createHarness({ status: 'Complete' }).component.CanRegenerate).toBe(true);
    expect(createHarness({ status: 'Error' }).component.CanRegenerate).toBe(true);
  });

  it('refuses a user message, a reply still in progress, while processing and while editing', () => {
    expect(createHarness({ role: 'User' }).component.CanRegenerate).toBe(false);
    expect(createHarness({ status: 'In-Progress' }).component.CanRegenerate).toBe(false);
    expect(createHarness({ processing: true }).component.CanRegenerate).toBe(false);
    expect(createHarness({ editing: true }).component.CanRegenerate).toBe(false);
  });

  it('emits the reply on click when it can be regenerated', () => {
    const h = createHarness();

    h.component.OnRegenerateClick();

    expect(h.emitted).toEqual([h.message]);
  });

  it('emits nothing on click when it cannot be regenerated', () => {
    const h = createHarness({ status: 'In-Progress' });

    h.component.OnRegenerateClick();

    expect(h.emitted).toHaveLength(0);
  });

  it('keeps the deprecated retry click working through the regenerate path', () => {
    const h = createHarness({ status: 'Error' });

    h.component.OnRetryClick();

    expect(h.emitted).toEqual([h.message]);
  });
});
