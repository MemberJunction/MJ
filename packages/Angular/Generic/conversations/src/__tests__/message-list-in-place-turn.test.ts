import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MessageListComponent } from '../lib/components/message/message-list.component';

function entry(id: string) {
    return { kind: 'component' as const, ref: { instance: { message: { ID: id }, InPlaceRole: null as string | null }, changeDetectorRef: { markForCheck: vi.fn() } } };
}

describe('MessageListComponent.InPlaceTurn', () => {
    it('stamps the user message and the answer of the turn, ids compared without case, and clears them', () => {
        const user = entry('U2');
        const answer = entry('A2');
        const other = entry('U1');
        const list = Object.create(MessageListComponent.prototype) as MessageListComponent;
        (list as unknown as Record<string, unknown>)['_renderedMessages'] = new Map<string, unknown>([['U2', user], ['A2', answer], ['U1', other]]);

        list.InPlaceTurn = { UserDetailID: 'u2', AnswerDetailID: 'a2' };
        expect([user.ref.instance.InPlaceRole, answer.ref.instance.InPlaceRole, other.ref.instance.InPlaceRole]).toEqual(['User', 'Answer', null]);

        list.InPlaceTurn = null;
        expect([user.ref.instance.InPlaceRole, answer.ref.instance.InPlaceRole]).toEqual([null, null]);
        expect(user.ref.changeDetectorRef.markForCheck).toHaveBeenCalledTimes(2);
    });
});
