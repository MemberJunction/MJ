import { Component } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { nodeFields, nodeFromRow, type RubricNodeSnapshot, type RubricScaleSnapshot, type RubricVersionSnapshot } from '@memberjunction/ng-rubrics';
import { MJRubricEntity } from '@memberjunction/core-entities';
import { MJRubricFormComponent } from '../../generated/Entities/MJRubric/mjrubric.form.component';

/**
 * Rubric form. Loads the draft version and its criteria, hosts the author,
 * the diff, and the publish dialog, and saves what they emit.
 */
@RegisterClass(BaseFormComponent, 'MJ: Rubrics')
@Component({
    standalone: false,
    selector: 'mj-rubric-form',
    templateUrl: './rubric-form.component.html',
    styleUrls: ['./rubric-form.component.css'],
})
export class MJRubricFormComponentExtended extends MJRubricFormComponent {
    public override record!: MJRubricEntity;
    public Loading = true;
    public Nodes: RubricNodeSnapshot[] = [];
    public Scales: RubricScaleSnapshot[] = [];
    public Versions: Record<string, unknown>[] = [];
    public DraftId: string | null = null;
    public BaseVersion: RubricVersionSnapshot | null = null;
    public DraftVersion: RubricVersionSnapshot | null = null;
    public RequestedBump: 'Major' | 'Minor' | 'Patch' | null = null;
    public Summary = '';
    public Message = '';

    public override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        await this.LoadWorkspace();
    }

    public async LoadWorkspace(): Promise<void> {
        this.Loading = true;
        try {
            const rows = await this.rows('MJ: Rubric Versions', `RubricID='${this.record.ID}'`);
            this.Versions = rows;
            const draft = rows.find(row => row.Status === 'Draft') ?? null;
            this.DraftId = draft ? String(draft.ID) : null;
            if (draft) {
                const criteria = await this.rows('MJ: Rubric Criteria', `RubricVersionID='${draft.ID}'`);
                this.Nodes = criteria.map(nodeFromRow);
                this.DraftVersion = this.snapshot(draft, this.Nodes);
                const baseId = draft.BasedOnVersionID ? String(draft.BasedOnVersionID) : null;
                const base = baseId ? rows.find(row => String(row.ID) === baseId) : null;
                if (base) {
                    const baseNodes = (await this.rows('MJ: Rubric Criteria', `RubricVersionID='${base.ID}'`)).map(nodeFromRow);
                    this.BaseVersion = this.snapshot(base, baseNodes);
                }
            }
            const scales = await this.rows('MJ: Rubric Scales', '1=1');
            this.Scales = scales.map(row => ({ id: String(row.ID), scaleType: 'Levels' as const, higherIsBetter: true, levels: [] }));
        } finally {
            this.Loading = false;
        }
    }

    public async OnNodes(nodes: RubricNodeSnapshot[]): Promise<void> {
        this.Nodes = nodes;
        if (!this.DraftId) return;
        const saved = await this.rows('MJ: Rubric Criteria', `RubricVersionID='${this.DraftId}'`);
        const known = new Set(saved.map(row => String(row.ID)));
        for (const node of nodes) {
            const fields = nodeFields(node);
            if (known.has(node.id)) {
                const row = await this.ProviderToUse.GetEntityObject('MJ: Rubric Criteria', this.ProviderToUse.CurrentUser);
                await row.InnerLoad(CompositeKey.FromID(node.id));
                for (const [name, value] of Object.entries(fields)) row.Set(name, value);
                await row.Save();
            } else {
                const row = await this.ProviderToUse.GetEntityObject('MJ: Rubric Criteria', this.ProviderToUse.CurrentUser);
                row.NewRecord();
                row.Set('RubricVersionID', this.DraftId);
                for (const [name, value] of Object.entries(fields)) row.Set(name, value);
                await row.Save();
            }
        }
        if (this.DraftVersion) this.DraftVersion = { ...this.DraftVersion, nodes };
    }

    public async OnPublish(event: { bump: string | null; summary: string }): Promise<void> {
        if (!this.DraftId) return;
        const version = await this.ProviderToUse.GetEntityObject('MJ: Rubric Versions', this.ProviderToUse.CurrentUser);
        await version.InnerLoad(CompositeKey.FromID(this.DraftId));
        (version as unknown as { RequestedBump?: string | null; ChangeSummary?: string }).RequestedBump = event.bump;
        (version as unknown as { ChangeSummary?: string }).ChangeSummary = event.summary;
        version.Set('Status', 'Published');
        const ok = await version.Save();
        this.Message = ok ? 'Published.' : (version.LatestResult?.Message ?? 'Publish failed.');
        await this.LoadWorkspace();
    }

    private snapshot(row: Record<string, unknown>, nodes: RubricNodeSnapshot[]): RubricVersionSnapshot {
        return {
            id: String(row.ID),
            rubricId: String(row.RubricID),
            majorVersion: row.MajorVersion == null ? null : Number(row.MajorVersion),
            minorVersion: row.MinorVersion == null ? null : Number(row.MinorVersion),
            patchVersion: row.PatchVersion == null ? null : Number(row.PatchVersion),
            instructions: row.Instructions == null ? null : String(row.Instructions),
            notApplicablePolicy: 'ExcludeAndRedistribute',
            scoreDisplayMin: 0,
            scoreDisplayMax: 100,
            nodes,
            scales: this.Scales,
            bands: [],
        };
    }

    private async rows(entityName: string, filter: string): Promise<Record<string, unknown>[]> {
        const view = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await view.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple', MaxRows: 500 }, this.ProviderToUse.CurrentUser);
        return (result.Results ?? []) as Record<string, unknown>[];
    }
}
