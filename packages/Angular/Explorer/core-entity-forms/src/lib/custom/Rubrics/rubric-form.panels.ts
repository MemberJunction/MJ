import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel, BaseFormsModule } from '@memberjunction/ng-base-forms';
import { MJRubricEntity } from '@memberjunction/core-entities';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { RubricBuilderComponent, RubricPublishDialogComponent, RubricVersionBoardComponent, RubricVersionDiffComponent } from '@memberjunction/ng-rubrics';
import { MJRubricFormComponentExtended } from './rubric-form.component';

/** The author, the diff, and publish are each their own left-nav contribution. */
function host(panel: BaseFormPanel<MJRubricEntity>): MJRubricFormComponentExtended {
    return panel.FormComponent as MJRubricFormComponentExtended;
}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:MJRubrics:author',
    metadata: {
        entity: 'MJ: Rubrics',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'rubric-author',
        inclusion: 'Primary',
        leadsWhenUnsaved: true,
    },
})
@Component({
    selector: 'mj-rubric-author-panel',
    standalone: true,
    imports: [BaseFormsModule, MJButtonDirective, RubricBuilderComponent],
    template: `
      <mj-collapsible-panel SectionKey="rubric-author" SectionName="Author" Icon="fa-solid fa-pen" [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
        @if (Form.Loading) {
          <p>Loading the rubric...</p>
        } @else {
          @if (!Form.DraftId) {
            <button mjButton variant="outline" size="sm" type="button" (click)="Form.StartDraft()">Start new draft</button>
          }
          <mj-rubric-builder [Name]="Record.Name" [PublishedLabel]="Form.PublishedLabel" [NextVersion]="Form.NextVersion" [ComputedBump]="Form.ComputedBump" [Viewing]="Form.Viewing" (ViewingChange)="Form.Viewing = $event" [Nodes]="Form.Viewing === 'published' ? (Form.BaseVersion?.nodes ?? []) : Form.Nodes" [Scales]="Form.Scales" [Bands]="Form.Viewing === 'published' ? (Form.BaseVersion?.bands ?? []) : Form.Bands" [BaseBands]="Form.BaseVersion?.bands ?? []" [Version]="Form.Viewing === 'published' ? Form.BaseVersion : Form.DraftVersion" [ReadOnly]="!Form.DraftId || Form.Viewing === 'published'" (NodesChange)="Form.OnNodes($event)" (BandsChange)="Form.OnBands($event)"></mj-rubric-builder>
        }
      </mj-collapsible-panel>
    `,
})
export class RubricAuthorPanel extends BaseFormPanel<MJRubricEntity> {
    public get Form(): MJRubricFormComponentExtended { return host(this); }
}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:MJRubrics:diff',
    metadata: {
        entity: 'MJ: Rubrics',
        slot: 'after-fields',
        sortKey: 90,
        contributionKey: 'rubric-diff',
        inclusion: 'Primary',
    },
})
@Component({
    selector: 'mj-rubric-diff-panel',
    standalone: true,
    imports: [BaseFormsModule, RubricVersionDiffComponent],
    template: `
      <mj-collapsible-panel SectionKey="rubric-diff" SectionName="Version diff" Icon="fa-solid fa-code-compare" [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
        @if (Form.BaseVersion && Form.DraftVersion) {
          <mj-rubric-version-diff [Base]="Form.BaseVersion" [Draft]="Form.DraftVersion"></mj-rubric-version-diff>
        } @else {
          <p>Publish a version before this rubric has a diff.</p>
        }
      </mj-collapsible-panel>
    `,
})
export class RubricDiffPanel extends BaseFormPanel<MJRubricEntity> {
    public get Form(): MJRubricFormComponentExtended { return host(this); }
}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:MJRubrics:publish',
    metadata: {
        entity: 'MJ: Rubrics',
        slot: 'after-fields',
        sortKey: 80,
        contributionKey: 'rubric-publish',
        inclusion: 'Primary',
    },
})
@Component({
    selector: 'mj-rubric-publish-panel',
    standalone: true,
    imports: [BaseFormsModule, MJButtonDirective, RubricPublishDialogComponent],
    template: `
      <mj-collapsible-panel SectionKey="rubric-publish" SectionName="Publish" Icon="fa-solid fa-cloud-arrow-up" [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
        @if (Form.DraftVersion) {
          <mj-rubric-publish-dialog [Base]="Form.BaseVersion" [Draft]="Form.DraftVersion" [RequestedBump]="Form.RequestedBump" [Summary]="Form.Summary" (RequestedBumpChange)="Form.RequestedBump = $event" (SummaryChange)="Form.Summary = $event" (Confirm)="Form.OnPublish($event)">
            <button mjButton variant="outline" size="sm" type="button" (click)="Form.OnCancel()">Cancel</button>
          </mj-rubric-publish-dialog>
          @if (Form.Message) { <p>{{ Form.Message }}</p> }
        } @else {
          <p>This rubric has no draft to publish.</p>
          <button mjButton variant="outline" size="sm" type="button" (click)="Form.StartDraft()">Start new draft</button>
          @if (Form.Message) { <p>{{ Form.Message }}</p> }
        }
      </mj-collapsible-panel>
    `,
})
export class RubricPublishPanel extends BaseFormPanel<MJRubricEntity> {
    public get Form(): MJRubricFormComponentExtended { return host(this); }
}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:MJRubrics:versions',
    metadata: {
        entity: 'MJ: Rubrics',
        slot: 'after-fields',
        sortKey: 95,
        contributionKey: 'rubric-versions',
        inclusion: 'Primary',
    },
})
@Component({
    selector: 'mj-rubric-versions-panel',
    standalone: true,
    imports: [BaseFormsModule, RubricVersionBoardComponent],
    template: `
      <mj-collapsible-panel SectionKey="rubric-versions" SectionName="Versions" Icon="fa-solid fa-code-branch" [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
        <mj-rubric-version-board [Cards]="Form.VersionCards" (Open)="Form.OpenVersion($event)"></mj-rubric-version-board>
      </mj-collapsible-panel>
    `,
})
export class RubricVersionsPanel extends BaseFormPanel<MJRubricEntity> {
    public get Form(): MJRubricFormComponentExtended { return host(this); }
}
