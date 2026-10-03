/**
 * @fileoverview The one optional collaborator that lets the Interactive Component channel show pixels:
 * something that can turn a rendered component's DOM element into a JPEG.
 *
 * MemberJunction ships no DOM rasterizer (it would add a heavy dependency every embed pays for), so the
 * channel's pixel exposure stays at `state` until a host that wants the model to SEE components registers one.
 * A host registers it once at startup, before a session is minted, because whether the channel can source an
 * inbound video track is decided at mint.
 *
 * @module @memberjunction/ng-conversations
 */

import { BaseSingleton } from '@memberjunction/global';

/**
 * Renders a component's element as a base64-encoded JPEG (no data-URL prefix), or `null` when it cannot
 * (not rendered, tainted canvas, etc.). Must not throw; the channel treats a rejection as "no frame".
 */
export type ComponentFrameCapturer = (element: HTMLElement) => Promise<string | null>;

/** Holds the host's {@link ComponentFrameCapturer}, if it registered one. */
export class InteractiveComponentFrameCapture extends BaseSingleton<InteractiveComponentFrameCapture> {
    private capturer: ComponentFrameCapturer | null = null;

    protected constructor() {
        super();
    }

    /** The process-wide holder. */
    public static get Instance(): InteractiveComponentFrameCapture {
        return super.getInstance<InteractiveComponentFrameCapture>();
    }

    /** The registered capturer, or `null` when the host registered none (the channel then offers state only). */
    public get Capturer(): ComponentFrameCapturer | null {
        return this.capturer;
    }

    /**
     * Registers the capturer. Call before a realtime session is minted.
     *
     * @param capturer The rasterizer, or `null` to remove it.
     */
    public Register(capturer: ComponentFrameCapturer | null): void {
        this.capturer = capturer;
    }
}
