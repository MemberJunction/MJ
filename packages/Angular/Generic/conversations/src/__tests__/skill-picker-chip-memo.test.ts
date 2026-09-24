/**
 * @fileoverview Tests for the memo behind `MessageInputComponent.pickerTargetAgentId`.
 *
 * The getter is bound in the template on a default-change-detection component, so it must not walk
 * the editor DOM (`getMentionChipsData()`) on every cycle — but it must still see every way a chip
 * can reach the editor. Those arrive by two kinds of path and only one announces itself:
 *
 *   - user editing / `clear()` end in the editor's `onInput()`, which emits `valueChange` and so
 *     reaches `OnComposerValueChanged`;
 *   - a RESTORED DRAFT goes `[initialDraft]` -> `SetDraft` -> `messageText` -> `[value]` ->
 *     `ngModel.writeValue` -> `setEditorContent`, which rebuilds chips with `appendChild` and never
 *     calls `onInput()`. No `valueChange`, so no hook fires.
 *
 * The restore case is what an eager "refresh in OnComposerValueChanged" gets wrong: the memo keeps
 * whatever the previous conversation left and `/` narrows to the wrong agent until the next
 * keystroke. Hence invalidate-and-lazy, pinned here.
 *
 * Instantiated via the prototype (no constructor/TestBed), same style as message-input-streaming.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MessageInputComponent } from '../lib/components/message/message-input.component';

type Chip = { type: string; id: string };

const MENTIONED = 'AAAAAAAA-0000-0000-0000-00000000000A';
const FALLBACK = 'FFFFFFFF-0000-0000-0000-00000000000F';

interface Harness {
    component: MessageInputComponent;
    /** Chips the editor currently holds; mutate to simulate the DOM changing. */
    chips: Chip[];
    /** How many times the getter has walked the editor DOM. */
    walks: () => number;
}

function buildHarness(initialChips: Chip[] = []): Harness {
    const chips: Chip[] = [...initialChips];
    const getMentionChipsData = vi.fn(() => chips);

    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        inputBox: { getMentionChipsData, focus: vi.fn() },
        // resolveCurrentAgentId's precedence chain — only the last rung is populated, so the
        // fallback is unambiguous and distinguishable from a chip hit.
        findLastNonSageAgentId: () => null,
        conversationDefaultAgentId: null,
        defaultAgentId: null,
        converationManagerAgent: { ID: FALLBACK },
        // OnComposerValueChanged's other side effects.
        DraftStateChanged: { emit: vi.fn() },
        GetSerializedDraft: () => '',
    });

    return { component, chips, walks: () => getMentionChipsData.mock.calls.length };
}

describe('pickerTargetAgentId — chip memo', () => {
    let h: Harness;
    beforeEach(() => { h = buildHarness(); });

    it('falls back to the routed agent when the draft has no @agent chip', () => {
        expect(h.component.pickerTargetAgentId).toBe(FALLBACK);
    });

    it('returns the @agent chip when one is present', () => {
        h.chips.push({ type: 'agent', id: MENTIONED });
        expect(h.component.pickerTargetAgentId).toBe(MENTIONED);
    });

    it('ignores non-agent chips', () => {
        h.chips.push({ type: 'user', id: 'someone' });
        expect(h.component.pickerTargetAgentId).toBe(FALLBACK);
    });

    it('walks the editor DOM once, not once per read — the whole point of the memo', () => {
        h.chips.push({ type: 'agent', id: MENTIONED });
        for (let i = 0; i < 5; i++) {
            expect(h.component.pickerTargetAgentId).toBe(MENTIONED);
        }
        expect(h.walks()).toBe(1);
    });

    it('memoises "no chip" too — a null result must not be mistaken for "not yet computed"', () => {
        expect(h.component.pickerTargetAgentId).toBe(FALLBACK);
        expect(h.component.pickerTargetAgentId).toBe(FALLBACK);
        expect(h.walks()).toBe(1);
    });

    it('recomputes after OnComposerValueChanged (the typed-input path)', () => {
        expect(h.component.pickerTargetAgentId).toBe(FALLBACK);
        h.chips.push({ type: 'agent', id: MENTIONED });
        h.component.OnComposerValueChanged('@Betty ');
        expect(h.component.pickerTargetAgentId).toBe(MENTIONED);
        expect(h.walks()).toBe(2);
    });

    /**
     * THE REGRESSION. Restoring a draft rewrites the editor without emitting `valueChange`, so an
     * eager refresh keyed on OnComposerValueChanged never runs and the stale memo wins. Switch away
     * from a conversation with `@Betty` pre-addressed and back, and `/` narrows to the wrong agent.
     */
    it('sees a chip that arrived via a restored draft, with no valueChange in between', () => {
        // Read once so the memo is warm and holds "no chip".
        expect(h.component.pickerTargetAgentId).toBe(FALLBACK);

        // The restore: SetDraft flows text down to the editor, which rebuilds the chips itself.
        h.component.SetDraft('@Betty ', false);
        h.chips.push({ type: 'agent', id: MENTIONED });

        expect(h.component.pickerTargetAgentId).toBe(MENTIONED);
    });

    /**
     * `handleSuccessfulSend` and the empty-state submit reset the composer with a bare
     * `messageText = ''` and never call `mentionEditor.clear()`, so no `valueChange` is emitted.
     * Invalidating in OnComposerValueChanged/SetDraft alone would leave the sent message's chip in
     * the memo and narrow the picker to it against an empty composer.
     */
    it('drops the chip when a send resets the text without touching the editor', () => {
        h.chips.push({ type: 'agent', id: MENTIONED });
        expect(h.component.pickerTargetAgentId).toBe(MENTIONED);

        h.component.messageText = ''; // what handleSuccessfulSend does
        h.chips.length = 0;

        expect(h.component.pickerTargetAgentId).toBe(FALLBACK);
    });

    /**
     * conversation-chat-area assigns `messageText` on this component directly (three call sites),
     * bypassing both SetDraft and OnComposerValueChanged entirely. The memo has to survive hosts
     * that never call a method on it.
     */
    it('drops the chip when a host assigns messageText from outside', () => {
        h.chips.push({ type: 'agent', id: MENTIONED });
        expect(h.component.pickerTargetAgentId).toBe(MENTIONED);

        h.component.messageText = 'Analyze "Something" — ';
        h.chips.length = 0;

        expect(h.component.pickerTargetAgentId).toBe(FALLBACK);
    });

    it('messageText still reads back what was written', () => {
        h.component.messageText = 'hello';
        expect(h.component.messageText).toBe('hello');
    });

    it('drops a stale chip when a restored draft has none', () => {
        h.chips.push({ type: 'agent', id: MENTIONED });
        expect(h.component.pickerTargetAgentId).toBe(MENTIONED);

        h.component.SetDraft('', false);
        h.chips.length = 0;

        expect(h.component.pickerTargetAgentId).toBe(FALLBACK);
    });
});
