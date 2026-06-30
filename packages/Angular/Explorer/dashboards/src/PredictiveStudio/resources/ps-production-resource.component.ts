import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';

/**
 * Models in Production section resource — hosts the {@link PSProductionComponent} (`ps-production`),
 * Predictive Studio's deployment / control-tower view.
 *
 * Registered as `BaseResourceComponent::PredictiveStudioProductionResource`, the "Models in Production"
 * top-nav Nav Item of the Predictive Studio app. Self-loads the provider-scoped engine (via the shared
 * {@link PSResourceBase}, whose `Config` is a cached no-op once any section has warmed it) and binds it
 * into the panel's `[engine]` input once ready. The panel reads the engine's cached
 * `ScoringBindings` / `Models` / `RecordProcesses` arrays and computes each binding's live prediction
 * distribution + last run on demand — entirely entity-agnostic.
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioProductionResource')
@Component({
  standalone: false,
  selector: 'mj-ps-production-resource',
  template: `
    <mj-page-header-interior
      Title="Models in Production"
      Subtitle="Which models are live, what they write, on what schedule, and the current prediction distribution">
    </mj-page-header-interior>
    <mj-page-body-interior>
      @if (!isLoading) {
        <ps-production [engine]="engine"></ps-production>
      } @else {
        <mj-loading text="Loading Models in Production..." size="medium"></mj-loading>
      }
    </mj-page-body-interior>
  `,
  styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSProductionResourceComponent extends PSResourceBase {
  protected readonly SectionKey = 'production';
  protected readonly SectionLabel = 'Models in Production';
  protected readonly SectionIcon = 'fa-solid fa-satellite-dish';

  /** Add the count of deployed scoring bindings to the section's agent-context snapshot. */
  protected override extraAgentContext(): Record<string, unknown> {
    return { ScoringBindingCount: this.engine.ScoringBindings.length };
  }
}

/** Tree-shaking prevention — called from the subpath module so the @RegisterClass survives bundling. */
export function LoadPSProductionResource(): void {
  // intentionally empty
}
