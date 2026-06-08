/**
 * @fileoverview Classify · Content Types tab.
 *
 * Self-contained sub-page: owns its header-interior and the content-type cards
 * grid. Receives the shared raw data needed to build the cards from the host
 * orchestrator (content types, sources, items, and the accurate total item
 * count). The slide-in CRUD form stays in the host — this tab emits
 * Add/Edit intents up via @Output and the host opens its existing form.
 */
import { Component, ChangeDetectorRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ContentTypeCard } from '../shared/classify.types';
import { formatNumber } from '../shared/classify.format';

@Component({
    standalone: false,
    selector: 'classify-types-tab',
    templateUrl: './types-tab.component.html',
    styleUrls: ['./types-tab.component.css']
})
export class ClassifyTypesTabComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** Shown while a manual Refresh() recomputes the content-type cards. */
    public IsLoading = false;

    /** Raw `MJ: Content Types` rows — the primary source for the cards. */
    private _contentTypes: Record<string, unknown>[] = [];
    @Input()
    set ContentTypes(value: Record<string, unknown>[]) {
        this._contentTypes = value ?? [];
        this.rebuild();
    }
    get ContentTypes(): Record<string, unknown>[] {
        return this._contentTypes;
    }

    /** Raw `MJ: Content Sources` rows — used to count sources per content type. */
    private _sources: Record<string, unknown>[] = [];
    @Input()
    set Sources(value: Record<string, unknown>[]) {
        this._sources = value ?? [];
        this.rebuild();
    }
    get Sources(): Record<string, unknown>[] {
        return this._sources;
    }

    /** Raw `MJ: Content Items` rows — used to count items per content type. */
    private _items: Record<string, unknown>[] = [];
    @Input()
    set Items(value: Record<string, unknown>[]) {
        this._items = value ?? [];
        this.rebuild();
    }
    get Items(): Record<string, unknown>[] {
        return this._items;
    }

    /** Accurate total item count from TotalRowCount (used when a single content type exists). */
    private _totalItemCount = 0;
    @Input()
    set TotalItemCount(value: number) {
        this._totalItemCount = value ?? 0;
        this.rebuild();
    }
    get TotalItemCount(): number {
        return this._totalItemCount;
    }

    public ContentTypeCards: ContentTypeCard[] = [];

    /** Template-facing formatter (exposed so `formatNumber(...)` resolves in the view). */
    public readonly formatNumber = formatNumber;

    /** Bubble Add/Edit intents to the host, which owns the slide-in CRUD form. */
    @Output() AddTypeRequested = new EventEmitter<void>();
    @Output() EditTypeRequested = new EventEmitter<ContentTypeCard>();

    /**
     * Recompute the content-type cards from the current host-supplied inputs. The
     * data is host-owned (flows in via @Input); Refresh rebuilds the view models
     * and surfaces a brief loading state for user feedback.
     */
    public async Refresh(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();
        this.rebuild();
        this.IsLoading = false;
        this.cdr.detectChanges();
    }

    public onAddType(): void {
        this.AddTypeRequested.emit();
    }

    public onEditType(card: ContentTypeCard): void {
        this.EditTypeRequested.emit(card);
    }

    /** Rebuild the card view models from the current inputs. */
    private rebuild(): void {
        const sourcesUsingByType = this.countSourcesByContentType();
        // When items are capped by MaxRows, countItemsByContentType undercounts.
        // For a single content type, use the accurate TotalItemCount.
        const singleType = this._contentTypes.length === 1;
        const itemsByType = singleType ? null : this.countItemsByContentType();

        this.ContentTypeCards = this._contentTypes.map(ct => {
            const id = ct['ID'] as string;
            const minTags = (ct['MinTags'] as number) ?? 1;
            const maxTags = (ct['MaxTags'] as number) ?? 10;
            const range = 15; // max possible
            return {
                ID: id,
                Name: (ct['Name'] as string) ?? 'Unnamed',
                Description: (ct['Description'] as string) ?? '',
                AIModelName: (ct['AIModel'] as string) ?? 'Default Model',
                AIModelID: (ct['AIModelID'] as string) ?? '',
                MinTags: minTags,
                MaxTags: maxTags,
                SourcesUsing: sourcesUsingByType.get(id) ?? 0,
                ItemsTagged: singleType ? this._totalItemCount : (itemsByType!.get(id) ?? 0),
                RangeLeftPct: Math.round((minTags / range) * 100),
                RangeRightPct: Math.round(100 - (maxTags / range) * 100),
                EmbeddingModelID: (ct['EmbeddingModelID'] as string) ?? '',
                VectorIndexID: (ct['VectorIndexID'] as string) ?? ''
            };
        });
    }

    private countSourcesByContentType(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const source of this._sources) {
            const typeId = source['ContentTypeID'] as string;
            if (typeId) counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
        }
        return counts;
    }

    private countItemsByContentType(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const item of this._items) {
            const typeId = item['ContentTypeID'] as string;
            if (typeId) counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
        }
        return counts;
    }
}
