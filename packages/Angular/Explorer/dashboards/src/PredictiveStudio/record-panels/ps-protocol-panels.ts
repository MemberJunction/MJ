/**
 * The Predictive Studio record-form panels (L3): each mounts one of the Studio widgets on an entity's record form and
 * turns the widget's events into navigation. They register when the Predictive Studio chunk loads
 * (`PSStudioResourceComponent.RecordPanels` keeps them in it), so a record form opened after that chunk shows them.
 */
import { Component, inject } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import type { MJMLEvaluationProtocolEntity, MJMLModelEntity, MJMLTrainingPipelineEntity, MJMLPredictionUnitEntity } from '@memberjunction/core-entities';
import { BaseFormPanel, BaseFormsModule } from '@memberjunction/ng-base-forms';
import { NavigationService } from '@memberjunction/ng-shared';
import { PSPipelineBindingsComponent } from '../components/pipeline-bindings/pipeline-bindings.component';
import { PSProtocolVersionsComponent } from '../components/protocol-versions/protocol-versions.component';
import { PSRunEvaluationComponent } from '../components/run-evaluation/run-evaluation.component';
import { PSUnitVersionsComponent } from '../components/unit-versions/unit-versions.component';
import type { AfterVersionSavedEventArgs } from '../components/ps-widget-events';

/** The record's ID once it is saved; null for a new record (the widgets then show nothing to load). */
function savedId(record: { IsSaved: boolean; ID: string }): string | null {
  return record.IsSaved ? record.ID : null;
}

@RegisterClassEx(BaseFormPanel, {
  key: 'form-panel:MJMLEvaluationProtocols:versions',
  metadata: { entity: 'MJ: ML Evaluation Protocols', slot: 'before-fields', sortKey: 100, contributionKey: 'ps-protocol-versions', inclusion: 'Primary' },
})
@Component({
  selector: 'mj-ps-protocol-versions-panel',
  standalone: true,
  imports: [BaseFormsModule, PSProtocolVersionsComponent],
  template: `
    <mj-collapsible-panel SectionKey="ps-protocol-versions" SectionName="Protocol versions" Icon="fa-solid fa-code-branch" [Form]="FormComponent" [FormContext]="FormContext" [Order]="DisplayOrder" [DefaultExpanded]="true">
      <mj-ps-protocol-versions [Provider]="FormComponent.ProviderToUse" [EvaluationProtocolID]="RecordID" (AfterVersionSaved)="OnVersionSaved($event)"></mj-ps-protocol-versions>
    </mj-collapsible-panel>
  `,
})
export class PSProtocolVersionsPanel extends BaseFormPanel<MJMLEvaluationProtocolEntity> {
  private readonly navigation = inject(NavigationService);

  public get RecordID(): string | null {
    return savedId(this.Record);
  }

  /** A saved version opens on its own record form, so the fields below show the version the list selected. */
  public OnVersionSaved(e: AfterVersionSavedEventArgs): void {
    if (e.Success && e.ID !== null) this.navigation.OpenEntityRecord('MJ: ML Evaluation Protocols', CompositeKey.FromID(e.ID));
  }
}

@RegisterClassEx(BaseFormPanel, {
  key: 'form-panel:MJMLPredictionUnits:versions',
  metadata: { entity: 'MJ: ML Prediction Units', slot: 'before-fields', sortKey: 100, contributionKey: 'ps-unit-versions', inclusion: 'Primary' },
})
@Component({
  selector: 'mj-ps-unit-versions-panel',
  standalone: true,
  imports: [BaseFormsModule, PSUnitVersionsComponent],
  template: `
    <mj-collapsible-panel SectionKey="ps-unit-versions" SectionName="Unit versions" Icon="fa-solid fa-code-branch" [Form]="FormComponent" [FormContext]="FormContext" [Order]="DisplayOrder" [DefaultExpanded]="true">
      <mj-ps-unit-versions [Provider]="FormComponent.ProviderToUse" [UnitID]="RecordID" (AfterVersionSaved)="OnVersionSaved($event)"></mj-ps-unit-versions>
    </mj-collapsible-panel>
  `,
})
export class PSUnitVersionsPanel extends BaseFormPanel<MJMLPredictionUnitEntity> {
  private readonly navigation = inject(NavigationService);

  public get RecordID(): string | null {
    return savedId(this.Record);
  }

  /** A saved version opens on its own record form (for version 1 of a new unit, the row the server created). */
  public OnVersionSaved(e: AfterVersionSavedEventArgs): void {
    if (e.Success && e.ID !== null) this.navigation.OpenEntityRecord('MJ: ML Prediction Units', CompositeKey.FromID(e.ID));
  }
}

/**
 * The bindings widget saves the pipeline row itself. The panel does nothing more: the record-form container hears that
 * save of the same record (`wireRemoteRecordInvalidation`) and refreshes a clean form in place, or, in edit mode,
 * merges the new binding into the record's clean fields and keeps the user's unsaved edits.
 */
@RegisterClassEx(BaseFormPanel, {
  key: 'form-panel:MJMLTrainingPipelines:bindings',
  metadata: { entity: 'MJ: ML Training Pipelines', slot: 'before-fields', sortKey: 95, contributionKey: 'ps-pipeline-bindings', inclusion: 'Primary' },
})
@Component({
  selector: 'mj-ps-pipeline-bindings-panel',
  standalone: true,
  imports: [BaseFormsModule, PSPipelineBindingsComponent],
  template: `
    <mj-collapsible-panel SectionKey="ps-pipeline-bindings" SectionName="Prediction Unit and Evaluation Protocol" Icon="fa-solid fa-link" [Form]="FormComponent" [FormContext]="FormContext" [Order]="DisplayOrder" [DefaultExpanded]="true">
      <mj-ps-pipeline-bindings [Provider]="FormComponent.ProviderToUse" [PipelineID]="RecordID"></mj-ps-pipeline-bindings>
    </mj-collapsible-panel>
  `,
})
export class PSPipelineBindingsPanel extends BaseFormPanel<MJMLTrainingPipelineEntity> {
  public get RecordID(): string | null {
    return savedId(this.Record);
  }
}

@RegisterClassEx(BaseFormPanel, {
  key: 'form-panel:MJMLModels:evaluation',
  metadata: { entity: 'MJ: ML Models', slot: 'before-fields', sortKey: 90, contributionKey: 'ps-model-evaluation', inclusion: 'Primary' },
})
@Component({
  selector: 'mj-ps-model-evaluation-panel',
  standalone: true,
  imports: [BaseFormsModule, PSRunEvaluationComponent],
  template: `
    <mj-collapsible-panel SectionKey="ps-model-evaluation" SectionName="Evaluation (protocol results)" Icon="fa-solid fa-scale-balanced" [Form]="FormComponent" [FormContext]="FormContext" [Order]="DisplayOrder" [DefaultExpanded]="true">
      <mj-ps-run-evaluation [Provider]="FormComponent.ProviderToUse" [ModelID]="RecordID"></mj-ps-run-evaluation>
    </mj-collapsible-panel>
  `,
})
export class PSModelEvaluationPanel extends BaseFormPanel<MJMLModelEntity> {
  public get RecordID(): string | null {
    return savedId(this.Record);
  }
}

/** The four record-form panels of the Predictive Studio chunk. */
export const PS_RECORD_PANELS = [PSProtocolVersionsPanel, PSUnitVersionsPanel, PSPipelineBindingsPanel, PSModelEvaluationPanel] as const;
