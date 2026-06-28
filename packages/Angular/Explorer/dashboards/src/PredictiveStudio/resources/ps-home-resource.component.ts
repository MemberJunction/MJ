import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';
import { PSPanelKey } from '../predictive-studio.types';

/**
 * Predictive Studio application ID (from `metadata/applications/.predictive-studio-application.json`).
 * Used to switch top-nav sections when the Home panel's hero/entry-path buttons emit a `navigate` event
 * — the panel was authored to drive an in-dashboard left-nav, and here we translate that intent into a
 * top-nav `SwitchToApp(appId, <section Label>)`.
 */
const PREDICTIVE_STUDIO_APP_ID = '299C9272-8D38-40CA-85D4-0980F2C9FAD1';

/**
 * Maps a Home-panel {@link PSPanelKey} navigation intent to the destination section's Nav Item `Label`
 * (must match the Labels in `.predictive-studio-application.json` `DefaultNavItems`). `home` is omitted
 * — navigating home from home is a no-op.
 */
const PANEL_KEY_TO_NAV_LABEL: Partial<Record<PSPanelKey, string>> = {
  pipelines: 'Training Pipelines',
  catalog: 'Algorithm Catalog',
  experiments: 'Experiments',
  registry: 'Model Registry',
  compare: 'Compare Runs',
};

/**
 * Home section resource — hosts the {@link PSHomeComponent} (`ps-home`) action-forward landing.
 *
 * Registered as `BaseResourceComponent::PredictiveStudioHomeResource`, the `isDefault` Nav Item of the
 * Predictive Studio app. The hosted panel emits two outputs that this wrapper translates to top-nav
 * actions:
 * - `navigate(PSPanelKey)` → switch to the matching top-nav section via {@link mapNavigate}.
 * - `askAgent()` → no-op; the Model Development Agent now lives in MJ's global chat, not a per-section
 *   docked copilot, so the wrapper simply ignores the request rather than embedding chat.
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioHomeResource')
@Component({
  standalone: false,
  selector: 'mj-ps-home-resource',
  template: `
    <mj-page-header-interior
      Title="Predictive Studio"
      Subtitle="Build a predictive model — from your data, a proven template, or the Model Dev Agent">
    </mj-page-header-interior>
    <mj-page-body-interior>
      @if (!isLoading) {
        <ps-home [engine]="engine" [provider]="ProviderToUse" [currentUser]="ProviderToUse.CurrentUser" (navigate)="mapNavigate($event)" (askAgent)="onAskAgent()"></ps-home>
      } @else {
        <mj-loading text="Loading Predictive Studio..." size="medium"></mj-loading>
      }
    </mj-page-body-interior>
  `,
  styles: [`:host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSHomeResourceComponent extends PSResourceBase {
  protected readonly SectionKey = 'home';
  protected readonly SectionLabel = 'Home';
  protected readonly SectionIcon = 'fa-solid fa-gauge-high';

  /** Translate the panel's in-dashboard navigation intent into a top-nav section switch. */
  public mapNavigate(key: PSPanelKey): void {
    const label = PANEL_KEY_TO_NAV_LABEL[key];
    if (label) {
      void this.navigationService.SwitchToApp(PREDICTIVE_STUDIO_APP_ID, label);
    }
  }

  /**
   * The "ask the agent" entry path. The Model Development Agent is reached through MJ's global chat now,
   * so there's nothing for the section to open — kept as an explicit, documented no-op rather than
   * wiring a per-section copilot.
   */
  public onAskAgent(): void {
    // Intentionally no-op — global chat owns the Model Development Agent conversation.
  }
}

/** Tree-shaking prevention — called from the subpath module so the @RegisterClass survives bundling. */
export function LoadPSHomeResource(): void {
  // intentionally empty
}
