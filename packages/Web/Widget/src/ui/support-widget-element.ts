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
import type { IVoiceController, WidgetVoiceState } from '../voice/voice-controller.js';
import { WIDGET_SHADOW_STYLES } from './tokens.js';
import { VoiceIsSupported } from './browser-capabilities.js';

/** The registered custom-element tag name. */
export const WIDGET_TAG_NAME = 'mj-support-widget';

/** A pending retry action surfaced by the connection-lost banner. */
type RetryAction = () => void;

/** The droppable support widget element. */
export class SupportWidgetElement extends HTMLElement {
    private readonly root: ShadowRoot;
    private transport: IWidgetTransport | null = null;
    private voiceController: IVoiceController | null = null;
    private session: WidgetSession | null = null;
    private readonly messages: WidgetChatMessage[] = [];
    private sending = false;
    private voiceActive = false;
    private headerTitle = 'Support';
    private greeting = 'Hi! How can we help you today?';
    /** The pending retry the connection-lost banner invokes; null when no banner is shown. */
    private pendingRetry: RetryAction | null = null;
    private forgetHandler: (() => Promise<void>) | null = null;
    private forgetting = false;
    /** Capability probe for the voice/mic affordance (overridable for tests). */
    private voiceSupportedProbe: () => boolean = () => VoiceIsSupported();
    /** Bound key handler for the open panel's focus trap (added/removed on open/close). */
    private readonly trapHandler = (e: KeyboardEvent): void => this.onPanelKeydown(e);

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

    /**
     * Wires the RV5 "forget me" action. The loader supplies a handler that archives the visitor's
     * server-side memory and clears the durable cookie. When set (and the widget remembers returning
     * visitors), a privacy notice + "Forget me" control render below the composer.
     */
    public SetForgetHandler(handler: () => Promise<void>): void {
        this.forgetHandler = handler;
        if (this.isConnected) this.render();
    }

    /** Injects the voice controller (enables the mic button when modality allows voice). */
    public SetVoiceController(controller: IVoiceController): void {
        this.voiceController = controller;
        if (this.isConnected) this.render();
    }

    /** Overrides the voice capability probe (used by tests to simulate unsupported browsers). */
    public SetVoiceSupportedProbe(probe: () => boolean): void {
        this.voiceSupportedProbe = probe;
        if (this.isConnected) this.render();
    }

    /** Opens the chat panel, traps focus inside it, and focuses the composer. */
    public Open(): void {
        const panel = this.panel();
        if (!panel) return;
        panel.removeAttribute('hidden');
        panel.addEventListener('keydown', this.trapHandler);
        this.input()?.focus();
    }

    /** Closes the chat panel, releases the focus trap, and returns focus to the launcher. */
    public Close(): void {
        const panel = this.panel();
        panel?.setAttribute('hidden', '');
        panel?.removeEventListener('keydown', this.trapHandler);
        this.launcher()?.focus();
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
        panel.append(
            this.buildHeader(),
            this.buildBanner(),
            this.buildDemonstrationSurface(),
            this.buildTranscriptContainer(),
            this.buildProgress(),
            this.buildComposer(),
        );
        const notice = this.buildMemoryNotice();
        if (notice) {
            panel.append(notice);
        }
        return panel;
    }

    /**
     * RV5 visitor-facing privacy notice + "Forget me" control. Rendered only when this widget remembers
     * returning visitors AND a forget handler is wired — otherwise returns null (no notice, no control),
     * keeping the default (memory-off) widget unchanged.
     */
    private buildMemoryNotice(): HTMLElement | null {
        if (!this.session?.rememberReturningVisitors || !this.forgetHandler) {
            return null;
        }
        const notice = document.createElement('div');
        notice.className = 'mj-widget-memory-notice';
        const text = document.createElement('span');
        text.className = 'mj-widget-memory-notice-text';
        text.textContent = 'We remember your past chats to help you faster.';
        const forget = document.createElement('button');
        forget.className = 'mj-widget-forget';
        forget.type = 'button';
        forget.textContent = 'Forget me';
        forget.addEventListener('click', () => void this.onForgetClicked());
        notice.append(text, forget);
        return notice;
    }

    /** Invokes the wired forget handler, then surfaces a confirmation as a system line. */
    private async onForgetClicked(): Promise<void> {
        if (this.forgetting || !this.forgetHandler) {
            return;
        }
        this.forgetting = true;
        const forget = this.query('.mj-widget-forget') as HTMLButtonElement | null;
        if (forget) {
            forget.disabled = true;
        }
        try {
            await this.forgetHandler();
            this.appendMessage('system', 'Your saved chat history has been forgotten.');
        } catch {
            this.appendMessage('system', 'Could not forget your history right now. Please try again later.');
        } finally {
            this.forgetting = false;
            if (forget) {
                forget.disabled = false;
            }
        }
    }

    /** The connection-lost banner (hidden until a send / token refresh fails). */
    private buildBanner(): HTMLElement {
        const banner = document.createElement('div');
        banner.className = 'mj-widget-banner';
        banner.setAttribute('hidden', '');
        banner.setAttribute('role', 'alert');
        const text = document.createElement('span');
        text.className = 'mj-widget-banner-text';
        const retry = document.createElement('button');
        retry.className = 'mj-widget-banner-retry';
        retry.type = 'button';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => this.onRetryClicked());
        banner.append(text, retry);
        return banner;
    }

    private buildHeader(): HTMLElement {
        const header = document.createElement('header');
        header.className = 'mj-widget-header';
        const title = document.createElement('span');
        title.textContent = this.headerTitle;
        const controls = document.createElement('span');
        if (this.voiceEnabled()) {
            controls.appendChild(this.buildVoiceButton());
        }
        const close = document.createElement('button');
        close.className = 'mj-widget-close';
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', 'Close support chat');
        close.addEventListener('click', () => this.Close());
        controls.appendChild(close);
        header.append(title, controls);
        return header;
    }

    private buildTranscriptContainer(): HTMLElement {
        const transcript = document.createElement('div');
        transcript.className = 'mj-widget-transcript';
        transcript.setAttribute('role', 'log');
        transcript.setAttribute('aria-live', 'polite');
        return transcript;
    }

    /**
     * The interactive-channel demonstration surface (Phase 2): a titled stage an MJ channel (e.g. the
     * Whiteboard) renders into while voice is active. Hidden until a channel's first tool call reveals it
     * via {@link RevealChannelSurface}; a widget with no enabled channels never shows it.
     */
    private buildDemonstrationSurface(): HTMLElement {
        const surface = document.createElement('div');
        surface.className = 'mj-widget-surface';
        surface.setAttribute('hidden', '');
        const title = document.createElement('div');
        title.className = 'mj-widget-surface-title';
        const host = document.createElement('div');
        host.className = 'mj-widget-surface-host';
        surface.append(title, host);
        return surface;
    }

    /**
     * Reveals the demonstration surface for an interactive channel and returns the inner host element the
     * channel renders into. Called (via the voice callbacks) the first time the agent engages a channel.
     */
    public RevealChannelSurface(_channelName: string, title: string): HTMLElement {
        const surface = this.query('.mj-widget-surface');
        const titleEl = this.query('.mj-widget-surface-title');
        const host = this.query('.mj-widget-surface-host');
        if (titleEl) titleEl.textContent = title;
        surface?.removeAttribute('hidden');
        return (host as HTMLElement) ?? document.createElement('div');
    }

    /** Hides + clears the demonstration surface (on voice end). */
    private hideChannelSurface(): void {
        const surface = this.query('.mj-widget-surface');
        surface?.setAttribute('hidden', '');
        const host = this.query('.mj-widget-surface-host');
        if (host) host.innerHTML = '';
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

    // ── focus trap (W6 accessibility) ──────────────────────────────────────────

    /** Keeps Tab focus cycling within the open panel; Esc still closes. */
    private onPanelKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            this.Close();
            return;
        }
        if (e.key !== 'Tab') return;
        const focusables = this.focusableElements();
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = this.activeWithinPanel();
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    }

    /** The focusable controls inside the panel, in DOM order, excluding hidden subtrees. */
    private focusableElements(): HTMLElement[] {
        const panel = this.panel();
        if (!panel) return [];
        const selector = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
        return Array.from(panel.querySelectorAll<HTMLElement>(selector)).filter((el) => !this.isInHiddenSubtree(el, panel));
    }

    /** True when the element (or an ancestor up to the panel) carries the `hidden` attribute. */
    private isInHiddenSubtree(el: HTMLElement, panel: HTMLElement): boolean {
        let node: HTMLElement | null = el;
        while (node && node !== panel) {
            if (node.hasAttribute('hidden')) return true;
            node = node.parentElement;
        }
        return false;
    }

    /** The currently-focused element, resolved through the shadow root. */
    private activeWithinPanel(): HTMLElement | null {
        const active = this.root.activeElement;
        return active instanceof HTMLElement ? active : null;
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
                this.clearConnectionError();
                this.appendMessage('agent', result.reply || '(no response)');
            } else {
                this.ShowConnectionError(result.error ?? 'Message could not be sent.', () => void this.dispatchTurn(text));
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Connection lost.';
            this.ShowConnectionError(msg, () => void this.dispatchTurn(text));
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

    // ── voice (W4) ─────────────────────────────────────────────────────────────

    /**
     * Voice is offered only when a controller is wired, the instance enables Voice/Both,
     * AND the browser can actually capture the mic (secure context + getUserMedia). On an
     * insecure origin or an unsupported browser the mic affordance is hidden and the
     * visitor falls back to text (graceful degradation, W6).
     */
    private voiceEnabled(): boolean {
        const modalityAllows = this.session?.modality === 'Voice' || this.session?.modality === 'Both';
        return this.voiceController !== null && modalityAllows && this.voiceSupportedProbe();
    }

    private buildVoiceButton(): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'mj-widget-close mj-widget-voice';
        btn.type = 'button';
        btn.textContent = this.voiceActive ? '⏹' : '🎤';
        btn.setAttribute('aria-label', this.voiceActive ? 'Stop voice' : 'Start voice');
        btn.setAttribute('aria-pressed', String(this.voiceActive));
        btn.addEventListener('click', () => void this.toggleVoice());
        return btn;
    }

    /** Starts or stops a voice session via the injected controller. */
    private async toggleVoice(): Promise<void> {
        if (!this.voiceController) return;
        if (this.voiceActive) {
            await this.voiceController.Stop();
            return;
        }
        try {
            await this.voiceController.Start({
                onState: (s) => this.onVoiceState(s),
                onTranscript: (t) => {
                    if (t.isFinal && t.text.trim()) this.appendMessage(t.role, t.text);
                },
                onEnded: (reason) => this.onVoiceEnded(reason),
                // Phase 2: an MJ interactive channel reveals its surface here on first use.
                getChannelSurface: (name, title) => this.RevealChannelSurface(name, title),
            });
        } catch (err) {
            this.appendMessage('system', err instanceof Error ? err.message : 'Could not start voice.');
            this.onVoiceEnded();
        }
    }

    private onVoiceState(state: WidgetVoiceState): void {
        this.voiceActive = state !== 'idle' && state !== 'ended' && state !== 'error';
        this.refreshVoiceButton();
        if (state === 'listening') this.showProgress('🎙 Listening…');
        else if (state === 'speaking') this.showProgress('🔊 Speaking…');
        else this.hideProgress();
    }

    private onVoiceEnded(reason?: string): void {
        this.voiceActive = false;
        this.refreshVoiceButton();
        this.hideProgress();
        this.hideChannelSurface();
        if (reason) this.appendMessage('system', reason);
    }

    private refreshVoiceButton(): void {
        const btn = this.query('.mj-widget-voice');
        if (!btn) return;
        btn.textContent = this.voiceActive ? '⏹' : '🎤';
        btn.setAttribute('aria-label', this.voiceActive ? 'Stop voice' : 'Start voice');
        btn.setAttribute('aria-pressed', String(this.voiceActive));
    }

    // ── small DOM accessors (testable) ─────────────────────────────────────────

    /** Surfaces a system/notification line in the transcript (used by the notification adapter). */
    public ShowSystemMessage(text: string): void {
        this.appendMessage('system', text);
    }

    /**
     * Shows the connection-lost banner with a retry affordance. Used when a send fails or
     * a token refresh fails (graceful degradation, W6). Invoking the banner's Retry button
     * (or {@link RetryConnection}) runs the supplied action and clears the banner on success.
     *
     * @param message  The user-facing reason shown in the banner.
     * @param retry    The action to run when the visitor clicks Retry.
     */
    public ShowConnectionError(message: string, retry: RetryAction): void {
        this.pendingRetry = retry;
        const banner = this.query('.mj-widget-banner');
        const text = this.query('.mj-widget-banner-text');
        if (text) text.textContent = message;
        banner?.removeAttribute('hidden');
    }

    /** Programmatically triggers the pending retry (same effect as clicking Retry). */
    public RetryConnection(): void {
        this.onRetryClicked();
    }

    /** Hides the connection-lost banner and drops the pending retry. */
    private clearConnectionError(): void {
        this.pendingRetry = null;
        this.query('.mj-widget-banner')?.setAttribute('hidden', '');
    }

    /** Runs the pending retry (if any) and hides the banner; the retry re-shows it on a repeat failure. */
    private onRetryClicked(): void {
        const retry = this.pendingRetry;
        this.clearConnectionError();
        retry?.();
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

    private launcher(): HTMLButtonElement | null {
        return this.query('.mj-widget-launcher') as HTMLButtonElement | null;
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
