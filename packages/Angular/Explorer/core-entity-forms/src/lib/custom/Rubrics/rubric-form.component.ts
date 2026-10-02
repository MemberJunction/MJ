import { Component } from '@angular/core';
import { ActionParam } from '@memberjunction/actions-base';
import { CompositeKey, RunView } from '@memberjunction/core';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { RegisterClass, RegisterClassEx, UUIDsEqual } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPolicy, type FormChromeContext, type FormChromeSpec } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { bandFromRow, NodeFields, nodeFromRow, PlanNodeSave, planBandSave, QueueNodeSave, publishPreview, scaleFromRow, VersionShownWithoutDraft, type RubricBandSnapshot, type RubricNodeSnapshot, type RubricScaleSnapshot, type RubricVersionCard, type RubricVersionSnapshot } from '@memberjunction/ng-rubrics';
import { MJRubricBandEntity, MJRubricCriterionEntity, MJRubricCriterionLevelEntity, MJRubricEntity, MJRubricVersionEntity } from '@memberjunction/core-entities';
import { MJRubricFormComponent } from '../../generated/Entities/MJRubric/mjrubric.form.component';

/**
 * Rubric form. Loads the draft version and its criteria, hosts the author,
 * the diff, and the publish dialog, and saves what they emit.
 */
@RegisterClass(BaseFormComponent, 'MJ: Rubrics')
@Component({
    standalone: false,
    selector: 'mj-rubric-form',
    templateUrl: '../../generated/Entities/MJRubric/mjrubric.form.component.html',
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
    public VersionCards: RubricVersionCard[] = [];
    private nodeSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private nodeSaveChain: Promise<void> = Promise.resolve();
    private disposed = false;

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
            this.DraftVersion = null;
            this.BaseVersion = null;
            this.Nodes = [];
            this.Bands = [];
            this.Scales = await this.loadScales();
            if (draft) {
                this.Viewing = 'draft';
                this.Nodes = await this.loadNodes(String(draft.ID));
                this.Bands = (await this.rows('MJ: Rubric Bands', `RubricVersionID='${draft.ID}'`)).map(bandFromRow);
                this.DraftVersion = this.snapshot(draft, this.Nodes, this.Bands);
                const baseId = draft.BasedOnVersionID ? String(draft.BasedOnVersionID) : null;
                const base = baseId ? rows.find(row => String(row.ID) === baseId) : rows.find(row => row.Status === 'Published');
                if (base) {
                    const baseNodes = await this.loadNodes(String(base.ID));
                    const baseBands = (await this.rows('MJ: Rubric Bands', `RubricVersionID='${base.ID}'`)).map(bandFromRow);
                    this.BaseVersion = this.snapshot(base, baseNodes, baseBands);
                }
            } else {
                this.Viewing = 'published';
                const published = VersionShownWithoutDraft(rows);
                if (published) {
                    const nodes = await this.loadNodes(String(published.ID));
                    const bands = (await this.rows('MJ: Rubric Bands', `RubricVersionID='${published.ID}'`)).map(bandFromRow);
                    this.Nodes = nodes;
                    this.Bands = bands;
                    this.BaseVersion = this.snapshot(published, nodes, bands);
                }
            }
            this.VersionCards = await this.buildVersionCards(rows);
        } finally {
            this.Loading = false;
        }
    }

    public OpenVersion(id: string): void {
        SharedService.Instance.OpenEntityRecord('MJ: Rubric Versions', CompositeKey.FromID(id));
    }

    private async buildVersionCards(versions: Record<string, unknown>[]): Promise<RubricVersionCard[]> {
        if (versions.length === 0) return [];
        const ids = versions.map(row => `'${String(row.ID).replace(/'/g, "''")}'`).join(', ');
        const criteria = await this.rows('MJ: Rubric Criteria', `RubricVersionID IN (${ids})`);
        const bands = await this.rows('MJ: Rubric Bands', `RubricVersionID IN (${ids})`);
        return versions.map(row => {
            const id = String(row.ID);
            const nodes = criteria.filter(item => String(item.RubricVersionID) === id);
            const versionBands = bands.filter(item => String(item.RubricVersionID) === id);
            const status = String(row.Status ?? '');
            const numbered = row.MajorVersion == null ? '' : `${row.MajorVersion}.${row.MinorVersion}.${row.PatchVersion}`;
            const label = status === 'Draft' ? `Draft${this.NextVersion ? ` · next ${this.NextVersion}` : ''}` : (numbered || status);
            return {
                id,
                status,
                label,
                bump: String(row.AppliedBump || row.ComputedBump || ''),
                threshold: row.PassThreshold == null ? '' : String(row.PassThreshold),
                criteria: nodes.filter(item => item.NodeType === 'Criterion' || item.NodeType == null).length,
                gates: nodes.filter(item => item.IsGate === true || item.IsGate === 1).length,
                bands: versionBands.map(item => String(item.Label ?? '')).filter(Boolean).join(', '),
                summary: row.ChangeSummary == null ? '' : String(row.ChangeSummary),
            };
        }).sort((left, right) => Number(left.status === 'Draft') - Number(right.status === 'Draft'));
    }

    public override ngOnDestroy(): void {
        this.disposed = true;
        if (this.nodeSaveTimer != null) clearTimeout(this.nodeSaveTimer);
        this.nodeSaveTimer = null;
        super.ngOnDestroy();
    }

    /** Keeps the open draft in memory and writes dirty criteria once typing pauses. */
    public OnNodes(nodes: RubricNodeSnapshot[]): void {
        if (this.Viewing === 'published') return;
        this.Nodes = nodes;
        if (this.DraftVersion) this.DraftVersion = { ...this.DraftVersion, nodes };
        if (!this.DraftId) return;
        const draftId = this.DraftId;
        this.nodeSaveTimer = QueueNodeSave(this.nodeSaveTimer, () => {
            this.nodeSaveTimer = null;
            this.nodeSaveChain = this.nodeSaveChain.then(() => this.PersistNodes(draftId, nodes));
        });
    }

    private async PersistNodes(draftId: string, nodes: RubricNodeSnapshot[]): Promise<void> {
        if (this.disposed || this.DraftId !== draftId || this.Viewing === 'published') return;
        try {
            const saved = await this.rows('MJ: Rubric Criteria', `RubricVersionID='${draftId}'`);
            const anchorRows = saved.length === 0 ? [] : await this.rows('MJ: Rubric Criterion Levels', `CriterionID IN (${saved.map(row => `'${String(row.ID)}'`).join(', ')})`);
            const plan = PlanNodeSave(saved.map(row => {
                const node = nodeFromRow(row, anchorRows.filter(anchor => String(anchor.CriterionID) === String(row.ID)).map(anchor => ({
                    scaleLevelId: anchor.ScaleLevelID == null ? null : String(anchor.ScaleLevelID),
                    anchorValue: anchor.AnchorValue == null ? null : Number(anchor.AnchorValue),
                    descriptor: String(anchor.Descriptor ?? ''),
                })));
                return { id: node.id, parentId: node.parentId ?? null, fields: NodeFields(node), anchors: node.anchors ?? [] };
            }), nodes);
            for (const removedId of plan.removedIds) {
                const anchors = await this.rows('MJ: Rubric Criterion Levels', `CriterionID='${removedId}'`);
                for (const anchor of anchors) await this.remove('MJ: Rubric Criterion Levels', String(anchor.ID));
                await this.remove('MJ: Rubric Criteria', removedId);
            }
            for (const item of plan.upserts) {
                await this.write('MJ: Rubric Criteria', item.id, item.isNew, { ...item.fields, RubricVersionID: draftId });
                const source = nodes.find(node => UUIDsEqual(node.id, item.id));
                await this.saveAnchors(item.id, source?.anchors ?? []);
            }
        } catch (error) {
            this.Message = error instanceof Error ? error.message : 'Could not save the draft.';
        }
    }

    public async OnBands(bands: RubricBandSnapshot[]): Promise<void> {
        if (this.Viewing === 'published') return;
        this.Bands = bands;
        if (!this.DraftId) return;
        const saved = await this.rows('MJ: Rubric Bands', `RubricVersionID='${this.DraftId}'`);
        const plan = planBandSave(saved.map(row => String(row.ID)), bands);
        for (const id of plan.removedIds) await this.remove('MJ: Rubric Bands', id);
        for (const item of plan.upserts) await this.write('MJ: Rubric Bands', item.id, item.isNew, { ...item.fields, RubricVersionID: this.DraftId });
        if (this.DraftVersion) this.DraftVersion = { ...this.DraftVersion, bands };
    }

    /** Clones the highest published or retired version through Create Rubric Draft. */
    public async StartDraft(): Promise<void> {
        const found = await this.rows('MJ: Actions', `Name='Create Rubric Draft'`);
        const actionId = String(found[0]?.ID ?? '');
        if (!actionId) {
            this.Message = 'Create Rubric Draft was not found.';
            return;
        }
        const params: ActionParam[] = [{ Name: 'RubricID', Value: this.record.ID, Type: 'Input' }];
        const result = await new GraphQLActionClient(this.ProviderToUse as GraphQLDataProvider).RunAction(actionId, params);
        this.Message = result.Success ? 'Draft started.' : (result.Message ?? 'Could not start a draft.');
        if (result.Success) await this.LoadWorkspace();
    }

    public OnCancel(): void {
        this.RequestedBump = null;
        this.Summary = '';
    }

    public async OnPublish(event: { bump: string | null; summary: string }): Promise<void> {
        if (!this.DraftId) return;
        const version = await this.ProviderToUse.GetEntityObject<MJRubricVersionEntity>('MJ: Rubric Versions', this.ProviderToUse.CurrentUser);
        const loaded = await version.InnerLoad(CompositeKey.FromID(this.DraftId));
        if (!loaded) {
            this.Message = 'The draft version was not found.';
            return;
        }
        version.ChangeSummary = event.summary;
        if (event.bump === 'Major' || event.bump === 'Minor' || event.bump === 'Patch') version.RequestedBump = event.bump;
        version.Status = 'Published';
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
        if (entityName === 'MJ: Rubric Criteria') return this.saveCriterion(id, isNew, fields);
        if (entityName === 'MJ: Rubric Bands') return this.saveBand(id, isNew, fields);
        if (entityName === 'MJ: Rubric Criterion Levels') return this.saveLevel(id, isNew, fields);
        throw new Error(`Cannot save ${entityName}.`);
    }

    private async saveCriterion(id: string, isNew: boolean, fields: Record<string, unknown>): Promise<void> {
        const row = await this.ProviderToUse.GetEntityObject<MJRubricCriterionEntity>('MJ: Rubric Criteria', this.ProviderToUse.CurrentUser);
        if (!(await this.openRow(row, id, isNew, 'criterion'))) return;
        if (isNew) row.ID = id;
        row.RubricVersionID = text(fields.RubricVersionID);
        row.ParentID = textOrNull(fields.ParentID);
        row.Key = text(fields.Key);
        row.Name = text(fields.Name);
        row.Description = textOrNull(fields.Description);
        row.Guidance = textOrNull(fields.Guidance);
        row.NodeType = fields.NodeType === 'Group' ? 'Group' : 'Criterion';
        row.ScaleID = textOrNull(fields.ScaleID);
        row.Weight = numberOrZero(fields.Weight);
        row.IsAdvisory = flag(fields.IsAdvisory);
        row.IsGate = flag(fields.IsGate);
        row.GateMinimumScore = numberOrNull(fields.GateMinimumScore);
        row.NotApplicablePolicy = policyOrNull(fields.NotApplicablePolicy);
        row.RollupMethod = rollupOrNull(fields.RollupMethod);
        row.EvidenceRequired = flag(fields.EvidenceRequired);
        row.RationaleRequired = flag(fields.RationaleRequired);
        row.Sequence = numberOrZero(fields.Sequence);
        await this.requireSave(row, 'criterion');
    }

    private async saveBand(id: string, isNew: boolean, fields: Record<string, unknown>): Promise<void> {
        const row = await this.ProviderToUse.GetEntityObject<MJRubricBandEntity>('MJ: Rubric Bands', this.ProviderToUse.CurrentUser);
        if (!(await this.openRow(row, id, isNew, 'band'))) return;
        if (isNew) row.ID = id;
        row.RubricVersionID = text(fields.RubricVersionID);
        row.Label = text(fields.Label);
        row.Description = textOrNull(fields.Description);
        row.MinScore = numberOrZero(fields.MinScore);
        row.MaxScore = numberOrZero(fields.MaxScore);
        row.DisplayTone = toneOrNeutral(fields.DisplayTone);
        row.Sequence = numberOrZero(fields.Sequence);
        await this.requireSave(row, 'band');
    }

    private async saveLevel(id: string, isNew: boolean, fields: Record<string, unknown>): Promise<void> {
        const row = await this.ProviderToUse.GetEntityObject<MJRubricCriterionLevelEntity>('MJ: Rubric Criterion Levels', this.ProviderToUse.CurrentUser);
        if (!(await this.openRow(row, id, isNew, 'anchor'))) return;
        if (isNew) row.ID = id;
        const criterionId = textOrNull(fields.CriterionID);
        if (criterionId) row.CriterionID = criterionId;
        row.ScaleLevelID = textOrNull(fields.ScaleLevelID);
        row.AnchorValue = numberOrNull(fields.AnchorValue);
        row.Descriptor = text(fields.Descriptor);
        await this.requireSave(row, 'anchor');
    }

    private async openRow(row: { NewRecord: () => void; InnerLoad: (key: CompositeKey) => Promise<boolean> }, id: string, isNew: boolean, label: string): Promise<boolean> {
        if (isNew) {
            row.NewRecord();
            return true;
        }
        const loaded = await row.InnerLoad(CompositeKey.FromID(id));
        if (!loaded) throw new Error(`The ${label} was not found.`);
        return true;
    }

    private async requireSave(row: { Save: () => Promise<boolean>; LatestResult?: { Message?: string } | null }, label: string): Promise<void> {
        if (!await row.Save()) throw new Error(row.LatestResult?.Message || `Could not save the ${label}.`);
    }

    private async remove(entityName: string, id: string): Promise<void> {
        const row = entityName === 'MJ: Rubric Criteria'
            ? await this.ProviderToUse.GetEntityObject<MJRubricCriterionEntity>(entityName, this.ProviderToUse.CurrentUser)
            : entityName === 'MJ: Rubric Bands'
                ? await this.ProviderToUse.GetEntityObject<MJRubricBandEntity>(entityName, this.ProviderToUse.CurrentUser)
                : await this.ProviderToUse.GetEntityObject<MJRubricCriterionLevelEntity>('MJ: Rubric Criterion Levels', this.ProviderToUse.CurrentUser);
        const loaded = await row.InnerLoad(CompositeKey.FromID(id));
        if (!loaded) throw new Error(`The ${entityName} row was not found.`);
        if (!await row.Delete()) throw new Error(row.LatestResult?.Message || `Could not delete the ${entityName} row.`);
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
        if (!result.Success) throw new Error(result.ErrorMessage || `Could not read ${entityName}.`);
        return (result.Results ?? []) as Record<string, unknown>[];
    }
}

function text(value: unknown): string {
    return value == null ? '' : String(value);
}

function textOrNull(value: unknown): string | null {
    if (value == null || value === '') return null;
    return String(value);
}

function numberOrZero(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value: unknown): number | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function flag(value: unknown): boolean {
    return value === true || value === 1;
}

function policyOrNull(value: unknown): 'CountAsZero' | 'ExcludeAndRedistribute' | 'FailEvaluation' | 'NotAllowed' | null {
    return value === 'CountAsZero' || value === 'ExcludeAndRedistribute' || value === 'FailEvaluation' || value === 'NotAllowed' ? value : null;
}

function rollupOrNull(value: unknown): 'Maximum' | 'Minimum' | 'WeightedMean' | null {
    return value === 'Maximum' || value === 'Minimum' || value === 'WeightedMean' ? value : null;
}

function toneOrNeutral(value: unknown): 'Error' | 'Info' | 'Neutral' | 'Success' | 'Warning' {
    return value === 'Error' || value === 'Info' || value === 'Success' || value === 'Warning' ? value : 'Neutral';
}

/** The rubric record uses the left-nav rail. Each contribution is one item. */
@RegisterClassEx(BaseFormPolicy, { key: 'MJ: Rubrics', metadata: { entity: 'MJ: Rubrics' } })
export class RubricFormPolicy extends BaseFormPolicy {
    public override DecorateChrome(spec: FormChromeSpec, _ctx: FormChromeContext): FormChromeSpec {
        return { ...spec, Layout: 'left-nav' };
    }
}
