import { describe, it, expect, beforeEach } from 'vitest';
import { SupportWidgetElement, defineSupportWidgetElement, WIDGET_TAG_NAME } from '../ui/support-widget-element.js';
import { MockWidgetTransport } from '../transport/mock-widget-transport.js';
import { MockVoiceController } from '../voice/mock-voice-controller.js';
import type { WidgetSession, WidgetModality } from '../types.js';

function session(modality: WidgetModality): WidgetSession {
    return { token: 't', expiresAtMs: Date.now() + 600_000, widgetId: 'W', applicationId: 'A', pinnedAgentId: 'AG', modality };
}

function mount(modality: WidgetModality, voice?: MockVoiceController): SupportWidgetElement {
    defineSupportWidgetElement();
    const el = document.createElement(WIDGET_TAG_NAME) as SupportWidgetElement;
    el.SetSession(session(modality));
    el.SetTransport(new MockWidgetTransport());
    if (voice) el.SetVoiceController(voice);
    document.body.appendChild(el);
    return el;
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const voiceBtn = (el: SupportWidgetElement): HTMLButtonElement | null =>
    el.ShadowRootRef.querySelector('.mj-widget-voice');

describe('SupportWidgetElement — voice affordance', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('hides the mic button when modality is Text', () => {
        const el = mount('Text', new MockVoiceController());
        expect(voiceBtn(el)).toBeNull();
    });

    it('hides the mic button when no voice controller is wired', () => {
        const el = mount('Both');
        expect(voiceBtn(el)).toBeNull();
    });

    it('shows the mic button for Both with a controller', () => {
        const el = mount('Both', new MockVoiceController());
        expect(voiceBtn(el)).not.toBeNull();
    });

    it('starts voice on click and renders a final transcript as an agent message', async () => {
        const voice = new MockVoiceController();
        const el = mount('Voice', voice);
        voiceBtn(el)!.click();
        await flush();
        expect(voice.StartCount).toBe(1);
        expect(voice.IsActive).toBe(true);

        voice.EmitTranscript('agent', 'How can I help?', true);
        const agentMsg = el.ShadowRootRef.querySelector('.mj-widget-msg.agent');
        expect(agentMsg?.textContent).toBe('How can I help?');
    });

    it('stops voice on a second click', async () => {
        const voice = new MockVoiceController();
        const el = mount('Both', voice);
        voiceBtn(el)!.click();
        await flush();
        voiceBtn(el)!.click();
        await flush();
        expect(voice.StopCount).toBe(1);
        expect(voice.IsActive).toBe(false);
    });

    it('surfaces an abuse-ceiling abort as a system message', async () => {
        const voice = new MockVoiceController();
        const el = mount('Voice', voice);
        voiceBtn(el)!.click();
        await flush();
        voice.AbortForAbuse('Voice session time limit reached.');
        const sys = el.ShadowRootRef.querySelector('.mj-widget-msg.system');
        expect(sys?.textContent).toMatch(/time limit/i);
    });
});
