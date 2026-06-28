import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';

/**
 * Training Pipelines section resource — hosts the {@link PSPipelinesComponent} (`ps-pipelines`).
 *
 * Registered as `BaseResourceComponent::PredictiveStudioPipelinesResource`, the "Training Pipelines"
 * top-nav Nav Item of the Predictive Studio app. Self-loads the provider-scoped engine (via the shared
 * {@link PSResourceBase}) and binds it into the panel's `[engine]` input once ready.
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioPipelinesResource')
@Component({
  standalone: false,
  selector: 'mj-ps-pipelines-resource',
  template: `
    <mj-page-header-interior
      Title="Training Pipelines"
      Subtitle="Assemble features, pick an algorithm, and train models from your own data">
    </mj-page-header-interior>
    @if (!isLoading) {
      <ps-pipelines [engine]="engine"></ps-pipelines>
    } @else {
      <mj-loading text="Loading Training Pipelines..." size="medium"></mj-loading>
    }
  `,
  styles: [`:host { display: block; width: 100%; height: 100%; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSPipelinesResourceComponent extends PSResourceBase {
  protected readonly SectionKey = 'pipelines';
  protected readonly SectionLabel = 'Training Pipelines';
  protected readonly SectionIcon = 'fa-solid fa-diagram-project';

  protected override extraAgentContext(): Record<string, unknown> {
    return { PipelineCount: this.engine.Pipelines.length };
  }
}

/** Tree-shaking prevention — called from the subpath module so the @RegisterClass survives bundling. */
export function LoadPSPipelinesResource(): void {
  // intentionally empty
}
