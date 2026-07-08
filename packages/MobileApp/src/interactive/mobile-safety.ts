/**
 * @fileoverview On-device renderability gate for interactive component specs.
 *
 * React Native can compile and run a self-contained React component via
 * `new Function`/eval (confirmed on Hermes), but it CANNOT run the runtime's
 * `LibraryLoader` (which fetches 3rd-party UMD bundles from CDNs) nor resolve
 * child-component `dependencies` through a single `loadComponent` call. This
 * module screens a spec so only clean, library-free, dependency-free components
 * are rendered natively; everything else falls back to "view on desktop".
 */

import type { ComponentSpec } from '@memberjunction/react-runtime';

/** Verdict from {@link assessSpec}: whether the spec can render on-device. */
export interface SpecAssessment {
    /** True when the spec is safe to compile + render in the RN runtime. */
    renderable: boolean;
    /** Human-readable reason shown in the desktop fallback when not renderable. */
    reason?: string;
}

/** True when the spec has a non-empty name and a real code body. */
function hasRenderableCode(spec: ComponentSpec): boolean {
    return typeof spec.name === 'string' && !!spec.name && typeof spec.code === 'string' && !!spec.code.trim();
}

/**
 * Determine whether an interactive component spec can be rendered natively.
 *
 * Not renderable when the spec is empty/invalid, declares any 3rd-party
 * `libraries` (the CDN library loader can't run on native), or declares child
 * component `dependencies` (a single-component load can't satisfy them). Only a
 * clean, standalone, React-only spec is renderable.
 *
 * @param spec The parsed interactive component spec.
 * @returns A {@link SpecAssessment} describing the decision and, if negative, why.
 */
export function assessSpec(spec: ComponentSpec | null | undefined): SpecAssessment {
    if (!spec || !hasRenderableCode(spec)) {
        return { renderable: false, reason: 'This artifact does not contain a renderable component.' };
    }
    if (spec.libraries && spec.libraries.length > 0) {
        return { renderable: false, reason: 'This component uses external libraries that only run on desktop.' };
    }
    if (spec.dependencies && spec.dependencies.length > 0) {
        return { renderable: false, reason: 'This component depends on other components not available on mobile.' };
    }
    return { renderable: true };
}
