import { describe, it, expect } from 'vitest';
import { UndoSnapshot, UndoStack } from '../lib/engine/undo';

function snap(html: string): UndoSnapshot {
    return { Html: html, Selection: null };
}

describe('UndoStack', () => {
    it('starts with nothing to undo or redo', () => {
        const stack = new UndoStack();
        expect(stack.CanUndo).toBe(false);
        expect(stack.CanRedo).toBe(false);
        expect(stack.Undo(snap('live'))).toBeNull();
    });

    it('undoes to a checkpoint after a change', () => {
        const stack = new UndoStack();
        stack.Checkpoint(snap('A'));
        stack.MarkChanged();
        expect(stack.CanUndo).toBe(true);
        expect(stack.Undo(snap('B'))?.Html).toBe('A');
        expect(stack.CanRedo).toBe(true);
        expect(stack.Redo()?.Html).toBe('B');
        expect(stack.CanRedo).toBe(false);
    });

    it('produces one step per command even with no typing between them', () => {
        const stack = new UndoStack();
        stack.Checkpoint(snap('A'));
        stack.MarkChanged(); // bold applied
        stack.Checkpoint(snap('B'));
        stack.MarkChanged(); // italic applied
        expect(stack.Undo(snap('C'))?.Html).toBe('B');
        expect(stack.Undo(snap('B'))?.Html).toBe('A');
        expect(stack.Undo(snap('A'))).toBeNull();
        expect(stack.Redo()?.Html).toBe('B');
        expect(stack.Redo()?.Html).toBe('C');
    });

    it('refreshes rather than duplicates when the document has not changed', () => {
        const stack = new UndoStack();
        stack.Checkpoint(snap('A'));
        stack.Checkpoint(snap('A'));
        stack.Checkpoint(snap('A'));
        expect(stack.Length).toBe(1);
        expect(stack.CanUndo).toBe(false);
    });

    it('discards redo history when a new change forks the timeline', () => {
        const stack = new UndoStack();
        stack.Checkpoint(snap('A'));
        stack.MarkChanged();
        stack.Undo(snap('B'));
        expect(stack.CanRedo).toBe(true);
        stack.MarkChanged(); // new typing at state A
        stack.Checkpoint(snap('A2'));
        expect(stack.CanRedo).toBe(false);
        expect(stack.Length).toBe(2);
    });

    it('drops the oldest entries past the limit', () => {
        const stack = new UndoStack({ Limit: 3 });
        for (const html of ['A', 'B', 'C', 'D']) {
            stack.Checkpoint(snap(html));
            stack.MarkChanged();
        }
        expect(stack.Length).toBe(3);
        // The live document takes one slot when Undo records it, so a limit of three
        // snapshots is two steps back.
        expect(stack.Undo(snap('E'))?.Html).toBe('D');
        expect(stack.Undo(snap('D'))?.Html).toBe('C');
        expect(stack.Undo(snap('C'))).toBeNull();
    });

    it('skips checkpoints above the size threshold', () => {
        const stack = new UndoStack({ SizeThreshold: 3 });
        stack.Checkpoint(snap('too long'));
        expect(stack.Length).toBe(0);
        stack.Checkpoint(snap('ok'));
        expect(stack.Length).toBe(1);
    });

    it('clears everything', () => {
        const stack = new UndoStack();
        stack.Checkpoint(snap('A'));
        stack.MarkChanged();
        stack.Clear();
        expect(stack.CanUndo).toBe(false);
        expect(stack.Length).toBe(0);
    });
});
