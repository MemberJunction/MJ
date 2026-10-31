/**
 * The Predictive Studio record-form panels (L3): each mounts one of the Studio widgets on an entity's record form and
 * turns the widget's events into navigation and record updates. They register when the Predictive Studio chunk loads
 * (`PSStudioResourceComponent.RecordPanels` keeps them in it), so a record form opened after that chunk shows them.
 */
import { Component, inject } from '@angular/core';
import { CompositeKey, LogError } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import type { MJEvaluationProtocolEntity, MJMLModelEntity, MJMLTrainingPipelineEntity, MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { BaseFormPanel, BaseFormsModule } from '@memberjunction/ng-base-forms';
import { NavigationService } from '@memberjunction/ng-shared';
import { PSPipelineBindingsComponent } from '../components/pipeline-bindings/pipeline-bindings.component';
import { PSProtocolVersionsComponent } from '../components/protocol-versions/protocol-versions.component';
import { PSRunEvaluationComponent } from '../components/run-evaluation/run-evaluation.component';
import { PSUnitVersionsComponent } from '../components/unit-versions/unit-versions.component';
import type { AfterBindingChangedEventArgs, AfterVersionSavedEventArgs } from '../components/ps-widget-events';

/** The record's ID once it is saved; null for a new record (the widgets then show nothing to load). */
function savedId(record: { IsSaved: boolean; ID: string }): string | null {
  return record.IsSaved ? record.ID : null;
}

@RegisterClassEx(BaseFormPanel, {
  key: 'form-panel:MJEvaluationProtocols:versions',
  metadata: { entity: 'MJ: Evaluation Protocols', slot: 'before-fields', sortKey: 100, contributionKey: 'ps-protocol-versions', inclusion: 'Primary' },
})
@Component({
  selector: 'mj-ps-protocol-versions-panel',
  standalone: true,
  imports: [BaseFormsModule, PSProtocolVersionsComponent],
  template: `
    <mj-collapsible-panel SectionKey="ps-protocol-versions" SectionName="Protocol versions" Icon="fa-solid fa-code-branch" [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
      <mj-ps-protocol-versions [Provider]="FormComponent.ProviderToUse" [EvaluationProtocolID]="RecordID" (AfterVersionSaved)="OnVersionSaved($event)"></mj-ps-protocol-versions>
    </mj-collapsible-panel>
  `,
})
export class PSProtocolVersionsPanel extends BaseFormPanel<MJEvaluationProtocolEntity> {
  private readonly navigation = inject(NavigationService);

  public get RecordID(): string | null {
    return savedId(this.Record);
  }

  /** A saved version opens on its own record form, so the fields below show the version the list selected. */
  public OnVersionSaved(e: AfterVersionSavedEventArgs): void {
    if (e.Success && e.ID !== null) this.navigation.OpenEntityRecord('MJ: Evaluation Protocols', CompositeKey.FromID(e.ID));
  }
}

@RegisterClassEx(BaseFormPanel, {
  key: 'form-panel:MJPredictionUnits:versions',
  metadata: { entity: 'MJ: Prediction Units', slot: 'before-fields', sortKey: 100, contributionKey: 'ps-unit-versions', inclusion: 'Primary' },
})
@Component({
  selector: 'mj-ps-unit-versions-panel',
  standalone: true,
  imports: [BaseFormsModule, PSUnitVersionsComponent],
  template: `
    <mj-collapsible-panel SectionKey="ps-unit-versions" SectionName="Unit versions" Icon="fa-solid fa-code-branch" [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
      <mj-ps-unit-versions [Provider]="FormComponent.ProviderToUse" [UnitID]="RecordID" (AfterVersionSaved)="OnVersionSaved($event)"></mj-ps-unit-versions>
    </mj-collapsible-panel>
  `,
})
export class PSUnitVersionsPanel extends BaseFormPanel<MJPredictionUnitEntity> {
  private readonly navigation = inject(NavigationService);

  public get RecordID(): string | null {
    return savedId(this.Record);
  }

  /** A saved version opens on its own record form (for version 1 of a new unit, the row the server created). */
  public OnVersionSaved(e: AfterVersionSavedEventArgs): void {
    if (e.Success && e.ID !== null) this.navigation.OpenEntityRecord('MJ: Prediction Units', CompositeKey.FromID(e.ID));
  }
}

@RegisterClassEx(BaseFormPanel, {
  key: 'form-panel:MJMLTrainingPipelines:bindings',
  metadata: { entity: 'MJ: ML Training Pipelines', slot: 'before-fields', sortKey: 95, contributionKey: 'ps-pipeline-bindings', inclusion: 'Primary' },
})
@Component({
  selector: 'mj-ps-pipeline-bindings-panel',
  standalone: true,
  imports: [BaseFormsModule, PSPipelineBindingsComponent],
  template: `
    <mj-collapsible-panel SectionKey="ps-pipeline-bindings" SectionName="Prediction Unit and Evaluation Protocol" Icon="fa-solid fa-link" [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
      <mj-ps-pipeline-bindings [Provider]="FormComponent.ProviderToUse" [PipelineID]="RecordID" (AfterBindingChanged)="OnBindingChanged($event)"></mj-ps-pipeline-bindings>
    </mj-collapsible-panel>
  `,
})
export class PSPipelineBindingsPanel extends BaseFormPanel<MJMLTrainingPipelineEntity> {
  public get RecordID(): string | null {
    return savedId(this.Record);
  }

  /**
   * The widget saved the pipeline row itself, so the form's copy of it is stale: a later form save would write the old
   * binding back. A clean record is re-read; a record with unsaved edits keeps them and takes the new binding.
   */
  public async OnBindingChanged(e: AfterBindingChangedEventArgs): Promise<void> {
    if (!e.Success) return;
    if (!this.Record.Dirty) {
      if (!(await this.Record.Refresh())) LogError(`PSPipelineBindingsPanel: the pipeline ${e.PipelineID} could not be re-read after rebinding.`);
      return;
    }
    if (e.Which === 'unit') this.Record.PredictionUnitID = e.VersionID;
    else this.Record.EvaluationProtocolID = e.VersionID;
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
    <mj-collapsible-panel SectionKey="ps-model-evaluation" SectionName="Evaluation (protocol results)" Icon="fa-solid fa-scale-balanced" [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
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
