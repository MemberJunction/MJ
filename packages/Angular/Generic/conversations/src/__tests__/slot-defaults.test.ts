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

import type {
    IMJChatEmptyStateComponent,
    IMJChatAgentPresenceComponent,
    IMJChatHeaderComponent,
    IMJChatMessageExtraComponent,
    IMJChatDemonstrationSurfaceComponent,
} from '../lib/components/slots/slot-interfaces';

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
});
