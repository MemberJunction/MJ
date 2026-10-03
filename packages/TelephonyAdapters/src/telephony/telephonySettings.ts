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

import type { OnMachineAction, TelephonySharedSettings } from '../types.js';

/**
 * Picks the shared settings out of an extension's raw settings bag. Anything not set stays `undefined` so the
 * consuming service applies its own default (and, for the run-as user, refuses inbound calls).
 */
export function ReadSharedTelephonySettings(raw: Partial<TelephonySharedSettings> | undefined): TelephonySharedSettings {
    return {
        inboundRunAsUserEmail: raw?.inboundRunAsUserEmail,
        maxCallSeconds: raw?.maxCallSeconds,
        outbound: raw?.outbound,
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
    const base = publicUrl.replace(/\/+$/, '');
    const mount = rootPath.startsWith('/') ? rootPath : `/${rootPath}`;
    return `${base}${mount.replace(/\/+$/, '')}${route}`;
}
