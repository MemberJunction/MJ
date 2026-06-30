/**
 * @fileoverview Pure helpers for the Database Designer dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so they
 * can be unit-tested in isolation. The component
 * ({@link DatabaseDesignerDashboardComponent}) supplies a plain snapshot of its current
 * schema-browsing state and these helpers shape it into the key-value `AgentContext`
 * object that flows to the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`.
 *
 * The deep ("hardcore", Data-Explorer depth) enrichment here mirrors the Entity Admin /
 * Data Explorer pattern: bounded name lists (cap {@link DATABASE_DESIGNER_NAME_LIST_CAP}
 * with a companion `*Count` flag when truncated), schema groupings, the selected entity's
 * field/relationship summary, and a tolerant id→name→display-name→contains resolver so the
 * agent can refer to entities the way the user reads them on screen — the DISPLAY name
 * (e.g. "AI Models", not the registered "MJ: AI Models").
 *
 * 🔒 SAFETY BOUNDARY: The Database Designer surface CAN mutate the database schema
 * (create entities, alter tables, add/remove fields, run the DDL pipeline). The context
 * shaped here describes ONLY what the user is BROWSING — the accessible-entity list, the
 * current search/selection, schema groupings, and whether the modify panel is open. No
 * helper in this file describes — and no tool may perform — any schema mutation. The agent
 * browses the schema; the user makes changes from the wizard / modify panel.
 */

/**
 * The "MJ: " schema prefix carried by newer core entities (e.g. "MJ: AI Models",
 * "MJ: ML Models"). The designer strips it when an entity has no explicit DisplayName, and
 * users almost always say the stripped form ("AI Models") rather than the full registered
 * Name. See {@link entityDisplayName} / {@link stripMJPrefix}.
 */
export const MJ_ENTITY_NAME_PREFIX = 'MJ: ';

/**
 * Upper bound on how many names a context field publishes (AvailableEntities,
 * RelatedEntities, SchemaGroups). Keeping the streamed note bounded avoids flooding the
 * co-agent with hundreds of names; when the underlying list is larger we surface a
 * companion total-count field instead.
 */
export const DATABASE_DESIGNER_NAME_LIST_CAP = 25;

/**
 * Strip the leading "MJ: " schema prefix from an entity Name, if present.
 * Pure + deterministic. Returns the input unchanged when the prefix is absent.
 */
export function stripMJPrefix(name: string): string {
    return name.startsWith(MJ_ENTITY_NAME_PREFIX) ? name.slice(MJ_ENTITY_NAME_PREFIX.length) : name;
}

/**
 * The display label the designer shows for an entity — the entity's DisplayName when set,
 * else the registered Name with the "MJ: " schema prefix stripped. This is what the user
 * reads on screen and therefore what they say ("AI Models", not "MJ: AI Models").
 */
export function entityDisplayName(name: string, displayName?: string | null): string {
    if (displayName) {
        return displayName;
    }
    return stripMJPrefix(name);
}

/**
 * A minimal name-bearing entity descriptor, supplied by the component so the pure
 * resolver can match agent input against what the user sees. Mirrors the salient slice of
 * an `AccessibleEntity` row (the designer's list model), optionally enriched with the
 * entity's `DisplayName` from `EntityInfo` metadata.
 */
export interface EntityNameCandidate {
    /** The `MJ: Entities` id (designer's `entityId`). */
    ID: string;
    /** The registered entity Name (designer's `entityName`, may carry an "MJ: " prefix). */
    Name: string;
    /** The entity's DisplayName, if any (takes precedence over the prefix-stripped Name). */
    DisplayName?: string | null;
}

/**
 * Resolve an agent-supplied entity reference to one of the accessible entities. The agent
 * may pass either an entity ID (GUID) or a name the way the user sees it. We try, in order:
 *   1. exact ID (case-insensitive — UUIDs may differ in case across SQL Server / PG)
 *   2. exact registered Name (case-insensitive)
 *   3. display name (case-insensitive) — DisplayName, else the prefix-stripped Name
 *   4. display name ignoring the "MJ: " prefix (covers an input carrying the prefix)
 *   5. partial (contains) match on the display name
 *
 * Pure + deterministic over the supplied candidate list, so it's unit-testable in
 * isolation; the component passes its accessible-entity rows (structurally
 * `EntityNameCandidate[]`).
 *
 * @param input - whatever the agent passed (an entity ID or the on-screen display name)
 * @param candidates - the entities available in the designer
 * @returns the matched candidate, or null on a miss
 */
export function resolveEntityByIdOrName<T extends EntityNameCandidate>(input: string, candidates: readonly T[]): T | null {
    const needle = input.trim().toLowerCase();
    if (!needle) {
        return null;
    }
    // 1. exact ID (case-insensitive)
    const byId = candidates.find(c => c.ID.toLowerCase() === needle);
    if (byId) {
        return byId;
    }
    // 2. exact registered Name (case-insensitive)
    const byName = candidates.find(c => c.Name.toLowerCase() === needle);
    if (byName) {
        return byName;
    }
    // 3. display name (DisplayName, else prefix-stripped Name)
    const byDisplay = candidates.find(c => entityDisplayName(c.Name, c.DisplayName).toLowerCase() === needle);
    if (byDisplay) {
        return byDisplay;
    }
    // 4. display name ignoring the "MJ: " prefix (covers an input that itself carries the prefix)
    const strippedNeedle = stripMJPrefix(input.trim()).toLowerCase();
    if (strippedNeedle !== needle) {
        const byStripped = candidates.find(c => entityDisplayName(c.Name, c.DisplayName).toLowerCase() === strippedNeedle);
        if (byStripped) {
            return byStripped;
        }
    }
    // 5. partial (contains) match on the display name
    const byContains = candidates.find(c => entityDisplayName(c.Name, c.DisplayName).toLowerCase().includes(needle));
    if (byContains) {
        return byContains;
    }
    return null;
}

/**
 * Build a tolerant "not found" error for an ID-or-name lookup miss, listing a bounded
 * sample of available entity DISPLAY names so the agent can correct itself.
 */
export function buildEntityNotFoundError(input: string, candidates: readonly EntityNameCandidate[]): string {
    const sample = candidates
        .slice(0, DATABASE_DESIGNER_NAME_LIST_CAP)
        .map(c => entityDisplayName(c.Name, c.DisplayName))
        .join(', ');
    return `No entity matches "${input}". Available entities include: ${sample || '(none)'}.`;
}

/** Cap an array of names to {@link DATABASE_DESIGNER_NAME_LIST_CAP} entries. Pure + deterministic. */
function capNames(names: readonly string[]): string[] {
    return names.slice(0, DATABASE_DESIGNER_NAME_LIST_CAP);
}

/**
 * A summary of one field on the selected entity — the field name + its SQL/semantic type +
 * nullability. The component derives these from the loaded entity detail's columns.
 */
export interface FieldSummary {
    Name: string;
    Type: string;
    IsNullable: boolean;
}

/**
 * A summary of one related entity for the selected entity — the related entity's display
 * name and the relationship type (e.g. "One To Many"). The component derives these from
 * `EntityInfo.RelatedEntities` for the selected entity.
 */
export interface RelatedEntitySummary {
    Name: string;
    RelationshipType: string;
}

/**
 * A summary of one schema grouping in the designer — the schema name and how many
 * accessible entities fall under it. Lets the co-agent see the schema landscape.
 */
export interface SchemaGroupSummary {
    SchemaName: string;
    EntityCount: number;
}

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of the Database Designer dashboard's browse state.
 */
export interface DatabaseDesignerAgentContextInput {
    /** Total number of entities the current user can access in the designer. */
    EntityCount: number;
    /** Entity count after the current search/schema filter is applied. */
    FilteredEntityCount: number;
    /** Current free-text search term applied to the entity list (empty when none). */
    SearchText: string;
    /** Active schema filter applied to the entity list (empty when none). */
    SchemaFilter: string;
    /** ID of the entity whose detail panel is open, or null. */
    SelectedEntityId: string | null;
    /** Registered Name of the entity whose detail panel is open, or null. */
    SelectedEntityName: string | null;
    /** Display name of the selected entity (DisplayName, else prefix-stripped Name), or null. */
    SelectedEntityDisplayName: string | null;
    /** Schema of the selected entity, or null. */
    SelectedEntitySchema: string | null;
    /** Physical table name of the selected entity, or null. */
    SelectedEntityTable: string | null;
    /** User-defined field count of the selected entity, or null when not (yet) loaded. */
    SelectedEntityFieldCount: number | null;
    /**
     * Field summaries for the selected entity (name · type · nullability). Empty when
     * nothing is selected or detail hasn't loaded. The component supplies the full list;
     * this helper bounds it — see {@link DATABASE_DESIGNER_NAME_LIST_CAP}.
     */
    SelectedEntityFields: FieldSummary[];
    /**
     * Related-entity summaries for the selected entity (from EntityInfo.RelatedEntities).
     * Empty when nothing is selected. The component supplies the full list; this helper
     * bounds it — see {@link DATABASE_DESIGNER_NAME_LIST_CAP}.
     */
    RelatedEntities: RelatedEntitySummary[];
    /** Whether the entity detail (modify) panel is currently open. */
    ShowModifyPanel: boolean;
    /** Whether the accessible-entity list is currently loading. */
    IsLoading: boolean;
    /**
     * DISPLAY names of the entities currently visible in the designer (after the filter),
     * so the agent knows what's selectable via the SelectEntity / NavigateToEntityRecord
     * tools. The component supplies the full filtered list; this helper bounds it.
     */
    AvailableEntityNames: string[];
    /**
     * Schema-grouping summaries across the accessible entities. The component supplies the
     * full list; this helper bounds it — see {@link DATABASE_DESIGNER_NAME_LIST_CAP}.
     */
    SchemaGroups: SchemaGroupSummary[];
}

/**
 * Build the agent-visible context object for the Database Designer schema browser.
 *
 * Reports how the designer is currently scoped (total vs. filtered entity counts, whether a
 * filter is narrowing the set + the active filter values), what (if anything) is selected
 * (id + registered name + display name + schema + table + field count + a bounded field and
 * relationship summary), whether the detail panel is open, whether data is still loading,
 * the bounded available-entity DISPLAY-name list, and the schema-grouping landscape.
 * `HasSearch` / `HasActiveFilters` are derived so the agent can tell the user is looking at
 * a filtered subset without re-deriving it.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable and
 * decouples it from change-detection timing.
 *
 * @param input - the component's current browse-state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildDatabaseDesignerAgentContext(
    input: DatabaseDesignerAgentContextInput,
): Record<string, unknown> {
    const hasSearch = input.SearchText.trim().length > 0;
    const hasActiveFilters =
        hasSearch ||
        input.SchemaFilter.trim().length > 0 ||
        input.FilteredEntityCount < input.EntityCount;

    const context: Record<string, unknown> = {
        EntityCount: input.EntityCount,
        FilteredEntityCount: input.FilteredEntityCount,
        SearchText: input.SearchText,
        HasSearch: hasSearch,
        HasActiveFilters: hasActiveFilters,
        SelectedEntityId: input.SelectedEntityId,
        SelectedEntityName: input.SelectedEntityName,
        SelectedEntityDisplayName: input.SelectedEntityDisplayName,
        ShowModifyPanel: input.ShowModifyPanel,
        IsLoading: input.IsLoading,
        AvailableEntities: capNames(input.AvailableEntityNames),
    };

    if (input.AvailableEntityNames.length > DATABASE_DESIGNER_NAME_LIST_CAP) {
        context['AvailableEntityCount'] = input.AvailableEntityNames.length;
    }

    // Active schema filter — surfaced only when set, keeping the context lean.
    if (input.SchemaFilter.trim().length > 0) {
        context['SchemaFilter'] = input.SchemaFilter;
    }

    // Selected-entity detail — only when something is selected.
    if (input.SelectedEntityId) {
        if (input.SelectedEntitySchema) {
            context['SelectedEntitySchema'] = input.SelectedEntitySchema;
        }
        if (input.SelectedEntityTable) {
            context['SelectedEntityTable'] = input.SelectedEntityTable;
        }
        if (input.SelectedEntityFieldCount != null) {
            context['SelectedEntityFieldCount'] = input.SelectedEntityFieldCount;
        }
        if (input.SelectedEntityFields.length > 0) {
            context['SelectedEntityFields'] = input.SelectedEntityFields.slice(0, DATABASE_DESIGNER_NAME_LIST_CAP);
            if (input.SelectedEntityFields.length > DATABASE_DESIGNER_NAME_LIST_CAP) {
                context['SelectedEntityFieldsTruncated'] = true;
            }
        }
        if (input.RelatedEntities.length > 0) {
            context['RelatedEntities'] = input.RelatedEntities.slice(0, DATABASE_DESIGNER_NAME_LIST_CAP);
            context['RelatedEntityCount'] = input.RelatedEntities.length;
        }
    }

    // Schema-grouping landscape — bounded; companion count when over the cap.
    if (input.SchemaGroups.length > 0) {
        context['SchemaGroups'] = input.SchemaGroups.slice(0, DATABASE_DESIGNER_NAME_LIST_CAP);
        if (input.SchemaGroups.length > DATABASE_DESIGNER_NAME_LIST_CAP) {
            context['SchemaGroupCount'] = input.SchemaGroups.length;
        }
    }

    return context;
}
