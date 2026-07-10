import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata, RunView, EntityInfo, IMetadataProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
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
    // Placeholder doubles as syntax education — the two-phase '#<entity> <record>'
    // pattern wasn't discoverable from a generic hint (design-review finding).
    public override readonly Placeholder = 'Type an entity, then a record — e.g. #accounts acme';

    /**
     * Bare '#' empty state: the user's recently OPENED records (from the
     * UserInfoEngine's cached 'MJ: User Record Logs'), newest first. Previously
     * this returned nothing — deliberate (avoid a full-entity dump) but it read
     * as "no results / broken" in the design review. Fail-soft throughout:
     * any error just yields an empty list, never blocks the palette.
     */
    public override async EmptyStateSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        try {
            const md: IMetadataProvider = request.Provider ?? Metadata.Provider;
            const user = request.ContextUser ?? md.CurrentUser;
            const engine = UserInfoEngine.Instance;
            await engine.Config(false, user ?? undefined); // no-op when already loaded
            const logs = [...engine.UserRecordLogs]
                .sort((a, b) => new Date(b.LatestAt).getTime() - new Date(a.LatestAt).getTime())
                .slice(0, request.MaxResults);
            if (logs.length === 0) {
                return [];
            }
            const names = await this.resolveRecordNames(
                md,
                logs.map((l) => ({ entityName: l.Entity, recordId: l.RecordID })),
                user ?? undefined,
            );
            return logs.map((log) => {
                const nav: OmnibarNavPayload = { kind: 'record', entityName: log.Entity, recordId: log.RecordID };
                const display = names.get(`${log.Entity}||${log.RecordID}`) ?? log.RecordID;
                return {
                    type: 'record',
                    id: `recent-record:${log.Entity}:${log.RecordID}`,
                    name: display,
                    displayName: display,
                    description: log.Entity,
                    icon: 'fa-solid fa-clock-rotate-left',
                    data: { [OMNIBAR_NAV_KEY]: nav, group: 'Recently opened' },
                } satisfies MentionSuggestion;
            });
        } catch {
            return [];
        }
    }

    /** Batch display-name lookup; entries that fail resolve to absent (caller falls back to the ID). */
    private async resolveRecordNames(
        md: IMetadataProvider,
        targets: Array<{ entityName: string; recordId: string }>,
        user?: UserInfo,
    ): Promise<Map<string, string>> {
        const resolved = new Map<string, string>();
        try {
            const inputs = targets.map((t) => ({ EntityName: t.entityName, CompositeKey: CompositeKey.FromID(t.recordId) }));
            const results = await md.GetEntityRecordNames(inputs, user);
            for (const r of results ?? []) {
                if (r.Success && r.RecordName) {
                    resolved.set(`${r.EntityName}||${r.CompositeKey.GetValueByIndex(0)}`, r.RecordName);
                }
            }
        } catch {
            // name lookup is cosmetic — IDs are an acceptable fallback
        }
        return resolved;
    }

    public async GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        const query = request.Query.trim().toLowerCase();
        const md: IMetadataProvider = request.Provider ?? Metadata.Provider;
        const matches = this.matchEntities(md.Entities, query);
        const suggestions: MentionSuggestion[] = matches.slice(0, 4).map((e) => this.entitySuggestion(e));
        if (matches.length > 0 && query.length > 0) {
            // Record term = the query MINUS the matched entity name when the query leads
            // with it ('#mj: ai agents amanda' → term 'amanda'); an exact entity-name
            // query lists the entity's top records (empty term = browse).
            const best = matches[0];
            const bestName = best.Name.toLowerCase();
            const term = query.startsWith(bestName) ? query.substring(bestName.length).trim() : query;
            suggestions.push(...await this.recordSuggestions(best, term, request));
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
        // Enter/click on an entity row NAVIGATES: opens the entity's dynamic list view.
        // Drilling into records happens by TYPING ('#<entity name> <record term>').
        const nav: OmnibarNavPayload = { kind: 'entity-list', entityName: entity.Name };
        return {
            type: 'entity',
            id: entity.ID,
            name: entity.Name,
            displayName: entity.Name,
            description: entity.Description ? entity.Description.substring(0, 120) : 'Entity — open list view',
            icon: entity.Icon || 'fa-solid fa-table',
            data: { [OMNIBAR_NAV_KEY]: nav, group: 'Entities', entityName: entity.Name },
        };
    }

    /** Top records of one entity whose name field matches the query. Fail-soft. */
    private async recordSuggestions(entity: EntityInfo, term: string, request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        const nameField = entity.NameField;
        if (!nameField) {
            return [];
        }
        try {
            const escaped = term.replace(/'/g, "''");
            const rv = request.Provider ? RunView.FromMetadataProvider(request.Provider) : new RunView();
            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: entity.Name,
                ExtraFilter: escaped.length > 0 ? `${nameField.Name} LIKE '%${escaped}%'` : '',
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
