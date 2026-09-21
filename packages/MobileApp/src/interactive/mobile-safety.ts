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
import { FindMobileLibrary } from './library-registry';

/** Which renderer a spec should go to. */
export type RenderMode =
    /** Compile and run in the React Native runtime — faster, native scrolling and typography. */
    | 'native'
    /** Run in a real browser document, because it needs a DOM or a canvas. */
    | 'dom'
    /** Nothing can render this. */
    | 'none';

/** Verdict from {@link AssessSpec}. */
export interface SpecAssessment {
    /** True when some renderer can show this. */
    renderable: boolean;
    /** Which renderer to use. */
    mode: RenderMode;
    /** Human-readable reason, when nothing can render it. */
    reason?: string;
    /** The libraries that forced the DOM host, for diagnostics. */
    domLibraries?: string[];
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
 * Names the libraries the native runtime cannot supply, which route the whole component to the
 * DOM host.
 *
 * All-or-nothing per component, not per library: a component's libraries have to coexist in one
 * document, so one canvas-bound library sends the whole thing to the browser. Splitting a
 * component across two renderers is not a thing that can exist.
 *
 * @param spec The root spec.
 */
function domHostLibraries(spec: ComponentSpec): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    WalkHierarchy(spec, (node) => {
        for (const ref of node.libraries ?? []) {
            if (FindMobileLibrary(ref)) continue;
            const key = ref.globalVariable || ref.name;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            names.push(ref.name);
        }
    });
    return names;
}

/**
 * Determine whether an interactive component spec can be rendered natively.
 *
 * @param spec The parsed interactive component spec.
 * @returns A {@link SpecAssessment} describing the decision and, if negative, why.
 */
export function AssessSpec(spec: ComponentSpec | null | undefined): SpecAssessment {
    if (!spec || !hasRenderableCode(spec)) {
        return { renderable: false, mode: 'none', reason: 'This artifact does not contain a renderable component.' };
    }

    const domOnly = domHostLibraries(spec);
    if (domOnly.length > 0) {
        // Not a refusal any more. A library that needs a canvas gets one — see `dom-host/`.
        return { renderable: true, mode: 'dom', domLibraries: domOnly };
    }

    return { renderable: true, mode: 'native' };
}
