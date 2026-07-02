/**
 * @fileoverview Classify · Seed-taxonomy review.
 *
 * Calls the server-side `GenerateSeedTaxonomy` GraphQL mutation (which samples a
 * source's content and proposes a tag tree), renders the proposal as a checkbox
 * tree with inline rename, and — on Accept — persists the selected nodes as
 * `MJ: Tags` (parent/child wired via ParentID). Used standalone on the Tags /
 * Taxonomy area and embedded inside the setup wizard's Taxonomy step.
 *
 * The mutation is invoked through the first-class transport helper
 * `GraphQLClassifyClient` (constructed from the threaded `ProviderToUse`,
 * narrowed to the concrete `GraphQLDataProvider` it is at runtime), which
 * returns a strongly-typed `SeedTaxonomyResult` — no inline GraphQL or manual
 * JSON parsing in the component.
 */
import { Component, ChangeDetectorRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJTagEntity } from '@memberjunction/core-entities';
import { TagEngineBase } from '@memberjunction/tag-engine-base';
import {
    GraphQLClassifyClient,
    GraphQLDataProvider,
    SeedTaxonomyNode as SeedTaxonomyNodeDTO,
} from '@memberjunction/graphql-dataprovider';

/** Editable view-model node — adds selection + rename + a stable key for tracking. */
export interface SeedTaxonomyNode {
    Key: string;
    Name: string;
    Description?: string;
    MemberCount?: number;
    Selected: boolean;
    Renaming: boolean;
    Depth: number;
    Children: SeedTaxonomyNode[];
}

@Component({
    standalone: false,
    selector: 'classify-seed-taxonomy',
    templateUrl: './classify-seed-taxonomy.component.html',
    styleUrls: ['./classify-seed-taxonomy.component.css']
})
export class ClassifySeedTaxonomyComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** The content source to sample for the taxonomy proposal. */
    @Input() SourceID: string | null = null;
    /** How many items to sample (passed to the mutation). */
    @Input() SampleSize = 50;
    /** Optional parent tag ID under which accepted root nodes are created. */
    @Input() ParentTagID: string | null = null;

    /** Emitted after Accept persists tags, with the count created. */
    @Output() Accepted = new EventEmitter<{ Created: number }>();

    public IsGenerating = false;
    public IsAccepting = false;
    public ProposedNodes: SeedTaxonomyNode[] = [];
    public HasGenerated = false;
    public LastMethod: string | null = null;
    public LastSampleSize: number | null = null;

    private keySeq = 0;

    /** True when at least one node is checked. */
    public get HasSelection(): boolean {
        return this.countSelected(this.ProposedNodes) > 0;
    }

    /** Count of currently-selected nodes (template-facing). */
    public get SelectedCount(): number {
        return this.countSelected(this.ProposedNodes);
    }

    private countSelected(nodes: SeedTaxonomyNode[]): number {
        let n = 0;
        for (const node of nodes) {
            if (node.Selected) n++;
            n += this.countSelected(node.Children);
        }
        return n;
    }

    /** Call the GenerateSeedTaxonomy mutation and render the proposal. */
    public async Generate(): Promise<void> {
        if (this.IsGenerating) return;
        if (!this.SourceID) {
            MJNotificationService.Instance.CreateSimpleNotification('Select a source first.', 'warning', 3000);
            return;
        }
        this.IsGenerating = true;
        this.cdr.detectChanges();

        try {
            const client = new GraphQLClassifyClient(this.ProviderToUse as GraphQLDataProvider);
            const result = await client.GenerateSeedTaxonomy({
                SourceID: this.SourceID,
                SampleSize: this.SampleSize,
            });

            if (!result.Success) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to generate taxonomy: ${result.ErrorMessage ?? 'Unknown error'}`, 'error', 5000
                );
                return;
            }

            this.LastMethod = result.Method ?? null;
            this.LastSampleSize = result.SampleSize;
            this.ProposedNodes = this.toViewModel(result.Nodes, 0);
            this.HasGenerated = true;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.IsGenerating = false;
            this.cdr.detectChanges();
        }
    }

    private toViewModel(nodes: SeedTaxonomyNodeDTO[], depth: number): SeedTaxonomyNode[] {
        return nodes.map(n => ({
            Key: `n${this.keySeq++}`,
            Name: n.Name ?? '(unnamed)',
            Description: n.Description,
            MemberCount: n.MemberCount,
            Selected: true,
            Renaming: false,
            Depth: depth,
            Children: this.toViewModel(n.Children ?? [], depth + 1),
        }));
    }

    // ── Tree interactions ──

    /** Toggle a node's selection, cascading to descendants. */
    public ToggleNode(node: SeedTaxonomyNode): void {
        const next = !node.Selected;
        this.setSelectedRecursive(node, next);
        this.cdr.detectChanges();
    }

    private setSelectedRecursive(node: SeedTaxonomyNode, value: boolean): void {
        node.Selected = value;
        for (const child of node.Children) this.setSelectedRecursive(child, value);
    }

    public StartRename(node: SeedTaxonomyNode): void {
        node.Renaming = true;
        this.cdr.detectChanges();
    }

    public CommitRename(node: SeedTaxonomyNode, value: string): void {
        const trimmed = value.trim();
        if (trimmed) node.Name = trimmed;
        node.Renaming = false;
        this.cdr.detectChanges();
    }

    /** Flatten the visible tree for the template (depth-first), preserving order. */
    public get FlatNodes(): SeedTaxonomyNode[] {
        const out: SeedTaxonomyNode[] = [];
        const walk = (nodes: SeedTaxonomyNode[]) => {
            for (const n of nodes) {
                out.push(n);
                walk(n.Children);
            }
        };
        walk(this.ProposedNodes);
        return out;
    }

    // ── Accept → persist as MJ: Tags ──

    /**
     * Persist every selected node as an `MJ: Tags` record. Parent/child links use
     * ParentID; root nodes use the optional ParentTagID input. Walks the tree
     * top-down so a parent's saved ID is available when creating its children.
     */
    public async AcceptSelected(): Promise<void> {
        if (this.IsAccepting) return;
        if (!this.HasSelection) {
            MJNotificationService.Instance.CreateSimpleNotification('Select at least one tag to accept.', 'warning', 3000);
            return;
        }
        this.IsAccepting = true;
        this.cdr.detectChanges();

        let created = 0;
        try {
            const p = this.ProviderToUse;
            const persistLevel = async (nodes: SeedTaxonomyNode[], parentID: string | null): Promise<void> => {
                for (const node of nodes) {
                    let savedID: string | null = parentID;
                    if (node.Selected) {
                        const tag = await p.GetEntityObject<MJTagEntity>('MJ: Tags', p.CurrentUser);
                        tag.NewRecord();
                        tag.Name = node.Name;
                        tag.DisplayName = node.Name;
                        if (node.Description) tag.Description = node.Description;
                        tag.ParentID = parentID;
                        tag.Status = 'Active';
                        const ok = await tag.Save();
                        if (ok) {
                            created++;
                            savedID = tag.ID;
                        } else {
                            const detail = tag.LatestResult?.CompleteMessage ?? 'Unknown error';
                            MJNotificationService.Instance.CreateSimpleNotification(
                                `Failed to save tag "${node.Name}": ${detail}`, 'error', 5000
                            );
                            // Children still attach to the original parent so the tree isn't orphaned.
                            savedID = parentID;
                        }
                    }
                    // Recurse: children of an unselected node attach to the nearest selected ancestor.
                    await persistLevel(node.Children, savedID);
                }
            };

            await persistLevel(this.ProposedNodes, this.ParentTagID);

            // Refresh the tag cache so other views see the new tags.
            await TagEngineBase.Instance.Config(true, p.CurrentUser, p);

            MJNotificationService.Instance.CreateSimpleNotification(
                `Created ${created} tag${created === 1 ? '' : 's'}`, 'success', 3000
            );
            this.Accepted.emit({ Created: created });
            this.ProposedNodes = [];
            this.HasGenerated = false;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.IsAccepting = false;
            this.cdr.detectChanges();
        }
    }
}
