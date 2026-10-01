import { Component } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJAIAgentRubricEntity, MJRubricBandEntity, MJRubricCategoryEntity, MJRubricCriterionEntity, MJRubricEvaluationScoreEntity, MJRubricScaleLevelEntity, MJRubricVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass, RegisterClassEx } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPanel, BaseFormPolicy, BaseFormsModule, type FormChromeContext, type FormChromeSpec } from '@memberjunction/ng-base-forms';
import { RubricVersionHostComponent } from '@memberjunction/ng-rubrics';
import { MJAIAgentRubricFormComponent } from '../../generated/Entities/MJAIAgentRubric/mjaiagentrubric.form.component';
import { MJRubricBandFormComponent } from '../../generated/Entities/MJRubricBand/mjrubricband.form.component';
import { MJRubricCategoryFormComponent } from '../../generated/Entities/MJRubricCategory/mjrubriccategory.form.component';
import { MJRubricCriterionFormComponent } from '../../generated/Entities/MJRubricCriterion/mjrubriccriterion.form.component';
import { MJRubricEvaluationScoreFormComponent } from '../../generated/Entities/MJRubricEvaluationScore/mjrubricevaluationscore.form.component';
import { MJRubricScaleLevelFormComponent } from '../../generated/Entities/MJRubricScaleLevel/mjrubricscalelevel.form.component';
import { MJRubricVersionFormComponent } from '../../generated/Entities/MJRubricVersion/mjrubricversion.form.component';

@Component({
    standalone: false,
    selector: 'mj-rubric-version-form',
    templateUrl: '../../generated/Entities/MJRubricVersion/mjrubricversion.form.component.html',
})
@RegisterClass(BaseFormComponent, 'MJ: Rubric Versions')
export class MJRubricVersionFormComponentExtended extends MJRubricVersionFormComponent {
    public override record!: MJRubricVersionEntity;
}

/** The version record uses the same left-nav rail as the rubric. */
@RegisterClassEx(BaseFormPolicy, { key: 'MJ: Rubric Versions', metadata: { entity: 'MJ: Rubric Versions' } })
export class RubricVersionFormPolicy extends BaseFormPolicy {
    public override DecorateChrome(spec: FormChromeSpec, _ctx: FormChromeContext): FormChromeSpec {
        return { ...spec, Layout: 'left-nav' };
    }
}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:MJRubricVersions:summary',
    metadata: {
        entity: 'MJ: Rubric Versions',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'rubric-version-summary',
        inclusion: 'Primary',
        leadsWhenUnsaved: true,
    },
})
@Component({
    selector: 'mj-rubric-version-summary-panel',
    standalone: true,
    imports: [BaseFormsModule, RubricVersionHostComponent],
    template: `
      <mj-collapsible-panel SectionKey="rubric-version-summary" SectionName="This version" Icon="fa-solid fa-code-compare" [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
        <mj-rubric-version-host [VersionId]="Record.ID" [RubricId]="Record.RubricID" [Status]="Record.Status" [MajorVersion]="Record.MajorVersion" [MinorVersion]="Record.MinorVersion" [PatchVersion]="Record.PatchVersion" [Provider]="FormComponent.ProviderToUse"></mj-rubric-version-host>
      </mj-collapsible-panel>
    `,
})
export class RubricVersionSummaryPanel extends BaseFormPanel<MJRubricVersionEntity> {}

@Component({
    standalone: false,
    selector: 'mj-rubric-criterion-form',
    template: `@if (record) { <mj-record-form-container [Record]="record" [FormComponent]="this" (Navigate)="OnFormNavigate($event)" (DeleteRequested)="OnDeleteRequested()" (FavoriteToggled)="OnFavoriteToggled()" (HistoryRequested)="OnHistoryRequested()" (ListManagementRequested)="OnListManagementRequested()"><mj-rubric-criterion-host [CriterionId]="record.ID" [VersionId]="record.RubricVersionID" [ParentId]="record.ParentID" [Weight]="record.Weight" [ScaleId]="record.ScaleID" [IsGate]="record.IsGate" [GateMinimumScore]="record.GateMinimumScore" [NotApplicablePolicy]="record.NotApplicablePolicy" [Provider]="ProviderToUse" (ParentIdChange)="record.ParentID = $event" (WeightChange)="record.Weight = $event" (ScaleIdChange)="record.ScaleID = $event" (IsGateChange)="record.IsGate = $event" (GateMinimumScoreChange)="record.GateMinimumScore = $event" (NotApplicablePolicyChange)="SetPolicy($event)"></mj-rubric-criterion-host></mj-record-form-container> }`,
})
@RegisterClass(BaseFormComponent, 'MJ: Rubric Criteria')
export class MJRubricCriterionFormComponentExtended extends MJRubricCriterionFormComponent {
    public override record!: MJRubricCriterionEntity;
    public SetPolicy(value: string | null): void {
        this.record.NotApplicablePolicy = (value || null) as typeof this.record.NotApplicablePolicy;
    }
}

@Component({
    standalone: false,
    selector: 'mj-rubric-score-form',
    template: `@if (record) { <mj-record-form-container [Record]="record" [FormComponent]="this" (Navigate)="OnFormNavigate($event)" (DeleteRequested)="OnDeleteRequested()" (FavoriteToggled)="OnFavoriteToggled()" (HistoryRequested)="OnHistoryRequested()" (ListManagementRequested)="OnListManagementRequested()"><mj-rubric-score-editor [ScaleLevelId]="record.ScaleLevelID" [Levels]="Levels" [NotApplicablePolicy]="Policy" [IsNotApplicable]="record.IsNotApplicable" [Rationale]="record.Rationale" [Evidence]="record.Evidence" (ScaleLevelIdChange)="record.ScaleLevelID = $event" (IsNotApplicableChange)="record.IsNotApplicable = $event" (RationaleChange)="record.Rationale = $event" (EvidenceChange)="record.Evidence = $event"></mj-rubric-score-editor></mj-record-form-container> }`,
})
@RegisterClass(BaseFormComponent, 'MJ: Rubric Evaluation Scores')
export class MJRubricEvaluationScoreFormComponentExtended extends MJRubricEvaluationScoreFormComponent {
    public override record!: MJRubricEvaluationScoreEntity;
    public Levels: { id: string; label: string; normalizedValue: number; anchor: string }[] = [];
    public Policy: string | null = null;

    public override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        const view = RunView.FromMetadataProvider(this.ProviderToUse);
        const user = this.ProviderToUse.CurrentUser;
        const criteria = await view.RunView({ EntityName: 'MJ: Rubric Criteria', ExtraFilter: `ID='${this.record.CriterionID}'`, ResultType: 'simple', MaxRows: 1 }, user);
        const criterion = (criteria.Results ?? [])[0] as Record<string, unknown> | undefined;
        if (!criterion) return;
        const versions = await view.RunView({ EntityName: 'MJ: Rubric Versions', ExtraFilter: `ID='${criterion.RubricVersionID}'`, ResultType: 'simple', MaxRows: 1 }, user);
        const version = (versions.Results ?? [])[0] as Record<string, unknown> | undefined;
        this.Policy = String(criterion.NotApplicablePolicy || version?.NotApplicablePolicy || '');
        if (!criterion.ScaleID) return;
        const levels = await view.RunView({ EntityName: 'MJ: Rubric Scale Levels', ExtraFilter: `ScaleID='${criterion.ScaleID}'`, ResultType: 'simple', MaxRows: 20 }, user);
        const anchors = await view.RunView({ EntityName: 'MJ: Rubric Criterion Levels', ExtraFilter: `CriterionID='${criterion.ID}'`, ResultType: 'simple', MaxRows: 20 }, user);
        const anchorRows = (anchors.Results ?? []) as Record<string, unknown>[];
        this.Levels = ((levels.Results ?? []) as Record<string, unknown>[]).map(level => ({
            id: String(level.ID),
            label: String(level.Label ?? ''),
            normalizedValue: Number(level.NormalizedValue ?? 0),
            anchor: String(anchorRows.find(anchor => String(anchor.ScaleLevelID) === String(level.ID))?.Descriptor ?? ''),
        }));
    }
}

@Component({
    standalone: false,
    selector: 'mj-rubric-scale-level-form',
    template: `@if (record) { <mj-record-form-container [Record]="record" [FormComponent]="this" (Navigate)="OnFormNavigate($event)" (DeleteRequested)="OnDeleteRequested()" (FavoriteToggled)="OnFavoriteToggled()" (HistoryRequested)="OnHistoryRequested()" (ListManagementRequested)="OnListManagementRequested()"><mj-rubric-scale-level-host [ScaleId]="record.ScaleID" [Label]="record.Label" [Description]="record.Description" [Value]="record.Value" [NormalizedValue]="record.NormalizedValue" [Provider]="ProviderToUse" (LabelChange)="record.Label = $event" (DescriptionChange)="record.Description = $event" (ValueChange)="record.Value = $event" (NormalizedValueChange)="record.NormalizedValue = $event"></mj-rubric-scale-level-host></mj-record-form-container> }`,
})
@RegisterClass(BaseFormComponent, 'MJ: Rubric Scale Levels')
export class MJRubricScaleLevelFormComponentExtended extends MJRubricScaleLevelFormComponent {
    public override record!: MJRubricScaleLevelEntity;
}

@Component({
    standalone: false,
    selector: 'mj-rubric-band-form',
    template: `@if (record) { <mj-record-form-container [Record]="record" [FormComponent]="this" (Navigate)="OnFormNavigate($event)" (DeleteRequested)="OnDeleteRequested()" (FavoriteToggled)="OnFavoriteToggled()" (HistoryRequested)="OnHistoryRequested()" (ListManagementRequested)="OnListManagementRequested()"><mj-rubric-band-editor [Label]="record.Label" [MinScore]="record.MinScore" [MaxScore]="record.MaxScore" [Description]="record.Description" (LabelChange)="record.Label = $event" (MinScoreChange)="record.MinScore = $event" (MaxScoreChange)="record.MaxScore = $event" (DescriptionChange)="record.Description = $event"></mj-rubric-band-editor></mj-record-form-container> }`,
})
@RegisterClass(BaseFormComponent, 'MJ: Rubric Bands')
export class MJRubricBandFormComponentExtended extends MJRubricBandFormComponent {
    public override record!: MJRubricBandEntity;
}

@Component({
    standalone: false,
    selector: 'mj-rubric-category-form',
    template: `@if (record) { <mj-record-form-container [Record]="record" [FormComponent]="this" (Navigate)="OnFormNavigate($event)" (DeleteRequested)="OnDeleteRequested()" (FavoriteToggled)="OnFavoriteToggled()" (HistoryRequested)="OnHistoryRequested()" (ListManagementRequested)="OnListManagementRequested()"><mj-rubric-category-host [CategoryId]="record.ID" [Name]="record.Name" [Description]="record.Description" [ParentId]="record.ParentID" [Provider]="ProviderToUse" (NameChange)="record.Name = $event" (DescriptionChange)="record.Description = $event" (ParentIdChange)="record.ParentID = $event"></mj-rubric-category-host></mj-record-form-container> }`,
})
@RegisterClass(BaseFormComponent, 'MJ: Rubric Categories')
export class MJRubricCategoryFormComponentExtended extends MJRubricCategoryFormComponent {
    public override record!: MJRubricCategoryEntity;
}

@Component({
    standalone: false,
    selector: 'mj-ai-agent-rubric-form',
    template: `@if (record) { <mj-record-form-container [Record]="record" [FormComponent]="this" (Navigate)="OnFormNavigate($event)" (DeleteRequested)="OnDeleteRequested()" (FavoriteToggled)="OnFavoriteToggled()" (HistoryRequested)="OnHistoryRequested()" (ListManagementRequested)="OnListManagementRequested()"><p>{{ record.Purpose }}{{ record.IsDefault ? ' (default)' : '' }} — {{ record.Status }}</p><button type="button" (click)="TurnOff()">Turn off</button></mj-record-form-container> }`,
})
@RegisterClass(BaseFormComponent, 'MJ: AI Agent Rubrics')
export class MJAIAgentRubricFormComponentExtended extends MJAIAgentRubricFormComponent {
    public override record!: MJAIAgentRubricEntity;
    public TurnOff(): void {
        this.record.Status = 'Disabled';
        this.record.IsDefault = false;
    }
}
