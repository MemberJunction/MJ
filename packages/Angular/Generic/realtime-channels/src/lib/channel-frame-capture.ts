/**
 * @fileoverview The one optional collaborator that lets a realtime channel show the model PIXELS of a DOM surface:
 * something that can turn a rendered element into a JPEG.
 *
 * MemberJunction core carries no DOM rasterizer (it would add a dependency every embed pays for), so a channel's pixel
 * exposure stays at `state` until the HOST that wants the model to SEE surfaces registers one. A host registers it once at
 * startup, before a session is minted, because whether a channel can source an inbound video track is decided at mint.
 * `EnableChannelFrameCapture` (in `dom-frame-capture.ts`) registers the default, `html-to-image` based, rasterizer.
 *
 * @module @memberjunction/ng-realtime-channels
 */

import { BaseSingleton } from '@memberjunction/global';

/**
 * Renders an element as a base64-encoded JPEG (no data-URL prefix), or `null` when it cannot (not rendered, tainted canvas,
 * and so on). Must not throw; a channel treats a rejection as "no frame".
 */
export type ElementFrameCapturer = (element: HTMLElement) => Promise<string | null>;

/** Holds the host's {@link ElementFrameCapturer}, if it registered one. */
export class ChannelFrameCapture extends BaseSingleton<ChannelFrameCapture> {
    private capturer: ElementFrameCapturer | null = null;

    protected constructor() {
        super();
    }

    /** The process-wide holder. */
    public static get Instance(): ChannelFrameCapture {
        return super.getInstance<ChannelFrameCapture>();
    }

    /** The registered capturer, or `null` when the host registered none (channels then offer state only). */
    public get Capturer(): ElementFrameCapturer | null {
        return this.capturer;
    }

    /**
     * Registers the capturer. Call before a realtime session is minted.
     *
     * @param capturer The rasterizer, or `null` to remove it.
     */
    public Register(capturer: ElementFrameCapturer | null): void {
        this.capturer = capturer;
    }
}
