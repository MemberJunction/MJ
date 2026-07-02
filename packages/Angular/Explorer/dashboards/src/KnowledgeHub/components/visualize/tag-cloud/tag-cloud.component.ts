/**
 * @fileoverview Knowledge Hub Tag Cloud (Visualize > Tag Cloud mode)
 *
 * Renders a weighted tag cloud via `@memberjunction/ng-word-cloud`'s
 * `MJWordCloudComponent`, driven by `TagCloudEngine.Instance.GetTagCloud(...)`.
 *
 * Provides a scope picker (Content Source / Content Type / Tag root) plus a
 * sizing control. Loads on init and whenever the scope changes. Emits a
 * `TagSelected` intent up to the host so the shared record-drilldown panel can
 * be populated by the host (this component never touches NavigationService).
 */

import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    OnInit,
    inject,
} from '@angular/core';
import { IMetadataProvider } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
    TagCloudEngine,
    TagCloudScope,
    TagCloudItem,
} from '@memberjunction/tag-engine-base';
import { TagEngineBase } from '@memberjunction/tag-engine-base';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { WordCloudItem, WordCloudItemEvent } from '@memberjunction/ng-word-cloud';

/** A selectable scope option (content source / content type / tag root). */
interface ScopeOption {
    ID: string;
    Name: string;
}

/**
 * Emitted when the user clicks a tag word. The host resolves this into the
 * shared drilldown panel (records carrying the tag).
 */
export interface TagCloudSelection {
    /** The clicked tag's text. */
    Tag: string;
    /** Raw frequency count carried from TagCloudItem. */
    Count: number;
    /** The scope currently applied (so the host can scope the drilldown query). */
    Scope: TagCloudScope;
}

@Component({
    standalone: false,
    selector: 'app-kh-tag-cloud',
    templateUrl: './tag-cloud.component.html',
    styleUrls: ['./tag-cloud.component.css'],
})
export class TagCloudComponent extends BaseAngularComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    /** Re-declared so the host can bind `[Provider]` and we thread it through. */
    @Input() override Provider: IMetadataProvider | null = null;

    /** Emitted when a tag word is clicked. */
    @Output() TagSelected = new EventEmitter<TagCloudSelection>();

    // ================================================================
    // State
    // ================================================================

    public IsLoading = true;
    public Items: WordCloudItem[] = [];

    /** Scope picker options. */
    public ContentSourceOptions: ScopeOption[] = [];
    public ContentTypeOptions: ScopeOption[] = [];
    public TagRootOptions: ScopeOption[] = [];

    /** Current scope selections (empty string = "All"). */
    public SelectedContentSourceID = '';
    public SelectedContentTypeID = '';
    public SelectedTagRootID = '';

    /** Sizing: maximum font size driven by weight. */
    public MaxFontSize = 56;
    public MinFontSize = 14;

    /** Color mode passed to the word cloud. */
    public ColorMode: 'brand' | 'categorical' | 'weight-gradient' = 'weight-gradient';

    // ================================================================
    // Lifecycle
    // ================================================================

    async ngOnInit(): Promise<void> {
        await this.loadScopeOptions();
        await this.LoadCloud();
    }

    // ================================================================
    // Public Methods
    // ================================================================

    /** Re-load the cloud for the current scope. Called on init + scope change. */
    public async LoadCloud(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        try {
            const scope = this.BuildScope();
            const provider = this.ProviderToUse;
            const items: TagCloudItem[] = await TagCloudEngine.Instance.GetTagCloud(
                scope,
                { Limit: 150, MinWeight: 0 },
                provider.CurrentUser,
                provider,
            );
            this.Items = items.map(item => this.toWordCloudItem(item));
        } catch (error) {
            console.error('[TagCloud] Error loading tag cloud:', error);
            this.Items = [];
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** Reload after any scope dropdown change. */
    public OnScopeChanged(): void {
        void this.LoadCloud();
    }

    /** Apply a new max font size (sizing-by-weight control). */
    public OnSizeChanged(value: number): void {
        this.MaxFontSize = value;
        this.cdr.detectChanges();
    }

    /** Clear all scope filters and reload. */
    public ClearScope(): void {
        this.SelectedContentSourceID = '';
        this.SelectedContentTypeID = '';
        this.SelectedTagRootID = '';
        void this.LoadCloud();
    }

    public get HasActiveScope(): boolean {
        return !!(this.SelectedContentSourceID || this.SelectedContentTypeID || this.SelectedTagRootID);
    }

    public get HasItems(): boolean {
        return this.Items.length > 0;
    }

    /** Word-cloud click handler — emits a selection up to the host. */
    public OnWordClicked(event: WordCloudItemEvent): void {
        const count = Number(event.Item.Metadata?.['Count'] ?? 0);
        this.TagSelected.emit({
            Tag: event.Item.Text,
            Count: count,
            Scope: this.BuildScope(),
        });
    }

    /** Build the current TagCloudScope from the picker selections. */
    public BuildScope(): TagCloudScope {
        const scope: TagCloudScope = {};
        if (this.SelectedContentSourceID) {
            scope.ContentSourceIDs = [this.SelectedContentSourceID];
        }
        if (this.SelectedContentTypeID) {
            scope.ContentTypeIDs = [this.SelectedContentTypeID];
        }
        if (this.SelectedTagRootID) {
            scope.TagRootIDs = [this.SelectedTagRootID];
        }
        return scope;
    }

    // ================================================================
    // Private Methods
    // ================================================================

    /** Map an engine TagCloudItem to a word-cloud WordCloudItem (Count → Metadata). */
    private toWordCloudItem(item: TagCloudItem): WordCloudItem {
        return {
            Text: item.Text,
            Weight: item.Weight,
            Metadata: { Count: item.Count },
        };
    }

    /** Populate scope-picker options from the KH + Tag engines. */
    private async loadScopeOptions(): Promise<void> {
        try {
            const provider = this.ProviderToUse;
            const khEngine = KnowledgeHubMetadataEngine.Instance;
            await khEngine.Config(false, provider.CurrentUser, provider);

            this.ContentSourceOptions = khEngine.ContentSources
                .map(s => ({ ID: s.ID, Name: s.Name ?? 'Untitled' }))
                .sort((a, b) => a.Name.localeCompare(b.Name));

            this.ContentTypeOptions = khEngine.ContentTypes
                .map(t => ({ ID: t.ID, Name: t.Name ?? 'Untitled' }))
                .sort((a, b) => a.Name.localeCompare(b.Name));

            const tagEngine = TagEngineBase.Instance;
            await tagEngine.Config(false, provider.CurrentUser, provider);
            this.TagRootOptions = tagEngine.Tags
                .filter(t => !t.ParentID)
                .map(t => ({ ID: t.ID, Name: t.DisplayName || t.Name }))
                .sort((a, b) => a.Name.localeCompare(b.Name));
        } catch (error) {
            console.warn('[TagCloud] Error loading scope options:', error);
        }
        this.cdr.detectChanges();
    }
}

/** Tree-shaking prevention */
export function LoadTagCloudComponent(): void {
    // Prevents tree-shaking of the component
}
