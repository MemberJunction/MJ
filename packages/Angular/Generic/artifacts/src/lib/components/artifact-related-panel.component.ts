/**
 * @fileoverview `<mj-artifact-related-panel>` — what a document is connected to in the semantic graph:
 * the records it links to (durable record-mention tokens), the records that link to it, and the records related to it
 * through concepts they share.
 *
 * An L2 composite widget: it reads through the bound provider as the current user and emits what the
 * person picked; the host decides how to open it. Every relation comes from {@link LoadRecordRelations},
 * which applies the graph's per-viewer checks, so nothing the viewer cannot open is listed.
 */
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { LogError } from '@memberjunction/core';
import { GraphEngine, LoadRecordRelations, type RecordRelations, type RelatedRecord } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';

const ARTIFACTS_ENTITY = 'MJ: Artifacts';

/** A related record the person picked. */
export interface ArtifactRelatedSelection {
    EntityName: string;
    RecordID: string;
}

interface RelationSection {
    Key: 'links' | 'backlinks' | 'related';
    Title: string;
    Icon: string;
    Items: RelatedRecord[];
}

@Component({
    standalone: true,
    selector: 'mj-artifact-related-panel',
    imports: [SharedGenericModule, MJEmptyStateComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-related" data-testid="artifact-related-panel">
            @if (IsLoading) {
                <mj-loading text="Finding related documents..." size="small"></mj-loading>
            } @else if (ErrorMessage) {
                <mj-empty-state Icon="fa-solid fa-triangle-exclamation" Title="Related documents could not be loaded" [Message]="ErrorMessage" Size="compact" />
            } @else if (IsEmpty) {
                <mj-empty-state
                    Icon="fa-solid fa-diagram-project"
                    Title="Nothing related yet"
                    Message="Type [[ in the editor to link another document, or keep writing: documents that share concepts appear here once they are indexed."
                    Size="compact" />
            } @else {
                @for (section of Sections; track section.Key) {
                    @if (section.Items.length > 0) {
                        <section class="mj-related__section" [attr.data-testid]="'related-section-' + section.Key">
                            <h4 class="mj-related__title"><i [class]="section.Icon"></i> {{ section.Title }} <span class="mj-related__count">{{ section.Items.length }}</span></h4>
                            @for (item of section.Items; track item.Node.Key) {
                                <button type="button" class="mj-related__item" (click)="Select(item)" [title]="item.Node.Description ?? item.Node.Label">
                                    <span class="mj-related__label">{{ item.Node.Label }}</span>
                                    @if (section.Key === 'related') {
                                        <span class="mj-related__meta">{{ item.SharedConceptCount }} shared concept{{ item.SharedConceptCount === 1 ? '' : 's' }}</span>
                                    } @else if (item.Node.EntityName !== ArtifactsEntity) {
                                        <span class="mj-related__meta">{{ item.Node.EntityName }}</span>
                                    }
                                    <i class="fa-solid fa-arrow-right mj-related__go"></i>
                                </button>
                            }
                        </section>
                    }
                }
            }
        </div>
    `,
    styles: [
        `
            :host { display: block; }
            .mj-related { display: flex; flex-direction: column; gap: 16px; padding: 12px 16px; }
            .mj-related__title { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 13px; font-weight: 600; color: var(--mj-text-secondary); }
            .mj-related__count { margin-left: auto; font-weight: 500; color: var(--mj-text-muted); }
            .mj-related__item {
                display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; margin: 0 0 4px;
                border: 1px solid var(--mj-border-subtle); border-radius: 6px; background: var(--mj-bg-surface);
                color: var(--mj-text-primary); text-align: left; cursor: pointer; font: inherit;
            }
            .mj-related__item:hover { background: var(--mj-bg-surface-hover); border-color: var(--mj-border-default); }
            .mj-related__item:focus-visible { outline: 2px solid var(--mj-border-focus); outline-offset: 1px; }
            .mj-related__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .mj-related__meta { font-size: 12px; color: var(--mj-text-muted); white-space: nowrap; }
            .mj-related__go { font-size: 11px; color: var(--mj-text-disabled); }
        `,
    ],
})
export class ArtifactRelatedPanelComponent extends BaseAngularComponent implements OnInit {
    private readonly cdr = inject(ChangeDetectorRef);
    private _artifactId: string | null = null;
    private loadToken = 0;
    /** Set in `ngOnInit`, once every input (`Provider` included) is bound, whatever their order. */
    private initialized = false;

    /** The artifact whose relations are shown. Changing it after init reloads. */
    @Input()
    set ArtifactId(value: string | null) {
        const changed = value !== this._artifactId;
        this._artifactId = value;
        if (changed && this.initialized) {
            void this.load();
        }
    }
    get ArtifactId(): string | null {
        return this._artifactId;
    }

    /** The person picked a related artifact. */
    @Output() OpenArtifact = new EventEmitter<string>();
    /** The person picked a related record that is not an artifact. */
    @Output() OpenRecord = new EventEmitter<ArtifactRelatedSelection>();

    public readonly ArtifactsEntity = ARTIFACTS_ENTITY;
    public IsLoading = false;
    public ErrorMessage: string | null = null;
    public Sections: RelationSection[] = [];

    public ngOnInit(): void {
        this.initialized = true;
        void this.load();
    }

    public get IsEmpty(): boolean {
        return this.Sections.every((s) => s.Items.length === 0);
    }

    public Select(item: RelatedRecord): void {
        if (item.Node.EntityName === ARTIFACTS_ENTITY) {
            this.OpenArtifact.emit(item.Node.RecordID);
        } else {
            this.OpenRecord.emit({ EntityName: item.Node.EntityName, RecordID: item.Node.RecordID });
        }
    }

    private async load(): Promise<void> {
        const token = ++this.loadToken;
        const artifactId = this._artifactId;
        this.Sections = [];
        this.ErrorMessage = null;
        if (!artifactId) {
            this.IsLoading = false;
            this.cdr.markForCheck();
            return;
        }
        this.IsLoading = true;
        this.cdr.markForCheck();
        try {
            const relations = await this.readRelations(artifactId);
            if (token === this.loadToken) {
                this.Sections = toSections(relations);
            }
        } catch (error) {
            LogError(`ArtifactRelatedPanelComponent: loading relations of artifact ${artifactId} failed: ${error instanceof Error ? error.message : String(error)}`);
            if (token === this.loadToken) {
                this.ErrorMessage = error instanceof Error ? error.message : String(error);
            }
        } finally {
            if (token === this.loadToken) {
                this.IsLoading = false;
                this.cdr.markForCheck();
            }
        }
    }

    private async readRelations(artifactId: string): Promise<RecordRelations> {
        const provider = this.ProviderToUse;
        const user = provider.CurrentUser;
        const engine = GraphEngine.GetProviderInstance<GraphEngine>(provider, GraphEngine) as GraphEngine;
        await engine.Config(false, user, provider);
        return LoadRecordRelations(engine, { EntityName: ARTIFACTS_ENTITY, RecordID: artifactId }, user, { Provider: provider });
    }
}

function toSections(relations: RecordRelations): RelationSection[] {
    return [
        { Key: 'links', Title: 'Links to', Icon: 'fa-solid fa-arrow-up-right-from-square', Items: relations.Links },
        { Key: 'backlinks', Title: 'Linked from', Icon: 'fa-solid fa-arrow-turn-down', Items: relations.Backlinks },
        { Key: 'related', Title: 'Related by concepts', Icon: 'fa-solid fa-diagram-project', Items: relations.Related },
    ];
}
