import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MessageItemComponent } from '../lib/components/message/message-item.component';

function classesFor(rail: 'Inherited' | 'Own' | null): string {
    const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        message: { ID: 'M1', Role: 'User', Status: 'Complete', IsPinned: false },
        IsEditing: false,
        ForkRail: rail,
    });
    return (component as unknown as { buildMessageClasses(): string }).buildMessageClasses();
}

describe('MessageItemComponent fork rail', () => {
    it('draws an inherited row on the dashed rail and an own row on the solid rail', () => {
        expect(classesFor('Inherited').split(' ')).toContain('fork-rail-inherited');
        expect(classesFor('Own').split(' ')).toContain('fork-rail-own');
    });

    it('draws no rail in Main', () => {
        expect(classesFor(null)).not.toMatch(/fork-rail/);
    });
});
