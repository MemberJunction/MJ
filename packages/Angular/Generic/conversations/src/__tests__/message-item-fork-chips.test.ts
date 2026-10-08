import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MessageItemComponent } from '../lib/components/message/message-item.component';
import type { ForkChip } from '../lib/utils/conversation-forks';

/** A chip click opens its fork and does not reach the message bubble's own click handler. */
const CHIP: ForkChip = { BranchID: 'T1', Kind: 'Edit', DisplayName: 'Edited version', MessageLabel: '1 message', ActivityLabel: 'just now', Avatars: [] };

function createItem(): { component: MessageItemComponent; emitted: Array<{ BranchID: string }> } {
    const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    const emitted: Array<{ BranchID: string }> = [];
    (component as unknown as Record<string, unknown>)['ForkOpenRequested'] = { emit: (e: { BranchID: string }) => emitted.push(e) };
    return { component, emitted };
}

describe('MessageItemComponent fork chips', () => {
    it('emits the fork of a clicked chip and stops the click', () => {
        const { component, emitted } = createItem();
        const event = { stopPropagation: vi.fn() } as unknown as Event;

        component.OnForkChipClick(CHIP, event);

        expect(emitted).toEqual([{ BranchID: 'T1' }]);
        expect(event.stopPropagation).toHaveBeenCalledOnce();
    });

    it('shows the kind icon of the chip', () => {
        expect(createItem().component.ChipIcon(CHIP)).toBe('fa-solid fa-pen');
    });
});
