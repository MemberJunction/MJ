import { describe, it, expect, beforeEach } from 'vitest';
import {
    SupportWidgetElement,
    defineSupportWidgetElement,
    WIDGET_TAG_NAME,
} from '../ui/support-widget-element.js';
import { MockWidgetTransport } from '../transport/mock-widget-transport.js';
import type { WidgetSession } from '../types.js';

const SESSION: WidgetSession = {
    token: 'jwt',
    expiresAtMs: Date.now() + 600_000,
    widgetId: 'W1',
    applicationId: 'APP1',
    pinnedAgentId: 'PINNED-AGENT',
    modality: 'Both',
};

function mountElement(transport: MockWidgetTransport): SupportWidgetElement {
    defineSupportWidgetElement();
    const el = document.createElement(WIDGET_TAG_NAME) as SupportWidgetElement;
    el.Configure({ title: 'Help', greeting: 'Welcome!' });
    el.SetSession(SESSION);
    el.SetTransport(transport);
    document.body.appendChild(el);
    return el;
}

/** Flush microtasks so the async send handler completes. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('SupportWidgetElement', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('registers the custom element', () => {
        defineSupportWidgetElement();
        expect(customElements.get(WIDGET_TAG_NAME)).toBe(SupportWidgetElement);
    });

    it('renders inside a shadow root and injects styles there (NOT the document head)', () => {
        const el = mountElement(new MockWidgetTransport());
        expect(el.ShadowRootRef).toBeTruthy();
        const styleInShadow = el.ShadowRootRef.querySelector('style');
        expect(styleInShadow?.textContent).toContain('--mj-chat-bubble-user-bg');
        // Isolation: the widget must not leak its styles into the host document head.
        const leaked = Array.from(document.head.querySelectorAll('style')).some((s) =>
            s.textContent?.includes('--mj-chat-bubble-user-bg'),
        );
        expect(leaked).toBe(false);
    });

    it('shows the greeting empty state before any messages', () => {
        const el = mountElement(new MockWidgetTransport());
        expect(el.ShadowRootRef.querySelector('.mj-widget-empty')?.textContent).toBe('Welcome!');
    });

    it('opens the panel from the launcher', () => {
        const el = mountElement(new MockWidgetTransport());
        const panel = el.ShadowRootRef.querySelector('.mj-widget-panel') as HTMLElement;
        expect(panel.hasAttribute('hidden')).toBe(true);
        (el.ShadowRootRef.querySelector('.mj-widget-launcher') as HTMLButtonElement).click();
        expect(panel.hasAttribute('hidden')).toBe(false);
    });

    it('sends a message, passes the PINNED agent id, and renders user + agent bubbles', async () => {
        const transport = new MockWidgetTransport((t) => `echo: ${t}`);
        await transport.Initialize(SESSION); // the loader does this before mount; transport owns agent pinning
        const el = mountElement(transport);
        const input = el.ShadowRootRef.querySelector('.mj-widget-input') as HTMLTextAreaElement;
        input.value = 'I need help';
        (el.ShadowRootRef.querySelector('.mj-widget-composer') as HTMLFormElement).dispatchEvent(
            new Event('submit', { cancelable: true }),
        );
        await flush();

        expect(transport.SentMessages).toEqual(['I need help']);
        expect(transport.LastExplicitAgentId).toBe('PINNED-AGENT'); // D5: always pinned
        const bubbles = Array.from(el.ShadowRootRef.querySelectorAll('.mj-widget-msg')).map((b) => ({
            cls: b.className,
            text: b.textContent,
        }));
        expect(bubbles[0]).toMatchObject({ cls: 'mj-widget-msg user', text: 'I need help' });
        expect(bubbles[1]).toMatchObject({ cls: 'mj-widget-msg agent', text: 'echo: I need help' });
    });

    it('shows a system message when no transport is connected', async () => {
        defineSupportWidgetElement();
        const el = document.createElement(WIDGET_TAG_NAME) as SupportWidgetElement;
        el.SetSession(SESSION);
        document.body.appendChild(el);
        const input = el.ShadowRootRef.querySelector('.mj-widget-input') as HTMLTextAreaElement;
        input.value = 'hello';
        (el.ShadowRootRef.querySelector('.mj-widget-composer') as HTMLFormElement).dispatchEvent(
            new Event('submit', { cancelable: true }),
        );
        await flush();
        expect(el.ShadowRootRef.querySelector('.mj-widget-msg.system')?.textContent).toMatch(/not connected/i);
    });

    it('ShowSystemMessage surfaces a system line (notification adapter hook)', () => {
        const el = mountElement(new MockWidgetTransport());
        el.ShowSystemMessage('Session expired');
        expect(el.ShadowRootRef.querySelector('.mj-widget-msg.system')?.textContent).toBe('Session expired');
    });
});
