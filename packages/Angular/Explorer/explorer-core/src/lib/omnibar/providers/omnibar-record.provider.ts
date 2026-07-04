import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView, EntityInfo, IMetadataProvider, IRunViewProvider } from '@memberjunction/core';
import type { MentionSuggestion, ComposerSuggestionRequest } from '@memberjunction/ng-composer';
import { OmnibarProvider, OMNIBAR_NAV_KEY, OmnibarNavPayload } from '../omnibar-provider';

/** How many record rows the best-matching entity contributes. */
const MAX_RECORD_ROWS = 5;

/**
 * '#' — jump straight to a record. Two-phase within one query:
 *   1. Entity-name matches from metadata (grouped "Entities").
 *   2. Top records of the BEST-matching entity, searched by its name field
 *      (grouped "Matching records") — fail-soft per entity (RLS/permission errors
 *      simply yield no record rows).
 */
@RegisterClass(OmnibarProvider, 'omnibar-records')
export class OmnibarRecordProvider extends OmnibarProvider {
    public readonly TriggerChar = '#';
    public readonly Key = 'omnibar-records';
    public override readonly Priority = 50;
    public readonly ModeLabel = 'Jump to Record';
    public override readonly Placeholder = 'Entity or record name…';

    public async GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        const query = request.Query.trim().toLowerCase();
        const md: IMetadataProvider = request.Provider ?? Metadata.Provider;
        const matches = this.matchEntities(md.Entities, query);
        const suggestions: MentionSuggestion[] = matches.slice(0, 4).map((e) => this.entitySuggestion(e));
        if (matches.length > 0 && query.length > 0) {
            suggestions.push(...await this.recordSuggestions(matches[0], query, request));
        }
        return suggestions.slice(0, request.MaxResults);
    }

    /** Name-ranked entity matches: startsWith beats contains; empty query = none (avoid a 300-entity dump). */
    private matchEntities(entities: EntityInfo[], query: string): EntityInfo[] {
        if (query.length === 0) {
            return [];
        }
        const scored = entities
            .map((e) => {
                const name = e.Name.toLowerCase();
                const score = name === query ? 3 : name.startsWith(query) ? 2 : name.includes(query) ? 1 : 0;
                return { e, score };
            })
            .filter((x) => x.score > 0)
            .sort((a, b) => (b.score - a.score) || a.e.Name.localeCompare(b.e.Name));
        return scored.map((x) => x.e);
    }

    private entitySuggestion(entity: EntityInfo): MentionSuggestion {
        // Selecting an entity re-seeds the palette query rather than navigating —
        // handled by the palette via the absent nav payload + type 'entity'.
        return {
            type: 'entity',
            id: entity.ID,
            name: entity.Name,
            displayName: entity.Name,
            description: entity.Description ? entity.Description.substring(0, 120) : 'Entity',
            icon: entity.Icon || 'fa-solid fa-table',
            data: { group: 'Entities', entityName: entity.Name },
        };
    }

    /** Top records of one entity whose name field matches the query. Fail-soft. */
    private async recordSuggestions(entity: EntityInfo, query: string, request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        const nameField = entity.NameField;
        if (!nameField) {
            return [];
        }
        try {
            const escaped = query.replace(/'/g, "''");
            const rv = request.Provider ? RunView.FromMetadataProvider(request.Provider) : new RunView();
            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: entity.Name,
                ExtraFilter: `${nameField.Name} LIKE '%${escaped}%'`,
                Fields: [entity.FirstPrimaryKey.Name, nameField.Name],
                OrderBy: nameField.Name,
                MaxRows: MAX_RECORD_ROWS,
                ResultType: 'simple',
            }, request.ContextUser ?? undefined);
            if (!result.Success) {
                return [];
            }
            return result.Results.map((row) => {
                const recordId = String(row[entity.FirstPrimaryKey.Name]);
                const name = String(row[nameField.Name] ?? recordId);
                const nav: OmnibarNavPayload = { kind: 'record', entityName: entity.Name, recordId };
                return {
                    type: 'record',
                    id: `${entity.Name}:${recordId}`,
                    name,
                    displayName: name,
                    description: entity.Name,
                    icon: 'fa-solid fa-id-card',
                    data: { [OMNIBAR_NAV_KEY]: nav, group: 'Matching records' },
                } satisfies MentionSuggestion;
            });
        } catch {
            return [];
        }
    }
}

/** Tree-shaking guard — referenced by LoadOmnibarProviders(). */
export function LoadOmnibarRecordProvider(): void {
    // intentional no-op
}
