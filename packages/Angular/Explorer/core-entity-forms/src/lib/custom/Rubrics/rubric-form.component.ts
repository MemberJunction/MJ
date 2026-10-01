import { Component } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { bandFromRow, nodeFromRow, planBandSave, planNodeSave, publishPreview, scaleFromRow, type RubricBandSnapshot, type RubricNodeSnapshot, type RubricScaleSnapshot, type RubricVersionSnapshot } from '@memberjunction/ng-rubrics';
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
    public Bands: RubricBandSnapshot[] = [];
    public Versions: Record<string, unknown>[] = [];
    public DraftId: string | null = null;
    public BaseVersion: RubricVersionSnapshot | null = null;
    public DraftVersion: RubricVersionSnapshot | null = null;
    public RequestedBump: 'Major' | 'Minor' | 'Patch' | null = null;
    public Summary = '';
    public Message = '';
    public Viewing: 'draft' | 'published' = 'draft';

    public get PublishedLabel(): string {
        const row = this.Versions.find(item => item.Status === 'Published');
        return row ? `${row.MajorVersion}.${row.MinorVersion}.${row.PatchVersion}` : '';
    }

    public get NextVersion(): string {
        return this.DraftVersion ? publishPreview(this.BaseVersion, this.DraftVersion).nextVersion ?? '' : '';
    }

    public get ComputedBump(): string | null {
        return this.DraftVersion ? publishPreview(this.BaseVersion, this.DraftVersion).computedBump : null;
    }

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
            this.Scales = await this.loadScales();
            if (draft) {
                this.Nodes = await this.loadNodes(String(draft.ID));
                this.Bands = (await this.rows('MJ: Rubric Bands', `RubricVersionID='${draft.ID}'`)).map(bandFromRow);
                this.DraftVersion = this.snapshot(draft, this.Nodes, this.Bands);
                const baseId = draft.BasedOnVersionID ? String(draft.BasedOnVersionID) : null;
                const base = baseId ? rows.find(row => String(row.ID) === baseId) : null;
                if (base) {
                    const baseNodes = await this.loadNodes(String(base.ID));
                    const baseBands = (await this.rows('MJ: Rubric Bands', `RubricVersionID='${base.ID}'`)).map(bandFromRow);
                    this.BaseVersion = this.snapshot(base, baseNodes, baseBands);
                }
            }
        } finally {
            this.Loading = false;
        }
    }

    public async OnNodes(nodes: RubricNodeSnapshot[]): Promise<void> {
        this.Nodes = nodes;
        if (!this.DraftId) return;
        const saved = await this.rows('MJ: Rubric Criteria', `RubricVersionID='${this.DraftId}'`);
        const plan = planNodeSave(saved.map(row => ({ id: String(row.ID), parentId: row.ParentID == null ? null : String(row.ParentID) })), nodes);
        for (const removedId of plan.removedIds) {
            const anchors = await this.rows('MJ: Rubric Criterion Levels', `CriterionID='${removedId}'`);
            for (const anchor of anchors) await this.remove('MJ: Rubric Criterion Levels', String(anchor.ID));
            await this.remove('MJ: Rubric Criteria', removedId);
        }
        for (const item of plan.upserts) {
            await this.write('MJ: Rubric Criteria', item.id, item.isNew, { ...item.fields, RubricVersionID: this.DraftId });
            await this.saveAnchors(item.id, nodes.find(node => node.id === item.id)?.anchors ?? []);
        }
        if (this.DraftVersion) this.DraftVersion = { ...this.DraftVersion, nodes };
    }

    public async OnBands(bands: RubricBandSnapshot[]): Promise<void> {
        this.Bands = bands;
        if (!this.DraftId) return;
        const saved = await this.rows('MJ: Rubric Bands', `RubricVersionID='${this.DraftId}'`);
        const plan = planBandSave(saved.map(row => String(row.ID)), bands);
        for (const id of plan.removedIds) await this.remove('MJ: Rubric Bands', id);
        for (const item of plan.upserts) await this.write('MJ: Rubric Bands', item.id, item.isNew, { ...item.fields, RubricVersionID: this.DraftId });
        if (this.DraftVersion) this.DraftVersion = { ...this.DraftVersion, bands };
    }

    public OnCancel(): void {
        this.RequestedBump = null;
        this.Summary = '';
    }

    public async OnPublish(event: { bump: string | null; summary: string }): Promise<void> {
        if (!this.DraftId) return;
        const version = await this.ProviderToUse.GetEntityObject('MJ: Rubric Versions', this.ProviderToUse.CurrentUser);
        await version.InnerLoad(CompositeKey.FromID(this.DraftId));
        version.Set('ChangeSummary', event.summary);
        if (event.bump) version.Set('RequestedBump', event.bump);
        (version as unknown as { RequestedBump?: string | null }).RequestedBump = event.bump;
        version.Set('Status', 'Published');
        const ok = await version.Save();
        this.Message = ok ? 'Published.' : (version.LatestResult?.Message ?? 'Publish failed.');
        await this.LoadWorkspace();
    }

    private async loadNodes(versionId: string): Promise<RubricNodeSnapshot[]> {
        const criteria = await this.rows('MJ: Rubric Criteria', `RubricVersionID='${versionId}'`);
        const anchors = criteria.length === 0 ? [] : await this.rows('MJ: Rubric Criterion Levels', `CriterionID IN (${criteria.map(row => `'${row.ID}'`).join(', ')})`);
        return criteria.map(row => nodeFromRow(row, anchors.filter(anchor => String(anchor.CriterionID) === String(row.ID)).map(anchor => ({
            scaleLevelId: anchor.ScaleLevelID == null ? null : String(anchor.ScaleLevelID),
            anchorValue: anchor.AnchorValue == null ? null : Number(anchor.AnchorValue),
            descriptor: String(anchor.Descriptor ?? ''),
        }))));
    }

    private async loadScales(): Promise<RubricScaleSnapshot[]> {
        const scales = await this.rows('MJ: Rubric Scales', '1=1');
        const loaded: RubricScaleSnapshot[] = [];
        for (const scale of scales) {
            const levels = await this.rows('MJ: Rubric Scale Levels', `ScaleID='${scale.ID}'`);
            loaded.push(scaleFromRow(scale, levels));
        }
        return loaded;
    }

    private async saveAnchors(criterionId: string, anchors: NonNullable<RubricNodeSnapshot['anchors']>): Promise<void> {
        const saved = await this.rows('MJ: Rubric Criterion Levels', `CriterionID='${criterionId}'`);
        const used = new Set<string>();
        for (const anchor of anchors) {
            const match = saved.find(row => String(row.ScaleLevelID ?? '') === String(anchor.scaleLevelId ?? '') && !used.has(String(row.ID)));
            if (match) {
                used.add(String(match.ID));
                await this.write('MJ: Rubric Criterion Levels', String(match.ID), false, { Descriptor: anchor.descriptor, ScaleLevelID: anchor.scaleLevelId ?? null, AnchorValue: anchor.anchorValue ?? null });
            } else {
                const id = crypto.randomUUID();
                await this.write('MJ: Rubric Criterion Levels', id, true, { ID: id, CriterionID: criterionId, Descriptor: anchor.descriptor, ScaleLevelID: anchor.scaleLevelId ?? null, AnchorValue: anchor.anchorValue ?? null });
            }
        }
        for (const row of saved) {
            if (!used.has(String(row.ID))) await this.remove('MJ: Rubric Criterion Levels', String(row.ID));
        }
    }

    private async write(entityName: string, id: string, isNew: boolean, fields: Record<string, unknown>): Promise<void> {
        const row = await this.ProviderToUse.GetEntityObject(entityName, this.ProviderToUse.CurrentUser);
        if (isNew) row.NewRecord();
        else await row.InnerLoad(CompositeKey.FromID(id));
        for (const [name, value] of Object.entries(fields)) row.Set(name, value);
        if (isNew) row.Set('ID', id);
        await row.Save();
    }

    private async remove(entityName: string, id: string): Promise<void> {
        const row = await this.ProviderToUse.GetEntityObject(entityName, this.ProviderToUse.CurrentUser);
        await row.InnerLoad(CompositeKey.FromID(id));
        await row.Delete();
    }

    private snapshot(row: Record<string, unknown>, nodes: RubricNodeSnapshot[], bands: RubricBandSnapshot[]): RubricVersionSnapshot {
        return {
            id: String(row.ID),
            rubricId: String(row.RubricID),
            majorVersion: row.MajorVersion == null ? null : Number(row.MajorVersion),
            minorVersion: row.MinorVersion == null ? null : Number(row.MinorVersion),
            patchVersion: row.PatchVersion == null ? null : Number(row.PatchVersion),
            instructions: row.Instructions == null ? null : String(row.Instructions),
            passThreshold: row.PassThreshold == null ? null : Number(row.PassThreshold),
            notApplicablePolicy: (row.NotApplicablePolicy as RubricVersionSnapshot['notApplicablePolicy']) ?? 'ExcludeAndRedistribute',
            scoreDisplayMin: row.ScoreDisplayMin == null ? 0 : Number(row.ScoreDisplayMin),
            scoreDisplayMax: row.ScoreDisplayMax == null ? 100 : Number(row.ScoreDisplayMax),
            nodes,
            scales: this.Scales,
            bands,
        };
    }

    private async rows(entityName: string, filter: string): Promise<Record<string, unknown>[]> {
        const view = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await view.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple', MaxRows: 500 }, this.ProviderToUse.CurrentUser);
        return (result.Results ?? []) as Record<string, unknown>[];
    }
}
