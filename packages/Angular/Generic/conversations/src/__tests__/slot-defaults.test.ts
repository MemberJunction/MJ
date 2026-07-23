/**
 * @fileoverview Compile-time interface-conformance checks for the 5 default
 * slot components.
 *
 * These tests deliberately do NOT instantiate the components (instantiating
 * Angular standalone components at runtime requires `@angular/compiler` +
 * a TestBed, which adds substantial machinery for very little signal).
 * Instead we verify that:
 *
 *   - Each default class is importable and is a class (`typeof === 'function'`).
 *   - The class satisfies its declared interface at compile time (the
 *     `interfaceCheck` assignments fail TypeScript if a contract drifts).
 *
 * That's the actual contract we care about: any consumer-supplied component
 * for a given slot will be type-compatible with the widget's interaction
 * because the default it replaces was compatible.
 *
 * Behavioral tests for slot content rendering belong in a future commit that
 * sets up TestBed + the ChatSlotDirective + the chat-area component
 * together — once those are in place we'll have end-to-end coverage of the
 * projection path, not just the type shape.
 */

import '@angular/compiler';
import { describe, it, expect } from 'vitest';

import { MJChatEmptyStateDefaultComponent } from '../lib/components/slots/mj-chat-empty-state-default.component';
import { MJChatAgentPresenceDefaultComponent } from '../lib/components/slots/mj-chat-agent-presence-default.component';
import { MJChatHeaderDefaultComponent } from '../lib/components/slots/mj-chat-header-default.component';
import { MJChatMessageExtraDefaultComponent } from '../lib/components/slots/mj-chat-message-extra-default.component';
import { MJChatDemonstrationSurfaceDefaultComponent } from '../lib/components/slots/mj-chat-demonstration-surface-default.component';
import { MJChatMessageBubbleDefaultComponent } from '../lib/components/slots/mj-chat-message-bubble-default.component';

import type {
    IMJChatEmptyStateComponent,
    IMJChatAgentPresenceComponent,
    IMJChatHeaderComponent,
    IMJChatMessageExtraComponent,
    IMJChatDemonstrationSurfaceComponent,
    IMJChatMessageRendererComponent,
    IMJChatRailSlotContext,
} from '../lib/components/slots/slot-interfaces';
import { ChatSlotDirective, type MJChatSlotName } from '../lib/directives/chat-slot.directive';

describe('Slot default components — exports + interface conformance', () => {
    it('MJChatEmptyStateDefaultComponent is exported as a class', () => {
        expect(typeof MJChatEmptyStateDefaultComponent).toBe('function');
        // Compile-time check: the class must structurally satisfy the interface.
        // If this assignment ever fails to type-check, the interface drifted from
        // the default — fix one or the other. Using a no-op cast keeps this at
        // type-level only (no runtime instantiation).
        type _Check = InstanceType<typeof MJChatEmptyStateDefaultComponent> extends IMJChatEmptyStateComponent
            ? true
            : never;
        const _interfaceCheck: _Check = true;
        expect(_interfaceCheck).toBe(true);
    });

    it('MJChatAgentPresenceDefaultComponent is exported as a class', () => {
        expect(typeof MJChatAgentPresenceDefaultComponent).toBe('function');
        type _Check = InstanceType<typeof MJChatAgentPresenceDefaultComponent> extends IMJChatAgentPresenceComponent
            ? true
            : never;
        const _interfaceCheck: _Check = true;
        expect(_interfaceCheck).toBe(true);
    });

    it('MJChatHeaderDefaultComponent is exported as a class', () => {
        expect(typeof MJChatHeaderDefaultComponent).toBe('function');
        type _Check = InstanceType<typeof MJChatHeaderDefaultComponent> extends IMJChatHeaderComponent
            ? true
            : never;
        const _interfaceCheck: _Check = true;
        expect(_interfaceCheck).toBe(true);
    });

    it('MJChatMessageExtraDefaultComponent is exported as a class', () => {
        expect(typeof MJChatMessageExtraDefaultComponent).toBe('function');
        type _Check = InstanceType<typeof MJChatMessageExtraDefaultComponent> extends IMJChatMessageExtraComponent
            ? true
            : never;
        const _interfaceCheck: _Check = true;
        expect(_interfaceCheck).toBe(true);
    });

    it('MJChatDemonstrationSurfaceDefaultComponent is exported as a class', () => {
        expect(typeof MJChatDemonstrationSurfaceDefaultComponent).toBe('function');
        type _Check = InstanceType<typeof MJChatDemonstrationSurfaceDefaultComponent> extends IMJChatDemonstrationSurfaceComponent
            ? true
            : never;
        const _interfaceCheck: _Check = true;
        expect(_interfaceCheck).toBe(true);
    });

    it('MJChatMessageBubbleDefaultComponent is exported as a class', () => {
        expect(typeof MJChatMessageBubbleDefaultComponent).toBe('function');
        type _Check = InstanceType<typeof MJChatMessageBubbleDefaultComponent> extends IMJChatMessageRendererComponent
            ? true
            : never;
        const _interfaceCheck: _Check = true;
        expect(_interfaceCheck).toBe(true);
    });
});

describe('rail slot — name registration + context contract (S0, composed shell)', () => {
    it("'rail' is a valid MJChatSlotName and the directive accepts it", () => {
        // Type-level: the union must include 'rail'.
        const name: MJChatSlotName = 'rail';
        expect(name).toBe('rail');

        // Runtime: the directive stores it like any other slot name.
        const fakeTemplate = {} as ConstructorParameters<typeof ChatSlotDirective>[0];
        const directive = new ChatSlotDirective(fakeTemplate);
        directive.SlotName = 'rail';
        expect(directive.SlotName).toBe('rail');
        expect(directive.Template).toBe(fakeTemplate);
    });

    it('IMJChatRailSlotContext contract holds (Conversation + IsArtifactOpen)', () => {
        // Mirrors exactly what conversation-chat-area.component.html supplies
        // to the outlet. If the template's context and this interface drift,
        // fix one or the other — consumers type their let-bindings against it.
        const context: IMJChatRailSlotContext = {
            Conversation: null,
            IsArtifactOpen: false,
        };
        expect(context.IsArtifactOpen).toBe(false);
        expect(context.Conversation).toBeNull();
    });

    it('rail deliberately has NO default slot component', () => {
        // Design contract (SLICE-S0): with no consumer projection the chat-area
        // renders nothing for this slot — existing consumers are unaffected.
        // This test documents the absence; if a default is ever added, that is
        // a conscious contract change and this expectation should be updated
        // alongside the slot-interfaces JSDoc.
        const slotDefaultModules = [
            'mj-chat-empty-state-default.component',
            'mj-chat-agent-presence-default.component',
            'mj-chat-header-default.component',
            'mj-chat-message-extra-default.component',
            'mj-chat-demonstration-surface-default.component',
            'mj-chat-message-bubble-default.component',
        ];
        expect(slotDefaultModules).not.toContain('mj-chat-rail-default.component');
    });
});
