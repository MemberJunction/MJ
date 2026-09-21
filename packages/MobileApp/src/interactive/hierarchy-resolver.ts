/**
 * @fileoverview Resolving a spec's registry-referenced child components before anything compiles.
 *
 * ## Why a pre-pass exists at all
 *
 * `ComponentManager.loadHierarchy` already fetches registry children itself — for a local registry
 * component it calls `ComponentMetadataEngine.FindComponent` and reads the row's `Specification`.
 * Mobile does not need to reimplement that, and does not.
 *
 * What mobile needs is the answer *earlier*. The compiler emits a component's library bindings
 * (`const _ = libraries['_']`) at the top of its factory, so a library has to be in
 * `RuntimeContext.libraries` **before that component compiles** — and `loadHierarchy` compiles each
 * child as it fetches it. A child whose spec lives in the registry therefore declares libraries this
 * app cannot see until it is too late to load them.
 *
 * So this walks the hierarchy first, resolving registry children through the same engine
 * `loadHierarchy` will use, purely to collect the library set. The specs it reads are then fetched
 * again by `loadHierarchy` — from `ComponentManager`'s own fetch cache, so the second read is free.
 *
 * ## Why this matters more than it sounds
 *
 * Of the 118 components in this deployment's registry, the majority are assembled from named
 * children (`DataGrid`, `OpenRecordButton`, `SingleRecordView` …) rather than carrying their code
 * inline — that is how the component authoring guide tells agents to build anything non-trivial.
 * Treating "no inline code" as unrenderable declined most real components over a lookup the app was
 * perfectly able to perform.
 */

import { ComponentMetadataEngine } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type { ComponentSpec } from '@memberjunction/react-runtime';

/** One entry of a spec's `libraries` array. */
type ComponentLibraryDependency = NonNullable<ComponentSpec['libraries']>[number];

/** What a hierarchy walk found. */
export type ResolvedHierarchy = {
    /** Every library declared anywhere in the resolved tree, de-duplicated. */
    Libraries: ComponentLibraryDependency[];
    /** Child components that could not be resolved, by name. */
    Unresolved: string[];
    /**
     * The spec with every registry-backed child's code inlined.
     *
     * The native renderer does not need this — `loadHierarchy` fetches children itself, against the
     * app's provider. The DOM host does: its page runs in a WebView with no provider and no token,
     * so the same fetch inside the page would throw. Handing it a self-contained spec means the
     * page never has to ask anyone for anything.
     */
    Spec: ComponentSpec | null;
};

/** Reads a component row's stored specification, or `null` when it is absent or unparseable. */
function ParseSpecification(raw: string | null | undefined): ComponentSpec | null {
    if (!raw?.trim()) return null;
    try {
        return JSON.parse(raw) as ComponentSpec;
    } catch {
        return null;
    }
}

/**
 * Walks a spec and its children — inline and registry-backed alike — collecting declared libraries.
 *
 * Tolerant by design. A child that cannot be resolved is *named* rather than thrown, because the
 * caller decides what an incomplete hierarchy is worth: `loadHierarchy` may still succeed (it has
 * paths this pre-pass does not, notably external registries served over GraphQL), and a component
 * that half-renders with a clear message beats one that refuses over a lookup that might have
 * worked.
 *
 * External-registry children are not fetched here — that path needs the runtime's GraphQL registry
 * client. They are left to `loadHierarchy`, and reported so the caller knows the library scan for
 * that subtree is incomplete rather than empty.
 *
 * @param spec The root spec.
 * @param contextUser The acting user, for the registry read.
 */
export async function ResolveHierarchy(
    spec: ComponentSpec | null | undefined,
    contextUser?: UserInfo,
): Promise<ResolvedHierarchy> {
    const out: ResolvedHierarchy = { Libraries: [], Unresolved: [], Spec: null };
    if (!spec) return out;

    const seenLibraries = new Set<string>();
    const visitedComponents = new Set<string>();

    const collect = (node: ComponentSpec): void => {
        for (const ref of node.libraries ?? []) {
            const key = ref.globalVariable || ref.name;
            if (!key || seenLibraries.has(key)) continue;
            seenLibraries.add(key);
            out.Libraries.push(ref);
        }
    };

    /**
     * Walks a node, returning a copy whose children all carry their own code.
     *
     * A copy rather than a mutation: the spec belongs to the artifact that loaded it, and rewriting
     * it in place would mean the second render of the same artifact saw a tree the first one had
     * already changed.
     */
    const visit = async (node: ComponentSpec): Promise<ComponentSpec> => {
        collect(node);
        const children: ComponentSpec[] = [];

        for (const dep of node.dependencies ?? []) {
            const name = dep.name;
            if (!name) continue;

            // Carries its own code: nothing to fetch, just keep walking.
            if (typeof dep.code === 'string' && dep.code.trim().length > 0) {
                children.push(await visit(dep as ComponentSpec));
                continue;
            }

            // An external registry needs the runtime's GraphQL registry client, which is
            // `loadHierarchy`'s job. Record that this subtree went unscanned and pass the
            // reference through untouched so the runtime can still try.
            if (dep.registry) {
                out.Unresolved.push(name);
                children.push(dep as ComponentSpec);
                continue;
            }

            // A cycle, or a child two parents share. Already collected; passing the reference
            // through unresolved would make the page fetch it, so keep the reference as-is and let
            // the runtime's own circular-dependency guard handle it.
            if (visitedComponents.has(name)) {
                children.push(dep as ComponentSpec);
                continue;
            }
            visitedComponents.add(name);

            try {
                const row = await ComponentMetadataEngine.Instance.FindComponent(
                    name,
                    dep.namespace ?? undefined,
                    undefined,
                    contextUser,
                );
                const childSpec = ParseSpecification(row?.Specification);
                if (!childSpec) {
                    out.Unresolved.push(name);
                    children.push(dep as ComponentSpec);
                    continue;
                }
                children.push(await visit(childSpec));
            } catch {
                out.Unresolved.push(name);
                children.push(dep as ComponentSpec);
            }
        }

        return children.length > 0 ? { ...node, dependencies: children } : node;
    };

    out.Spec = await visit(spec);
    return out;
}
