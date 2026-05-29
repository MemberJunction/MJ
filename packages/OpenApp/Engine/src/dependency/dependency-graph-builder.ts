/**
 * Transitive dependency graph construction for MJ Open Apps.
 *
 * Builds the COMPLETE dependency graph for an app by recursively fetching each
 * dependency's manifest from its repository, then runs cycle detection and a
 * topological sort over the full graph. This is the up-front pass that lets the
 * installer detect cross-repo cycles (e.g. A -> B -> A) *before* doing any work,
 * rather than discovering them via runaway recursion partway through an install.
 *
 * Contrast with {@link ResolveDependencies} in dependency-resolver.ts, which only
 * inspects a single manifest's direct dependencies (it visits each dependency
 * with an empty child set) and therefore can only catch a manifest that lists
 * itself as a direct dependency — never a transitive cross-repo cycle.
 */
import type { DependencyValue, InstalledAppMap } from './dependency-resolver.js';
import type { ResolvedDependency } from '../types/open-app-types.js';
import { CheckDependencyVersionCompatibility } from './version-checker.js';

/**
 * Minimal manifest shape needed for graph construction. The full manifest carries
 * far more, but the graph builder only cares about identity and dependency edges.
 */
export interface FetchedManifest {
    /** App name (from the dependency's manifest) */
    name: string;
    /** GitHub repository URL */
    repository: string;
    /** This app's own dependency declarations */
    dependencies?: Record<string, DependencyValue>;
}

/**
 * Fetches and parses an app manifest from a repository URL.
 *
 * Injected into the graph builder so it can be unit-tested without network
 * access. Returns the manifest on success, or an error message when it can't be
 * retrieved or parsed.
 */
export type ManifestFetcher = (
    repoUrl: string
) => Promise<{ Success: boolean; Manifest?: FetchedManifest; ErrorMessage?: string }>;

/**
 * The app being installed, used as the root of the dependency graph.
 */
export interface RootApp {
    /** App name (from manifest) */
    AppName: string;
    /** GitHub repository URL */
    Repository: string;
    /** Direct dependency declarations from the root manifest */
    Dependencies: Record<string, DependencyValue>;
}

/**
 * Result of resolving the full transitive dependency graph.
 */
export interface GraphResolutionResult {
    /** Whether resolution succeeded */
    Success: boolean;
    /** Transitive dependencies in leaf-first install order (the root is excluded) */
    InstallOrder?: ResolvedDependency[];
    /** Error message if a cycle, version conflict, or unresolvable manifest was found */
    ErrorMessage?: string;
}

/**
 * A node in the resolved dependency graph.
 */
interface GraphNode {
    AppName: string;
    Repository: string;
    /** The node's own dependency edges (empty when its manifest couldn't be fetched) */
    Dependencies: Record<string, DependencyValue>;
    AlreadyInstalled: boolean;
    InstalledVersion?: string;
    /** Version range required by the first parent that introduced this node */
    RequiredVersionRange: string;
}

/** DFS coloring for cycle detection. */
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

/**
 * Extracts version range and optional repository from a dependency value.
 */
function ParseDependencyValue(value: DependencyValue): { versionRange: string; repository?: string } {
    if (typeof value === 'string') {
        return { versionRange: value };
    }
    return { versionRange: value.version, repository: value.repository };
}

/**
 * Resolves the complete transitive dependency graph for an app.
 *
 * Fetches every reachable dependency's manifest (via the injected fetcher),
 * validates version compatibility for already-installed dependencies, detects
 * circular dependency chains across the full graph, and returns the leaf-first
 * install order.
 *
 * @param root - The app being installed and its direct dependency declarations
 * @param installedApps - Map of apps already installed in the MJ instance
 * @param fetchManifest - Fetches a dependency manifest from its repository URL
 * @returns Ordered install plan (leaf-first, root excluded) or error details
 */
export async function ResolveDependencyGraph(
    root: RootApp,
    installedApps: InstalledAppMap,
    fetchManifest: ManifestFetcher
): Promise<GraphResolutionResult> {
    const { graph, errors } = await BuildGraph(root, installedApps, fetchManifest);

    // Cycle detection is structural — report it first so a genuine cycle isn't
    // masked by version-conflict noise it may have produced along the way.
    const sorted = TopologicalSort(graph);
    if (sorted.CycleError) {
        return { Success: false, ErrorMessage: sorted.CycleError };
    }

    if (errors.length > 0) {
        return { Success: false, ErrorMessage: errors.join('; ') };
    }

    const installOrder: ResolvedDependency[] = sorted.Order!
        .filter((name) => name !== root.AppName)
        .map((name) => {
            const node = graph.get(name)!;
            return {
                AppName: node.AppName,
                VersionRange: node.RequiredVersionRange,
                Repository: node.Repository,
                AlreadyInstalled: node.AlreadyInstalled,
                InstalledVersion: node.InstalledVersion,
            };
        });

    return { Success: true, InstallOrder: installOrder };
}

/**
 * Breadth-first traversal that fetches each reachable dependency's manifest and
 * assembles the complete graph. Version compatibility for already-installed
 * dependencies is validated per-edge so conflicts from any requiring parent are
 * caught. Returns the graph plus any non-structural errors encountered.
 */
async function BuildGraph(
    root: RootApp,
    installedApps: InstalledAppMap,
    fetchManifest: ManifestFetcher
): Promise<{ graph: Map<string, GraphNode>; errors: string[] }> {
    const graph = new Map<string, GraphNode>();
    const errors: string[] = [];

    graph.set(root.AppName, {
        AppName: root.AppName,
        Repository: root.Repository,
        Dependencies: root.Dependencies,
        AlreadyInstalled: false,
        RequiredVersionRange: '',
    });

    const queue: Array<{ name: string; value: DependencyValue }> = Object.entries(root.Dependencies).map(
        ([name, value]) => ({ name, value })
    );

    while (queue.length > 0) {
        const edge = queue.shift()!;
        await ProcessEdge(edge.name, edge.value, graph, installedApps, fetchManifest, errors, queue);
    }

    return { graph, errors };
}

/**
 * Processes a single dependency edge: validates version compatibility for
 * installed dependencies, and — the first time a node is seen — creates it and
 * fetches its manifest to enqueue its own transitive edges.
 */
async function ProcessEdge(
    depName: string,
    depValue: DependencyValue,
    graph: Map<string, GraphNode>,
    installedApps: InstalledAppMap,
    fetchManifest: ManifestFetcher,
    errors: string[],
    queue: Array<{ name: string; value: DependencyValue }>
): Promise<void> {
    const { versionRange, repository } = ParseDependencyValue(depValue);
    const installed = installedApps[depName];

    // Validate every edge that requires an already-installed dependency, so a
    // conflict introduced by any parent in the graph is surfaced.
    //
    // NOTE (known limitation, tracked in #2713): the range is only enforced when
    // the dependency is ALREADY installed. For a not-yet-installed dep, no range
    // check happens here and the orchestrator installs whatever its default-branch
    // manifest reports (see InstallDependencies in install-orchestrator.ts), so a
    // declared range like '>=1.0 <2.0' does not gate a fresh install.
    if (installed && installed.Version) {
        const compat = CheckDependencyVersionCompatibility(installed.Version, versionRange);
        if (!compat.Compatible) {
            errors.push(
                `Dependency '${depName}' is installed (v${installed.Version}) but does not satisfy required range '${versionRange}': ${compat.Message}`
            );
        }
    }

    // Already processed this node — only the per-edge version check above applies.
    //
    // NOTE (known limitation, tracked in #2713): when the existing node is an
    // uninstalled dep, a second dependent's `versionRange` is NOT compared against
    // the first dependent's range that created the node — so a diamond conflict
    // (a needs `common ^1`, b needs `common ^2`, common uninstalled) is silently
    // first-write-wins. Reconciling ranges across edges for the same uninstalled
    // node would belong right here.
    if (graph.has(depName)) {
        return;
    }

    const resolvedRepo = installed?.Repository ?? repository ?? '';
    const node: GraphNode = {
        AppName: depName,
        Repository: resolvedRepo,
        Dependencies: {},
        AlreadyInstalled: installed !== undefined,
        InstalledVersion: installed?.Version,
        RequiredVersionRange: versionRange,
    };
    graph.set(depName, node);

    if (!resolvedRepo) {
        // No repository to fetch from. If the dep isn't installed, the install
        // step emits the actionable "no repository URL" error; here we leave it
        // as a leaf so the rest of the graph still resolves.
        return;
    }

    const fetched = await fetchManifest(resolvedRepo);
    if (fetched.Success && fetched.Manifest) {
        node.Dependencies = fetched.Manifest.dependencies ?? {};
        for (const [name, value] of Object.entries(node.Dependencies)) {
            queue.push({ name, value });
        }
    } else if (!node.AlreadyInstalled) {
        // Can't resolve an uninstalled dependency's manifest — hard error.
        errors.push(
            `Failed to fetch manifest for dependency '${depName}' from ${resolvedRepo}: ${fetched.ErrorMessage ?? 'unknown error'}`
        );
    }
    // installed + fetch failed -> treat as leaf; its subtree is already satisfied.
}

/**
 * Depth-first topological sort over the full graph with cycle detection.
 * Returns app names in leaf-first (post-order) install order, or a cycle error
 * describing the chain (e.g. "A -> B -> A").
 */
function TopologicalSort(graph: Map<string, GraphNode>): { Order?: string[]; CycleError?: string } {
    const color = new Map<string, number>();
    for (const name of graph.keys()) {
        color.set(name, WHITE);
    }
    const order: string[] = [];
    const stack: string[] = [];

    const visit = (name: string): string | undefined => {
        color.set(name, GRAY);
        stack.push(name);

        const node = graph.get(name);
        if (node) {
            for (const dep of Object.keys(node.Dependencies)) {
                if (!graph.has(dep)) {
                    continue; // unresolved leaf (no manifest fetched)
                }
                const depColor = color.get(dep);
                if (depColor === GRAY) {
                    const start = stack.indexOf(dep);
                    const chain = [...stack.slice(start), dep].join(' -> ');
                    return `Circular dependency detected: ${chain}`;
                }
                if (depColor === WHITE) {
                    const cycle = visit(dep);
                    if (cycle) {
                        return cycle;
                    }
                }
            }
        }

        stack.pop();
        color.set(name, BLACK);
        order.push(name); // post-order => leaf-first
        return undefined;
    };

    for (const name of graph.keys()) {
        if (color.get(name) === WHITE) {
            const cycle = visit(name);
            if (cycle) {
                return { CycleError: cycle };
            }
        }
    }

    return { Order: order };
}
