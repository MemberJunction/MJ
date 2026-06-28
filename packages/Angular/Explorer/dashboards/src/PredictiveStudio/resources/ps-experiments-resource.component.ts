import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';

/**
 * Experiments section resource — hosts the {@link PSExperimentsComponent} (`ps-experiments`).
 *
 * Registered as `BaseResourceComponent::PredictiveStudioExperimentsResource`, the "Experiments" top-nav
 * Nav Item. Self-loads the provider-scoped engine (experiment sessions / iterations) and binds it into
 * the panel's `[engine]` input.
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioExperimentsResource')
@Component({
  standalone: false,
  selector: 'mj-ps-experiments-resource',
  template: `
    <mj-page-header-interior
      Title="Experiments"
      Subtitle="Agent-driven algorithm sweeps with leaderboards, pruning, and budget gates">
    </mj-page-header-interior>
    <mj-page-body-interior>
      @if (!isLoading) {
        <ps-experiments [engine]="engine"></ps-experiments>
      } @else {
        <mj-loading text="Loading Experiments..." size="medium"></mj-loading>
      }
    </mj-page-body-interior>
  `,
  styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSExperimentsResourceComponent extends PSResourceBase {
  protected readonly SectionKey = 'experiments';
  protected readonly SectionLabel = 'Experiments';
  protected readonly SectionIcon = 'fa-solid fa-flask';

  protected override extraAgentContext(): Record<string, unknown> {
    return { SessionCount: this.engine.Sessions.length };
  }
}

/** Tree-shaking prevention — called from the subpath module so the @RegisterClass survives bundling. */
export function LoadPSExperimentsResource(): void {
  // intentionally empty
}
