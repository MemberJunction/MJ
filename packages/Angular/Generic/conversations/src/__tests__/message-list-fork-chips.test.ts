import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MessageListComponent } from '../lib/components/message/message-list.component';
import { EMPTY_FORK_CHIPS, type ForkChip } from '../lib/utils/conversation-forks';

/** A new chip map is pushed into the message items already on screen, by normalized detail id. */
const CHIP: ForkChip = { BranchID: 'T1', Kind: 'Fork', DisplayName: 'Pricing', MessageLabel: '2 messages', ActivityLabel: '6 min ago', Avatars: [] };

function entry(id: string) {
    return { kind: 'component' as const, ref: { instance: { message: { ID: id }, ForkChips: EMPTY_FORK_CHIPS }, changeDetectorRef: { markForCheck: vi.fn() } } };
}

describe('MessageListComponent.ForkChipMap', () => {
    it('stamps each rendered item with the chips placed under it, and marks it for check', () => {
        const withChip = entry('D-2');
        const without = entry('D-3');
        const list = Object.create(MessageListComponent.prototype) as MessageListComponent;
        (list as unknown as Record<string, unknown>)['_renderedMessages'] = new Map<string, unknown>([['D-2', withChip], ['D-3', without], ['X', { kind: 'embedded', ref: {} }]]);

        list.ForkChipMap = new Map([['d-2', [CHIP]]]);

        expect(withChip.ref.instance.ForkChips).toEqual([CHIP]);
        expect(without.ref.instance.ForkChips).toBe(EMPTY_FORK_CHIPS);
        expect(withChip.ref.changeDetectorRef.markForCheck).toHaveBeenCalledOnce();
    });
});
