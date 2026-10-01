import { Component } from '@angular/core';
import { MJAIAgentRubricEntity, MJRubricBandEntity, MJRubricCategoryEntity, MJRubricCriterionEntity, MJRubricEvaluationScoreEntity, MJRubricScaleLevelEntity, MJRubricVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
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
    template: `@if (record) { <mj-record-form-container [Record]="record" [FormComponent]="this" (Navigate)="OnFormNavigate($event)" (DeleteRequested)="OnDeleteRequested()" (FavoriteToggled)="OnFavoriteToggled()" (HistoryRequested)="OnHistoryRequested()" (ListManagementRequested)="OnListManagementRequested()"><p>{{ record.Status }} {{ record.MajorVersion }}.{{ record.MinorVersion }}.{{ record.PatchVersion }}</p><mj-rubric-version-diff></mj-rubric-version-diff></mj-record-form-container> }`,
})
@RegisterClass(BaseFormComponent, 'MJ: Rubric Versions')
export class MJRubricVersionFormComponentExtended extends MJRubricVersionFormComponent {
    public override record!: MJRubricVersionEntity;
}

@Component({
    standalone: false,
    selector: 'mj-rubric-criterion-form',
    template: `@if (record) { <mj-record-form-container [Record]="record" [FormComponent]="this" (Navigate)="OnFormNavigate($event)" (DeleteRequested)="OnDeleteRequested()" (FavoriteToggled)="OnFavoriteToggled()" (HistoryRequested)="OnHistoryRequested()" (ListManagementRequested)="OnListManagementRequested()"><mj-rubric-criterion-editor [ParentId]="record.ParentID" [Weight]="record.Weight" [ScaleId]="record.ScaleID" [GateMinimumScore]="record.GateMinimumScore" [NotApplicablePolicy]="record.NotApplicablePolicy" (ParentIdChange)="record.ParentID = $event" (WeightChange)="record.Weight = $event" (ScaleIdChange)="record.ScaleID = $event" (GateMinimumScoreChange)="record.GateMinimumScore = $event" (NotApplicablePolicyChange)="record.NotApplicablePolicy = $event"></mj-rubric-criterion-editor></mj-record-form-container> }`,
})
@RegisterClass(BaseFormComponent, 'MJ: Rubric Criteria')
export class MJRubricCriterionFormComponentExtended extends MJRubricCriterionFormComponent {
    public override record!: MJRubricCriterionEntity;
}

@Component({
    standalone: false,
    selector: 'mj-rubric-score-form',
    template: `@if (record) { <mj-record-form-container [Record]="record" [FormComponent]="this" (Navigate)="OnFormNavigate($event)" (DeleteRequested)="OnDeleteRequested()" (FavoriteToggled)="OnFavoriteToggled()" (HistoryRequested)="OnHistoryRequested()" (ListManagementRequested)="OnListManagementRequested()"><mj-rubric-score-editor [ScaleLevelId]="record.ScaleLevelID" [RawValue]="record.RawValue" [IsNotApplicable]="record.IsNotApplicable" [Rationale]="record.Rationale" [Evidence]="record.Evidence" (ScaleLevelIdChange)="record.ScaleLevelID = $event" (RawValueChange)="record.RawValue = $event" (IsNotApplicableChange)="record.IsNotApplicable = $event" (RationaleChange)="record.Rationale = $event" (EvidenceChange)="record.Evidence = $event"></mj-rubric-score-editor></mj-record-form-container> }`,
})
@RegisterClass(BaseFormComponent, 'MJ: Rubric Evaluation Scores')
export class MJRubricEvaluationScoreFormComponentExtended extends MJRubricEvaluationScoreFormComponent {
    public override record!: MJRubricEvaluationScoreEntity;
}

@Component({
    standalone: false,
    selector: 'mj-rubric-scale-level-form',
    template: `@if (record) { <mj-record-form-container [Record]="record" [FormComponent]="this" (Navigate)="OnFormNavigate($event)" (DeleteRequested)="OnDeleteRequested()" (FavoriteToggled)="OnFavoriteToggled()" (HistoryRequested)="OnHistoryRequested()" (ListManagementRequested)="OnListManagementRequested()"><mj-rubric-scale-level-editor [Label]="record.Label" [Description]="record.Description" [Value]="record.Value" [NormalizedValue]="record.NormalizedValue" [Frozen]="true" (LabelChange)="record.Label = $event" (DescriptionChange)="record.Description = $event"></mj-rubric-scale-level-editor></mj-record-form-container> }`,
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
    template: `@if (record) { <mj-record-form-container [Record]="record" [FormComponent]="this" (Navigate)="OnFormNavigate($event)" (DeleteRequested)="OnDeleteRequested()" (FavoriteToggled)="OnFavoriteToggled()" (HistoryRequested)="OnHistoryRequested()" (ListManagementRequested)="OnListManagementRequested()"><mj-rubric-category-editor [Name]="record.Name" [ParentId]="record.ParentID" (NameChange)="record.Name = $event" (ParentIdChange)="record.ParentID = $event"></mj-rubric-category-editor></mj-record-form-container> }`,
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
