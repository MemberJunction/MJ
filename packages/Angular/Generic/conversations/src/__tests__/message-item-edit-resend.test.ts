// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MessageItemComponent } from '../lib/components/message/message-item.component';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

/**
 * Saving an edit hands the text to the host, which sends it on a new branch. The original row
 * must never be written.
 *
 * Built via `Object.create(prototype)` so the real `SaveEdit` runs against stubbed collaborators,
 * matching `message-item-liveness.test.ts`.
 */

type EditResendEvent = { Message: MJConversationDetailEntity; NewText: string };

interface Harness {
  component: MessageItemComponent;
  message: { ID: string; Message: string; Save: ReturnType<typeof vi.fn> };
  emitted: EditResendEvent[];
}

function createHarness(original: string, edited: string): Harness {
  const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
  const open = component as unknown as Record<string, unknown>;
  const emitted: EditResendEvent[] = [];
  const message = { ID: 'MSG-1', Message: original, Save: vi.fn(async () => true) };

  open.message = message;
  open.originalText = original;
  open.cdRef = { detectChanges: vi.fn(), markForCheck: vi.fn() };
  open.EditResendRequested = { emit: (e: EditResendEvent) => emitted.push(e) };
  component.IsEditing = true;
  component.EditedText = edited;

  return { component, message, emitted };
}

describe('MessageItemComponent.SaveEdit', () => {
  it('emits the trimmed text, closes the editor and leaves the row unchanged', async () => {
    const h = createHarness('What is the capital of France?', '  What is the capital of Spain?  ');

    await h.component.SaveEdit();

    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0].NewText).toBe('What is the capital of Spain?');
    expect(h.emitted[0].Message).toBe(h.message);
    expect(h.message.Save).not.toHaveBeenCalled();
    expect(h.message.Message).toBe('What is the capital of France?');
    expect(h.component.IsEditing).toBe(false);
    expect(h.component.EditedText).toBe('');
  });

  it('cancels without emitting when the text is unchanged', async () => {
    const h = createHarness('Hello', 'Hello');

    await h.component.SaveEdit();

    expect(h.emitted).toHaveLength(0);
    expect(h.message.Save).not.toHaveBeenCalled();
    expect(h.component.IsEditing).toBe(false);
  });

  it('cancels without emitting when the text is blank', async () => {
    const h = createHarness('Hello', '   ');

    await h.component.SaveEdit();

    expect(h.emitted).toHaveLength(0);
    expect(h.message.Save).not.toHaveBeenCalled();
    expect(h.component.IsEditing).toBe(false);
  });
});
