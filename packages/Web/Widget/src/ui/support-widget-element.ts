/**
 * @fileoverview `<mj-support-widget>` — a self-contained shadow-DOM custom element
 * rendering the text support surface. Host CSS cannot bleed in or out (closed style
 * scope + `all: initial` on :host). It owns NO chat logic — it delegates turns to an
 * injected `IWidgetTransport` (which reuses ConversationsRuntime). Voice is layered on
 * in W4 via the same element.
 *
 * @module @memberjunction/web-widget
 */

import type { WidgetChatMessage, WidgetSession } from '../types.js';
import type { IWidgetTransport } from '../transport/widget-transport.js';
import { WIDGET_SHADOW_STYLES } from './tokens.js';

/** The registered custom-element tag name. */
export const WIDGET_TAG_NAME = 'mj-support-widget';

/** The droppable support widget element. */
export class SupportWidgetElement extends HTMLElement {
    private readonly root: ShadowRoot;
    private transport: IWidgetTransport | null = null;
    private session: WidgetSession | null = null;
    private readonly messages: WidgetChatMessage[] = [];
    private sending = false;
    private headerTitle = 'Support';
    private greeting = 'Hi! How can we help you today?';

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    public connectedCallback(): void {
        this.render();
    }

    /** Sets the UI title + greeting (called by the loader before mount). */
    public Configure(options: { title?: string; greeting?: string }): void {
        if (options.title) this.headerTitle = options.title;
        if (options.greeting) this.greeting = options.greeting;
        if (this.isConnected) this.render();
    }

    /** Injects the minted session (drives modality/agent pinning). */
    public SetSession(session: WidgetSession): void {
        this.session = session;
    }

    /** Injects the transport the element sends turns through. */
    public SetTransport(transport: IWidgetTransport): void {
        this.transport = transport;
    }

    /** Opens the chat panel and focuses the composer. */
    public Open(): void {
        this.panel()?.removeAttribute('hidden');
        this.input()?.focus();
    }

    /** Closes the chat panel. */
    public Close(): void {
        this.panel()?.setAttribute('hidden', '');
    }

    // ── rendering ────────────────────────────────────────────────────────────

    private render(): void {
        this.root.innerHTML = '';
        const style = document.createElement('style');
        style.textContent = WIDGET_SHADOW_STYLES;
        this.root.append(style, this.buildLauncher(), this.buildPanel());
        this.renderTranscript();
    }

    private buildLauncher(): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'mj-widget-launcher';
        btn.type = 'button';
        btn.textContent = '💬';
        btn.setAttribute('aria-label', 'Open support chat');
        btn.addEventListener('click', () => this.Open());
        return btn;
    }

    private buildPanel(): HTMLElement {
        const panel = document.createElement('section');
        panel.className = 'mj-widget-panel';
        panel.setAttribute('hidden', '');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', `${this.headerTitle} chat`);
        panel.append(this.buildHeader(), this.buildTranscriptContainer(), this.buildProgress(), this.buildComposer());
        return panel;
    }

    private buildHeader(): HTMLElement {
        const header = document.createElement('header');
        header.className = 'mj-widget-header';
        const title = document.createElement('span');
        title.textContent = this.headerTitle;
        const close = document.createElement('button');
        close.className = 'mj-widget-close';
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', 'Close support chat');
        close.addEventListener('click', () => this.Close());
        header.append(title, close);
        return header;
    }

    private buildTranscriptContainer(): HTMLElement {
        const transcript = document.createElement('div');
        transcript.className = 'mj-widget-transcript';
        transcript.setAttribute('role', 'log');
        transcript.setAttribute('aria-live', 'polite');
        return transcript;
    }

    private buildProgress(): HTMLElement {
        const progress = document.createElement('div');
        progress.className = 'mj-widget-progress';
        progress.setAttribute('hidden', '');
        return progress;
    }

    private buildComposer(): HTMLElement {
        const form = document.createElement('form');
        form.className = 'mj-widget-composer';
        const input = document.createElement('textarea');
        input.className = 'mj-widget-input';
        input.rows = 1;
        input.setAttribute('aria-label', 'Type your message');
        input.placeholder = 'Type your message…';
        input.addEventListener('keydown', (e) => this.onComposerKeydown(e));
        const send = document.createElement('button');
        send.className = 'mj-widget-send';
        send.type = 'submit';
        send.textContent = 'Send';
        form.append(input, send);
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            void this.sendCurrent();
        });
        return form;
    }

    private renderTranscript(): void {
        const transcript = this.query('.mj-widget-transcript');
        if (!transcript) return;
        transcript.innerHTML = '';
        if (this.messages.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'mj-widget-empty';
            empty.textContent = this.greeting;
            transcript.appendChild(empty);
            return;
        }
        for (const msg of this.messages) {
            const el = document.createElement('div');
            el.className = `mj-widget-msg ${msg.role}`;
            el.textContent = msg.text;
            transcript.appendChild(el);
        }
        transcript.scrollTop = transcript.scrollHeight;
    }

    // ── interaction ──────────────────────────────────────────────────────────

    private onComposerKeydown(e: KeyboardEvent): void {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void this.sendCurrent();
        } else if (e.key === 'Escape') {
            this.Close();
        }
    }

    /** Reads the composer, appends the user turn, dispatches it, renders the reply. */
    private async sendCurrent(): Promise<void> {
        const input = this.input();
        const text = input?.value.trim() ?? '';
        if (!text || this.sending) return;
        if (!this.transport) {
            this.appendMessage('system', 'Support is not connected yet. Please try again in a moment.');
            return;
        }
        if (input) input.value = '';
        this.appendMessage('user', text);
        await this.dispatchTurn(text);
    }

    /** Sends one turn through the transport and renders progress + the reply. */
    private async dispatchTurn(text: string): Promise<void> {
        this.setSending(true);
        try {
            const result = await this.transport!.SendMessage(text, (m) => this.showProgress(m));
            if (result.success) {
                this.appendMessage('agent', result.reply || '(no response)');
            } else {
                this.appendMessage('system', result.error ?? 'Something went wrong. Please try again.');
            }
        } catch (err) {
            this.appendMessage('system', err instanceof Error ? err.message : 'Unexpected error.');
        } finally {
            this.hideProgress();
            this.setSending(false);
        }
    }

    private appendMessage(role: WidgetChatMessage['role'], text: string): void {
        this.messages.push({ role, text, timestampMs: Date.now() });
        this.renderTranscript();
    }

    private showProgress(message: string): void {
        const progress = this.query('.mj-widget-progress');
        if (!progress) return;
        progress.textContent = message;
        progress.removeAttribute('hidden');
    }

    private hideProgress(): void {
        this.query('.mj-widget-progress')?.setAttribute('hidden', '');
    }

    private setSending(sending: boolean): void {
        this.sending = sending;
        const send = this.query('.mj-widget-send') as HTMLButtonElement | null;
        if (send) send.disabled = sending;
    }

    // ── small DOM accessors (testable) ─────────────────────────────────────────

    /** Surfaces a system/notification line in the transcript (used by the notification adapter). */
    public ShowSystemMessage(text: string): void {
        this.appendMessage('system', text);
    }

    /** Exposes the shadow root for tests + integration code. */
    public get ShadowRootRef(): ShadowRoot {
        return this.root;
    }

    private query(selector: string): HTMLElement | null {
        return this.root.querySelector(selector);
    }

    private panel(): HTMLElement | null {
        return this.query('.mj-widget-panel');
    }

    private input(): HTMLTextAreaElement | null {
        return this.query('.mj-widget-input') as HTMLTextAreaElement | null;
    }
}

/** Registers the custom element once (idempotent). */
export function defineSupportWidgetElement(): void {
    if (typeof customElements !== 'undefined' && !customElements.get(WIDGET_TAG_NAME)) {
        customElements.define(WIDGET_TAG_NAME, SupportWidgetElement);
    }
}
