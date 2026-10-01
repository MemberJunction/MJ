import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CompositeKey, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { categoryParentChoices, priorPublishedVersion, scaleIsFrozen } from './form-hosts.model';
import { nodeFromRow } from './model';
import { RubricCategoryEditorComponent, RubricCriterionEditorComponent, RubricScaleLevelEditorComponent } from './record-editors.component';
import { RubricVersionDiffComponent } from './version-diff.component';

type Row = Record<string, unknown>;

/** Loads this version and the prior published version, then shows the diff. */
@Component({
    standalone: true,
    selector: 'mj-rubric-version-host',
    imports: [RubricVersionDiffComponent],
    template: `
      <p>{{ StatusLine }}</p>
      <mj-rubric-version-diff [Base]="Base" [Draft]="Draft"></mj-rubric-version-diff>
    `,
})
export class RubricVersionHostComponent implements OnChanges {
    @Input() VersionId: string | null = null;
    @Input() RubricId: string | null = null;
    @Input() Status = '';
    @Input() MajorVersion = 0;
    @Input() MinorVersion = 0;
    @Input() PatchVersion = 0;
    @Input() Provider: IMetadataProvider | null = null;
    public Base: RubricVersionSnapshot | null = null;
    public Draft: RubricVersionSnapshot | null = null;
    public get StatusLine(): string {
        return `${this.Status} ${this.MajorVersion}.${this.MinorVersion}.${this.PatchVersion}`;
    }
    public ngOnChanges(): void { void this.load(); }
    private async load(): Promise<void> {
        if (!this.Provider || !this.VersionId || !this.RubricId) return;
        const versions = await rows(this.Provider, 'MJ: Rubric Versions', `RubricID='${quote(this.RubricId)}'`);
        const listed = versions.map(row => ({
            id: String(row.ID),
            status: String(row.Status ?? ''),
            basedOnId: row.BasedOnVersionID == null ? null : String(row.BasedOnVersionID),
            major: Number(row.MajorVersion ?? 0),
            minor: Number(row.MinorVersion ?? 0),
            patch: Number(row.PatchVersion ?? 0),
        }));
        const priorId = priorPublishedVersion(listed, this.VersionId);
        this.Draft = await snapshot(this.Provider, versions.find(row => String(row.ID) === this.VersionId));
        this.Base = priorId ? await snapshot(this.Provider, versions.find(row => String(row.ID) === priorId)) : null;
    }
}

/** Passes Frozen only when a published version uses this level's scale. */
@Component({
    standalone: true,
    selector: 'mj-rubric-scale-level-host',
    imports: [RubricScaleLevelEditorComponent],
    template: `
      <mj-rubric-scale-level-editor
        [Label]="Label" [Description]="Description" [Value]="Value" [NormalizedValue]="NormalizedValue" [Frozen]="Frozen"
        (LabelChange)="LabelChange.emit($event)" (DescriptionChange)="DescriptionChange.emit($event)"
        (ValueChange)="ValueChange.emit($event)" (NormalizedValueChange)="NormalizedValueChange.emit($event)">
      </mj-rubric-scale-level-editor>
    `,
})
export class RubricScaleLevelHostComponent implements OnChanges {
    @Input() ScaleId: string | null = null;
    @Input() Label = '';
    @Input() Description: string | null = null;
    @Input() Value = 0;
    @Input() NormalizedValue = 0;
    @Input() Provider: IMetadataProvider | null = null;
    @Output() LabelChange = new EventEmitter<string>();
    @Output() DescriptionChange = new EventEmitter<string>();
    @Output() ValueChange = new EventEmitter<number>();
    @Output() NormalizedValueChange = new EventEmitter<number>();
    public Frozen = false;
    public ngOnChanges(): void { void this.load(); }
    private async load(): Promise<void> {
        if (!this.Provider || !this.ScaleId) { this.Frozen = false; return; }
        const criteria = await rows(this.Provider, 'MJ: Rubric Criteria', `ScaleID='${quote(this.ScaleId)}'`);
        const versionIds = [...new Set(criteria.map(row => String(row.RubricVersionID ?? '')).filter(id => id))];
        if (versionIds.length === 0) { this.Frozen = false; return; }
        const versions = await rows(this.Provider, 'MJ: Rubric Versions', `ID IN (${versionIds.map(id => `'${quote(id)}'`).join(', ')}) AND Status='Published'`);
        this.Frozen = scaleIsFrozen(versions.length > 0 ? [this.ScaleId] : [], this.ScaleId);
    }
}

/** Loads the categories that can be this record's parent. */
@Component({
    standalone: true,
    selector: 'mj-rubric-category-host',
    imports: [RubricCategoryEditorComponent],
    template: `
      <mj-rubric-category-editor [Name]="Name" [ParentId]="ParentId" [Parents]="Parents"
        (NameChange)="NameChange.emit($event)" (ParentIdChange)="ParentIdChange.emit($event)">
      </mj-rubric-category-editor>
    `,
})
export class RubricCategoryHostComponent implements OnChanges {
    @Input() CategoryId: string | null = null;
    @Input() Name = '';
    @Input() ParentId: string | null = null;
    @Input() Provider: IMetadataProvider | null = null;
    @Output() NameChange = new EventEmitter<string>();
    @Output() ParentIdChange = new EventEmitter<string | null>();
    public Parents: { id: string; name: string }[] = [];
    public ngOnChanges(): void { void this.load(); }
    private async load(): Promise<void> {
        if (!this.Provider || !this.CategoryId) return;
        const categories = await rows(this.Provider, 'MJ: Rubric Categories', '1=1');
        this.Parents = categoryParentChoices(categories.map(row => ({
            id: String(row.ID),
            name: String(row.Name ?? ''),
            parentId: row.ParentID == null ? null : String(row.ParentID),
        })), this.CategoryId);
    }
}

/** Loads named scales, their levels, sibling criteria, and this node's anchors. */
@Component({
    standalone: true,
    selector: 'mj-rubric-criterion-host',
    imports: [RubricCriterionEditorComponent],
    template: `
      <mj-rubric-criterion-editor
        [ParentId]="ParentId" [Parents]="Parents" [Weight]="Weight" [ScaleId]="ScaleId" [Scales]="Scales" [Anchors]="Anchors"
        [GateMinimumScore]="GateMinimumScore" [NotApplicablePolicy]="NotApplicablePolicy"
        (ParentIdChange)="ParentIdChange.emit($event)" (WeightChange)="WeightChange.emit($event)" (ScaleIdChange)="ScaleIdChange.emit($event)"
        (AnchorsChange)="SaveAnchors($event)" (GateMinimumScoreChange)="GateMinimumScoreChange.emit($event)"
        (NotApplicablePolicyChange)="NotApplicablePolicyChange.emit($event)">
      </mj-rubric-criterion-editor>
    `,
})
export class RubricCriterionHostComponent implements OnChanges {
    @Input() CriterionId: string | null = null;
    @Input() VersionId: string | null = null;
    @Input() ParentId: string | null = null;
    @Input() Weight = 1;
    @Input() ScaleId: string | null = null;
    @Input() GateMinimumScore: number | null = null;
    @Input() NotApplicablePolicy: string | null = null;
    @Input() Provider: IMetadataProvider | null = null;
    @Output() ParentIdChange = new EventEmitter<string | null>();
    @Output() WeightChange = new EventEmitter<number>();
    @Output() ScaleIdChange = new EventEmitter<string | null>();
    @Output() AnchorsChange = new EventEmitter<{ scaleLevelId: string | null; descriptor: string }[]>();
    @Output() GateMinimumScoreChange = new EventEmitter<number | null>();
    @Output() NotApplicablePolicyChange = new EventEmitter<string | null>();
    public Parents: { id: string; name: string }[] = [];
    public Scales: { id: string; name: string; levels: { id: string; label: string }[] }[] = [];
    public Anchors: { scaleLevelId: string | null; descriptor: string }[] = [];
    public ngOnChanges(): void { void this.load(); }
    public async SaveAnchors(anchors: { scaleLevelId: string | null; descriptor: string }[]): Promise<void> {
        this.Anchors = anchors;
        this.AnchorsChange.emit(anchors);
        if (!this.Provider || !this.CriterionId) return;
        const saved = await rows(this.Provider, 'MJ: Rubric Criterion Levels', `CriterionID='${quote(this.CriterionId)}'`);
        const used = new Set<string>();
        for (const anchor of anchors) {
            const match = saved.find(row => String(row.ScaleLevelID ?? '') === String(anchor.scaleLevelId ?? '') && !used.has(String(row.ID)));
            if (match) {
                used.add(String(match.ID));
                await writeFields(this.Provider, 'MJ: Rubric Criterion Levels', String(match.ID), false, { Descriptor: anchor.descriptor, ScaleLevelID: anchor.scaleLevelId });
            } else if (anchor.descriptor) {
                await writeFields(this.Provider, 'MJ: Rubric Criterion Levels', '', true, { CriterionID: this.CriterionId, Descriptor: anchor.descriptor, ScaleLevelID: anchor.scaleLevelId });
            }
        }
        for (const row of saved) {
            if (!used.has(String(row.ID))) await removeRow(this.Provider, 'MJ: Rubric Criterion Levels', String(row.ID));
        }
    }
    private async load(): Promise<void> {
        if (!this.Provider) return;
        const scales = await rows(this.Provider, 'MJ: Rubric Scales', `Status='Active'`);
        const levels = scales.length === 0 ? [] : await rows(this.Provider, 'MJ: Rubric Scale Levels', `ScaleID IN (${scales.map(scale => `'${quote(String(scale.ID))}'`).join(', ')})`);
        this.Scales = scales.map(scale => ({
            id: String(scale.ID),
            name: String(scale.Name ?? ''),
            levels: levels.filter(level => String(level.ScaleID) === String(scale.ID)).map(level => ({ id: String(level.ID), label: String(level.Label ?? '') })),
        }));
        if (this.VersionId) {
            const siblings = await rows(this.Provider, 'MJ: Rubric Criteria', `RubricVersionID='${quote(this.VersionId)}'`);
            this.Parents = categoryParentChoices(siblings.map(row => ({
                id: String(row.ID),
                name: String(row.Name ?? row.Key ?? ''),
                parentId: row.ParentID == null ? null : String(row.ParentID),
            })), this.CriterionId ?? '');
        }
        if (this.CriterionId) {
            const anchors = await rows(this.Provider, 'MJ: Rubric Criterion Levels', `CriterionID='${quote(this.CriterionId)}'`);
            this.Anchors = anchors.map(row => ({ scaleLevelId: row.ScaleLevelID == null ? null : String(row.ScaleLevelID), descriptor: String(row.Descriptor ?? '') }));
        }
    }
}

async function rows(provider: IMetadataProvider, entityName: string, filter: string): Promise<Row[]> {
    const view = RunView.FromMetadataProvider(provider);
    const result = await view.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple', MaxRows: 500 }, provider.CurrentUser as UserInfo);
    return (result.Results ?? []) as Row[];
}

async function snapshot(provider: IMetadataProvider, version: Row | undefined): Promise<RubricVersionSnapshot | null> {
    if (!version) return null;
    const criteria = await rows(provider, 'MJ: Rubric Criteria', `RubricVersionID='${quote(String(version.ID))}'`);
    return {
        id: String(version.ID),
        rubricId: String(version.RubricID),
        notApplicablePolicy: (version.NotApplicablePolicy as RubricVersionSnapshot['notApplicablePolicy']) ?? 'ExcludeAndRedistribute',
        passThreshold: version.PassThreshold == null ? null : Number(version.PassThreshold),
        scoreDisplayMin: version.ScoreDisplayMin == null ? 0 : Number(version.ScoreDisplayMin),
        scoreDisplayMax: version.ScoreDisplayMax == null ? 100 : Number(version.ScoreDisplayMax),
        nodes: criteria.map(row => nodeFromRow(row)),
        scales: [],
        bands: [],
    };
}

function quote(value: string): string {
    return value.replace(/'/g, "''");
}

async function writeFields(provider: IMetadataProvider, entityName: string, id: string, isNew: boolean, fields: Record<string, unknown>): Promise<void> {
    const row = await provider.GetEntityObject(entityName, provider.CurrentUser);
    if (isNew) row.NewRecord();
    else await row.InnerLoad(CompositeKey.FromID(id));
    for (const [name, value] of Object.entries(fields)) row.Set(name, value);
    await row.Save();
}

async function removeRow(provider: IMetadataProvider, entityName: string, id: string): Promise<void> {
    const row = await provider.GetEntityObject(entityName, provider.CurrentUser);
    await row.InnerLoad(CompositeKey.FromID(id));
    await row.Delete();
}
