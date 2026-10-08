import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MessageItemComponent } from '../lib/components/message/message-item.component';
import type { ForkChip, ForkChipOpenRequest, OriginalForkChip } from '../lib/utils/conversation-forks';

/** A chip click opens its fork and does not reach the message bubble's own click handler. */
const CHIP: ForkChip = { BranchID: 'T1', Kind: 'Edit', DisplayName: 'Edited version', MessageLabel: '1 message', ActivityLabel: 'just now', Avatars: [] };

const ORIGINAL: OriginalForkChip = { Kind: 'Original', BranchID: null, Sequence: 5, DisplayName: 'Main' };

function createItem(): { component: MessageItemComponent; emitted: ForkChipOpenRequest[] } {
    const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    const emitted: ForkChipOpenRequest[] = [];
    (component as unknown as Record<string, unknown>)['ForkOpenRequested'] = { emit: (e: ForkChipOpenRequest) => emitted.push(e) };
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

    it("emits an original chip's view and the replaced message's Sequence", () => {
        const { component, emitted } = createItem();
        component.OnForkChipClick(ORIGINAL, { stopPropagation: vi.fn() } as unknown as Event);
        component.OnForkChipClick({ ...ORIGINAL, BranchID: 'T1', Sequence: 7, DisplayName: 'Pricing' }, { stopPropagation: vi.fn() } as unknown as Event);
        expect(emitted).toEqual([{ BranchID: null, Sequence: 5 }, { BranchID: 'T1', Sequence: 7 }]);
    });

    it('names and icons an original chip: a house for Main, the fork icon for a parent fork', () => {
        const { component } = createItem();
        expect(component.ChipIcon(ORIGINAL)).toBe('fa-solid fa-house');
        expect(component.ChipAriaLabel(ORIGINAL)).toBe('Open the original in Main');
        const parent: OriginalForkChip = { ...ORIGINAL, BranchID: 'T1', DisplayName: 'Pricing' };
        expect(component.ChipIcon(parent)).toBe('fa-solid fa-code-branch');
        expect(component.ChipAriaLabel(parent)).toBe('Open the original in Pricing');
        expect(component.ChipAriaLabel(CHIP)).toBe('Open fork Edited version, 1 message');
    });
});
