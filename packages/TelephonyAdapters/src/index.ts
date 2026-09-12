/**
 * @module @memberjunction/telephony-adapters
 *
 * Telephony and meeting platform adapters for MemberJunction AI agents.
 * Provides Twilio, Vonage, RingCentral, and Microsoft Teams integrations
 * built on the MJServer Extension framework (@memberjunction/server-extensions-core).
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { MJGlobal } from '@memberjunction/global';
import { BaseServerExtension, type ServerExtensionConfig } from '@memberjunction/server-extensions-core';

import { TwilioTelephonyExtension } from './server-extensions/TwilioTelephonyExtension.js';
import { VonageTelephonyExtension } from './server-extensions/VonageTelephonyExtension.js';
import { RingCentralTelephonyExtension } from './server-extensions/RingCentralTelephonyExtension.js';
import { TeamsMeetingsExtension } from './server-extensions/TeamsMeetingsExtension.js';

// ── Types ──────────────────────────────────────────────────────────────────
export * from './types.js';
export * from './sessionManager.js';

// ── Telephony Services, Registries & Routers ──────────────────────────────
export * from './telephony/index.js';

// ── Server Extensions ──────────────────────────────────────────────────────
export { TwilioTelephonyExtension } from './server-extensions/TwilioTelephonyExtension.js';
export { VonageTelephonyExtension } from './server-extensions/VonageTelephonyExtension.js';
export { RingCentralTelephonyExtension } from './server-extensions/RingCentralTelephonyExtension.js';
export { TeamsMeetingsExtension } from './server-extensions/TeamsMeetingsExtension.js';

// ── Resolvers ──────────────────────────────────────────────────────────────
export * from './resolvers/index.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Absolute paths to the resolver files for use with buildSchema / createMJServer.
 */
export const RESOLVER_PATHS: string[] = [
    resolve(__dirname, 'resolvers/*Resolver.{js,ts}'),
];

/**
 * Default server-extension declarations for @memberjunction/telephony-adapters.
 */
export const MJ_SERVER_EXTENSIONS: ServerExtensionConfig[] = [
    {
        Enabled: false,
        DriverClass: 'TwilioTelephonyExtension',
        RootPath: '/telephony/twilio',
        Phase: 'pre-auth',
        Settings: {},
    },
    {
        Enabled: false,
        DriverClass: 'VonageTelephonyExtension',
        RootPath: '/telephony/vonage',
        Phase: 'pre-auth',
        Settings: {},
    },
    {
        Enabled: false,
        DriverClass: 'RingCentralTelephonyExtension',
        RootPath: '/telephony/ringcentral',
        Phase: 'pre-auth',
        Settings: {},
    },
    {
        Enabled: false,
        DriverClass: 'TeamsMeetingsExtension',
        RootPath: '/meetings/teams',
        Phase: 'pre-auth',
        Settings: {},
    },
];

/**
 * Tree-shaking prevention function.
 *
 * Import and call this function from your application's entry point to ensure
 * the @RegisterClass decorators on the telephony extensions fire at module load time.
 * Also registers alias driver keys ('twilio-telephony', 'vonage-telephony', etc.).
 */
export function LoadTelephonyAdapters(): void {
    // Register alias driver names for convenience in configuration
    const factory = MJGlobal.Instance.ClassFactory;
    factory.Register(BaseServerExtension, TwilioTelephonyExtension, 'twilio-telephony');
    factory.Register(BaseServerExtension, VonageTelephonyExtension, 'vonage-telephony');
    factory.Register(BaseServerExtension, RingCentralTelephonyExtension, 'ringcentral-telephony');
    factory.Register(BaseServerExtension, TeamsMeetingsExtension, 'teams-meetings');
}
