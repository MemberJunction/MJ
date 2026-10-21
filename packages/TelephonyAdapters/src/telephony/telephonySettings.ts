/**
 * @fileoverview Normalizes the settings every carrier extension shares (run-as user, call cap, outbound
 * policy) and the carrier-specific URL / machine-detection defaults the extensions derive.
 *
 * The host merges `telephony.{inboundRunAsUserEmail,maxCallSeconds,outbound}` into each carrier's extension
 * settings, and an operator configuring `serverExtensions` directly supplies them the same way — so both
 * paths arrive here as a loosely typed settings bag.
 *
 * @module @memberjunction/telephony-adapters
 */

import { LogError } from '@memberjunction/core';
import type { OnMachineAction, TelephonySharedSettings } from '../types.js';

/**
 * Picks the shared settings out of an extension's raw settings bag. Anything not set stays `undefined` so the
 * consuming service applies its own default (and, for the run-as user, refuses inbound calls).
 */
export function ReadSharedTelephonySettings(raw: Partial<TelephonySharedSettings> | undefined): TelephonySharedSettings {
    return {
        inboundRunAsUserEmail: raw?.inboundRunAsUserEmail,
        maxCallSeconds: raw?.maxCallSeconds,
        maxConcurrentCalls: raw?.maxConcurrentCalls,
        outbound: raw?.outbound,
        transferTargets: raw?.transferTargets,
        costPerMinute: raw?.costPerMinute,
    };
}

/** Maps a raw `onMachine` value to its action, defaulting (and treating anything unknown) to `'hangup'`. */
export function ResolveOnMachine(raw: string | undefined): OnMachineAction {
    return raw === 'continue' ? 'continue' : 'hangup';
}

/**
 * Joins the public base URL, the extension's mount path and a route into the absolute URL a carrier should
 * call back (e.g. `https://api.example.com` + `/telephony/twilio` + `/status`).
 */
export function BuildCallbackUrl(publicUrl: string, rootPath: string, route: string): string {
    const base = PublicOrigin(publicUrl);
    const mount = rootPath.startsWith('/') ? rootPath : `/${rootPath}`;
    return `${base}${TrimTrailingSlashes(mount)}${route}`;
}

/**
 * The scheme + host (+ port) of the host's public URL, with any path dropped.
 *
 * The host's public URL is typically the GraphQL endpoint (`https://api.example.com/graphql`), but extension
 * routes are mounted at the application root, so the URL a carrier calls — and signs — is the ORIGIN plus the
 * route's own path. Appending the route to the full public URL double-counts the GraphQL path
 * (`/graphql/telephony/twilio/voice`), which breaks both the callback URLs we hand the carrier and the
 * signature check. An unparseable value falls back to a trailing-slash trim so a misconfiguration surfaces as
 * a plainly wrong URL rather than an exception on the request path.
 */
export function PublicOrigin(publicUrl: string): string {
    try {
        return new URL(publicUrl).origin;
    } catch (err) {
        LogError(`[Telephony] Invalid publicUrl passed to PublicOrigin: ${publicUrl}`, undefined, err);
        return TrimTrailingSlashes(publicUrl);
    }
}

/**
 * Removes every trailing `/` from a string in a single linear scan. Used on operator- and request-supplied
 * URLs instead of a `/\/+$/` regex, whose backtracking is polynomial on inputs with many slashes.
 */
export function TrimTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 47 /* '/' */) {
        end--;
    }
    return value.slice(0, end);
}
