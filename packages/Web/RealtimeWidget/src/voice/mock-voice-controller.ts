/**
 * @fileoverview In-memory voice controller for unit tests + the offline demo. Drives a
 * scripted state/transcript sequence without real audio or a network.
 *
 * @module @memberjunction/realtime-widget
 */

import type { IVoiceController, VoiceControllerCallbacks } from './voice-controller.js';

/** Deterministic, dependency-free voice controller for tests + demos. */
export class MockVoiceController implements IVoiceController {
    public StartCount = 0;
    public StopCount = 0;
    private active = false;
    private callbacks: VoiceControllerCallbacks | null = null;

    public get IsActive(): boolean {
        return this.active;
    }

    public async Start(callbacks: VoiceControllerCallbacks): Promise<void> {
        this.StartCount++;
        this.active = true;
        this.callbacks = callbacks;
        callbacks.onState('connecting');
        callbacks.onState('listening');
    }

    public async Stop(): Promise<void> {
        this.StopCount++;
        this.active = false;
        this.callbacks?.onState('ended');
        this.callbacks?.onEnded();
    }

    /** Test helper: push a transcript line as if the model produced it. */
    public EmitTranscript(role: 'user' | 'agent', text: string, isFinal = true): void {
        this.callbacks?.onTranscript({ role, text, isFinal });
    }

    /** Test helper: simulate an abuse-ceiling abort. */
    public AbortForAbuse(reason: string): void {
        this.active = false;
        this.callbacks?.onState('ended');
        this.callbacks?.onEnded(reason);
    }
}
