/**
 * @fileoverview Reading the CDN definitions for the libraries a DOM-hosted component needs.
 *
 * The native renderer resolves libraries from bundled npm packages, because Hermes has no way to
 * load a script. The DOM host has the opposite problem and the opposite solution: it is a browser,
 * so it loads exactly what the browser loads — the URLs recorded against each library in
 * `MJ: Component Libraries`.
 *
 * Reading them from metadata rather than hardcoding a table matters for the same reason it matters
 * on the web: a deployment that pins a different Chart.js build, or adds a library MJ does not ship
 * with, changes one row and every surface follows. A copy of the URLs in this app would be a second
 * source of truth that silently goes stale.
 */

import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import type { ComponentSpec } from '@memberjunction/react-runtime';
import type { DomHostLibrary } from './bridge-protocol';

/** The columns this needs from `MJ: Component Libraries`. */
type LibraryRow = {
    Name: string;
    GlobalVariable: string | null;
    CDNUrl: string | null;
    CDNCssUrl: string | null;
};

/**
 * Loads the CDN definitions for a set of global variable names.
 *
 * Returns only the libraries that resolved and carry a script URL. A declared library with no
 * `CDNUrl` cannot be loaded by any browser surface, so omitting it here produces the same outcome
 * the web gets rather than a mobile-specific failure.
 *
 * @param globalVariables The globals the component hierarchy declares, e.g. `['Chart', '_']`.
 * @param contextUser The acting user.
 */
export async function LoadDomHostLibraries(
    globalVariables: readonly string[],
    contextUser?: UserInfo,
): Promise<DomHostLibrary[]> {
    const wanted = [...new Set(globalVariables.filter((g) => !!g))];
    if (wanted.length === 0) return [];

    const list = wanted.map((g) => `'${g.replace(/'/g, "''")}'`).join(',');
    const result = await new RunView().RunView<LibraryRow>(
        {
            EntityName: 'MJ: Component Libraries',
            ExtraFilter: `Status='Active' AND GlobalVariable IN (${list})`,
            Fields: ['Name', 'GlobalVariable', 'CDNUrl', 'CDNCssUrl'],
            ResultType: 'simple',
        },
        contextUser,
    );
    if (!result.Success) return [];

    // Ordered by the component's own declaration order, not the query's. A library that depends on
    // another being present — the reason `Dependencies` exists on these rows — is at least loaded
    // in the order the author wrote, which is the order that worked on the web.
    const byGlobal = new Map(result.Results.filter((r) => r.GlobalVariable).map((r) => [r.GlobalVariable as string, r]));
    const out: DomHostLibrary[] = [];
    for (const g of wanted) {
        const row = byGlobal.get(g);
        if (!row?.CDNUrl) continue;
        out.push({
            Name: row.Name,
            GlobalVariable: g,
            CdnUrl: row.CDNUrl,
            CdnCssUrl: row.CDNCssUrl,
        });
    }
    return out;
}

/**
 * The global variable names declared anywhere in an already-resolved hierarchy.
 *
 * @param spec The root spec.
 * @param extra Libraries found by resolving registry-backed children.
 */
export function DeclaredGlobals(
    spec: ComponentSpec | null | undefined,
    extra: NonNullable<ComponentSpec['libraries']> = [],
): string[] {
    const globals = new Set<string>();
    const visited = new Set<ComponentSpec>();
    const visit = (node: ComponentSpec | null | undefined): void => {
        if (!node || visited.has(node)) return;
        visited.add(node);
        for (const l of node.libraries ?? []) {
            if (l.globalVariable) globals.add(l.globalVariable);
        }
        for (const d of node.dependencies ?? []) visit(d as ComponentSpec);
    };
    visit(spec);
    for (const l of extra) {
        if (l.globalVariable) globals.add(l.globalVariable);
    }
    return [...globals];
}
