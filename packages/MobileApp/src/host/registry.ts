import { LoadFieldNotesMobileResource } from '@/sample-app/FieldNotesResource';
import { LoadGenericMobileResources } from './generic-resources';

/**
 * @fileoverview The build-time manifest of hosted application surfaces.
 *
 * ## Why a native host needs this, and a web host does not
 *
 * MJ Explorer can discover an application's code at runtime — it ships a JavaScript bundle, and a
 * lazily-loaded chunk registers itself when it arrives. A native app cannot: its JavaScript is
 * compiled into the binary at build time, and App Store policy is hostile to shipping executable
 * code out-of-band. So "which applications does this build host" is a **build-time** decision on
 * mobile, where it is a **runtime** one on the web.
 *
 * That is the single real asymmetry between the two hosts, and this file is where it lives. Every
 * other part of the model — the `MJ: Applications` metadata, the nav items, the `DriverClass`
 * names, the ClassFactory resolution — is identical across both.
 *
 * ## What this means for an application team
 *
 * Adding a surface is one import and one call here. A deployment that hosts a different set of
 * applications builds with a different manifest; nothing else changes, and no application's code
 * is modified to be included or excluded.
 *
 * This mirrors the class-registration manifests MJ already generates for the server and the
 * browser bootstrap packages, for exactly the same reason: `@RegisterClass` is a module side
 * effect, and a bundler that sees no import of a module removes it. The failure mode is quiet —
 * the class never registers, the nav item falls back to "opens on desktop", and it works in
 * development while failing in a production build.
 */

/**
 * Registers every hosted application surface this build ships.
 *
 * Called once from the root layout, before any navigation renders, so a resolution cannot race
 * registration.
 */
export function LoadHostedMobileResources(): void {
    // Generic resource types — surfaces the shell itself provides for nav items that name a record
    // rather than a driver class. Registered first so an application can override one by name.
    LoadGenericMobileResources();
    // Sample application — the worked example behind the authoring guide.
    LoadFieldNotesMobileResource();
}
