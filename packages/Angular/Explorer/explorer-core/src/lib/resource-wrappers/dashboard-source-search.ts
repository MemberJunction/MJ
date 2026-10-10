/**
 * @fileoverview Source search for the dashboard studio tools: finds the artifacts, user views, queries and
 * entities that match the agent's query, ranks them, and gives each match a panel config for AddPanel.
 * Pure: the tab passes in the lists through {@link SourceSearchDeps}, already limited to what the user may use.
 */

/** The kinds of source a dashboard panel can show. */
export type SourceKind = 'artifact' | 'view' | 'query' | 'entity';

/** Every {@link SourceKind}, in the order search results list them. */
export const SOURCE_KINDS: readonly SourceKind[] = ['artifact', 'view', 'query', 'entity'];

/**
 * The artifact types that suit an Artifact panel, by their names in the `MJ: Artifact Types` metadata:
 * interactive components and reports, data (with Data Snapshot and Search Result Set, which use the same
 * viewer), HTML, SVG and Markdown.
 */
export const DASHBOARD_ARTIFACT_TYPE_NAMES = [
  'Component',
  'Report',
  'Data',
  'Data Snapshot',
  'Search Result Set',
  'HTML',
  'SVG Image',
  'Markdown Document',
] as const;

/** One source the agent can show in a dashboard panel. The keys are the SearchSources tool result keys. */
export interface SourceSearchResult {
  /** What the source is. */
  kind: SourceKind; // case-violation-ok-legacy-back-compat: SearchSources result keys the spec fixes, camelCase like every studio tool result
  /** The ID of the artifact, user view, query or entity. */
  id: string | null; // case-violation-ok-legacy-back-compat: SearchSources result keys the spec fixes, camelCase like every studio tool result
  /** The source's name. For an entity, its display name when it has one. */
  name: string; // case-violation-ok-legacy-back-compat: SearchSources result keys the spec fixes, camelCase like every studio tool result
  /** The source's description. */
  description: string | null; // case-violation-ok-legacy-back-compat: SearchSources result keys the spec fixes, camelCase like every studio tool result
  /** The artifact type, the view's entity, the query's category, or "entity". */
  type: string | null; // case-violation-ok-legacy-back-compat: SearchSources result keys the spec fixes, camelCase like every studio tool result
  /** False for an artifact whose type does not suit a panel (see DASHBOARD_ARTIFACT_TYPE_NAMES). True for every other source. */
  fitsDashboard: boolean; // case-violation-ok-legacy-back-compat: SearchSources result keys the spec fixes, camelCase like every studio tool result
  /** A panel config for AddPanel: `type` is the part type (Artifact, View or Query), and the other keys are its config. */
  suggestedConfig: Record<string, unknown>; // case-violation-ok-legacy-back-compat: SearchSources result keys the spec fixes, camelCase like every studio tool result
}

/** The lists the search reads. The tab builds them from the engines with the user's access rules. */
export interface SourceSearchDeps {
  /**
   * The artifacts the user can read. `query` is the search text without its outer spaces, or '' to list
   * every artifact; the list can leave out the artifacts whose name and description do not contain it.
   * `LatestVersion` is null when the list does not give it.
   */
  ListArtifacts(query: string): Promise<Array<{ ID: string; Name: string; Description: string | null; Type: string | null; LatestVersion: number | null }>>;
  /** The user's own views and the views shared with the user. */
  ListViews(): Array<{ ID: string; Name: string; Description: string | null; Entity: string; EntityID: string }>;
  /** The queries the user can run. */
  ListQueries(): Array<{ ID: string; Name: string; Description: string | null; Category: string | null }>;
  /** The entities the user can read. */
  ListEntities(): Array<{ ID: string; Name: string; DisplayName: string | null; Description: string | null }>;
}

type ArtifactSource = Awaited<ReturnType<SourceSearchDeps['ListArtifacts']>>[number];
type ViewSource = ReturnType<SourceSearchDeps['ListViews']>[number];
type QuerySource = ReturnType<SourceSearchDeps['ListQueries']>[number];
type EntitySource = ReturnType<SourceSearchDeps['ListEntities']>[number];

/**
 * The items that match the query, best first, at most `limit` of them: exact name, then name start, then
 * name contains, then description contains, ignoring case and the query's outer spaces. Items in one tier
 * keep the order they were given in. An empty query gives the first `limit` items by name. The input
 * array is not changed.
 */
export function RankByQuery<T extends { name: string; description: string | null }>(items: readonly T[], query: string, limit: number): T[] {
  const count = Math.max(0, limit);
  const text = query.trim().toLowerCase();
  if (!text) return [...items].sort((a, b) => a.name.localeCompare(b.name)).slice(0, count);
  return items
    .map((item, index) => ({ item, index, tier: matchTier(item, text) }))
    .filter(ranked => ranked.tier >= 0)
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .slice(0, count)
    .map(ranked => ranked.item);
}

/**
 * Searches the sources of the requested kinds and gives up to `limit` results of each kind, ranked with
 * {@link RankByQuery}, in {@link SOURCE_KINDS} order. It reads only the lists of the kinds it searches,
 * and gives the artifact list the query without its outer spaces.
 */
export async function SearchDashboardSources(
  deps: SourceSearchDeps,
  query: string,
  kinds: readonly SourceKind[],
  limit: number,
): Promise<SourceSearchResult[]> {
  const results: SourceSearchResult[] = [];
  for (const kind of SOURCE_KINDS) {
    if (kinds.includes(kind)) results.push(...RankByQuery(await listSources(deps, kind, query.trim()), query, limit));
  }
  return results;
}

/** How well an item matches a lowercase query: 0 exact name, 1 name start, 2 name contains, 3 description contains, -1 no match. */
function matchTier(item: { name: string; description: string | null }, text: string): number {
  const name = item.name.trim().toLowerCase();
  if (name === text) return 0;
  if (name.startsWith(text)) return 1;
  if (name.includes(text)) return 2;
  return (item.description ?? '').toLowerCase().includes(text) ? 3 : -1;
}

/** The sources of one kind, as search results in the order the list gives them. The artifact list gets `query`. */
async function listSources(deps: SourceSearchDeps, kind: SourceKind, query: string): Promise<SourceSearchResult[]> {
  switch (kind) {
    case 'artifact':
      return (await deps.ListArtifacts(query)).map(artifactResult);
    case 'view':
      return deps.ListViews().map(viewResult);
    case 'query':
      return deps.ListQueries().map(queryResult);
    case 'entity':
      return deps.ListEntities().map(entityResult);
  }
}

/**
 * An artifact as a search result. The config names the latest version when the list gives it; without a
 * version number the panel shows the artifact's latest version.
 */
function artifactResult(artifact: ArtifactSource): SourceSearchResult {
  const version = artifact.LatestVersion;
  const versionKey = typeof version === 'number' && Number.isInteger(version) && version > 0 ? { versionNumber: version } : {};
  return {
    kind: 'artifact',
    id: artifact.ID,
    name: artifact.Name,
    description: artifact.Description,
    type: artifact.Type,
    fitsDashboard: suitsPanel(artifact.Type),
    suggestedConfig: { type: 'Artifact', artifactId: artifact.ID, ...versionKey },
  };
}

/** A user view as a search result: a View panel of the view. */
function viewResult(view: ViewSource): SourceSearchResult {
  return {
    kind: 'view',
    id: view.ID,
    name: view.Name,
    description: view.Description,
    type: view.Entity,
    fitsDashboard: true,
    suggestedConfig: { type: 'View', viewId: view.ID, entityName: view.Entity },
  };
}

/** A query as a search result: a Query panel of the query. */
function queryResult(query: QuerySource): SourceSearchResult {
  return {
    kind: 'query',
    id: query.ID,
    name: query.Name,
    description: query.Description,
    type: query.Category,
    fitsDashboard: true,
    suggestedConfig: { type: 'Query', queryId: query.ID },
  };
}

/** An entity as a search result: a View panel of all its records. */
function entityResult(entity: EntitySource): SourceSearchResult {
  return {
    kind: 'entity',
    id: entity.ID,
    name: entity.DisplayName || entity.Name,
    description: entity.Description,
    type: 'entity',
    fitsDashboard: true,
    suggestedConfig: { type: 'View', entityName: entity.Name },
  };
}

/** True when the artifact type is one of DASHBOARD_ARTIFACT_TYPE_NAMES, ignoring case and outer spaces. */
function suitsPanel(type: string | null): boolean {
  const name = type?.trim().toLowerCase();
  return DASHBOARD_ARTIFACT_TYPE_NAMES.some(known => known.toLowerCase() === name);
}
