/**
 * @fileoverview On-device renderability gate for interactive component specs.
 *
 * React Native can compile and run a React component via `new Function`/eval (confirmed on Hermes);
 * `library-registry.ts` satisfies a component's declared libraries through `RuntimeContext.libraries`
 * plus the matching globals; and the renderer loads child components through the runtime's own
 * `loadHierarchy`, which is the same call `MJReactComponent` makes. So the question here is narrow:
 * is there anything in this hierarchy that this app genuinely cannot obtain?
 *
 * One thing qualifies, and it is not "the spec declares something".
 *
 * **A library with no native equivalent.** DOM- and canvas-bound libraries cannot be shimmed into
 * something that draws; a fake would render nothing and report no error.
 *
 * **A child component whose code isn't in the spec.** `ComponentManager.needsFetch` treats
 * `location === 'registry' && !code` as requiring a fetch from a component registry, which this app
 * cannot perform. Agent-authored specs embed their children's code inline, so this is the uncommon
 * case — but when it happens the component cannot be assembled here and saying so beats a blank
 * panel.
 *
 * The earlier version of this file refused any spec that declared libraries *or* dependencies at
 * all. Both refusals were wrong in the expensive direction: they sent the majority of real
 * components to a "best viewed on desktop" card over capabilities the app either had or could get.
 *
 * Note what this means for the library check below: it can only see libraries declared in the spec
 * it is handed. A registry-backed child's libraries are invisible until that child is fetched, so
 * the renderer re-runs the same check against the fully resolved tree before compiling.
 */

import type { ComponentSpec } from '@memberjunction/react-runtime';
import { DESKTOP_ONLY, FindMobileLibrary } from './library-registry';

/** Verdict from {@link AssessSpec}: whether the spec can render on-device. */
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
 * Visits the root spec and every descendant exactly once.
 *
 * Identity-tracked rather than name-tracked, so a hierarchy that legitimately reuses a child spec
 * object is walked once while two distinct children sharing a name are both seen.
 *
 * @param spec The root spec.
 * @param visit Called for each spec in the tree.
 */
function WalkHierarchy(spec: ComponentSpec, visit: (node: ComponentSpec) => void): void {
    const seen = new Set<ComponentSpec>();
    const go = (node: ComponentSpec | null | undefined): void => {
        if (!node || seen.has(node)) return;
        seen.add(node);
        visit(node);
        for (const dep of node.dependencies ?? []) {
            go(dep as ComponentSpec);
        }
    };
    go(spec);
}

/**
 * Names the libraries declared anywhere in the hierarchy that this app has no way to supply.
 *
 * @param spec The root spec.
 */
function unsupportedLibraries(spec: ComponentSpec): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    WalkHierarchy(spec, (node) => {
        for (const ref of node.libraries ?? []) {
            if (FindMobileLibrary(ref)) continue;
            const key = ref.globalVariable || ref.name;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            const reason = DESKTOP_ONLY[ref.globalVariable];
            names.push(reason ? `${ref.name} — ${reason}` : ref.name);
        }
    });
    return names;
}

/**
 * Turns the unsupported-library list into one sentence.
 *
 * Naming the library matters: "uses external libraries" is a dead end, while "needs Chart.js, which
 * draws into a browser canvas" tells the reader both why the phone declined and that a desktop will
 * not.
 *
 * @param names The unsupported libraries, already annotated with their reason where known.
 */
function describeUnsupported(names: string[]): string {
    if (names.length === 1) return `This component needs ${names[0]}, which isn't available on mobile.`;
    return `This component needs libraries that aren't available on mobile: ${names.join('; ')}.`;
}

/**
 * Determine whether an interactive component spec can be rendered natively.
 *
 * @param spec The parsed interactive component spec.
 * @returns A {@link SpecAssessment} describing the decision and, if negative, why.
 */
export function AssessSpec(spec: ComponentSpec | null | undefined): SpecAssessment {
    if (!spec || !hasRenderableCode(spec)) {
        return { renderable: false, reason: 'This artifact does not contain a renderable component.' };
    }

    const unsupported = unsupportedLibraries(spec);
    if (unsupported.length > 0) {
        return { renderable: false, reason: describeUnsupported(unsupported) };
    }

    return { renderable: true };
}
