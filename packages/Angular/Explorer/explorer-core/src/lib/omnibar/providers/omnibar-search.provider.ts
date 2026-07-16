import { RegisterClass } from '@memberjunction/global';
import type { MentionSuggestion, ComposerSuggestionRequest } from '@memberjunction/ng-composer';
import type { SearchResultItem } from '@memberjunction/ng-search';
import { OmnibarProvider, OMNIBAR_NAV_KEY, OmnibarNavPayload } from '../omnibar-provider';

/** Icon per cross-source result type (matches the Search Results page vocabulary). */
function iconForResult(item: SearchResultItem): string {
    switch (item.ResultType) {
        case 'storage-file': return 'fa-solid fa-file-lines';
        case 'content-item': return 'fa-solid fa-newspaper';
        default: return 'fa-solid fa-id-card';
    }
}

/** Group label per result type — drives the palette's section headers. */
function groupForResult(item: SearchResultItem): string {
    switch (item.ResultType) {
        case 'storage-file': return 'Files';
        case 'content-item': return 'Content';
        default: return 'Records';
    }
}

/**
 * The omnibar's DEFAULT mode (empty TriggerChar): plain text = the same
 * cross-source search that backs the Search Results page (vectors + full-text +
 * entities + storage), served through `SearchService.PreviewSearch`. Always appends
 * a trailing "See all results" suggestion that opens the full Search workspace.
 */
@RegisterClass(OmnibarProvider, 'omnibar-search')
export class OmnibarSearchProvider extends OmnibarProvider {
    public readonly TriggerChar = '';
    public readonly Key = 'omnibar-search';
    public override readonly Priority = 100;
    public readonly ModeLabel = 'Global Search';
    public override readonly Placeholder = 'Search everything — or type #, /, @ …';

    public async GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
        const search = this.context.Search;
        const query = request.Query.trim();
        if (!search || query.length === 0) {
            return [];
        }
        try {
            const response = await search.PreviewSearch(query, Math.max(1, request.MaxResults - 1));
            const suggestions = (response.Success ? response.Results : []).map((item) => this.toSuggestion(item));
            suggestions.push(this.seeAllSuggestion(query));
            return suggestions;
        } catch {
            // Fail soft — the palette still offers the full-search escape hatch.
            return [this.seeAllSuggestion(query)];
        }
    }

    private toSuggestion(item: SearchResultItem): MentionSuggestion {
        const isFile = item.ResultType === 'storage-file';
        const nav: OmnibarNavPayload = isFile
            ? { kind: 'file', fileName: item.Title, rawMetadata: item.RawMetadata }
            : { kind: 'record', entityName: item.EntityName, recordId: item.RecordID };
        return {
            type: groupForResult(item).toLowerCase(),
            id: `${item.EntityName}:${item.RecordID}`,
            name: item.Title,
            displayName: item.Title,
            description: item.Snippet || item.EntityName,
            icon: iconForResult(item),
            data: {
                [OMNIBAR_NAV_KEY]: nav,
                group: groupForResult(item),
                score: item.Score,
            },
        };
    }

    private seeAllSuggestion(query: string): MentionSuggestion {
        const nav: OmnibarNavPayload = { kind: 'search', query };
        return {
            type: 'see-all',
            id: `see-all:${query}`,
            name: `See all results for “${query}”`,
            displayName: `See all results for “${query}”`,
            description: 'Opens the full Search Results workspace with scopes & relevance controls',
            icon: 'fa-solid fa-arrow-right',
            data: { [OMNIBAR_NAV_KEY]: nav, group: '' },
        };
    }
}

/** Tree-shaking guard — referenced by LoadOmnibarProviders(). */
export function LoadOmnibarSearchProvider(): void {
    // intentional no-op
}
